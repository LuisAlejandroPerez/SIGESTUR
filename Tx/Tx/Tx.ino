#include <SoftwareSerial.h>

SoftwareSerial mySerial(7, 8);

// Pines del switch y LEDs
const int switchPin = 2;
const int ledGreen = 3;
const int ledRed = 4;

// Firebase Config
const String FIREBASE_HOST = "sigestur-tx-default-rtdb.firebaseio.com";
const String FIREBASE_AUTH = "AIzaSyC7rGR0OTIRZ_QQc3RGZ1HB88FhqudyFV0";
const String OMSA_ID = "C19M"; // Cambiar segun la OMSA

// Variables globales
float currentLatitude = 0.0;
float currentLongitude = 0.0;

void setup() {
  Serial.begin(9600);
  mySerial.begin(115200);
  delay(1000);

  Serial.println("Estableciendo baud rate a 9600...");
  mySerial.println("AT+IPR=9600");
  delay(1000);

  mySerial.end();
  mySerial.begin(9600);
  delay(1000);

  Serial.println("Iniciando el modulo GPS y Firebase...");

  // Configuracion de pines digitales
  pinMode(switchPin, INPUT_PULLUP); // Switch conectado a tierra
  pinMode(ledGreen, OUTPUT);
  pinMode(ledRed, OUTPUT);

  // Inicializar GPS y canal
  sendATCommand("AT");
  sendATCommand("AT+CGNSSMODE=15,1");
  sendATCommand("AT+CGPSNMEA=200191");
  sendATCommand("AT+CGPS=1");
  sendATCommand("AT+CCHSTART");

  Serial.println("Inicializacion completada!!!");
}

void loop() {
  bool switchPressed = isSwitchPressed(); //debounce Call

  if (switchPressed) {
    // Emergencia: enviar coordenadas 0.0
    currentLatitude = 0.0;
    currentLongitude = 0.0;
    digitalWrite(ledRed, HIGH);
    digitalWrite(ledGreen, LOW);
  } else {
    digitalWrite(ledRed, LOW);
    digitalWrite(ledGreen, HIGH);
    Serial.println("\nSolicitando ubicacion del GPS...");
    sendATCommand("AT+CGPSINFO");
  }

  if (currentLatitude != 0.0 || currentLongitude != 0.0 || switchPressed) {
    postToFirebase(currentLatitude, currentLongitude);
  }

  delay(15000); // Esperar 15 segundos
}

/*Esta funcion utiliza la tecnica de Debouncing. La cual es una técnica que se utiliza para filtrar 
o retrasar la ejecución de una función cuando se recibe una serie de eventos o llamadas secuenciales
en un corto período de tiempo.*/

bool isSwitchPressed() {
  delay(50); // debounce
  return digitalRead(switchPin) == LOW;
}

void postToFirebase(float latitude, float longitude) {
  Serial.println("Enviando datos a Firebase...");

  String openCommand = "AT+CCHOPEN=0,\"" + FIREBASE_HOST + "\",443";
  sendATCommand(openCommand);

  String jsonData = "{\"latitude\":" + String(latitude, 6) +
                    ",\"longitude\":" + String(longitude, 6) +
                    ",\"timestamp\":" + String(millis()) + "}";

  String request = "PATCH /gps_data/trip_ID/" + OMSA_ID + ".json?auth=" + FIREBASE_AUTH + " HTTP/1.1\r\n";
  request += "Host: " + FIREBASE_HOST + "\r\n";
  request += "Content-Type: application/json\r\n";
  request += "Content-Length: " + String(jsonData.length()) + "\r\n";
  request += "Connection: close\r\n\r\n";
  request += jsonData;

  sendATCommand("AT+CCHSEND=0," + String(request.length()));
  mySerial.print(request);
  delay(5000);

  sendATCommand("AT+CCHCLOSE=0");
}

void sendATCommand(String command) {
  Serial.println("Enviando comando: " + command);
  mySerial.println(command);
  delay(500);

  String response = readSerialResponse();
  Serial.println("Respuesta:");
  Serial.println(response);
  Serial.println("------------------------");

  if (response.indexOf("+CGPSINFO:") != -1) {
    parseGPSData(response);
  }
}

String readSerialResponse() {
  String response = "";
  long timeout = millis() + 2000;

  while (millis() < timeout) {
    while (mySerial.available()) {
      char c = mySerial.read();
      response += c;
    }
  }
  return response;
}

float convertToDecimal(String value, bool isLongitude) {
  if (value.length() < 4) return 0.0;

  int degreeDigits = isLongitude ? 3 : 2;
  float degrees = value.substring(0, degreeDigits).toFloat();
  float minutes = value.substring(degreeDigits).toFloat();
  return degrees + (minutes / 60);
}

void parseGPSData(String data) {
  int startIdx = data.indexOf(":") + 2;
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

  float latitude = convertToDecimal(latRaw, false);
  float longitude = convertToDecimal(lonRaw, true);

  if (latDir == "S") latitude *= -1;
  if (lonDir == "W") longitude *= -1;

  currentLatitude = latitude;
  currentLongitude = longitude;

  Serial.print("Latitud: ");
  Serial.println(latitude, 6);
  Serial.print("Longitud: ");
  Serial.println(longitude, 6);
}
