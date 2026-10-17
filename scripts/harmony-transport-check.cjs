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
const http = {
  HttpDataType: { STRING: 0 },
  HttpProtocol: { HTTP1_1: 1 },
  createHttp() {
    return {
      async request(endpoint, options) {
        state.http.push({ endpoint, options, client: this });
        if (state.deferred) await state.deferred;
        return { responseCode: 200, result: state.response, header: { 'content-type': 'text/plain' } };
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
  '@kit.PerformanceAnalysisKit': { hilog: { info() {} } },
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
  for (const method of ['GET', 'POST']) {
    const result = await invoke({ op: 'http', url: endpoint, method, headers: { 'X-NRD-AUTH': 'offline-fixture' }, body: method === 'POST' ? 'offline-fixture-packet' : undefined });
    assert.equal(result.ok, true); assert.equal(result.body.status, 200); checks++;
    const request = state.http.at(-1);
    assert.equal(request.options.readTimeout, 40000);
    assert.equal(request.options.maxRedirects, 0);
    assert.equal(request.options.maxLimit, 2097152);
    assert.equal(request.options.usingCache, false); assert.equal(request.options.remoteValidation, 'system'); checks++;
    assert.equal(request.options.usingProtocol, http.HttpProtocol.HTTP1_1);
    assert.equal(request.options.header.Connection, 'close'); checks++;
  }
  await invoke({ op: 'http', url: 'https://api.nrd.nie.163.com/api/v1/devices', method: 'GET' });
  assert.equal(state.http.at(-1).options.readTimeout, 30000); assert.equal(state.http.at(-1).options.maxRedirects, 0); checks++;
  assert.equal(state.http.at(-1).options.usingProtocol, undefined); assert.equal(state.http.at(-1).options.header.Connection, undefined); checks++;
  const count = state.http.length;
  assert.equal((await invoke({ op: 'http', url: endpoint, method: 'DELETE' })).body.code, 'METHOD_BLOCKED'); checks++;
  assert.equal((await invoke({ op: 'http', url: 'https://signal.nrd.nie.163.com/socket.io/other', method: 'GET' })).body.code, 'PATH_BLOCKED'); checks++;
  assert.equal(state.http.length, count); checks++;
  state.response = 'x'.repeat(2097153);
  assert.equal((await invoke({ op: 'http', url: endpoint, method: 'GET' })).body.code, 'RESPONSE_TOO_LARGE'); checks++;
  state.response = 'offline response';
  let release;
  state.deferred = new Promise(resolve => { release = resolve; });
  const resultCount = results.length;
  const destroyedCount = state.destroyed;
  bridge.invoke('fixture_cleanup', JSON.stringify({ op: 'http', url: endpoint, method: 'GET' }));
  await new Promise(resolve => setImmediate(resolve));
  bridge.dispose();
  assert.equal(state.destroyed, destroyedCount + 1); checks++;
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(results.length, resultCount); checks++;
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
  const reuseStart = state.http.length;
  bridge.invoke('fixture_reused_id', JSON.stringify({ op: 'http', url: rootEndpoint, method: 'GET' }));
  await until(() => state.http.length === reuseStart + 1);
  await invoke({ op: 'signal.route', address: ip1 });
  assert.equal(results.filter(result => result.id === 'fixture_reused_id').length, 1); checks++;
  const freshReply = gate(); state.deferred = freshReply.promise;
  const freshResult = new Promise(resolve => { waiting.set('fixture_reused_id', resolve); });
  bridge.invoke('fixture_reused_id', JSON.stringify({ op: 'http', url: rootEndpoint, method: 'GET' }));
  await until(() => state.http.length === reuseStart + 2);
  oldReply.release(); await flush();
  assert.equal(results.filter(result => result.id === 'fixture_reused_id').length, 1); checks++;
  freshReply.release(); state.deferred = null;
  assert.equal((await freshResult).ok, true); checks++;

  bridge.dispose(); await flush();
  assert.equal(state.dnsRules.has(signalHost), false); assert.equal(state.dnsMax, 1); checks++;
  assert.equal(state.dnsCalls.every(call => call.host === signalHost), true); checks++;
  console.log(`Native transport: ${checks} checks passed (offline NetworkKit adapter, no device verification).`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
