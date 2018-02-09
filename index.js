'use strict'

const WebSocket = require('@oznu/ws-connect')

var Service, Characteristic

module.exports = function (homebridge) {
  Service = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic
  homebridge.registerAccessory('homebridge-daikin-esp8266', 'Daikin ESP8266', ThermostatAccessory)
}

class ThermostatAccessory {
  constructor (log, config) {
    this.log = log
    this.config = config
    this.service = new Service.Thermostat(this.config.name)

    this.daikin = new WebSocket(`ws://${this.config.host}:${this.config.port || 81}`, {
      options: {
        handshakeTimeout: 2000
      }
    })

    this.daikin.on('websocket-status', this.log)

    this.daikin.on('json', this.parseCurrentState.bind(this))

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
        service: new Service.Switch(`Vertical Swing - ${this.config.name} `, 'vertical'),
        set: this.toggleSwitch('verticalSwing').set,
        get: this.toggleSwitch('verticalSwing').get
      },
      {
        service: new Service.Switch(`Horizontal Swing - ${this.config.name} `, 'horizontal'),
        set: this.toggleSwitch('horizontalSwing').set,
        get: this.toggleSwitch('horizontalSwing').get
      },
      {
        service: new Service.Switch(`Quiet Mode - ${this.config.name} `, 'quiet'),
        set: this.toggleSwitch('quietMode').set,
        get: this.toggleSwitch('quietMode').get
      },
      {
        service: new Service.Switch(`Powerful Mode - ${this.config.name} `, 'powerful'),
        set: this.toggleSwitch('powerfulMode').set,
        get: this.toggleSwitch('powerfulMode').get
      }
    ]
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
      .getCharacteristic(Characteristic.TargetTemperature)
      .on('get', this.getTargetTemperature.bind(this))
      .on('set', this.setTargetTemperature.bind(this))
      .setProps({
        minValue: 18,
        maxValue: 30,
        minStep: 1
      })

    this.service
      .getCharacteristic(Characteristic.CurrentTemperature)
      .on('get', this.getCurrentTemperature.bind(this))

    this.service
      .getCharacteristic(Characteristic.CurrentRelativeHumidity)
      .on('get', this.getCurrentRelativeHumidity.bind(this))

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

  getName (callback) {
    callback(null, this.config.name)
  }

  parseCurrentState (res) {
    this.targetMode = this.targetModes[res.targetMode]
    this.targetTemperature = res.targetTemperature
    this.currentTemperature = res.currentTemperature
    this.currentHumidity = res.currentHumidity
    this.targetFanSpeed = res.targetFanSpeed
    this.verticalSwing = res.verticalSwing ? 1 : 0
    this.horizontalSwing = res.horizontalSwing ? 1 : 0
    this.quietMode = res.quietMode ? 1 : 0
    this.powerfulMode = res.powerfulMode ? 1 : 0

    this.service.updateCharacteristic(Characteristic.TargetTemperature, this.targetTemperature)
    this.service.updateCharacteristic(Characteristic.TargetHeatingCoolingState, this.targetMode)
    this.service.updateCharacteristic(Characteristic.CurrentTemperature, this.currentTemperature)
    this.service.updateCharacteristic(Characteristic.CurrentRelativeHumidity, this.currentHumidity)

    this.getCurrentHeatingCoolingState()
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

    this.service.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, this.currentMode)

    if (arguments.length) {
      callback(null, this.currentMode)
    }
  }

  getTargetHeatingCoolingState (callback) {
    callback(null, this.targetMode)
  }

  getTargetTemperature (callback) {
    this.log(`Called getTargetTemperature: ${this.targetTemperature}`)
    callback(null, this.targetTemperature)
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

  setTargetHeatingCoolingState (value, callback) {
    this.targetMode = value
    let mode = Object.keys(this.targetModes).find(key => this.targetModes[key] === value)
    this.log(`Called setTargetHeatingCoolingState: ${mode}`)
    this.daikin.sendJson({targetMode: mode})
    callback(null)
  }

  setTargetTemperature (value, callback) {
    this.log(`Called setTargetTemperature ${value}`)
    this.targetTemperature = value
    this.daikin.sendJson({targetTemperature: value})
    callback(null)
  }

  setTemperatureDisplayUnits (value, callback) {
    this.log('Called setTemperatureDisplayUnits')
    setTimeout(() => {
      this.service.updateCharacteristic(Characteristic.TemperatureDisplayUnits, 0)
    }, 100)
    this.temperatureDisplayUnits = value
    callback(null)
  }

  toggleSwitch (key) {
    return {
      set (value, callback) {
        this.log(`Called set ${key}: ${value}`)
        this.daikin.sendJson({[key]: value})
        callback(null)
      },
      get (callback) {
        callback(null, this[key])
      }
    }
  }

}
