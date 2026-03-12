// ============================================================
// 塔羅占卜（Fate App）類型定義
// ============================================================

/** 花色 */
export type FateSuit = 'wands' | 'cups' | 'swords' | 'pentacles'

/** 牌類型 */
export type FateCardType = 'major' | 'minor'

/** 塔羅牌 */
export interface FateCard {
  id: string
  name: string
  nameCn: string
  type: FateCardType
  suit?: FateSuit
  number: number
  /** 牌面圖片路徑（相對於 public/） */
  image: string
  keywords: {
    upright: string[]
    reversed: string[]
  }
  meaning: {
    upright: string
    reversed: string
  }
}

/** 牌陣位置 */
export interface FateSpreadPosition {
  id: string
  name: string
  nameCn: string
  description: string
}

/** 牌陣 */
export interface FateSpread {
  id: string
  name: string
  nameCn: string
  description: string
  positions: FateSpreadPosition[]
}

/** 抽到的牌 */
export interface FateDrawnCard {
  card: FateCard
  isReversed: boolean
  position: FateSpreadPosition
}

/** 占卜記錄 */
export interface FateReading {
  id: string
  question: string
  spread: FateSpread
  drawnCards: FateDrawnCard[]
  interpretation?: string
  createdAt: number
}

/** 占卜流程階段 */
export type FatePhase = 'question' | 'spread' | 'shuffle' | 'pick' | 'draw' | 'reveal' | 'interpret'
