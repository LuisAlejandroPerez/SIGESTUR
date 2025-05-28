import queue
import threading
from backend import BackendWorker
from frontend import TerminalBusDisplay, TouchHandler

def main():
    try:
        # Create a queue for communication between backend and frontend
        bus_data_queue = queue.Queue(maxsize=10)
        
        # Initialize backend worker
        backend_worker = BackendWorker(bus_data_queue)
        
        # Initialize frontend display
        display = TerminalBusDisplay(bus_data_queue)
        
        # Add touch handling for the LCD touch screen
        touch_handler = TouchHandler(display)
        
        # Start backend worker
        backend_worker.start()
        
        # Setup cleanup on window close
        def on_closing():
            backend_worker.stop()
            display.root.destroy()
        
        display.root.protocol("WM_DELETE_WINDOW", on_closing)
        
        # Run the application (this blocks until the window is closed)
        display.run()
        
        # Cleanup
        backend_worker.stop()
        
    except KeyboardInterrupt:
        print("Application interrupted by user")
    except Exception as e:
        print(f"Application error: {e}")

if __name__ == "__main__":
    main()
