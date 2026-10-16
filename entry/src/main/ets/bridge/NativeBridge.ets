import { webview } from '@kit.ArkWeb';
import { http, webSocket } from '@kit.NetworkKit';
import { util } from '@kit.ArkTS';
import {
  MAX_BRIDGE_JSON, MAX_HTTP_BODY_CHARS, MAX_SOCKET_DATA_CHARS, validateHttpRequest, validateHeaders,
  isPollingEndpoint, validateWebSocketRequest
} from './NetworkPolicy';
import { signProtocolMessage, importProtocolMaterial } from './SigningMaterial';

interface BridgeRequest {
  op: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  socketId?: string;
  data?: string;
  binary?: boolean;
  message?: string;
  material?: string;
}

interface HttpResult {
  status: number;
  body: string;
  headers: Record<string, string>;
}

interface BridgeFailure {
  code: string;
}

interface SocketMessage {
  data: string;
  binary: boolean;
}

interface SocketClose {
  code: number;
  reason: string;
}

interface SigningResult {
  hex: string;
}

interface MaterialImportResult {
  imported: boolean;
}

export class NativeBridge {
  private controller: webview.WebviewController;
  private trusted: boolean = false;
  private generation: number = 0;
  private requests: Map<string, http.HttpRequest> = new Map();
  private sockets: Map<string, webSocket.WebSocket> = new Map();
  private pending: Set<string> = new Set();
  private base64: util.Base64Helper = new util.Base64Helper();

  constructor(controller: webview.WebviewController) {
    this.controller = controller;
  }

  beginPage(trusted: boolean): void {
    this.dispose();
    this.trusted = trusted;
  }

  /** The sole JavaScript proxy method: accepts JSON data, never code or system API names. */
  invoke(id: string, payloadJson: string): void {
    if (!this.trusted || typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) {
      return;
    }
    if (this.pending.has(id)) {
      this.result(id, false, { code: 'REQUEST_ID_IN_USE' } as BridgeFailure);
      return;
    }
    if (typeof payloadJson !== 'string' || payloadJson.length > MAX_BRIDGE_JSON || this.pending.size >= 16) {
      this.result(id, false, { code: 'REQUEST_LIMIT' } as BridgeFailure);
      return;
    }
    let request: BridgeRequest;
    try {
      request = JSON.parse(payloadJson) as BridgeRequest;
      if (request === null || typeof request !== 'object' || typeof request.op !== 'string') {
        throw new Error('REQUEST_INVALID');
      }
    } catch (_) {
      this.result(id, false, { code: 'REQUEST_INVALID' } as BridgeFailure);
      return;
    }
    this.pending.add(id);
    const generation = this.generation;
    this.dispatch(id, request, generation).catch(() => {
      if (this.isCurrent(generation)) {
        this.result(id, false, { code: 'NATIVE_ERROR' } as BridgeFailure);
        this.pending.delete(id);
      }
    });
  }

  private async dispatch(id: string, request: BridgeRequest, generation: number): Promise<void> {
    try {
      let payload: Object = {} as Record<string, string>;
      switch (request.op) {
        case 'http':
          payload = await this.httpRequest(id, request);
          break;
        case 'ws.open':
          await this.openSocket(request, generation);
          break;
        case 'ws.send':
          await this.sendSocket(request);
          break;
        case 'ws.close':
          await this.closeSocket(request);
          break;
        case 'material.import':
          // The trusted page invokes this only from its explicit user import button.
          await importProtocolMaterial(request.material ?? '');
          payload = { imported: true } as MaterialImportResult;
          break;
        case 'hmac':
          payload = { hex: await signProtocolMessage(request.message ?? '') } as SigningResult;
          break;
        default:
          throw new Error('OPERATION_BLOCKED');
      }
      if (this.isCurrent(generation)) {
        this.result(id, true, payload);
      }
    } catch (error) {
      if (this.isCurrent(generation)) {
        const message = (error as Error).message;
        // Network errors can contain URLs or bodies. Only fixed local error codes cross the bridge.
        const code = typeof message === 'string' && /^[A-Z][A-Z_]{2,48}$/.test(message) ? message : 'NETWORK_ERROR';
        this.result(id, false, { code: code } as BridgeFailure);
      }
    } finally {
      request.material = '';
      if (this.isCurrent(generation)) {
        this.pending.delete(id);
      }
    }
  }

