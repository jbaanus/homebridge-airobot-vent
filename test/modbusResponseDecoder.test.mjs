import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';

import { tryParseReadResponse } from '../dist/modbusResponseDecoder.js';

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

test('returns undefined for incomplete frame', () => {
  const parsed = tryParseReadResponse({
    response: Buffer.from([0x00, 0x01, 0x00]),
    transactionId: 1,
    expectedQuantity: 1,
    expectedUnitId: 1,
    expectedFunctionCode: 3,
  });

  assert.equal(parsed, undefined);
});

test('decodes FC03 register values', () => {
  const response = buildResponse({
    transactionId: 10,
    unitId: 1,
    functionCode: 3,
    payload: Buffer.from([0x12, 0x34, 0xab, 0xcd]),
  });

  const parsed = tryParseReadResponse({
    response,
    transactionId: 10,
    expectedQuantity: 2,
    expectedUnitId: 1,
    expectedFunctionCode: 3,
  });

  assert.deepEqual(parsed, [0x1234, 0xabcd]);
});

test('decodes FC04 register values', () => {
  const response = buildResponse({
    transactionId: 11,
    unitId: 255,
    functionCode: 4,
    payload: Buffer.from([0x00, 0x01]),
  });

  const parsed = tryParseReadResponse({
    response,
    transactionId: 11,
    expectedQuantity: 1,
    expectedUnitId: 255,
    expectedFunctionCode: 4,
  });

  assert.deepEqual(parsed, [1]);
});

test('decodes FC01 bit-packed coil values by requested quantity', () => {
  const response = buildResponse({
    transactionId: 12,
    unitId: 1,
    functionCode: 1,
    payload: Buffer.from([0b10101101, 0b00000011]),
  });

  const parsed = tryParseReadResponse({
    response,
    transactionId: 12,
    expectedQuantity: 10,
    expectedUnitId: 1,
    expectedFunctionCode: 1,
  });

  assert.deepEqual(parsed, [1, 0, 1, 1, 0, 1, 0, 1, 1, 1]);
});

test('throws on Modbus exception frame', () => {
  const transactionId = 13;
  const response = Buffer.from([
    0x00, transactionId,
    0x00, 0x00,
    0x00, 0x03,
    0x01,
    0x84,
    0x02,
  ]);

  assert.throws(
    () => tryParseReadResponse({
      response,
      transactionId,
      expectedQuantity: 1,
      expectedUnitId: 1,
      expectedFunctionCode: 4,
    }),
    /Modbus exception 2 for function 4/,
  );
});

test('throws on unexpected unit id', () => {
  const response = buildResponse({
    transactionId: 14,
    unitId: 2,
    functionCode: 3,
    payload: Buffer.from([0x00, 0x01]),
  });

  assert.throws(
    () => tryParseReadResponse({
      response,
      transactionId: 14,
      expectedQuantity: 1,
      expectedUnitId: 1,
      expectedFunctionCode: 3,
    }),
    /Unexpected Modbus unit id 2/,
  );
});

test('throws on unexpected function code', () => {
  const response = buildResponse({
    transactionId: 15,
    unitId: 1,
    functionCode: 4,
    payload: Buffer.from([0x00, 0x01]),
  });

  assert.throws(
    () => tryParseReadResponse({
      response,
      transactionId: 15,
      expectedQuantity: 1,
      expectedUnitId: 1,
      expectedFunctionCode: 3,
    }),
    /Unexpected Modbus function code 4/,
  );
});

test('throws on invalid response header', () => {
  const response = buildResponse({
    transactionId: 16,
    unitId: 1,
    functionCode: 3,
    payload: Buffer.from([0x00, 0x01]),
  });

  response.writeUInt16BE(1, 2);

  assert.throws(
    () => tryParseReadResponse({
      response,
      transactionId: 16,
      expectedQuantity: 1,
      expectedUnitId: 1,
      expectedFunctionCode: 3,
    }),
    /Invalid Modbus TCP response header/,
  );
});
