import { describe, expect, it } from "vitest";
import type { ChatScreenMessage } from "@/types/chatScreen";
import {
  buildForwardRecord,
  canForwardIndividually,
  extractRecordParts,
  formatForwardedForPrompt,
  isForwardSelectable,
  summarizeForwardContent,
} from "../chatForward";

function msg(partial: Partial<ChatScreenMessage>): ChatScreenMessage {
  return { id: "m1", role: "ai", content: "", timestamp: 0, ...partial };
}

describe("isForwardSelectable", () => {
  it("只接受一般的使用者與角色訊息", () => {
    expect(isForwardSelectable(msg({ role: "user", content: "hi" }))).toBe(true);
    expect(isForwardSelectable(msg({ role: "system", content: "x" }))).toBe(false);
    expect(isForwardSelectable(msg({ isSystemNotification: true }))).toBe(false);
    expect(isForwardSelectable(msg({ isUserRecalled: true }))).toBe(false);
    expect(isForwardSelectable(msg({ isStreaming: true }))).toBe(false);
  });
});

describe("canForwardIndividually", () => {
  it("文字、圖片、聊天記錄可以逐條轉發", () => {
    expect(canForwardIndividually(msg({ content: "你好" }))).toBe(true);
    expect(canForwardIndividually(msg({ messageType: "image", imageUrl: "img_1" }))).toBe(true);
    expect(
      canForwardIndividually(
        msg({ isGroupChatHistory: true, groupChatHistoryData: { groupName: "g", messages: [] } }),
      ),
    ).toBe(true);
  });

  it("帶狀態的卡片與語音不能逐條轉發", () => {
    expect(canForwardIndividually(msg({ isRedpacket: true }))).toBe(false);
    expect(canForwardIndividually(msg({ isTransfer: true, transferAmount: 10 }))).toBe(false);
    expect(canForwardIndividually(msg({ messageType: "audio" }))).toBe(false);
    expect(canForwardIndividually(msg({ audioBlobId: "audioblob_1" }))).toBe(false);
  });
});

describe("summarizeForwardContent", () => {
  it("把貼圖與 HTML 標籤轉成可讀文字", () => {
    expect(summarizeForwardContent(msg({ content: "看這個 [sticker:http://a/b.png]" }))).toBe(
      "看這個 [貼圖]",
    );
    expect(summarizeForwardContent(msg({ content: "<b>粗體</b>文字" }))).toBe("粗體文字");
    expect(summarizeForwardContent(msg({ content: "Verstanden?<br>聽懂了嗎？" }))).toBe(
      "Verstanden?\n聽懂了嗎？",
    );
    expect(summarizeForwardContent(msg({ content: "<p>第一段</p><p>第二段</p>" }))).toBe(
      "第一段\n第二段",
    );
  });

  it("特殊訊息以標籤呈現", () => {
    expect(summarizeForwardContent(msg({ isTransfer: true, transferAmount: 52 }))).toBe(
      "[轉帳 52]",
    );
    expect(
      summarizeForwardContent(msg({ messageType: "audio", audioTranscript: "早安" })),
    ).toBe("[語音] 早安");
    expect(
      summarizeForwardContent(msg({ messageType: "image", imageUrl: "x", imageCaption: "貓" })),
    ).toBe("[圖片：貓]");
  });
});

describe("buildForwardRecord", () => {
  it("同時產生卡片資料和給 AI 讀的文字", () => {
    const record = buildForwardRecord("小明和Claude", [
      { senderName: "小明", isUser: true, timestamp: 0, content: "在嗎" },
      { senderName: "Claude", isUser: false, timestamp: 0, content: "在" },
    ]);
    expect(record.groupChatHistoryData.groupName).toBe("小明和Claude");
    expect(record.groupChatHistoryData.messages).toHaveLength(2);
    expect(record.content.split("\n")[0]).toBe("[聊天記錄] 小明和Claude的聊天記錄");
    expect(record.content).toContain("小明：在嗎");
    expect(record.content).toContain("Claude：在");
    expect(record.content.endsWith("</轉發的聊天記錄>")).toBe(true);
  });

  it("過長的訊息會被截斷", () => {
    const record = buildForwardRecord("t", [
      { senderName: "a", isUser: false, timestamp: 0, content: "字".repeat(1000) },
    ]);
    expect(record.groupChatHistoryData.messages[0].content.length).toBe(601);
  });
});

describe("formatForwardedForPrompt", () => {
  it("在內容前標出來源", () => {
    expect(
      formatForwardedForPrompt("今天好熱", { chatName: "群名真難取", senderName: "原來是咪" }),
    ).toBe("[轉發自「群名真難取」，原發送者：原來是咪]\n今天好熱");
  });
});

describe("extractRecordParts", () => {
  const resolve = (name: string) => (name === "開心" ? "https://s/happy.png" : undefined);

  it("純文字訊息不產生片段", () => {
    expect(extractRecordParts(msg({ content: "你好" }), resolve)).toBeUndefined();
  });

  it("貼圖從貼圖庫查出網址，前後文字保留", () => {
    expect(extractRecordParts(msg({ content: "哈哈[sticker:開心]好耶" }), resolve)).toEqual([
      { type: "text", text: "哈哈" },
      { type: "sticker", name: "開心", url: "https://s/happy.png" },
      { type: "text", text: "好耶" },
    ]);
  });

  it("XML 寫法的貼圖與自帶網址的貼圖都認得", () => {
    expect(extractRecordParts(msg({ content: '<sticker name="開心" />' }), resolve)).toEqual([
      { type: "sticker", name: "開心", url: "https://s/happy.png" },
    ]);
    expect(extractRecordParts(msg({ content: "[sticker:哭|https://s/cry.png]" }), resolve)).toEqual(
      [{ type: "sticker", name: "哭", url: "https://s/cry.png" }],
    );
  });

  it("IndexedDB 圖片引用不收，網址圖片收", () => {
    expect(extractRecordParts(msg({ imageUrl: "chatimg_123", content: "" }), resolve)).toBeUndefined();
    expect(
      extractRecordParts(msg({ imageUrl: "https://i/a.png", imageCaption: "貓" }), resolve),
    ).toEqual([{ type: "image", url: "https://i/a.png", name: "貓" }]);
  });
});

describe("buildForwardRecord 頭像", () => {
  it("有頭像才寫入 senderAvatars，片段會保留", () => {
    const parts = [{ type: "sticker" as const, url: "u", name: "n" }];
    const withAvatar = buildForwardRecord(
      "t",
      [{ senderName: "a", isUser: false, timestamp: 0, content: "[貼圖]", parts }],
      { a: "data:image/png;base64,xx" },
    );
    expect(withAvatar.groupChatHistoryData.senderAvatars).toEqual({ a: "data:image/png;base64,xx" });
    expect(withAvatar.groupChatHistoryData.messages[0].parts).toEqual(parts);

    const noAvatar = buildForwardRecord("t", [
      { senderName: "a", isUser: false, timestamp: 0, content: "x" },
    ], {});
    expect(noAvatar.groupChatHistoryData.senderAvatars).toBeUndefined();
    expect("parts" in noAvatar.groupChatHistoryData.messages[0]).toBe(false);
  });
});
