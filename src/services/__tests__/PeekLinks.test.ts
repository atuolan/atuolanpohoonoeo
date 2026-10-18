import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, db, DB_STORES } from "@/db/database";
import {
  deletePeekLinks,
  leaveCaughtNote,
  loadPeekLinks,
  rememberPeekSecret,
  savePeekLinks,
  sendDraftAsChar,
} from "@/services/PeekLinks";
import { loadMessages } from "@/storage/chatMessageStorage";
import { createDefaultImportantEventsLog, type ImportantEventsLog } from "@/types/importantEvents";

const names = { userName: "小栩", charName: "沈既白" };
const secret = { key: "draft:u", label: "想跟笨蛋說、沒送出的話", detail: "其實那天我不是剛好路過" };

beforeEach(async () => {
  closeDatabase();
  await deleteDB("aguaphone-db");
  await db.init();
});

describe("連動開關", () => {
  it("預設都關，每個聊天各自存，刪掉回到預設", async () => {
    expect(await loadPeekLinks("chat-1")).toEqual({ remember: false, caught: false, sendDraft: false });
    await savePeekLinks("chat-1", { remember: true, caught: false, sendDraft: true });
    expect(await loadPeekLinks("chat-1")).toEqual({ remember: true, caught: false, sendDraft: true });
    expect((await loadPeekLinks("chat-2")).remember).toBe(false);
    await deletePeekLinks("chat-1");
    expect((await loadPeekLinks("chat-1")).remember).toBe(false);
  });
});

describe("秘密記進記憶", () => {
  it("記成秘密分類、系統來源；同一個只記一次", async () => {
    expect(await rememberPeekSecret("chat-1", "c1", secret, names)).toBe(true);
    expect(await rememberPeekSecret("chat-1", "c1", secret, names)).toBe(false);
    const log = await db.get<ImportantEventsLog>(DB_STORES.IMPORTANT_EVENTS, "chat-1");
    expect(log?.events).toHaveLength(1);
    expect(log?.events[0]).toMatchObject({
      category: "secret",
      source: "system",
      content: "小栩偷看沈既白的手機，知道了「想跟笨蛋說、沒送出的話」：其實那天我不是剛好路過",
    });
  });

  it("重要事件關掉的聊天不記", async () => {
    const log = createDefaultImportantEventsLog("c1", "chat-1");
    log.settings.enabled = false;
    await db.put(DB_STORES.IMPORTANT_EVENTS, log);
    expect(await rememberPeekSecret("chat-1", "c1", secret, names)).toBe(false);
  });
});

describe("回到聊天裡", () => {
  it("被發現是系統訊息，幫他送出的是他的訊息；都帶聊天的時間", async () => {
    await leaveCaughtNote("chat-1", "小栩剛剛偷看了沈既白的手機，被沈既白發現了。", 1234);
    await sendDraftAsChar("chat-1", "沈既白", "其實那天我不是剛好路過", 5678);
    const messages = await loadMessages("chat-1");
    expect(messages.map((m) => [m.sender, m.isSystemNotification ?? false, m.storyTime])).toEqual([
      ["system", true, 1234],
      ["assistant", false, 5678],
    ]);
    expect(messages[1].content).toBe("其實那天我不是剛好路過");
  });
});
