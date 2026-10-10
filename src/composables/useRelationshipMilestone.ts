/**
 * useRelationshipMilestone
 * 紀念日組件：下一個里程碑（100 天倍數、週年、520、1314）與最近一筆約定。
 */

import { ref, watch, type Ref } from "vue";
import { db, DB_STORES } from "@/db/database";
import type { ImportantEvent, ImportantEventsLog } from "@/types/importantEvents";

export interface Milestone {
  /** 里程碑天數 */
  day: number;
  /** 顯示用：第 100 天 / 1 週年 */
  label: string;
  /** 還有幾天；0 表示就是今天 */
  daysLeft: number;
}

const SPECIAL_DAYS = [520, 1314];

function milestoneLabel(day: number): string {
  return day % 365 === 0 ? `${day / 365} 週年` : `第 ${day} 天`;
}

function isMilestone(day: number): boolean {
  return day % 100 === 0 || day % 365 === 0 || SPECIAL_DAYS.includes(day);
}

/** 今天剛好是里程碑就回傳今天（daysLeft 0），否則回傳最近的未來里程碑 */
export function getNextMilestone(knownDays: number): Milestone {
  if (knownDays > 0 && isMilestone(knownDays)) {
    return { day: knownDays, label: milestoneLabel(knownDays), daysLeft: 0 };
  }
  const candidates = [
    (Math.floor(knownDays / 100) + 1) * 100,
    (Math.floor(knownDays / 365) + 1) * 365,
    ...SPECIAL_DAYS.filter((d) => d > knownDays),
  ];
  const day = Math.min(...candidates);
  return { day, label: milestoneLabel(day), daysLeft: day - knownDays };
}

/** 最新的約定；沒有約定就取最新的關係事件 */
export function pickLatestPromise(events: ImportantEvent[]): ImportantEvent | null {
  const latest = (category: ImportantEvent["category"]) =>
    events
      .filter((e) => e.category === category && e.content?.trim())
      .sort((a, b) => b.timestamp - a.timestamp)[0];
  return latest("promise") ?? latest("relationship") ?? null;
}

export function useLatestPromise(
  characterId: Ref<string | null>,
  chatId: Ref<string | null>,
) {
  const promise = ref<ImportantEvent | null>(null);

  watch(
    [characterId, chatId],
    async ([charId, cId]) => {
      promise.value = null;
      if (!charId) return;
      try {
        await db.init();
        // 重要事件記錄本以 chatId 為 key，舊資料用 characterId
        const log =
          (cId
            ? await db.get<ImportantEventsLog>(DB_STORES.IMPORTANT_EVENTS, cId)
            : undefined) ??
          (await db.get<ImportantEventsLog>(DB_STORES.IMPORTANT_EVENTS, charId));
        promise.value = pickLatestPromise(log?.events ?? []);
      } catch (e) {
        console.error("[useLatestPromise] load failed:", e);
      }
    },
    { immediate: true },
  );

  return { promise };
}
