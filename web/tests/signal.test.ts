import { afterEach, expect, it, vi } from 'vitest';
import { NativeBridge, type BridgeHost } from '../src/nativeBridge';
import { SignalClient } from '../src/signalClient';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

// Keep the real Socket.IO + Engine.IO queue; only the native HTTP boundary is a fixture.
function soacPollingFixture(isolateRelayCandidates?: boolean) {
  const requests: { id: string; request: Record<string, unknown> }[] = [];
  const polls: string[] = [];
  const posts: { id: string; body: string }[] = [];
  const host: BridgeHost = { UUBridge: { invoke(id, payload) {
    const request = JSON.parse(payload); requests.push({ id, request });
    if (request.method === 'GET') polls.push(id);
    else if (request.body === '40') respond(id, 200, 'ok');
    else if (request.body !== '1') posts.push({ id, body: request.body });
  } } };
  const respond = (id: string, status: number, body: string) => host.__uuNativeResult?.(id, true, JSON.stringify({ status, body }));
  let closed = false;
  const signal = new SignalClient(new NativeBridge(host), () => {}, () => { closed = true; }, isolateRelayCandidates);
  return {
    requests, polls, posts, signal, respond, isClosed: () => closed,
    async connect() {
      const connecting = signal.connect({ token: 'private-auth-token', signalServers: ['wss://signal.nrd.nie.163.com'] });
      respond(polls.shift()!, 200, '0{"sid":"private-engine-session","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}');
      await vi.advanceTimersByTimeAsync(0);
      // Deliberately different: the POST query must match Engine.IO, not Socket.IO's ID.
      respond(polls.shift()!, 200, '40{"sid":"private-socket-session"}');
      await connecting;
    },
  };
}

it('records received ping and actual pong POST completion without inspecting heartbeat or response contents', async () => {
  vi.useFakeTimers();
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const fixture = soacPollingFixture();
  const records = () => log.mock.calls.map(([record]) => record).filter(record => record === 'UU_REA_PING_RX' || record.startsWith('UU_REA_PONG_POST|'));
  try {
    await fixture.connect();
    fixture.respond(fixture.polls.shift()!, 200, '2private-ping-data');
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.posts).toHaveLength(1);
    expect(fixture.posts[0]!.body).toBe('3');
    expect(records()).toEqual(['UU_REA_PING_RX', 'UU_REA_PONG_POST|1|BEGIN|1']);
    fixture.respond(fixture.posts[0]!.id, 200, 'private-response-other-than-ok');
    await vi.advanceTimersByTimeAsync(0);
    expect(records()).toEqual(['UU_REA_PING_RX', 'UU_REA_PONG_POST|1|BEGIN|1', 'UU_REA_PONG_POST|1|OK|1']);
    expect(fixture.isClosed()).toBe(false);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  } finally { fixture.signal.close(); }
});

it('distinguishes received pings from pong packets waiting behind a POST and counts multiple pongs in one write', async () => {
  vi.useFakeTimers();
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const fixture = soacPollingFixture();
  const records = () => log.mock.calls.map(([record]) => record).filter(record => record === 'UU_REA_PING_RX' || record.startsWith('UU_REA_PONG_POST|'));
  try {
    await fixture.connect();
    await fixture.signal.sendSignalSoac({ type: 'offer', sdp: 'private-sdp', gzipSdp: false });
    await fixture.signal.sendSignalSoac({ type: 'candidate', candidate: { candidate: 'private-candidate' } });
    for (const body of ['2private-ping-1', '2private-ping-2']) {
      fixture.respond(fixture.polls.shift()!, 200, body);
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(fixture.posts).toHaveLength(1);
    expect(records()).toEqual(['UU_REA_PING_RX', 'UU_REA_PING_RX']);
    fixture.respond(fixture.posts[0]!.id, 200, 'ok');
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.posts).toHaveLength(2);
    expect(fixture.posts[1]!.body.split('\x1e').filter(packet => packet === '3')).toHaveLength(2);
    expect(records().at(-1)).toBe('UU_REA_PONG_POST|1|BEGIN|2');
    fixture.respond(fixture.posts[1]!.id, 200, 'ok');
    await vi.advanceTimersByTimeAsync(0);
    expect(records().at(-1)).toBe('UU_REA_PONG_POST|1|OK|2');
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  } finally { fixture.signal.close(); }
});

