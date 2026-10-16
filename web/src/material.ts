import { ControllerError, type NativeBridge } from './nativeBridge';
export async function saveProtocolMaterial(bridge: NativeBridge, input: { value: string }): Promise<void> {
  const material = input.value;
  input.value = '';
  try {
    const length = new TextEncoder().encode(material).length;
    if (length < 8 || length > 64) throw new ControllerError('MATERIAL_INVALID');
    const result = await bridge.request<{ imported: boolean }>({ op: 'material.import', material });
    if (result.imported !== true) throw new ControllerError('MATERIAL_IMPORT_FAILED');
  } finally { input.value = ''; }
}
