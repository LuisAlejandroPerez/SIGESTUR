import os
import time
import requests
import json
import csv
import firebase_admin
from firebase_admin import credentials, db
from google.cloud import storage
from google.transit import gtfs_realtime_pb2
from datetime import datetime, timedelta
import threading
import queue

# Configuration
FIREBASE_CREDENTIALS = r"C:\Users\luisa\Desktop\SIGESTUR\Rx\sigestur-tx-firebase-adminsdk-fbsvc-a49d945ba1.json"
DATABASE_URL = "https://sigestur-tx-default-rtdb.firebaseio.com/"
BUCKET_NAME = "sigestur-tx.firebasestorage.app"
STATIC_GTFS_FOLDER = "STATIC GTFS/"
LOCAL_GTFS_PATH = os.path.join(os.path.expanduser("~"), "Desktop", "SIGESTUR", "STATIC GTFS")
API_KEY = "AIzaSyCIsmfqnTiBsxw9C2pyIhdibHJcryJMCHw"

# Terminal stop configuration
STOP_ID = "C19P34"  # Change this to your terminal stop ID
DIRECTION_ID = "0"  # Current direction buses are arriving from
NEW_DIRECTION_ID = "1"  # Direction buses will change to after turnaround
GTFS_RT_PATH = "C:/Users/luisa/Desktop/SIGESTUR/GTFS RT/vehicle_positions.pb"

# Thresholds
ARRIVAL_THRESHOLD = 20  # meters
DEPARTURE_TIMEOUT = 45  # seconds before considering bus has left
DIRECTION_CHANGE_TIMEOUT = 40  # seconds at stop before changing direction

# Initialize Firebase
cred = credentials.Certificate(FIREBASE_CREDENTIALS)
firebase_admin.initialize_app(cred, {"databaseURL": DATABASE_URL})
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = FIREBASE_CREDENTIALS
storage_client = storage.Client()

# Global variables
arrived_buses = {}  # trip_id -> arrival_time
direction_changed_buses = {}  # trip_id -> change_time

def format_distance(distance_meters):
    return f"{distance_meters / 1000:.1f} km" if distance_meters >= 1000 else f"{distance_meters} m"

def format_time(duration_seconds):
    return f"{duration_seconds // 60} min {duration_seconds % 60} sec" if duration_seconds >= 60 else f"{duration_seconds} sec"

def update_bus_direction(trip_id, new_direction):
    """Update the direction_id of a bus in Firebase"""
    try:
        ref = db.reference(f"gps_data/trip_ID/{trip_id}")
        ref.update({"direction_id": new_direction})
        return True
    except Exception as e:
        return False

def download_gtfs_directory():
    os.makedirs(LOCAL_GTFS_PATH, exist_ok=True)
    try:
        bucket = storage_client.bucket(BUCKET_NAME)
        blobs = list(bucket.list_blobs(prefix=STATIC_GTFS_FOLDER))
        for blob in blobs:
            if blob.name == STATIC_GTFS_FOLDER:
                continue
            relative_path = blob.name[len(STATIC_GTFS_FOLDER):]
            if not relative_path:
                continue
            local_file_path = os.path.join(LOCAL_GTFS_PATH, relative_path)
            os.makedirs(os.path.dirname(local_file_path), exist_ok=True)
            blob.download_to_filename(local_file_path)
    except Exception as e:
        pass

def generate_gtfs_rt():
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.header.gtfs_realtime_version = "2.0"
    feed.header.timestamp = int(time.time())
    ref_trips = db.reference("gps_data/trip_ID")
    trips = ref_trips.get()
    if not trips:
        return
    for trip_id, data in trips.items():
        entity = feed.entity.add()
        entity.id = trip_id
        vehicle = entity.vehicle
        vehicle.position.latitude = data["latitude"]
        vehicle.position.longitude = data["longitude"]
        vehicle.timestamp = data["timestamp"]
        vehicle.trip.trip_id = trip_id
    with open(GTFS_RT_PATH, "wb") as f:
        f.write(feed.SerializeToString())

