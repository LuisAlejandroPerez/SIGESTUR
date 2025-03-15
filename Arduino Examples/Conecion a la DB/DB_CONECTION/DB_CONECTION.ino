/*
Este codigo de ejemplo es para establecer comunicacion con mi base de datos de Fire Base. Logrando un PUT & POST de manera satisfactoria. 
El primer aproach que se hizo fue utilizando los comandos AT para HTTP pero el modulo SIM 7600 no cuenta con metodo PUT en HTTP por lo que 
cada vez que se hacia un POST se creaba un subnodo nuevo dentro del OMSA_ID y por consiguiente se descarto esta idea. Luego se trato de utilizar
el motodo TCP IP pero el mismo no soporta HTTPS lo cual utiliza firebase no va se posible. El ultimo aproach que se me ocurrio es utilizar SSL.
Y es el comando AT que utilice para postear o actualizar la data en la base de datos. 

NOTA: VER IMAGEN SSL_AT_COMAND.PNG PARA VER LOS COMANDOS SSL
*/

#include <SoftwareSerial.h>

SoftwareSerial mySerial(7, 8); 

// Config de la DB
const String FIREBASE_HOST = "sigestur-tx-default-rtdb.firebaseio.com"; //URL de la base de datos
const String FIREBASE_AUTH = "AIzaSyC7rGR0OTIRZ_QQc3RGZ1HB88FhqudyFV0"; // API KEY
const String OMSA_ID = "C19M";

void setup() {
  Serial.begin(9600);
  mySerial.begin(9600);
  delay(3000);

  Serial.println("Iniciando modulo SIM7600...");
  delay(3000);

  sendATCommand("AT", "OK");

  // Habilitar SSL
  sendATCommand("AT+CCHSTART", "OK");
  delay(1000);
}

void loop() {
  float latitude = 19.4326; // Data hardcodeada 
  float longitude = -99.1332; // Data hardcodeada 
  
  postToFirebase(latitude, longitude);
  delay(30000); // Esperar 30s para postear DATA nuevamente
}

void postToFirebase(float latitude, float longitude) {
  Serial.println("Enviando datos a Firebase...");

  // Abrir conexion al servidor SSL
  if (!sendATCommand("AT+CCHOPEN=0,\"" + FIREBASE_HOST + "\",443", "+CCHOPEN: 0,0")) {
    Serial.println("Error al establecer conexion con el servidor SSL");
    return;
  }

  String jsonData = "{\"latitude\":" + String(latitude, 6) + 
                    ",\"longitude\":" + String(longitude, 6) + 
                    ",\"timestamp\":" + String(millis()) + "}";

  String request = "PUT /gps_data/trip_ID/" + OMSA_ID + ".json?auth=" + FIREBASE_AUTH + " HTTP/1.1\r\n";
  request += "Host: " + FIREBASE_HOST + "\r\n";
  request += "Content-Type: application/json\r\n";
  request += "Content-Length: " + String(jsonData.length()) + "\r\n";
  request += "Connection: close\r\n\r\n";
  request += jsonData;

  // Enviar datos
  sendATCommand("AT+CCHSEND=0," + String(request.length()), ">");
  mySerial.print(request);
  delay(5000);

  // Cerrar la sesion con el servidor en la instancia 0
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
