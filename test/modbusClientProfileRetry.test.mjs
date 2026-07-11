import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';

import { AirobotModbusClient } from '../dist/modbusClient.js';

class RecordingTransport {
  constructor(steps) {
    this.steps = [...steps];
    this.requests = [];
  }

  async send(request) {
    this.requests.push(request);
    const step = this.steps.shift();
    if (!step) {
      throw new Error('No scripted transport step available');
    }

    if (step.error) {
      throw step.error;
    }

    return step.response;
  }
}

function buildRegisterResponse({
  transactionId,
  unitId,
  functionCode,
  values,
}) {
  const payload = Buffer.alloc(values.length * 2);
  values.forEach((value, index) => payload.writeUInt16BE(value, index * 2));
  return buildResponse({ transactionId, unitId, functionCode, payload });
}

function buildCoilResponse({
  transactionId,
  unitId,
  functionCode,
  bits,
}) {
  const byteCount = Math.ceil(bits.length / 8);
  const payload = Buffer.alloc(byteCount);

  bits.forEach((bit, index) => {
    if (bit) {
      const byteIndex = Math.floor(index / 8);
      const bitIndex = index % 8;
      payload[byteIndex] |= (1 << bitIndex);
    }
  });

  return buildResponse({ transactionId, unitId, functionCode, payload });
}

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

test('retries next profile and then reuses selected profile on next poll', async () => {
  const transport = new RecordingTransport([
    { error: new Error('Modbus exception 2 for function 3') },
    { response: buildRegisterResponse({ transactionId: 2, unitId: 1, functionCode: 3, values: [100, ...Array(19).fill(0)] }) },
    { response: buildRegisterResponse({ transactionId: 3, unitId: 1, functionCode: 3, values: Array(10).fill(0) }) },
    { response: buildRegisterResponse({ transactionId: 4, unitId: 1, functionCode: 3, values: Array(2).fill(0) }) },
    { response: buildCoilResponse({ transactionId: 5, unitId: 1, functionCode: 1, bits: [0] }) },
    { response: buildRegisterResponse({ transactionId: 6, unitId: 1, functionCode: 3, values: [100, 0] }) },
    { response: buildRegisterResponse({ transactionId: 7, unitId: 1, functionCode: 3, values: [100, ...Array(19).fill(0)] }) },
    { response: buildRegisterResponse({ transactionId: 8, unitId: 1, functionCode: 3, values: Array(10).fill(0) }) },
    { response: buildRegisterResponse({ transactionId: 9, unitId: 1, functionCode: 3, values: Array(2).fill(0) }) },
    { response: buildCoilResponse({ transactionId: 10, unitId: 1, functionCode: 1, bits: [0] }) },
    { response: buildRegisterResponse({ transactionId: 11, unitId: 1, functionCode: 3, values: [100, 0] }) },
  ]);

  const client = new AirobotModbusClient({
    host: '127.0.0.1',
    port: 502,
    unitId: 1,
    timeoutMs: 1000,
    humidifier: false,
    pm25Sensor: false,
  }, transport);

  await client.readState();
  await client.readState();

  const startAddressFirstAttempt = transport.requests[0].request.readUInt16BE(8);
  const startAddressAfterRetry = transport.requests[1].request.readUInt16BE(8);
  const startAddressNextPoll = transport.requests[6].request.readUInt16BE(8);

  assert.equal(startAddressFirstAttempt, 1000);
  assert.equal(startAddressAfterRetry, 999);
  assert.equal(startAddressNextPoll, 999);
});

test('does not try next profile for non-retryable error', async () => {
  const transport = new RecordingTransport([
    { error: new Error('ECONNREFUSED') },
  ]);

  const client = new AirobotModbusClient({
    host: '127.0.0.1',
    port: 502,
    unitId: 1,
    timeoutMs: 1000,
    humidifier: false,
    pm25Sensor: false,
  }, transport);

  await assert.rejects(
    () => client.readState(),
    /ECONNREFUSED/,
  );

  assert.equal(transport.requests.length, 1);
});
