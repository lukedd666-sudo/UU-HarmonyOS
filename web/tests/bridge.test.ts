import { afterEach, describe, expect, it, vi } from 'vitest';
import { ControllerError, NativeBridge, type BridgeHost } from '../src/nativeBridge';

afterEach(() => vi.useRealTimers());

describe('native request lifecycle', () => {
  it('rejects without dispatch when no native bridge exists', async () => {
    const bridge = new NativeBridge({});
    await expect(bridge.request({ op: 'hmac', message: 'public fixture' })).rejects.toMatchObject({ code: 'BRIDGE_MISSING' });
  });

  it('times out an unresponsive native operation and ignores a late result', async () => {
    vi.useFakeTimers();
    const dispatched: string[] = [];
    const host: BridgeHost = { UUBridge: { invoke: (id) => { dispatched.push(id); } } };
    const bridge = new NativeBridge(host, 50);
    const pending = bridge.request({ op: 'hmac', message: 'fixture' }).catch(error => error);
    await vi.advanceTimersByTimeAsync(51);
    expect(await pending).toMatchObject({ code: 'NATIVE_TIMEOUT' });
    expect(() => host.__uuNativeResult?.(dispatched[0]!, true, '{"hex":"abc"}')).not.toThrow();
  });

  it('propagates a native rejection without exposing its payload', async () => {
    const host: BridgeHost = {};
    host.UUBridge = { invoke: (id) => host.__uuNativeResult?.(id, false, '{"code":"MATERIAL_MISSING","message":"sensitive upstream response"}') };
    const bridge = new NativeBridge(host);
    const error = await bridge.request({ op: 'hmac', message: 'fixture' }).catch(e => e) as ControllerError;
    expect(error.code).toBe('MATERIAL_MISSING');
    expect(error.message).not.toContain('sensitive');
  });
  it('allows only GET long polls to outlive the default deadline and caps them at 45 seconds', async () => {
    vi.useFakeTimers();
    const bridge = new NativeBridge({ UUBridge: { invoke() {} } });
    let pollDone = false, hmacDone = false;
    const poll = bridge.request({ op: 'http', method: 'GET' }, { longPoll: true }).catch(error => { pollDone = true; return error; });
    const hmac = bridge.request({ op: 'hmac', message: 'fixture' }, { longPoll: true }).catch(error => { hmacDone = true; return error; });
    await vi.advanceTimersByTimeAsync(16000);
    expect(hmacDone).toBe(true);
    expect(pollDone).toBe(false);
    await vi.advanceTimersByTimeAsync(30000);
    expect(await poll).toMatchObject({ code: 'NATIVE_TIMEOUT' });
    expect(await hmac).toMatchObject({ code: 'NATIVE_TIMEOUT' });
  });
});
