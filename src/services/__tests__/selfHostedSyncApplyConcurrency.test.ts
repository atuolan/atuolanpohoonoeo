import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/types/chat";
import type { SelfHostedSyncEntityEnvelope } from "@/types/selfHostedSync";

// 模擬 IndexedDB 讀寫有延遲：兩批同時套用時，讀出來的都是舊的聊天內容
const stored = new Map<string, ChatMessage[]>();
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

vi.mock("@/storage/chatMessageStorage", () => ({
  loadMessages: vi.fn(async (chatId: string) => {
    await tick();
    return [...(stored.get(chatId) ?? [])];
  }),
  saveMessages: vi.fn(async (chatId: string, messages: ChatMessage[]) => {
    await tick();
    stored.set(chatId, [...messages]);
  }),
  deleteMessage: vi.fn(),
}));

vi.mock("@/storage/chatStorage", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  refreshChatDerivedMetadata: vi.fn(async () => {}),
}));

function envelope(chatId: string, index: number): SelfHostedSyncEntityEnvelope {
  return {
    entityType: "chat_message",
    entityId: `m${index}`,
    schemaVersion: 1,
    createdAt: index,
    updatedAt: index,
    deletedAt: null,
    payload: {
      id: `m${index}`,
      chatId,
      sender: "assistant",
      name: "A",
      is_user: false,
      status: "sent",
      content: `message ${index}`,
      createdAt: index,
      updatedAt: index,
    },
  } as unknown as SelfHostedSyncEntityEnvelope;
}

describe("SelfHostedSyncService.applyPullResponsePublic", () => {
  it("同一個聊天的好幾批同時套用時，每一批的訊息都要留下來", async () => {
    const { getSelfHostedSyncService } = await import("@/services/SelfHostedSyncService");
    const service = getSelfHostedSyncService();
    const batches = [0, 1, 2, 3].map((b) =>
      Array.from({ length: 20 }, (_, i) => envelope("chat-1", b * 20 + i)),
    );

    await Promise.all(
      batches.map((items) =>
        service.applyPullResponsePublic(
          { serverTime: Date.now(), items, hasMore: false, nextSince: undefined },
          { forceOverwrite: true },
        ),
      ),
    );

    expect(stored.get("chat-1")?.length).toBe(80);
  });
});
