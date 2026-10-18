/// <reference types="vitest/globals" />

/**
 * 備份來回測試：每個登記為 "backup" 的表都寫一筆 → 打包 → 清空 → 還原 → 逐筆比對。
 *
 * 新增資料表時在 backupCoverage.ts 登記；標成 "backup" 就要在 SEEDS 補一筆
 * （漏了型別檢查不過），這裡會實際驗證它真的被打包、也真的還原回來。
 */
import "fake-indexeddb/auto";
import { deleteDB, openDB } from "idb";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { closeDatabase, db, DB_STORES, type AudioBlobRecord } from "@/db/database";
import { appendChatMessages } from "@/db/chatMessageStore";
import { getChatImage, isChatImageRef } from "@/db/operations";
import { loadMessages } from "@/storage/chatMessageStorage";
import {
  buildBackupZipStreaming,
  buildSplitBackup,
  getBackupPartFilename,
  type ClosedBackupPart,
} from "@/services/AutoBackupService";
import {
  STORE_BACKUP_PLAN,
  type BackedUpStoreName,
} from "@/services/backupCoverage";
import { useBackupImport } from "@/components/settings/composables/useBackupImport";
import type { ChatMessage } from "@/types/chat";

vi.mock("@/stores", () => ({
  useCharactersStore: () => ({ loadCharacters: vi.fn() }),
  useLorebooksStore: () => ({ loadLorebooks: vi.fn() }),
  useSettingsStore: () => ({ loadSettings: vi.fn() }),
  useUserStore: () => ({ loadUserData: vi.fn() }),
}));
vi.mock("@/stores/theme", () => ({
  useThemeStore: () => ({ loadFromStorage: vi.fn() }),
}));

// ============================================================
// 測試資料
// ============================================================

class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

function bytes(length: number, seed: number): Uint8Array {
  return Uint8Array.from({ length }, (_, i) => (i * 31 + seed) % 256);
}

function dataUrl(mime: string, length: number, seed: number): string {
  let binary = "";
  for (const b of bytes(length, seed)) binary += String.fromCharCode(b);
  return `data:${mime};base64,${btoa(binary)}`;
}

const AVATAR = dataUrl("image/png", 300, 1);
const GALLERY_IMAGE = dataUrl("image/jpeg", 600, 2);
const GALLERY_THUMB = dataUrl("image/webp", 240, 3);
const CHAT_IMAGE = dataUrl("image/png", 500, 4);
const PEEK_PHOTO = dataUrl("image/png", 320, 5);
const TTS_AUDIO = dataUrl("audio/mpeg", 800, 6);
const RECORDING = bytes(1500, 7);
const RECORDING_MIME = "audio/webm;codecs=opus";

type Seed = {
  /** 打包前寫進資料庫 */
  seed: () => Promise<void>;
  /** 還原後檢查 */
  verify: () => Promise<void>;
};

/** keyPath 表的一筆紀錄：原樣寫入、原樣比對 */
function record(store: string, value: Record<string, unknown>, key: string): Seed {
  return {
    seed: async () => {
      await db.put(store, value);
    },
    verify: async () => {
      expect(await db.get(store, key)).toEqual(value);
    },
  };
}

/** 沒有 keyPath 的 key-value 表 */
function keyValue(store: string, key: string, value: unknown): Seed {
  return {
    seed: async () => {
      await db.put(store, value, key);
    },
    verify: async () => {
      expect(await db.get(store, key)).toEqual(value);
    },
  };
}

const NOTE_BOARD = {
  id: "note-board",
  posts: [{ id: "p1", text: "今天好累", mood: "sad", createdAt: 1 }],
  notes: [],
  verbalReplies: [],
  seenAt: 0,
};
const COMPANION_CHAT = { id: "companion-chat-b-1", bookId: "b-1", characterId: "char-1", messages: [] };

const MESSAGES: ChatMessage[] = [
  {
    id: "m1",
    sender: "user",
    name: "User",
    is_user: true,
    status: "sent",
    content: "看這張",
    imageUrl: "chatimg_seed",
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: "m2",
    sender: "user",
    name: "User",
    is_user: true,
    status: "sent",
    content: "",
    messageType: "audio",
    audioBlobId: "audioblob_1",
    audioMimeType: RECORDING_MIME,
    createdAt: 2,
    updatedAt: 2,
  } as ChatMessage,
];

