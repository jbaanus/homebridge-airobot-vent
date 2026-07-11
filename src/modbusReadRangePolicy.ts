import { ModbusExceptionError } from './modbusErrors.js';
import type { ReadProfile } from './modbusReadProfile.js';
import type { RegisterRange } from './registerCatalog.js';

const MODBUS_READ_HOLDING_REGISTERS = 3;

export type FunctionCodeDecisionReason =
  | 'explicit-range-function-code'
  | 'holding-register-address'
  | 'profile-function-code';

export type ErrorDecisionReason =
  | 'optional-illegal-data-address'
  | 'rethrow';

export interface ErrorDecision {
  action: 'skipOptionalRange' | 'rethrow';
  reason: ErrorDecisionReason;
}

export interface ReadRangePolicyIntentInput {
  range: RegisterRange;
  profile: ReadProfile;
}

export interface ReadRangeExecutionIntent {
  request: {
    unitId: number;
    functionCode: number;
    startAddress: number;
    quantity: number;
  };
  requestReason: FunctionCodeDecisionReason;
  decideError(error: unknown): ErrorDecision;
}

export interface ReadRangePolicy {
  createExecutionIntent(input: ReadRangePolicyIntentInput): ReadRangeExecutionIntent;
}

export class DefaultReadRangePolicy implements ReadRangePolicy {
  createExecutionIntent(input: ReadRangePolicyIntentInput): ReadRangeExecutionIntent {
    const functionCodeDecision = this.decideFunctionCode(input.range, input.profile);
    const startAddress = input.range.start + input.profile.variant.registerAddressOffset;

    return {
      request: {
        unitId: input.profile.unitId,
        functionCode: functionCodeDecision.functionCode,
        startAddress,
        quantity: input.range.quantity,
      },
      requestReason: functionCodeDecision.reason,
      decideError: error => this.decideError(input.range, error),
    };
  }

  private decideFunctionCode(range: RegisterRange, profile: ReadProfile): { functionCode: number; reason: FunctionCodeDecisionReason } {
    if (typeof range.functionCode === 'number') {
      return {
        functionCode: range.functionCode,
        reason: 'explicit-range-function-code',
      };
    }

    const startAddress = range.start + profile.variant.registerAddressOffset;
    if (this.isHoldingRegisterAddress(startAddress)) {
      return {
        functionCode: MODBUS_READ_HOLDING_REGISTERS,
        reason: 'holding-register-address',
      };
    }

    return {
      functionCode: profile.variant.functionCode,
      reason: 'profile-function-code',
    };
  }

  private decideError(range: RegisterRange, error: unknown): ErrorDecision {
    if (range.optional && isIllegalDataAddressError(error)) {
      return {
        action: 'skipOptionalRange',
        reason: 'optional-illegal-data-address',
      };
    }

    return {
      action: 'rethrow',
      reason: 'rethrow',
    };
  }

  private isHoldingRegisterAddress(address: number): boolean {
    return (address >= 2000 && address < 3000) || (address >= 4000 && address < 5000);
  }
}

function isIllegalDataAddressError(error: unknown): boolean {
  if (error instanceof ModbusExceptionError) {
    return error.exceptionCode === 2;
  }

  return false;
}