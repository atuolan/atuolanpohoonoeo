import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDatabase, db, DB_STORES } from "@/db/database";
import { deleteCharacterRelatedData } from "@/services/characterDeletion";
import { createChatRecord, loadAllChats } from "@/storage/chatStorage";
import type { Chat } from "@/types/chat";

beforeEach(async () => {
  closeDatabase();
  await deleteDB("aguaphone-db");
  await db.init();
});

afterEach(() => {
  closeDatabase();
});

function chat(id: string, overrides: Partial<Chat> = {}): Chat {
  return {
    id,
    name: id,
    characterId: "c1",
    messages: [],
    metadata: {},
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("刪除角色時一起刪掉的資料", () => {
  it("私聊、多人卡和角色資料刪掉；群聊、鎖定的聊天、其他角色的資料留著", async () => {
    await createChatRecord(chat("direct"));
    await createChatRecord(chat("locked", { lockedFromDelete: true }));
    await createChatRecord(
      chat("multi", {
        isGroupChat: true,
        groupMetadata: { groupName: "多人", members: [], isMultiCharCard: true },
      } as Partial<Chat>),
    );
    await createChatRecord(
      chat("group", {
        isGroupChat: true,
        groupMetadata: {
          groupName: "群",
          members: [
            { characterId: "c1", isAdmin: false, isMuted: false, joinedAt: 1 },
            { characterId: "c2", isAdmin: false, isMuted: false, joinedAt: 1 },
          ],
        },
      } as Partial<Chat>),
    );
    await createChatRecord(chat("other", { characterId: "c2" }));

    await db.put(DB_STORES.SUMMARIES, { id: "s1", chatId: "direct", characterId: "c1" });
    await db.put(DB_STORES.SUMMARIES, { id: "s2", chatId: "group", characterId: "c1" });
    await db.put(DB_STORES.IMPORTANT_EVENTS, { id: "direct", chatId: "direct", characterId: "c1" });
    await db.put(DB_STORES.CHAT_AFFINITY_STATES, { chatId: "multi", characterId: "c1" });
    await db.put(DB_STORES.CALL_HISTORY, { id: "call1", characterId: "c1", chatId: "direct" });
    await db.put(DB_STORES.CALL_HISTORY, { id: "call2", characterId: "c2", chatId: "other" });
    await db.put(DB_STORES.QZONE_POSTS, { id: "p1", authorId: "c1" });
    await db.put(DB_STORES.QZONE_POSTS, { id: "p2", authorId: "user" });
    await db.put(DB_STORES.CHARACTER_AFFECTIONS, { characterId: "c1", enabled: true });
    await db.put(DB_STORES.SETTINGS, "direct", "lastActiveChatId_c1");

    const result = await deleteCharacterRelatedData("c1");

    expect(result).toEqual({ deletedChatCount: 2, keptLockedChatCount: 1 });
    expect((await loadAllChats()).map((c) => c.id).sort()).toEqual(["group", "locked", "other"]);
    expect(await db.get(DB_STORES.SUMMARIES, "s1")).toBeUndefined();
    expect(await db.get(DB_STORES.SUMMARIES, "s2")).toBeDefined();
    expect(await db.get(DB_STORES.IMPORTANT_EVENTS, "direct")).toBeUndefined();
    expect(await db.get(DB_STORES.CHAT_AFFINITY_STATES, "multi")).toBeUndefined();
    expect(await db.get(DB_STORES.CALL_HISTORY, "call1")).toBeUndefined();
    expect(await db.get(DB_STORES.CALL_HISTORY, "call2")).toBeDefined();
    expect(await db.get(DB_STORES.QZONE_POSTS, "p1")).toBeUndefined();
    expect(await db.get(DB_STORES.QZONE_POSTS, "p2")).toBeDefined();
    expect(await db.get(DB_STORES.CHARACTER_AFFECTIONS, "c1")).toBeUndefined();
    expect(await db.get(DB_STORES.SETTINGS, "lastActiveChatId_c1")).toBeUndefined();
  });
});
