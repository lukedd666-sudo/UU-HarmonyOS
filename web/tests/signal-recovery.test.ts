import { afterEach, expect, it, vi } from 'vitest';
import { NativeBridge, type BridgeHost } from '../src/nativeBridge';
import { SignalClient } from '../src/signalClient';
import type { Socket } from 'socket.io-client';
import type { StreamerRoomConfig } from '../src/upstream/types';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

// Exercise the real Socket.IO/Engine.IO clients. Only native HTTP is an offline fixture.
function recoveryFixture(options: Partial<StreamerRoomConfig> = {}) {
  type Request = { id: string; method: string; url: string; headers: Record<string, string>; body?: string };
  const requests: Request[] = [];
  const polls = new Map<string, { request: Request; timer?: ReturnType<typeof setTimeout> }>();
  let holdPosts = false;
  let closed = 0;
  const events: string[] = [];
  const room = { token: 'private-token', signalServers: ['wss://signal.nrd.nie.163.com', 'wss://other.nrd.nie.163.com'], timeout: 1000, ...options };
  const respond = (id: string, body: string, status = 200) => {
    clearTimeout(polls.get(id)?.timer); polls.delete(id);
    host.__uuNativeResult?.(id, true, JSON.stringify({ status, body }));
  };
  const host: BridgeHost = { UUBridge: { invoke(id, json) {
    const request: Request = { id, ...JSON.parse(json) }; requests.push(request);
    if (request.method === 'GET') {
      const poll = { request, timer: undefined as ReturnType<typeof setTimeout> | undefined };
      polls.set(id, poll);
      if (new URL(request.url).searchParams.has('sid')) poll.timer = setTimeout(() => respond(id, '2'), 15000);
    } else if (!holdPosts || request.body === '40' || request.body === '1') respond(id, 'ok');
  } } };
  const signal = new SignalClient(new NativeBridge(host), event => events.push(event.event), () => { closed++; });
  const flush = () => vi.advanceTimersByTimeAsync(0);
  const freshGets = () => requests.filter(request => request.method === 'GET' && !new URL(request.url).searchParams.has('sid'));
  const deliver = (body: string, status = 200) => {
    const poll = [...polls.values()].reverse().find(({ request }) => new URL(request.url).searchParams.has('sid'));
    expect(poll, 'a live Engine.IO poll').toBeDefined(); respond(poll!.request.id, body, status);
  };
  const open = async (sid: string) => {
    respond(freshGets().at(-1)!.id, `0{"sid":"${sid}","upgrades":[],"pingInterval":15000,"pingTimeout":20000,"maxPayload":1000000}`);
    await flush(); deliver(`40{"sid":"socket-${sid}"}`); await flush();
  };
  const ack = (event: string, values: unknown[]) => {
    const post = requests.filter(request => request.body?.includes(`["${event}"`)).at(-1)!;
    const id = /^(?:42|45[0-9]+-)([0-9]+)\[/.exec(post.body!)![1];
    deliver(`43${id}${JSON.stringify(values)}`);
  };
  return {
    signal, requests, freshGets, deliver, respond, open, flush, ack, events,
    begin: () => signal.connect(room),
    fail: (id: string) => {
      clearTimeout(polls.get(id)?.timer); polls.delete(id);
      host.__uuNativeResult?.(id, false, '{"code":"NATIVE_FAILURE"}');
    },
    closed: () => closed,
    holdPosts: () => { holdPosts = true; },
    stopPings: () => { for (const poll of polls.values()) clearTimeout(poll.timer); },
    closeTransport: () => {
      // The HTTP fixture cannot produce a TCP close event; inject that one event
      // at the real Engine.IO transport boundary without replacing either client.
      const socket = (signal as unknown as { socket: Socket }).socket;
      const transport = socket.io.engine.transport as unknown as { emitReserved(event: 'close', details: { description: string }): void };
      transport.emitReserved('close', { description: 'fixture unexpected transport close' });
    },
    async connect() { const pending = signal.connect(room); await open('private-engine-initial'); await pending; },
    async control() {
      const pending = signal.sendSignalControl({ appControlId: 'private-control', appDataBase64: 'AQID' });
      await flush(); ack('control', ['success', { code: 0, client_id: 'private-client', ice_id: 'private-ice' }]);
      await flush(); await pending;
    },
    async key(key = 'private-key', age = 30000) {
      await vi.advanceTimersByTimeAsync(age); ack('refresh_reconnect_key', ['success', { reconnect_key: key }]); await flush();
    },
  };
}

it.each([
  [1000, 1000],
  [60000, 30000],
  [undefined, 15000],
] as const)('bounds the initial namespace handshake despite continued pings for room timeout %s', async (configured, deadline) => {
  vi.useFakeTimers(); vi.spyOn(console, 'info').mockImplementation(() => {});
  const f = recoveryFixture();
  let outcome = 'pending';
  let failure: unknown;
  const pending = f.signal.connect({ token: 'private-token', signalServers: ['wss://signal.nrd.nie.163.com'], timeout: configured }).then(
    () => { outcome = 'connected'; },
    error => { outcome = 'rejected'; failure = error; },
  );
  try {
    f.respond(f.freshGets()[0]!.id, '0{"sid":"private-stalled-initial","upgrades":[],"pingInterval":15000,"pingTimeout":20000}');
    await f.flush();
    expect(f.requests.some(request => request.body === '40')).toBe(true);
    for (let index = 0; index < 4; index++) {
      await vi.advanceTimersByTimeAsync(deadline / 5);
      f.deliver('2'); await f.flush();
    }
    await vi.advanceTimersByTimeAsync(deadline / 5 - 1);
    expect(outcome).toBe('pending');
    const latePoll = f.requests.filter(request => request.method === 'GET' && new URL(request.url).searchParams.has('sid')).at(-1)!;
    await vi.advanceTimersByTimeAsync(1);
    expect(outcome).toBe('pending');
    expect(f.closed()).toBe(0);
    expect(f.freshGets()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(4999);
    expect(f.freshGets()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.freshGets()).toHaveLength(2);
    f.respond(f.freshGets()[1]!.id, '0{"sid":"private-stalled-retry","upgrades":[],"pingInterval":15000,"pingTimeout":20000}');
    await f.flush();
    for (let index = 0; index < 4; index++) {
      await vi.advanceTimersByTimeAsync(deadline / 5);
      f.deliver('2'); await f.flush();
    }
    await vi.advanceTimersByTimeAsync(deadline / 5 - 1);
    expect(outcome).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(outcome).toBe('rejected');
    expect(failure).toMatchObject({ code: 'SIGNAL_FAILED' });
    expect(f.closed()).toBe(1);
    const count = f.requests.length;
    f.respond(latePoll.id, '40{"sid":"private-late-namespace"}');
    await vi.advanceTimersByTimeAsync(60000);
    expect(outcome).toBe('rejected');
    expect(f.requests).toHaveLength(count);
    expect(f.closed()).toBe(1);
  } finally { f.signal.close(); await pending; }
});

it.each(['native-failure', 'http-503', 'transport-close'] as const)('retries an initial %s once at the same endpoint without a reconnect key or application replay', async reason => {
  vi.useFakeTimers(); const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const f = recoveryFixture({ signalReconnectDelay: 1234 });
  let outcome = 'pending';
  const pending = f.begin().then(() => { outcome = 'connected'; }, () => { outcome = 'rejected'; });
  try {
    const first = f.freshGets()[0]!;
    let lateRequest = first;
    if (reason === 'native-failure') f.fail(first.id);
    else if (reason === 'http-503') f.respond(first.id, '', 503);
    else {
      f.respond(first.id, '0{"sid":"private-initial-close","upgrades":[],"pingInterval":15000,"pingTimeout":20000}');
      await f.flush(); lateRequest = f.requests.at(-1)!; f.closeTransport();
    }
    await f.flush();
    expect(outcome).toBe('pending'); expect(f.closed()).toBe(0);
    await vi.advanceTimersByTimeAsync(1233); expect(f.freshGets()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1); expect(f.freshGets()).toHaveLength(2);
    const second = f.freshGets()[1]!;
    expect(second.headers).toMatchObject({ 'X-NRD-AUTH': 'private-token' });
    expect(second.headers).not.toHaveProperty('X-NRD-RECONN-KEY');
    expect(new URL(second.url).searchParams.has('sid')).toBe(false);
    await f.open('private-initial-retry-success'); await pending;
    expect(outcome).toBe('connected'); expect(f.closed()).toBe(0);
    const count = f.requests.length;
    f.respond(lateRequest.id, '40{"sid":"private-obsolete-namespace"}'); await f.flush();
    expect(f.requests).toHaveLength(count); expect(f.closed()).toBe(0);
    expect(f.requests.every(request => new URL(request.url).origin === 'https://signal.nrd.nie.163.com' && new URL(request.url).pathname === '/socket.io/')).toBe(true);
    expect(f.requests.filter(request => request.method === 'POST').every(request => ['40', '1'].includes(request.body!))).toBe(true);
    await vi.advanceTimersByTimeAsync(4000); expect(f.closed()).toBe(0);
    expect(log.mock.calls.filter(([record]) => record === 'UU_REA_RTC|INITIAL_RETRY')).toHaveLength(1);
    expect(log.mock.calls.some(([record]) => /RECOVERY_(START|OK|FAILED)/.test(record))).toBe(false);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  } finally { f.signal.close(); await pending; }
});

it('gives an established room its full recovery budget after succeeding on the second initial attempt', async () => {
  vi.useFakeTimers(); vi.spyOn(console, 'info').mockImplementation(() => {});
  const f = recoveryFixture({ signalReconnectDelay: 0 });
  const pending = f.begin();
  try {
    f.fail(f.freshGets()[0]!.id); await vi.advanceTimersByTimeAsync(1);
    await f.open('private-second-initial'); await pending;
    await f.control(); await f.key();
    f.deliver('', 503); await vi.advanceTimersByTimeAsync(1);
    f.fail(f.freshGets().at(-1)!.id); await vi.advanceTimersByTimeAsync(1);
    expect(f.freshGets()).toHaveLength(4);
    expect(f.freshGets().at(-1)!.headers['X-NRD-RECONN-KEY']).toBe('private-key');
    await f.open('private-second-recovery');
    expect(f.closed()).toBe(0);
  } finally { f.signal.close(); await pending.catch(() => {}); }
});

it('ends after two initial transport failures and never schedules a third attempt', async () => {
  vi.useFakeTimers(); vi.spyOn(console, 'info').mockImplementation(() => {});
  const f = recoveryFixture({ signalReconnectDelay: 0 });
  let failure: unknown;
  const pending = f.begin().catch(error => { failure = error; });
  try {
    f.fail(f.freshGets()[0]!.id); await vi.advanceTimersByTimeAsync(1);
    expect(f.freshGets()).toHaveLength(2);
    f.fail(f.freshGets()[1]!.id); await f.flush(); await pending;
    expect(failure).toMatchObject({ code: 'SIGNAL_FAILED' });
    expect(f.closed()).toBe(1);
    const count = f.requests.length;
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.requests).toHaveLength(count); expect(f.freshGets()).toHaveLength(2);
  } finally { f.signal.close(); await pending; }
});

it.each(['waiting', 'handshake'] as const)('cancels an initial retry during %s and ignores old and replacement handshake completions', async phase => {
  vi.useFakeTimers(); vi.spyOn(console, 'info').mockImplementation(() => {});
  const f = recoveryFixture();
  let failure: unknown;
  const pending = f.begin().catch(error => { failure = error; });
  try {
    f.respond(f.freshGets()[0]!.id, '0{"sid":"private-initial-late","upgrades":[],"pingInterval":15000,"pingTimeout":20000}');
    await f.flush();
    const oldPoll = f.requests.at(-1)!;
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.closed()).toBe(0);
    if (phase === 'handshake') await vi.advanceTimersByTimeAsync(5000);
    f.signal.close(); await pending;
    expect(failure).toMatchObject({ code: 'SOCKET_CLOSED' });
    const count = f.requests.length;
    f.respond(oldPoll.id, '40{"sid":"private-late-old-namespace"}');
    for (const request of f.freshGets()) f.respond(request.id, '0{"sid":"private-late-engine","upgrades":[],"pingInterval":15000,"pingTimeout":20000}');
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.requests).toHaveLength(count); expect(f.closed()).toBe(1);
  } finally { f.signal.close(); await pending; }
});

