import { describe, expect, it } from "vitest";
import { buildRecapPrompt, parseRecapLines, recapSourceText } from "@/services/BookAIService";
import type { BookChapter } from "@/types/book";

const ch = (title: string, content: string): BookChapter => ({ id: title, title, content, order: 0 });

describe("三句接上", () => {
  it("只取讀到的位置之前，不含後面", () => {
    const chapters = [ch("一", "前情".repeat(10)), ch("二", "甲乙丙丁戊己庚辛")];
    const text = recapSourceText(chapters, 1, 4, 100);
    expect(text).toContain("甲乙丙丁");
    expect(text).not.toContain("戊");
    // 本章讀得少，往前補上一章結尾
    expect(text.indexOf("【一】")).toBeLessThan(text.indexOf("【二】"));
  });

  it("本章已經夠長就不補前一章", () => {
    const chapters = [ch("一", "前情"), ch("二", "字".repeat(5000))];
    const text = recapSourceText(chapters, 1, 5000, 1000);
    expect(text).not.toContain("【一】");
    expect(text).toContain("……");
  });

  it("提示詞要求不劇透", () => {
    const [system, user] = buildRecapPrompt("莊子", "【一】\n北冥有魚");
    expect(system.content).toContain("不可以透露");
    expect(user.content).toContain("《莊子》");
  });

  it("整理模型輸出", () => {
    expect(parseRecapLines("<think>想想</think>\n1. 大鵬飛往南冥。\n\n2、你停在蜩與學鳩。\n- 留意小大之別。\n多的一行")).toEqual([
      "大鵬飛往南冥。",
      "你停在蜩與學鳩。",
      "留意小大之別。",
    ]);
  });
});
