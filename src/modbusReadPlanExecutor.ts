import type { ReadProfile } from './modbusReadProfile.js';
import { isIllegalDataAddressError } from './modbusReadPolicy.js';
import { tryParseReadResponse } from './modbusResponseDecoder.js';
import type { ModbusTransport } from './modbusTransport.js';
import { READ_RANGES, decodeAirobotState, type RegisterRange, type RegisterValues } from './registers.js';
import type { AirobotState } from './types.js';

const MODBUS_READ_HOLDING_REGISTERS = 3;

export interface ModbusReadPlanExecutorOptions {
  host: string;
  port: number;
  timeoutMs: number;
  humidifier: boolean;
  pm25Sensor: boolean;
}

export class ModbusReadPlanExecutor {
  constructor(
    private readonly options: ModbusReadPlanExecutorOptions,
    private readonly transport: ModbusTransport,
    private readonly nextTransactionId: () => number,
    private readonly logDebug: (message: string) => void,
    private readonly ranges: RegisterRange[] = READ_RANGES,
  ) {}

  async readStateWithProfile(profile: ReadProfile): Promise<AirobotState> {
    const values: RegisterValues = new Map();

    for (const range of this.ranges) {
      try {
        const registers = await this.readRegisters(range, profile);
        registers.forEach((value, index) => values.set(range.start + index, value));
      } catch (error) {
        if (range.optional && isIllegalDataAddressError(error)) {
          this.logDebug(
            `Skipping optional range start=${range.start} quantity=${range.quantity} `
            + `for unit=${profile.unitId} function=${profile.variant.functionCode} `
            + `offset=${profile.variant.registerAddressOffset} due to illegal data address`,
          );
          continue;
        }

        throw error;
      }
    }

    return decodeAirobotState(values, {
      humidifier: this.options.humidifier,
      pm25Sensor: this.options.pm25Sensor,
    });
  }

  private readRegisters(range: RegisterRange, profile: ReadProfile): Promise<number[]> {
    const functionCode = this.getFunctionCodeForRange(range, profile);
    this.logDebug(
      `Opening Modbus TCP connection to ${this.options.host}:${this.options.port} `
      + `(unit=${profile.unitId}, function=${functionCode}, `
      + `start=${range.start + profile.variant.registerAddressOffset}, quantity=${range.quantity})`,
    );

    const transactionId = this.nextTransactionId();
    const request = this.buildReadRequest(transactionId, range, profile);
    this.logDebug(
      `Sending Modbus request tx=${transactionId} bytes=${request.length} hex=${toHex(request)}`,
    );

    return this.transport.send({
      host: this.options.host,
      port: this.options.port,
      timeoutMs: this.options.timeoutMs,
      request,
    }).then(response => {
      this.logDebug(
        `Received Modbus response tx=${transactionId} chunkBytes=${response.length} totalBytes=${response.length} hex=${toHex(response)}`,
      );

      const parsed = tryParseReadResponse({
        response,
        transactionId,
        expectedQuantity: range.quantity,
        expectedUnitId: profile.unitId,
        expectedFunctionCode: functionCode,
      });

      if (!parsed) {
        throw new Error('Incomplete Modbus response frame');
      }

      const startAddress = range.start + profile.variant.registerAddressOffset;
      this.logDebug(`Parsed Modbus response tx=${transactionId} registers=${parsed.length}`);
      this.logDebug(`Register values tx=${transactionId} ${formatRegisterValues(startAddress, parsed)}`);
      return parsed;
    }).catch(error => {
      const context = `(unit=${profile.unitId}, function=${functionCode}, `
        + `start=${range.start + profile.variant.registerAddressOffset}, quantity=${range.quantity})`;

      if (error instanceof Error) {
        error.message = `${error.message} ${context}`;
        throw error;
      }

      throw new Error(`${String(error)} ${context}`);
    });
  }

  private buildReadRequest(transactionId: number, range: RegisterRange, profile: ReadProfile): Buffer {
    const startAddress = range.start + profile.variant.registerAddressOffset;
    if (startAddress < 0 || startAddress > 0xffff) {
      throw new Error(`Invalid Modbus register start ${startAddress}`);
    }

    const buffer = Buffer.alloc(12);
    buffer.writeUInt16BE(transactionId, 0);
    buffer.writeUInt16BE(0, 2);
    buffer.writeUInt16BE(6, 4);
    buffer.writeUInt8(profile.unitId, 6);
    buffer.writeUInt8(this.getFunctionCodeForRange(range, profile), 7);
    buffer.writeUInt16BE(startAddress, 8);
    buffer.writeUInt16BE(range.quantity, 10);
    return buffer;
  }

  private getFunctionCodeForRange(range: RegisterRange, profile: ReadProfile): number {
    if (typeof range.functionCode === 'number') {
      return range.functionCode;
    }

    const startAddress = range.start + profile.variant.registerAddressOffset;
    if (this.isHoldingRegisterAddress(startAddress)) {
      return MODBUS_READ_HOLDING_REGISTERS;
    }

    return profile.variant.functionCode;
  }

  private isHoldingRegisterAddress(address: number): boolean {
    return (address >= 2000 && address < 3000) || (address >= 4000 && address < 5000);
  }
}

function toHex(buffer: Buffer): string {
  return Array.from(buffer, byte => byte.toString(16).padStart(2, '0')).join(' ');
}

function formatRegisterValues(startAddress: number, values: number[]): string {
  return values
    .map((value, index) => `${startAddress + index}=${value}`)
    .join(', ');
}