it.each([
  ['auth-401', '', 401], ['auth-403', '', 403],
  ['namespace-rejected', '44{"message":"private-rejection"}', 200],
  ['namespace-incompatible', '40{}', 200],
  ['engine-parser', 'private-invalid-engine-packet', 200],
  ['namespace-parser', '4private-invalid-json', 200],
  ['engine-first-close', '1', 200],
  ['engine-normal-close', '1', 200], ['namespace-normal-close', '41', 200],
] as const)('never retries an initial permanent %s', async (reason, body, status) => {
  vi.useFakeTimers(); const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const f = recoveryFixture();
  let outcome = 'pending';
  const pending = f.begin().then(() => { outcome = 'connected'; }, () => { outcome = 'rejected'; });
  try {
    if (status !== 200 || reason === 'engine-first-close') f.respond(f.freshGets()[0]!.id, body || 'private-rejection', status);
    else {
      f.respond(f.freshGets()[0]!.id, '0{"sid":"private-permanent","upgrades":[],"pingInterval":15000,"pingTimeout":20000}');
      await f.flush(); f.deliver(body);
    }
    await f.flush();
    expect(outcome).toBe('rejected'); expect(f.closed()).toBe(1);
    const count = f.requests.length;
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.requests).toHaveLength(count); expect(f.freshGets()).toHaveLength(1);
    expect(log.mock.calls.some(([record]) => record === 'UU_REA_RTC|INITIAL_RETRY')).toBe(false);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  } finally { f.signal.close(); await pending; }
});

