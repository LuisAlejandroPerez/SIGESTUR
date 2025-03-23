#include <SoftwareSerial.h>

SoftwareSerial mySerial(7, 8);

// DB Config
const String FIREBASE_HOST = "sigestur-tx-default-rtdb.firebaseio.com";
const String FIREBASE_AUTH = "AIzaSyC7rGR0OTIRZ_QQc3RGZ1HB88FhqudyFV0";
const String OMSA_ID = "P01H"; // Cambiar en funcion de la omsa

// Variables globales
float currentLatitude = 0.0;
float currentLongitude = 0.0;

void setup()
{
    Serial.begin(9600);

    // Iniciar mi comunicacion con 115200 baud rate ( lo cual funciona bien con este modulo)
    mySerial.begin(115200);
    delay(1000);

    // Setear el baud rate a 9600 lo cual funciona bien para la comunicacion serial del arduino
    Serial.println("Estableciendo baud rate a 9600...");
    mySerial.println("AT+IPR=9600");
    delay(1000);

    // Cambiar a 9600 baud rate
    mySerial.end();
    mySerial.begin(9600);
    delay(1000);
    Serial.println("Iniciando el modulo GPS y Firebase...");

    // Initialize GPS
    sendATCommand("AT");
    sendATCommand("AT+CGNSSMODE=15,1");
    sendATCommand("AT+CGPSNMEA=200191");
    sendATCommand("AT+CGPS=1");

    // Initialize SSL for Firebase
    sendATCommand("AT+CCHSTART");

    Serial.println("Inicializacion completada!!!");
}

void loop()
{
    // Obtener el location del GPS
    Serial.println("\nSolicitando ubicacion del GPS...");
    sendATCommand("AT+CGPSINFO");

    // Si tenemos coordenadas validas, postealas en Firebase
    if (currentLatitude != 0.0 && currentLongitude != 0.0)
    {
        postToFirebase(currentLatitude, currentLongitude);
    }

    delay(15000); // Esperar 15 segundos para cada update de la localizacion
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

    if (response.indexOf("+CGPSINFO:") != -1)
    {
        parseGPSData(response);
    }
}

String readSerialResponse()
{
    String response = "";
    long timeout = millis() + 2000;

    while (millis() < timeout)
    {
        while (mySerial.available())
        {
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

    if (firstComma == -1 || secondComma == -1 || thirdComma == -1 || fourthComma == -1)
    {
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

    // Actualizar coordenadas globales
    currentLatitude = latitude;
    currentLongitude = longitude;

    Serial.print("Latitud: ");
    Serial.println(latitude, 6);
    Serial.print("Longitud: ");
    Serial.println(longitude, 6);
}