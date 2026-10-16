// MIT: Copyright (c) 2026 iola1999.
// Source: fang12100/uuremote @ aa2e12af69031f7d74eb6a86d967317ac5957053.
// Full license: THIRD_PARTY_NOTICES.md.
import type {
  RemoteSignalGatewayEvent,
  RemoteSignalGatewayStatus,
  RemoteSignalReadinessDiagnostics,
} from "./types.js";

export const STREAMER_DATA_CHANNEL_LABELS = {
  control: "CONTROL_DATA_CHANNEL",
  text: "TEXT_DATA_CHANNEL",
  streamer: "STREAMER_DATA_CHANNEL",
  file: "FILE_DATA_CHANNEL",
  binary: "BINARY_DATA_CHANNEL",
} as const;

export type StreamerDataChannelKind = keyof typeof STREAMER_DATA_CHANNEL_LABELS;
export type StreamerDataChannelLabel = (typeof STREAMER_DATA_CHANNEL_LABELS)[StreamerDataChannelKind];

export const STREAMER_SOAC_EVENT = "soac" as const;
export const STREAMER_SOAC_TYPES = ["offer", "answer", "candidate", "restart_ice"] as const;
export type StreamerSoacType = (typeof STREAMER_SOAC_TYPES)[number];
export const STREAMER_CONTROLLER_OUTBOUND_SOAC_TYPES = ["offer", "candidate", "restart_ice"] as const;
export const STREAMER_CONTROLLER_INBOUND_SOAC_TYPES = ["answer", "candidate", "restart_ice"] as const;
export const STREAMER_ICE_NETWORK_TYPES = {
  eth: 1,
  wlan: 2,
  v4Wlan: 2,
  appAuto: 3,
  mobile: 4,
  vpn: 8,
  loopback: 16,
} as const;
export type StreamerIceNetworkType = (typeof STREAMER_ICE_NETWORK_TYPES)[keyof typeof STREAMER_ICE_NETWORK_TYPES];

export const STREAMER_CONTROLLER_SIGNAL_EVENTS = [
  STREAMER_SOAC_EVENT,
  "streamer_push",
  "forward_setting",
  "device_capability",
] as const;

export const STREAMER_SIGNAL_SOCKET_EVENTS = {
  control: "control",
  leave: "leave",
  bmsgPush: "bmsg_push",
  publisherDisconnect: "publisher_disconnect",
} as const;

export const STREAMER_CONTROL_EVENT_NAME = STREAMER_SIGNAL_SOCKET_EVENTS.control;
export const STREAMER_CONTROL_EVENT_PAYLOAD_KEYS = ["app_control_id", "app_data", "streamer_data"] as const;
export const STREAMER_CONTROL_EVENT_PAYLOAD_TYPES = {
  app_control_id: "string",
  app_data: "binary",
  streamer_data: "string",
} as const;
export const STREAMER_CONTROL_EVENT_WIRE_ARGUMENT_ORDER = ["app_control_id", "app_data", "streamer_data"] as const;
export const STREAMER_CONTROL_STREAMER_DATA_JSON_KEYS = ["control_id", "device_capability"] as const;
export const STREAMER_DEVICE_CAPABILITY_JSON_KEYS = ["display_info", "video_codec_capability", "ice_id"] as const;
export const STREAMER_DISPLAY_INFO_KEYS = ["id", "fps", "type", "hdr"] as const;
export const STREAMER_VIDEO_CODEC_CAPABILITY_KEYS = [
  "video_codec",
  "width",
  "height",
  "chroma_sampling",
  "bit_depth",
  "codec_impl",
] as const;
export const STREAMER_CONTROL_EVENT_ACK_TIMEOUT_MS = 10000;
export const STREAMER_CONTROL_RESULT_KEYS = [
  "client_id",
  "ice_id",
  "iceServers",
  "app_data",
  "streamer_data",
  "app_control_id",
  "controller_platform",
  "force_relay",
  "auto_switch_network",
  "relay_ins_type",
  "force_auto_switch_pkt_loss",
  "force_auto_switch_latency",
  "possible_auto_switch_pkt_loss",
  "possible_auto_switch_latency",
  "code",
  "msg",
] as const;
export const STREAMER_CONTROL_RESULT_ICE_SERVER_KEYS = ["urls", "username", "credential"] as const;

export const STREAMER_SIGNAL_HEADER_KEYS = [
  "X-NRD-AUTH",
  "X-NRD-CONTROLLING",
  "streamer_version",
  "streamer_flag",
] as const;

export const STREAMER_CLIENT_VERSION = "V3.1.14" as const;

export const STREAMER_DEFAULT_SIGNAL_HEADER_VALUES = {
  "X-NRD-CONTROLLING": "0",
  streamer_version: STREAMER_CLIENT_VERSION,
} as const;

export interface StreamerFlagHeaderOptions {
  gzipSdp: boolean;
}

export interface BuildStreamerSignalHeadersInput {
  token: string;
  gzipSdp?: boolean;
}

export function buildStreamerFlagHeader(options: StreamerFlagHeaderOptions): string {
  return JSON.stringify({ sdp_flags: { gzip_sdp: options.gzipSdp } });
}

export function buildStreamerSignalHeaders(input: BuildStreamerSignalHeadersInput): Record<string, string> {
  return {
    "X-NRD-AUTH": input.token,
    ...STREAMER_DEFAULT_SIGNAL_HEADER_VALUES,
    streamer_flag: buildStreamerFlagHeader({ gzipSdp: input.gzipSdp ?? true }),
  };
}

export const STREAMER_SOAC_PAYLOAD_KEYS = [
  "type",
  "sdp",
  "ice_id",
  "app_control_id",
  "gzip_sdp",
  "ice_network_type",
  "candidate",
  "sdpMid",
  "sdpMLineIndex",
] as const;

export const STREAMER_SOAC_MESSAGE_KEYS = ["client_id", "data"] as const;

export const STREAMER_MAX_DATA_BUFFER_BYTES = 0x80000;

export const STREAMER_ROOM_CONFIG_FIELDS = [
  "token",
  "signalServers",
  "timeout",
  "signalReconnectDelay",
  "reportToken",
  "reportUrl",
  "reportServerAddress",
] as const;

export interface StreamerConnectOptionsField {
  tag: number;
  name: string;
  repeated: boolean;
}

export const STREAMER_CONNECT_OPTIONS_FIELDS = [
  { tag: 1, name: "capture_type", repeated: false },
  { tag: 2, name: "type_value", repeated: false },
  { tag: 3, name: "capture_params", repeated: false },
  { tag: 4, name: "decoder_cap_list", repeated: true },
  { tag: 5, name: "force_virtual_display", repeated: false },
  { tag: 6, name: "virtual_display_modes", repeated: true },
  { tag: 7, name: "virtual_display_init_resolution", repeated: false },
  { tag: 8, name: "client_type", repeated: false },
  { tag: 9, name: "device_id", repeated: false },
  { tag: 10, name: "control_connect_type", repeated: false },
  { tag: 11, name: "feature_flag", repeated: false },
  { tag: 12, name: "client_version", repeated: false },
] as const satisfies readonly StreamerConnectOptionsField[];

export const STREAMER_CAPTURE_TYPES = {
  CT_UNKNOWN: 0,
  CT_DESKTOP: 1,
  CT_WINDOW: 2,
  CT_MUMU: 3,
  CT_HOOK: 4,
  CT_FILETRANSFER: 5,
  CT_SECOND_SCREEN: 6,
  CT_QUICKLAUNCH: 7,
  CT_TERMINAL: 8,
} as const;

export const STREAMER_CONTROL_CONNECT_TYPES = {
  ControlConnectType_UNKNOWN: 0,
  ControlConnectType_Normal: 1,
  ControlConnectType_Assistance: 2,
} as const;

export const STREAMER_CLIENT_TYPES = {
  Client_UNSPECIFIED: 0,
  Client_IOS: 1,
  Client_ANDROID: 2,
  Client_WINDOWS: 3,
  Client_MAC: 4,
} as const;

export const STREAMER_APP_CLIENT_VERSION = "4.23.0" as const;

export interface StreamerFeatureFlagField {
  tag: number;
  name: string;
}

export const STREAMER_FEATURE_FLAG_FIELDS = [
  { tag: 1, name: "ff_capture_setting" },
  { tag: 2, name: "ff_simple_action" },
  { tag: 3, name: "ff_system_metrics" },
  { tag: 4, name: "ff_private_screen" },
  { tag: 5, name: "ff_update_acquire" },
  { tag: 6, name: "ff_file_transfer_ftp" },
  { tag: 7, name: "ff_file_transfer_ftp2" },
  { tag: 8, name: "ff_clipboard" },
  { tag: 9, name: "ff_qos_stat" },
  { tag: 10, name: "ff_mumu_control" },
  { tag: 11, name: "ff_virtual_mouse_device" },
] as const satisfies readonly StreamerFeatureFlagField[];

export const STREAMER_DEFAULT_FEATURE_FLAGS = {
  ff_capture_setting: 2,
  ff_simple_action: 1,
  ff_system_metrics: 2,
  ff_private_screen: 2,
  ff_update_acquire: 0,
  ff_file_transfer_ftp: 2,
  ff_file_transfer_ftp2: 2,
  ff_clipboard: 3,
  ff_qos_stat: 0,
  ff_mumu_control: 0,
  ff_virtual_mouse_device: 0,
} as const;

export const STREAMER_DEFAULT_BROWSER_VIRTUAL_DISPLAY_MODE = {
  width: 1920,
  height: 1080,
  fps: 60,
} as const;

export const STREAMER_DEFAULT_BROWSER_LOCAL_RESOLUTION = {
  width: 1920,
  height: 1080,
} as const;

export const STREAMER_DEFAULT_BROWSER_TYPE_VALUE = -1;

export interface StreamerCaptureParamField {
  tag: number;
  name: string;
  defaultValue: string | number | boolean | null;
}

export const STREAMER_CAPTURE_PARAM_FIELDS = [
  { tag: 1, name: "fps", defaultValue: "FPS_UNKNOWN" },
  { tag: 2, name: "video_quality", defaultValue: "VideoQuality_UNKNOWN" },
  { tag: 3, name: "cursor_capture", defaultValue: false },
  { tag: 4, name: "choose_resolution_type", defaultValue: "ChooseType_UNKNOWN" },
  { tag: 5, name: "local_resolution", defaultValue: null },
  { tag: 6, name: "choose_resolution", defaultValue: null },
  { tag: 7, name: "chroma_format", defaultValue: "ChromaFormat_UNKNOWN" },
  { tag: 8, name: "max_custom_bitrate", defaultValue: 0 },
  { tag: 9, name: "enable_hdr", defaultValue: false },
  { tag: 10, name: "auto_frame_quality", defaultValue: "VideoQuality_UNKNOWN" },
  { tag: 11, name: "fpsCount", defaultValue: 0 },
] as const satisfies readonly StreamerCaptureParamField[];

