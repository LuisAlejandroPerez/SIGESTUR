import os
import time
import firebase_admin
from firebase_admin import credentials, db
from google.cloud import storage
from google.transit import gtfs_realtime_pb2
from datetime import datetime

# Configuración de Firebase
FIREBASE_CREDENTIALS = r"C:\Users\luisa\Desktop\SIGESTUR\Rx\sigestur-tx-firebase-adminsdk-fbsvc-1db6dbb0ee.json"
DATABASE_URL = "https://sigestur-tx-default-rtdb.firebaseio.com/"
BUCKET_NAME = "sigestur-tx.firebasestorage.app"
STATIC_GTFS_FOLDER = "STATIC GTFS/"
LOCAL_GTFS_PATH = os.path.join(os.path.expanduser("~"), "Desktop", "SIGESTUR", "STATIC GTFS")

# Inicializar Firebase
cred = credentials.Certificate(FIREBASE_CREDENTIALS)
firebase_admin.initialize_app(cred, {"databaseURL": DATABASE_URL})

# Configurar Google Cloud Storage
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = FIREBASE_CREDENTIALS
storage_client = storage.Client()

def download_gtfs_directory():
    """Descarga los archivos GTFS estáticos desde Firebase Storage."""
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
            print(f"📥 Descargado: {relative_path}")
        print("✅ Archivos GTFS estáticos descargados con éxito.")
    except Exception as e:
        print(f"❌ Error al descargar GTFS: {str(e)}")

def generate_gtfs_rt():
    """Obtiene datos GPS de Firebase y genera el archivo vehicle_positions.pb."""
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.header.gtfs_realtime_version = "2.0"
    feed.header.timestamp = int(time.time())

    ref_trips = db.reference("gps_data/trip_ID")
    trips = ref_trips.get()

    if not trips:
        print("❌ No hay datos en Firebase.")
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
    print("✅ Archivo GTFS-RT generado: vehicle_positions.pb")

def main():
    """Ejecuta los procesos periódicamente."""
    download_gtfs_directory()
    while True:
        generate_gtfs_rt()
        print(f"🔄 Actualización completada: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        time.sleep(10)  # Ejecutar cada 10 segundos

if __name__ == "__main__":
    main()
