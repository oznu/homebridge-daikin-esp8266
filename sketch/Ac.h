#ifndef Ac_h
#define Ac_h

#include <EEPROM.h>
#include <ArduinoJson.h>              // v5.13.2 - https://github.com/bblanchon/ArduinoJson
#include <WebSocketsServer.h>         // v2.1.4 - https://github.com/Links2004/arduinoWebSockets
#include <DHT.h>                      // v1.3.0 - https://github.com/adafruit/DHT-sensor-library
#include <IRremoteESP8266.h>          // v2.6.6 - https://github.com/crankyoldgit/IRremoteESP8266
#include <IRsend.h>
#include <ir_Daikin.h>
#include <ir_Panasonic.h>

#include "settings.h"

#define DAIKIN           1
#define PANASONIC        2

// EEPROM Storage Address Locations
#define S_FAN            210
#define S_VS             230
#define S_HS             231
#define S_QM             232
#define S_PM             233

class Ac {
  public:
    int mode = AC_MODE;

    WebSocketsServer webSocket = WebSocketsServer(81);
    DHT dht = DHT(DHT_PIN, DHT_TYPE, 11);
    IRDaikinESP daikin = IRDaikinESP(IR_PIN);
    IRPanasonicAc panasonic = IRPanasonicAc(IR_PIN);

    Ac(void);

    char* accessoryName;
    unsigned long loopLastRun;
    float currentTemperature;
    float currentHumidity;
    String targetMode;
    String targetFanSpeed;
    int targetTemperature;
    bool verticalSwing;
    bool horizontalSwing;
    bool quietMode;
    bool powerfulMode;

    void begin();
    void loop ();
    void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length);
    void getWeather();
    String toJson();
    void broadcast();
    void incomingRequest(String payload);
    void send();
    void setTargetMode(String value);
    void setTargetFanSpeed(String value);
    void setTemperature(int value);
    void setVerticalSwing(bool value);
    void setHorizontalSwing(bool value);
    void setQuietMode(bool value);
    void setPowerfulMode(bool value);

  private:
    bool dirty;
    void set(int location, int value);
    int load(int location);
    void save();
    void restore();
};

#endif