import type { AirobotErrors, AirobotState } from './types.js';

export type RegisterValues = Map<number, number>;

export interface DecodeStateOptions {
  humidifier?: boolean;
  pm25Sensor?: boolean;
}

export interface RegisterSchemaEntry {
  key: string;
  start: number;
  quantity?: number;
  optional?: boolean;
  functionCode?: number;
}

export const REGISTER_SCHEMA: RegisterSchemaEntry[] = [
  { key: 'firmwareVersion', start: 1000 },
  { key: 'temperatureExtract', start: 1001 },
  { key: 'temperatureSupply', start: 1002 },
  { key: 'temperatureOutside', start: 1003 },
  { key: 'temperatureExhaust', start: 1004 },
  { key: 'temperatureExtra', start: 1005 },
  { key: 'humidityExtract', start: 1006 },
  { key: 'humiditySupply', start: 1007 },
  { key: 'humidityOutside', start: 1008 },
  { key: 'humidityExhaust', start: 1009 },
  { key: 'humidityExtra', start: 1010 },
  { key: 'co2', start: 1011 },
  { key: 'reserved1012', start: 1012 },
  { key: 'reserved1013', start: 1013 },
  { key: 'supplyFanLevel', start: 1014 },
  { key: 'extractFanLevel', start: 1015 },
  { key: 'supplyFanRpm', start: 1016 },
  { key: 'extractFanRpm', start: 1017 },
  { key: 'workingTime', start: 1018, quantity: 2 },

  { key: 'errorsAndSensorsBlock', start: 1026, quantity: 10 },

  { key: 'supplyAirflow', start: 1051 },
  { key: 'extractAirflow', start: 1052 },

  { key: 'filterChangeRequired', start: 4020, optional: true, functionCode: 1 },
  { key: 'filterReminderIntervalHours', start: 2017, optional: true, functionCode: 3 },
  { key: 'filterReminderElapsedHours', start: 2018, optional: true, functionCode: 3 },
];

const addressByKey = new Map(REGISTER_SCHEMA.map(entry => [entry.key, entry.start]));

export function decodeAirobotStateFromSchema(values: RegisterValues, options: DecodeStateOptions = {}): AirobotState {
  const humidifierEnabled = options.humidifier === true;
  const pm25SensorEnabled = options.pm25Sensor === true;

  const firmwareVersionAddress = address('firmwareVersion');
  const temperatureExtractAddress = address('temperatureExtract');
  const temperatureSupplyAddress = address('temperatureSupply');
  const temperatureOutsideAddress = address('temperatureOutside');
  const temperatureExhaustAddress = address('temperatureExhaust');
  const temperatureExtraAddress = address('temperatureExtra');
  const humidityExtractAddress = address('humidityExtract');
  const humiditySupplyAddress = address('humiditySupply');
  const humidityOutsideAddress = address('humidityOutside');
  const humidityExhaustAddress = address('humidityExhaust');
  const humidityExtraAddress = address('humidityExtra');
  const co2Address = address('co2');
  const supplyFanLevelAddress = address('supplyFanLevel');
  const extractFanLevelAddress = address('extractFanLevel');
  const supplyFanRpmAddress = address('supplyFanRpm');
  const extractFanRpmAddress = address('extractFanRpm');
  const workingTimeAddress = address('workingTime');
  const errorsBlockAddress = address('errorsAndSensorsBlock');
  const serverConnectedAddress = errorsBlockAddress + 2;
  const vocAddress = errorsBlockAddress + 3;
  const pm25Address = errorsBlockAddress + 5;
  const heatRecoveryEfficiencyAddress = errorsBlockAddress + 8;
  const supplyAirflowAddress = address('supplyAirflow');
  const extractAirflowAddress = address('extractAirflow');
  const filterChangeRequiredAddress = address('filterChangeRequired');
  const filterReminderIntervalHoursAddress = address('filterReminderIntervalHours');
  const filterReminderElapsedHoursAddress = address('filterReminderElapsedHours');

  return {
    firmwareVersion: decodeFirmware(values.get(firmwareVersionAddress)),
    temperatures: {
      extract: readSignedTenths(values, temperatureExtractAddress),
      supply: readSignedTenths(values, temperatureSupplyAddress),
      outside: readSignedTenths(values, temperatureOutsideAddress),
      exhaust: readSignedTenths(values, temperatureExhaustAddress),
      extra: humidifierEnabled ? readSignedTenths(values, temperatureExtraAddress) : undefined,
    },
    humidity: {
      extract: readTenths(values, humidityExtractAddress),
      supply: readTenths(values, humiditySupplyAddress),
      outside: readTenths(values, humidityOutsideAddress),
      exhaust: readTenths(values, humidityExhaustAddress),
      extra: humidifierEnabled ? readTenths(values, humidityExtraAddress) : undefined,
    },
    co2: values.get(co2Address),
    supplyFanLevel: values.get(supplyFanLevelAddress),
    extractFanLevel: values.get(extractFanLevelAddress),
    supplyFanRpm: values.get(supplyFanRpmAddress),
    extractFanRpm: values.get(extractFanRpmAddress),
    workingTimeMs: readUInt32(values, workingTimeAddress),
    errors: decodeErrors(readUInt32(values, errorsBlockAddress) ?? 0),
    serverConnected: readBoolean(values, serverConnectedAddress),
    voc: values.get(vocAddress),
    pm25: pm25SensorEnabled ? readBoundedUInt32(values, pm25Address, 0, 1000) : undefined,
    heatRecoveryEfficiency: values.get(heatRecoveryEfficiencyAddress),
    supplyAirflow: values.get(supplyAirflowAddress),
    extractAirflow: values.get(extractAirflowAddress),
    filterChangeRequired: readBoolean(values, filterChangeRequiredAddress),
    filterReminderIntervalHours: values.get(filterReminderIntervalHoursAddress),
    filterReminderElapsedHours: values.get(filterReminderElapsedHoursAddress),
    filterLifeLevel: decodeFilterLife(values.get(filterReminderIntervalHoursAddress), values.get(filterReminderElapsedHoursAddress)),
    lastUpdated: new Date(),
  };
}

