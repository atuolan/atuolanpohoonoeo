/**
 * MCP 伺服器設定（角色可以使用的外部工具）
 */

export interface McpToolEntry {
  /** 伺服器上的原始工具名 */
  name: string;
  /** annotations.title 或 tool.title */
  title?: string;
  description: string;
  /** 伺服器原始 inputSchema；送給模型前才清理 */
  inputSchema: Record<string, unknown>;
  enabled: boolean;
  /** 執行前要使用者確認 */
  requireConfirm: boolean;
}

export interface McpServerConfig {
  id: string;
  /** 顯示名稱；預設取伺服器自報的名稱 */
  name: string;
  /** 給角色看的用途說明；預設取伺服器的 instructions */
  description: string;
  url: string;
  enabled: boolean;
  /** 送出時加上 Authorization: Bearer */
  token?: string;
  headers: Array<{ key: string; value: string }>;
  /** 上次讀到的工具 */
  tools: McpToolEntry[];
  toolsFetchedAt?: number;
  /** 上次成功的連線路線 */
  lastRoute?: "direct" | "proxy";
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface McpSettings {
  servers: McpServerConfig[];
}

/** tools/list 讀回、還沒合併使用者設定的工具 */
export interface DiscoveredMcpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  /** 伺服器明確標記會造成破壞 */
  destructiveHint?: boolean;
}

export const createDefaultMcpSettings = (): McpSettings => ({ servers: [] });

const emptySchema = (): Record<string, unknown> => ({ type: "object", properties: {} });

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function makeId(): string {
  const cryptoApi = globalThis.crypto as (Crypto & { randomUUID?: () => string }) | undefined;
  return cryptoApi?.randomUUID?.() ?? `mcp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function defaultServerName(url: string): string {
  try {
    return new URL(url).hostname || "MCP 伺服器";
  } catch {
    return "MCP 伺服器";
  }
}

export function createMcpServerConfig(url: string, now = Date.now()): McpServerConfig {
  return { id: makeId(), name: defaultServerName(url), description: "", url, enabled: true, headers: [], tools: [], createdAt: now, updatedAt: now };
}

function normalizeTool(raw: unknown): McpToolEntry | null {
  if (!isRecord(raw) || typeof raw.name !== "string" || !raw.name) return null;
  return {
    name: raw.name,
    ...(typeof raw.title === "string" && raw.title ? { title: raw.title } : {}),
    description: typeof raw.description === "string" ? raw.description : "",
    inputSchema: isRecord(raw.inputSchema) ? raw.inputSchema : emptySchema(),
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
    requireConfirm: typeof raw.requireConfirm === "boolean" ? raw.requireConfirm : false,
  };
}

function normalizeServer(raw: unknown, now: number): McpServerConfig | null {
  if (!isRecord(raw) || typeof raw.url !== "string" || !raw.url.trim()) return null;
  const url = raw.url.trim();
  const headers = Array.isArray(raw.headers)
    ? raw.headers
        .filter((header): header is { key: string; value: string } => isRecord(header) && typeof header.key === "string" && typeof header.value === "string")
        .map((header) => ({ key: header.key, value: header.value }))
    : [];
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : makeId(),
    name: (typeof raw.name === "string" && raw.name.trim()) || defaultServerName(url),
    description: typeof raw.description === "string" ? raw.description : "",
    url,
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
    ...(typeof raw.token === "string" && raw.token ? { token: raw.token } : {}),
    headers,
    tools: Array.isArray(raw.tools) ? raw.tools.map(normalizeTool).filter((tool): tool is McpToolEntry => tool !== null) : [],
    ...(typeof raw.toolsFetchedAt === "number" ? { toolsFetchedAt: raw.toolsFetchedAt } : {}),
    ...(raw.lastRoute === "direct" || raw.lastRoute === "proxy" ? { lastRoute: raw.lastRoute } : {}),
    ...(typeof raw.lastError === "string" && raw.lastError ? { lastError: raw.lastError } : {}),
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : now,
  };
}

/** 讀取已存的設定；缺漏或不合法的伺服器、工具直接略過 */
export function normalizeMcpSettings(raw: unknown, now = Date.now()): McpSettings {
  const servers = isRecord(raw) && Array.isArray(raw.servers) ? raw.servers : [];
  return { servers: servers.map((server) => normalizeServer(server, now)).filter((server): server is McpServerConfig => server !== null) };
}

/** 重新讀取工具：還在的工具保留開關與確認設定；新工具用預設值；消失的工具移除 */
export function mergeDiscoveredTools(previous: McpToolEntry[], discovered: DiscoveredMcpTool[]): McpToolEntry[] {
  const byName = new Map(previous.map((tool) => [tool.name, tool]));
  return discovered.map((tool) => {
    const old = byName.get(tool.name);
    return {
      name: tool.name,
      ...(tool.title ? { title: tool.title } : {}),
      description: tool.description ?? "",
      inputSchema: tool.inputSchema ?? emptySchema(),
      enabled: old ? old.enabled : true,
      requireConfirm: old ? old.requireConfirm : tool.destructiveHint === true,
    };
  });
}
