import { afterEach, expect, it, vi } from 'vitest';
import { RemoteSession } from '../src/remoteSession';
import type { RemoteSignalControlResult } from '../src/upstream/types';
import { decodeStreamerControlMessage, STREAMER_DATA_CHANNEL_LABELS } from '../src/upstream/streamerProtocol';
afterEach(() => vi.unstubAllGlobals());

it('records only a bounded numeric rejection code without peer or server message content', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  try {
    const peer = vi.fn();
    const session = new RemoteSession({
      sendSignalControl: async () => ({ event: 'control', ack: [], control: { ackStatus: 'error', result: { code: 5, msg: 'private-server-content', iceServers: [] } }, emittedAt: '', ackReceivedAt: '' }),
      sendSignalSoac: async () => ({ event: 'soac', payload: null, emittedAt: '' }),
    }, peer, () => {}, () => {});
    await expect(session.start('fixture-controller')).rejects.toThrow();
    expect(peer).not.toHaveBeenCalled();
    expect(log.mock.calls).toEqual([['UU_REA_RTC|CONTROL_REJECTED'], ['UU_REA_CONTROL_RESULT|5']]);
  } finally { log.mockRestore(); }
});

it('sends protocol Echo and the separate Mac input heartbeat without enabling unrelated capabilities', async () => {
  vi.stubGlobal('RTCRtpReceiver', { getCapabilities: () => ({ codecs: [{ mimeType: 'video/H264' }] }) });
  const sent: Array<Uint8Array | string> = [];
  const control = { readyState: 'open', onopen: null as (() => void) | null, send: (value: Uint8Array | string) => sent.push(value) };
  const peer = {
    connectionState: 'connected', signalingState: 'stable',
    createDataChannel: (label: string) => label === STREAMER_DATA_CHANNEL_LABELS.control ? control : {},
    addTransceiver: () => ({ setCodecPreferences() {} }),
    createOffer: async () => ({ type: 'offer', sdp: 'fixture-sdp' }), setLocalDescription: async () => {}, close() {},
  };
  const session = new RemoteSession({
    sendSignalControl: async () => ({ event: 'control', ack: [], control: { result: { clientId: 'fixture', iceServers: [] } }, emittedAt: '', ackReceivedAt: '' }),
    sendSignalSoac: async () => ({ event: 'soac', payload: null, emittedAt: '' }),
  }, () => peer as unknown as RTCPeerConnection, () => {}, () => {});
  try {
    await session.start('fixture-controller');
    control.onopen?.();
    const message = decodeStreamerControlMessage(sent[0] as Uint8Array);
    expect(message.simpleAction?.featureFlags).toEqual({});
    expect(sent.filter(value => typeof value === 'string').map(value => JSON.parse(value as string))).toEqual([{ heartbeat: true }]);
  } finally { session.close(); }
});

it('does not create a peer or reopen state when a control acknowledgement arrives after disconnect', async () => {
  let resolveControl!: (value: RemoteSignalControlResult) => void;
  let peers = 0;
  const session = new RemoteSession({
    sendSignalControl: () => new Promise(resolve => { resolveControl = resolve; }),
    sendSignalSoac: async () => ({ event: 'soac', payload: null, emittedAt: '' }),
  }, () => { peers++; return {} as RTCPeerConnection; }, () => {}, () => {});
  const starting = session.start('fixture-controller');
  session.close();
  resolveControl({ event: 'control', ack: [], control: { ackStatus: 'success', result: { clientId: 'fixture-client', iceServers: [] } }, emittedAt: '', ackReceivedAt: '' });
  await starting;
  expect(peers).toBe(0);
  expect(session.inputReady).toBe(false);
});

it('permits input only after a decoded frame and revokes it permanently when the media connection fails', async () => {
  const sent: unknown[] = [];
  vi.stubGlobal('RTCRtpReceiver', { getCapabilities: () => ({ codecs: [{ mimeType: 'video/H264' }] }) });
  vi.stubGlobal('MediaStream', class { constructor(private tracks: unknown[]) {} getTracks() { return this.tracks; } });
  const peer = {
    connectionState: 'connected', signalingState: 'stable',
    onconnectionstatechange: null as (() => void) | null, ontrack: null as ((event: unknown) => void) | null,
    createDataChannel: () => ({ readyState: 'open', send: (value: unknown) => sent.push(value) }),
    addTransceiver: () => ({ setCodecPreferences() {} }),
    createOffer: async () => ({ type: 'offer', sdp: 'fixture-sdp' }), setLocalDescription: async () => {}, close() { this.connectionState = 'closed'; },
  };
  const session = new RemoteSession({
    sendSignalControl: async () => ({ event: 'control', ack: [], control: { ackStatus: 'success', result: { clientId: 'fixture', iceServers: [] } }, emittedAt: '', ackReceivedAt: '' }),
    sendSignalSoac: async () => ({ event: 'soac', payload: null, emittedAt: '' }),
  }, () => peer as unknown as RTCPeerConnection, () => {}, () => {});
  await session.start('fixture-controller');
  expect(session.inputReady).toBe(false);
  peer.ontrack?.({ track: { kind: 'video', stop() {} } });
  session.markFrameReceived();
  expect(session.inputReady).toBe(true);
  peer.connectionState = 'failed'; peer.onconnectionstatechange?.();
  expect(session.inputReady).toBe(false);
  expect(session.markFrameReceived()).toBe(false);
  expect(() => session.input.key({ code: 'KeyA', key: 'a' }, true)).toThrow();
  expect(sent).toHaveLength(0);
});
