// 表情包管理 Store
import {
  DEFAULT_CATEGORY_ID,
  DEFAULT_CATEGORY_ICON,
  DEFAULT_CATEGORY_NAME,
  UNCATEGORIZED_EMOTION_ID,
  defaultStickers,
} from "@/data/defaultStickers";
import { emojiCategories } from "@/data/emojis";
import { db, DB_STORES } from "@/db/database";
import {
  recordDeletedEntity,
  scheduleSelfHostedAutoSync,
} from "@/services/selfHostedSyncState";
import type { StickerCategory, StickerItem } from "@/types/sticker";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

function normalizeStickerLookupName(name: string): string {
  return name.replace(/\u3000/g, " ").replace(/\s+/g, " ").trim();
}

function isDefaultPackCategory(category: StickerCategory): boolean {
  return (
    category.id === DEFAULT_CATEGORY_ID ||
    category.isDefaultPack === true ||
    category.name === DEFAULT_CATEGORY_NAME
  );
}

function getDefaultStickerEmotion(name: string): string | undefined {
  return defaultStickers.find((sticker) => sticker.name === name)?.emotion;
}

function normalizeStickerEmotion(sticker: StickerItem): string {
  return sticker.emotion || getDefaultStickerEmotion(sticker.name) || UNCATEGORIZED_EMOTION_ID;
}

function stampDefaultPack(category: StickerCategory) {
  category.id = DEFAULT_CATEGORY_ID;
  category.isDefaultPack = true;
  category.icon = DEFAULT_CATEGORY_ICON;
  category.stickers = category.stickers.map((sticker) => ({
    ...sticker,
    emotion: normalizeStickerEmotion(sticker),
  }));
}

