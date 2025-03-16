import requests
import json
import csv
from google.transit import gtfs_realtime_pb2  # Para leer vehicle_positions.pb

# 📍 Configuración
API_KEY = "AIzaSyCIsmfqnTiBsxw9C2pyIhdibHJcryJMCHw"
STOP_ID = "C19P34"  # Parada asignada a esta Raspberry
GTFS_RT_PATH = "C:/Users/luisa/Desktop/SIGESTUR/GTFS RT/vehicle_positions.pb"
GTFS_STATIC_PATH = "C:/Users/luisa/Desktop/SIGESTUR/STATIC GTFS/"

# 🛑 Guardar buses que han llegado
buses_en_parada = set()


def load_stops(file_path):
    """Carga los datos de stops.txt en un diccionario."""
    stops = {}
    with open(file_path, newline="", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            stop_id = row["stop_id"]
            lat = float(row["stop_lat"])
            lon = float(row["stop_lon"])
            stops[stop_id] = (lat, lon)
    return stops


def load_trips(file_path):
    """Relaciona trip_id con paradas en un diccionario."""
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


def fetch_vehicle_positions(file_path):
    """Carga los datos en tiempo real desde vehicle_positions.pb."""
    feed = gtfs_realtime_pb2.FeedMessage()
    with open(file_path, "rb") as f:
        feed.ParseFromString(f.read())
    return feed


def request_eta(lat, lon, stop_lat, stop_lon):
    """Solicita el cálculo de ETA a la API de Google Routes."""
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


def format_distance(distance_meters):
    """Convierte metros a kilómetros si es mayor a 1000m."""
    return f"{distance_meters / 1000:.1f} km" if distance_meters >= 1000 else f"{distance_meters} m"


def format_time(duration_seconds):
    """Convierte segundos a minutos si es mayor a 60s."""
    return f"{duration_seconds // 60} min {duration_seconds % 60} sec" if duration_seconds >= 60 else f"{duration_seconds} sec"


# 🚀 Carga de datos
stops = load_stops(f"{GTFS_STATIC_PATH}stops.txt")
if STOP_ID not in stops:
    print(f"❌ Error: STOP_ID {STOP_ID} no encontrado en stops.txt")
    exit()
stop_lat, stop_lon = stops[STOP_ID]

trips_to_stops = load_trips(f"{GTFS_STATIC_PATH}stop_times.txt")
trips_for_raspberry = [trip for trip, stops in trips_to_stops.items() if STOP_ID in stops]

feed = fetch_vehicle_positions(GTFS_RT_PATH)

# 🚍 Calculando ETA para buses en ruta
print("\n🚍 Calculando ETA para buses en ruta:")
for entity in feed.entity:
    vehicle = entity.vehicle
    trip_id = vehicle.trip.trip_id
    lat = vehicle.position.latitude
    lon = vehicle.position.longitude
    
    if trip_id in trips_for_raspberry:
        result = request_eta(lat, lon, stop_lat, stop_lon)
        if result:
            for res in result:
                if res.get("condition", "UNKNOWN") == "ROUTE_EXISTS":
                    distance = res["distanceMeters"]
                    duration = int(res["duration"].replace("s", ""))

                    # 📌 Detectar llegada
                    if distance <= 20 or duration <= 10:
                        if trip_id not in buses_en_parada:
                            print(f"✅ 🚌 Bus {trip_id} ha llegado a {STOP_ID}")
                            buses_en_parada.add(trip_id)

                    # 📌 Detectar si ya pasó
                    elif trip_id in buses_en_parada and distance > 50:
                        print(f"🛑 Bus {trip_id} ha salido de {STOP_ID}")
                        buses_en_parada.remove(trip_id)

                    # 📌 Mostrar buses en ruta
                    else:
                        print(f"🚌 Bus {trip_id} -> {STOP_ID}: {format_distance(distance)}, ETA: {format_time(duration)}")
                else:
                    print(f"❌ No se encontró ruta válida para {trip_id}")
        else:
            print(f"⚠️ Error API para {trip_id}")
