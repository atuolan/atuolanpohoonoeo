import { describe, expect, it } from "vitest";
import { PromptBuilder } from "@/engine/prompt/PromptBuilder";
import { createDefaultPromptManagerConfig } from "@/types/promptManager";

async function buildTexts(extra: Record<string, unknown>): Promise<string[]> {
  const result = await new PromptBuilder({
    character: { id: "char-1", data: { name: "角色", description: "" } },
    lorebooks: [],
    messages: [],
    settings: { maxContextLength: 100000, maxResponseLength: 1000 },
    userName: "用戶",
    promptManagerConfig: createDefaultPromptManagerConfig(),
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

describe("線上模式功能的便利貼", () => {
  it("帶入上一張便利貼", async () => {
    const text = await onlineFeatures({ charStickyNote: "今天 14:20：記得帶傘" });
    expect(text).toContain('<sticky-note text="內容"/>');
    expect(text).toContain("你上一張寫的：今天 14:20：記得帶傘");
    expect(text).not.toContain("{{charStickyNote}}");
  });

  it("沒寫過時說還沒寫過", async () => {
    expect(await onlineFeatures({})).toContain("你上一張寫的：還沒寫過");
  });
});

describe("心情便籤條目", () => {
  const mood = "心情：難過\n今天 02:29 寫的：好累";

  it("有心情便籤時輸出", async () => {
    const block = (await buildTexts({ userMoodNote: mood })).find((c) => c.includes("<mood_note>"));
    expect(block).toContain(mood);
    expect(block).not.toContain("{{userMoodNote}}");
    expect(block).toContain("<sticky-note>");
  });

  it("沒有時整個條目不輸出", async () => {
    expect((await buildTexts({})).some((c) => c.includes("<mood_note>"))).toBe(false);
  });

  it("面對面模式不輸出（沒有面對面專屬順序、改用線上順序對應時也一樣）", async () => {
    const texts = await buildTexts({
      userMoodNote: mood,
      faceToFaceMode: true,
      promptManagerConfig: { ...createDefaultPromptManagerConfig(), faceToFacePromptOrder: undefined },
    });
    expect(texts.some((c) => c.includes("<mood_note>"))).toBe(false);
  });
});
