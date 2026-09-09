import { describe, expect, it } from "vitest";
import { convertTTSContentToSimplified, prepareTTSContent } from "./ttsTextSelector";

describe("convertTTSContentToSimplified", () => {
  it.each([
    ["時間、大丈夫ですか？", "", "時間、大丈夫ですか？"],
    ["時間はﾀﾞｲｼﾞｮｳﾌﾞ？", "auto", "時間はﾀﾞｲｼﾞｮｳﾌﾞ？"],
    ["時間", "Japanese", "時間"],
    ["時間方便嗎？(laughs)<#0.5#>", "auto", "时间方便吗？(laughs)<#0.5#>"],
    ["Hello", "English", "Hello"],
    ["", "auto", ""],
  ])("normalizes %s without corrupting Japanese", (text, language, expected) => {
    expect(convertTTSContentToSimplified(text, language)).toBe(expected);
  });
});

describe("prepareTTSContent", () => {
  it("keeps Japanese kanji in foreign mode", () => {
    expect(prepareTTSContent("お邪魔します。時間、大丈夫ですか？", "foreign"))
      .toBe("お邪魔します。時間、大丈夫ですか？");
  });

  it.each(["（打擾了，時間方便嗎？）", "(打擾了，時間方便嗎？)", "【打擾了】", "[打擾了]"])(
    "removes a bracketed Chinese translation %s without deleting Japanese kanji",
    (translation) => {
      expect(prepareTTSContent(`お邪魔します。時間、大丈夫ですか？${translation}`, "foreign"))
        .toBe("お邪魔します。時間、大丈夫ですか？");
    },
  );

  it.each(["auto", "foreign", "chinese"] as const)(
    "selects Japanese and Chinese paired lines in %s mode despite TTS markers",
    (mode) => {
      const japanese = "お邪魔します。時間、大丈夫ですか？[emotion=happy]";
      const chinese = "打擾了，時間方便嗎？(laughs)[emotion=happy]";
      expect(prepareTTSContent(`${japanese}<br>${chinese}`, mode))
        .toBe(mode === "chinese" ? chinese : japanese);
    },
  );

  it("keeps Japanese parentheses and TTS markers in foreign mode", () => {
    const text = "時間（じかん）ですよ(laughs)<#0.5#>[emotion=happy]";
    expect(prepareTTSContent(text, "foreign")).toBe(text);
  });

  it("does not treat half-width katakana as Chinese", () => {
    expect(prepareTTSContent("時間はﾀﾞｲｼﾞｮｳﾌﾞ？（時間方便嗎？）", "foreign"))
      .toBe("時間はﾀﾞｲｼﾞｮｳﾌﾞ？");
  });

  it("keeps all languages in all mode", () => {
    const text = "お邪魔します。（打擾了）\n時間方便嗎？";
    expect(prepareTTSContent(text, "all")).toBe(text);
  });

  it("still removes Chinese from inline English in foreign mode", () => {
    expect(prepareTTSContent("Hello 你好", "foreign")).toBe("Hello");
  });

  it("removes HTML tags without sending tag names to TTS", () => {
    expect(prepareTTSContent("Hello<br>world", "all")).toBe("Hello\nworld");
  });

  it("auto-selects the foreign-language line when paired with Chinese", () => {
    expect(prepareTTSContent("How are you?<br>你最近好嗎？", "auto")).toBe(
      "How are you?",
    );
  });

  it("supports explicit Chinese selection", () => {
    expect(prepareTTSContent("How are you?<br>你最近好嗎？", "chinese")).toBe(
      "你最近好嗎？",
    );
  });

  it("keeps TTS markers when selecting Chinese from a mixed line", () => {
    expect(
      prepareTTSContent("你好(laughs) Hello [emotion=calm]", "chinese"),
    ).toBe("你好(laughs) [emotion=calm]");
  });
});
