/// <reference types="vitest/globals" />

import type { Chat, ChatAppearance } from "@/types/chat";

const { dbGet, dbPut, scheduleSelfHostedAutoSync } = vi.hoisted(() => ({
  dbGet: vi.fn(),
  dbPut: vi.fn(),
  scheduleSelfHostedAutoSync: vi.fn(),
}));

vi.mock("@/db/database", () => ({
  DB_STORES: { CHATS: "chats" },
  db: {
    init: vi.fn().mockResolvedValue(undefined),
    get: dbGet,
    put: dbPut,
  },
}));

vi.mock("@/services/selfHostedSyncState", () => ({
  recordDeletedEntity: vi.fn(),
  scheduleSelfHostedAutoSync,
}));

import { saveChatMetadata } from "@/storage/chatStorage";

function createChat(appearance?: ChatAppearance): Chat {
  return {
    id: "chat-appearance-race",
    name: "外觀競態測試",
    characterId: "character-1",
    messages: [],
    metadata: {},
    createdAt: 1,
    updatedAt: 2,
    appearance,
  };
}

const customAppearance: ChatAppearance = {
  useCustom: true,
  wallpaper: {
    type: "color",
    value: "#123456",
    blur: 0,
    opacity: 100,
    overlay: "transparent",
    fit: "cover",
  },
  bubble: {
    userBgColor: "#abcdef",
    userTextColor: "#111111",
    aiBgColor: "#ffffff",
    aiTextColor: "#222222",
    borderRadius: 16,
    maxWidth: 75,
  } as ChatAppearance["bubble"],
};

describe("saveChatMetadata 外觀競態防護", () => {
  beforeEach(() => {
    dbGet.mockReset();
    dbPut.mockReset();
    scheduleSelfHostedAutoSync.mockReset();
  });

  it("新快照尚未 hydration 而缺失 appearance 時保留資料庫既有外觀", async () => {
    dbGet.mockResolvedValue(createChat(customAppearance));

    await saveChatMetadata(createChat(undefined));

    expect(dbPut).toHaveBeenCalledTimes(1);
    expect(dbPut.mock.calls[0][1].appearance).toEqual(customAppearance);
    expect(scheduleSelfHostedAutoSync).toHaveBeenCalledTimes(1);
  });

  it("明確傳入 useCustom false 時允許關閉聊天專屬外觀", async () => {
    dbGet.mockResolvedValue(createChat(customAppearance));
    const disabledAppearance: ChatAppearance = { useCustom: false };

    await saveChatMetadata(createChat(disabledAppearance));

    expect(dbPut).toHaveBeenCalledTimes(1);
    expect(dbPut.mock.calls[0][1].appearance).toEqual(disabledAppearance);
  });
});
