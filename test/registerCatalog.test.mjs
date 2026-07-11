import assert from 'node:assert/strict';
import test from 'node:test';

import { REGISTER_CATALOG, generateReadRanges } from '../dist/registerCatalog.js';

test('generateReadRanges reproduces the current read plan from catalog', () => {
  const ranges = generateReadRanges(REGISTER_CATALOG);

  assert.deepEqual(ranges, [
    { start: 1000, quantity: 20 },
    { start: 1026, quantity: 10 },
    { start: 1051, quantity: 2 },
    { start: 4020, quantity: 1, optional: true, functionCode: 1 },
    { start: 2017, quantity: 2, optional: true, functionCode: 3 },
  ]);
});

test('generateReadRanges only merges contiguous entries with matching metadata', () => {
  const ranges = generateReadRanges([
    { key: 'a', start: 10 },
    { key: 'b', start: 11 },
    { key: 'c', start: 12, optional: true },
    { key: 'd', start: 13, optional: true },
    { key: 'e', start: 14, optional: true, functionCode: 1 },
    { key: 'f', start: 15, optional: true, functionCode: 1 },
  ]);

  assert.deepEqual(ranges, [
    { start: 10, quantity: 2 },
    { start: 12, quantity: 2, optional: true },
    { start: 14, quantity: 2, optional: true, functionCode: 1 },
  ]);
});

test('generateReadRanges validates catalog entries', () => {
  assert.throws(
    () => generateReadRanges([{ key: 'bad', start: -1 }]),
    /Invalid catalog start/,
  );

  assert.throws(
    () => generateReadRanges([{ key: 'bad', start: 1, quantity: 0 }]),
    /Invalid catalog quantity/,
  );

  assert.throws(
    () => generateReadRanges([{ key: 'bad', start: 65535, quantity: 2 }]),
    /exceeds Modbus address space/,
  );
});
