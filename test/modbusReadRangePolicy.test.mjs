import assert from 'node:assert/strict';
import test from 'node:test';

import { ModbusExceptionError } from '../dist/modbusErrors.js';
import { DefaultReadRangePolicy } from '../dist/modbusReadRangePolicy.js';

const profile = {
  unitId: 1,
  variant: {
    functionCode: 4,
    registerAddressOffset: 0,
  },
};

test('explicit function code wins with explicit reason', () => {
  const policy = new DefaultReadRangePolicy();
  const decision = policy.decide({
    range: { start: 4020, quantity: 1, functionCode: 1 },
    profile,
  });

  assert.equal(decision.functionCodeDecision.functionCode, 1);
  assert.equal(decision.functionCodeDecision.reason, 'explicit-range-function-code');
});

test('2xxx and 4xxx addresses use holding-register function code', () => {
  const policy = new DefaultReadRangePolicy();

  const twoX = policy.decide({
    range: { start: 2017, quantity: 1 },
    profile,
  });
  assert.equal(twoX.functionCodeDecision.functionCode, 3);
  assert.equal(twoX.functionCodeDecision.reason, 'holding-register-address');

  const fourX = policy.decide({
    range: { start: 4020, quantity: 1 },
    profile,
  });
  assert.equal(fourX.functionCodeDecision.functionCode, 3);
  assert.equal(fourX.functionCodeDecision.reason, 'holding-register-address');
});

test('non-2xxx/4xxx addresses fall back to profile function code', () => {
  const policy = new DefaultReadRangePolicy();
  const decision = policy.decide({
    range: { start: 1000, quantity: 1 },
    profile,
  });

  assert.equal(decision.functionCodeDecision.functionCode, 4);
  assert.equal(decision.functionCodeDecision.reason, 'profile-function-code');
});

test('optional range + illegal-data-address returns skip decision', () => {
  const policy = new DefaultReadRangePolicy();
  const decision = policy.decide({
    range: { start: 4020, quantity: 1, optional: true, functionCode: 1 },
    profile,
    error: new ModbusExceptionError(2, 1),
  });

  assert.equal(decision.errorDecision.action, 'skipOptionalRange');
  assert.equal(decision.errorDecision.reason, 'optional-illegal-data-address');
});

test('all other error cases return rethrow decision', () => {
  const policy = new DefaultReadRangePolicy();

  const wrongException = policy.decide({
    range: { start: 4020, quantity: 1, optional: true, functionCode: 1 },
    profile,
    error: new ModbusExceptionError(1, 1),
  });
  assert.equal(wrongException.errorDecision.action, 'rethrow');
  assert.equal(wrongException.errorDecision.reason, 'rethrow');

  const nonOptional = policy.decide({
    range: { start: 4020, quantity: 1, optional: false, functionCode: 1 },
    profile,
    error: new ModbusExceptionError(2, 1),
  });
  assert.equal(nonOptional.errorDecision.action, 'rethrow');
  assert.equal(nonOptional.errorDecision.reason, 'rethrow');
});
