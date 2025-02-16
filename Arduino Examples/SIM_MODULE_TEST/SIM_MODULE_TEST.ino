/*
 Este codigo sirve para probar las funcionalidades  del SIM7600X-H en el Arduino Uno. 
 Se probara funciones basicas de comandos AT como lo son; visualizar CCID de la SIM CARD, 
 obtener informacion y estatus de la red y hacer un GET de HTTP. El esquematico de la conexion 
 la pueden visualizar en la imagen: Rx_schematic.png . Estps comandos se realizarian a traves del
 serial monitor.

*/

// Definicion de librerias & Modulo a utilizar

#include "BotleticsSIM7000.h" // https://github.com/botletics/Botletics-SIM7000/tree/main/src
#include <SoftwareSerial.h>
#define SIMCOM_7600

// Definicion de pines 

#define TX 11 // Rx del Micro
#define RX 10 // Tx del Micro

// buffer para respuestas
char replybuffer[255];

SoftwareSerial modemSS = SoftwareSerial(TX, RX);
SoftwareSerial *modemSerial = &modemSS;

Botletics_modem_LTE modem = Botletics_modem_LTE();

uint8_t readline(char *buff, uint8_t maxbuff, uint16_t timeout = 0);
uint8_t type;
char imei[16] = {0}; // Buffer de 16 caracteres para el IMEI

void setup() {

Serial.begin(9600); // Para utilizar el serial monitor de Arduino necesitamos establecer un bound rate de 9600
Serial.println(F("SIM7XXX Demo"));

// Software serial:
modemSS.begin(115200); // defaul baud rate para el SIM7600

Serial.println(F("Configuring to 9600 baud"));
modemSS.println("AT+IPR=9600"); 
delay(100); 
modemSS.begin(9600);
if (! modem.begin(modemSS)) 
{
  Serial.println(F("Couldn't find modem"));
  while (1); // No continuar si no pudo encontrar el modem
}

type = modem.type();
  Serial.println(F("Modem is OK"));
  Serial.print(F("Found "));
  switch (type) {
    case SIM7000:
      Serial.println(F("SIM7000")); break;
    case SIM7070:
      Serial.println(F("SIM7070")); break;
    case SIM7500:
      Serial.println(F("SIM7500")); break;
    case SIM7600:
      Serial.println(F("SIM7600")); break;
    default:
      Serial.println(F("???")); break;
  }

// Imprimir el IMEI
uint8_t imeiLen = modem.getIMEI(imei);
if (imeiLen > 0) 
{
  Serial.print("Module IMEI: "); Serial.println(imei);
}

// Configurar el modem para que funcione completamente
modem.setFunctionality(1); // AT+CFUN=1
modem.setNetworkSettings(F("hologram")); // configuraicon de APN

printMenu();

}


void printMenu(void) 
{

Serial.println(F("-------------------------------------"));
Serial.println(F("[?] Print this menu"));
Serial.println(F("[C] Read the SIM CCID"));
Serial.println(F("[i] Read signal strength (RSSI)"));
Serial.println(F("[n] Get network status"));
  
// Tiempo
Serial.println(F("[y] Enable local time stamp"));
Serial.println(F("[Y] Enable NTP time sync")); // Uitlizar primero comando G
Serial.println(F("[t] Get network time")); 

// Conexion de datos
Serial.println(F("[G] Enable GPRS"));
Serial.println(F("[g] Disable GPRS"));

Serial.println(F("[1] Get connection info")); // tipo de conexion
  
// GPS
Serial.println(F("[O] Turn GPS on)"));
Serial.println(F("[o] Turn GPS off"));
Serial.println(F("[L] Query GPS location")); 

}


