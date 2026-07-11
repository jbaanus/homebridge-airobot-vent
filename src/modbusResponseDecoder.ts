const MODBUS_READ_COILS = 1;

import {
  InvalidModbusTcpResponseHeaderError,
  ModbusExceptionError,
  UnexpectedModbusFunctionCodeError,
  UnexpectedModbusUnitIdError,
} from './modbusErrors.js';

export interface DecodeReadResponseInput {
  response: Buffer;
  transactionId: number;
  expectedQuantity: number;
  expectedUnitId: number;
  expectedFunctionCode: number;
}

export function tryParseReadResponse(input: DecodeReadResponseInput): number[] | undefined {
  const {
    response,
    transactionId,
    expectedQuantity,
    expectedUnitId,
    expectedFunctionCode,
  } = input;

  if (response.length < 9) {
    return undefined;
  }

  const responseTransactionId = response.readUInt16BE(0);
  const protocolId = response.readUInt16BE(2);
  const length = response.readUInt16BE(4);
  const fullLength = 6 + length;

  if (response.length < fullLength) {
    return undefined;
  }

  if (responseTransactionId !== transactionId || protocolId !== 0) {
    throw new InvalidModbusTcpResponseHeaderError();
  }

  const responseUnitId = response.readUInt8(6);
  if (responseUnitId !== expectedUnitId) {
    throw new UnexpectedModbusUnitIdError(responseUnitId);
  }

  const functionCode = response.readUInt8(7);
  if ((functionCode & 0x80) !== 0) {
    const exceptionCode = response.readUInt8(8);
    throw new ModbusExceptionError(exceptionCode, expectedFunctionCode);
  }

  if (functionCode !== expectedFunctionCode) {
    throw new UnexpectedModbusFunctionCodeError(functionCode);
  }

  const byteCount = response.readUInt8(8);
  const values: number[] = [];

  if (functionCode === MODBUS_READ_COILS) {
    const expectedByteCount = Math.ceil(expectedQuantity / 8);
    if (byteCount !== expectedByteCount) {
      throw new Error(`Unexpected Modbus byte count ${byteCount}`);
    }

    for (let index = 0; index < expectedQuantity; index += 1) {
      const byteIndex = 9 + Math.floor(index / 8);
      const bitIndex = index % 8;
      values.push((response[byteIndex] >> bitIndex) & 0x01);
    }

    return values;
  }

  if (byteCount !== expectedQuantity * 2) {
    throw new Error(`Unexpected Modbus byte count ${byteCount}`);
  }

  for (let offset = 9; offset < 9 + byteCount; offset += 2) {
    values.push(response.readUInt16BE(offset));
  }

  return values;
}