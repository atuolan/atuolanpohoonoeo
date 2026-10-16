/**
 * 把 MCP 伺服器設定轉成聊天工具：清理 schema、決定直接提供或按需載入、建立 ChatToolDefinition。
 * 不匯入 SDK；實際呼叫由 McpToolCaller（mcpClientManager）負責。
 */
import type { JsonSchema, JsonSchemaType } from "@/services/toolCalling/jsonSchema";
import type { ChatToolDefinition, ToolExecutionValue, ToolImage } from "@/services/toolCalling/types";
import type { CharacterToolPermissions } from "@/types/character";
import type { McpServerConfig, McpToolEntry } from "@/types/mcp";
import { convertCallToolResult } from "./mcpResult";
import { assignToolNames } from "./mcpToolNames";

export const DIRECT_SERVER_TOKEN_LIMIT = 1500;
export const DIRECT_TOTAL_TOKEN_LIMIT = 3000;
export const MCP_TOOL_TIMEOUT_MS = 30_000;
export const MCP_LOADER_TOOL_NAME = "load_mcp_tools";
const MAX_DESCRIPTION = 1000;
const MAX_SCHEMA_DESCRIPTION = 500;
const MAX_REF_HOPS = 5;
const MAX_DEPTH = 8;
const SCHEMA_TYPES: JsonSchemaType[] = ["object", "string", "number", "integer", "boolean", "array"];
const UNKNOWN_TOOL = /unknown tool|tool not found|no such tool/i;

export const mcpCategory = (serverId: string): string => `mcp:${serverId}`;

export function isMcpServerAllowedForCharacter(serverId: string, permissions?: CharacterToolPermissions | null): boolean {
  if (permissions && !permissions.enabled) return false;
  return permissions?.categories?.[mcpCategory(serverId)] !== false;
}

export function enabledTools(server: McpServerConfig): McpToolEntry[] {
  return server.tools.filter((tool) => tool.enabled);
}

/** 啟用中、而且至少有一個開著的工具 */
export function usableServers(servers: McpServerConfig[]): McpServerConfig[] {
  return servers.filter((server) => server.enabled && enabledTools(server).length > 0);
}

// ---- schema 清理：各家模型與中轉 API 接受的 JSON Schema 不同，只留最安全的子集合 ----

type RawSchema = Record<string, unknown>;

