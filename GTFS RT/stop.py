import csv
from google.transit import gtfs_realtime_pb2  

"""NOTA: Cada raspberry tiene un STOP_ID asignado"""

STOP_ID = "C19P34"  
BASE_DIR = r"C:\Users\luisa\OneDrive\Escritorio\SIGESTUR"
STATIC_GTFS_DIR = f"{BASE_DIR}\\STATIC GTFS"
REALTIME_GTFS_DIR = f"{BASE_DIR}\\GTFS RT"
stops_file = f"{STATIC_GTFS_DIR}\\stops.txt"
stop_times_file = f"{STATIC_GTFS_DIR}\\stop_times.txt"
vehicle_positions_file = f"{REALTIME_GTFS_DIR}\\vehicle_positions.pb"

stops = {}  # Diccionario {stop_id: (lat, lon)}

try:
    with open(stops_file, newline="", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            stop_id = row["stop_id"]
            lat = float(row["stop_lat"])
            lon = float(row["stop_lon"])
            stops[stop_id] = (lat, lon)

    print(f"Cargadas {len(stops)} paradas.")
except FileNotFoundError:
    print(f"Error no se encontro stops.txt en: {stops_file}")
    exit()

# TODO:Relacionar trip_id con paradas desde stop_times.txt
trips_to_stops = {}  

try:
    with open(stop_times_file, newline="", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            trip_id = row["trip_id"]
            stop_id = row["stop_id"]

            if trip_id not in trips_to_stops:
                trips_to_stops[trip_id] = []
            
            trips_to_stops[trip_id].append(stop_id)

    print(f" Se relacionaron {len(trips_to_stops)} viajes con sus paradas")
except FileNotFoundError:
    print(f"Error: No se encontro stop_times.txt en {stop_times_file}")
    exit()

# En la seccion acontinuacion hay que filtrar los viajes  que pasan por 
# el STOP_ID asignado a esta raspberry para evitar cargar informacion de mas.

trips_for_raspberry = [trip for trip, stops in trips_to_stops.items() if STOP_ID in stops]

if not trips_for_raspberry:
    print(f"No hay viajes asociados a la parada {STOP_ID}")
    exit()

print(f"Esta raspberry mostrara las omsas de los viajes: {trips_for_raspberry}")

#Por ultimo como ya filtramos las paradas debemos de cargar solo las OMSAS
#de interes digase las omsas que tienen un viaje por esa parada o que pasan por esta.

feed = gtfs_realtime_pb2.FeedMessage()

try:
    with open(vehicle_positions_file, "rb") as f:
        feed.ParseFromString(f.read())

    print("\nOMSAS ruta:")

    OMSAS_mostradas = 0
    for entity in feed.entity:
        vehicle = entity.vehicle
        trip_id = vehicle.trip.trip_id
        lat = vehicle.position.latitude
        lon = vehicle.position.longitude
        timestamp = vehicle.timestamp

        # Con estra condifcional solamente se van a ver los las omsas que estan en la ruta de esta raspberry
        if trip_id in trips_for_raspberry:
            print(f"OMSA en ruta {trip_id}: ({lat}, {lon}) - ultima actualizacion: {timestamp}")
            OMSAS_mostradas += 1

    if OMSAS_mostradas == 0:
        print("No hay OMSAS en ruta para esta parada en este momento")

except FileNotFoundError:
    print(f"Error: No se encontro  vehicle_positions.pb en {vehicle_positions_file}")
    exit()
