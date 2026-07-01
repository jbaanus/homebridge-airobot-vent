# Homebridge Airobot Ventilation

Read-only Homebridge plugin for Airobot ventilation units over Modbus TCP.

## Requirements

- Homebridge 1.8 or 2.x
- Node.js 22.10 or newer
- Airobot ventilation unit connected to the local network
- Modbus TCP enabled on the unit:
  - Menu > Settings > Other > Modbus TCP
  - Set Modbus TCP to ON
  - The unit will reboot and keep its assigned IP address as static

## Configuration

```json
{
  "platform": "AirobotVentilation",
  "name": "Airobot Ventilation",
  "ipAddress": "192.168.1.50",
  "modbusTrace": true
}
```

Only `ipAddress` is required. The plugin uses Modbus TCP port `502`, unit id `1`, and polls every 30 seconds.

Set `modbusTrace` to `true` to print detailed Modbus connection, request, and response logs in Homebridge output.

## Exposed Values

The first version is read-only and exposes native Apple Home services where possible:

- Fan active state and fan level percentage
- Filter maintenance indication and estimated filter life
- Extract, supply, outside, exhaust, and optional extra temperature
- Extract, supply, outside, exhaust, and optional extra humidity
- CO2 level and CO2 detected state
- PM2.5 density
- Heat recovery efficiency
- Fault status from the Airobot error register

The Modbus decoder also reads VOC index, airflow, working time, server connection, fan RPM, and raw error values. Some of these do not have a clean native Apple Home characteristic yet and are kept ready for custom-characteristic support in a later version.

## Development

```shell
npm install
npm run build
npm run lint
```

See [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) for the implementation structure.
