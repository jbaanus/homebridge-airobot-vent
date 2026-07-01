import net from 'node:net';

import { READ_RANGES, decodeAirobotState, type RegisterRange, type RegisterValues } from './registers.js';
import type { AirobotReadOptions, AirobotState } from './types.js';

const MODBUS_READ_HOLDING_REGISTERS = 3;
const MODBUS_READ_INPUT_REGISTERS = 4;

interface ReadVariant {
  functionCode: number;
  registerAddressOffset: number;
}

interface ReadProfile {
  unitId: number;
  variant: ReadVariant;
}

export class AirobotModbusClient {
  private transactionId = 0;
  private selectedProfile: ReadProfile;

  constructor(private readonly options: AirobotReadOptions) {
    this.selectedProfile = {
      unitId: this.options.unitId,
      variant: {
        functionCode: MODBUS_READ_HOLDING_REGISTERS,
        registerAddressOffset: 0,
      },
    };
  }

  async readState(): Promise<AirobotState> {
    const profiles = this.buildCandidateProfiles();
    let lastError: unknown;

    for (const profile of profiles) {
      try {
        const state = await this.readStateWithProfile(profile);
        if (!this.isPlausibleState(state)) {
          this.logDebug(
            `Rejecting Modbus profile unit=${profile.unitId} `
            + `function=${profile.variant.functionCode} offset=${profile.variant.registerAddressOffset} `
            + 'due to implausible values',
          );
          continue;
        }

        this.selectedProfile = profile;
        this.logDebug(
          `Selected Modbus profile unit=${profile.unitId} function=${profile.variant.functionCode} offset=${profile.variant.registerAddressOffset}`,
        );
        return state;
      } catch (error) {
        lastError = error;
        if (!this.shouldTryNextProfile(error)) {
          throw error;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Failed to read Airobot Modbus state with all variants');
  }

  private async readStateWithProfile(profile: ReadProfile): Promise<AirobotState> {
    const values: RegisterValues = new Map();

    for (const range of READ_RANGES) {
      try {
        const registers = await this.readRegisters(range, profile);
        registers.forEach((value, index) => values.set(range.start + index, value));
      } catch (error) {
        if (range.optional && this.isIllegalDataAddressError(error)) {
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
    return new Promise((resolve, reject) => {
      this.logDebug(
        `Opening Modbus TCP connection to ${this.options.host}:${this.options.port} `
        + `(unit=${profile.unitId}, function=${profile.variant.functionCode}, `
        + `start=${range.start + profile.variant.registerAddressOffset}, quantity=${range.quantity})`,
      );

      const socket = net.createConnection({
        host: this.options.host,
        port: this.options.port,
      });
      const transactionId = this.nextTransactionId();
      const request = this.buildReadRequest(transactionId, range, profile);
      this.logDebug(
        `Sending Modbus request tx=${transactionId} bytes=${request.length} hex=${toHex(request)}`,
      );
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
      socket.once('connect', () => {
        this.logDebug(`Connected to ${this.options.host}:${this.options.port} tx=${transactionId}`);
        socket.write(request);
      });
      socket.once('timeout', () => finish(new Error(`Modbus request to ${this.options.host} timed out`)));
      socket.once('error', error => finish(error));
      socket.on('data', chunk => {
        if (!Buffer.isBuffer(chunk)) {
          finish(new Error('Unexpected string data from Modbus socket'));
          return;
        }

        chunks.push(chunk);
        const response = Buffer.concat(chunks);
        this.logDebug(
          `Received Modbus response tx=${transactionId} chunkBytes=${chunk.length} totalBytes=${response.length} hex=${toHex(response)}`,
        );
        try {
          const parsed = this.tryParseReadResponse(
            response,
            transactionId,
            range.quantity,
            profile.unitId,
            profile.variant.functionCode,
          );
          if (parsed) {
            this.logDebug(`Parsed Modbus response tx=${transactionId} registers=${parsed.length}`);
            finish(undefined, parsed);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          finish(new Error(
            `${message} (unit=${profile.unitId}, function=${profile.variant.functionCode}, `
            + `start=${range.start + profile.variant.registerAddressOffset}, quantity=${range.quantity})`,
          ));
        }
      });
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
    buffer.writeUInt8(profile.variant.functionCode, 7);
    buffer.writeUInt16BE(startAddress, 8);
    buffer.writeUInt16BE(range.quantity, 10);
    return buffer;
  }

  private buildCandidateProfiles(): ReadProfile[] {
    const variants: ReadVariant[] = [
      this.selectedProfile.variant,
      { functionCode: MODBUS_READ_HOLDING_REGISTERS, registerAddressOffset: 0 },
      { functionCode: MODBUS_READ_HOLDING_REGISTERS, registerAddressOffset: -1 },
      { functionCode: MODBUS_READ_INPUT_REGISTERS, registerAddressOffset: 0 },
      { functionCode: MODBUS_READ_INPUT_REGISTERS, registerAddressOffset: -1 },
    ];

    const candidateUnitIds = this.buildCandidateUnitIds();
    const candidates: ReadProfile[] = [
      this.selectedProfile,
      ...candidateUnitIds.flatMap(unitId => variants.map(variant => ({ unitId, variant }))),
    ];

    const seen = new Set<string>();
    return candidates.filter(candidate => {
      const key = `${candidate.unitId}:${candidate.variant.functionCode}:${candidate.variant.registerAddressOffset}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  private buildCandidateUnitIds(): number[] {
    const candidates = [
      this.selectedProfile.unitId,
      this.options.unitId,
      1,
      255,
      0,
    ].filter(unitId => Number.isInteger(unitId) && unitId >= 0 && unitId <= 255);

    const seen = new Set<number>();
    return candidates.filter(unitId => {
      if (seen.has(unitId)) {
        return false;
      }

      seen.add(unitId);
      return true;
    });
  }

  private shouldTryNextProfile(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    return /Modbus exception\s+[12]\b/i.test(error.message)
      || /Unexpected Modbus function code/i.test(error.message)
      || /Unexpected Modbus unit id/i.test(error.message);
  }

  private isIllegalDataAddressError(error: unknown): boolean {
    return error instanceof Error && /Modbus exception\s+2\b/i.test(error.message);
  }

  private isPlausibleState(state: AirobotState): boolean {
    const temperatureValues = Object.values(state.temperatures).filter((value): value is number => typeof value === 'number');
    const humidityValues = Object.values(state.humidity).filter((value): value is number => typeof value === 'number');

    const hasInvalidTemperature = temperatureValues.some(value => value < -50 || value > 100);
    const hasInvalidHumidity = humidityValues.some(value => value < 0 || value > 100);
    const hasInvalidPm25 = typeof state.pm25 === 'number' && (state.pm25 < 0 || state.pm25 > 1000);

    return !hasInvalidTemperature && !hasInvalidHumidity && !hasInvalidPm25;
  }

  private tryParseReadResponse(
    response: Buffer,
    transactionId: number,
    expectedQuantity: number,
    expectedUnitId: number,
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

    const responseUnitId = response.readUInt8(6);
    if (responseUnitId !== expectedUnitId) {
      throw new Error(`Unexpected Modbus unit id ${responseUnitId}`);
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

  private logDebug(message: string) {
    this.options.debugLog?.(message);
  }
}

function toHex(buffer: Buffer): string {
  return Array.from(buffer, byte => byte.toString(16).padStart(2, '0')).join(' ');
}
