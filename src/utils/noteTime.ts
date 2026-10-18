/**
 * 便利貼、心情便籤在提示詞裡的時間寫法：今天 14:20、昨天 22:05、10/15 09:30（本機時間）
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** timestamp 是 now 的幾天前（0 = 同一天，1 = 昨天） */
export function daysAgo(timestamp: number, now = Date.now()): number {
  // 用四捨五入吸收日光節約時間造成的一小時差
  return Math.round((startOfDay(now) - startOfDay(timestamp)) / DAY_MS);
}

export function formatNoteTime(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const dayDiff = daysAgo(timestamp, now);
  if (dayDiff === 0) return `今天 ${time}`;
  if (dayDiff === 1) return `昨天 ${time}`;
  return `${date.getMonth() + 1}/${date.getDate()} ${time}`;
}
