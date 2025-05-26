import os
import time
import requests
import json
import csv
import firebase_admin
from firebase_admin import credentials, db
from google.cloud import storage
from google.transit import gtfs_realtime_pb2
from datetime import datetime, timedelta
import tkinter as tk
import threading
import queue

# Configuration
FIREBASE_CREDENTIALS = r"C:\Users\luisa\Desktop\SIGESTUR\Rx\sigestur-tx-firebase-adminsdk-fbsvc-a49d945ba1.json"
DATABASE_URL = "https://sigestur-tx-default-rtdb.firebaseio.com/"
BUCKET_NAME = "sigestur-tx.firebasestorage.app"
STATIC_GTFS_FOLDER = "STATIC GTFS/"
LOCAL_GTFS_PATH = os.path.join(os.path.expanduser("~"), "Desktop", "SIGESTUR", "STATIC GTFS")
API_KEY = "AIzaSyCIsmfqnTiBsxw9C2pyIhdibHJcryJMCHw"

# Terminal stop configuration
STOP_ID = "C19P34"  # Change this to your terminal stop ID
DIRECTION_ID = "0"  # Current direction buses are arriving from
NEW_DIRECTION_ID = "1"  # Direction buses will change to after turnaround
GTFS_RT_PATH = "C:/Users/luisa/Desktop/SIGESTUR/GTFS RT/vehicle_positions.pb"

# Thresholds
ARRIVAL_THRESHOLD = 20  # meters
DEPARTURE_TIMEOUT = 45  # seconds before considering bus has left
DIRECTION_CHANGE_TIMEOUT = 40  # seconds at stop before changing direction

# Initialize Firebase
cred = credentials.Certificate(FIREBASE_CREDENTIALS)
firebase_admin.initialize_app(cred, {"databaseURL": DATABASE_URL})
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = FIREBASE_CREDENTIALS
storage_client = storage.Client()

# Global variables
arrived_buses = {}  # trip_id -> arrival_time
direction_changed_buses = {}  # trip_id -> change_time
bus_data_queue = queue.Queue()

# Utility functions for GUI
def is_color_dark(hex_color):
    hex_color = hex_color.lstrip('#')
    r, g, b = [int(hex_color[i:i+2], 16) for i in (0, 2, 4)]
    luminance = (0.299 * r + 0.587 * g + 0.114 * b)
    return luminance < 140

def hex_to_rgb(hex_color):
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

def rgb_to_hex(rgb_tuple):
    return '#%02x%02x%02x' % rgb_tuple

def interpolate_color(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))

# Backend utility functions
def format_distance(distance_meters):
    return f"{distance_meters / 1000:.1f} km" if distance_meters >= 1000 else f"{distance_meters} m"

def format_time(duration_seconds):
    return f"{duration_seconds // 60} min {duration_seconds % 60} sec" if duration_seconds >= 60 else f"{duration_seconds} sec"

def update_bus_direction(trip_id, new_direction):
    """Update the direction_id of a bus in Firebase"""
    try:
        ref = db.reference(f"gps_data/trip_ID/{trip_id}")
        ref.update({"direction_id": new_direction})
        # print(f"✅ OMSA {trip_id} direction changed to {new_direction} in Firebase")
        return True
    except Exception as e:
        # print(f"❌ Error updating direction for OMSA {trip_id}: {str(e)}")
        return False

def download_gtfs_directory():
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
            # print(f"Descargado: {relative_path}")
        # print(" Archivos descargados.")
    except Exception as e:
        # print(f"Error al descargar GTFS: {str(e)}")
        pass

def generate_gtfs_rt():
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.header.gtfs_realtime_version = "2.0"
    feed.header.timestamp = int(time.time())
    ref_trips = db.reference("gps_data/trip_ID")
    trips = ref_trips.get()
    if not trips:
        # print("No hay datos en Firebase")
        return
    for trip_id, data in trips.items():
        entity = feed.entity.add()
        entity.id = trip_id
        vehicle = entity.vehicle
        vehicle.position.latitude = data["latitude"]
        vehicle.position.longitude = data["longitude"]
        vehicle.timestamp = data["timestamp"]
        vehicle.trip.trip_id = trip_id
    with open(GTFS_RT_PATH, "wb") as f:
        f.write(feed.SerializeToString())
    # print("Archivo GTFS-RT generado")

