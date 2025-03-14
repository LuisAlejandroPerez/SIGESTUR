import firebase_admin
from firebase_admin import credentials
from firebase_admin import db


# Fetch the service account key JSON file contents
cred = credentials.Certificate(r"C:\Users\luisa\OneDrive\Escritorio\SIGESTUR\Rx\sigestur-tx-firebase-adminsdk-fbsvc-e463993ccf.json")

# Initialize the app with a service account, granting admin privileges
firebase_admin.initialize_app(cred, {
    'databaseURL': 'https://sigestur-tx-default-rtdb.firebaseio.com/'
})

# creating reference to the root node
ref = db.reference("/")

# Metodo get pero en este caso estamos referenciando al root node 
print(ref.get())
# TODO: tener en cuenta la ruta por la cual va la omsa para poder mostrarla en pantalla (solamente 3 por pantalla)
print(db.reference("/gps_data/omsas").get())

#update operation (update existing value)
db.reference("/gps_data/omsas/omsa_002").update({"timestamp":"15"})

#update operation (add new key value)
db.reference("/gps_data/omsas/omsa_002").update({"activa":"si"})

# push operation
db.reference("/gps_data/omsas/omsa_002/timestamp").push().set("12345")

# delete operation
db.reference("/gps_data/omsas/omsa_002/activa").delete()