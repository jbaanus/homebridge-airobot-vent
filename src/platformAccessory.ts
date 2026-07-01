import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import { fanLevelToPercentage, hasFault } from './registers.js';
import type { AirobotVentilationPlatform } from './platform.js';
import type { AirobotState } from './types.js';

type NumericValue = number | undefined;

export class AirobotPlatformAccessory {
  private readonly fanService: Service;
  private readonly filterService: Service;
  private readonly temperatureServices: Array<{ service: Service; read: (state: AirobotState) => NumericValue }> = [];
  private readonly humidityServices: Array<{ service: Service; read: (state: AirobotState) => NumericValue }> = [];
  private readonly co2Service: Service;
  private readonly airQualityService?: Service;

  private state?: AirobotState;
  private communicationFailed = true;

  constructor(
    private readonly platform: AirobotVentilationPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    const displayName = accessory.context.device.name as string;
    const humidifierEnabled = accessory.context.device.humidifier === true;
    const pm25SensorEnabled = accessory.context.device.pm25Sensor === true;

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Airobot')
      .setCharacteristic(this.platform.Characteristic.Model, 'Ventilation Unit')
      .setCharacteristic(this.platform.Characteristic.Name, displayName)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.ipAddress);

    this.fanService = this.accessory.getService(this.platform.Service.Fanv2)
      ?? this.accessory.addService(this.platform.Service.Fanv2, displayName);
    this.fanService.setCharacteristic(this.platform.Characteristic.Name, displayName);
    this.fanService.getCharacteristic(this.platform.Characteristic.Active).onGet(() => this.getFanActive());
    this.fanService.getCharacteristic(this.platform.Characteristic.RotationSpeed).onGet(() => this.getFanSpeed());
    this.fanService.getCharacteristic(this.platform.Characteristic.StatusFault).onGet(() => this.getStatusFault());

    this.filterService = this.accessory.getService(this.platform.Service.FilterMaintenance)
      ?? this.accessory.addService(this.platform.Service.FilterMaintenance, 'Filter');
    this.filterService.getCharacteristic(this.platform.Characteristic.FilterChangeIndication).onGet(() => this.getFilterChangeIndication());
    this.filterService.getCharacteristic(this.platform.Characteristic.FilterLifeLevel).onGet(() => this.getFilterLifeLevel());

    this.temperatureServices.push(
      this.createTemperatureService('Extract Air Temperature', 'extract-temperature', state => state.temperatures.extract),
    );

    this.removeSensorIfPresent(this.platform.Service.TemperatureSensor, 'supply-temperature');
    this.removeSensorIfPresent(this.platform.Service.TemperatureSensor, 'outside-temperature');
    this.removeSensorIfPresent(this.platform.Service.TemperatureSensor, 'exhaust-temperature');

    this.humidityServices.push(
      this.createHumidityService('Extract Air Humidity', 'extract-humidity', state => state.humidity.extract),
    );

    this.removeSensorIfPresent(this.platform.Service.HumiditySensor, 'supply-humidity');
    this.removeSensorIfPresent(this.platform.Service.HumiditySensor, 'outside-humidity');
    this.removeSensorIfPresent(this.platform.Service.HumiditySensor, 'exhaust-humidity');

    if (humidifierEnabled) {
      this.temperatureServices.push(
        this.createTemperatureService('Extra Temperature', 'extra-temperature', state => state.temperatures.extra),
      );
      this.humidityServices.push(
        this.createHumidityService('Extra Humidity', 'extra-humidity', state => state.humidity.extra),
      );
    } else {
      this.removeSensorIfPresent(this.platform.Service.TemperatureSensor, 'extra-temperature');
      this.removeSensorIfPresent(this.platform.Service.HumiditySensor, 'extra-humidity');
    }

    this.co2Service = this.accessory.getService(this.platform.Service.CarbonDioxideSensor)
      ?? this.accessory.addService(this.platform.Service.CarbonDioxideSensor, 'CO2', 'co2');
    this.co2Service.getCharacteristic(this.platform.Characteristic.CarbonDioxideDetected).onGet(() => this.getCo2Detected());
    this.co2Service.getCharacteristic(this.platform.Characteristic.CarbonDioxideLevel).onGet(() => this.getNumber(state => state.co2, 0));
    this.co2Service.getCharacteristic(this.platform.Characteristic.StatusFault).onGet(() => this.getCo2Fault());

