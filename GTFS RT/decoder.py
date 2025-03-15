from google.transit import gtfs_realtime_pb2

# Leer el archivo binario
with open("vehicle_positions.pb", "rb") as f:
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.ParseFromString(f.read())

# Imprimir el contenido de forma legible
print(feed)
