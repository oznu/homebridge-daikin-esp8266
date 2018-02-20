import * as Bonjour from 'bonjour';
import * as inflection from 'inflection';
import * as mdnsResolver from 'mdns-resolver';
import * as WebSocket from '@oznu/ws-connect';

let Accessory, Service, Characteristic, UUIDGen;

export = (homebridge) => {
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  homebridge.registerPlatform('homebridge-daikin-esp8266', 'daikin-esp8266-platform', ThermostatPlatform, true);
};

class ThermostatPlatform {
  api: any;
  log: any;
  config: any;
  accessories: any;

  constructor(log, config, api) {
    this.api = api;
    this.log = log;
    this.config = config;
    this.accessories = {};

    const bonjour = Bonjour();
    const browser = bonjour.find({ type: 'oznu-platform' });

    browser.on('up', this.foundAccessory.bind(this));

    // Check bonjour again 5 seconds after launch
    setTimeout(() => {
      browser.update();
    }, 5000);

    // Check bonjour every 60 seconds
    setInterval(() => {
      browser.update();
    }, 60000);
  }

  // Called when a device is found
  async foundAccessory(service) {
    if (service.txt.type && service.txt.type === 'daikin-thermostat') {
      const UUID = UUIDGen.generate(service.txt.mac);
      const host = await mdnsResolver.resolve4(service.host);
      const accessoryConfig = { host: host, port: service.port, name: service.name, serial: service.txt.mac };

      if (!this.accessories[UUID]) {
        // New Accessory
        this.log(`Found new Daikin thermostat at ${service.host}:${service.port} [${service.txt.mac}]`);
        this.accessories[UUID] = new Accessory(service.txt.mac.replace(/:/g, ''), UUID);
        this.startAccessory(this.accessories[UUID], accessoryConfig);
        this.api.registerPlatformAccessories('homebridge-daikin-esp8266', 'daikin-esp8266-platform', [this.accessories[UUID]]);
      } else {
        // Existing Accessory
        this.log(`Found existing Daikin thermostat at ${service.host}:${service.port} [${service.txt.mac}]`);
        this.startAccessory(this.accessories[UUID], accessoryConfig);
      }
    }
  }

  // Called when a cached accessory is loaded
  configureAccessory(accessory) {
    this.accessories[accessory.UUID] = accessory;
  }

  // Start accessory service
  async startAccessory(accessory, config) {
    const device = new ThermostatPlatformAccessory(this.log, accessory, config);

    // Thermostat Accessory Information
    accessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, 'oznu-platform')
      .setCharacteristic(Characteristic.Model, 'daikin-esp8266')
      .setCharacteristic(Characteristic.SerialNumber, config.serial);

    // Thermostat Characteristic Handlers
    accessory.getService(Service.Thermostat)
      .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
      .on('get', device.getCurrentHeatingCoolingState.bind(device));

    accessory.getService(Service.Thermostat)
      .getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .on('get', device.getTargetHeatingCoolingState.bind(device))
      .on('set', device.setTargetHeatingCoolingState.bind(device));

    accessory.getService(Service.Thermostat)
      .getCharacteristic(Characteristic.TargetTemperature)
      .on('get', device.getTargetTemperature.bind(device))
      .on('set', device.setTargetTemperature.bind(device))
      .setProps({
        minValue: 18,
        maxValue: 30,
        minStep: 1
      });

    accessory.getService(Service.Thermostat)
      .getCharacteristic(Characteristic.CurrentTemperature)
      .on('get', device.getCurrentTemperature.bind(device));

    accessory.getService(Service.Thermostat)
      .getCharacteristic(Characteristic.CurrentRelativeHumidity)
      .on('get', device.getCurrentRelativeHumidity.bind(device));

    accessory.getService(Service.Thermostat)
      .getCharacteristic(Characteristic.TemperatureDisplayUnits)
      .on('get', device.getTemperatureDisplayUnits.bind(device))
      .on('set', device.setTemperatureDisplayUnits.bind(device));

    // Update reachability
    accessory.updateReachability(true);
  }
}

class ThermostatPlatformAccessory {
  accessory: any;
  config: any;
  name: any;
  log: any;
  service: any;
  daikin: any;

  settings = {
    targetMode: Characteristic.TargetHeatingCoolingState.OFF,
    currentMode: Characteristic.CurrentHeatingCoolingState.OFF,
    temperatureDisplayUnits: Characteristic.TemperatureDisplayUnits.CELSIUS,
    currentTemperature: 0,
    currentHumidity: 0,
    targetFanSpeed: 'auto',
    targetTemperature: 23,
    verticalSwing: true,
    horizontalSwing: true,
    quietMode: false,
    powerfulMode: false
  };

  targetModes = {
    cool: Characteristic.TargetHeatingCoolingState.COOL,
    heat: Characteristic.TargetHeatingCoolingState.HEAT,
    auto: Characteristic.TargetHeatingCoolingState.AUTO,
    off: Characteristic.TargetHeatingCoolingState.OFF
  };

