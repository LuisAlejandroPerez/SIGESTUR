#include <SoftwareSerial.h>
#include "BotleticsSIM7000.h"
#define SIMCOM_7600

// Definición de pines
#define TX 7 // Rx del Micro
#define RX 8 // Tx del Micro

SoftwareSerial modemSS(TX, RX);
SoftwareSerial *modemSerial = &modemSS;
Botletics_modem_LTE modem;

// Firebase Config
const String FIREBASE_HOST = "sigestur-tx-default-rtdb.firebaseio.com";
const String FIREBASE_AUTH = "AIzaSyC7rGR0OTIRZ_QQc3RGZ1HB88FhqudyFV0";
const String OMSA_ID = "P01H";

// Variables globales para coordenadas GPS
float currentLatitude = 0.0;
float currentLongitude = 0.0;

void setup() {
    Serial.begin(9600);
    modemSS.begin(115200);
    delay(3000);
    Serial.println("Iniciando el módulo SIM7600 y Firebase...");
    
    Serial.println("Configurando a 9600 baudios...");
    modemSS.println("AT+IPR=9600");
    delay(100);
    modemSS.begin(9600);
    
    if (!modem.begin(modemSS)) {
        Serial.println("No se pudo encontrar el módem");
        while (1);
    }
    Serial.println("Módem inicializado correctamente");
    
    // Obtener IMEI del módem
    char imei[16] = {0};
    uint8_t imeiLen = modem.getIMEI(imei);
    if (imeiLen > 0) {
        Serial.print("IMEI del módulo: "); Serial.println(imei);
    }
    
    modem.setFunctionality(1);
    modem.setNetworkSettings(F("hologram"));
    
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
    Serial.println("Inicialización completada!");
}

void loop() {
    Serial.println("\nSolicitando ubicación del GPS...");
    String gpsResponse = sendATCommand("AT+CGPSINFO");
    
    if (gpsResponse.indexOf("+CGPSINFO:") != -1) {
        parseGPSData(gpsResponse);
        if (currentLatitude != 0.0 && currentLongitude != 0.0) {
            Serial.println("Coordenadas válidas encontradas:");
            Serial.print("Latitud: "); Serial.println(currentLatitude, 6);
            Serial.print("Longitud: "); Serial.println(currentLongitude, 6);
            postToFirebase(currentLatitude, currentLongitude);
        } else {
            Serial.println("No se encontraron coordenadas válidas. Esperando...");
        }
    } else {
        Serial.println("No se recibió información GPS.");
    }
    delay(10000);
}

String sendATCommand(String command) {
    Serial.print("Enviando comando AT: ");
    Serial.println(command);
    modemSS.println(command);
    delay(500);
    String response = "";
    while (modemSS.available()) {
        char c = modemSS.read();
        response += c;
    }
    Serial.print("Respuesta: ");
    Serial.println(response);
    return response;
}

void parseGPSData(String data) {
    int startIdx = data.indexOf(":") + 2;
    int firstComma = data.indexOf(",", startIdx);
    int secondComma = data.indexOf(",", firstComma + 1);
    int thirdComma = data.indexOf(",", secondComma + 1);
    int fourthComma = data.indexOf(",", thirdComma + 1);
    
    if (firstComma == -1 || secondComma == -1 || thirdComma == -1 || fourthComma == -1) {
        Serial.println("Error al analizar respuesta GPS.");
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
}

float convertToDecimal(String value, bool isLongitude) {
    if (value.length() < 4) return 0.0;
    int degreeDigits = isLongitude ? 3 : 2;
    float degrees = value.substring(0, degreeDigits).toFloat();
    float minutes = value.substring(degreeDigits).toFloat();
    return degrees + (minutes / 60);
}

void postToFirebase(float latitude, float longitude) {
    Serial.println("Enviando datos a Firebase...");
    String openCommand = "AT+CCHOPEN=0,\"" + FIREBASE_HOST + "\",443";
    sendATCommand(openCommand);
    String jsonData = "{\"latitude\":" + String(latitude, 6) + ",\"longitude\":" + String(longitude, 6) + ",\"timestamp\":" + String(millis()) + "}";
    String request = "PUT /gps_data/trip_ID/" + OMSA_ID + ".json?auth=" + FIREBASE_AUTH + " HTTP/1.1\r\n";
    request += "Host: " + FIREBASE_HOST + "\r\n";
    request += "Content-Type: application/json\r\n";
    request += "Content-Length: " + String(jsonData.length()) + "\r\n";
    request += "Connection: close\r\n\r\n";
    request += jsonData;
    String sendCommand = "AT+CCHSEND=0," + String(request.length());
    sendATCommand(sendCommand);
    modemSS.print(request);
    delay(5000);
    sendATCommand("AT+CCHCLOSE=0");
}
