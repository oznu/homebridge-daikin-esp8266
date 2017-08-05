#include <DHT.h>

#include <ArduinoJson.h>
#include <IRremoteESP8266.h>
#include <IRsend.h>
#include <ir_Daikin.h>

#include <EEPROM.h>
#include <ESP8266WiFi.h>
#include <WiFiClient.h>
#include <ESP8266WebServer.h>
#include <ESP8266mDNS.h>

// EEPROM Storage Address Locations
#define S_DAIKIN_MODE           200
#define S_DAIKIN_FAN            210
#define S_DAIKIN_TEMP           220
#define S_DAIKIN_VS             230
#define S_DAIKIN_HS             240
#define S_DAIKIN_QM             250
#define S_DAIKIN_PM             260

MDNSResponder mdns;
ESP8266WebServer server(80);
IRDaikinESP dakinir(14);
DHT dht(12, DHT22, 11); // 11 works fine for ESP8266

// Replace with your network credentials
const char* ssid = "xxxx";
const char* password = "xxxx";

// Hostname
const char* accessoryName = "daikin-thermostat";

// Default Settings
class AC {
  public:
    float currentTemperature;
    float currentHumidity;
    String targetMode;
    String targetFanSpeed;
    int targetTemperature;
    bool verticalSwing;
    bool horizontalSwing;
    bool quietMode;
    bool powerfulMode;

    // Saves the settings to EEPROM
    void save() {
      if (dirty) {
        Serial.println("Saving to flash");
        EEPROM.commit();
        dirty = false;
      }
    }

    // Restores Settings from EEPROM
    void restore() {
      targetMode = load(S_DAIKIN_MODE);
      targetFanSpeed = load(S_DAIKIN_FAN);
      verticalSwing = (load(S_DAIKIN_VS) == "1") ? true : false;
      horizontalSwing = (load(S_DAIKIN_HS) == "1") ? true : false;
      quietMode = (load(S_DAIKIN_QM) == "1") ? true : false;
      powerfulMode = (load(S_DAIKIN_PM) == "1") ? true : false;

      setTargetMode(targetMode);
      setTargetFanSpeed(targetFanSpeed);
      setVerticalSwing(verticalSwing);
      setHorizontalSwing(horizontalSwing);
      setQuietMode(quietMode);
      setPowerfulMode(powerfulMode);
    }

    void setTargetMode(String value) {
      value.toLowerCase();

      if (value == "off") {
        dakinir.off();

      } else if (value == "cool") {
        dakinir.on();
        dakinir.setMode(DAIKIN_COOL);

      } else if (value == "heat") {
        dakinir.on();
        dakinir.setMode(DAIKIN_HEAT);

      } else if (value == "fan") {
        dakinir.on();
        dakinir.setMode(DAIKIN_FAN);

      } else if (value == "auto") {
        dakinir.on();
        dakinir.setMode(DAIKIN_AUTO);

      } else if (value == "dry") {
        dakinir.on();
        dakinir.setMode(DAIKIN_DRY);

      } else {
        dakinir.off();
        value = "off";
        Serial.println("WARNING: No Valid Mode Passed. Turning Off.");
      }

      if (value != targetMode) {
        Serial.print("Target Mode Changed: ");
        Serial.println(value);
        targetMode = value;
        set(S_DAIKIN_MODE, targetMode);
      }
    }

    void setTargetFanSpeed(String value) {
      value.toLowerCase();

      if (value == "auto") {
        dakinir.setFan(DAIKIN_FAN_AUTO);

      } else if (value == "min") {
        dakinir.setFan(DAIKIN_FAN_MIN);

      } else if (value == "max") {
        dakinir.setFan(DAIKIN_FAN_MAX);

      } else {
        dakinir.setFan(DAIKIN_FAN_MAX);
        value = "auto";
        Serial.println("WARNING: No Valid Fan Speed Passed. Setting to Auto.");
      }

      if (value != targetFanSpeed) {
        Serial.print("Target Fan Speed: ");
        Serial.println(value);
        targetFanSpeed = value;
        set(S_DAIKIN_FAN, targetFanSpeed);
      }
    }

    void setTemperature(int value) {
      Serial.print("Target Temperature: ");
      Serial.println(value);
      dakinir.setTemp(value);
      targetTemperature = value;
    }

    void setVerticalSwing(bool value) {
      dakinir.setSwingVertical(value);
      if (value != verticalSwing) {
        Serial.print("Verticle Swing: ");
        Serial.println(value);
        verticalSwing = value;
        set(S_DAIKIN_VS, String(verticalSwing));
      }
    }

    void setHorizontalSwing(bool value) {
      dakinir.setSwingHorizontal(value);
      if (value != horizontalSwing) {
        Serial.print("Horizontal Swing: ");
        Serial.println(value);
        horizontalSwing = value;
        set(S_DAIKIN_HS, String(horizontalSwing));
      }
    }

    void setQuietMode(bool value) {
      dakinir.setQuiet(value);
      if (value != quietMode) {
        Serial.print("Quiet Mode: ");
        Serial.println(value);
        quietMode = value;
        set(S_DAIKIN_QM, String(quietMode));
      }
    }

