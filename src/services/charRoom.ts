/**
 * 像素房間：讀寫房間、展示櫃的禮物、房間的重要事件、去他房間、成人內容開關
 *
 * 都存在 settings 表（自動進備份）：
 * - char-room-${characterId}   房間
 * - room-visit-${chatId}       正在他房間裡
 * - adult-content              成人內容開關（全域，預設關閉）
 */
import { giftSpriteKind, type GiftSpriteKind } from "@/data/pixelArt/furniture";
import { db, DB_STORES } from "@/db/database";
import { isConsumableGift } from "@/services/giftDiary";
import { loadGiftMemories } from "@/services/giftMemories";
import type { Chat } from "@/types/chat";
import {
  createDefaultImportantEventsLog,
  createImportantEvent,
  type ImportantEventsLog,
} from "@/types/importantEvents";
import type { CharRoom, RoomVisit } from "@/types/room";
import { normalizeRoom, roomSummary } from "@/utils/roomLogic";
import { ref } from "vue";

export const CHAR_ROOM_CHANGED_EVENT = "aguaphone:char-room-changed";

const roomKey = (characterId: string) => `char-room-${characterId}`;
const visitKey = (chatId: string) => `room-visit-${chatId}`;
const ADULT_KEY = "adult-content";

// ===== 房間 =====

export async function loadCharRoom(characterId: string): Promise<CharRoom> {
  await db.init();
  const saved = await db.get<Partial<CharRoom>>(DB_STORES.SETTINGS, roomKey(characterId));
  return normalizeRoom(saved, characterId);
}

export async function saveCharRoom(room: CharRoom): Promise<void> {
  await db.put(DB_STORES.SETTINGS, JSON.parse(JSON.stringify(room)), roomKey(room.characterId));
  try {
    window.dispatchEvent(new CustomEvent(CHAR_ROOM_CHANGED_EVENT, { detail: { characterId: room.characterId } }));
  } catch {
    // 非瀏覽器環境
  }
}

export async function deleteCharRoom(characterId: string): Promise<void> {
  await db.delete(DB_STORES.SETTINGS, roomKey(characterId));
}

// ===== 展示櫃 =====

export interface ShelfGift {
  name: string;
  kind: GiftSpriteKind;
}

/** 使用者送給他、不會用完的禮物，新的在前，最多 6 個 */
export async function loadShelfGifts(characterId: string): Promise<ShelfGift[]> {
  try {
    const memories = await loadGiftMemories(characterId);
    return memories
      .filter((m) => m.direction === "to-char" && !isConsumableGift(m))
      .slice(0, 6)
      .map((m) => ({ name: m.name, kind: giftSpriteKind(m.itemId ?? m.name) }));
  } catch {
    return [];
  }
}

// ===== 房間的重要事件 =====

export const roomEventId = (characterId: string) => `room_${characterId}`;

/** 這個角色最近的單人聊天 */
async function latestPrivateChatId(characterId: string): Promise<string | null> {
  const chats = await db.getAll<Chat>(DB_STORES.CHATS);
  const chat = chats
    .filter((c) => c.characterId === characterId && !c.isGroupChat)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  return chat?.id ?? null;
}

/**
 * 房間擺設改了：改寫那一筆固定的重要事件（不新增），優先級 2，
 * 聊到「房間」或家具、禮物名稱才送，平常不花 token
 */
export async function syncRoomImportantEvent(
  room: CharRoom,
  names: { userName: string; charName: string },
  giftNames: string[],
  chatId?: string,
): Promise<void> {
  try {
    const targetChatId = chatId ?? (await latestPrivateChatId(room.characterId));
    if (!targetChatId) return;
    const { content, keywords } = roomSummary(room, names, giftNames);
    let log = await db.get<ImportantEventsLog>(DB_STORES.IMPORTANT_EVENTS, targetChatId);
    if (!log) log = createDefaultImportantEventsLog(room.characterId, targetChatId);
    if (!log.settings.enabled) return;
    const id = roomEventId(room.characterId);
    const existing = log.events.find((e) => e.id === id);
    if (existing) {
      if (existing.content === content) return;
      existing.content = content;
      existing.vectorKeywords = keywords;
      existing.timestamp = Date.now();
    } else {
      const event = createImportantEvent(content, { category: "fact", priority: 2, source: "system", tags: ["房間"] });
      event.id = id;
      event.vectorKeywords = keywords;
      log.events.unshift(event);
    }
    log.updatedAt = Date.now();
    await db.put(DB_STORES.IMPORTANT_EVENTS, JSON.parse(JSON.stringify(log)));
  } catch (e) {
    console.warn("[房間] 更新重要事件失敗:", e);
  }
}

// ===== 去他房間 =====

export async function loadRoomVisit(chatId: string): Promise<RoomVisit | null> {
  if (!chatId) return null;
  await db.init();
  const saved = await db.get<RoomVisit>(DB_STORES.SETTINGS, visitKey(chatId));
  return saved && typeof saved.startedAt === "number" ? saved : null;
}

export async function saveRoomVisit(visit: RoomVisit): Promise<void> {
  await db.put(DB_STORES.SETTINGS, JSON.parse(JSON.stringify(visit)), visitKey(visit.chatId));
}

export async function clearRoomVisit(chatId: string): Promise<void> {
  await db.delete(DB_STORES.SETTINGS, visitKey(chatId));
}

// ===== 成人內容開關（全域，預設關閉） =====

export const adultContentEnabled = ref(false);
let adultLoaded = false;

export async function loadAdultContentSetting(): Promise<boolean> {
  if (adultLoaded) return adultContentEnabled.value;
  try {
    await db.init();
    const saved = await db.get<{ enabled?: boolean }>(DB_STORES.SETTINGS, ADULT_KEY);
    adultContentEnabled.value = saved?.enabled === true;
  } catch {
    adultContentEnabled.value = false;
  }
  adultLoaded = true;
  return adultContentEnabled.value;
}

export async function setAdultContentEnabled(enabled: boolean): Promise<void> {
  adultContentEnabled.value = enabled;
  adultLoaded = true;
  await db.put(DB_STORES.SETTINGS, { enabled }, ADULT_KEY);
}
