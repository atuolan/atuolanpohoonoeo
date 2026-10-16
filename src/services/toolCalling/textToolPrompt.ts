/**
 * 文字協定（模型不支援原生工具呼叫時）：告訴模型有哪些工具、怎麼呼叫，
 * 並把原生格式的工具往返紀錄改寫成純文字。
 */
import type { APIMessage, MessageContent } from "@/api/OpenAICompatible";
import type { OpenAIToolDefinition } from "./protocolAdapters";

/** 工具說明訊息的 identifier（診斷與 Anthropic 分塊用） */
export const TOOL_INSTRUCTIONS_IDENTIFIER = "toolInstructions";

function textOf(content: MessageContent): string {
  if (typeof content === "string") return content;
  return content.map((part) => (part.type === "text" ? part.text : "")).join("");
}

function parseArguments(raw: string): unknown {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

export function buildTextToolInstructions(tools: OpenAIToolDefinition[]): string {
  const list = tools.map((tool) => {
    const parameters = JSON.stringify(tool.parameters ?? { type: "object", properties: {} });
    return `- ${tool.name}：${tool.description ?? ""}\n  參數格式：${parameters}`;
  });
  return [
    "<tools>",
    "你可以使用下列工具，實際完成操作或查詢資料：",
    ...list,
    "",
    "需要使用工具時，輸出一個 ```tool_calls 區塊，內容是 JSON 陣列，例如：",
    "```tool_calls",
    '[{"id":"call_1","name":"工具名稱","arguments":{"參數":"值"}}]',
    "```",
    "規則：",
    "1. 只能使用上面列出的工具，arguments 要符合參數格式；每次呼叫的 id 都要不同。",
    "2. 需要實際操作時要真的呼叫工具，不要只用文字假裝已經做了。",
    "3. 輸出 tool_calls 區塊後就停下來，等系統回傳「工具結果」再繼續回覆。",
    "4. 不需要工具時照平常回覆，不要輸出 tool_calls 區塊。",
    "</tools>",
  ].join("\n");
}

/** 把 assistant.tool_calls 與 tool 訊息改寫成純文字，給不支援工具的 API */
export function convertToolMessagesToText(messages: APIMessage[]): APIMessage[] {
  const names = new Map<string, string>();
  return messages.map((message) => {
    if (message.role === "assistant" && message.tool_calls?.length) {
      const calls = message.tool_calls.map((call) => {
        names.set(call.id, call.function.name);
        return { id: call.id, name: call.function.name, arguments: parseArguments(call.function.arguments) };
      });
      const text = textOf(message.content).trim();
      const block = "```tool_calls\n" + JSON.stringify(calls) + "\n```";
      const { tool_calls: _toolCalls, ...rest } = message;
      return { ...rest, content: text ? `${text}\n${block}` : block };
    }
    if (message.role === "tool") {
      const id = message.tool_call_id ?? "";
      return { role: "user", content: `工具結果（${names.get(id) ?? "tool"}，${id}）：${textOf(message.content)}` };
    }
    return message;
  });
}

/** 插在開頭連續的 system 訊息之後；開頭沒有 system 就放最前面 */
export function insertToolInstructions(messages: APIMessage[], instructions: string): APIMessage[] {
  let index = 0;
  while (index < messages.length && messages[index].role === "system") index += 1;
  const next = [...messages];
  next.splice(index, 0, { role: "system", content: instructions, identifier: TOOL_INSTRUCTIONS_IDENTIFIER });
  return next;
}

export function applyTextToolProtocol(messages: APIMessage[], tools: OpenAIToolDefinition[]): APIMessage[] {
  return insertToolInstructions(convertToolMessagesToText(messages), buildTextToolInstructions(tools));
}
