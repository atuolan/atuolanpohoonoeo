import { describe, expect, it } from "vitest";
import {
  parseAIResponse,
  parseCharAwayTag,
} from "./ResponseParser";
import {
  CHAR_AWAY_MAX_MINUTES,
  CHAR_AWAY_MIN_MINUTES,
  CHAR_AWAY_REASON_MAX,
} from "./charAway";

describe("parseCharAwayTag", () => {
  it("解析正常值", () => {
    expect(
      parseCharAwayTag(
        '<char-away minutes="30" reason="開會" back="我回來了，抱歉讓你等"/>',
      ),
    ).toEqual({ minutes: 30, reason: "開會", backText: "我回來了，抱歉讓你等" });
  });

  it("minutes 超出範圍被夾住", () => {
    expect(parseCharAwayTag('<char-away minutes="1" reason="洗澡" back="好了"/>')?.minutes).toBe(
      CHAR_AWAY_MIN_MINUTES,
    );
    expect(parseCharAwayTag('<char-away minutes="999" reason="洗澡" back="好了"/>')?.minutes).toBe(
      CHAR_AWAY_MAX_MINUTES,
    );
  });

  it("minutes 不是數字就略過那個標籤", () => {
    expect(parseCharAwayTag('<char-away minutes="abc" reason="開會" back="好了"/>')).toBeNull();
    expect(parseCharAwayTag('<char-away reason="開會" back="好了"/>')).toBeNull();
  });

  it("reason / back 空白收成一格、太長截掉、空的用預設", () => {
    const parsed = parseCharAwayTag('<char-away minutes="10" reason="  在  開會 " back=""/>');
    expect(parsed?.reason).toBe("在 開會");
    expect(parsed?.backText).toBe("我回來了");

    const long = "很".repeat(CHAR_AWAY_REASON_MAX + 5);
    expect(parseCharAwayTag(`<char-away minutes="10" reason="${long}" back="x"/>`)?.reason).toHaveLength(
      CHAR_AWAY_REASON_MAX,
    );
    expect(parseCharAwayTag('<char-away minutes="10" reason="" back=""/>')?.reason).toBe("有事");
  });

  it("有多個時取最後一個", () => {
    expect(
      parseCharAwayTag(
        '<char-away minutes="10" reason="開會" back="a"/>\n<char-away minutes="20" reason="上課" back="b"/>',
      ),
    ).toEqual({ minutes: 20, reason: "上課", backText: "b" });
  });
});

describe("parseAIResponse 的暫時離開", () => {
  it("放在 </content> 之後會被解析，不會變成訊息", () => {
    const parsed = parseAIResponse(
      '<content><msg>我先去開會</msg></content>\n<char-away minutes="30" reason="開會" back="我回來了"/>',
    );
    expect(parsed.hasCharAway).toBe(true);
    expect(parsed.charAwayData).toEqual({
      minutes: 30,
      reason: "開會",
      backText: "我回來了",
    });
    const text = parsed.messages.map((m) => m.content).join("");
    expect(text).toContain("我先去開會");
    expect(text).not.toContain("char-away");
  });

  it("寫在 content 裡的標籤會從氣泡移除", () => {
    const parsed = parseAIResponse(
      '<content><msg>我去洗澡<char-away minutes="20" reason="洗澡" back="洗好了"/></msg></content>',
    );
    expect(parsed.hasCharAway).toBe(true);
    const text = parsed.messages.map((m) => m.content).join("");
    expect(text).not.toContain("char-away");
    expect(text).not.toContain("minutes=");
  });
});
