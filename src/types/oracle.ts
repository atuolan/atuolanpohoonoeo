// ============================================================
// 神諭卡（Oracle Card）類型定義
// ============================================================

/** 神諭牌主題分類 */
export type OracleTheme =
  | "self-love"     // 自我愛護
  | "courage"       // 勇氣行動
  | "healing"       // 療癒轉化
  | "relationship"  // 關係連結
  | "abundance"     // 豐盛顯化
  | "wisdom"        // 智慧洞見
  | "play"          // 玩樂喜悅
  | "truth"         // 誠實真相

/** 神諭牌 */
export interface OracleCard {
  id: string
  name: string       // 中文牌名（繁體）
  nameRaw: string    // 原始牌名（簡體，來自 APK）
  theme: OracleTheme
  /** 宇宙訊息（主要牌義） */
  message: string
  /** 深度解讀 */
  description: string
  /** 行動建議 */
  action: string
  /** 關鍵詞 */
  keywords: string[]
  /** 牌面圖片路徑（相對 public/） */
  image: string
  /** 代表顏色（hex） */
  color: string
  /** 代表符號（emoji） */
  symbol: string
}

/** 牌陣位置座標（百分比，0-100） */
export interface OraclePositionCoords {
  x: number   // 水平位置百分比
  y: number   // 垂直位置百分比
  rotate?: number  // 旋轉角度（可選）
  scale?: number   // 縮放比例（可選，預設 1）
}

/** 牌陣佈局類型 */
export type OracleLayoutType =
  | "single"      // 單張
  | "linear"      // 線性排列
  | "triangle"    // 三角形
  | "cross"       // 十字形
  | "circle"      // 圓形
  | "star"        // 星形
  | "custom"      // 自訂座標

/** 神諭牌牌陣位置 */
export interface OracleSpreadPosition {
  id: string
  name: string
  description: string
  coords: OraclePositionCoords
}

/** 神諭牌牌陣 */
export interface OracleSpread {
  id: string
  name: string
  subtitle: string
  description: string
  cardCount: number
  layoutType: OracleLayoutType
  positions: OracleSpreadPosition[]
  /** 牌陣適用情境標籤 */
  tags: string[]
  /** 背景漸層顏色（CSS gradient） */
  bgGradient?: string
}

/** 抽到的神諭牌 */
export interface OracleDrawnCard {
  card: OracleCard
  position: OracleSpreadPosition
  /** 抽牌時的宇宙訊息（可從 AI 生成或使用牌義） */
  cosmicMessage?: string
}

/** 神諭牌占卜記錄 */
export interface OracleReading {
  id: string
  question: string
  intention: string  // 意圖設定
  spread: OracleSpread
  drawnCards: OracleDrawnCard[]
  interpretation?: string
  createdAt: number
  type: "oracle"
}

/** 神諭牌占卜流程階段 */
export type OraclePhase =
  | "home"        // 首頁選擇
  | "intention"   // 設定意圖
  | "spread"      // 選擇牌陣
  | "shuffle"     // 洗牌冥想
  | "draw"        // 抽牌
  | "reveal"      // 翻牌揭示
  | "interpret"   // AI 解讀
  | "complete"    // 完成
