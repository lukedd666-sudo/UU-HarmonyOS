import { expect, it } from 'vitest';
import { ControllerError, NativeBridge, type BridgeHost } from '../src/nativeBridge';
import { UuClient } from '../src/uuClient';
import { controllerDiagnosticRecord, controllerErrorText } from '../src/errorText';

it('blocks HTTP entirely if native signing material is absent', async () => {
  const requests: Record<string, unknown>[] = [];
  const host: BridgeHost = { UUBridge: { invoke(id, payload) { requests.push(JSON.parse(payload)); host.__uuNativeResult?.(id, false, '{"code":"MATERIAL_MISSING"}'); } } };
  const api = new UuClient(new NativeBridge(host));
  await expect(api.sendMobileCode('86', '13800138000')).rejects.toMatchObject({ code: 'MATERIAL_MISSING', diagnostics: { stage: 'INIT' } });
  expect(requests.map(r => r.op)).toEqual(['hmac']);
});

function diagnosticClient(responseForPath: (url: string) => { status: number; body: unknown; headers?: Record<string, string> }): UuClient {
  const host: BridgeHost = { UUBridge: { invoke(id, payload) {
    const request = JSON.parse(payload);
    if (request.op === 'hmac') host.__uuNativeResult?.(id, true, JSON.stringify({ hex: 'a'.repeat(64) }));
    else {
      const result = request.url.endsWith('/device/android/init')
        ? { status: 200, body: { code: 0, data: { device_id: 'fixture-controller' } } }
        : responseForPath(request.url);
      host.__uuNativeResult?.(id, true, JSON.stringify({ ...result, body: JSON.stringify(result.body) }));
    }
  } } };
  return new UuClient(new NativeBridge(host));
}

it('reports a business refusal using only its SMS stage, HTTP status and short numeric code', async () => {
  const api = diagnosticClient(() => ({ status: 200, body: { code: 1140, msg: 'private upstream explanation' } }));
  const error = await api.sendMobileCode('86', '13800138000').catch(error => error);
  expect(error).toMatchObject({ code: 'API_REJECTED', diagnostics: { stage: 'SMS', httpStatus: 200, businessCode: '1140' } });
  expect(controllerErrorText(error)).toContain('短信验证码请求失败');
  expect(controllerErrorText(error)).toContain('HTTP 200');
  expect(controllerErrorText(error)).toContain('业务码 1140');
  expect(controllerErrorText(error)).not.toContain('private upstream');
  expect(controllerDiagnosticRecord(error)).toBe('UU_REA_DIAG|SMS|API_REJECTED|200|1140');
});

it('keeps successful login when the later devices request fails and identifies that separate failure', async () => {
  const api = diagnosticClient(url => url.endsWith('/login/by_mobile')
    ? { status: 200, body: { code: 0, data: { user_id: 'fixture-user', token: 'fixture-token' } } }
    : { status: 403, body: { code: 409, msg: 'private device response' } });
  await api.login('86', '13800138000', '123456');
  const error = await api.devices().catch(error => error);
  expect(api.loggedIn).toBe(true);
  expect(error).toMatchObject({ diagnostics: { stage: 'DEVICES', httpStatus: 403, businessCode: '409' } });
  expect(controllerErrorText(error, api.loggedIn)).toContain('已登录，但设备列表读取失败');
  expect(controllerErrorText(error, api.loggedIn)).not.toContain('登录校验失败');
  expect(controllerDiagnosticRecord(error)).toBe('UU_REA_DIAG|DEVICES|API_REJECTED|403|409');
});

it('drops malicious response values from rejection and normalization errors while retaining the LOGIN stage', async () => {
  const privateValue = 'private-13800138000-123456-fixture-token-/api/private-path';
  for (const body of [
    { code: privateValue, msg: privateValue, data: { token: privateValue } },
    { code: 0, msg: privateValue, data: { user_id: 'fixture-user' } },
  ]) {
    const api = diagnosticClient(() => ({ status: 200, body, headers: { 'x-private': privateValue } }));
    const error = await api.login('86', '13800138000', '123456').catch(error => error);
    expect(error).toMatchObject({ diagnostics: { stage: 'LOGIN', httpStatus: 200 } });
    const record = controllerDiagnosticRecord(error);
    expect(record).toBe(body.code === 0 ? 'UU_REA_DIAG|LOGIN|API_FORMAT|200|0' : 'UU_REA_DIAG|LOGIN|API_REJECTED|200|-');
    const output = controllerErrorText(error) + JSON.stringify(error) + record;
    expect(output).not.toContain(privateValue);
    expect(output).not.toContain('13800138000');
    expect(output).not.toContain('123456');
    expect(output).not.toContain('/api/');
    expect(controllerErrorText(error)).toContain('登录校验失败');
  }
  expect(controllerDiagnosticRecord(new ControllerError('API_REJECTED'))).toBeNull();
  expect(controllerDiagnosticRecord(new Error(privateValue))).toBeNull();
  expect(controllerDiagnosticRecord(new ControllerError(privateValue, { stage: 'JOIN', httpStatus: 999, businessCode: privateValue }))).toBe('UU_REA_DIAG|JOIN|NATIVE_FAILURE|-|-');
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