export const useStickerStore = defineStore("sticker", () => {
  // 自定義表情分類（從 IndexedDB 載入）
  const customCategories = ref<StickerCategory[]>([]);

  // 是否已初始化
  const initialized = ref(false);

  // 所有分類（我的表情固定在最前面，其後為系統 emoji + 其他自定義表情）
  const allCategories = computed(() => {
    // 將系統 emoji 轉換為統一格式
    const systemCategories = emojiCategories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
      isCustom: false,
      stickers: cat.emojis.map((e) => ({
        id: e.id,
        name: e.name,
        url: "", // 系統 emoji 沒有 URL
        char: e.char,
        keywords: e.keywords,
      })),
    }));

    const defaultPack = customCategories.value.find(isDefaultPackCategory);
    const otherCustomCategories = customCategories.value.filter(
      (category) => category !== defaultPack,
    );

    return [
      ...(defaultPack ? [defaultPack] : []),
      ...systemCategories,
      ...otherCustomCategories,
    ];
  });

  // 初始化：從 IndexedDB 載入自定義表情
  async function init() {
    if (initialized.value) return;

    try {
      await db.init();
      const saved = await db.getAll<StickerCategory>(DB_STORES.STICKERS);

      if (saved && saved.length > 0) {
        customCategories.value = saved;
        // 同步默認分類身份、圖標與舊資料情緒
        await syncDefaultPackMetadata();
        // 去重：合併同名分類，去除同名表情
        await deduplicateCategories();
        // 同步預設表情（補上新加的預設）
        await syncDefaultStickers();
      } else {
        // 創建默認的自定義分類
        await createDefaultCustomCategory();
      }

      initialized.value = true;
    } catch (e) {
      console.error("[StickerStore] 初始化失敗:", e);
    }
  }

  // 同步默認分類的穩定 ID、圖標與情緒欄位
  async function syncDefaultPackMetadata() {
    const defaultCategory = customCategories.value.find(isDefaultPackCategory);
    if (!defaultCategory) return;

    const oldId = defaultCategory.id;
    stampDefaultPack(defaultCategory);

    if (oldId !== DEFAULT_CATEGORY_ID) {
      await db.delete(DB_STORES.STICKERS, oldId);
    }
    await saveCategory(defaultCategory);
  }

  // 同步預設表情：把 defaultStickers 裡有但用戶還沒有的表情補進「我的表情」分類
  async function syncDefaultStickers() {
    const defaultCategory = customCategories.value.find(isDefaultPackCategory);
    if (!defaultCategory) return;

    stampDefaultPack(defaultCategory);

    // 清理失效的「已刪除預設表情」記錄：
    // 若某名稱已不在 defaultStickers 中（開發者移除了該預設），就不必再保留記錄，
    // 避免 removedDefaultStickerNames 無限增長。
    const defaultStickerNames = new Set(defaultStickers.map((s) => s.name));
    let removedListChanged = false;
    if (defaultCategory.removedDefaultStickerNames?.length) {
      const cleaned = defaultCategory.removedDefaultStickerNames.filter((name) =>
        defaultStickerNames.has(name),
      );
      if (cleaned.length !== defaultCategory.removedDefaultStickerNames.length) {
        defaultCategory.removedDefaultStickerNames = cleaned;
        removedListChanged = true;
      }
    }

    const removedNames = new Set(defaultCategory.removedDefaultStickerNames ?? []);
    const existingNames = new Set(defaultCategory.stickers.map((s) => s.name));
    // 只補回「用戶目前沒有」且「未被用戶主動刪除」的預設表情。
    const toAdd = defaultStickers.filter(
      (s) => !existingNames.has(s.name) && !removedNames.has(s.name),
    );

    if (toAdd.length === 0) {
      // 即使沒有新增表情，也可能清理過失效記錄，需要保存。
      if (removedListChanged) {
        await saveCategory(defaultCategory);
      }
      return;
    }

    for (const sticker of toAdd) {
      defaultCategory.stickers.push({
        id: `sticker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        url: sticker.url,
        name: sticker.name,
        keywords: [sticker.name],
        emotion: sticker.emotion,
        isCustom: true,
      });
    }

    await saveCategory(defaultCategory);
    console.log(`[StickerStore] 同步了 ${toAdd.length} 個新預設表情`);
  }

  // 去重：合併同名分類，去除分類內同名表情
  async function deduplicateCategories() {
    const nameMap = new Map<string, StickerCategory>();
    const duplicateIds: string[] = [];

    for (const cat of customCategories.value) {
      const existing = nameMap.get(cat.name);
      if (existing) {
        const target = isDefaultPackCategory(cat) && !isDefaultPackCategory(existing)
          ? cat
          : existing;
        const source = target === existing ? cat : existing;

        if (target !== existing) {
          nameMap.set(cat.name, target);
        }

        // 同名分類：把表情合併到先出現的那個
        for (const sticker of source.stickers) {
          const duplicate = target.stickers.find((s) => s.name === sticker.name);
          if (!duplicate) {
            target.stickers.push(sticker);
          } else if (!duplicate.emotion && sticker.emotion) {
            duplicate.emotion = sticker.emotion;
          }
        }
        duplicateIds.push(source.id);
      } else {
        // 分類內部去重
        const seen = new Set<string>();
        cat.stickers = cat.stickers.filter((s) => {
          if (seen.has(s.name)) return false;
          seen.add(s.name);
          return true;
        });
        if (isDefaultPackCategory(cat)) {
          stampDefaultPack(cat);
        }
        nameMap.set(cat.name, cat);
      }
    }

    if (duplicateIds.length > 0) {
      // 刪除重複分類
      for (const id of duplicateIds) {
        await db.delete(DB_STORES.STICKERS, id);
      }
      customCategories.value = Array.from(nameMap.values()).filter(
        (category, index, categories) =>
          categories.findIndex((item) => item.id === category.id) === index &&
          !duplicateIds.includes(category.id),
      );
      // 保存合併後的分類
      for (const cat of customCategories.value) {
        await saveCategory(cat);
      }
      console.log(
        `[StickerStore] 去重完成，合併了 ${duplicateIds.length} 個重複分類`,
      );
    }
  }

  // 創建默認自定義分類
  async function createDefaultCustomCategory() {
    const defaultEmojis: StickerItem[] = defaultStickers.map(
      (sticker, index) => ({
        id: `sticker-${Date.now()}-${index}`,
        url: sticker.url,
        name: sticker.name,
        keywords: [sticker.name],
        emotion: sticker.emotion,
        isCustom: true,
      }),
    );

    const defaultCategory: StickerCategory = {
      id: DEFAULT_CATEGORY_ID,
      name: DEFAULT_CATEGORY_NAME,
      icon: DEFAULT_CATEGORY_ICON,
      isCustom: true,
      isDefaultPack: true,
      stickers: defaultEmojis,
    };

    customCategories.value.push(defaultCategory);
    await saveCategory(defaultCategory);
  }

  // 保存分類到 IndexedDB
  async function saveCategory(category: StickerCategory) {
    try {
      category.updatedAt = Date.now();
      const plainCategory = JSON.parse(JSON.stringify(category));
      await db.put(DB_STORES.STICKERS, plainCategory);
      scheduleSelfHostedAutoSync();
    } catch (e) {
      console.error("[StickerStore] 保存分類失敗:", e);
    }
  }

  // 添加自定義表情到指定分類
  async function addSticker(
    categoryId: string,
    sticker: Omit<StickerItem, "id" | "isCustom">,
  ) {
    const category = customCategories.value.find((c) => c.id === categoryId);
    if (!category) {
      console.error("[StickerStore] 找不到分類:", categoryId);
      return;
    }

    const newSticker: StickerItem = {
      ...sticker,
      id: `sticker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      isCustom: true,
    };
    
    if (isDefaultPackCategory(category)) {
      newSticker.emotion = sticker.emotion || UNCATEGORIZED_EMOTION_ID;
    } else {
      delete newSticker.emotion; // 非預設表情包不需要 emotion 欄位
    }

    category.stickers.push(newSticker);

    // 若使用者把先前刪除的同名預設表情重新加回來，撤銷刪除記錄，
    // 讓它恢復成正常的預設表情（之後 sync 也不再排除它）。
    if (
      isDefaultPackCategory(category) &&
      category.removedDefaultStickerNames?.includes(newSticker.name)
    ) {
      category.removedDefaultStickerNames =
        category.removedDefaultStickerNames.filter(
          (name) => name !== newSticker.name,
        );
    }

    await saveCategory(category);
  }

  // 刪除自定義表情
  async function removeSticker(categoryId: string, stickerId: string) {
    await removeStickers(categoryId, [stickerId]);
  }

  // 批量刪除自定義表情：一次更新分類並只寫入一次 IDB，避免逐筆保存時
  // 中途重新載入或同步取得尚未完成的分類快照。
  async function removeStickers(categoryId: string, stickerIds: string[]) {
    const category = customCategories.value.find((c) => c.id === categoryId);
    if (!category || stickerIds.length === 0) return;

    const idsToRemove = new Set(stickerIds);

    // 若刪除的是「預設表情包」分類中的預設表情，記錄所有名稱，
    // 避免重啟後 syncDefaultStickers 又把它補回來。
    if (isDefaultPackCategory(category)) {
      const removed = new Set(category.removedDefaultStickerNames ?? []);
      const defaultNames = new Set(defaultStickers.map((sticker) => sticker.name));
      for (const sticker of category.stickers) {
        if (idsToRemove.has(sticker.id) && defaultNames.has(sticker.name)) {
          removed.add(sticker.name);
        }
      }
      category.removedDefaultStickerNames = Array.from(removed);
    }

    category.stickers = category.stickers.filter((s) => !idsToRemove.has(s.id));
    await saveCategory(category);
  }

  // 將「我的表情」恢復成程式內建的預設內容；保留其他自建分類。
  async function restoreDefaultStickerPack() {
    const defaultEmojis: StickerItem[] = defaultStickers.map(
      (sticker, index) => ({
        id: `sticker-${Date.now()}-${index}`,
        url: sticker.url,
        name: sticker.name,
        keywords: [sticker.name],
        emotion: sticker.emotion,
        isCustom: true,
      }),
    );

    const existing = customCategories.value.find(isDefaultPackCategory);
    if (existing) {
      existing.id = DEFAULT_CATEGORY_ID;
      existing.name = DEFAULT_CATEGORY_NAME;
      existing.icon = DEFAULT_CATEGORY_ICON;
      existing.isCustom = true;
      existing.isDefaultPack = true;
      existing.stickers = defaultEmojis;
      // 清除使用者曾刪除預設表情的排除清單，讓完整預設包恢復。
      existing.removedDefaultStickerNames = [];
      await saveCategory(existing);
    } else {
      const defaultCategory: StickerCategory = {
        id: DEFAULT_CATEGORY_ID,
        name: DEFAULT_CATEGORY_NAME,
        icon: DEFAULT_CATEGORY_ICON,
        isCustom: true,
        isDefaultPack: true,
        stickers: defaultEmojis,
        removedDefaultStickerNames: [],
      };
      customCategories.value.unshift(defaultCategory);
      await saveCategory(defaultCategory);
    }
  }

  // 更新表情名稱
  async function updateStickerName(
    categoryId: string,
    stickerId: string,
    newName: string,
  ) {
    const category = customCategories.value.find((c) => c.id === categoryId);
    if (!category) return;

    const sticker = category.stickers.find((s) => s.id === stickerId);
    if (sticker) {
      sticker.name = newName;
      await saveCategory(category);
    }
  }

  async function toggleStickerPinned(stickerId: string) {
    const category = customCategories.value.find((c) =>
      c.stickers.some((s) => s.id === stickerId),
    );
    if (!category) return;

    const sticker = category.stickers.find((s) => s.id === stickerId);
    if (!sticker) return;

    if (sticker.pinnedAt) {
      delete sticker.pinnedAt;
    } else {
      sticker.pinnedAt = Date.now();
    }

    await saveCategory(category);
  }

  async function moveStickerEmotion(stickerId: string, newEmotion: string) {
    const category = customCategories.value.find(
      (c) => isDefaultPackCategory(c) && c.stickers.some((s) => s.id === stickerId),
    );
    if (!category) return;

    const sticker = category.stickers.find((s) => s.id === stickerId);
    if (!sticker) return;

    sticker.emotion = newEmotion || UNCATEGORIZED_EMOTION_ID;
    await saveCategory(category);
  }

  // 創建新的自定義分類
  async function createCategory(
    name: string,
    icon: string = "mdi:folder-outline",
  ) {
    const newCategory: StickerCategory = {
      id: `custom-${Date.now()}`,
      name,
      icon,
      isCustom: true,
      stickers: [],
    };

    customCategories.value.push(newCategory);
    await saveCategory(newCategory);
    return newCategory.id;
  }

  // 刪除自定義分類
  async function removeCategory(categoryId: string) {
    const index = customCategories.value.findIndex((c) => c.id === categoryId);
    if (index === -1) return;

    customCategories.value.splice(index, 1);
    await db.delete(DB_STORES.STICKERS, categoryId);
    const deletedAt = Date.now();
    await recordDeletedEntity({
      entityType: "sticker_category",
      entityId: categoryId,
      updatedAt: deletedAt,
      deletedAt,
      payload: null,
    });
    scheduleSelfHostedAutoSync();
  }

  // 重命名分類
  async function renameCategory(categoryId: string, newName: string) {
    const category = customCategories.value.find((c) => c.id === categoryId);
    if (category) {
      category.name = newName;
      await saveCategory(category);
    }
  }

  // 根據名稱查找表情（用於渲染 [sticker:名稱] 格式）
  function findStickerByName(name: string): StickerItem | undefined {
    const normalizedTarget = normalizeStickerLookupName(name);
    if (!normalizedTarget) return undefined;
    // 搜索所有分類（包含系統 emoji 和自定義表情）
    for (const category of allCategories.value) {
      const sticker = category.stickers.find(
        (s) => normalizeStickerLookupName(s.name) === normalizedTarget,
      );
      if (sticker) return sticker;
    }
    const nearbyCandidates = allCategories.value
      .flatMap((category) => category.stickers.map((sticker) => sticker.name))
      .filter((stickerName) => {
        const normalizedName = normalizeStickerLookupName(stickerName);
        return (
          normalizedName.includes(normalizedTarget) ||
          normalizedTarget.includes(normalizedName)
        );
      })
      .slice(0, 10);
    console.warn("[StickerStore] 找不到表情包名稱對應資源", {
      rawName: name,
      normalizedTarget,
      nearbyCandidates,
      categoryCount: allCategories.value.length,
    });
    return undefined;
  }

  // 搜索表情
  function searchStickers(query: string): StickerItem[] {
    if (!query.trim()) return [];

    const lowerQuery = query.toLowerCase();
    const results: StickerItem[] = [];

    for (const category of allCategories.value) {
      for (const sticker of category.stickers) {
        const matchName = sticker.name.toLowerCase().includes(lowerQuery);
        const matchKeywords = sticker.keywords?.some((kw) =>
          kw.toLowerCase().includes(lowerQuery),
        );

        if (matchName || matchKeywords) {
          results.push(sticker);
        }
      }
    }

    return results;
  }

  // 重置為默認表情包（清除所有自定義表情，重新載入預設）
  async function resetToDefault() {
    try {
      // 清除所有自定義分類
      const deletedAt = Date.now();
      for (const category of customCategories.value) {
        await db.delete(DB_STORES.STICKERS, category.id);
        await recordDeletedEntity({
          entityType: "sticker_category",
          entityId: category.id,
          updatedAt: deletedAt,
          deletedAt,
          payload: null,
        });
      }
      customCategories.value = [];

      // 重新創建默認分類
      await createDefaultCustomCategory();

      scheduleSelfHostedAutoSync();

      console.log("[StickerStore] 已重置為默認表情包");
    } catch (e) {
      console.error("[StickerStore] 重置失敗:", e);
    }
  }

  return {
    customCategories,
    allCategories,
    initialized,
    init,
    addSticker,
    removeSticker,
    removeStickers,
    restoreDefaultStickerPack,
    updateStickerName,
    toggleStickerPinned,
    moveStickerEmotion,
    createCategory,
    removeCategory,
    renameCategory,
    findStickerByName,
    searchStickers,
    resetToDefault,
  };
});