export const STREAMER_SCREEN_RESOLUTION_FIELDS = [
  { tag: 1, name: "width", defaultValue: 0 },
  { tag: 2, name: "height", defaultValue: 0 },
] as const;

export const STREAMER_FPS_VALUES = {
  FPS_UNKNOWN: 0,
  FPS_30: 1,
  FPS_60: 2,
  FPS_90: 3,
  FPS_144: 4,
} as const;

export const STREAMER_VIDEO_QUALITY_VALUES = {
  VideoQuality_UNKNOWN: 0,
  VideoQuality_Fast: 1,
  VideoQuality_General: 2,
  VideoQuality_HD: 3,
  VideoQuality_Bluray: 4,
  VideoQuality_Auto: 5,
  VideoQuality_Custom: 6,
} as const;

export const STREAMER_CHOOSE_RESOLUTION_TYPES = {
  ChooseType_UNKNOWN: 0,
  ChooseType_DEFAULT: 1,
  ChooseType_FOLLOW_LOCAL: 2,
  ChooseType_FOLLOW_REMOTE: 3,
  ChooseType_RESOLUTION: 4,
} as const;

export const STREAMER_CHROMA_FORMATS = {
  ChromaFormat_UNKNOWN: 0,
  ChromaFormat_420: 1,
  ChromaFormat_422: 2,
  ChromaFormat_444: 3,
  ChromaFormat_400: 4,
} as const;

export const STREAMER_VIDEO_CODECS = {
  Unknown: 0,
  H264: 1,
  H265: 2,
  VP8: 3,
  VP9: 4,
  AV1: 5,
} as const;

export const STREAMER_DECODER_CAP_FIELDS = [
  { tag: 1, name: "fps", defaultValue: 0 },
  { tag: 2, name: "codec_type", defaultValue: "CodecType_UNKNOWN" },
  { tag: 3, name: "resolution_width", defaultValue: 0 },
  { tag: 4, name: "resolution_height", defaultValue: 0 },
  { tag: 5, name: "chroma_format", defaultValue: "ChromaFormat_UNKNOWN" },
] as const;

export const STREAMER_DECODER_CODEC_TYPES = {
  CodecType_UNKNOWN: 0,
  CodecType_H264: 1,
  CodecType_H265: 2,
} as const;

export const STREAMER_DECODER_CHROMA_FORMATS = {
  ChromaFormat_UNKNOWN: 0,
  ChromaFormat_420: 1,
  ChromaFormat_422: 2,
  ChromaFormat_444: 3,
  ChromaFormat_400: 4,
} as const;

export const STREAMER_CAPTURE_PARAM_DEFAULTS = {
  fps: "FPS_UNKNOWN",
  videoQuality: "VideoQuality_UNKNOWN",
  cursorCapture: false,
  chooseResolutionType: "ChooseType_UNKNOWN",
  localResolution: null,
  chooseResolution: null,
  chromaFormat: "ChromaFormat_UNKNOWN",
  maxCustomBitrate: 0,
  enableHdr: false,
  autoFrameQuality: "VideoQuality_UNKNOWN",
  fpsCount: 0,
} as const;

export interface StreamerSoacCandidatePayload {
  candidate: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
}

export interface BuildStreamerControlStreamerDataJsonInput {
  controlId: string;
  iceId?: string;
  deviceCapability?: unknown;
}

export interface StreamerDisplayInfoCapability {
  id: number;
  fps: number;
  type: number;
  hdr: number;
}

export interface StreamerVideoCodecCapability {
  video_codec: number;
  width: number;
  height: number;
  chroma_sampling: number;
  bit_depth: number;
  codec_impl: number;
}

export interface StreamerDeviceCapability {
  display_info: StreamerDisplayInfoCapability[];
  video_codec_capability: StreamerVideoCodecCapability[];
  ice_id: string;
}

export const STREAMER_DEFAULT_BROWSER_DEVICE_CAPABILITY: StreamerDeviceCapability = {
  display_info: [
    {
      id: 0,
      fps: 60,
      type: 0,
      hdr: -1,
    },
  ],
  video_codec_capability: [
    {
      video_codec: STREAMER_VIDEO_CODECS.H264,
      width: 3840,
      height: 2160,
      chroma_sampling: STREAMER_CHROMA_FORMATS.ChromaFormat_420,
      bit_depth: 8,
      codec_impl: -1,
    },
  ],
  ice_id: "",
};

export function buildStreamerBrowserDeviceCapability(): StreamerDeviceCapability {
  return {
    display_info: STREAMER_DEFAULT_BROWSER_DEVICE_CAPABILITY.display_info.map((item) => ({ ...item })),
    video_codec_capability: STREAMER_DEFAULT_BROWSER_DEVICE_CAPABILITY.video_codec_capability.map((item) => ({
      ...item,
    })),
    ice_id: STREAMER_DEFAULT_BROWSER_DEVICE_CAPABILITY.ice_id,
  };
}

export function buildStreamerControlStreamerDataJson(input: BuildStreamerControlStreamerDataJsonInput): string {
  return JSON.stringify({
    control_id: input.controlId,
    device_capability: buildStreamerControlDeviceCapability(input),
  });
}

function buildStreamerControlDeviceCapability(input: BuildStreamerControlStreamerDataJsonInput): unknown {
  const capability = input.deviceCapability ?? buildStreamerBrowserDeviceCapability();
  if (!input.iceId) return capability;

  const record = asRecord(capability);
  return record ? { ...record, ice_id: input.iceId } : capability;
}

export interface StreamerControlIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface StreamerRtcConfiguration {
  iceServers: StreamerControlIceServer[];
  iceTransportPolicy: "all" | "relay";
}

export interface StreamerControlPeerNetworkInfo {
  country?: string;
  province?: string;
  city?: string;
  isp?: string;
  relayIsp?: string;
}

export interface StreamerSignalControlResult {
  clientId?: string;
  iceId?: string;
  appControlId?: string;
  code?: number;
  msg?: string;
  appDataBase64?: string;
  streamerData?: string;
  controllerPlatform?: number;
  forceRelay?: boolean;
  autoSwitchNetwork?: boolean;
  relayInsType?: number;
  forceAutoSwitchPacketLoss?: number;
  forceAutoSwitchLatency?: number;
  possibleAutoSwitchPacketLoss?: number;
  possibleAutoSwitchLatency?: number;
  iceServers: StreamerControlIceServer[];
  publisher?: StreamerControlPeerNetworkInfo;
  subscriber?: StreamerControlPeerNetworkInfo;
}

export interface StreamerSignalControlAck {
  ackStatus?: string;
  result?: StreamerSignalControlResult;
}

export interface StreamerSignalControlFailure {
  ackStatus?: string;
  code?: number;
  msg?: string;
  protocolError?: string;
}

export function normalizeStreamerSignalControlAck(ack: unknown): StreamerSignalControlAck {
  const entries = Array.isArray(ack) ? ack : [ack];
  const ackStatus = typeof entries[0] === "string" ? entries[0] : undefined;
  const resultRecord = entries.map(asRecord).find((record) => record !== null);
  const result = resultRecord ? normalizeStreamerSignalControlResult(resultRecord) : undefined;

  return result ? { ackStatus, result } : { ackStatus };
}

export function getStreamerSignalControlFailure(ack: StreamerSignalControlAck): StreamerSignalControlFailure | null {
  const failedStatus = ack.ackStatus !== undefined && ack.ackStatus !== "success";
  const failedCode = ack.result?.code !== undefined && ack.result.code !== 0;
  if (!failedStatus && !failedCode) return null;

  return {
    ackStatus: ack.ackStatus,
    code: ack.result?.code,
    msg: ack.result?.msg,
    protocolError: ack.result?.code !== undefined ? mapStreamerControlResultProtocolError(ack.result.code) : undefined,
  };
}

export function formatStreamerSignalControlFailure(failure: StreamerSignalControlFailure): string {
  return [
    failure.ackStatus && failure.ackStatus !== "success" ? `ack=${failure.ackStatus}` : null,
    typeof failure.code === "number" ? `code=${failure.code}` : null,
    failure.protocolError ? `protocol=${failure.protocolError}` : null,
    failure.msg ? `msg=${failure.msg}` : null,
  ].filter(Boolean).join(" ");
}

export function buildStreamerRtcConfiguration(
  result: StreamerSignalControlResult | null | undefined,
  options: { forceRelay?: boolean } = {},
): StreamerRtcConfiguration {
  const forceRelay = options.forceRelay ?? result?.forceRelay ?? false;
  return {
    iceServers: result?.iceServers.map((iceServer) => ({ ...iceServer })) ?? [],
    iceTransportPolicy: forceRelay ? "relay" : "all",
  };
}

function normalizeStreamerSignalControlResult(record: Record<string, unknown>): StreamerSignalControlResult {
  const result: StreamerSignalControlResult = {
    iceServers: normalizeStreamerControlIceServers(record.iceServers),
  };
  assignOptionalString(result, "clientId", record.client_id);
  assignOptionalString(result, "iceId", record.ice_id);
  assignOptionalString(result, "appControlId", record.app_control_id);
  assignOptionalString(result, "msg", record.msg);
  assignOptionalString(result, "streamerData", record.streamer_data);
  assignOptionalNumber(result, "code", record.code);
  assignOptionalNumber(result, "controllerPlatform", record.controller_platform);
  assignOptionalString(result, "appDataBase64", normalizeStreamerBinaryBase64(record.app_data));
  assignOptionalBoolean(result, "forceRelay", record.force_relay);
  assignOptionalBoolean(result, "autoSwitchNetwork", record.auto_switch_network);
  assignOptionalNumber(result, "relayInsType", record.relay_ins_type);
  assignOptionalNumber(result, "forceAutoSwitchPacketLoss", record.force_auto_switch_pkt_loss);
  assignOptionalNumber(result, "forceAutoSwitchLatency", record.force_auto_switch_latency);
  assignOptionalNumber(result, "possibleAutoSwitchPacketLoss", record.possible_auto_switch_pkt_loss);
  assignOptionalNumber(result, "possibleAutoSwitchLatency", record.possible_auto_switch_latency);

  const publisher = normalizeStreamerPeerNetworkInfo(record, "publisher");
  if (publisher) result.publisher = publisher;
  const subscriber = normalizeStreamerPeerNetworkInfo(record, "subscriber");
  if (subscriber) result.subscriber = subscriber;

  return result;
}

