import {
  ModbusExceptionError,
  UnexpectedModbusFunctionCodeError,
  UnexpectedModbusUnitIdError,
} from './modbusErrors.js';
import type { AirobotState } from './types.js';

export function shouldTryNextProfile(error: unknown): boolean {
  if (error instanceof ModbusExceptionError) {
    return error.exceptionCode === 1 || error.exceptionCode === 2;
  }

  if (error instanceof UnexpectedModbusFunctionCodeError || error instanceof UnexpectedModbusUnitIdError) {
    return true;
  }

  return false;
}

export function isIllegalDataAddressError(error: unknown): boolean {
  if (error instanceof ModbusExceptionError) {
    return error.exceptionCode === 2;
  }

  return false;
}

export function isPlausibleState(state: AirobotState): boolean {
  const temperatureValues = Object.values(state.temperatures).filter((value): value is number => typeof value === 'number');
  const humidityValues = Object.values(state.humidity).filter((value): value is number => typeof value === 'number');

  const hasInvalidTemperature = temperatureValues.some(value => value < -50 || value > 100);
  const hasInvalidHumidity = humidityValues.some(value => value < 0 || value > 100);
  const hasInvalidPm25 = typeof state.pm25 === 'number' && (state.pm25 < 0 || state.pm25 > 1000);

  return !hasInvalidTemperature && !hasInvalidHumidity && !hasInvalidPm25;
}
