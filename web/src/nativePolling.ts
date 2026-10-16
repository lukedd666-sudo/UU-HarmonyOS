import { Transport } from 'engine.io-client';
import { decodePayload, encodePayload, type Packet } from 'engine.io-parser';
import type { NativeBridge } from './nativeBridge';
import { pollingUrl } from './security';

// HTTPS-only Engine.IO 4 polling. Socket.IO upgrades are disabled by its caller.
// Closing stops future requests and ignores in-flight responses; native read timeout is 40s.
export function nativePollingTransport(bridge: NativeBridge, authHeaders: Record<string, string>) {
  return class NativePolling extends Transport {
    private stopped = false;
    get name(): string { return 'polling'; }
    protected doOpen(): void { void this.poll(); }
    protected doClose(): void {
      if (this.readyState === 'open' && this.writable && !this.stopped) void this.request('POST', '1').catch(() => {});
      this.stopped = true;
    }
    protected override onClose(details?: { description: string }): void {
      this.stopped = true;
      super.onClose(details);
    }
    protected write(packets: Packet[]): void {
      this.writable = false;
      encodePayload(packets, payload => {
        if (this.stopped) return;
        void this.request('POST', payload).then(() => {
          if (this.stopped) return;
          this.writable = true;
          this.emitReserved('drain');
        }).catch(() => this.fail());
      });
    }
    private async poll(): Promise<void> {
      try {
        const response = await this.request('GET');
        if (this.stopped) return;
        for (const packet of decodePayload(response.body, this.socket.binaryType)) {
          if (this.stopped) return;
          if (packet.type === 'error') { this.fail(); return; }
          if (packet.type === 'open' && this.readyState === 'opening') this.onOpen();
          if (packet.type === 'close') { this.onClose({ description: 'polling server closed' }); return; }
          this.onPacket(packet);
        }
        if (!this.stopped && this.readyState === 'open') void this.poll();
      } catch { this.fail(); }
    }
    private async request(method: 'GET' | 'POST', body?: string): Promise<{ status: number; body: string }> {
      const url = pollingUrl(this.createUri('https', { ...this.query, t: `${Date.now()}-${Math.random().toString(36).slice(2)}` }));
      const response = await bridge.request<{ status: number; body: string }>({ op: 'http', method, url, headers: { ...authHeaders, ...(method === 'POST' ? { 'Content-Type': 'text/plain;charset=UTF-8' } : {}) }, ...(body === undefined ? {} : { body }) }, { longPoll: method === 'GET' });
      if (response.status < 200 || response.status >= 300 || typeof response.body !== 'string') throw new Error('POLLING_FAILED');
      return response;
    }
    private fail(): void {
      if (this.stopped) return;
      this.stopped = true;
      this.onError('native HTTPS polling failed', undefined);
    }
  };
}