it('cancels the initial namespace handshake without waiting for its deadline or accepting a late ACK', async () => {
  vi.useFakeTimers(); vi.spyOn(console, 'info').mockImplementation(() => {});
  const f = recoveryFixture();
  const pending = f.signal.connect({ token: 'private-token', signalServers: ['wss://signal.nrd.nie.163.com'], timeout: 1000 }).catch(error => error);
  try {
    f.respond(f.freshGets()[0]!.id, '0{"sid":"private-cancelled-initial","upgrades":[],"pingInterval":15000,"pingTimeout":20000}');
    await f.flush();
    const latePoll = f.requests.at(-1)!;
    f.signal.close();
    expect(await pending).toMatchObject({ code: 'SOCKET_CLOSED' });
    const count = f.requests.length;
    f.respond(latePoll.id, '40{"sid":"private-late-namespace"}');
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.requests).toHaveLength(count);
    expect(f.closed()).toBe(1);
  } finally { f.signal.close(); }
});

it('recovers with a fresh Engine.IO sid and the current key while retaining the media owner and dropping old writes', async () => {
  vi.useFakeTimers();
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const f = recoveryFixture();
  try {
    await f.connect(); await f.control(); await f.key();
    f.holdPosts();
    await f.signal.sendSignalSoac({ type: 'offer', sdp: 'private-old-offer', gzipSdp: false });
    await f.signal.sendSignalSoac({ type: 'candidate', candidate: { candidate: 'private-old-candidate' } });
    const oldPost = f.requests.at(-1)!;
    const before = f.requests.length;
    f.deliver('private-empty-response', 503); await f.flush();
    expect(f.closed()).toBe(0);
    await vi.advanceTimersByTimeAsync(4999); expect(f.freshGets()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1); expect(f.freshGets()).toHaveLength(2);
    expect(f.freshGets()[1]!.headers).toMatchObject({ 'X-NRD-AUTH': 'private-token', 'X-NRD-RECONN-KEY': 'private-key' });
    expect(f.freshGets()[1]!.url).not.toContain('sid=');
    await f.open('private-engine-recovered');
    f.deliver('42["answer",{"type":"answer","sdp":"private-answer"}]'); await f.flush();
    expect(f.events).toContain('soac');
    expect(f.closed()).toBe(0);
    f.respond(oldPost.id, 'private-late-completion'); await f.flush();
    const recoveryRequests = f.requests.slice(before);
    expect(recoveryRequests.every(request => new URL(request.url).hostname === 'signal.nrd.nie.163.com')).toBe(true);
    expect(recoveryRequests.filter(request => request.method === 'POST').map(request => request.body)).toEqual(['40']);
    expect(recoveryRequests.some(request => request.url.includes('private-engine-initial'))).toBe(false);
    expect(log.mock.calls.map(([record]) => record)).toEqual(expect.arrayContaining(['UU_REA_RTC|RECOVERY_START', 'UU_REA_RTC|RECOVERY_OK']));
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  } finally { f.signal.close(); }
  expect(f.closed()).toBe(1);
});

