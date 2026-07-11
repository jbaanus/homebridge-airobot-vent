import assert from 'node:assert/strict';
import test from 'node:test';

import { projectHomeKitState } from '../dist/homeKitProjection.js';

test('defaults to safe values when state is unavailable and communication failed', () => {
  const projection = projectHomeKitState(undefined, true);

  assert.equal(projection.accessoryInformation.serialNumber, 'Unknown');
  assert.equal(projection.accessoryInformation.firmwareRevision, 'Unknown');
  assert.equal(projection.fan.active, false);
  assert.equal(projection.fan.rotationSpeed, 0);
  assert.equal(projection.fan.statusFault, true);
  assert.equal(projection.co2.statusFault, true);
  assert.equal(projection.filter.needsChange, false);
  assert.equal(projection.filter.lifeLevel, 100);
  assert.equal(projection.co2.detected, false);
  assert.equal(projection.co2.level, undefined);
  assert.equal(projection.airQuality.pm25Density, undefined);
  assert.equal(projection.temperature.extract, undefined);
  assert.equal(projection.temperature.extra, undefined);
  assert.equal(projection.humidity.extract, undefined);
  assert.equal(projection.humidity.extra, undefined);
});

test('projects fan status and faults from state when communication is healthy', () => {
  const projection = projectHomeKitState({
    serialNumber: '12345678',
    firmwareVersion: '2.04',
    temperatures: { extract: 21.5, extra: 23.1 },
    humidity: { extract: 44.4, extra: 51.2 },
    supplyFanLevel: 6,
    extractFanLevel: 4,
    co2: 900,
    pm25: 13,
    errors: {
      raw: 0,
      fireAlarm: false,
      supplyFan: false,
      extractFan: false,
      sensor1: false,
      sensor2: false,
      sensor3: false,
      sensor4: false,
      sensor5: false,
      co2Sensor: false,
      heater: false,
      lowSupply: false,
      filter: false,
    },
    lastUpdated: new Date(),
  }, false);

  assert.equal(projection.accessoryInformation.serialNumber, '12345678');
  assert.equal(projection.accessoryInformation.firmwareRevision, '2.04');
  assert.equal(projection.fan.rotationSpeed, 50);
  assert.equal(projection.fan.active, true);
  assert.equal(projection.fan.statusFault, false);
  assert.equal(projection.co2.statusFault, false);
  assert.equal(projection.co2.detected, false);
  assert.equal(projection.co2.level, 900);
  assert.equal(projection.airQuality.pm25Density, 13);
  assert.equal(projection.temperature.extract, 21.5);
  assert.equal(projection.temperature.extra, 23.1);
  assert.equal(projection.humidity.extract, 44.4);
  assert.equal(projection.humidity.extra, 51.2);
});

test('prefers explicit filterChangeRequired over derived filter logic', () => {
  const projection = projectHomeKitState({
    temperatures: {},
    humidity: {},
    errors: {
      raw: 2048,
      fireAlarm: false,
      supplyFan: false,
      extractFan: false,
      sensor1: false,
      sensor2: false,
      sensor3: false,
      sensor4: false,
      sensor5: false,
      co2Sensor: false,
      heater: false,
      lowSupply: false,
      filter: true,
    },
    filterLifeLevel: 0,
    filterChangeRequired: false,
    lastUpdated: new Date(),
  }, false);

  assert.equal(projection.filter.needsChange, false);
  assert.equal(projection.filter.lifeLevel, 0);
});

test('detects filter change from fallback conditions when explicit coil value is missing', () => {
  const projectionFromLife = projectHomeKitState({
    temperatures: {},
    humidity: {},
    filterLifeLevel: 0,
    lastUpdated: new Date(),
  }, false);

  assert.equal(projectionFromLife.filter.needsChange, true);

  const projectionFromError = projectHomeKitState({
    temperatures: {},
    humidity: {},
    errors: {
      raw: 2048,
      fireAlarm: false,
      supplyFan: false,
      extractFan: false,
      sensor1: false,
      sensor2: false,
      sensor3: false,
      sensor4: false,
      sensor5: false,
      co2Sensor: false,
      heater: false,
      lowSupply: false,
      filter: true,
    },
    lastUpdated: new Date(),
  }, false);

  assert.equal(projectionFromError.filter.needsChange, true);
});

test('applies CO2 detection threshold and communication override for CO2 fault', () => {
  const healthyProjection = projectHomeKitState({
    temperatures: {},
    humidity: {},
    co2: 1200,
    errors: {
      raw: 0,
      fireAlarm: false,
      supplyFan: false,
      extractFan: false,
      sensor1: false,
      sensor2: false,
      sensor3: false,
      sensor4: false,
      sensor5: false,
      co2Sensor: false,
      heater: false,
      lowSupply: false,
      filter: false,
    },
    lastUpdated: new Date(),
  }, false);

  assert.equal(healthyProjection.co2.detected, true);
  assert.equal(healthyProjection.co2.statusFault, false);

  const failedProjection = projectHomeKitState({
    temperatures: {},
    humidity: {},
    co2: 1200,
    lastUpdated: new Date(),
  }, true);

  assert.equal(failedProjection.co2.statusFault, true);
});
