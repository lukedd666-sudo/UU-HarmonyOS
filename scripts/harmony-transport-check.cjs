#!/usr/bin/env node
// Exercise the actual NativeBridge with an offline NetworkKit adapter. No socket or HTTP is opened.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const deveco = process.env.UU_REA_DEVECO || '/Applications/DevEco-Studio.app/Contents';
const ts = require(path.join(deveco, 'sdk/default/openharmony/ets/build-tools/ets-loader/node_modules/typescript'));
function load(name, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../entry/src/main/ets/bridge', name + '.ets'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, fileName: name + '.ts' }).outputText;
  const output = { exports: {} };
  vm.runInNewContext(compiled, { module: output, exports: output.exports, require(key) {
    if (Object.hasOwn(imports, key)) return imports[key];
    throw new Error('Unexpected dependency');
  } });
  return output.exports;
}
const policy = load('NetworkPolicy');
const state = { http: [], sockets: 0, destroyed: 0, deferred: null, response: 'offline response', dnsRules: new Map(), dnsCalls: [], dnsActive: 0, dnsMax: 0, addGate: null, removeGate: null, failAdd: false, failRemove: false };
const diagnosticLogs = [];
const http = {
  HttpDataType: { STRING: 0 },
  HttpProtocol: { HTTP1_1: 1 },
  createHttp() {
    return {
      on(event, callback) {
        assert.equal(event, 'headersReceive');
        if (state.failHeadersObserver) throw new Error('private-observer-error');
        this.headersCallback = callback;
      },
      async request(endpoint, options) {
        state.http.push({ endpoint, options, client: this });
        const failure = state.httpError;
        if (state.deferred) await state.deferred;
        this.headersCallback?.({ authorization: 'private-header', get poisoned() { throw new Error('MUST_NOT_READ_HEADERS_EVENT'); } });
        if (failure) throw failure;
        return { responseCode: 200, result: state.response, header: { 'content-type': 'text/plain' }, performanceTiming: state.timing, connectionExtraInfo: state.connectionInfo };
      },
      destroy() { state.destroyed++; this.destroyed = true; },
    };
  },
};
const signalHost = 'nrd.nie.163.com';
const connection = {
  async addCustomDnsRule(host, addresses) {
    assert.equal(host, signalHost); assert.equal(addresses.length, 1);
    state.dnsCalls.push({ op: 'add', host, address: addresses[0] }); state.dnsActive++; state.dnsMax = Math.max(state.dnsMax, state.dnsActive);
    const gate = state.addGate; state.addGate = null;
    try {
      if (gate) await gate.promise;
      if (state.failAdd) throw new Error('raw-private-network-message');
      state.dnsRules.set(host, [...addresses]);
    } finally { state.dnsActive--; }
  },
  async removeCustomDnsRule(host) {
    assert.equal(host, signalHost);
    state.dnsCalls.push({ op: 'remove', host }); state.dnsActive++; state.dnsMax = Math.max(state.dnsMax, state.dnsActive);
    const gate = state.removeGate; state.removeGate = null;
    try {
      if (gate) await gate.promise;
      if (state.failRemove) throw new Error('raw-private-network-message');
      if (!state.dnsRules.has(host)) throw { code: -1 };
      state.dnsRules.delete(host);
    } finally { state.dnsActive--; }
  },
  clearCustomDnsRules() { throw new Error('MUST_NOT_CLEAR_OTHER_APP_RULES'); },
};
const { NativeBridge } = load('NativeBridge', {
  './NetworkPolicy': policy,
  './SigningMaterial': { signProtocolMessage: async () => { throw new Error('MATERIAL_MISSING'); } },
  './SessionStore': { sessionOperation: async () => { throw new Error('SESSION_LOAD_FAILED'); } },
  '@kit.PerformanceAnalysisKit': { hilog: { info(_domain, _tag, _format, record) { diagnosticLogs.push(record); } } },
  '@kit.NetworkKit': { connection, http, webSocket: { createWebSocket() { state.sockets++; throw new Error('UNEXPECTED_SOCKET_CREATION'); } } },
  '@kit.ArkTS': { util: { Base64Helper: class {} } },
});
const waiting = new Map();
const results = [];
const controller = {
  async runJavaScript(script) {
    vm.runInNewContext(script, { window: {
      __uuNativeResult(id, ok, body) {
        const result = { ok, body: JSON.parse(body) }; results.push({ id, ...result });
        waiting.get(id)?.(result); waiting.delete(id);
      },
      __uuSocketEvent() { throw new Error('UNEXPECTED_SOCKET_EVENT'); },
    } });
    return '';
  },
};
const bridge = new NativeBridge(controller);
bridge.beginPage(true);
let nextId = 0;
function invoke(payload) {
  return new Promise(resolve => {
    const id = 'fixture_' + nextId++; waiting.set(id, resolve); bridge.invoke(id, JSON.stringify(payload));
  });
}
let checks = 0;
(async () => {
  for (const headers of [undefined, {}, { Authorization: 'offline-fixture' }, { 'X-NRD-AUTH': 'offline-fixture', 'X-Param-SIGN': 'offline-fixture' }]) {
    const result = await invoke({ op: 'ws.open', socketId: 'fixture_socket', url: 'wss://signal.nrd.nie.163.com/socket.io/?token=offline-fixture', headers });
    assert.equal(result.ok, false); assert.equal(result.body.code, 'WSS_AUTH_UNVERIFIED'); checks++;
  }
  assert.equal(state.sockets, 0); checks++;
  const endpoint = 'https://signal.nrd.nie.163.com/socket.io/?EIO=4&transport=polling';
  state.timing = { dnsTiming: 1.8, tcpTiming: 8, tlsTiming: 12, firstSendTiming: 13, firstReceiveTiming: 25, totalFinishTiming: 27, redirectTiming: 0, responseHeaderTiming: 26, responseBodyTiming: 28, totalTiming: 29 };
  state.connectionInfo = { networkProtocolName: 'private-protocol', localAddress: 'private-address', remoteAddress: 'private-address', localPort: 1, remotePort: 2, isReusedConnection: false, isProxyConnection: true, isCacheHit: false, redirectCount: 0 };
  let previousSequence = 0;
  for (const method of ['GET', 'POST']) {
    const logStart = diagnosticLogs.length;
    const result = await invoke({ op: 'http', url: endpoint, method, headers: { 'X-NRD-AUTH': 'offline-fixture' }, body: method === 'POST' ? 'offline-fixture-packet' : undefined });
    assert.equal(result.ok, true); assert.equal(result.body.status, 200); checks++;
    const request = state.http.at(-1);
    assert.equal(request.options.readTimeout, 40000);
    assert.equal(request.options.maxRedirects, 0);
    assert.equal(request.options.maxLimit, 2097152);
    assert.equal(request.options.usingCache, false); assert.equal(request.options.remoteValidation, 'system'); checks++;
    assert.equal(request.options.usingProtocol, http.HttpProtocol.HTTP1_1);
    assert.equal(request.options.header.Connection, 'close'); checks++;
    const logs = diagnosticLogs.slice(logStart);
    const starts = logs.filter(log => /^UU_REA_HTTP\|[0-9]+\|(?:GET|POST)\|START\|0\|-$/.test(log));
    assert.equal(starts.length, 1, 'each polling request needs a safe numbered START');
    const sequence = Number(starts[0].split('|')[1]);
    assert(sequence > previousSequence); previousSequence = sequence;
    assert(logs.some(log => new RegExp(`^UU_REA_HTTP\\|${sequence}\\|${method}\\|HEADERS\\|[0-9]+\\|-$`).test(log)));
    assert(logs.some(log => new RegExp(`^UU_REA_HTTP\\|${sequence}\\|${method}\\|SUCCESS\\|[0-9]+\\|200$`).test(log)));
    assert(logs.includes(`UU_REA_HTTP_TIMING_CUM_MS|${sequence}|${method}|dns=1|tcp=8|tls=12|firstSend=13|firstReceive=25|finish=27|redirect=0|headers=26|body=28|total=29`));
    assert(logs.includes(`UU_REA_HTTP_CONNECTION|${sequence}|${method}|reuse=0|proxy=1|cache=0`)); checks++;
  }
  state.timing = { dnsTiming: 'private-timing', tcpTiming: NaN, tlsTiming: Infinity, firstSendTiming: -1, firstReceiveTiming: { toString() { throw new Error('MUST_NOT_STRINGIFY_TIMING'); } }, totalFinishTiming: 1000000000, redirectTiming: null, responseHeaderTiming: undefined, responseBodyTiming: true, totalTiming: 0 };
  state.connectionInfo = { isReusedConnection: 'private-reuse', isProxyConnection: 1, isCacheHit: null };
  let diagnosticStart = diagnosticLogs.length;
  assert.equal((await invoke({ op: 'http', url: endpoint, method: 'GET' })).ok, true);
  assert(diagnosticLogs.slice(diagnosticStart).some(log => /^UU_REA_HTTP_TIMING_CUM_MS\|[0-9]+\|GET\|dns=-\|tcp=-\|tls=-\|firstSend=-\|firstReceive=-\|finish=-\|redirect=-\|headers=-\|body=-\|total=0$/.test(log)));
  assert(diagnosticLogs.slice(diagnosticStart).some(log => /^UU_REA_HTTP_CONNECTION\|[0-9]+\|GET\|reuse=-\|proxy=-\|cache=-$/.test(log))); checks++;
  state.timing = undefined; state.connectionInfo = undefined;
  state.failHeadersObserver = true;
  assert.equal((await invoke({ op: 'http', url: endpoint, method: 'GET' })).ok, true); checks++;
  state.failHeadersObserver = false;
  diagnosticStart = diagnosticLogs.length;
  await invoke({ op: 'http', url: 'https://api.nrd.nie.163.com/api/v1/devices', method: 'GET' });
  assert.equal(diagnosticLogs.length, diagnosticStart); checks++;
  assert.equal(state.http.at(-1).options.readTimeout, 30000); assert.equal(state.http.at(-1).options.maxRedirects, 0); checks++;
  assert.equal(state.http.at(-1).options.usingProtocol, undefined); assert.equal(state.http.at(-1).options.header.Connection, undefined); checks++;
  const count = state.http.length;
  assert.equal((await invoke({ op: 'http', url: endpoint, method: 'DELETE' })).body.code, 'METHOD_BLOCKED'); checks++;
  assert.equal((await invoke({ op: 'http', url: 'https://signal.nrd.nie.163.com/socket.io/other', method: 'GET' })).body.code, 'PATH_BLOCKED'); checks++;
  assert.equal(state.http.length, count); checks++;
  state.response = 'x'.repeat(2097153);
  assert.equal((await invoke({ op: 'http', url: endpoint, method: 'GET' })).body.code, 'RESPONSE_TOO_LARGE'); checks++;
  state.response = 'offline response';
  state.httpError = { code: 2300028, message: 'private-url-and-body' };
  assert.equal((await invoke({ op: 'http', url: endpoint, method: 'GET' })).ok, false); checks++;
  assert.match(diagnosticLogs.at(-1), /^UU_REA_HTTP_ERROR\|GET\|2300028\|[0-9]+$/); checks++;
  assert(diagnosticLogs.some(log => /^UU_REA_HTTP\|[0-9]+\|GET\|ERROR\|[0-9]+\|2300028$/.test(log))); checks++;
  state.httpError = { code: 'private-code', message: 'private-url-and-body' };
  await invoke({ op: 'http', url: endpoint, method: 'POST' });
  assert.match(diagnosticLogs.at(-1), /^UU_REA_HTTP_ERROR\|POST\|-\|[0-9]+$/); checks++;
  assert.equal(JSON.stringify(diagnosticLogs).includes('private'), false); checks++;
  state.httpError = null;
  let release;
  state.deferred = new Promise(resolve => { release = resolve; });
  const resultCount = results.length;
  const destroyedCount = state.destroyed;
  bridge.invoke('fixture_cleanup', JSON.stringify({ op: 'http', url: endpoint, method: 'GET' }));
  await new Promise(resolve => setImmediate(resolve));
  bridge.dispose();
  assert.equal(state.destroyed, destroyedCount + 1); checks++;
  bridge.beginPage(true); state.deferred = null;
  assert.equal((await invoke({ op: 'http', url: endpoint, method: 'GET' })).ok, true); checks++;
  const logsAtDispose = diagnosticLogs.length;
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(results.length, resultCount + 1);
  assert.equal(results.some(result => result.id === 'fixture_cleanup'), false); checks++;
  assert.equal(diagnosticLogs.length, logsAtDispose, 'disposed generation cannot add late headers/success/error'); checks++;
  assert.equal(state.sockets, 0); checks++;
  state.deferred = null;
  bridge.beginPage(true);
  const ip1 = '42.186.225.118';
  const ip2 = '8.8.8.8';
  const rootEndpoint = 'https://nrd.nie.163.com/socket.io/?EIO=4&transport=polling';
  async function flush() { await new Promise(resolve => setImmediate(resolve)); }
  async function until(predicate) { for (let i = 0; i < 30 && !predicate(); i++) await flush(); assert(predicate()); }
  function gate() { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; }
  let route = await invoke({ op: 'signal.route', address: ip1 });
  assert.equal(route.ok, true); assert.equal(route.body.bound, true); assert.deepEqual(state.dnsRules.get(signalHost), [ip1]); checks++;
  const dnsCount = state.dnsCalls.length;
  for (const address of [undefined, null, '127.0.0.1', '042.186.225.118', ['42.186.225.118']]) {
    route = await invoke({ op: 'signal.route', address });
    assert.equal(route.ok, false); assert.equal(route.body.code, 'SIGNAL_ADDRESS_INVALID'); checks++;
  }
  assert.equal(state.dnsCalls.length, dnsCount); assert.deepEqual(state.dnsRules.get(signalHost), [ip1]); checks++;
  const hold = gate(); state.deferred = hold.promise;
  const oldHttpCount = state.http.length;
  const apiResult = invoke({ op: 'http', url: 'https://api.nrd.nie.163.com/api/v1/devices', method: 'GET' });
  const pollResult = invoke({ op: 'http', url: rootEndpoint, method: 'GET' });
  await until(() => state.http.length === oldHttpCount + 2);
  const account = state.http[oldHttpCount].client;
  const poll = state.http[oldHttpCount + 1].client;
  await invoke({ op: 'signal.route', address: ip2 });
  assert.equal(poll.destroyed, true); assert.notEqual(account.destroyed, true); checks++;
  assert.equal((await pollResult).body.code, 'SOCKET_CLOSED'); checks++;
  hold.release(); state.deferred = null;
  assert.equal((await apiResult).ok, true); checks++;
  route = await invoke({ op: 'signal.route', address: '' });
  assert.equal(route.body.bound, false); assert.equal(state.dnsRules.has(signalHost), false); checks++;
  assert.equal((await invoke({ op: 'http', url: rootEndpoint, method: 'GET' })).body.code, 'SIGNAL_ROUTE_FAILED'); checks++;
  assert.equal((await invoke({ op: 'http', url: rootEndpoint.replace('nrd.nie.163.com', 'NRD.NIE.163.COM'), method: 'GET' })).body.code, 'SIGNAL_ROUTE_FAILED'); checks++;
  route = await invoke({ op: 'signal.route', address: '' });
  assert.equal(route.ok, true); assert.equal(route.body.bound, false); checks++;
  state.failAdd = true;
  route = await invoke({ op: 'signal.route', address: ip1 }); state.failAdd = false;
  assert.equal(route.body.code, 'SIGNAL_ROUTE_FAILED'); assert.equal(JSON.stringify(route).includes('raw-private'), false); checks++;
  state.failRemove = true;
  route = await invoke({ op: 'signal.route', address: ip1 }); state.failRemove = false;
  assert.equal(route.body.code, 'SIGNAL_ROUTE_FAILED'); checks++;
  const addHold = gate(); state.addGate = addHold;
  const bind1 = invoke({ op: 'signal.route', address: ip1 });
  await until(() => state.addGate === null && state.dnsActive === 1);
  const bind2 = invoke({ op: 'signal.route', address: ip2 });
  await flush(); assert.equal(state.dnsActive, 1); checks++;
  addHold.release(); await Promise.all([bind1, bind2]);
  assert.deepEqual(state.dnsRules.get(signalHost), [ip2]); assert.equal(state.dnsMax, 1); checks++;
  const staleAdd = gate(); state.addGate = staleAdd;
  bridge.invoke('fixture_stale_add', JSON.stringify({ op: 'signal.route', address: ip1 }));
  await until(() => state.addGate === null && state.dnsActive === 1);
  bridge.dispose(); bridge.beginPage(true);
  const newBind = invoke({ op: 'signal.route', address: ip2 });
  staleAdd.release(); assert.equal((await newBind).body.bound, true);
  assert.deepEqual(state.dnsRules.get(signalHost), [ip2]); assert.equal(results.some(result => result.id === 'fixture_stale_add'), false); checks++;
  const staleRemove = gate(); state.removeGate = staleRemove;
  const callsBefore = state.dnsCalls.length;
  bridge.invoke('fixture_stale_remove', JSON.stringify({ op: 'signal.route', address: ip1 }));
  await until(() => state.removeGate === null && state.dnsActive === 1);
  bridge.dispose(); bridge.beginPage(true);
  const replacement = invoke({ op: 'signal.route', address: ip2 }); staleRemove.release(); await replacement;
  assert.equal(state.dnsCalls.slice(callsBefore).filter(call => call.op === 'add' && call.address === ip1).length, 0); checks++;
  assert.deepEqual(state.dnsRules.get(signalHost), [ip2]); assert.equal(results.some(result => result.id === 'fixture_stale_remove'), false); checks++;
  // Cancellation must free native bridge capacity even when destroyed platform requests never settle.
  state.deferred = new Promise(() => {});
  for (let i = 0; i < 20; i++) {
    const before = state.http.length;
    const pendingPoll = invoke({ op: 'http', url: rootEndpoint, method: 'GET' });
    await until(() => state.http.length === before + 1);
    await invoke({ op: 'signal.route', address: i % 2 ? ip1 : ip2 });
    assert.equal((await pendingPoll).body.code, 'SOCKET_CLOSED');
  }
  checks++;
  state.deferred = null;
  assert.equal((await invoke({ op: 'http', url: 'https://api.nrd.nie.163.com/api/v1/devices', method: 'GET' })).ok, true); checks++;

  const oldReply = gate(); state.deferred = oldReply.promise;
  state.httpError = { code: 2300052, message: 'private-cancelled-request' };
  const reuseStart = state.http.length;
  bridge.invoke('fixture_reused_id', JSON.stringify({ op: 'http', url: rootEndpoint, method: 'GET' }));
  await until(() => state.http.length === reuseStart + 1);
  state.httpError = null;
  await invoke({ op: 'signal.route', address: ip1 });
  assert.equal(results.filter(result => result.id === 'fixture_reused_id').length, 1); checks++;
  const freshReply = gate(); state.deferred = freshReply.promise;
  const freshResult = new Promise(resolve => { waiting.set('fixture_reused_id', resolve); });
  bridge.invoke('fixture_reused_id', JSON.stringify({ op: 'http', url: rootEndpoint, method: 'GET' }));
  await until(() => state.http.length === reuseStart + 2);
  const logsBeforeOldReply = diagnosticLogs.length;
  oldReply.release(); await flush();
  assert.equal(results.filter(result => result.id === 'fixture_reused_id').length, 1); checks++;
  assert.equal(diagnosticLogs.length, logsBeforeOldReply, 'cancelled request cannot attribute late error/headers to reused id'); checks++;
  freshReply.release(); state.deferred = null;
  assert.equal((await freshResult).ok, true); checks++;

  bridge.dispose(); await flush();
  assert.equal(state.dnsRules.has(signalHost), false); assert.equal(state.dnsMax, 1); checks++;
  assert.equal(state.dnsCalls.every(call => call.host === signalHost), true); checks++;
  const sequences = diagnosticLogs.filter(log => /^UU_REA_HTTP\|[0-9]+\|(?:GET|POST)\|START\|/.test(log)).map(log => Number(log.split('|')[1]));
  assert(sequences.every((value, index) => index === 0 || value > sequences[index - 1]), 'request sequence must stay monotonic across page generations'); checks++;
  assert.equal(JSON.stringify(diagnosticLogs).includes('private'), false); checks++;
  console.log(`Native transport: ${checks} checks passed (offline NetworkKit adapter, no device verification).`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
