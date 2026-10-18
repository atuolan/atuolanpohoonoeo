import { describe, expect, it } from "vitest";
import {
  needsParsing,
  parseAIResponse,
  parseMoodReplyTag,
  STICKY_NOTE_MAX_LENGTH,
} from "./ResponseParser";

describe("parseMoodReplyTag", () => {
  it("text 屬性與包起來的文字都認得", () => {
    expect(parseMoodReplyTag('<mood-reply text="考試不會跑掉，先睡。"/>')).toEqual({
      text: "考試不會跑掉，先睡。",
    });
    expect(parseMoodReplyTag("<mood-reply>加油！</mood-reply>")).toEqual({ text: "加油！" });
  });

  it("沒有字的標籤代表只在聊天裡回了", () => {
    expect(parseMoodReplyTag("<mood-reply/>")).toEqual({ text: "" });
    expect(parseMoodReplyTag('<mood-reply text=""/>')).toEqual({ text: "" });
    expect(parseMoodReplyTag("<mood-reply></mood-reply>")).toEqual({ text: "" });
  });

  it("沒有標籤回傳 null", () => {
    expect(parseMoodReplyTag("沒有標籤")).toBeNull();
    expect(parseMoodReplyTag('<sticky-note text="帶傘"/>')).toBeNull();
  });

  it("有好幾個時取最後一個有字的", () => {
    expect(parseMoodReplyTag('<mood-reply text="第一張"/><mood-reply text="第二張"/><mood-reply/>')).toEqual({
      text: "第二張",
    });
  });

  it("空白收成一格，太長截掉", () => {
    expect(parseMoodReplyTag('<mood-reply text="  先\n  睡 "/>')).toEqual({ text: "先 睡" });
    const long = "很".repeat(STICKY_NOTE_MAX_LENGTH + 5);
    expect(parseMoodReplyTag(`<mood-reply text="${long}"/>`)?.text).toHaveLength(STICKY_NOTE_MAX_LENGTH);
  });
});

describe("parseAIResponse 的回覆心情", () => {
  it("放在 </content> 之後會被解析，不會變成訊息", () => {
    const parsed = parseAIResponse(
      '<content><msg>早點睡</msg></content>\n<mood-reply text="考試不會跑掉，先睡。"/>',
    );
    expect(parsed.hasMoodReply).toBe(true);
    expect(parsed.moodReplyData).toEqual({ text: "考試不會跑掉，先睡。" });
    const text = parsed.messages.map((m) => m.content).join("");
    expect(text).toContain("早點睡");
    expect(text).not.toContain("mood-reply");
  });

  it("空標籤也會標記，寫在 content 裡的會從氣泡移除", () => {
    const parsed = parseAIResponse("<content><msg>抱抱你<mood-reply/></msg></content>");
    expect(parsed.hasMoodReply).toBe(true);
    expect(parsed.moodReplyData).toEqual({ text: "" });
    expect(parsed.messages.map((m) => m.content).join("")).toBe("抱抱你");
  });

  it("只有回覆心情標籤的回覆也會進入解析", () => {
    expect(needsParsing("好<mood-reply/>")).toBe(true);
  });

  it("沒有標籤時不標記", () => {
    expect(parseAIResponse("<content><msg>嗨</msg></content>").hasMoodReply).toBeUndefined();
  });
});
