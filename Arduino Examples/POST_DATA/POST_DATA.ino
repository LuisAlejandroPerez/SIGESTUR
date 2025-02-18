/*
Este bloque de cofigo permite la comunicacion con el modulo SIM7600G-H  para conectarse a la red celular, 
activando GPRS para postear o enviar datos al api de dweet.io mediante HTTP POST cada 30 segundos. Primero 
se establecio la comunicacion serial & se verifico el estado de la SIM CARD la, luego se activo  servicio HTTP 
y se configuro  la URL para el envío de datos. 

Dweet.io es un servicio gratuito en línea que permite a los dispositivos enviar mensajes y publicar datos
en la nube. A menudo se lo describe como "Twitter para máquinas".

NOTA
Se creo una funcion post en la siguiente URL: https://dweet.io/play/#!/dweets/postDweet_post_0 con el siguiente Body:
{
"value":123
}

Creando la URL: https://dweet.io:443/dweet/for/number Lo que esta api sencilla hace es almanecar 3 digitos random y actualizarlos
simplemente para probar la conectividad del modulo. En este caso la API tiene un valor por defecto de 123 y se va visualizar en 
tiempo real en: https://dweet.io/follow/number como ese numero cambia a 456.

*/

#include <SoftwareSerial.h>

SoftwareSerial mySerial(11, 10);

void setup() {
  Serial.begin(9600);
  mySerial.begin(9600);
  delay(3000);
  
  Serial.println("Iniciando modulo...");
  
  Serial.println("1. Probando conectividad...");
  AT_Command("AT");
  delay(1000);
  
  Serial.println("2. Status de la SIM CARD...");
  AT_Command("AT+CPIN?");
  delay(1000);
  
  Serial.println("3. Comprobando el registro de la red celular...");
  AT_Command("AT+CREG?");
  delay(1000);
  
  Serial.println("4. Conectandose a GPRS...");
  AT_Command("AT+CGATT=1");
  delay(2000);
  
  Serial.println("5. Inicializando servicio HTTP...");
  AT_Command("AT+HTTPINIT");
  delay(1000);
  
  Serial.println("6. Configuracion de parametros HTTP...");
  AT_Command("AT+HTTPPARA=\"CID\",1");
  delay(1000);
  
  Serial.println("¡Inicializacion del modulo completada!");
}

void loop() {
  Serial.println("\Enviando un nuevo POST a dweet.io...");
  POST("456");
  Serial.println("Esperando 30 segundos antes del proximo POST...");
  delay(30000);
}

void AT_Command(String command) {
  Serial.println("Enviando comando: " + command);
  mySerial.println(command); // enviar el comando al modulo SIM
  delay(500);
  Serial.println("Respuesta:");
  while (mySerial.available()) {
    Serial.write(mySerial.read()); // Imprimir la respuesta del modulo
  }
  Serial.println("------------------------");
}

void POST(String value) {
  String url = "\"https://dweet.io/dweet/for/number?value=" + value + "\"";
  
  Serial.println("Configurando URL para dweet.io...");
  AT_Command("AT+HTTPPARA=\"URL\"," + url);
  delay(1000);
  
  Serial.println(" HTTP GET REQUEST...");
  AT_Command("AT+HTTPACTION=0");
  delay(5000);
  
  Serial.println("Respuesta...");
  AT_Command("AT+HTTPREAD");
  delay(1000);
}