function normalizeStreamerControlIceServers(value: unknown): StreamerControlIceServer[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeStreamerControlIceServer).filter((item) => item !== null);
}

function normalizeStreamerControlIceServer(value: unknown): StreamerControlIceServer | null {
  const record = asRecord(value);
  if (!record) return null;

  const urls = normalizeStreamerIceServerUrls(record.urls);
  if (!urls) return null;

  const iceServer: StreamerControlIceServer = { urls };
  assignOptionalString(iceServer, "username", record.username);
  assignOptionalString(iceServer, "credential", record.credential);
  return iceServer;
}

function normalizeStreamerIceServerUrls(value: unknown): string | string[] | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (!Array.isArray(value)) return null;

  const urls = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  if (urls.length === 0) return null;
  return urls;
}

function normalizeStreamerBinaryBase64(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;

  const record = asRecord(value);
  if (!record) return undefined;
  return typeof record.base64 === "string" && record.base64.length > 0 ? record.base64 : undefined;
}

function normalizeStreamerPeerNetworkInfo(
  record: Record<string, unknown>,
  prefix: "publisher" | "subscriber",
): StreamerControlPeerNetworkInfo | undefined {
  const info: StreamerControlPeerNetworkInfo = {};
  assignOptionalString(info, "country", record[`${prefix}_country`]);
  assignOptionalString(info, "province", record[`${prefix}_province`]);
  assignOptionalString(info, "city", record[`${prefix}_city`]);
  assignOptionalString(info, "isp", record[`${prefix}_isp`]);
  assignOptionalString(info, "relayIsp", record[`${prefix}_relay_isp`]);

  return Object.keys(info).length > 0 ? info : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function assignOptionalString<T extends object, K extends keyof T>(target: T, key: K, value: unknown): void {
  if (typeof value === "string") {
    target[key] = value as T[K];
  }
}

function assignOptionalNumber<T extends object, K extends keyof T>(target: T, key: K, value: unknown): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    target[key] = value as T[K];
  }
}

function assignOptionalBoolean<T extends object, K extends keyof T>(target: T, key: K, value: unknown): void {
  if (typeof value === "boolean") {
    target[key] = value as T[K];
  }
}

export interface BuildStreamerSoacPayloadInput {
  type: StreamerSoacType;
  clientId?: string;
  appControlId?: string;
  iceId?: string;
  sdp?: string;
  gzipSdp?: boolean;
  iceNetworkType?: StreamerIceNetworkType;
  candidate?: StreamerSoacCandidatePayload;
}

export interface StreamerSoacPayload {
  client_id?: string;
  data: {
    type: StreamerSoacType;
    sdp?: string;
    ice_id?: string;
    app_control_id?: string;
    gzip_sdp?: unknown;
    ice_network_type?: StreamerIceNetworkType;
    candidate?: StreamerSoacCandidatePayload;
  };
}

export function buildStreamerSoacPayload(input: BuildStreamerSoacPayloadInput): StreamerSoacPayload {
  const data: StreamerSoacPayload["data"] = { type: input.type };
  if (input.sdp !== undefined) {
    data.sdp = input.sdp;
  }
  if (input.iceId !== undefined) data.ice_id = input.iceId;
  if (input.appControlId !== undefined) data.app_control_id = input.appControlId;
  if (input.type !== "candidate" && input.iceNetworkType !== undefined) {
    data.ice_network_type = input.iceNetworkType;
  }
  if (input.candidate !== undefined) data.candidate = input.candidate;

  return input.clientId === undefined
    ? { data }
    : {
        client_id: input.clientId,
        data,
      };
}

export const STREAMER_SEND_TO_ROM_WIRE_FIELDS = {
  envelopeTag: 11,
  inputTypeTag: 1,
  inputMessageTag: 2,
  displayIdTag: 3,
} as const;

export const STREAMER_ROM_MESSAGE_WIRE_FIELDS = {
  envelopeTag: 10,
  nameTag: 1,
  valueTag: 2,
  displayIdTag: 3,
  byteValueTag: 4,
} as const;

export const STREAMER_SIMPLE_ACTION_WIRE_FIELDS = {
  envelopeTag: 3,
  actionTag: 1,
  argsTag: 2,
  featureFlagTag: 4,
} as const;

export const STREAMER_SIMPLE_ACTION_TYPES = {
  ACTION_TYPE_ECHO_REQUEST: 0,
  ACTION_TYPE_ECHO_RESPONSE: 1,
} as const;

export const STREAMER_ROM_MESSAGE_TYPES = {
  RomMsg_VINPUT: 0,
  RomMsg_Text: 1,
  RomMsg_Snapshot: 2,
  RomMsg_TabManage: 3,
  RomMsg_Rotation: 4,
  RomMsg_Volume: 5,
} as const;

export type StreamerRomMessageType = (typeof STREAMER_ROM_MESSAGE_TYPES)[keyof typeof STREAMER_ROM_MESSAGE_TYPES];

export const STREAMER_CAPTURE_CHANGE_TYPES = {
  CT_DESKTOP: 0,
  CT_WINDOW: 1,
  CT_MUMU: 2,
  CT_HOOK: 3,
  CT_NONE: 99,
} as const;

export interface EncodeStreamerRomMessageInput {
  sequence: number | bigint;
  timestampMs: number | bigint;
  inputType: StreamerRomMessageType;
  inputMessage: string;
  displayId?: number;
}

export interface EncodeStreamerInputMessageInput {
  sequence: number | bigint;
  timestampMs: number | bigint;
  inputMessage: string;
  displayId?: number;
}

export const STREAMER_SIMPLE_ACTION_FEATURE_FLAG_FIELDS = [
  { tag: 1, name: "useClipboard" },
  { tag: 2, name: "autoClipboard" },
  { tag: 3, name: "enableKeyMouse" },
  { tag: 4, name: "enableGamepad" },
  { tag: 6, name: "enableTouch" },
  { tag: 7, name: "enableIme" },
  { tag: 8, name: "enableDisplayControl" },
] as const;

export type StreamerSimpleActionFeatureFlagName = (typeof STREAMER_SIMPLE_ACTION_FEATURE_FLAG_FIELDS)[number]["name"];

export type StreamerSimpleActionFeatureFlagsInput = Partial<Record<StreamerSimpleActionFeatureFlagName, number>>;

export const STREAMER_DEFAULT_SIMPLE_ACTION_FEATURE_FLAGS = {
  useClipboard: 2,
  autoClipboard: 1,
  enableKeyMouse: 2,
  enableGamepad: 2,
  enableTouch: 2,
  enableIme: 2,
  enableDisplayControl: 3,
} as const satisfies StreamerSimpleActionFeatureFlagsInput;

export interface EncodeStreamerEchoRequestMessageInput {
  sequence: number | bigint;
  timestampMs: number | bigint;
  featureFlags?: StreamerSimpleActionFeatureFlagsInput | null;
}

export interface EncodeStreamerEchoResponseMessageInput {
  sequence: number | bigint;
  timestampMs: number | bigint;
  responseSequence: number | bigint;
  featureFlags?: StreamerSimpleActionFeatureFlagsInput | null;
}

export interface DecodedStreamerSimpleAction {
  action: number;
  actionName?: string;
  args?: string;
  seq?: number;
  featureFlags?: StreamerSimpleActionFeatureFlagsInput;
}

export interface DecodedStreamerCaptureChange {
  captureType: number;
  captureTypeName?: string;
  captureId?: number;
  desc?: string;
}

export interface DecodedStreamerSendToRom {
  inputType: number;
  inputTypeName?: string;
  inputMessage?: string;
  displayId?: number;
}

export interface DecodedStreamerRomMessage {
  name?: string;
  value?: string;
  displayId?: number;
  byteValueLength?: number;
}

export interface DecodedStreamerControlMessage {
  sequence?: number;
  timestampMs?: number;
  byteLength: number;
  topLevelTags: number[];
  simpleAction?: DecodedStreamerSimpleAction;
  captureChange?: DecodedStreamerCaptureChange;
  romMessage?: DecodedStreamerRomMessage;
  sendToRom?: DecodedStreamerSendToRom;
}

export interface StreamerScreenResolutionInput {
  width: number;
  height: number;
}

export interface StreamerVirtualDisplayModeInput extends StreamerScreenResolutionInput {
  fps?: number;
}

export interface EncodeStreamerCaptureParamsInput {
  fps?: number;
  videoQuality?: number;
  cursorCapture?: boolean;
  chooseResolutionType?: number;
  localResolution?: StreamerScreenResolutionInput | null;
  chooseResolution?: StreamerScreenResolutionInput | null;
  chromaFormat?: number;
  maxCustomBitrate?: number;
  enableHdr?: boolean;
  autoFrameQuality?: number;
  fpsCount?: number;
}

export interface EncodeStreamerDecoderCapInput {
  fps?: number;
  codecType?: number;
  width?: number;
  height?: number;
  chromaFormat?: number;
}

export type StreamerFeatureFlagsInput = Partial<Record<(typeof STREAMER_FEATURE_FLAG_FIELDS)[number]["name"], number>>;

export interface EncodeStreamerConnectOptionsInput {
  captureType?: number;
  typeValue?: number;
  captureParams?: EncodeStreamerCaptureParamsInput | null;
  decoderCapList?: readonly Uint8Array[];
  forceVirtualDisplay?: boolean;
  virtualDisplayModes?: readonly StreamerVirtualDisplayModeInput[];
  virtualDisplayInitResolution?: StreamerScreenResolutionInput | null;
  clientType?: number;
  deviceId: string;
  controlConnectType?: number;
  featureFlags?: StreamerFeatureFlagsInput | null;
  clientVersion?: string;
}

export interface BuildDefaultStreamerConnectOptionsBase64Input {
  deviceId: string;
  controlConnectType?: number;
  fps?: number;
  videoQuality?: number;
  cursorCapture?: boolean;
  localResolution?: StreamerScreenResolutionInput | null;
  virtualDisplayModes?: readonly StreamerVirtualDisplayModeInput[];
}

const protobufWireType = {
  varint: 0,
  lengthDelimited: 2,
} as const;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function pushVarint(bytes: number[], value: number | bigint): void {
  let remaining = BigInt(value);
  if (remaining < 0n) {
    throw new RangeError("protobuf varint value must be non-negative");
  }

  do {
    let byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining !== 0n) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0n);
}

function pushFieldKey(bytes: number[], fieldNumber: number, wireType: number): void {
  pushVarint(bytes, (fieldNumber << 3) | wireType);
}

