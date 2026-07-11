export interface ReadVariant {
  functionCode: number;
  registerAddressOffset: number;
}

export interface ReadProfile {
  unitId: number;
  variant: ReadVariant;
}