import { afterEach, expect, it, vi } from 'vitest';
import { NativeBridge, type BridgeHost } from '../src/nativeBridge';
import { saveProtocolMaterial } from '../src/material';
afterEach(() => vi.unstubAllGlobals());

it('clears protocol material immediately and submits only a local native operation even on rejection', async () => {
  const operations: string[] = [];
  const input = { value: 'test-only-material' };
  const host: BridgeHost = { UUBridge: { invoke(id, payload) {
    operations.push(JSON.parse(payload).op);
    expect(input.value).toBe('');
    host.__uuNativeResult?.(id, false, '{"code":"MATERIAL_IMPORT_FAILED","message":"sensitive-material"}');
  } } };
  const error = await saveProtocolMaterial(new NativeBridge(host), input).catch(error => error);
  expect(input.value).toBe('');
  expect(operations).toEqual(['material.import']);
  expect(error.code).toBe('MATERIAL_IMPORT_FAILED');
  expect(error.message).not.toContain('sensitive-material');
});

it('accepts an imported native key only after its offline HMAC matches the public fixture', async () => {
  const operations: string[] = [];
  const input = { value: 'test-only-material' };
  const host: BridgeHost = { UUBridge: { invoke(id, payload) {
    const request = JSON.parse(payload); operations.push(request.op);
    if (request.op === 'hmac') expect(request.message).toBe('UU-REA offline HMAC self-check v1');
    host.__uuNativeResult?.(id, true, JSON.stringify(request.op === 'material.import' ? { imported: true } : { hex: '80a7fcc0fa966b38f2c2c2cfca5bd1e13170bb278dfc993fef04a2dadbc154b5' }));
  } } };
  await saveProtocolMaterial(new NativeBridge(host), input);
  expect(input.value).toBe('');
  expect(operations).toEqual(['material.import', 'hmac']);
});

it('rejects offline signature mismatch or missing WebCrypto without sending HTTP', async () => {
  const operations: string[] = [];
  const host: BridgeHost = { UUBridge: { invoke(id, payload) {
    const request = JSON.parse(payload); operations.push(request.op);
    host.__uuNativeResult?.(id, true, JSON.stringify(request.op === 'material.import' ? { imported: true } : { hex: '0'.repeat(64) }));
  } } };
  const bridge = new NativeBridge(host);
  const input = { value: 'test-only-material' };
  await expect(saveProtocolMaterial(bridge, input)).rejects.toMatchObject({ code: 'MATERIAL_SELF_TEST_MISMATCH' });
  expect(input.value).toBe('');
  expect(operations).toEqual(['material.import', 'hmac']);
  vi.stubGlobal('crypto', undefined);
  input.value = 'test-only-material';
  await expect(saveProtocolMaterial(bridge, input)).rejects.toMatchObject({ code: 'MATERIAL_SELF_TEST_UNAVAILABLE' });
  expect(input.value).toBe('');
  expect(operations).toEqual(['material.import', 'hmac']);
});
