import { Service, Characteristic, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback } from 'homebridge';
import { WebSocket } from '@oznu/ws-connect';
import { resolve4 } from 'mdns-resolver';

import { HeaterCoolerPlatform, HeaterCoolerDeviceConfig } from './heaterCoolerPlatform';
import { HeaterCoolerToggleSwitch } from './heaterCoolerToggleSwitch';
import { HeaterCoolerHumiditySensor } from './heaterCoolerHumiditySensor';

interface DeviceStatus {
  targetMode: 'cool' | 'heat' | 'auto' | 'off'
  verticalSwing: boolean;
  horizontalSwing: boolean;
  quietMode: boolean;
  powerfulMode: boolean;
  currentTemperature: number;
  currentHumidity: number;
  targetFanSpeed: 'auto' | 'min' | 'max';
  targetTemperature: number;
}

export class HeaterCoolerAccessory {
  private readonly Service: typeof Service = this.platform.api.hap.Service;
  private readonly Characteristic: typeof Characteristic = this.platform.api.hap.Characteristic;

  private targetModes = {
    cool: this.Characteristic.TargetHeaterCoolerState.COOL,
    heat: this.Characteristic.TargetHeaterCoolerState.HEAT,
    auto: this.Characteristic.TargetHeaterCoolerState.AUTO,
  };

  private currentModes = {
    cool: this.Characteristic.CurrentHeaterCoolerState.COOLING,
    heat: this.Characteristic.CurrentHeaterCoolerState.HEATING,
    off: this.Characteristic.CurrentHeaterCoolerState.INACTIVE,
  };

  private targetFanSpeeds = {
    auto: 50,
    min: 30,
    max: 100,
  }

  private currentFanState: 'auto' | 'min' | 'max' = 'auto';

  // web socket
  public deviceSocket;

  // main service
  private service: Service;

  // toggle switches
  private verticalSwingSwitch: HeaterCoolerToggleSwitch;
  private horizontalSwingSwitch: HeaterCoolerToggleSwitch;
  private quietModeSwitch: HeaterCoolerToggleSwitch;
  private powerfulModeSwitch: HeaterCoolerToggleSwitch;

  // humidity sensor
  private humiditySensor: HeaterCoolerHumiditySensor;

  constructor(
    public readonly platform: HeaterCoolerPlatform,
    public readonly accessory: PlatformAccessory,
    public readonly deviceConfig: HeaterCoolerDeviceConfig,
  ) {
    // Heater Cooler Accessory Information
    this.accessory.getService(this.Service.AccessoryInformation)!
      .setCharacteristic(this.Characteristic.Manufacturer, 'oznu-platform')
      .setCharacteristic(this.Characteristic.Model, 'daikin-esp8266')
      .setCharacteristic(this.Characteristic.SerialNumber, this.deviceConfig.serial);

    // Heater Cooler Service
    this.service = this.accessory.getService(this.Service.HeaterCooler) || this.accessory.addService(this.Service.HeaterCooler, this.deviceConfig.name);

    // Toggle Switches for other options
    this.verticalSwingSwitch = new HeaterCoolerToggleSwitch(this, 'verticalSwing', 'Vertical Swing');
    this.horizontalSwingSwitch = new HeaterCoolerToggleSwitch(this, 'horizontalSwing', 'Horizonal Swing');
    this.quietModeSwitch = new HeaterCoolerToggleSwitch(this, 'quietMode', 'Quiet Mode');
    this.powerfulModeSwitch = new HeaterCoolerToggleSwitch(this, 'powerfulMode', 'Powerful Mode');

    // Humidity Sensor
    this.humiditySensor = new HeaterCoolerHumiditySensor(this);

    this.service.getCharacteristic(this.Characteristic.CoolingThresholdTemperature)
      .updateValue(25)
      .on('set', this.setCoolingThresholdTemperatureHandler.bind(this))
      .setProps({
        minValue: 18,
        maxValue: 30,
        minStep: 1,
      });

    this.service.getCharacteristic(this.Characteristic.HeatingThresholdTemperature)
      .updateValue(25)
      .on('set', this.setHeatingThresholdTemperatureHandler.bind(this))
      .setProps({
        minValue: 18,
        maxValue: 30,
        minStep: 1,
      });

    this.service.getCharacteristic(this.Characteristic.Active)
      .updateValue(this.Characteristic.Active.INACTIVE)
      .on('set', this.setActiveHandler.bind(this));

    this.service.getCharacteristic(this.Characteristic.TargetHeaterCoolerState)
      .updateValue(this.Characteristic.TargetHeaterCoolerState.COOL)
      .on('set', this.setTargetHeaterCoolerStateHandler.bind(this));

    this.service.getCharacteristic(this.Characteristic.CurrentHeaterCoolerState)
      .updateValue(this.Characteristic.CurrentHeaterCoolerState.INACTIVE);

    this.service.getCharacteristic(this.Characteristic.RotationSpeed)
      .on('set', this.setRotationSpeedHandler.bind(this));

    this.service.getCharacteristic(this.Characteristic.SwingMode)
      .on('set', this.setSwingModeHandler.bind(this));

    // Setup WebSocket
    this.deviceSocket = new WebSocket('', {
      options: {
        handshakeTimeout: 10000,
      },
      beforeConnect: async () => {
        try {
          const hostIp = await resolve4(this.deviceConfig.host);
          const socketAddress = `ws://${hostIp}:${this.deviceConfig.port}`;
          this.deviceSocket.setAddresss(socketAddress);
        } catch (e) {
          this.platform.log.warn(e.message);
        }
      },
    });

    // Setup WebSocket Handlers
    this.deviceSocket.on('websocket-status', (msg) => {
      this.platform.log.info(msg);
    });

    this.deviceSocket.on('json', this.parseCurrentState.bind(this));
  }

