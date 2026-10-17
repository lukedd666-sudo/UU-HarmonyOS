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
const { validateEndpoint, validateHeaders, validateHttpRequest, validateWebSocketRequest, isPollingEndpoint, isLocalEntry, isLocalResource, isSafeDiagnosticRecord, validateSignalAddress } = moduleState.exports;
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
for (const record of [
  'UU_REA_DIAG|JOIN|SIGNAL_HOST_BLOCKED|200|0',
  'UU_REA_RTC|FIRST_FRAME',
  'UU_REA_RTC|INPUT_KEY_SENT',
  'UU_REA_RTC|CONTROL_REJECTED',
  'UU_REA_MEDIA|123456|3700|3|1920|1080|4',
  'UU_REA_SIGNAL_END|PING_TIMEOUT',
  'UU_REA_RTC|KEY_REFRESH_OK',
  'UU_REA_ICE_CANDIDATE|REMOTE|RELAY|TCP',
  'UU_REA_ICE_CONFIG|2|ALL',
  'UU_REA_ICE_STATE|CHECKING',
  'UU_REA_ICE_ERROR|701',
  'UU_REA_ICE_FAILURE|DOMAIN_TLS|DNS',
  'UU_REA_ICE_FAILURE|TCP_RELAY|TIMEOUT',
  'UU_REA_ICE_SELECTED|RELAY|TCP|RELAY|UDP',
  'UU_REA_ICE_RELAY_CHECKS|20|0|8|0|0|0',
  'UU_REA_ICE_STATS|10|20|0|0|0|4|5|0|0|1|2|3',
  'UU_REA_SIGNAL_EVENT|SWITCH_NETWORK',
  'UU_REA_ICE_ORIGIN|TURNS|nrd.nie.163.com|443',
  'UU_REA_POLL|GET|200|25001',
  'UU_REA_HTTP_ERROR|POST|2300028|40000',
  'UU_REA_CONTROL_RESULT|0',
  'UU_REA_CONTROL_RESULT|-99999',
  'UU_REA_SIGNAL_ORIGIN|https|gateway.example.com|8443',
  'UU_REA_SIGNAL_ORIGIN|https|[2001:db8::1]|443',
]) { assert.equal(isSafeDiagnosticRecord(record), true); cases++; }
for (const record of [
  'UU_REA_RTC|INPUT_KEY_SENT|private-keystroke',
  'UU_REA_MEDIA|123456|3700|3|1920|1080|4|private-content',
  'UU_REA_MEDIA|123456|3700|3|1920|1080|4\nprivate-content',
  'UU_REA_MEDIA|NaN|3700|3|1920|1080|4',
  'UU_REA_MEDIA|-1|3700|3|1920|1080|4',
  'UU_REA_MEDIA|123456|3700|3|1920|1080|5',
  'UU_REA_SIGNAL_END|private-content',
  'UU_REA_RTC|KEY_REFRESH_OK|private-key',
  'UU_REA_ICE_CANDIDATE|REMOTE|RELAY|TCP|private-address',
  'UU_REA_ICE_CONFIG|2|private-credential',
  'UU_REA_ICE_STATE|private-address',
  'UU_REA_ICE_ERROR|701|private-url',
  'UU_REA_ICE_FAILURE|DOMAIN_TLS|private-error',
  'UU_REA_ICE_SELECTED|RELAY|TCP|RELAY|UDP|private-candidate',
  'UU_REA_ICE_SELECTED|RELAY|private-address|RELAY|UDP',
  'UU_REA_ICE_SELECTED|RELAY|TCP|private-address|UDP',
  'UU_REA_ICE_RELAY_CHECKS|20|0|8|0|0|0|private-content',
  'UU_REA_ICE_RELAY_CHECKS|20|0|private-address|0|0|0',
  'UU_REA_ICE_STATS|10|20|0|0|0|4|5|private-address',
  'UU_REA_SIGNAL_EVENT|private-content',
  'UU_REA_ICE_ORIGIN|TURNS|user:private-key@nrd.nie.163.com|443',
  'UU_REA_ICE_ORIGIN|TURNS|nrd.nie.163.com?credential=private-key|443',
  'UU_REA_POLL|GET|200|25001|private-content',
  'UU_REA_HTTP_ERROR|POST|private-content|40000',
  'UU_REA_CONTROL_RESULT|100000',
  'UU_REA_CONTROL_RESULT|1|private-message',
  'UU_REA_CONTROL_RESULT|1\nprivate-message',
  'UU_REA_RTC|private-token',
  'UU_REA_RTC|FIRST_FRAME\nprivate-token',
  'UU_REA_SIGNAL_ORIGIN|http|gateway.example.com|443',
  'UU_REA_SIGNAL_ORIGIN|https|user:private-password@gateway.example.com|443',
  'UU_REA_SIGNAL_ORIGIN|https|gateway.example.com?token=private-token|443',
  'UU_REA_SIGNAL_ORIGIN|https|gateway.example.com/private-path|443',
  'UU_REA_SIGNAL_ORIGIN|https|gateway.example.com|0',
  'UU_REA_SIGNAL_ORIGIN|https|gateway.example.com|65536',
  'UU_REA_SIGNAL_ORIGIN|https|gateway.example.com|443|private-token',
  'UU_REA_SIGNAL_ORIGIN|https|gateway.example.com\nprivate-token|443',
  'UU_REA_SIGNAL_ORIGIN|https|' + 'a'.repeat(254) + '|443',
]) { assert.equal(isSafeDiagnosticRecord(record), false); cases++; }

for (const address of ['', '42.186.225.118', '1.1.1.1', '8.8.8.8', '100.63.255.255', '100.128.0.1', '172.15.255.255', '172.32.0.1', '223.255.255.254']) {
  assert.equal(validateSignalAddress(address), address); cases++;
}
for (const address of [undefined, null, [], ['42.186.225.118'], 42, ' 42.186.225.118', '42.186.225.118 ', '042.186.225.118', '42.186.225.0118', '42.186.225', '42.186.225.118:443', '42.186.225.118,8.8.8.8', 'https://42.186.225.118', '0x2a.bA.e1.76', '::1', '2001:4860:4860::8888', '256.1.1.1', '0.1.1.1', '10.0.0.1', '100.64.0.1', '100.127.255.255', '127.0.0.1', '169.254.1.1', '172.16.0.1', '172.31.255.255', '192.0.0.1', '192.0.2.1', '192.88.99.1', '192.168.0.1', '198.18.0.1', '198.19.255.255', '198.51.100.1', '203.0.113.1', '224.0.0.1', '239.255.255.255', '240.0.0.1', '255.255.255.255']) {
  assert.throws(() => validateSignalAddress(address), /SIGNAL_ADDRESS_INVALID/); cases++;
}
assert.throws(() => validateHttpRequest('https://42.186.225.118/socket.io/?EIO=4&transport=polling', 'GET'), /HOST_BLOCKED/); cases++;

console.log(`Native network policy: ${cases} checks passed (offline host execution).`);
