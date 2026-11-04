/**
 * 像素房間的計算與文字（純函式）
 */
import { DEFAULT_SPRITE, type CharSpriteConfig } from "@/data/pixelArt/character";
import {
  DEFAULT_PLACEMENTS,
  ROOM_SLOTS,
  getFurniture,
  slotAccepts,
  type RoomSlotId,
} from "@/data/roomFurniture";
import type { CharRoom } from "@/types/room";

export function createDefaultRoom(characterId: string, now = Date.now()): CharRoom {
  return {
    characterId,
    sprite: JSON.parse(JSON.stringify(DEFAULT_SPRITE)),
    placements: { ...DEFAULT_PLACEMENTS },
    storage: [],
    updatedAt: now,
  };
}

/** 讀回來的房間補齊欄位（舊資料、壞掉的） */
export function normalizeRoom(raw: Partial<CharRoom> | null | undefined, characterId: string): CharRoom {
  const base = createDefaultRoom(characterId);
  if (!raw || typeof raw !== "object") return base;
  const placements = { ...base.placements };
  for (const slot of ROOM_SLOTS) {
    const value = raw.placements?.[slot.id];
    if (value === null) placements[slot.id] = null;
    else if (typeof value === "string" && getFurniture(value) && slotAccepts(slot.id, getFurniture(value)!)) {
      placements[slot.id] = value;
    }
  }
  const sprite: CharSpriteConfig = {
    ...base.sprite,
    ...(raw.sprite ?? {}),
    colors: { ...base.sprite.colors, ...(raw.sprite?.colors ?? {}) },
  };
  return {
    characterId,
    sprite,
    placements,
    storage: Array.isArray(raw.storage) ? raw.storage.filter((id) => !!getFurniture(id)) : [],
    lastArrangedBy: raw.lastArrangedBy,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : base.updatedAt,
  };
}

/**
 * 把一件家具擺到某個位置：原本的收進這間房的收納（基本款也收，之後可以換回來）。
 * 家具不適合這個位置就回傳原房間。
 */
export function placeFurniture(room: CharRoom, slot: RoomSlotId, furnitureId: string, now = Date.now()): CharRoom {
  const furniture = getFurniture(furnitureId);
  if (!furniture || !slotAccepts(slot, furniture)) return room;
  const previous = room.placements[slot];
  if (previous === furnitureId) return room;
  const storage = room.storage.filter((id, i) => !(id === furnitureId && room.storage.indexOf(id) === i));
  if (previous) storage.push(previous);
  return { ...room, placements: { ...room.placements, [slot]: furnitureId }, storage, updatedAt: now };
}

/** 把某個位置的家具收起來（床、書桌、衣櫃、窗簾不能空，不收） */
export function clearSlot(room: CharRoom, slot: RoomSlotId, now = Date.now()): CharRoom {
  const required: RoomSlotId[] = ["bed", "desk", "wardrobe", "window"];
  const current = room.placements[slot];
  if (!current || required.includes(slot)) return room;
  return { ...room, placements: { ...room.placements, [slot]: null }, storage: [...room.storage, current], updatedAt: now };
}

/** 收納裡的家具能不能拿出來（有就是有） */
export function hasInStorage(room: CharRoom, furnitureId: string): boolean {
  return room.storage.includes(furnitureId);
}

/** 房間裡擺著的家具（照位置順序） */
export function placedFurniture(room: CharRoom) {
  return ROOM_SLOTS.map((slot) => ({ slot, furniture: getFurniture(room.placements[slot.id]) })).filter(
    (x): x is { slot: (typeof ROOM_SLOTS)[number]; furniture: NonNullable<ReturnType<typeof getFurniture>> } => !!x.furniture,
  );
}

/**
 * 平常聊天用的一行房間描述（寫成重要事件，聊到房間或家具才送）：
 * 只列不是基本款的家具（最多 5 件）和展示櫃上的禮物（最多 3 個）
 */
export function roomSummary(
  room: CharRoom,
  names: { userName: string; charName: string },
  giftNames: string[],
): { content: string; keywords: string[] } {
  const { userName, charName } = names;
  const special = placedFurniture(room)
    .filter(({ furniture }) => !furniture.isDefault)
    .slice(0, 5)
    .map(({ furniture }) => furniture.name);
  const gifts = giftNames.slice(0, 3);
  const parts: string[] = [];
  if (special.length > 0) parts.push(`有${special.join("、")}`);
  if (gifts.length > 0) parts.push(`展示櫃上擺著${userName}送的${gifts.join("、")}`);
  const content = parts.length > 0 ? `${charName}的房間：${parts.join("，")}` : `${charName}的房間：簡單的單人床、書桌和衣櫃`;
  return { content, keywords: ["房間", ...special, ...gifts] };
}

/** 去他房間時給 AI 的完整說明；成人內容開啟時也列親密的玩法 */
export function roomVisitNote(
  room: CharRoom,
  names: { userName: string; charName: string },
  giftNames: string[],
  options: { adult: boolean; charStatus?: "sleep" | "busy" | null },
): string {
  const { userName, charName } = names;
  const lines = [`【${charName}的房間】${userName}現在在${charName}的房間裡。房間裡有：`];
  for (const { furniture } of placedFurniture(room)) {
    lines.push(`- ${furniture.name}：${furniture.hint}`);
  }
  if (giftNames.length > 0) lines.push(`- 牆上的展示櫃：擺著${userName}送的${giftNames.join("、")}`);
  if (options.charStatus === "sleep") lines.push(`${charName}正在床上睡覺，${userName}是偷偷進來的。`);
  if (options.charStatus === "busy") lines.push(`${charName}正坐在書桌前忙。`);
  if (options.adult) {
    const intimate = placedFurniture(room)
      .filter(({ furniture }) => !!furniture.intimateHint)
      .map(({ furniture }) => `- ${furniture.name}：${furniture.intimateHint}`);
    if (intimate.length > 0) {
      lines.push(`氣氛對了、兩人都願意的時候，這些東西可以讓親密的時刻有不同的變化（不用每次都用，順著劇情自然帶到）：`, ...intimate);
    }
  }
  lines.push(`可以自然地用到房間裡的東西；要離開房間時，在 </content> 後面輸出 <room-leave/>。`);
  return lines.join("\n");
}
