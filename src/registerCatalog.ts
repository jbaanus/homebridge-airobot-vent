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

export const REGISTER_CATALOG: RegisterCatalogEntry[] = [
  { key: 'firmwareVersion', start: 1000 },
  { key: 'temperatureExtract', start: 1001 },
  { key: 'temperatureSupply', start: 1002 },
  { key: 'temperatureOutside', start: 1003 },
  { key: 'temperatureExhaust', start: 1004 },
  { key: 'temperatureExtra', start: 1005 },
  { key: 'humidityExtract', start: 1006 },
  { key: 'humiditySupply', start: 1007 },
  { key: 'humidityOutside', start: 1008 },
  { key: 'humidityExhaust', start: 1009 },
  { key: 'humidityExtra', start: 1010 },
  { key: 'co2', start: 1011 },
  // Keep these placeholders in the catalog so contiguous read optimization remains stable.
  { key: 'reserved1012', start: 1012 },
  { key: 'reserved1013', start: 1013 },
  { key: 'supplyFanLevel', start: 1014 },
  { key: 'extractFanLevel', start: 1015 },
  { key: 'supplyFanRpm', start: 1016 },
  { key: 'extractFanRpm', start: 1017 },
  { key: 'workingTime', start: 1018, quantity: 2 },

  { key: 'errorsAndSensorsBlock', start: 1026, quantity: 10 },

  { key: 'supplyAirflow', start: 1051 },
  { key: 'extractAirflow', start: 1052 },

  { key: 'filterChangeRequired', start: 4020, optional: true, functionCode: 1 },
  { key: 'filterReminderIntervalHours', start: 2017, optional: true, functionCode: 3 },
  { key: 'filterReminderElapsedHours', start: 2018, optional: true, functionCode: 3 },
];

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