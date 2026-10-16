/** Pure, fail-closed network boundary. No credentials or platform calls here. */
export const MAX_BRIDGE_JSON = 1048576;
export const MAX_HTTP_BODY_CHARS = 65536;
export const MAX_SOCKET_DATA_CHARS = 1048576;

export function validateEndpoint(raw: string, websocket: boolean): string {
  if (typeof raw !== 'string' || raw.length > 16384 || /[\s\\\u0000-\u001f\u007f]/.test(raw)) {
    throw new Error('ENDPOINT_BLOCKED');
  }
  const pattern = websocket ? /^wss:\/\/([a-zA-Z0-9.-]+)(?::([0-9]{1,5}))?(\/[^#]*)$/ :
    /^https:\/\/([a-zA-Z0-9.-]+)(?::([0-9]{1,5}))?(\/[^#]*)$/;
  const match = raw.match(pattern);
  if (match === null) {
    throw new Error('ENDPOINT_BLOCKED');
  }
  const hostname = match[1].toLowerCase();
  const port = match[2] === undefined ? 443 : Number(match[2]);
  const path = match[3].split('?')[0];
  const polling = !websocket && path === '/socket.io/';
  // The API keeps its fixed TLS port. Dynamic signaling may advertise a
  // different TLS port, but only at the exact Engine.IO polling route.
  if (port < 1 || port > 65535 || (port !== 443 && !polling)) {
    throw new Error('ENDPOINT_BLOCKED');
  }
  if (hostname !== 'api.nrd.nie.163.com' && !hostname.endsWith('.nrd.nie.163.com') &&
    !(polling && hostname === 'nrd.nie.163.com')) {
    throw new Error('HOST_BLOCKED');
  }
  if (!/^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?)*$/.test(hostname)) {
    throw new Error('HOST_BLOCKED');
  }
  // Reject encoded or literal path separators and dot segments before native URL normalization.
  if (path.includes('%') || /(?:^|\/)\.{1,2}(?:\/|$)/.test(path) || path.indexOf('//') >= 0) {
    throw new Error('PATH_BLOCKED');
  }
  if (!websocket && !/^\/api\/v1(?:\/|$)/.test(path) && !/^\/api\/v2\/room(?:\/|$)/.test(path) && path !== '/socket.io/') {
    throw new Error('PATH_BLOCKED');
  }
  return raw;
}

/** The only extra HTTPS route is Engine.IO's exact polling endpoint. */
export function isPollingEndpoint(endpoint: string): boolean {
  return endpoint.replace(/^https:\/\/[^/]+/, '').split('?')[0] === '/socket.io/';
}

export function validateHttpRequest(raw: string, method: string): string {
  const endpoint = validateEndpoint(raw, false);
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method)) {
    throw new Error('METHOD_BLOCKED');
  }
  if (isPollingEndpoint(endpoint) && method !== 'GET' && method !== 'POST') {
    throw new Error('METHOD_BLOCKED');
  }
  return endpoint;
}

/**
 * NetworkKit WSS follows redirects and can forward custom authentication
 * headers. Its API exposes no redirect limit, so this build cannot safely open
 * native WSS at all. Real signaling must use HTTPS polling with maxRedirects=0.
 * Blocking every open also covers credentials in query strings or later sends.
 */
export function validateWebSocketRequest(raw: string, _headers?: Record<string, string>): void {
  validateEndpoint(raw, true);
  throw new Error('WSS_AUTH_UNVERIFIED');
}

export function validateHeaders(input?: Record<string, string>): Record<string, string> {
  const output: Record<string, string> = {};
  if (input === undefined) {
    return output;
  }
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('HEADERS_INVALID');
  }
  const names = Object.keys(input);
  if (names.length > 32) {
    throw new Error('HEADERS_TOO_LARGE');
  }
  let total = 0;
  for (const name of names) {
    const value = input[name];
    if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,128}$/.test(name) || typeof value !== 'string' ||
      /[\u0000-\u001f\u007f]/.test(value)) {
      throw new Error('HEADERS_INVALID');
    }
    const lower = name.toLowerCase();
    if (lower === 'host' || lower === 'content-length' || lower === 'connection' || lower === 'upgrade' ||
      lower === 'proxy-authorization' || lower === 'proxy-connection' || lower.startsWith('sec-websocket-')) {
      throw new Error('HEADER_BLOCKED');
    }
    total += name.length + value.length;
    if (value.length > 8192 || total > 16384) {
      throw new Error('HEADERS_TOO_LARGE');
    }
    output[name] = value;
  }
  return output;
}

export function isLocalEntry(raw: string): boolean {
  return /^resource:\/\/rawfile\/index\.html(?:#.*)?$/i.test(raw);
}

export function isLocalResource(raw: string): boolean {
  return /^resource:\/\/rawfile\/[A-Za-z0-9_./%-]+(?:[?#][^\s]*)?$/i.test(raw) &&
    !raw.includes('..') && !/%(?:2e|2f|5c)/i.test(raw);
}
