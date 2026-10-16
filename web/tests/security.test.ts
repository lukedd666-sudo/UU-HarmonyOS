import { describe, expect, it } from 'vitest';
import { apiUrl, pollingUrl, signalOriginDiagnosticRecord, signalPollingOrigin, signalUrl } from '../src/security';

describe('credential destination boundaries', () => {
  it('limits blocked-origin diagnostics to canonical host and port without room or account fields', () => {
    expect(signalOriginDiagnosticRecord('wss://Gateway.Example.com:8443/socket.io/?token=private-room-token&account=private-account')).toBe('UU_REA_SIGNAL_ORIGIN|https|gateway.example.com|8443');
    expect(signalOriginDiagnosticRecord('gateway.example.com')).toBe('UU_REA_SIGNAL_ORIGIN|https|gateway.example.com|443');
    expect(signalOriginDiagnosticRecord('wss://[2001:db8::1]:8443/')).toBe('UU_REA_SIGNAL_ORIGIN|https|[2001:db8::1]|8443');
    for (const value of ['https://user:private-password@gateway.example.com/', 'https://gateway.example.com/#private-token', 'https://gateway.example.com/\nprivate-token', 'http://gateway.example.com/', 'wss://gateway.example.com:0/', 'not a URL']) expect(signalOriginDiagnosticRecord(value)).toBeNull();
  });
  it('normalizes advertised secure host/port formats without retaining query material', () => {
    for (const value of ['signal.nrd.nie.163.com:8443', 'wss://signal.nrd.nie.163.com:8443/', 'https://signal.nrd.nie.163.com:8443/socket.io?token=public-fixture']) {
      expect(signalPollingOrigin(value)).toBe('https://signal.nrd.nie.163.com:8443');
    }
    expect(signalPollingOrigin('signal.nrd.nie.163.com:443')).toBe('https://signal.nrd.nie.163.com');
    expect(pollingUrl('https://signal.nrd.nie.163.com:8443/socket.io/?EIO=4&transport=polling')).toContain(':8443/socket.io/');
  });
  it('keeps advertised endpoint normalization inside its secure destination boundary', () => {
    for (const value of ['ws://signal.nrd.nie.163.com:8443', 'http://signal.nrd.nie.163.com', 'user:password@signal.nrd.nie.163.com', 'signal.nrd.nie.163.com.evil.test:8443', '127.0.0.1:8443', 'signal.nrd.nie.163.com:65536', 'signal.nrd.nie.163.com:0', 'signal.nrd.nie.163.com/private', 'signal.nrd.nie.163.com/socket.io/#fragment', 'signal.nrd.nie.163.com/../socket.io/', 'signal.nrd.nie.163.com/%73ocket.io/', 'signal.nrd.nie.163.com\\socket.io/']) {
      expect(() => signalPollingOrigin(value)).toThrow();
    }
  });
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
