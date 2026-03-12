/**
 * 節日檢測工具
 * 純函式，不依賴 Vue/Pinia/IndexedDB，可在任何地方安全 import。
 *
 * 邏輯來源：Aguaphone1/src/utils/holidayDetector.ts（完全保留原邏輯）
 */

import {
  fixedHolidays,
  holidayTopicMap,
  lunarDayNames,
  lunarHolidays,
  lunarMonthNames,
  lunarNewMoons,
} from "@/data/holidayData";
import type { Holiday } from "@/types/holiday";

/**
 * 根據年份取得當年所有節日（含農曆轉換後的公曆日期）
 */
export function getHolidaysForYear(year: number): Holiday[] {
  const result: Holiday[] = [...fixedHolidays];

  for (const entry of lunarHolidays) {
    const dateStr = entry.dates[year];
    if (dateStr) {
      result.push({
        name: entry.name,
        date: dateStr,
        greeting: entry.greeting,
        suggestionAmount: entry.suggestionAmount,
        aiPrompt: entry.aiPrompt,
      });
    }
  }

  return result;
}

/** 當年的節日列表（向後兼容） */
export const holidays: Holiday[] = getHolidaysForYear(
  new Date().getFullYear(),
);

/**
 * 檢測今天是否是節日
 * @returns 如果是節日，返回節日信息；否則返回 null
 */
export function detectTodayHoliday(): Holiday | null {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const todayStr = `${month}-${day}`;

  const allHolidays = getHolidaysForYear(year);
  return allHolidays.find((h) => h.date === todayStr) || null;
}

/**
 * 檢測即將到來的節日
 * @param days 未來幾天內（預設 3 天）
 * @returns 節日列表
 */
export function detectUpcomingHolidays(days: number = 3): Holiday[] {
  const today = new Date();
  const upcoming: Holiday[] = [];

  for (let i = 1; i <= days; i++) {
    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + i);

    const futureYear = futureDate.getFullYear();
    const month = String(futureDate.getMonth() + 1).padStart(2, "0");
    const day = String(futureDate.getDate()).padStart(2, "0");
    const dateStr = `${month}-${day}`;

    const allHolidays = getHolidaysForYear(futureYear);
    const holiday = allHolidays.find((h) => h.date === dateStr);
    if (holiday) {
      upcoming.push(holiday);
    }
  }

  return upcoming;
}

/**
 * 獲取節日相關的話題提示
 */
export function getHolidayTopics(holiday: Holiday): string[] {
  return holidayTopicMap[holiday.name] || ["節日", "慶祝", "快樂"];
}

/**
 * 取得指定公曆日期的農曆日期字串
 * @param date 公曆日期
 * @returns 例如 "正月初一"、"臘月廿九"、"閏六月十五"，查不到時返回 null
 */
export function getLunarDateString(date: Date): string | null {
  const year = date.getFullYear();
  const targetTime = new Date(
    year,
    date.getMonth(),
    date.getDate(),
  ).getTime();

  // 需要查當年和前一年的資料（年初可能屬於前一年農曆）
  const yearsToCheck = [year - 1, year, year + 1];

  // 收集所有農曆月初一，按公曆日期排序
  const allEntries: {
    lunarYear: number;
    lunarMonth: number;
    isLeap: boolean;
    solarTime: number;
  }[] = [];

  for (const y of yearsToCheck) {
    const months = lunarNewMoons[y];
    if (!months) continue;
    for (const [lm, sm, sd] of months) {
      const isLeap = lm < 0;
      const actualMonth = Math.abs(lm);
      let solarYear = y;
      // 農曆月份的公曆年份可能跨年
      if (actualMonth >= 11 && sm <= 2) {
        solarYear = y + 1;
      }
      const solarTime = new Date(solarYear, sm - 1, sd).getTime();
      allEntries.push({
        lunarYear: y,
        lunarMonth: actualMonth,
        isLeap,
        solarTime,
      });
    }
  }

  // 按公曆時間排序
  allEntries.sort((a, b) => a.solarTime - b.solarTime);

  // 找到目標日期落在哪個農曆月
  for (let i = allEntries.length - 1; i >= 0; i--) {
    if (targetTime >= allEntries[i].solarTime) {
      const entry = allEntries[i];
      const dayDiff = Math.round(
        (targetTime - entry.solarTime) / (1000 * 60 * 60 * 24),
      );
      const lunarDay = dayDiff + 1; // 初一 = 1

      if (lunarDay < 1 || lunarDay > 30) return null;

      const monthName = entry.isLeap
        ? `閏${lunarMonthNames[entry.lunarMonth]}`
        : lunarMonthNames[entry.lunarMonth];

      return `${monthName}${lunarDayNames[lunarDay]}`;
    }
  }

  return null;
}
