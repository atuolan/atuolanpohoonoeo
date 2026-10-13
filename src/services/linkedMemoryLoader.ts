/**
 * 私聊與群聊記憶互通：從 IndexedDB 讀出連結聊天的總結與最近原文，組成 prompt 文字。
 * 每次生成時呼叫，不快取。規則見 docs/superpowers/specs/2026-10-14-cross-chat-memory-design.md。
 */

import dayjs from "dayjs";
import type { ChatMessageCursor } from "@/db/chatMessageStore";
import { DB_STORES, getDatabase } from "@/db/database";
import type { ConversationSummary } from "@/db/database";
import { loadMessagePage } from "@/storage/chatMessageStorage";
import { getLastActiveChatId, loadAllChats } from "@/storage/chatStorage";
import { createDefaultSummarySettings } from "@/types/chat";
import type { Chat, ChatMessage, MemoryLink } from "@/types/chat";
import type { ChatScreenMessage } from "@/types/chatScreen";
import { countTurns } from "@/utils/chatScreenHelpers";
import {
  buildGroupMemoriesText,
  buildPrivateMemoriesText,
  canMemberLink,
  DEFAULT_MAX_RAW_TURNS,
  findGroupsLinkedToChat,
  formatMessageLines,
  getMemberDisplayName,
  getPrivateChatCandidates,
  getSummaryBoundary,
  isLinkableMessage,
  isMemorySharingGroup,
  pickRecentMessages,
  resolveMemberLinkChatId,
} from "@/utils/linkedMemory";
import type { GroupMemoryBlock, PrivateMemoryBlock } from "@/utils/linkedMemory";
import { resolveSummaryReadCount, selectSummariesForPrompt } from "@/utils/summarySelection";

export interface LinkedMemoryContext {
  /** 目前的聊天（群聊或私聊） */
  chat: Chat;
  /** 目前聊天的使用者名字 */
  userName: string;
  /** 私聊時的角色名（{{char}}） */
  charName: string;
  /** 角色顯示名稱（暱稱優先），與群聊 prompt 的成員名一致 */
  getCharacterName: (characterId: string) => string | undefined;
  /** 把儲存格式的訊息轉成畫面格式（沿用 ChatScreen 的轉換） */
  toUiMessage: (message: ChatMessage, chat: Chat) => ChatScreenMessage;
}

/** 每次往回讀的訊息數 */
const PAGE_SIZE = 200;
/** 最多往回讀幾頁 */
const MAX_PAGES = 5;

/** 讀一個聊天的總結；私聊與 ChatScreen 一致，只取這個角色的（沒有 characterId 的舊資料也算） */
async function loadSummaries(chat: Chat): Promise<ConversationSummary[]> {
  const db = await getDatabase();
  const all = await db.getAllFromIndex(
    DB_STORES.SUMMARIES as "summaries",
    "by-chat",
    chat.id,
  );
  if (chat.isGroupChat) return all;
  return all.filter((s) => !s.characterId || s.characterId === chat.characterId);
}

/** 從最新一頁往回讀，湊滿 maxTurns 輪或讀過邊界就停 */
async function loadMessagesAfter(
  chat: Chat,
  boundary: number,
  maxTurns: number,
  toUiMessage: LinkedMemoryContext["toUiMessage"],
): Promise<ChatScreenMessage[]> {
  if (maxTurns <= 0) return [];
  let ui: ChatScreenMessage[] = [];
  let before: ChatMessageCursor | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await loadMessagePage(chat.id, PAGE_SIZE, before);
    ui = [...result.messages.map((m) => toUiMessage(m, chat)), ...ui];
    const oldest = result.messages[0];
    if (!result.hasMore || !oldest || oldest.createdAt <= boundary) break;
    const eligible = ui.filter((m) => m.timestamp > boundary && isLinkableMessage(m));
    // 讀到第 N+1 輪才停，確保第 N 輪開頭的使用者訊息也在裡面
    if (countTurns(eligible) > maxTurns) break;
    before = result.before;
  }
  return pickRecentMessages(ui, boundary, maxTurns);
}

/** 一個聊天要帶入的總結內容與未總結的原文 */
async function loadChatMemory(
  source: Chat,
  maxTurns: number,
  toUiMessage: LinkedMemoryContext["toUiMessage"],
): Promise<{ summaries: string[]; messages: ChatScreenMessage[] }> {
  const allSummaries = await loadSummaries(source);
  const readCount = resolveSummaryReadCount(
    source.summarySettings ?? createDefaultSummarySettings(),
  );
  const summaries = selectSummariesForPrompt(allSummaries, readCount).map((s) => s.content);
  const messages = await loadMessagesAfter(
    source,
    getSummaryBoundary(allSummaries),
    maxTurns,
    toUiMessage,
  );
  return { summaries, messages };
}

