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

import { loadChatById, saveChatMetadata } from "@/storage/chatStorage";

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

describe("chat TTS language persistence", () => {
  it.each(["Japanese", "auto", "", undefined])("round-trips language override %s per chat", async (languageBoost) => {
    const records = new Map<string, Chat>();
    dbGet.mockImplementation(async (_store, id) => records.get(id));
    dbPut.mockImplementation(async (_store, chat) => { records.set(chat.id, chat); });
    const first: Chat = { ...createChat(), id: "chat-japanese", minimaxTTSOverride: { languageBoost } };
    const second = { ...createChat(), id: "chat-global" };

    await saveChatMetadata(first);
    await saveChatMetadata(second);

    expect((await loadChatById(first.id))?.minimaxTTSOverride?.languageBoost).toBe(languageBoost);
    expect((await loadChatById(second.id))?.minimaxTTSOverride).toBeUndefined();
    first.minimaxTTSOverride = {};
    await saveChatMetadata(first);
    expect((await loadChatById(first.id))?.minimaxTTSOverride?.languageBoost).toBeUndefined();
  });
});

describe("saveChatMetadata 角色狀態", () => {
  beforeEach(() => {
    dbGet.mockReset();
    dbPut.mockReset();
  });

  it("資料庫裡的狀態比較新時保留資料庫的", async () => {
    dbGet.mockResolvedValue({ ...createChat(), charStatus: { text: "睡覺中", updatedAt: 200 } });

    await saveChatMetadata({ ...createChat(), charStatus: { text: "在線", updatedAt: 100 } });
    expect(dbPut.mock.calls[0][1].charStatus).toEqual({ text: "睡覺中", updatedAt: 200 });

    await saveChatMetadata(createChat());
    expect(dbPut.mock.calls[1][1].charStatus).toEqual({ text: "睡覺中", updatedAt: 200 });
  });

  it("新的狀態會寫進去", async () => {
    dbGet.mockResolvedValue({ ...createChat(), charStatus: { text: "睡覺中", updatedAt: 200 } });

    await saveChatMetadata({ ...createChat(), charStatus: { text: "起床了", updatedAt: 300 } });
    expect(dbPut.mock.calls[0][1].charStatus).toEqual({ text: "起床了", updatedAt: 300 });
  });
});

describe("saveChatMetadata 的角色暫時離開", () => {
  const away = (updatedAt: number, endedAt?: number) => ({
    id: "away_1",
    reason: "開會",
    backText: "我回來了",
    startedAt: 100,
    returnAt: 1000,
    urgeCount: 0,
    callCount: 0,
    endedAt,
    updatedAt,
  });

  beforeEach(() => {
    dbGet.mockReset();
    dbPut.mockReset();
  });

  it("畫面上較舊的快照（或沒帶暫離）不會蓋掉背景寫入的", async () => {
    dbGet.mockResolvedValue({ ...createChat(), charAway: away(200, 1000) });

    await saveChatMetadata({ ...createChat(), charAway: away(100) });
    expect(dbPut.mock.calls[0][1].charAway).toEqual(away(200, 1000));

    await saveChatMetadata(createChat());
    expect(dbPut.mock.calls[1][1].charAway).toEqual(away(200, 1000));
  });

  it("較新的暫離會寫進去", async () => {
    dbGet.mockResolvedValue({ ...createChat(), charAway: away(200) });

    await saveChatMetadata({ ...createChat(), charAway: away(300, 1000) });
    expect(dbPut.mock.calls[0][1].charAway).toEqual(away(300, 1000));
  });

  it("預約的忙碌同樣保留較新的一筆", async () => {
    dbGet.mockResolvedValue({ ...createChat(), charAwayPlan: away(200, 1000) });

    await saveChatMetadata(createChat());
    expect(dbPut.mock.calls[0][1].charAwayPlan).toEqual(away(200, 1000));

    await saveChatMetadata({ ...createChat(), charAwayPlan: away(300) });
    expect(dbPut.mock.calls[1][1].charAwayPlan).toEqual(away(300));
  });
});
