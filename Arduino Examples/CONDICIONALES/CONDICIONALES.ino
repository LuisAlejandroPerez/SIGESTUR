const int SW = 6;
const int LED = 7;
int BUTTONstate = 0;


void setup() {
  // put your setup code here, to run once:
  pinMode(SW, INPUT);
  pinMode(LED, OUTPUT);

}

void loop() {
  // put your main code here, to run repeatedly:
  BUTTONstate  = digitalRead(SW);

 if (BUTTONstate  == HIGH)
  {
    digitalWrite(LED,HIGH);
  } 
  else
  {
  digitalWrite(LED,LOW);
  }
}