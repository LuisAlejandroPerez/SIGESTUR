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

FIREBASE_CREDENTIALS = r"C:\Users\luisa\OneDrive\Escritorio\SIGESTUR\Rx\sigestur-tx-firebase-adminsdk-fbsvc-e463993ccf.json"
DATABASE_URL = "https://sigestur-tx-default-rtdb.firebaseio.com/"
BUCKET_NAME = "sigestur-tx.firebasestorage.app"
STATIC_GTFS_FOLDER = "STATIC GTFS/"
LOCAL_GTFS_PATH = os.path.join(os.path.expanduser("~"), "OneDrive", "Escritorio","SIGESTUR", "STATIC GTFS")
API_KEY = "AIzaSyCIsmfqnTiBsxw9C2pyIhdibHJcryJMCHw"
STOP_ID = "C19P34"  
GTFS_RT_PATH = "C:/Users/luisa/OneDrive/Escritorio/SIGESTUR/GTFS RT/vehicle_positions.pb"
ARRIVAL_THRESHOLD = 20  
DEPARTURE_TIMEOUT = 60  

# Inizializacion de los servicios CLOUD
cred = credentials.Certificate(FIREBASE_CREDENTIALS)
firebase_admin.initialize_app(cred, {"databaseURL": DATABASE_URL})
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = FIREBASE_CREDENTIALS
storage_client = storage.Client()
arrived_buses = {}  

#Funciones de conversion
def format_distance(distance_meters):
    return f"{distance_meters / 1000:.1f} km" if distance_meters >= 1000 else f"{distance_meters} m"

def format_time(duration_seconds):
    return f"{duration_seconds // 60} min {duration_seconds % 60} sec" if duration_seconds >= 60 else f"{duration_seconds} sec"

# Descarga del GTFS estatico
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

# GTFS-RT
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

# Carga de la DATA GTFS ESTATICA
def load_stops(file_path):
    stops = {}
    with open(file_path, newline="", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            stops[row["stop_id"]] = (float(row["stop_lat"]), float(row["stop_lon"]))
    return stops

def load_trips(file_path):
    """ Esta funcion Relaciona trip_id con paradas en un diccionario."""
    trips_to_stops = {}
    with open(file_path, newline="", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            trip_id = row["trip_id"]
            stop_id = row["stop_id"]
            if trip_id not in trips_to_stops:
                trips_to_stops[trip_id] = []
            trips_to_stops[trip_id].append(stop_id)
    return trips_to_stops

def request_eta(lat, lon, stop_lat, stop_lon):
    """Esta funcion es para hacerle un Request a la API de Google """
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
    """Esta funcion lee el archivo GTFS-RT y devuelve un objeto FeedMessage con los datos."""
    feed = gtfs_realtime_pb2.FeedMessage()
    with open(file_path, "rb") as f:
        feed.ParseFromString(f.read())
    return feed

def main():
    global arrived_buses
    
    download_gtfs_directory()

    stops = load_stops(f"{LOCAL_GTFS_PATH}/stops.txt")
    if STOP_ID not in stops:
        print(f"STOP_ID {STOP_ID} no encontrado en stops.txt")
        return
    stop_lat, stop_lon = stops[STOP_ID]

    trips_to_stops = load_trips(f"{LOCAL_GTFS_PATH}/stop_times.txt")
    trips_for_raspberry = [trip for trip, stops in trips_to_stops.items() if STOP_ID in stops]

    while True:
        generate_gtfs_rt()
        feed = fetch_vehicle_positions(GTFS_RT_PATH)
        
        # Eliminar omsas que ya se han ido despues de esperar 15seg
        current_time = datetime.now()
        buses_to_remove = []
        for trip_id, arrival_time in arrived_buses.items():
            if (current_time - arrival_time).total_seconds() > DEPARTURE_TIMEOUT:
                buses_to_remove.append(trip_id)
        
        for trip_id in buses_to_remove:
            print(f"OMSA {trip_id} ha dejado la parada {STOP_ID}")
            del arrived_buses[trip_id]

        bus_info = []
        for entity in feed.entity:
            vehicle = entity.vehicle
            trip_id = vehicle.trip.trip_id
            lat, lon = vehicle.position.latitude, vehicle.position.longitude
            
            if trip_id in trips_for_raspberry:
                result = request_eta(lat, lon, stop_lat, stop_lon)
                if result:
                    for res in result:
                        if res.get("condition", "UNKNOWN") == "ROUTE_EXISTS":
                            distance = res["distanceMeters"]
                            duration = int(res["duration"].replace("s", ""))
                            
                            
                            if distance <= ARRIVAL_THRESHOLD:
                                if trip_id not in arrived_buses:
                                    arrived_buses[trip_id] = datetime.now()
                                    print(f"!!!!omsa {trip_id} ha llegado a la parada!!!!! {STOP_ID}!")
                                else:
                                    # Aquí actualizamos el tiempo de llegada en cada iteración
                                    arrived_buses[trip_id] = arrived_buses[trip_id]  # No cambia, pero mantiene el tiempo
                             
                            
                            bus_info.append({
                                "trip_id": trip_id,
                                "distance": distance,
                                "duration": duration,
                                "has_arrived": trip_id in arrived_buses
                            })

        # Ordenar omsas  por distancia las mas cercas van primero
        bus_info.sort(key=lambda x: x["distance"])
        
        
        print("\nInformacion de omsas:")
        
        # Mostrar las omsas que no han llegado
        approaching_omsas = [bus for bus in bus_info if not bus["has_arrived"]]
        if approaching_omsas:
            print("\nomsas en camino:")
            for bus in approaching_omsas:
                print(f"omsa{bus['trip_id']} -> {STOP_ID}: {format_distance(bus['distance'])}, ETA: {format_time(bus['duration'])}")
        
        # Muestrane las omsas que han llegado
        arrived_bus_info = [bus for bus in bus_info if bus["has_arrived"]]
        if arrived_bus_info:
            print("\nomsas en la parada:")
            for bus in arrived_bus_info:
                arrival_time = arrived_buses[bus["trip_id"]]
                time_since_arrival = (datetime.now() - arrival_time).total_seconds()
                print(f"omsa {bus['trip_id']}: ESTA AQUI!!! (llego hace {int(time_since_arrival)} segundos)")
        
        if not bus_info:
            print("No hay omsas en ruta hacia esta parada.")
            
        time.sleep(15)

if __name__ == "__main__":
    main()