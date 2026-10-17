/** Pure, fail-closed network boundary. No credentials or platform calls here. */
export const MAX_BRIDGE_JSON = 1048576;
export const MAX_HTTP_BODY_CHARS = 65536;
export const MAX_SOCKET_DATA_CHARS = 1048576;
export const SIGNAL_ROUTE_HOST = 'nrd.nie.163.com';

/** Accept one canonical globally routable IPv4, or an explicit empty clear. */
export function validateSignalAddress(raw?: string): string {
  if (raw === '') return '';
  if (typeof raw !== 'string' || !/^(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){3}$/.test(raw)) {
    throw new Error('SIGNAL_ADDRESS_INVALID');
  }
  const octets = raw.split('.').map((part: string) => Number(part));
  const first = octets[0];
  const second = octets[1];
  const third = octets[2];
  if (octets.some((value: number) => value > 255) || first === 0 || first === 10 || first === 127 || first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) || (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && ((second === 0 && (third === 0 || third === 2)) || second === 168 || (second === 88 && third === 99))) ||
    (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100))) ||
    (first === 203 && second === 0 && third === 113)) {
    throw new Error('SIGNAL_ADDRESS_INVALID');
  }
  return raw;
}


/** Keep device logs limited to fixed errors or canonical public server metadata. */
export function isSafeDiagnosticRecord(record: string): boolean {
  if (typeof record !== 'string' || record.length > 300) return false;
  if (/^UU_REA_ICE_STATS(?:\|[0-9]{1,12}){12}$/.test(record)) return true;
  if (/^UU_REA_ICE_RELAY_CHECKS(?:\|[0-9]{1,12}){6}$/.test(record)) return true;
  if (/^UU_REA_ICE_SELECTED\|(HOST|SRFLX|PRFLX|RELAY|OTHER)\|(UDP|TCP|TLS|OTHER)\|(HOST|SRFLX|PRFLX|RELAY|OTHER)\|(UDP|TCP|OTHER)$/.test(record)) return true;
  if (/^UU_REA_SIGNAL_EVENT\|(SWITCH_NETWORK|DEVICE_CAPABILITY|STREAMER_PUSH|FORWARD_SETTING|PUBLISHER_DISCONNECT|LEAVE|LEFT)$/.test(record)) return true;
  if (/^UU_REA_ICE_CONFIG\|[0-9]{1,3}\|(ALL|RELAY)$/.test(record)) return true;
  if (/^UU_REA_ICE_STATE\|(NEW|CHECKING|CONNECTED|COMPLETED|DISCONNECTED|FAILED|CLOSED)$/.test(record)) return true;
  if (/^UU_REA_ICE_ERROR\|[0-9]{1,3}$/.test(record)) return true;
  if (/^UU_REA_ICE_FAILURE\|(DOMAIN_TLS|IP_TLS|UDP_RELAY|TCP_RELAY|STUN)\|(DNS|TLS|TIMEOUT|OTHER)$/.test(record)) return true;
  if (/^UU_REA_ICE_CANDIDATE\|(LOCAL|REMOTE)\|(HOST|SRFLX|PRFLX|RELAY|OTHER)\|(UDP|TCP|OTHER)$/.test(record)) return true;
  if (/^UU_REA_MEDIA\|[0-9]{1,12}\|[0-9]{1,12}\|[0-9]{1,12}\|[0-9]{1,5}\|[0-9]{1,5}\|[0-4]$/.test(record)) return true;
  if (/^UU_REA_SIGNAL_END\|(PING_TIMEOUT|TRANSPORT_ERROR|TRANSPORT_CLOSE|SERVER_DISCONNECT|CLIENT_DISCONNECT|PARSE_ERROR|OTHER)$/.test(record)) return true;
  if (/^UU_REA_RTC\|KEY_REFRESH_(OK|REJECTED|FAILED)$/.test(record)) return true;
  if (/^UU_REA_POLL\|(GET|POST)\|[1-5][0-9]{2}\|[0-9]{1,8}$/.test(record)) return true;
  if (record === 'UU_REA_PING_RX') return true;
  if (/^UU_REA_PONG_POST\|[1-9][0-9]{0,11}\|(BEGIN|OK|FAIL)\|[1-9][0-9]{0,11}$/.test(record) && !/[\r\n]/.test(record)) return true;
  if (/^UU_REA_SOAC_POST\|[1-9][0-9]{0,11}\|(BEGIN|OK|FAIL)\|(?:0|[1-9][0-9]{0,11})\|(?:0|[1-9][0-9]{0,11})\|(MATCH|MISMATCH|MISSING)\|(PENDING|OK|OTHER|NONE)$/.test(record)) {
    const fields = record.split('|');
    return Number(fields[3]) + Number(fields[4]) > 0 &&
      ((fields[2] === 'BEGIN' && fields[6] === 'PENDING') ||
        (fields[2] === 'OK' && ['OK', 'OTHER', 'NONE'].includes(fields[6])) ||
        (fields[2] === 'FAIL' && fields[6] === 'NONE'));
  }
  if (/^UU_REA_HTTP_ERROR\|(GET|POST)\|(?:-?[0-9]{1,9}|-)\|[0-9]{1,8}$/.test(record)) return true;
  if (/^UU_REA_CONTROL_RESULT\|-?[0-9]{1,5}$/.test(record)) return true;
  if (/^UU_REA_RTC\|(SIGNAL_CONNECTED|CONTROL_OK|CONTROL_REJECTED|CONTROL_IDS_MISSING|OFFER_SENT|LOCAL_CANDIDATE|SOAC_ANSWER|SOAC_CANDIDATE|SOAC_OTHER|SOAC_ACK_OK|SOAC_ACK_REJECTED|PUSH_RECEIVED|SIGNAL_OTHER|NO_PEER|SCOPE_MISMATCH|ANSWER_EMPTY|ANSWER_APPLIED|APPLY_FAILED|ICE_CONNECTED|ICE_FAILED|VIDEO_TRACK|FIRST_FRAME|INPUT_SENT|INPUT_MOVE_SENT|INPUT_BUTTON_SENT|INPUT_KEY_SENT|CONTROL_DATA_RECEIVED|NATIVE_KEY_EVENT|INPUT_KEY_PRESS_SENT|INPUT_KEY_RELEASE_SENT)$/.test(record)) return true;
  if (record.length <= 120 && /^UU_REA_DIAG\|(INIT|SMS|LOGIN|DEVICES|JOIN|LEAVE)\|[A-Z_]{3,40}\|(?:[1-5][0-9]{2}|-)\|(?:[0-9]{1,6}|-)$/.test(record)) return true;
  const parts = record.split('|');
  if (parts.length !== 4 || !((parts[0] === 'UU_REA_SIGNAL_ORIGIN' && parts[1] === 'https') || (parts[0] === 'UU_REA_ICE_ORIGIN' && ['STUN', 'TURN', 'TURNS'].includes(parts[1])))) return false;
  const host = parts[2];
  const dnsHost = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.?$/;
  if (host.length > 253 || !(dnsHost.test(host) || /^\[[0-9a-f:]+\]$/.test(host))) return false;
  return /^[1-9][0-9]{0,4}$/.test(parts[3]) && Number(parts[3]) <= 65535;
}

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
