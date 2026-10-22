/**
 * 刪除角色時一併刪掉屬於這個角色的資料：
 * 私聊與多人卡的聊天（含訊息、總結、日記、重要事件、好感度狀態…）、
 * 好感度設定、來電與通話紀錄、噗浪貼文。
 *
 * - 普通群聊不刪：群裡還有其他人，群聊本身會略過已刪除的成員
 * - 鎖定的聊天不刪：鎖定就是要防止被刪
 * - 語音收藏不刪：那是使用者自己收藏的
 */
import { db, DB_STORES } from "@/db/database";
import { deleteChatCascade, loadChatsByCharacter } from "@/storage/chatStorage";
import { deleteDiaryBook } from "@/services/diaryBook";

/** 角色庫和編輯頁共用的刪除確認文字 */
export const CHARACTER_DELETE_CONFIRM =
  "確定要刪除這個角色嗎？\n和這個角色的聊天記錄、好感度、通話紀錄等資料會一起刪除，無法復原。\n（群聊、鎖定的聊天和語音收藏會保留）";

export interface CharacterDeletionResult {
  deletedChatCount: number;
  keptLockedChatCount: number;
}

/** 把 store 裡符合條件的紀錄刪掉；key 取自紀錄本身 */
async function deleteRecordsWhere<T>(
  storeName: string,
  keyOf: (record: T) => string | undefined,
  shouldDelete: (record: T) => boolean,
): Promise<void> {
  const records = await db.getAll<T>(storeName);
  for (const record of records) {
    const key = keyOf(record);
    if (key && shouldDelete(record)) {
      await db.delete(storeName, key);
    }
  }
}

type WithIds = { id?: string; chatId?: string; characterId?: string; authorId?: string };

export async function deleteCharacterRelatedData(
  characterId: string,
): Promise<CharacterDeletionResult> {
  await db.init();

  const ownChats = (await loadChatsByCharacter(characterId)).filter(
    (chat) => !chat.isGroupChat || chat.groupMetadata?.isMultiCharCard,
  );
  const lockedChats = ownChats.filter((chat) => chat.lockedFromDelete);
  const targetChats = ownChats.filter((chat) => !chat.lockedFromDelete);

  for (const chat of targetChats) {
    await deleteChatCascade(chat.id);
  }

  const chatIds = new Set(targetChats.map((chat) => chat.id));
  const byId = (r: WithIds) => r.id;
  const inDeletedChat = (r: WithIds) => !!r.chatId && chatIds.has(r.chatId);

  await deleteRecordsWhere<WithIds>(DB_STORES.SUMMARIES, byId, inDeletedChat);
  await deleteRecordsWhere<WithIds>(DB_STORES.DIARIES, byId, inDeletedChat);
  // 重要事件記錄本以 chatId 當 id，舊資料不一定有 chatId 欄位
  await deleteRecordsWhere<WithIds>(
    DB_STORES.IMPORTANT_EVENTS,
    byId,
    (r) => inDeletedChat(r) || (!!r.id && chatIds.has(r.id)),
  );
  await deleteRecordsWhere<WithIds>(DB_STORES.HOLIDAY_RECORDS, byId, inDeletedChat);
  await deleteRecordsWhere<WithIds>(DB_STORES.PEEK_PHONE_DATA, byId, inDeletedChat);
  await deleteRecordsWhere<WithIds>(
    DB_STORES.CHAT_AFFINITY_STATES,
    (r) => r.chatId,
    inDeletedChat,
  );

  // 角色本身的資料：鎖定的聊天留著也用不到了（角色卡已不在）
  const ownedByCharacter = (r: WithIds) => r.characterId === characterId;
  await deleteRecordsWhere<WithIds>(DB_STORES.PENDING_CALLS, byId, ownedByCharacter);
  await deleteRecordsWhere<WithIds>(DB_STORES.CALL_HISTORY, byId, ownedByCharacter);
  await deleteRecordsWhere<WithIds>(
    DB_STORES.QZONE_POSTS,
    byId,
    (r) => r.authorId === characterId,
  );
  await db.delete(DB_STORES.CHARACTER_AFFECTIONS, characterId);
  await db.delete(DB_STORES.SETTINGS, `lastActiveChatId_${characterId}`);
  await deleteDiaryBook(characterId);

  return {
    deletedChatCount: targetChats.length,
    keptLockedChatCount: lockedChats.length,
  };
}
