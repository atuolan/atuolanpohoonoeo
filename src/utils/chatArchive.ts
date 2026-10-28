import type { Chat } from "@/types/chat";

/**
 * 聊天歸檔的純判斷（不碰儲存）。
 * 歸檔＝收起來、角色完全安靜；取消歸檔或使用者在裡面送出訊息就回到列表。
 */

export function isChatArchived(
  chat: Pick<Chat, "archivedAt"> | null | undefined,
): boolean {
  return !!chat?.archivedAt;
}

/**
 * 整個角色都已歸檔：有單聊，而且單聊全部歸檔。
 * 用在以角色為單位的背景活動（主動訊息、噗浪、小劇場…）。
 */
export function getArchivedCharacterIds(chats: Chat[]): Set<string> {
  const active = new Set<string>();
  const archived = new Set<string>();
  for (const c of chats) {
    if (c.isGroupChat || !c.characterId) continue;
    (c.archivedAt ? archived : active).add(c.characterId);
  }
  for (const id of active) archived.delete(id);
  return archived;
}

/**
 * 聊天列表上「一列」代表的所有聊天：
 * 群聊或釘選的聊天只有自己；一般單聊是該角色所有未釘選的單聊
 * （只收最新那個的話，舊的會冒上來頂替）。
 */
export function getChatRowMembers(row: Chat, chats: Chat[]): Chat[] {
  if (row.isGroupChat || row.pinnedToList) return [row];
  return chats.filter(
    (c) =>
      c.id === row.id ||
      (!c.isGroupChat && !c.pinnedToList && c.characterId === row.characterId),
  );
}