function pushInt32Field(bytes: number[], fieldNumber: number, value: number): void {
  pushFieldKey(bytes, fieldNumber, protobufWireType.varint);
  pushVarint(bytes, value < 0 ? BigInt.asUintN(64, BigInt(value)) : value);
}

function pushStringField(bytes: number[], fieldNumber: number, value: string): void {
  const encoded = textEncoder.encode(value);
  pushFieldKey(bytes, fieldNumber, protobufWireType.lengthDelimited);
  pushVarint(bytes, encoded.length);
  for (const byte of encoded) bytes.push(byte);
}

function pushVarintField(bytes: number[], fieldNumber: number, value: number | bigint): void {
  pushFieldKey(bytes, fieldNumber, protobufWireType.varint);
  pushVarint(bytes, value);
}

function pushMessageField(bytes: number[], fieldNumber: number, payload: Uint8Array): void {
  pushFieldKey(bytes, fieldNumber, protobufWireType.lengthDelimited);
  pushVarint(bytes, payload.length);
  for (const byte of payload) bytes.push(byte);
}

export function encodeStreamerConnectOptions(input: EncodeStreamerConnectOptionsInput): Uint8Array {
  const bytes: number[] = [];
  const captureType = input.captureType ?? STREAMER_CAPTURE_TYPES.CT_DESKTOP;
  const typeValue = input.typeValue ?? 0;
  const clientType = input.clientType ?? STREAMER_CLIENT_TYPES.Client_ANDROID;
  const controlConnectType = input.controlConnectType ?? STREAMER_CONTROL_CONNECT_TYPES.ControlConnectType_Normal;
  const clientVersion = input.clientVersion ?? STREAMER_APP_CLIENT_VERSION;

  if (captureType !== STREAMER_CAPTURE_TYPES.CT_UNKNOWN) pushVarintField(bytes, 1, captureType);
  if (typeValue !== 0) pushInt32Field(bytes, 2, typeValue);

  const captureParamsBytes = input.captureParams === null ? new Uint8Array() : encodeStreamerCaptureParams(input.captureParams ?? {});
  if (captureParamsBytes.length > 0) pushMessageField(bytes, 3, captureParamsBytes);

  for (const decoderCap of input.decoderCapList ?? []) {
    pushMessageField(bytes, 4, decoderCap);
  }
  if (input.forceVirtualDisplay) pushVarintField(bytes, 5, 1);
  for (const mode of input.virtualDisplayModes ?? []) {
    pushMessageField(bytes, 6, encodeStreamerVirtualDisplayMode(mode));
  }
  if (input.virtualDisplayInitResolution) {
    pushMessageField(bytes, 7, encodeStreamerScreenResolution(input.virtualDisplayInitResolution));
  }
  if (clientType !== STREAMER_CLIENT_TYPES.Client_UNSPECIFIED) pushVarintField(bytes, 8, clientType);
  if (input.deviceId.length > 0) pushStringField(bytes, 9, input.deviceId);
  if (controlConnectType !== STREAMER_CONTROL_CONNECT_TYPES.ControlConnectType_UNKNOWN) {
    pushVarintField(bytes, 10, controlConnectType);
  }

  const featureFlagBytes = encodeStreamerFeatureFlags(input.featureFlags ?? STREAMER_DEFAULT_FEATURE_FLAGS);
  if (featureFlagBytes.length > 0) pushMessageField(bytes, 11, featureFlagBytes);
  if (clientVersion.length > 0) pushStringField(bytes, 12, clientVersion);

  return new Uint8Array(bytes);
}

export function buildDefaultStreamerConnectOptionsBase64(input: BuildDefaultStreamerConnectOptionsBase64Input): string {
  const bytes = encodeStreamerConnectOptions({
    deviceId: input.deviceId,
    captureType: STREAMER_CAPTURE_TYPES.CT_DESKTOP,
    typeValue: STREAMER_DEFAULT_BROWSER_TYPE_VALUE,
    captureParams: {
      fps: input.fps ?? STREAMER_FPS_VALUES.FPS_60,
      videoQuality: input.videoQuality ?? STREAMER_VIDEO_QUALITY_VALUES.VideoQuality_HD,
      cursorCapture: input.cursorCapture ?? true,
      chooseResolutionType: STREAMER_CHOOSE_RESOLUTION_TYPES.ChooseType_DEFAULT,
      localResolution: input.localResolution ?? STREAMER_DEFAULT_BROWSER_LOCAL_RESOLUTION,
    },
    decoderCapList: [buildDefaultStreamerDecoderCap()],
    virtualDisplayModes: input.virtualDisplayModes ?? [STREAMER_DEFAULT_BROWSER_VIRTUAL_DISPLAY_MODE],
    clientType: STREAMER_CLIENT_TYPES.Client_ANDROID,
    controlConnectType: input.controlConnectType ?? STREAMER_CONTROL_CONNECT_TYPES.ControlConnectType_Normal,
    featureFlags: STREAMER_DEFAULT_FEATURE_FLAGS,
    clientVersion: STREAMER_APP_CLIENT_VERSION,
  });
  return encodeBase64(bytes);
}

export function buildDefaultStreamerDecoderCap(): Uint8Array {
  return encodeStreamerDecoderCap({
    fps: 60,
    codecType: STREAMER_DECODER_CODEC_TYPES.CodecType_H264,
    width: 3840,
    height: 2160,
    chromaFormat: STREAMER_DECODER_CHROMA_FORMATS.ChromaFormat_420,
  });
}

export function encodeStreamerDecoderCap(input: EncodeStreamerDecoderCapInput): Uint8Array {
  const bytes: number[] = [];
  if (input.fps) pushInt32Field(bytes, 1, input.fps);
  const codecType = input.codecType ?? STREAMER_DECODER_CODEC_TYPES.CodecType_UNKNOWN;
  if (codecType !== STREAMER_DECODER_CODEC_TYPES.CodecType_UNKNOWN) pushVarintField(bytes, 2, codecType);
  if (input.width) pushInt32Field(bytes, 3, input.width);
  if (input.height) pushInt32Field(bytes, 4, input.height);
  const chromaFormat = input.chromaFormat ?? STREAMER_DECODER_CHROMA_FORMATS.ChromaFormat_UNKNOWN;
  if (chromaFormat !== STREAMER_DECODER_CHROMA_FORMATS.ChromaFormat_UNKNOWN) pushVarintField(bytes, 5, chromaFormat);
  return new Uint8Array(bytes);
}

function encodeStreamerCaptureParams(input: EncodeStreamerCaptureParamsInput): Uint8Array {
  const bytes: number[] = [];
  if (input.fps && input.fps !== STREAMER_FPS_VALUES.FPS_UNKNOWN) pushVarintField(bytes, 1, input.fps);
  if (input.videoQuality && input.videoQuality !== STREAMER_VIDEO_QUALITY_VALUES.VideoQuality_UNKNOWN) {
    pushVarintField(bytes, 2, input.videoQuality);
  }
  if (input.cursorCapture) pushVarintField(bytes, 3, 1);
  if (input.chooseResolutionType && input.chooseResolutionType !== STREAMER_CHOOSE_RESOLUTION_TYPES.ChooseType_UNKNOWN) {
    pushVarintField(bytes, 4, input.chooseResolutionType);
  }
  if (input.localResolution) pushMessageField(bytes, 5, encodeStreamerScreenResolution(input.localResolution));
  if (input.chooseResolution) pushMessageField(bytes, 6, encodeStreamerScreenResolution(input.chooseResolution));
  if (input.chromaFormat && input.chromaFormat !== STREAMER_CHROMA_FORMATS.ChromaFormat_UNKNOWN) {
    pushVarintField(bytes, 7, input.chromaFormat);
  }
  if (input.maxCustomBitrate) pushInt32Field(bytes, 8, input.maxCustomBitrate);
  if (input.enableHdr) pushVarintField(bytes, 9, 1);
  if (input.autoFrameQuality && input.autoFrameQuality !== STREAMER_VIDEO_QUALITY_VALUES.VideoQuality_UNKNOWN) {
    pushVarintField(bytes, 10, input.autoFrameQuality);
  }
  if (input.fpsCount) pushInt32Field(bytes, 11, input.fpsCount);
  return new Uint8Array(bytes);
}

function encodeStreamerScreenResolution(input: StreamerScreenResolutionInput): Uint8Array {
  const bytes: number[] = [];
  if (input.width) pushInt32Field(bytes, 1, input.width);
  if (input.height) pushInt32Field(bytes, 2, input.height);
  return new Uint8Array(bytes);
}

function encodeStreamerVirtualDisplayMode(input: StreamerVirtualDisplayModeInput): Uint8Array {
  const bytes: number[] = [];
  if (input.width) pushInt32Field(bytes, 1, input.width);
  if (input.height) pushInt32Field(bytes, 2, input.height);
  if (input.fps) pushInt32Field(bytes, 3, input.fps);
  return new Uint8Array(bytes);
}

function encodeStreamerFeatureFlags(input: StreamerFeatureFlagsInput): Uint8Array {
  const bytes: number[] = [];
  for (const field of STREAMER_FEATURE_FLAG_FIELDS) {
    const value = input[field.name] ?? 0;
    if (value) pushInt32Field(bytes, field.tag, value);
  }
  return new Uint8Array(bytes);
}

function encodeBase64(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = bytes[index + 1];
    const c = bytes[index + 2];
    output += alphabet[a >> 2];
    output += alphabet[((a & 0x03) << 4) | ((b ?? 0) >> 4)];
    output += b === undefined ? "=" : alphabet[((b & 0x0f) << 2) | ((c ?? 0) >> 6)];
    output += c === undefined ? "=" : alphabet[c & 0x3f];
  }
  return output;
}

export function encodeStreamerRomMessage(input: EncodeStreamerRomMessageInput): Uint8Array {
  const romMessageBytes: number[] = [];
  if (input.inputType !== STREAMER_ROM_MESSAGE_TYPES.RomMsg_VINPUT) {
    pushVarintField(romMessageBytes, STREAMER_SEND_TO_ROM_WIRE_FIELDS.inputTypeTag, input.inputType);
  }
  if (input.inputMessage !== "") {
    pushStringField(romMessageBytes, STREAMER_SEND_TO_ROM_WIRE_FIELDS.inputMessageTag, input.inputMessage);
  }
  if (input.displayId) {
    pushVarintField(romMessageBytes, STREAMER_SEND_TO_ROM_WIRE_FIELDS.displayIdTag, input.displayId);
  }

  const envelopeBytes: number[] = [];
  pushVarintField(envelopeBytes, 1, input.sequence);
  pushVarintField(envelopeBytes, 2, input.timestampMs);
  pushMessageField(envelopeBytes, STREAMER_SEND_TO_ROM_WIRE_FIELDS.envelopeTag, new Uint8Array(romMessageBytes));
  return new Uint8Array(envelopeBytes);
}

