#!/usr/bin/python3
import RPi.GPIO as GPIO
import serial
import time


# AT+CPIN? esto verifica si la  SIM esta lista (deberia devolver "READY")
# AT+CSQ esto muestra la intensidad de la señal (0-31, cuanto mas alto de ahi mejor)
# AT+CREG? esto verifica el estado de registro de la red
# AT+COPS? esto muestra el operador de red actual
# AT+CPSI? esto muestra información detallada de la red, incluido el estado de LTE
# AT+CGREG? esto verifica el estado de registro de GPRS/LTE


# Serial port configuration
ser = serial.Serial("/dev/ttyUSB2", 115200, timeout=1)
POWER_KEY = 6

def power_on():
    print('Starting SIM7600X...')
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)
    GPIO.setup(POWER_KEY, GPIO.OUT)
    
    GPIO.output(POWER_KEY, GPIO.HIGH)
    time.sleep(2)
    GPIO.output(POWER_KEY, GPIO.LOW)
    time.sleep(20)
    print('SIM7600X is ready')

try:
    power_on()
    
    while True:
        # Get and send AT command
        command = input('Enter AT command: ')
        ser.write(f"{command}\r\n".encode())
        time.sleep(0.1)
        
        # Read response
        if ser.in_waiting:
            response = ser.read(ser.in_waiting)
            print(response.decode())

except KeyboardInterrupt:
    print("\nExiting program")
    
finally:
    ser.close()
    GPIO.output(POWER_KEY, GPIO.HIGH)
    time.sleep(3)
    GPIO.output(POWER_KEY, GPIO.LOW)
    GPIO.cleanup()
    print('Goodbye!')