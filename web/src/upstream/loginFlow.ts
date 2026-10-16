// MIT: Copyright (c) 2026 iola1999.
// Source: fang12100/uuremote @ aa2e12af69031f7d74eb6a86d967317ac5957053.
// Full license: THIRD_PARTY_NOTICES.md.
import type {
  AndroidDeviceInitProfile,
  MobileCodeRequestInput,
  MobileLoginRequestInput,
  MobileLoginResult,
  UuRequest,
} from "./types.js";

export const MOBILE_CODE_PATH = "/api/v1/security/mobile/code";
export const MOBILE_LOGIN_PATH = "/api/v1/login/by_mobile";
export const ANDROID_DEVICE_INIT_PATH = "/api/v1/device/android/init";

export function buildMobileCodeRequest(input: MobileCodeRequestInput): UuRequest {
  return {
    method: "POST",
    path: MOBILE_CODE_PATH,
    body: {
      country_code: input.regionCode,
      mobile: input.mobile,
      type: "login",
    },
  };
}

export function buildMobileLoginRequest(input: MobileLoginRequestInput): UuRequest {
  return {
    method: "POST",
    path: MOBILE_LOGIN_PATH,
    body: {
      country_code: input.regionCode,
      mobile: input.mobile,
      code: input.code,
    },
  };
}

export function buildAndroidDeviceInitRequest(profile: AndroidDeviceInitProfile): UuRequest {
  return {
    method: "POST",
    path: ANDROID_DEVICE_INIT_PATH,
    body: profile,
  };
}

export function normalizeMobileLoginResult(body: unknown): MobileLoginResult {
  const data = unwrapUpstreamData(body);
  const userId = getString(data, "user_id");
  const nickName = getString(data, "nickname");
  const token = getString(data, "token");

  if (!userId || !token) {
    throw new Error("UU mobile login response is missing user_id or token");
  }

  return {
    userId,
    nickName,
    token,
  };
}

export function normalizeDeviceInitResult(body: unknown): string {
  const data = unwrapUpstreamData(body);
  const deviceId = getString(data, "device_id");
  if (!deviceId) {
    throw new Error("UU device init response is missing device_id");
  }
  return deviceId;
}

export function unwrapUpstreamData(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) return {};
  const wrappedData = body.data;
  if (isRecord(wrappedData)) return wrappedData;
  return body;
}

function getString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
