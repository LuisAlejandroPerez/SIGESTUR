from gpiozero import LED
import time

led = LED(17)

for _ in range(5):
    led.on()
    time.sleep(1) # Esperar un segundo
    led.off()
    time.sleep(1)