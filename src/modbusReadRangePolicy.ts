import { ModbusExceptionError } from './modbusErrors.js';
import type { ReadProfile } from './modbusReadProfile.js';
import type { RegisterRange } from './registers.js';

const MODBUS_READ_HOLDING_REGISTERS = 3;

export type FunctionCodeDecisionReason =
  | 'explicit-range-function-code'
  | 'holding-register-address'
  | 'profile-function-code';

export type ErrorDecisionReason =
  | 'optional-illegal-data-address'
  | 'rethrow';

export interface FunctionCodeDecision {
  functionCode: number;
  reason: FunctionCodeDecisionReason;
}

export interface ErrorDecision {
  action: 'skipOptionalRange' | 'rethrow';
  reason: ErrorDecisionReason;
}

export interface ReadRangePolicyDecision {
  functionCodeDecision: FunctionCodeDecision;
  errorDecision: ErrorDecision;
}

export interface ReadRangePolicyInput {
  range: RegisterRange;
  profile: ReadProfile;
  error?: unknown;
}

export interface ReadRangePolicy {
  decide(input: ReadRangePolicyInput): ReadRangePolicyDecision;
}

export class DefaultReadRangePolicy implements ReadRangePolicy {
  decide(input: ReadRangePolicyInput): ReadRangePolicyDecision {
    return {
      functionCodeDecision: this.decideFunctionCode(input.range, input.profile),
      errorDecision: this.decideError(input.range, input.error),
    };
  }

  private decideFunctionCode(range: RegisterRange, profile: ReadProfile): FunctionCodeDecision {
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