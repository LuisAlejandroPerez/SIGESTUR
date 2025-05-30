import tkinter as tk
from datetime import datetime
import threading
import queue
import random

# Terminal stop configuration (imported from backend)
from backend import STOP_ID

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

class TerminalBusDisplay:
    def __init__(self, data_queue):
        self.data_queue = data_queue
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
        
        self.setup_ui()
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
            text=f"Av. Lincoln - Agora Mall {STOP_ID}",
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
            text="OMSA",
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
            text="Distancia",
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

    def get_eta_data(self):
        """Get ETA data from the backend queue"""
        try:
            # Try to get the latest data from queue
            latest_data = None
            while not self.data_queue.empty():
                latest_data = self.data_queue.get_nowait()
            
            if latest_data is not None:
                self.buses = latest_data
            
            return self.buses
        except queue.Empty:
            return self.buses

    def format_eta(self, minutes):
        """Format ETA display"""
        if minutes == 0:
            return "En la Parada"
        return "Llegando" if minutes <= 1 else f"{minutes} MIN"

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

    def run(self):
        """Start the application"""
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
        # Force update display
        self.display.update_loop()
    
    def on_double_touch(self, event):
        """Handle double touch - toggle fullscreen"""
        current_state = self.display.root.attributes('-fullscreen')
        self.display.root.attributes('-fullscreen', not current_state)
