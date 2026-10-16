import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ControllerError, NativeBridge, type BridgeHost } from '../src/nativeBridge';
import { UuClient } from '../src/uuClient';
import { controllerDiagnosticRecord, controllerErrorText } from '../src/errorText';
beforeEach(() => { vi.spyOn(console, 'info').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

it('maps confirmed invalid verification code only for a login refusal, retaining safe metadata', () => {
  const explanation = '短信验证码无效，请重新获取并使用最新收到的验证码';
  const login = new ControllerError('API_REJECTED', { stage: 'LOGIN', httpStatus: 400, businessCode: 1110 });
  expect(controllerErrorText(login)).toContain(explanation);
  expect(controllerErrorText(login)).toContain('阶段 LOGIN · HTTP 400 · 业务码 1110');
  expect(controllerDiagnosticRecord(login)).toBe('UU_REA_DIAG|LOGIN|API_REJECTED|400|1110');
  const join = new ControllerError('API_REJECTED', { stage: 'JOIN', httpStatus: 400, businessCode: 1110 });
  expect(controllerErrorText(join)).not.toContain(explanation);
  expect(controllerErrorText(join)).toContain('阶段 JOIN · HTTP 400 · 业务码 1110');
  expect(controllerErrorText(new ControllerError('API_FORMAT', { stage: 'LOGIN', businessCode: 1110 }))).not.toContain(explanation);
});

it('blocks HTTP entirely if native signing material is absent', async () => {
  const requests: Record<string, unknown>[] = [];
  const host: BridgeHost = { UUBridge: { invoke(id, payload) { requests.push(JSON.parse(payload)); host.__uuNativeResult?.(id, false, '{"code":"MATERIAL_MISSING"}'); } } };
  const api = new UuClient(new NativeBridge(host));
  await expect(api.sendMobileCode('86', '13800138000')).rejects.toMatchObject({ code: 'MATERIAL_MISSING', diagnostics: { stage: 'INIT' } });
  expect(requests.map(r => r.op)).toEqual(['hmac']);
});

function diagnosticClient(responseForPath: (url: string, request: Record<string, unknown>) => { status: number; body: unknown; headers?: Record<string, string> }): UuClient {
  const host: BridgeHost = { UUBridge: { invoke(id, payload) {
    const request = JSON.parse(payload);
    if (request.op === 'hmac') host.__uuNativeResult?.(id, true, JSON.stringify({ hex: 'a'.repeat(64) }));
    else {
      const result = request.url.endsWith('/device/android/init')
        ? { status: 200, body: { code: 0, data: { device_id: 'fixture-controller' } } }
        : responseForPath(request.url, request);
      host.__uuNativeResult?.(id, true, JSON.stringify({ ...result, body: JSON.stringify(result.body) }));
    }
  } } };
  return new UuClient(new NativeBridge(host));
}

it('clears only its successful JOIN when local signal endpoint validation fails', async () => {
  const calls: string[] = [];
  const api = diagnosticClient(url => {
    if (url.endsWith('/login/by_mobile')) return { status: 200, body: { code: 0, data: { user_id: 'fixture-user', token: 'fixture-token' } } };
    calls.push(url);
    return { status: 200, body: url.includes('/room/join/') ? { code: 0, data: { room_config: { token: 'fixture-room', signal_servers: ['https://outside.invalid/'] } } } : { code: 0 } };
  });
  await api.login('86', '13800138000', '123456');
  await expect(api.join('owned-mac')).rejects.toMatchObject({ code: 'SIGNAL_HOST_BLOCKED', diagnostics: { stage: 'JOIN', httpStatus: 200, businessCode: '0' } });
  expect(calls.map(url => new URL(url).pathname)).toEqual(['/api/v1/room/join/by_device/owned-mac', '/api/v1/room/clear/by_device/owned-mac']);
  expect(api.pendingRoomDeviceId).toBe('');
});

it('records only a canonical blocked signal origin without query or room token and still leaves the owned room', async () => {
  let leaves = 0;
  const api = diagnosticClient(url => {
    if (url.endsWith('/login/by_mobile')) return { status: 200, body: { code: 0, data: { user_id: 'fixture-user', token: 'fixture-token' } } };
    if (url.includes('/room/clear/')) { leaves++; return { status: 200, body: { code: 0 } }; }
    return { status: 200, body: { code: 0, data: { room_config: { token: 'fixture-private-room-token', signal_servers: ['wss://Signal.Unverified.Example:8443/?room_token=fixture-private-query'] } } } };
  });
  await api.login('86', '13800138000', '123456');
  await expect(api.join('owned-mac')).rejects.toMatchObject({ code: 'SIGNAL_HOST_BLOCKED' });
  expect(vi.mocked(console.info).mock.calls).toEqual([['UU_REA_SIGNAL_ORIGIN|https|signal.unverified.example|8443']]);
  expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain('fixture-private');
  expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain('?');
  expect(leaves).toBe(1);
  expect(api.pendingRoomDeviceId).toBe('');
});

it('never clears or takes ownership when JOIN is refused with business code 2002 or has no success acknowledgement', async () => {
  for (const response of [{ status: 400, body: { code: 2002 } }, { status: 200, body: {} }]) {
  const calls: string[] = [];
  const api = diagnosticClient(url => {
    if (url.endsWith('/login/by_mobile')) return { status: 200, body: { code: 0, data: { user_id: 'fixture-user', token: 'fixture-token' } } };
    calls.push(url);
    return response;
  });
  await api.login('86', '13800138000', '123456');
  await expect(api.join('other-room-mac')).rejects.toMatchObject({ code: response.status === 400 ? 'API_REJECTED' : 'API_FORMAT', diagnostics: { stage: 'JOIN' } });
  await api.leave('other-room-mac');
  expect(calls.map(url => new URL(url).pathname)).toEqual(['/api/v1/room/join/by_device/other-room-mac']);
  expect(api.pendingRoomDeviceId).toBe('');
  }
});

it('retains the original JOIN error and failed cleanup handle across clear, prevents another JOIN and permits cleanup after reauthentication', async () => {
  const calls: string[] = [];
  let leaves = 0;
  const api = diagnosticClient(url => {
    if (url.endsWith('/login/by_mobile')) return { status: 200, body: { code: 0, data: { user_id: 'fixture-user', token: 'fixture-token' } } };
    calls.push(url);
    if (url.includes('/room/clear/')) {
      leaves++;
      return leaves === 1 ? { status: 503, body: { code: 503 } } : leaves === 2 ? { status: 200, body: {} } : { status: 200, body: { code: 0 } };
    }
    return { status: 200, body: { code: 0, data: { room_config: { token: 'fixture-room', signal_servers: ['https://outside.invalid/'] } } } };
  });
  await api.login('86', '13800138000', '123456');
  await expect(api.join('owned-mac')).rejects.toMatchObject({ code: 'SIGNAL_HOST_BLOCKED', diagnostics: { stage: 'JOIN', httpStatus: 200, businessCode: '0' } });
  expect(api.pendingRoomDeviceId).toBe('owned-mac');
  const beforeBlockedJoin = calls.length;
  await expect(api.join('different-mac')).rejects.toMatchObject({ code: 'ROOM_CLEANUP_REQUIRED' });
  expect(calls).toHaveLength(beforeBlockedJoin);
  api.clear();
  expect(api.loggedIn).toBe(false);
  expect(api.pendingRoomDeviceId).toBe('owned-mac');
  await expect(api.leave('owned-mac')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  expect(api.pendingRoomDeviceId).toBe('owned-mac');
  await api.login('86', '13800138000', '123456');
  await expect(api.leave('owned-mac')).rejects.toMatchObject({ code: 'API_FORMAT', diagnostics: { stage: 'LEAVE', httpStatus: 200 } });
  expect(api.pendingRoomDeviceId).toBe('owned-mac');
  await api.leave('owned-mac');
  expect(api.pendingRoomDeviceId).toBe('');
  expect(leaves).toBe(3);
});

it('keeps normal joins non-forcing and sends force_join only for an explicit true argument without clearing a refused room', async () => {
  const joinBodies: unknown[] = [], paths: string[] = [];
  const api = diagnosticClient((url, request) => {
    if (url.endsWith('/login/by_mobile')) return { status: 200, body: { code: 0, data: { user_id: 'fixture-user', token: 'fixture-token' } } };
    paths.push(new URL(url).pathname);
    joinBodies.push(JSON.parse(request.body as string));
    return { status: 400, body: { code: 2002 } };
  });
  await api.login('86', '13800138000', '123456');
  await expect(api.join('owned-mac')).rejects.toMatchObject({ code: 'API_REJECTED' });
  await expect(api.join('owned-mac', true)).rejects.toMatchObject({ code: 'API_REJECTED' });
  expect(joinBodies).toEqual([{ force_join: false }, { force_join: true }]);
  expect(paths).toEqual(['/api/v1/room/join/by_device/owned-mac', '/api/v1/room/join/by_device/owned-mac']);
  expect(api.pendingRoomDeviceId).toBe('');
});

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