const SEEDS: Record<BackedUpStoreName, Seed> = {
  themes: record(DB_STORES.THEMES, { id: "t-1", name: "霓虹" }, "t-1"),
  layouts: record(DB_STORES.LAYOUTS, { id: "l-1", widgets: [] }, "l-1"),
  characterAffections: record(
    DB_STORES.CHARACTER_AFFECTIONS,
    { characterId: "char-1", levels: [1, 2] },
    "char-1",
  ),
  settings: keyValue(DB_STORES.SETTINGS, "regex-scripts", { scripts: ["a"] }),
  promptLibrary: keyValue(DB_STORES.PROMPT_LIBRARY, "lib-1", { name: "提示詞" }),
  characters: record(
    DB_STORES.CHARACTERS,
    { id: "char-1", nickname: "小明", avatar: AVATAR, data: { name: "小明" } },
    "char-1",
  ),
  lorebooks: record(DB_STORES.LOREBOOKS, { id: "lb-1", name: "世界", entries: [] }, "lb-1"),
  chats: {
    seed: async () => {
      await db.put(DB_STORES.CHATS, {
        id: "chat-1",
        name: "和小明的聊天",
        characterId: "char-1",
        messages: [],
        createdAt: 1,
        updatedAt: 1,
      });
    },
    verify: async () => {
      const chat = await db.get<{ name: string }>(DB_STORES.CHATS, "chat-1");
      expect(chat?.name).toBe("和小明的聊天");
    },
  },
  chatMessages: {
    seed: () => appendChatMessages("chat-1", MESSAGES),
    verify: async () => {
      const restored = await loadMessages("chat-1");
      expect(restored.map((m) => m.id)).toEqual(["m1", "m2"]);
      // 圖片還原後會重新存成新的 chatimg_ 引用，內容要一樣
      expect(isChatImageRef(restored[0].imageUrl)).toBe(true);
      expect(await getChatImage(restored[0].imageUrl!)).toBe(CHAT_IMAGE);
      expect(restored[1].audioBlobId).toBe("audioblob_1");
    },
  },
  appSettings: {
    seed: async () => {
      await db.put(DB_STORES.APP_SETTINGS, { id: "main-settings", apiProvider: "openai" });
      await db.put(DB_STORES.APP_SETTINGS, { id: "user-data", personas: [], currentPersonaId: null });
      await db.put(DB_STORES.APP_SETTINGS, NOTE_BOARD);
      await db.put(DB_STORES.APP_SETTINGS, COMPANION_CHAT);
    },
    verify: async () => {
      expect(await db.get(DB_STORES.APP_SETTINGS, "main-settings")).toMatchObject({
        apiProvider: "openai",
      });
      expect(await db.get(DB_STORES.APP_SETTINGS, "user-data")).toMatchObject({ personas: [] });
      expect(await db.get(DB_STORES.APP_SETTINGS, "note-board")).toEqual(NOTE_BOARD);
      expect(await db.get(DB_STORES.APP_SETTINGS, "companion-chat-b-1")).toEqual(COMPANION_CHAT);
    },
  },
  stickers: record(DB_STORES.STICKERS, { id: "st-1", name: "貓", stickers: [] }, "st-1"),
  importantEvents: record(DB_STORES.IMPORTANT_EVENTS, { id: "ie-1", chatId: "chat-1" }, "ie-1"),
  summaries: record(DB_STORES.SUMMARIES, { id: "s-1", chatId: "chat-1", content: "總結" }, "s-1"),
  diaries: record(DB_STORES.DIARIES, { id: "d-1", content: "日記" }, "d-1"),
  qzonePosts: record(DB_STORES.QZONE_POSTS, { id: "q-1", content: "貼文", images: [] }, "q-1"),
  imageCache: {
    seed: async () => {
      // 聊天圖片（跟著訊息走）
      await db.put(DB_STORES.IMAGE_CACHE, {
        id: "chatimg_seed",
        data: CHAT_IMAGE,
        thumbnail: "",
        fileName: "chat-image",
        fileSize: CHAT_IMAGE.length,
        mimeType: "image/png",
        createdAt: 1,
        lastUsedAt: 1,
        useCount: 0,
      });
      await SEEDS_EXTRA.gallery.seed();
    },
    verify: () => SEEDS_EXTRA.gallery.verify(),
  },
  pendingCalls: record(DB_STORES.PENDING_CALLS, { id: "call-1", characterId: "char-1" }, "call-1"),
  callHistory: record(DB_STORES.CALL_HISTORY, { id: "ch-1", characterId: "char-1" }, "ch-1"),
  gameStates: keyValue(DB_STORES.GAME_STATES, "chat-1", { score: 42 }),
  holidayRecords: record(DB_STORES.HOLIDAY_RECORDS, { id: "h-1", holiday: "七夕" }, "h-1"),
  calendarEvents: record(DB_STORES.CALENDAR_EVENTS, { id: "e-1", title: "約會" }, "e-1"),
  rendererRules: record(DB_STORES.RENDERER_RULES, { id: "r-1", pattern: "x" }, "r-1"),
  books: record(DB_STORES.BOOKS, { id: "b-1", title: "書", chapters: [] }, "b-1"),
  bookProgress: record(DB_STORES.BOOK_PROGRESS, { bookId: "b-1", chapterIndex: 3 }, "b-1"),
  "audio-blobs": {
    seed: async () => {
      await db.put(DB_STORES.AUDIO_BLOBS, {
        id: "audioblob_1",
        blob: new Blob([RECORDING], { type: RECORDING_MIME }),
        mimeType: RECORDING_MIME,
        createdAt: 5,
      });
    },
    verify: async () => {
      const restored = await db.get<AudioBlobRecord>(DB_STORES.AUDIO_BLOBS, "audioblob_1");
      expect(restored?.mimeType).toBe(RECORDING_MIME);
      expect(restored?.createdAt).toBe(5);
      expect(new Uint8Array(await restored!.blob.arrayBuffer())).toEqual(RECORDING);
    },
  },
  chatAffinityStates: record(DB_STORES.CHAT_AFFINITY_STATES, { chatId: "chat-1", value: 7 }, "chat-1"),
  vectorEmbeddings: {
    seed: async () => {
      await db.put(DB_STORES.VECTOR_EMBEDDINGS, {
        id: "vec-1",
        chatId: "chat-1",
        vector: new Float32Array([0.5, 0.25]),
      });
    },
    verify: async () => {
      const restored = await db.get<{ vector: Float32Array }>(DB_STORES.VECTOR_EMBEDDINGS, "vec-1");
      expect(restored?.vector).toEqual(new Float32Array([0.5, 0.25]));
    },
  },
  peekPhoneData: record(
    DB_STORES.PEEK_PHONE_DATA,
    {
      id: "char-1_chat-1",
      characterId: "char-1",
      chatId: "chat-1",
      data: { gallery: [{ id: "g1", imageUrl: PEEK_PHOTO }], balance: 100 },
      updatedAt: 1,
    },
    "char-1_chat-1",
  ),
  announcementAcks: record(DB_STORES.ANNOUNCEMENT_ACKS, { id: "ann-1", ackedAt: 1 }, "ann-1"),
  favoriteAudios: {
    seed: async () => {
      await SEEDS_EXTRA.favUser.seed();
      await SEEDS_EXTRA.favTts.seed();
    },
    verify: async () => {
      await SEEDS_EXTRA.favUser.verify();
      await SEEDS_EXTRA.favTts.verify();
    },
  },
  favoriteAudioGroups: record(
    DB_STORES.FAVORITE_AUDIO_GROUPS,
    { id: "grp-1", name: "最愛", audioIds: ["fav-1"], createdAt: 1, updatedAt: 1 },
    "grp-1",
  ),
};

