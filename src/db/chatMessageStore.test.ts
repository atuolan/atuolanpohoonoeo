/// <reference types="vitest/globals" />

import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import type { ChatMessage } from "@/types/chat";
import { closeDatabase, getDatabase } from "@/db/database";

import {
  appendChatMessages,
  deleteChatMessage,
  loadChatMessages,
  loadChatMessagesPage,
  upsertChatMessages,
} from "@/db/chatMessageStore";

function message(index: number): ChatMessage {
  const isUser = index % 2 === 0;
  return {
    id: `msg-${String(index).padStart(3, "0")}`,
    sender: isUser ? "user" : "assistant",
    name: isUser ? "User" : "Assistant",
    is_user: isUser,
    status: "sent",
    content: `message ${index}`,
    createdAt: index,
    updatedAt: index,
  };
}

describe("chat message paging", () => {
  beforeEach(async () => {
    closeDatabase();
    await deleteDB("aguaphone-db");
  });

  afterEach(() => {
    closeDatabase();
  });

  it("returns the tail and walks older pages with a stable cursor", async () => {
    const records = Array.from({ length: 123 }, (_, index) => message(index));
    await appendChatMessages("chat-page", records);

    const newest = await loadChatMessagesPage("chat-page", 50);
    expect(newest.messages.map((item) => item.id)).toEqual(
      records.slice(73).map((item) => item.id),
    );
    expect(newest.hasMore).toBe(true);

    const middle = await loadChatMessagesPage(
      "chat-page",
      50,
      newest.before,
    );
    expect(middle.messages.map((item) => item.id)).toEqual(
      records.slice(23, 73).map((item) => item.id),
    );

    const oldest = await loadChatMessagesPage("chat-page", 50, middle.before);
    expect(oldest.messages.map((item) => item.id)).toEqual(
      records.slice(0, 23).map((item) => item.id),
    );
    expect(oldest.hasMore).toBe(false);
    expect(oldest.before).toBeNull();
  });

  it("upserts a visible window without deleting older records", async () => {
    const records = Array.from({ length: 123 }, (_, index) => message(index));
    await appendChatMessages("chat-upsert", records);

    await upsertChatMessages("chat-upsert", [
      { ...records[100], content: "edited in the UI window" },
    ]);

    const saved = await loadChatMessages("chat-upsert");
    expect(saved).toHaveLength(123);
    expect(saved.find((item) => item.id === records[100].id)?.content).toBe(
      "edited in the UI window",
    );
    expect(saved[0].id).toBe(records[0].id);
  });

  it("does not let another chat overwrite an existing message id", async () => {
    const original = message(1);
    await appendChatMessages("chat-main", [original]);

    await upsertChatMessages("chat-branch", [
      { ...original, content: "edited in branch" },
    ]);

    expect(await loadChatMessages("chat-main")).toEqual([
      { ...original, chatId: "chat-main" },
    ]);
    expect(await loadChatMessages("chat-branch")).toEqual([]);
  });

  it("does not let another chat delete an existing message id", async () => {
    const original = message(2);
    await appendChatMessages("chat-main", [original]);

    await deleteChatMessage(original.id, "chat-branch");

    expect(await loadChatMessages("chat-main")).toEqual([
      { ...original, chatId: "chat-main" },
    ]);
  });

  it("does not let append move an existing message to another chat", async () => {
    const original = message(3);
    await appendChatMessages("chat-main", [original]);

    await appendChatMessages("chat-branch", [
      { ...original, content: "appended in branch" },
    ]);

    expect(await loadChatMessages("chat-main")).toEqual([
      { ...original, chatId: "chat-main" },
    ]);
    expect(await loadChatMessages("chat-branch")).toEqual([]);
  });

  it("pages records when legacy messages do not have createdAt", async () => {
    const records = Array.from({ length: 80 }, (_, index) => {
      const { createdAt: _createdAt, updatedAt: _updatedAt, ...item } =
        message(index);
      return item as ChatMessage;
    });
    await appendChatMessages("chat-legacy", records);

    const newest = await loadChatMessagesPage("chat-legacy", 50);

    expect(newest.messages).toHaveLength(50);
    expect(newest.messages.map((item) => item.id)).toEqual(
      records.slice(30).map((item) => item.id),
    );
    expect(newest.hasMore).toBe(true);
  });

  it("creates the paging index when upgrading a v28 database", async () => {
    const legacy = await (await import("idb")).openDB("aguaphone-db", 28, {
      upgrade(db) {
        const store = db.createObjectStore("chatMessages", { keyPath: "id" });
        store.createIndex("by-chatId", "chatId");
      },
    });
    legacy.close();

    const migrated = await getDatabase();
    const indexes = migrated
      .transaction("chatMessages", "readonly")
      .objectStore("chatMessages").indexNames;

    expect(indexes.contains("by-chat-createdAt-id")).toBe(true);
  });
});