  currentModes = {
    cool: Characteristic.CurrentHeatingCoolingState.COOL,
    heat: Characteristic.CurrentHeatingCoolingState.HEAT,
    off: Characteristic.CurrentHeatingCoolingState.OFF
  };

  switches = ['Vertical Swing', 'Horizontal Swing', 'Quiet Mode', 'Powerful Mode'];

  constructor(log, accessory, config) {
    this.accessory = accessory;
    this.config = config;
    this.name = `${inflection.titleize(this.config.name.replace(/-/g, ' '))}`;
    this.log = (msg) => log(`[${this.name}] ${msg}`);

    // Setup Base Service
    this.service = accessory.getService(Service.Thermostat) ?
      accessory.getService(Service.Thermostat) : accessory.addService(Service.Thermostat, this.name);

    // Setup WebSocket
    this.daikin = new WebSocket(`ws://${this.config.host}:${this.config.port}`, {
      options: {
        handshakeTimeout: 2000
      }
    });

    // Setup WebSocket Handlers
    this.daikin.on('websocket-status', this.log);
    this.daikin.on('json', this.parseCurrentState.bind(this));

    // Publish Accessory Switch Services
    this.switches.forEach((setting) => {
      const name = `${this.name} ${setting}`;
      const subtype = inflection.camelize(setting.replace(/ /g, '_'), true);
      const switchService = accessory.getService(name) ? accessory.getService(name) : accessory.addService(Service.Switch, name, subtype);

      switchService.getCharacteristic(Characteristic.On)
        .on('get', this.toggleSwitchHandler(subtype).get.bind(this))
        .on('set', this.toggleSwitchHandler(subtype).set.bind(this));
    });
  }

  parseCurrentState(res) {
    res.targetMode = this.targetModes[res.targetMode];
    res.verticalSwing = res.verticalSwing ? 1 : 0;
    res.horizontalSwing = res.horizontalSwing ? 1 : 0;
    res.quietMode = res.quietMode ? 1 : 0;
    res.powerfulMode = res.powerfulMode ? 1 : 0;

    // Update settings
    Object.assign(this.settings, res);

    // Tell HomeKit about the update
    this.service.updateCharacteristic(Characteristic.TargetTemperature, this.settings.targetTemperature);
    this.service.updateCharacteristic(Characteristic.TargetHeatingCoolingState, this.settings.targetMode);
    this.service.updateCharacteristic(Characteristic.CurrentTemperature, this.settings.currentTemperature);
    this.service.updateCharacteristic(Characteristic.CurrentRelativeHumidity, this.settings.currentHumidity);

    this.getCurrentHeatingCoolingState();
  }

  getCurrentHeatingCoolingState(callback?) {
    const mode = Object.keys(this.targetModes).find(key => this.targetModes[key] === this.settings.targetMode);

    if (['off', 'cool', 'heat'].includes(mode)) {
      this.settings.currentMode = this.currentModes[mode];
    } else {
      if (this.settings.currentTemperature > this.settings.targetTemperature) {
        this.settings.currentMode = this.currentModes['cool'];
      } else {
        this.settings.currentMode = this.currentModes['heat'];
      }
    }

    if (arguments.length) {
      callback(null, this.settings.currentMode);
    } else {
      this.service.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, this.settings.currentMode);
    }
  }

  getTargetHeatingCoolingState(callback) {
    callback(null, this.settings.targetMode);
  }

  setTargetHeatingCoolingState(value, callback) {
    this.settings.targetMode = value;
    const mode = Object.keys(this.targetModes).find(key => this.targetModes[key] === value);
    this.log(`Called setTargetHeatingCoolingState: ${mode}`);
    this.daikin.sendJson({targetMode: mode});
    callback(null);
  }

  getTargetTemperature(callback) {
    this.log(`Called getTargetTemperature: ${this.settings.targetTemperature}`);
    callback(null, this.settings.targetTemperature);
  }

  setTargetTemperature(value, callback) {
    this.log(`Called setTargetTemperature ${value}`);
    this.settings.targetTemperature = value;
    this.daikin.sendJson({targetTemperature: value});
    callback(null);
  }

  getCurrentTemperature(callback) {
    callback(null, this.settings.currentTemperature);
  }

  getCurrentRelativeHumidity(callback) {
    callback(null, this.settings.currentHumidity);
  }

  getTemperatureDisplayUnits(callback) {
    callback(null, this.settings.temperatureDisplayUnits);
  }

  setTemperatureDisplayUnits(value, callback) {
    this.log(`Called setTemperatureDisplayUnits: ${value}`);
    setTimeout(() => {
      this.service.updateCharacteristic(Characteristic.TemperatureDisplayUnits, this.settings.temperatureDisplayUnits);
    }, 100);
    callback(null);
  }

  toggleSwitchHandler(key) {
    return {
      set(value, callback) {
        this.log(`Called set ${key}: ${value}`);
        this.settings[key] = value;
        this.daikin.sendJson({[key]: value});
        callback(null);
      },
      get(callback) {
        callback(null, this.settings[key]);
      }
    };
  }
}
