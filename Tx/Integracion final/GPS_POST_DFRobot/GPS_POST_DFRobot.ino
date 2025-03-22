#include <SoftwareSerial.h>

SoftwareSerial mySerial(7, 8); // RX, TX

// Firebase Configuration
const String FIREBASE_HOST = "sigestur-tx-default-rtdb.firebaseio.com";
const String FIREBASE_AUTH = "AIzaSyC7rGR0OTIRZ_QQc3RGZ1HB88FhqudyFV0";
const String OMSA_ID = "C19M";

void setup() {
  Serial.begin(9600);
  while (!Serial) {
    ;
  }

  Serial.println("Initializing SIM7600...");
  mySerial.begin(115200);
  delay(1000);

  Serial.println("Setting baud rate to 9600...");
  mySerial.println("AT+IPR=9600");
  delay(1000);
  mySerial.end();
  mySerial.begin(9600);
  delay(1000);

  if (!sendATCommandWithCheck("AT", "OK", 3000)) {
    Serial.println("ERROR: Module not responding. Check connections.");
    while (1);
  }
  
  Serial.println("Module responding correctly!");

  sendATCommandWithCheck("AT+CCHSTART", "OK", 1000); // Enable SSL

  Serial.println("Initializing GPS...");
  sendATCommandWithCheck("AT+CGPS=0", "OK", 2000);
  delay(1000);
  sendATCommandWithCheck("AT+CGNSSMODE=15,1", "OK", 2000);
  sendATCommandWithCheck("AT+CGPSNMEA=200191", "OK", 2000);

  if (!sendATCommandWithCheck("AT+CGPS=1", "OK", 5000)) {
    Serial.println("Retrying GPS activation...");
    sendATCommandWithCheck("AT+CGPS=1", "OK", 5000);
  }

  Serial.println("GPS initialized. Waiting for fix...");
}

void loop() {
  Serial.println("\nRequesting GPS location...");
  String response = sendATCommand("AT+CGPSINFO", 3000);
  
  if (response.indexOf("+CGPSINFO:") != -1) {
    float latitude, longitude;
    if (parseGPSData(response, latitude, longitude)) {
      postToFirebase(latitude, longitude);
    }
  } else {
    Serial.println("No GPS data available yet.");
  }
  
  delay(30000); // Send data every 30 seconds
}

String sendATCommand(String command, int timeout) {
  Serial.println("Sending: " + command);
  mySerial.println(command);
  
  String response = "";
  long startTime = millis();
  
  while ((millis() - startTime) < timeout) {
    while (mySerial.available()) {
      char c = mySerial.read();
      response += c;
      Serial.write(c);
    }
  }
  
  return response;
}

bool sendATCommandWithCheck(String command, String expectedResponse, int timeout) {
  String response = sendATCommand(command, timeout);
  return (response.indexOf(expectedResponse) != -1);
}

bool parseGPSData(String data, float &latitude, float &longitude) {
  int startIdx = data.indexOf("+CGPSINFO:") + 10;
  while (data.charAt(startIdx) == ' ') startIdx++;

  if (data.substring(startIdx, startIdx + 1) == ",") {
    Serial.println("No GPS fix yet.");
    return false;
  }

  int firstComma = data.indexOf(",", startIdx);
  int secondComma = data.indexOf(",", firstComma + 1);
  int thirdComma = data.indexOf(",", secondComma + 1);
  int fourthComma = data.indexOf(",", thirdComma + 1);

  if (firstComma == -1 || secondComma == -1 || thirdComma == -1 || fourthComma == -1) {
    Serial.println("Error parsing GPS data.");
    return false;
  }

  String latRaw = data.substring(startIdx, firstComma);
  String latDir = data.substring(firstComma + 1, secondComma);
  String lonRaw = data.substring(secondComma + 1, thirdComma);
  String lonDir = data.substring(thirdComma + 1, fourthComma);

  latitude = convertToDecimal(latRaw, false);
  longitude = convertToDecimal(lonRaw, true);

  if (latDir == "S") latitude *= -1;
  if (lonDir == "W") longitude *= -1;

  Serial.print("Latitude: "); Serial.println(latitude, 6);
  Serial.print("Longitude: "); Serial.println(longitude, 6);

  return true;
}

float convertToDecimal(String value, bool isLongitude) {
  if (value.length() < 4) return 0.0;
  int degreeDigits = isLongitude ? 3 : 2;
  float degrees = value.substring(0, degreeDigits).toFloat();
  float minutes = value.substring(degreeDigits).toFloat();
  return degrees + (minutes / 60);
}

void postToFirebase(float latitude, float longitude) {
  Serial.println("Sending data to Firebase...");

  if (!sendATCommandWithCheck("AT+CCHOPEN=0,\"" + FIREBASE_HOST + "\",443", "+CCHOPEN: 0,0", 10000)) {
    Serial.println("Error connecting to Firebase");
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

  sendATCommandWithCheck("AT+CCHSEND=0," + String(request.length()), ">", 5000);
  mySerial.print(request);
  delay(5000);
  sendATCommandWithCheck("AT+CCHCLOSE=0", "OK", 5000);
  
  Serial.println("Firebase update completed");
}
