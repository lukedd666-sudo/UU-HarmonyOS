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
  MATERIAL_INVALID: '协议材料须为 8 至 64 字节。',
  MOBILE_INVALID: '请输入有效的国家区号和本人手机号。',
  CODE_INVALID: '请输入有效的短信验证码。',
};
export class ControllerError extends Error {
  constructor(public readonly code: string) { super(messages[code] ?? messages.NATIVE_FAILURE); }
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