void loop() 
{

Serial.print(F("modem> "));

while (! Serial.available()) 
{
  if (modem.available()) 
  {
    Serial.write(modem.read());
  }
}

char command = Serial.read();
Serial.println(command);


switch (command) {
  case '?': 
  {
    printMenu();
    break;
  }

  // Leer el CCID
  case 'C': 
  {
    modem.getSIMCCID(replybuffer);  // make sure replybuffer is at least 21 bytes!
    Serial.print(F("SIM CCID = ")); Serial.println(replybuffer);
    break;
  }

  // Leer el RSSI
  case 'i': 
  {   
    uint8_t n = modem.getRSSI();
    int8_t r;

    Serial.print(F("RSSI = ")); Serial.print(n); Serial.print(": ");
    if (n == 0) r = -115;
    if (n == 1) r = -111;
    if (n == 31) r = -52;
    if ((n >= 2) && (n <= 30)) 
    {
      r = map(n, 2, 30, -110, -54);
    }
    Serial.print(r); Serial.println(F(" dBm"));
    break;
  }

  // Estado de la red celular
  case 'n': 
  {  
    uint8_t n = modem.getNetworkStatus();
    Serial.print(F("Network status "));
    Serial.print(n);
    Serial.print(F(": "));
    if (n == 0) Serial.println(F("Not registered"));
    if (n == 1) Serial.println(F("Registered (home)"));
    if (n == 2) Serial.println(F("Not registered (searching)"));
    if (n == 3) Serial.println(F("Denied"));
    if (n == 4) Serial.println(F("Unknown"));
    if (n == 5) Serial.println(F("Registered roaming"));
    break;
  }
    
 /*** Tiempo ***/
  //habilitar la sincronización horaria de la red
  case 'y': 
  {
    if (!modem.enableRTC(true))
      Serial.println(F("Failed to enable"));
    break;
  }

  // Habilitar sincronización horaria NTP
  case 'Y': 
  {
    if (!modem.enableNTPTimeSync(true, F("pool.ntp.org")))
      Serial.println(F("Failed to enable"));
    break;
  }

  case 't': 
  {
    char buffer[23];
    modem.getTime(buffer, 23);  // make sure replybuffer is at least 23 bytes!
    Serial.print(F("Time = ")); Serial.println(buffer);
    break;
  }

  /******* GPS *******/
  // Desactivar el GPS
  case 'o': 
  {      
    if (!modem.enableGPS(false))
      Serial.println(F("Failed to turn off"));
    break;
  }

  // Encender el GPS
  case 'O': 
  {
    if (!modem.enableGPS(true))
      Serial.println(F("Failed to turn on"));
    break;
  }

  case 'L': 
  {
    float latitude, longitude, speed_kph, heading, altitude;
    if (modem.getGPS(&latitude, &longitude, &speed_kph, &heading, &altitude)) 
    { 
      Serial.println(F("---------------------"));
      Serial.print(F("Latitude: ")); Serial.println(latitude, 6);
      Serial.print(F("Longitude: ")); Serial.println(longitude, 6);
      Serial.println(F("---------------------"));
    }
    break;
  }

  /******* GPRS *******/
  // Deshabilitar datos
  case 'g': 
  {
    if (!modem.enableGPRS(false))
      Serial.println(F("Failed to turn off"));
    break;
  }

  case 'G': 
  {      
    #if defined(SIMCOM_7500) || defined (SIMCOM_7600)
      modem.enableGPRS(false);
    #endif
  // habilitar datos
  if (!modem.enableGPRS(true))
    Serial.println(F("Failed to turn on"));
  break;    
  }

  // Obtenga el tipo de conexión, banda celular, nombre del operador, etc.
  case '1': 
  {
    modem.getNetworkInfo();        
    break;
  }

  default: 
  {
    Serial.println(F("Unknown command"));
    printMenu();
    break;
      
  }
}
  // flush input
  flushSerial();
  while (modem.available()) {
    Serial.write(modem.read());
  }

}

void flushSerial() {
  while (Serial.available())
    Serial.read();
}


uint8_t readline(char *buff, uint8_t maxbuff, uint16_t timeout) {
  uint16_t buffidx = 0;
  boolean timeoutvalid = true;
  if (timeout == 0) timeoutvalid = false;

  while (true) {
    if (buffidx > maxbuff) {
      //Serial.println(F("SPACE"));
      break;
    }

    while (Serial.available()) {
      char c =  Serial.read();

      //Serial.print(c, HEX); Serial.print("#"); Serial.println(c);

      if (c == '\r') continue;
      if (c == 0xA) {
        if (buffidx == 0)   // the first 0x0A is ignored
          continue;

        timeout = 0;         // the second 0x0A is the end of the line
        timeoutvalid = true;
        break;
      }
      buff[buffidx] = c;
      buffidx++;
    }

    if (timeoutvalid && timeout == 0) {
      //Serial.println(F("TIMEOUT"));
      break;
    }
    delay(1);
  }
  buff[buffidx] = 0;  // null term
  return buffidx;
}
