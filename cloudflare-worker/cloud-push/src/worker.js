/**
 * Cloudflare Worker — 雲端推送鬧鐘路由入口
 *
 * 域名: push.aguacloud.uk
 * 所有路由代理到 PushAlarmDO（每用戶一個實例）
 */

import { PushAlarmDO } from './push-alarm.js';
import { handleDiscordCallback } from './discord-oauth.js';

// ── 設定 ──────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://203aguaphone.aguacloud.uk',
  'http://203aguaphone.aguacloud.uk',
  'http://localhost:5173',
  'http://localhost:3002',
];

// ── CORS 工具 ─────────────────────────────────────────────────

function corsHeaders(origin) {
  const allowed = isOriginAllowed(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id',
    'Access-Control-Max-Age': '86400',
  };
}

function isOriginAllowed(origin) {
  return !origin || ALLOWED_ORIGINS.includes(origin);
}

function withCors(response, origin) {
  const h = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(origin))) {
    h.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: h,
  });
}

// ── 主處理 ────────────────────────────────────────────────────

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin') || '';

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  // Origin 檢查
  if (!isOriginAllowed(origin)) {
    return new Response('Forbidden', { status: 403 });
  }

  const path = url.pathname;

  // 健康檢查
  if (path === '/' || path === '/health') {
    return withCors(
      new Response(JSON.stringify({ ok: true, service: 'aguaphone-cloud-push' }), {
        headers: { 'Content-Type': 'application/json' },
      }),
      origin,
    );
  }

  // Discord OAuth2 callback（不需要 X-User-Id）
  if (path === '/discord/callback') {
    return handleDiscordCallback(request, env);
  }

  // 所有 /push/* 路由需要 X-User-Id
  if (!path.startsWith('/push/')) {
    return withCors(
      new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
      origin,
    );
  }

  const userId = request.headers.get('X-User-Id');
  if (!userId) {
    return withCors(
      new Response(JSON.stringify({ error: '缺少 X-User-Id header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
      origin,
    );
  }

  // 取得用戶專屬的 DO 實例
  const doId = env.PUSH_ALARM.idFromName(userId);
  const stub = env.PUSH_ALARM.get(doId);

  // 將路由映射到 DO 內部路徑
  // /push/sync → /sync, /push/status → /status, etc.
  const internalPath = path.replace(/^\/push/, '');
  const internalUrl = new URL(request.url);
  internalUrl.pathname = internalPath;

  // 轉發請求到 DO
  const doRequest = new Request(internalUrl.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
  });

  try {
    const doResponse = await stub.fetch(doRequest);
    return withCors(doResponse, origin);
  } catch (e) {
    console.error('[Worker] DO 請求失敗:', e);
    return withCors(
      new Response(JSON.stringify({ error: '伺服器錯誤: ' + e.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }),
      origin,
    );
  }
}

// ── 導出 ──────────────────────────────────────────────────────

export { PushAlarmDO };

export default {
  fetch: handleRequest,
};
