import { describe, expect, it } from "vitest";
import {
  buildReadImagePrompt,
  cleanImageNoteReply,
  describeImageForPrompt,
  extractPicNote,
  findTurnImageMessage,
  stripPicNote,
} from "./picNote";

describe("extractPicNote", () => {
  it("取出 text 屬性並拿掉標籤", () => {
    const result = extractPicNote(
      '<content><msg>好可愛</msg></content>\n<pic-note text="一隻橘貓趴在藍色沙發上"/>',
    );
    expect(result.note).toBe("一隻橘貓趴在藍色沙發上");
    expect(result.content).toBe("<content><msg>好可愛</msg></content>");
  });

  it("認得包起來的寫法，好幾個時取最後一個有字的", () => {
    const result = extractPicNote("<pic-note>第一張</pic-note>回覆<pic-note>第二張</pic-note><pic-note/>");
    expect(result.note).toBe("第二張");
    expect(result.content).toBe("回覆");
  });

  it("屬性值裡有 > 和另一種引號也不會斷", () => {
    expect(extractPicNote(`<pic-note text="招牌寫著 'A > B'"/>`).note).toBe("招牌寫著 'A > B'");
  });

  it("沒有標籤時原樣回傳", () => {
    expect(extractPicNote("  <msg>嗨</msg>  ")).toEqual({ content: "  <msg>嗨</msg>  ", note: null });
  });

  it("太長的截掉", () => {
    expect(extractPicNote(`<pic-note text="${"貓".repeat(200)}"/>`).note).toHaveLength(120);
  });
});

describe("stripPicNote", () => {
  it("拿掉串流中寫到一半的標籤", () => {
    expect(stripPicNote('<msg>嗨</msg>\n<pic-note text="一隻橘')).toBe("<msg>嗨</msg>");
  });
});

describe("findTurnImageMessage", () => {
  const img = { imageData: "abc", imageMimeType: "image/jpeg" };

  it("找這一輪最新的一張圖", () => {
    const messages = [
      { id: "1", role: "user", ...img },
      { id: "2", role: "ai" },
      { id: "3", role: "user", ...img },
      { id: "4", role: "system" },
      { id: "5", role: "user" },
    ];
    expect(findTurnImageMessage(messages)?.id).toBe("3");
  });

  it("AI 回覆過之後的圖不算這一輪", () => {
    const messages = [
      { id: "1", role: "user", ...img },
      { id: "2", role: "ai" },
      { id: "3", role: "user" },
    ];
    expect(findTurnImageMessage(messages)).toBeUndefined();
  });

  it("沒有 MIME 類型的不算", () => {
    expect(findTurnImageMessage([{ id: "1", role: "user", imageData: "abc" }])).toBeUndefined();
  });
});

describe("describeImageForPrompt", () => {
  it("只有 [圖片] 時換成描述", () => {
    expect(describeImageForPrompt("[圖片]", { imageNote: "橘貓", imageCaption: "我的貓" })).toBe("[圖片：橘貓]");
  });

  it("有文字時接在後面，沒有備註用說明", () => {
    expect(describeImageForPrompt("看這個", { imageCaption: "我的貓" })).toBe("看這個\n[圖片：我的貓]");
  });

  it("什麼都沒有時寫圖片", () => {
    expect(describeImageForPrompt("", {})).toBe("[圖片：圖片]");
  });
});

describe("cleanImageNoteReply", () => {
  it("拿掉思考、標籤和引號，收成一行", () => {
    expect(cleanImageNoteReply("<think>先看看</think>\n「一隻橘貓\n趴在沙發上」")).toBe("一隻橘貓 趴在沙發上");
    expect(cleanImageNoteReply('<pic-note text="招牌寫著營業中"/>')).toBe("招牌寫著營業中");
  });

  it("什麼都沒寫時回傳空字串", () => {
    expect(cleanImageNoteReply("<think>嗯</think>  ")).toBe("");
  });
});

describe("buildReadImagePrompt", () => {
  it("有說明時一起附上", () => {
    expect(buildReadImagePrompt("我的新髮型")).toContain("傳圖的人附上的說明：「我的新髮型」");
    expect(buildReadImagePrompt()).not.toContain("說明：");
  });
});
