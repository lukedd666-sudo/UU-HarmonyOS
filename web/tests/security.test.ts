import { describe, expect, it } from 'vitest';
import { apiUrl, pollingUrl, signalUrl } from '../src/security';

describe('credential destination boundaries', () => {
  it('allows only supported API routes on the fixed API origin', () => {
    expect(apiUrl('/api/v1/login/by_mobile')).toBe('https://api.nrd.nie.163.com/api/v1/login/by_mobile');
    for (const path of ['https://evil.test/api/v1/a', '/api/v1/../login', '//evil.test/api/v1/a', '/api/v1/%2e%2e/a', '/api/v1/a#x']) {
      expect(() => apiUrl(path)).toThrow();
    }
  });
  it('allows HTTPS polling only at the exact UU Engine.IO route', () => {
    expect(pollingUrl('https://signal.nrd.nie.163.com/socket.io/?EIO=4&transport=polling&sid=fixture')).toContain('/socket.io/');
    for (const url of ['https://signal.nrd.nie.163.com/socket.io/?EIO=4&transport=websocket', 'https://signal.nrd.nie.163.com/socket.io/extra?EIO=4&transport=polling', 'http://signal.nrd.nie.163.com/socket.io/?EIO=4&transport=polling', 'https://evil.test/socket.io/?EIO=4&transport=polling', 'https://signal.nrd.nie.163.com/socket.io/?EIO=3&transport=polling', 'https://signal.nrd.nie.163.com/%73ocket.io/?EIO=4&transport=polling', 'https://signal.nrd.nie.163.com/socket.io/?EIO=4&transport=polling&transport=websocket']) expect(() => pollingUrl(url)).toThrow();
  });
  it('accepts secure UU signaling while rejecting suffix, userinfo, port and cleartext tricks', () => {
    expect(signalUrl('wss://signal.nrd.nie.163.com')).toBe('wss://signal.nrd.nie.163.com/');
    for (const url of ['wss://nrd.nie.163.com.evil.test', 'wss://evilnrd.nie.163.com', 'ws://signal.nrd.nie.163.com', 'wss://user:pass@signal.nrd.nie.163.com', 'wss://signal.nrd.nie.163.com:8443', 'https://signal.nrd.nie.163.com']) {
      expect(() => signalUrl(url)).toThrow();
    }
  });
});
