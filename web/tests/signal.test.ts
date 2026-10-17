import { afterEach, expect, it, vi } from 'vitest';
import { NativeBridge, type BridgeHost } from '../src/nativeBridge';
import { SignalClient } from '../src/signalClient';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

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
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
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
  expect(log.mock.calls.some(([record]) => /^UU_REA_POLL\|GET\|403\|[0-9]+$/.test(record))).toBe(true);
  expect(JSON.stringify(log.mock.calls)).not.toContain('sensitive');
  signal.close();
  log.mockRestore();
});

it('distinguishes an established connection heartbeat timeout using a fixed reason only', async () => {
  vi.useFakeTimers();
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const polls: string[] = [];
  const host: BridgeHost = { UUBridge: { invoke(id, payload) {
    const request = JSON.parse(payload);
    if (request.method === 'GET') polls.push(id);
    else host.__uuNativeResult?.(id, true, '{"status":200,"body":"ok"}');
  } } };
  const signal = new SignalClient(new NativeBridge(host), () => {}, () => {});
  try {
    const connecting = signal.connect({ token: 'private-fixture', signalServers: ['wss://signal.nrd.nie.163.com'] });
    const respond = (body: string) => host.__uuNativeResult?.(polls.shift()!, true, JSON.stringify({ status: 200, body }));
    respond('0{"sid":"private-session","upgrades":[],"pingInterval":1000,"pingTimeout":1000}');
    await vi.advanceTimersByTimeAsync(0);
    respond('40{"sid":"private-socket"}');
    await connecting;
    await vi.advanceTimersByTimeAsync(2001);
    expect(log.mock.calls.some(([record]) => record === 'UU_REA_SIGNAL_END|PING_TIMEOUT')).toBe(true);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  } finally { signal.close(); log.mockRestore(); }
});

it('refreshes the current signaling session without payload or overlapping requests, and stops on close', async () => {
  vi.useFakeTimers();
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  let gets = 0;
  let pendingGet: { id: string; timer: ReturnType<typeof setTimeout> } | undefined;
  const refreshes: { id: string; at: number; wire: string }[] = [];
  const host: BridgeHost = { UUBridge: { invoke(id, payload) {
    const r = JSON.parse(payload);
    const respond = (requestId: string, body: string) => host.__uuNativeResult?.(requestId, true, JSON.stringify({ status: 200, body }));
    if (r.method === 'GET') {
      gets++;
      const body = gets === 1 ? '0{"sid":"fixture","upgrades":[],"pingInterval":15000,"pingTimeout":20000}' : gets === 2 ? '40{"sid":"fixture"}' : '2';
      const timer = setTimeout(() => { pendingGet = undefined; respond(id, body); }, gets <= 2 ? 0 : 15000);
      pendingGet = { id, timer };
    } else {
      respond(id, 'ok');
      const m = /^42([0-9]+)\["refresh_reconnect_key"\]$/.exec(r.body);
      if (m) refreshes.push({ id: m[1]!, at: Date.now(), wire: r.body });
    }
  } } };
  const signal = new SignalClient(new NativeBridge(host), () => {}, () => {});
  const acknowledge = (body: string) => {
    const poll = pendingGet!; clearTimeout(poll.timer); pendingGet = undefined;
    host.__uuNativeResult?.(poll.id, true, JSON.stringify({ status: 200, body }));
  };
  try {
    const connecting = signal.connect({ token: 'private-token', signalServers: ['wss://signal.nrd.nie.163.com'] });
    await vi.advanceTimersByTimeAsync(1); await connecting;
    await vi.advanceTimersByTimeAsync(29999); expect(refreshes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1); expect(refreshes).toHaveLength(1);
    const firstAt = refreshes[0]!.at;
    acknowledge(`43${refreshes[0]!.id}["success",{"reconnect_key":"private-key"}]`);
    await vi.advanceTimersByTimeAsync(0);
    expect(log.mock.calls.some(([r]) => r === 'UU_REA_RTC|KEY_REFRESH_OK')).toBe(true);
    await vi.advanceTimersByTimeAsync(299999); expect(refreshes).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1); expect(refreshes).toHaveLength(2);
    expect(refreshes[1]!.at - firstAt).toBe(300000);
    // Withhold the second ACK: bounded timeout, no overlap, 30s before retry.
    await vi.advanceTimersByTimeAsync(5000); expect(refreshes).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(5001);
    expect(log.mock.calls.some(([r]) => r === 'UU_REA_RTC|KEY_REFRESH_FAILED')).toBe(true);
    await vi.advanceTimersByTimeAsync(30000); expect(refreshes).toHaveLength(3);
    expect(refreshes[2]!.at - refreshes[1]!.at).toBe(40000);
    signal.close();
    const successLogs = log.mock.calls.filter(([r]) => r === 'UU_REA_RTC|KEY_REFRESH_OK').length;
    acknowledge(`43${refreshes[2]!.id}["success",{"reconnect_key":"private-late-key"}]`);
    await vi.advanceTimersByTimeAsync(400000);
    expect(refreshes).toHaveLength(3);
    expect(log.mock.calls.filter(([r]) => r === 'UU_REA_RTC|KEY_REFRESH_OK')).toHaveLength(successLogs);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  } finally { signal.close(); }
});
