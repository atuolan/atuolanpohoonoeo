/**
 * 起卦時間 → 四柱、月建、日辰、旬空
 * 年月以節氣交接時刻換（立春換年、節換月），日以 23:00 子時換日，跟排盤軟體一致
 * lunar-javascript 動態載入，只有打開六爻才下載
 */
import type { Dizhi, GanzhiTime, Tiangan } from "@/types/liuyao";

/** lunar-javascript 回傳簡體字，換成繁體 */
const TO_TRAD: Record<string, string> = { 闰: "閏", 腊: "臘" };

function toTrad(s: string): string {
  return s.replace(/[闰腊]/g, (c) => TO_TRAD[c] ?? c);
}

export async function getGanzhiTime(timestamp: number): Promise<GanzhiTime> {
  const { Solar } = await import("lunar-javascript");
  const lunar = Solar.fromDate(new Date(timestamp)).getLunar();
  const xk = lunar.getDayXunKongExact();
  return {
    timestamp,
    year: lunar.getYearInGanZhiExact(),
    month: lunar.getMonthInGanZhiExact(),
    day: lunar.getDayInGanZhiExact(),
    hour: lunar.getTimeInGanZhi(),
    monthZhi: lunar.getMonthZhiExact() as Dizhi,
    dayGan: lunar.getDayGanExact() as Tiangan,
    dayZhi: lunar.getDayZhiExact() as Dizhi,
    xunKong: [xk[0] as Dizhi, xk[1] as Dizhi],
    lunarText: `農曆${toTrad(lunar.getMonthInChinese())}月${lunar.getDayInChinese()} ${lunar.getTimeZhi()}時`,
  };
}
