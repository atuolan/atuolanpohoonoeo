import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { db, DB_STORES } from "@/db/database";
import type { PromptDefinition } from "@/types/promptManager";

/**
 * 使用者自訂提示詞庫
 * - 與 PromptManagerConfig 分離保存，避免被 reset-all 覆蓋
 * - 以 identifier 當 key，可覆蓋更新
 */
export const usePromptLibraryStore = defineStore("promptLibrary", () => {
  const isLoading = ref(false);
  const items = ref<Record<string, PromptDefinition>>({});

  const list = computed(() =>
    Object.values(items.value).sort((a, b) => a.name.localeCompare(b.name)),
  );

  async function load(): Promise<void> {
    isLoading.value = true;
    try {
      await db.init();
      const all = await db.getAll<PromptDefinition>(DB_STORES.PROMPT_LIBRARY);
      const map: Record<string, PromptDefinition> = {};
      for (const item of all) {
        map[item.identifier] = item;
      }
      items.value = map;
    } catch (e) {
      console.error("[PromptLibraryStore] Failed to load:", e);
      items.value = {};
    } finally {
      isLoading.value = false;
    }
  }

  async function upsert(def: PromptDefinition): Promise<void> {
    try {
      await db.init();
      const plain = JSON.parse(JSON.stringify(def)) as PromptDefinition;
      await db.put(DB_STORES.PROMPT_LIBRARY, plain, plain.identifier);
      items.value[plain.identifier] = plain;
    } catch (e) {
      console.error("[PromptLibraryStore] Failed to upsert:", e);
    }
  }

  async function remove(identifier: string): Promise<void> {
    try {
      await db.init();
      await db.delete(DB_STORES.PROMPT_LIBRARY, identifier);
      const next = { ...items.value };
      delete next[identifier];
      items.value = next;
    } catch (e) {
      console.error("[PromptLibraryStore] Failed to remove:", e);
    }
  }

  async function clear(): Promise<void> {
    try {
      await db.init();
      await db.clear(DB_STORES.PROMPT_LIBRARY);
      items.value = {};
    } catch (e) {
      console.error("[PromptLibraryStore] Failed to clear:", e);
    }
  }

  function get(identifier: string): PromptDefinition | undefined {
    return items.value[identifier];
  }

  return {
    isLoading,
    items,
    list,
    load,
    upsert,
    remove,
    clear,
    get,
  };
});
