#include <SoftwareSerial.h>

SoftwareSerial mySerial(11, 10);
float currentLatitude = 0.0;
float currentLongitude = 0.0;
bool hasValidGPS = false;

void setup() {
  Serial.begin(9600);
  mySerial.begin(9600);
  delay(3000);

  Serial.println("Iniciando Modulo...");

  // Test connectivity
  sendATCommand("AT");
  delay(1000);

  // Check SIM status
  sendATCommand("AT+CPIN?");
  delay(1000);

  // Check network registration
  sendATCommand("AT+CREG?");
  delay(1000);

  // Connect to GPRS
  sendATCommand("AT+CGATT=1");
  delay(2000);

  // Initialize HTTP service
  sendATCommand("AT+HTTPINIT");
  delay(1000);

  // Set HTTP parameters
  sendATCommand("AT+HTTPPARA=\"CID\",1");
  delay(1000);

  // Initialize GPS
  Serial.println("Iniciando GPS...");
  sendATCommand("AT+CGNSSMODE=15,1");
  delay(1000);
  
  sendATCommand("AT+CGPSNMEA=200191");
  delay(1000);
  
  sendATCommand("AT+CGPS=1");
  delay(2000);

  Serial.println("!!El modulo cargo lo que necesita!!");
}

void loop() {
  // Get GPS coordinates
  Serial.println("\nSolicitando localizacion ...");
  sendATCommand("AT+CGPSINFO");
  
  if (hasValidGPS) {
    // Post to dweet.io if we have valid GPS data
    String coordinates = String(currentLatitude, 6) + "," + String(currentLongitude, 6);
    postToDweet(coordinates);
  }
  
  delay(30000); // Wait 30 seconds before next update
}

void sendATCommand(String command) {
  Serial.println("Comando Enviado: " + command);
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

void parseGPSData(String data) {
  int startIdx = data.indexOf(":") + 2;
  int firstComma = data.indexOf(",", startIdx);
  int secondComma = data.indexOf(",", firstComma + 1);
  int thirdComma = data.indexOf(",", secondComma + 1);
  int fourthComma = data.indexOf(",", thirdComma + 1);

  if (firstComma == -1 || secondComma == -1 || thirdComma == -1 || fourthComma == -1) {
    Serial.println("Error: Could not parse GPS response.");
    hasValidGPS = false;
    return;
  }

  String latRaw = data.substring(startIdx, firstComma);
  String latDir = data.substring(firstComma + 1, secondComma);
  String lonRaw = data.substring(secondComma + 1, thirdComma);
  String lonDir = data.substring(thirdComma + 1, fourthComma);

  if (latRaw.length() > 0 && lonRaw.length() > 0) {
    currentLatitude = convertToDecimal(latRaw, false);
    currentLongitude = convertToDecimal(lonRaw, true);

    if (latDir == "S") currentLatitude *= -1;
    if (lonDir == "W") currentLongitude *= -1;

    hasValidGPS = true;
    
    Serial.print("Latitud: ");
    Serial.println(currentLatitude, 6);
    Serial.print("Longitud: ");
    Serial.println(currentLongitude, 6);
  } else {
    hasValidGPS = false;
  }
}

float convertToDecimal(String value, bool isLongitude) {
  if (value.length() < 4) return 0.0;

  int degreeDigits = isLongitude ? 3 : 2;
  float degrees = value.substring(0, degreeDigits).toFloat();
  float minutes = value.substring(degreeDigits).toFloat();
  return degrees + (minutes / 60);
}

void postToDweet(String coordinates) {
  // Split coordinates into latitude and longitude
  int commaIndex = coordinates.indexOf(',');
  String latitude = coordinates.substring(0, commaIndex);
  String longitude = coordinates.substring(commaIndex + 1);

  // Create URL with proper JSON format
  String url = "\"https://dweet.io/dweet/for/coordenaas?latitud=" + latitude + "&longitud=" + longitude + "\"";

  Serial.println("Estableciendo URL para dweet.io...");
  sendATCommand("AT+HTTPPARA=\"URL\"," + url);
  delay(1000);

  Serial.println("Ejecutando GET Request...");
  sendATCommand("AT+HTTPACTION=0");
  delay(5000);

  Serial.println("Leyendo respuesta...");
  sendATCommand("AT+HTTPREAD");
  delay(1000);
}

