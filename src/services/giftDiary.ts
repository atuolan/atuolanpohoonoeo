/**
 * 禮物日記：寫幾篇的限制、角色自動寫的挑選、存日記、寫進重要事件
 */
import { GIFT_ITEMS } from "@/data/shopItems";
import { db, DB_STORES, getDatabase } from "@/db/database";
import { generateGiftDiary } from "@/services/giftDiaryGeneration";
import {
  loadGiftMemories,
  updateGiftMemory,
  type GiftDiaryEntry,
  type GiftMemory,
} from "@/services/giftMemories";
import { useCharactersStore } from "@/stores/characters";
import { useUserStore } from "@/stores/user";
import {
  createDefaultImportantEventsLog,
  createImportantEvent,
  type ImportantEventsLog,
} from "@/types";
import type { Chat } from "@/types/chat";

export const GIFT_DIARY_AUTO_MIN_AGE_MS = 2 * 24 * 3_600_000;
export const GIFT_DIARY_AUTO_REPEAT_MS = 7 * 24 * 3_600_000;
export const GIFT_DIARY_AUTO_CHANCE = 0.3;

export function giftItemOf(memory: GiftMemory) {
  return memory.itemId ? GIFT_ITEMS.find((item) => item.id === memory.itemId) : undefined;
}

/** 用完就沒了的禮物（巧克力、蛋糕…）；角色自己編的禮物當耐用品 */
export function isConsumableGift(memory: GiftMemory): boolean {
  return !!giftItemOf(memory)?.giftUse?.consumable;
}

export function giftHintOf(memory: GiftMemory): string {
  return giftItemOf(memory)?.giftUse?.hint ?? "";
}

/** 「收到的人自己用的時候」由誰寫：你送他 → 他寫；他送你 → 你寫 */
export function soloAuthorOf(memory: GiftMemory): "user" | "char" {
  return memory.direction === "to-char" ? "char" : "user";
}

/** 消耗品每種日記最多一篇；耐用品不限 */
export function canAddEntry(memory: GiftMemory, kind: GiftDiaryEntry["kind"]): boolean {
  if (!isConsumableGift(memory)) return true;
  return !memory.entries.some((e) => e.kind === kind);
}

