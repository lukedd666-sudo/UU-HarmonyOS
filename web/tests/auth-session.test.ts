import { expect, it } from 'vitest';
import { NativeBridge, type BridgeHost } from '../src/nativeBridge';
import { UuClient } from '../src/uuClient';

function fixture() {
  let saved: unknown = null;
  const control = { failSave: false, failClear: false, expired: false, http: [] as Record<string, unknown>[] };
  function client() {
    const host: BridgeHost = { UUBridge: { invoke(id, payload) {
      const request = JSON.parse(payload);
      const ok = (body: unknown) => host.__uuNativeResult?.(id, true, JSON.stringify(body));
      const fail = (code: string) => host.__uuNativeResult?.(id, false, JSON.stringify({ code }));
      if (request.op === 'session.load') ok({ session: saved });
      else if (request.op === 'session.clear') { if (control.failClear) fail('SESSION_CLEAR_FAILED'); else { saved = null; ok({ session: null }); } }
      else if (request.op === 'session.save') { if (control.failSave) fail('SESSION_SAVE_FAILED'); else { saved = JSON.parse(request.data); ok({ session: null }); } }
      else if (request.op === 'hmac') ok({ hex: 'a'.repeat(64) });
      else {
        control.http.push(request);
        const body = request.url.endsWith('/device/android/init') ? { code: 0, data: { device_id: 'fixture-controller' } }
          : request.url.endsWith('/login/by_mobile') ? { code: 0, data: { user_id: 'fixture-user', token: 'fixture-token' } }
          : control.expired ? { code: 1120 } : { code: 0, data: { desktop_devices: [] } };
        ok({ status: body.code === 1120 ? 400 : 200, body: JSON.stringify(body), headers: {} });
      }
    } } };
    return new UuClient(new NativeBridge(host));
  }
  return { client, control, saved: () => saved };
}

it('restores both account and controller identity across page disposal without persisting phone, OTP or rooms', async () => {
  const f = fixture(), first = f.client();
  expect(await first.restore()).toBe(false);
  await first.login('86', '13800138000', '123456');
  const saved = f.saved() as Record<string, string>;
  expect(Object.keys(saved).sort()).toEqual(['clientId', 'deviceId', 'token', 'userId', 'uuid']);
  expect(JSON.stringify(saved)).not.toContain('13800138000');
  expect(JSON.stringify(saved)).not.toContain('123456');
  first.clear();
  const restarted = f.client();
  expect(await restarted.restore()).toBe(true);
  expect(restarted.controllerDeviceId).toBe('fixture-controller');
  const requests = f.control.http.length;
  await restarted.devices();
  expect(f.control.http).toHaveLength(requests + 1);
  expect(f.control.http.at(-1)?.headers).toMatchObject({ Authorization: 'Bearer fixture-token', 'X-Param-client-id': saved.clientId });
  await restarted.logout();
  expect(restarted.loggedIn).toBe(false);
  expect(await f.client().restore()).toBe(false);
});

it('invalidates stored credentials on confirmed 1120, while exposing a failed deletion and allowing retry', async () => {
  for (const failClear of [false, true]) {
    const f = fixture(), api = f.client();
    await api.login('86', '13800138000', '123456');
    f.control.expired = true; f.control.failClear = failClear;
    await expect(api.devices()).rejects.toMatchObject({ code: failClear ? 'AUTH_EXPIRED_CLEAR_FAILED' : 'AUTH_EXPIRED', diagnostics: { stage: 'DEVICES', businessCode: '1120' } });
    expect(api.loggedIn).toBe(false);
    expect(Boolean(f.saved())).toBe(failClear);
    if (failClear) {
      expect(api.persistenceWarning).toBe('SESSION_CLEAR_FAILED');
      f.control.failClear = false;
      await api.logout();
      expect(api.persistenceWarning).toBe('');
      expect(f.saved()).toBe(null);
    }
  }
});

it('keeps a usable in-memory login and gives an explicit warning when secure save fails', async () => {
  const f = fixture(), api = f.client(); f.control.failSave = true;
  await api.login('86', '13800138000', '123456');
  expect(api.loggedIn).toBe(true);
  expect(api.persistenceWarning).toBe('SESSION_SAVE_FAILED');
  expect(f.saved()).toBe(null);
});

it('erases an older saved login after failed replacement and explicitly warns if both operations fail', async () => {
  for (const failClear of [false, true]) {
    const f = fixture(), api = f.client();
    await api.login('86', '13800138000', '123456');
    f.control.failSave = true; f.control.failClear = failClear;
    await api.login('86', '13800138000', '123456');
    expect(api.loggedIn).toBe(true);
    expect(api.persistenceWarning).toBe(failClear ? 'SESSION_REPLACE_FAILED' : 'SESSION_SAVE_FAILED');
    expect(Boolean(f.saved())).toBe(failClear);
  }
});