function isRecord(value: unknown): value is RawSchema {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveRef(root: RawSchema, ref: string): RawSchema | undefined {
  if (!ref.startsWith("#/")) return undefined;
  let current: unknown = root;
  for (const segment of ref.slice(2).split("/")) {
    if (!isRecord(current)) return undefined;
    current = current[segment.replace(/~1/g, "/").replace(/~0/g, "~")];
  }
  return isRecord(current) ? current : undefined;
}

function pickType(value: unknown): JsonSchemaType | undefined {
  const candidates = Array.isArray(value) ? value : [value];
  return candidates.find((entry): entry is JsonSchemaType => typeof entry === "string" && (SCHEMA_TYPES as string[]).includes(entry));
}

function withDescription(schema: JsonSchema, source: RawSchema): JsonSchema {
  if (schema.description || typeof source.description !== "string" || !source.description) return schema;
  return { ...schema, description: source.description.slice(0, MAX_SCHEMA_DESCRIPTION) };
}

function cleanNode(node: unknown, root: RawSchema, depth: number, hops = 0): JsonSchema {
  if (!isRecord(node) || depth > MAX_DEPTH) return {};
  if (typeof node.$ref === "string") {
    const resolved = hops < MAX_REF_HOPS ? resolveRef(root, node.$ref) : undefined;
    return withDescription(resolved ? cleanNode(resolved, root, depth, hops + 1) : {}, node);
  }
  for (const key of ["anyOf", "oneOf"]) {
    const branches = node[key];
    if (Array.isArray(branches)) {
      const branch = branches.find((entry) => !(isRecord(entry) && entry.type === "null"));
      return withDescription(branch === undefined ? {} : cleanNode(branch, root, depth, hops), node);
    }
  }
  const result: JsonSchema = {};
  const type = pickType(node.type);
  if (type) result.type = type;
  if (typeof node.description === "string" && node.description) result.description = node.description.slice(0, MAX_SCHEMA_DESCRIPTION);
  if (Array.isArray(node.enum)) result.enum = [...node.enum];
  if (isRecord(node.properties)) {
    result.properties = Object.fromEntries(Object.entries(node.properties).map(([key, value]) => [key, cleanNode(value, root, depth + 1)]));
  }
  if (Array.isArray(node.required)) result.required = node.required.filter((key): key is string => typeof key === "string");
  if (isRecord(node.items)) result.items = cleanNode(node.items, root, depth + 1);
  return result;
}

export function sanitizeSchema(raw: unknown): JsonSchema {
  const root = isRecord(raw) ? raw : {};
  const { required, ...cleaned } = cleanNode(root, root, 0);
  const properties = cleaned.properties ?? {};
  const kept = (required ?? []).filter((key) => key in properties);
  return { ...cleaned, type: "object", properties, ...(kept.length ? { required: kept } : {}) };
}

// ---- 直接提供／按需載入 ----

function estimateToolTokens(tool: McpToolEntry): number {
  return Math.ceil(JSON.stringify({ name: tool.name, description: tool.description, parameters: sanitizeSchema(tool.inputSchema) }).length / 3);
}

export function estimateServerTokens(server: McpServerConfig): number {
  return enabledTools(server).reduce((sum, tool) => sum + estimateToolTokens(tool), 0);
}

export type McpExposureReason = "direct" | "too_many_tools" | "budget_full";

export interface McpServerExposure {
  serverId: string;
  mode: "direct" | "lazy";
  reason: McpExposureReason;
  tokens: number;
}

/** 由小到大：單台 ≤ 1500 且累計 ≤ 3000 的直接提供，其餘按需載入 */
export function planMcpExposure(servers: McpServerConfig[]): McpServerExposure[] {
  const sized = usableServers(servers)
    .map((server) => ({ server, tokens: estimateServerTokens(server) }))
    .sort((a, b) => a.tokens - b.tokens || a.server.id.localeCompare(b.server.id));
  let total = 0;
  return sized.map(({ server, tokens }): McpServerExposure => {
    if (tokens > DIRECT_SERVER_TOKEN_LIMIT) return { serverId: server.id, mode: "lazy", reason: "too_many_tools", tokens };
    if (total + tokens > DIRECT_TOTAL_TOKEN_LIMIT) return { serverId: server.id, mode: "lazy", reason: "budget_full", tokens };
    total += tokens;
    return { serverId: server.id, mode: "direct", reason: "direct", tokens };
  });
}

// ---- 建立聊天工具 ----

export interface McpToolCaller {
  callTool(server: McpServerConfig, toolName: string, args: Record<string, unknown>, options: { signal?: AbortSignal; timeoutMs?: number }): Promise<unknown>;
}

export interface BuildMcpChatToolsOptions {
  /** 這個角色可以用的伺服器（已依角色權限過濾） */
  servers: McpServerConfig[];
  /** 已被內建工具使用的名稱 */
  reservedNames: string[];
  caller: McpToolCaller;
  /** 圖片送給模型前的處理（縮圖）；測試可以省略 */
  prepareImages?: (images: ToolImage[]) => Promise<ToolImage[]>;
}

function createDefinition(server: McpServerConfig, tool: McpToolEntry, name: string, options: BuildMcpChatToolsOptions): ChatToolDefinition {
  return {
    name,
    displayName: `${server.name} · ${tool.title || tool.name}`,
    description: `【${server.name}】${tool.description || tool.title || tool.name}`.slice(0, MAX_DESCRIPTION),
    category: mcpCategory(server.id),
    risk: tool.requireConfirm ? "high" : "low",
    parameters: sanitizeSchema(tool.inputSchema),
    timeoutMs: MCP_TOOL_TIMEOUT_MS,
    async execute(args, context): Promise<ToolExecutionValue> {
      let raw: unknown;
      try {
        raw = await options.caller.callTool(server, tool.name, args, { signal: context.signal, timeoutMs: MCP_TOOL_TIMEOUT_MS });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(UNKNOWN_TOOL.test(message) ? `${message}（請到設定重新讀取工具）` : message);
      }
      const output = convertCallToolResult(raw);
      if (output.isError) throw new Error(output.text || "工具回報錯誤");
      const images = output.images.length && options.prepareImages ? await options.prepareImages(output.images) : output.images;
      return { summary: output.text || (images.length ? `回傳了 ${images.length} 張圖片` : "完成"), ...(images.length ? { images } : {}) };
    },
  };
}

function lazyDescription(server: McpServerConfig): string {
  if (server.description.trim()) return server.description.trim().slice(0, 300);
  const tools = enabledTools(server);
  const names = tools.slice(0, 3).map((tool) => tool.name).join("、");
  return `包含 ${names}${tools.length > 3 ? " 等" : ""} ${tools.length} 個工具`;
}

interface LazyGroup {
  server: McpServerConfig;
  tools: ChatToolDefinition[];
}

function createLoaderTool(groups: LazyGroup[]): ChatToolDefinition {
  const byLabel = new Map<string, LazyGroup>();
  for (const group of groups) {
    let label = group.server.name;
    for (let suffix = 2; byLabel.has(label); suffix += 1) label = `${group.server.name} (${suffix})`;
    byLabel.set(label, group);
  }
  const lines = [...byLabel.entries()].map(([label, group]) => `- ${label}：${lazyDescription(group.server)}`);
  return {
    name: MCP_LOADER_TOOL_NAME,
    displayName: "載入外部工具",
    description: ["載入一組外部工具。需要用到下列工具組時先呼叫這個工具，下一步就能直接呼叫載入的工具：", ...lines].join("\n"),
    category: "mcp",
    risk: "low",
    parameters: { type: "object", properties: { server: { type: "string", enum: [...byLabel.keys()], description: "要載入的工具組名稱" } }, required: ["server"] },
    execute(args): ToolExecutionValue {
      const label = String(args.server);
      const group = byLabel.get(label);
      if (!group) throw new Error("沒有這個工具組");
      return {
        summary: `已載入「${label}」的 ${group.tools.length} 個工具，現在可以直接呼叫：${group.tools.map((entry) => entry.name).join("、")}`,
        loadTools: group.tools,
      };
    },
  };
}

export function buildMcpChatTools(options: BuildMcpChatToolsOptions): ChatToolDefinition[] {
  const servers = usableServers(options.servers);
  if (!servers.length) return [];
  const mode = new Map(planMcpExposure(servers).map((entry) => [entry.serverId, entry.mode]));
  const assigned = assignToolNames(
    servers.flatMap((server) => enabledTools(server).map((tool) => ({ serverId: server.id, serverName: server.name, serverIndex: options.servers.indexOf(server), toolName: tool.name }))),
    [...options.reservedNames, MCP_LOADER_TOOL_NAME],
  );
  const nameOf = new Map(assigned.map((entry) => [`${entry.serverId}\u0000${entry.toolName}`, entry.registryName]));
  const direct: ChatToolDefinition[] = [];
  const lazy: LazyGroup[] = [];
  for (const server of servers) {
    const definitions = enabledTools(server).map((tool) => createDefinition(server, tool, nameOf.get(`${server.id}\u0000${tool.name}`) ?? tool.name, options));
    if (mode.get(server.id) === "direct") direct.push(...definitions);
    else lazy.push({ server, tools: definitions });
  }
  return lazy.length ? [...direct, createLoaderTool(lazy)] : direct;
}