export function todayString(now = Date.now()): string {
  const d = new Date(now);
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function newEntry(
  input: Omit<GiftDiaryEntry, "id" | "createdAt"> & { createdAt?: number },
): GiftDiaryEntry {
  return {
    ...input,
    id: `giftdiary-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: input.createdAt ?? Date.now(),
  };
}

/** 日記照日期排，同一天照寫的時間 */
export function sortEntries(entries: GiftDiaryEntry[]): GiftDiaryEntry[] {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
}

export async function addGiftDiaryEntry(
  characterId: string,
  memoryId: string,
  entry: GiftDiaryEntry,
): Promise<GiftMemory | null> {
  const memory = (await loadGiftMemories(characterId)).find((m) => m.id === memoryId);
  if (!memory) return null;
  return updateGiftMemory(characterId, memoryId, { entries: sortEntries([...memory.entries, entry]) });
}

export async function updateGiftDiaryEntry(
  characterId: string,
  memoryId: string,
  entryId: string,
  patch: Partial<Omit<GiftDiaryEntry, "id">>,
): Promise<GiftMemory | null> {
  const memory = (await loadGiftMemories(characterId)).find((m) => m.id === memoryId);
  if (!memory) return null;
  const entries = memory.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e));
  return updateGiftMemory(characterId, memoryId, { entries: sortEntries(entries) });
}

export async function deleteGiftDiaryEntry(
  characterId: string,
  memoryId: string,
  entryId: string,
): Promise<GiftMemory | null> {
  const memory = (await loadGiftMemories(characterId)).find((m) => m.id === memoryId);
  if (!memory) return null;
  return updateGiftMemory(characterId, memoryId, { entries: memory.entries.filter((e) => e.id !== entryId) });
}

/** 打開回憶卡時把自動寫的未讀標記清掉 */
export async function markGiftDiaryRead(characterId: string, memoryId: string): Promise<void> {
  const memory = (await loadGiftMemories(characterId)).find((m) => m.id === memoryId);
  if (!memory?.entries.some((e) => e.unread)) return;
  await updateGiftMemory(characterId, memoryId, {
    entries: memory.entries.map((e) => (e.unread ? { ...e, unread: false } : e)),
  });
}

export function hasUnreadDiary(memories: GiftMemory[]): boolean {
  return memories.some((m) => m.entries.some((e) => e.unread));
}

// ===== 角色自動寫 =====

export interface GiftDiaryMeta {
  /** 讓他偶爾自己寫日記（預設開） */
  autoDiary: boolean;
  /** 上次擲骰的日期（YYYY-MM-DD），一天最多一次 */
  lastAutoRollDate?: string;
}

function metaKey(characterId: string): string {
  return `gift-diary-meta-${characterId}`;
}

export async function loadGiftDiaryMeta(characterId: string): Promise<GiftDiaryMeta> {
  const saved = await db.get<Partial<GiftDiaryMeta>>(DB_STORES.SETTINGS, metaKey(characterId));
  return {
    autoDiary: saved?.autoDiary !== false,
    ...(typeof saved?.lastAutoRollDate === "string" ? { lastAutoRollDate: saved.lastAutoRollDate } : {}),
  };
}

export async function saveGiftDiaryMeta(characterId: string, meta: GiftDiaryMeta): Promise<void> {
  await db.put(DB_STORES.SETTINGS, { ...meta }, metaKey(characterId));
}

export async function deleteGiftDiaryMeta(characterId: string): Promise<void> {
  await db.delete(DB_STORES.SETTINGS, metaKey(characterId));
}

/**
 * 挑一份讓他自己寫的禮物：你送他、送出超過 2 天、還能寫，而且他上次寫這份已經過 7 天（或還沒寫過）。
 * 沒寫過的優先，其次是最久沒寫的。
 */
export function pickAutoDiaryTarget(memories: GiftMemory[], now: number): GiftMemory | null {
  const lastCharSolo = (m: GiftMemory) =>
    Math.max(0, ...m.entries.filter((e) => e.kind === "solo" && e.author === "char").map((e) => e.createdAt));
  const candidates = memories.filter(
    (m) =>
      m.direction === "to-char" &&
      now - m.sentAt >= GIFT_DIARY_AUTO_MIN_AGE_MS &&
      canAddEntry(m, "solo") &&
      now - lastCharSolo(m) >= GIFT_DIARY_AUTO_REPEAT_MS,
  );
  candidates.sort((a, b) => lastCharSolo(a) - lastCharSolo(b) || b.sentAt - a.sentAt);
  return candidates[0] ?? null;
}

const autoRunning = new Set<string>();

/**
 * 開聊天頁或禮物櫃時呼叫：每個角色每天最多擲一次，中了就在背景寫一篇。
 * 寫好回傳更新後的卡，沒寫回 null。
 */
export async function runAutoGiftDiary(
  characterId: string,
  opts: { now?: number; random?: () => number } = {},
): Promise<GiftMemory | null> {
  if (autoRunning.has(characterId)) return null;
  autoRunning.add(characterId);
  try {
    const now = opts.now ?? Date.now();
    const meta = await loadGiftDiaryMeta(characterId);
    const today = todayString(now);
    if (!meta.autoDiary || meta.lastAutoRollDate === today) return null;
    const memories = await loadGiftMemories(characterId);
    const target = pickAutoDiaryTarget(memories, now);
    if (!target) return null;
    await saveGiftDiaryMeta(characterId, { ...meta, lastAutoRollDate: today });
    if ((opts.random ?? Math.random)() >= GIFT_DIARY_AUTO_CHANCE) return null;

    const charactersStore = useCharactersStore();
    if (!charactersStore.characters.length) await charactersStore.loadCharacters();
    const character = charactersStore.getCharacterById(characterId);
    if (!character) return null;
    const output = await generateGiftDiary({ character, memory: target, mode: "solo", background: true });
    if (!output?.diary) return null;
    const updated = await addGiftDiaryEntry(
      characterId,
      target.id,
      newEntry({ kind: "solo", author: "char", date: today, content: output.diary, unread: true }),
    );
    await recordGiftDiaryEvent(characterId, target, output.summary || output.diary, "char");
    return updated;
  } catch (e) {
    console.warn("[GiftDiary] 自動寫日記失敗:", e);
    return null;
  } finally {
    autoRunning.delete(characterId);
  }
}

// ===== 重要事件 =====

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** 這個角色最近的單人聊天 */
async function latestPrivateChatId(characterId: string): Promise<string | null> {
  const idb = await getDatabase();
  const chats = (await idb.getAllFromIndex("chats", "by-character", characterId)) as Chat[];
  const chat = chats
    .filter((c) => !c.isGroupChat)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  return chat?.id ?? null;
}

/**
 * 日記存檔後寫一筆重要事件，讓他聊天時記得。text 是 AI 給的摘要；
 * 使用者自己寫、沒有摘要時傳全文，這裡截前 50 字。
 */
export async function recordGiftDiaryEvent(
  characterId: string,
  memory: GiftMemory,
  text: string,
  source: "user" | "char",
  opts: { hasSummary?: boolean } = {},
): Promise<void> {
  try {
    const chatId = await latestPrivateChatId(characterId);
    if (!chatId) return;
    const charactersStore = useCharactersStore();
    const character = charactersStore.getCharacterById(characterId);
    const charName = character?.nickname || character?.data?.name || "{{char}}";
    const userName = useUserStore().currentPersona?.name || "{{user}}";
    const content =
      source === "char" || opts.hasSummary
        ? clip(text, 80)
        : `${userName} 寫了和 ${charName} 一起用「${memory.name}」的那天：${clip(text, 50)}`;

    let log = await db.get<ImportantEventsLog>(DB_STORES.IMPORTANT_EVENTS, chatId);
    if (!log) log = createDefaultImportantEventsLog(characterId, chatId);
    if (!log.settings.enabled) return;
    log.events.unshift(
      createImportantEvent(content, {
        category: "relationship",
        priority: 2,
        source: "system",
        tags: ["禮物", memory.name, "日記"],
      }),
    );
    if (log.events.length > log.settings.maxEvents) log.events = log.events.slice(0, log.settings.maxEvents);
    log.updatedAt = Date.now();
    await db.put(DB_STORES.IMPORTANT_EVENTS, JSON.parse(JSON.stringify(log)));
  } catch (e) {
    console.warn("[GiftDiary] 記錄重要事件失敗:", e);
  }
}
