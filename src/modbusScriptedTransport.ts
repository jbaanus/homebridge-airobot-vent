import type { ModbusTransport, ModbusTransportRequest } from './modbusTransport.js';

export interface ScriptedTransportStep {
  match?: (request: ModbusTransportRequest) => boolean;
  response?: Buffer;
  error?: Error;
}

export class ModbusScriptedTransport implements ModbusTransport {
  private readonly steps: ScriptedTransportStep[];

  constructor(steps: ScriptedTransportStep[]) {
    this.steps = [...steps];
  }

  send(request: ModbusTransportRequest): Promise<Buffer> {
    const step = this.steps.shift();
    if (!step) {
      return Promise.reject(new Error('No scripted Modbus transport step available'));
    }

    if (step.match && !step.match(request)) {
      return Promise.reject(new Error('Scripted Modbus transport step did not match request'));
    }

    if (step.error) {
      return Promise.reject(step.error);
    }

    if (!step.response) {
      return Promise.reject(new Error('Scripted Modbus transport step has no response'));
    }

    return Promise.resolve(step.response);
  }
}
