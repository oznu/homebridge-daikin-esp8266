import { Service, Characteristic } from 'homebridge';

import { HeaterCoolerAccessory } from './heaterCoolerAccessory';

export class HeaterCoolerHumiditySensor {
  private readonly Service: typeof Service = this.parent.platform.api.hap.Service;
  private readonly Characteristic: typeof Characteristic = this.parent.platform.api.hap.Characteristic;

  public service: Service;
  private displayName = 'Humidity';
  constructor(
    private parent: HeaterCoolerAccessory,

  ) {
    this.service = this.parent.accessory.getService(this.displayName) ||
      this.parent.accessory.addService(this.Service.HumiditySensor, this.displayName, 'humidity-sensor');
    this.service.setCharacteristic(this.Characteristic.Name, this.displayName);
  }

}