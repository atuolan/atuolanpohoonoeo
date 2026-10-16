/**
 * MCP 連線管理：每台伺服器一個 SDK Client，負責握手、讀工具、呼叫工具。
 * 只能透過 src/services/mcp/index.ts 動態載入，沒設定 MCP 的人不會載入 SDK。
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { SSEClientTransport, SseError } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { DiscoveredMcpTool, McpServerConfig } from "@/types/mcp";
import { createMcpFetch, defaultProxyBase, type FetchLike, type McpFetchState, type McpRoute } from "./mcpFetch";

export type McpErrorKind = "unreachable" | "private" | "unauthorized" | "oauth" | "not_mcp" | "timeout" | "server";

export const MCP_ERROR_MESSAGES = {
  unreachable: "連不上伺服器。請確認網址正確、伺服器有開著。",
  private: "這是內網位址，手機連不到。電腦上的 MCP 請用 Cloudflare Tunnel 開一個 https 網址。",
  unauthorized: "需要 Token，或 Token 不正確。",
  oauth: "這台伺服器要用 OAuth 授權登入，目前版本還不支援，之後會加上。",
  not_mcp: "這個網址不是 MCP 端點。網址通常以 /mcp 或 /sse 結尾。",
  timeout: "伺服器太久沒回應。",
} as const;

export class McpConnectionError extends Error {
  readonly kind: McpErrorKind;

  constructor(kind: McpErrorKind, message: string) {
    super(message);
    this.name = "McpConnectionError";
    this.kind = kind;
  }
}

export interface McpServerInfo {
  name?: string;
  version?: string;
  instructions?: string;
}

export interface McpDiscoveryResult {
  info: McpServerInfo;
  tools: DiscoveredMcpTool[];
  route: McpRoute;
}

export interface McpCallOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface McpClientManagerOptions {
  fetchImpl?: FetchLike;
  proxyBase?: string;
}

interface Connection {
  key: string;
  client: Client;
  state: McpFetchState;
  info: McpServerInfo;
}

const CLIENT_INFO = { name: "aguaphone", version: "1.0.0" };
const MAX_TOOL_PAGES = 10;
const OAUTH_CHALLENGE = /resource_metadata|authorization_uri|as_uri/i;

function httpStatusOf(error: unknown): number | undefined {
  return error instanceof StreamableHTTPError || error instanceof SseError ? error.code : undefined;
}

/** POST 被拒成 400／404／405：這個網址可能只支援舊版 SSE */
export function shouldFallbackToSse(error: unknown): boolean {
  const status = httpStatusOf(error);
  return status === 400 || status === 404 || status === 405;
}

/** 已連線後收到 404：伺服器忘了這個 session，要重新握手 */
function isSessionExpired(error: unknown): boolean {
  return httpStatusOf(error) === 404;
}

export function classifyMcpError(error: unknown, state?: McpFetchState): McpConnectionError {
  if (error instanceof McpConnectionError) return error;
  if (state?.proxyErrorCode === "private_address") return new McpConnectionError("private", MCP_ERROR_MESSAGES.private);
  if (state?.proxyErrorCode === "upstream_unreachable") return new McpConnectionError("unreachable", MCP_ERROR_MESSAGES.unreachable);
  if (error instanceof McpError && error.code === ErrorCode.RequestTimeout) return new McpConnectionError("timeout", MCP_ERROR_MESSAGES.timeout);
  const status = httpStatusOf(error);
  if (error instanceof UnauthorizedError || status === 401 || status === 403) {
    return OAUTH_CHALLENGE.test(state?.lastWwwAuthenticate ?? "")
      ? new McpConnectionError("oauth", MCP_ERROR_MESSAGES.oauth)
      : new McpConnectionError("unauthorized", MCP_ERROR_MESSAGES.unauthorized);
  }
  if (status === 404 || status === 405) return new McpConnectionError("not_mcp", MCP_ERROR_MESSAGES.not_mcp);
  if (error instanceof TypeError) return new McpConnectionError("unreachable", MCP_ERROR_MESSAGES.unreachable);
  const message = error instanceof Error ? error.message : String(error);
  return new McpConnectionError("server", `伺服器回傳錯誤：${message.slice(0, 200)}`);
}

export function buildRequestHeaders(server: McpServerConfig): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const { key, value } of server.headers) {
    if (key.trim()) headers[key.trim()] = value;
  }
  if (server.token?.trim()) headers.Authorization = `Bearer ${server.token.trim()}`;
  return headers;
}

/** 網址、Token、header 改了就要重新連線 */
function connectionKey(server: McpServerConfig): string {
  return JSON.stringify([server.url.trim(), server.token ?? "", server.headers.map((header) => [header.key, header.value])]);
}

export class McpClientManager {
  private readonly connections = new Map<string, Connection>();
  private readonly opening = new Map<string, Promise<Connection>>();
  private routeListener?: (serverId: string, route: McpRoute) => void;
  private readonly options: McpClientManagerOptions;

  constructor(options: McpClientManagerOptions = {}) {
    this.options = options;
  }

