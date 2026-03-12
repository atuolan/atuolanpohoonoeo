/**
 * 聊天假時間 Composable
 * 管理每個聊天獨立的時間模式：真實時間 / 輪迴時間 / 偏移時間
 *
 * 偏移模式：用戶設定一個「假的現在」日期時間，之後時間正常流動
 *   例如設定 2024-07-01 12:00，過了真實 3 小時後，假時間就是 2024-07-01 15:00
 *
 * 輪迴模式：設定起始和結束日期時間，到達結束後自動回到起始，無限循環
 *
 * 跳轉時間：用戶輸入目標日期時間，偏移/輪迴模式下自動調整到那個時間點
 */

import type { Chat } from "@/types/chat";
import { ref, onUnmounted, watch } from "vue";

export type FakeTimeMode = "real" | "loop" | "offset";

export interface FakeTimeLoopConfig {
  startDateTime: string; // ISO string
  endDateTime: string; // ISO string
}

/**
 * 計算輪迴時間
 * 將真實時間映射到 [start, end] 的循環區間內
 */
function computeLoopTime(now: Date, start: Date, end: Date): Date {
  const loopDuration = end.getTime() - start.getTime();
  if (loopDuration <= 0) return start;

  const elapsed = now.getTime() - start.getTime();
  const offset = ((elapsed % loopDuration) + loopDuration) % loopDuration;
  return new Date(start.getTime() + offset);
}

function formatDateTime(d: Date): string {
  const y = d.getFullYear();
  const mon = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const weekDays = ["日", "一", "二", "三", "四", "五", "六"];
  return `${y}/${mon}/${day}（${weekDays[d.getDay()]}）${h}:${m}`;
}

