import type { DeckSpread, DeckSpreadPosition } from "@/types/divination";

export const FLEXIBLE_MIN = 1;
export const FLEXIBLE_MAX = 10;
export const FLEXIBLE_DEFAULT = 3;

/** 萬能牌陣每排的張數 */
export function flexibleRows(n: number): number[] {
  if (n <= 3) return [n];
  if (n === 4) return [2, 2];
  if (n <= 6) return [3, n - 3];
  if (n <= 8) return [4, n - 4];
  if (n === 9) return [3, 3, 3];
  return [5, n - 5];
}

const ROW_Y: Record<number, number[]> = {
  1: [50],
  2: [30, 70],
  3: [20, 50, 80],
};

const round1 = (v: number) => Math.round(v * 10) / 10;

/** 產生萬能牌陣的牌位（第 1 張…第 N 張），排成置中的行列 */
export function buildFlexiblePositions(n: number): DeckSpreadPosition[] {
  const rows = flexibleRows(n);
  const ys = ROW_Y[rows.length];
  const maxK = Math.max(...rows);
  const step = maxK > 1 ? 70 / (maxK - 1) : 0;

  const positions: DeckSpreadPosition[] = [];
  rows.forEach((k, row) => {
    for (let i = 0; i < k; i++) {
      const index = positions.length + 1;
      positions.push({
        id: `flex-${index}`,
        name: `第 ${index} 張`,
        description: `第 ${index} 張牌，依提問自由解讀`,
        coords: { x: round1(50 + (i - (k - 1) / 2) * step), y: ys[row] },
      });
    }
  });
  return positions;
}

/** 萬能牌陣依張數產生牌位；一般牌陣原樣回傳 */
export function resolveSpread(spread: DeckSpread, count: number): DeckSpread {
  if (!spread.flexible) return spread;
  const n = Math.min(spread.flexible.max, Math.max(spread.flexible.min, Math.round(count)));
  return { ...spread, positions: buildFlexiblePositions(n) };
}
