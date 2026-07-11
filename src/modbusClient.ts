import { ModbusProfileSelector } from './modbusProfileSelector.js';
import { isPlausibleState, shouldTryNextProfile } from './modbusReadPolicy.js';
import { ModbusReadPlanExecutor } from './modbusReadPlanExecutor.js';
import type { ModbusTransport } from './modbusTransport.js';
import { ModbusTcpTransport } from './modbusTcpTransport.js';
import type { AirobotReadOptions, AirobotState } from './types.js';

export class AirobotModbusClient {
  private transactionId = 0;
  private readonly profileSelector: ModbusProfileSelector;
  private readonly readPlanExecutor: ModbusReadPlanExecutor;

  constructor(private readonly options: AirobotReadOptions, transport?: ModbusTransport) {
    this.profileSelector = new ModbusProfileSelector(this.options.unitId);
    const resolvedTransport = transport ?? new ModbusTcpTransport(message => this.logDebug(`[Transport] ${message}`));
    this.readPlanExecutor = new ModbusReadPlanExecutor(
      {
        host: this.options.host,
        port: this.options.port,
        timeoutMs: this.options.timeoutMs,
        humidifier: this.options.humidifier,
        pm25Sensor: this.options.pm25Sensor,
      },
      resolvedTransport,
      () => this.nextTransactionId(),
      message => this.logDebug(message),
    );
  }

  async readState(): Promise<AirobotState> {
    const profiles = this.profileSelector.buildCandidateProfiles(this.options.unitId);
    let lastError: unknown;

    for (const profile of profiles) {
      try {
        const state = await this.readPlanExecutor.readStateWithProfile(profile);
        if (!isPlausibleState(state)) {
          this.logDebug(
            `Rejecting Modbus profile unit=${profile.unitId} `
            + `function=${profile.variant.functionCode} offset=${profile.variant.registerAddressOffset} `
            + 'due to implausible values',
          );
          continue;
        }

        this.profileSelector.markSuccessfulProfile(profile);
        this.logDebug(
          `Selected Modbus profile unit=${profile.unitId} function=${profile.variant.functionCode} offset=${profile.variant.registerAddressOffset}`,
        );
        return state;
      } catch (error) {
        lastError = error;
        if (!shouldTryNextProfile(error)) {
          throw error;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Failed to read Airobot Modbus state with all variants');
  }

  private nextTransactionId(): number {
    this.transactionId = (this.transactionId + 1) % 0xffff;
    return this.transactionId;
  }

  private logDebug(message: string) {
    this.options.debugLog?.(message);
  }
}

