import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import Bonjour from 'bonjour';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { HeaterCoolerAccessory } from './heaterCoolerAccessory';

interface BonjourService extends Bonjour.Service {
  txt: {
    mac?: string;
    type?: string;
  }
}

export interface HeaterCoolerDeviceConfig {
  host: string;
  port: number;
  name: string;
  serial: string;
}

export interface PluginConfig extends PlatformConfig {
  name?: string;
  oscillateDirection?: 'vertical' | 'horizontal' | 'both';
}

export class HeaterCoolerPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PluginConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    this.api.on('didFinishLaunching', () => {
      this.startDiscovery();
    });
  }

  public configureAccessory(accessory: PlatformAccessory) {
    this.accessories.push(accessory);
  }

  private startDiscovery() {
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

  private async foundAccessory(service: BonjourService) {
    if (service.txt?.type === 'daikin-thermostat' && service.txt.mac) {
      const deviceConfig: HeaterCoolerDeviceConfig = {
        host: service.host,
        port: service.port,
        name: service.name,
        serial: service.txt.mac,
      };

      const uuid = this.api.hap.uuid.generate(service.txt.mac);
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (!existingAccessory) {
        // new accessory
        this.log.info(`Found new thermostat at ${service.host}:${service.port} [${service.txt.mac}]`);
        const accessory = new this.api.platformAccessory(service.txt.mac.replace(/:/g, ''), uuid);
        
        // start
        new HeaterCoolerAccessory(this, accessory, deviceConfig);

        // register
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        
      } else {
        // remove old "Thermostat" service
        const legacyThermostatService = existingAccessory.getService(this.Service.Thermostat);
        if (legacyThermostatService) {
          this.log.warn('Removing legacy thermostat service.');
          existingAccessory.removeService(legacyThermostatService);
          const oldServices = existingAccessory.services.filter(x => x.subtype);
          this.log.warn(`Found ${oldServices.length} old services to purge.`);
          for (const service of oldServices) {
            this.log.warn('Removing legacy service:', service.displayName);
            existingAccessory.removeService(service);
          }
        }

        // existing accessory
        this.log.info(`Found existing thermostat at ${service.host}:${service.port} [${service.txt.mac}]`);

        // start
        new HeaterCoolerAccessory(this, existingAccessory, deviceConfig);
      }
    }
  }
}