const SEEDS_EXTRA = {
  gallery: record(
    DB_STORES.IMAGE_CACHE,
    {
      id: "img-1",
      data: GALLERY_IMAGE,
      thumbnail: GALLERY_THUMB,
      fileName: "cat.jpg",
      fileSize: 600,
      mimeType: "image/jpeg",
      createdAt: 1,
      lastUsedAt: 1,
      useCount: 2,
    },
    "img-1",
  ),
  favUser: record(
    DB_STORES.FAVORITE_AUDIOS,
    {
      id: "fav-1",
      chatId: "chat-1",
      messageId: "m2",
      characterId: "char-1",
      characterName: "小明",
      characterAvatar: AVATAR,
      audioType: "user",
      audioBlobId: "audioblob_1",
      createdAt: 1,
      playCount: 0,
    },
    "fav-1",
  ),
  favTts: record(
    DB_STORES.FAVORITE_AUDIOS,
    {
      id: "fav-2",
      chatId: "chat-1",
      messageId: "m9",
      characterId: "char-1",
      characterName: "小明",
      audioType: "tts",
      ttsAudioUrl: TTS_AUDIO,
      createdAt: 2,
      playCount: 3,
    },
    "fav-2",
  ),
};

// ============================================================
// 工具
// ============================================================

async function resetDatabases() {
  closeDatabase();
  await deleteDB("aguaphone-db");
  await deleteDB("Aguaphone_V2");
  await db.init();
}

