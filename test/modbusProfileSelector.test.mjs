import assert from 'node:assert/strict';
import test from 'node:test';

import { ModbusProfileSelector } from '../dist/modbusProfileSelector.js';

test('candidate ordering starts with remembered selected profile', () => {
  const selector = new ModbusProfileSelector(1);

  const first = selector.buildCandidateProfiles(1);
  assert.equal(first[0].unitId, 1);
  assert.equal(first[0].variant.functionCode, 3);
  assert.equal(first[0].variant.registerAddressOffset, 0);

  selector.markSuccessfulProfile({
    unitId: 255,
    variant: {
      functionCode: 4,
      registerAddressOffset: -1,
    },
  });

  const second = selector.buildCandidateProfiles(1);
  assert.equal(second[0].unitId, 255);
  assert.equal(second[0].variant.functionCode, 4);
  assert.equal(second[0].variant.registerAddressOffset, -1);
});

test('candidate list has stable deduplicated unit ids and variants', () => {
  const selector = new ModbusProfileSelector(1);
  const candidates = selector.buildCandidateProfiles(1);

  const keys = candidates.map(candidate => `${candidate.unitId}:${candidate.variant.functionCode}:${candidate.variant.registerAddressOffset}`);
  const unique = new Set(keys);

  assert.equal(keys.length, unique.size);

  const byUnit = new Map();
  for (const candidate of candidates) {
    const count = byUnit.get(candidate.unitId) ?? 0;
    byUnit.set(candidate.unitId, count + 1);
  }

  assert.equal(byUnit.get(1), 4);
  assert.equal(byUnit.get(255), 4);
  assert.equal(byUnit.get(0), 4);
});

test('invalid configured unit ids are ignored', () => {
  const selector = new ModbusProfileSelector(1);
  const candidates = selector.buildCandidateProfiles(999);
  const units = [...new Set(candidates.map(candidate => candidate.unitId))];

  assert.deepEqual(units, [1, 255, 0]);
});
