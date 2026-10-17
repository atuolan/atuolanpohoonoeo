import { describe, expect, it } from "vitest";
import { PromptBuilder } from "@/engine/prompt/PromptBuilder";
import { createDefaultPromptManagerConfig } from "@/types/promptManager";

async function onlineFeatures(extra: Record<string, unknown>): Promise<string> {
  const result = await new PromptBuilder({
    character: { id: "char-1", data: { name: "角色", description: "" } },
    lorebooks: [],
    messages: [],
    settings: { maxContextLength: 100000, maxResponseLength: 1000 },
    userName: "用戶",
    promptManagerConfig: createDefaultPromptManagerConfig(),
    ...extra,
  } as any).build();
  const text = result.messages
    .map((m: { content: unknown }) => (typeof m.content === "string" ? m.content : ""))
    .find((c: string) => c.includes("<online_mode_features>"));
  expect(text).toBeTruthy();
  return text!;
}

describe("線上模式功能帶入目前角色狀態", () => {
  it("有狀態時帶入狀態文字", async () => {
    const text = await onlineFeatures({ charStatus: "睡覺中" });
    expect(text).toContain('<char-status text="狀態文字"/>');
    expect(text).toContain("目前是：睡覺中");
    expect(text).not.toContain("{{charStatus}}");
  });

  it("沒有狀態時說還沒設定", async () => {
    expect(await onlineFeatures({})).toContain("目前是：還沒設定");
  });
});
