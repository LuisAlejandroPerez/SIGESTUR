#include <SoftwareSerial.h>

SoftwareSerial mySerial(11, 10); // Pines RX, TX

// Configuración de Firebase
const String FIREBASE_HOST = "sigestur-tx-default-rtdb.firebaseio.com";
const String FIREBASE_AUTH = "AIzaSyC7rGR0OTIRZ_QQc3RGZ1HB88FhqudyFV0";
const String DEVICE_ID = "omsa_001";

void setup() {
  Serial.begin(9600);
  mySerial.begin(9600);
  delay(3000);

  Serial.println("Iniciando conexión con SIM7600...");

  // Prueba de conexión con el módulo
  sendATCommand("AT", "OK");

  // Habilitar SSL
  sendATCommand("AT+CCHSTART", "OK");
  delay(1000);
}

void loop() {
  float latitude = 19.4326;
  float longitude = -99.1332;
  
  postToFirebase(latitude, longitude);
  delay(30000);
}

void postToFirebase(float latitude, float longitude) {
  Serial.println("Enviando datos a Firebase...");

  // Abrir conexión SSL
  if (!sendATCommand("AT+CCHOPEN=0,\"" + FIREBASE_HOST + "\",443", "+CCHOPEN: 0,0")) {
    Serial.println("Error al abrir conexión SSL");
    return;
  }

  String jsonData = "{\"latitude\":" + String(latitude, 6) + 
                    ",\"longitude\":" + String(longitude, 6) + 
                    ",\"timestamp\":" + String(millis()) + "}";

  String request = "PUT /gps_data/omsas/" + DEVICE_ID + ".json?auth=" + FIREBASE_AUTH + " HTTP/1.1\r\n";
  request += "Host: " + FIREBASE_HOST + "\r\n";
  request += "Content-Type: application/json\r\n";
  request += "Content-Length: " + String(jsonData.length()) + "\r\n";
  request += "Connection: close\r\n\r\n";
  request += jsonData;

  // Enviar datos
  sendATCommand("AT+CCHSEND=0," + String(request.length()), ">");
  mySerial.print(request);
  delay(5000);

  // Cerrar conexión
  sendATCommand("AT+CCHCLOSE=0", "OK");
}

bool sendATCommand(String command, String expectedResponse) {
  Serial.println("Enviando: " + command);
  mySerial.println(command);
  delay(1000);
  
  String response = "";
  unsigned long timeout = millis() + 5000;
  
  while (millis() < timeout) {
    if (mySerial.available()) {
      char c = mySerial.read();
      response += c;
    }
    if (response.indexOf(expectedResponse) != -1) {
      Serial.println("Respuesta: " + response);
      return true;
    }
  }
  
  Serial.println("Error o sin respuesta esperada.");
  Serial.println("Esperado: " + expectedResponse);
  Serial.println("Recibido: " + response);
  return false;
}
