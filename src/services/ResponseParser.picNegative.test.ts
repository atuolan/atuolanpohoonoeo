import { describe, expect, it } from "vitest";
import { parseAIResponse, parseGroupChatResponse } from "./ResponseParser";

describe("圖片標籤的正負提示詞", () => {
  it("讀出 prompt、negative 與描述，標籤從內容拿掉", () => {
    const raw =
      '<content><msg>給你看<pic prompt="1girl, cafe, smile" negative="text, watermark">她在咖啡廳笑</pic></msg></content>';
    const pic = parseAIResponse(raw).messages.find((m) => m.isAiImage);
    expect(pic).toMatchObject({
      imagePrompt: "1girl, cafe, smile",
      imageNegativePrompt: "text, watermark",
      imageDescription: "她在咖啡廳笑",
    });
    expect(pic?.content).not.toContain("<pic");
  });

  it("屬性順序不限、單引號、值裡有撇號、negative_prompt 寫法都認", () => {
    const raw = `<content><msg><pic negative_prompt='extra fingers' prompt="a girl's room, night">房間</pic></msg></content>`;
    const pic = parseAIResponse(raw).messages.find((m) => m.isAiImage);
    expect(pic?.imagePrompt).toBe("a girl's room, night");
    expect(pic?.imageNegativePrompt).toBe("extra fingers");
  });

  it("沒寫 prompt、negative 跟以前一樣只有描述", () => {
    const pic = parseAIResponse("<content><msg><pic>夕陽</pic></msg></content>").messages.find((m) => m.isAiImage);
    expect(pic?.imageDescription).toBe("夕陽");
    expect(pic?.imagePrompt).toBeUndefined();
    expect(pic?.imageNegativePrompt).toBeUndefined();
  });

  it("<pic-note> 不會被當成圖片", () => {
    const parsed = parseAIResponse('<content><msg>好看<pic-note text="一隻貓"/></msg></content>');
    expect(parsed.messages.some((m) => m.isAiImage)).toBe(false);
  });

  it("面對面 show-pic 也讀 negative", () => {
    const raw = '<content><msg><show-pic prompt="beach, sunset" negative="people">海邊的照片</show-pic></msg></content>';
    const msg = parseAIResponse(raw).messages.find((m) => m.isShowPic);
    expect(msg).toMatchObject({
      showMediaPrompt: "beach, sunset",
      showMediaNegativePrompt: "people",
      showMediaDescription: "海邊的照片",
    });
  });

  it("群聊圖片訊息讀 negative", () => {
    const raw =
      '<content><msg name="小明" type="image" description="貓" prompt="cat, sofa" negative="dog"/></content>';
    const msg = parseGroupChatResponse(raw).messages.find((m) => m.isAiImage);
    expect(msg).toMatchObject({ imagePrompt: "cat, sofa", imageNegativePrompt: "dog", imageDescription: "貓" });
  });
});
