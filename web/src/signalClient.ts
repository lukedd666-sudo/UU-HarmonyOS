// Protocol payload adaptation: MIT upstream signalGatewayProtocol and remoteControlService.
import { io, type Socket } from 'socket.io-client';
import { gzip, ungzip } from 'pako';
import { asRecord, ControllerError, type NativeBridge } from './nativeBridge';
import { fromBase64, toBase64 } from './nativeSocket';
import { signalPollingOrigin } from './security';
import { nativePollingTransport } from './nativePolling';
import { buildSignalGatewayControlPayload, buildSignalGatewaySoacPayload, normalizeSignalGatewayInboundEvents, normalizeSignalGatewayPayload, type SignalGatewayBinaryCodec } from './upstream/signalGatewayProtocol';
import { buildStreamerSignalHeaders, getStreamerSignalControlFailure, normalizeStreamerSignalControlAck } from './upstream/streamerProtocol';
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
  private closeConnection: (() => void) | undefined;
  private controlAccepted: ((socket: Socket) => void) | undefined;
  private record(stage: string): void { if (!this.recorded.has(stage)) { this.recorded.add(stage); console.info(`UU_REA_RTC|${stage}`); } }
  constructor(private readonly bridge: NativeBridge, private readonly onEvent: (value: RemoteSignalGatewayEvent) => void, private readonly onClose: () => void, private readonly isolateRelayCandidates = false) {}
  async connect(room: StreamerRoomConfig): Promise<void> {
    this.close();
    const server = signalPollingOrigin(room.signalServers[0] ?? '');
    const headers = buildStreamerSignalHeaders({ token: room.token, gzipSdp: false });
    const timeout = typeof room.timeout === 'number' && Number.isFinite(room.timeout) && room.timeout > 0 ? Math.min(room.timeout, 30000) : 15000;
    // Two attempts at this validated endpoint, capped at the official default max delay.
    const configuredDelay = room.signalReconnectDelay;
    const delay = typeof configuredDelay === 'number' && Number.isSafeInteger(configuredDelay) && configuredDelay >= 0 ? Math.min(configuredDelay, 25000) : 5000;
    this.recorded.clear();
    await new Promise<void>((resolve, reject) => {
      let ended = false;
      let controlReady = false;
      let reconnectKey: string | undefined;
      let lastKeyRefresh: number | undefined;
      let recovering = false;
      let attempts = 0;
      let refreshTimer: ReturnType<typeof setTimeout> | undefined;
      let retryTimer: ReturnType<typeof setTimeout> | undefined;
      let attemptTimer: ReturnType<typeof setTimeout> | undefined;
      let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
      const current = (socket: Socket) => !ended && this.socket === socket && this.closeConnection === finish;
      const cancelled = (error: Error) => { this.pending.delete(cancelled); reject(error); };
      const stopRefresh = () => { clearTimeout(refreshTimer); refreshTimer = undefined; };
      const dispose = (socket: Socket | null) => {
        if (!socket) return;
        socket.offAny(); socket.removeAllListeners();
        // Stop polling now, even when an old POST is still awaiting native completion.
        socket.io.engine?.transport.close(); socket.disconnect();
      };
      const finish = () => {
        if (ended) return;
        ended = true; reconnectKey = undefined; lastKeyRefresh = undefined; controlReady = false;
        stopRefresh(); clearTimeout(retryTimer); clearTimeout(attemptTimer); clearTimeout(deadlineTimer);
        const socket = this.socket;
        this.socket = null; this.closeConnection = undefined; this.controlAccepted = undefined;
        this.rejectPending(); dispose(socket); this.onClose();
      };
      const recoveryFailed = () => { if (!ended) { console.info('UU_REA_RTC|RECOVERY_FAILED'); finish(); } };
      const initialFailed = () => { if (!ended) { cancelled(new ControllerError('SIGNAL_FAILED')); finish(); } };
      const scheduleRefresh = (socket: Socket) => {
        stopRefresh(); refreshTimer = setTimeout(() => void refresh(socket), 30000);
      };
      const refresh = async (socket: Socket) => {
        if (!current(socket) || !socket.connected) return;
        // Official Mac checks every 30s and refreshes after a 300s age. Keep the
        // actual opaque key only in this logical connection's memory, never logs/storage.
        if (lastKeyRefresh === undefined || Date.now() - lastKeyRefresh >= 300000) {
          try {
            const result = await this.ack('refresh_reconnect_key');
            if (!current(socket) || !socket.connected) return;
            const key = asRecord(result[1]).reconnect_key;
            if (result[0] === 'success' && typeof key === 'string' && key.length > 0 && key.length <= 8192 && !/[\u0000-\u001f\u007f]/.test(key)) {
              reconnectKey = key; lastKeyRefresh = Date.now(); console.info('UU_REA_RTC|KEY_REFRESH_OK');
            } else console.info('UU_REA_RTC|KEY_REFRESH_REJECTED');
          } catch { if (current(socket) && socket.connected) console.info('UU_REA_RTC|KEY_REFRESH_FAILED'); }
        }
        if (current(socket) && socket.connected) scheduleRefresh(socket);
      };
      const retry = (socket: Socket) => {
        if (!current(socket)) return;
        stopRefresh(); clearTimeout(attemptTimer); this.rejectPending();
        this.socket = null; dispose(socket);
        if (!recovering) {
          recovering = true; attempts = 0; console.info('UU_REA_RTC|RECOVERY_START');
          deadlineTimer = setTimeout(recoveryFailed, 2 * (delay + timeout));
        }
        if (attempts >= 2) { recoveryFailed(); return; }
        retryTimer = setTimeout(() => { if (!ended) start(true); }, delay);
      };
      const retryInitial = (socket: Socket) => {
        if (!current(socket)) return;
        if (attempts >= 2) { initialFailed(); return; }
        clearTimeout(attemptTimer);
        this.socket = null; dispose(socket);
        console.info('UU_REA_RTC|INITIAL_RETRY');
        retryTimer = setTimeout(() => { if (!ended) start(false); }, delay);
      };
      const start = (recovery: boolean) => {
        attempts++;
        let namespaceConnected = false;
        // A fresh private Manager drops the old Engine.IO sid, ACKs and write buffer.
        // Resume the same room with its key; do not replay control, offer or old POSTs.
        const attemptHeaders = { ...headers, ...(recovery ? { 'X-NRD-RECONN-KEY': reconnectKey! } : {}) };
        const socket = io(server, { autoConnect: false, forceNew: true, reconnection: false, upgrade: false, rememberUpgrade: false, timeout, transports: [nativePollingTransport(this.bridge, attemptHeaders, this.isolateRelayCandidates)] });
        this.socket = socket;
        socket.onAny((event, ...payload: unknown[]) => {
          if (!current(socket)) return;
          const kinds: Record<string, string> = { switch_network_notify: 'SWITCH_NETWORK', device_capability: 'DEVICE_CAPABILITY', streamer_push: 'STREAMER_PUSH', forward_setting: 'FORWARD_SETTING', publisher_disconnect: 'PUBLISHER_DISCONNECT', leave: 'LEAVE', left: 'LEFT' };
          if (Object.prototype.hasOwnProperty.call(kinds, event)) console.info(`UU_REA_SIGNAL_EVENT|${kinds[event]}`);
          this.record(event === 'bmsg_push' ? 'PUSH_RECEIVED' : ['soac', 'answer', 'candidate', 'restart_ice'].includes(event) ? 'SOAC_OTHER' : 'SIGNAL_OTHER');
          for (const normalized of normalizeSignalGatewayInboundEvents(event, payload, binary)) {
            if (!current(socket)) break;
            this.onEvent({ id: ++this.nextEvent, direction: 'inbound', event: normalized.event, payload: normalized.payload, receivedAt: new Date().toISOString() });
          }
          // Official controller's root leave handler is a server kick-out.
          if (event === 'publisher_disconnect' || event === 'leave') finish();
        });
        socket.on('connect', () => {
          if (!current(socket)) return;
          namespaceConnected = true;
          clearTimeout(attemptTimer); clearTimeout(deadlineTimer);
          if (recovering) { recovering = false; attempts = 0; console.info('UU_REA_RTC|RECOVERY_OK'); }
          else { this.record('SIGNAL_CONNECTED'); this.pending.delete(cancelled); resolve(); }
          scheduleRefresh(socket);
        });
        socket.on('connect_error', error => {
          if (!current(socket)) return;
          // Socket.IO CONNECT_ERROR destroys the namespace subscription; transport
          // failures leave it active. A server rejection must not be retried.
          const permanent = !socket.active || ['NATIVE_POLLING_PARSE_ERROR', 'NATIVE_POLLING_REJECTED'].includes(asRecord(error).description as string);
          if (!recovery) {
            if (!namespaceConnected && !permanent && (asRecord(error).type === 'TransportError' || error.message === 'timeout')) retryInitial(socket);
            else initialFailed();
          } else if (permanent) recoveryFailed();
          else retry(socket);
        });
        const disconnected = (reason: string, description?: unknown) => {
          if (!current(socket)) return;
          const parsingFailed = reason === 'parse error' || asRecord(description).description === 'NATIVE_POLLING_PARSE_ERROR';
          const rejected = asRecord(description).description === 'NATIVE_POLLING_REJECTED';
          const serverClosed = reason === 'io server disconnect' || asRecord(description).description === 'polling server closed';
          const reasons: Record<string, string> = { 'ping timeout': 'PING_TIMEOUT', 'transport error': 'TRANSPORT_ERROR', 'transport close': 'TRANSPORT_CLOSE', 'io server disconnect': 'SERVER_DISCONNECT', 'io client disconnect': 'CLIENT_DISCONNECT', 'parse error': 'PARSE_ERROR' };
          console.info(`UU_REA_SIGNAL_END|${parsingFailed ? 'PARSE_ERROR' : serverClosed ? 'SERVER_DISCONNECT' : Object.prototype.hasOwnProperty.call(reasons, reason) ? reasons[reason] : 'OTHER'}`);
          const transient = !parsingFailed && !rejected && !serverClosed && ['ping timeout', 'transport error', 'transport close'].includes(reason);
          if (transient && !recovery && !namespaceConnected) retryInitial(socket);
          else if (transient && controlReady && reconnectKey) retry(socket);
          else if (recovering) recoveryFailed();
          else finish();
        };
        socket.on('disconnect', disconnected);
        // Manager's timeout ends at Engine.IO open; also bound the namespace handshake.
        attemptTimer = setTimeout(() => {
          if (!current(socket)) return;
          if (recovery) retry(socket);
          else retryInitial(socket);
        }, timeout);
        socket.connect();
        // Manager starts observing Engine.IO close only after its open event.
        socket.io.engine?.once('close', (reason, description) => {
          if (!namespaceConnected) disconnected(reason, description);
        });
      };
      this.closeConnection = finish;
      this.controlAccepted = socket => { if (current(socket)) controlReady = true; };
      this.pending.add(cancelled);
      deadlineTimer = setTimeout(initialFailed, 2 * timeout + delay);
      start(false);
    });
  }
  async sendSignalControl(input: RemoteSignalControlRequest): Promise<RemoteSignalControlResult> {
    const socket = this.socket;
    const emittedAt = new Date().toISOString();
    const raw = await this.ack('control', buildSignalGatewayControlPayload(input, binary));
    const normalized = normalizeSignalGatewayPayload(raw, binary) as unknown[];
    const control = normalizeStreamerSignalControlAck(normalized);
    if (socket && control.result && !getStreamerSignalControlFailure(control)) this.controlAccepted?.(socket);
    return { event: 'control', ack: normalized, ackStatus: typeof normalized[0] === 'string' ? normalized[0] : undefined, control, emittedAt, ackReceivedAt: new Date().toISOString() };
  }
  async sendSignalSoac(input: RemoteSignalSoacRequest): Promise<RemoteSignalSoacResult> {
    if (!this.socket?.connected) throw new ControllerError('SOCKET_CLOSED');
    const socket = this.socket;
    const payload = buildSignalGatewaySoacPayload(input, binary);
    socket.emit('soac', payload, (...ack: unknown[]) => {
      if (this.socket !== socket) return;
      const result = asRecord(ack.find(value => value !== null && typeof value === 'object'));
      this.record((ack[0] === 'success' || result.code === 0) && (result.code === undefined || result.code === 0) ? 'SOAC_ACK_OK' : 'SOAC_ACK_REJECTED');
    });
    return { event: 'soac', payload: null, emittedAt: new Date().toISOString() };
  }
  close(): void {
    this.closeConnection?.();
  }
  private rejectPending(): void {
    for (const reject of [...this.pending]) reject(new ControllerError('SOCKET_CLOSED'));
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
