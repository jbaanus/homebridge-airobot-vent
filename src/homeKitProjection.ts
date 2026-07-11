import { fanLevelToPercentage, hasFault } from './registers.js';
import type { AirobotState } from './types.js';

export interface HomeKitProjection {
  accessoryInformation: {
    firmwareRevision: string;
  };
  fan: {
    active: boolean;
    rotationSpeed: number;
    statusFault: boolean;
  };
  filter: {
    needsChange: boolean;
    lifeLevel: number;
  };
  co2: {
    detected: boolean;
    level: number | undefined;
    statusFault: boolean;
  };
  airQuality: {
    value: 'unknown';
    pm25Density: number | undefined;
    statusFault: boolean;
  };
  temperature: {
    extract: number | undefined;
    extra: number | undefined;
    statusFault: boolean;
  };
  humidity: {
    extract: number | undefined;
    extra: number | undefined;
    statusFault: boolean;
  };
}

export function projectHomeKitState(state: AirobotState | undefined, communicationFailed: boolean): HomeKitProjection {
  const rotationSpeed = fanLevelToPercentage(state?.supplyFanLevel, state?.extractFanLevel) ?? 0;
  const fanActive = !communicationFailed && rotationSpeed > 0;
  const statusFault = communicationFailed || hasFault(state?.errors);
  const co2Fault = communicationFailed || state?.errors?.co2Sensor === true;

  let filterNeedsChange: boolean;
  if (typeof state?.filterChangeRequired === 'boolean') {
    filterNeedsChange = state.filterChangeRequired;
  } else {
    filterNeedsChange = Boolean(state?.errors?.filter)
      || (typeof state?.filterLifeLevel === 'number' && state.filterLifeLevel <= 0);
  }

  const co2 = state?.co2 ?? 0;

  return {
    accessoryInformation: {
      firmwareRevision: state?.firmwareVersion ?? 'Unknown',
    },
    fan: {
      active: fanActive,
      rotationSpeed,
      statusFault,
    },
    filter: {
      needsChange: filterNeedsChange,
      lifeLevel: state?.filterLifeLevel ?? 100,
    },
    co2: {
      detected: co2 >= 1000,
      level: state?.co2,
      statusFault: co2Fault,
    },
    airQuality: {
      value: 'unknown',
      pm25Density: state?.pm25,
      statusFault,
    },
    temperature: {
      extract: state?.temperatures.extract,
      extra: state?.temperatures.extra,
      statusFault,
    },
    humidity: {
      extract: state?.humidity.extract,
      extra: state?.humidity.extra,
      statusFault,
    },
  };
}