// MIT: Copyright (c) 2026 iola1999.
// Source: fang12100/uuremote @ aa2e12af69031f7d74eb6a86d967317ac5957053.
// Full license: THIRD_PARTY_NOTICES.md.
import {
  STREAMER_CONTROL_EVENT_ACK_TIMEOUT_MS,
  STREAMER_CONTROL_EVENT_NAME,
  STREAMER_CONTROL_EVENT_PAYLOAD_KEYS,
  STREAMER_CONTROL_EVENT_PAYLOAD_TYPES,
  STREAMER_CONTROL_EVENT_WIRE_ARGUMENT_ORDER,
  STREAMER_CONTROL_STREAMER_DATA_JSON_KEYS,
  STREAMER_CONTROLLER_INBOUND_SOAC_TYPES,
  STREAMER_SIGNAL_SOCKET_EVENTS,
  STREAMER_SOAC_EVENT,
  buildStreamerSoacPayload,
} from "./streamerProtocol.js";
import type {
  RemoteSignalControlRequest,
  RemoteSignalGatewayStatus,
  RemoteSignalSoacRequest,
  StreamerRoomConfig,
} from "./types.js";

export const SIGNAL_GATEWAY_MAX_EVENTS = 200;

export interface SignalGatewayBinaryCodec<TBinary> {
  decodeBase64(value: string | undefined): TBinary;
  toBinary(value: unknown): TBinary | null;
  byteLength(value: TBinary): number;
  encodeBase64(value: TBinary): string;
  gzipText(value: string): TBinary;
  gunzipText(value: unknown): string | null;
}

export interface AsyncSignalGatewayBinaryCodec<TBinary> extends Omit<SignalGatewayBinaryCodec<TBinary>, "gzipText" | "gunzipText"> {
  gzipText(value: string): Promise<TBinary> | TBinary;
  gunzipText(value: unknown): Promise<string | null> | string | null;
}

export function orderSignalGatewayServers(signalServers: string[], preferredIndex: number | undefined): string[] {
  if (
    preferredIndex === undefined ||
    !Number.isInteger(preferredIndex) ||
    preferredIndex < 0 ||
    preferredIndex >= signalServers.length
  ) {
    return signalServers;
  }
  return [
    signalServers[preferredIndex],
    ...signalServers.slice(0, preferredIndex),
    ...signalServers.slice(preferredIndex + 1),
  ];
}

export function createIdleSignalGatewayStatus(updatedAt = new Date().toISOString()): RemoteSignalGatewayStatus {
  return {
    status: "idle",
    strategy: "backend_signal_gateway",
    signalServers: [],
    signalHeaders: {},
    signalControl: buildSignalGatewayControlStatus(),
    updatedAt,
  };
}

export function createSignalGatewayStatus({
  status,
  roomConfig,
  rawHeaders,
  startedAt,
  connectionId,
  error,
  selectedSignalServer,
  updatedAt = new Date().toISOString(),
}: {
  status: RemoteSignalGatewayStatus["status"];
  roomConfig: StreamerRoomConfig;
  rawHeaders: Record<string, string>;
  startedAt: string;
  connectionId?: string;
  error?: string;
  selectedSignalServer?: string;
  updatedAt?: string;
}): RemoteSignalGatewayStatus {
  return {
    status,
    strategy: "backend_signal_gateway",
    selectedSignalServer: selectedSignalServer ?? roomConfig.signalServers[0],
    signalServers: roomConfig.signalServers,
    signalHeaders: redactSignalGatewayHeaders(rawHeaders),
    signalControl: buildSignalGatewayControlStatus(),
    connectionId,
    startedAt,
    updatedAt,
    error,
  };
}

export function buildSignalGatewayControlStatus(): RemoteSignalGatewayStatus["signalControl"] {
  return {
    socketEvents: STREAMER_SIGNAL_SOCKET_EVENTS,
    event: STREAMER_CONTROL_EVENT_NAME,
    payloadKeys: STREAMER_CONTROL_EVENT_PAYLOAD_KEYS,
    payloadTypes: STREAMER_CONTROL_EVENT_PAYLOAD_TYPES,
    wireArgumentOrder: STREAMER_CONTROL_EVENT_WIRE_ARGUMENT_ORDER,
    streamerDataJsonKeys: STREAMER_CONTROL_STREAMER_DATA_JSON_KEYS,
    ackTimeoutMs: STREAMER_CONTROL_EVENT_ACK_TIMEOUT_MS,
  };
}

export function redactSignalGatewayHeaders(headers: Record<string, string>): Record<string, string> {
  return {
    ...headers,
    "X-NRD-AUTH": "<redacted room token>",
  };
}

export function redactSignalGatewayToken(message: string, token: string): string {
  return token ? message.split(token).join("<redacted room token>") : message;
}

export function buildSignalGatewayControlPayload<TBinary>(
  input: RemoteSignalControlRequest,
  binary: Pick<SignalGatewayBinaryCodec<TBinary>, "decodeBase64">,
): Record<string, unknown> {
  return {
    app_control_id: input.appControlId,
    app_data: binary.decodeBase64(input.appDataBase64),
    streamer_data: input.streamerData ?? "",
  };
}

