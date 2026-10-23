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
    expect(text).toContain("<!--t:2026-08-19 21:35-->");
    expect(text).not.toContain("<time-advance");
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

describe("劇情時鐘：開場的線上時鐘", () => {
  it("線上時鐘跟前一則訊息差 10 分鐘以上才寫出來", () => {
    const text: string = build({
      storyClockPaused: true,
      storyClockOpening: true,
      storyClockOnlineNow: new Date(2026, 7, 20, 2, 30),
    }).buildStoryClockPrompt();
    expect(text).toContain("線上時鐘現在 2026/08/20（四）02:30，已經過了 5 小時");
    expect(text).toContain("隔了很久才見面");

    const near: string = build({
      storyClockPaused: true,
      storyClockOpening: true,
      storyClockOnlineNow: new Date(2026, 7, 19, 21, 35),
    }).buildStoryClockPrompt();
    expect(near).not.toContain("線上時鐘");
    expect(near).not.toContain("隔了很久才見面");
  });
});

describe("面對面歷史訊息的時間戳記格式", () => {
  it("用 YYYY-MM-DD HH:mm", () => {
    const b = build({});
    const at = new Date(2026, 7, 19, 9, 5).getTime();
    expect(b.formatStoryStampValue({ createdAt: at, storyTime: at })).toBe("2026-08-19 09:05");
  });
});

describe("日期時間巨集跟著聊天時間", () => {
  it("開啟感知現實時間時 {{time}} 用 fakeTimeOverride", async () => {
    const b = build({});
    expect(await b.macroEngine.substitute("{{time}}")).toBe("21:30");
  });
});

describe("劇情時鐘：頭尾各一個時間戳記", () => {
  it("說明開頭寫開始時間、結尾寫結束時間", () => {
    const text: string = build({ storyClockPaused: true }).buildStoryClockPrompt();
    expect(text).toContain("第一行寫這段劇情開始的時間");
    expect(text).toContain("最後一行寫這段劇情結束的時間");
    expect(text).toContain("<!--t:21:50-->");
  });

  it("歷史訊息：每輪最後一則 AI 訊息補上那一輪的結束時間", () => {
    const end = new Date(2026, 7, 19, 22, 10).getTime();
    const start = new Date(2026, 7, 19, 21, 30).getTime();
    const user = { is_user: true, createdAt: start, storyTime: start };
    const a1 = { is_user: false, createdAt: start, storyTime: start, storyClockAfter: { offset: 0, pausedAt: end } };
    const a2 = { is_user: false, createdAt: start, storyTime: start, storyClockAfter: { offset: 0, pausedAt: end } };
    const ends: Map<unknown, number> = (PromptBuilder as any).collectTurnEndTimes([user, a1, a2]);
    expect(ends.has(a1)).toBe(false);
    expect(ends.get(a2)).toBe(end);
    expect(ends.has(user)).toBe(false);
  });
});
