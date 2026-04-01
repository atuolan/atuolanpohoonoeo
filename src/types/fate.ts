// ============================================================
// 塔羅占卜（Fate App）類型定義
// ============================================================

/** 花色 */
export type FateSuit = "wands" | "cups" | "swords" | "pentacles";

/** 牌類型 */
export type FateCardType = "major" | "minor";

/** 塔羅牌 */
export interface FateCard {
  id: string;
  name: string;
  nameCn: string;
  type: FateCardType;
  suit?: FateSuit;
  number: number;
  /** 牌面圖片路徑（相對於 public/） */
  image: string;
  keywords: {
    upright: string[];
    reversed: string[];
  };
  meaning: {
    upright: string;
    reversed: string;
  };
}

/** 牌陣位置座標（百分比，0-100）*/
export interface FatePositionCoords {
  x: number;
  y: number;
  rotate?: number;
  scale?: number;
}

/** 牌陣佈局類型 */
export type FateLayoutType =
  | "single"
  | "linear"
  | "triangle"
  | "cross"
  | "circle"
  | "star"
  | "horseshoe"
  | "celtic-cross"
  | "custom";

/** 牌陣位置 */
export interface FateSpreadPosition {
  id: string;
  name: string;
  nameCn: string;
  description: string;
  /** 百分比座標（可選，用於視覺化佈局） */
  coords?: FatePositionCoords;
}

/** 牌陣 */
export interface FateSpread {
  id: string;
  name: string;
  nameCn: string;
  description: string;
  positions: FateSpreadPosition[];
  /** 佈局類型（可選，用於視覺化） */
  layoutType?: FateLayoutType;
  /** 背景漸層（可選） */
  bgGradient?: string;
}

/** 抽到的牌 */
export interface FateDrawnCard {
  card: FateCard;
  isReversed: boolean;
  position: FateSpreadPosition;
}

/** 占卜記錄 */
export interface FateReading {
  id: string;
  question: string;
  spread: FateSpread;
  drawnCards: FateDrawnCard[];
  interpretation?: string;
  createdAt: number;
  type?: "tarot";
}

/** 占卜流程階段 */
export type FatePhase =
  | "home"
  | "setup"
  | "shuffle"
  | "pick"
  | "draw"
  | "reveal"
  | "interpret";
