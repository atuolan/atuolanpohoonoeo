/**
 * 「像真人一樣慢慢回」：回應一次生好，存進去的時間錯開
 * 第一則 3–6 分鐘後，之後每則間隔 1–5 分鐘，全部在 20 分鐘內
 */

const MIN = 60_000;
const WINDOW = 20 * MIN;

export function spreadReplyTimes(count: number, now: number, random: () => number = Math.random): number[] {
  if (count <= 0) return [];
  const offsets: number[] = [];
  let t = (3 + random() * 3) * MIN;
  for (let i = 0; i < count; i++) {
    if (i > 0) t += (1 + random() * 4) * MIN;
    offsets.push(t);
  }
  // 超過 20 分鐘就等比例壓回來（留一點空間給同時間錯開的 1 秒）
  const limit = WINDOW - count * 1000;
  const last = offsets[offsets.length - 1];
  const scale = last > limit ? limit / last : 1;
  const times: number[] = [];
  for (const offset of offsets) {
    const at = now + Math.round(offset * scale);
    const prev = times[times.length - 1];
    times.push(prev !== undefined && at <= prev ? prev + 1000 : at);
  }
  return times;
}
