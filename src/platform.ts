import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';

import { AirobotModbusClient } from './modbusClient.js';
import { AirobotPlatformAccessory } from './platformAccessory.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import type { AirobotPlatformConfig, AirobotState } from './types.js';

const DEFAULT_NAME = 'Airobot Ventilation';
const MODBUS_TCP_PORT = 502;
const MODBUS_UNIT_ID = 1;
const MODBUS_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 30000;

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
    this.airobotConfig = this.parseConfig(config);

    if (this.airobotConfig) {
      this.log.info(
        `Configured Airobot target ip=${this.airobotConfig.ipAddress} unit=${this.airobotConfig.modbusUnitId} `
        + `modbusTrace=${this.airobotConfig.modbusTrace ? 'on' : 'off'}`,
      );

      if (this.airobotConfig.modbusTrace) {
        this.log.warn('Modbus trace logging is enabled; this will generate frequent log entries.');
      }

      this.modbusClient = new AirobotModbusClient({
        host: this.airobotConfig.ipAddress,
        port: MODBUS_TCP_PORT,
        unitId: this.airobotConfig.modbusUnitId,
        timeoutMs: MODBUS_TIMEOUT_MS,
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
      this.accessoryHandler.updateState(state);
    } catch (error) {
      this.log.warn('Failed to read Airobot Modbus state:', error instanceof Error ? error.message : String(error));
      this.accessoryHandler.markCommunicationFailure();
    } finally {
      this.isPolling = false;
    }
  }

  private parseConfig(config: PlatformConfig): AirobotPlatformConfig | undefined {
    const ipAddress = typeof config.ipAddress === 'string' ? config.ipAddress.trim() : '';
    if (!ipAddress) {
      this.log.error('Missing required "ipAddress" config value for Airobot ventilation unit.');
      return undefined;
    }

    return {
      name: typeof config.name === 'string' && config.name.trim() ? config.name.trim() : DEFAULT_NAME,
      ipAddress,
      modbusUnitId: Number.isInteger(config.modbusUnitId)
        && config.modbusUnitId >= 0
        && config.modbusUnitId <= 255
        ? config.modbusUnitId
        : MODBUS_UNIT_ID,
      modbusTrace: config.modbusTrace === true,
    };
  }
}
