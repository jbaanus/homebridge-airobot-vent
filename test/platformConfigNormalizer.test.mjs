import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeAirobotPlatformConfig } from '../dist/platformConfigNormalizer.js';

test('returns error when ipAddress is missing or blank', () => {
  assert.deepEqual(normalizeAirobotPlatformConfig({}), {
    error: 'Missing required "ipAddress" config value for Airobot ventilation unit.',
  });

  assert.deepEqual(normalizeAirobotPlatformConfig({ ipAddress: '   ' }), {
    error: 'Missing required "ipAddress" config value for Airobot ventilation unit.',
  });
});

test('normalizes valid config with trims and defaults', () => {
  const result = normalizeAirobotPlatformConfig({
    name: '  My Vent  ',
    ipAddress: ' 192.168.1.50 ',
    modbusUnitId: 2,
    modbusTrace: true,
    humidifier: true,
    pm25Sensor: false,
  });

  assert.equal(result.error, undefined);
  assert.deepEqual(result.config, {
    name: 'My Vent',
    ipAddress: '192.168.1.50',
    modbusUnitId: 2,
    modbusTrace: true,
    humidifier: true,
    pm25Sensor: false,
  });
});

test('falls back to defaults for invalid optional values', () => {
  const result = normalizeAirobotPlatformConfig({
    name: '   ',
    ipAddress: '10.0.0.5',
    modbusUnitId: 999,
    modbusTrace: 1,
    humidifier: 'yes',
    pm25Sensor: null,
  });

  assert.equal(result.error, undefined);
  assert.deepEqual(result.config, {
    name: 'Airobot Ventilation',
    ipAddress: '10.0.0.5',
    modbusUnitId: 1,
    modbusTrace: false,
    humidifier: false,
    pm25Sensor: false,
  });
});

test('accepts edge unit ids 0 and 255', () => {
  const low = normalizeAirobotPlatformConfig({ ipAddress: '10.0.0.5', modbusUnitId: 0 });
  const high = normalizeAirobotPlatformConfig({ ipAddress: '10.0.0.5', modbusUnitId: 255 });

  assert.equal(low.config?.modbusUnitId, 0);
  assert.equal(high.config?.modbusUnitId, 255);
});
