# homebridge-daikin-esp8266

A Homebridge plugin to control my Daikin AC using an ESP8266 micro controller.

```json
"platforms": [
  {
      "platform": "daikin-esp8266-platform",
      "name": "Daikin"
  }
]
```

![Wiring Diagram](wiring.png)

## Dependencies

* [Arduino Core for ESP8266](https://github.com/esp8266/Arduino)
* [WebSockets](https://github.com/Links2004/arduinoWebSockets)
* [ArduinoJson](https://github.com/bblanchon/ArduinoJson)
* [IRremoteESP8266](https://github.com/markszabo/IRremoteESP8266)
* [Adafruit Unified Sensor](https://github.com/adafruit/Adafruit_Sensor)
* [Adafruit DHT Sensor](https://github.com/adafruit/DHT-sensor-library)