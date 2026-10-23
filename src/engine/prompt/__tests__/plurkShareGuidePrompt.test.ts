import { describe, expect, it } from "vitest";
import { PromptBuilder } from "@/engine/prompt/PromptBuilder";
import { createDefaultPromptManagerConfig } from "@/types/promptManager";

const NOW = new Date(2026, 9, 18, 23, 40);

async function buildTexts(extra: Record<string, unknown>): Promise<string[]> {
  const result = await new PromptBuilder({
    character: { id: "char-1", data: { name: "角色", description: "" } },
    lorebooks: [],
    messages: [],
    settings: { maxContextLength: 100000, maxResponseLength: 1000 },
    userName: "用戶",
    promptManagerConfig: createDefaultPromptManagerConfig(),
    enableRealTimeAwareness: true,
    fakeTimeMode: "offset",
    fakeTimeOverride: NOW,
    ...extra,
  } as any).build();
  return result.messages.map((m: { content: unknown }) =>
    typeof m.content === "string" ? m.content : "",
  );
}

async function onlineFeatures(extra: Record<string, unknown>): Promise<string> {
  const text = (await buildTexts(extra)).find((c) => c.includes("<online_mode_features>"));
  expect(text).toBeTruthy();
  return text!;
}

describe("{{plurkShareGuide}} 展開噗文分享的說明", () => {
  it("傳了說明就展開在線上模式功能裡", async () => {
    const text = await onlineFeatures({ plurkShareGuide: "- 噗浪留言：TEST" });
    expect(text).toContain("- 噗浪留言：TEST");
    expect(text).not.toContain("{{plurkShareGuide}}");
  });

  it("沒傳時不殘留宏", async () => {
    expect(await onlineFeatures({})).not.toContain("{{plurkShareGuide}}");
  });
});
