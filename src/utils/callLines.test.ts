import { afterEach, describe, expect, it } from "vitest";
import { __setConverterLoaderForTest } from "./toTraditional";
import {
  formatCallLineForRecord,
  getCallLineDisplay,
  normalizeCallLanguage,
  normalizeCallLine,
  parsePhoneCallOutput,
  toCallSpeechText,
  toTraditionalCallLines,
} from "./callLines";

afterEach(() => __setConverterLoaderForTest(null));

describe("parsePhoneCallOutput（原本行為）", () => {
  it("讀 JSON 陣列、語氣與掛斷", () => {
    const out = parsePhoneCallOutput(
      '```json\n[{"text":"喂？","tone":"接起"},{"action":"hangup","reason":"再見","text":"拜拜"}]\n```',
    );
    expect(out.messages).toEqual([{ text: "喂？", tone: "接起" }, { text: "拜拜", tone: undefined }]);
    expect(out.hangup).toEqual({ reason: "再見" });
  });

  it("補上 prefill 少掉的 [，略過 think 區塊", () => {
    expect(parsePhoneCallOutput('<think>x</think>{"text":"嗨"}]').messages).toEqual([
      { text: "嗨", tone: undefined },
    ]);
  });

  it("非 JSON 時回退到 voice 與純文字", () => {
    expect(parsePhoneCallOutput("<voice>你好</voice>").messages).toEqual([{ text: "你好" }]);
    expect(parsePhoneCallOutput("就這樣").messages).toEqual([{ text: "就這樣" }]);
    expect(parsePhoneCallOutput("").messages).toEqual([{ text: "..." }]);
  });

  it("非雙語模式忽略 zh 與 lang", () => {
    const out = parsePhoneCallOutput('[{"text":"もしもし<br>（喂）","zh":"喂","lang":"Japanese"}]');
    expect(out.messages).toEqual([{ text: "もしもし<br>（喂）", tone: undefined }]);
    expect(out.messages[0]).not.toHaveProperty("translation");
  });
});

describe("雙語正規化", () => {
  it("讀 zh 與 lang", () => {
    expect(
      normalizeCallLine({ text: "もしもし？", zh: "喂？", lang: "japanese", tone: "溫柔" }, true),
    ).toEqual({ text: "もしもし？", tone: "溫柔", translation: "喂？", lang: "Japanese" });
  });

  it("中文句不留字幕", () => {
    expect(normalizeCallLine({ text: "嗯，我在聽。", zh: "嗯，我在聽。", lang: "Chinese" }, true)).toEqual({
      text: "嗯，我在聽。",
      tone: undefined,
      lang: "Chinese",
    });
    expect(normalizeCallLine({ text: "好喔", zh: "好喔" }, true)).toEqual({ text: "好喔", tone: undefined });
  });

  it("text 空、只有 zh 時當成中文句", () => {
    expect(normalizeCallLine({ text: "", zh: "喂？", lang: "Japanese" }, true)).toEqual({
      text: "喂？",
      tone: undefined,
    });
  });

  it("text 夾帶翻譯時拆開，沒給 zh 就補上", () => {
    expect(normalizeCallLine({ text: "もしもし<br>（喂）", lang: "Japanese" }, true)).toEqual({
      text: "もしもし",
      tone: undefined,
      translation: "喂",
      lang: "Japanese",
    });
    expect(normalizeCallLine({ text: "大丈夫だよ（沒事）", zh: "沒事的" }, true)).toEqual({
      text: "大丈夫だよ",
      tone: undefined,
      translation: "沒事的",
    });
  });

  it("字幕清掉語音標記與 HTML；空句回傳 null", () => {
    expect(normalizeCallLine({ text: "Hi", zh: "嗨(laughs)<br>你好" }, true)?.translation).toBe("嗨\n你好");
    expect(normalizeCallLine({ text: "  " }, true)).toBeNull();
    expect(normalizeCallLine({}, false)).toBeNull();
  });

  it("認不得的 lang 不留", () => {
    expect(normalizeCallLanguage("Klingon")).toBeUndefined();
    expect(normalizeCallLanguage("auto")).toBeUndefined();
    expect(normalizeCallLanguage("chinese,yue")).toBe("Chinese,Yue");
  });

  it("parsePhoneCallOutput 雙語模式套用正規化", () => {
    const out = parsePhoneCallOutput('[{"text":"Hey","zh":"嘿","lang":"English"},{"action":"hangup"}]', {
      bilingual: true,
    });
    expect(out.messages).toEqual([{ text: "Hey", tone: undefined, translation: "嘿", lang: "English" }]);
    expect(out.hangup).toEqual({ reason: undefined });
  });
});

describe("文字轉換", () => {
  it("顯示：有字幕時中文在上、原文在下", () => {
    expect(getCallLineDisplay({ content: "もう(laughs)<br>ばか", translation: "真是的" })).toEqual({
      main: "真是的",
      sub: "もう\nばか",
    });
    expect(getCallLineDisplay({ content: "喂？<br>在嗎(laughs)" })).toEqual({ main: "喂？\n在嗎" });
  });

  it("送 TTS：拿掉 HTML 與 emotion，保留語氣標籤與停頓", () => {
    expect(toCallSpeechText("真的嗎(laughs)？<#0.5#>太好了<br>[emotion=happy]")).toBe(
      "真的嗎(laughs)？<#0.5#>太好了",
    );
  });

  it("寫回聊天的文字版紀錄", () => {
    expect(formatCallLineForRecord({ content: "もしもし(laughs)", translation: "喂" })).toBe("もしもし（喂）");
    expect(formatCallLineForRecord({ content: "喂<br>你好" })).toBe("喂<br>你好");
  });

  it("字幕轉繁體，沒字幕的句子不動", async () => {
    __setConverterLoaderForTest(async () => (t: string) => t.replace("没关系", "沒關係"));
    expect(await toTraditionalCallLines([{ text: "大丈夫", translation: "没关系" }, { text: "好" }])).toEqual([
      { text: "大丈夫", translation: "沒關係" },
      { text: "好" },
    ]);
  });
});
