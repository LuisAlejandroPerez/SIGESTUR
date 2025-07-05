import firebase_admin
from firebase_admin import credentials, db
import time
import os
from datetime import datetime

class GPSSimulator:
    def __init__(self):
        # Configuration
        self.FIREBASE_CREDENTIALS = r"C:\Users\luisa\Desktop\SIGESTUR\Rx\sigestur-tx-firebase-adminsdk-fbsvc-86a9c46228.json"
        self.DATABASE_URL = "https://sigestur-tx-default-rtdb.firebaseio.com/"
        self.TRIP_ID = "C19A"
        self.DIRECTION_ID = "0"
        
        self.coordinates = [
            (18.470423, -69.932918),
            (18.475488, -69.935710),
            (18.476257, -69.936144),
            (18.477042, -69.936596),
            (18.477817, -69.937047),
            (18.478530, -69.937401),
            (18.479469, -69.937927),
            (18.480699, -69.938622),
            (18.481183, -69.938883),
            (18.482165, -69.939398),
            (18.482495, -69.939601)
        ]
        
        self.current_index = 0
        self.initialize_firebase()
    
    def initialize_firebase(self):
        """Initialize Firebase connection"""
        try:
            # Check if Firebase app is already initialized
            if not firebase_admin._apps:
                cred = credentials.Certificate(self.FIREBASE_CREDENTIALS)
                firebase_admin.initialize_app(cred, {
                    'databaseURL': self.DATABASE_URL
                })
                print("Firebase initialized successfully")
            else:
                print("Firebase already initialized")
        except Exception as e:
            print(f"Error initializing Firebase: {e}")
            raise
    
    def get_current_timestamp(self):
        """Get current timestamp in seconds since epoch"""
        return int(time.time())
    
    def post_coordinates(self, latitude, longitude):
        """Post coordinates to Firebase"""
        try:
            # Reference to the specific trip location in the database
            ref = db.reference(f'gps_data/trip_ID/{self.TRIP_ID}')
            
            # Data to be posted
            data = {
                'direction_id': self.DIRECTION_ID,
                'latitude': latitude,
                'longitude': longitude,
                'timestamp': self.get_current_timestamp()
            }
            
            # Update the database
            ref.update(data)
            
            print(f"Posted coordinates: Lat {latitude}, Lon {longitude} at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            
        except Exception as e:
            print(f"Error posting coordinates: {e}")
    
    def get_next_coordinates(self):
        """Get the next set of coordinates in the cycle"""
        coords = self.coordinates[self.current_index]
        self.current_index = (self.current_index + 1) % len(self.coordinates)
        return coords
    
    def start_simulation(self):
        """Start the GPS simulation loop"""
        print(f"Starting GPS simulation for trip {self.TRIP_ID}")
        print(f"Will cycle through {len(self.coordinates)} coordinate pairs every 15 seconds")
        print("Press Ctrl+C to stop the simulation")
        
        try:
            while True:
                # Get next coordinates
                lat, lon = self.get_next_coordinates()
                
                # Post to Firebase
                self.post_coordinates(lat, lon)
                
                # Wait 15 seconds
                time.sleep(15)
                
        except KeyboardInterrupt:
            print("\nSimulation stopped by user")
        except Exception as e:
            print(f"Error in simulation loop: {e}")

def main():
    """Main function to run the GPS simulator"""
    simulator = GPSSimulator()
    simulator.start_simulation()

if __name__ == "__main__":
    main()