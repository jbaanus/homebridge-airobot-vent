import { ModbusFrameExchange } from './modbusFrameExchange.js';
import type { ReadProfile } from './modbusReadProfile.js';
import { isIllegalDataAddressError } from './modbusReadPolicy.js';
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
  private readonly frameExchange: ModbusFrameExchange;

  constructor(
    private readonly options: ModbusReadPlanExecutorOptions,
    transport: ModbusTransport,
    nextTransactionId: () => number,
    private readonly logDebug: (message: string) => void,
    private readonly ranges: RegisterRange[] = READ_RANGES,
  ) {
    this.frameExchange = new ModbusFrameExchange(
      {
        host: this.options.host,
        port: this.options.port,
        timeoutMs: this.options.timeoutMs,
      },
      transport,
      nextTransactionId,
      this.logDebug,
    );
  }

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
    const startAddress = range.start + profile.variant.registerAddressOffset;
    this.logDebug(
      `Opening Modbus TCP connection to ${this.options.host}:${this.options.port} `
      + `(unit=${profile.unitId}, function=${functionCode}, `
      + `start=${startAddress}, quantity=${range.quantity})`,
    );

    return this.frameExchange.readRegisters({
      unitId: profile.unitId,
      functionCode,
      startAddress,
      quantity: range.quantity,
    }).then(parsed => {
      this.logDebug(`Register values ${formatRegisterValues(startAddress, parsed)}`);
      return parsed;
    });
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

function formatRegisterValues(startAddress: number, values: number[]): string {
  return values
    .map((value, index) => `${startAddress + index}=${value}`)
    .join(', ');
}
