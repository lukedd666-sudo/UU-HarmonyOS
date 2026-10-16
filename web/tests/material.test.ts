import { expect, it } from 'vitest';
import { NativeBridge, type BridgeHost } from '../src/nativeBridge';
import { saveProtocolMaterial } from '../src/material';

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