it.each(['post-failure', 'ping-timeout', 'transport-close'] as const)('recovers the established room after %s without closing its owner', async reason => {
  vi.useFakeTimers(); vi.spyOn(console, 'info').mockImplementation(() => {});
  const f = recoveryFixture();
  try {
    await f.connect(); await f.control(); await f.key();
    if (reason === 'post-failure') {
      f.holdPosts();
      await f.signal.sendSignalSoac({ type: 'candidate', candidate: { candidate: 'private-failed-candidate' } });
      f.respond(f.requests.at(-1)!.id, '', 503); await f.flush();
    } else if (reason === 'ping-timeout') {
      f.stopPings(); await vi.advanceTimersByTimeAsync(35000);
    } else { f.closeTransport(); await f.flush(); }
    expect(f.closed()).toBe(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.freshGets()).toHaveLength(2);
    await f.open('private-restored');
    expect(f.closed()).toBe(0);
  } finally { f.signal.close(); }
});

it('can succeed on its second bounded attempt without replaying initial control or SOAC', async () => {
  vi.useFakeTimers(); vi.spyOn(console, 'info').mockImplementation(() => {});
  const f = recoveryFixture();
  try {
    await f.connect(); await f.control(); await f.key();
    const count = f.requests.length;
    f.deliver('', 503); await f.flush(); await vi.advanceTimersByTimeAsync(5000);
    f.respond(f.freshGets().at(-1)!.id, '', 503); await f.flush();
    await vi.advanceTimersByTimeAsync(5000); await f.open('private-second-attempt');
    expect(f.closed()).toBe(0);
    expect(f.freshGets()).toHaveLength(3);
    expect(f.requests.slice(count).filter(request => request.method === 'POST').map(request => request.body)).toEqual(['40']);
    await vi.advanceTimersByTimeAsync(3000); expect(f.closed()).toBe(0);
  } finally { f.signal.close(); }
});

