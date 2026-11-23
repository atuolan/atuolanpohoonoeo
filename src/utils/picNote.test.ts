import { describe, expect, it } from "vitest";
import {
  assignPicNotes,
  buildOwnImagesInstruction,
  buildPicNoteInstruction,
  buildReadImagePrompt,
  cleanImageNoteReply,
  describeImageForPrompt,
  extractPicNote,
  extractPicNotes,
  findPrevTurnGeneratedImages,
  findTurnImageMessage,
  findTurnImageMessages,
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

describe("findPrevTurnGeneratedImages", () => {
  const img = (id: string, role: string, extra: Record<string, unknown> = {}) => ({
    id,
    role,
    imageData: "B64",
    imageMimeType: "image/png",
    ...extra,
  });

  it("找緊接在這一輪 user 訊息前那一輪 AI 畫的圖", () => {
    const messages = [
      img("old", "ai"),
      { id: "u0", role: "user" },
      { id: "a1", role: "ai" },
      img("a2", "ai"),
      { id: "u1", role: "user" },
      { id: "s1", role: "system" },
    ];
    expect(findPrevTurnGeneratedImages(messages).map((m) => m.id)).toEqual(["a2"]);
  });

  it("最多取最新的 limit 張，照原順序", () => {
    const messages = [{ id: "u0", role: "user" }, img("a1", "ai"), img("a2", "ai"), img("a3", "ai"), { id: "u1", role: "user" }];
    expect(findPrevTurnGeneratedImages(messages).map((m) => m.id)).toEqual(["a2", "a3"]);
  });

  it("上一輪 AI 沒畫圖、使用者傳的圖都不算", () => {
    const messages = [img("a0", "ai"), img("u0", "user"), { id: "a1", role: "ai" }, img("u1", "user")];
    expect(findPrevTurnGeneratedImages(messages)).toEqual([]);
  });

  it("沒有圖片資料（還在生成、生成失敗）不算", () => {
    const messages = [{ id: "u0", role: "user" }, { id: "a1", role: "ai", imageMimeType: "image/png" }, { id: "u1", role: "user" }];
    expect(findPrevTurnGeneratedImages(messages)).toEqual([]);
  });
});

describe("buildOwnImagesInstruction", () => {
  it("說明是上一輪畫的成品，要以看到的為準", () => {
    const text = buildOwnImagesInstruction(1);
    expect(text).toContain("上一輪用 <pic> 畫出來的實際成品");
    expect(text).toContain("以你看到的畫面為準");
    expect(text).not.toContain("<pic-note");
  });

  it("askNote 時請模型寫最後一張的 pic-note", () => {
    const text = buildOwnImagesInstruction(2, { askNote: true, userName: "小明" });
    expect(text).toContain("附上的 2 張");
    expect(text).toContain('<pic-note text="圖片內容"/>');
    expect(text).toContain("最後一張");
    expect(text).toContain("不會顯示給 小明");
  });
});

describe("這一輪傳了好幾張圖", () => {
  const img = (id: string, role: string) => ({ id, role, imageData: id, imageMimeType: "image/png" });

  it("findTurnImageMessages 照順序取這一輪使用者的圖，最多 limit 張", () => {
    const messages = [img("u0", "user"), { id: "a0", role: "ai" }, img("u1", "user"), { id: "s", role: "system" }, img("u2", "user"), img("u3", "user")];
    expect(findTurnImageMessages(messages).map((m) => m.id)).toEqual(["u1", "u2", "u3"]);
    expect(findTurnImageMessages(messages, 2).map((m) => m.id)).toEqual(["u2", "u3"]);
    expect(findTurnImageMessages([...messages, { id: "a1", role: "ai" }])).toEqual([]);
  });

  it("extractPicNotes 照順序取出全部備註", () => {
    const { content, notes } = extractPicNotes('好看<pic-note text="一隻貓"/><pic-note text="  兩隻狗 "/><pic-note text=""/>');
    expect(content).toBe("好看");
    expect(notes).toEqual(["一隻貓", "兩隻狗"]);
  });

  it("assignPicNotes 一張一個；只有一個備註時給最後一張", () => {
    const images = [{ imageNote: undefined as string | undefined }, { imageNote: "舊" }, { imageNote: undefined as string | undefined }];
    assignPicNotes(images, ["A", "B"]);
    expect(images.map((i) => i.imageNote)).toEqual(["A", "B", undefined]);
    const two = [{ imageNote: undefined as string | undefined }, { imageNote: undefined as string | undefined }];
    assignPicNotes(two, ["只有一個"]);
    expect(two.map((i) => i.imageNote)).toEqual([undefined, "只有一個"]);
  });

  it("好幾張時請模型照順序各寫一個備註", () => {
    const text = buildPicNoteInstruction("小明", 3);
    expect(text).toContain("傳了 3 張圖片");
    expect(text).toContain("照圖片順序加 3 個");
    expect(buildPicNoteInstruction("小明")).toContain("加一個");
  });
});