function address(key: string): number {
  const resolved = addressByKey.get(key);
  if (typeof resolved !== 'number') {
    throw new Error(`Missing register schema entry for key: ${key}`);
  }

  return resolved;
}

function decodeFirmware(value?: number): string | undefined {
  if (typeof value !== 'number') {
    return undefined;
  }

  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`;
}

function decodeFilterLife(intervalHours?: number, elapsedHours?: number): number | undefined {
  if (!intervalHours || typeof elapsedHours !== 'number') {
    return undefined;
  }

  return clamp(Math.round(100 - ((elapsedHours / intervalHours) * 100)), 0, 100);
}

function readBoolean(values: RegisterValues, registerAddress: number): boolean | undefined {
  const value = values.get(registerAddress);
  return typeof value === 'number' ? value === 1 : undefined;
}

function readTenths(values: RegisterValues, registerAddress: number): number | undefined {
  const value = values.get(registerAddress);
  if (typeof value !== 'number' || value === 0xffff) {
    return undefined;
  }

  return clamp(value / 10, 0, 100);
}

function readSignedTenths(values: RegisterValues, registerAddress: number): number | undefined {
  const value = values.get(registerAddress);
  if (typeof value !== 'number' || value === 0x7fff || value === 0x8000 || value === 0xffff) {
    return undefined;
  }

  return clamp(toSigned16(value) / 10, -50, 100);
}

function readUInt32(values: RegisterValues, registerAddress: number): number | undefined {
  const high = values.get(registerAddress);
  const low = values.get(registerAddress + 1);
  if (typeof high !== 'number' || typeof low !== 'number') {
    return undefined;
  }

  if (high === 0xffff && low === 0xffff) {
    return undefined;
  }

  return (high * 65536) + low;
}

function readBoundedUInt32(values: RegisterValues, registerAddress: number, min: number, max: number): number | undefined {
  const value = readUInt32(values, registerAddress);
  if (typeof value !== 'number') {
    return undefined;
  }

  return clamp(value, min, max);
}

function decodeErrors(raw: number): AirobotErrors {
  const FILTER_SIGNATURE = 1048;

  return {
    raw,
    fireAlarm: hasBit(raw, 1),
    supplyFan: hasBit(raw, 2),
    extractFan: hasBit(raw, 4),
    sensor1: hasBit(raw, 8),
    sensor2: hasBit(raw, 16),
    sensor3: hasBit(raw, 32),
    sensor4: hasBit(raw, 64),
    sensor5: hasBit(raw, 128),
    co2Sensor: hasBit(raw, 256),
    heater: hasBit(raw, 512),
    lowSupply: hasBit(raw, 1024),
    filter: hasBit(raw, 2048) || (raw & FILTER_SIGNATURE) === FILTER_SIGNATURE,
  };
}

function hasBit(value: number, bit: number): boolean {
  return (value & bit) === bit;
}

function toSigned16(value: number): number {
  return value > 0x7fff ? value - 0x10000 : value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}