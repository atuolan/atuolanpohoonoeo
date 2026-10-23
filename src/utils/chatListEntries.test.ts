/// <reference types="vitest/globals" />

import { describe, expect, it } from "vitest";
import type { Chat } from "@/types/chat";
import { pickChatListEntries } from "./chatListEntries";

function chat(id: string, characterId: string, updatedAt: number, extra: Partial<Chat> = {}): Chat {
  return { id, characterId, updatedAt, messages: [], ...extra } as unknown as Chat;
}

describe("pickChatListEntries", () => {
  it("同一個角色的多段聊天只留最新的", () => {
    const result = pickChatListEntries([
      chat("k1", "krueger", 1),
      chat("k2", "krueger", 3),
      chat("t1", "tan", 2),
      chat("k3", "krueger", 2),
    ]);
    expect(result.map((c) => c.id)).toEqual(["k2", "t1"]);
  });

  it("群聊各自算，釘選的不去重", () => {
    const result = pickChatListEntries([
      chat("g1", "", 5, { isGroupChat: true }),
      chat("g2", "", 4, { isGroupChat: true }),
      chat("k1", "krueger", 3),
      chat("k2", "krueger", 2, { pinnedToList: true }),
    ]);
    expect(result.map((c) => c.id)).toEqual(["g1", "g2", "k1", "k2"]);
  });
});