/** 群聊生成時：每位連結成員的私聊記憶，依成員列表順序 */
async function loadPrivateMemoriesForGroup(
  ctx: LinkedMemoryContext,
): Promise<string | undefined> {
  const meta = ctx.chat.groupMetadata;
  if (!meta) return undefined;
  const maxTurns = meta.memorySharing?.maxRawTurns ?? DEFAULT_MAX_RAW_TURNS;
  const allChats = await loadAllChats();
  const blocks: PrivateMemoryBlock[] = [];
  for (const member of meta.members) {
    if (!canMemberLink(member)) continue;
    try {
      const candidates = getPrivateChatCandidates(allChats, member.characterId);
      const lastActive = await getLastActiveChatId(member.characterId);
      const chatId = resolveMemberLinkChatId(member, candidates, lastActive);
      const source = candidates.find((c) => c.id === chatId);
      if (!source) continue;
      const ownerName = getMemberDisplayName(member, ctx.getCharacterName);
      const { summaries, messages } = await loadChatMemory(source, maxTurns, ctx.toUiMessage);
      blocks.push({
        ownerName,
        summaries,
        lines: formatMessageLines(messages, ctx.userName, () => ownerName),
      });
    } catch (err) {
      console.warn("[記憶互通] 讀取成員私聊失敗，略過", member.characterId, err);
    }
  }
  return buildPrivateMemoriesText(blocks, ctx.userName);
}

/** 私聊生成時：連到這個私聊的群聊記憶，依群的 updatedAt 由舊到新 */
async function loadGroupMemoriesForPrivate(
  ctx: LinkedMemoryContext,
): Promise<string | undefined> {
  const privateChat = ctx.chat;
  const allChats = await loadAllChats();
  const lastActive = await getLastActiveChatId(privateChat.characterId);
  const groups = findGroupsLinkedToChat(privateChat, allChats, lastActive).sort(
    (a, b) => (a.updatedAt || 0) - (b.updatedAt || 0),
  );
  const blocks: GroupMemoryBlock[] = [];
  for (const group of groups) {
    const meta = group.groupMetadata;
    if (!meta) continue;
    try {
      const self = meta.members.find((m) => m.characterId === privateChat.characterId);
      const maxTurns = meta.memorySharing?.maxRawTurns ?? DEFAULT_MAX_RAW_TURNS;
      const { summaries, messages } = await loadChatMemory(group, maxTurns, ctx.toUiMessage);
      blocks.push({
        groupName: meta.groupName || group.name,
        memberNames: [
          ...meta.members.map((m) => getMemberDisplayName(m, ctx.getCharacterName)),
          ctx.userName,
        ],
        charNameInGroup: self
          ? getMemberDisplayName(self, ctx.getCharacterName)
          : ctx.charName,
        summaries,
        lines: formatMessageLines(
          messages,
          ctx.userName,
          (m) => m.senderCharacterName || "群成員",
        ),
      });
    } catch (err) {
      console.warn("[記憶互通] 讀取群聊失敗，略過", group.id, err);
    }
  }
  return buildGroupMemoriesText(blocks, ctx.charName);
}

/** 生成前呼叫：回傳要接在總結條目最後的互通記憶文字；沒有任何內容時回傳 undefined */
export async function loadLinkedMemories(
  ctx: LinkedMemoryContext,
): Promise<string | undefined> {
  if (ctx.chat.isGroupChat) {
    return isMemorySharingGroup(ctx.chat) ? loadPrivateMemoriesForGroup(ctx) : undefined;
  }
  return loadGroupMemoriesForPrivate(ctx);
}

// ===== 設定面板 =====

/** 設定畫面：一位成員的連結選項 */
export interface MemberLinkOption {
  characterId: string;
  /** 成員在群裡顯示的名字 */
  name: string;
  /** linkable：可連結；virtual：虛擬或代演成員；no-chat：還沒有私聊 */
  status: "linkable" | "virtual" | "no-chat";
  /** 可選的私聊（status 為 linkable 時才有） */
  chats: Array<{ id: string; label: string }>;
  /** 目前的連結；指定的私聊已不在候選中時顯示為不連結 */
  link: MemoryLink;
}

/** 私聊選項的文字：聊天名稱（分支加註）· 最後更新日期 */
function chatOptionLabel(chat: Chat): string {
  const name = chat.name || "未命名對話";
  const branch = chat.isBranch ? "（分支）" : "";
  return `${name}${branch} · ${dayjs(chat.updatedAt).format("MM/DD")}`;
}

/** 群組詳情的記憶互通面板：每位成員的連結選項 */
export async function loadMemberLinkOptions(
  group: Chat,
  getCharacterName: (characterId: string) => string | undefined,
): Promise<MemberLinkOption[]> {
  const allChats = await loadAllChats();
  return (group.groupMetadata?.members ?? []).map((member): MemberLinkOption => {
    const characterId = member.characterId;
    const name = getMemberDisplayName(member, getCharacterName);
    if (!canMemberLink(member)) {
      return { characterId, name, status: "virtual", chats: [], link: { mode: "none" } };
    }
    const candidates = getPrivateChatCandidates(allChats, characterId);
    if (candidates.length === 0) {
      return { characterId, name, status: "no-chat", chats: [], link: { mode: "none" } };
    }
    const link: MemoryLink = member.memoryLink ?? { mode: "auto" };
    const stale = link.mode === "chat" && !candidates.some((c) => c.id === link.chatId);
    return {
      characterId,
      name,
      status: "linkable",
      chats: candidates.map((c) => ({ id: c.id, label: chatOptionLabel(c) })),
      link: stale ? { mode: "none" } : link,
    };
  });
}

/** 私聊詳情的唯讀說明：連到這個私聊的群名 */
export async function loadLinkedGroupNames(privateChat: Chat): Promise<string[]> {
  const allChats = await loadAllChats();
  const lastActive = await getLastActiveChatId(privateChat.characterId);
  return findGroupsLinkedToChat(privateChat, allChats, lastActive).map(
    (g) => g.groupMetadata?.groupName || g.name,
  );
}
