#include <SoftwareSerial.h>
#include "BotleticsSIM7000.h" // https://github.com/botletics/Botletics-SIM7000/tree/main/src

// Define pins
#define TX 7 // Rx of the microcontroller
#define RX 8 // Tx of the microcontroller

SoftwareSerial mySerial(TX, RX);
SoftwareSerial *modemSerial = &mySerial;

Botletics_modem_LTE modem = Botletics_modem_LTE();

// Firebase Config
const String FIREBASE_HOST = "sigestur-tx-default-rtdb.firebaseio.com";
const String FIREBASE_AUTH = "AIzaSyC7rGR0OTIRZ_QQc3RGZ1HB88FhqudyFV0";
const String OMSA_ID = "P01H";

// Global variables for GPS coordinates
float currentLatitude = 0.0;
float currentLongitude = 0.0;

// Buffer for responses
char replybuffer[255];
uint8_t type;
char imei[16] = {0}; // 16 character buffer for IMEI

void setup()
{
  Serial.begin(9600);
  Serial.println(F("SIM7600 GPS and Firebase Module"));
  
  // Initialize SIM7600 module with proper sequence
  mySerial.begin(115200); // Default baud rate for SIM7600
  
  Serial.println(F("Configuring to 9600 baud"));
  mySerial.println("AT+IPR=9600");
  delay(100);
  mySerial.begin(9600);
  
  if (!modem.begin(mySerial)) {
    Serial.println(F("Couldn't find modem"));
    while (1); // Don't continue if modem not found
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
  
  // Print IMEI
  uint8_t imeiLen = modem.getIMEI(imei);
  if (imeiLen > 0) {
    Serial.print("Module IMEI: "); Serial.println(imei);
  }
  
  // Configure modem to function fully
  modem.setFunctionality(1); // AT+CFUN=1
  modem.setNetworkSettings(F("hologram")); // APN configuration
  
  Serial.println("Iniciando el modulo GPS y Firebase...");
  
  // Initialize GPS
  sendATCommand("AT");
  sendATCommand("AT+CGNSSMODE=15,1");
  sendATCommand("AT+CGPSNMEA=200191");
  
  // Enable GPS
  if (!modem.enableGPS(true)) {
    Serial.println(F("Failed to turn on GPS"));
  } else {
    Serial.println(F("GPS turned on successfully"));
  }
  
  // Enable GPRS
  if (!modem.enableGPRS(true)) {
    Serial.println(F("Failed to enable GPRS"));
  } else {
    Serial.println(F("GPRS enabled successfully"));
  }
  
  // Initialize SSL for Firebase
  sendATCommand("AT+CCHSTART");
  
  Serial.println("Inicializacion completada!");
}

void loop()
{
  // Get GPS location
  Serial.println("\nSolicitando ubicacion del GPS...");
  sendATCommand("AT+CGPSINFO");
  
  // If we have valid coordinates, post to Firebase
  if (currentLatitude != 0.0 && currentLongitude != 0.0) {
    postToFirebase(currentLatitude, currentLongitude);
  }
  
  delay(15000); // Wait 15 seconds before next update
}

void postToFirebase(float latitude, float longitude)
{
  Serial.println("Enviando datos a Firebase...");
  
  String openCommand = "AT+CCHOPEN=0,\"" + FIREBASE_HOST + "\",443";
  sendATCommand(openCommand);
  
  String jsonData = "{\"latitude\":" + String(latitude, 6) +
                    ",\"longitude\":" + String(longitude, 6) +
                    ",\"timestamp\":" + String(millis()) + "}";
  
  String request = "PUT /gps_data/trip_ID/" + OMSA_ID + ".json?auth=" + FIREBASE_AUTH + " HTTP/1.1\r\n";
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

void sendATCommand(String command)
{
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

String readSerialResponse()
{
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

float convertToDecimal(String value, bool isLongitude)
{
  if (value.length() < 4)
    return 0.0;
  
  int degreeDigits = isLongitude ? 3 : 2;
  float degrees = value.substring(0, degreeDigits).toFloat();
  float minutes = value.substring(degreeDigits).toFloat();
  return degrees + (minutes / 60);
}

void parseGPSData(String data)
{
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
  
  if (latDir == "S")
    latitude *= -1;
  if (lonDir == "W")
    longitude *= -1;
  
  // Update global coordinates
  currentLatitude = latitude;
  currentLongitude = longitude;
  
  Serial.print("Latitud: ");
  Serial.println(latitude, 6);
  Serial.print("Longitud: ");
  Serial.println(longitude, 6);
}
