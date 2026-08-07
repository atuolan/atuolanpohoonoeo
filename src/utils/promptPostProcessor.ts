import type { APIMessage, MessageContent, TextContent, ImageContent, InputAudioContent, ToolCallPayload } from "@/api/OpenAICompatible";

export type PromptPostProcessingType =
  | "none" | "claude" | "merge" | "merge_tools" | "semi" | "semi_tools"
  | "strict" | "strict_tools" | "single" | "";

export interface PromptPostProcessingOptions {
  placeholderText?: string;
}

type ContentBlock = TextContent | ImageContent | InputAudioContent;

function cloneContent(content: MessageContent): MessageContent {
  return typeof content === "string"
    ? content
    : content.map((block) => ({ ...block, ...(block.type === "text" ? {} : { [block.type === "image_url" ? "image_url" : "input_audio"]: { ...(block as any)[block.type === "image_url" ? "image_url" : "input_audio"] } }) } as ContentBlock));
}

function cloneMessage(message: APIMessage): APIMessage {
  return {
    ...message,
    content: cloneContent(message.content),
    ...(message.tool_calls ? { tool_calls: message.tool_calls.map((call) => ({ ...call, function: { ...call.function } })) } : {}),
  };
}

function toTextParts(content: MessageContent): Array<string | ContentBlock> {
  if (typeof content === "string") return [content];
  return content.map((part) => ({ ...part } as ContentBlock));
}

function mergeContent(messages: APIMessage[]): MessageContent {
  const hasMultimodal = messages.some((message) => Array.isArray(message.content));
  if (hasMultimodal) {
    const blocks: ContentBlock[] = [];
    messages.forEach((message, index) => {
      if (index > 0) blocks.push({ type: "text", text: "\n\n" });
      if (typeof message.content === "string") blocks.push({ type: "text", text: message.content });
      else blocks.push(...message.content.map((part) => ({ ...part } as ContentBlock)));
    });
    return blocks;
  }
  const parts: Array<string | ContentBlock> = [];
  messages.forEach((message, index) => {
    const incoming = toTextParts(message.content);
    if (index > 0 && parts.length && incoming.length) {
      const last = parts[parts.length - 1];
      const first = incoming[0];
      if (typeof last === "string" && typeof first === "string") {
        parts[parts.length - 1] = `${last}\n\n${incoming.shift()}`;
      } else {
        // MessageContent arrays must contain provider content blocks only;
        // represent boundaries as a text block when either side is multimodal.
        parts.push({ type: "text", text: "\n\n" });
      }
    }
    parts.push(...incoming);
  });
  if (parts.length === 1 && typeof parts[0] === "string") return parts[0];
  return parts as MessageContent;
}

function mergeMessages(messages: APIMessage[]): APIMessage[] {
  const result: APIMessage[] = [];
  for (const message of messages) {
    const previous = result[result.length - 1];
    const canMergeToolResults = previous?.role !== "tool" || message.tool_call_id === previous.tool_call_id;
    if (previous && previous.role === message.role && canMergeToolResults) {
      const prefix = (m: APIMessage): APIMessage => {
        if (!m.name) return m;
        if (typeof m.content === "string") return { ...m, content: `${m.name}: ${m.content}` };
        return { ...m, content: [{ type: "text", text: `${m.name}:` }, ...m.content] };
      };
      const merged = { ...previous, content: mergeContent([prefix(previous), prefix(message)]) };
      if (!merged.name) merged.name = message.name;
      if (previous.identifier || message.identifier) {
        const identifiers = [previous.identifier, message.identifier]
          .filter((value): value is string => Boolean(value))
          .flatMap((value) => value.split("+"))
          .filter((value, index, all) => all.indexOf(value) === index);
        merged.identifier = identifiers.join("+");
      }
      if (message.tool_calls) merged.tool_calls = [...(previous.tool_calls ?? []), ...message.tool_calls];
      if (message.tool_call_id) merged.tool_call_id = message.tool_call_id;
      result[result.length - 1] = merged;
    } else {
      result.push(cloneMessage(message));
    }
  }
  return result;
}

function stripTools(message: APIMessage): APIMessage {
  const clone = cloneMessage(message);
  delete clone.tool_calls;
  delete clone.tool_call_id;
  if (clone.role === "tool") clone.role = "user";
  return clone;
}

export function postProcessPrompt(
  messages: APIMessage[],
  type: PromptPostProcessingType = "none",
  options: PromptPostProcessingOptions = {},
): APIMessage[] {
  const mode = type || "none";
  if (mode === "none") return messages.map(cloneMessage);
  const preserveTools = mode.endsWith("_tools");
  let working = messages.map((message) => preserveTools ? cloneMessage(message) : stripTools(message));
  if (mode === "single") {
    const converted = working.map((message) => ({ ...message, role: "user" as const }));
    return [{ role: "user", content: mergeContent(converted) }];
  }
  if (mode === "semi" || mode === "semi_tools" || mode === "strict" || mode === "strict_tools") {
    working = working.map((message, index) => index > 0 && message.role === "system" ? { ...message, role: "user" as const } : message);
  }
  working = mergeMessages(working);
  if (mode === "strict" || mode === "strict_tools") {
    const placeholder = options.placeholderText ?? "[Start a new chat]";
    if (working.length && working[0].role === "system") {
      if (working[1]?.role !== "user") working.splice(1, 0, { role: "user", content: placeholder });
    } else if (!working.length || (working[0].role !== "user" && working[0].role !== "system")) {
      working.unshift({ role: "user", content: placeholder });
    }
    working = mergeMessages(working);
  }
  return working;
}

export { cloneMessage, toTextParts, mergeContent, mergeMessages };
