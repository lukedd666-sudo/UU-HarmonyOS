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
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private lastKeyRefresh: number | undefined;
  private hasReconnectKey = false;
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
    socket.on('disconnect', reason => {
      this.stopKeyRefresh();
      const reasons: Record<string, string> = { 'ping timeout': 'PING_TIMEOUT', 'transport error': 'TRANSPORT_ERROR', 'transport close': 'TRANSPORT_CLOSE', 'io server disconnect': 'SERVER_DISCONNECT', 'io client disconnect': 'CLIENT_DISCONNECT', 'parse error': 'PARSE_ERROR' };
      console.info(`UU_REA_SIGNAL_END|${Object.prototype.hasOwnProperty.call(reasons, reason) ? reasons[reason] : 'OTHER'}`);
      this.rejectPending();
      this.onClose();
    });
    await new Promise<void>((resolve, reject) => {
      const cancelled = (error: Error) => { cleanup(); reject(error); };
      const cleanup = () => { socket.off('connect', connected); socket.off('connect_error', failed); this.pending.delete(cancelled); };
      const connected = () => { this.record('SIGNAL_CONNECTED'); this.scheduleKeyRefresh(socket); cleanup(); resolve(); };
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
    this.stopKeyRefresh();
    this.hasReconnectKey = false; this.lastKeyRefresh = undefined;
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
  private stopKeyRefresh(): void { clearTimeout(this.refreshTimer); this.refreshTimer = undefined; }
  private scheduleKeyRefresh(socket: Socket): void {
    this.stopKeyRefresh();
    this.refreshTimer = setTimeout(() => void this.refreshKey(socket), 30000);
  }
  private async refreshKey(socket: Socket): Promise<void> {
    if (this.socket !== socket || !socket.connected) return;
    // Official Mac streamer checks every 30s and refreshes at a 300s age.
    // Keep only validity/age here; returned credentials are neither saved nor logged.
    if (this.lastKeyRefresh === undefined || Date.now() - this.lastKeyRefresh >= 300000) {
      try {
        const result = await this.ack('refresh_reconnect_key');
        if (this.socket !== socket || !socket.connected) return;
        const key = asRecord(result[1]).reconnect_key;
        if (result[0] === 'success' && (this.hasReconnectKey || (typeof key === 'string' && key.length > 0))) {
          this.hasReconnectKey = true; this.lastKeyRefresh = Date.now();
          console.info('UU_REA_RTC|KEY_REFRESH_OK');
        } else console.info('UU_REA_RTC|KEY_REFRESH_REJECTED');
      } catch { if (this.socket === socket && socket.connected) console.info('UU_REA_RTC|KEY_REFRESH_FAILED'); }
    }
    if (this.socket === socket && socket.connected) this.scheduleKeyRefresh(socket);
  }
  private ack(event: string, payload?: Record<string, unknown>): Promise<unknown[]> {
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
      this.socket!.emit(event, ...(payload === undefined ? [] : [payload]), (...value: unknown[]) => finish(undefined, value));
    });
  }
}
