import { ControllerError, type NativeBridge } from './nativeBridge';
const SELF_TEST_CHALLENGE = 'UU-REA offline HMAC self-check v1';

export async function saveProtocolMaterial(bridge: NativeBridge, input: { value: string }): Promise<void> {
  const material = input.value;
  input.value = '';
  const bytes = new TextEncoder().encode(material);
  try {
    if (bytes.length < 8 || bytes.length > 64) throw new ControllerError('MATERIAL_INVALID');
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) throw new ControllerError('MATERIAL_SELF_TEST_UNAVAILABLE');
    let expected: string;
    try {
      const key = await subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      bytes.fill(0);
      const signature = new Uint8Array(await subtle.sign('HMAC', key, new TextEncoder().encode(SELF_TEST_CHALLENGE)));
      try { expected = Array.from(signature, byte => byte.toString(16).padStart(2, '0')).join(''); }
      finally { signature.fill(0); }
    } catch { throw new ControllerError('MATERIAL_SELF_TEST_UNAVAILABLE'); }
    const result = await bridge.request<{ imported: boolean }>({ op: 'material.import', material });
    if (result.imported !== true) throw new ControllerError('MATERIAL_IMPORT_FAILED');
    const native = await bridge.request<{ hex: string }>({ op: 'hmac', message: SELF_TEST_CHALLENGE });
    if (typeof native.hex !== 'string' || !/^[0-9a-f]{64}$/i.test(native.hex)) throw new ControllerError('MATERIAL_SELF_TEST_MISMATCH');
    const actual = native.hex.toLowerCase();
    let difference = 0;
    for (let index = 0; index < 64; index++) difference |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
    if (difference !== 0) throw new ControllerError('MATERIAL_SELF_TEST_MISMATCH');
  } finally { bytes.fill(0); input.value = ''; }
}
