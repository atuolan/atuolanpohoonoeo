/**
 * MCP 工具名 → 註冊用名稱（^[a-z][a-z0-9_]{1,63}$），處理撞名。
 */

export const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;
const MAX_NAME = 64;

export function sanitizeToolName(raw: string): string {
  const snake = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const name = (/^[a-z]/.test(snake) ? snake : `t_${snake}`).slice(0, MAX_NAME).replace(/_+$/, "");
  return TOOL_NAME_PATTERN.test(name) ? name : "tool";
}

/** 伺服器代號：名稱的英數部分；全中文或開頭不是字母時用位置編號 */
export function serverCode(serverName: string, serverIndex: number): string {
  const ascii = serverName.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return /^[a-z]/.test(ascii) ? ascii.slice(0, 16) : `mcp${serverIndex + 1}`;
}

export interface McpToolNameRequest {
  serverId: string;
  serverName: string;
  serverIndex: number;
  toolName: string;
}

export interface McpToolNameAssignment extends McpToolNameRequest {
  registryName: string;
}

function withSuffix(base: string, suffix: string): string {
  return `${base.slice(0, MAX_NAME - suffix.length).replace(/_+$/, "")}${suffix}`;
}

export function assignToolNames(requests: McpToolNameRequest[], reserved: Iterable<string>): McpToolNameAssignment[] {
  const used = new Set(reserved);
  const baseCount = new Map<string, number>();
  for (const request of requests) {
    const base = sanitizeToolName(request.toolName);
    baseCount.set(base, (baseCount.get(base) ?? 0) + 1);
  }
  return requests.map((request) => {
    const base = sanitizeToolName(request.toolName);
    const collides = used.has(base) || (baseCount.get(base) ?? 0) > 1;
    const preferred = collides
      ? `${serverCode(request.serverName, request.serverIndex)}_${base}`.slice(0, MAX_NAME).replace(/_+$/, "")
      : base;
    let name = preferred;
    for (let suffix = 2; used.has(name); suffix += 1) name = withSuffix(preferred, `_${suffix}`);
    used.add(name);
    return { ...request, registryName: name };
  });
}
