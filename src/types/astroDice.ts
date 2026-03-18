// ============================================================
// 占星骰子（Astro Dice）類型定義
// ============================================================

/** 行星 */
export interface AstroPlanet {
  id: string;
  symbol: string;
  name: string;
  nameCn: string;
  keywords: string[];
  description: string;
}

/** 星座 */
export interface AstroSign {
  id: string;
  symbol: string;
  name: string;
  nameCn: string;
  element: "fire" | "earth" | "air" | "water";
  modality: "cardinal" | "fixed" | "mutable";
  keywords: string[];
  description: string;
}

/** 宮位 */
export interface AstroHouse {
  id: string;
  number: number;
  romanNumeral: string;
  name: string;
  nameCn: string;
  keywords: string[];
  description: string;
}

/** 骰子結果 */
export interface AstroDiceResult {
  planet: AstroPlanet;
  sign: AstroSign;
  house: AstroHouse;
}

/** 占星骰子記錄 */
export interface AstroDiceReading {
  id: string;
  question: string;
  result: AstroDiceResult;
  interpretation?: string;
  createdAt: number;
}

/** 占星骰子流程階段 */
export type AstroDicePhase = "question" | "roll" | "result" | "interpret";
