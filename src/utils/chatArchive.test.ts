/// <reference types="vitest/globals" />

import { describe, expect, it } from "vitest";
import type { Chat } from "@/types/chat";
import { getArchivedCharacterIds, getChatRowMembers, isChatArchived } from "./chatArchive";

function chat(id: string, characterId: string, extra: Partial<Chat> = {}): Chat {
  return { id, characterId, updatedAt: 1, messages: [], ...extra } as unknown as Chat;
}

describe("chatArchive", () => {
  it("archivedAt 為 0 或沒有都算沒歸檔", () => {
    expect(isChatArchived(chat("a", "x", { archivedAt: 0 }))).toBe(false);
    expect(isChatArchived(chat("a", "x"))).toBe(false);
    expect(isChatArchived(chat("a", "x", { archivedAt: 5 }))).toBe(true);
  });

  it("單聊全部歸檔才算整個角色歸檔，群聊不算", () => {
    const ids = getArchivedCharacterIds([
      chat("k1", "krueger", { archivedAt: 1 }),
      chat("k2", "krueger", { archivedAt: 1 }),
      chat("t1", "tan", { archivedAt: 1 }),
      chat("t2", "tan"),
      chat("g1", "gina", { isGroupChat: true }),
      chat("g2", "gina", { archivedAt: 1 }),
    ]);
    expect([...ids].sort()).toEqual(["gina", "krueger"]);
  });

  it("一般單聊那一列包含同角色所有未釘選的單聊；群聊與釘選只有自己", () => {
    const all = [
      chat("k1", "krueger"),
      chat("k2", "krueger"),
      chat("k3", "krueger", { pinnedToList: true }),
      chat("g1", "krueger", { isGroupChat: true }),
      chat("t1", "tan"),
    ];
    expect(getChatRowMembers(all[0], all).map((c) => c.id)).toEqual(["k1", "k2"]);
    expect(getChatRowMembers(all[2], all).map((c) => c.id)).toEqual(["k3"]);
    expect(getChatRowMembers(all[3], all).map((c) => c.id)).toEqual(["g1"]);
  });
});