  parseCurrentState(currentState: DeviceStatus) {
    // set active characteristic 
    if (currentState.targetMode === 'off') {
      this.service.updateCharacteristic(this.Characteristic.Active, this.Characteristic.Active.INACTIVE);
      this.service.updateCharacteristic(this.Characteristic.CurrentHeaterCoolerState, this.Characteristic.CurrentHeaterCoolerState.INACTIVE);
    } else {
      this.service.updateCharacteristic(this.Characteristic.Active, this.Characteristic.Active.ACTIVE);
      if (currentState.targetMode === 'auto') {
        if (currentState.currentTemperature > currentState.targetTemperature) {
          this.service.updateCharacteristic(this.Characteristic.CurrentHeaterCoolerState, this.currentModes.cool);
        } else {
          this.service.updateCharacteristic(this.Characteristic.CurrentHeaterCoolerState, this.currentModes.heat);
        }
      } else {
        this.service.updateCharacteristic(this.Characteristic.CurrentHeaterCoolerState, this.currentModes[currentState.targetMode]);
      }
      this.service.updateCharacteristic(this.Characteristic.TargetHeaterCoolerState, this.targetModes[currentState.targetMode]);
    }

    if (currentState.targetMode === 'auto' || currentState.targetMode === 'heat') {
      this.service.updateCharacteristic(this.Characteristic.HeatingThresholdTemperature, currentState.targetTemperature);
    } else {
      this.service.updateCharacteristic(this.Characteristic.CoolingThresholdTemperature, currentState.targetTemperature);
    }

    this.service.updateCharacteristic(this.Characteristic.CurrentTemperature, currentState.currentTemperature);

    this.currentFanState = currentState.targetFanSpeed;
    this.service.updateCharacteristic(this.Characteristic.RotationSpeed, this.targetFanSpeeds[currentState.targetFanSpeed]);

    if (this.platform.config.oscillateDirection === 'vertical') {
      this.service.updateCharacteristic(this.Characteristic.SwingMode, currentState.verticalSwing ? 1 : 0);
    } else if (this.platform.config.oscillateDirection === 'horizontal') {
      this.service.updateCharacteristic(this.Characteristic.SwingMode, currentState.horizontalSwing ? 1 : 0);
    } else if (currentState.verticalSwing && currentState.horizontalSwing) {
      this.service.updateCharacteristic(this.Characteristic.SwingMode, this.Characteristic.SwingMode.SWING_ENABLED);
    } else {
      this.service.updateCharacteristic(this.Characteristic.SwingMode, this.Characteristic.SwingMode.SWING_DISABLED);
    }

    this.verticalSwingSwitch.service.updateCharacteristic(this.Characteristic.On, currentState.verticalSwing);
    this.horizontalSwingSwitch.service.updateCharacteristic(this.Characteristic.On, currentState.horizontalSwing);
    this.quietModeSwitch.service.updateCharacteristic(this.Characteristic.On, currentState.quietMode);
    this.powerfulModeSwitch.service.updateCharacteristic(this.Characteristic.On, currentState.powerfulMode);

    this.humiditySensor.service.updateCharacteristic(this.Characteristic.CurrentRelativeHumidity, currentState.currentHumidity);
  }

