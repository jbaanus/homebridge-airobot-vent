import {
  InvalidModbusTcpResponseHeaderError,
  ModbusExceptionError,
  UnexpectedModbusFunctionCodeError,
  UnexpectedModbusUnitIdError,
} from './modbusErrors.js';
import type { ModbusTransport } from './modbusTransport.js';

const MODBUS_READ_COILS = 1;

export interface ModbusTransactionOptions {
  host: string;
  port: number;
  timeoutMs: number;
}

export interface ModbusReadTransactionRequest {
  unitId: number;
  functionCode: number;
  startAddress: number;
  quantity: number;
}

export interface DecodeReadResponseInput {
  response: Buffer;
  transactionId: number;
  expectedQuantity: number;
  expectedUnitId: number;
  expectedFunctionCode: number;
}

export class ModbusTransaction {
  constructor(
    private readonly options: ModbusTransactionOptions,
    private readonly transport: ModbusTransport,
    private readonly nextTransactionId: () => number,
    private readonly logDebug: (message: string) => void,
  ) {}

  readRegisters(request: ModbusReadTransactionRequest): Promise<number[]> {
    if (request.startAddress < 0 || request.startAddress > 0xffff) {
      return Promise.reject(new Error(`Invalid Modbus register start ${request.startAddress}`));
    }

    const transactionId = this.nextTransactionId();
    const frame = this.buildReadRequestFrame(transactionId, request);
    this.logDebug(`Sending Modbus request tx=${transactionId} bytes=${frame.length} hex=${toHex(frame)}`);

    return this.transport.send({
      host: this.options.host,
      port: this.options.port,
      timeoutMs: this.options.timeoutMs,
      request: frame,
      isCompleteResponse: response => this.isCompleteFrame(response),
    }).then(response => {
      this.logDebug(
        `Received Modbus response tx=${transactionId} chunkBytes=${response.length} totalBytes=${response.length} hex=${toHex(response)}`,
      );

      const parsed = tryParseReadResponse({
        response,
        transactionId,
        expectedQuantity: request.quantity,
        expectedUnitId: request.unitId,
        expectedFunctionCode: request.functionCode,
      });

      if (!parsed) {
        throw new Error('Incomplete Modbus response frame');
      }

      this.logDebug(`Parsed Modbus response tx=${transactionId} registers=${parsed.length}`);
      return parsed;
    }).catch(error => {
      const context = `(unit=${request.unitId}, function=${request.functionCode}, `
        + `start=${request.startAddress}, quantity=${request.quantity})`;

      if (error instanceof Error) {
        error.message = `${error.message} ${context}`;
        throw error;
      }

      throw new Error(`${String(error)} ${context}`);
    });
  }

  private buildReadRequestFrame(transactionId: number, request: ModbusReadTransactionRequest): Buffer {
    const frame = Buffer.alloc(12);
    frame.writeUInt16BE(transactionId, 0);
    frame.writeUInt16BE(0, 2);
    frame.writeUInt16BE(6, 4);
    frame.writeUInt8(request.unitId, 6);
    frame.writeUInt8(request.functionCode, 7);
    frame.writeUInt16BE(request.startAddress, 8);
    frame.writeUInt16BE(request.quantity, 10);
    return frame;
  }

  private isCompleteFrame(response: Buffer): boolean {
    if (response.length < 6) {
      return false;
    }

    const length = response.readUInt16BE(4);
    return response.length >= (6 + length);
  }
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

function toHex(buffer: Buffer): string {
  return Array.from(buffer, byte => byte.toString(16).padStart(2, '0')).join(' ');
}