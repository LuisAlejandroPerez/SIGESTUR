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

# Configuration
FIREBASE_CREDENTIALS =  r"C:\Users\luisa\Desktop\SIGESTUR\Rx\sigestur-tx-firebase-adminsdk-fbsvc-fdbe3bdb4a.json"
DATABASE_URL = "https://sigestur-tx-default-rtdb.firebaseio.com/"
BUCKET_NAME = "sigestur-tx.firebasestorage.app"
STATIC_GTFS_FOLDER = "STATIC GTFS/"
LOCAL_GTFS_PATH = os.path.join(os.path.expanduser("~"),"Desktop", "SIGESTUR", "STATIC GTFS")
API_KEY = "AIzaSyCIsmfqnTiBsxw9C2pyIhdibHJcryJMCHw"

# Terminal stop configuration
STOP_ID = "C19P26"  # Change this to your terminal stop ID
DIRECTION_ID = "0"  # Current direction buses are arriving from
NEW_DIRECTION_ID = "1"  # Direction buses will change to after turnaround
GTFS_RT_PATH = "C:/Users/luisa/Desktop/SIGESTUR/GTFS RT/vehicle_positions.pb"

# Thresholds
ARRIVAL_THRESHOLD = 20  # meters
DEPARTURE_TIMEOUT = 45  # seconds before considering bus has left
DIRECTION_CHANGE_TIMEOUT = 40  # seconds at stop before changing direction (2 minutes)

# Initialize Firebase
cred = credentials.Certificate(FIREBASE_CREDENTIALS)
firebase_admin.initialize_app(cred, {"databaseURL": DATABASE_URL})
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = FIREBASE_CREDENTIALS
storage_client = storage.Client()

# Tracking dictionaries
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
        print(f"✅ OMSA {trip_id} direction changed to {new_direction} in Firebase")
        return True
    except Exception as e:
        print(f"❌ Error updating direction for OMSA {trip_id}: {str(e)}")
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
            print(f"Descargado: {relative_path}")
        print(" Archivos descargados.")
    except Exception as e:
        print(f"Error al descargar GTFS: {str(e)}")

def generate_gtfs_rt():
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.header.gtfs_realtime_version = "2.0"
    feed.header.timestamp = int(time.time())
    ref_trips = db.reference("gps_data/trip_ID")
    trips = ref_trips.get()
    if not trips:
        print("No hay datos en Firebase")
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
    print("Archivo GTFS-RT generado")

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

def main():
    global arrived_buses, direction_changed_buses
    
    print(f"🚌 Iniciando monitor de parada terminal: {STOP_ID}")
    print(f"📍 Dirección actual: {DIRECTION_ID} -> Nueva dirección: {NEW_DIRECTION_ID}")
    print(f"⏱️  Tiempo para cambio de dirección: {DIRECTION_CHANGE_TIMEOUT} segundos")
    print("-" * 60)
    
    download_gtfs_directory()
    stops = load_stops(f"{LOCAL_GTFS_PATH}/stops.txt")
    if STOP_ID not in stops:
        print(f"STOP_ID {STOP_ID} no encontrado en stops.txt")
        return
    stop_lat, stop_lon = stops[STOP_ID]
    trips_to_stops = load_trips(f"{LOCAL_GTFS_PATH}/stop_times.txt", f"{LOCAL_GTFS_PATH}/trips.txt")
    trips_for_terminal = [trip for trip, stops in trips_to_stops.items() if STOP_ID in stops]

    while True:
        generate_gtfs_rt()
        feed = fetch_vehicle_positions(GTFS_RT_PATH)
        current_time = datetime.now()

        # Check for buses that have left the terminal
        buses_to_remove = []
        for trip_id, arrival_time in arrived_buses.items():
            if (current_time - arrival_time).total_seconds() > DEPARTURE_TIMEOUT:
                buses_to_remove.append(trip_id)

        for trip_id in buses_to_remove:
            print(f"🚌 OMSA {trip_id} ha dejado la parada terminal {STOP_ID}")
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
                print(f"🔄 OMSA {trip_id} cambió dirección después de {DIRECTION_CHANGE_TIMEOUT} segundos en terminal")

        bus_info = []
        for entity in feed.entity:
            vehicle = entity.vehicle
            trip_id = vehicle.trip.trip_id
            lat, lon = vehicle.position.latitude, vehicle.position.longitude
            
            # ✅ FIXED: Use your approach - get vehicle data from Firebase and check direction
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
                                    print(f"🎯 OMSA {trip_id} ha llegado a la parada terminal {STOP_ID}!")
                            
                            bus_info.append({
                                "trip_id": trip_id,
                                "distance": distance,
                                "duration": duration,
                                "has_arrived": trip_id in arrived_buses,
                                "direction_changed": trip_id in direction_changed_buses
                            })

        # Sort buses by distance
        bus_info.sort(key=lambda x: x["distance"])

        print(f"\n📊 Información de OMSAs - Terminal {STOP_ID}:")
        print("=" * 60)

        # Show approaching buses
        approaching_omsas = [bus for bus in bus_info if not bus["has_arrived"]]
        if approaching_omsas:
            print("\n🚌 OMSAs en camino a terminal:")
            for bus in approaching_omsas:
                print(f"   OMSA {bus['trip_id']} -> {STOP_ID}: {format_distance(bus['distance'])}, ETA: {format_time(bus['duration'])}")

        # Show buses at terminal
        arrived_bus_info = [bus for bus in bus_info if bus["has_arrived"]]
        if arrived_bus_info:
            print(f"\n🏁 OMSAs en parada terminal:")
            for bus in arrived_bus_info:
                arrival_time = arrived_buses[bus["trip_id"]]
                time_since_arrival = (datetime.now() - arrival_time).total_seconds()
                
                status = "🔄 DIRECCIÓN CAMBIADA" if bus["direction_changed"] else "⏳ ESPERANDO"
                time_until_change = max(0, DIRECTION_CHANGE_TIMEOUT - time_since_arrival)
                
                if bus["direction_changed"]:
                    print(f"   OMSA {bus['trip_id']}: {status} (hace {int(time_since_arrival)} seg)")
                else:
                    print(f"   OMSA {bus['trip_id']}: {status} (cambio en {int(time_until_change)} seg)")

        if not bus_info:
            print("❌ No hay OMSAs en ruta hacia esta parada terminal.")

        print("-" * 60)
        time.sleep(20)

if __name__ == "__main__":
    main()