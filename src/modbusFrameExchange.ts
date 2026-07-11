import { tryParseReadResponse } from './modbusResponseDecoder.js';
import type { ModbusTransport } from './modbusTransport.js';

export interface ModbusFrameExchangeOptions {
  host: string;
  port: number;
  timeoutMs: number;
}

export interface ModbusReadFrameRequest {
  unitId: number;
  functionCode: number;
  startAddress: number;
  quantity: number;
}

export class ModbusFrameExchange {
  constructor(
    private readonly options: ModbusFrameExchangeOptions,
    private readonly transport: ModbusTransport,
    private readonly nextTransactionId: () => number,
    private readonly logDebug: (message: string) => void,
  ) {}

  readRegisters(request: ModbusReadFrameRequest): Promise<number[]> {
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

  private buildReadRequestFrame(transactionId: number, request: ModbusReadFrameRequest): Buffer {
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

function toHex(buffer: Buffer): string {
  return Array.from(buffer, byte => byte.toString(16).padStart(2, '0')).join(' ');
}