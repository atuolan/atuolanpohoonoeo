// ============================================================
// 占卜（塔羅／雷諾曼／神諭卡）共用型別
// 三種牌卡各自把原始資料轉成這套格式，畫面與流程只認這套
// ============================================================

export type DeckId = "tarot" | "lenormand" | "oracle";

/** 統一格式的牌 */
export interface DeckCard {
  id: string;
  /** 中文牌名 */
  name: string;
  /** 英文名或編號（可選） */
  subName?: string;
  image: string;
  keywords: { upright: string[]; reversed?: string[] };
  meaning: { upright: string; reversed?: string };
  /** 額外段落，例如雷諾曼的愛情／工作、神諭卡的行動建議 */
  extra?: { label: string; text: string }[];
}

/** 牌位座標（百分比 0-100） */
export interface SpreadCoords {
  x: number;
  y: number;
  rotate?: number;
}

export interface DeckSpreadPosition {
  id: string;
  name: string;
  description: string;
  coords: SpreadCoords;
}

export interface DeckSpread {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  /** 清單上的一句話簡介 */
  summary?: string;
  positions: DeckSpreadPosition[];
  /** 萬能牌陣：可自選張數 */
  flexible?: { min: number; max: number };
}

export interface DrawnCard {
  card: DeckCard;
  reversed: boolean;
  position: DeckSpreadPosition;
}

/** 統一格式的占卜紀錄（存檔仍用各牌組原本的格式） */
export interface ReadingRecord {
  id: string;
  deckId: DeckId;
  question: string;
  spread: DeckSpread;
  drawn: DrawnCard[];
  interpretation?: string;
  createdAt: number;
}

/** 洗好的牌堆中的一張 */
export interface ShuffledEntry {
  cardIndex: number;
  reversed: boolean;
}

/** 一種牌卡要提供的全部內容 */
export interface DeckDefinition {
  id: DeckId;
  label: string;
  tagline: string;
  cardCount: number;
  cards: DeckCard[];
  spreads: DeckSpread[];
  categories: string[];
  hasReversed: boolean;
  cardBack: string;
  thumbnail: string;
  /** gameStates 中的歷史紀錄 key */
  historyKey: string;
  buildPrompt(question: string, spread: DeckSpread, drawn: DrawnCard[]): string;
  /** 存檔格式 → 統一格式 */
  toRecord(raw: unknown): ReadingRecord;
  /** 統一格式 → 存檔格式 */
  fromRecord(record: ReadingRecord): unknown;
}

/** 解讀抽屜的三段高度 */
export type DrawerSnap = "peek" | "half" | "full";
