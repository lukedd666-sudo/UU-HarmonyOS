import { expect, it } from 'vitest';
import { NativeBridge, type BridgeHost } from '../src/nativeBridge';
import { UuClient } from '../src/uuClient';

it('blocks HTTP entirely if native signing material is absent', async () => {
  const requests: Record<string, unknown>[] = [];
  const host: BridgeHost = { UUBridge: { invoke(id, payload) { requests.push(JSON.parse(payload)); host.__uuNativeResult?.(id, false, '{"code":"MATERIAL_MISSING"}'); } } };
  const api = new UuClient(new NativeBridge(host));
  await expect(api.sendMobileCode('86', '13800138000')).rejects.toMatchObject({ code: 'MATERIAL_MISSING' });
  expect(requests.map(r => r.op)).toEqual(['hmac']);
});

it('signs the exact JSON sent to native HTTP and keeps login state in memory until clear', async () => {
  const requests: Record<string, unknown>[] = [];
  const host: BridgeHost = { UUBridge: { invoke(id, payload) {
    const request = JSON.parse(payload); requests.push(request);
    if (request.op === 'hmac') host.__uuNativeResult?.(id, true, JSON.stringify({ hex: 'a'.repeat(64) }));
    else {
      const body = request.url.endsWith('/device/android/init') ? { code: 0, data: { device_id: 'local-controller' } }
        : request.url.endsWith('/login/by_mobile') ? { code: 0, data: { user_id: 'fixture-user', token: 'fixture-token' } }
        // Fields supported by upstream frontend/src/devices/deviceSummary.ts.
        : { code: 0, data: { desktop_devices: [
          { device_id: 'owned-mac', alias: 'Mac Studio', platform: 4, controllable: true },
          { deviceId: 'second-mac', deviceName: 'Office Mac', platform: '4', controllable: 'true' },
        ] } };
      host.__uuNativeResult?.(id, true, JSON.stringify({ status: 200, body: JSON.stringify(body), headers: {} }));
    }
  } } };
  const api = new UuClient(new NativeBridge(host));
  await api.login('86', '13800138000', '123456');
  expect(api.loggedIn).toBe(true);
  const devices = await api.devices();
  expect(devices).toMatchObject([
    { deviceId: 'owned-mac', name: 'Mac Studio', mac: true },
    { deviceId: 'second-mac', name: 'Office Mac', mac: true, controllable: true },
  ]);
  const loginRequest = requests.find(r => String(r.url).endsWith('/login/by_mobile'))!;
  expect(loginRequest.body).toBe('{"country_code":"86","mobile":"13800138000","code":"123456"}');
  const loginIndex = requests.indexOf(loginRequest);
  expect(requests[loginIndex - 1]!.message).toMatch(/^POST\/api\/v1\/login\/by_mobilex-param-abi=/);
  expect(String(requests[loginIndex - 1]!.message)).toContain(String(loginRequest.body));
  expect((requests.at(-1)!.headers as Record<string, string>).Authorization).toBe('Bearer fixture-token');
  api.clear();
  expect(api.loggedIn).toBe(false);
  const requestCount = requests.length;
  await expect(api.devices()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  expect(requests).toHaveLength(requestCount);
});
