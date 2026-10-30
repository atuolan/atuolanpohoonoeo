import { describe, expect, it } from "vitest";
import {
  needsParsing,
  parseAIResponse,
  parseCharAwayTag,
  parseCharBusyTag,
  parseCharSleepTag,
  parseCharWakeTag,
} from "./ResponseParser";
import {
  CHAR_AWAY_BACK_MAX,
  CHAR_AWAY_MAX_MINUTES,
  CHAR_AWAY_MIN_MINUTES,
  CHAR_AWAY_REASON_MAX,
  CHAR_BUSY_BACK_DEFAULT,
  CHAR_SLEEP_BACK_DEFAULT,
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

describe("parseCharSleepTag", () => {
  it("解析正常值", () => {
    expect(
      parseCharSleepTag('<char-sleep wake="07:30" back="早安…"/>'),
    ).toEqual({ wake: "07:30", backText: "早安…" });
  });

  it("沒有 wake 就略過那個標籤", () => {
    expect(parseCharSleepTag('<char-sleep back="早安"/>')).toBeNull();
    expect(parseCharSleepTag("<char-sleep/>")).toBeNull();
  });

  it("back 空白收成一格、太長截掉、空的用預設", () => {
    const parsed = parseCharSleepTag('<char-sleep wake="07:30" back="  早安  好睏 "/>');
    expect(parsed?.backText).toBe("早安 好睏");

    const long = "字".repeat(CHAR_AWAY_BACK_MAX + 5);
    expect(
      parseCharSleepTag(`<char-sleep wake="07:30" back="${long}"/>`)?.backText,
    ).toHaveLength(CHAR_AWAY_BACK_MAX);
    expect(parseCharSleepTag('<char-sleep wake="07:30" back=""/>')?.backText).toBe(
      CHAR_SLEEP_BACK_DEFAULT,
    );
  });

  it("有多個時取最後一個", () => {
    expect(
      parseCharSleepTag(
        '<char-sleep wake="07:30" back="a"/>\n<char-sleep wake="08:00" back="b"/>',
      ),
    ).toEqual({ wake: "08:00", backText: "b" });
  });
});

describe("parseCharBusyTag", () => {
  it("check 夾在 10～120，不是數字就當沒填", () => {
    const parse = (check: string) =>
      parseCharBusyTag(`<char-busy minutes="60" check="${check}" reason="開會"/>`)?.check;
    expect(parse("40")).toBe(40);
    expect(parse("3")).toBe(10);
    expect(parse("500")).toBe(120);
    expect(parse("abc")).toBeUndefined();
  });

  it("auto 整理空白並截到 30 字", () => {
    const long = "晚".repeat(40);
    const parsed = parseCharBusyTag(`<char-busy minutes="60" auto="  開會中  晚點回 " reason="開會"/>`);
    expect(parsed?.auto).toBe("開會中 晚點回");
    expect(
      parseCharBusyTag(`<char-busy minutes="60" auto="${long}" reason="開會"/>`)?.auto,
    ).toHaveLength(30);
    expect(parseCharBusyTag('<char-busy minutes="60" reason="開會"/>')?.auto).toBeUndefined();
  });

  it("只寫 minutes 也算", () => {
    const parsed = parseCharBusyTag('<char-busy minutes="90" reason="補筆錄" back="好了"/>');
    expect(parsed?.minutes).toBe(90);
    expect(parsed?.end).toBeUndefined();
  });

  it("解析正常值", () => {
    expect(
      parseCharBusyTag(
        '<char-busy start="14:00" end="18:00" reason="搭飛機" back="我忙完了"/>',
      ),
    ).toEqual({ start: "14:00", end: "18:00", reason: "搭飛機", backText: "我忙完了" });
  });

  it("沒有 start 就是 undefined", () => {
    expect(
      parseCharBusyTag('<char-busy end="18:00" reason="搭飛機" back="好了"/>')?.start,
    ).toBeUndefined();
  });

  it("沒有 end 就略過那個標籤", () => {
    expect(parseCharBusyTag('<char-busy start="14:00" reason="搭飛機"/>')).toBeNull();
    expect(parseCharBusyTag("<char-busy/>")).toBeNull();
    expect(parseCharBusyTag('<char-busy minutes="abc" reason="搭飛機"/>')).toBeNull();
    expect(parseCharBusyTag('<char-busy minutes="0" reason="搭飛機"/>')).toBeNull();
  });

  it("reason / back 截斷、空的用預設", () => {
    const longReason = "很".repeat(CHAR_AWAY_REASON_MAX + 5);
    const longBack = "字".repeat(CHAR_AWAY_BACK_MAX + 5);
    const parsed = parseCharBusyTag(
      `<char-busy end="18:00" reason="${longReason}" back="${longBack}"/>`,
    );
    expect(parsed?.reason).toHaveLength(CHAR_AWAY_REASON_MAX);
    expect(parsed?.backText).toHaveLength(CHAR_AWAY_BACK_MAX);

    const empty = parseCharBusyTag('<char-busy end="18:00" reason="" back=""/>');
    expect(empty?.reason).toBe("有事");
    expect(empty?.backText).toBe(CHAR_BUSY_BACK_DEFAULT);
  });

  it("有多個時取最後一個", () => {
    expect(
      parseCharBusyTag(
        '<char-busy end="18:00" reason="搭飛機" back="a"/>\n<char-busy end="20:00" reason="考試" back="b"/>',
      ),
    ).toEqual({ start: undefined, end: "20:00", reason: "考試", backText: "b" });
  });
});

describe("parseCharWakeTag", () => {
  it("自閉合與成對都認得", () => {
    expect(parseCharWakeTag("<char-wake/>")).toBe(true);
    expect(parseCharWakeTag("<char-wake></char-wake>")).toBe(true);
    expect(parseCharWakeTag("起床了<char-wake/>然後<char-wake/>")).toBe(true);
  });

  it("沒有標籤就是 false", () => {
    expect(parseCharWakeTag("<content>起床了</content>")).toBe(false);
  });
});

describe("parseAIResponse 的睡覺／忙碌", () => {
  it("sleep 放在 </content> 之後會被解析，不會變成訊息", () => {
    const parsed = parseAIResponse(
      '<content><msg>晚安</msg></content>\n<char-sleep wake="07:30" back="早安…"/>',
    );
    expect(parsed.hasCharSleep).toBe(true);
    expect(parsed.charSleepData).toEqual({ wake: "07:30", backText: "早安…" });
    const text = parsed.messages.map((m) => m.content).join("");
    expect(text).toContain("晚安");
    expect(text).not.toContain("char-sleep");
  });

  it("寫在 content 裡的 sleep／busy 會從氣泡移除", () => {
    const parsed = parseAIResponse(
      '<content><msg>我去忙了<char-busy end="18:00" reason="搭飛機" back="好了"/><char-sleep wake="07:30" back="早安"/></msg></content>',
    );
    expect(parsed.hasCharBusy).toBe(true);
    expect(parsed.hasCharSleep).toBe(true);
    const text = parsed.messages.map((m) => m.content).join("");
    expect(text).not.toContain("char-busy");
    expect(text).not.toContain("char-sleep");
    expect(text).not.toContain("end=");
  });

  it("char-wake 會解析並從訊息移除", () => {
    const parsed = parseAIResponse("<content><msg>我起來了<char-wake/></msg></content>");
    expect(parsed.hasCharWake).toBe(true);
    const text = parsed.messages.map((m) => m.content).join("");
    expect(text).not.toContain("char-wake");
  });

  it("needsParsing 認得三個新標籤", () => {
    expect(needsParsing('<char-sleep wake="07:30"/>')).toBe(true);
    expect(needsParsing('<char-busy end="18:00"/>')).toBe(true);
    expect(needsParsing("<char-wake/>")).toBe(true);
  });
});
