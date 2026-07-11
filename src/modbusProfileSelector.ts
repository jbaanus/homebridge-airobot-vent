const MODBUS_READ_HOLDING_REGISTERS = 3;
const MODBUS_READ_INPUT_REGISTERS = 4;

export interface ReadVariant {
  functionCode: number;
  registerAddressOffset: number;
}

export interface ReadProfile {
  unitId: number;
  variant: ReadVariant;
}

export class ModbusProfileSelector {
  private selectedProfile: ReadProfile;

  constructor(unitId: number) {
    this.selectedProfile = {
      unitId,
      variant: {
        functionCode: MODBUS_READ_HOLDING_REGISTERS,
        registerAddressOffset: 0,
      },
    };
  }

  buildCandidateProfiles(configuredUnitId: number): ReadProfile[] {
    const variants: ReadVariant[] = [
      this.selectedProfile.variant,
      { functionCode: MODBUS_READ_HOLDING_REGISTERS, registerAddressOffset: 0 },
      { functionCode: MODBUS_READ_HOLDING_REGISTERS, registerAddressOffset: -1 },
      { functionCode: MODBUS_READ_INPUT_REGISTERS, registerAddressOffset: 0 },
      { functionCode: MODBUS_READ_INPUT_REGISTERS, registerAddressOffset: -1 },
    ];

    const candidateUnitIds = this.buildCandidateUnitIds(configuredUnitId);
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

  markSuccessfulProfile(profile: ReadProfile) {
    this.selectedProfile = profile;
  }

  private buildCandidateUnitIds(configuredUnitId: number): number[] {
    const candidates = [
      this.selectedProfile.unitId,
      configuredUnitId,
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
}
