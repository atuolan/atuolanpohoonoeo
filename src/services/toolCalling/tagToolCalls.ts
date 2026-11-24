/**
 * 有些模型不照工具協議呼叫工具，而是把工具寫成標籤，例如
 * `<generate_image prompt="..." negative="..." />`（照聊天裡 <pic> 的寫法類推）。
 * 這裡把「名稱是已註冊工具」的標籤認成工具呼叫，參數照工具的 schema 轉型，並從正文拿掉。
 */
import type { JsonSchema } from "./jsonSchema";
import type { ChatToolDefinition, ToolCall } from "./types";

const ATTRIBUTE = /([A-Za-z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function coerce(value: string, schema: JsonSchema | undefined): unknown {
  const trimmed = value.trim();
  switch (schema?.type) {
    case "integer": {
      const n = Number(trimmed);
      return Number.isFinite(n) ? Math.trunc(n) : trimmed;
    }
    case "number": {
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : trimmed;
    }
    case "boolean":
      return /^(true|1|yes)$/i.test(trimmed);
    case "array": {
      if (trimmed.startsWith("[")) {
        try {
          const parsed: unknown = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          // 不是 JSON 就照下面切開
        }
      }
      // 多個值用 | 或 ; 分開；逗號留給像 "hanfu, male focus" 這種單一值
      return trimmed.split(/\s*[|;]\s*/).filter(Boolean);
    }
    default:
      return value;
  }
}

function parseAttributes(raw: string, schema: JsonSchema | undefined): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const match of raw.matchAll(ATTRIBUTE)) {
    const key = match[1];
    args[key] = coerce(match[2] ?? match[3] ?? "", schema?.properties?.[key]);
  }
  return args;
}

/**
 * 找出寫成標籤的工具呼叫：`<name attr="..."/>`、`<name attr="..."></name>`。
 * 只認 tools 裡有的名稱；回傳拿掉標籤後的正文。
 */
export function extractTagToolCalls(
  content: string,
  tools: ChatToolDefinition[],
  idPrefix = "tag",
): { content: string; toolCalls: ToolCall[] } {
  if (!content.includes("<") || !tools.length) return { content, toolCalls: [] };
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const names = tools.map((tool) => tool.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = new RegExp(`<(${names})((?:\\s+[A-Za-z_][\\w-]*\\s*=\\s*(?:"[^"]*"|'[^']*'))*)\\s*(?:\\/>|>\\s*<\\/\\1\\s*>|>)`, "g");
  const toolCalls: ToolCall[] = [];
  const stripped = content.replace(pattern, (_match, name: string, attrs: string) => {
    const tool = byName.get(name);
    if (!tool) return _match;
    toolCalls.push({
      id: `${idPrefix}_${toolCalls.length + 1}`,
      name,
      arguments: parseAttributes(attrs, tool.parameters as JsonSchema),
    });
    return "";
  });
  return toolCalls.length ? { content: stripped.trim() ? stripped : "", toolCalls } : { content, toolCalls: [] };
}