it('ends after two same-endpoint attempts, including a stalled Socket.IO namespace handshake', async () => {
  vi.useFakeTimers(); vi.spyOn(console, 'info').mockImplementation(() => {});
  const f = recoveryFixture();
  try {
    await f.connect(); await f.control(); await f.key();
    f.deliver('', 503); await f.flush();
    await vi.advanceTimersByTimeAsync(5000);
    const first = f.freshGets().at(-1)!;
    f.respond(first.id, '0{"sid":"private-stalled","upgrades":[],"pingInterval":15000,"pingTimeout":20000}'); await f.flush();
    await vi.advanceTimersByTimeAsync(6000);
    expect(f.freshGets()).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.closed()).toBe(1);
    const count = f.requests.length;
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.requests).toHaveLength(count);
    expect(f.closed()).toBe(1);
  } finally { f.signal.close(); }
});

it.each(['no-key', 'control-pending'] as const)('does not recover before initial control and a valid key are both ready: %s', async missing => {
  vi.useFakeTimers(); vi.spyOn(console, 'info').mockImplementation(() => {});
  const f = recoveryFixture();
  try {
    await f.connect();
    if (missing === 'no-key') await f.control(); else await f.key();
    f.deliver('', 503); await f.flush();
    expect(f.closed()).toBe(1);
    await vi.advanceTimersByTimeAsync(15000);
    expect(f.freshGets()).toHaveLength(1);
  } finally { f.signal.close(); }
});

it.each(['1', '41', '42["leave",{}]', '42["publisher_disconnect",{}]', '4private-invalid-json'])(
  'permanently ends on a server termination or parser error: %s', async body => {
    vi.useFakeTimers(); vi.spyOn(console, 'info').mockImplementation(() => {});
    const f = recoveryFixture();
    try {
      await f.connect(); await f.control(); await f.key();
      f.deliver(body); await f.flush();
      expect(f.closed()).toBe(1);
      await vi.advanceTimersByTimeAsync(15000);
      expect(f.freshGets()).toHaveLength(1);
    } finally { f.signal.close(); }
    expect(f.closed()).toBe(1);
  },
);

