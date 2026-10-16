import { ControllerError, type NativeBridge } from './nativeBridge';
import { signalUrl } from './security';
let nextSocket = 0;
export function fromBase64(value: string): Uint8Array { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
export function toBase64(bytes: Uint8Array): string {
  let raw = '';
  for (let i = 0; i < bytes.length; i += 8192) raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(raw);
}
export class NativeWebSocket {
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  readyState = 0;
  binaryType = 'arraybuffer';
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number; reason: string; wasClean: boolean }) => void) | null = null;
  private readonly socketId = `signal-${++nextSocket}`;
  private readonly unlisten: () => void;
  constructor(private readonly bridge: NativeBridge, url: string, headers: Record<string, string>) {
    const safeUrl = signalUrl(url);
    this.unlisten = bridge.listenSocket(this.socketId, (event, payload) => {
      if (this.readyState === 3) return;
      if (event === 'open') { this.readyState = 1; this.onopen?.(new Event('open')); }
      else if (event === 'message' && typeof payload.data === 'string') {
        if (payload.binary === true) {
          const raw = fromBase64(payload.data);
          const bytes = raw[0] === 4 ? raw.subarray(1) : raw;
          this.onmessage?.({ data: bytes.slice().buffer });
        } else this.onmessage?.({ data: payload.data });
      } else if (event === 'close') this.finishClose(typeof payload.code === 'number' ? payload.code : 1006);
      else if (event === 'error') { this.onerror?.(new Event('error')); this.finishClose(1006); }
    });
    void bridge.request({ op: 'ws.open', socketId: this.socketId, url: safeUrl, headers }).catch(() => {
      if (this.readyState === 3) return;
      this.onerror?.(new Event('error'));
      this.finishClose(1006);
    });
  }
  send(data: string | ArrayBuffer | ArrayBufferView): void {
    if (this.readyState !== 1) throw new ControllerError('SOCKET_CLOSED');
    const binary = typeof data !== 'string';
    let encoded: string;
    if (typeof data === 'string') encoded = data;
    else {
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      const framed = new Uint8Array(bytes.length + (bytes[0] === 4 ? 0 : 1));
      if (bytes[0] !== 4) { framed[0] = 4; framed.set(bytes, 1); } else framed.set(bytes);
      encoded = toBase64(framed);
    }
    void this.bridge.request({ op: 'ws.send', socketId: this.socketId, data: encoded, binary }).catch(() => {
      this.onerror?.(new Event('error'));
      this.finishClose(1006);
    });
  }
  close(): void {
    if (this.readyState >= 2) return;
    this.readyState = 2;
    void this.bridge.request({ op: 'ws.close', socketId: this.socketId }).finally(() => this.finishClose(1000)).catch(() => {});
  }
  private finishClose(code: number): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.unlisten();
    this.onclose?.({ code, reason: '', wasClean: code === 1000 });
  }
}
