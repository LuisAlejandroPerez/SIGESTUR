# led.toggle() cambia el estado del LED de encendido a apagado,
#o de apagado a encendido. Dado que esto sucede en bucle,  
# el LED se encendera y apagara cada vez que se presione el boton.
from gpiozero import LED, Button
from time import sleep

led = LED(17)
button = Button(2)

while True:
    button.wait_for_press()
    led.toggle() 
    sleep(0.5)