it.each(['failure', 'stop'] as const)('records a pong POST %s while ignoring completions after disconnect', async outcome => {
  vi.useFakeTimers();
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const fixture = soacPollingFixture();
  try {
    await fixture.connect();
    fixture.respond(fixture.polls.shift()!, 200, '2private-ping');
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.posts).toHaveLength(1);
    if (outcome === 'stop') fixture.signal.close();
    fixture.respond(fixture.posts[0]!.id, outcome === 'failure' ? 503 : 200, 'private-error-response');
    await vi.advanceTimersByTimeAsync(0);
    const requestCount = fixture.requests.length;
    fixture.respond(fixture.polls.shift()!, 200, '2private-late-ping');
    await vi.advanceTimersByTimeAsync(50000);
    expect(fixture.requests).toHaveLength(requestCount);
    expect(fixture.isClosed()).toBe(true);
    expect(log.mock.calls.map(([record]) => record).filter(record => record.startsWith('UU_REA_PONG_POST|'))).toEqual(outcome === 'failure'
      ? ['UU_REA_PONG_POST|1|BEGIN|1', 'UU_REA_PONG_POST|1|FAIL|1']
      : ['UU_REA_PONG_POST|1|BEGIN|1']);
    expect(log.mock.calls.filter(([record]) => record === 'UU_REA_PING_RX')).toHaveLength(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  } finally { fixture.signal.close(); }
});

it('traces completed SOAC POST batches while preserving the delayed offer and queued candidate order', async () => {
  vi.useFakeTimers();
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const fixture = soacPollingFixture();
  const records = () => log.mock.calls.map(([record]) => record).filter(record => record.startsWith('UU_REA_SOAC_POST|'));
  try {
    await fixture.connect();
    await fixture.signal.sendSignalSoac({ type: 'offer', clientId: 'private-client', iceId: 'private-ice', sdp: 'private-sdp', gzipSdp: false });
    await fixture.signal.sendSignalSoac({ type: 'candidate', iceId: 'private-ice', candidate: { candidate: 'private-candidate-1' } });
    await fixture.signal.sendSignalSoac({ type: 'candidate', iceId: 'private-ice', candidate: { candidate: 'private-candidate-2' } });
    expect(fixture.posts).toHaveLength(1);
    expect(fixture.posts[0]!.body).toContain('"type":"offer"');
    expect(records()).toEqual(['UU_REA_SOAC_POST|1|BEGIN|1|0|MATCH|PENDING']);
    expect(new URL(fixture.requests.find(({ id }) => id === fixture.posts[0]!.id)!.request.url as string).searchParams.get('sid')).toBe('private-engine-session');
    fixture.respond(fixture.posts[0]!.id, 200, 'ok');
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.posts).toHaveLength(2);
    expect(fixture.posts[1]!.body.split('\x1e')).toHaveLength(2);
    expect(fixture.posts[1]!.body).toContain('private-candidate-1');
    expect(fixture.posts[1]!.body).toContain('private-candidate-2');
    expect(records()).toEqual([
      'UU_REA_SOAC_POST|1|BEGIN|1|0|MATCH|PENDING',
      'UU_REA_SOAC_POST|1|OK|1|0|MATCH|OK',
      'UU_REA_SOAC_POST|2|BEGIN|0|2|MATCH|PENDING',
    ]);
    fixture.respond(fixture.posts[1]!.id, 200, 'ok');
    await vi.advanceTimersByTimeAsync(0);
    expect(records().at(-1)).toBe('UU_REA_SOAC_POST|2|OK|0|2|MATCH|OK');
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  } finally { fixture.signal.close(); }
});

