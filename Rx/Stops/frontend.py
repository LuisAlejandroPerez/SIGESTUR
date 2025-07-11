import tkinter as tk
from datetime import datetime
import random

class BusDisplayGUI:
    def __init__(self, backend):
        self.backend = backend
        self.root = tk.Tk()
        self.root.title("OMSA ETA Display")
        self.root.geometry("1024x600")
        self.root.configure(bg='black')
        self.root.attributes('-fullscreen', False)
        
        # Fonts
        self.trip_font = ('Courier New', 22, 'bold')
        self.eta_font = ('Courier New', 20, 'bold')
        self.time_font = ('Courier New', 18)
        self.header_font = ('Courier New', 24, 'bold')
        self.date_font = ('Courier New', 16)
        
        # Colors
        self.random_colors = ['#FF5733', '#33FF57', '#3357FF', '#FF33A8', '#FFC300', '#8D33FF', '#33FFF0']
        
        # Bus data
        self.buses = []
        self.current_trip_ids = [None, None]
        self.trip_colors = [None, None]
        
        self.setup_ui()
        self.update_loop()
    
    def is_color_dark(self, hex_color):
        """Check if color is dark"""
        hex_color = hex_color.lstrip('#')
        r, g, b = [int(hex_color[i:i+2], 16) for i in (0, 2, 4)]
        luminance = (0.299 * r + 0.587 * g + 0.114 * b)
        return luminance < 140
    
    def hex_to_rgb(self, hex_color):
        """Convert hex to RGB"""
        hex_color = hex_color.lstrip('#')
        return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
    
    def rgb_to_hex(self, rgb_tuple):
        """Convert RGB to hex"""
        return '#%02x%02x%02x' % rgb_tuple
    
    def interpolate_color(self, c1, c2, t):
        """Interpolate between two colors"""
        return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
    
    def setup_ui(self):
        """Setup the user interface"""
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
        
        # Center column with title
        self.header = tk.Label(
            header_container, 
            text=f"Av. Lincoln - Agora Mall {self.backend.STOP_ID}",
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
        
        # Column headers - use a frame with fixed column widths
        header_frame = tk.Frame(self.root, bg='black')
        header_frame.pack()
        
        # Set fixed column widths for alignment
        header_frame.columnconfigure(0, minsize=250)  # Trip ID column
        header_frame.columnconfigure(1, minsize=250)  # ETA column
        header_frame.columnconfigure(2, minsize=250)  # Distance column
        
        tk.Label(
            header_frame, 
            text="OMSA",
            font=self.trip_font,
            bg='black',
            fg='white'
        ).grid(row=0, column=0, padx=10, sticky='w')
        
        tk.Label(
            header_frame, 
            text="ETA",
            font=self.trip_font,
            bg='black',
            fg='white'
        ).grid(row=0, column=1, padx=10, sticky='w')
        
        tk.Label(
            header_frame, 
            text="Distancia",
            font=self.trip_font,
            bg='black',
            fg='white'
        ).grid(row=0, column=2, padx=10, sticky='w')
        
        # Bus rows with fixed column widths
        self.rows = []
        for _ in range(2):
            frame = tk.Frame(self.root, bg='black')
            frame.pack(pady=10)
            
            # Set fixed column widths matching the header
            frame.columnconfigure(0, minsize=250)
            frame.columnconfigure(1, minsize=250)
            frame.columnconfigure(2, minsize=250)
            
            # Trip ID label (without container frame)
            trip_label = tk.Label(
                frame, 
                text="",
                font=self.trip_font,
                bg='black',
                fg='white',
                anchor='w',
                padx=15
            )
            trip_label.grid(row=0, column=0, sticky='w', padx=10)
            
            # ETA label
            eta_label = tk.Label(
                frame, 
                text="",
                font=self.eta_font,
                bg='black',
                fg='#FFFF00',
                anchor='w',
                padx=10
            )
            eta_label.grid(row=0, column=1, sticky='w', padx=10)
            
            # Distance label
            distance_label = tk.Label(
                frame, 
                text="",
                font=self.eta_font,
                bg='black',
                fg='white',
                anchor='w',
                padx=10
            )
            distance_label.grid(row=0, column=2, sticky='w', padx=10)
            
            self.rows.append({
                'trip_label': trip_label,
                'eta': eta_label,
                'distance': distance_label
            })
    
    def format_eta(self, minutes):
        """Format ETA display"""
        return "LLEGANDO" if minutes <= 1 else f"{minutes} MIN"
    
    def format_distance(self, meters):
        """Format distance display"""
        return f"{meters} m" if meters < 1000 else f"{meters / 1000:.1f} km"
    
    def fade_color(self, i, start_rgb, end_rgb, step=0, total_steps=20):
        """Animate color transition for trip ID background"""
        t = step / total_steps
        new_rgb = self.interpolate_color(start_rgb, end_rgb, t)
        new_hex = self.rgb_to_hex(new_rgb)
        text_color = 'white' if self.is_color_dark(new_hex) else 'black'
        
        self.rows[i]['trip_label'].config(bg=new_hex, fg=text_color)
        
        if step < total_steps:
            self.root.after(30, self.fade_color, i, start_rgb, end_rgb, step + 1, total_steps)
        else:
            self.trip_colors[i] = self.rgb_to_hex(end_rgb)
    
    def update_loop(self):
        """Main GUI update loop"""
        # Update current time and date
        now = datetime.now()
        current_time = now.strftime('%I:%M:%S %p')
        current_date = now.strftime('%A, %B %d, %Y')
        
        self.time_label.config(text=current_time)
        self.date_label.config(text=current_date)
        
        # Get latest ETA data from backend
        eta_data = self.backend.get_bus_data()
        if eta_data is not None:
            self.buses = eta_data
        
        # Update display for each row
        for i in range(2):
            if i < len(self.buses):
                trip_id = self.buses[i]['trip_id']
                distance = self.buses[i]['distance']
                has_arrived = self.buses[i].get('has_arrived', False)

                # Check if this is a new trip (for color animation)
                if trip_id != self.current_trip_ids[i]:
                    new_color = random.choice(self.random_colors)
                    start_color = self.trip_colors[i] or "#000000"
                    self.current_trip_ids[i] = trip_id
                    
                    start_rgb = self.hex_to_rgb(start_color)
                    end_rgb = self.hex_to_rgb(new_color)
                    self.fade_color(i, start_rgb, end_rgb)
                
                # Update trip ID
                self.rows[i]['trip_label'].config(text=trip_id)
                
                # Update ETA with arrival message when within 50 meters
                if distance <= 50 or has_arrived:
                    self.rows[i]['eta'].config(text="¡LLEGANDO!", fg='red')
                
                else:
                    # Update ETA with color coding
                    eta = self.buses[i]['eta']
                    self.rows[i]['eta'].config(text=self.format_eta(eta))
                
                    # Color code ETA based on urgency
                    if eta <= 1:
                        self.rows[i]['eta'].config(fg='red')
                    elif eta <= 5:
                        self.rows[i]['eta'].config(fg='orange')
                    else:
                        self.rows[i]['eta'].config(fg='#FFFF00')
                
                # Update distance
                distance = self.buses[i]['distance']
                self.rows[i]['distance'].config(text=self.format_distance(distance))
                
            else:
                # Clear row if no data
                self.rows[i]['trip_label'].config(text="", bg='black', fg='white')
                self.rows[i]['eta'].config(text="")
                self.rows[i]['distance'].config(text="")
                self.current_trip_ids[i] = None
                self.trip_colors[i] = None
        
        # Schedule next update
        self.root.after(3000, self.update_loop)  # Update every 3 seconds
    
    def on_closing(self):
        """Handle application closing"""
        self.backend.stop_backend()
        self.root.destroy()
    
    def run(self):
        """Start the application"""
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)
        self.root.mainloop()


class TouchHandler:
    """Touch screen event handlers"""
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