export class InvalidModbusTcpResponseHeaderError extends Error {
  constructor() {
    super('Invalid Modbus TCP response header');
    this.name = 'InvalidModbusTcpResponseHeaderError';
  }
}

export class UnexpectedModbusUnitIdError extends Error {
  constructor(unitId: number) {
    super(`Unexpected Modbus unit id ${unitId}`);
    this.name = 'UnexpectedModbusUnitIdError';
  }
}

export class UnexpectedModbusFunctionCodeError extends Error {
  constructor(functionCode: number) {
    super(`Unexpected Modbus function code ${functionCode}`);
    this.name = 'UnexpectedModbusFunctionCodeError';
  }
}

export class ModbusExceptionError extends Error {
  constructor(
    public readonly exceptionCode: number,
    public readonly expectedFunctionCode: number,
  ) {
    super(`Modbus exception ${exceptionCode} for function ${expectedFunctionCode}`);
    this.name = 'ModbusExceptionError';
  }
}
