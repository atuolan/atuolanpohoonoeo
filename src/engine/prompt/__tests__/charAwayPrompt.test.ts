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

async function timeInfo(extra: Record<string, unknown>): Promise<string> {
  const text = (await buildTexts(extra)).find((c) => c.includes("<time_info>"));
  expect(text).toBeTruthy();
  return text!;
}

describe("{{charAwayGuide}} 展開角色暫時離開的標籤說明", () => {
  it("傳了說明就展開在線上模式功能裡", async () => {
    const text = await onlineFeatures({
      charAwayGuide: '- 暫時離開：<char-away reason="忙一下"/>',
    });
    expect(text).toContain('- 暫時離開：<char-away reason="忙一下"/>');
    expect(text).not.toContain("{{charAwayGuide}}");
  });

  it("沒傳時不殘留宏", async () => {
    expect(await onlineFeatures({})).not.toContain("{{charAwayGuide}}");
  });

  it("傳了睡覺和忙碌的說明就各自展開", async () => {
    const text = await onlineFeatures({
      charSleepGuide: '- 睡覺：<char-sleep reason="睡著了"/>',
      charBusyGuide: '- 忙碌：<char-busy reason="上班中"/>',
    });
    expect(text).toContain('- 睡覺：<char-sleep reason="睡著了"/>');
    expect(text).toContain('- 忙碌：<char-busy reason="上班中"/>');
    expect(text).not.toContain("{{charSleepGuide}}");
    expect(text).not.toContain("{{charBusyGuide}}");
  });

  it("睡覺和忙碌的說明沒傳時不殘留宏", async () => {
    const text = await onlineFeatures({});
    expect(text).not.toContain("{{charSleepGuide}}");
    expect(text).not.toContain("{{charBusyGuide}}");
  });
});

describe("回來的說明附在時間資訊後面", () => {
  it("傳了就出現在 timeInfo 內容裡", async () => {
    const text = await timeInfo({ charAwayReturnNote: "[剛忙完回來]\n測試" });
    expect(text).toContain("[剛忙完回來]\n測試");
  });

  it("沒傳時不會出現", async () => {
    expect(await timeInfo({})).not.toContain("[剛忙完回來]");
  });
});
