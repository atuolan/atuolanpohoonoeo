/**
 * 私聊與群聊記憶互通：純函式。
 * 決定成員連到哪個私聊、挑出未總結的原文、組成送進 prompt 的文字。
 * 讀取 IndexedDB 的部分在 services/linkedMemoryLoader.ts。
 */

import type { Chat, GroupMember, MemoryLink } from "@/types/chat";

/** 第一次開啟互通時的原文輪數上限 */
export const DEFAULT_MAX_RAW_TURNS = 15;
/** 原文輪數上限可設定的最大值 */
export const MAX_RAW_TURNS_LIMIT = 30;

/** 把輪數上限限制在 0–30 的整數；不是數字時用預設值 */
export function clampMaxRawTurns(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_RAW_TURNS;
  return Math.min(MAX_RAW_TURNS_LIMIT, Math.max(0, Math.round(value)));
}

// ===== 連結解析 =====

/** 成員在群裡顯示的名字，與群聊 prompt 的成員名一致：群暱稱 → 虛擬成員名／角色名 → characterId */
export function getMemberDisplayName(
  member: GroupMember,
  getCharacterName: (characterId: string) => string | undefined,
): string {
  const base = member.isVirtual ? member.name : getCharacterName(member.characterId);
  return (member.nickname || base || member.characterId).trim();
}

/** 虛擬成員與代演使用者角色的成員沒有私聊，不能連結 */
export function canMemberLink(member: GroupMember): boolean {
  return !member.isVirtual && !member.isPersonaMember;
}

/** 某角色可連結的私聊：非群聊、非小劇場（分支算在內），依 updatedAt 由新到舊 */
export function getPrivateChatCandidates(
  chats: readonly Chat[],
  characterId: string,
): Chat[] {
  return chats
    .filter((c) => !c.isGroupChat && !c.isTheater && c.characterId === characterId)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/**
 * 成員連到哪個私聊；沒有連結時回傳 undefined。
 * - auto：候選中有 lastActiveChatId 指向的聊天就用它，否則用最新的
 * - chat：指定的私聊必須在候選中
 * - none：不連結
 */
export function resolveMemberLinkChatId(
  member: GroupMember,
  candidates: readonly Chat[],
  lastActiveChatId?: string,
): string | undefined {
  if (!canMemberLink(member)) return undefined;
  const link: MemoryLink = member.memoryLink ?? { mode: "auto" };
  if (link.mode === "none") return undefined;
  if (link.mode === "chat") {
    return candidates.some((c) => c.id === link.chatId) ? link.chatId : undefined;
  }
  const preferred = lastActiveChatId
    ? candidates.find((c) => c.id === lastActiveChatId)
    : undefined;
  return (preferred ?? candidates[0])?.id;
}

/** 開啟互通的普通群聊（多人卡不支援） */
export function isMemorySharingGroup(chat: Chat): boolean {
  return (
    chat.isGroupChat === true &&
    !chat.groupMetadata?.isMultiCharCard &&
    chat.groupMetadata?.memorySharing?.enabled === true
  );
}

/**
 * 找出連到某個私聊的群：開啟互通、不是多人卡，而且這個角色的連結解析結果就是這個私聊。
 * @param lastActiveChatId 這個私聊所屬角色的 lastActiveChatId
 */
export function findGroupsLinkedToChat(
  privateChat: Chat,
  allChats: readonly Chat[],
  lastActiveChatId?: string,
): Chat[] {
  if (privateChat.isGroupChat || privateChat.isTheater) return [];
  const candidates = getPrivateChatCandidates(allChats, privateChat.characterId);
  return allChats.filter(
    (group) =>
      isMemorySharingGroup(group) &&
      (group.groupMetadata?.members ?? []).some(
        (m) =>
          m.characterId === privateChat.characterId &&
          resolveMemberLinkChatId(m, candidates, lastActiveChatId) === privateChat.id,
      ),
  );
}
