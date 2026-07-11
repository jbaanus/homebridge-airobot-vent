import { REGISTER_SCHEMA } from './registerSchema.js';

export interface RegisterRange {
  start: number;
  quantity: number;
  optional?: boolean;
  functionCode?: number;
}

export interface RegisterCatalogEntry {
  key: string;
  start: number;
  quantity?: number;
  optional?: boolean;
  functionCode?: number;
}

export const REGISTER_CATALOG: RegisterCatalogEntry[] = REGISTER_SCHEMA.map(entry => ({
  key: entry.key,
  start: entry.start,
  ...(typeof entry.quantity === 'number' ? { quantity: entry.quantity } : {}),
  ...(typeof entry.optional === 'boolean' ? { optional: entry.optional } : {}),
  ...(typeof entry.functionCode === 'number' ? { functionCode: entry.functionCode } : {}),
}));

export const READ_RANGES = generateReadRanges();

export function generateReadRanges(catalog: RegisterCatalogEntry[] = REGISTER_CATALOG): RegisterRange[] {
  const expanded = catalog.flatMap(entry => toRangeParts(entry));
  if (expanded.length === 0) {
    return [];
  }

  const ranges: RegisterRange[] = [];

  for (const part of expanded) {
    const previous = ranges[ranges.length - 1];
    if (previous && canMerge(previous, part)) {
      previous.quantity += part.quantity;
      continue;
    }

    ranges.push(normalizeRange(part));
  }

  return ranges;
}

function toRangeParts(entry: RegisterCatalogEntry): RegisterRange[] {
  const quantity = entry.quantity ?? 1;
  if (!Number.isInteger(entry.start) || entry.start < 0 || entry.start > 0xffff) {
    throw new Error(`Invalid catalog start for ${entry.key}: ${entry.start}`);
  }

  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 0xffff) {
    throw new Error(`Invalid catalog quantity for ${entry.key}: ${quantity}`);
  }

  if (entry.start + quantity - 1 > 0xffff) {
    throw new Error(`Catalog range for ${entry.key} exceeds Modbus address space`);
  }

  return [normalizeRange({
    start: entry.start,
    quantity,
    optional: entry.optional,
    functionCode: entry.functionCode,
  })];
}

function canMerge(previous: RegisterRange, next: RegisterRange): boolean {
  return previous.start + previous.quantity === next.start
    && previous.optional === next.optional
    && previous.functionCode === next.functionCode;
}

function normalizeRange(range: RegisterRange): RegisterRange {
  return {
    start: range.start,
    quantity: range.quantity,
    ...(typeof range.optional === 'boolean' ? { optional: range.optional } : {}),
    ...(typeof range.functionCode === 'number' ? { functionCode: range.functionCode } : {}),
  };
}