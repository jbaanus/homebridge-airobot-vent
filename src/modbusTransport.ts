export interface ModbusTransportRequest {
  host: string;
  port: number;
  timeoutMs: number;
  request: Buffer;
  isCompleteResponse: (response: Buffer) => boolean;
}

export interface ModbusTransport {
  send(request: ModbusTransportRequest): Promise<Buffer>;
}
