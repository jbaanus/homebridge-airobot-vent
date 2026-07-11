export interface AirobotPlatformConfig {
  name: string;
  ipAddress: string;
  modbusUnitId: number;
  modbusTrace: boolean;
  humidifier: boolean;
  pm25Sensor: boolean;
}

export interface AirobotState {
  firmwareVersion?: string;
  temperatures: {
    extract?: number;
    supply?: number;
    outside?: number;
    exhaust?: number;
    extra?: number;
  };
  humidity: {
    extract?: number;
    supply?: number;
    outside?: number;
    exhaust?: number;
    extra?: number;
  };
  co2?: number;
  supplyFanLevel?: number;
  extractFanLevel?: number;
  supplyFanRpm?: number;
  extractFanRpm?: number;
  workingTimeMs?: number;
  errors?: AirobotErrors;
  serverConnected?: boolean;
  voc?: number;
  pm25?: number;
  heatRecoveryEfficiency?: number;
  supplyAirflow?: number;
  extractAirflow?: number;
  filterChangeRequired?: boolean;
  filterReminderActiveFlags?: number;
  filterReminderIntervalHours?: number;
  filterReminderElapsedHours?: number;
  filterLifeLevel?: number;
  lastUpdated: Date;
}

export interface AirobotErrors {
  raw: number;
  fireAlarm: boolean;
  supplyFan: boolean;
  extractFan: boolean;
  sensor1: boolean;
  sensor2: boolean;
  sensor3: boolean;
  sensor4: boolean;
  sensor5: boolean;
  co2Sensor: boolean;
  heater: boolean;
  lowSupply: boolean;
  filter: boolean;
}

export interface AirobotReadOptions {
  host: string;
  port: number;
  unitId: number;
  timeoutMs: number;
  humidifier: boolean;
  pm25Sensor: boolean;
  debugLog?: (message: string) => void;
}