it('separates an invalid Engine.IO packet from recoverable HTTP transport errors', async () => {
  vi.useFakeTimers(); const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const f = recoveryFixture();
  try {
    await f.connect(); await f.control(); await f.key();
    f.deliver('private-invalid-engine-packet'); await f.flush();
    expect(f.closed()).toBe(1);
    expect(log.mock.calls.some(([record]) => record === 'UU_REA_SIGNAL_END|PARSE_ERROR')).toBe(true);
    await vi.advanceTimersByTimeAsync(15000);
    expect(f.freshGets()).toHaveLength(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  } finally { f.signal.close(); }
});

it('preserves the existing nonterminal handling of the unverified left event', async () => {
  vi.useFakeTimers(); vi.spyOn(console, 'info').mockImplementation(() => {});
  const f = recoveryFixture();
  try {
    await f.connect(); await f.control(); await f.key();
    f.deliver('42["left",{}]'); await f.flush();
    expect(f.closed()).toBe(0);
    expect(f.freshGets()).toHaveLength(1);
  } finally { f.signal.close(); }
});

it('treats a rejected recovery namespace handshake as permanent and never logs its payload', async () => {
  vi.useFakeTimers();
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const f = recoveryFixture();
  try {
    await f.connect(); await f.control(); await f.key();
    f.deliver('', 503); await f.flush(); await vi.advanceTimersByTimeAsync(5000);
    f.respond(f.freshGets().at(-1)!.id, '0{"sid":"private-rejected","upgrades":[],"pingInterval":15000,"pingTimeout":20000}');
    await f.flush(); f.deliver('44{"message":"private-key-rejected"}'); await f.flush();
    expect(f.closed()).toBe(1);
    const count = f.requests.length;
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.requests).toHaveLength(count);
    expect(log.mock.calls.some(([record]) => record === 'UU_REA_RTC|RECOVERY_FAILED')).toBe(true);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  } finally { f.signal.close(); }
});

it.each([401, 403])('ends a rejected recovery HTTP %i without another attempt or a second close', async status => {
  vi.useFakeTimers(); const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const f = recoveryFixture();
  try {
    await f.connect(); await f.control(); await f.key();
    f.deliver('', 503); await f.flush(); await vi.advanceTimersByTimeAsync(5000);
    const rejected = f.freshGets().at(-1)!;
    f.respond(rejected.id, 'private-rejected-body', status); await f.flush();
    expect(f.closed()).toBe(1);
    expect(log.mock.calls.some(([record]) => record === 'UU_REA_RTC|RECOVERY_FAILED')).toBe(true);
    const count = f.requests.length;
    f.signal.close(); f.respond(rejected.id, '0{"sid":"private-late","upgrades":[],"pingInterval":15000,"pingTimeout":20000}');
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.requests).toHaveLength(count); expect(f.closed()).toBe(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  } finally { f.signal.close(); }
});

it.each([401, 403])('does not recover an established POST rejected with HTTP %i', async status => {
  vi.useFakeTimers(); vi.spyOn(console, 'info').mockImplementation(() => {});
  const f = recoveryFixture();
  try {
    await f.connect(); await f.control(); await f.key(); f.holdPosts();
    await f.signal.sendSignalSoac({ type: 'candidate', candidate: { candidate: 'private-rejected-candidate' } });
    f.respond(f.requests.at(-1)!.id, 'private-rejected-body', status); await f.flush();
    expect(f.closed()).toBe(1);
    await vi.advanceTimersByTimeAsync(15000);
    expect(f.freshGets()).toHaveLength(1);
  } finally { f.signal.close(); }
});

it.each(['waiting', 'handshake'] as const)('cancels recovery on explicit close during %s and ignores late native completions', async phase => {
  vi.useFakeTimers(); vi.spyOn(console, 'info').mockImplementation(() => {});
  const f = recoveryFixture();
  try {
    await f.connect(); await f.control(); await f.key();
    f.deliver('', 503); await f.flush();
    if (phase === 'handshake') await vi.advanceTimersByTimeAsync(5000);
    f.signal.close();
    expect(f.closed()).toBe(1);
    const count = f.requests.length;
    for (const request of f.freshGets()) f.respond(request.id, '0{"sid":"private-late","upgrades":[],"pingInterval":15000,"pingTimeout":20000}');
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.requests).toHaveLength(count);
  } finally { f.signal.close(); }
});

