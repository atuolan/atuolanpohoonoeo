/**
 * 禮物回憶：每份送出／收到的禮物一張卡，存在 settings 表 gift-memories-${characterId}
 * （自動進備份和同步），刪角色時一起刪
 */
import { db, DB_STORES } from "@/db/database";

export type GiftDirection = "to-char" | "to-user";

export interface GiftDiaryEntry {
  id: string;
  kind: "together" | "solo";
  author: "user" | "char";
  /** 日記上寫的日期（YYYY-MM-DD） */
  date: string;
  content: string;
  /** 角色批註（together 才有） */
  margin?: string;
  createdAt: number;
  /** 自動寫的，看過前顯示小紅點 */
  unread?: boolean;
}

export interface GiftMemory {
  id: string;
  characterId: string;
  direction: GiftDirection;
  /** 商城禮物才有；角色回送的禮物沒有 */
  itemId?: string;
  name: string;
  /** 角色回送時自己寫的描述 */
  description?: string;
  /** 送禮小卡 */
  cardText?: string;
  /** 收下那一輪角色說的第一句話（to-char） */
  reaction?: string;
  sentAt: number;
  /** 聊天訊息 id，點寶箱時用來找卡 */
  messageId?: string;
  entries: GiftDiaryEntry[];
  /** 共感娃娃 */
  doll?: { boundAt: number };
}

const KEY_PREFIX = "gift-memories-";

function keyOf(characterId: string): string {
  return `${KEY_PREFIX}${characterId}`;
}

/** 回憶卡變動時發出，禮物櫃和聊天頁用來重新讀 */
export const GIFT_MEMORIES_CHANGED_EVENT = "aguaphone:gift-memories-changed";

function notifyChanged(characterId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(GIFT_MEMORIES_CHANGED_EVENT, { detail: { characterId } }));
}

function isMemory(value: unknown): value is GiftMemory {
  const m = value as Partial<GiftMemory> | null;
  return (
    !!m &&
    typeof m.id === "string" &&
    typeof m.name === "string" &&
    (m.direction === "to-char" || m.direction === "to-user") &&
    typeof m.sentAt === "number"
  );
}

/** 壞掉的卡直接略過；新的在前 */
export async function loadGiftMemories(characterId: string): Promise<GiftMemory[]> {
  const saved = await db.get<{ memories?: unknown[] }>(DB_STORES.SETTINGS, keyOf(characterId));
  const list = Array.isArray(saved?.memories) ? saved.memories.filter(isMemory) : [];
  return list
    .map((m) => ({ ...m, characterId, entries: Array.isArray(m.entries) ? m.entries : [] }))
    .sort((a, b) => b.sentAt - a.sentAt);
}

export async function saveGiftMemories(characterId: string, memories: GiftMemory[]): Promise<void> {
  await db.put(DB_STORES.SETTINGS, { memories: JSON.parse(JSON.stringify(memories)) }, keyOf(characterId));
  notifyChanged(characterId);
}

export async function addGiftMemory(
  characterId: string,
  input: Omit<GiftMemory, "id" | "characterId" | "entries"> & { entries?: GiftDiaryEntry[] },
): Promise<GiftMemory> {
  const list = await loadGiftMemories(characterId);
  const memory: GiftMemory = {
    ...input,
    id: `giftmem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    characterId,
    entries: input.entries ?? [],
  };
  await saveGiftMemories(characterId, [memory, ...list]);
  return memory;
}

/** 找不到就回 null，不新增 */
export async function updateGiftMemory(
  characterId: string,
  id: string,
  patch: Partial<Omit<GiftMemory, "id" | "characterId">>,
): Promise<GiftMemory | null> {
  const list = await loadGiftMemories(characterId);
  const index = list.findIndex((m) => m.id === id);
  if (index === -1) return null;
  const updated = { ...list[index], ...patch };
  list[index] = updated;
  await saveGiftMemories(characterId, list);
  return updated;
}

export async function deleteGiftMemories(characterId: string): Promise<void> {
  await db.delete(DB_STORES.SETTINGS, keyOf(characterId));
  notifyChanged(characterId);
}

/** 有回憶卡的角色 id（禮物櫃第一層用） */
export async function listGiftMemoryCharacterIds(): Promise<string[]> {
  const keys = await db.getAllKeys(DB_STORES.SETTINGS);
  return keys
    .filter((k): k is string => typeof k === "string" && k.startsWith(KEY_PREFIX))
    .map((k) => k.slice(KEY_PREFIX.length));
}

/**
 * 聊天裡的寶箱找對應的卡：先用 messageId，舊訊息沒有的話用名稱＋時間（前後 10 分鐘內最接近的）
 */
export function findMemoryForMessage(
  memories: GiftMemory[],
  message: { id?: string; giftName?: string; timestamp?: number; giftMemoryId?: string },
  direction: GiftDirection,
): GiftMemory | null {
  if (message.giftMemoryId) {
    const byId = memories.find((m) => m.id === message.giftMemoryId);
    if (byId) return byId;
  }
  if (message.id) {
    const byMsg = memories.find((m) => m.messageId === message.id);
    if (byMsg) return byMsg;
  }
  if (!message.giftName || !message.timestamp) return null;
  const WINDOW_MS = 10 * 60_000;
  let best: GiftMemory | null = null;
  for (const m of memories) {
    if (m.direction !== direction || m.name !== message.giftName) continue;
    const diff = Math.abs(m.sentAt - message.timestamp);
    if (diff > WINDOW_MS) continue;
    if (!best || diff < Math.abs(best.sentAt - message.timestamp)) best = m;
  }
  return best;
}

/** 角色最近一次送 user 禮物的時間；沒送過回 null */
export function lastGiftToUserAt(memories: GiftMemory[]): number | null {
  const times = memories.filter((m) => m.direction === "to-user").map((m) => m.sentAt);
  return times.length ? Math.max(...times) : null;
}

export const GIFT_NUDGE_GAP_MS = 14 * 24 * 3_600_000;
/** 很久沒送時，每一輪帶提示的機率 */
export const GIFT_NUDGE_GAP_CHANCE = 0.05;
const GIFT_KEYWORD_RE = /禮物|送我|送你|生日|紀念日/;

/**
 * 回送提示：送禮標籤寫在線上模式的標籤說明裡，這裡只在這幾種時候那一輪提醒一句
 * - 今天是節日
 * - user 最新的訊息提到禮物／生日等
 * - 角色 14 天以上沒送過（或從沒送過），每輪 5% 機率
 */
export function buildGiftNudgeNote(input: {
  now: number;
  lastGiftToUserAt: number | null;
  todayHolidayName?: string;
  latestUserText?: string;
  random?: () => number;
}): string | undefined {
  const random = input.random ?? Math.random;
  let reason = "";
  if (input.todayHolidayName) {
    reason = `今天是${input.todayHolidayName}`;
  } else if (input.latestUserText && GIFT_KEYWORD_RE.test(input.latestUserText)) {
    reason = "{{user}} 剛剛提到了禮物或特別的日子";
  } else {
    const gap = input.lastGiftToUserAt === null ? Infinity : input.now - input.lastGiftToUserAt;
    if (gap >= GIFT_NUDGE_GAP_MS && random() < GIFT_NUDGE_GAP_CHANCE) {
      reason = "{{char}} 已經很久沒送 {{user}} 東西了";
    }
  }
  if (!reason) return undefined;
  return `[送禮]${reason}。{{char}} 想的話可以送 {{user}} 一份禮物（<送禮物>），不想就不用送。`;
}
