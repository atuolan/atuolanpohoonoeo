import { describe, expect, it } from "vitest";
import { parseAIResponse, parseTimeAdvanceTag } from "./ResponseParser";

describe("parseTimeAdvanceTag", () => {
  it("解析分鐘與小時", () => {
    expect(parseTimeAdvanceTag('<time-advance minutes="20" reason="吃完午餐"/>')).toBe(20);
    expect(parseTimeAdvanceTag('<time-advance hours="2"/>')).toBe(120);
    expect(parseTimeAdvanceTag('<time-advance hours="1" minutes="30"/>')).toBe(90);
  });

  it("無效或沒有標籤時回傳 null", () => {
    expect(parseTimeAdvanceTag("沒有標籤")).toBeNull();
    expect(parseTimeAdvanceTag('<time-advance minutes="0"/>')).toBeNull();
    expect(parseTimeAdvanceTag('<time-advance minutes="abc"/>')).toBeNull();
  });

  it("單次最多推進 7 天", () => {
    expect(parseTimeAdvanceTag('<time-advance hours="9999"/>')).toBe(7 * 24 * 60);
  });
});

describe("時間控制標籤不會出現在氣泡中", () => {
  it("寫在 content 裡的標籤會被移除", () => {
    const parsed = parseAIResponse(
      '<content>我們慢慢吃完了午餐。<time-advance minutes="40"/></content>',
    );
    const text = parsed.messages.map((m) => m.content).join("");
    expect(text).toContain("午餐");
    expect(text).not.toContain("time-advance");
  });
});
