/**
 * 私聊與群聊記憶互通：純函式。
 * 決定成員連到哪個私聊、挑出未總結的原文、組成送進 prompt 的文字。
 * 讀取 IndexedDB 的部分在 services/linkedMemoryLoader.ts。
 */

import type { Chat, GroupMember, MemoryLink } from "@/types/chat";
import type { ChatScreenMessage } from "@/types/chatScreen";
import {
  isForwardSelectable,
  RECORD_ITEM_MAX_CHARS,
  summarizeForwardContent,
} from "@/utils/chatForward";
import { sliceMessagesByTurns } from "@/utils/chatScreenHelpers";

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

// ===== 原文挑選 =====

/** 計算總結邊界需要的欄位 */
export interface BoundarySummary {
  createdAt: number;
  coveredUntil?: number;
  isImported?: boolean;
}

/** 總結涵蓋到的最後時間：非匯入總結的 coveredUntil ?? createdAt 最大值（已合併的也算）；沒有總結時為 0 */
export function getSummaryBoundary(summaries: readonly BoundarySummary[]): number {
  let boundary = 0;
  for (const s of summaries) {
    if (s.isImported) continue;
    boundary = Math.max(boundary, s.coveredUntil ?? s.createdAt ?? 0);
  }
  return boundary;
}

/** 能帶進互通原文的訊息：一般的使用者／角色訊息，排除群內私信、撤回、群管理動作、聊天記錄卡片 */
export function isLinkableMessage(m: ChatScreenMessage): boolean {
  return (
    isForwardSelectable(m) &&
    !m.isPrivateMessage &&
    !m.isRecall &&
    !m.isGroupAction &&
    !m.isGroupChatHistory
  );
}

/** 總結邊界之後、最多 maxTurns 輪的原文（時間順序，舊→新） */
export function pickRecentMessages(
  messages: readonly ChatScreenMessage[],
  boundary: number,
  maxTurns: number,
): ChatScreenMessage[] {
  if (maxTurns <= 0) return [];
  const eligible = messages.filter(
    (m) => m.timestamp > boundary && isLinkableMessage(m),
  );
  return sliceMessagesByTurns(eligible, maxTurns);
}

/**
 * 轉成「名字：內容」；內容沿用合併轉發的轉換，超過上限截斷。
 * @param getAiName 角色訊息要顯示的名字
 */
export function formatMessageLines(
  messages: readonly ChatScreenMessage[],
  userName: string,
  getAiName: (m: ChatScreenMessage) => string,
): string[] {
  return messages.map((m) => {
    const text = summarizeForwardContent(m);
    const content =
      text.length > RECORD_ITEM_MAX_CHARS
        ? `${text.slice(0, RECORD_ITEM_MAX_CHARS)}…`
        : text;
    const name = m.role === "user" ? userName : getAiName(m);
    return `${name}：${content}`;
  });
}

// ===== prompt 文字 =====

/** 一個私聊帶進群聊的內容 */
export interface PrivateMemoryBlock {
  /** 成員在群裡顯示的名字 */
  ownerName: string;
  /** 依時間軸由舊到新的總結內容 */
  summaries: string[];
  /** 「名字：內容」 */
  lines: string[];
}

/** 一個群聊帶進私聊的內容 */
export interface GroupMemoryBlock {
  groupName: string;
  /** 群成員名字（含使用者） */
  memberNames: string[];
  /** {{char}} 在這個群裡顯示的名字 */
  charNameInGroup: string;
  /** 依時間軸由舊到新的總結內容 */
  summaries: string[];
  /** 「名字：內容」 */
  lines: string[];
}

/** 標籤屬性值不能有雙引號 */
function attr(value: string): string {
  return value.replace(/"/g, "'");
}

function numberedSummaries(summaries: readonly string[]): string[] {
  return summaries.map((s, i) => `【總結 ${i + 1}】\n${s}`);
}

function hasContent(block: { summaries: string[]; lines: string[] }): boolean {
  return block.summaries.length > 0 || block.lines.length > 0;
}

/** 群聊 prompt 用：成員的私聊記憶，每段只有標籤上的成員知道 */
export function buildPrivateMemoriesText(
  blocks: readonly PrivateMemoryBlock[],
  userName: string,
): string | undefined {
  const sections = blocks.filter(hasContent).map((b) => {
    const parts = [`<private_memory owner="${attr(b.ownerName)}">`];
    if (b.summaries.length > 0) {
      parts.push(
        `【私聊總結】（${b.ownerName}的第一人稱：「我」是${b.ownerName}，「你」是 ${userName}）`,
        ...numberedSummaries(b.summaries),
      );
    }
    if (b.lines.length > 0) {
      parts.push("【最近的私聊】", ...b.lines);
    }
    parts.push("</private_memory>");
    return parts.join("\n");
  });
  if (sections.length === 0) return undefined;
  return [
    `[成員的私聊記憶]\n以下是部分成員和 ${userName} 私下的聊天。每段只有標籤上的那位成員知道，其他成員不知道，演出時不能表現出知道。記憶的主人可以自己決定要不要在群裡說出來；在群裡說出來之後，大家就都知道了。`,
    ...sections,
  ].join("\n\n");
}

/** 私聊 prompt 用：{{char}} 所在的群聊 */
export function buildGroupMemoriesText(
  blocks: readonly GroupMemoryBlock[],
  charName: string,
): string | undefined {
  const sections = blocks.filter(hasContent).map((b) => {
    const parts = [
      `<group_memory group="${attr(b.groupName)}" members="${attr(b.memberNames.join("、"))}">`,
    ];
    if (b.charNameInGroup !== charName) {
      parts.push(`${charName} 在這個群裡的名字是「${b.charNameInGroup}」。`);
    }
    if (b.summaries.length > 0) {
      parts.push(
        "【群聊總結】（每條開頭是執筆成員的名字）",
        ...numberedSummaries(b.summaries),
      );
    }
    if (b.lines.length > 0) {
      parts.push("【最近的群聊】", ...b.lines);
    }
    parts.push("</group_memory>");
    return parts.join("\n");
  });
  if (sections.length === 0) return undefined;
  return [
    `[${charName} 所在的群聊]\n${charName} 也在以下群聊裡，群裡的對話 ${charName} 都看得到。`,
    ...sections,
  ].join("\n\n");
}
