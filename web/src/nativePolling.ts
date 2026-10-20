import { Transport } from 'engine.io-client';
import { decodePayload, encodePayload, type Packet } from 'engine.io-parser';
import { asRecord, type NativeBridge } from './nativeBridge';
import { pollingUrl } from './security';

// HTTPS-only Engine.IO 4 polling. Socket.IO upgrades are disabled by its caller.
// Closing stops future requests and ignores in-flight responses; native read timeout is 40s.
export function nativePollingTransport(bridge: NativeBridge, authHeaders: Record<string, string>, isolateRelayCandidates = false) {
  return class NativePolling extends Transport {
    private stopped = false;
    private soacBatch = 0;
    private pongBatch = 0;
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
      let offers = 0; let candidates = 0;
      const pongs = packets.filter(packet => packet.type === 'pong').length;
      const relayIndexes = new Set<number>();
      for (const [index, packet] of packets.entries()) {
        // Current uncompressed SOAC events are root-namespace Socket.IO JSON.
        // Inspect only their fixed event/type fields; never retain or log payloads.
        if (packet.type !== 'message' || typeof packet.data !== 'string' || !/^2[0-9]*\[/.test(packet.data)) continue;
        try {
          const event: unknown = JSON.parse(packet.data.slice(packet.data.indexOf('[')));
          if (!Array.isArray(event) || event[0] !== 'soac') continue;
          const data = asRecord(asRecord(event[1]).data);
          const type = data.type;
          if (type === 'offer') offers++;
          else if (type === 'candidate') {
            candidates++;
            const value = asRecord(data.candidate).candidate;
            if (typeof value === 'string' && /^candidate:\S+\s+[0-9]+\s+(?:udp|tcp)\s+[0-9]+\s+\S+\s+[0-9]+\s+typ\s+relay(?:\s|$)/i.test(value)) relayIndexes.add(index);
          }
        } catch { /* Diagnostics must not change framing or transmission. */ }
      }
      // UU expects a legacy Engine.IO message prefix inside each binary attachment.
      // Adapted from the MIT signal adapter; API23 polling interoperability verified.
      const framed = packets.map(packet => {
        const data: unknown = packet.data;
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
        if (packet.type !== 'message' || !bytes || bytes[0] === 4) return packet;
        const prefixed = new Uint8Array(bytes.length + 1); prefixed[0] = 4; prefixed.set(bytes, 1);
        return { ...packet, data: prefixed };
      });
      // Preserve FIFO, separating each relay packet while
      // batching contiguous other candidates. Mixed/binary writes stay untouched.
      if (isolateRelayCandidates && candidates === packets.length && candidates > 1 && relayIndexes.size > 0) {
        const batches: Packet[][] = [];
        let segment: Packet[] = [];
        for (const [index, packet] of framed.entries()) {
          if (relayIndexes.has(index)) {
            if (segment.length > 0) batches.push(segment);
            batches.push([packet]);
            segment = [];
          } else segment.push(packet);
        }
        if (segment.length > 0) batches.push(segment);
        let index = 0;
        const postNext = () => {
          if (this.stopped) return;
          const batch = batches[index++]!;
          encodePayload(batch, payload => {
            if (this.stopped) return;
            const soac = { batch: ++this.soacBatch, offers: 0, candidates: batch.length };
            void this.request('POST', payload, soac).then(() => {
              if (this.stopped) return;
              if (index < batches.length) postNext();
              else { this.writable = true; this.emitReserved('drain'); }
            }).catch(error => this.fail(error));
          });
        };
        postNext();
        return;
      }
      encodePayload(framed, payload => {
        if (this.stopped) return;
        const soac = offers + candidates > 0 ? { batch: ++this.soacBatch, offers, candidates } : undefined;
        void this.request('POST', payload, soac, pongs).then(() => {
          if (this.stopped) return;
          this.writable = true;
          this.emitReserved('drain');
        }).catch(error => this.fail(error));
      });
    }
    private async poll(): Promise<void> {
      try {
        const response = await this.request('GET');
        if (this.stopped) return;
        for (const packet of decodePayload(response.body, this.socket.binaryType)) {
          if (this.stopped) return;
          if (packet.type === 'error') { this.fail('NATIVE_POLLING_PARSE_ERROR'); return; }
          if (packet.type === 'open' && this.readyState === 'opening') this.onOpen();
          if (packet.type === 'close') { this.onClose({ description: 'polling server closed' }); return; }
          if (packet.type === 'ping') console.info('UU_REA_PING_RX');
          this.onPacket(packet);
        }
        if (!this.stopped && this.readyState === 'open') void this.poll();
      } catch (error) { this.fail(error); }
    }
    private async request(method: 'GET' | 'POST', body?: string, soac?: { batch: number; offers: number; candidates: number }, pongs = 0): Promise<{ status: number; body: string }> {
      const started = Date.now();
      const url = pollingUrl(this.createUri('https', { ...this.query, t: `${Date.now()}-${Math.random().toString(36).slice(2)}` }));
      // Transport.socket is Engine.IO's Socket. Its handshake sets both IDs;
      // Socket.IO's separate socket.id must never be used for this comparison.
      const sid = !this.socket.id || !this.query.sid ? 'MISSING' : this.socket.id === this.query.sid ? 'MATCH' : 'MISMATCH';
      const recordSoac = (stage: 'BEGIN' | 'OK' | 'FAIL', acknowledgement: 'PENDING' | 'OK' | 'OTHER' | 'NONE') => {
        if (!this.stopped && soac) console.info(`UU_REA_SOAC_POST|${soac.batch}|${stage}|${soac.offers}|${soac.candidates}|${sid}|${acknowledgement}`);
      };
      const pongBatch = pongs > 0 ? ++this.pongBatch : 0;
      const recordPong = (stage: 'BEGIN' | 'OK' | 'FAIL') => {
        if (!this.stopped && pongs > 0) console.info(`UU_REA_PONG_POST|${pongBatch}|${stage}|${pongs}`);
      };
      recordSoac('BEGIN', 'PENDING');
      recordPong('BEGIN');
      try {
        const response = await bridge.request<{ status: number; body: string }>({ op: 'http', method, url, headers: { ...authHeaders, ...(method === 'POST' ? { 'Content-Type': 'text/plain;charset=UTF-8' } : {}) }, ...(body === undefined ? {} : { body }) });
        if (!this.stopped && Number.isInteger(response.status) && response.status >= 100 && response.status <= 599) console.info(`UU_REA_POLL|${method}|${response.status}|${Math.max(0, Date.now() - started)}`);
        if (response.status === 401 || response.status === 403) throw new Error('NATIVE_POLLING_REJECTED');
        if (response.status < 200 || response.status >= 300 || typeof response.body !== 'string') throw new Error('POLLING_FAILED');
        recordSoac('OK', response.status === 200 ? response.body === 'ok' ? 'OK' : 'OTHER' : 'NONE');
        recordPong('OK');
        return response;
      } catch (error) { recordSoac('FAIL', 'NONE'); recordPong('FAIL'); throw error; }
    }
    private fail(error?: unknown): void {
      if (this.stopped) return;
      this.stopped = true;
      const description = error === 'NATIVE_POLLING_PARSE_ERROR' ? error : error instanceof Error && error.message === 'NATIVE_POLLING_REJECTED' ? error.message : undefined;
      this.onError('native HTTPS polling failed', description);
    }
  };
}
