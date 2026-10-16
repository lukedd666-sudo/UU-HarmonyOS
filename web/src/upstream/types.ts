// MIT: Copyright (c) 2026 iola1999.
// Source: fang12100/uuremote @ aa2e12af69031f7d74eb6a86d967317ac5957053.
// Full license: THIRD_PARTY_NOTICES.md.
import type { StreamerIceNetworkType, StreamerSignalControlAck } from "./streamerProtocol.js";

export interface LoginState {
  token?: string;
  userId?: string;
  clientId?: string;
  deviceId?: string;
  oaid?: string;
  uuid?: string;
  channel?: string;
}

export interface AuthStatus {
  hasState: boolean;
  missingFields: string[];
  userId?: string;
  clientId?: string;
  deviceId?: string;
  channel?: string;
  tokenExpiresAt?: string;
  tokenExpired?: boolean;
}

export interface UuRequest {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface UuResponse<TBody = unknown> {
  status: number;
  statusText?: string;
  headers: Record<string, string>;
  body: TBody;
}

export interface UuDevice {
  deviceId: string;
  alias: string;
  controllable: boolean;
  platform?: number;
  status?: string;
  versionName?: string;
  supportWol?: boolean;
  controlledSupport?: boolean;
  appFlag?: unknown;
  participantsInfo?: UuParticipantInfo[];
  raw: Record<string, unknown>;
}

export interface UuParticipantInfo {
  clientId: string;
  deviceId: string;
  alias: string;
  platform?: number;
  joinType?: number;
  controlledSeconds?: number;
  appFlag?: unknown;
}

export interface UuDeviceGroups {
  desktopDevices: UuDevice[];
  mobileDevices: UuDevice[];
  tvDevices: UuDevice[];
}

export interface TransportResult<TBody = unknown> {
  status: number;
  headers: Record<string, string>;
  body: TBody;
}

export interface UuTransport {
  request<TBody = unknown>(request: UuRequest): Promise<TransportResult<TBody>>;
}

export type UurcRuntime = "node" | "cloudflare-worker";
export type UurcSignalGatewayMode = "node-socket-io" | "cloudflare-durable-object";

export interface RuntimeProfile {
  ok: true;
  runtime: UurcRuntime;
  uuProxyPath: "/api/proxy/uu";
  signalGateway: UurcSignalGatewayMode;
  remoteApiBase: "/api/remote";
  wispProxy: boolean;
}

export interface MobileCodeRequestInput {
  regionCode: string;
  mobile: string;
}

export interface MobileLoginRequestInput extends MobileCodeRequestInput {
  code: string;
}

export interface MobileLoginResult {
  userId: string;
  nickName: string;
  token: string;
}

export interface AndroidDeviceInitProfile {
  name: string;
  client_id: string;
  system_id: string;
  system_version: string;
  gaid: string;
  install_id: string;
  build_fingerprint: string;
  brand: string;
  manufacturer: string;
  model: string;
  product: string;
  rom: string;
  abi: string;
  resolution: string;
  screen_size: string;
  dpi: number;
}

export interface StreamerRoomConfig {
  token: string;
  signalServers: string[];
  timeout?: number;
  signalReconnectDelay?: number;
  reportToken?: string;
  reportUrl?: string;
  reportServerAddress?: string;
  appData?: string;
}

export interface StreamerRoomConfigSummary {
  tokenPresent: boolean;
  signalServerCount: number;
  signalServers: string[];
  timeout?: number;
  signalReconnectDelay?: number;
  reportUrl?: string;
  reportServerAddress?: string;
  appDataPresent: boolean;
}

export interface RoomJoinUpstreamSummary {
  status: number;
  statusText?: string;
  headers: Record<string, string>;
  body: {
    code?: number;
    msg?: string;
    dataKeys?: string[];
  };
}

export interface RoomJoinResult {
  upstream: RoomJoinUpstreamSummary;
  roomConfig: null;
  roomConfigSummary: StreamerRoomConfigSummary | null;
  sessionReference: {
    browserStoragePath: string;
    summaryPath: string;
  };
}

export type RoomJoinKind = "owned_device" | "remote_assistance";

export type RemoteAssistanceControlMode = "by_password" | "by_confirmation" | "password_confirmation";

export interface RemoteRoomJoinContext {
  capturedAt: string;
  kind?: RoomJoinKind;
  deviceId: string;
  forceJoin: boolean;
  connectId?: string;
  connectCodeProvided?: boolean;
  controlId?: string;
  controlMode?: RemoteAssistanceControlMode | null;
  deviceName?: string;
  targetPlatform?: number;
}

export interface RemoteAssistanceJoinInput {
  connectId: string;
  connectCode?: string;
  controlId?: string;
  controlMode?: RemoteAssistanceControlMode | null;
  targetPlatform?: number;
}

export interface RemoteAssistanceJoinResult extends RoomJoinResult {
  assistance: {
    connectId: string;
    connectCodeProvided: boolean;
    confirmationRequired: boolean;
    usedConfirmation: boolean;
    controlId?: string;
    controlMode?: RemoteAssistanceControlMode | null;
    deviceName?: string;
    targetPlatform?: number;
  };
}

export interface RemoteAssistanceControlModeResult {
  upstream: RoomJoinUpstreamSummary;
  connectId: string;
  canRemoteControl: boolean;
  controlMode: RemoteAssistanceControlMode | null;
}

export interface RoomAppFlagUpdateInput {
  publisherDeviceId: string;
  controlMode: string | null;
}

export interface RoomAppFlagUpdateResult {
  upstream: RoomJoinUpstreamSummary;
  appFlag: {
    controlMode: string | null;
  };
}

export interface RemoteControlBootstrap {
  status: "ready";
  strategy: "backend_signal_gateway";
  selectedSignalServer: string;
  signalServers: string[];
  signalHeaders: Record<string, string>;
  signalEvents: readonly string[];
  soac: {
    event: string;
    types: readonly string[];
    controllerOutboundTypes: readonly string[];
    controllerInboundTypes: readonly string[];
    payloadKeys: readonly string[];
  };
  signalControl: {
    socketEvents: Record<string, string>;
    event: string;
    payloadKeys: readonly string[];
    payloadTypes: Record<string, string>;
    wireArgumentOrder: readonly string[];
    streamerDataJsonKeys: readonly string[];
    ackTimeoutMs: number;
  };
  dataChannels: Record<string, string>;
  connectOptions: {
    fields: readonly {
      tag: number;
      name: string;
      repeated: boolean;
    }[];
    appClientVersion: string;
    clientTypes: Record<string, number>;
    captureTypes: Record<string, number>;
    controlConnectTypes: Record<string, number>;
    defaultFeatureFlags: Record<string, number>;
    captureParams: {
      fields: readonly {
        tag: number;
        name: string;
        defaultValue: unknown;
      }[];
      resolutionFields: readonly {
        tag: number;
        name: string;
        defaultValue: unknown;
      }[];
      fpsValues: Record<string, number>;
      videoQualityValues: Record<string, number>;
      chooseResolutionTypes: Record<string, number>;
      chromaFormats: Record<string, number>;
      staticDefaults: Record<string, unknown>;
    };
  };
  input: {
    supportedBuilders: readonly string[];
    sendToRomWireFields: Record<string, number>;
    imeControlCodes: Record<string, number>;
    mumuSystemKeyCodes: Record<string, number>;
    touchSlots: readonly number[];
  };
  joinContext?: RemoteRoomJoinContext;
  roomConfigSummary: StreamerRoomConfigSummary;
  gatewayRequiredReason: string;
}

export type RemoteSignalGatewayState = "idle" | "connecting" | "connected" | "closed" | "error";
export type RemoteSignalGatewayEventDirection = "inbound" | "outbound";

export interface RemoteSignalGatewayBinaryPayload {
  kind: "binary";
  byteLength: number;
  base64: string;
}

export interface RemoteSignalGatewayEvent {
  id: number;
  direction: RemoteSignalGatewayEventDirection;
  event: string;
  receivedAt: string;
  payload: unknown;
}

export interface RemoteSignalGatewayStartRequest {
  gzipSdp?: boolean;
  signalServerIndex?: number;
  roomConfig?: StreamerRoomConfig;
  joinContext?: RemoteRoomJoinContext;
}

export interface RemoteSignalControlRequest {
  appControlId: string;
  appDataBase64?: string;
  streamerData?: string;
}

export interface RemoteSignalControlResult {
  event: string;
  ackStatus?: string;
  ack: unknown[];
  control: StreamerSignalControlAck;
  emittedAt: string;
  ackReceivedAt: string;
}

export interface RemoteSignalSoacCandidate {
  candidate: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
}

export interface RemoteSignalSoacRequest {
  type: "offer" | "answer" | "candidate" | "restart_ice";
  clientId?: string;
  appControlId?: string;
  iceId?: string;
  sdp?: string;
  gzipSdp?: boolean;
  iceNetworkType?: StreamerIceNetworkType;
  candidate?: RemoteSignalSoacCandidate;
}

export interface RemoteSignalSoacResult {
  event: string;
  payload: unknown;
  emittedAt: string;
}

export interface RemoteSignalGatewayStatus {
  status: RemoteSignalGatewayState;
  strategy: "backend_signal_gateway";
  selectedSignalServer?: string;
  signalServers: string[];
  signalHeaders: Record<string, string>;
  signalControl: {
    socketEvents: Record<string, string>;
    event: string;
    payloadKeys: readonly string[];
    payloadTypes: Record<string, string>;
    wireArgumentOrder: readonly string[];
    streamerDataJsonKeys: readonly string[];
    ackTimeoutMs: number;
  };
  connectionId?: string;
  startedAt?: string;
  updatedAt: string;
  error?: string;
  roomClear?: RoomJoinUpstreamSummary;
  roomClearError?: string;
}

export type RemoteSignalReadinessStage =
  | "idle"
  | "gateway_connected"
  | "control_acknowledged"
  | "offer_sent"
  | "answer_received";

export type RemoteSignalReadinessBlocker =
  | "gateway_not_connected"
  | "control_ack_missing"
  | "control_ack_failed"
  | "offer_missing"
  | "be_controlled_failed"
  | "answer_missing"
  | "controlled_left_before_answer"
  | null;

export interface RemoteSignalReadinessDiagnostics {
  stage: RemoteSignalReadinessStage;
  blocker: RemoteSignalReadinessBlocker;
  selectedSignalServer?: string;
  updatedAt?: string;
  lastEventAt?: string;
  terminalSignal?: {
    event: string;
    reason: "server_kick" | "publisher_disconnected" | "released";
    receivedAt: string;
    traceId?: string;
    iceIdPresent?: boolean;
    iceIdMatchesLastOffer?: boolean;
  };
  controlAckError?: {
    ackStatus?: string;
    code?: number;
    message?: string;
    protocolError?: string;
    receivedAt: string;
  };
  beControlledError?: {
    code?: number;
    message?: string;
    protocolError?: string;
    receivedAt: string;
  };
  checks: {
    signalGatewayConnected: boolean;
    controlAckReceived: boolean;
    offerSent: boolean;
    beControlledReceived: boolean;
    answerReceived: boolean;
    terminalSignalReceived: boolean;
  };
  counts: {
    outboundControl: number;
    inboundControlAck: number;
    inboundControlAckSuccess: number;
    inboundControlAckFailure: number;
    outboundOffer: number;
    outboundCandidate: number;
    inboundAnswer: number;
    inboundRestartIce: number;
    inboundCandidate: number;
    inboundBmsgPush: number;
    inboundLeave: number;
    inboundReleased: number;
    inboundBeControlled: number;
    inboundBeControlledSuccess: number;
    inboundBeControlledFailure: number;
  };
}