export function encodeStreamerControlStringMessage(inputMessage: string): Uint8Array {
  return new TextEncoder().encode(inputMessage);
}

export function encodeStreamerEchoRequestMessage(input: EncodeStreamerEchoRequestMessageInput): Uint8Array {
  return encodeStreamerSimpleActionMessage({
    sequence: input.sequence,
    timestampMs: input.timestampMs,
    actionType: STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_REQUEST,
    args: `{"seq":${formatJsonNumber(input.sequence)}}`,
    featureFlags: input.featureFlags,
  });
}

export function encodeStreamerEchoResponseMessage(input: EncodeStreamerEchoResponseMessageInput): Uint8Array {
  return encodeStreamerSimpleActionMessage({
    sequence: input.sequence,
    timestampMs: input.timestampMs,
    actionType: STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_RESPONSE,
    args: `{"seq":${formatJsonNumber(input.responseSequence)}}`,
    featureFlags: input.featureFlags,
  });
}

function encodeStreamerSimpleActionMessage(input: {
  sequence: number | bigint;
  timestampMs: number | bigint;
  actionType: number;
  args: string;
  featureFlags?: StreamerSimpleActionFeatureFlagsInput | null;
}): Uint8Array {
  const actionBytes: number[] = [];
  if (input.actionType !== STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_REQUEST) {
    pushVarintField(actionBytes, STREAMER_SIMPLE_ACTION_WIRE_FIELDS.actionTag, input.actionType);
  }
  pushStringField(actionBytes, STREAMER_SIMPLE_ACTION_WIRE_FIELDS.argsTag, input.args);
  pushMessageField(
    actionBytes,
    STREAMER_SIMPLE_ACTION_WIRE_FIELDS.featureFlagTag,
    encodeStreamerSimpleActionFeatureFlags(input.featureFlags ?? STREAMER_DEFAULT_SIMPLE_ACTION_FEATURE_FLAGS),
  );

  const envelopeBytes: number[] = [];
  pushVarintField(envelopeBytes, 1, input.sequence);
  pushVarintField(envelopeBytes, 2, input.timestampMs);
  pushMessageField(envelopeBytes, STREAMER_SIMPLE_ACTION_WIRE_FIELDS.envelopeTag, new Uint8Array(actionBytes));
  return new Uint8Array(envelopeBytes);
}

export function decodeStreamerControlMessage(data: ArrayBuffer | ArrayBufferView): DecodedStreamerControlMessage {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const fields = readProtobufFields(bytes);
  const decoded: DecodedStreamerControlMessage = {
    byteLength: bytes.byteLength,
    topLevelTags: fields.map((field) => field.tag),
  };

  for (const field of fields) {
    if (field.tag === 1 && field.varint !== undefined) decoded.sequence = safeNumber(field.varint);
    if (field.tag === 2 && field.varint !== undefined) decoded.timestampMs = safeNumber(field.varint);
    if (field.tag === STREAMER_SIMPLE_ACTION_WIRE_FIELDS.envelopeTag && field.bytes) {
      decoded.simpleAction = decodeStreamerSimpleAction(field.bytes);
    }
    if (field.tag === 8 && field.bytes) {
      decoded.captureChange = decodeStreamerCaptureChange(field.bytes);
    }
    if (field.tag === STREAMER_ROM_MESSAGE_WIRE_FIELDS.envelopeTag && field.bytes) {
      decoded.romMessage = decodeStreamerRomMessage(field.bytes);
    }
    if (field.tag === STREAMER_SEND_TO_ROM_WIRE_FIELDS.envelopeTag && field.bytes) {
      decoded.sendToRom = decodeStreamerSendToRom(field.bytes);
    }
  }

  return decoded;
}

export function encodeStreamerInputMessage(input: EncodeStreamerInputMessageInput): Uint8Array {
  return encodeStreamerRomMessage({
    ...input,
    inputType: STREAMER_ROM_MESSAGE_TYPES.RomMsg_VINPUT,
  });
}

export function encodeStreamerTextMessage(input: EncodeStreamerInputMessageInput): Uint8Array {
  return encodeStreamerRomMessage({
    ...input,
    inputType: STREAMER_ROM_MESSAGE_TYPES.RomMsg_Text,
  });
}

function encodeStreamerSimpleActionFeatureFlags(input: StreamerSimpleActionFeatureFlagsInput): Uint8Array {
  const bytes: number[] = [];
  for (const field of STREAMER_SIMPLE_ACTION_FEATURE_FLAG_FIELDS) {
    const value = input[field.name] ?? 0;
    if (value) pushInt32Field(bytes, field.tag, value);
  }
  return new Uint8Array(bytes);
}

interface ProtobufField {
  tag: number;
  wireType: number;
  varint?: bigint;
  bytes?: Uint8Array;
}

function readProtobufFields(bytes: Uint8Array): ProtobufField[] {
  const fields: ProtobufField[] = [];
  let offset = 0;

  while (offset < bytes.byteLength) {
    const key = readProtobufVarint(bytes, offset);
    offset = key.nextOffset;
    const tag = Number(key.value >> 3n);
    const wireType = Number(key.value & 0x07n);
    if (!Number.isSafeInteger(tag) || tag <= 0) break;

    if (wireType === protobufWireType.varint) {
      const value = readProtobufVarint(bytes, offset);
      offset = value.nextOffset;
      fields.push({ tag, wireType, varint: value.value });
      continue;
    }

    if (wireType === protobufWireType.lengthDelimited) {
      const length = readProtobufVarint(bytes, offset);
      offset = length.nextOffset;
      const byteLength = Number(length.value);
      if (!Number.isSafeInteger(byteLength) || byteLength < 0 || offset + byteLength > bytes.byteLength) break;
      fields.push({ tag, wireType, bytes: bytes.slice(offset, offset + byteLength) });
      offset += byteLength;
      continue;
    }

    break;
  }

  return fields;
}

function readProtobufVarint(bytes: Uint8Array, startOffset: number): { value: bigint; nextOffset: number } {
  let value = 0n;
  let shift = 0n;
  let offset = startOffset;

  while (offset < bytes.byteLength) {
    const byte = bytes[offset];
    value |= BigInt(byte & 0x7f) << shift;
    offset += 1;
    if ((byte & 0x80) === 0) return { value, nextOffset: offset };
    shift += 7n;
    if (shift > 63n) break;
  }

  return { value, nextOffset: offset };
}

function decodeStreamerSimpleAction(bytes: Uint8Array): DecodedStreamerSimpleAction {
  const fields = readProtobufFields(bytes);
  let action: number = STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_REQUEST;
  let args: string | undefined;
  let featureFlags: StreamerSimpleActionFeatureFlagsInput | undefined;

  for (const field of fields) {
    if (field.tag === STREAMER_SIMPLE_ACTION_WIRE_FIELDS.actionTag && field.varint !== undefined) {
      action = safeNumber(field.varint) ?? action;
    }
    if (field.tag === STREAMER_SIMPLE_ACTION_WIRE_FIELDS.argsTag && field.bytes) {
      args = textDecoder.decode(field.bytes);
    }
    if (field.tag === STREAMER_SIMPLE_ACTION_WIRE_FIELDS.featureFlagTag && field.bytes) {
      featureFlags = decodeStreamerSimpleActionFeatureFlags(field.bytes);
    }
  }

  return {
    action,
    actionName: streamerSimpleActionName(action),
    args,
    seq: args === undefined ? undefined : readStreamerActionArgsSeq(args),
    featureFlags,
  };
}

function decodeStreamerSimpleActionFeatureFlags(bytes: Uint8Array): StreamerSimpleActionFeatureFlagsInput {
  const featureFlags: StreamerSimpleActionFeatureFlagsInput = {};
  const fields = readProtobufFields(bytes);
  for (const field of fields) {
    if (field.varint === undefined) continue;
    const definition = STREAMER_SIMPLE_ACTION_FEATURE_FLAG_FIELDS.find((item) => item.tag === field.tag);
    if (!definition) continue;
    const value = safeNumber(field.varint);
    if (value !== undefined) featureFlags[definition.name] = value;
  }
  return featureFlags;
}

function decodeStreamerCaptureChange(bytes: Uint8Array): DecodedStreamerCaptureChange {
  const fields = readProtobufFields(bytes);
  let captureType: number = STREAMER_CAPTURE_CHANGE_TYPES.CT_DESKTOP;
  let captureId: number | undefined;
  let desc: string | undefined;

  for (const field of fields) {
    if (field.tag === 1 && field.varint !== undefined) captureType = safeNumber(field.varint) ?? captureType;
    if (field.tag === 2 && field.varint !== undefined) captureId = safeNumber(field.varint);
    if (field.tag === 3 && field.bytes) desc = textDecoder.decode(field.bytes);
  }

  return {
    captureType,
    captureTypeName: streamerCaptureTypeName(captureType),
    captureId,
    desc,
  };
}

function decodeStreamerSendToRom(bytes: Uint8Array): DecodedStreamerSendToRom {
  const fields = readProtobufFields(bytes);
  let inputType: number = STREAMER_ROM_MESSAGE_TYPES.RomMsg_VINPUT;
  let inputMessage: string | undefined;
  let displayId: number | undefined;

  for (const field of fields) {
    if (field.tag === STREAMER_SEND_TO_ROM_WIRE_FIELDS.inputTypeTag && field.varint !== undefined) {
      inputType = safeNumber(field.varint) ?? inputType;
    }
    if (field.tag === STREAMER_SEND_TO_ROM_WIRE_FIELDS.inputMessageTag && field.bytes) {
      inputMessage = textDecoder.decode(field.bytes);
    }
    if (field.tag === STREAMER_SEND_TO_ROM_WIRE_FIELDS.displayIdTag && field.varint !== undefined) {
      displayId = safeNumber(field.varint);
    }
  }

  return {
    inputType,
    inputTypeName: streamerRomMessageTypeName(inputType),
    inputMessage,
    displayId,
  };
}

