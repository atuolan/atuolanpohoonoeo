import { describe, expect, it } from "vitest";
import { createDefaultNovelAIImageSettings, type NovelAIImageSettings } from "@/api/NovelAIImageApi";
import {
  buildImageReviewPrompt,
  buildPicGuide,
  getSelfReviewMaxRounds,
  parseImageReviewReply,
} from "./picPromptGuide";

function makeSettings(overrides: Partial<NovelAIImageSettings> = {}): NovelAIImageSettings {
  return { ...createDefaultNovelAIImageSettings(), enabled: true, apiKey: "pst-1", ...overrides };
}

describe("{{picGuide}}", () => {
  it("文生圖沒開或沒 Key 時是空字串", () => {
    expect(buildPicGuide(makeSettings({ enabled: false }))).toBe("");
    expect(buildPicGuide(makeSettings({ apiKey: "" }))).toBe("");
  });

  it("依服務給寫法，提到 negative；交給模型時多一行", () => {
    const nai = buildPicGuide(makeSettings());
    expect(nai.startsWith("\n")).toBe(true);
    expect(nai).toContain("NovelAI");
    expect(nai).toContain("danbooru");
    expect(nai).toContain('negative="');
    expect(nai).not.toContain("不會自動加品質詞");

    const gpt = makeSettings({ provider: "gpt", modelControlsPrompt: true });
    gpt.gpt = { ...gpt.gpt!, apiKey: "sk-1" };
    const text = buildPicGuide(gpt);
    expect(text).toContain("自然語言");
    expect(text).toContain("不會自動加品質詞");
    // 查標籤的提示只給 NovelAI、而且這輪真的有工具時
    expect(buildPicGuide(gpt, { tagLookup: true })).not.toContain("search_danbooru_tags");
    expect(buildPicGuide(makeSettings(), { tagLookup: true })).toContain("search_danbooru_tags");
    expect(nai).not.toContain("search_danbooru_tags");
  });
});

describe("看圖調整", () => {
  it("指示裡有想要的畫面、正負提示詞、外觀標籤與輸出格式", () => {
    const prompt = buildImageReviewPrompt({
      description: "她在咖啡廳看書",
      prompt: "1girl, reading, cafe",
      negativePrompt: "text",
      provider: "novelai",
      autoTags: "red hair",
      round: 1,
      maxRounds: 2,
    });
    expect(prompt).toContain("她在咖啡廳看書");
    expect(prompt).toContain("1girl, reading, cafe");
    expect(prompt).toContain("負面提示詞：text");
    expect(prompt).toContain("red hair");
    expect(prompt).toContain("<pic-ok/>");
    expect(prompt).toContain("<pic-retry");
  });

  it("<pic-ok/> 或看不懂的回覆不重畫", () => {
    expect(parseImageReviewReply("<pic-ok/>")).toEqual({ retry: false });
    expect(parseImageReviewReply("看起來不錯！")).toEqual({ retry: false });
    expect(parseImageReviewReply('<pic-retry negative="x">沒寫 prompt</pic-retry>')).toEqual({ retry: false });
  });

  it("<pic-retry> 讀出新的提示詞與原因，思考內容不算", () => {
    const reply =
      '<think>手好像多一根 <pic-retry prompt="nope">x</pic-retry></think>\n<pic-retry prompt="1girl, reading, cafe, holding book" negative="extra fingers, text">手指多了一根</pic-retry>';
    expect(parseImageReviewReply(reply)).toEqual({
      retry: true,
      prompt: "1girl, reading, cafe, holding book",
      negativePrompt: "extra fingers, text",
      reason: "手指多了一根",
    });
    expect(parseImageReviewReply('<pic-retry prompt="cat"/>')).toMatchObject({ retry: true, prompt: "cat", reason: "" });
  });

  it("最多重畫次數限制在 1～3", () => {
    expect(getSelfReviewMaxRounds(makeSettings({ selfReviewMaxRounds: undefined }))).toBe(1);
    expect(getSelfReviewMaxRounds(makeSettings({ selfReviewMaxRounds: 9 }))).toBe(3);
    expect(getSelfReviewMaxRounds(makeSettings({ selfReviewMaxRounds: 0 }))).toBe(1);
  });
});
