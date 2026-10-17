import { describe, expect, it } from "vitest";
import {
  CHAR_STATUS_MAX_LENGTH,
  needsParsing,
  parseAIResponse,
  parseCharStatusTag,
} from "./ResponseParser";

describe("parseCharStatusTag", () => {
  it("解析 text 屬性", () => {
    expect(parseCharStatusTag('<char-status text="睡覺中"/>')).toEqual({ text: "睡覺中" });
    expect(parseCharStatusTag("<char-status text='上班摸魚'></char-status>")).toEqual({
      text: "上班摸魚",
    });
  });

  it("寫成 status 屬性或包起來的文字也認得", () => {
    expect(parseCharStatusTag('<char-status status="在洗澡"/>')).toEqual({ text: "在洗澡" });
    expect(parseCharStatusTag("<char-status>不想說話</char-status>")).toEqual({ text: "不想說話" });
  });

  it("有多個時取最後一個，空的略過", () => {
    expect(
      parseCharStatusTag('<char-status text="吃飯中"/>\n<char-status text="出門了"/><char-status text=" "/>'),
    ).toEqual({ text: "出門了" });
  });

  it("沒有標籤或內容是空的回傳 null", () => {
    expect(parseCharStatusTag("沒有標籤")).toBeNull();
    expect(parseCharStatusTag('<char-status text=""/>')).toBeNull();
    expect(parseCharStatusTag("<char-status/>")).toBeNull();
  });

  it("空白收成一格，太長截掉", () => {
    expect(parseCharStatusTag('<char-status text="  在  路上 "/>')).toEqual({ text: "在 路上" });
    const long = "很".repeat(CHAR_STATUS_MAX_LENGTH + 5);
    expect(parseCharStatusTag(`<char-status text="${long}"/>`)?.text).toHaveLength(
      CHAR_STATUS_MAX_LENGTH,
    );
  });
});

describe("parseAIResponse 的角色狀態", () => {
  it("放在 </content> 之後會被解析，不會變成訊息", () => {
    const parsed = parseAIResponse(
      '<content><msg>我先去睡了</msg></content>\n<char-status text="睡覺中"/>',
    );
    expect(parsed.hasCharStatus).toBe(true);
    expect(parsed.charStatusData).toEqual({ text: "睡覺中" });
    const text = parsed.messages.map((m) => m.content).join("");
    expect(text).toContain("我先去睡了");
    expect(text).not.toContain("char-status");
  });

  it("寫在 content 裡的標籤會從氣泡移除", () => {
    const parsed = parseAIResponse(
      '<content><msg>洗澡去<char-status text="在洗澡"/></msg></content>',
    );
    expect(parsed.charStatusData).toEqual({ text: "在洗澡" });
    const text = parsed.messages.map((m) => m.content).join("");
    expect(text).toContain("洗澡去");
    expect(text).not.toContain("char-status");
  });

  it("只有狀態標籤的回覆也會進入解析", () => {
    expect(needsParsing('好啦<char-status text="生氣中"/>')).toBe(true);
  });

  it("沒有標籤時不標記", () => {
    const parsed = parseAIResponse("<content><msg>嗨</msg></content>");
    expect(parsed.hasCharStatus).toBeUndefined();
  });
});
