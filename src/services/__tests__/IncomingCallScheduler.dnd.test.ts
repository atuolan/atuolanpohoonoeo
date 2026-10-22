import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingCall } from "@/types/incomingCall";

const { pendingCalls } = vi.hoisted(() => ({ pendingCalls: new Map<string, PendingCall>() }));

vi.mock("@/db/database", () => ({
  DB_STORES: { PENDING_CALLS: "pendingCalls" },
  db: {
    getAll: vi.fn(async () => [...pendingCalls.values()]),
    delete: vi.fn(async (_store: string, id: string) => {
      pendingCalls.delete(id);
    }),
  },
}));

import { IncomingCallScheduler } from "@/services/IncomingCallScheduler";

const NOW = new Date(2026, 9, 22, 12, 0).getTime();

function addCall(id: string, chatId: string, triggerOffset: number, createdOffset: number) {
  pendingCalls.set(id, {
    id,
    characterId: `char-${chatId}`,
    characterName: "角色",
    chatId,
    triggerTime: NOW + triggerOffset,
    reason: "想你了",
    createdAt: NOW + createdOffset,
  });
}

beforeEach(() => {
  pendingCalls.clear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

describe("待處理來電的聊天勿擾", () => {
  it("沒有到期的來電就不查聊天勿擾", async () => {
    addCall("later", "chat-a", 60_000, -1000);
    const lookup = vi.fn(async () => false);

    const result = await new IncomingCallScheduler().checkPendingCalls(false, lookup);

    expect(result).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("到期來電的聊天開了勿擾就跳過，改給下一通", async () => {
    addCall("first", "chat-dnd", -5000, -60_000);
    addCall("second", "chat-ok", -5000, -30_000);
    const lookup = vi.fn(async (chatId: string) => chatId === "chat-dnd");

    const result = await new IncomingCallScheduler().checkPendingCalls(false, lookup);

    expect(result?.id).toBe("second");
    expect(lookup).toHaveBeenCalledWith("chat-dnd");
  });

  it("照建立時間先後回傳第一通沒勿擾的", async () => {
    addCall("newer", "chat-b", -1000, -10_000);
    addCall("older", "chat-a", -1000, -20_000);

    const result = await new IncomingCallScheduler().checkPendingCalls(false, async () => false);

    expect(result?.id).toBe("older");
  });

  it("聊天頁傳進來的 Map 照舊可以用", async () => {
    addCall("first", "chat-dnd", -5000, -60_000);
    addCall("second", "chat-ok", -5000, -30_000);

    const result = await new IncomingCallScheduler().checkPendingCalls(
      false,
      new Map([["chat-dnd", true]]),
    );

    expect(result?.id).toBe("second");
  });
});
