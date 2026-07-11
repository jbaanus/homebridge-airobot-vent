import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';

import { AirobotModbusClient } from './modbusClient.js';
import { normalizeAirobotPlatformConfig } from './platformConfigNormalizer.js';
import { AirobotPlatformAccessory } from './platformAccessory.js';
import { READ_RANGES } from './registers.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import type { AirobotPlatformConfig, AirobotState } from './types.js';

const MODBUS_TCP_PORT = 502;
const MODBUS_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 30000;

function describeReadRanges(): string {
  return READ_RANGES
    .map(range => `${range.start}:${range.quantity}:fc${range.functionCode ?? 'auto'}`)
    .join(', ');
}

export class AirobotVentilationPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: Map<string, PlatformAccessory> = new Map();

  private readonly airobotConfig?: AirobotPlatformConfig;
  private readonly modbusClient?: AirobotModbusClient;
  private accessoryHandler?: AirobotPlatformAccessory;
  private pollTimer?: ReturnType<typeof setInterval>;
  private isPolling = false;

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    const normalized = normalizeAirobotPlatformConfig(config as Record<string, unknown>);
    if (normalized.error) {
      this.log.error(normalized.error);
    }
    this.airobotConfig = normalized.config;

    if (this.airobotConfig) {
      this.log.info(
        `Configured Airobot target ip=${this.airobotConfig.ipAddress} unit=${this.airobotConfig.modbusUnitId} `
        + `modbusTrace=${this.airobotConfig.modbusTrace ? 'on' : 'off'} `
        + `humidifier=${this.airobotConfig.humidifier ? 'on' : 'off'} `
        + `pm25Sensor=${this.airobotConfig.pm25Sensor ? 'on' : 'off'}`,
      );
      this.log.info(`Register read plan: ${describeReadRanges()}`);

      if (this.airobotConfig.modbusTrace) {
        this.log.warn('Modbus trace logging is enabled; this will generate frequent log entries.');
      }

      this.modbusClient = new AirobotModbusClient({
        host: this.airobotConfig.ipAddress,
        port: MODBUS_TCP_PORT,
        unitId: this.airobotConfig.modbusUnitId,
        timeoutMs: MODBUS_TIMEOUT_MS,
        humidifier: this.airobotConfig.humidifier,
        pm25Sensor: this.airobotConfig.pm25Sensor,
        debugLog: this.airobotConfig.modbusTrace
          ? message => {
            this.log.info(`[Modbus] ${message}`);
            this.log.debug(`[Modbus] ${message}`);
          }
          : undefined,
      });
    }

    this.api.on('didFinishLaunching', () => {
      this.log.info('Homebridge finished launching; starting Airobot discovery and polling.');
      this.discoverDevice();
      this.startPolling();
    });

    this.api.on('shutdown', () => this.stopPolling());
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory);
  }

  private discoverDevice() {
    if (!this.airobotConfig) {
      return;
    }

    const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}:${this.airobotConfig.ipAddress}`);
    const existingAccessory = this.accessories.get(uuid);

    if (existingAccessory) {
      this.log.info('Restoring Airobot accessory from cache:', existingAccessory.displayName);
      existingAccessory.context.device = this.airobotConfig;
      this.api.updatePlatformAccessories([existingAccessory]);
      this.accessoryHandler = new AirobotPlatformAccessory(this, existingAccessory);
    } else {
      this.log.info('Adding Airobot accessory:', this.airobotConfig.name);
      const accessory = new this.api.platformAccessory(this.airobotConfig.name, uuid);
      accessory.context.device = this.airobotConfig;
      this.accessoryHandler = new AirobotPlatformAccessory(this, accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }

    for (const [cachedUuid, cachedAccessory] of this.accessories) {
      if (cachedUuid !== uuid) {
        this.log.info('Removing stale Airobot accessory from cache:', cachedAccessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [cachedAccessory]);
      }
    }
  }

  private startPolling() {
    if (!this.modbusClient || !this.accessoryHandler) {
      this.log.warn('Polling not started because Modbus client or accessory handler is unavailable.');
      return;
    }

    this.log.info(`Starting Modbus polling every ${Math.round(POLL_INTERVAL_MS / 1000)} seconds.`);
    void this.poll();
    this.pollTimer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
  }

  private stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
      this.log.info('Stopped Modbus polling.');
    }
  }

  private async poll() {
    if (this.isPolling || !this.modbusClient || !this.accessoryHandler) {
      return;
    }

    this.isPolling = true;

    try {
      const state: AirobotState = await this.modbusClient.readState();
      this.logDecodedErrors(state);
      this.accessoryHandler.updateState(state);
    } catch (error) {
      this.log.warn('Failed to read Airobot Modbus state:', error instanceof Error ? error.message : String(error));
      this.accessoryHandler.markCommunicationFailure();
    } finally {
      this.isPolling = false;
    }
  }

  private logDecodedErrors(state: AirobotState) {
    if (!state.errors) {
      return;
    }

    const errorRegisterHigh = Math.floor(state.errors.raw / 65536);
    const errorRegisterLow = state.errors.raw & 0xffff;

    const activeFlags = Object.entries(state.errors)
      .filter(([key, value]) => key !== 'raw' && value === true)
      .map(([key]) => key)
      .join(', ');

    this.log.info(
      `Decoded errors reg1026=${errorRegisterHigh} reg1027=${errorRegisterLow} `
      + `raw=${state.errors.raw} active=${activeFlags || 'none'}`,
    );
  }
}
