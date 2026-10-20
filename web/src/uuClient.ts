// API fields and signing canonicalization adapted from MIT upstream; see THIRD_PARTY_NOTICES.md.
import { asRecord, ControllerError, type ApiStage, type ErrorDiagnosticsInput, type NativeBridge } from './nativeBridge';
import { apiUrl, normalizeSignalEndpoint, signalOriginDiagnosticRecord } from './security';
import { buildDesktopDeviceInitRequest, buildMobileCodeRequest, buildMobileLoginRequest, normalizeDeviceInitResult, normalizeMobileLoginResult } from './upstream/loginFlow';
import { normalizeStreamerRoomConfig } from './upstream/roomConfig';
import type { LoginState, StreamerRoomConfig } from './upstream/types';

export interface OwnedDevice { deviceId: string; name: string; mac: boolean; controllable: boolean; platform?: number }
export interface DesktopDeviceFacts { systemVersion: string; cpu: string; memory: string; model: string; resolution: string; dpi: number }
const DESKTOP_REGISTRATION = 'harmony-desktop-v1';
export function canConnectDesktop(device: OwnedDevice | undefined): device is OwnedDevice & { platform: 1 | 4 } {
  return Boolean(device?.controllable && (device.platform === 1 || device.platform === 4));
}
function randomId(): string { return globalThis.crypto?.randomUUID?.() ?? `uu-rea-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }

export class UuClient {
  private state: LoginState = {};
  private pendingRoom = '';
  private serverRoomCleared = false;
  private routeActive = false;
  private storageWarning = '';
  constructor(private readonly bridge: NativeBridge) {}
  get loggedIn(): boolean { return Boolean(this.state.token && this.state.userId && this.state.deviceId && this.state.registration === DESKTOP_REGISTRATION); }
  get hasAccountState(): boolean { return Boolean(this.state.token || this.state.userId); }
  get controllerDeviceId(): string { return this.state.deviceId ?? ''; }
  get pendingRoomDeviceId(): string { return this.pendingRoom; }
  get persistenceWarning(): string { return this.storageWarning; }
  // Page disposal clears memory only; keep the cleanup handle for reauthentication.
  clear(): void { this.state = {}; }

  async restore(): Promise<boolean> {
    let result: { session: unknown };
    try {
      result = await this.bridge.request({ op: 'session.load' });
      if (result?.session === null) return false;
      const saved = asRecord(result?.session);
      const fields = ['token', 'userId', 'clientId', 'deviceId', 'uuid'] as const;
      const desktop = saved.registration === DESKTOP_REGISTRATION;
      if (Object.keys(saved).length !== fields.length + (desktop ? 1 : 0) || fields.some(key => typeof saved[key] !== 'string' || !saved[key] || /[\x00-\x20\x7f]/.test(saved[key] as string))) throw new Error();
      if (JSON.stringify(saved).length > 1024) throw new Error();
      this.state = { ...Object.fromEntries(fields.map(key => [key, saved[key]])), ...(desktop ? { registration: DESKTOP_REGISTRATION } : {}) };
      this.storageWarning = '';
    } catch { this.storageWarning = 'SESSION_LOAD_FAILED'; throw new ControllerError('SESSION_LOAD_FAILED'); }
    // A legacy Android device ID must never bypass desktop registration.
    // Network errors here are INIT failures, not secure-storage read failures.
    await this.initialize();
    return true;
  }

  async logout(): Promise<void> {
    this.clear();
    try {
      await this.bridge.request({ op: 'session.clear' });
      this.storageWarning = '';
    } catch {
      this.storageWarning = 'SESSION_CLEAR_FAILED';
      throw new ControllerError('SESSION_CLEAR_FAILED');
    }
  }

  async initialize(): Promise<void> {
    if (this.state.deviceId && this.state.registration === DESKTOP_REGISTRATION) return;
    this.state.uuid ||= randomId();
    // A stable new namespace avoids reusing the Android server's idempotency identity.
    // Failed migration does not write or erase the previous secure session.
    this.state.clientId = `uu-rea-desktop-${this.state.uuid}`;
    this.state.deviceId = undefined;
    try {
      const facts = await this.bridge.request<DesktopDeviceFacts>({ op: 'device.profile' });
      if (!facts || ['systemVersion', 'cpu', 'memory', 'model', 'resolution'].some(key => typeof facts[key as keyof DesktopDeviceFacts] !== 'string') || !Number.isSafeInteger(facts.dpi) || facts.dpi < 0) throw new ControllerError('API_FORMAT');
      const request = buildDesktopDeviceInitRequest({
        name: 'UU-REA HarmonyOS Computer', client_id: this.state.clientId,
        system_id: this.state.uuid, system_version: facts.systemVersion, cpu: facts.cpu,
        memory: facts.memory, model_identifier: '', model: facts.model, model_number: '',
        system_name: 'HarmonyOS', os: 'HarmonyOS', mac: '', resolution: facts.resolution,
        video: [], dpi: facts.dpi, controllable: false,
      });
      const result = await this.request('INIT', request.method, request.path, request.body, false);
      try { this.state.deviceId = normalizeDeviceInitResult(result.body); }
      catch { throw new ControllerError('API_FORMAT', result.diagnostics); }
      this.state.registration = DESKTOP_REGISTRATION;
      if (this.state.token && this.state.userId) await this.saveSession(false);
    } catch (error) {
      throw new ControllerError(error instanceof ControllerError ? error.code : 'NATIVE_FAILURE', { ...(error instanceof ControllerError ? error.diagnostics : {}), stage: 'INIT' });
    }
  }
  async sendMobileCode(region: string, mobile: string): Promise<void> {
    await this.initialize();
    const request = buildMobileCodeRequest({ regionCode: region, mobile });
    await this.request('SMS', request.method, request.path, request.body, false);
  }
  async login(region: string, mobile: string, code: string): Promise<void> {
    if (this.pendingRoom && this.loggedIn) throw new ControllerError('ROOM_CLEANUP_REQUIRED', { stage: 'LOGIN' });
    await this.initialize();
    const request = buildMobileLoginRequest({ regionCode: region, mobile, code });
    const result = await this.request('LOGIN', request.method, request.path, request.body, false);
    try {
      const login = normalizeMobileLoginResult(result.body);
      this.state = { ...this.state, token: login.token, userId: login.userId };
    } catch { throw new ControllerError('API_FORMAT', result.diagnostics); }
    await this.saveSession(true);
  }
  private async saveSession(clearOnFailure: boolean): Promise<void> {
    try {
      const { token, userId, clientId, deviceId, uuid, registration } = this.state;
      await this.bridge.request({ op: 'session.save', data: JSON.stringify({ token, userId, clientId, deviceId, uuid, registration }) });
      this.storageWarning = '';
    } catch {
      if (!clearOnFailure) { this.storageWarning = 'SESSION_SAVE_FAILED'; return; }
      try {
        await this.bridge.request({ op: 'session.clear' });
        this.storageWarning = 'SESSION_SAVE_FAILED';
      } catch { this.storageWarning = 'SESSION_REPLACE_FAILED'; }
    }
  }
  async devices(): Promise<OwnedDevice[]> {
    const result = await this.request('DEVICES', 'GET', '/api/v1/device/groups/of/my');
    try {
      const body = asRecord(result.body);
      const data = asRecord(body.data ?? body);
      if (!Array.isArray(data.desktop_devices)) throw new ControllerError('API_FORMAT');
      return data.desktop_devices.map(value => {
        const item = asRecord(value);
        const deviceId = text(item.device_id) || text(item.deviceId) || text(item.id);
        const platform = Number(item.platform);
        return { deviceId, name: text(item.alias) || text(item.device_name) || text(item.deviceName) || text(item.name) || deviceId, mac: platform === 4, platform, controllable: [true, 1, '1', 'true'].includes(item.controllable as never) };
      }).filter(item => item.deviceId.length > 0);
    } catch { throw new ControllerError('API_FORMAT', result.diagnostics); }
  }
  async join(deviceId: string, forceJoin = false): Promise<StreamerRoomConfig> {
    if (this.pendingRoom || this.routeActive) throw new ControllerError('ROOM_CLEANUP_REQUIRED', { stage: 'JOIN' });
    const result = await this.request('JOIN', 'POST', `/api/v1/room/join/by_device/${encodeURIComponent(deviceId)}`, { force_join: forceJoin === true });
    const acknowledgement = asRecord(result.body).code;
    if (acknowledgement !== 0 && acknowledgement !== 200) throw new ControllerError('API_FORMAT', result.diagnostics);
    // Ownership starts only after the JOIN API has accepted this request, before local validation.
    this.pendingRoom = deviceId;
    this.serverRoomCleared = false;
    try {
      const config = normalizeStreamerRoomConfig(result.body);
      if (!config) throw new ControllerError('API_FORMAT');
      const endpoints = config.signalServers.map(value => {
        try { return normalizeSignalEndpoint(value); }
        catch (error) {
          if (error instanceof ControllerError && error.code === 'SIGNAL_HOST_BLOCKED') {
            const record = signalOriginDiagnosticRecord(value);
            if (record !== null) console.info(record);
          }
          throw error;
        }
      });
      const first = endpoints[0];
      if (!first) throw new ControllerError('API_FORMAT');
      // A rejected bridge response may still follow a partial native binding.
      this.routeActive = true;
      await this.setSignalRoute(first.address ?? '', 'JOIN');
      config.signalServers = endpoints.map(endpoint => endpoint.origin);
      return config;
    } catch (error) {
      try { await this.leave(deviceId); } catch { /* Preserve the original JOIN error; pendingRoom keeps cleanup retryable. */ }
      throw new ControllerError(error instanceof ControllerError ? error.code : 'API_FORMAT', result.diagnostics);
    }
  }
  async leave(deviceId: string): Promise<void> {
    // Never clear a room this instance did not successfully join, including refused JOINs.
    if (this.pendingRoom !== deviceId || !deviceId) return;
    this.routeActive = true;
    let routeError: unknown;
    try { await this.setSignalRoute('', 'LEAVE'); this.routeActive = false; }
    catch (error) { routeError = error; }
    // A failed local DNS removal must not keep an accepted UU room occupied.
    if (!this.serverRoomCleared) {
      const result = await this.request('LEAVE', 'POST', `/api/v1/room/clear/by_device/${encodeURIComponent(deviceId)}`);
      const acknowledgement = asRecord(result.body).code;
      if (acknowledgement !== 0 && acknowledgement !== 200) throw new ControllerError('API_FORMAT', result.diagnostics);
      this.serverRoomCleared = true;
    }
    if (routeError) throw routeError;
    this.pendingRoom = '';
    this.serverRoomCleared = false;
  }
  private async setSignalRoute(address: string, stage: 'JOIN' | 'LEAVE'): Promise<void> {
    try {
      const result = await this.bridge.request<{ bound: boolean }>({ op: 'signal.route', address });
      if (result?.bound !== Boolean(address)) throw new ControllerError('SIGNAL_ROUTE_FAILED');
    } catch { throw new ControllerError('SIGNAL_ROUTE_FAILED', { stage }); }
  }
  private async request(stage: ApiStage, method: string, path: string, body?: unknown, requireAuth = true): Promise<{ body: unknown; diagnostics: ErrorDiagnosticsInput }> {
    const diagnostics: ErrorDiagnosticsInput = { stage };
    try {
    const url = apiUrl(path);
    if (requireAuth && !this.loggedIn) throw new ControllerError('AUTH_REQUIRED');
    const headers: Record<string, string> = {
      'X-Param-CHN': 'nochannel', 'X-Param-OPR': '', 'X-Param-PKGN': 'com.netease.uuremote',
      'X-Param-PLAT': '4', 'X-Param-REL': 'prod', 'X-Param-VC': '423000', 'X-Param-VN': '4.23.0',
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
    diagnostics.httpStatus = response.status;
    let result: unknown;
    try { result = JSON.parse(response.body); }
    catch { throw new ControllerError(response.status < 200 || response.status >= 300 ? 'API_REJECTED' : 'API_FORMAT'); }
    const code = asRecord(result).code;
    diagnostics.businessCode = code;
    if (this.state.token && (code === 1120 || code === '1120')) {
      try { await this.logout(); }
      catch { throw new ControllerError('AUTH_EXPIRED_CLEAR_FAILED'); }
      throw new ControllerError('AUTH_EXPIRED');
    }
    if (response.status < 200 || response.status >= 300) throw new ControllerError('API_REJECTED');
    if (code !== undefined && code !== 0 && code !== 200) throw new ControllerError('API_REJECTED');
    return { body: result, diagnostics: new ControllerError('API_FORMAT', diagnostics).diagnostics };
    } catch (error) { throw new ControllerError(error instanceof ControllerError ? error.code : 'NATIVE_FAILURE', diagnostics); }
  }
}
