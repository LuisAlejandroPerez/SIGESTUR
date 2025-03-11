#include <SoftwareSerial.h>

SoftwareSerial mySerial(11, 10);

// DB Config
const String FIREBASE_HOST = "sigestur-tx-default-rtdb.firebaseio.com";
const String FIREBASE_AUTH = "AIzaSyC7rGR0OTIRZ_QQc3RGZ1HB88FhqudyFV0";
const String OMSA_ID = "omsa_001";

void setup() {
  Serial.begin(9600);
  mySerial.begin(9600);
  delay(3000);

  Serial.println("Iniciando Modulo SIM7600...");

  // Test de conectividad
  sendATCommand("AT", "OK");
  
  // Habilitacion del GPS
  sendATCommand("AT+CGNSSMODE=15,1", "OK");
  sendATCommand("AT+CGPSNMEA=200191", "OK");
  sendATCommand("AT+CGPS=1", "OK");

  // Habilitar SSL
  sendATCommand("AT+CCHSTART", "OK");
  
  Serial.println("Inicializacion completada!");
}

void loop() {
  // Resquest de la ubbicacion del GPS
  Serial.println("\nSolicitando ubicacion del GPS...");
  String gpsResponse = getGPSData();
  
  if (gpsResponse != "") {
    float latitude, longitude;
    if (parseGPSData(gpsResponse, &latitude, &longitude)) {
      postToFirebase(latitude, longitude);
    }
  }
  
  delay(30000); // Esperar 30 segundos antes del proximo update 
}

String getGPSData() {
  if (sendATCommand("AT+CGPSINFO", "+CGPSINFO:")) {
    return lastResponse;
  }
  return "";
}

void postToFirebase(float latitude, float longitude) {
  Serial.println("Enviando datos a Firebase...");

  if (!sendATCommand("AT+CCHOPEN=0,\"" + FIREBASE_HOST + "\",443", "+CCHOPEN: 0,0")) {
    Serial.println("Error al establecer conexion con el servidor SSL");
    return;
  }

  String jsonData = "{\"latitude\":" + String(latitude, 6) +
                    ",\"longitude\":" + String(longitude, 6) +
                    ",\"timestamp\":" + String(millis()) + "}";

  String request = "PUT /gps_data/omsas/" + OMSA_ID + ".json?auth=" + FIREBASE_AUTH + " HTTP/1.1\r\n";
  request += "Host: " + FIREBASE_HOST + "\r\n";
  request += "Content-Type: application/json\r\n";
  request += "Content-Length: " + String(jsonData.length()) + "\r\n";
  request += "Connection: close\r\n\r\n";
  request += jsonData;

  sendATCommand("AT+CCHSEND=0," + String(request.length()), ">");
  mySerial.print(request);
  delay(5000);

  sendATCommand("AT+CCHCLOSE=0", "OK");
}

String lastResponse = "";

bool sendATCommand(String command, String expectedResponse) {
  Serial.println("Enviando: " + command);
  mySerial.println(command);
  delay(1000);

  lastResponse = "";
  unsigned long timeout = millis() + 5000;

  while (millis() < timeout) {
    if (mySerial.available()) {
      char c = mySerial.read();
      lastResponse += c;
    }
    if (lastResponse.indexOf(expectedResponse) != -1) {
      Serial.println("Respuesta: " + lastResponse);
      return true;
    }
  }

  Serial.println("Error o sin respuesta esperada.");
  Serial.println("Esperado: " + expectedResponse);
  Serial.println("Recibido: " + lastResponse);
  return false;
}

float convertToDecimal(String value, bool isLongitude) {
  if (value.length() < 4) return 0.0;

  int degreeDigits = isLongitude ? 3 : 2;
  float degrees = value.substring(0, degreeDigits).toFloat();
  float minutes = value.substring(degreeDigits).toFloat();
  return degrees + (minutes / 60);
}

bool parseGPSData(String data, float* latitude, float* longitude) {
  int startIdx = data.indexOf(":") + 2;
  int firstComma = data.indexOf(",", startIdx);
  int secondComma = data.indexOf(",", firstComma + 1);
  int thirdComma = data.indexOf(",", secondComma + 1);
  int fourthComma = data.indexOf(",", thirdComma + 1);

  if (firstComma == -1 || secondComma == -1 || thirdComma == -1 || fourthComma == -1) {
    Serial.println("Error: No se pudo analizar la respuesta del GPS.");
    return false;
  }

  String latRaw = data.substring(startIdx, firstComma);
  String latDir = data.substring(firstComma + 1, secondComma);
  String lonRaw = data.substring(secondComma + 1, thirdComma);
  String lonDir = data.substring(thirdComma + 1, fourthComma);

  *latitude = convertToDecimal(latRaw, false);
  *longitude = convertToDecimal(lonRaw, true);

  if (latDir == "S") *latitude *= -1;
  if (lonDir == "W") *longitude *= -1;

  Serial.print("Latitud: ");
  Serial.println(*latitude, 6);
  Serial.print("Longitud: ");
  Serial.println(*longitude, 6);
  
  return true;
}