function decodeStreamerRomMessage(bytes: Uint8Array): DecodedStreamerRomMessage {
  const fields = readProtobufFields(bytes);
  const decoded: DecodedStreamerRomMessage = {};

  for (const field of fields) {
    if (field.tag === STREAMER_ROM_MESSAGE_WIRE_FIELDS.nameTag && field.bytes) {
      decoded.name = textDecoder.decode(field.bytes);
    }
    if (field.tag === STREAMER_ROM_MESSAGE_WIRE_FIELDS.valueTag && field.bytes) {
      decoded.value = textDecoder.decode(field.bytes);
    }
    if (field.tag === STREAMER_ROM_MESSAGE_WIRE_FIELDS.displayIdTag && field.varint !== undefined) {
      decoded.displayId = safeNumber(field.varint);
    }
    if (field.tag === STREAMER_ROM_MESSAGE_WIRE_FIELDS.byteValueTag && field.bytes) {
      decoded.byteValueLength = field.bytes.byteLength;
    }
  }

  return decoded;
}

function readStreamerActionArgsSeq(args: string): number | undefined {
  try {
    const parsed = JSON.parse(args) as unknown;
    const record = asRecord(parsed);
    const seq = record?.seq;
    if (typeof seq === "number" && Number.isSafeInteger(seq)) return seq;
    if (typeof seq === "string" && /^\d+$/.test(seq)) {
      const value = Number(seq);
      return Number.isSafeInteger(value) ? value : undefined;
    }
  } catch {
    const match = args.match(/"seq"\s*:\s*(\d+)/);
    if (match) {
      const value = Number(match[1]);
      return Number.isSafeInteger(value) ? value : undefined;
    }
  }
  return undefined;
}

function safeNumber(value: bigint): number | undefined {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : undefined;
}

function streamerSimpleActionName(action: number): string | undefined {
  if (action === STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_REQUEST) return "ACTION_TYPE_ECHO_REQUEST";
  if (action === STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_RESPONSE) return "ACTION_TYPE_ECHO_RESPONSE";
  return undefined;
}

function streamerCaptureTypeName(captureType: number): string | undefined {
  if (captureType === STREAMER_CAPTURE_CHANGE_TYPES.CT_DESKTOP) return "CT_DESKTOP";
  if (captureType === STREAMER_CAPTURE_CHANGE_TYPES.CT_WINDOW) return "CT_WINDOW";
  if (captureType === STREAMER_CAPTURE_CHANGE_TYPES.CT_MUMU) return "CT_MUMU";
  if (captureType === STREAMER_CAPTURE_CHANGE_TYPES.CT_HOOK) return "CT_HOOK";
  if (captureType === STREAMER_CAPTURE_CHANGE_TYPES.CT_NONE) return "CT_NONE";
  return undefined;
}

function streamerRomMessageTypeName(inputType: number): string | undefined {
  for (const [name, value] of Object.entries(STREAMER_ROM_MESSAGE_TYPES)) {
    if (value === inputType) return name;
  }
  return undefined;
}

function formatJsonNumber(value: number | bigint): string {
  return BigInt(value).toString();
}

export const STREAMER_INPUT_MANAGER_IME_CONTROL_CODES = {
  BACKSPACE: 14,
  ENTER: 28,
  HIDESELF: 100001,
} as const;

export type StreamerImeControlKind = keyof typeof STREAMER_INPUT_MANAGER_IME_CONTROL_CODES;

export const STREAMER_MUMU_SYSTEM_KEY_CODES = {
  BACK: 158,
  HOME: 172,
  MENU: 580,
} as const;

export type StreamerMumuSystemKey = keyof typeof STREAMER_MUMU_SYSTEM_KEY_CODES;

export const STREAMER_DESKTOP_INPUT_EVENT_TYPES = {
  mousePress: "mouse_press",
  mouseRelease: "mouse_release",
  mouseClick: "mouse_click",
  mouseMoveAbsolute: "mouse_move_absolute",
  mouseMoveRelative: "mouse_move_relative",
  mouseScroll: "mouse_scroll",
  keyboardPress: "kbd_press",
  keyboardRelease: "kbd_release",
  keyboardClick: "kbd_click",
} as const;

export type StreamerDesktopInputEventKind = keyof typeof STREAMER_DESKTOP_INPUT_EVENT_TYPES;

export const STREAMER_MOUSE_BUTTON_CODES = {
  primary: 1,
  secondary: 2,
  tertiary: 4,
  back: 8,
  forward: 16,
} as const;

export type StreamerMouseButtonKind = keyof typeof STREAMER_MOUSE_BUTTON_CODES;

export const STREAMER_INPUT_MANAGER_TOUCH_SLOTS = [26, 27, 28, 29, 30, 31] as const;

export interface BuildStreamerSystemKeyInputMessagesInput {
  displayId: number;
  key: StreamerMumuSystemKey;
}

export interface BuildStreamerMouseButtonInputMessageInput {
  action: "mousePress" | "mouseRelease" | "mouseClick";
  button: StreamerMouseButtonKind | number;
}

export interface BuildStreamerMouseMoveAbsoluteInputMessageInput {
  absX: number;
  absY: number;
}

export interface BuildStreamerMacMouseMoveAbsoluteInputMessageInput extends BuildStreamerMouseMoveAbsoluteInputMessageInput {
  surfaceWidth: number;
  surfaceHeight: number;
}

export interface BuildStreamerMouseScrollInputMessageInput {
  deltaX: number;
  deltaY: number;
}

export interface BuildStreamerKeyboardInputMessageInput {
  action: "keyboardPress" | "keyboardRelease" | "keyboardClick";
  value: string | number;
}

export const STREAMER_ANDROID_TO_MAC_KEY_CODES: Readonly<Record<number, number>> = {
  7: 29,
  8: 18,
  9: 19,
  10: 20,
  11: 21,
  12: 23,
  13: 22,
  14: 26,
  15: 28,
  16: 25,
  19: 126,
  20: 125,
  21: 123,
  22: 124,
  24: 72,
  25: 73,
  29: 0,
  30: 11,
  31: 8,
  32: 2,
  33: 14,
  34: 3,
  35: 5,
  36: 4,
  37: 34,
  38: 38,
  39: 40,
  40: 37,
  41: 46,
  42: 45,
  43: 31,
  44: 35,
  45: 12,
  46: 15,
  47: 1,
  48: 17,
  49: 32,
  50: 9,
  51: 13,
  52: 7,
  53: 16,
  54: 6,
  55: 43,
  56: 47,
  57: 58,
  58: 61,
  59: 56,
  60: 60,
  61: 48,
  62: 49,
  66: 36,
  67: 51,
  68: 50,
  69: 27,
  70: 24,
  71: 33,
  72: 30,
  73: 42,
  74: 41,
  75: 39,
  76: 44,
  81: 24,
  92: 116,
  93: 121,
  111: 53,
  112: 117,
  113: 59,
  114: 62,
  115: 57,
  117: 55,
  118: 54,
  119: 63,
  120: 105,
  122: 115,
  123: 119,
  124: 114,
  131: 122,
  132: 120,
  133: 99,
  134: 118,
  135: 96,
  136: 97,
  137: 98,
  138: 100,
  139: 101,
  140: 109,
  141: 103,
  142: 111,
  143: 71,
  144: 82,
  145: 83,
  146: 84,
  147: 85,
  148: 86,
  149: 87,
  150: 88,
  151: 89,
  152: 91,
  153: 92,
  154: 75,
  155: 67,
  156: 78,
  157: 69,
  158: 65,
  160: 76,
} as const;

// 安卓 keycode -> Windows 虚拟键码(VK_*，十进制，与线上报文 key 字段一致）。
// 与 Mac 同理:Web 端先把按键算成安卓 keycode，再按被控端平台翻成其原生键码。
// 来源:官方安卓主控端 libinputmanager.so 的 AndroidLabelKeycodeConverter→WindowsLabelKeycodeConverter
// (经规范 label 桥接)dump，并经真机抓包校验(实测 key:162=Ctrl、91=Win、8=Backspace、65=A 等)。
export const STREAMER_ANDROID_TO_WINDOWS_KEY_CODES: Readonly<Record<number, number>> = {
  // 数字 0-9 -> VK 0x30-0x39
  7: 48, 8: 49, 9: 50, 10: 51, 11: 52, 12: 53, 13: 54, 14: 55, 15: 56, 16: 57,
  // 方向键 -> VK_LEFT/UP/RIGHT/DOWN
  19: 38, 20: 40, 21: 37, 22: 39,
  // 字母 A-Z -> VK 0x41-0x5A
  29: 65, 30: 66, 31: 67, 32: 68, 33: 69, 34: 70, 35: 71, 36: 72, 37: 73, 38: 74,
  39: 75, 40: 76, 41: 77, 42: 78, 43: 79, 44: 80, 45: 81, 46: 82, 47: 83, 48: 84,
  49: 85, 50: 86, 51: 87, 52: 88, 53: 89, 54: 90,
  // 标点(US 布局 VK_OEM_*)
  55: 188, 56: 190, 68: 192, 69: 189, 70: 187, 71: 219, 72: 221, 73: 220, 74: 186, 75: 222, 76: 191,
  // 修饰键(左右专属 VK):Alt L/R、Shift L/R、Ctrl L/R、Win L/R
  57: 164, 58: 165, 59: 160, 60: 161, 113: 162, 114: 163, 117: 91, 118: 92,
  // 编辑/导航:Tab、Space、Enter、Backspace、PageUp/Down、Esc、Delete、Home、End、Insert
  61: 9, 62: 32, 66: 13, 67: 8, 92: 33, 93: 34, 111: 27, 112: 46, 122: 36, 123: 35, 124: 45,
  // 功能键 F1-F12 -> VK 0x70-0x7B
  131: 112, 132: 113, 133: 114, 134: 115, 135: 116, 136: 117, 137: 118, 138: 119, 139: 120, 140: 121, 141: 122, 142: 123,
  // 小键盘 0-9 -> VK_NUMPAD0-9 (0x60-0x69)
  144: 96, 145: 97, 146: 98, 147: 99, 148: 100, 149: 101, 150: 102, 151: 103, 152: 104, 153: 105,
} as const;

export interface StreamerTouchSurface {
  displayId: number;
  width: number;
  height: number;
  rotation?: number;
}

export interface StreamerTouchPoint {
  id: number;
  relX: number;
  relY: number;
}

export interface StreamerTouchInputTracker {
  start(): string[];
  update(points: readonly StreamerTouchPoint[]): string[];
  end(): string[];
  reset(): string[];
}

export function buildStreamerImeTextInputMessage(text: string): string {
  return `TEXT:${text}`;
}

export function buildStreamerImeControlInputMessage(kind: StreamerImeControlKind): string {
  return `TEXT_CONTROL:${kind}`;
}

export function buildStreamerSystemKeyInputMessages(input: BuildStreamerSystemKeyInputMessagesInput): string[] {
  const keyCode = STREAMER_MUMU_SYSTEM_KEY_CODES[input.key];
  return [`${input.displayId}:KBDPR:${keyCode}:1\n`, `${input.displayId}:KBDRL:${keyCode}:0\n`];
}

