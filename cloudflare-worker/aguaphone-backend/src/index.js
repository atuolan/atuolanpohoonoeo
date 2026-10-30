/**
 * 小手機私人後台 — Cloudflare Worker
 *
 * 跟 HF／Docker 版同步伺服器是同一套 API，App 只要換網址。
 * Worker 只負責分流：每個帳號一個 AccountDO，資料、token、WebSocket 都在裡面。
 */

import { AccountDO } from "./account.js";
import { RegistryDO } from "./registry.js";
import {
  API_VERSION,
  SERVICE_NAME,
  HttpError,
  corsPreflight,
  errorJson,
  json,
  normalizeRequiredString,
  peekAccessTokenAccount,
  peekRefreshTokenAccount,
  usernameKey,
  withCors,
} from "./common.js";

export { AccountDO, RegistryDO };

const ENDPOINTS = [
  "GET /health",
  "POST /auth/register",
  "POST /auth/login",
  "POST /auth/refresh",
  "GET /sync/status",
  "GET /sync/meta",
  "POST /sync/push",
  "GET /sync/pull?since=...",
  "POST /devices/self  (update own device model/customName)",
  "GET /sync/ws?token=...",
];

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return corsPreflight();
    try {
      return withCors(await route(request, env));
    } catch (error) {
      if (error instanceof HttpError) return withCors(errorJson(error.statusCode, error.message));
      console.error("[worker] unexpected error", error?.stack || error);
      return withCors(errorJson(500, "Internal server error"));
    }
  },
};

async function route(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === "GET" && pathname === "/") {
    return json(200, {
      ok: true,
      service: SERVICE_NAME,
      serverTime: Date.now(),
      version: API_VERSION,
      endpoints: ENDPOINTS,
    });
  }

  if (request.method === "GET" && pathname === "/health") {
    return json(200, { ok: true, serverTime: Date.now(), version: API_VERSION });
  }

  if (request.method === "POST" && pathname === "/auth/register") {
    const raw = await request.text();
    const body = parseBody(raw);
    const uk = usernameKey(normalizeRequiredString(body.username, "username"));
    const registry = env.REGISTRY.get(env.REGISTRY.idFromName("global"));
    const claim = await registry.claim(uk, env.ALLOW_MORE_ACCOUNTS === "true");
    if (claim === "exists") return errorJson(409, "Username already exists");
    if (claim === "closed") return errorJson(403, "Registration is closed on this server");
    const response = await accountStub(env, uk).fetch(cloneWithBody(request, raw));
    if (!response.ok) await registry.release(uk);
    return response;
  }

  if (request.method === "POST" && pathname === "/auth/login") {
    const raw = await request.text();
    const body = parseBody(raw);
    const uk = usernameKey(normalizeRequiredString(body.username, "username"));
    return accountStub(env, uk).fetch(cloneWithBody(request, raw));
  }

  if (request.method === "POST" && pathname === "/auth/refresh") {
    const raw = await request.text();
    const body = parseBody(raw);
    const uk = peekRefreshTokenAccount(normalizeRequiredString(body.refreshToken, "refreshToken"));
    if (!uk) return errorJson(401, "Refresh token is invalid or expired");
    return accountStub(env, uk).fetch(cloneWithBody(request, raw));
  }

  if (pathname === "/sync/ws") {
    const token = url.searchParams.get("token") || "";
    const uk = peekAccessTokenAccount(token);
    if (!uk) return new Response("Unauthorized", { status: 401 });
    return accountStub(env, uk).fetch(request);
  }

  if (pathname.startsWith("/sync/") || pathname.startsWith("/devices/") || pathname.startsWith("/generate")) {
    const header = request.headers.get("Authorization") || "";
    if (!header.startsWith("Bearer ")) return errorJson(401, "Missing bearer token");
    const uk = peekAccessTokenAccount(header.slice("Bearer ".length));
    if (!uk) return errorJson(401, "Invalid access token payload");
    return accountStub(env, uk).fetch(request);
  }

  return errorJson(404, "Not found");
}

function accountStub(env, uk) {
  return env.ACCOUNT.get(env.ACCOUNT.idFromName(uk));
}

function parseBody(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

// body 已經讀過了，轉給 DO 要重新包一個
function cloneWithBody(request, raw) {
  return new Request(request.url, { method: request.method, headers: request.headers, body: raw });
}
