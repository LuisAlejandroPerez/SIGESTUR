import firebase_admin
from firebase_admin import credentials, db
from google.transit import gtfs_realtime_pb2
import time

# Configuracion de la DB
cred = credentials.Certificate(r"C:\Users\luisa\OneDrive\Escritorio\SIGESTUR\Rx\sigestur-tx-firebase-adminsdk-fbsvc-e463993ccf.json")  
firebase_admin.initialize_app(cred, {"databaseURL": 'https://sigestur-tx-default-rtdb.firebaseio.com/'})

def generate_gtfs_rt():
    """Obtiene datos GPS de Firebase y genera vehicle_positions.pb"""
    
    # Crear mensaje GTFS-RT
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.header.gtfs_realtime_version = "2.0"
    feed.header.timestamp = int(time.time())

    # leer los datos GPS de los Tips
    ref_trips = db.reference("gps_data/trip_ID")
    trips = ref_trips.get()

    if not trips:
        print("No hay datos en la DB")
        return
    
    for trip_id, data in trips.items():
        entity = feed.entity.add()
        entity.id = trip_id
        vehicle = entity.vehicle

        
        vehicle.position.latitude = data["latitude"]
        vehicle.position.longitude = data["longitude"]
        vehicle.timestamp = data["timestamp"]
        vehicle.trip.trip_id = trip_id  # Asignamos el trip_id directamente

    # Archivo GTFS RT en formato protobuf
    with open("vehicle_positions.pb", "wb") as f:
        f.write(feed.SerializeToString())

    print("Archivo GTFS-RT generado: vehicle_positions.pb ✔")

# Esperar 10 segundos para actualizar la posicion
while True:
    generate_gtfs_rt()
    time.sleep(10)
