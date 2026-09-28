import { describe, expect, it } from "vitest";
import { needsParsing, parseAIResponse } from "./ResponseParser";

describe("噗浪發文標籤", () => {
  it("帶屬性的 <plurk> 會被偵測，且不出現在聊天氣泡中", () => {
    const raw =
      '<content><msg>我到家了</msg><plurk qualifier="覺得" reactions="❤️3">今天好累<image>沙發</image></plurk></content>';
    const parsed = parseAIResponse(raw);
    expect(parsed.hasPlurkPost).toBe(true);
    expect(parsed.plurkContent).toBe(
      '<plurk qualifier="覺得" reactions="❤️3">今天好累<image>沙發</image></plurk>',
    );
    const text = parsed.messages.map((m) => m.content).join("");
    expect(text).toContain("我到家了");
    expect(text).not.toContain("plurk");
    expect(text).not.toContain("今天好累");
  });

  it("舊格式仍然可以偵測", () => {
    const parsed = parseAIResponse(
      "<content>好<plurk><post>哈囉</post><reactions>👍:1</reactions></plurk></content>",
    );
    expect(parsed.hasPlurkPost).toBe(true);
    expect(parsed.plurkContent).toContain("<post>哈囉</post>");
  });

  it("只有噗文、沒有其他標籤的回覆也需要解析", () => {
    expect(needsParsing("<plurk>只發噗</plurk>")).toBe(true);
    expect(needsParsing('<plurk qualifier="想">只發噗</plurk>')).toBe(true);
    expect(needsParsing("普通訊息 plurk")).toBe(false);
  });
});
