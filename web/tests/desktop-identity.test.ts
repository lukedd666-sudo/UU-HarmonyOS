import { expect, it } from 'vitest';
import { NativeBridge, type BridgeHost } from '../src/nativeBridge';
import { UuClient } from '../src/uuClient';

const legacy = { token: 'fixture-token', userId: 'fixture-user', clientId: 'fixture-android-client', deviceId: 'fixture-android-device', uuid: 'fixture-install' };
const facts = { systemVersion: '6.1.0.115', cpu: 'arm64', memory: '', model: 'PCEMU-FD00', resolution: '3120x2080', dpi: 240 };
function fixture(initial: unknown = null) {
  let saved = initial;
  const control = { initCode: 0, failSave: false, failFacts: false, requests: [] as Record<string, any>[] };
  const host: BridgeHost = { UUBridge: { invoke(id, payload) {
    const request = JSON.parse(payload); control.requests.push(request);
    const ok = (value: unknown) => host.__uuNativeResult?.(id, true, JSON.stringify(value));
    if (request.op === 'session.load') ok({ session: saved });
    else if (request.op === 'session.clear') { saved = null; ok({ session: null }); }
    else if (request.op === 'session.save') {
      if (control.failSave) host.__uuNativeResult?.(id, false, '{"code":"SESSION_SAVE_FAILED"}');
      else { saved = JSON.parse(request.data); ok({ session: null }); }
    } else if (request.op === 'device.profile') {
      if (control.failFacts) host.__uuNativeResult?.(id, false, '{"code":"NATIVE_FAILURE"}');
      else ok(facts);
    } else if (request.op === 'hmac') ok({ hex: 'a'.repeat(64) });
    else if (request.op === 'http') {
      const body = /\/device\/(android|macos)\/init$/.test(request.url) ? { code: control.initCode, data: { device_id: 'fixture-desktop-device' } }
        : request.url.endsWith('/login/by_mobile') ? { code: 0, data: { user_id: 'fixture-user', token: 'fixture-token' } }
        : { code: 0, data: { desktop_devices: [] } };
      ok({ status: control.initCode === 1120 && request.url.endsWith('/init') ? 400 : 200, body: JSON.stringify(body) });
    }
  } } };
  return { api: new UuClient(new NativeBridge(host)), control, saved: () => saved };
}

it('registers a truthful desktop profile and signs the same desktop platform and body sent to UU', async () => {
  const f = fixture();
  await f.api.login('86', '13800138000', '123456');
  const init = f.control.requests.find(request => request.op === 'http' && request.url.endsWith('/init'))!;
  expect(init.url).toBe('https://api.nrd.nie.163.com/api/v1/device/macos/init');
  expect(init.headers['X-Param-PLAT']).toBe('4');
  const body = JSON.parse(init.body);
  expect(body).toMatchObject({ name: 'UU-REA HarmonyOS Computer', system_version: '6.1.0.115', cpu: 'arm64', memory: '', model: 'PCEMU-FD00', system_name: 'HarmonyOS', os: 'HarmonyOS', resolution: '3120x2080', dpi: 240, video: [], controllable: false, model_identifier: '', model_number: '', mac: '' });
  expect(body).not.toHaveProperty('gaid');
  expect(body).not.toHaveProperty('build_fingerprint');
  const signing = f.control.requests[f.control.requests.indexOf(init) - 1]!;
  expect(signing.message).toContain('x-param-plat=4');
  expect(String(signing.message).endsWith(init.body)).toBe(true);
  const requests = f.control.requests.filter(request => request.op === 'http');
  expect(requests.every(request => request.headers['X-Param-PLAT'] === '4')).toBe(true);
  expect(f.saved()).toMatchObject({ registration: 'harmony-desktop-v1', deviceId: 'fixture-desktop-device' });
});