export function buildStreamerMouseButtonInputMessage(input: BuildStreamerMouseButtonInputMessageInput): string {
  return JSON.stringify({
    action: STREAMER_DESKTOP_INPUT_EVENT_TYPES[input.action],
    button: normalizeStreamerMouseButtonCode(input.button),
  });
}

export function buildStreamerMouseMoveAbsoluteInputMessage(input: BuildStreamerMouseMoveAbsoluteInputMessageInput): string {
  return JSON.stringify({
    action: STREAMER_DESKTOP_INPUT_EVENT_TYPES.mouseMoveAbsolute,
    abs_x: Math.round(input.absX),
    abs_y: Math.round(input.absY),
  });
}

export function buildStreamerMacMouseMoveAbsoluteInputMessage(input: BuildStreamerMacMouseMoveAbsoluteInputMessageInput): string {
  return JSON.stringify({
    action: STREAMER_DESKTOP_INPUT_EVENT_TYPES.mouseMoveAbsolute,
    abs_x: normalizeAbsolutePointerAxis(input.absX, input.surfaceWidth),
    abs_y: normalizeAbsolutePointerAxis(input.absY, input.surfaceHeight),
  });
}

export function buildStreamerMouseScrollInputMessage(input: BuildStreamerMouseScrollInputMessageInput): string {
  return JSON.stringify({
    action: STREAMER_DESKTOP_INPUT_EVENT_TYPES.mouseScroll,
    delta_x: Math.round(input.deltaX),
    delta_y: Math.round(input.deltaY),
  });
}

export function buildStreamerMacMouseScrollInputMessage(input: BuildStreamerMouseScrollInputMessageInput): string {
  return JSON.stringify({
    action: STREAMER_DESKTOP_INPUT_EVENT_TYPES.mouseScroll,
    delta_x: Math.round(input.deltaX),
    delta_y: Math.round(input.deltaY),
  });
}

export function buildStreamerKeyboardInputMessage(input: BuildStreamerKeyboardInputMessageInput): string {
  return JSON.stringify({
    action: STREAMER_DESKTOP_INPUT_EVENT_TYPES[input.action],
    key: input.value,
  });
}

export function buildStreamerMacKeyboardInputMessage(input: BuildStreamerKeyboardInputMessageInput): string {
  const key = transformStreamerAndroidKeyCodeToMac(input.value);
  if (key === undefined) return "";
  return JSON.stringify({
    action: STREAMER_DESKTOP_INPUT_EVENT_TYPES[input.action],
    key,
  });
}

export function transformStreamerAndroidKeyCodeToMac(value: string | number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return STREAMER_ANDROID_TO_MAC_KEY_CODES[Math.trunc(value)];
}

// 桌面被控端打字走独立的 text_input(单次上屏的字符内容），而非逐键 kbd_press。
// 这样可避免被控端对"按住未抬起"的软件级自动重复(网络延迟会把按下→抬起拉长，导致字母连发),
// 也是中文/IME 文本的承载方式。真机抓包:{"action":"text_input","content":"abc"}。
export function buildStreamerTextInputMessage(content: string): string {
  return JSON.stringify({ action: "text_input", content });
}

export function buildStreamerWindowsKeyboardInputMessage(input: BuildStreamerKeyboardInputMessageInput): string {
  const key = transformStreamerAndroidKeyCodeToWindows(input.value);
  if (key === undefined) return "";
  // 官方安卓主控端发往 Windows 的 kbd 报文带有 interrept 字段(真机抓包确认，拼写以被控端为准，原样复刻）。
  return JSON.stringify({ action: STREAMER_DESKTOP_INPUT_EVENT_TYPES[input.action], key, interrept: true });
}

export function transformStreamerAndroidKeyCodeToWindows(value: string | number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return STREAMER_ANDROID_TO_WINDOWS_KEY_CODES[Math.trunc(value)];
}

function normalizeAbsolutePointerAxis(value: number, size: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(size) || size <= 0) return 0;
  return Math.min(1, Math.max(0, value / size));
}

export function createStreamerTouchInputTracker(surface: StreamerTouchSurface): StreamerTouchInputTracker {
  return new TouchInputTracker(surface);
}

function normalizeStreamerMouseButtonCode(button: StreamerMouseButtonKind | number): number {
  return typeof button === "number" ? button : STREAMER_MOUSE_BUTTON_CODES[button];
}

class TouchInputTracker implements StreamerTouchInputTracker {
  private readonly activeSlotsByTouchId = new Map<number, number>();

  constructor(private readonly surface: StreamerTouchSurface) {}

  start(): string[] {
    return this.reset();
  }

  update(points: readonly StreamerTouchPoint[]): string[] {
    const nextTouchIds = new Set(points.map((point) => point.id));
    const releaseSlots = [...this.activeSlotsByTouchId.entries()]
      .filter(([touchId]) => !nextTouchIds.has(touchId))
      .sort(([leftTouchId], [rightTouchId]) => leftTouchId - rightTouchId)
      .map(([touchId, slot]) => {
        this.activeSlotsByTouchId.delete(touchId);
        return slot;
      });

    const messages: string[] = [];
    if (releaseSlots.length > 0) {
      messages.push(cookStreamerTouchCommand(this.surface.displayId, `SLOTMULTIRELEASE:${releaseSlots.join(":")}`));
    }

    const pressParts: string[] = [];
    for (const point of points) {
      const slot = this.slotForTouch(point.id);
      if (slot === null) continue;
      const { x, y } = transformStreamerTouchPoint(this.surface, point);
      pressParts.push(`${slot}:${slot}:${x}:${y}`);
    }

    if (pressParts.length > 0) {
      messages.push(cookStreamerTouchCommand(this.surface.displayId, `SLOTMULTIPRESS:${pressParts.join(":")}`));
    }

    return messages;
  }

  end(): string[] {
    return this.reset();
  }

  reset(): string[] {
    this.activeSlotsByTouchId.clear();
    return [
      cookStreamerTouchCommand(
        this.surface.displayId,
        `SLOTMULTIRELEASE:${STREAMER_INPUT_MANAGER_TOUCH_SLOTS.join(":")}`,
      ),
    ];
  }

  private slotForTouch(touchId: number): number | null {
    const currentSlot = this.activeSlotsByTouchId.get(touchId);
    if (currentSlot !== undefined) return currentSlot;

    const usedSlots = new Set(this.activeSlotsByTouchId.values());
    const slot = STREAMER_INPUT_MANAGER_TOUCH_SLOTS.find((candidate) => !usedSlots.has(candidate));
    if (slot === undefined) return null;
    this.activeSlotsByTouchId.set(touchId, slot);
    return slot;
  }
}

function transformStreamerTouchPoint(surface: StreamerTouchSurface, point: StreamerTouchPoint): { x: number; y: number } {
  let xRatio: number;
  let yRatio: number;
  if (surface.rotation === 90) {
    xRatio = 1 - point.relY;
    yRatio = point.relX;
  } else if (surface.rotation === 270) {
    xRatio = point.relY;
    yRatio = 1 - point.relX;
  } else {
    xRatio = point.relX;
    yRatio = point.relY;
  }

  return {
    x: Math.round(xRatio * surface.width),
    y: Math.round(yRatio * surface.height),
  };
}

function cookStreamerTouchCommand(displayId: number, command: string): string {
  return `${displayId}:${command}\n`;
}

export type StreamerConnectionPath = "lan" | "p2p" | "relay" | "unknown";

export interface StreamerStatsPathInput {
  candidateType?: string | null;
  isLanConnection?: boolean | null;
}

const knownDataChannelLabels = new Set<string>(Object.values(STREAMER_DATA_CHANNEL_LABELS));

export function isStreamerDataChannelLabel(value: string): value is StreamerDataChannelLabel {
  return knownDataChannelLabels.has(value);
}

export function classifyStreamerConnectionPath(input: StreamerStatsPathInput): StreamerConnectionPath {
  if (input.isLanConnection === true) return "lan";

  const candidateType = input.candidateType?.trim().toLowerCase();
  if (!candidateType) return "unknown";
  if (candidateType === "relay") return "relay";
  return "p2p";
}

export interface AnalyzeRemoteSignalReadinessInput {
  events: readonly RemoteSignalGatewayEvent[];
  signalStatus?: Pick<RemoteSignalGatewayStatus, "status" | "selectedSignalServer" | "updatedAt"> | null;
}

