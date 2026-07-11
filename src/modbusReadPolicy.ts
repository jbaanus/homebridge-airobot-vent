import {
  ModbusExceptionError,
} from './modbusErrors.js';

export function isIllegalDataAddressError(error: unknown): boolean {
  if (error instanceof ModbusExceptionError) {
    return error.exceptionCode === 2;
  }

  return false;
}