it('keeps relay isolation disabled by default and sends queued candidates in one original-order POST', async () => {
  vi.useFakeTimers();
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const fixture = soacPollingFixture();
  const candidates = [
    'candidate:private-host 1 UDP 100 192.0.2.1 5000 typ host',
    'candidate:private-relay 1 UDP 80 192.0.2.2 5001 typ relay',
    'candidate:private-srflx 1 UDP 90 192.0.2.3 5002 typ srflx',
  ];
  try {
    await fixture.connect();
    await fixture.signal.sendSignalSoac({ type: 'offer', sdp: 'private-sdp', gzipSdp: false });
    for (const candidate of candidates) await fixture.signal.sendSignalSoac({ type: 'candidate', candidate: { candidate } });
    fixture.respond(fixture.posts[0]!.id, 200, 'ok');
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.posts).toHaveLength(2);
    expect(fixture.posts[1]!.body.split('\x1e').map(packet => JSON.parse(packet.slice(packet.indexOf('[')))[1].data.candidate.candidate)).toEqual(candidates);
    fixture.respond(fixture.posts[1]!.id, 200, 'ok');
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.posts).toHaveLength(2);
    expect(log.mock.calls.some(([record]) => record === 'UU_REA_SOAC_POST|2|OK|0|3|MATCH|OK')).toBe(true);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  } finally { fixture.signal.close(); }
});

it('keeps candidate FIFO while posting each relay separately and batching contiguous other candidates before draining', async () => {
  vi.useFakeTimers();
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const fixture = soacPollingFixture(true);
  const candidates = [
    { candidate: 'candidate:private-host1 1 UDP 100 192.0.2.1 5000 typ host', sdpMid: 'private-mid0', sdpMLineIndex: 0 },
    { candidate: 'candidate:private-srflx1 1 UDP 90 192.0.2.2 5001 typ srflx raddr 192.0.2.1 rport 5000', sdpMid: 'private-mid1', sdpMLineIndex: 1 },
    { candidate: 'candidate:private-relay1 1 UDP 80 192.0.2.3 5002 typ relay raddr 192.0.2.2 rport 5001', sdpMid: 'private-mid2', sdpMLineIndex: 2 },
    { candidate: 'candidate:private-host2 1 UDP 100 192.0.2.4 5003 typ host', sdpMid: 'private-mid3', sdpMLineIndex: 3 },
    { candidate: 'candidate:private-relay2 1 UDP 80 192.0.2.5 5004 typ relay raddr 192.0.2.2 rport 5001', sdpMid: 'private-mid4', sdpMLineIndex: 4 },
  ];
  const decoded = (body: string) => body.split('\x1e').map(packet => JSON.parse(packet.slice(packet.indexOf('[')))[1].data.candidate);
  try {
    await fixture.connect();
    await fixture.signal.sendSignalSoac({ type: 'offer', sdp: 'private-sdp', gzipSdp: false });
    for (const candidate of candidates) await fixture.signal.sendSignalSoac({ type: 'candidate', iceId: 'private-ice', candidate });
    expect(fixture.posts).toHaveLength(1);
    fixture.respond(fixture.posts[0]!.id, 200, 'ok');
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.posts).toHaveLength(2);
    expect(decoded(fixture.posts[1]!.body)).toEqual([candidates[0], candidates[1]]);
    // A later emit must wait until every segment of the original write finishes.
    await fixture.signal.sendSignalSoac({ type: 'candidate', candidate: { candidate: 'private-later' } });
    expect(fixture.posts).toHaveLength(2);
    fixture.respond(fixture.posts[1]!.id, 200, 'ok');
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.posts).toHaveLength(3);
    expect(decoded(fixture.posts[2]!.body)).toEqual([candidates[2]]);
    fixture.respond(fixture.posts[2]!.id, 200, 'ok');
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.posts).toHaveLength(4);
    expect(decoded(fixture.posts[3]!.body)).toEqual([candidates[3]]);
    fixture.respond(fixture.posts[3]!.id, 200, 'ok');
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.posts).toHaveLength(5);
    expect(decoded(fixture.posts[4]!.body)).toEqual([candidates[4]]);
    fixture.respond(fixture.posts[4]!.id, 200, 'ok');
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.posts).toHaveLength(6);
    expect(decoded(fixture.posts[5]!.body)).toEqual([{ candidate: 'private-later' }]);
    fixture.respond(fixture.posts[5]!.id, 200, 'ok');
    await vi.advanceTimersByTimeAsync(0);
    for (const { body } of fixture.posts.slice(1, 5)) for (const packet of body.split('\x1e')) {
      expect(JSON.parse(packet.slice(packet.indexOf('[')))[1].data.ice_id).toBe('private-ice');
    }
    expect(fixture.posts.every(({ id }) => new URL(fixture.requests.find(item => item.id === id)!.request.url as string).searchParams.get('sid') === 'private-engine-session')).toBe(true);
    expect(log.mock.calls.map(([record]) => record).filter(record => record.startsWith('UU_REA_SOAC_POST|') && record.includes('|OK|'))).toEqual([
      'UU_REA_SOAC_POST|1|OK|1|0|MATCH|OK',
      'UU_REA_SOAC_POST|2|OK|0|2|MATCH|OK',
      'UU_REA_SOAC_POST|3|OK|0|1|MATCH|OK',
      'UU_REA_SOAC_POST|4|OK|0|1|MATCH|OK',
      'UU_REA_SOAC_POST|5|OK|0|1|MATCH|OK',
      'UU_REA_SOAC_POST|6|OK|0|1|MATCH|OK',
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  } finally { fixture.signal.close(); }
});

