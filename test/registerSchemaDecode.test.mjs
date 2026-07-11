import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeAirobotStateFromSchema } from '../dist/registerSchema.js';

function values(entries) {
  return new Map(entries);
}

test('decodes core fields from schema addresses', () => {
  const state = decodeAirobotStateFromSchema(values([
    [1000, 543],
    [1001, 250],
    [1002, 200],
    [1003, 0xff9c],
    [1004, 210],
    [1006, 450],
    [1007, 500],
    [1008, 550],
    [1009, 600],
    [1011, 700],
    [1012, 0x534e],
    [1013, 0x3031],
    [1014, 4],
    [1015, 3],
    [1016, 1838],
    [1017, 1726],
    [1018, 0x0001],
    [1019, 0x0002],
    [1026, 0x0000],
    [1027, 0x0800],
    [1028, 1],
    [1029, 182],
    [1031, 0x0000],
    [1032, 0x0032],
    [1034, 100],
    [1051, 120],
    [1052, 110],
    [2017, 4380],
    [2018, 192],
    [4020, 1],
  ]), { humidifier: false, pm25Sensor: true });

  assert.equal(state.serialNumber, 'SN01');
  assert.equal(state.firmwareVersion, '5.43');
  assert.equal(state.temperatures.extract, 25);
  assert.equal(state.temperatures.outside, -10);
  assert.equal(state.humidity.extract, 45);
  assert.equal(state.co2, 700);
  assert.equal(state.workingTimeMs, 65538);
  assert.equal(state.serverConnected, true);
  assert.equal(state.voc, 182);
  assert.equal(state.pm25, 50);
  assert.equal(state.heatRecoveryEfficiency, 100);
  assert.equal(state.supplyAirflow, 120);
  assert.equal(state.extractAirflow, 110);
  assert.equal(state.filterChangeRequired, true);
  assert.equal(state.filterLifeLevel, 96);
  assert.equal(state.errors?.filter, true);
});

test('respects humidifier and pm25 capability flags', () => {
  const map = values([
    [1005, 215],
    [1010, 455],
    [1031, 0x0001],
    [1032, 0x3880],
  ]);

  const withoutCapabilities = decodeAirobotStateFromSchema(map, { humidifier: false, pm25Sensor: false });
  assert.equal(withoutCapabilities.temperatures.extra, undefined);
  assert.equal(withoutCapabilities.humidity.extra, undefined);
  assert.equal(withoutCapabilities.pm25, undefined);

  const withCapabilities = decodeAirobotStateFromSchema(map, { humidifier: true, pm25Sensor: true });
  assert.equal(withCapabilities.temperatures.extra, 21.5);
  assert.equal(withCapabilities.humidity.extra, 45.5);
  assert.equal(withCapabilities.pm25, 1000);
});

test('treats sentinel values as unavailable', () => {
  const state = decodeAirobotStateFromSchema(values([
    [1005, 0x7fff],
    [1010, 0xffff],
    [1012, 0xffff],
    [1013, 0xffff],
    [1018, 0xffff],
    [1019, 0xffff],
    [1031, 0xffff],
    [1032, 0xffff],
  ]), { humidifier: true, pm25Sensor: true });

  assert.equal(state.serialNumber, undefined);
  assert.equal(state.temperatures.extra, undefined);
  assert.equal(state.humidity.extra, undefined);
  assert.equal(state.workingTimeMs, undefined);
  assert.equal(state.pm25, undefined);
});

test('filter life is undefined without complete interval data', () => {
  const missingElapsed = decodeAirobotStateFromSchema(values([
    [2017, 1000],
  ]));
  assert.equal(missingElapsed.filterLifeLevel, undefined);

  const missingInterval = decodeAirobotStateFromSchema(values([
    [2018, 10],
  ]));
  assert.equal(missingInterval.filterLifeLevel, undefined);
});
