import { expect, it } from 'vitest';
import { NativeBridge, type BridgeHost } from '../src/nativeBridge';
import { NativeWebSocket } from '../src/nativeSocket';

it('carries UU binary 0x04 framing and delivers close only once', async () => {
  const requests: Record<string, unknown>[] = [];
  const host: BridgeHost = { UUBridge: { invoke(id, payload) { requests.push(JSON.parse(payload)); host.__uuNativeResult?.(id, true, '{}'); } } };
  const bridge = new NativeBridge(host);
  const ws = new NativeWebSocket(bridge, 'wss://signal.nrd.nie.163.com/socket.io/?EIO=4&transport=websocket', { 'X-NRD-AUTH': 'fixture-room-token' });
  const received: unknown[] = [];
  let closes = 0;
  ws.onmessage = event => received.push(event.data);
  ws.onclose = () => { closes++; };
  expect(requests[0]).toMatchObject({ op: 'ws.open' });
  const socketId = requests[0]!.socketId as string;
  host.__uuSocketEvent?.(socketId, 'open', '{}');
  ws.send(new Uint8Array([31, 139, 8]));
  await Promise.resolve();
  expect(requests.find(r => r.op === 'ws.send')).toMatchObject({ binary: true, data: 'BB+LCA==' });
  host.__uuSocketEvent?.(socketId, 'message', '{"data":"BB+LCA==","binary":true}');
  expect(Array.from(new Uint8Array(received[0] as ArrayBuffer))).toEqual([31, 139, 8]);
  host.__uuSocketEvent?.(socketId, 'close', '{"code":1000}');
  host.__uuSocketEvent?.(socketId, 'close', '{}');
  expect(ws.readyState).toBe(3);
  expect(closes).toBe(1);
  expect(() => ws.send('42["control"]')).toThrow();
});