it.each(['failure', 'stop'] as const)('does not post remaining FIFO segments after a segmented candidate write %s', async outcome => {
  vi.useFakeTimers();
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const fixture = soacPollingFixture(true);
  try {
    await fixture.connect();
    await fixture.signal.sendSignalSoac({ type: 'offer', sdp: 'private-sdp', gzipSdp: false });
    for (const candidate of [
      'candidate:private-host 1 UDP 100 192.0.2.1 5000 typ host',
      'candidate:private-relay1 1 UDP 80 192.0.2.2 5001 typ relay',
      'candidate:private-srflx 1 UDP 90 192.0.2.3 5002 typ srflx',
      'candidate:private-relay2 1 UDP 80 192.0.2.4 5003 typ relay',
    ]) await fixture.signal.sendSignalSoac({ type: 'candidate', candidate: { candidate } });
    fixture.respond(fixture.posts[0]!.id, 200, 'ok');
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.posts).toHaveLength(2);
    expect(fixture.posts[1]!.body).toContain('private-host');
    fixture.respond(fixture.posts[1]!.id, 200, 'ok');
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.posts).toHaveLength(3);
    expect(fixture.posts[2]!.body).toContain('private-relay1');
    if (outcome === 'stop') fixture.signal.close();
    fixture.respond(fixture.posts[2]!.id, outcome === 'failure' ? 403 : 200, 'private-response');
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.posts).toHaveLength(3);
    expect(fixture.posts.some(({ body }) => body.includes('private-srflx') || body.includes('private-relay2'))).toBe(false);
    expect(fixture.isClosed()).toBe(true);
    const records = log.mock.calls.map(([record]) => record).filter(record => record.startsWith('UU_REA_SOAC_POST|'));
    expect(records.at(-1)).toBe(outcome === 'failure' ? 'UU_REA_SOAC_POST|3|FAIL|0|1|MATCH|NONE' : 'UU_REA_SOAC_POST|3|BEGIN|0|1|MATCH|PENDING');
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  } finally { fixture.signal.close(); }
});

