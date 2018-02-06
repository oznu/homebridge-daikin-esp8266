#include <DHT.h>

#include <ArduinoJson.h>
#include <IRremoteESP8266.h>
#include <IRsend.h>
#include <ir_Daikin.h>

#include <EEPROM.h>
#include <ESP8266WiFi.h>
#include <WiFiClient.h>

#include <WebSocketsServer.h>

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
WebSocketsServer webSocket = WebSocketsServer(81);

// NodeMCU
IRDaikinESP dakinir(14);
DHT dht(12, DHT22, 11);

/* Wemos D1 Mini */
// IRDaikinESP dakinir(5);
// DHT dht(0, DHT11, 11);

// Replace with your network credentials
const char* ssid = "xxxx";
const char* password = "xxxx";

// Hostname
const char* accessoryName = "daikin-thermostat";

// Default Settings
class AC {
  public:
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

    void handler(String payload) {
      DynamicJsonBuffer jsonBuffer;
      JsonObject& req = jsonBuffer.parseObject(payload);

      /* Get and Set Target State */
      if (req.containsKey("targetMode")) {
        setTargetMode(req["targetMode"]);
      }

      /* Get and Set Fan Speed */
      if (req.containsKey("targetFanSpeed")) {
        setTargetFanSpeed(req["targetFanSpeed"]);
      }

      /* Get and Set Target Temperature */
      if (req.containsKey("targetTemperature")) {
        setTemperature(req["targetTemperature"]);
      }

      /* Other Settings */
      if (req.containsKey("verticalSwing")) {
        setVerticalSwing(req["verticalSwing"]);
      }

      if (req.containsKey("horizontalSwing")) {
        setHorizontalSwing(req["horizontalSwing"]);
      }

      if (req.containsKey("quiet")) {
        setQuietMode(req["quietMode"]);
      }

      if (req.containsKey("powerful")) {
        setPowerfulMode(req["powerfulMode"]);
      }

      // send the IR signal.
      dakinir.send();

      // save settings to EEPROM
      save();
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

    void loop () {
      unsigned long currentMillis = millis();

      if (currentMillis - loopLastRun >= 30000) {
        loopLastRun = currentMillis;

        String res = toJson();
        webSocket.broadcastTXT(res);
      }
    }

  private:
    bool dirty;
    unsigned long dhtLastRead;
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

      if (currentMillis - dhtLastRead >= 5000) {
        dhtLastRead = currentMillis;

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

// CORS Handler
void sendCors() {
  if (server.hasHeader("origin")) {
      String originValue = server.header("origin");
      server.sendHeader("Access-Control-Allow-Origin", originValue);
      server.sendHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
      server.sendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      server.sendHeader("Access-Control-Max-Age", "600");
      server.sendHeader("Vary", "Origin"); 
  }
}

void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.printf("[%u] Disconnected!\r\n", num);
      break;
    case WStype_CONNECTED: {
      Serial.printf("[%u] Connected from url: %s\r\n", num, payload);
      String res = ac.toJson();
      webSocket.broadcastTXT(res);
      break;
    }
    case WStype_TEXT: {
      // send the payload to the ac handler
      ac.handler((char *)&payload[0]);
      break;
    }
    case WStype_BIN:
      Serial.printf("[%u] get binary length: %u\r\n", num, length);
      break;
    default:
      Serial.printf("Invalid WStype [%d]\r\n", type);
      break;
  }
}

void setup(void) {
  delay(1000);

  Serial.begin(115200, SERIAL_8N1, SERIAL_TX_ONLY);

  WiFi.mode(WIFI_STA);
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

  server.on("/daikin", HTTP_OPTIONS, []() {
    sendCors();
    server.send(200, "text/html", "ok");
  });

  server.on("/daikin", HTTP_GET, []() {
    sendCors();
    server.send(200, "application/json", ac.toJson());
  });

  server.on("/daikin", HTTP_POST, []() {
    // send the body to the ac handler
    ac.handler(server.arg("plain"));

    sendCors();
    server.send(200, "application/json", "{\"status\": \"0\"}");
  });

  server.on("/restart", HTTP_GET, []() {
    server.send(202);
    ESP.restart();
  });

  // list of headers to be recorded
  const char * headerkeys[] = {"origin"};
  size_t headerkeyssize = sizeof(headerkeys)/sizeof(char*);

  // ask server to track these headers
  server.collectHeaders(headerkeys, headerkeyssize);

  server.begin();
  Serial.println("HTTP Server Started");

  webSocket.begin();
  webSocket.onEvent(webSocketEvent);
  Serial.println("WebSocket Server Started");

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
  webSocket.loop();
  ac.loop();
}
