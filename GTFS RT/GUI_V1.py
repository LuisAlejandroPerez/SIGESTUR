import tkinter as tk
from datetime import datetime
import random

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

class IntermediateStopDisplay:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Bus ETA Display")
        self.root.geometry("1024x600")
        self.root.configure(bg='black')
        self.root.attributes('-fullscreen', False)

        self.trip_font = ('Courier New', 22, 'bold')
        self.eta_font = ('Courier New', 20, 'bold')
        self.time_font = ('Courier New', 18)
        self.header_font = ('Courier New', 24, 'bold')

        self.random_colors = ['#FF5733', '#33FF57', '#3357FF', '#FF33A8', '#FFC300', '#8D33FF', '#33FFF0']

        self.buses = [
            {'trip_id': 'TRIP_1201', 'eta': 5, 'distance': 1300},
            {'trip_id': 'TRIP_1203', 'eta': 12, 'distance': 2500},
            {'trip_id': 'TRIP_1210', 'eta': 25, 'distance': 4200},
        ]

        self.current_trip_ids = [None, None]
        self.trip_colors = [None, None]

        self.setup_ui()
        self.update_loop()

    def setup_ui(self):
        self.header = tk.Label(self.root, text="OMSA ETA DISPLAY", font=self.header_font, bg='black', fg='white')
        self.header.pack(pady=(20, 5))

        self.time_label = tk.Label(self.root, text="", font=self.time_font, bg='black', fg='#FFFF00')
        self.time_label.pack(pady=(0, 10))

        self.separator = tk.Frame(self.root, height=3, bg='#555555')
        self.separator.pack(fill='x', padx=40, pady=(0, 20))

        header_frame = tk.Frame(self.root, bg='black')
        header_frame.pack()

        tk.Label(header_frame, text="TRIP ID", font=self.trip_font, bg='black', fg='white', width=20, anchor='center').grid(row=0, column=0, padx=20)
        tk.Label(header_frame, text="ETA", font=self.trip_font, bg='black', fg='white', width=10, anchor='center').grid(row=0, column=1, padx=20)
        tk.Label(header_frame, text="DISTANCE", font=self.trip_font, bg='black', fg='white', width=15, anchor='center').grid(row=0, column=2, padx=20)

        self.rows = []
        for _ in range(2):
            frame = tk.Frame(self.root, bg='black')
            frame.pack(pady=10)

            trip_container = tk.Frame(frame, bg='black', padx=10, pady=5)
            trip_container.grid(row=0, column=0, padx=20)
            trip_label = tk.Label(trip_container, text="", font=self.trip_font, bg='black', width=18, anchor='center')
            trip_label.pack()

            eta_label = tk.Label(frame, text="", font=self.eta_font, bg='black', fg='#FFFF00', width=10, anchor='center')
            eta_label.grid(row=0, column=1, padx=20)

            distance_label = tk.Label(frame, text="", font=self.eta_font, bg='black', fg='white', width=15, anchor='center')
            distance_label.grid(row=0, column=2, padx=20)

            self.rows.append({
                'trip_label': trip_label,
                'trip_container': trip_container,
                'eta': eta_label,
                'distance': distance_label
            })

    def get_eta_data(self):
        self.buses = sorted([b for b in self.buses if b['eta'] > 0], key=lambda x: x['eta'])[:2]
        for bus in self.buses:
            bus['eta'] -= random.choice([1, 0])
            bus['distance'] -= random.randint(50, 200)
            if bus['distance'] < 0:
                bus['distance'] = 0
        return self.buses

    def format_eta(self, minutes):
        return "ARRIVING" if minutes <= 1 else f"{minutes} MIN"

    def format_distance(self, meters):
        return f"{meters} m" if meters < 1000 else f"{meters / 1000:.1f} km"

    def fade_color(self, i, start_rgb, end_rgb, step=0, total_steps=20):
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
        now = datetime.now().strftime('%I:%M:%S %p')
        self.time_label.config(text=now)

        eta_data = self.get_eta_data()

        for i in range(2):
            if i < len(eta_data):
                trip_id = eta_data[i]['trip_id']

                if trip_id != self.current_trip_ids[i]:
                    new_color = random.choice(self.random_colors)
                    start_color = self.trip_colors[i] or "#000000"
                    self.current_trip_ids[i] = trip_id

                    start_rgb = hex_to_rgb(start_color)
                    end_rgb = hex_to_rgb(new_color)

                    self.fade_color(i, start_rgb, end_rgb)
                else:
                    new_color = self.trip_colors[i]

                self.rows[i]['trip_label'].config(text=trip_id)

                eta = eta_data[i]['eta']
                self.rows[i]['eta'].config(text=self.format_eta(eta))

                distance = eta_data[i]['distance']
                self.rows[i]['distance'].config(text=self.format_distance(distance))

                # Cambiar color del ETA si es muy cercano
                if eta <= 1:
                    self.rows[i]['eta'].config(fg='red')
                elif eta <= 5:
                    self.rows[i]['eta'].config(fg='orange')
                else:
                    self.rows[i]['eta'].config(fg='#FFFF00')
            else:
                self.rows[i]['trip_label'].config(text="", bg='black')
                self.rows[i]['trip_container'].config(bg='black')
                self.rows[i]['eta'].config(text="")
                self.rows[i]['distance'].config(text="")
                self.current_trip_ids[i] = None
                self.trip_colors[i] = None

        self.root.after(5000, self.update_loop)

    def run(self):
        self.root.mainloop()

if __name__ == "__main__":
    display = IntermediateStopDisplay()
    display.run()
