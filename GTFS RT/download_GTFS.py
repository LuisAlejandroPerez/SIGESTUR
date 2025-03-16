import os
from google.cloud import storage

def download_gtfs_directory():
    """
    Downloads all files from the STATIC GTFS directory in Firebase Storage
    to a folder on the desktop.
    """
    # Set up credentials
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = r"C:\Users\luisa\Desktop\SIGESTUR\Rx\sigestur-tx-firebase-adminsdk-fbsvc-1db6dbb0ee.json"
    
    # Create storage client
    storage_client = storage.Client()
    
    # Firebase Storage bucket name
    bucket_name = "sigestur-tx.firebasestorage.app"
    
    # Directory in Firebase Storage
    directory_path = "STATIC GTFS/"
    
    # Local directory to save files (on desktop)
    local_directory = os.path.join(os.path.expanduser("~"), "Desktop","SIGESTUR", "STATIC GTFS")
    
    # Create local directory if it doesn't exist
    os.makedirs(local_directory, exist_ok=True)
    
    print(f"Starting download of all files from {directory_path}...")
    
    try:
        # Get bucket
        bucket = storage_client.bucket(bucket_name)
        
        # List all files in the directory
        blobs = list(bucket.list_blobs(prefix=directory_path))
        
        if not blobs:
            print(f"No files found in {directory_path}")
            return
        
        print(f"Found {len(blobs)} files to download.")
        
        # Download each file
        downloaded_count = 0
        for blob in blobs:
            # Skip the directory itself
            if blob.name == directory_path:
                continue
                
            # Get the relative path within the STATIC GTFS directory
            relative_path = blob.name[len(directory_path):]
            
            # Skip if it's an empty name (would be a subdirectory marker)
            if not relative_path:
                continue
                
            # Set the local file path
            local_file_path = os.path.join(local_directory, relative_path)
            
            # Create subdirectories if needed
            os.makedirs(os.path.dirname(local_file_path), exist_ok=True)
            
            # Download the file
            blob.download_to_filename(local_file_path)
            downloaded_count += 1
            print(f"Downloaded ({downloaded_count}/{len(blobs)}): {relative_path}")
        
        print(f"\n✅ Successfully downloaded {downloaded_count} files to {local_directory}")
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")

if __name__ == "__main__":
    download_gtfs_directory()