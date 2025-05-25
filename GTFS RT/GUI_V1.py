import tkinter as tk
from datetime import datetime
import random

def is_color_dark(hex_color):
    """Devuelve True si el color es oscuro, basado en luminancia"""
    hex_color = hex_color.lstrip('#')
    r, g, b = [int(hex_color[i:i+2], 16) for i in (0, 2, 4)]
    luminance = (0.299 * r + 0.587 * g + 0.114 * b)
    return luminance < 140  # Umbral típico para determinar si usar texto blanco o negro

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
            {'trip_id': 'TRIP_1201', 'eta': 5},
            {'trip_id': 'TRIP_1203', 'eta': 12},
            {'trip_id': 'TRIP_1210', 'eta': 25},
        ]

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
        tk.Label(header_frame, text="TRIP ID", font=self.trip_font, bg='black', fg='white', width=20, anchor='center', justify='center').grid(row=0, column=0, padx=20)
        tk.Label(header_frame, text="ETA", font=self.trip_font, bg='black', fg='white', width=10, anchor='center', justify='center').grid(row=0, column=1, padx=20)

        self.rows = []
        for _ in range(2):
            frame = tk.Frame(self.root, bg='black')
            frame.pack(pady=10)

            trip_container = tk.Frame(frame, bg='black', padx=10, pady=5)
            trip_container.grid(row=0, column=0, padx=20)
            trip_label = tk.Label(trip_container, text="", font=self.trip_font, bg='black', width=18, anchor='center', justify='center')
            trip_label.pack()

            eta_label = tk.Label(frame, text="", font=self.eta_font, bg='black', fg='#FFFF00', width=10, anchor='center', justify='center')
            eta_label.grid(row=0, column=1, padx=20)

            self.rows.append({'trip_label': trip_label, 'trip_container': trip_container, 'eta': eta_label})

    def get_eta_data(self):
        self.buses = sorted([b for b in self.buses if b['eta'] > 0], key=lambda x: x['eta'])[:2]
        for bus in self.buses:
            bus['eta'] -= random.choice([1, 0])
        return self.buses

    def format_eta(self, minutes):
        return "ARRIVING" if minutes <= 1 else f"{minutes} MIN"

    def update_loop(self):
        now = datetime.now().strftime('%I:%M:%S %p')
        self.time_label.config(text=now)

        eta_data = self.get_eta_data()

        for i in range(2):
            if i < len(eta_data):
                trip_id = eta_data[i]['trip_id']
                color = random.choice(self.random_colors)

                # Determinar color de texto en función del fondo
                text_color = 'white' if is_color_dark(color) else 'black'

                self.rows[i]['trip_label'].config(text=trip_id, bg=color, fg=text_color)
                self.rows[i]['trip_container'].config(bg=color)

                eta = eta_data[i]['eta']
                self.rows[i]['eta'].config(text=self.format_eta(eta))

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

        self.root.after(5000, self.update_loop)

    def run(self):
        self.root.mainloop()

if __name__ == "__main__":
    display = IntermediateStopDisplay()
    display.run()
