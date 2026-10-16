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
const state = { http: [], sockets: 0, destroyed: 0, deferred: null, response: 'offline response' };
const http = {
  HttpDataType: { STRING: 0 },
  createHttp() {
    return {
      async request(endpoint, options) {
        state.http.push({ endpoint, options });
        if (state.deferred) await state.deferred;
        return { responseCode: 200, result: state.response, header: { 'content-type': 'text/plain' } };
      },
      destroy() { state.destroyed++; },
    };
  },
};
const { NativeBridge } = load('NativeBridge', {
  './NetworkPolicy': policy,
  './SigningMaterial': { signProtocolMessage: async () => { throw new Error('MATERIAL_MISSING'); } },
  '@kit.NetworkKit': { http, webSocket: { createWebSocket() { state.sockets++; throw new Error('UNEXPECTED_SOCKET_CREATION'); } } },
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
    assert.equal(request.options.usingCache, false); checks++;
  }
  await invoke({ op: 'http', url: 'https://api.nrd.nie.163.com/api/v1/devices', method: 'GET' });
  assert.equal(state.http.at(-1).options.readTimeout, 30000); assert.equal(state.http.at(-1).options.maxRedirects, 0); checks++;
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
  bridge.dispose();
  assert.equal(state.destroyed, destroyedCount + 1); checks++;
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(results.length, resultCount); checks++;
  assert.equal(state.sockets, 0); checks++;
  console.log(`Native transport: ${checks} checks passed (offline NetworkKit adapter, no device verification).`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
