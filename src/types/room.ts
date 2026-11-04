/**
 * 像素房間：每個角色一間，存在 settings 表 char-room-${characterId}
 */
import type { CharSpriteConfig } from "@/data/pixelArt/character";
import type { RoomSlotId } from "@/data/roomFurniture";

export interface CharRoom {
  characterId: string;
  sprite: CharSpriteConfig;
  /** 每個位置放哪件家具（家具 id），null 是空的 */
  placements: Record<RoomSlotId, string | null>;
  /** 這個房間收起來的家具（換下來的） */
  storage: string[];
  lastArrangedBy?: "user" | "char";
  updatedAt: number;
}

/** 使用者去他房間時，存在 settings 表 room-visit-${chatId} */
export interface RoomVisit {
  chatId: string;
  characterId: string;
  startedAt: number;
}

/** 房間裡的角色在做什麼：站著、坐在書桌前、睡覺、不在 */
export type RoomPose = "stand" | "sit" | "sleep" | "away";
