import { generateReadRanges } from './registerCatalog.js';
import { decodeAirobotStateFromSchema } from './registerSchema.js';
export type { RegisterRange } from './registerCatalog.js';
export type { DecodeStateOptions, RegisterValues } from './registerSchema.js';
import type { DecodeStateOptions, RegisterValues } from './registerSchema.js';
import type { AirobotErrors, AirobotState } from './types.js';

export const READ_RANGES = generateReadRanges();

export function decodeAirobotState(values: RegisterValues, options: DecodeStateOptions = {}): AirobotState {
  return decodeAirobotStateFromSchema(values, options);
}

export function fanLevelToPercentage(supplyFanLevel?: number, extractFanLevel?: number): number | undefined {
  const levels = [supplyFanLevel, extractFanLevel].filter((level): level is number => typeof level === 'number');
  if (levels.length === 0) {
    return undefined;
  }

  const averageLevel = levels.reduce((sum, level) => sum + level, 0) / levels.length;
  return clamp(Math.round(averageLevel * 10), 0, 100);
}

export function hasFault(errors?: AirobotErrors): boolean {
  return Boolean(errors && errors.raw !== 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
