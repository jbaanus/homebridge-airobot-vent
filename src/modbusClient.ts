import { ModbusReadPlanExecutor } from './modbusReadPlanExecutor.js';
import type { ReadProfile } from './modbusReadProfile.js';
import type { ModbusTransport } from './modbusTransport.js';
import { ModbusTcpTransport } from './modbusTcpTransport.js';
import type { AirobotReadOptions, AirobotState } from './types.js';

export class AirobotModbusClient {
  private transactionId = 0;
  private readonly readPlanExecutor: ModbusReadPlanExecutor;
  private readonly fixedProfile: ReadProfile;

  constructor(private readonly options: AirobotReadOptions, transport?: ModbusTransport) {
    this.fixedProfile = {
      unitId: this.options.unitId,
      variant: {
        functionCode: 4,
        registerAddressOffset: 0,
      },
    };

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
    this.logDebug(
      `Using fixed Modbus profile unit=${this.fixedProfile.unitId} `
      + `function=${this.fixedProfile.variant.functionCode} offset=${this.fixedProfile.variant.registerAddressOffset}`,
    );
    return this.readPlanExecutor.readStateWithProfile(this.fixedProfile);
  }

  private nextTransactionId(): number {
    this.transactionId = (this.transactionId + 1) % 0xffff;
    return this.transactionId;
  }

  private logDebug(message: string) {
    this.options.debugLog?.(message);
  }
}

