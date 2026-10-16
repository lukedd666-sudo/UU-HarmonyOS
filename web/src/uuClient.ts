// API fields and signing canonicalization adapted from MIT upstream; see THIRD_PARTY_NOTICES.md.
import { asRecord, ControllerError, type NativeBridge } from './nativeBridge';
import { apiUrl, signalPollingOrigin } from './security';
import { buildAndroidDeviceInitRequest, buildMobileCodeRequest, buildMobileLoginRequest, normalizeDeviceInitResult, normalizeMobileLoginResult } from './upstream/loginFlow';
import { normalizeStreamerRoomConfig } from './upstream/roomConfig';
import type { LoginState, StreamerRoomConfig } from './upstream/types';

export interface OwnedDevice { deviceId: string; name: string; mac: boolean; controllable: boolean; platform?: number }
function randomId(): string { return globalThis.crypto?.randomUUID?.() ?? `uu-rea-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }

export class UuClient {
  private state: LoginState = {};
  constructor(private readonly bridge: NativeBridge) {}
  get loggedIn(): boolean { return Boolean(this.state.token && this.state.userId && this.state.deviceId); }
  get controllerDeviceId(): string { return this.state.deviceId ?? ''; }
  clear(): void { this.state = {}; }

  async initialize(): Promise<void> {
    if (this.state.deviceId) return;
    this.state.clientId ||= `uu-rea-${randomId()}`;
    this.state.uuid ||= randomId();
    const request = buildAndroidDeviceInitRequest({
      name: 'UU-REA HarmonyOS Controller', client_id: this.state.clientId,
      system_id: this.state.clientId, system_version: 'HarmonyOS', gaid: '',
      install_id: this.state.uuid, build_fingerprint: '', brand: 'Huawei',
      manufacturer: 'Huawei', model: 'HarmonyOS PC', product: 'UU-REA',
      rom: 'HarmonyOS', abi: 'arm64-v8a', resolution: '1920x1080', screen_size: '1920x1080', dpi: 160,
    });
    const result = await this.request(request.method, request.path, request.body, false);
    try { this.state.deviceId = normalizeDeviceInitResult(result); }
    catch { throw new ControllerError('API_FORMAT'); }
  }
  async sendMobileCode(region: string, mobile: string): Promise<void> {
    await this.initialize();
    const request = buildMobileCodeRequest({ regionCode: region, mobile });
    await this.request(request.method, request.path, request.body, false);
  }
  async login(region: string, mobile: string, code: string): Promise<void> {
    await this.initialize();
    const request = buildMobileLoginRequest({ regionCode: region, mobile, code });
    const result = await this.request(request.method, request.path, request.body, false);
    try {
      const login = normalizeMobileLoginResult(result);
      this.state = { ...this.state, token: login.token, userId: login.userId };
    } catch { throw new ControllerError('API_FORMAT'); }
  }
  async devices(): Promise<OwnedDevice[]> {
    const body = asRecord(await this.request('GET', '/api/v1/device/groups/of/my'));
    const data = asRecord(body.data ?? body);
    if (!Array.isArray(data.desktop_devices)) throw new ControllerError('API_FORMAT');
    return data.desktop_devices.map(value => {
      const item = asRecord(value);
      const deviceId = text(item.device_id) || text(item.deviceId) || text(item.id);
      const platform = Number(item.platform);
      return { deviceId, name: text(item.alias) || text(item.device_name) || text(item.deviceName) || text(item.name) || deviceId, mac: platform === 4, platform, controllable: [true, 1, '1', 'true'].includes(item.controllable as never) };
    }).filter(item => item.deviceId.length > 0);
  }
  async join(deviceId: string): Promise<StreamerRoomConfig> {
    const result = await this.request('POST', `/api/v1/room/join/by_device/${encodeURIComponent(deviceId)}`, { force_join: false });
    const config = normalizeStreamerRoomConfig(result);
    if (!config) throw new ControllerError('API_FORMAT');
    config.signalServers = config.signalServers.map(signalPollingOrigin);
    return config;
  }
  async leave(deviceId: string): Promise<void> {
    await this.request('POST', `/api/v1/room/clear/by_device/${encodeURIComponent(deviceId)}`);
  }
  private async request(method: string, path: string, body?: unknown, requireAuth = true): Promise<unknown> {
    const url = apiUrl(path);
    if (requireAuth && !this.loggedIn) throw new ControllerError('AUTH_REQUIRED');
    const headers: Record<string, string> = {
      'X-Param-CHN': 'nochannel', 'X-Param-OPR': '', 'X-Param-PKGN': 'com.netease.uuremote',
      'X-Param-PLAT': '2', 'X-Param-REL': 'prod', 'X-Param-VC': '423000', 'X-Param-VN': '4.23.0',
      'X-Param-ABI': 'arm64-v8a', 'X-Param-client-id': this.state.clientId ?? '',
      'X-Param-device-id': this.state.deviceId ?? '', 'X-Param-user-id': this.state.userId ?? '',
      'X-Param-OAID': '', 'X-Param-TS': String(Math.floor(Date.now() / 1000)), 'X-Param-CNT': 'CN', 'X-Param-LANG': 'zh-CN',
    };
    const bodyText = body === undefined ? '' : JSON.stringify(body);
    const canonical = Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value] as const)
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('&');
    const signature = await this.bridge.request<{ hex: string }>({ op: 'hmac', message: `${method.toUpperCase()}${path}${canonical}${bodyText}` });
    if (!/^[0-9a-f]{64}$/i.test(signature.hex)) throw new ControllerError('SIGNATURE_INVALID');
    headers['X-Param-SIGN'] = signature.hex;
    if (this.state.token) headers.Authorization = `Bearer ${this.state.token}`;
    if (bodyText) headers['Content-Type'] = 'application/json; charset=utf-8';
    const response = await this.bridge.request<{ status: number; body: string }>({ op: 'http', url, method, headers, ...(bodyText ? { body: bodyText } : {}) });
    if (response.status < 200 || response.status >= 300) throw new ControllerError('API_REJECTED');
    let result: unknown;
    try { result = JSON.parse(response.body); } catch { throw new ControllerError('API_FORMAT'); }
    const code = asRecord(result).code;
    if (code !== undefined && code !== 0 && code !== 200) throw new ControllerError('API_REJECTED');
    return result;
  }
}
