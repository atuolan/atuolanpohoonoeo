/**
 * 金幣的顯示。錢包裡可能有小數（紅包、轉帳以「分」計），畫面上只顯示整數：
 * - 餘額無條件捨去，免得顯示的比實際能花的多（顯示 100 就一定買得起 100 的東西）
 * - 「還差多少」無條件進位，免得差 0.25 卻顯示還差 0
 * 錢包本身的數字不動。
 */

// 小數相減的誤差（例如 99.99999999 其實是 100）不要被捨去成少 1
const EPSILON = 1e-6;

export function wholeCoins(value: number): number {
  return Number.isFinite(value) ? Math.floor(value + EPSILON) : 0;
}

export function formatCoins(value: number): string {
  return wholeCoins(value).toLocaleString("zh-TW");
}

export function formatCoinsShortfall(value: number): string {
  const n = Number.isFinite(value) ? Math.ceil(value - EPSILON) : 0;
  return n.toLocaleString("zh-TW");
}