export function buildSignalGatewaySoacPayload<TBinary>(
  input: RemoteSignalSoacRequest,
  binary: Pick<SignalGatewayBinaryCodec<TBinary>, "gzipText">,
): Record<string, unknown> {
  const payload = buildStreamerSoacPayload(input) as unknown as Record<string, unknown>;
  if (shouldCompressSignalSdp(input)) {
    const data = payload.data as Record<string, unknown>;
    data.sdp = "";
    data.gzip_sdp = binary.gzipText(input.sdp);
  }
  return payload;
}

export async function buildSignalGatewaySoacPayloadAsync<TBinary>(
  input: RemoteSignalSoacRequest,
  binary: Pick<AsyncSignalGatewayBinaryCodec<TBinary>, "gzipText">,
): Promise<Record<string, unknown>> {
  const payload = buildStreamerSoacPayload(input) as unknown as Record<string, unknown>;
  if (shouldCompressSignalSdp(input)) {
    const data = payload.data as Record<string, unknown>;
    data.sdp = "";
    data.gzip_sdp = await binary.gzipText(input.sdp);
  }
  return payload;
}

export function normalizeSignalGatewayPayload<TBinary>(
  value: unknown,
  binary: Pick<SignalGatewayBinaryCodec<TBinary>, "toBinary" | "byteLength" | "encodeBase64">,
): unknown {
  const bytes = binary.toBinary(value);
  if (bytes) {
    return {
      kind: "binary",
      byteLength: binary.byteLength(bytes),
      base64: binary.encodeBase64(bytes),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeSignalGatewayPayload(item, binary));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, normalizeSignalGatewayPayload(item, binary)]),
    );
  }

  return value;
}

export function normalizeSignalGatewayInboundEvents<TBinary>(
  event: string,
  payload: unknown[],
  binary: Pick<SignalGatewayBinaryCodec<TBinary>, "gunzipText">,
): Array<{ event: string; payload: unknown }> {
  if (event !== STREAMER_SIGNAL_SOCKET_EVENTS.bmsgPush) {
    if (isControllerInboundSoacType(event)) {
      return [{
        event: STREAMER_SOAC_EVENT,
        payload: payload.map((item) => normalizeInboundTypedPayload(event, item, binary)),
      }];
    }
    return [{ event, payload: normalizeInboundTypedPayload(event, payload, binary) }];
  }

  const pushes = payload.map(parseSignalPush).filter((item) => item !== null);
  if (pushes.length === 0) {
    return [{ event, payload }];
  }

  return [
    { event, payload },
    ...pushes.map((push) => {
      const normalizedEvent = isControllerInboundSoacType(push.type) ? STREAMER_SOAC_EVENT : push.type;
      const data = isControllerInboundSoacType(push.type)
        ? normalizeTypedSoacPushPayload(push.type, push.data)
        : push.data;
      return {
        event: normalizedEvent,
        payload: data === undefined ? [] : [normalizeInboundTypedPayload(normalizedEvent, data, binary)],
      };
    }),
  ];
}

export async function normalizeSignalGatewayInboundEventsAsync<TBinary>(
  event: string,
  payload: unknown[],
  binary: Pick<AsyncSignalGatewayBinaryCodec<TBinary>, "gunzipText">,
): Promise<Array<{ event: string; payload: unknown }>> {
  if (event !== STREAMER_SIGNAL_SOCKET_EVENTS.bmsgPush) {
    if (isControllerInboundSoacType(event)) {
      return [{
        event: STREAMER_SOAC_EVENT,
        payload: await Promise.all(payload.map((item) => normalizeInboundTypedPayloadAsync(event, item, binary))),
      }];
    }
    return [{ event, payload: await normalizeInboundTypedPayloadAsync(event, payload, binary) }];
  }

  const pushes = payload.map(parseSignalPush).filter((item) => item !== null);
  if (pushes.length === 0) {
    return [{ event, payload }];
  }

  const normalized = await Promise.all(pushes.map(async (push) => {
    const normalizedEvent = isControllerInboundSoacType(push.type) ? STREAMER_SOAC_EVENT : push.type;
    const data = isControllerInboundSoacType(push.type)
      ? normalizeTypedSoacPushPayload(push.type, push.data)
      : push.data;
    return {
      event: normalizedEvent,
      payload: data === undefined ? [] : [await normalizeInboundTypedPayloadAsync(normalizedEvent, data, binary)],
    };
  }));
  return [
    { event, payload },
    ...normalized,
  ];
}

export function normalizeSignalGatewayRoomConfig(value: unknown): StreamerRoomConfig | null {
  const record = asRecord(value);
  if (!record || typeof record.token !== "string" || record.token.length === 0) return null;
  if (!Array.isArray(record.signalServers)) return null;
  const signalServers = record.signalServers.filter((item): item is string => typeof item === "string" && item.length > 0);
  if (signalServers.length === 0) return null;
  return {
    token: record.token,
    signalServers,
    timeout: readOptionalNumber(record.timeout),
    signalReconnectDelay: readOptionalNumber(record.signalReconnectDelay),
    reportToken: readOptionalString(record.reportToken),
    reportUrl: readOptionalString(record.reportUrl),
    reportServerAddress: readOptionalString(record.reportServerAddress),
    appData: readOptionalString(record.appData),
  };
}