  /** 路線改變時通知（用來把 lastRoute 存回設定） */
  setRouteListener(listener?: (serverId: string, route: McpRoute) => void): void {
    this.routeListener = listener;
  }

  /** 「連線並讀取工具」：一律重新握手，避免沿用舊設定 */
  async discover(server: McpServerConfig, signal?: AbortSignal): Promise<McpDiscoveryResult> {
    await this.disconnect(server.id);
    const connection = await this.connect(server, signal);
    try {
      const tools: DiscoveredMcpTool[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < MAX_TOOL_PAGES; page += 1) {
        const result = await connection.client.listTools(cursor ? { cursor } : undefined, { signal });
        for (const tool of result.tools) {
          const title = tool.title ?? tool.annotations?.title;
          tools.push({
            name: tool.name,
            ...(title ? { title } : {}),
            description: tool.description ?? "",
            inputSchema: tool.inputSchema as Record<string, unknown>,
            ...(tool.annotations?.destructiveHint === true ? { destructiveHint: true } : {}),
          });
        }
        cursor = result.nextCursor;
        if (!cursor) break;
      }
      return { info: connection.info, tools, route: connection.state.route };
    } catch (error) {
      throw classifyMcpError(error, connection.state);
    }
  }

  async callTool(server: McpServerConfig, toolName: string, args: Record<string, unknown>, callOptions: McpCallOptions = {}): Promise<unknown> {
    let connection = await this.connect(server, callOptions.signal);
    try {
      return await this.invoke(connection, toolName, args, callOptions);
    } catch (error) {
      if (!isSessionExpired(error) || callOptions.signal?.aborted) throw classifyMcpError(error, connection.state);
    }
    // session 過期：重新握手後再試一次
    await this.disconnect(server.id);
    connection = await this.connect(server, callOptions.signal);
    try {
      return await this.invoke(connection, toolName, args, callOptions);
    } catch (error) {
      throw classifyMcpError(error, connection.state);
    }
  }

  async disconnect(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);
    this.connections.delete(serverId);
    if (connection) await connection.client.close().catch(() => undefined);
  }

  async disconnectAll(): Promise<void> {
    await Promise.all([...this.connections.keys()].map((serverId) => this.disconnect(serverId)));
  }

  private invoke(connection: Connection, toolName: string, args: Record<string, unknown>, callOptions: McpCallOptions): Promise<unknown> {
    return connection.client.callTool({ name: toolName, arguments: args }, undefined, {
      signal: callOptions.signal,
      ...(callOptions.timeoutMs ? { timeout: callOptions.timeoutMs } : {}),
    });
  }

  private async connect(server: McpServerConfig, signal?: AbortSignal): Promise<Connection> {
    const key = connectionKey(server);
    const existing = this.connections.get(server.id);
    if (existing?.key === key) return existing;
    if (existing) await this.disconnect(server.id);
    const pending = this.opening.get(server.id);
    if (pending) return pending;
    const opening = this.open(server, key, signal).finally(() => this.opening.delete(server.id));
    this.opening.set(server.id, opening);
    const connection = await opening;
    this.connections.set(server.id, connection);
    return connection;
  }

  private async open(server: McpServerConfig, key: string, signal?: AbortSignal): Promise<Connection> {
    let url: URL;
    try {
      url = new URL(server.url.trim());
    } catch {
      throw new McpConnectionError("not_mcp", MCP_ERROR_MESSAGES.not_mcp);
    }
    const state: McpFetchState = { route: server.lastRoute ?? "direct" };
    const fetch = createMcpFetch({
      state,
      proxyBase: this.options.proxyBase ?? defaultProxyBase(),
      fetchImpl: this.options.fetchImpl,
      onRouteChange: (route) => this.routeListener?.(server.id, route),
    });
    const requestInit: RequestInit = { headers: buildRequestHeaders(server) };
    let client = new Client(CLIENT_INFO, { capabilities: {} });
    try {
      await client.connect(new StreamableHTTPClientTransport(url, { fetch, requestInit }), { signal });
    } catch (error) {
      await client.close().catch(() => undefined);
      if (!shouldFallbackToSse(error)) throw classifyMcpError(error, state);
      client = new Client(CLIENT_INFO, { capabilities: {} });
      try {
        await client.connect(new SSEClientTransport(url, { fetch, requestInit }), { signal });
      } catch (sseError) {
        await client.close().catch(() => undefined);
        throw classifyMcpError(sseError, state);
      }
    }
    const version = client.getServerVersion();
    const name = version?.title ?? version?.name;
    const instructions = client.getInstructions();
    return {
      key,
      client,
      state,
      info: {
        ...(name ? { name } : {}),
        ...(version?.version ? { version: version.version } : {}),
        ...(instructions ? { instructions } : {}),
      },
    };
  }
}

let sharedManager: McpClientManager | null = null;

/** App 共用一個管理器，連線可以重用 */
export function getMcpClientManager(): McpClientManager {
  sharedManager ??= new McpClientManager();
  return sharedManager;
}
