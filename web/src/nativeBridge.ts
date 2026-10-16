export interface BridgeHost {
  UUBridge?: { invoke(id: string, payload: string): void };
  __uuNativeResult?: (id: string, ok: boolean, payload: string) => void;
  __uuSocketEvent?: (id: string, event: string, payload: string) => void;
}
const messages: Record<string, string> = {
  BRIDGE_MISSING: '缺少鸿蒙原生桥；请在鸿蒙应用内打开。',
  MATERIAL_MISSING: '协议签名材料尚未配置，认证请求已阻止。',
  NATIVE_TIMEOUT: '原生请求超时，请重试。',
  NATIVE_REJECTED: '原生请求被拒绝。',
  NATIVE_FAILURE: '原生请求失败。',
  BAD_NATIVE_RESULT: '原生返回格式无法识别。',
  DOMAIN_BLOCKED: '请求地址不在允许的 UU 域名内。',
  SIGNAL_ADDRESS_INVALID: 'UU 返回的信令地址格式无效。',
  SIGNAL_SCHEME_BLOCKED: '信令地址协议不受支持，仅允许加密连接。',
  SIGNAL_HOST_BLOCKED: '信令地址主机不在允许的 UU NRD 域名内。',
  SIGNAL_PORT_INVALID: '信令地址端口无效。',
  SIGNAL_PATH_BLOCKED: '信令地址路径不符合允许的 Socket.IO 路径。',
  SOCKET_CLOSED: '信令连接已关闭。',
  SIGNATURE_INVALID: '原生签名结果无效。',
  AUTH_REQUIRED: '请先使用本人账号登录。',
  API_REJECTED: 'UU 服务拒绝了请求，请检查账号或稍后重试。',
  API_FORMAT: 'UU 返回的数据不符合当前协议。',
  INPUT_NOT_READY: '控制通道尚未就绪。',
  SIGNAL_FAILED: '信令协商失败，请断开后重试。',
  WEBRTC_UNSUPPORTED: '当前 ArkWeb 未提供标准 H.264 WebRTC 能力。',
  IMPORT_FAILED: '协议材料保存失败。',
  MATERIAL_IMPORT_UNSUPPORTED: '当前设备不支持协议材料导入。',
  MATERIAL_IMPORT_FAILED: '协议材料保存失败。',
  MATERIAL_REPLACE_FAILED: '替换失败，原材料可能已移除，请重新保存。',
  MATERIAL_SELF_TEST_UNAVAILABLE: 'WebCrypto 不可用，无法完成离线签名自检，材料未保存。',
  MATERIAL_SELF_TEST_MISMATCH: '离线签名自检不匹配，请检查材料并重新保存。',
  MATERIAL_INVALID: '协议材料须为 8 至 64 字节。',
  MOBILE_INVALID: '请输入有效的国家区号和本人手机号。',
  CODE_INVALID: '请输入有效的短信验证码。',
  ROOM_CLEANUP_REQUIRED: '上一次已加入的房间尚未清理，请先点击断开重试。',
};
export type ApiStage = 'INIT' | 'SMS' | 'LOGIN' | 'DEVICES' | 'JOIN' | 'LEAVE';
export interface ErrorDiagnostics { stage?: ApiStage; httpStatus?: number; businessCode?: string }
export interface ErrorDiagnosticsInput { stage?: ApiStage; httpStatus?: unknown; businessCode?: unknown }
export class ControllerError extends Error {
  readonly code: string;
  readonly diagnostics: Readonly<ErrorDiagnostics>;
  constructor(code: string, input: ErrorDiagnosticsInput = {}) {
    const safeCode = Object.prototype.hasOwnProperty.call(messages, code) ? code : 'NATIVE_FAILURE';
    super(messages[safeCode]);
    this.code = safeCode;
    const stage = ['INIT', 'SMS', 'LOGIN', 'DEVICES', 'JOIN', 'LEAVE'].includes(input.stage ?? '') ? input.stage : undefined;
    const httpStatus = typeof input.httpStatus === 'number' && Number.isInteger(input.httpStatus) && input.httpStatus >= 100 && input.httpStatus <= 599 ? input.httpStatus : undefined;
    const value = typeof input.businessCode === 'number' && Number.isInteger(input.businessCode) ? String(input.businessCode) : input.businessCode;
    const businessCode = typeof value === 'string' && /^\d{1,6}$/.test(value) ? value : undefined;
    this.diagnostics = Object.freeze({ ...(stage ? { stage } : {}), ...(httpStatus === undefined ? {} : { httpStatus }), ...(businessCode === undefined ? {} : { businessCode }) });
  }
}
type SocketListener = (event: string, payload: Record<string, unknown>) => void;

export class NativeBridge {
  private next = 0;
  private pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  private sockets = new Map<string, SocketListener>();
  constructor(private readonly host: BridgeHost, private readonly timeout = 15000) {
    host.__uuNativeResult = (id, ok, payload) => {
      const item = this.pending.get(id);
      if (!item) return;
      this.pending.delete(id);
      clearTimeout(item.timer);
      try {
        const result: unknown = JSON.parse(payload);
        if (ok) item.resolve(result);
        else {
          const code = asRecord(result).code;
          item.reject(new ControllerError(typeof code === 'string' && code in messages ? code : 'NATIVE_REJECTED'));
        }
      } catch { item.reject(new ControllerError('BAD_NATIVE_RESULT')); }
    };
    host.__uuSocketEvent = (id, event, payload) => {
      try { this.sockets.get(id)?.(event, asRecord(JSON.parse(payload))); }
      catch { this.sockets.get(id)?.('error', {}); }
    };
  }
  get available(): boolean { return typeof this.host.UUBridge?.invoke === 'function'; }
  request<T = unknown>(payload: Record<string, unknown>, options?: { longPoll: boolean }): Promise<T> {
    if (!this.available) return Promise.reject(new ControllerError('BRIDGE_MISSING'));
    const id = `req-${++this.next}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ControllerError('NATIVE_TIMEOUT'));
      }, options?.longPoll && payload.op === 'http' && payload.method === 'GET' ? 45000 : this.timeout);
      this.pending.set(id, { resolve: value => resolve(value as T), reject, timer });
      try { this.host.UUBridge!.invoke(id, JSON.stringify(payload)); }
      catch {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new ControllerError('NATIVE_FAILURE'));
      }
    });
  }
  listenSocket(id: string, listener: SocketListener): () => void {
    this.sockets.set(id, listener);
    return () => this.sockets.delete(id);
  }
}
export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
