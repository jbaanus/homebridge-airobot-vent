import assert from 'node:assert/strict';
import test from 'node:test';

import { isIllegalDataAddressError, isPlausibleState, shouldTryNextProfile } from '../dist/modbusReadPolicy.js';

test('shouldTryNextProfile returns true for retryable Modbus errors', () => {
  assert.equal(shouldTryNextProfile(new Error('Modbus exception 1 for function 3')), true);
  assert.equal(shouldTryNextProfile(new Error('Modbus exception 2 for function 4')), true);
  assert.equal(shouldTryNextProfile(new Error('Unexpected Modbus function code 4')), true);
  assert.equal(shouldTryNextProfile(new Error('Unexpected Modbus unit id 255')), true);
});

test('shouldTryNextProfile returns false for non-retryable errors', () => {
  assert.equal(shouldTryNextProfile(new Error('ECONNREFUSED')), false);
  assert.equal(shouldTryNextProfile({ message: 'Modbus exception 2' }), false);
});

test('isIllegalDataAddressError detects exception 2', () => {
  assert.equal(isIllegalDataAddressError(new Error('Modbus exception 2 for function 4')), true);
  assert.equal(isIllegalDataAddressError(new Error('Modbus exception 1 for function 4')), false);
  assert.equal(isIllegalDataAddressError(undefined), false);
});

test('isPlausibleState accepts in-range values', () => {
  const state = {
    temperatures: { extract: 20, supply: 21, outside: -5, exhaust: 22 },
    humidity: { extract: 40, supply: 45, outside: 50, exhaust: 55 },
    pm25: 120,
  };

  assert.equal(isPlausibleState(state), true);
});

test('isPlausibleState rejects out-of-range values', () => {
  const invalidTemperature = {
    temperatures: { extract: 150, supply: 21, outside: -5, exhaust: 22 },
    humidity: { extract: 40, supply: 45, outside: 50, exhaust: 55 },
    pm25: 120,
  };
  assert.equal(isPlausibleState(invalidTemperature), false);

  const invalidHumidity = {
    temperatures: { extract: 20, supply: 21, outside: -5, exhaust: 22 },
    humidity: { extract: 140, supply: 45, outside: 50, exhaust: 55 },
    pm25: 120,
  };
  assert.equal(isPlausibleState(invalidHumidity), false);

  const invalidPm = {
    temperatures: { extract: 20, supply: 21, outside: -5, exhaust: 22 },
    humidity: { extract: 40, supply: 45, outside: 50, exhaust: 55 },
    pm25: 2000,
  };
  assert.equal(isPlausibleState(invalidPm), false);
});
