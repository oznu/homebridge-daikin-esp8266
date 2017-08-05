'use strict'

const rp = require('request-promise')

var Service, Characteristic

module.exports = function (homebridge) {
  Service = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic
  homebridge.registerAccessory('homebridge-daikin-esp8266', 'Daikin ESP8266', ThermostatAccessory)
}

class ThermostatAccessory {
  constructor (log, config) {
    this.log = log
    this.name = config.name
    this.url = config.url

    this.service = new Service.Thermostat(this.name)

    this.targetModes = {
      cool: Characteristic.TargetHeatingCoolingState.COOL,
      heat: Characteristic.TargetHeatingCoolingState.HEAT,
      auto: Characteristic.TargetHeatingCoolingState.AUTO,
      off: Characteristic.TargetHeatingCoolingState.OFF
    }

    this.currentModes = {
      cool: Characteristic.CurrentHeatingCoolingState.COOL,
      heat: Characteristic.CurrentHeatingCoolingState.HEAT,
      off: Characteristic.CurrentHeatingCoolingState.OFF
    }

    // Defaults
    this.targetMode = Characteristic.TargetHeatingCoolingState.OFF
    this.currentMode = Characteristic.CurrentHeatingCoolingState.OFF
    this.temperatureDisplayUnits = Characteristic.TemperatureDisplayUnits.CELSIUS
    this.currentTemperature = 0
    this.currentHumidity = 0
    this.targetFanSpeed = 'auto'
    this.targetTemperature = 23
    this.verticalSwing = true
    this.horizontalSwing = true
    this.quietMode = false
    this.powerfulMode = false

    // Toggle State Services
    this.switches = [
      {
        service: new Service.Switch(`${this.name} Vertical Swing`, 'vertical'),
        set: this.toggleSwitch('verticalSwing').set,
        get: this.toggleSwitch('verticalSwing').get
      },
      {
        service: new Service.Switch(`${this.name} Horizontal Swing`, 'horizontal'),
        set: this.toggleSwitch('horizontalSwing').set,
        get: this.toggleSwitch('horizontalSwing').get
      },
      {
        service: new Service.Switch(`${this.name} Quiet Mode`, 'quiet'),
        set: this.toggleSwitch('quietMode').set,
        get: this.toggleSwitch('quietMode').get
      },
      {
        service: new Service.Switch(`${this.name} Powerful Mode`, 'powerful'),
        set: this.toggleSwitch('powerfulMode').set,
        get: this.toggleSwitch('powerfulMode').get
      }
    ]

    // Refresh status every thirty seconds
    setInterval(this.getCurrentState.bind(this), 30000)
    this.getCurrentState()
  }

  post (body) {
    // The ESP8266 does not like lower-case 'content-type headers. So we build the request manually.'
    body = JSON.stringify(body)
    return rp.post(this.url, {
      body: body,
      headers: {
        'Content-Length': Buffer.byteLength(body),
        'Content-Type': 'application/json'
      }
    })
    .catch(() => {
      this.log(`ERROR: Failed to send command to AC.`)
    })
  }

  getName (callback) {
    callback(null, this.name)
  }

  getCurrentState () {
    return rp.get(this.url, {
      json: true
    })
    .then((res) => {
      this.targetMode = this.targetModes[res.targetMode]
      this.targetTemperature = res.targetTemperature
      this.currentTemperature = res.currentTemperature
      this.currentHumidity = res.currentHumidity
      this.targetFanSpeed = res.targetFanSpeed
      this.verticalSwing = res.verticalSwing ? 1 : 0
      this.horizontalSwing = res.horizontalSwing ? 1 : 0
      this.quietMode = res.quietMode ? 1 : 0
      this.powerfulMode = res.powerfulMode ? 1 : 0

      this.service.setCharacteristic(Characteristic.CurrentTemperature, this.currentTemperature)
      this.service.setCharacteristic(Characteristic.CurrentRelativeHumidity, this.currentHumidity)
      this.service.setCharacteristic(Characteristic.CurrentHeatingCoolingState, this.currentMode)

      this.getCurrentHeatingCoolingState()
    })
    .catch(() => {
      this.log(`ERROR: Failed to load state.`)
    })
  }

