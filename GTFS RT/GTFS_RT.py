import os
import time
import firebase_admin
from firebase_admin import credentials, db
from google.cloud import storage
from google.transit import gtfs_realtime_pb2
from datetime import datetime

# SET UP
FIREBASE_CREDENTIALS = r"C:\Users\luisa\OneDrive\Escritorio\SIGESTUR\Rx\sigestur-tx-firebase-adminsdk-fbsvc-e463993ccf.json"
DATABASE_URL = "https://sigestur-tx-default-rtdb.firebaseio.com/"
BUCKET_NAME = "sigestur-tx.firebasestorage.app"
STATIC_GTFS_FOLDER = "STATIC GTFS/"
LOCAL_GTFS_PATH = os.path.join(os.path.expanduser("~"), "OneDrive", "Escritorio","SIGESTUR", "STATIC GTFS")

# Inicializar la DB
cred = credentials.Certificate(FIREBASE_CREDENTIALS)
firebase_admin.initialize_app(cred, {"databaseURL": DATABASE_URL})

# Configuracion del Storage
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = FIREBASE_CREDENTIALS
storage_client = storage.Client()

def download_gtfs_directory():
    """Esta funcion es simplemente para descargar mi GTFS Estatica que esta en la nube de Google Cloud"""
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
        print("Archivos GTFS descargados ✅")
    except Exception as e:
        print(f"Error al descargar los archivos GTFS ❌: {str(e)}")

def generate_gtfs_rt():
    """Esta funcion es para obtener los datos GPS de la DB y generar el archivo vehicle_positions.pb (GTFS RT)"""
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
    
    with open("vehicle_positions.pb", "wb") as f:
        f.write(feed.SerializeToString())
    print("Archivo GTFS-RT generado: vehicle_positions.pb ✅")

def main():
    download_gtfs_directory()
    while True:
        generate_gtfs_rt()
        print(f"update completado: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        time.sleep(10)  # Pedir los datos a la DB cada 10 segundos

if __name__ == "__main__":
    main()
