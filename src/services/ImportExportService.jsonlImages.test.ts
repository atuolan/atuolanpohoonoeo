import { describe, expect, it, vi } from "vitest";

const stored = vi.hoisted(() => ({
  chat: { id: "c1", characterId: "ch1", createdAt: 0, metadata: {}, messages: [] } as any,
  messages: [] as any[],
}));

vi.mock("../db/database", () => ({
  DB_STORES: { CHATS: "chats", CHARACTERS: "characters" },
  db: {
    get: vi.fn(async (store: string) =>
      store === "chats" ? stored.chat : { id: "ch1", data: { name: "小精靈" } },
    ),
  },
}));
vi.mock("../storage/chatMessageStorage", () => ({
  loadMessages: vi.fn(async () => stored.messages),
  saveMessages: vi.fn(),
}));
vi.mock("../db/operations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../db/operations")>()),
  // 圖片在 imageCache 的引用還原成 data URL
  restoreImagesToMessages: vi.fn(async (msgs: any[]) =>
    msgs.map((m) => (m.imageUrl === "chatimg_1" ? { ...m, imageUrl: "data:image/png;base64,AAA", imageData: "data:image/png;base64,AAA" } : m)),
  ),
}));

import { ImportExportService } from "./ImportExportService";

describe("JSONL 匯出、匯入保留圖片", () => {
  it("圖片寫進 extra.image，匯入時讀回；只有圖沒有文字的訊息也不會被丟掉", async () => {
    stored.messages = [
      { id: "u1", sender: "user", is_user: true, content: "[圖片]", createdAt: 1, messageType: "image", imageUrl: "chatimg_1", imageData: "chatimg_1", imageMimeType: "image/png" },
      { id: "a1", sender: "assistant", content: "", createdAt: 2, messageType: "image", imageData: "BBB", imageMimeType: "image/jpeg", imageCaption: "古風男子", imagePrompt: "1boy, hanfu" },
      { id: "a2", sender: "assistant", content: "好看嗎", createdAt: 3 },
    ];
    const service = new ImportExportService();
    const blob = await service.exportChatAsJsonl("c1");
    const lines = (await blob!.text()).split("\n");
    expect(JSON.parse(lines[1]).extra.image).toBe("data:image/png;base64,AAA");
    expect(JSON.parse(lines[2]).extra).toMatchObject({
      image: "data:image/jpeg;base64,BBB",
      title: "古風男子",
      image_prompt: "1boy, hanfu",
    });
    expect(JSON.parse(lines[3]).extra).toBeUndefined();

    const imported = (service as any)._parseJsonlMessages(lines, "User", "小精靈");
    expect(imported).toHaveLength(3);
    expect(imported[0]).toMatchObject({ messageType: "image", imageData: "AAA", imageMimeType: "image/png" });
    expect(imported[1]).toMatchObject({
      content: "古風男子",
      messageType: "image",
      imageData: "BBB",
      imageMimeType: "image/jpeg",
      imagePrompt: "1boy, hanfu",
    });
    expect(imported[2].imageUrl).toBeUndefined();
  });
});