it('migrates a legacy Android registration before sending desktop account requests without deleting remote records', async () => {
  const f = fixture(legacy);
  expect(await f.api.restore()).toBe(true);
  expect(f.api.controllerDeviceId).toBe('fixture-desktop-device');
  expect(f.saved()).toMatchObject({ token: legacy.token, userId: legacy.userId, uuid: legacy.uuid, clientId: 'uu-rea-desktop-fixture-install', registration: 'harmony-desktop-v1' });
  const init = f.control.requests.find(request => request.op === 'http')!;
  expect(init.headers).toMatchObject({ 'X-Param-device-id': '', 'X-Param-client-id': 'uu-rea-desktop-fixture-install', Authorization: 'Bearer fixture-token' });
  await f.api.devices();
  expect(f.control.requests.filter(request => request.op === 'http').map(request => new URL(request.url).pathname)).toEqual(['/api/v1/device/macos/init', '/api/v1/device/groups/of/my']);
  expect(f.control.requests.at(-1)?.headers['X-Param-device-id']).toBe('fixture-desktop-device');
});

it('keeps a failed legacy migration retryable and preserves the previous secure session', async () => {
  const f = fixture(legacy); f.control.initCode = 4001;
  await expect(f.api.restore()).rejects.toMatchObject({ code: 'API_REJECTED', diagnostics: { stage: 'INIT' } });
  expect(f.api.loggedIn).toBe(false);
  expect(f.saved()).toEqual(legacy);
  await expect(f.api.devices()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  f.control.initCode = 0;
  await f.api.initialize();
  expect(f.api.loggedIn).toBe(true);
  const inits = f.control.requests.filter(request => request.op === 'http' && request.url.endsWith('/init'));
  expect(inits).toHaveLength(2);
  expect(inits[0]?.headers['X-Param-client-id']).toBe(inits[1]?.headers['X-Param-client-id']);
});

it('allows clearing the previous account when desktop registration migration fails', async () => {
  const f = fixture(legacy); f.control.initCode = 4001;
  await expect(f.api.restore()).rejects.toMatchObject({ code: 'API_REJECTED' });
  expect(f.api.loggedIn).toBe(false);
  expect(f.api.hasAccountState).toBe(true);
  await f.api.logout();
  expect(f.saved()).toBe(null);
  expect(f.api.hasAccountState).toBe(false);
  expect(f.api.loggedIn).toBe(false);
});

it('does not erase the legacy secure session if saving a successful desktop migration fails', async () => {
  const f = fixture(legacy); f.control.failSave = true;
  expect(await f.api.restore()).toBe(true);
  expect(f.api.loggedIn).toBe(true);
  expect(f.api.persistenceWarning).toBe('SESSION_SAVE_FAILED');
  expect(f.saved()).toEqual(legacy);
  expect(f.control.requests.some(request => request.op === 'session.clear')).toBe(false);
});

it('reuses an explicitly desktop registration without registering again after restart', async () => {
  const f = fixture({ ...legacy, clientId: 'fixture-desktop-client', deviceId: 'fixture-desktop-device', registration: 'harmony-desktop-v1' });
  expect(await f.api.restore()).toBe(true);
  await f.api.initialize();
  expect(f.control.requests.map(request => request.op)).toEqual(['session.load']);
  expect(f.api.loggedIn).toBe(true);
});

it('invalidates an expired account token even when rejection occurs during registration migration', async () => {
  const f = fixture(legacy); f.control.initCode = 1120;
  await expect(f.api.restore()).rejects.toMatchObject({ code: 'AUTH_EXPIRED', diagnostics: { stage: 'INIT', businessCode: '1120' } });
  expect(f.api.loggedIn).toBe(false);
  expect(f.saved()).toBe(null);
});

it('does not register fabricated hardware when native device facts cannot be read', async () => {
  const f = fixture(); f.control.failFacts = true;
  await expect(f.api.initialize()).rejects.toMatchObject({ code: 'NATIVE_FAILURE', diagnostics: { stage: 'INIT' } });
  expect(f.control.requests.some(request => request.op === 'http')).toBe(false);
});
