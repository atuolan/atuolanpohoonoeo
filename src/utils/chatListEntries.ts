import type { Chat } from "@/types/chat";

/**
 * 聊天列表的入口：照更新時間排，每個角色（群聊各自算）只留最新的一個；
 * 釘選到列表的聊天不參與去重。聊天列表、噗浪「傳給…」共用。
 */
export function pickChatListEntries(chats: Chat[]): Chat[] {
  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
  const seen = new Set<string>();
  return sorted.filter((c) => {
    if (c.pinnedToList) return true;
    const key = c.isGroupChat ? `group_${c.id}` : c.characterId;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