function shouldCompressSignalSdp(input: RemoteSignalSoacRequest): input is RemoteSignalSoacRequest & { sdp: string } {
  return (
    (input.type === "offer" || input.type === "answer" || input.type === "restart_ice") &&
    input.gzipSdp === true &&
    typeof input.sdp === "string"
  );
}

function normalizeInboundTypedPayload<TBinary>(
  event: string,
  payload: unknown,
  binary: Pick<SignalGatewayBinaryCodec<TBinary>, "gunzipText">,
): unknown {
  const typedPayload = isControllerInboundSoacType(event) ? normalizeTypedSoacPushPayload(event, payload) : payload;
  if ((isControllerInboundSoacType(event) || event === STREAMER_SOAC_EVENT) && Array.isArray(typedPayload)) {
    return typedPayload.map((item) => normalizeInboundSoacPayload(item, binary));
  }
  if (!isControllerInboundSoacType(event) && event !== STREAMER_SOAC_EVENT) return typedPayload;
  return normalizeInboundSoacPayload(typedPayload, binary);
}

async function normalizeInboundTypedPayloadAsync<TBinary>(
  event: string,
  payload: unknown,
  binary: Pick<AsyncSignalGatewayBinaryCodec<TBinary>, "gunzipText">,
): Promise<unknown> {
  const typedPayload = isControllerInboundSoacType(event) ? normalizeTypedSoacPushPayload(event, payload) : payload;
  if ((isControllerInboundSoacType(event) || event === STREAMER_SOAC_EVENT) && Array.isArray(typedPayload)) {
    return Promise.all(typedPayload.map((item) => normalizeInboundSoacPayloadAsync(item, binary)));
  }
  if (!isControllerInboundSoacType(event) && event !== STREAMER_SOAC_EVENT) return typedPayload;
  return normalizeInboundSoacPayloadAsync(typedPayload, binary);
}

function normalizeInboundSoacPayload<TBinary>(
  payload: unknown,
  binary: Pick<SignalGatewayBinaryCodec<TBinary>, "gunzipText">,
): unknown {
  const soacData = getSoacData(payload);
  if (!soacData) return payload;
  const hasPlainSdp = typeof soacData.data.sdp === "string" && soacData.data.sdp.length > 0;
  if (hasPlainSdp) return payload;

  const plainSdp = binary.gunzipText(soacData.data.gzip_sdp) ?? binary.gunzipText(soacData.data.sdp);
  if (!plainSdp) return payload;
  return {
    ...soacData.record,
    data: {
      ...soacData.data,
      sdp: plainSdp,
    },
  };
}

async function normalizeInboundSoacPayloadAsync<TBinary>(
  payload: unknown,
  binary: Pick<AsyncSignalGatewayBinaryCodec<TBinary>, "gunzipText">,
): Promise<unknown> {
  const soacData = getSoacData(payload);
  if (!soacData) return payload;
  const hasPlainSdp = typeof soacData.data.sdp === "string" && soacData.data.sdp.length > 0;
  if (hasPlainSdp) return payload;

  const plainSdp = await binary.gunzipText(soacData.data.gzip_sdp) ?? await binary.gunzipText(soacData.data.sdp);
  if (!plainSdp) return payload;
  return {
    ...soacData.record,
    data: {
      ...soacData.data,
      sdp: plainSdp,
    },
  };
}

function getSoacData(payload: unknown): { record: Record<string, unknown>; data: Record<string, unknown> } | null {
  const record = asRecord(payload);
  const data = asRecord(record?.data);
  if (!record || !data) return null;
  return { record, data };
}

function parseSignalPush(value: unknown): { type: string; data?: unknown } | null {
  const parsed = parseJsonString(value) ?? parseWrappedSignalPush(value) ?? value;
  const record = asRecord(parsed);
  if (!record || typeof record.type !== "string" || record.type.length === 0) return null;
  return {
    type: record.type,
    data: record.data,
  };
}

function isControllerInboundSoacType(type: string): boolean {
  return STREAMER_CONTROLLER_INBOUND_SOAC_TYPES.includes(
    type as (typeof STREAMER_CONTROLLER_INBOUND_SOAC_TYPES)[number],
  );
}

function normalizeTypedSoacPushPayload(type: string, payload: unknown): unknown {
  const record = asRecord(payload);
  const soacData = asRecord(record?.data);
  if (!record || !soacData) return payload;
  if (typeof soacData.type === "string") return payload;
  return {
    ...record,
    data: {
      type,
      ...soacData,
    },
  };
}

function parseWrappedSignalPush(value: unknown): unknown {
  const record = asRecord(value);
  if (!record) return null;
  const wrapped = record._0 ?? record.onSignalPush;
  return parseJsonString(wrapped);
}

function parseJsonString(value: unknown): unknown {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