def load_stops(file_path):
    stops = {}
    with open(file_path, newline="", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            stops[row["stop_id"]] = (float(row["stop_lat"]), float(row["stop_lon"]))
    return stops

def load_trips(stop_times_path, trips_path):
    trips_to_stops = {}
    trip_directions = {}
    with open(trips_path, newline="", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            trip_directions[row["trip_id"]] = row["direction_id"]
    with open(stop_times_path, newline="", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            trip_id = row["trip_id"]
            stop_id = row["stop_id"]
            if trip_directions.get(trip_id) == DIRECTION_ID:
                if trip_id not in trips_to_stops:
                    trips_to_stops[trip_id] = []
                trips_to_stops[trip_id].append(stop_id)
    return trips_to_stops

def request_eta(lat, lon, stop_lat, stop_lon):
    data = {
        "origins": [{"waypoint": {"location": {"latLng": {"latitude": lat, "longitude": lon}}}}],
        "destinations": [{"waypoint": {"location": {"latLng": {"latitude": stop_lat, "longitude": stop_lon}}}}],
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_AWARE"
    }
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition"
    }
    response = requests.post(
        "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
        headers=headers,
        json=data
    )
    return response.json() if response.status_code == 200 else None

def fetch_vehicle_positions(file_path):
    feed = gtfs_realtime_pb2.FeedMessage()
    with open(file_path, "rb") as f:
        feed.ParseFromString(f.read())
    return feed

class BackendWorker:
    def __init__(self, data_queue):
        self.data_queue = data_queue
        self.running = False
        self.thread = None
        
    def start(self):
        """Start the backend worker thread"""
        self.running = True
        self.thread = threading.Thread(target=self._worker, daemon=True)
        self.thread.start()
        
    def stop(self):
        """Stop the backend worker"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=2)
    
    def _worker(self):
        """Backend worker that runs in a separate thread"""
        global arrived_buses, direction_changed_buses
        
        try:
            download_gtfs_directory()
            stops = load_stops(f"{LOCAL_GTFS_PATH}/stops.txt")
            
            if STOP_ID not in stops:
                return
            
            stop_lat, stop_lon = stops[STOP_ID]
            trips_to_stops = load_trips(f"{LOCAL_GTFS_PATH}/stop_times.txt", f"{LOCAL_GTFS_PATH}/trips.txt")
            trips_for_terminal = [trip for trip, stops in trips_to_stops.items() if STOP_ID in stops]
            
            while self.running:
                try:
                    generate_gtfs_rt()
                    feed = fetch_vehicle_positions(GTFS_RT_PATH)
                    current_time = datetime.now()
                    
                    # Check for buses that have left the terminal
                    buses_to_remove = []
                    for trip_id, arrival_time in arrived_buses.items():
                        if (current_time - arrival_time).total_seconds() > DEPARTURE_TIMEOUT:
                            buses_to_remove.append(trip_id)
                    
                    for trip_id in buses_to_remove:
                        del arrived_buses[trip_id]
                        if trip_id in direction_changed_buses:
                            del direction_changed_buses[trip_id]
                    
                    # Check for buses that need direction change
                    buses_to_change_direction = []
                    for trip_id, arrival_time in arrived_buses.items():
                        time_at_stop = (current_time - arrival_time).total_seconds()
                        if (time_at_stop >= DIRECTION_CHANGE_TIMEOUT and
                             trip_id not in direction_changed_buses):
                            buses_to_change_direction.append(trip_id)
                    
                    # Update direction for eligible buses
                    for trip_id in buses_to_change_direction:
                        if update_bus_direction(trip_id, NEW_DIRECTION_ID):
                            direction_changed_buses[trip_id] = current_time
                    
                    # Process vehicle data
                    bus_info = []
                    for entity in feed.entity:
                        vehicle = entity.vehicle
                        trip_id = vehicle.trip.trip_id
                        lat, lon = vehicle.position.latitude, vehicle.position.longitude
                        
                        vehicle_data = db.reference(f"gps_data/trip_ID/{trip_id}").get()
                        if vehicle_data and str(vehicle_data.get("direction_id")) == DIRECTION_ID and trip_id in trips_for_terminal:
                            result = request_eta(lat, lon, stop_lat, stop_lon)
                            if result:
                                for res in result:
                                    if res.get("condition", "UNKNOWN") == "ROUTE_EXISTS":
                                        distance = res["distanceMeters"]
                                        duration = int(res["duration"].replace("s", ""))
                                        
                                        # Check if bus has arrived
                                        if distance <= ARRIVAL_THRESHOLD:
                                            if trip_id not in arrived_buses:
                                                arrived_buses[trip_id] = datetime.now()
                                        
                                        bus_info.append({
                                            "trip_id": trip_id,
                                            "distance": distance,
                                            "duration": duration,
                                            "has_arrived": trip_id in arrived_buses,
                                            "direction_changed": trip_id in direction_changed_buses,
                                            "time_at_stop": (current_time - arrived_buses[trip_id]).total_seconds() if trip_id in arrived_buses else 0
                                        })
                    
                    # Sort by distance and separate approaching vs at terminal
                    bus_info.sort(key=lambda x: x["distance"])
                    approaching_buses = [bus for bus in bus_info if not bus["has_arrived"]]
                    at_terminal_buses = [bus for bus in bus_info if bus["has_arrived"]]
                    
                    # Convert to GUI format - combine approaching and at terminal
                    gui_buses = []
                    
                    # Add approaching buses first
                    for bus in approaching_buses[:2]:  # Take first 2 approaching buses
                        gui_buses.append({
                            'trip_id': bus['trip_id'],
                            'eta': bus['duration'] // 60,  # Convert to minutes
                            'distance': bus['distance'],
                            'status': 'De camino',
                            'status_color': '#FFFF00'
                        })
                    
                    # Add buses at terminal
                    for bus in at_terminal_buses[:3-len(gui_buses)]:  # Fill remaining slots
                        time_until_change = max(0, DIRECTION_CHANGE_TIMEOUT - bus['time_at_stop'])
                        
                        if bus['direction_changed']:
                            status = 'DIR CHANGED'
                            status_color = '#00FF00'
                        else:
                            status = f'WAIT {int(time_until_change)}s'
                            status_color = '#FF8800'
                        
                        gui_buses.append({
                            'trip_id': bus['trip_id'],
                            'eta': 0,  # At terminal
                            'distance': bus['distance'],
                            'status': status,
                            'status_color': status_color
                        })
                    
                    # Put data in queue for GUI
                    try:
                        self.data_queue.put(gui_buses, block=False)
                    except queue.Full:
                        pass  # Skip if queue is full
                    
                    time.sleep(20)
                
                except Exception as e:
                    time.sleep(10)  # Wait before retrying
        
        except Exception as e:
            self.running = False
