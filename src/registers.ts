import type { AirobotErrors, AirobotState } from './types.js';

export interface RegisterRange {
  start: number;
  quantity: number;
  optional?: boolean;
}

export const READ_RANGES: RegisterRange[] = [
  { start: 1000, quantity: 20 },
  { start: 1026, quantity: 10 },
  { start: 1051, quantity: 2 },
  // Some Airobot variants do not expose filter reminder registers.
  { start: 2017, quantity: 2, optional: true },
];

export type RegisterValues = Map<number, number>;

export interface DecodeStateOptions {
  humidifier?: boolean;
  pm25Sensor?: boolean;
}

export function decodeAirobotState(values: RegisterValues, options: DecodeStateOptions = {}): AirobotState {
  const humidifierEnabled = options.humidifier === true;
  const pm25SensorEnabled = options.pm25Sensor === true;

  return {
    firmwareVersion: decodeFirmware(values.get(1000)),
    temperatures: {
      extract: readSignedTenths(values, 1001),
      supply: readSignedTenths(values, 1002),
      outside: readSignedTenths(values, 1003),
      exhaust: readSignedTenths(values, 1004),
      extra: humidifierEnabled ? readSignedTenths(values, 1005) : undefined,
    },
    humidity: {
      extract: readTenths(values, 1006),
      supply: readTenths(values, 1007),
      outside: readTenths(values, 1008),
      exhaust: readTenths(values, 1009),
      extra: humidifierEnabled ? readTenths(values, 1010) : undefined,
    },
    co2: values.get(1011),
    supplyFanLevel: values.get(1014),
    extractFanLevel: values.get(1015),
    supplyFanRpm: values.get(1016),
    extractFanRpm: values.get(1017),
    workingTimeMs: readUInt32(values, 1018),
    errors: decodeErrors(readUInt32(values, 1026) ?? 0),
    serverConnected: readBoolean(values, 1028),
    voc: values.get(1029),
    pm25: pm25SensorEnabled ? readBoundedUInt32(values, 1031, 0, 1000) : undefined,
    heatRecoveryEfficiency: values.get(1034),
    supplyAirflow: values.get(1051),
    extractAirflow: values.get(1052),
    filterReminderIntervalHours: values.get(2017),
    filterReminderElapsedHours: values.get(2018),
    filterLifeLevel: decodeFilterLife(values.get(2017), values.get(2018)),
    lastUpdated: new Date(),
  };
}

export function fanLevelToPercentage(supplyFanLevel?: number, extractFanLevel?: number): number | undefined {
  const levels = [supplyFanLevel, extractFanLevel].filter((level): level is number => typeof level === 'number');
  if (levels.length === 0) {
    return undefined;
  }

  const averageLevel = levels.reduce((sum, level) => sum + level, 0) / levels.length;
  return clamp(Math.round(averageLevel * 10), 0, 100);
}

export function hasFault(errors?: AirobotErrors): boolean {
  return Boolean(errors && errors.raw !== 0);
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

function readBoolean(values: RegisterValues, address: number): boolean | undefined {
  const value = values.get(address);
  return typeof value === 'number' ? value === 1 : undefined;
}

function readTenths(values: RegisterValues, address: number): number | undefined {
  const value = values.get(address);
  if (typeof value !== 'number' || value === 0xffff) {
    return undefined;
  }

  return clamp(value / 10, 0, 100);
}

function readSignedTenths(values: RegisterValues, address: number): number | undefined {
  const value = values.get(address);
  if (typeof value !== 'number' || value === 0x7fff || value === 0x8000 || value === 0xffff) {
    return undefined;
  }

  return clamp(toSigned16(value) / 10, -50, 100);
}

function readUInt32(values: RegisterValues, address: number): number | undefined {
  // Modbus registers are 16-bit; 32-bit values are stored as two consecutive registers (high word, low word).
  const high = values.get(address);
  const low = values.get(address + 1);
  if (typeof high !== 'number' || typeof low !== 'number') {
    return undefined;
  }

  if (high === 0xffff && low === 0xffff) {
    return undefined;
  }

  return (high * 65536) + low;
}

function readBoundedUInt32(values: RegisterValues, address: number, min: number, max: number): number | undefined {
  const value = readUInt32(values, address);
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
    // Support both documented filter signature and bit-based variants.
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