    if (pm25SensorEnabled) {
      this.airQualityService = this.createAirQualityService('Air Quality', 'air-quality');
    } else {
      this.removeSensorIfPresent(this.platform.Service.AirQualitySensor, 'air-quality');
    }

    this.removeSensorIfPresent(this.platform.Service.HumiditySensor, 'heat-recovery-efficiency');

    this.logExposedCharacteristics();
  }

  updateState(state: AirobotState) {
    this.state = state;
    this.communicationFailed = false;

    const accessoryInfoService = this.accessory.getService(this.platform.Service.AccessoryInformation)!;
    this.updateCharacteristicWithLog(
      accessoryInfoService,
      this.platform.Characteristic.FirmwareRevision,
      state.firmwareVersion ?? 'Unknown',
    );

    this.updateCharacteristicWithLog(this.fanService, this.platform.Characteristic.Active, this.getFanActive());
    this.updateCharacteristicWithLog(this.fanService, this.platform.Characteristic.RotationSpeed, this.getFanSpeed());
    this.updateCharacteristicWithLog(this.fanService, this.platform.Characteristic.StatusFault, this.getStatusFault());

    this.updateCharacteristicWithLog(
      this.filterService,
      this.platform.Characteristic.FilterChangeIndication,
      this.getFilterChangeIndication(),
    );
    this.updateCharacteristicWithLog(this.filterService, this.platform.Characteristic.FilterLifeLevel, this.getFilterLifeLevel());

    for (const item of this.temperatureServices) {
      this.updateNumber(item.service, this.platform.Characteristic.CurrentTemperature, item.read(state));
    }

    for (const item of this.humidityServices) {
      this.updateNumber(item.service, this.platform.Characteristic.CurrentRelativeHumidity, item.read(state));
    }

    this.updateCharacteristicWithLog(this.co2Service, this.platform.Characteristic.CarbonDioxideDetected, this.getCo2Detected());
    this.updateNumber(this.co2Service, this.platform.Characteristic.CarbonDioxideLevel, state.co2);
    this.updateCharacteristicWithLog(this.co2Service, this.platform.Characteristic.StatusFault, this.getCo2Fault());

    this.updateAirQuality(state);
  }

  markCommunicationFailure() {
    this.communicationFailed = true;
    this.updateCharacteristicWithLog(
      this.fanService,
      this.platform.Characteristic.StatusFault,
      this.platform.Characteristic.StatusFault.GENERAL_FAULT,
    );
  }

  private createTemperatureService(name: string, subtype: string, read: (state: AirobotState) => NumericValue) {
    const service = this.accessory.getService(name)
      ?? this.accessory.addService(this.platform.Service.TemperatureSensor, name, subtype);
    service.getCharacteristic(this.platform.Characteristic.CurrentTemperature).onGet(() => this.getNumber(read, 0));
    service.getCharacteristic(this.platform.Characteristic.StatusFault).onGet(() => this.getStatusFault());
    return { service, read };
  }

  private createHumidityService(name: string, subtype: string, read: (state: AirobotState) => NumericValue) {
    const service = this.accessory.getService(name)
      ?? this.accessory.addService(this.platform.Service.HumiditySensor, name, subtype);
    service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity).onGet(() => this.getNumber(read, 0));
    service.getCharacteristic(this.platform.Characteristic.StatusFault).onGet(() => this.getStatusFault());
    return { service, read };
  }

  private createAirQualityService(name: string, subtype: string) {
    const service = this.accessory.getService(name)
      ?? this.accessory.addService(this.platform.Service.AirQualitySensor, name, subtype);
    service.getCharacteristic(this.platform.Characteristic.AirQuality).onGet(() => this.getAirQuality());

    service.getCharacteristic(this.platform.Characteristic.PM2_5Density).onGet(() => this.getNumber(state => state.pm25, 0));

    service.getCharacteristic(this.platform.Characteristic.StatusFault).onGet(() => this.getStatusFault());
    return service;
  }

  private removeSensorIfPresent(service: Parameters<PlatformAccessory['getServiceById']>[0], subtype: string) {
    const existingService = this.accessory.getServiceById(service, subtype);
    if (existingService) {
      this.accessory.removeService(existingService);
    }
  }

  private logExposedCharacteristics() {
    for (const service of this.accessory.services) {
      for (const characteristic of service.characteristics) {
        this.platform.log.info(
          `[HomeKit] Exposed service="${service.displayName}" characteristic="${characteristic.displayName}"`,
        );
      }
    }
  }

  private updateCharacteristicWithLog(
    service: Service,
    characteristic: Parameters<Service['updateCharacteristic']>[0],
    value: CharacteristicValue,
  ) {
    service.updateCharacteristic(characteristic, value);
    const serviceCharacteristic = service.getCharacteristic(characteristic);
    const characteristicName = serviceCharacteristic?.displayName ?? String(characteristic);
    this.platform.log.info(
      `[HomeKit] Push service="${service.displayName}" characteristic="${characteristicName}" value=${String(value)}`,
    );
  }

  private getFanActive(): CharacteristicValue {
    if (this.communicationFailed) {
      return this.platform.Characteristic.Active.INACTIVE;
    }

    const speed = fanLevelToPercentage(this.state?.supplyFanLevel, this.state?.extractFanLevel) ?? 0;
    return speed > 0 ? this.platform.Characteristic.Active.ACTIVE : this.platform.Characteristic.Active.INACTIVE;
  }

  private getFanSpeed(): CharacteristicValue {
    return fanLevelToPercentage(this.state?.supplyFanLevel, this.state?.extractFanLevel) ?? 0;
  }

  private getStatusFault(): CharacteristicValue {
    return this.communicationFailed || hasFault(this.state?.errors)
      ? this.platform.Characteristic.StatusFault.GENERAL_FAULT
      : this.platform.Characteristic.StatusFault.NO_FAULT;
  }

  private getCo2Fault(): CharacteristicValue {
    return this.communicationFailed || this.state?.errors?.co2Sensor
      ? this.platform.Characteristic.StatusFault.GENERAL_FAULT
      : this.platform.Characteristic.StatusFault.NO_FAULT;
  }

  private getFilterChangeIndication(): CharacteristicValue {
    const needsChange = this.state?.errors?.filter || (typeof this.state?.filterLifeLevel === 'number' && this.state.filterLifeLevel <= 0);
    return needsChange
      ? this.platform.Characteristic.FilterChangeIndication.CHANGE_FILTER
      : this.platform.Characteristic.FilterChangeIndication.FILTER_OK;
  }

  private getFilterLifeLevel(): CharacteristicValue {
    return this.state?.filterLifeLevel ?? 100;
  }

  private getCo2Detected(): CharacteristicValue {
    const co2 = this.state?.co2 ?? 0;
    return co2 >= 1000
      ? this.platform.Characteristic.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL
      : this.platform.Characteristic.CarbonDioxideDetected.CO2_LEVELS_NORMAL;
  }

  private getAirQuality(): CharacteristicValue {
    return this.platform.Characteristic.AirQuality.UNKNOWN;
  }

  private getNumber(read: (state: AirobotState) => NumericValue, fallback: number): CharacteristicValue {
    if (!this.state) {
      return fallback;
    }

    return read(this.state) ?? fallback;
  }

  private updateNumber(service: Service, characteristic: Parameters<Service['updateCharacteristic']>[0], value?: number) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      this.updateCharacteristicWithLog(service, characteristic, value);
    }
  }

  private updateAirQuality(state: AirobotState) {
    if (!this.airQualityService) {
      return;
    }

    this.updateCharacteristicWithLog(this.airQualityService, this.platform.Characteristic.AirQuality, this.getAirQuality());
    this.updateNumber(this.airQualityService, this.platform.Characteristic.PM2_5Density, state.pm25);
  }
}
