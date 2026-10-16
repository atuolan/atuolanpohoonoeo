/**
 * mcp-proxy 的純函式：目標網址檢查、Origin 白名單、header 過濾。
 * Cloudflare Worker 與 Vite 開發代理共用。
 */

export type ProxyErrorCode = "bad_target" | "private_address" | "origin_not_allowed" | "method_not_allowed" | "upstream_unreachable";

export const PROXY_ERROR_HEADER = "X-Mcp-Proxy-Error";
const EXPOSED_HEADERS = "Mcp-Session-Id, Mcp-Protocol-Version, WWW-Authenticate, X-Mcp-Proxy-Error";
const ALLOWED_METHODS = "GET, POST, DELETE, OPTIONS";
const DEFAULT_ALLOWED_HEADERS = "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID";

export const PROXY_ERROR_MESSAGES: Record<ProxyErrorCode, string> = {
  bad_target: "網址格式不正確，只支援 http 或 https。",
  private_address: "這是內網位址，手機連不到。電腦上的 MCP 請用 Cloudflare Tunnel 開一個 https 網址。",
  origin_not_allowed: "代理只接受來自 Aguaphone 的請求。",
  method_not_allowed: "代理不支援這種請求方法。",
  upstream_unreachable: "連不上伺服器。請確認網址正確、伺服器有開著。",
};

export type TargetCheck = { ok: true; url: URL } | { ok: false; code: ProxyErrorCode };

function ipv4Parts(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const numbers = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  return numbers.every((value) => Number.isInteger(value) && value >= 0 && value <= 255) ? numbers : null;
}

export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  const v4 = ipv4Parts(host);
  if (v4) {
    const [a, b] = v4;
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (host.includes(":")) {
    return host === "::" || host === "::1" || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith("::ffff:");
  }
  return false;
}

/** URL 解析會把 2130706433、0x7f.1 之類的寫法正規化成點分 IPv4，所以要先解析再檢查 */
export function checkTarget(raw: string | null, options: { allowPrivate?: boolean } = {}): TargetCheck {
  if (!raw) return { ok: false, code: "bad_target" };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, code: "bad_target" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, code: "bad_target" };
  if (!options.allowPrivate && isPrivateHost(url.hostname)) return { ok: false, code: "private_address" };
  return { ok: true, url };
}

export function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

/** 支援完全相同與 https://*.example.com 這種子網域萬用字元 */
export function isOriginAllowed(origin: string | null, allowed: string[]): boolean {
  if (!origin) return false;
  return allowed.some((entry) => {
    if (entry === origin) return true;
    const wildcard = /^(https?:\/\/)\*\.(.+)$/.exec(entry);
    if (!wildcard) return false;
    const [, scheme, suffix] = wildcard;
    return origin.startsWith(scheme) && origin.slice(scheme.length).endsWith(`.${suffix}`);
  });
}

const DROPPED_REQUEST_HEADERS = new Set(["host", "cookie", "origin", "referer", "connection", "content-length", "accept-encoding", "keep-alive", "transfer-encoding", "upgrade", "x-real-ip", "true-client-ip"]);

export function buildForwardHeaders(incoming: Headers): Headers {
  const headers = new Headers();
  incoming.forEach((value, key) => {
    const name = key.toLowerCase();
    if (DROPPED_REQUEST_HEADERS.has(name) || name.startsWith("cf-") || name.startsWith("x-forwarded-") || name.startsWith("sec-")) return;
    headers.set(name, value);
  });
  return headers;
}

export function corsHeaders(origin: string, requestedHeaders: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": requestedHeaders || DEFAULT_ALLOWED_HEADERS,
    "Access-Control-Expose-Headers": EXPOSED_HEADERS,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function proxyErrorBody(code: ProxyErrorCode, detail?: string): string {
  return JSON.stringify({ error: PROXY_ERROR_MESSAGES[code], code, ...(detail ? { detail } : {}) });
}
