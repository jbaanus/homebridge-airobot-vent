import type { AirobotState } from './types.js';

export function shouldTryNextProfile(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /Modbus exception\s+[12]\b/i.test(error.message)
    || /Unexpected Modbus function code/i.test(error.message)
    || /Unexpected Modbus unit id/i.test(error.message);
}

export function isIllegalDataAddressError(error: unknown): boolean {
  return error instanceof Error && /Modbus exception\s+2\b/i.test(error.message);
}

export function isPlausibleState(state: AirobotState): boolean {
  const temperatureValues = Object.values(state.temperatures).filter((value): value is number => typeof value === 'number');
  const humidityValues = Object.values(state.humidity).filter((value): value is number => typeof value === 'number');

  const hasInvalidTemperature = temperatureValues.some(value => value < -50 || value > 100);
  const hasInvalidHumidity = humidityValues.some(value => value < 0 || value > 100);
  const hasInvalidPm25 = typeof state.pm25 === 'number' && (state.pm25 < 0 || state.pm25 > 1000);

  return !hasInvalidTemperature && !hasInvalidHumidity && !hasInvalidPm25;
}
