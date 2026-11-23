import { describe, expect, it } from "vitest";
import { createDefaultNovelAIImageSettings, type NovelAIImageSettings } from "@/api/NovelAIImageApi";
import {
  buildImageReviewPrompt,
  buildPicGuide,
  extractArtistTags,
  parseStyleNoteReply,
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
    expect(parseImageReviewReply("<pic-ok/>")).toEqual({ kind: "ok" });
    expect(parseImageReviewReply("看起來不錯！")).toEqual({ kind: "ok" });
    expect(parseImageReviewReply('<pic-retry negative="x">沒寫 prompt</pic-retry>')).toEqual({ kind: "ok" });
  });

  it("<find-artists> 讀出查詢組（最多 3 組）", () => {
    expect(parseImageReviewReply('<find-artists queries="hanfu, male focus | monochrome, sketch"/>')).toEqual({
      kind: "search",
      queries: ["hanfu, male focus", "monochrome, sketch"],
    });
    expect(parseImageReviewReply('<find-artists queries="a|b|c|d">')).toMatchObject({ queries: ["a", "b", "c"] });
    expect(parseImageReviewReply('<find-artists queries=""/>')).toEqual({ kind: "ok" });
  });

  it("有參考圖：說明圖片順序、列出試過的版本與查到的繪師，可以要求查繪師", () => {
    const prompt = buildImageReviewPrompt({
      description: "古風男子",
      prompt: "1boy, hanfu",
      provider: "novelai",
      round: 2,
      maxRounds: 3,
      hasReference: true,
      attempts: [{ prompt: "1boy", reason: "畫風太亮" }],
      artistNotes: ["常畫「hanfu」的繪師：\n- someone"],
      canSearchArtists: true,
    });
    expect(prompt).toContain("第 1 張是使用者給的參考圖");
    expect(prompt).toContain("畫風（線條、上色、色調");
    expect(prompt).toContain("1. prompt：1boy｜negative：（沒有）｜不對的地方：畫風太亮");
    expect(prompt).toContain("- someone");
    expect(prompt).toContain("<find-artists");
    expect(buildImageReviewPrompt({ description: "", prompt: "x", provider: "gpt", round: 1, maxRounds: 1 })).not.toContain(
      "<find-artists",
    );
  });

  it("<pic-retry> 讀出新的提示詞與原因，思考內容不算", () => {
    const reply =
      '<think>手好像多一根 <pic-retry prompt="nope">x</pic-retry></think>\n<pic-retry prompt="1girl, reading, cafe, holding book" negative="extra fingers, text">手指多了一根</pic-retry>';
    expect(parseImageReviewReply(reply)).toEqual({
      kind: "retry",
      prompt: "1girl, reading, cafe, holding book",
      negativePrompt: "extra fingers, text",
      reason: "手指多了一根",
    });
    expect(parseImageReviewReply('<pic-retry prompt="cat"/>')).toMatchObject({ kind: "retry", prompt: "cat", reason: "" });
  });

  it("最多重畫次數限制在 1～5", () => {
    expect(getSelfReviewMaxRounds(makeSettings({ selfReviewMaxRounds: undefined }))).toBe(1);
    expect(getSelfReviewMaxRounds(makeSettings({ selfReviewMaxRounds: 9 }))).toBe(5);
    expect(getSelfReviewMaxRounds(makeSettings({ selfReviewMaxRounds: 0 }))).toBe(1);
  });
});

describe("畫風參考圖", () => {
  it("{{picGuide}} 帶上畫風筆記、標籤；繪師串只給 NovelAI", () => {
    const styleRef = { styleNote: "細碎線稿、去飽和", styleTags: "sketch, muted colors", artists: "artist:a, artist:b" };
    const nai = buildPicGuide(makeSettings(), { styleRef });
    expect(nai).toContain("畫風：細碎線稿、去飽和");
    expect(nai).toContain("畫風標籤：sketch, muted colors");
    expect(nai).toContain("artist:a, artist:b");
    const gpt = makeSettings({ provider: "gpt" });
    gpt.gpt = { ...gpt.gpt!, apiKey: "sk-1" };
    expect(buildPicGuide(gpt, { styleRef })).not.toContain("artist:a");
    expect(buildPicGuide(makeSettings(), { styleRef: {} })).not.toContain("指定了畫風");
  });

  it("解析畫風筆記；沒照格式寫時整段當描述", () => {
    expect(
      parseStyleNoteReply('<think>嗯</think><style-note tags="sketch,  muted colors">細碎線稿，\n顏色很淡</style-note>'),
    ).toEqual({ styleNote: "細碎線稿， 顏色很淡", styleTags: "sketch, muted colors" });
    expect(parseStyleNoteReply("水彩感、柔光")).toEqual({ styleNote: "水彩感、柔光", styleTags: "" });
  });

  it("從提示詞取出繪師串（含權重寫法）", () => {
    expect(extractArtistTags("1boy, artist:ink master, hanfu, {artist:b}, 1.2::artist:c ::, sketch")).toBe(
      "artist:ink master, {artist:b}, 1.2::artist:c ::",
    );
    expect(extractArtistTags("1boy, hanfu")).toBe("");
  });
});

describe("buildPicGuide drawTool", () => {
  it("tells the model to try drawing with generate_image when it has the tool", () => {
    const settings = makeSettings();
    expect(buildPicGuide(settings, { drawTool: true })).toContain("generate_image");
    expect(buildPicGuide(settings, { drawTool: true })).toContain("view_chat_image");
    expect(buildPicGuide(settings)).not.toContain("generate_image");
  });
});
