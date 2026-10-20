import { describe, expect, it } from "vitest";
import {
  convertTTSContentToSimplified,
  prepareTTSContent,
  splitEmbeddedTranslation,
} from "./ttsTextSelector";

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

  describe("原文＋翻譯分行時，被拿掉那行的情緒標記交給同一組的另一行", () => {
    const tagOnChinese = "How are you?<br>你最近好嗎？[emotion=happy]";
    const tagOnForeign = "How are you?[emotion=happy]<br>你最近好嗎？";
    const interleaved =
      "Hi there.[emotion=calm]<br>你好。<br>I missed you.[emotion=sad]<br>我想你了。";

    it.each([
      [tagOnChinese, "auto", "How are you?[emotion=happy]"],
      [tagOnChinese, "foreign", "How are you?[emotion=happy]"],
      [tagOnForeign, "chinese", "你最近好嗎？[emotion=happy]"],
      [interleaved, "chinese", "你好。[emotion=calm]\n我想你了。[emotion=sad]"],
      [interleaved, "foreign", "Hi there.[emotion=calm]\nI missed you.[emotion=sad]"],
    ] as const)("%s（%s）", (text, mode, expected) => {
      expect(prepareTTSContent(text, mode)).toBe(expected);
    });

    it("翻譯在前、原文在後也對得上", () => {
      expect(prepareTTSContent("你好。[emotion=calm]<br>Hi there.<br>我想你了。[emotion=sad]<br>I missed you.", "foreign"))
        .toBe("Hi there.[emotion=calm]\nI missed you.[emotion=sad]");
    });

    it("留下的那行自己有標記時不覆蓋", () => {
      expect(prepareTTSContent("How are you?[emotion=calm]<br>你最近好嗎？[emotion=happy]", "foreign"))
        .toBe("How are you?[emotion=calm]");
    });

    it("全部朗讀時沒標記的翻譯跟著原文的情緒，每行各自一段", () => {
      expect(prepareTTSContent(interleaved, "all")).toBe(
        "Hi there.[emotion=calm]\n你好。[emotion=calm]\nI missed you.[emotion=sad]\n我想你了。[emotion=sad]",
      );
    });
  });
});

describe("splitEmbeddedTranslation", () => {
  it.each([
    ["もしもし、はるちゃん？<br>（喂，春酱？）", "もしもし、はるちゃん？", "喂，春酱？"],
    ["Hey, you up?<br>嘿，你醒著嗎？", "Hey, you up?", "嘿，你醒著嗎？"],
    ["もう(laughs)、ばかね<#0.5#><br>（真是的，笨蛋）", "もう(laughs)、ばかね<#0.5#>", "真是的，笨蛋"],
    ["大丈夫だよ（沒關係喔）", "大丈夫だよ", "沒關係喔"],
    ["Hello (你好)", "Hello", "你好"],
  ])("splits %s", (text, original, translation) => {
    expect(splitEmbeddedTranslation(text)).toEqual({ original, translation });
  });

  it.each([
    "大丈夫。<br>（沒事的。）",
    "大丈夫（沒關係）",
    "我在路上（其實還沒出門）",
    "時間（じかん）ですよ(laughs)",
    "もしもし？",
    "……<br>（嗯）",
  ])("leaves %s alone", (text) => {
    expect(splitEmbeddedTranslation(text)).toBeNull();
  });
});