    void setPowerfulMode(bool value) {
      dakinir.setPowerful(value);
      if (value != powerfulMode) {
        Serial.print("Powerful Mode: ");
        Serial.println(value);
        powerfulMode = value;
        set(S_DAIKIN_PM, String(powerfulMode));
      }
    }

    float getCurrentTemperature() {
      readDHT();
      return currentTemperature;
    }

    float getCurrentHumidity() {
      readDHT();
      return currentHumidity;
    }

    String toJson() {
      DynamicJsonBuffer jsonBuffer;
      JsonObject& root = jsonBuffer.createObject();

      root["currentTemperature"] = getCurrentTemperature();
      root["currentHumidity"] = getCurrentHumidity();
      root["targetMode"] = targetMode;
      root["targetFanSpeed"] = targetFanSpeed;
      root["targetTemperature"] = targetTemperature;
      root["verticalSwing"] = verticalSwing;
      root["horizontalSwing"] = horizontalSwing;
      root["quietMode"] = quietMode;
      root["powerfulMode"] = powerfulMode;

      String res;
      root.printTo(res);

      return res;
    }

  private:
    bool dirty;
    unsigned long previousMillis;
    float humidity;
    float temp;

    // Saves a setting value to EEPROM
    void set(int location, String value) {
      dirty = true;
      value += "|";
      for (int i = 0; i < value.length(); ++i) {
        EEPROM.write(i + location, value[i]);
      }
    }

    // Loads a setting value from EEPROM
    String load(int location) {
      String value;

      for (int i = 0; i < 10; ++i) {
        value += char(EEPROM.read(i + location));
      }

      int stopAt = value.indexOf("|");
      value = value.substring(0, stopAt);
      return value;
    }

    void readDHT() {
      unsigned long currentMillis = millis();

      if (currentMillis - previousMillis >= 5000) {
        previousMillis = currentMillis;

        humidity = dht.readHumidity();
        temp = dht.readTemperature(false);

        if (isnan(humidity) || isnan(temp)) {
          Serial.println("Failed to read from DHT sensor!");
          return;
        } else {
          currentTemperature = temp;
          currentHumidity = humidity;
        }
      }
    }
} ac;

void setup(void) {
  delay(1000);

  Serial.begin(115200, SERIAL_8N1, SERIAL_TX_ONLY);

  WiFi.hostname(accessoryName);
  
  WiFi.begin(ssid, password);

  Serial.println("");

  // Wait for connection
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("");
  Serial.print("Connected to ");
  Serial.println(ssid);
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());

  if (mdns.begin(accessoryName, WiFi.localIP())) {
    Serial.println("MDNS responder started");
  }

  // Default Settings
  ac.currentTemperature = 0;
  ac.currentHumidity = 0;
  ac.targetMode = "off";
  ac.targetFanSpeed = "auto";
  ac.targetTemperature = 23;
  ac.verticalSwing = true;
  ac.horizontalSwing = true;
  ac.quietMode = false;
  ac.powerfulMode = false;

  /* GET /daikin
     Content-Type: application/json
  */
  server.on("/daikin", HTTP_GET, []() {
    server.send(200, "application/json", ac.toJson());
  });

  /* POST /daikin
     Content-Type: application/json
     {
       "mode": "heat",
       "fan": "auto",
       "targetTemperature": 23,
       "swingVertical": true,
       "swingHorizontal": false,
       "powerful": false,
       "quiet": true
     }
  */
  server.on("/daikin", HTTP_POST, []() {
    /* Parse the json body into the "body" variable */
    DynamicJsonBuffer jsonBuffer;
    JsonObject& body = jsonBuffer.parseObject(server.arg("plain"));

    /* Get and Set Target State */
    if (body.containsKey("targetMode")) {
      ac.setTargetMode(body["targetMode"]);
    }

    /* Get and Set Fan Speed */
    if (body.containsKey("targetFanSpeed")) {
      ac.setTargetFanSpeed(body["targetFanSpeed"]);
    }

    /* Get and Set Target Temperature */
    if (body.containsKey("targetTemperature")) {
      ac.setTemperature(body["targetTemperature"]);
    }

    /* Other Settings */
    if (body.containsKey("verticalSwing")) {
      ac.setVerticalSwing(body["verticalSwing"]);
    }

    if (body.containsKey("horizontalSwing")) {
      ac.setHorizontalSwing(body["horizontalSwing"]);
    }

    if (body.containsKey("quiet")) {
      ac.setQuietMode(body["quiet"]);
    }

    if (body.containsKey("powerful")) {
      ac.setPowerfulMode(body["powerful"]);
    }

    // send the IR signal.
    dakinir.send();

    // send the HTTP response
    server.send(200, "application/json", "{\"status\": \"0\"}");

    // save settings to EEPROM
    ac.save();
  });

  server.begin();
  Serial.println("HTTP server started");

  dakinir.begin();
  Serial.println("IR Send Ready");

  dht.begin();
  Serial.println("DHT Ready");

  // Restore previous settings
  EEPROM.begin(512);
  ac.restore();
}

void loop(void) {
  server.handleClient();
}
