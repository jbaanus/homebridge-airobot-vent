import type { AirobotPlatformConfig } from './types.js';

const DEFAULT_NAME = 'Airobot Ventilation';
const DEFAULT_MODBUS_UNIT_ID = 1;

export interface NormalizeConfigResult {
  config?: AirobotPlatformConfig;
  error?: string;
}

export function normalizeAirobotPlatformConfig(input: Record<string, unknown>): NormalizeConfigResult {
  const ipAddress = normalizeRequiredIpAddress(input.ipAddress);
  if (!ipAddress) {
    return {
      error: 'Missing required "ipAddress" config value for Airobot ventilation unit.',
    };
  }

  return {
    config: {
      name: normalizeName(input.name),
      ipAddress,
      modbusUnitId: normalizeModbusUnitId(input.modbusUnitId),
      modbusTrace: input.modbusTrace === true,
      humidifier: input.humidifier === true,
      pm25Sensor: input.pm25Sensor === true,
    },
  };
}

function normalizeRequiredIpAddress(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const ipAddress = value.trim();
  return ipAddress.length > 0 ? ipAddress : undefined;
}

function normalizeName(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_NAME;
  }

  const name = value.trim();
  return name.length > 0 ? name : DEFAULT_NAME;
}

function normalizeModbusUnitId(value: unknown): number {
  if (Number.isInteger(value) && typeof value === 'number' && value >= 0 && value <= 255) {
    return value;
  }

  return DEFAULT_MODBUS_UNIT_ID;
}