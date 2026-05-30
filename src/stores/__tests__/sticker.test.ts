import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStickerStore } from "../sticker";
import { DEFAULT_CATEGORY_ID, UNCATEGORIZED_EMOTION_ID, defaultStickers } from "@/data/defaultStickers";
import { db, DB_STORES } from "@/db/database";
import type { StickerCategory } from "@/types/sticker";

// 模擬 IndexDB
vi.mock("@/db/database", () => ({
  DB_STORES: {
    STICKERS: "stickers",
  },
  db: {
    init: vi.fn(),
    getAll: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// 模擬 auto sync
vi.mock("@/services/selfHostedSyncState", () => ({
  scheduleSelfHostedAutoSync: vi.fn(),
  recordDeletedEntity: vi.fn(),
}));

describe("Sticker Store", () => {
  let store: ReturnType<typeof useStickerStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useStickerStore();
    vi.clearAllMocks();
  });

  describe("Initialization & Seeding", () => {
    it("should seed default pack when no categories exist", async () => {
      vi.mocked(db.getAll).mockResolvedValueOnce([]);

      await store.init();

      expect(db.put).toHaveBeenCalled();
      const defaultPack = store.customCategories.find(c => c.id === DEFAULT_CATEGORY_ID);
      expect(defaultPack).toBeDefined();
      expect(defaultPack?.isDefaultPack).toBe(true);
      
      // Check emotions are mapped
      const firstSticker = defaultPack?.stickers[0];
      const originalDefault = defaultStickers.find(s => s.name === firstSticker?.name);
      expect(firstSticker?.emotion).toBe(originalDefault?.emotion);
    });

    it("should upgrade old name-based default pack to id-based with emotions", async () => {
      const oldCategory: StickerCategory = {
        id: "custom-123",
        name: "我的表情",
        icon: "mdi:folder",
        stickers: [
          { id: "s1", name: "貓貓愛你", url: "url1" }, // from defaultStickers
          { id: "s2", name: "unknown-sticker", url: "url2" } // custom
        ]
      };
      
      vi.mocked(db.getAll).mockResolvedValueOnce([oldCategory]);

      await store.init();

      const defaultPack = store.customCategories.find(c => c.id === DEFAULT_CATEGORY_ID);
      expect(defaultPack).toBeDefined();
      expect(defaultPack?.isDefaultPack).toBe(true);
      
      // Known sticker got emotion mapped
      const known = defaultPack?.stickers.find(s => s.id === "s1");
      expect(known?.emotion).toBe("love"); // based on defaultStickers
      
      // Unknown sticker got uncategorized
      const unknown = defaultPack?.stickers.find(s => s.id === "s2");
      expect(unknown?.emotion).toBe(UNCATEGORIZED_EMOTION_ID);
      
      // Old ID should be deleted
      expect(db.delete).toHaveBeenCalledWith(DB_STORES.STICKERS, "custom-123");
    });
  });

  describe("Ordering", () => {
    it("should put default pack first in allCategories", async () => {
      vi.mocked(db.getAll).mockResolvedValueOnce([
        { id: "cat1", name: "Other", icon: "x", stickers: [] },
        { id: "cat2", name: "Also Other", icon: "x", stickers: [] },
        { id: DEFAULT_CATEGORY_ID, name: "我的表情", icon: "x", isDefaultPack: true, stickers: [] },
      ]);

      await store.init();

      // first item should be default pack, followed by system emojis (smileys etc), then cat1, cat2
      const first = store.allCategories[0];
      expect(first.id).toBe(DEFAULT_CATEGORY_ID);
      
      const last = store.allCategories[store.allCategories.length - 1];
      expect(last.id).toBe("cat2");
    });
  });

  describe("Emotion Management", () => {
    it("should allow moving sticker emotion", async () => {
      const category: StickerCategory = {
        id: DEFAULT_CATEGORY_ID,
        name: "我的表情",
        icon: "mdi:folder",
        isDefaultPack: true,
        stickers: [
          { id: "s1", name: "Sticker 1", url: "url1", emotion: "happy" }
        ]
      };
      
      vi.mocked(db.getAll).mockResolvedValueOnce([category]);
      await store.init();

      await store.moveStickerEmotion("s1", "sad");

      const updated = store.customCategories[0].stickers[0];
      expect(updated.emotion).toBe("sad");
      expect(db.put).toHaveBeenCalled();
    });

    it("should assign emotion when adding to default pack", async () => {
      const category: StickerCategory = {
        id: DEFAULT_CATEGORY_ID,
        name: "我的表情",
        icon: "mdi:folder",
        isDefaultPack: true,
        stickers: []
      };
      
      vi.mocked(db.getAll).mockResolvedValueOnce([category]);
      await store.init();
      // the init call seeds default stickers. We need to add the new sticker AFTER we clear what was seeded.
      store.customCategories[0].stickers = [];

      await store.addSticker(DEFAULT_CATEGORY_ID, {
        name: "New",
        url: "url",
        emotion: "angry"
      });

      const added = store.customCategories[0].stickers[0];
      expect(added.emotion).toBe("angry");
    });
  });
});
