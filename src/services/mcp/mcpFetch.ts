/**
 * 交給 MCP SDK 的 fetch：自動選擇直連或代理，並記住哪條路線能通。
 * SDK 永遠看到真實網址，改寫只發生在這一層，舊版 SSE 的相對路徑 endpoint 才能正確解析。
 */

export type McpRoute = "direct" | "proxy";
export type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>;

/** 正式環境的代理 Worker（cloudflare-worker/mcp-proxy） */
export const MCP_PROXY_BASE = "https://aguaphone-mcp-proxy.a23971123.workers.dev/";
/** 開發環境由 vite.config.ts 的 mcpDevProxyPlugin 處理 */
export const DEV_MCP_PROXY_BASE = "/mcp-proxy";
/** 與 cloudflare-worker/mcp-proxy/src/guard.ts 的 PROXY_ERROR_HEADER 一致 */
const PROXY_ERROR_HEADER = "X-Mcp-Proxy-Error";

export function defaultProxyBase(): string {
  return import.meta.env.DEV ? DEV_MCP_PROXY_BASE : MCP_PROXY_BASE;
}

export function toProxyUrl(target: string, base: string): string {
  return `${base}${base.includes("?") ? "&" : "?"}target=${encodeURIComponent(target)}`;
}

export interface McpFetchState {
  route: McpRoute;
  lastStatus?: number;
  lastWwwAuthenticate?: string;
  /** 代理自己擋下或連不上目標時的代碼（mcp-proxy 的 ProxyErrorCode） */
  proxyErrorCode?: string;
}

export interface CreateMcpFetchOptions {
  state: McpFetchState;
  proxyBase: string;
  fetchImpl?: FetchLike;
  onRouteChange?: (route: McpRoute) => void;
}

function isAbortError(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === "AbortError";
}

export function createMcpFetch(options: CreateMcpFetchOptions): FetchLike {
  const fetchImpl: FetchLike = options.fetchImpl ?? ((url, init) => globalThis.fetch(url, init));
  const send = (route: McpRoute, url: string | URL, init?: RequestInit) =>
    fetchImpl(route === "proxy" ? toProxyUrl(String(url), options.proxyBase) : url, init);
  const shouldStop = (error: unknown, init?: RequestInit) => isAbortError(error) || Boolean(init?.signal?.aborted);

  return async (url, init) => {
    const preferred = options.state.route;
    let route = preferred;
    let response: Response;
    try {
      response = await send(route, url, init);
    } catch (error) {
      // 瀏覽器裡 CORS、混合內容、連不上都是 TypeError：換另一條路線試一次
      if (shouldStop(error, init)) throw error;
      route = preferred === "direct" ? "proxy" : "direct";
      response = await send(route, url, init);
    }
    if (route === "proxy" && preferred === "proxy" && response.headers.has(PROXY_ERROR_HEADER)) {
      // 代理自己擋下或連不上目標：直連也許能通（例如開發中的本機伺服器）
      try {
        response = await send("direct", url, init);
        route = "direct";
      } catch (error) {
        if (shouldStop(error, init)) throw error;
      }
    }
    const proxyFailed = route === "proxy" && response.headers.has(PROXY_ERROR_HEADER);
    if (route !== preferred && !proxyFailed) {
      options.state.route = route;
      options.onRouteChange?.(route);
    }
    options.state.lastStatus = response.status;
    options.state.lastWwwAuthenticate = response.headers.get("www-authenticate") ?? undefined;
    options.state.proxyErrorCode = route === "proxy" ? response.headers.get(PROXY_ERROR_HEADER) ?? undefined : undefined;
    return response;
  };
}
