/**
 * 全域 Regex 腳本 Store
 * 對應 SillyTavern 的 extension_settings.regex（全域腳本）
 * 角色腳本存在 character.data.extensions.regex_scripts，由 CharacterService 管理
 */

import { db } from "@/db/database";
import { migrateRegexScript } from "@/services/RegexEngine";
import type { RegexScript } from "@/types/character";
import { defineStore } from "pinia";
import { ref } from "vue";

const STORAGE_KEY = "global-regex-scripts";

export const useRegexScriptsStore = defineStore("regexScripts", () => {
  const scripts = ref<RegexScript[]>([]);
  const initialized = ref(false);

  async function init(): Promise<void> {
    if (initialized.value) return;
    try {
      await db.init();
      const saved = await db.get<RegexScript[]>("settings", STORAGE_KEY);
      scripts.value = (saved ?? []).map(migrateRegexScript);
      initialized.value = true;
      console.log(
        "[RegexScriptsStore] 初始化完成，腳本數:",
        scripts.value.length,
      );
    } catch (e) {
      console.error("[RegexScriptsStore] 初始化失敗:", e);
    }
  }

  async function persist(): Promise<void> {
    try {
      if (!db.isOpen()) await db.init();
      const plain = JSON.parse(JSON.stringify(scripts.value));
      await db.put("settings", plain, STORAGE_KEY);
      console.log("[RegexScriptsStore] 已持久化，腳本數:", plain.length);
    } catch (e) {
      console.error("[RegexScriptsStore] 儲存失敗:", e);
    }
  }

  async function addScript(input: Omit<RegexScript, "id">): Promise<string> {
    const id = crypto.randomUUID();
    const script: RegexScript = { ...input, id };
    scripts.value.push(script);
    await persist();
    return id;
  }

  async function updateScript(
    id: string,
    updates: Partial<RegexScript>,
  ): Promise<void> {
    const idx = scripts.value.findIndex((s) => s.id === id);
    if (idx === -1) return;
    scripts.value[idx] = { ...scripts.value[idx], ...updates, id };
    await persist();
  }

  async function deleteScript(id: string): Promise<void> {
    const idx = scripts.value.findIndex((s) => s.id === id);
    if (idx === -1) return;
    scripts.value.splice(idx, 1);
    // 強制觸發響應式更新
    scripts.value = [...scripts.value];
    await persist();
  }

  async function toggleScript(id: string): Promise<void> {
    const s = scripts.value.find((s) => s.id === id);
    if (!s) return;
    await updateScript(id, { disabled: !s.disabled });
  }

  /** 導入 ST regex JSON（單一物件或陣列），回傳導入數量 */
  async function importFromJson(json: string): Promise<number> {
    const raw = JSON.parse(json);
    const items: Partial<RegexScript>[] = Array.isArray(raw) ? raw : [raw];
    let count = 0;
    for (const item of items) {
      if (!item.scriptName) continue;
      const migrated = migrateRegexScript(item);
      // 強制新 UUID 避免衝突
      migrated.id = crypto.randomUUID();
      scripts.value.push(migrated);
      count++;
    }
    if (count > 0) await persist();
    return count;
  }

  /** 導出所有腳本為 JSON 字串 */
  function exportToJson(): string {
    return JSON.stringify(JSON.parse(JSON.stringify(scripts.value)), null, 2);
  }

  return {
    scripts,
    initialized,
    init,
    addScript,
    updateScript,
    deleteScript,
    toggleScript,
    importFromJson,
    exportToJson,
  };
});
