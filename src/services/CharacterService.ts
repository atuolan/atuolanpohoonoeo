/**
 * 角色服務
 * 管理角色的 CRUD 操作
 */

import { db, DB_STORES } from "../db/database";
import type { StoredCharacter } from "../types/character";
import { createDefaultStoredCharacter } from "../types/character";

const STORAGE_KEY = "aguaphone_characters";

/**
 * 角色服務類
 */
export class CharacterService {
  /**
   * 獲取所有角色
   */
  async getAll(): Promise<StoredCharacter[]> {
    try {
      // 確保 IndexedDB 已初始化（如果連接斷開會自動重連）
      if (!db.isOpen()) {
        await db.init();
      }
      // 優先使用 IndexedDB
      if (db.isOpen()) {
        return await db.getAll<StoredCharacter>(DB_STORES.CHARACTERS);
      }

      // 備用 localStorage（僅在 IDB 完全無法使用時）
      console.warn("[CharacterService] IndexedDB 不可用，降級使用 localStorage");
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error("[CharacterService] Failed to get all characters:", e);
      return [];
    }
  }

  /**
   * 根據 ID 獲取角色
   */
  async getById(id: string): Promise<StoredCharacter | null> {
    try {
      if (db.isOpen()) {
        return (
          (await db.get<StoredCharacter>(DB_STORES.CHARACTERS, id)) ?? null
        );
      }

      const all = await this.getAll();
      return all.find((c) => c.id === id) ?? null;
    } catch (e) {
      console.error("[CharacterService] Failed to get character:", e);
      return null;
    }
  }

  /**
   * 創建新角色
   */
  async create(data: Partial<StoredCharacter> = {}): Promise<StoredCharacter> {
    const character: StoredCharacter = {
      ...createDefaultStoredCharacter(),
      ...data,
      id: data.id || crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      if (db.isOpen()) {
        // 轉換為純 JavaScript 物件，避免 Vue 響應式物件導致 DataCloneError
        const plainCharacter = JSON.parse(JSON.stringify(character));
        await db.put(DB_STORES.CHARACTERS, plainCharacter);
      } else {
        const all = await this.getAll();
        all.push(character);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
      }

      return character;
    } catch (e) {
      console.error("[CharacterService] Failed to create character:", e);
      throw e;
    }
  }

  /**
   * 更新角色
   */
  async update(
    id: string,
    updates: Partial<StoredCharacter>,
  ): Promise<StoredCharacter | null> {
    try {
      const existing = await this.getById(id);
      if (!existing) return null;

      const updated: StoredCharacter = {
        ...existing,
        ...updates,
        id, // 確保 ID 不變
        updatedAt: Date.now(),
      };

      if (db.isOpen()) {
        // 轉換為純 JavaScript 物件，避免 Vue 響應式物件導致 DataCloneError
        const plainUpdated = JSON.parse(JSON.stringify(updated));
        await db.put(DB_STORES.CHARACTERS, plainUpdated);
      } else {
        const all = await this.getAll();
        const index = all.findIndex((c) => c.id === id);
        if (index !== -1) {
          all[index] = updated;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
        }
      }

      return updated;
    } catch (e) {
      console.error("[CharacterService] Failed to update character:", e);
      throw e;
    }
  }

  /**
   * 刪除角色
   */
  async delete(id: string): Promise<boolean> {
    try {
      if (db.isOpen()) {
        await db.delete(DB_STORES.CHARACTERS, id);
      } else {
        const all = await this.getAll();
        const filtered = all.filter((c) => c.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      }
      return true;
    } catch (e) {
      console.error("[CharacterService] Failed to delete character:", e);
      return false;
    }
  }

  /**
   * 搜索角色
   */
  async search(query: string): Promise<StoredCharacter[]> {
    const all = await this.getAll();
    const lowerQuery = query.toLowerCase();

    return all.filter((c) => {
      const name = c.nickname || c.data.name;
      return (
        name.toLowerCase().includes(lowerQuery) ||
        c.data.description?.toLowerCase().includes(lowerQuery) ||
        c.data.tags?.some((t) => t.toLowerCase().includes(lowerQuery))
      );
    });
  }

  /**
   * 按標籤過濾
   */
  async filterByTags(tags: string[]): Promise<StoredCharacter[]> {
    if (tags.length === 0) return this.getAll();

    const all = await this.getAll();
    return all.filter((c) => tags.some((tag) => c.data.tags?.includes(tag)));
  }

  /**
   * 獲取所有標籤
   */
  async getAllTags(): Promise<string[]> {
    const all = await this.getAll();
    const tags = new Set<string>();

    for (const c of all) {
      for (const tag of c.data.tags || []) {
        tags.add(tag);
      }
    }

    return Array.from(tags).sort();
  }

  /**
   * 複製角色
   */
  async duplicate(id: string): Promise<StoredCharacter | null> {
    const original = await this.getById(id);
    if (!original) return null;

    const copy: StoredCharacter = {
      ...structuredClone(original),
      id: crypto.randomUUID(),
      nickname: `${original.nickname || original.data.name} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return this.create(copy);
  }

  /**
   * 導出為 JSON
   */
  async exportToJSON(id: string): Promise<string | null> {
    const character = await this.getById(id);
    if (!character) return null;

    // 構建 Character Card v2 格式
    const card = {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: character.data,
    };

    return JSON.stringify(card, null, 2);
  }

  /**
   * 批量導入
   */
  async importBatch(characters: StoredCharacter[]): Promise<number> {
    let imported = 0;

    for (const c of characters) {
      try {
        await this.create(c);
        imported++;
      } catch (e) {
        console.error("[CharacterService] Failed to import character:", e);
      }
    }

    return imported;
  }

  /**
   * 綁定世界書到角色
   */
  async bindLorebook(
    characterId: string,
    lorebookId: string,
  ): Promise<boolean> {
    try {
      const character = await this.getById(characterId);
      if (!character) return false;

      if (!character.lorebookIds.includes(lorebookId)) {
        character.lorebookIds.push(lorebookId);
        await this.update(characterId, { lorebookIds: character.lorebookIds });
      }

      return true;
    } catch (e) {
      console.error("[CharacterService] Failed to bind lorebook:", e);
      return false;
    }
  }

  /**
   * 解除綁定世界書
   */
  async unbindLorebook(
    characterId: string,
    lorebookId: string,
  ): Promise<boolean> {
    try {
      const character = await this.getById(characterId);
      if (!character) return false;

      character.lorebookIds = character.lorebookIds.filter(
        (id) => id !== lorebookId,
      );
      await this.update(characterId, { lorebookIds: character.lorebookIds });

      return true;
    } catch (e) {
      console.error("[CharacterService] Failed to unbind lorebook:", e);
      return false;
    }
  }

  /**
   * 統計信息
   */
  async getStats(): Promise<{
    total: number;
    bySource: Record<string, number>;
    recentlyUpdated: number;
  }> {
    const all = await this.getAll();
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const bySource: Record<string, number> = {};
    let recentlyUpdated = 0;

    for (const c of all) {
      bySource[c.source] = (bySource[c.source] || 0) + 1;
      if (c.updatedAt > oneWeekAgo) {
        recentlyUpdated++;
      }
    }

    return {
      total: all.length,
      bySource,
      recentlyUpdated,
    };
  }
}

// 全局單例
let characterService: CharacterService | null = null;

/**
 * 獲取角色服務實例
 */
export function getCharacterService(): CharacterService {
  if (!characterService) {
    characterService = new CharacterService();
  }
  return characterService;
}
