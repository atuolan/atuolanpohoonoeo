import { describe, expect, it } from "vitest";
import { PromptBuilder } from "@/engine/prompt/PromptBuilder";
import { createDefaultPromptManagerConfig } from "@/types/promptManager";

function orderIds(extra: Record<string, unknown>): string[] {
  const builder = new PromptBuilder({
    character: { id: "char-1", data: { name: "角色", description: "" } },
    lorebooks: [],
    messages: [],
    settings: { maxContextLength: 100000, maxResponseLength: 1000 },
    userName: "用戶",
    promptManagerConfig: createDefaultPromptManagerConfig(),
    phoneCallMode: true,
    ...extra,
  } as any) as any;
  return builder.getEffectivePromptOrder().map((e: { identifier: string }) => e.identifier);
}

describe("電話語音輸入說明", () => {
  it("有用語音說話才注入，位置在聊天紀錄之前", () => {
    const ids = orderIds({ voiceInputUsed: true });
    expect(ids).toContain("phoneCallVoiceInput");
    expect(ids.indexOf("phoneCallVoiceInput")).toBeLessThan(ids.indexOf("chatHistory"));
  });

  it("沒用語音時不注入", () => {
    expect(orderIds({})).not.toContain("phoneCallVoiceInput");
    expect(orderIds({ voiceInputUsed: false })).not.toContain("phoneCallVoiceInput");
  });
});
