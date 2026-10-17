// Minimal H.264/SCTP session adapted from MIT browserRemoteSession.ts. No diagnostic payload log.
import { ControllerError, asRecord } from './nativeBridge';
import { MacInput } from './macInput';
import { toBase64 } from './nativeSocket';
import { buildDefaultStreamerDecoderCap, buildStreamerControlStreamerDataJson, buildStreamerRtcConfiguration, decodeStreamerControlMessage, encodeStreamerConnectOptions, encodeStreamerEchoRequestMessage, encodeStreamerEchoResponseMessage, getStreamerSignalControlFailure, STREAMER_DATA_CHANNEL_LABELS, STREAMER_SIMPLE_ACTION_TYPES } from './upstream/streamerProtocol';
import type { RemoteSignalControlRequest, RemoteSignalControlResult, RemoteSignalGatewayEvent, RemoteSignalSoacRequest, RemoteSignalSoacResult } from './upstream/types';
export interface SessionSignal {
  sendSignalControl(input: RemoteSignalControlRequest): Promise<RemoteSignalControlResult>;
  sendSignalSoac(input: RemoteSignalSoacRequest): Promise<RemoteSignalSoacResult>;
}
export class RemoteSession {
  readonly input = new MacInput(message => this.sendInput(message));
  private peer: RTCPeerConnection | null = null;
  private control: RTCDataChannel | null = null;
  private closed = false;
  private appControlId = '';
  private clientId: string | undefined;
  private iceId: string | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private sequence = 1;
  private queuedCandidates: RTCIceCandidateInit[] = [];
  private media: MediaStream | null = null;
  private frameReceived = false;
  private recorded = new Set<string>();
  private record(stage: string): void { if (!this.recorded.has(stage)) { this.recorded.add(stage); console.info(`UU_REA_RTC|${stage}`); } }
  constructor(private readonly signal: SessionSignal, private readonly createPeer: (configuration: RTCConfiguration) => RTCPeerConnection, private readonly onStream: (stream: MediaStream) => void, private readonly onState: (state: string) => void) {}
  get inputReady(): boolean { return !this.closed && this.frameReceived && this.peer?.connectionState === 'connected' && this.control?.readyState === 'open'; }
  markFrameReceived(): boolean { if (this.closed || !this.media) return false; this.frameReceived = true; this.record('FIRST_FRAME'); return true; }
  releaseInputs(): void {
    if (!this.input.releaseAll()) { this.close(); this.onState('无法释放按键，媒体会话已断开，请重新连接'); }
  }
  async start(deviceId: string): Promise<void> {
    this.appControlId = globalThis.crypto?.randomUUID?.() ?? `uu-rea-${Date.now()}`;
    this.onState('请求控制权限');
    const appData = encodeStreamerConnectOptions({
      deviceId, typeValue: -1,
      captureParams: { fps: 30, cursorCapture: true, localResolution: { width: 1920, height: 1080 } },
      decoderCapList: [buildDefaultStreamerDecoderCap()],
      featureFlags: { ff_capture_setting: 2, ff_simple_action: 1 },
    });
    const ack = await this.signal.sendSignalControl({ appControlId: this.appControlId, appDataBase64: toBase64(appData), streamerData: buildStreamerControlStreamerDataJson({ controlId: this.appControlId }) });
    if (this.closed) return;
    const result = ack.control.result;
    if (!result || getStreamerSignalControlFailure(ack.control)) {
      this.record('CONTROL_REJECTED');
      if (typeof result?.code === 'number' && Number.isInteger(result.code) && Math.abs(result.code) <= 99999) console.info(`UU_REA_CONTROL_RESULT|${result.code}`);
      throw new ControllerError('SIGNAL_FAILED');
    }
    this.record('CONTROL_OK');
    if (!result.clientId || !result.iceId) this.record('CONTROL_IDS_MISSING');
    this.clientId = result.clientId;
    this.iceId = result.iceId;
    const peer = this.createPeer(buildStreamerRtcConfiguration(result));
    this.peer = peer;
    for (const label of Object.values(STREAMER_DATA_CHANNEL_LABELS)) {
      const channel = peer.createDataChannel(label);
      channel.binaryType = 'arraybuffer';
      if (label !== STREAMER_DATA_CHANNEL_LABELS.control) continue;
      this.control = channel;
      channel.onopen = () => {
        if (this.closed) return;
        this.onState('控制通道已打开，等待画面');
        this.sendHeartbeat();
        this.heartbeat = setInterval(() => this.sendHeartbeat(), 100);
      };
      channel.onclose = () => { this.stopHeartbeat(); if (!this.closed) this.onState('控制通道已关闭'); };
      channel.onerror = () => { this.stopHeartbeat(); if (!this.closed) this.onState('控制通道错误'); };
      channel.onmessage = event => {
        if (!(event.data instanceof ArrayBuffer) || this.closed) return;
        this.record('CONTROL_DATA_RECEIVED');
        try {
          const message = decodeStreamerControlMessage(event.data);
          if (message.simpleAction?.action !== STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_REQUEST) return;
          const responseSequence = message.simpleAction.seq ?? message.sequence;
          if (responseSequence !== undefined && !this.closed && channel.readyState === 'open') channel.send(encodeStreamerEchoResponseMessage({ sequence: this.sequence++, timestampMs: this.timestamp(), responseSequence, featureFlags: {} }));
        } catch { /* Unknown control notifications are ignored; their contents are never logged. */ }
      };
    }
    const codecs = globalThis.RTCRtpReceiver?.getCapabilities?.('video')?.codecs ?? [];
    const h264 = codecs.filter(codec => codec.mimeType.toLowerCase() === 'video/h264');
    const rtx = codecs.filter(codec => codec.mimeType.toLowerCase() === 'video/rtx');
    if (h264.length === 0) throw new ControllerError('WEBRTC_UNSUPPORTED');
    // UU reserves five desktop video slots; this UI renders the first screen only.
    for (let index = 0; index < 5; index++) peer.addTransceiver('video', { direction: 'recvonly' }).setCodecPreferences([...h264, ...rtx]);
    peer.addTransceiver('audio', { direction: 'recvonly' });
    peer.onicecandidate = event => {
      if (!event.candidate || this.closed) return;
      this.record('LOCAL_CANDIDATE');
      const candidate = event.candidate.toJSON();
      void this.sendSoac({ type: 'candidate', candidate: { candidate: candidate.candidate ?? '', sdpMid: candidate.sdpMid ?? undefined, sdpMLineIndex: candidate.sdpMLineIndex ?? undefined } }).catch(() => { if (!this.closed) this.onState('ICE 候选发送失败'); });
    };
    peer.ontrack = event => {
      if (this.closed || event.track.kind !== 'video' || this.media) return;
      this.media = new MediaStream([event.track]);
      this.record('VIDEO_TRACK');
      this.onStream(this.media);
      this.onState('已收到视频轨道，等待首帧');
    };
    peer.onconnectionstatechange = () => {
      if (this.closed) return;
      if (['disconnected', 'failed', 'closed'].includes(peer.connectionState)) { this.record('ICE_FAILED'); this.close(); this.onState('媒体连接已中断，请断开后重连'); }
      else if (peer.connectionState === 'connected') { this.record('ICE_CONNECTED'); this.onState(this.frameReceived ? '媒体连接已建立，可启用输入' : '媒体连接已建立，等待首帧'); }
    };
    const offer = await peer.createOffer();
    if (this.closed) return;
    await peer.setLocalDescription(offer);
    if (this.closed) return;
    await this.sendSoac({ type: 'offer', sdp: offer.sdp, gzipSdp: false, iceNetworkType: 2 });
    this.record('OFFER_SENT');
    if (!this.closed) this.onState('已发送 H.264 SDP，等待被控端');
  }
  async apply(event: RemoteSignalGatewayEvent): Promise<void> {
    if (this.closed || event.event !== 'soac') return;
    for (const payload of Array.isArray(event.payload) ? event.payload : [event.payload]) {
      const record = asRecord(payload), data = asRecord(record.data);
      this.record(data.type === 'answer' || data.type === 'restart_ice' ? 'SOAC_ANSWER' : data.type === 'candidate' ? 'SOAC_CANDIDATE' : 'SOAC_OTHER');
      if (!this.peer) { this.record('NO_PEER'); continue; }
      if ((record.client_id && record.client_id !== this.clientId) || (data.app_control_id && data.app_control_id !== this.appControlId) || (data.ice_id && this.iceId && data.ice_id !== this.iceId)) { this.record('SCOPE_MISMATCH'); continue; }
      if ((data.type === 'answer' || data.type === 'restart_ice') && (typeof data.sdp !== 'string' || !data.sdp)) this.record('ANSWER_EMPTY');
      if ((data.type === 'answer' || data.type === 'restart_ice') && typeof data.sdp === 'string' && this.peer.signalingState === 'have-local-offer') {
        await this.peer.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        this.record('ANSWER_APPLIED');
        if (this.closed) return;
        for (const candidate of this.queuedCandidates.splice(0)) await this.peer.addIceCandidate(candidate);
        this.onState('SDP 已协商，等待媒体');
      } else if (data.type === 'candidate') {
        const candidate = asRecord(data.candidate);
        if (typeof candidate.candidate !== 'string') continue;
        const init: RTCIceCandidateInit = { candidate: candidate.candidate, sdpMid: typeof candidate.sdpMid === 'string' ? candidate.sdpMid : null, sdpMLineIndex: typeof candidate.sdpMLineIndex === 'number' ? candidate.sdpMLineIndex : null };
        if (this.peer.remoteDescription) await this.peer.addIceCandidate(init); else this.queuedCandidates.push(init);
      }
    }
  }
  close(): void {
    this.input.releaseAll();
    this.closed = true;
    this.frameReceived = false;
    this.stopHeartbeat();
    this.control = null;
    this.peer?.close();
    this.peer = null;
    this.media?.getTracks().forEach(track => track.stop());
    this.media = null;
    this.queuedCandidates = [];
    this.appControlId = ''; this.clientId = undefined; this.iceId = undefined;
  }
  private sendInput(message: string): void {
    if (!this.inputReady || !this.control) throw new ControllerError('INPUT_NOT_READY');
    this.control.send(message);
    this.record('INPUT_SENT');
    const action: unknown = asRecord(JSON.parse(message)).action;
    if (action === 'mouse_move_absolute') this.record('INPUT_MOVE_SENT');
    else if (action === 'mouse_press' || action === 'mouse_release') this.record('INPUT_BUTTON_SENT');
    else if (action === 'kbd_press' || action === 'kbd_release') { this.record('INPUT_KEY_SENT'); this.record(action === 'kbd_press' ? 'INPUT_KEY_PRESS_SENT' : 'INPUT_KEY_RELEASE_SENT'); }
  }
  private timestamp(): number { return Math.floor(Date.now() / 1000); }
  private sendHeartbeat(): void {
    if (this.closed || this.control?.readyState !== 'open') return;
    try {
      this.control.send(encodeStreamerEchoRequestMessage({ sequence: this.sequence++, timestampMs: this.timestamp(), featureFlags: {} }));
      // Official Mac 4.39.1 InputManager independently updates InputHandler's
      // input heartbeat from this JSON boolean, separate from protocol Echo.
      this.control.send('{"heartbeat":true}');
    }
    catch { if (this.control.readyState !== 'open') this.stopHeartbeat(); }
  }
  private stopHeartbeat(): void { if (this.heartbeat) clearInterval(this.heartbeat); this.heartbeat = undefined; }
  private sendSoac(input: RemoteSignalSoacRequest): Promise<RemoteSignalSoacResult> {
    return this.signal.sendSignalSoac({ ...input, appControlId: this.appControlId, clientId: this.clientId, iceId: this.iceId });
  }
}
