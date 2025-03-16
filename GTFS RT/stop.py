import csv
from google.transit import gtfs_realtime_pb2  # Librería para decodificar vehicle_positions.pb

# 📍 Definir manualmente el STOP_ID de esta Raspberry Pi
STOP_ID = "C19P34"  # Asigna la parada específica para esta Raspberry

# 📌 Ruta de los archivos GTFS en tu PC
BASE_DIR = r"C:\Users\luisa\OneDrive\Escritorio\SIGESTUR"
STATIC_GTFS_DIR = f"{BASE_DIR}\\STATIC GTFS"
REALTIME_GTFS_DIR = f"{BASE_DIR}\\GTFS RT"

stops_file = f"{STATIC_GTFS_DIR}\\stops.txt"
stop_times_file = f"{STATIC_GTFS_DIR}\\stop_times.txt"
vehicle_positions_file = f"{REALTIME_GTFS_DIR}\\vehicle_positions.pb"


# 📌 Cargar stops.txt (Paradas y ubicaciones)
stops = {}  # Diccionario {stop_id: (lat, lon)}

try:
    with open(stops_file, newline="", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            stop_id = row["stop_id"]
            lat = float(row["stop_lat"])
            lon = float(row["stop_lon"])
            stops[stop_id] = (lat, lon)

    print(f"✅ Cargadas {len(stops)} paradas.")
except FileNotFoundError:
    print(f"❌ Error: No se encontró el archivo stops.txt en {stops_file}")
    exit()

# 📌 Relacionar trip_id con paradas desde stop_times.txt
trips_to_stops = {}  # Diccionario {trip_id: [stop_id, stop_id, ...]}

try:
    with open(stop_times_file, newline="", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            trip_id = row["trip_id"]
            stop_id = row["stop_id"]

            if trip_id not in trips_to_stops:
                trips_to_stops[trip_id] = []
            
            trips_to_stops[trip_id].append(stop_id)

    print(f"✅ Relacionados {len(trips_to_stops)} trips con sus paradas.")
except FileNotFoundError:
    print(f"❌ Error: No se encontró el archivo stop_times.txt en {stop_times_file}")
    exit()

# 📌 Filtrar trips que pasan por el STOP_ID asignado a esta Raspberry
trips_for_raspberry = [trip for trip, stops in trips_to_stops.items() if STOP_ID in stops]

if not trips_for_raspberry:
    print(f"⚠️ No hay trips asociados a la parada {STOP_ID}. Verifica tu stop_times.txt")
    exit()

print(f"🚏 Esta Raspberry solo mostrará los buses de los trips: {trips_for_raspberry}")

# 📌 Cargar vehicle_positions.pb y filtrar solo los buses de interés
feed = gtfs_realtime_pb2.FeedMessage()

try:
    with open(vehicle_positions_file, "rb") as f:
        feed.ParseFromString(f.read())

    print("\n🚍 Buses en ruta:")

    buses_mostrados = 0
    for entity in feed.entity:
        vehicle = entity.vehicle
        trip_id = vehicle.trip.trip_id
        lat = vehicle.position.latitude
        lon = vehicle.position.longitude
        timestamp = vehicle.timestamp

        # Solo mostramos buses que pertenecen a los trips de esta Raspberry
        if trip_id in trips_for_raspberry:
            print(f"🚌 Bus en ruta {trip_id}: ({lat}, {lon}) - Última actualización: {timestamp}")
            buses_mostrados += 1

    if buses_mostrados == 0:
        print("⚠️ No hay buses en ruta para esta parada en este momento.")

except FileNotFoundError:
    print(f"❌ Error: No se encontró el archivo vehicle_positions.pb en {vehicle_positions_file}")
    exit()
