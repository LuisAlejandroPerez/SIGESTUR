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

class BusETABackend:
    def __init__(self):
        # Configuration
        self.FIREBASE_CREDENTIALS = r"C:\Users\luisa\OneDrive\Escritorio\SIGESTUR\Rx\sigestur-tx-firebase-adminsdk-fbsvc-3e9fbb7cd9.json"
        self.DATABASE_URL = "https://sigestur-tx-default-rtdb.firebaseio.com/"
        self.BUCKET_NAME = "sigestur-tx.firebasestorage.app"
        self.STATIC_GTFS_FOLDER = "STATIC GTFS/"
        self.LOCAL_GTFS_PATH = os.path.join(os.path.expanduser("~"),"OneDrive","Escritorio",  "SIGESTUR", "STATIC GTFS")
        self.API_KEY = "AIzaSyCIsmfqnTiBsxw9C2pyIhdibHJcryJMCHw"
        self.STOP_ID = "C19P11" # Cambiar en funcion de la parada
        self.DIRECTION_ID = "1" # Cambiar en funcion de si esta parada esta bajando o subiendo la avenida
        self.GTFS_RT_PATH = "C:/Users/luisa/OneDrive/Escritorio/SIGESTUR/GTFS RT/vehicle_positions.pb"
        self.ARRIVAL_THRESHOLD = 35
        self.DEPARTURE_TIMEOUT = 25

        
        # Initialize Firebase
        self.init_firebase()
        
        # Global variables
        self.arrived_buses = {}
        self.bus_data_queue = queue.Queue()
        self.backend_running = False
        
    def init_firebase(self):
        """Initialize Firebase connection"""
        cred = credentials.Certificate(self.FIREBASE_CREDENTIALS)
        firebase_admin.initialize_app(cred, {"databaseURL": self.DATABASE_URL})
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = self.FIREBASE_CREDENTIALS
        self.storage_client = storage.Client()
    
    def format_distance(self, distance_meters):
        """Format distance for display"""
        return f"{distance_meters / 1000:.1f} km" if distance_meters >= 1000 else f"{distance_meters} m"
    
    def format_time(self, duration_seconds):
        """Format time for display"""
        return f"{duration_seconds // 60} min {duration_seconds % 60} sec" if duration_seconds >= 60 else f"{duration_seconds} sec"
    
    def download_gtfs_directory(self):
        """Download GTFS files from Firebase Storage"""
        os.makedirs(self.LOCAL_GTFS_PATH, exist_ok=True)
        try:
            bucket = self.storage_client.bucket(self.BUCKET_NAME)
            blobs = list(bucket.list_blobs(prefix=self.STATIC_GTFS_FOLDER))
            for blob in blobs:
                if blob.name == self.STATIC_GTFS_FOLDER:
                    continue
                relative_path = blob.name[len(self.STATIC_GTFS_FOLDER):]
                if not relative_path:
                    continue
                local_file_path = os.path.join(self.LOCAL_GTFS_PATH, relative_path)
                os.makedirs(os.path.dirname(local_file_path), exist_ok=True)
                blob.download_to_filename(local_file_path)
        except Exception as e:
            pass
    
    def generate_gtfs_rt(self):
        """Generate GTFS-RT file from Firebase data"""
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
        with open(self.GTFS_RT_PATH, "wb") as f:
            f.write(feed.SerializeToString())
    
    def load_stops(self, file_path):
        """Load stops from GTFS stops.txt"""
        stops = {}
        with open(file_path, newline="", encoding="utf-8") as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                stops[row["stop_id"]] = (float(row["stop_lat"]), float(row["stop_lon"]))
        return stops
    
    def load_trips(self, stop_times_path, trips_path):
        """Load trips from GTFS files"""
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
                if trip_directions.get(trip_id) == self.DIRECTION_ID:
                    if trip_id not in trips_to_stops:
                        trips_to_stops[trip_id] = []
                    trips_to_stops[trip_id].append(stop_id)
        return trips_to_stops
    
    def request_eta(self, lat, lon, stop_lat, stop_lon):
        """Request ETA from Google Routes API"""
        data = {
            "origins": [{"waypoint": {"location": {"latLng": {"latitude": lat, "longitude": lon}}}}],
            "destinations": [{"waypoint": {"location": {"latLng": {"latitude": stop_lat, "longitude": stop_lon}}}}],
            "travelMode": "DRIVE",
            "routingPreference": "TRAFFIC_AWARE"
        }
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.API_KEY,
            "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition"
        }
        response = requests.post(
            "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
            headers=headers,
            json=data
        )
        return response.json() if response.status_code == 200 else None
    
    def fetch_vehicle_positions(self, file_path):
        """Fetch vehicle positions from GTFS-RT file"""
        feed = gtfs_realtime_pb2.FeedMessage()
        with open(file_path, "rb") as f:
            feed.ParseFromString(f.read())
        return feed
    
    def start_backend(self):
        """Start the backend data collection"""
        self.backend_thread = threading.Thread(target=self.backend_worker, daemon=True)
        self.backend_thread.start()
    
    def backend_worker(self):
        """Backend worker that runs in a separate thread"""
        try:
            self.download_gtfs_directory()
            stops = self.load_stops(f"{self.LOCAL_GTFS_PATH}/stops.txt")
            
            if self.STOP_ID not in stops:
                return
            
            stop_lat, stop_lon = stops[self.STOP_ID]
            # Cargar todos los trips asociados a la parada
            with open(f"{self.LOCAL_GTFS_PATH}/stop_times.txt", newline="", encoding="utf-8") as csvfile:
                reader = csv.DictReader(csvfile)
                trips_for_raspberry = set()
                for row in reader:
                    if row["stop_id"] == self.STOP_ID:
                        trips_for_raspberry.add(row["trip_id"])

            
            self.backend_running = True
            
            while self.backend_running:
                try:
                    self.generate_gtfs_rt()
                    feed = self.fetch_vehicle_positions(self.GTFS_RT_PATH)
                    current_time = datetime.now()
                    
                    # Remove buses that have left
                    buses_to_remove = []
                    for trip_id, arrival_time in self.arrived_buses.items():
                        if (current_time - arrival_time).total_seconds() > self.DEPARTURE_TIMEOUT:
                            buses_to_remove.append(trip_id)
                    
                    for trip_id in buses_to_remove:
                        del self.arrived_buses[trip_id]
                    
                    # Process vehicle data
                    bus_info = []
                    for entity in feed.entity:
                        vehicle = entity.vehicle
                        trip_id = vehicle.trip.trip_id
                        lat, lon = vehicle.position.latitude, vehicle.position.longitude
                        
                        vehicle_data = db.reference(f"gps_data/trip_ID/{trip_id}").get()
                        if vehicle_data and str(vehicle_data.get("direction_id")) == self.DIRECTION_ID and trip_id in trips_for_raspberry:
                            result = self.request_eta(lat, lon, stop_lat, stop_lon)
                            if result:
                                for res in result:
                                    if res.get("condition", "UNKNOWN") == "ROUTE_EXISTS":
                                        distance = res["distanceMeters"]
                                        duration = int(res["duration"].replace("s", ""))
                                        
                                        if distance <= self.ARRIVAL_THRESHOLD:
                                            if trip_id not in self.arrived_buses:
                                                self.arrived_buses[trip_id] = datetime.now()
                                        
                                        bus_info.append({
                                            "trip_id": trip_id,
                                            "distance": distance,
                                            "duration": duration,
                                            "has_arrived": trip_id in self.arrived_buses
                                        })
                    
                    # Sort by distance and filter approaching buses
                    bus_info.sort(key=lambda x: x["distance"])
                    approaching_buses = [bus for bus in bus_info if not bus["has_arrived"]]
                    
                    # Convert to GUI format
                    gui_buses = []
                    for bus in approaching_buses[:2]:  # Only take first 2 buses
                        gui_buses.append({
                            'trip_id': bus['trip_id'],
                            'eta': bus['duration'] // 60,  # Convert to minutes
                            'distance': bus['distance'],
                            'has_arrived': bus['has_arrived']
                        })
                    
                    # Put data in queue for GUI
                    try:
                        self.bus_data_queue.put(gui_buses, block=False)
                    except queue.Full:
                        pass  # Skip if queue is full
                    
                    time.sleep(3) # Updating time 
                    
                except Exception as e:
                    time.sleep(3)  # Wait before retrying
                    
        except Exception as e:
            self.backend_running = False
    
    def get_bus_data(self):
        """Get latest bus data from queue"""
        try:
            latest_data = None
            while not self.bus_data_queue.empty():
                latest_data = self.bus_data_queue.get_nowait()
            return latest_data
        except queue.Empty:
            return None
    
    def stop_backend(self):
        """Stop the backend worker"""
        self.backend_running = False
        if hasattr(self, 'backend_thread'):
            self.backend_thread.join(timeout=2)