  getCurrentHeatingCoolingState (callback) {
    let mode = Object.keys(this.targetModes).find(key => this.targetModes[key] === this.targetMode)
    if (['off', 'cool', 'heat'].includes(mode)) {
      this.currentMode = this.currentModes[mode]
    } else {
      if (this.currentTemperature > this.targetTemperature) {
        this.currentMode = this.currentModes['cool']
      } else {
        this.currentMode = this.currentModes['heat']
      }
    }

    this.service.setCharacteristic(Characteristic.CurrentHeatingCoolingState, this.currentMode)

    if (arguments.length) {
      callback(null, this.currentMode)
    }
  }

  getTargetHeatingCoolingState (callback) {
    callback(null, this.targetMode)
  }

  setTargetHeatingCoolingState (value, callback) {
    this.targetMode = value
    let mode = Object.keys(this.targetModes).find(key => this.targetModes[key] === value)
    this.log(`Called setTargetHeatingCoolingState: ${mode}`)
    this.post({targetMode: mode})
    this.getCurrentHeatingCoolingState()
    callback(null)
  }

  getTargetTemperature (callback) {
    this.log(`Called getTargetTemperature: ${this.targetTemperature}`)
    callback(null, this.targetTemperature)
  }

  setTargetTemperature (value, callback) {
    this.log(`Called setTargetTemperature ${value}`)
    this.targetTemperature = value
    this.post({targetTemperature: value})
    this.getCurrentHeatingCoolingState()
    callback(null)
  }

  getCurrentTemperature (callback) {
    this.log('Called getCurrentTemperature')
    callback(null, this.currentTemperature)
  }

  getCurrentRelativeHumidity (callback) {
    this.log('Called getCurrentRelativeHumidity')
    callback(null, this.currentHumidity)
  }

  getTemperatureDisplayUnits (callback) {
    callback(null, this.temperatureDisplayUnits)
  }

  setTemperatureDisplayUnits (value, callback) {
    this.log('Called setTemperatureDisplayUnits')
    if (this.temperatureDisplayUnits !== value) {
      setTimeout(() => {
        this.service.setCharacteristic(Characteristic.TemperatureDisplayUnits, 0)
      }, 100)
    } else {
      this.temperatureDisplayUnits = Characteristic.TemperatureDisplayUnits.CELSIUS
    }
    callback(null)
  }

  toggleSwitch (key) {
    return {
      set (value, callback) {
        this[key] = value
        let req = {}
        req[key] = Boolean(value)
        this.post(req)
        callback(null)
      },
      get (callback) {
        callback(null, this[key])
      }
    }
  }

  getServices () {
    var informationService = new Service.AccessoryInformation()
      .setCharacteristic(Characteristic.Manufacturer, 'oznu')
      .setCharacteristic(Characteristic.Model, 'daikin-esp8266')
      .setCharacteristic(Characteristic.SerialNumber, 'oznu-ir-thermostat')

    this.service
      .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
      .on('get', this.getCurrentHeatingCoolingState.bind(this))

    this.service
      .getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .on('get', this.getTargetHeatingCoolingState.bind(this))
      .on('set', this.setTargetHeatingCoolingState.bind(this))

    this.service
      .getCharacteristic(Characteristic.CurrentTemperature)
      .on('get', this.getCurrentTemperature.bind(this))

    this.service
      .getCharacteristic(Characteristic.CurrentRelativeHumidity)
      .on('get', this.getCurrentRelativeHumidity.bind(this))

    this.service
      .getCharacteristic(Characteristic.TargetTemperature)
      .on('get', this.getTargetTemperature.bind(this))
      .on('set', this.setTargetTemperature.bind(this))
      .setProps({
        minValue: 18,
        maxValue: 30,
        minStep: 1
      })

    this.service
      .getCharacteristic(Characteristic.TemperatureDisplayUnits)
      .on('get', this.getTemperatureDisplayUnits.bind(this))
      .on('set', this.setTemperatureDisplayUnits.bind(this))

    this.service
      .getCharacteristic(Characteristic.Name)
      .on('get', this.getName.bind(this))

    const switchServices = this.switches.map((accessory) => {
      accessory.service
        .getCharacteristic(Characteristic.On)
        .on('get', accessory.get.bind(this))
        .on('set', accessory.set.bind(this))

      return accessory.service
    })

    return [informationService, this.service].concat(switchServices)
  }

}
