/**
 * Aguaphone MCP 代理：替瀏覽器轉發 MCP 請求（解決 CORS），不存資料、不記錄內容。
 */
import { buildForwardHeaders, checkTarget, corsHeaders, isOriginAllowed, parseAllowedOrigins, PROXY_ERROR_HEADER, proxyErrorBody, type ProxyErrorCode } from "./guard";

export interface Env {
  ALLOWED_ORIGINS?: string;
}

function errorResponse(status: number, code: ProxyErrorCode, cors: Record<string, string>, detail?: string): Response {
  return new Response(proxyErrorBody(code, detail), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", [PROXY_ERROR_HEADER]: code },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    if (!origin || !isOriginAllowed(origin, parseAllowedOrigins(env.ALLOWED_ORIGINS))) {
      return errorResponse(403, "origin_not_allowed", {});
    }
    const cors = corsHeaders(origin, request.headers.get("Access-Control-Request-Headers"));
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!["GET", "POST", "DELETE"].includes(request.method)) return errorResponse(405, "method_not_allowed", cors);
    const target = checkTarget(new URL(request.url).searchParams.get("target"));
    if (!target.ok) return errorResponse(400, target.code, cors);

    let upstream: Response;
    try {
      upstream = await fetch(target.url.toString(), {
        method: request.method,
        headers: buildForwardHeaders(request.headers),
        // MCP 的請求本體很小，讀成 ArrayBuffer 比串流轉送單純
        body: request.method === "POST" ? await request.arrayBuffer() : undefined,
      });
    } catch (error) {
      return errorResponse(502, "upstream_unreachable", cors, error instanceof Error ? error.message : String(error));
    }

    const headers = new Headers(upstream.headers);
    headers.delete("set-cookie");
    for (const [key, value] of Object.entries(cors)) headers.set(key, value);
    // 回應原樣串流回去，SSE 才能運作
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
  },
};
