type CapabilityFlag = 'humidifier' | 'pm25Sensor';

export interface SignalSource {
  registerKey: string;
  offset?: number;
}

export type SignalDecoder =
  | { kind: 'firmware' }
  | { kind: 'uint16' }
  | { kind: 'uint32' }
  | { kind: 'signedTenths' }
  | { kind: 'tenths' }
  | { kind: 'boolean' }
  | { kind: 'boundedUInt32'; min: number; max: number };

export interface SignalDescriptor {
  source: SignalSource;
  decoder: SignalDecoder;
  requires?: CapabilityFlag;
}

export const SIGNALS = {
  firmwareVersion: {
    source: { registerKey: 'firmwareVersion' },
    decoder: { kind: 'firmware' },
  },
  temperatureExtract: {
    source: { registerKey: 'temperatureExtract' },
    decoder: { kind: 'signedTenths' },
  },
  temperatureSupply: {
    source: { registerKey: 'temperatureSupply' },
    decoder: { kind: 'signedTenths' },
  },
  temperatureOutside: {
    source: { registerKey: 'temperatureOutside' },
    decoder: { kind: 'signedTenths' },
  },
  temperatureExhaust: {
    source: { registerKey: 'temperatureExhaust' },
    decoder: { kind: 'signedTenths' },
  },
  temperatureExtra: {
    source: { registerKey: 'temperatureExtra' },
    decoder: { kind: 'signedTenths' },
    requires: 'humidifier',
  },
  humidityExtract: {
    source: { registerKey: 'humidityExtract' },
    decoder: { kind: 'tenths' },
  },
  humiditySupply: {
    source: { registerKey: 'humiditySupply' },
    decoder: { kind: 'tenths' },
  },
  humidityOutside: {
    source: { registerKey: 'humidityOutside' },
    decoder: { kind: 'tenths' },
  },
  humidityExhaust: {
    source: { registerKey: 'humidityExhaust' },
    decoder: { kind: 'tenths' },
  },
  humidityExtra: {
    source: { registerKey: 'humidityExtra' },
    decoder: { kind: 'tenths' },
    requires: 'humidifier',
  },
  co2: {
    source: { registerKey: 'co2' },
    decoder: { kind: 'uint16' },
  },
  supplyFanLevel: {
    source: { registerKey: 'supplyFanLevel' },
    decoder: { kind: 'uint16' },
  },
  extractFanLevel: {
    source: { registerKey: 'extractFanLevel' },
    decoder: { kind: 'uint16' },
  },
  supplyFanRpm: {
    source: { registerKey: 'supplyFanRpm' },
    decoder: { kind: 'uint16' },
  },
  extractFanRpm: {
    source: { registerKey: 'extractFanRpm' },
    decoder: { kind: 'uint16' },
  },
  workingTime: {
    source: { registerKey: 'workingTime' },
    decoder: { kind: 'uint32' },
  },
  errorsRaw: {
    source: { registerKey: 'errorsAndSensorsBlock' },
    decoder: { kind: 'uint32' },
  },
  serverConnected: {
    source: { registerKey: 'errorsAndSensorsBlock', offset: 2 },
    decoder: { kind: 'boolean' },
  },
  voc: {
    source: { registerKey: 'errorsAndSensorsBlock', offset: 3 },
    decoder: { kind: 'uint16' },
  },
  pm25: {
    source: { registerKey: 'errorsAndSensorsBlock', offset: 5 },
    decoder: { kind: 'boundedUInt32', min: 0, max: 1000 },
    requires: 'pm25Sensor',
  },
  heatRecoveryEfficiency: {
    source: { registerKey: 'errorsAndSensorsBlock', offset: 8 },
    decoder: { kind: 'uint16' },
  },
  supplyAirflow: {
    source: { registerKey: 'supplyAirflow' },
    decoder: { kind: 'uint16' },
  },
  extractAirflow: {
    source: { registerKey: 'extractAirflow' },
    decoder: { kind: 'uint16' },
  },
  filterChangeRequired: {
    source: { registerKey: 'filterChangeRequired' },
    decoder: { kind: 'boolean' },
  },
  filterReminderIntervalHours: {
    source: { registerKey: 'filterReminderIntervalHours' },
    decoder: { kind: 'uint16' },
  },
  filterReminderElapsedHours: {
    source: { registerKey: 'filterReminderElapsedHours' },
    decoder: { kind: 'uint16' },
  },
} satisfies Record<string, SignalDescriptor>;