/**
 * 數據遷移服務
 * 用於自動檢測和修復數據完整性問題
 */

import { db, DB_STORES } from '@/db/database';
import type { Chat } from '@/types/chat';
import type { StoredCharacter } from '@/types/character';

const MIGRATION_VERSION_KEY = 'data_migration_version';
const CURRENT_VERSION = 1;

/**
 * 數據遷移服務
 */
export class DataMigrationService {
  /**
   * 執行所有必要的遷移
   */
  async runMigrations(): Promise<void> {
    try {
      await db.init();

      const currentVersion = await this.getCurrentVersion();
      console.log(`[DataMigration] 當前版本: ${currentVersion}`);

      if (currentVersion < 1) {
        await this.migration_v1_fixCharacterIds();
        await this.setCurrentVersion(1);
      }

      // 未來的遷移可以在這裡添加
      // if (currentVersion < 2) {
      //   await this.migration_v2_xxx();
      //   await this.setCurrentVersion(2);
      // }

      console.log(`[DataMigration] 遷移完成，當前版本: ${CURRENT_VERSION}`);
    } catch (error) {
      console.error('[DataMigration] 遷移失敗:', error);
      // 不拋出錯誤，避免阻止應用啟動
    }
  }

  /**
   * 獲取當前遷移版本
   */
  private async getCurrentVersion(): Promise<number> {
    try {
      const version = await db.get<number>(DB_STORES.SETTINGS, MIGRATION_VERSION_KEY);
      return version ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * 設置當前遷移版本
   */
  private async setCurrentVersion(version: number): Promise<void> {
    await db.put(DB_STORES.SETTINGS, version, MIGRATION_VERSION_KEY);
  }

  /**
   * 遷移 v1: 修復 characterId 使用名稱而非 UUID 的問題
   */
  private async migration_v1_fixCharacterIds(): Promise<void> {
    console.log('[DataMigration] 執行遷移 v1: 修復 characterId');

    try {
      const characters = await db.getAll<StoredCharacter>(DB_STORES.CHARACTERS);
      const chats = await db.getAll<Chat>(DB_STORES.CHATS);

      // UUID 格式：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      // 舊版 ID 格式：character_數字時間戳
      const legacyIdRegex = /^character_\d+$/;

      // 建立角色ID集合（包含所有有效的ID）
      const validCharacterIds = new Set(characters.map((c) => c.id));

      // 找出問題聊天：characterId 既不是 UUID，也不是舊版ID格式，且找不到對應角色
      const problematicChats = chats.filter((c) => {
        if (c.isGroupChat || !c.characterId) return false;
        
        // 如果是有效的UUID或舊版ID格式，且能找到對應角色，就不是問題
        if (uuidRegex.test(c.characterId) || legacyIdRegex.test(c.characterId)) {
          return !validCharacterIds.has(c.characterId);
        }
        
        // 其他情況（可能是角色名稱）都視為問題
        return true;
      });

      if (problematicChats.length === 0) {
        console.log('[DataMigration] v1: 沒有需要修復的數據');
        return;
      }

      console.log(`[DataMigration] v1: 發現 ${problematicChats.length} 個問題聊天`);

      let fixedCount = 0;
      let failedCount = 0;
      let skippedCount = 0;

      // 建立名稱到角色的映射，檢測同名角色
      const nameToCharsMap = new Map<string, StoredCharacter[]>();
      characters.forEach((char) => {
        const name = char.data?.name || char.nickname;
        if (name) {
          if (!nameToCharsMap.has(name)) {
            nameToCharsMap.set(name, []);
          }
          nameToCharsMap.get(name)!.push(char);
        }
      });

      for (const chat of problematicChats) {
        const oldCharacterId = chat.characterId;

        // 嘗試通過名稱匹配角色
        const matchedChars = characters.filter(
          (c) => c.data?.name === oldCharacterId || c.nickname === oldCharacterId
        );

        if (matchedChars.length === 1) {
          // 只有一個匹配，安全修復
          const matchedChar = matchedChars[0];
          chat.characterId = matchedChar.id;
          chat.updatedAt = Date.now();

          // 保存到數據庫
          await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)));

          console.log(
            `[DataMigration] v1: 修復聊天 "${chat.name}": "${oldCharacterId}" → "${matchedChar.id}"`
          );
          fixedCount++;
        } else if (matchedChars.length > 1) {
          // 多個同名角色，無法自動判斷，跳過
          console.warn(
            `[DataMigration] v1: 跳過聊天 "${chat.name}": 找到 ${matchedChars.length} 個名為 "${oldCharacterId}" 的角色，無法自動判斷`
          );
          console.warn(
            `[DataMigration] v1: 同名角色 IDs: ${matchedChars.map(c => c.id).join(', ')}`
          );
          skippedCount++;
        } else {
          // 找不到匹配
          console.warn(
            `[DataMigration] v1: 無法修復聊天 "${chat.name}": 找不到名為 "${oldCharacterId}" 的角色`
          );
          failedCount++;
        }
      }

      console.log(
        `[DataMigration] v1: 修復完成 - 成功: ${fixedCount}, 跳過(同名): ${skippedCount}, 失敗: ${failedCount}`
      );

      // 如果有跳過的聊天，給出提示
      if (skippedCount > 0) {
        console.warn(
          `[DataMigration] v1: 有 ${skippedCount} 個聊天因同名角色問題無法自動修復，需要手動處理`
        );
        console.warn(
          '[DataMigration] v1: 請在控制台執行以下代碼查看詳情：'
        );
        console.warn(
          'const { checkCharacterIdIntegrity } = await import("./src/utils/characterIdFixer.ts"); await checkCharacterIdIntegrity();'
        );
      }
    } catch (error) {
      console.error('[DataMigration] v1: 修復失敗:', error);
      throw error;
    }
  }
}

// 全局單例
let migrationService: DataMigrationService | null = null;

/**
 * 獲取數據遷移服務實例
 */
export function getDataMigrationService(): DataMigrationService {
  if (!migrationService) {
    migrationService = new DataMigrationService();
  }
  return migrationService;
}
