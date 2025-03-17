import os
from google.cloud import storage

"""
    Este bloque de codigo sirve para descargar desde Fire Storage todos los archivos del directorio STATIC GTFS en Firebase que contienen la data GTFS estatica.
"""


def download_gtfs_directory():
    
    # credenciales
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = r"C:\Users\luisa\OneDrive\Escritorio\SIGESTUR\Rx\sigestur-tx-firebase-adminsdk-fbsvc-e463993ccf.json"
    
    storage_client = storage.Client()
    
    # Nombre del bucket de firebase storage  
    bucket_name = "sigestur-tx.firebasestorage.app"
    
    # Directorio a descargar
    directory_path = "STATIC GTFS/"
    
    # ubicacion en mi PC donde se va a guardar la dta GTFS
    local_directory = os.path.join(os.path.expanduser("~"), "OneDrive", "Escritorio","SIGESTUR", "STATIC GTFS")
    
    # Crear directorio local si no existe (Esto es para manejo de error)
    os.makedirs(local_directory, exist_ok=True)
    
    print(f"Iniciando descarga desde el directorio {directory_path}...")
    
    try:
        """
        NOTA: In Firebase, a bucket is a Google Cloud Storage container that stores files that are accessible through both Firebase and Google Cloud.
        """

        # Obtener el  bucket
        bucket = storage_client.bucket(bucket_name)
        
        # printeame todos los archivos de ese directorio
        blobs = list(bucket.list_blobs(prefix=directory_path))
        
        if not blobs:
            print(f"Archivos no encontrado en: {directory_path}")
            return
        
        print(f"Found {len(blobs)} Archivos a descargar")
        
        # Descargar cada archivo
        downloaded_count = 0
        for blob in blobs:
            if blob.name == directory_path: # vueleta el directorio en si.
                continue
                
            relative_path = blob.name[len(directory_path):]
            
            if not relative_path:
                continue
                
            local_file_path = os.path.join(local_directory, relative_path)
            
            # Crear subdirectorios is es requerido
            os.makedirs(os.path.dirname(local_file_path), exist_ok=True)
            
            # Descarga el archivo 
            blob.download_to_filename(local_file_path)
            downloaded_count += 1
            print(f"Descargado ({downloaded_count}/{len(blobs)}): {relative_path}")
        
        print(f"\n Successfully downloaded ✅  {downloaded_count} files to {local_directory}")
        
    except Exception as e:
        print(f"Error ❌ :  {str(e)}")

if __name__ == "__main__":
    download_gtfs_directory()