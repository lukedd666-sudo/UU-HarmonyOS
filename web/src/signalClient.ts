// Protocol payload adaptation: MIT upstream signalGatewayProtocol and remoteControlService.
import { io, type Socket } from 'socket.io-client';
import { gzip, ungzip } from 'pako';
import { asRecord, ControllerError, type NativeBridge } from './nativeBridge';
import { fromBase64, toBase64 } from './nativeSocket';
import { signalPollingOrigin } from './security';
import { nativePollingTransport } from './nativePolling';
import { buildSignalGatewayControlPayload, buildSignalGatewaySoacPayload, normalizeSignalGatewayInboundEvents, normalizeSignalGatewayPayload, type SignalGatewayBinaryCodec } from './upstream/signalGatewayProtocol';
import { buildStreamerSignalHeaders, normalizeStreamerSignalControlAck } from './upstream/streamerProtocol';
import type { RemoteSignalControlRequest, RemoteSignalControlResult, RemoteSignalGatewayEvent, RemoteSignalSoacRequest, RemoteSignalSoacResult, StreamerRoomConfig } from './upstream/types';

function toBinary(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const record = asRecord(value);
  if (record.kind === 'binary' && typeof record.base64 === 'string') return fromBase64(record.base64);
  return null;
}
const binary: SignalGatewayBinaryCodec<Uint8Array> = {
  decodeBase64: value => fromBase64(value ?? ''), toBinary,
  byteLength: value => value.length, encodeBase64: toBase64,
  gzipText: value => gzip(value),
  gunzipText: value => { try { const bytes = toBinary(value); return bytes ? ungzip(bytes, { to: 'string' }) : null; } catch { return null; } },
};

export class SignalClient {
  private socket: Socket | null = null;
  private nextEvent = 0;
  private pending = new Set<(error: Error) => void>();
  private recorded = new Set<string>();
  private record(stage: string): void { if (!this.recorded.has(stage)) { this.recorded.add(stage); console.info(`UU_REA_RTC|${stage}`); } }
  constructor(private readonly bridge: NativeBridge, private readonly onEvent: (value: RemoteSignalGatewayEvent) => void, private readonly onClose: () => void) {}
  async connect(room: StreamerRoomConfig): Promise<void> {
    const server = signalPollingOrigin(room.signalServers[0] ?? '');
    const headers = buildStreamerSignalHeaders({ token: room.token, gzipSdp: false });
    const socket = io(server, { autoConnect: false, forceNew: true, reconnection: false, upgrade: false, rememberUpgrade: false, timeout: Math.min(room.timeout || 15000, 30000), transports: [nativePollingTransport(this.bridge, headers)] });
    this.socket = socket;
    socket.onAny((event, ...payload: unknown[]) => {
      this.record(event === 'bmsg_push' ? 'PUSH_RECEIVED' : ['soac', 'answer', 'candidate', 'restart_ice'].includes(event) ? 'SOAC_OTHER' : 'SIGNAL_OTHER');
      for (const normalized of normalizeSignalGatewayInboundEvents(event, payload, binary)) {
        this.onEvent({ id: ++this.nextEvent, direction: 'inbound', event: normalized.event, payload: normalized.payload, receivedAt: new Date().toISOString() });
      }
      if (event === 'publisher_disconnect') this.close();
    });
    socket.on('disconnect', () => {
      this.rejectPending();
      this.onClose();
    });
    await new Promise<void>((resolve, reject) => {
      const cancelled = (error: Error) => { cleanup(); reject(error); };
      const cleanup = () => { socket.off('connect', connected); socket.off('connect_error', failed); this.pending.delete(cancelled); };
      const connected = () => { this.record('SIGNAL_CONNECTED'); cleanup(); resolve(); };
      const failed = () => { cleanup(); socket.disconnect(); reject(new ControllerError('SIGNAL_FAILED')); };
      socket.once('connect', connected);
      socket.once('connect_error', failed);
      this.pending.add(cancelled);
      socket.connect();
    });
  }
  async sendSignalControl(input: RemoteSignalControlRequest): Promise<RemoteSignalControlResult> {
    const emittedAt = new Date().toISOString();
    const raw = await this.ack('control', buildSignalGatewayControlPayload(input, binary));
    const normalized = normalizeSignalGatewayPayload(raw, binary) as unknown[];
    return { event: 'control', ack: normalized, ackStatus: typeof normalized[0] === 'string' ? normalized[0] : undefined, control: normalizeStreamerSignalControlAck(normalized), emittedAt, ackReceivedAt: new Date().toISOString() };
  }
  async sendSignalSoac(input: RemoteSignalSoacRequest): Promise<RemoteSignalSoacResult> {
    if (!this.socket?.connected) throw new ControllerError('SOCKET_CLOSED');
    const payload = buildSignalGatewaySoacPayload(input, binary);
    this.socket.emit('soac', payload, (...ack: unknown[]) => {
      const result = asRecord(ack.find(value => value !== null && typeof value === 'object'));
      this.record((ack[0] === 'success' || result.code === 0) && (result.code === undefined || result.code === 0) ? 'SOAC_ACK_OK' : 'SOAC_ACK_REJECTED');
    });
    return { event: 'soac', payload: null, emittedAt: new Date().toISOString() };
  }
  close(): void {
    this.rejectPending();
    const socket = this.socket;
    this.socket = null;
    // Stop polling immediately even if a POST is waiting for native completion.
    socket?.io.engine?.transport.close();
    socket?.disconnect();
    socket?.offAny();
    socket?.removeAllListeners();
  }
  private rejectPending(): void {
    for (const reject of [...this.pending]) reject(new ControllerError('SOCKET_CLOSED'));
  }
  private ack(event: string, payload: Record<string, unknown>): Promise<unknown[]> {
    if (!this.socket?.connected) return Promise.reject(new ControllerError('SOCKET_CLOSED'));
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error, value: unknown[] = []) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.pending.delete(fail);
        if (error) reject(error); else resolve(value);
      };
      const fail = (error: Error) => finish(error);
      const timer = setTimeout(() => finish(new ControllerError('NATIVE_TIMEOUT')), 10000);
      this.pending.add(fail);
      this.socket!.emit(event, payload, (...value: unknown[]) => finish(undefined, value));
    });
  }
}
