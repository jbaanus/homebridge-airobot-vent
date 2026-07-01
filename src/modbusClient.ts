import net from 'node:net';

import { READ_RANGES, decodeAirobotState, type RegisterRange, type RegisterValues } from './registers.js';
import type { AirobotReadOptions, AirobotState } from './types.js';

const MODBUS_READ_HOLDING_REGISTERS = 3;

export class AirobotModbusClient {
  private transactionId = 0;

  constructor(private readonly options: AirobotReadOptions) {
  }

  async readState(): Promise<AirobotState> {
    const values: RegisterValues = new Map();

    for (const range of READ_RANGES) {
      const registers = await this.readHoldingRegisters(range);
      registers.forEach((value, index) => values.set(range.start + index, value));
    }

    return decodeAirobotState(values);
  }

  private readHoldingRegisters(range: RegisterRange): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({
        host: this.options.host,
        port: this.options.port,
      });
      const transactionId = this.nextTransactionId();
      const request = this.buildReadRequest(transactionId, range);
      const chunks: Buffer[] = [];
      let settled = false;

      const finish = (error?: Error, values?: number[]) => {
        if (settled) {
          return;
        }

        settled = true;
        socket.destroy();

        if (error) {
          reject(error);
        } else {
          resolve(values ?? []);
        }
      };

      socket.setTimeout(this.options.timeoutMs);
      socket.once('connect', () => socket.write(request));
      socket.once('timeout', () => finish(new Error(`Modbus request to ${this.options.host} timed out`)));
      socket.once('error', error => finish(error));
      socket.on('data', chunk => {
        chunks.push(chunk);
        const response = Buffer.concat(chunks);
        try {
          const parsed = this.tryParseReadResponse(response, transactionId, range.quantity);
          if (parsed) {
            finish(undefined, parsed);
          }
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  }

  private buildReadRequest(transactionId: number, range: RegisterRange): Buffer {
    const buffer = Buffer.alloc(12);
    buffer.writeUInt16BE(transactionId, 0);
    buffer.writeUInt16BE(0, 2);
    buffer.writeUInt16BE(6, 4);
    buffer.writeUInt8(this.options.unitId, 6);
    buffer.writeUInt8(MODBUS_READ_HOLDING_REGISTERS, 7);
    buffer.writeUInt16BE(range.start, 8);
    buffer.writeUInt16BE(range.quantity, 10);
    return buffer;
  }

  private tryParseReadResponse(response: Buffer, transactionId: number, expectedQuantity: number): number[] | undefined {
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
      throw new Error('Invalid Modbus TCP response header');
    }

    const functionCode = response.readUInt8(7);
    if ((functionCode & 0x80) !== 0) {
      const exceptionCode = response.readUInt8(8);
      throw new Error(`Modbus exception ${exceptionCode}`);
    }

    if (functionCode !== MODBUS_READ_HOLDING_REGISTERS) {
      throw new Error(`Unexpected Modbus function code ${functionCode}`);
    }

    const byteCount = response.readUInt8(8);
    if (byteCount !== expectedQuantity * 2) {
      throw new Error(`Unexpected Modbus byte count ${byteCount}`);
    }

    const values: number[] = [];
    for (let offset = 9; offset < 9 + byteCount; offset += 2) {
      values.push(response.readUInt16BE(offset));
    }

    return values;
  }

  private nextTransactionId(): number {
    this.transactionId = (this.transactionId + 1) % 0xffff;
    return this.transactionId;
  }
}