it('leaves a mixed binary attachment and candidate write in its original contiguous packet order', async () => {
  vi.useFakeTimers();
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const fixture = soacPollingFixture(true);
  let pendingControl: Promise<unknown> | undefined;
  try {
    await fixture.connect();
    await fixture.signal.sendSignalSoac({ type: 'offer', sdp: 'private-sdp', gzipSdp: false });
    pendingControl = fixture.signal.sendSignalControl({ appControlId: 'private-control', appDataBase64: 'AQID' }).catch(error => error);
    await fixture.signal.sendSignalSoac({ type: 'candidate', candidate: { candidate: 'candidate:private-host 1 UDP 100 192.0.2.1 5000 typ host' } });
    await fixture.signal.sendSignalSoac({ type: 'candidate', candidate: { candidate: 'candidate:private-relay 1 UDP 80 192.0.2.2 5001 typ relay' } });
    fixture.respond(fixture.posts[0]!.id, 200, 'ok');
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.posts).toHaveLength(2);
    const packets = fixture.posts[1]!.body.split('\x1e');
    expect(packets).toHaveLength(4);
    expect(packets[0]).toMatch(/^451-1\["control",/);
    expect(packets[1]).toBe('bBAECAw==');
    expect(packets[2]).toContain('private-host');
    expect(packets[3]).toContain('private-relay');
    fixture.respond(fixture.posts[1]!.id, 200, 'ok');
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.posts).toHaveLength(2);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  } finally { fixture.signal.close(); if (pendingControl) expect(await pendingControl).toMatchObject({ code: 'SOCKET_CLOSED' }); }
});

it.each([
  [200, 'UU_REA_SOAC_POST|1|OK|1|0|MATCH|OTHER', false],
  [403, 'UU_REA_SOAC_POST|1|FAIL|1|0|MATCH|NONE', true],
] as const)('classifies SOAC POST HTTP %i without leaking the response or changing HTTP success semantics', async (status, expected, closed) => {
  vi.useFakeTimers();
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const fixture = soacPollingFixture();
  try {
    await fixture.connect();
    await fixture.signal.sendSignalSoac({ type: 'offer', sdp: 'private-sdp', gzipSdp: false });
    fixture.respond(fixture.posts[0]!.id, status, 'private-response-body');
    await vi.advanceTimersByTimeAsync(0);
    expect(log.mock.calls.some(([record]) => record === expected)).toBe(true);
    expect(fixture.isClosed()).toBe(closed);
    if (!closed) {
      await fixture.signal.sendSignalSoac({ type: 'candidate', candidate: { candidate: 'private-candidate' } });
      expect(fixture.posts).toHaveLength(2);
      fixture.respond(fixture.posts[1]!.id, 200, 'ok');
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  } finally { fixture.signal.close(); }
});

it('ignores a late SOAC POST completion after disconnect without draining queued candidates', async () => {
  vi.useFakeTimers();
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const fixture = soacPollingFixture();
  try {
    await fixture.connect();
    await fixture.signal.sendSignalSoac({ type: 'offer', sdp: 'private-sdp', gzipSdp: false });
    await fixture.signal.sendSignalSoac({ type: 'candidate', candidate: { candidate: 'private-candidate' } });
    fixture.signal.close();
    const count = fixture.requests.length;
    fixture.respond(fixture.posts[0]!.id, 200, 'private-late-response');
    fixture.respond(fixture.polls.shift()!, 200, '2');
    await vi.advanceTimersByTimeAsync(50000);
    expect(fixture.requests).toHaveLength(count);
    expect(fixture.posts).toHaveLength(1);
    expect(log.mock.calls.map(([record]) => record).filter(record => record.startsWith('UU_REA_SOAC_POST|'))).toEqual(['UU_REA_SOAC_POST|1|BEGIN|1|0|MATCH|PENDING']);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  } finally { fixture.signal.close(); }
});

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
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
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
  expect(log.mock.calls.some(([record]) => record.startsWith('UU_REA_SOAC_POST|'))).toBe(false);
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
