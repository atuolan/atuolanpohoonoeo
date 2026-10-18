import { describe, expect, it } from "vitest";
import {
  needsParsing,
  parseAIResponse,
  parseStickyNoteTag,
  STICKY_NOTE_MAX_LENGTH,
} from "./ResponseParser";

describe("parseStickyNoteTag", () => {
  it("解析 text 屬性", () => {
    expect(parseStickyNoteTag('<sticky-note text="記得帶傘"/>')).toEqual({ text: "記得帶傘" });
    expect(parseStickyNoteTag("<sticky-note text='考試加油'></sticky-note>")).toEqual({
      text: "考試加油",
    });
  });

  it("包起來的文字也認得", () => {
    expect(parseStickyNoteTag("<sticky-note>變天了，加件外套</sticky-note>")).toEqual({
      text: "變天了，加件外套",
    });
  });

  it("屬性值裡有 > 或另一種引號也不會斷掉", () => {
    expect(parseStickyNoteTag('<sticky-note text="心情 > 天氣，別想太多"/>')).toEqual({
      text: "心情 > 天氣，別想太多",
    });
    expect(parseStickyNoteTag(`<sticky-note text="Don't forget 傘"/>`)).toEqual({
      text: "Don't forget 傘",
    });
  });

  it("有多張時取最後一張，空的略過", () => {
    expect(
      parseStickyNoteTag('<sticky-note text="第一張"/>\n<sticky-note text="第二張"/><sticky-note text=" "/>'),
    ).toEqual({ text: "第二張" });
  });

  it("沒有標籤或內容是空的回傳 null", () => {
    expect(parseStickyNoteTag("沒有標籤")).toBeNull();
    expect(parseStickyNoteTag('<sticky-note text=""/>')).toBeNull();
    expect(parseStickyNoteTag("<sticky-note/>")).toBeNull();
  });

  it("空白收成一格，太長截掉", () => {
    expect(parseStickyNoteTag('<sticky-note text="  記得\n  帶傘 "/>')).toEqual({ text: "記得 帶傘" });
    const long = "很".repeat(STICKY_NOTE_MAX_LENGTH + 5);
    expect(parseStickyNoteTag(`<sticky-note text="${long}"/>`)?.text).toHaveLength(
      STICKY_NOTE_MAX_LENGTH,
    );
  });
});

describe("parseAIResponse 的便利貼", () => {
  it("放在 </content> 之後會被解析，不會變成訊息", () => {
    const parsed = parseAIResponse(
      '<content><msg>下午要下雨</msg></content>\n<sticky-note text="記得帶傘"/>',
    );
    expect(parsed.hasStickyNote).toBe(true);
    expect(parsed.stickyNoteData).toEqual({ text: "記得帶傘" });
    const text = parsed.messages.map((m) => m.content).join("");
    expect(text).toContain("下午要下雨");
    expect(text).not.toContain("sticky-note");
  });

  it("寫在 content 裡的標籤會從氣泡移除", () => {
    const parsed = parseAIResponse(
      '<content><msg>貼好了<sticky-note text="考試加油"/></msg></content>',
    );
    expect(parsed.stickyNoteData).toEqual({ text: "考試加油" });
    const text = parsed.messages.map((m) => m.content).join("");
    expect(text).toContain("貼好了");
    expect(text).not.toContain("sticky-note");
  });

  it("只有便利貼標籤的回覆也會進入解析", () => {
    expect(needsParsing('好啦<sticky-note text="早點回家"/>')).toBe(true);
  });

  it("沒有標籤時不標記", () => {
    const parsed = parseAIResponse("<content><msg>嗨</msg></content>");
    expect(parsed.hasStickyNote).toBeUndefined();
  });
});
