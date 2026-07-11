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
  const intent = policy.createExecutionIntent({
    range: { start: 4020, quantity: 1, functionCode: 1 },
    profile,
  });

  assert.equal(intent.request.functionCode, 1);
  assert.equal(intent.requestReason, 'explicit-range-function-code');
});

test('2xxx and 4xxx addresses use holding-register function code', () => {
  const policy = new DefaultReadRangePolicy();

  const twoX = policy.createExecutionIntent({
    range: { start: 2017, quantity: 1 },
    profile,
  });
  assert.equal(twoX.request.functionCode, 3);
  assert.equal(twoX.requestReason, 'holding-register-address');

  const fourX = policy.createExecutionIntent({
    range: { start: 4020, quantity: 1 },
    profile,
  });
  assert.equal(fourX.request.functionCode, 3);
  assert.equal(fourX.requestReason, 'holding-register-address');
});

test('non-2xxx/4xxx addresses fall back to profile function code', () => {
  const policy = new DefaultReadRangePolicy();
  const intent = policy.createExecutionIntent({
    range: { start: 1000, quantity: 1 },
    profile,
  });

  assert.equal(intent.request.functionCode, 4);
  assert.equal(intent.requestReason, 'profile-function-code');
});

test('optional range + illegal-data-address returns skip decision', () => {
  const policy = new DefaultReadRangePolicy();
  const intent = policy.createExecutionIntent({
    range: { start: 4020, quantity: 1, optional: true, functionCode: 1 },
    profile,
  });
  const decision = intent.decideError(new ModbusExceptionError(2, 1));

  assert.equal(decision.action, 'skipOptionalRange');
  assert.equal(decision.reason, 'optional-illegal-data-address');
});

test('all other error cases return rethrow decision', () => {
  const policy = new DefaultReadRangePolicy();

  const optionalIntent = policy.createExecutionIntent({
    range: { start: 4020, quantity: 1, optional: true, functionCode: 1 },
    profile,
  });
  const wrongException = optionalIntent.decideError(new ModbusExceptionError(1, 1));
  assert.equal(wrongException.action, 'rethrow');
  assert.equal(wrongException.reason, 'rethrow');

  const nonOptionalIntent = policy.createExecutionIntent({
    range: { start: 4020, quantity: 1, optional: false, functionCode: 1 },
    profile,
  });
  const nonOptional = nonOptionalIntent.decideError(new ModbusExceptionError(2, 1));
  assert.equal(nonOptional.action, 'rethrow');
  assert.equal(nonOptional.reason, 'rethrow');
});
