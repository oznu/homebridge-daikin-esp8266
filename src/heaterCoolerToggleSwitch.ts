import { Service, Characteristic, CharacteristicValue, CharacteristicSetCallback } from 'homebridge';

import { HeaterCoolerAccessory } from './heaterCoolerAccessory';

export class HeaterCoolerToggleSwitch {
  private readonly Service: typeof Service = this.parent.platform.api.hap.Service;
  private readonly Characteristic: typeof Characteristic = this.parent.platform.api.hap.Characteristic;

  public service: Service;

  constructor(
    private parent: HeaterCoolerAccessory,
    private attribute: 'verticalSwing' | 'horizontalSwing' | 'quietMode' | 'powerfulMode',
    private displayName: string,
  ) {
    this.service = this.parent.accessory.getService(this.displayName) ||
      this.parent.accessory.addService(this.Service.Switch, this.displayName, this.attribute);

    this.service.setCharacteristic(this.Characteristic.Name, this.displayName);

    this.service.getCharacteristic(this.Characteristic.On)
      .on('set', this.setOnHandler.bind(this));
  }
  
  setOnHandler(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.parent.platform.log.info(`Set ${this.displayName}: ${this.parent.deviceConfig.name} -> ${value}`);
    this.parent.deviceSocket.sendJson({ [this.attribute]: Boolean(value)});
    callback(null);
  }
}