export function useChatFakeTime() {
  const fakeTimeMode = ref<FakeTimeMode>("real");
  const fakeTimeLoop = ref<FakeTimeLoopConfig>({
    startDateTime: "",
    endDateTime: "",
  });

  // 偏移模式：存的是毫秒偏移量 = 用戶設定的假時間 - 設定當下的真實時間
  // 這樣之後 getChatNow() = realNow + offset，時間會正常流動
  const fakeTimeOffset = ref<number>(0);

  // 偏移模式的「設定的起始日期時間」（用於 UI 顯示，datetime-local 格式）
  const offsetStartDateTime = ref<string>("");

  const formattedFakeTime = ref<string>("");

  // 定時刷新假時間顯示（每秒更新一次，讓時間持續走動）
  let displayTimer: ReturnType<typeof setInterval> | null = null;

  function startDisplayTimer() {
    stopDisplayTimer();
    if (fakeTimeMode.value !== "real") {
      displayTimer = setInterval(() => {
        formattedFakeTime.value = formatDateTime(getChatNow());
      }, 1000);
    }
  }

  function stopDisplayTimer() {
    if (displayTimer !== null) {
      clearInterval(displayTimer);
      displayTimer = null;
    }
  }

  function getChatNow(): Date {
    const realNow = new Date();

    switch (fakeTimeMode.value) {
      case "loop": {
        if (
          !fakeTimeLoop.value.startDateTime ||
          !fakeTimeLoop.value.endDateTime
        ) {
          return realNow;
        }
        const start = new Date(fakeTimeLoop.value.startDateTime);
        const end = new Date(fakeTimeLoop.value.endDateTime);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return realNow;
        return computeLoopTime(realNow, start, end);
      }
      case "offset": {
        return new Date(realNow.getTime() + fakeTimeOffset.value);
      }
      default:
        return realNow;
    }
  }

  function refreshDisplay() {
    formattedFakeTime.value = formatDateTime(getChatNow());
    startDisplayTimer();
  }

  function setMode(mode: FakeTimeMode) {
    fakeTimeMode.value = mode;
    if (mode === "offset" && fakeTimeOffset.value === 0) {
      // 初次切換到偏移模式，預設為當前時間（偏移 0）
      offsetStartDateTime.value = toDatetimeLocal(new Date());
    }
    if (mode === "real") {
      stopDisplayTimer();
    }
    refreshDisplay();
  }

  function setLoopRange(start: string, end: string) {
    fakeTimeLoop.value = { startDateTime: start, endDateTime: end };
    refreshDisplay();
  }

  /**
   * 設定偏移模式的「假的現在」
   * 計算偏移量 = 目標時間 - 當前真實時間
   */
  function setOffsetFromDateTime(dateTimeStr: string) {
    const target = new Date(dateTimeStr);
    if (isNaN(target.getTime())) return;
    offsetStartDateTime.value = dateTimeStr;
    fakeTimeOffset.value = target.getTime() - Date.now();
    refreshDisplay();
  }

  /**
   * 跳轉時間（偏移模式和輪迴模式通用）
   * 用戶輸入一個目標日期時間字串，自動調整
   *
   * 偏移模式：重新計算偏移量，讓假時間跳到目標
   * 輪迴模式：不改變輪迴範圍，但調整一個額外偏移讓當前時間對齊目標
   *   （實際上輪迴模式的跳轉比較特殊，我們直接切到偏移模式更合理，
   *    或者在輪迴模式下跳轉就是把目標時間 clamp 到輪迴範圍內）
   *
   * 返回 true 表示跳轉成功
   */
  function jumpToTime(dateTimeStr: string): boolean {
    const target = new Date(dateTimeStr);
    if (isNaN(target.getTime())) return false;

    if (fakeTimeMode.value === "offset") {
      setOffsetFromDateTime(dateTimeStr);
      return true;
    }

    if (fakeTimeMode.value === "loop") {
      // 輪迴模式下，跳轉到輪迴範圍內的某個時間點
      // 我們通過調整 fakeTimeOffset 來實現（臨時偏移）
      const start = new Date(fakeTimeLoop.value.startDateTime);
      const end = new Date(fakeTimeLoop.value.endDateTime);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;

      // 確保目標在輪迴範圍內
      const loopDuration = end.getTime() - start.getTime();
      if (loopDuration <= 0) return false;

      // 計算目標在輪迴中的位置
      const targetInLoop =
        ((target.getTime() - start.getTime()) % loopDuration + loopDuration) %
        loopDuration;
      const targetTime = new Date(start.getTime() + targetInLoop);

      // 計算當前輪迴時間
      const currentLoopTime = computeLoopTime(new Date(), start, end);

      // 需要的偏移 = 目標輪迴時間 - 當前輪迴時間（加到真實時間上）
      const diff = targetTime.getTime() - currentLoopTime.getTime();
      // 用一個隱藏的偏移來實現跳轉（存在 fakeTimeOffset 裡）
      fakeTimeOffset.value = diff;
      refreshDisplay();
      return true;
    }

    return false;
  }

  function toDatetimeLocal(d: Date): string {
    const y = d.getFullYear();
    const mon = (d.getMonth() + 1).toString().padStart(2, "0");
    const day = d.getDate().toString().padStart(2, "0");
    const h = d.getHours().toString().padStart(2, "0");
    const m = d.getMinutes().toString().padStart(2, "0");
    return `${y}-${mon}-${day}T${h}:${m}`;
  }

  function loadFromChat(chat: Chat) {
    fakeTimeMode.value = chat.fakeTimeMode ?? "real";
    fakeTimeLoop.value = chat.fakeTimeLoop ?? {
      startDateTime: "",
      endDateTime: "",
    };
    fakeTimeOffset.value = chat.fakeTimeOffset ?? 0;

    // 從偏移量反算出「設定的起始時間」用於 UI 顯示
    if (fakeTimeMode.value === "offset" && fakeTimeOffset.value !== 0) {
      offsetStartDateTime.value = toDatetimeLocal(
        new Date(Date.now() + fakeTimeOffset.value),
      );
    } else {
      offsetStartDateTime.value = toDatetimeLocal(new Date());
    }

    refreshDisplay();
  }

  function toChatFields(): Partial<Chat> {
    return {
      fakeTimeMode: fakeTimeMode.value,
      fakeTimeLoop:
        fakeTimeMode.value === "loop"
          ? { ...fakeTimeLoop.value }
          : undefined,
      fakeTimeOffset:
        fakeTimeMode.value === "offset" || fakeTimeMode.value === "loop"
          ? fakeTimeOffset.value
          : undefined,
    };
  }

  return {
    fakeTimeMode,
    fakeTimeLoop,
    fakeTimeOffset,
    offsetStartDateTime,
    getChatNow,
    formattedFakeTime,
    refreshDisplay,
    setMode,
    setLoopRange,
    setOffsetFromDateTime,
    jumpToTime,
    loadFromChat,
    toChatFields,
    stopDisplayTimer,
  };
}
