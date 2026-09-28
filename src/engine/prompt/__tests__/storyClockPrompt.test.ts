import { describe, expect, it } from "vitest";
import { PromptBuilder } from "@/engine/prompt/PromptBuilder";
import { FACE_TO_FACE_PROMPT_ORDER } from "@/data/faceToFacePrompts";

function build(extra: Record<string, unknown>) {
  return new PromptBuilder({
    character: { data: { name: "角色", description: "" } },
    messages: [],
    userName: "用戶",
    enableRealTimeAwareness: true,
    fakeTimeMode: "story",
    fakeTimeOverride: new Date(2026, 7, 19, 21, 30),
    ...extra,
  } as any) as any;
}

describe("劇情時鐘提示詞模組", () => {
  it("面對面提示詞順序中緊接在 MiniMax TTS 之後", () => {
    const ids = FACE_TO_FACE_PROMPT_ORDER.map((e) => e.identifier);
    expect(ids.indexOf("f2fStoryClock")).toBe(ids.indexOf("minimaxTTS") + 1);
  });

  it("暫停中才輸出，並帶上目前劇情時間", () => {
    const text: string = build({ storyClockPaused: true }).buildStoryClockPrompt();
    expect(text).toContain("目前劇情時間：2026/08/19（三）21:30");
    expect(text).toContain("<time-advance");
    expect(text).not.toContain("剛從線上進入面對面");

    expect(build({ storyClockPaused: false }).buildStoryClockPrompt()).toBeNull();
    expect(
      build({ storyClockPaused: true, enableRealTimeAwareness: false }).buildStoryClockPrompt(),
    ).toBeNull();
  });

  it("面對面開場時加上依前文決定見面時間的說明", () => {
    const text: string = build({
      storyClockPaused: true,
      storyClockOpening: true,
    }).buildStoryClockPrompt();
    expect(text).toContain("剛從線上進入面對面");
    expect(text).toContain("前一則訊息的時間是 2026/08/19（三）21:30");
  });
});
