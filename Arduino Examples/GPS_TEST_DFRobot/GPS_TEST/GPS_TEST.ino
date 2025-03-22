#include <SoftwareSerial.h>

SoftwareSerial mySerial(7, 8); // RX, TX

void setup() {
  Serial.begin(9600);
  while (!Serial) {
    ; // Wait for serial port to connect
  }
  
  Serial.println("SIM7600 GPS Test");
  
  // Start with 115200 baud (default for many modules)
  mySerial.begin(115200);
  delay(1000);
  
  // Try to set baud rate to 9600
  Serial.println("Setting baud rate to 9600...");
  mySerial.println("AT+IPR=9600");
  delay(1000);
  
  // Switch to 9600 baud
  mySerial.end();
  mySerial.begin(9600);
  delay(1000);
  
  // Test AT command
  if (!sendATCommandWithCheck("AT", "OK", 3000)) {
    Serial.println("ERROR: Module not responding. Check connections and power.");
    while(1); // Stop if module doesn't respond
  }
  
  Serial.println("Module responding correctly!");
  
  // Initialize GPS
  Serial.println("Initializing GPS...");
  
  sendATCommandWithCheck("AT+CGPS=0", "OK", 2000); // Turn off GPS first
  delay(1000);
  
  sendATCommandWithCheck("AT+CGNSSMODE=15,1", "OK", 2000);
  sendATCommandWithCheck("AT+CGPSNMEA=200191", "OK", 2000);
  
  Serial.println("Turning on GPS...");
  if (!sendATCommandWithCheck("AT+CGPS=1", "OK", 5000)) {
    Serial.println("Failed to turn on GPS. Retrying...");
    sendATCommandWithCheck("AT+CGPS=1", "OK", 5000);
  }
  
  Serial.println("GPS initialization complete. Waiting for fix...");
  delay(5000);
}

void loop() {
  Serial.println("\nRequesting GPS location...");
  String response = sendATCommand("AT+CGPSINFO", 3000);
  
  if (response.indexOf("+CGPSINFO:") != -1) {
    parseGPSData(response);
  } else {
    Serial.println("No GPS data available yet. Waiting for fix...");
  }
  
  delay(10000);
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
      Serial.write(c); // Echo to Serial monitor
    }
  }
  
  return response;
}

bool sendATCommandWithCheck(String command, String expectedResponse, int timeout) {
  String response = sendATCommand(command, timeout);
  return (response.indexOf(expectedResponse) != -1);
}

void parseGPSData(String data) {
  int startIdx = data.indexOf("+CGPSINFO:") + 10;
  
  // Trim whitespace
  while (data.charAt(startIdx) == ' ') startIdx++;
  
  // Check if we have valid data
  if (data.substring(startIdx, startIdx+1) == ",") {
    Serial.println("No GPS fix yet. Keep waiting...");
    return;
  }
  
  int firstComma = data.indexOf(",", startIdx);
  int secondComma = data.indexOf(",", firstComma + 1);
  int thirdComma = data.indexOf(",", secondComma + 1);
  int fourthComma = data.indexOf(",", thirdComma + 1);
  
  if (firstComma == -1 || secondComma == -1 || thirdComma == -1 || fourthComma == -1) {
    Serial.println("Error: Could not parse GPS response.");
    Serial.println("Raw data: " + data);
    return;
  }
  
  String latRaw = data.substring(startIdx, firstComma);
  String latDir = data.substring(firstComma + 1, secondComma);
  String lonRaw = data.substring(secondComma + 1, thirdComma);
  String lonDir = data.substring(thirdComma + 1, fourthComma);
  
  Serial.println("Raw latitude: " + latRaw + " " + latDir);
  Serial.println("Raw longitude: " + lonRaw + " " + lonDir);
  
  if (latRaw.length() > 0 && lonRaw.length() > 0) {
    float latitude = convertToDecimal(latRaw, false);
    float longitude = convertToDecimal(lonRaw, true);
    
    if (latDir == "S") latitude *= -1;
    if (lonDir == "W") longitude *= -1;
    
    Serial.print("Latitude: ");
    Serial.println(latitude, 6);
    Serial.print("Longitude: ");
    Serial.println(longitude, 6);
  } else {
    Serial.println("Invalid GPS data received");
  }
}

float convertToDecimal(String value, bool isLongitude) {
  if (value.length() < 4) return 0.0;
  
  int degreeDigits = isLongitude ? 3 : 2;
  
  float degrees = value.substring(0, degreeDigits).toFloat();
  float minutes = value.substring(degreeDigits).toFloat();
  return degrees + (minutes / 60);
}
