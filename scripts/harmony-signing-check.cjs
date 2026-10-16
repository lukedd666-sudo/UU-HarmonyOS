#!/usr/bin/env node
// Test the production signer against an in-memory HUKS adapter, never a real key store or UU service.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const deveco = process.env.UU_REA_DEVECO || '/Applications/DevEco-Studio.app/Contents';
const ts = require(path.join(deveco, 'sdk/default/openharmony/ets/build-tools/ets-loader/node_modules/typescript'));
const source = fs.readFileSync(path.join(__dirname, '../entry/src/main/ets/bridge/SigningMaterial.ets'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, fileName: 'SigningMaterial.ts' }).outputText;
const state = { keys: new Map(), importError: null, primaryImportError: null, deleteError: null, existsError: null, updateError: null, importedBuffer: null, aborts: 0, sessions: new Map(), deletedAliases: [] };
const alias = 'uu-rea-protocol-signing-material';
const stagingAlias = alias + '-import-check';
function checkAlias(actual) { assert([alias, stagingAlias].includes(actual)); }
const huks = {
  HuksTag: { HUKS_TAG_ALGORITHM: 1, HUKS_TAG_PURPOSE: 2, HUKS_TAG_DIGEST: 4, HUKS_TAG_KEY_SIZE: 3 },
  HuksKeyAlg: { HUKS_ALG_HMAC: 50 },
  HuksKeyPurpose: { HUKS_KEY_PURPOSE_MAC: 128 },
  HuksKeyDigest: { HUKS_DIGEST_SHA256: 12 },
  async isKeyItemExist(actual) { checkAlias(actual); if (state.existsError) throw state.existsError; if (!state.keys.has(actual)) throw { code: 12000011 }; return true; },
  async deleteKeyItem(actual) { checkAlias(actual); if (state.deleteError) throw state.deleteError; if (!state.keys.has(actual)) throw { code: 12000011 }; state.keys.delete(actual); state.deletedAliases.push(actual); },
  async importKeyItem(actual, options) {
    checkAlias(actual);
    state.importedBuffer = options.inData;
    if (state.importError) throw state.importError;
    if (actual === alias && state.primaryImportError) throw state.primaryImportError;
    // API 20+: importing over an existing alias must fail, never silently overwrite.
    if (state.keys.has(actual)) throw { code: 12000017 };
    assert.equal(options.properties.find(p => p.tag === 3).value, 512);
    assert.equal(options.inData.byteLength, 64);
    state.keys.set(actual, Buffer.from(options.inData));
  },
  async initSession(actual) { assert.equal(actual, alias); state.sessions.set(1, []); return { handle: 1 }; },
  async updateSession(handle, options) { if (state.updateError) throw state.updateError; assert(options.inData.length <= 4096); state.sessions.get(handle).push(Buffer.from(options.inData)); return {}; },
  async finishSession(handle, options) { const message = Buffer.concat([...state.sessions.get(handle), Buffer.from(options.inData)]); state.sessions.delete(handle); return { outData: new Uint8Array(crypto.createHmac('sha256', state.keys.get(alias)).update(message).digest()) }; },
  async abortSession(handle) { state.aborts++; state.sessions.delete(handle); },
};
const moduleState = { exports: {} };
vm.runInNewContext(compiled, {
  exports: moduleState.exports, module: moduleState,
  require(name) {
    if (name === '@kit.UniversalKeystoreKit') return { huks };
    if (name === '@kit.ArkTS') return { util: { TextEncoder: class { encodeInto(input) { return new TextEncoder().encode(input); } } } };
    throw new Error('Unexpected dependency');
  },
});
const { signProtocolMessage, importProtocolMaterial } = moduleState.exports;
let checks = 0;
(async () => {
  await assert.rejects(signProtocolMessage('offline fixture message'), /MATERIAL_MISSING/); checks++;
  state.existsError = { code: 801 };
  await assert.rejects(signProtocolMessage('offline fixture message'), /KEYSTORE_UNAVAILABLE/); checks++;
  state.existsError = null;
  for (const material of ['fixture8', 'fixture-16-bytes!', 'x'.repeat(32), 'y'.repeat(64), '离线测试材料']) {
    await importProtocolMaterial(material);
    assert(state.importedBuffer.every(value => value === 0)); checks++;
    const message = 'offline message '.repeat(1000);
    const expected = crypto.createHmac('sha256', Buffer.from(material, 'utf8')).update(message).digest('hex');
    assert.equal(await signProtocolMessage(message), expected); checks++;
  }
  assert(state.deletedAliases.filter(actual => actual === alias).length >= 4); checks++;
  assert.equal(state.keys.has(stagingAlias), false); checks++;
  const existing = Buffer.from(state.keys.get(alias));
  const deleteCount = state.deletedAliases.length;
  for (const material of ['', 'short', 'x'.repeat(65), '汉'.repeat(22)]) {
    await assert.rejects(importProtocolMaterial(material), /MATERIAL_INPUT_INVALID/); checks++;
  }
  assert.deepEqual(state.keys.get(alias), existing); assert.equal(state.deletedAliases.length, deleteCount); checks++;
  state.importError = { code: 12000001 };
  await assert.rejects(importProtocolMaterial('fixture8'), /MATERIAL_IMPORT_UNSUPPORTED/); checks++;
  assert(state.importedBuffer.every(value => value === 0)); checks++;
  assert.deepEqual(state.keys.get(alias), existing); checks++;
  state.importError = { code: 12000004 };
  await assert.rejects(importProtocolMaterial('fixture8'), /MATERIAL_IMPORT_FAILED/); checks++;
  state.importError = null;
  assert.deepEqual(state.keys.get(alias), existing); checks++;
  state.primaryImportError = { code: 12000004 };
  await assert.rejects(importProtocolMaterial('fixture8'), /MATERIAL_REPLACE_FAILED/); checks++;
  assert.equal(state.keys.has(alias), false); assert.equal(state.keys.has(stagingAlias), false); checks++;
  state.primaryImportError = null;
  await importProtocolMaterial('fixture8');
  assert.equal(await signProtocolMessage('recovered'), crypto.createHmac('sha256', 'fixture8').update('recovered').digest('hex')); checks++;
  state.deleteError = { code: 12000004 };
  const recovered = Buffer.from(state.keys.get(alias));
  await assert.rejects(importProtocolMaterial('new-fixture8'), /MATERIAL_IMPORT_FAILED/); checks++;
  assert.deepEqual(state.keys.get(alias), recovered); checks++;
  state.deleteError = null;
  // An interrupted import may leave a staging alias; the next explicit save must clean it.
  await importProtocolMaterial('new-fixture8');
  assert.equal(state.keys.has(stagingAlias), false); checks++;
  state.updateError = { code: 12000004 };
  await assert.rejects(signProtocolMessage('offline fixture message'), /SIGNING_FAILED/); checks++;
  assert.equal(state.aborts, 1); assert.equal(state.sessions.size, 0); checks++;
  console.log(`Native signing contract: ${checks} checks passed (mock HUKS, no device verification).`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