def load_stops(file_path):
    stops = {}
    with open(file_path, newline="", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            stops[row["stop_id"]] = (float(row["stop_lat"]), float(row["stop_lon"]))
    return stops

def load_trips(stop_times_path, trips_path):
    trips_to_stops = {}
    trip_directions = {}
    with open(trips_path, newline="", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            trip_directions[row["trip_id"]] = row["direction_id"]
    with open(stop_times_path, newline="", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            trip_id = row["trip_id"]
            stop_id = row["stop_id"]
            if trip_directions.get(trip_id) == DIRECTION_ID:
                if trip_id not in trips_to_stops:
                    trips_to_stops[trip_id] = []
                trips_to_stops[trip_id].append(stop_id)
    return trips_to_stops

def request_eta(lat, lon, stop_lat, stop_lon):
    data = {
        "origins": [{"waypoint": {"location": {"latLng": {"latitude": lat, "longitude": lon}}}}],
        "destinations": [{"waypoint": {"location": {"latLng": {"latitude": stop_lat, "longitude": stop_lon}}}}],
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_AWARE"
    }
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition"
    }
    response = requests.post(
        "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
        headers=headers,
        json=data
    )
    return response.json() if response.status_code == 200 else None

def fetch_vehicle_positions(file_path):
    feed = gtfs_realtime_pb2.FeedMessage()
    with open(file_path, "rb") as f:
        feed.ParseFromString(f.read())
    return feed

class TerminalBusDisplay:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("OMSA Terminal Display")
        self.root.geometry("1024x600")
        self.root.configure(bg='black')
        self.root.attributes('-fullscreen', False)
        
        # Fonts
        self.trip_font = ('Courier New', 22, 'bold')
        self.eta_font = ('Courier New', 20, 'bold')
        self.time_font = ('Courier New', 18)
        self.header_font = ('Courier New', 24, 'bold')
        self.date_font = ('Courier New', 16)
        self.status_font = ('Courier New', 16, 'bold')
        
        # Colors
        self.random_colors = ['#FF5733', '#33FF57', '#3357FF', '#FF33A8', '#FFC300', '#8D33FF', '#33FFF0']
        
        # Bus data
        self.buses = []
        self.current_trip_ids = [None, None, None]  # 3 rows for terminal display
        self.trip_colors = [None, None, None]
        
        # Backend data flag
        self.backend_running = False
        
        self.setup_ui()
        self.start_backend_thread()
        self.update_loop()

    def setup_ui(self):
        # Main container for header section
        header_container = tk.Frame(self.root, bg='black')
        header_container.pack(pady=(20, 5), fill='x')
        
        # Create a grid layout for the header section
        header_container.grid_columnconfigure(0, weight=1)
        header_container.grid_columnconfigure(1, weight=1)
        header_container.grid_columnconfigure(2, weight=1)
        
        # Left column with time
        self.time_label = tk.Label(
            header_container, 
            text="",
            font=self.time_font,
            bg='black',
            fg='#FFFF00'
        )
        self.time_label.grid(row=0, column=0, sticky='w', padx=40)
        
        # Center column with title - CENTERED IN THE ENTIRE WINDOW
        self.header = tk.Label(
            header_container, 
            text=f"OMSA TERMINAL - STOP {STOP_ID}",
            font=self.header_font,
            bg='black',
            fg='white'
        )
        self.header.grid(row=0, column=1)
        
        # Right column with date
        self.date_label = tk.Label(
            header_container, 
            text="",
            font=self.date_font,
            bg='black',
            fg='#FFFF00'
        )
        self.date_label.grid(row=0, column=2, sticky='e', padx=40)
        
        # Separator
        self.separator = tk.Frame(self.root, height=3, bg='#555555')
        self.separator.pack(fill='x', padx=40, pady=(20, 20))
        
        # Column headers
        header_frame = tk.Frame(self.root, bg='black')
        header_frame.pack()
        
        # Configure grid weights for proper column alignment
        header_frame.grid_columnconfigure(0, weight=1)
        header_frame.grid_columnconfigure(1, weight=1)
        header_frame.grid_columnconfigure(2, weight=1)
        header_frame.grid_columnconfigure(3, weight=1)
        
        tk.Label(
            header_frame, 
            text="TRIP ID",
            font=self.trip_font,
            bg='black',
            fg='white'
        ).grid(row=0, column=0, padx=15, sticky='')
        
        tk.Label(
            header_frame, 
            text="ETA",
            font=self.trip_font,
            bg='black',
            fg='white'
        ).grid(row=0, column=1, padx=15, sticky='')
        
        tk.Label(
            header_frame, 
            text="DISTANCE",
            font=self.trip_font,
            bg='black',
            fg='white'
        ).grid(row=0, column=2, padx=15, sticky='')
        
        tk.Label(
            header_frame, 
            text="STATUS",
            font=self.trip_font,
            bg='black',
            fg='white'
        ).grid(row=0, column=3, padx=15, sticky='')
        
        # Bus rows (3 rows for terminal display)
        self.rows = []
        for _ in range(3):
            frame = tk.Frame(self.root, bg='black')
            frame.pack(pady=10)
            
            # Configure grid weights for proper column alignment
            frame.grid_columnconfigure(0, weight=1)
            frame.grid_columnconfigure(1, weight=1)
            frame.grid_columnconfigure(2, weight=1)
            frame.grid_columnconfigure(3, weight=1)
            
            # Trip ID container with colored background (auto-sizing)
            trip_container = tk.Frame(frame, bg='black', padx=15, pady=8)
            trip_container.grid(row=0, column=0, padx=15)
            
            trip_label = tk.Label(
                trip_container, 
                text="",
                font=self.trip_font,
                bg='black',
                fg='white'
            )
            trip_label.pack()
            
            # ETA label
            eta_label = tk.Label(
                frame, 
                text="",
                font=self.eta_font,
                bg='black',
                fg='#FFFF00'
            )
            eta_label.grid(row=0, column=1, padx=15)
            
            # Distance label
            distance_label = tk.Label(
                frame, 
                text="",
                font=self.eta_font,
                bg='black',
                fg='white'
            )
            distance_label.grid(row=0, column=2, padx=15)
            
            # Status label
            status_label = tk.Label(
                frame, 
                text="",
                font=self.status_font,
                bg='black',
                fg='white'
            )
            status_label.grid(row=0, column=3, padx=15)
            
            self.rows.append({
                'trip_label': trip_label,
                'trip_container': trip_container,
                'eta': eta_label,
                'distance': distance_label,
                'status': status_label
            })

    def start_backend_thread(self):
        """Start the backend data collection in a separate thread"""
        self.backend_thread = threading.Thread(target=self.backend_worker, daemon=True)
        self.backend_thread.start()

    def backend_worker(self):
        """Backend worker that runs in a separate thread"""
    def backend_worker(self):
        """Backend worker that runs in a separate thread"""
        global arrived_buses, direction_changed_buses
        
        try:
            download_gtfs_directory()
            stops = load_stops(f"{LOCAL_GTFS_PATH}/stops.txt")
            
            if STOP_ID not in stops:
                # print(f"STOP_ID {STOP_ID} no encontrado en stops.txt")
                return
            
            stop_lat, stop_lon = stops[STOP_ID]
            trips_to_stops = load_trips(f"{LOCAL_GTFS_PATH}/stop_times.txt", f"{LOCAL_GTFS_PATH}/trips.txt")
            trips_for_terminal = [trip for trip, stops in trips_to_stops.items() if STOP_ID in stops]
            
            self.backend_running = True
            
            while self.backend_running:
                try:
                    generate_gtfs_rt()
                    feed = fetch_vehicle_positions(GTFS_RT_PATH)
                    current_time = datetime.now()
                    
                    # Check for buses that have left the terminal
                    buses_to_remove = []
                    for trip_id, arrival_time in arrived_buses.items():
                        if (current_time - arrival_time).total_seconds() > DEPARTURE_TIMEOUT:
                            buses_to_remove.append(trip_id)
                    
                    for trip_id in buses_to_remove:
                        # print(f"🚌 OMSA {trip_id} ha dejado la parada terminal {STOP_ID}")
                        del arrived_buses[trip_id]
                        if trip_id in direction_changed_buses:
                            del direction_changed_buses[trip_id]
                    
                    # Check for buses that need direction change
                    buses_to_change_direction = []
                    for trip_id, arrival_time in arrived_buses.items():
                        time_at_stop = (current_time - arrival_time).total_seconds()
                        if (time_at_stop >= DIRECTION_CHANGE_TIMEOUT and 
                            trip_id not in direction_changed_buses):
                            buses_to_change_direction.append(trip_id)
                    
                    # Update direction for eligible buses
                    for trip_id in buses_to_change_direction:
                        if update_bus_direction(trip_id, NEW_DIRECTION_ID):
                            direction_changed_buses[trip_id] = current_time
                            # print(f"🔄 OMSA {trip_id} cambió dirección después de {DIRECTION_CHANGE_TIMEOUT} segundos en terminal")
                    
                    # Process vehicle data
                    bus_info = []
                    for entity in feed.entity:
                        vehicle = entity.vehicle
                        trip_id = vehicle.trip.trip_id
                        lat, lon = vehicle.position.latitude, vehicle.position.longitude
                        
                        vehicle_data = db.reference(f"gps_data/trip_ID/{trip_id}").get()
                        if vehicle_data and str(vehicle_data.get("direction_id")) == DIRECTION_ID and trip_id in trips_for_terminal:
                            result = request_eta(lat, lon, stop_lat, stop_lon)
                            if result:
                                for res in result:
                                    if res.get("condition", "UNKNOWN") == "ROUTE_EXISTS":
                                        distance = res["distanceMeters"]
                                        duration = int(res["duration"].replace("s", ""))
                                        
                                        # Check if bus has arrived
                                        if distance <= ARRIVAL_THRESHOLD:
                                            if trip_id not in arrived_buses:
                                                arrived_buses[trip_id] = datetime.now()
                                                # print(f"🎯 OMSA {trip_id} ha llegado a la parada terminal {STOP_ID}!")
                                        
                                        bus_info.append({
                                            "trip_id": trip_id,
                                            "distance": distance,
                                            "duration": duration,
                                            "has_arrived": trip_id in arrived_buses,
                                            "direction_changed": trip_id in direction_changed_buses,
                                            "time_at_stop": (current_time - arrived_buses[trip_id]).total_seconds() if trip_id in arrived_buses else 0
                                        })
                    
                    # Sort by distance and separate approaching vs at terminal
                    bus_info.sort(key=lambda x: x["distance"])
                    approaching_buses = [bus for bus in bus_info if not bus["has_arrived"]]
                    at_terminal_buses = [bus for bus in bus_info if bus["has_arrived"]]
                    
                    # Convert to GUI format - combine approaching and at terminal
                    gui_buses = []
                    
                    # Add approaching buses first
                    for bus in approaching_buses[:2]:  # Take first 2 approaching buses
                        gui_buses.append({
                            'trip_id': bus['trip_id'],
                            'eta': bus['duration'] // 60,  # Convert to minutes
                            'distance': bus['distance'],
                            'status': 'APPROACHING',
                            'status_color': '#FFFF00'
                        })
                    
                    # Add buses at terminal
                    for bus in at_terminal_buses[:3-len(gui_buses)]:  # Fill remaining slots
                        time_until_change = max(0, DIRECTION_CHANGE_TIMEOUT - bus['time_at_stop'])
                        
                        if bus['direction_changed']:
                            status = 'DIR CHANGED'
                            status_color = '#00FF00'
                        else:
                            status = f'WAIT {int(time_until_change)}s'
                            status_color = '#FF8800'
                        
                        gui_buses.append({
                            'trip_id': bus['trip_id'],
                            'eta': 0,  # At terminal
                            'distance': bus['distance'],
                            'status': status,
                            'status_color': status_color
                        })
                    
                    # Put data in queue for GUI
                    try:
                        bus_data_queue.put(gui_buses, block=False)
                    except queue.Full:
                        pass  # Skip if queue is full
                    
                    time.sleep(20)
                    
                except Exception as e:
                    # print(f"Error in backend worker: {e}")
                    time.sleep(10)  # Wait before retrying
                    
        except Exception as e:
            # print(f"Fatal error in backend worker: {e}")
            self.backend_running = False

    def get_eta_data(self):
        """Get ETA data from the backend queue"""
        try:
            # Try to get the latest data from queue
            latest_data = None
            while not bus_data_queue.empty():
                latest_data = bus_data_queue.get_nowait()
            
            if latest_data is not None:
                self.buses = latest_data
            
            return self.buses
        except queue.Empty:
            return self.buses

    def format_eta(self, minutes):
        """Format ETA display"""
        if minutes == 0:
            return "AT TERMINAL"
        return "ARRIVING" if minutes <= 1 else f"{minutes} MIN"

    def format_distance(self, meters):
        """Format distance display"""
        return f"{meters} m" if meters < 1000 else f"{meters / 1000:.1f} km"

    def fade_color(self, i, start_rgb, end_rgb, step=0, total_steps=20):
        """Animate color transition for trip ID background"""
        t = step / total_steps
        new_rgb = interpolate_color(start_rgb, end_rgb, t)
        new_hex = rgb_to_hex(new_rgb)
        text_color = 'white' if is_color_dark(new_hex) else 'black'
        
        self.rows[i]['trip_label'].config(bg=new_hex, fg=text_color)
        self.rows[i]['trip_container'].config(bg=new_hex)
        
        if step < total_steps:
            self.root.after(30, self.fade_color, i, start_rgb, end_rgb, step + 1, total_steps)
        else:
            self.trip_colors[i] = rgb_to_hex(end_rgb)

    def update_loop(self):
        """Main GUI update loop"""
        # Update current time and date
        now = datetime.now()
        current_time = now.strftime('%I:%M:%S %p')
        current_date = now.strftime('%A, %B %d, %Y')
        
        self.time_label.config(text=current_time)
        self.date_label.config(text=current_date)
        
        # Get latest ETA data from backend
        eta_data = self.get_eta_data()
        
        # Update display for each row
        for i in range(3):
            if i < len(eta_data):
                trip_id = eta_data[i]['trip_id']
                
                # Check if this is a new trip (for color animation)
                if trip_id != self.current_trip_ids[i]:
                    import random
                    new_color = random.choice(self.random_colors)
                    start_color = self.trip_colors[i] or "#000000"
                    self.current_trip_ids[i] = trip_id
                    
                    start_rgb = hex_to_rgb(start_color)
                    end_rgb = hex_to_rgb(new_color)
                    self.fade_color(i, start_rgb, end_rgb)
                
                # Update trip ID
                self.rows[i]['trip_label'].config(text=trip_id)
                
                # Update ETA with color coding
                eta = eta_data[i]['eta']
                self.rows[i]['eta'].config(text=self.format_eta(eta))
                
                # Color code ETA based on urgency
                if eta == 0:
                    self.rows[i]['eta'].config(fg='#00FF00')  # Green for at terminal
                elif eta <= 1:
                    self.rows[i]['eta'].config(fg='red')
                elif eta <= 5:
                    self.rows[i]['eta'].config(fg='orange')
                else:
                    self.rows[i]['eta'].config(fg='#FFFF00')
                
                # Update distance
                distance = eta_data[i]['distance']
                self.rows[i]['distance'].config(text=self.format_distance(distance))
                
                # Update status with color
                status = eta_data[i]['status']
                status_color = eta_data[i]['status_color']
                self.rows[i]['status'].config(text=status, fg=status_color)
                
            else:
                # Clear row if no data
                self.rows[i]['trip_label'].config(text="", bg='black', fg='white')
                self.rows[i]['trip_container'].config(bg='black')
                self.rows[i]['eta'].config(text="")
                self.rows[i]['distance'].config(text="")
                self.rows[i]['status'].config(text="")
                self.current_trip_ids[i] = None
                self.trip_colors[i] = None
        
        # Schedule next update
        self.root.after(5000, self.update_loop)  # Update every 5 seconds

    def on_closing(self):
        """Handle application closing"""
        self.backend_running = False
        if hasattr(self, 'backend_thread'):
            self.backend_thread.join(timeout=2)
        self.root.destroy()

    def run(self):
        """Start the application"""
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)
        self.root.mainloop()

# Touch screen event handlers (optional)
class TouchHandler:
    def __init__(self, display):
        self.display = display
        self.setup_touch_events()
    
    def setup_touch_events(self):
        """Setup touch event bindings"""
        self.display.root.bind('<Button-1>', self.on_touch)
        self.display.root.bind('<Double-Button-1>', self.on_double_touch)
    
    def on_touch(self, event):
        """Handle single touch - refresh display"""
        # print(f"Touch at: {event.x}, {event.y}")
        # Force update display
        self.display.update_loop()
    
    def on_double_touch(self, event):
        """Handle double touch - toggle fullscreen"""
        current_state = self.display.root.attributes('-fullscreen')
        self.display.root.attributes('-fullscreen', not current_state)

if __name__ == "__main__":
    try:
        # Create and run the terminal display
        display = TerminalBusDisplay()
        
        # Add touch handling for the LCD touch screen
        touch_handler = TouchHandler(display)
        
        # Run the application
        display.run()
        
    except KeyboardInterrupt:
        # print("Application interrupted by user")
        pass
    except Exception as e:
        # print(f"Application error: {e}")
        pass
