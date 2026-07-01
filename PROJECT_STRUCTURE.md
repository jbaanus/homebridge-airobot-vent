# Homebridge Airobot Ventilation Project Structure

## Goal

Build a read-only Homebridge dynamic platform plugin for an Airobot ventilation unit. The plugin connects directly to the unit over Modbus TCP using the configured IP address and exposes useful values to Apple Home.

## Configuration

The first version keeps configuration intentionally small:

```json
{
  "platform": "AirobotVentilation",
  "name": "Airobot Ventilation",
  "ipAddress": "192.168.1.50"
}
```

Internal defaults:

- Modbus TCP port: `502`
- Modbus unit id: `1`
- Poll interval: `30` seconds
- Read-only behavior: no Modbus writes are sent

## Source Layout

- `src/index.ts`
  - Registers the Homebridge platform.

- `src/settings.ts`
  - Stores plugin and platform constants.

- `src/platform.ts`
  - Reads and validates Homebridge config.
  - Creates one accessory for the configured Airobot unit.
  - Starts and stops polling with the Homebridge lifecycle.

- `src/platformAccessory.ts`
  - Owns HomeKit services and characteristics.
  - Updates Apple Home from the latest read-only Modbus state.

- `src/modbusClient.ts`
  - Implements the Modbus TCP read client.
  - Handles connect, reconnect, request framing, response parsing, and grouped register reads.

- `src/registers.ts`
  - Defines the documented Airobot register map.
  - Decodes raw Modbus registers into a normalized ventilation state.

- `src/types.ts`
  - Shared config and state types.

## Apple Home Mapping

The first version should expose read-only values where the Airobot Modbus documentation provides them:

- Ventilation active state
- Current fan speed as a percentage
- Filter maintenance state and filter life/usage where available
- Temperature sensors for useful air streams
- Humidity sensors where available
- CO2 / air quality style sensors where available
- Fault and communication status

Writable HomeKit controls are deliberately omitted or rejected in v1 because the plugin is read-only.

## Polling Strategy

The accessory polls Modbus periodically, stores the latest decoded state, and pushes updates to HomeKit asynchronously. HomeKit `GET` handlers return cached values where possible so Apple Home does not wait on network I/O.

## Implementation Order

1. Replace template plugin names and schema.
2. Add typed config and state models.
3. Add the Modbus TCP read client.
4. Add register definitions and decoding.
5. Replace the template accessory with Airobot HomeKit services.
6. Replace template README content with plugin usage.
7. Run TypeScript build and lint checks.
