import { SIGNALS, type SignalDescriptor, type SignalSource } from './registerSignalSchema.js';
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
  const firmwareVersion = decodeSignal(values, SIGNALS.firmwareVersion, options) as string | undefined;
  const temperatureExtract = decodeSignal(values, SIGNALS.temperatureExtract, options) as number | undefined;
  const temperatureSupply = decodeSignal(values, SIGNALS.temperatureSupply, options) as number | undefined;
  const temperatureOutside = decodeSignal(values, SIGNALS.temperatureOutside, options) as number | undefined;
  const temperatureExhaust = decodeSignal(values, SIGNALS.temperatureExhaust, options) as number | undefined;
  const temperatureExtra = decodeSignal(values, SIGNALS.temperatureExtra, options) as number | undefined;
  const humidityExtract = decodeSignal(values, SIGNALS.humidityExtract, options) as number | undefined;
  const humiditySupply = decodeSignal(values, SIGNALS.humiditySupply, options) as number | undefined;
  const humidityOutside = decodeSignal(values, SIGNALS.humidityOutside, options) as number | undefined;
  const humidityExhaust = decodeSignal(values, SIGNALS.humidityExhaust, options) as number | undefined;
  const humidityExtra = decodeSignal(values, SIGNALS.humidityExtra, options) as number | undefined;
  const co2 = decodeSignal(values, SIGNALS.co2, options) as number | undefined;
  const supplyFanLevel = decodeSignal(values, SIGNALS.supplyFanLevel, options) as number | undefined;
  const extractFanLevel = decodeSignal(values, SIGNALS.extractFanLevel, options) as number | undefined;
  const supplyFanRpm = decodeSignal(values, SIGNALS.supplyFanRpm, options) as number | undefined;
  const extractFanRpm = decodeSignal(values, SIGNALS.extractFanRpm, options) as number | undefined;
  const workingTime = decodeSignal(values, SIGNALS.workingTime, options) as number | undefined;
  const errorsRaw = decodeSignal(values, SIGNALS.errorsRaw, options) as number | undefined;
  const serverConnected = decodeSignal(values, SIGNALS.serverConnected, options) as boolean | undefined;
  const voc = decodeSignal(values, SIGNALS.voc, options) as number | undefined;
  const pm25 = decodeSignal(values, SIGNALS.pm25, options) as number | undefined;
  const heatRecoveryEfficiency = decodeSignal(values, SIGNALS.heatRecoveryEfficiency, options) as number | undefined;
  const supplyAirflow = decodeSignal(values, SIGNALS.supplyAirflow, options) as number | undefined;
  const extractAirflow = decodeSignal(values, SIGNALS.extractAirflow, options) as number | undefined;
  const filterChangeRequired = decodeSignal(values, SIGNALS.filterChangeRequired, options) as boolean | undefined;
  const filterReminderIntervalHours = decodeSignal(values, SIGNALS.filterReminderIntervalHours, options) as number | undefined;
  const filterReminderElapsedHours = decodeSignal(values, SIGNALS.filterReminderElapsedHours, options) as number | undefined;

  return {
    firmwareVersion,
    temperatures: {
      extract: temperatureExtract,
      supply: temperatureSupply,
      outside: temperatureOutside,
      exhaust: temperatureExhaust,
      extra: temperatureExtra,
    },
    humidity: {
      extract: humidityExtract,
      supply: humiditySupply,
      outside: humidityOutside,
      exhaust: humidityExhaust,
      extra: humidityExtra,
    },
    co2,
    supplyFanLevel,
    extractFanLevel,
    supplyFanRpm,
    extractFanRpm,
    workingTimeMs: workingTime,
    errors: decodeErrors(errorsRaw ?? 0),
    serverConnected,
    voc,
    pm25,
    heatRecoveryEfficiency,
    supplyAirflow,
    extractAirflow,
    filterChangeRequired,
    filterReminderIntervalHours,
    filterReminderElapsedHours,
    filterLifeLevel: decodeFilterLife(filterReminderIntervalHours, filterReminderElapsedHours),
    lastUpdated: new Date(),
  };
}

function decodeSignal(values: RegisterValues, descriptor: SignalDescriptor, options: DecodeStateOptions): unknown {
  if (!isSignalEnabled(descriptor, options)) {
    return undefined;
  }

  const registerAddress = resolveAddress(descriptor.source);
  switch (descriptor.decoder.kind) {
  case 'firmware':
    return decodeFirmware(values.get(registerAddress));
  case 'uint16':
    return values.get(registerAddress);
  case 'uint32':
    return readUInt32(values, registerAddress);
  case 'signedTenths':
    return readSignedTenths(values, registerAddress);
  case 'tenths':
    return readTenths(values, registerAddress);
  case 'boolean':
    return readBoolean(values, registerAddress);
  case 'boundedUInt32':
    return readBoundedUInt32(values, registerAddress, descriptor.decoder.min, descriptor.decoder.max);
  }
}

function isSignalEnabled(descriptor: SignalDescriptor, options: DecodeStateOptions): boolean {
  if (!descriptor.requires) {
    return true;
  }

  return options[descriptor.requires] === true;
}

function resolveAddress(source: SignalSource): number {
  return address(source.registerKey) + (source.offset ?? 0);
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