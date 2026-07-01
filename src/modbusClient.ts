import net from 'node:net';

import { READ_RANGES, decodeAirobotState, type RegisterRange, type RegisterValues } from './registers.js';
import type { AirobotReadOptions, AirobotState } from './types.js';

const MODBUS_READ_HOLDING_REGISTERS = 3;
const MODBUS_READ_INPUT_REGISTERS = 4;

interface ReadVariant {
  functionCode: number;
  registerAddressOffset: number;
}

export class AirobotModbusClient {
  private transactionId = 0;
  private selectedVariant: ReadVariant = {
    functionCode: MODBUS_READ_HOLDING_REGISTERS,
    registerAddressOffset: 0,
  };

  constructor(private readonly options: AirobotReadOptions) {
  }

  async readState(): Promise<AirobotState> {
    const values: RegisterValues = new Map();

    for (const range of READ_RANGES) {
      const registers = await this.readRegistersWithFallback(range);
      registers.forEach((value, index) => values.set(range.start + index, value));
    }

    return decodeAirobotState(values);
  }

  private async readRegistersWithFallback(range: RegisterRange): Promise<number[]> {
    const variants = this.buildCandidateVariants();
    let lastError: unknown;

    for (const variant of variants) {
      try {
        const values = await this.readRegisters(range, variant);
        this.selectedVariant = variant;
        return values;
      } catch (error) {
        lastError = error;
        if (!this.shouldTryNextVariant(error)) {
          throw error;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private readRegisters(range: RegisterRange, variant: ReadVariant): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({
        host: this.options.host,
        port: this.options.port,
      });
      const transactionId = this.nextTransactionId();
      const request = this.buildReadRequest(transactionId, range, variant);
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
        if (!Buffer.isBuffer(chunk)) {
          finish(new Error('Unexpected string data from Modbus socket'));
          return;
        }

        chunks.push(chunk);
        const response = Buffer.concat(chunks);
        try {
          const parsed = this.tryParseReadResponse(response, transactionId, range.quantity, variant.functionCode);
          if (parsed) {
            finish(undefined, parsed);
          }
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  }

  private buildReadRequest(transactionId: number, range: RegisterRange, variant: ReadVariant): Buffer {
    const startAddress = range.start + variant.registerAddressOffset;
    if (startAddress < 0 || startAddress > 0xffff) {
      throw new Error(`Invalid Modbus register start ${startAddress}`);
    }

    const buffer = Buffer.alloc(12);
    buffer.writeUInt16BE(transactionId, 0);
    buffer.writeUInt16BE(0, 2);
    buffer.writeUInt16BE(6, 4);
    buffer.writeUInt8(this.options.unitId, 6);
    buffer.writeUInt8(variant.functionCode, 7);
    buffer.writeUInt16BE(startAddress, 8);
    buffer.writeUInt16BE(range.quantity, 10);
    return buffer;
  }

  private buildCandidateVariants(): ReadVariant[] {
    const candidates: ReadVariant[] = [
      this.selectedVariant,
      { functionCode: MODBUS_READ_HOLDING_REGISTERS, registerAddressOffset: 0 },
      { functionCode: MODBUS_READ_HOLDING_REGISTERS, registerAddressOffset: -1 },
      { functionCode: MODBUS_READ_HOLDING_REGISTERS, registerAddressOffset: 1 },
      { functionCode: MODBUS_READ_INPUT_REGISTERS, registerAddressOffset: 0 },
      { functionCode: MODBUS_READ_INPUT_REGISTERS, registerAddressOffset: -1 },
      { functionCode: MODBUS_READ_INPUT_REGISTERS, registerAddressOffset: 1 },
    ];

    const seen = new Set<string>();
    return candidates.filter(candidate => {
      const key = `${candidate.functionCode}:${candidate.registerAddressOffset}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  private shouldTryNextVariant(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    return /Modbus exception\s+[12]\b/i.test(error.message);
  }

  private tryParseReadResponse(
    response: Buffer,
    transactionId: number,
    expectedQuantity: number,
    expectedFunctionCode: number,
  ): number[] | undefined {
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
      throw new Error(`Modbus exception ${exceptionCode} for function ${expectedFunctionCode}`);
    }

    if (functionCode !== expectedFunctionCode) {
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