export function analyzeRemoteSignalReadiness(
  input: AnalyzeRemoteSignalReadinessInput,
): RemoteSignalReadinessDiagnostics {
  const counts = createEmptyReadinessCounts();
  let terminalSignal: RemoteSignalReadinessDiagnostics["terminalSignal"];
  let controlAckError: RemoteSignalReadinessDiagnostics["controlAckError"];
  let beControlledError: RemoteSignalReadinessDiagnostics["beControlledError"];
  let lastOutboundOfferIceId: string | undefined;

  for (const event of input.events) {
    if (event.direction === "outbound" && event.event === STREAMER_CONTROL_EVENT_NAME) {
      counts.outboundControl += 1;
    }

    if (event.direction === "inbound" && event.event === `${STREAMER_CONTROL_EVENT_NAME}:ack`) {
      counts.inboundControlAck += 1;
      const result = extractControlAckResult(event.payload, event.receivedAt);
      if (result.ok) {
        counts.inboundControlAckSuccess += 1;
      } else {
        counts.inboundControlAckFailure += 1;
        controlAckError = result.error;
      }
    }

    if (event.event === STREAMER_SOAC_EVENT) {
      for (const type of extractStreamerSoacTypes(event.payload)) {
        if (event.direction === "outbound") {
          if (type === "offer") counts.outboundOffer += 1;
          if (type === "candidate") counts.outboundCandidate += 1;
        } else if (event.direction === "inbound") {
          if (type === "answer") counts.inboundAnswer += 1;
          if (type === "restart_ice") counts.inboundRestartIce += 1;
          if (type === "candidate") counts.inboundCandidate += 1;
        }
      }
      if (event.direction === "outbound") {
        lastOutboundOfferIceId = extractLastStreamerSoacIceId(event.payload, "offer") ?? lastOutboundOfferIceId;
      }
    }

    if (event.direction === "inbound") {
      if (event.event === STREAMER_SIGNAL_SOCKET_EVENTS.bmsgPush) {
        counts.inboundBmsgPush += 1;
      }

      if (event.event === "leave" || event.event === "left" || event.event === "publisher_disconnect") {
        counts.inboundLeave += 1;
        const iceId = extractStreamerSignalIceId(event.payload);
        terminalSignal = {
          event: event.event,
          reason: event.event === "publisher_disconnect" ? "publisher_disconnected" : "server_kick",
          receivedAt: event.receivedAt,
          traceId: extractStreamerSignalTraceId(event.payload),
          iceIdPresent: iceId !== undefined,
          iceIdMatchesLastOffer:
            iceId !== undefined && lastOutboundOfferIceId !== undefined ? iceId === lastOutboundOfferIceId : undefined,
        };
      } else if (event.event === "released") {
        counts.inboundReleased += 1;
        const iceId = extractStreamerSignalIceId(event.payload);
        terminalSignal = {
          event: event.event,
          reason: "released",
          receivedAt: event.receivedAt,
          traceId: extractStreamerSignalTraceId(event.payload),
          iceIdPresent: iceId !== undefined,
          iceIdMatchesLastOffer:
            iceId !== undefined && lastOutboundOfferIceId !== undefined ? iceId === lastOutboundOfferIceId : undefined,
        };
      } else if (event.event === "be-controlled") {
        counts.inboundBeControlled += 1;
        const result = extractBeControlledResult(event.payload, event.receivedAt);
        if (result.ok) {
          counts.inboundBeControlledSuccess += 1;
        } else {
          counts.inboundBeControlledFailure += 1;
          beControlledError = result.error;
        }
      }
    }
  }

  const signalGatewayConnected = input.signalStatus?.status === "connected";
  const controlAckReceived = counts.inboundControlAckSuccess > 0;
  const controlAckFailed = counts.inboundControlAckFailure > 0;
  const offerSent = counts.outboundOffer > 0;
  const beControlledReceived = counts.inboundBeControlledSuccess > 0;
  const beControlledFailed = counts.inboundBeControlledFailure > 0;
  const answerReceived = counts.inboundAnswer > 0 || counts.inboundRestartIce > 0;
  const terminalSignalReceived = counts.inboundLeave > 0 || counts.inboundReleased > 0;
  const gatewayHasSessionEvidence = signalGatewayConnected || input.events.length > 0;
  const { stage, blocker } = resolveReadinessStage({
    signalGatewayConnected: gatewayHasSessionEvidence,
    controlAckReceived,
    controlAckFailed,
    offerSent,
    beControlledReceived,
    beControlledFailed,
    answerReceived,
    terminalSignalReceived,
  });

  return {
    stage,
    blocker,
    selectedSignalServer: input.signalStatus?.selectedSignalServer,
    updatedAt: input.signalStatus?.updatedAt,
    lastEventAt: input.events.at(-1)?.receivedAt,
    terminalSignal: removeUndefinedTerminalSignalFields(terminalSignal),
    controlAckError: removeUndefinedControlAckErrorFields(controlAckError),
    beControlledError: removeUndefinedBeControlledErrorFields(beControlledError),
    checks: {
      signalGatewayConnected,
      controlAckReceived,
      offerSent,
      beControlledReceived,
      answerReceived,
      terminalSignalReceived,
    },
    counts,
  };
}

function createEmptyReadinessCounts(): RemoteSignalReadinessDiagnostics["counts"] {
  return {
    outboundControl: 0,
    inboundControlAck: 0,
    inboundControlAckSuccess: 0,
    inboundControlAckFailure: 0,
    outboundOffer: 0,
    outboundCandidate: 0,
    inboundAnswer: 0,
    inboundRestartIce: 0,
    inboundCandidate: 0,
    inboundBmsgPush: 0,
    inboundLeave: 0,
    inboundReleased: 0,
    inboundBeControlled: 0,
    inboundBeControlledSuccess: 0,
    inboundBeControlledFailure: 0,
  };
}

function resolveReadinessStage(input: {
  signalGatewayConnected: boolean;
  controlAckReceived: boolean;
  controlAckFailed: boolean;
  offerSent: boolean;
  beControlledReceived: boolean;
  beControlledFailed: boolean;
  answerReceived: boolean;
  terminalSignalReceived: boolean;
}): Pick<RemoteSignalReadinessDiagnostics, "stage" | "blocker"> {
  if (!input.signalGatewayConnected) {
    return { stage: "idle", blocker: "gateway_not_connected" };
  }

  if (!input.controlAckReceived) {
    if (input.controlAckFailed) {
      return { stage: "gateway_connected", blocker: "control_ack_failed" };
    }
    return { stage: "gateway_connected", blocker: "control_ack_missing" };
  }

  if (!input.offerSent) {
    return { stage: "control_acknowledged", blocker: "offer_missing" };
  }

  if (!input.answerReceived) {
    if (input.beControlledFailed) {
      return { stage: "offer_sent", blocker: "be_controlled_failed" };
    }
    if (input.terminalSignalReceived) {
      return { stage: "offer_sent", blocker: "controlled_left_before_answer" };
    }
    return {
      stage: "offer_sent",
      blocker: "answer_missing",
    };
  }

  return { stage: "answer_received", blocker: null };
}

function extractControlAckResult(
  payload: unknown,
  receivedAt: string,
): { ok: true } | { ok: false; error: NonNullable<RemoteSignalReadinessDiagnostics["controlAckError"]> } {
  const ack = normalizeStreamerSignalControlAck(payload);
  const failure = getStreamerSignalControlFailure(ack);
  if (!failure) return { ok: true };

  return {
    ok: false,
    error: {
      ackStatus: failure.ackStatus,
      code: failure.code,
      message: failure.msg,
      protocolError: failure.protocolError,
      receivedAt,
    },
  };
}

function extractBeControlledResult(
  payload: unknown,
  receivedAt: string,
): { ok: true } | { ok: false; error: NonNullable<RemoteSignalReadinessDiagnostics["beControlledError"]> } {
  const result = findControlResultPayload(payload);
  const code = result?.code;
  if (code === undefined || code === 0) return { ok: true };

  return {
    ok: false,
    error: {
      code,
      message: result?.message,
      protocolError: mapStreamerControlResultProtocolError(code),
      receivedAt,
    },
  };
}

function findControlResultPayload(payload: unknown): { code?: number; message?: string } | undefined {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const result = findControlResultPayload(item);
      if (result?.code !== undefined) return result;
    }
    return undefined;
  }

  const record = asRecord(payload);
  if (!record) return undefined;

  const code = typeof record.code === "number" && Number.isFinite(record.code) ? record.code : undefined;
  const message = toSafeDiagnosticString(record.msg ?? record.message);
  if (code !== undefined) return { code, message };

  return findControlResultPayload(record.data);
}

export function mapStreamerControlResultProtocolError(code: number): string {
  switch (code) {
    case 0:
      return "protocol_error_0";
    case 100001:
      return "protocol_error_2021";
    case 100002:
      return "protocol_error_2022";
    case 900001:
      return "protocol_error_2004";
    case 900002:
      return "protocol_error_2023";
    case 900003:
      return "protocol_error_2024";
    default:
      return "protocol_error_2025";
  }
}

function extractStreamerSoacTypes(payload: unknown): StreamerSoacType[] {
  if (Array.isArray(payload)) {
    return payload.flatMap(extractStreamerSoacTypes);
  }

  const record = asRecord(payload);
  if (!record) return [];

  const data = record.data;
  if (Array.isArray(data)) {
    return data.flatMap(extractStreamerSoacTypes);
  }

  const dataRecord = asRecord(data);
  const directType = toStreamerSoacType(record.type);
  const dataType = toStreamerSoacType(dataRecord?.type);

  return [directType, dataType].filter((type): type is StreamerSoacType => type !== null);
}

function extractLastStreamerSoacIceId(payload: unknown, expectedType: StreamerSoacType): string | undefined {
  if (Array.isArray(payload)) {
    for (let index = payload.length - 1; index >= 0; index -= 1) {
      const iceId = extractLastStreamerSoacIceId(payload[index], expectedType);
      if (iceId) return iceId;
    }
    return undefined;
  }

  const record = asRecord(payload);
  if (!record) return undefined;

  const dataRecord = asRecord(record.data);
  const type = toStreamerSoacType(dataRecord?.type) ?? toStreamerSoacType(record.type);
  if (type !== expectedType) return undefined;

  return toSafeDiagnosticString(dataRecord?.ice_id ?? record.ice_id);
}

function toStreamerSoacType(value: unknown): StreamerSoacType | null {
  if (typeof value !== "string") return null;
  return (STREAMER_SOAC_TYPES as readonly string[]).includes(value) ? (value as StreamerSoacType) : null;
}

function extractStreamerSignalIceId(payload: unknown): string | undefined {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const iceId = extractStreamerSignalIceId(item);
      if (iceId) return iceId;
    }
    return undefined;
  }

  const record = asRecord(payload);
  if (!record) return undefined;

  const directIceId = toSafeDiagnosticString(record.ice_id ?? record.iceId);
  if (directIceId) return directIceId;
  return extractStreamerSignalIceId(record.data);
}

function extractStreamerSignalTraceId(payload: unknown): string | undefined {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const traceId = extractStreamerSignalTraceId(item);
      if (traceId) return traceId;
    }
    return undefined;
  }

  const record = asRecord(payload);
  if (!record) return undefined;

  const directTraceId = toSafeDiagnosticString(record["ntes-trace-id"] ?? record.trace_id ?? record.traceId);
  if (directTraceId) return directTraceId;
  return extractStreamerSignalTraceId(record.data);
}

function removeUndefinedTerminalSignalFields(
  terminalSignal: RemoteSignalReadinessDiagnostics["terminalSignal"],
): RemoteSignalReadinessDiagnostics["terminalSignal"] {
  if (!terminalSignal) return undefined;
  return Object.fromEntries(
    Object.entries(terminalSignal).filter(([, value]) => value !== undefined),
  ) as RemoteSignalReadinessDiagnostics["terminalSignal"];
}

function removeUndefinedControlAckErrorFields(
  error: RemoteSignalReadinessDiagnostics["controlAckError"],
): RemoteSignalReadinessDiagnostics["controlAckError"] {
  if (!error) return undefined;
  return Object.fromEntries(
    Object.entries(error).filter(([, value]) => value !== undefined),
  ) as RemoteSignalReadinessDiagnostics["controlAckError"];
}

function removeUndefinedBeControlledErrorFields(
  error: RemoteSignalReadinessDiagnostics["beControlledError"],
): RemoteSignalReadinessDiagnostics["beControlledError"] {
  if (!error) return undefined;
  return Object.fromEntries(
    Object.entries(error).filter(([, value]) => value !== undefined),
  ) as RemoteSignalReadinessDiagnostics["beControlledError"];
}

function toSafeDiagnosticString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > 160 ? `${trimmed.slice(0, 160)}...` : trimmed;
}
