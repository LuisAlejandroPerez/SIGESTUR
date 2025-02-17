/*

Este bloque de codigo esta diseñado para inicializar y operar la funcion GPS del modulo SIM7600G-H.
Primero, configura la comunicacion serial para interactuar con el SIM7600G-H mediante comandos AT. Luego,
solicita y procesa los datos de ubicación (latitud y longitud) del SIM7600. Los datos recibidos se convierten
de su formato original (NMEA) a grados decimales y se muestran en el serial monitor, proporcionando la 
ubicacion geografica obtenida por el GPS.


Un GPS entrega sus datos a través de un protocolo llamado NMEA (National Marine Electronics Association). 
Por lo tanto la mayoría de receptores GPS pueden comunicarse unos con otros, mediante dicho protocolo. El estándar 
o formato NMEA 0183 es un lenguaje en electrónica. Se usa a nivel mundial en todos los dispositivos de navegación satelital.


Los GPS devuelven información a través de líneas o tramas de datos en código BINARIO o ASCII dependiendo del dispositivo.
Una trama de datos es una línea de código que contiene toda la información evaluada por el dispositivo de rastreo.
Incluye datos como: hora de actualización, coordenadas de posición (latitud, longitud), orientación, porcentaje de batería interna, entradas análogas, entre otros.
Además, las tramas de GPS contienen separadores reglamentarios (usualmente comas) y letras o símbolos de identificación.

Ejemplos:

$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47

$GPGSV, 2,1,08,01,40,083,46,02,17,308,41,12,07,344,39,14,22,228,45 * 75

NOTA
VER IMAGEN RAW_DATA.PNG para visualizar como se ve las cordenadas sin pasar por la funcion parseGPSData()

*/

#include <SoftwareSerial.h>

SoftwareSerial mySerial(11, 10);

void setup() {
  // En esta funcion se inicializa la comunicación serial a 9600 bps tanto en el puerto serial estándar como en mySerial. 
  // Luego, se envian varios comandos AT para configurar y encender el modulo GPS..

  Serial.begin(9600);
  mySerial.begin(9600);
  delay(3000);

  Serial.println("Iniciando el modulo GPS....");

  Serial.println("1. Probando la conectividad...");
  sendATCommand("AT");
  delay(1000);

  Serial.println("2. Activando modo GNSS...");
  sendATCommand("AT+CGNSSMODE=15,1");
  delay(1000);

  Serial.println("3. Configurando NMEA...");
  sendATCommand("AT+CGPSNMEA=200191");
  delay(1000);

  Serial.println("4. Encendiendo el GPS...");
  sendATCommand("AT+CGPS=1");
  delay(2000);

  Serial.println("Inicializacion del modulo GPS completada!");
}

void loop() {
  // se solicita constantemente la informacion de ubicacion al GPS cada 10 segundos
  Serial.println("\nSolicitando ubicacion del GPS...");
  sendATCommand("AT+CGPSINFO");
  delay(10000);
}

void sendATCommand(String command) {
  Serial.println("Enviando comando: " + command);
  mySerial.println(command);
  
  delay(500);  

  String response = readSerialResponse();  // Leer toda la respuesta

  Serial.println("Respuesta:");
  Serial.println(response);
  Serial.println("------------------------");

  if (response.indexOf("+CGPSINFO:") != -1) { // Si la respuesta contiene informacion del GPS, se llama a parseGPSData() para analizar los datos
    parseGPSData(response);
  }
}

// funcion para leer toda la respuesta del modulo
String readSerialResponse() {
  String response = "";
  long timeout = millis() + 2000;  // Tiempo máximo de espera 

  while (millis() < timeout) {
    while (mySerial.available()) {
      char c = mySerial.read();
      response += c;
    }
  }

  return response;
}

// Esta funcion convierte las coordenadas GPS del formato DDMM.MMMMM a grados decimales
float convertToDecimal(String value, bool isLongitude) {
  if (value.length() < 4) return 0.0;  // Manejo de errores si el dato es invalido

  int degreeDigits = isLongitude ? 3 : 2;  // 3 digitos para longitud, 2 para latitud

  float degrees = value.substring(0, degreeDigits).toFloat();
  float minutes = value.substring(degreeDigits).toFloat();
  return degrees + (minutes / 60);
}

// Funcion para extraer latitud y longitud
void parseGPSData(String data) {
  int startIdx = data.indexOf(":") + 2;  // Encuentra el inicio de los datos
  int firstComma = data.indexOf(",", startIdx);
  int secondComma = data.indexOf(",", firstComma + 1);
  int thirdComma = data.indexOf(",", secondComma + 1);
  int fourthComma = data.indexOf(",", thirdComma + 1);

  if (firstComma == -1 || secondComma == -1 || thirdComma == -1 || fourthComma == -1) {
    Serial.println("Error: No se pudo analizar la respuesta del GPS.");
    return;
  }

  String latRaw = data.substring(startIdx, firstComma);
  String latDir = data.substring(firstComma + 1, secondComma);
  String lonRaw = data.substring(secondComma + 1, thirdComma);
  String lonDir = data.substring(thirdComma + 1, fourthComma);

  float latitude = convertToDecimal(latRaw, false);  // Latitud tiene 2 dígitos en grados
  float longitude = convertToDecimal(lonRaw, true);  // Longitud tiene 3 dígitos en grados

  if (latDir == "S") latitude *= -1;  // Sur es negativo
  if (lonDir == "W") longitude *= -1; // Oeste es negativo

  Serial.print("Latitud: ");
  Serial.println(latitude, 6);
  Serial.print("Longitud: ");
  Serial.println(longitude, 6);
}