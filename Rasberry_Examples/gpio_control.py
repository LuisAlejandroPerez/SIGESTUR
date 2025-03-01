from gpiozero import LED, Button
from time import sleep

led = LED(17) # positivo para el LED en GPIO 17 (PIN 6 fisico)
button = Button(2) # positivo para el boton en el GPIO 2

button.wait_for_press() # Espera a que se presione el boton
print('You touch me')
led.on() # Si se presiono el boton el LED va encender
sleep(3) # Esperar 3 segundos
led.off()