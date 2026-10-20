#!/usr/bin/env node
// Actual SessionStore, with offline AssetStoreKit adapter. No real account data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const deveco = process.env.UU_REA_DEVECO || '/Applications/DevEco-Studio.app/Contents';
const ts = require(path.join(deveco, 'sdk/default/openharmony/ets/build-tools/ets-loader/node_modules/typescript'));
const Tag = Object.fromEntries(['ALIAS', 'SECRET', 'ACCESSIBILITY', 'SYNC_TYPE', 'CONFLICT_RESOLUTION', 'RETURN_TYPE'].map(k => [k, k]));
let stored = null, fail = false, gate = null;
const asset = { Tag, Accessibility: { DEVICE_UNLOCKED: 2 }, SyncType: { NEVER: 0 }, ConflictResolution: { OVERWRITE: 0 }, ReturnType: { ALL: 0 },
  async add(map) {
    assert.equal(map.get(Tag.ACCESSIBILITY), 2); assert.equal(map.get(Tag.SYNC_TYPE), 0);
    assert.equal(map.get(Tag.CONFLICT_RESOLUTION), 0); assert.equal(map.has(undefined), false);
    if (gate) await gate;
    if (fail) throw new Error('private-raw-error');
    stored = new Uint8Array(map.get(Tag.SECRET));
  },
  async query() { if (fail) throw new Error('private-raw-error'); if (!stored) throw { code: 24000002 }; return [new Map([[Tag.SECRET, new Uint8Array(stored)]])]; },
  async remove() { if (fail) throw new Error('private-raw-error'); if (!stored) throw { code: 24000002 }; stored = null; },
};
const output = { exports: {} };
const source = fs.readFileSync(path.join(__dirname, '../entry/src/main/ets/bridge/SessionStore.ets'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
vm.runInNewContext(compiled, { Uint8Array, module: output, exports: output.exports, require(key) {
  if (key === '@kit.AssetStoreKit') return { asset };
  if (key === '@kit.ArkTS') return { util: { TextEncoder: class { encodeInto(value) { return new TextEncoder().encode(value); } }, TextDecoder: class { decodeToString(value) { return new TextDecoder().decode(value); } } } };
  throw new Error('Unexpected dependency');
} });
const operation = (op, data = '', current = () => true) => output.exports.sessionOperation('session.' + op, data, current);
(async () => {
  assert.equal((await operation('load')).session, null);
  await operation('clear');
  const fixture = { token: 'fixture-token', userId: 'fixture-user', clientId: 'fixture-client', deviceId: 'fixture-device', uuid: 'fixture-uuid' };
  await operation('save', JSON.stringify(fixture));
  assert.equal((await operation('load')).session.token, fixture.token);
  fixture.token = 'fixture-updated'; await operation('save', JSON.stringify(fixture));
  assert.equal((await operation('load')).session.token, fixture.token);
  const desktop = { ...fixture, registration: 'harmony-desktop-v1' };
  await operation('save', JSON.stringify(desktop));
  assert.equal((await operation('load')).session.registration, 'harmony-desktop-v1');
  for (const registration of ['android', '', null, 4]) {
    await assert.rejects(operation('save', JSON.stringify({ ...fixture, registration })), /SESSION_SAVE_FAILED/);
  }
  await assert.rejects(operation('save', JSON.stringify({ ...desktop, phone: 'never-store' })), /SESSION_SAVE_FAILED/);
  await operation('save', JSON.stringify(fixture));
  assert.equal((await operation('load')).session.registration, undefined, 'legacy sessions remain readable');
  for (const data of ['null', '{}', JSON.stringify({ ...fixture, phone: 'never-store' }), JSON.stringify({ ...fixture, token: 'x'.repeat(1100) })]) {
    await assert.rejects(operation('save', data), /SESSION_SAVE_FAILED/);
  }
  let release; gate = new Promise(resolve => { release = resolve; });
  const saving = operation('save', JSON.stringify(fixture));
  const clearing = operation('clear'); release(); await saving; await clearing; gate = null;
  assert.equal((await operation('load')).session, null);
  await assert.rejects(operation('save', JSON.stringify(fixture), () => false), /SESSION_CANCELLED/);
  assert.equal(stored, null);
  fail = true;
  for (const op of ['load', 'save', 'clear']) await assert.rejects(operation(op, JSON.stringify(fixture)), new RegExp('SESSION_' + op.toUpperCase() + '_FAILED'));
  console.log('Native session: secure save/load/overwrite/erase, bounds, lifecycle ordering and failure checks passed (offline adapter).');
})().catch(error => { console.error(error); process.exitCode = 1; });
