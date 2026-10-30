// Worker 和 Durable Object 共用的小工具

export const API_VERSION = "0.1.0";
export const SERVICE_NAME = "aguaphone-cloudflare-backend";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, ngrok-skip-browser-warning",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

export function withCors(response) {
  // WebSocket 升級的回應不能改 headers
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function corsPreflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export function errorJson(status, message) {
  return json(status, { error: message });
}

export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function normalizeRequiredString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, `${fieldName} is required`);
  }
  return value.trim();
}

export async function readJsonBody(request) {
  const raw = await request.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

// ── base64url ──

export function bytesToBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeText(text) {
  return bytesToBase64Url(new TextEncoder().encode(text));
}

export function decodeText(value) {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

export function randomHex(byteLength) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomId(prefix) {
  return `${prefix}_${randomHex(12)}`;
}

export function usernameKey(username) {
  return username.trim().toLowerCase();
}

// access token：<base64url(JSON)>.<簽章>，payload 多帶 uk（帳號小寫）讓 Worker 知道要轉給哪個 DO。
// Worker 只讀不驗，簽章由 DO 用自己的 secret 驗。
export function peekAccessTokenAccount(token) {
  const [encoded] = String(token || "").split(".");
  if (!encoded) return null;
  try {
    const payload = JSON.parse(decodeText(encoded));
    return typeof payload?.uk === "string" && payload.uk ? payload.uk : null;
  } catch {
    return null;
  }
}

// refresh token：<base64url(帳號小寫)>.<隨機字串>，/auth/refresh 只帶這個，所以帳號要放在裡面
export function makeRefreshToken(uk) {
  return `${encodeText(uk)}.${randomHex(32)}`;
}

export function peekRefreshTokenAccount(token) {
  const [encoded, rest] = String(token || "").split(".");
  if (!encoded || !rest) return null;
  try {
    return decodeText(encoded) || null;
  } catch {
    return null;
  }
}
