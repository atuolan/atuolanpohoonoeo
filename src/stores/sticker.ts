// 表情包管理 Store
import {
  DEFAULT_CATEGORY_ICON,
  DEFAULT_CATEGORY_NAME,
  defaultStickers,
} from "@/data/defaultStickers";
import { emojiCategories } from "@/data/emojis";
import { db, DB_STORES } from "@/db/database";
import type { StickerCategory, StickerItem } from "@/types/sticker";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

export const useStickerStore = defineStore("sticker", () => {
  // 自定義表情分類（從 IndexedDB 載入）
  const customCategories = ref<StickerCategory[]>([]);

  // 是否已初始化
  const initialized = ref(false);

  // 所有分類（系統 emoji + 自定義表情）
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

    return [...systemCategories, ...customCategories.value];
  });

  // 初始化：從 IndexedDB 載入自定義表情
  async function init() {
    if (initialized.value) return;

    try {
      await db.init();
      const saved = await db.getAll<StickerCategory>(DB_STORES.STICKERS);

      if (saved && saved.length > 0) {
        customCategories.value = saved;
        // 同步默認分類圖標
        syncDefaultCategoryIcon();
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

  // 同步默認分類的圖標
  function syncDefaultCategoryIcon() {
    const defaultCategory = customCategories.value.find(
      (c) => c.name === DEFAULT_CATEGORY_NAME,
    );
    if (defaultCategory && defaultCategory.icon !== DEFAULT_CATEGORY_ICON) {
      defaultCategory.icon = DEFAULT_CATEGORY_ICON;
      saveCategory(defaultCategory);
    }
  }

  // 同步預設表情：把 defaultStickers 裡有但用戶還沒有的表情補進「我的表情」分類
  async function syncDefaultStickers() {
    const defaultCategory = customCategories.value.find(
      (c) => c.name === DEFAULT_CATEGORY_NAME,
    );
    if (!defaultCategory) return;

    const existingNames = new Set(defaultCategory.stickers.map((s) => s.name));
    const toAdd = defaultStickers.filter((s) => !existingNames.has(s.name));

    if (toAdd.length === 0) return;

    for (const sticker of toAdd) {
      defaultCategory.stickers.push({
        id: `sticker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        url: sticker.url,
        name: sticker.name,
        keywords: [sticker.name],
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
        // 同名分類：把表情合併到先出現的那個
        for (const sticker of cat.stickers) {
          if (!existing.stickers.some((s) => s.name === sticker.name)) {
            existing.stickers.push(sticker);
          }
        }
        duplicateIds.push(cat.id);
      } else {
        // 分類內部去重
        const seen = new Set<string>();
        cat.stickers = cat.stickers.filter((s) => {
          if (seen.has(s.name)) return false;
          seen.add(s.name);
          return true;
        });
        nameMap.set(cat.name, cat);
      }
    }

    if (duplicateIds.length > 0) {
      // 刪除重複分類
      for (const id of duplicateIds) {
        await db.delete(DB_STORES.STICKERS, id);
      }
      customCategories.value = customCategories.value.filter(
        (c) => !duplicateIds.includes(c.id),
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
        isCustom: true,
      }),
    );

    const defaultCategory: StickerCategory = {
      id: `custom-${Date.now()}`,
      name: DEFAULT_CATEGORY_NAME,
      icon: DEFAULT_CATEGORY_ICON,
      isCustom: true,
      stickers: defaultEmojis,
    };

    customCategories.value.push(defaultCategory);
    await saveCategory(defaultCategory);
  }

  // 保存分類到 IndexedDB
  async function saveCategory(category: StickerCategory) {
    try {
      const plainCategory = JSON.parse(JSON.stringify(category));
      await db.put(DB_STORES.STICKERS, plainCategory);
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

    category.stickers.push(newSticker);
    await saveCategory(category);
  }

  // 刪除自定義表情
  async function removeSticker(categoryId: string, stickerId: string) {
    const category = customCategories.value.find((c) => c.id === categoryId);
    if (!category) return;

    category.stickers = category.stickers.filter((s) => s.id !== stickerId);
    await saveCategory(category);
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
    // 搜索所有分類（包含系統 emoji 和自定義表情）
    for (const category of allCategories.value) {
      const sticker = category.stickers.find((s) => s.name === name);
      if (sticker) return sticker;
    }
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
      for (const category of customCategories.value) {
        await db.delete(DB_STORES.STICKERS, category.id);
      }
      customCategories.value = [];

      // 重新創建默認分類
      await createDefaultCustomCategory();

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
    updateStickerName,
    createCategory,
    removeCategory,
    renameCategory,
    findStickerByName,
    searchStickers,
    resetToDefault,
  };
});
