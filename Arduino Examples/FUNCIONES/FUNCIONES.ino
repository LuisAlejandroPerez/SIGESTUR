const int SW = 6;
const int LED_GREEN = 7;
const int LED_RED = 8;
int BUTTONstate = 0;


void setup() {
  Serial.begin(9600); // open the serial port at 9600 bps:
  pinMode(SW, INPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);

}

void loop() {
  BUTTONstate  = digitalRead(SW);

 if (BUTTONstate  == HIGH)
  {
    digitalWrite(LED_GREEN,HIGH);
    digitalWrite(LED_RED,LOW);
    RUNING();
  } 
  else
  {
  digitalWrite(LED_RED,HIGH);
  digitalWrite(LED_GREEN,LOW);
  PROBLEM();
  }
}

void RUNING (){
delay(5000);
Serial.println("Funcionando");
return;
}

void PROBLEM (){
delay(5000);
Serial.println("Mantenimiento");
return;
}