  private async httpRequest(id: string, request: BridgeRequest): Promise<HttpResult> {
    const method = request.method ?? 'GET';
    const endpoint = validateHttpRequest(request.url ?? '', method);
    const headers = validateHeaders(request.headers);
    if (request.body !== undefined && (typeof request.body !== 'string' || request.body.length > MAX_HTTP_BODY_CHARS)) {
      throw new Error('BODY_TOO_LARGE');
    }
    if ((method === 'GET' || method === 'HEAD') && request.body) {
      throw new Error('BODY_BLOCKED');
    }
    if (this.requests.size >= 8) {
      throw new Error('HTTP_LIMIT');
    }
    const client = http.createHttp();
    this.requests.set(id, client);
    try {
      const options: http.HttpRequestOptions = {
        method: method as http.RequestMethod,
        header: headers,
        expectDataType: http.HttpDataType.STRING,
        usingCache: false,
        connectTimeout: 15000,
        readTimeout: isPollingEndpoint(endpoint) ? 40000 : 30000,
        maxLimit: 2097152,
        // API 23+: reject redirects so authentication never follows an unchecked destination.
        maxRedirects: 0
      };
      if (request.body !== undefined && request.body.length > 0) {
        options.extraData = request.body;
      }
      const response = await client.request(endpoint, options);
      if (typeof response.result !== 'string' || response.result.length > 2097152) {
        throw new Error('RESPONSE_TOO_LARGE');
      }
      const responseHeaders: Record<string, string> = {};
      const source = response.header as Record<string, Object>;
      for (const name of Object.keys(source)) {
        // Cookie state is not persisted. It remains inside the trusted page's process if needed.
        const value = source[name];
        if (typeof value === 'string') {
          responseHeaders[name] = value;
        }
      }
      return { status: response.responseCode, body: response.result, headers: responseHeaders };
    } finally {
      if (this.requests.get(id) === client) {
        client.destroy();
        this.requests.delete(id);
      }
    }
  }

  private socketId(request: BridgeRequest): string {
    const socketId = request.socketId ?? '';
    if (typeof socketId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(socketId)) {
      throw new Error('SOCKET_ID_INVALID');
    }
    return socketId;
  }

  private async openSocket(request: BridgeRequest, _generation: number): Promise<void> {
    this.socketId(request);
    // Fail before creating a socket. The platform cannot guarantee safe WSS
    // redirects; this is an explicit unsupported state, never an OPEN result.
    validateWebSocketRequest(request.url ?? '', request.headers);
  }

  private async sendSocket(request: BridgeRequest): Promise<void> {
    const socket = this.sockets.get(this.socketId(request));
    if (socket === undefined) {
      throw new Error('SOCKET_NOT_OPEN');
    }
    if (typeof request.data !== 'string' || request.data.length > MAX_SOCKET_DATA_CHARS ||
      (request.binary !== undefined && typeof request.binary !== 'boolean')) {
      throw new Error('SOCKET_DATA_INVALID');
    }
    if (request.binary === true) {
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(request.data)) {
        throw new Error('SOCKET_BASE64_INVALID');
      }
      const bytes = this.base64.decodeSync(request.data);
      if (!await socket.send(bytes.buffer as ArrayBuffer)) {
        throw new Error('SOCKET_SEND_FAILED');
      }
    } else if (!await socket.send(request.data)) {
      throw new Error('SOCKET_SEND_FAILED');
    }
  }

  private async closeSocket(request: BridgeRequest): Promise<void> {
    const socketId = this.socketId(request);
    const socket = this.sockets.get(socketId);
    if (socket !== undefined) {
      this.releaseSocket(socketId, socket);
      this.socketEvent(socketId, 'close', { code: 1000, reason: '' } as SocketClose);
    }
  }

  private releaseSocket(socketId: string, socket: webSocket.WebSocket): void {
    if (this.sockets.get(socketId) === socket) {
      this.sockets.delete(socketId);
    }
    try { socket.off('open'); } catch (_) {}
    try { socket.off('message'); } catch (_) {}
    try { socket.off('close'); } catch (_) {}
    try { socket.off('error'); } catch (_) {}
    try {
      socket.close({ code: 1000, reason: 'controller closed' }).catch(() => {});
    } catch (_) {}
  }

  private isCurrent(generation: number): boolean {
    return this.trusted && this.generation === generation;
  }

  private json(value: Object | string): string {
    return JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  }

  private result(id: string, ok: boolean, payload: Object): void {
    if (this.trusted) {
      // Fixed callback only; all arguments are JSON encoded data.
      const script = `window.__uuNativeResult && window.__uuNativeResult(${this.json(id)},${ok},${this.json(JSON.stringify(payload))});`;
      this.controller.runJavaScript(script).catch(() => {});
    }
  }

  private socketEvent(socketId: string, event: string, payload: Object): void {
    if (this.trusted) {
      const script = `window.__uuSocketEvent && window.__uuSocketEvent(${this.json(socketId)},${this.json(event)},${this.json(JSON.stringify(payload))});`;
      this.controller.runJavaScript(script).catch(() => {});
    }
  }

  dispose(): void {
    this.trusted = false;
    this.generation += 1;
    this.requests.forEach((client: http.HttpRequest) => {
      try { client.destroy(); } catch (_) {}
    });
    this.requests.clear();
    this.sockets.forEach((socket: webSocket.WebSocket, id: string) => this.releaseSocket(id, socket));
    this.sockets.clear();
    this.pending.clear();
  }
}