it('replaces the recovery key after a successful later refresh and clears it before another logical connection', async () => {
  vi.useFakeTimers(); vi.spyOn(console, 'info').mockImplementation(() => {});
  const f = recoveryFixture();
  try {
    await f.connect(); await f.control(); await f.key();
    f.deliver('', 503); await f.flush(); await vi.advanceTimersByTimeAsync(5000); await f.open('private-first-recovery');
    await f.key('private-replacement-key', 300000);
    f.deliver('', 503); await f.flush(); await vi.advanceTimersByTimeAsync(5000);
    expect(f.freshGets().at(-1)!.headers['X-NRD-RECONN-KEY']).toBe('private-replacement-key');
    f.signal.close();
    const pending = f.signal.connect({ token: 'private-new-token', signalServers: ['wss://signal.nrd.nie.163.com'] });
    expect(f.freshGets().at(-1)!.headers).not.toHaveProperty('X-NRD-RECONN-KEY');
    await f.open('private-new-logical'); await pending;
    expect(f.closed()).toBe(1);
  } finally { f.signal.close(); }
});

it.each(['control', 'refresh_reconnect_key'] as const)('ignores a late %s ACK after the SignalClient has been reused for a new logical connection', async event => {
  vi.useFakeTimers(); vi.spyOn(console, 'info').mockImplementation(() => {});
  const f = recoveryFixture();
  let oldControl: Promise<unknown> | undefined;
  try {
    await f.connect();
    if (event === 'refresh_reconnect_key') await f.control();
    await f.key();
    if (event === 'control') {
      oldControl = f.signal.sendSignalControl({ appControlId: 'private-old-control', appDataBase64: 'AQID' }).catch(error => error);
      await f.flush();
      f.ack(event, ['success', { code: 0 }]);
    } else {
      await vi.advanceTimersByTimeAsync(300000);
      f.ack(event, ['success', { reconnect_key: 'private-stale-key' }]);
    }
    // The old ACK is pending in the real client's async packet dispatch.
    f.signal.close();
    const pending = f.signal.connect({ token: 'private-next-token', signalServers: ['wss://signal.nrd.nie.163.com'], timeout: 1000 });
    await f.open('private-next-logical'); await pending;
    expect(f.freshGets().at(-1)!.headers).not.toHaveProperty('X-NRD-RECONN-KEY');
    if (event === 'control') await f.key('private-next-key'); else await f.control();
    f.deliver('', 503); await f.flush();
    expect(f.closed()).toBe(2);
    await vi.advanceTimersByTimeAsync(15000);
    expect(f.freshGets()).toHaveLength(2);
    if (oldControl) expect(await oldControl).toMatchObject({ code: 'SOCKET_CLOSED' });
  } finally { f.signal.close(); }
});

it.each([0, 1234, 1000000, undefined, -1, Number.NaN, Number.POSITIVE_INFINITY] as const)(
  'uses a finite bounded millisecond reconnect delay for %s', async configured => {
    vi.useFakeTimers(); vi.spyOn(console, 'info').mockImplementation(() => {});
    const f = recoveryFixture({ signalReconnectDelay: configured });
    try {
      await f.connect(); await f.control(); await f.key();
      f.deliver('', 503); await f.flush();
      const wait = configured === 0 ? 0 : configured === 1234 ? 1234 : configured === 1000000 ? 25000 : 5000;
      if (wait > 0) {
        await vi.advanceTimersByTimeAsync(wait - 1); expect(f.freshGets()).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(1);
      }
      expect(f.freshGets()).toHaveLength(2);
      expect(f.closed()).toBe(0);
    } finally { f.signal.close(); }
  },
);

it('keeps the worst-case recovery deadline within 110 seconds even for a huge configured delay', async () => {
  vi.useFakeTimers(); vi.spyOn(console, 'info').mockImplementation(() => {});
  const f = recoveryFixture({ timeout: 30000, signalReconnectDelay: 1000000 });
  try {
    await f.connect(); await f.control(); await f.key();
    f.deliver('', 503); await f.flush();
    await vi.advanceTimersByTimeAsync(109999);
    expect(f.closed()).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.closed()).toBe(1);
    expect(f.freshGets()).toHaveLength(3);
  } finally { f.signal.close(); }
});
