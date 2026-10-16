// MIT: Copyright (c) 2026 iola1999.
// Source: fang12100/uuremote @ aa2e12af69031f7d74eb6a86d967317ac5957053.
// Full license: THIRD_PARTY_NOTICES.md.
import type { StreamerRoomConfig, StreamerRoomConfigSummary } from "./types.js";

type UnknownRecord = Record<string, unknown>;

const TOKEN_KEYS = ["token", "room_token", "roomToken"];
const SIGNAL_SERVER_KEYS = [
  "signalServers",
  "signal_servers",
  "signal_server",
  "signaling_server",
  "signaling_servers",
  "signals",
  "signaling_list",
  "signal_list",
];
const TIMEOUT_KEYS = ["timeout", "connect_timeout", "connectTimeout", "ws_connect_timeout_ms", "connect_timeout_ms"];
const RECONNECT_DELAY_KEYS = [
  "signalReconnectDelay",
  "signal_reconnect_delay",
  "reconnectDelay",
  "reconnect_delay",
  "max_reconnect_delta",
  "streamer_retry_delta_ms",
];

export function normalizeStreamerRoomConfig(body: unknown): StreamerRoomConfig | null {
  const root = unwrapUpstreamData(body);
  const candidate = findRoomConfigRecord(root);
  if (!candidate) return null;

  const token = stringValue(readAny(candidate, TOKEN_KEYS));
  const signalServers = readStringArrayAny(candidate, SIGNAL_SERVER_KEYS);
  if (!token || signalServers.length === 0) return null;

  return {
    token,
    signalServers,
    timeout: numberValue(readAny(candidate, TIMEOUT_KEYS)),
    signalReconnectDelay: numberValue(readAny(candidate, RECONNECT_DELAY_KEYS)),
    reportToken: stringValue(readAny(candidate, ["reportToken", "report_token"])),
    reportUrl: stringValue(readAny(candidate, ["reportUrl", "report_url"])),
    reportServerAddress: stringValue(readAny(candidate, ["reportServerAddress", "report_server_address"])),
    appData: normalizeAppData(readAny(candidate, ["appData", "app_data"])),
  };
}

export function summarizeStreamerRoomConfig(config: StreamerRoomConfig | null): StreamerRoomConfigSummary | null {
  if (!config) return null;
  return {
    tokenPresent: config.token.length > 0,
    signalServerCount: config.signalServers.length,
    signalServers: config.signalServers,
    timeout: config.timeout,
    signalReconnectDelay: config.signalReconnectDelay,
    reportUrl: config.reportUrl,
    reportServerAddress: config.reportServerAddress,
    appDataPresent: Boolean(config.appData),
  };
}

function findRoomConfigRecord(value: unknown): UnknownRecord | null {
  const record = asRecord(value);
  if (!record) return null;

  const directKeys = ["room_config", "roomConfig", "room_info", "roomInfo", "streamer_room_config", "streamerRoomConfig"];
  for (const key of directKeys) {
    const direct = asRecord(record[key]);
    if (direct && looksLikeRoomConfig(direct)) return direct;
  }

  if (looksLikeRoomConfig(record)) return record;

  for (const item of Object.values(record)) {
    if (Array.isArray(item)) {
      for (const child of item) {
        const found = findRoomConfigRecord(child);
        if (found) return found;
      }
      continue;
    }
    const found = findRoomConfigRecord(item);
    if (found) return found;
  }

  return null;
}

function looksLikeRoomConfig(record: UnknownRecord): boolean {
  const token = stringValue(readAny(record, TOKEN_KEYS));
  const signalServers = readStringArrayAny(record, SIGNAL_SERVER_KEYS);
  return token.length > 0 && signalServers.length > 0;
}

function unwrapUpstreamData(body: unknown): unknown {
  const root = asRecord(body);
  if (!root) return body;
  const responseBody = asRecord(root.body);
  if (responseBody) return unwrapUpstreamData(responseBody);
  const data = asRecord(root.data);
  if (data) return data;
  return root;
}

function readAny(record: UnknownRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return undefined;
}

function readStringArrayAny(record: UnknownRecord, keys: string[]): string[] {
  const values: string[] = [];
  for (const key of keys) {
    values.push(...stringArrayValue(record[key]));
  }
  return [...new Set(values)];
}

function normalizeAppData(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return JSON.stringify(value);
  return undefined;
}

function stringArrayValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  if (typeof value === "string" && value.length > 0) return [value];
  return [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;
}
