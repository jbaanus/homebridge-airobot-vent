import { tryParseReadResponse } from './modbusResponseDecoder.js';
import type { ModbusTransport } from './modbusTransport.js';
import { ModbusTcpTransport } from './modbusTcpTransport.js';
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
  private readonly transport: ModbusTransport;

  constructor(private readonly options: AirobotReadOptions, transport?: ModbusTransport) {
    this.selectedProfile = {
      unitId: this.options.unitId,
      variant: {
        functionCode: MODBUS_READ_HOLDING_REGISTERS,
        registerAddressOffset: 0,
      },
    };
    this.transport = transport ?? new ModbusTcpTransport(message => this.logDebug(`[Transport] ${message}`));
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
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `${message} (unit=${profile.unitId}, function=${functionCode}, `
        + `start=${range.start + profile.variant.registerAddressOffset}, quantity=${range.quantity})`,
      );
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

function formatRegisterValues(startAddress: number, values: number[]): string {
  return values
    .map((value, index) => `${startAddress + index}=${value}`)
    .join(', ');
}