  setActiveHandler(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.debug(`Set Active: ${this.deviceConfig.name} -> ${value}`);
    if (!this.deviceSocket.isConnected()) {
      this.platform.log.error(`Device Not Connected - ${this.deviceSocket.host}`);
      return callback(new Error('Device Not Connected'));
    }

    if (value === this.Characteristic.Active.INACTIVE) {
      this.deviceSocket.sendJson({ targetMode: 'off' });
      return callback(null);
    }

    setTimeout(() => {
      const currentState = this.service.getCharacteristic(this.Characteristic.CurrentHeaterCoolerState).value;
      if (currentState === this.Characteristic.CurrentHeaterCoolerState.INACTIVE) {
        const lastTargetState = this.service.getCharacteristic(this.Characteristic.TargetHeaterCoolerState).value
          || this.Characteristic.TargetHeaterCoolerState.AUTO;
        return this.setTargetHeaterCoolerStateHandler(lastTargetState, callback);
      } else {
        callback(null);
      }
    }, 1000);
  }

  setTargetHeaterCoolerStateHandler(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    const mode = Object.keys(this.targetModes).find(key => this.targetModes[key] === value);
    this.platform.log.info(`Set TargetHeaterCoolerState: ${this.deviceConfig.name} -> ${mode}`);

    if (!this.deviceSocket.isConnected()) {
      this.platform.log.error(`Device Not Connected - ${this.deviceSocket.host}`);
      return callback(new Error('Device Not Connected'));
    }

    this.deviceSocket.sendJson({ targetMode: mode });
    callback(null);
  }

  setCoolingThresholdTemperatureHandler(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    // ignore the lower threshold in auto mode
    if (this.service.getCharacteristic(this.Characteristic.TargetHeaterCoolerState).value === this.Characteristic.TargetHeaterCoolerState.AUTO) {
      return callback(null);
    }

    this.platform.log.info(`Set CoolingThresholdTemperature: ${this.deviceConfig.name} -> ${value}`);

    if (!this.deviceSocket.isConnected()) {
      this.platform.log.error(`Device Not Connected - ${this.deviceSocket.host}`);
      return callback(new Error('Device Not Connected'));
    }

    this.deviceSocket.sendJson({ targetTemperature: value });
    callback(null);
  }

  setHeatingThresholdTemperatureHandler(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.info(`Set HeatingThresholdTemperature: ${this.deviceConfig.name} -> ${value}`);

    if (!this.deviceSocket.isConnected()) {
      this.platform.log.error(`Device Not Connected - ${this.deviceSocket.host}`);
      return callback(new Error('Device Not Connected'));
    }

    this.deviceSocket.sendJson({ targetTemperature: value });
    callback(null);
  }

  setRotationSpeedHandler(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    const targetFanSpeed = (value < 30) ? 'min' : (value > 80) ? 'max' : 'auto';
    this.platform.log.info(`Set RotationSpeed: ${this.deviceConfig.name} -> ${targetFanSpeed}`);

    if (!this.deviceSocket.isConnected()) {
      this.platform.log.error(`Device Not Connected - ${this.deviceSocket.host}`);
      return callback(new Error('Device Not Connected'));
    }

    if (this.currentFanState !== targetFanSpeed) {
      this.deviceSocket.sendJson({ targetFanSpeed });
    }

    callback(null);
  }

  setSwingModeHandler(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.info(`Set SwingMode: ${this.deviceConfig.name} -> ${value}`);

    if (!this.deviceSocket.isConnected()) {
      this.platform.log.error(`Device Not Connected - ${this.deviceSocket.host}`);
      return callback(new Error('Device Not Connected'));
    }

    if (this.platform.config.oscillateDirection === 'vertical') {
      this.deviceSocket.sendJson({ verticalSwing: Boolean(value)});
    } else if (this.platform.config.oscillateDirection === 'horizontal') {
      this.deviceSocket.sendJson({ horizontalSwing: Boolean(value) });
    } else {
      this.deviceSocket.sendJson({ verticalSwing: Boolean(value), horizontalSwing: Boolean(value) });
    }

    callback(null);
  }

}
