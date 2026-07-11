import type { ReadProfile } from './modbusReadProfile.js';
import { DefaultReadRangePolicy, type ReadRangePolicy } from './modbusReadRangePolicy.js';
import { ModbusTransaction } from './modbusTransaction.js';
import type { ModbusTransport } from './modbusTransport.js';
import { READ_RANGES, type RegisterRange } from './registerCatalog.js';
import { decodeAirobotStateFromSchema, type RegisterValues } from './registerSchema.js';
import type { AirobotState } from './types.js';

export interface ModbusReadPlanExecutorOptions {
  host: string;
  port: number;
  timeoutMs: number;
  humidifier: boolean;
  pm25Sensor: boolean;
}

export class ModbusReadPlanExecutor {
  private readonly transaction: ModbusTransaction;

  constructor(
    private readonly options: ModbusReadPlanExecutorOptions,
    transport: ModbusTransport,
    nextTransactionId: () => number,
    private readonly logDebug: (message: string) => void,
    private readonly ranges: RegisterRange[] = READ_RANGES,
    private readonly readRangePolicy: ReadRangePolicy = new DefaultReadRangePolicy(),
  ) {
    this.transaction = new ModbusTransaction(
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
        const policyDecision = this.readRangePolicy.decide({ range, profile, error });
        if (policyDecision.errorDecision.action === 'skipOptionalRange') {
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

    return decodeAirobotStateFromSchema(values, {
      humidifier: this.options.humidifier,
      pm25Sensor: this.options.pm25Sensor,
    });
  }

  private readRegisters(range: RegisterRange, profile: ReadProfile): Promise<number[]> {
    const policyDecision = this.readRangePolicy.decide({ range, profile });
    const functionCode = policyDecision.functionCodeDecision.functionCode;
    const startAddress = range.start + profile.variant.registerAddressOffset;
    this.logDebug(
      `Opening Modbus TCP connection to ${this.options.host}:${this.options.port} `
      + `(unit=${profile.unitId}, function=${functionCode}, `
      + `start=${startAddress}, quantity=${range.quantity})`,
    );

    return this.transaction.readRegisters({
      unitId: profile.unitId,
      functionCode,
      startAddress,
      quantity: range.quantity,
    }).then(parsed => {
      this.logDebug(`Register values ${formatRegisterValues(startAddress, parsed)}`);
      return parsed;
    });
  }
}

function formatRegisterValues(startAddress: number, values: number[]): string {
  return values
    .map((value, index) => `${startAddress + index}=${value}`)
    .join(', ');
}
