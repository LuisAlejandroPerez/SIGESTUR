#!/usr/bin/env python3
"""
OMSA ETA Display System
Main script that coordinates backend data processing and frontend GUI display
"""

from backend import BusETABackend
from frontend import BusDisplayGUI, TouchHandler

def main():
    """Main function to run the integrated bus display system"""
    try:
        # Initialize backend
        print("Initializing backend...")
        backend = BusETABackend()
        
        # Start backend data collection
        print("Starting backend data collection...")
        backend.start_backend()
        
        # Initialize and run frontend
        print("Starting GUI...")
        display = BusDisplayGUI(backend)
        
        # Add touch handling for LCD touch screen
        touch_handler = TouchHandler(display)
        
        # Run the application
        print("Application running...")
        display.run()
        
    except KeyboardInterrupt:
        print("Application interrupted by user")
    except Exception as e:
        print(f"Application error: {e}")
    finally:
        # Cleanup
        if 'backend' in locals():
            backend.stop_backend()
        print("Application closed")

if __name__ == "__main__":
    main()
