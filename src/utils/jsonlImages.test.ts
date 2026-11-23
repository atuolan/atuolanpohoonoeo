import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/types/chat";
import { applyJsonlImageExtra, buildJsonlImageExtra, messageImageToJsonl } from "./jsonlImages";

const base = (): ChatMessage => ({
  id: "m1",
  sender: "assistant",
  name: "角色",
  is_user: false,
  content: "海邊",
  status: "sent",
  createdAt: 1,
  updatedAt: 1,
});

describe("JSONL 圖片", () => {
  it("圖片轉成 data URL 或網址；還原失敗的引用不算", () => {
    expect(messageImageToJsonl({ imageUrl: "data:image/png;base64,AAA" })).toBe("data:image/png;base64,AAA");
    expect(messageImageToJsonl({ imageData: "BB B", imageMimeType: "image/webp" })).toBe("data:image/webp;base64,BBB");
    expect(messageImageToJsonl({ imageUrl: "https://x.com/a.jpg" })).toBe("https://x.com/a.jpg");
    expect(messageImageToJsonl({ imageData: "chatimg_123", imageUrl: "chatimg_123" })).toBeUndefined();
    expect(messageImageToJsonl({})).toBeUndefined();
  });

  it("匯出帶上說明、提示詞、負面、備註；匯入原樣讀回", () => {
    const msg: ChatMessage = {
      ...base(),
      messageType: "image",
      imageUrl: "data:image/png;base64,AAA",
      imageData: "AAA",
      imageMimeType: "image/png",
      imageCaption: "海邊",
      imagePrompt: "beach",
      imageNegativePrompt: "people",
      imageNote: "沙灘和海",
    };
    const extra = buildJsonlImageExtra(msg);
    expect(extra).toEqual({
      image: "data:image/png;base64,AAA",
      title: "海邊",
      image_prompt: "beach",
      image_negative_prompt: "people",
      image_note: "沙灘和海",
    });

    const imported = base();
    expect(applyJsonlImageExtra(imported, extra)).toBe(true);
    expect(imported).toMatchObject({
      messageType: "image",
      imageUrl: "data:image/png;base64,AAA",
      imageData: "AAA",
      imageMimeType: "image/png",
      imageCaption: "海邊",
      imagePrompt: "beach",
      imageNegativePrompt: "people",
      imageNote: "沙灘和海",
    });
  });

  it("網址圖片匯入成 image-url；SillyTavern 伺服器上的相對路徑讀不到就略過", () => {
    const urlMsg = base();
    expect(applyJsonlImageExtra(urlMsg, { image: "https://x.com/a.jpg" })).toBe(true);
    expect(urlMsg).toMatchObject({ messageType: "image-url", imageUrl: "https://x.com/a.jpg" });

    const stPath = base();
    expect(applyJsonlImageExtra(stPath, { image: "/user/images/a.png" })).toBe(false);
    expect(stPath.imageUrl).toBeUndefined();
    expect(applyJsonlImageExtra(base(), undefined)).toBe(false);
  });
});
