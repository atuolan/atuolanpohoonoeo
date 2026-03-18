// ============================================================
// 雷諾曼牌（Lenormand）類型定義
// ============================================================

/** 雷諾曼牌 */
export interface LenormandCard {
  id: string;
  number: number;
  name: string;
  nameCn: string;
  symbol: string;
  keywords: string[];
  meaning: {
    general: string;
    love: string;
    work: string;
    advice: string;
  };
  combinations: Record<string, string>; // 與其他牌的組合意義
}

/** 雷諾曼牌陣位置 */
export interface LenormandSpreadPosition {
  id: string;
  name: string;
  nameCn: string;
  description: string;
}

/** 雷諾曼牌陣 */
export interface LenormandSpread {
  id: string;
  name: string;
  nameCn: string;
  description: string;
  positions: LenormandSpreadPosition[];
}

/** 抽到的雷諾曼牌 */
export interface LenormandDrawnCard {
  card: LenormandCard;
  position: LenormandSpreadPosition;
}

/** 雷諾曼牌占卜記錄 */
export interface LenormandReading {
  id: string;
  question: string;
  spread: LenormandSpread;
  drawnCards: LenormandDrawnCard[];
  interpretation?: string;
  createdAt: number;
}

/** 雷諾曼牌流程階段 */
export type LenormandPhase =
  | "question"
  | "spread"
  | "shuffle"
  | "pick"
  | "result"
  | "interpret";
