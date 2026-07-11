import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import { projectHomeKitState } from './homeKitProjection.js';
import type { AirobotVentilationPlatform } from './platform.js';

type TemperatureProjectionKey = 'extract' | 'extra';
type HumidityProjectionKey = 'extract' | 'extra';

export class AirobotPlatformAccessory {
  private readonly fanService: Service;
  private readonly filterService: Service;
  private readonly temperatureServices: Array<{ service: Service; key: TemperatureProjectionKey }> = [];
  private readonly humidityServices: Array<{ service: Service; key: HumidityProjectionKey }> = [];
  private readonly co2Service: Service;
  private readonly airQualityService?: Service;

  private communicationFailed = true;
  private projection = projectHomeKitState(undefined, true);

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
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'Unknown');

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
      this.createTemperatureService('Extract Air Temperature', 'extract-temperature', 'extract'),
    );

    this.removeSensorIfPresent(this.platform.Service.TemperatureSensor, 'supply-temperature');
    this.removeSensorIfPresent(this.platform.Service.TemperatureSensor, 'outside-temperature');
    this.removeSensorIfPresent(this.platform.Service.TemperatureSensor, 'exhaust-temperature');

    this.humidityServices.push(
      this.createHumidityService('Extract Air Humidity', 'extract-humidity', 'extract'),
    );

    this.removeSensorIfPresent(this.platform.Service.HumiditySensor, 'supply-humidity');
    this.removeSensorIfPresent(this.platform.Service.HumiditySensor, 'outside-humidity');
    this.removeSensorIfPresent(this.platform.Service.HumiditySensor, 'exhaust-humidity');

    if (humidifierEnabled) {
      this.temperatureServices.push(
        this.createTemperatureService('Extra Temperature', 'extra-temperature', 'extra'),
      );
      this.humidityServices.push(
        this.createHumidityService('Extra Humidity', 'extra-humidity', 'extra'),
      );
    } else {
      this.removeSensorIfPresent(this.platform.Service.TemperatureSensor, 'extra-temperature');
      this.removeSensorIfPresent(this.platform.Service.HumiditySensor, 'extra-humidity');
    }

    this.co2Service = this.accessory.getService(this.platform.Service.CarbonDioxideSensor)
      ?? this.accessory.addService(this.platform.Service.CarbonDioxideSensor, 'CO2', 'co2');
    this.co2Service.getCharacteristic(this.platform.Characteristic.CarbonDioxideDetected).onGet(() => this.getCo2Detected());
    this.co2Service.getCharacteristic(this.platform.Characteristic.CarbonDioxideLevel).onGet(() => this.getCo2Level());
    this.co2Service.getCharacteristic(this.platform.Characteristic.StatusFault).onGet(() => this.getCo2Fault());

    if (pm25SensorEnabled) {
      this.airQualityService = this.createAirQualityService('Air Quality', 'air-quality');
    } else {
      this.removeSensorIfPresent(this.platform.Service.AirQualitySensor, 'air-quality');
    }

    this.removeSensorIfPresent(this.platform.Service.HumiditySensor, 'heat-recovery-efficiency');

    this.logExposedCharacteristics();
  }

  updateState(state: Parameters<typeof projectHomeKitState>[0]) {
    this.communicationFailed = false;
    this.projection = projectHomeKitState(state, this.communicationFailed);

    const accessoryInfoService = this.accessory.getService(this.platform.Service.AccessoryInformation)!;
    this.updateCharacteristicWithLog(
      accessoryInfoService,
      this.platform.Characteristic.FirmwareRevision,
      this.projection.accessoryInformation.firmwareRevision,
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
      this.updateNumber(item.service, this.platform.Characteristic.CurrentTemperature, this.getProjectedTemperature(item.key));
    }

    for (const item of this.humidityServices) {
      this.updateNumber(item.service, this.platform.Characteristic.CurrentRelativeHumidity, this.getProjectedHumidity(item.key));
    }

    this.updateCharacteristicWithLog(this.co2Service, this.platform.Characteristic.CarbonDioxideDetected, this.getCo2Detected());
    this.updateNumber(this.co2Service, this.platform.Characteristic.CarbonDioxideLevel, this.projection.co2.level);
    this.updateCharacteristicWithLog(this.co2Service, this.platform.Characteristic.StatusFault, this.getCo2Fault());

    this.updateAirQuality();
  }

  markCommunicationFailure() {
    this.communicationFailed = true;
    this.projection = projectHomeKitState(undefined, this.communicationFailed);
    this.updateCharacteristicWithLog(
      this.fanService,
      this.platform.Characteristic.StatusFault,
      this.platform.Characteristic.StatusFault.GENERAL_FAULT,
    );
  }

  private createTemperatureService(name: string, subtype: string, key: TemperatureProjectionKey) {
    const service = this.accessory.getService(name)
      ?? this.accessory.addService(this.platform.Service.TemperatureSensor, name, subtype);
    service.getCharacteristic(this.platform.Characteristic.CurrentTemperature).onGet(() => this.getTemperatureValue(key));
    service.getCharacteristic(this.platform.Characteristic.StatusFault).onGet(() => this.getTemperatureFault());
    return { service, key };
  }

  private createHumidityService(name: string, subtype: string, key: HumidityProjectionKey) {
    const service = this.accessory.getService(name)
      ?? this.accessory.addService(this.platform.Service.HumiditySensor, name, subtype);
    service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity).onGet(() => this.getHumidityValue(key));
    service.getCharacteristic(this.platform.Characteristic.StatusFault).onGet(() => this.getHumidityFault());
    return { service, key };
  }

  private createAirQualityService(name: string, subtype: string) {
    const service = this.accessory.getService(name)
      ?? this.accessory.addService(this.platform.Service.AirQualitySensor, name, subtype);
    service.getCharacteristic(this.platform.Characteristic.AirQuality).onGet(() => this.getAirQuality());

    service.getCharacteristic(this.platform.Characteristic.PM2_5Density).onGet(() => this.getPm25Density());

    service.getCharacteristic(this.platform.Characteristic.StatusFault).onGet(() => this.getAirQualityFault());
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
    return this.projection.fan.active
      ? this.platform.Characteristic.Active.ACTIVE
      : this.platform.Characteristic.Active.INACTIVE;
  }

  private getFanSpeed(): CharacteristicValue {
    return this.projection.fan.rotationSpeed;
  }

  private getStatusFault(): CharacteristicValue {
    return this.projection.fan.statusFault
      ? this.platform.Characteristic.StatusFault.GENERAL_FAULT
      : this.platform.Characteristic.StatusFault.NO_FAULT;
  }

  private getCo2Fault(): CharacteristicValue {
    return this.projection.co2.statusFault
      ? this.platform.Characteristic.StatusFault.GENERAL_FAULT
      : this.platform.Characteristic.StatusFault.NO_FAULT;
  }

  private getFilterChangeIndication(): CharacteristicValue {
    return this.projection.filter.needsChange
      ? this.platform.Characteristic.FilterChangeIndication.CHANGE_FILTER
      : this.platform.Characteristic.FilterChangeIndication.FILTER_OK;
  }

  private getFilterLifeLevel(): CharacteristicValue {
    return this.projection.filter.lifeLevel;
  }

  private getCo2Detected(): CharacteristicValue {
    return this.projection.co2.detected
      ? this.platform.Characteristic.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL
      : this.platform.Characteristic.CarbonDioxideDetected.CO2_LEVELS_NORMAL;
  }

  private getCo2Level(): CharacteristicValue {
    return this.projection.co2.level ?? 0;
  }

  private getTemperatureValue(key: TemperatureProjectionKey): CharacteristicValue {
    return this.getProjectedTemperature(key) ?? 0;
  }

  private getHumidityValue(key: HumidityProjectionKey): CharacteristicValue {
    return this.getProjectedHumidity(key) ?? 0;
  }

  private getTemperatureFault(): CharacteristicValue {
    return this.projection.temperature.statusFault
      ? this.platform.Characteristic.StatusFault.GENERAL_FAULT
      : this.platform.Characteristic.StatusFault.NO_FAULT;
  }

  private getHumidityFault(): CharacteristicValue {
    return this.projection.humidity.statusFault
      ? this.platform.Characteristic.StatusFault.GENERAL_FAULT
      : this.platform.Characteristic.StatusFault.NO_FAULT;
  }

  private getPm25Density(): CharacteristicValue {
    return this.projection.airQuality.pm25Density ?? 0;
  }

  private getAirQualityFault(): CharacteristicValue {
    return this.projection.airQuality.statusFault
      ? this.platform.Characteristic.StatusFault.GENERAL_FAULT
      : this.platform.Characteristic.StatusFault.NO_FAULT;
  }

  private getProjectedTemperature(key: TemperatureProjectionKey): number | undefined {
    return this.projection.temperature[key];
  }

  private getProjectedHumidity(key: HumidityProjectionKey): number | undefined {
    return this.projection.humidity[key];
  }

  private getAirQuality(): CharacteristicValue {
    return this.platform.Characteristic.AirQuality.UNKNOWN;
  }

  private updateNumber(service: Service, characteristic: Parameters<Service['updateCharacteristic']>[0], value?: number) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      this.updateCharacteristicWithLog(service, characteristic, value);
    }
  }

  private updateAirQuality() {
    if (!this.airQualityService) {
      return;
    }

    this.updateCharacteristicWithLog(this.airQualityService, this.platform.Characteristic.AirQuality, this.getAirQuality());
    this.updateNumber(this.airQualityService, this.platform.Characteristic.PM2_5Density, this.projection.airQuality.pm25Density);
  }
}
