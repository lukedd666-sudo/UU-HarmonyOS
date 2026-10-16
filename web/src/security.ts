import { ControllerError } from './nativeBridge';
export function pollingUrl(value: string): string {
  const url = new URL(value);
  const origin = signalPollingOrigin(value);
  if (url.protocol !== 'https:' || url.pathname !== '/socket.io/' || url.searchParams.getAll('EIO').length !== 1 || url.searchParams.get('EIO') !== '4' || url.searchParams.getAll('transport').length !== 1 || url.searchParams.get('transport') !== 'polling') throw new ControllerError('DOMAIN_BLOCKED');
  return origin + url.pathname + url.search;
}
export function signalPollingOrigin(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new ControllerError('DOMAIN_BLOCKED'); }
  const host = url.hostname;
  if (!['https:', 'wss:'].includes(url.protocol) || url.username || url.password || url.port || url.hash || !(host === 'nrd.nie.163.com' || host.endsWith('.nrd.nie.163.com')) || !['/', '/socket.io/'].includes(url.pathname)) throw new ControllerError('DOMAIN_BLOCKED');
  return `https://${host}`;
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
