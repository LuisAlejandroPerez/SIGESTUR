/*
Este codigo básicamente actua como un puente entre el puerto serial del Arduino y el puerto serial del SIM7600,
permitiendo asi la comunicacion entre dos dispositivos seriales. En este caso emplearemos el serial monitors de Arduino IDE
para enviar comando AT al SIM7600G-H. A continuacion una lista de comandos basicos a probar:

AT COMAND     |  Descripcion
--------------|---------------------------------------------------------------------------------------------------------
AT+CGMM       |  Request the modem hardware version
AT+CIMI       |  Request the IMSI (International Mobile Subscriber Identity)
AT+CCID       |  Request the ICCID (Integrated Circuit Card ID), which is the identification number of the SIM card
AT+COPS?         Check the network and cellular technology the modem is currently using.
                 Expected response: +COPS: 0,0,"<name of operator>",X. The last digit indicates the cellular technology:
                 0 indicates GSM
                 1 indicates GSM Compact
                 2 indicates UTRAN
                 7 indicates EUTRAN (LTE)
                 8 indicates CDMA/HDR
                 Expected response: +COPS: 0,0,"<name of operator>",X. The last digit indicates the cellular technology.
------------------------------------------------------------------------------------------------------------------------

La libreria que vamos a utilizar es SoftwareSerial.h. La biblioteca SoftwareSerial permite la comunicación serial en otros 
pines digitales de una placa Arduino, utilizando software para replicar la funcionalidad (de ahí el nombre "SoftwareSerial"). 
Es posible tener múltiples puertos seriales de software con velocidades de hasta 115200 bps.
*/

#include <SoftwareSerial.h>

SoftwareSerial mySerial(7,8); // definiendo pines 11 (RX) y 10 (TX) para la comunicacion serial

void setup() {
  Serial.begin(9600); // Inicio de comunicacion en los pines 0 y 1 a una velocidad de 9600 baudios
  while (!Serial){
    ; //Espera a que el puerto serial este listo para usar
  }

  mySerial.begin(9600); // Inicia la comunicación serial del objeto mySerial
}

void loop() {
  if(mySerial.available()) // Comprueba si hay datos disponibles para leer en el puerto 11 y 10
  {
    Serial.write(mySerial.read()); // Lee los datos del puerto serial 11 y 10 y los envía al puerto serial hardware
  }

  if(Serial.available()) // Comprueba si hay datos disponibles para leer en el puerto serial hardware.
  {
    mySerial.write(Serial.read());
  }

}
