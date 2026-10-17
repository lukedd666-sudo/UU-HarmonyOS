import { ControllerError } from './nativeBridge';
/** Public server metadata only. Never include URL paths, queries or userinfo. */
export function signalOriginDiagnosticRecord(value: string): string | null {
  if (typeof value !== 'string' || !value || value.length > 16384 || /[\s\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value.includes('://') ? value : `wss://${value}`);
    const host = url.hostname;
    const port = url.port ? Number(url.port) : 443;
    const dnsHost = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.?$/;
    if (!['https:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash || host.length > 253 ||
      !(dnsHost.test(host) || /^\[[0-9a-f:]+\]$/.test(host)) || port < 1 || port > 65535) return null;
    return `UU_REA_SIGNAL_ORIGIN|https|${host}|${port}`;
  } catch { return null; }
}
export function pollingUrl(value: string): string {
  const url = new URL(value);
  const origin = signalPollingOrigin(value);
  if (url.protocol !== 'https:' || url.origin !== origin || url.pathname !== '/socket.io/' || url.searchParams.getAll('EIO').length !== 1 || url.searchParams.get('EIO') !== '4' || url.searchParams.getAll('transport').length !== 1 || url.searchParams.get('transport') !== 'polling') throw new ControllerError('DOMAIN_BLOCKED');
  return origin + url.pathname + url.search;
}
export interface SignalEndpoint { origin: string; address?: string }
function isPublicSignalIpv4(value: string): boolean {
  if (!/^(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){3}$/.test(value)) return false;
  const [a, b, c, d] = value.split('.').map(Number);
  if ([a, b, c, d].some(octet => octet > 255)) return false;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}
/** Keep the room's routing address separate from its certificate-authenticated identity. */
export function normalizeSignalEndpoint(value: string): SignalEndpoint {
  if (typeof value !== 'string' || !value || value.length > 16384 || /[\s\\\u0000-\u001f\u007f]/.test(value)) throw new ControllerError('SIGNAL_ADDRESS_INVALID');
  // UU's advertised endpoint may be a bare host:port. Always use TLS;
  // never inherit ArkWeb's resource scheme or silently use plaintext.
  const address = value.includes('://') ? value : `wss://${value}`;
  const withoutQuery = address.split(/[?#]/)[0];
  const authorityStart = address.indexOf('://') + 3;
  const authorityEnd = withoutQuery.indexOf('/', authorityStart);
  const rawAuthority = withoutQuery.slice(authorityStart, authorityEnd < 0 ? undefined : authorityEnd);
  const rawPath = authorityEnd < 0 ? '/' : withoutQuery.slice(authorityEnd);
  if (rawPath.includes('%') || /(?:^|\/)\.{1,2}(?:\/|$)/.test(rawPath) || rawPath.includes('//')) throw new ControllerError('SIGNAL_PATH_BLOCKED');
  let url: URL;
  try { url = new URL(address); } catch { throw new ControllerError('SIGNAL_ADDRESS_INVALID'); }
  const host = url.hostname;
  if (!['https:', 'wss:'].includes(url.protocol)) throw new ControllerError('SIGNAL_SCHEME_BLOCKED');
  if (url.username || url.password || url.hash) throw new ControllerError('SIGNAL_ADDRESS_INVALID');
  if (url.port && (Number(url.port) < 1 || Number(url.port) > 65535)) throw new ControllerError('SIGNAL_PORT_INVALID');
  if (!['/', '/socket.io', '/socket.io/'].includes(url.pathname)) throw new ControllerError('SIGNAL_PATH_BLOCKED');
  if (/^[0-9]+(?:\.[0-9]+){3}$/.test(host)) {
    if (rawAuthority.split(':')[0] !== host || !isPublicSignalIpv4(host)) throw new ControllerError('SIGNAL_HOST_BLOCKED');
    return { origin: `https://nrd.nie.163.com${url.port ? `:${url.port}` : ''}`, address: host };
  }
  if (!(host === 'nrd.nie.163.com' || host.endsWith('.nrd.nie.163.com'))) throw new ControllerError('SIGNAL_HOST_BLOCKED');
  // Room query material is not reused; Engine.IO constructs its own query.
  return { origin: `https://${url.host}` };
}
export function signalPollingOrigin(value: string): string {
  return normalizeSignalEndpoint(value).origin;
}
export function apiUrl(path: string): string {
  if (!path.startsWith('/api/v1/') || /[\\#\s]/.test(path) || /\.{2}|%2e|%2f|%5c/i.test(path)) throw new ControllerError('DOMAIN_BLOCKED');
  const url = new URL(path, 'https://api.nrd.nie.163.com');
  if (url.origin !== 'https://api.nrd.nie.163.com') throw new ControllerError('DOMAIN_BLOCKED');
  return url.href;
}
export function signalUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new ControllerError('DOMAIN_BLOCKED'); }
  const host = url.hostname;
  if (url.protocol !== 'wss:' || url.username || url.password || url.port || url.hash || !(host === 'nrd.nie.163.com' || host.endsWith('.nrd.nie.163.com'))) throw new ControllerError('DOMAIN_BLOCKED');
  return url.href;
}
