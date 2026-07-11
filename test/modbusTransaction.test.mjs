import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';

import { ModbusTransaction } from '../dist/modbusTransaction.js';

class RecordingTransport {
  constructor(response) {
    this.response = response;
    this.requests = [];
  }

  async send(request) {
    this.requests.push(request);
    return this.response;
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

test('builds frame from typed request and decodes register values', async () => {
  const transport = new RecordingTransport(
    buildRegisterResponse({
      transactionId: 1,
      unitId: 1,
      functionCode: 4,
      values: [0x1234, 0xabcd],
    }),
  );

  const exchange = new ModbusTransaction(
    {
      host: '127.0.0.1',
      port: 502,
      timeoutMs: 1000,
    },
    transport,
    () => 1,
    () => {},
  );

  const values = await exchange.readRegisters({
    unitId: 1,
    functionCode: 4,
    startAddress: 1000,
    quantity: 2,
  });

  assert.deepEqual(values, [0x1234, 0xabcd]);
  assert.equal(transport.requests.length, 1);
  assert.equal(transport.requests[0].request.readUInt8(6), 1);
  assert.equal(transport.requests[0].request.readUInt8(7), 4);
  assert.equal(transport.requests[0].request.readUInt16BE(8), 1000);
  assert.equal(transport.requests[0].request.readUInt16BE(10), 2);

  const isCompleteResponse = transport.requests[0].isCompleteResponse;
  const fullResponse = buildRegisterResponse({
    transactionId: 1,
    unitId: 1,
    functionCode: 4,
    values: [0x1234, 0xabcd],
  });
  const partialResponse = fullResponse.subarray(0, 8);

  assert.equal(isCompleteResponse(partialResponse), false);
  assert.equal(isCompleteResponse(fullResponse), true);
});

test('adds typed request context to downstream errors', async () => {
  const transport = {
    send: async () => {
      throw new Error('boom');
    },
  };

  const exchange = new ModbusTransaction(
    {
      host: '127.0.0.1',
      port: 502,
      timeoutMs: 1000,
    },
    transport,
    () => 1,
    () => {},
  );

  await assert.rejects(
    () => exchange.readRegisters({
      unitId: 255,
      functionCode: 3,
      startAddress: 2017,
      quantity: 2,
    }),
    /boom \(unit=255, function=3, start=2017, quantity=2\)/,
  );
});
