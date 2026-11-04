import { beforeEach, describe, expect, it, vi } from "vitest";

// 裝置互傳的 hash／manifest 改成只收集 ID 和時間，必須和舊的「組完整 envelope 再取欄位」一模一樣，
// 否則新舊版本的兩台手機比對結果會對不上，每次都以為有差異。

const NOW = 1_800_000_000_000;

const stores: Record<string, unknown[]> = {
  characters: [
    { id: "char-1", createdAt: 10, updatedAt: 20, name: "A", avatar: "data:image/png;base64,xx" },
    { id: "char-2", createdAt: 11, updatedAt: 21, name: "B" },
  ],
  lorebooks: [{ id: "lore-1", createdAt: 1, updatedAt: 2, entries: [] }],
  promptLibrary: [{ identifier: "prompt-1", name: "P" }],
  stickers: [{ id: "sticker-1", name: "S", stickers: [] }],
  summaries: [
    { id: "sum-1", createdAt: 30, updatedAt: 31 },
    { id: "sum-2", createdAt: 32 },
  ],
  importantEvents: [{ id: "ie-1", createdAt: 40 }],
  diaries: [{ id: "diary-1", createdAt: 50, updatedAt: 51 }],
};

vi.mock("@/db/database", () => ({
  DB_STORES: {
    CHARACTERS: "characters",
    LOREBOOKS: "lorebooks",
    PROMPT_LIBRARY: "promptLibrary",
    STICKERS: "stickers",
    APP_SETTINGS: "appSettings",
    SUMMARIES: "summaries",
    IMPORTANT_EVENTS: "importantEvents",
    DIARIES: "diaries",
  },
  db: {
    getAll: vi.fn(async (store: string) => stores[store] ?? []),
    get: vi.fn(async (store: string, key: string) =>
      store === "appSettings" && key === "user-data"
        ? { id: "user-data", updatedAt: 60, name: "me" }
        : undefined,
    ),
  },
}));

vi.mock("@/db/operations", () => ({
  getAllQzonePosts: vi.fn(async () => [{ id: "post-1", timestamp: 70, content: "hi" }]),
  getSetting: vi.fn(async (key: string) =>
    key === "qzone-settings" ? { updatedAt: 80, enabled: true } : undefined,
  ),
  saveQzonePost: vi.fn(),
  saveSetting: vi.fn(),
  deleteQzonePost: vi.fn(),
}));

vi.mock("@/storage/chatStorage", () => ({
  loadAllChats: vi.fn(async () => [
    { id: "chat-1", name: "c1", createdAt: 90, updatedAt: 91 },
    { id: "chat-2", name: "c2", createdAt: 92, updatedAt: 93 },
  ]),
  createChatRecord: vi.fn(),
  deleteChatCascade: vi.fn(),
  loadChatById: vi.fn(),
  loadChatsByCharacter: vi.fn(),
  refreshChatDerivedMetadata: vi.fn(),
  saveChatMetadata: vi.fn(),
}));

vi.mock("@/storage/chatMessageStorage", () => ({
  loadMessages: vi.fn(async (chatId: string) =>
    chatId === "chat-1"
      ? [
          { id: "m-1", createdAt: 100, updatedAt: 101, content: "a" },
          { id: "m-2", createdAt: 102, updatedAt: 103, content: "b" },
        ]
      : [{ id: "m-3", createdAt: 104, updatedAt: 105, content: "c" }],
  ),
  deleteMessage: vi.fn(),
  saveMessages: vi.fn(),
}));

vi.mock("@/storage/settingsStorage", () => ({
  loadSettingsData: vi.fn(async () => ({
    id: "settings",
    updatedAt: 110,
    customQuickActions: [],
  })),
  saveSettingsData: vi.fn(),
}));

vi.mock("@/services/selfHostedSyncState", () => ({
  loadDeletedEntities: vi.fn(async () => [
    {
      entityType: "chat_message",
      entityId: "m-gone",
      updatedAt: 120,
      deletedAt: 121,
      payload: { chatId: "chat-1" },
    },
  ]),
  clearDeletedEntities: vi.fn(),
  clearPendingSelfHostedLocalChanges: vi.fn(),
  withSuppressedSelfHostedAutoSync: vi.fn(async (fn: () => unknown) => fn()),
}));

vi.mock("@/stores/notification", () => ({ useNotificationStore: () => ({}) }));
vi.mock("@/stores/selfHostedSync", () => ({ useSelfHostedSyncStore: () => ({}) }));
vi.mock("@/stores/settings", () => ({ useSettingsStore: () => ({ isLoaded: false }) }));
vi.mock("@/utils/runtimeDiagnostics", () => ({
  recordRuntimeDiagnostic: vi.fn(),
  updateRuntimeSessionStage: vi.fn(),
}));

const { SelfHostedSyncService } = await import("./SelfHostedSyncService");

describe("SelfHostedSyncService manifest refs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  it("只收集 ID 和時間的結果，和完整 envelope 取出來的一樣", async () => {
    const service = new SelfHostedSyncService();
    const envelopes = await service.collectAllEnvelopesForManifest();
    const refs = await service.collectManifestRefs();

    expect(refs).toEqual(
      envelopes.map((env) => ({
        entityType: env.entityType,
        entityId: env.entityId,
        updatedAt: env.updatedAt,
        deletedAt: env.deletedAt,
      })),
    );
    // 每一種類別都有覆蓋到
    expect(new Set(refs.map((ref) => ref.entityType))).toEqual(
      new Set([
        "settings_preferences",
        "settings_full",
        "qzone_settings",
        "qzone_post",
        "character",
        "lorebook",
        "prompt_library_item",
        "sticker_category",
        "user_data",
        "conversation_summary",
        "important_events_log",
        "diary_entry",
        "chat_record",
        "chat_message",
      ]),
    );
  });

  it("只取指定的幾筆完整 envelope", async () => {
    const service = new SelfHostedSyncService();
    const all = await service.collectAllEnvelopesForManifest();
    const wantedKeys = ["character::char-2", "chat_message::m-3", "chat_message::m-gone", "user_data::user-data"];
    const picked = await service.collectEnvelopesForRefs(
      wantedKeys.map((key) => {
        const [entityType, entityId] = key.split("::");
        return { entityType, entityId };
      }),
    );

    const keyOf = (env: { entityType: string; entityId: string }) => `${env.entityType}::${env.entityId}`;
    expect(picked.map(keyOf).sort()).toEqual([...wantedKeys].sort());
    for (const env of picked) {
      expect(env).toEqual(all.find((item) => keyOf(item) === keyOf(env)));
    }
  });

  it("沒有要任何資料就不讀資料庫", async () => {
    const service = new SelfHostedSyncService();
    expect(await service.collectEnvelopesForRefs([])).toEqual([]);
  });
});
