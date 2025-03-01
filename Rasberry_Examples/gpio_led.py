from gpiozero import LED
from time import sleep

led = LED(17)
i = 0

while True:
    led.on()
    sleep(1)
    led.off()
    sleep(1)
    i += 1
    if i <= 1:
        res = f"Se encendio el LED {i} vez"
        print(res)
    else:
        res = f"Se encendio el LED {i} veces"
        print(res)