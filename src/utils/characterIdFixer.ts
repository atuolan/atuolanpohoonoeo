/**
 * 角色ID修復工具
 * 用於修復聊天記錄中使用角色名稱而非唯一ID的問題
 */

import { db, DB_STORES } from '@/db/database';
import type { Chat } from '@/types/chat';
import type { StoredCharacter } from '@/types/character';

export interface FixResult {
  totalChats: number;
  totalCharacters: number;
  problematicChats: number;
  orphanedChats: number;
  duplicateNames: Array<{ name: string; count: number }>;
  fixedCount?: number;
  failedCount?: number;
  details: string[];
}

/**
 * 檢查數據完整性
 */
export async function checkCharacterIdIntegrity(): Promise<FixResult> {
  await db.init();

  const characters = await db.getAll<StoredCharacter>(DB_STORES.CHARACTERS);
  const chats = await db.getAll<Chat>(DB_STORES.CHATS);

  // UUID 格式：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // 舊版 ID 格式：character_數字時間戳
  const legacyIdRegex = /^character_\d+$/;

  // 建立角色ID集合
  const validCharacterIds = new Set(characters.map((c) => c.id));

  // 檢查問題聊天：characterId 既不是有效格式，也找不到對應角色
  const problematicChats = chats.filter((c) => {
    if (c.isGroupChat || !c.characterId) return false;
    
    // 如果是有效的UUID或舊版ID格式，且能找到對應角色，就不是問題
    if (uuidRegex.test(c.characterId) || legacyIdRegex.test(c.characterId)) {
      return !validCharacterIds.has(c.characterId);
    }
    
    // 其他情況（可能是角色名稱）都視為問題
    return true;
  });

  // 檢查孤立聊天（characterId 格式正確但找不到對應角色）
  const orphanedChats = chats.filter(
    (c) =>
      !c.isGroupChat &&
      c.characterId &&
      (uuidRegex.test(c.characterId) || legacyIdRegex.test(c.characterId)) &&
      !validCharacterIds.has(c.characterId)
  );

  // 檢查同名角色
  const nameCount: Record<string, number> = {};
  characters.forEach((c) => {
    const name = c.data?.name || c.nickname || '未命名';
    nameCount[name] = (nameCount[name] || 0) + 1;
  });
  const duplicateNames = Object.entries(nameCount)
    .filter(([_, count]) => count > 1)
    .map(([name, count]) => ({ name, count }));

  const details: string[] = [];
  details.push(`總角色數: ${characters.length}`);
  details.push(`總聊天數: ${chats.length}`);
  details.push(`問題聊天（characterId不是UUID）: ${problematicChats.length}`);
  details.push(`孤立聊天（找不到對應角色）: ${orphanedChats.length}`);
  details.push(`同名角色組: ${duplicateNames.length}`);

  if (duplicateNames.length > 0) {
    details.push('');
    details.push('同名角色詳情:');
    duplicateNames.forEach(({ name, count }) => {
      details.push(`  - "${name}" 有 ${count} 個角色`);
    });
  }

  if (problematicChats.length > 0) {
    details.push('');
    details.push('問題聊天詳情:');
    problematicChats.slice(0, 10).forEach((chat) => {
      details.push(`  - "${chat.name}" (characterId: "${chat.characterId}")`);
    });
    if (problematicChats.length > 10) {
      details.push(`  ... 還有 ${problematicChats.length - 10} 個`);
    }
  }

  return {
    totalChats: chats.length,
    totalCharacters: characters.length,
    problematicChats: problematicChats.length,
    orphanedChats: orphanedChats.length,
    duplicateNames,
    details,
  };
}

/**
 * 修復角色ID問題
 */
export async function fixCharacterIds(): Promise<FixResult> {
  await db.init();

  const characters = await db.getAll<StoredCharacter>(DB_STORES.CHARACTERS);
  const chats = await db.getAll<Chat>(DB_STORES.CHATS);

  // UUID 格式：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // 舊版 ID 格式：character_數字時間戳
  const legacyIdRegex = /^character_\d+$/;

  // 建立角色ID集合
  const validCharacterIds = new Set(characters.map((c) => c.id));

  // 找出問題聊天
  const problematicChats = chats.filter((c) => {
    if (c.isGroupChat || !c.characterId) return false;
    
    if (uuidRegex.test(c.characterId) || legacyIdRegex.test(c.characterId)) {
      return !validCharacterIds.has(c.characterId);
    }
    
    return true;
  });

  let fixedCount = 0;
  let failedCount = 0;
  const details: string[] = [];

  details.push(`開始修復 ${problematicChats.length} 個問題聊天...`);
  details.push('');

  for (const chat of problematicChats) {
    const oldCharacterId = chat.characterId;

    // 嘗試通過名稱匹配角色
    const matchedChar = characters.find(
      (c) => c.data?.name === oldCharacterId || c.nickname === oldCharacterId
    );

    if (matchedChar) {
      // 更新聊天的characterId
      chat.characterId = matchedChar.id;
      chat.updatedAt = Date.now();

      // 保存到數據庫
      await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)));

      details.push(
        `✓ 修復: "${chat.name}" | "${oldCharacterId}" → "${matchedChar.id}"`
      );
      fixedCount++;
    } else {
      details.push(
        `✗ 失敗: "${chat.name}" | 找不到名為 "${oldCharacterId}" 的角色`
      );
      failedCount++;
    }
  }

  details.push('');
  details.push(`修復完成！成功: ${fixedCount}, 失敗: ${failedCount}`);

  // 重新檢查
  const finalCheck = await checkCharacterIdIntegrity();

  return {
    ...finalCheck,
    fixedCount,
    failedCount,
    details,
  };
}

/**
 * 驗證修復結果
 */
export async function verifyCharacterIds(): Promise<FixResult> {
  const result = await checkCharacterIdIntegrity();

  if (result.problematicChats === 0) {
    result.details.push('');
    result.details.push('✅ 所有聊天的characterId都是有效的UUID格式');
  } else {
    result.details.push('');
    result.details.push('⚠️ 仍有問題需要處理');
  }

  return result;
}
