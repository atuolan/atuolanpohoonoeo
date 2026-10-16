/**
 * 防截斷的假工具：名稱、定義、控制提示詞與工具名分類
 * 移植自酒館助手防截斷腳本的 request.js
 */

/** 工具名前綴：隨機挑一個，後面接 16 位十六進位 */
export const TOOL_NAME_PREFIXES = [
  "render_document_chunk_",
  "dispatch_stream_payload_",
  "stream_response_segment_",
  "deliver_formatted_view_",
] as const;

/** 舊版腳本用過的前綴：模型照抄舊名字時也認得 */
const LEGACY_PREFIXES = ["channel_transport_", "emit_complete_response_"];

/** 正文放在工具的這個參數裡 */
export const CONTENT_PARAM = "content";

export interface NativeToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export function generateToolName(existing: Set<string>): string {
  const prefix = TOOL_NAME_PREFIXES[Math.floor(Math.random() * TOOL_NAME_PREFIXES.length)];
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const name = prefix + Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (!existing.has(name)) return name;
  }
  return `${prefix}${Date.now().toString(36)}`;
}

let sessionToolName: string | null = null;

/**
 * 同一次開 app 只用一個工具名。工具定義排在提示詞快取前綴的最前面，
 * 每次請求都換名會讓整段快取失效。跟角色工具撞名才重抽。
 */
export function getSessionToolName(clientNames: Set<string>): string {
  if (!sessionToolName || clientNames.has(sessionToolName)) {
    sessionToolName = generateToolName(clientNames);
  }
  return sessionToolName;
}

export function buildToolDefinition(name: string): NativeToolDefinition {
  return {
    type: "function",
    function: {
      name,
      description:
        "Direct rendering interface for formatting and streaming output. Pass the entire primary response body into the target argument.",
      parameters: {
        type: "object",
        properties: {
          [CONTENT_PARAM]: {
            type: "string",
            description: "The complete, uninterrupted output message to present.",
          },
        },
        required: [CONTENT_PARAM],
      },
    },
  };
}

export function buildControlPrompt(name: string): string {
  return `[Output Format Protocol]: All user-visible response text must be transmitted via the \`${name}\` call with the argument \`${CONTENT_PARAM}\`. Do not emit markdown prose directly outside this interface invocation.`;
}

/** 有些中轉會在工具名前加命名空間（a:b），比對時只看最後一段 */
export function extractBareToolName(candidate: string): string {
  return candidate.slice(candidate.lastIndexOf(":") + 1);
}

export type ToolOrigin = "own" | "foreign" | "client";

/** own：本次假工具；foreign：別次的假工具名；client：角色工具或認不得的工具 */
export function classifyToolName(candidate: unknown, ownName: string, clientNames: Set<string>): ToolOrigin {
  if (typeof candidate !== "string" || !candidate) return "client";
  const bare = extractBareToolName(candidate);
  if (candidate === ownName || bare === ownName) return "own";
  if (clientNames.has(candidate) || clientNames.has(bare)) return "client";
  return [...TOOL_NAME_PREFIXES, ...LEGACY_PREFIXES].some((prefix) => bare.startsWith(prefix)) ? "foreign" : "client";
}
