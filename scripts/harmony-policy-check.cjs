#!/usr/bin/env node
// Execute the actual pure ArkTS policy on the host. No networking, credentials or device claims.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const deveco = process.env.UU_REA_DEVECO || '/Applications/DevEco-Studio.app/Contents';
const ts = require(path.join(deveco, 'sdk/default/openharmony/ets/build-tools/ets-loader/node_modules/typescript'));
const source = fs.readFileSync(path.join(__dirname, '../entry/src/main/ets/bridge/NetworkPolicy.ets'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, fileName: 'NetworkPolicy.ts' }).outputText;
const moduleState = { exports: {} };
vm.runInNewContext(compiled, { exports: moduleState.exports, module: moduleState });
const { validateEndpoint, validateHeaders, validateHttpRequest, validateWebSocketRequest, isPollingEndpoint, isLocalEntry, isLocalResource } = moduleState.exports;
let cases = 0;
for (const endpoint of [
  'https://api.nrd.nie.163.com/api/v1/login',
  'https://api.nrd.nie.163.com:443/api/v1/devices?offset=0',
  'https://api.nrd.nie.163.com/api/v2/room/join',
  'https://room-1.nrd.nie.163.com/api/v1/device',
  'https://signal.nrd.nie.163.com/socket.io/?EIO=4&transport=polling',
  'https://signal.nrd.nie.163.com:8443/socket.io/?EIO=4&transport=polling',
  'https://nrd.nie.163.com:28443/socket.io/?EIO=4&transport=polling',
]) {
  assert.equal(validateEndpoint(endpoint, false), endpoint); cases++;
}
for (const endpoint of [
  'http://api.nrd.nie.163.com/api/v1/login',
  'https://api.nrd.nie.163.com.evil.test/api/v1/login',
  'https://evil-nrd.nie.163.com/api/v1/login',
  'https://api.nrd.nie.163.com@evil.test/api/v1/login',
  'https://evil.test@api.nrd.nie.163.com/api/v1/login',
  'https://api.nrd.nie.163.com:80/api/v1/login',
  'https://api.nrd.nie.163.com:8443/api/v1/login',
  'https://signal.nrd.nie.163.com:0/socket.io/?EIO=4&transport=polling',
  'https://signal.nrd.nie.163.com:65536/socket.io/?EIO=4&transport=polling',
  'https://signal.nrd.nie.163.com:8443/socket.io/extra?EIO=4&transport=polling',
  'https://127.0.0.1/api/v1/login',
  'https://[::1]/api/v1/login',
  'https://api.nrd.nie.163.com./api/v1/login',
  'https://api.nrd.nie.163.com/api/v1/../v3/admin',
  'https://api.nrd.nie.163.com/api/v1/%2e%2e/v3/admin',
  'https://api.nrd.nie.163.com/api/v1/%252e%252e/v3/admin',
  'https://api.nrd.nie.163.com/api/v1%2f..%2fadmin',
  'https://api.nrd.nie.163.com/api/v1\\@evil.test',
  'https://api.nrd.nie.163.com/api/v1//admin',
  'https://api.nrd.nie.163.com/api/v10/login',
  'https://api.nrd.nie.163.com/api/v2/rooms/join',
  'https://api.nrd.nie.163.com/api/v2/roommate',
  'https://api.nrd.nie.163.com/api/v2/account',
  'https://signal.nrd.nie.163.com/socket.io',
  'https://signal.nrd.nie.163.com/socket.io/other',
  'https://signal.nrd.nie.163.com/socket.io.evil/',
  'https://signal.nrd.nie.163.com/SOCKET.IO/',
  'https://signal.nrd.nie.163.com/socket.io//',
  'https://signal.nrd.nie.163.com/socket%2eio/',
  'https://signal.nrd.nie.163.com/socket.io/../api/v3',
  'https://evil.test/socket.io/?EIO=4&transport=polling',
  'https://api.nrd.nie.163.com/api/v1/login#fragment',
  'https://api.nrd.nie.163.com\n.evil.test/api/v1/login',
  'https://api.nrd.nie.163.com/' + 'x'.repeat(16385),
]) { assert.throws(() => validateEndpoint(endpoint, false)); cases++; }
assert.equal(validateEndpoint('wss://signaling.nrd.nie.163.com/socket.io/?EIO=4&transport=websocket', true), 'wss://signaling.nrd.nie.163.com/socket.io/?EIO=4&transport=websocket'); cases++;
assert.throws(() => validateEndpoint('ws://signaling.nrd.nie.163.com/socket.io/', true)); cases++;
assert.throws(() => validateEndpoint('wss://evil.test/socket.io/', true)); cases++;
const polling = 'https://signal.nrd.nie.163.com/socket.io/?EIO=4&transport=polling&sid=offline-fixture';
for (const method of ['GET', 'POST']) { assert.equal(validateHttpRequest(polling, method), polling); cases++; }
for (const method of ['PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE']) { assert.throws(() => validateHttpRequest(polling, method), /METHOD_BLOCKED/); cases++; }
assert.equal(isPollingEndpoint(polling), true); cases++;
assert.equal(isPollingEndpoint('https://signal.nrd.nie.163.com/api/v1/socket.io/'), false); cases++;
for (const headers of [undefined, {}, { Authorization: 'offline-fixture' }, { authorization: 'offline-fixture' }, { 'X-NRD-AUTH': 'offline-fixture' }, { 'X-Param-SIGN': 'offline-fixture' }, { Cookie: 'offline-fixture' }, { 'X-Unknown-Credential': 'offline-fixture' }]) {
  assert.throws(() => validateWebSocketRequest('wss://signal.nrd.nie.163.com/socket.io/', headers), /WSS_AUTH_UNVERIFIED/); cases++;
}
assert.throws(() => validateWebSocketRequest('wss://signal.nrd.nie.163.com/socket.io/?token=offline-fixture'), /WSS_AUTH_UNVERIFIED/); cases++;
assert.equal(validateHeaders({ Authorization: 'test-only' }).Authorization, 'test-only'); cases++;
for (const headers of [{ Host: 'evil.test' }, { 'Content-Length': '0' }, { 'Proxy-Authorization': 'test-only' }, { 'Sec-WebSocket-Key': 'test-only' }, { Authorization: 'test-only\r\nHost: evil.test' }, { Authorization: 3 }, { Authorization: 'x'.repeat(8193) }, null, []]) {
  assert.throws(() => validateHeaders(headers)); cases++;
}
assert.equal(isLocalEntry('resource://RAWFILE/index.html'), true); cases++;
assert.equal(isLocalEntry('https://api.nrd.nie.163.com/index.html'), false); cases++;
assert.equal(isLocalResource('resource://rawfile/assets/index-abc.js'), true); cases++;
assert.equal(isLocalResource('resource://rawfile/../private'), false); cases++;
assert.equal(isLocalResource('file:///data/private'), false); cases++;
console.log(`Native network policy: ${cases} checks passed (offline host execution).`);
