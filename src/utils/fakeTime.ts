/**
 * 假時間計算工具（純函式，無 Vue 依賴）
 *
 * 將聊天的假時間設定（fakeTimeMode / fakeTimeLoop / fakeTimeOffset）
 * 換算成「當前有效時間」，供 store、service 等非 composable 環境共用。
 *
 * useChatFakeTime 的 getChatNow() 直接呼叫這裡，兩者行為一致。
 */

import type { Chat } from "@/types/chat";

export type FakeTimeMode = "real" | "loop" | "offset" | "story";

export interface FakeTimeFields {
  fakeTimeMode?: FakeTimeMode;
  fakeTimeLoop?: {
    startDateTime: string;
    endDateTime: string;
  };
  /**
   * 偏移模式：假時間 = 真實時間 + offset
   * 輪迴模式：先加上 offset 再映射進輪迴區間（用於「從起點開始跑」與「跳轉」）
   */
  fakeTimeOffset?: number;
  /** 劇情時鐘：暫停中（面對面）時的劇情時間；undefined 表示跟著現實流動 */
  storyClockPausedAt?: number;
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

/** 解析輪迴區間，無效（缺值、格式錯誤、結束不晚於起始）時回傳 null */
export function parseLoopRange(
  loop: FakeTimeFields["fakeTimeLoop"],
): { start: Date; end: Date } | null {
  if (!loop?.startDateTime || !loop?.endDateTime) return null;
  const start = new Date(loop.startDateTime);
  const end = new Date(loop.endDateTime);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  if (end.getTime() <= start.getTime()) return null;
  return { start, end };
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
  const offset = fields.fakeTimeOffset ?? 0;

  switch (mode) {
    case "loop": {
      const range = parseLoopRange(fields.fakeTimeLoop);
      if (!range) return realNow;
      return computeLoopTime(
        new Date(realNow.getTime() + offset),
        range.start,
        range.end,
      );
    }
    case "offset": {
      return new Date(realNow.getTime() + offset);
    }
    case "story": {
      // 面對面時暫停：停在劇情時間；線上時從最後的劇情時間繼續跟著現實走
      const paused = fields.storyClockPausedAt;
      if (typeof paused === "number" && Number.isFinite(paused)) {
        return new Date(paused);
      }
      return new Date(realNow.getTime() + offset);
    }
    default:
      return realNow;
  }
}

/**
 * 取得訊息的「劇情時間」（毫秒）。
 *
 * 新訊息在建立時會記下 storyTime（當下的聊天有效時間），之後切換模式或跳轉都不影響。
 * 舊訊息沒有 storyTime，退回「真實發送時間 + 目前的偏移量」，與過去的行為一致。
 */
export function resolveStoryTime(
  msg: { storyTime?: number; timestamp?: number; createdAt?: number },
  fallbackOffsetMs = 0,
): number {
  if (typeof msg.storyTime === "number" && Number.isFinite(msg.storyTime)) {
    return msg.storyTime;
  }
  const real = msg.timestamp ?? msg.createdAt ?? Date.now();
  return real + fallbackOffsetMs;
}

/** 只替「剛建立」的訊息補上 storyTime，避免把舊訊息誤標成目前的時間 */
export const STORY_TIME_STAMP_WINDOW_MS = 2 * 60 * 1000;

/**
 * 從陣列尾端往前，為新加入且尚未標記的訊息寫入 storyTime。
 * 遇到已標記或已超過時間窗口的訊息就停止（舊訊息維持無標記，走 fallback）。
 */
export function stampStoryTimes(
  messages: Array<{ storyTime?: number; timestamp?: number }>,
  getChatNow: () => Date,
  realNowMs: number = Date.now(),
): void {
  let offset: number | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || typeof m.storyTime === "number") break;
    const ts = m.timestamp;
    if (typeof ts !== "number" || realNowMs - ts > STORY_TIME_STAMP_WINDOW_MS) break;
    if (offset === null) offset = getChatNow().getTime() - realNowMs;
    m.storyTime = ts + offset;
  }
}