async function importFiles(files: File[]): Promise<string> {
  const alertMock = vi.fn();
  vi.stubGlobal("alert", alertMock);
  vi.stubGlobal("location", { reload: vi.fn() });
  const { handleFileImport } = useBackupImport();
  await handleFileImport({ target: { files, value: "" } } as unknown as Event);
  const calls = alertMock.mock.calls;
  const last = String(calls[calls.length - 1]?.[0] ?? "");
  expect(last).toMatch(/^導入成功/);
  return last;
}

function zipFile(name: string, data: Uint8Array): File {
  return new File([data], name, { type: "application/zip" });
}

// ============================================================
// 測試
// ============================================================

describe("備份來回", () => {
  let storage: MemoryStorage;

  beforeEach(async () => {
    storage = new MemoryStorage();
    vi.stubGlobal("localStorage", storage);
    await resetDatabases();
  });

  afterEach(() => {
    closeDatabase();
    vi.unstubAllGlobals();
  });

  it("每個登記為 backup 的表都有測試資料", () => {
    const backedUp = Object.entries(STORE_BACKUP_PLAN)
      .filter(([, plan]) => plan === "backup")
      .map(([store]) => store)
      .sort();
    expect(Object.keys(SEEDS).sort()).toEqual(backedUp);
    // 每個資料表都要登記（型別也會擋，這裡是執行期再確認一次）
    expect(Object.keys(STORE_BACKUP_PLAN).sort()).toEqual(Object.values(DB_STORES).slice().sort());
  });

  it("打包 → 清空 → 還原後，每個表的資料都回來了", async () => {
    for (const seed of Object.values(SEEDS)) await seed.seed();
    const canvas = await openDB("Aguaphone_V2", 1, {
      upgrade(idb) {
        idb.createObjectStore("canvas_layout", { keyPath: "id" });
      },
    });
    await canvas.put("canvas_layout", { id: "main_layout", widgets: [{ id: "w1" }] });
    canvas.close();
    storage.setItem("aguaphone_global_vars", '{"mood":"好"}');
    storage.setItem("aguaphone_worldinfo_settings", '{"scanDepth":4}');

    const zip = await buildBackupZipStreaming();

    await resetDatabases();
    storage.clear();
    const message = await importFiles([zipFile("aguaphone-backup.zip", zip)]);

    for (const [store, seed] of Object.entries(SEEDS)) {
      try {
        await seed.verify();
      } catch (e) {
        throw new Error(`「${store}」沒有完整還原：${e instanceof Error ? e.message : e}`);
      }
    }
    const canvasAfter = await openDB("Aguaphone_V2", 1);
    expect(await canvasAfter.get("canvas_layout", "main_layout")).toEqual({
      id: "main_layout",
      widgets: [{ id: "w1" }],
    });
    canvasAfter.close();
    expect(storage.getItem("aguaphone_global_vars")).toBe('{"mood":"好"}');
    expect(storage.getItem("aguaphone_worldinfo_settings")).toBe('{"scanDepth":4}');
    expect(message).toContain("錄音: 1");
    expect(message).toContain("語音收藏: 2");
  });

  it("裝置專屬的資料不進備份，還原也不會蓋掉這台的設定", async () => {
    await db.put(DB_STORES.SETTINGS, { kind: "folder-handle" }, "autoBackup-dirHandle");
    await db.put(DB_STORES.SETTINGS, { enabled: true }, "autoBackup-settings");
    await db.put(DB_STORES.APP_SETTINGS, { id: "github-backup-settings", token: "ghp_secret" });
    await db.put(DB_STORES.APP_SETTINGS, { id: "self-hosted-sync-settings", deviceId: "phone" });
    await db.put(DB_STORES.APP_SETTINGS, { id: "book-shelf-index", books: {} });
    await db.put(DB_STORES.AUTH_STATE, { id: "auth", isAuthenticated: true });
    storage.setItem("phone_call_snapshot", "{}");
    storage.setItem("aguaphone:bg_generation:watched_tasks", "[]");
    storage.setItem("ai-indicator-dock", '{"side":"left"}');

    const zip = await buildBackupZipStreaming();
    const backup = JSON.parse(strFromU8(unzipSync(zip)["backup.json"]));
    const settingKeys = backup.oldSettings.map((item: { key: string }) => item.key);
    expect(settingKeys).not.toContain("autoBackup-dirHandle");
    expect(settingKeys).not.toContain("autoBackup-settings");
    const appSettingIds = backup.appSettingsExtra.map((r: { id: string }) => r.id);
    expect(appSettingIds).not.toContain("github-backup-settings");
    expect(appSettingIds).not.toContain("self-hosted-sync-settings");
    expect(appSettingIds).not.toContain("book-shelf-index");
    expect(JSON.stringify(backup)).not.toContain("ghp_secret");
    expect(backup.localStorage).toEqual({});

    // 另一台裝置：有自己的資料夾、自己的 GitHub 設定
    await resetDatabases();
    storage.clear();
    await db.put(DB_STORES.SETTINGS, { kind: "this-device" }, "autoBackup-dirHandle");
    await db.put(DB_STORES.APP_SETTINGS, { id: "github-backup-settings", token: "ghp_device" });
    await importFiles([zipFile("aguaphone-backup.zip", zip)]);

    expect(await db.get(DB_STORES.SETTINGS, "autoBackup-dirHandle")).toEqual({ kind: "this-device" });
    expect(await db.get(DB_STORES.APP_SETTINGS, "github-backup-settings")).toMatchObject({
      token: "ghp_device",
    });
  });

  it("舊備份裡的自動備份資料夾設定不會蓋掉這台的", async () => {
    // 舊版會把 FileSystemDirectoryHandle 序列化成 {} 放進 oldSettings
    const oldBackup = zipSync({
      "backup.json": strToU8(
        JSON.stringify({
          version: 1,
          type: "aguaphone-auto-backup",
          exportedAt: "2026-10-01T00:00:00.000Z",
          oldSettings: [
            { key: "autoBackup-dirHandle", value: {} },
            { key: "autoBackup-settings", value: { enabled: true, intervalMinutes: 5 } },
            { key: "regex-scripts", value: { scripts: ["old"] } },
          ],
        }),
      ),
    });
    await db.put(DB_STORES.SETTINGS, { kind: "this-device" }, "autoBackup-dirHandle");

    await importFiles([zipFile("old-backup.zip", oldBackup)]);

    expect(await db.get(DB_STORES.SETTINGS, "autoBackup-dirHandle")).toEqual({ kind: "this-device" });
    expect(await db.get(DB_STORES.SETTINGS, "autoBackup-settings")).toBeUndefined();
    expect(await db.get(DB_STORES.SETTINGS, "regex-scripts")).toEqual({ scripts: ["old"] });
  });

  it("錄音會跟著分包切開，每包自帶清單與音檔，全部導入後都回來", async () => {
    const recordings = [0, 1, 2].map((i) => ({
      id: `audioblob_${i}`,
      bytes: bytes(2000 + i, 20 + i),
      mimeType: i === 2 ? "audio/mp4" : RECORDING_MIME,
    }));
    for (const r of recordings) {
      await db.put(DB_STORES.AUDIO_BLOBS, {
        id: r.id,
        blob: new Blob([r.bytes], { type: r.mimeType }),
        mimeType: r.mimeType,
        createdAt: 1,
      });
    }

    const parts: Array<ClosedBackupPart & { files: Record<string, Uint8Array> }> = [];
    await buildSplitBackup({
      partBudgetBytes: 1,
      openPart: async () => undefined,
      onPartClosed: async (part) => {
        parts.push({ ...part, files: unzipSync(part.data!) });
      },
    });

    const audioParts = parts.filter((p) => p.files["audio-blobs.json"]);
    expect(audioParts.length).toBeGreaterThan(1);
    for (const p of audioParts) {
      const manifest = JSON.parse(strFromU8(p.files["audio-blobs.json"]));
      for (const entry of manifest.records) {
        expect(p.files[entry.media]).toBeDefined();
      }
    }

    await resetDatabases();
    await importFiles(
      parts.map((p) => zipFile(getBackupPartFilename("aguaphone-backup.zip", p.index), p.data!)),
    );

    for (const r of recordings) {
      const restored = await db.get<AudioBlobRecord>(DB_STORES.AUDIO_BLOBS, r.id);
      expect(restored?.mimeType).toBe(r.mimeType);
      expect(new Uint8Array(await restored!.blob.arrayBuffer())).toEqual(r.bytes);
    }
  });
});
