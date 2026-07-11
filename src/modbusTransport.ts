export interface ModbusTransportRequest {
  host: string;
  port: number;
  timeoutMs: number;
  request: Buffer;
}

export interface ModbusTransport {
  send(request: ModbusTransportRequest): Promise<Buffer>;
}
