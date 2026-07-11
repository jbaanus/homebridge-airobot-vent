import net from 'node:net';

import type { ModbusTransport, ModbusTransportRequest } from './modbusTransport.js';

export class ModbusTcpTransport implements ModbusTransport {
  constructor(private readonly traceLog?: (message: string) => void) {}

  send(requestData: ModbusTransportRequest): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({
        host: requestData.host,
        port: requestData.port,
      });

      const chunks: Buffer[] = [];
      let settled = false;

      const finish = (error?: Error, response?: Buffer) => {
        if (settled) {
          return;
        }

        settled = true;
        socket.destroy();

        if (error) {
          reject(error);
        } else if (response) {
          resolve(response);
        } else {
          reject(new Error('Modbus transport did not return a response'));
        }
      };

      socket.setTimeout(requestData.timeoutMs);
      socket.once('connect', () => {
        this.traceLog?.(`Connected to ${requestData.host}:${requestData.port}`);
        socket.write(requestData.request);
      });
      socket.once('timeout', () => finish(new Error(`Modbus request to ${requestData.host} timed out`)));
      socket.once('error', error => finish(error));
      socket.on('data', chunk => {
        if (!Buffer.isBuffer(chunk)) {
          finish(new Error('Unexpected string data from Modbus socket'));
          return;
        }

        chunks.push(chunk);
        const response = Buffer.concat(chunks);
        this.traceLog?.(`Received Modbus response chunkBytes=${chunk.length} totalBytes=${response.length} hex=${toHex(response)}`);

        if (requestData.isCompleteResponse(response)) {
          finish(undefined, response);
        }
      });
    });
  }
}

function toHex(buffer: Buffer): string {
  return Array.from(buffer, byte => byte.toString(16).padStart(2, '0')).join(' ');
}
