/**
 * 假時間計算工具（純函式，無 Vue 依賴）
 *
 * 將聊天的假時間設定（fakeTimeMode / fakeTimeLoop / fakeTimeOffset）
 * 換算成「當前有效時間」，供 store、service 等非 composable 環境共用。
 *
 * 行為需與 useChatFakeTime 的 getChatNow() 完全一致。
 */

import type { Chat } from "@/types/chat";

export type FakeTimeMode = "real" | "loop" | "offset";

export interface FakeTimeFields {
  fakeTimeMode?: FakeTimeMode;
  fakeTimeLoop?: {
    startDateTime: string;
    endDateTime: string;
  };
  fakeTimeOffset?: number;
}

/**
 * 計算輪迴時間：將真實時間映射到 [start, end] 的循環區間內
 */
export function computeLoopTime(now: Date, start: Date, end: Date): Date {
  const loopDuration = end.getTime() - start.getTime();
  if (loopDuration <= 0) return start;

  const elapsed = now.getTime() - start.getTime();
  const offset = ((elapsed % loopDuration) + loopDuration) % loopDuration;
  return new Date(start.getTime() + offset);
}

/**
 * 依據聊天的假時間設定計算「當前有效時間」。
 *
 * @param fields 聊天的假時間相關欄位（可直接傳入 Chat）
 * @param realNow 真實時間基準（預設 new Date()，便於測試）
 */
export function computeChatNow(
  fields: FakeTimeFields | Chat | undefined | null,
  realNow: Date = new Date(),
): Date {
  if (!fields) return realNow;

  const mode = fields.fakeTimeMode ?? "real";

  switch (mode) {
    case "loop": {
      const loop = fields.fakeTimeLoop;
      if (!loop?.startDateTime || !loop?.endDateTime) {
        return realNow;
      }
      const start = new Date(loop.startDateTime);
      const end = new Date(loop.endDateTime);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return realNow;
      return computeLoopTime(realNow, start, end);
    }
    case "offset": {
      return new Date(realNow.getTime() + (fields.fakeTimeOffset ?? 0));
    }
    default:
      return realNow;
  }
}
