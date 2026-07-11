import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';

import { ModbusExceptionError } from '../dist/modbusErrors.js';
import { ModbusReadPlanExecutor } from '../dist/modbusReadPlanExecutor.js';
import { ModbusScriptedTransport } from '../dist/modbusScriptedTransport.js';

function buildResponse({
  transactionId,
  unitId,
  functionCode,
  payload,
}) {
  const length = 1 + 1 + 1 + payload.length;
  const buffer = Buffer.alloc(6 + length);
  buffer.writeUInt16BE(transactionId, 0);
  buffer.writeUInt16BE(0, 2);
  buffer.writeUInt16BE(length, 4);
  buffer.writeUInt8(unitId, 6);
  buffer.writeUInt8(functionCode, 7);
  buffer.writeUInt8(payload.length, 8);
  payload.copy(buffer, 9);
  return buffer;
}

function createExecutor({ steps, ranges, readRangePolicy }) {
  let tx = 0;
  return new ModbusReadPlanExecutor(
    {
      host: '127.0.0.1',
      port: 502,
      timeoutMs: 1000,
      humidifier: false,
      pm25Sensor: false,
    },
    new ModbusScriptedTransport(steps),
    () => {
      tx += 1;
      return tx;
    },
    () => {},
    ranges,
    readRangePolicy,
  );
}

test('skips optional illegal-data-address range and continues decoding', async () => {
  const executor = createExecutor({
    ranges: [
      { start: 4020, quantity: 1, optional: true, functionCode: 1 },
      { start: 1000, quantity: 1, functionCode: 3 },
    ],
    steps: [
      {
        error: new ModbusExceptionError(2, 1),
      },
      {
        response: buildResponse({
          transactionId: 2,
          unitId: 1,
          functionCode: 3,
          payload: Buffer.from([0x07, 0xd2]),
        }),
      },
    ],
  });

  const state = await executor.readStateWithProfile({
    unitId: 1,
    variant: {
      functionCode: 4,
      registerAddressOffset: 0,
    },
  });

  assert.equal(state.firmwareVersion, '20.02');
});

test('throws on illegal-data-address for non-optional range', async () => {
  const executor = createExecutor({
    ranges: [
      { start: 4020, quantity: 1, optional: false, functionCode: 1 },
    ],
    steps: [
      {
        error: new ModbusExceptionError(2, 1),
      },
    ],
  });

  await assert.rejects(
    () => executor.readStateWithProfile({
      unitId: 1,
      variant: {
        functionCode: 4,
        registerAddressOffset: 0,
      },
    }),
    /Modbus exception 2 for function 1/,
  );
});

test('uses holding-register function code for 2xxx address even when profile variant is FC04', async () => {
  const executor = createExecutor({
    ranges: [
      { start: 2017, quantity: 1 },
    ],
    steps: [
      {
        match: request => request.request.readUInt8(7) === 3 && request.request.readUInt16BE(8) === 2017,
        response: buildResponse({
          transactionId: 1,
          unitId: 1,
          functionCode: 3,
          payload: Buffer.from([0x00, 0x64]),
        }),
      },
    ],
  });

  const state = await executor.readStateWithProfile({
    unitId: 1,
    variant: {
      functionCode: 4,
      registerAddressOffset: 0,
    },
  });

  assert.equal(state.filterReminderIntervalHours, 100);
});

test('uses injected read-range policy function-code decision', async () => {
  const readRangePolicy = {
    decide() {
      return {
        functionCodeDecision: {
          functionCode: 4,
          reason: 'profile-function-code',
        },
        errorDecision: {
          action: 'rethrow',
          reason: 'rethrow',
        },
      };
    },
  };

  const executor = createExecutor({
    ranges: [
      { start: 2017, quantity: 1 },
    ],
    steps: [
      {
        match: request => request.request.readUInt8(7) === 4 && request.request.readUInt16BE(8) === 2017,
        response: buildResponse({
          transactionId: 1,
          unitId: 1,
          functionCode: 4,
          payload: Buffer.from([0x00, 0x64]),
        }),
      },
    ],
    readRangePolicy,
  });

  const state = await executor.readStateWithProfile({
    unitId: 1,
    variant: {
      functionCode: 4,
      registerAddressOffset: 0,
    },
  });

  assert.equal(state.filterReminderIntervalHours, 100);
});

test('uses injected read-range policy error decision', async () => {
  const readRangePolicy = {
    decide({ error }) {
      return {
        functionCodeDecision: {
          functionCode: 1,
          reason: 'explicit-range-function-code',
        },
        errorDecision: error
          ? {
            action: 'skipOptionalRange',
            reason: 'optional-illegal-data-address',
          }
          : {
            action: 'rethrow',
            reason: 'rethrow',
          },
      };
    },
  };

  const executor = createExecutor({
    ranges: [
      { start: 4020, quantity: 1, optional: false },
      { start: 1000, quantity: 1, functionCode: 3 },
    ],
    steps: [
      {
        error: new ModbusExceptionError(1, 1),
      },
      {
        response: buildResponse({
          transactionId: 2,
          unitId: 1,
          functionCode: 1,
          payload: Buffer.from([0x01]),
        }),
      },
    ],
    readRangePolicy,
  });

  const state = await executor.readStateWithProfile({
    unitId: 1,
    variant: {
      functionCode: 4,
      registerAddressOffset: 0,
    },
  });

  assert.equal(state.firmwareVersion, '0.01');
});
