import { ControllerError } from './nativeBridge';
export function pollingUrl(value: string): string {
  const url = new URL(value);
  const origin = signalPollingOrigin(value);
  if (url.protocol !== 'https:' || url.pathname !== '/socket.io/' || url.searchParams.getAll('EIO').length !== 1 || url.searchParams.get('EIO') !== '4' || url.searchParams.getAll('transport').length !== 1 || url.searchParams.get('transport') !== 'polling') throw new ControllerError('DOMAIN_BLOCKED');
  return origin + url.pathname + url.search;
}
export function signalPollingOrigin(value: string): string {
  if (typeof value !== 'string' || !value || value.length > 16384 || /[\s\\\u0000-\u001f\u007f]/.test(value)) throw new ControllerError('SIGNAL_ADDRESS_INVALID');
  // UU's advertised endpoint may be a bare host:port. Always use TLS;
  // never inherit ArkWeb's resource scheme or silently use plaintext.
  const address = value.includes('://') ? value : `wss://${value}`;
  const authorityEnd = address.indexOf('/', address.indexOf('://') + 3);
  const rawPath = authorityEnd < 0 ? '/' : address.slice(authorityEnd).split(/[?#]/)[0];
  if (rawPath.includes('%') || /(?:^|\/)\.{1,2}(?:\/|$)/.test(rawPath) || rawPath.includes('//')) throw new ControllerError('SIGNAL_PATH_BLOCKED');
  let url: URL;
  try { url = new URL(address); } catch { throw new ControllerError('SIGNAL_ADDRESS_INVALID'); }
  const host = url.hostname;
  if (!['https:', 'wss:'].includes(url.protocol)) throw new ControllerError('SIGNAL_SCHEME_BLOCKED');
  if (url.username || url.password || url.hash) throw new ControllerError('SIGNAL_ADDRESS_INVALID');
  if (!(host === 'nrd.nie.163.com' || host.endsWith('.nrd.nie.163.com'))) throw new ControllerError('SIGNAL_HOST_BLOCKED');
  if (url.port && (Number(url.port) < 1 || Number(url.port) > 65535)) throw new ControllerError('SIGNAL_PORT_INVALID');
  if (!['/', '/socket.io', '/socket.io/'].includes(url.pathname)) throw new ControllerError('SIGNAL_PATH_BLOCKED');
  // Room query material is not reused; Engine.IO constructs its own query.
  return `https://${url.host}`;
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
