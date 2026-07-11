import assert from 'node:assert/strict';
import test from 'node:test';

import { ModbusExceptionError } from '../dist/modbusErrors.js';
import { isIllegalDataAddressError } from '../dist/modbusReadPolicy.js';

test('isIllegalDataAddressError detects exception 2', () => {
  assert.equal(isIllegalDataAddressError(new Error('Modbus exception 2 for function 4')), false);
  assert.equal(isIllegalDataAddressError(new Error('Modbus exception 1 for function 4')), false);
  assert.equal(isIllegalDataAddressError(undefined), false);
});

test('isIllegalDataAddressError detects typed exception 2', () => {
  assert.equal(isIllegalDataAddressError(new ModbusExceptionError(2, 4)), true);
  assert.equal(isIllegalDataAddressError(new ModbusExceptionError(1, 4)), false);
});
