import { afterEach, expect, it, vi } from 'vitest';
import { NativeBridge, type BridgeHost } from '../src/nativeBridge';
import { SignalClient } from '../src/signalClient';

afterEach(() => vi.useRealTimers());

it('cancels an unfinished native signaling handshake without waiting for the network timeout', async () => {
  const host: BridgeHost = { UUBridge: { invoke() {} } };
  const signal = new SignalClient(new NativeBridge(host), () => {}, () => {});
  let settled = false;
  const pending = signal.connect({ token: 'fixture', signalServers: ['wss://signal.nrd.nie.163.com'] }).catch(error => { settled = true; return error; });
  signal.close();
  await Promise.resolve();
  await Promise.resolve();
  expect(settled).toBe(true);
  expect(await pending).toMatchObject({ code: 'SOCKET_CLOSED' });
});

it('runs real Engine.IO polling GET/POST and Socket.IO binary frames with auth headers and no upgrade', async () => {
  const requests: Record<string, unknown>[] = [];
  const polls: string[] = [];
  const host: BridgeHost = { UUBridge: { invoke(id, payload) {
    const request = JSON.parse(payload); requests.push(request);
    if (request.method === 'GET') polls.push(id);
    else if (request.body !== 'bBAECAw==') host.__uuNativeResult?.(id, true, JSON.stringify({ status: 200, body: 'ok', headers: {} }));
  } } };
  let closed = false;
  const signal = new SignalClient(new NativeBridge(host), () => {}, () => { closed = true; });
  const connecting = signal.connect({ token: 'fixture-token', signalServers: ['wss://signal.nrd.nie.163.com'] });
  expect(requests[0]).toMatchObject({ op: 'http', method: 'GET', headers: { 'X-NRD-AUTH': 'fixture-token' } });
  const firstUrl = new URL(requests[0]!.url as string);
  expect(firstUrl.origin).toBe('https://signal.nrd.nie.163.com');
  expect(firstUrl.pathname).toBe('/socket.io/');
  expect(firstUrl.searchParams.get('EIO')).toBe('4');
  expect(firstUrl.searchParams.get('transport')).toBe('polling');
  const respond = (id: string, body: string) => host.__uuNativeResult?.(id, true, JSON.stringify({ status: 200, body, headers: {} }));
  respond(polls.shift()!, '0{"sid":"eio-id","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}');
  await new Promise(resolve => setTimeout(resolve, 1));
  expect(requests.some(r => r.method === 'POST' && r.body === '40')).toBe(true);
  respond(polls.shift()!, '40{"sid":"socket-id"}');
  await connecting;
  const pending = signal.sendSignalControl({ appControlId: 'control-fixture', appDataBase64: 'AQID' }).catch(error => error);
  await new Promise(resolve => setTimeout(resolve, 1));
  expect(requests.some(r => typeof r.body === 'string' && r.body.startsWith('451-0["control",'))).toBe(true);
  expect(requests.some(r => typeof r.body === 'string' && r.body.split('\x1e').includes('bBAECAw=='))).toBe(true);
  expect(requests.every(r => r.op === 'http' && new URL(r.url as string).searchParams.get('transport') === 'polling')).toBe(true);
  expect(requests.every(r => (r.headers as Record<string, string>)['X-NRD-AUTH'] === 'fixture-token')).toBe(true);
  signal.close();
  const afterClose = requests.length;
  respond(polls.shift()!, '2');
  await new Promise(resolve => setTimeout(resolve, 1));
  expect(requests).toHaveLength(afterClose);
  expect(await pending).toMatchObject({ code: 'SOCKET_CLOSED' });
  expect(closed).toBe(true);
  signal.close();
});

it('ignores a late long-poll response after disconnect and never starts another request', async () => {
  vi.useFakeTimers();
  const ids: string[] = [];
  const requests: Record<string, unknown>[] = [];
  const host: BridgeHost = { UUBridge: { invoke(id, payload) { ids.push(id); requests.push(JSON.parse(payload)); } } };
  const signal = new SignalClient(new NativeBridge(host), () => {}, () => {});
  const pending = signal.connect({ token: 'fixture', signalServers: ['wss://signal.nrd.nie.163.com'] }).catch(error => error);
  signal.close();
  expect(await pending).toMatchObject({ code: 'SOCKET_CLOSED' });
  host.__uuNativeResult?.(ids[0]!, true, JSON.stringify({ status: 200, body: '0{"sid":"late","upgrades":[],"pingInterval":25000,"pingTimeout":20000}', headers: {} }));
  await vi.advanceTimersByTimeAsync(50000);
  expect(requests).toHaveLength(1);
});

it('rejects polling HTTP failure with a fixed safe error and no websocket fallback', async () => {
  const requests: Record<string, unknown>[] = [];
  const host: BridgeHost = { UUBridge: { invoke(id, payload) {
    requests.push(JSON.parse(payload));
    host.__uuNativeResult?.(id, true, JSON.stringify({ status: 403, body: 'sensitive server response token=fixture', headers: {} }));
  } } };
  const signal = new SignalClient(new NativeBridge(host), () => {}, () => {});
  const error = await signal.connect({ token: 'fixture', signalServers: ['wss://signal.nrd.nie.163.com'] }).catch(error => error);
  expect(error.code).toBe('SIGNAL_FAILED');
  expect(error.message).not.toContain('sensitive');
  expect(requests.every(r => r.op === 'http')).toBe(true);
  signal.close();
});
