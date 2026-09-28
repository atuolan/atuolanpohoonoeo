/**
 * 聊天假時間 Composable
 * 管理每個聊天獨立的時間模式：真實時間 / 輪迴時間 / 偏移時間
 *
 * 偏移模式：用戶設定一個「假的現在」日期時間，之後時間正常流動
 *   例如設定 2024-07-01 12:00，過了真實 3 小時後，假時間就是 2024-07-01 15:00
 *
 * 輪迴模式：設定起始和結束日期時間，設定當下從起始開始跑，到達結束後回到起始，無限循環
 *
 * 劇情時鐘：線上聊天時跟著現實流動；進入面對面就暫停，只隨劇情推進
 *   （AI 依劇情輸出 <time-advance>/<time-jump>，或用戶手動調整），
 *   切回線上時從最後的劇情時間繼續走
 *
 * 跳轉時間：用戶輸入目標日期時間，偏移/輪迴/劇情模式下自動調整到那個時間點
 */

import type { Chat } from "@/types/chat";
import { computed, ref } from "vue";
import {
  computeChatNow,
  parseLoopRange,
} from "@/utils/fakeTime";
import type { FakeTimeMode } from "@/utils/fakeTime";

export type { FakeTimeMode } from "@/utils/fakeTime";

export interface FakeTimeLoopConfig {
  startDateTime: string; // ISO string
  endDateTime: string; // ISO string
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

function toDatetimeLocal(d: Date): string {
  const y = d.getFullYear();
  const mon = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${y}-${mon}-${day}T${h}:${m}`;
}

export interface UseChatFakeTimeOptions {
  /**
   * 最後一則對話訊息的劇情時間（毫秒）；沒有訊息時回傳 null。
   * 劇情時鐘進入面對面時從這裡接續，而不是跳到現實的「現在」。
   */
  getLastMessageStoryTime?: () => number | null;
}

export function useChatFakeTime(options: UseChatFakeTimeOptions = {}) {
  const fakeTimeMode = ref<FakeTimeMode>("real");
  const fakeTimeLoop = ref<FakeTimeLoopConfig>({
    startDateTime: "",
    endDateTime: "",
  });

  // 偏移模式：假時間 = 真實時間 + offset，時間會正常流動
  // 輪迴模式：先加上 offset 再映射進輪迴區間（讓設定當下從起點開始、並支援跳轉）
  const fakeTimeOffset = ref<number>(0);

  // 偏移/劇情模式的「目前劇情時間」（用於 UI 輸入框，datetime-local 格式）
  const offsetStartDateTime = ref<string>("");

  // 劇情時鐘：暫停中的劇情時間（面對面時），null 表示跟著現實流動
  const storyClockPausedAt = ref<number | null>(null);
  // 由 ChatScreen 同步的面對面狀態，決定劇情時鐘是否暫停
  let isFaceToFace = false;
  // 面對面開場：進入面對面的現實時間（毫秒）。第一輪 AI 回覆會依前文決定見面時間，之後清除
  const storyOpeningSince = ref<number | null>(null);

  const isStoryClockPaused = computed(
    () => fakeTimeMode.value === "story" && storyClockPausedAt.value !== null,
  );
  const isStoryOpeningPending = computed(
    () => isStoryClockPaused.value && storyOpeningSince.value !== null,
  );

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
    return computeChatNow({
      fakeTimeMode: fakeTimeMode.value,
      fakeTimeLoop: fakeTimeLoop.value,
      fakeTimeOffset: fakeTimeOffset.value,
      storyClockPausedAt: storyClockPausedAt.value ?? undefined,
    });
  }

  function refreshDisplay() {
    const now = getChatNow();
    formattedFakeTime.value = formatDateTime(now);
    // 輸入框顯示「目前的劇情時間」，避免停在很久以前設定的值
    if (fakeTimeMode.value === "offset" || fakeTimeMode.value === "story") {
      offsetStartDateTime.value = toDatetimeLocal(now);
    }
    startDisplayTimer();
  }

  /** 把劇情時間設成指定值：暫停中直接改暫停點，流動中改偏移量 */
  function setStoryNow(targetMs: number) {
    // 已經明確決定了時間，面對面開場不必再交給 AI 判斷
    storyOpeningSince.value = null;
    if (isStoryClockPaused.value) {
      storyClockPausedAt.value = targetMs;
    } else {
      fakeTimeOffset.value = targetMs - Date.now();
    }
  }

  /**
   * 同步面對面狀態（劇情時鐘用）
   * 進入面對面：停在當下的劇情時間；離開面對面：從停下的時間繼續跟著現實走
   */
  /** 最後一則訊息的劇情時間；沒有訊息時退回目前的聊天時間 */
  function getResumeTime(): number {
    return options.getLastMessageStoryTime?.() ?? getChatNow().getTime();
  }

  /**
   * 舊訊息（沒有 storyTime）換算劇情時間時要加的偏移。
   * 偏移／輪迴沿用過去「現實時間 + 目前偏移」的算法；
   * 真實／劇情時鐘的舊訊息就是在現實時間發生的，不加偏移。
   */
  function getLegacyOffsetMs(): number {
    if (fakeTimeMode.value === "offset" || fakeTimeMode.value === "loop") {
      return getChatNow().getTime() - Date.now();
    }
    return 0;
  }

  function syncFaceToFace(faceToFace: boolean) {
    isFaceToFace = faceToFace;
    if (fakeTimeMode.value !== "story") return;
    if (faceToFace && storyClockPausedAt.value === null) {
      // 先停在最後一則訊息的時間（現實隔了多久都不影響劇情），
      // 實際的見面時間交給第一輪 AI 依前文判斷
      storyClockPausedAt.value = getResumeTime();
      storyOpeningSince.value = Date.now();
      refreshDisplay();
    } else if (!faceToFace && storyClockPausedAt.value !== null) {
      fakeTimeOffset.value = storyClockPausedAt.value - Date.now();
      storyClockPausedAt.value = null;
      storyOpeningSince.value = null;
      refreshDisplay();
    }
  }

  /**
   * 讓劇情時間往後推進（AI 的 <time-advance> 或手動快捷鍵）
   * 真實時間模式無法推進，回傳 false
   */
  function advanceBy(minutes: number): boolean {
    if (!Number.isFinite(minutes) || minutes <= 0) return false;
    if (fakeTimeMode.value === "real") return false;
    const ms = Math.round(minutes * 60 * 1000);
    storyOpeningSince.value = null;
    if (isStoryClockPaused.value) {
      storyClockPausedAt.value = storyClockPausedAt.value! + ms;
    } else {
      fakeTimeOffset.value += ms;
    }
    refreshDisplay();
    return true;
  }

  /**
   * 取出並清除面對面開場標記，回傳進入面對面的現實時間。
   * 開場這輪若 AI 跳轉了時間，這段期間的訊息要一起改成見面時間。
   */
  function consumeStoryOpening(): number | null {
    if (!isStoryOpeningPending.value) return null;
    const since = storyOpeningSince.value;
    storyOpeningSince.value = null;
    return since;
  }

  /** 把劇情時間拉回最後一則訊息的時間（手動修正用） */
  function resumeFromLastMessage(): boolean {
    const last = options.getLastMessageStoryTime?.();
    if (last == null || fakeTimeMode.value !== "story") return false;
    setStoryNow(last);
    refreshDisplay();
    return true;
  }


  /** 輪迴區間是否有效（兩端都有值且結束晚於起始） */
  function isLoopRangeValid(): boolean {
    return parseLoopRange(fakeTimeLoop.value) !== null;
  }

  /** 讓輪迴時間從起始點開始跑 */
  function anchorLoopToStart() {
    const range = parseLoopRange(fakeTimeLoop.value);
    fakeTimeOffset.value = range ? range.start.getTime() - Date.now() : 0;
  }

  function setMode(mode: FakeTimeMode) {
    if (mode === fakeTimeMode.value) {
      refreshDisplay();
      return;
    }
    const previousNow = getChatNow().getTime();
    // 各模式的 offset 意義不同，切換時重置，避免把上一個模式的偏移帶過來
    fakeTimeMode.value = mode;
    fakeTimeOffset.value = 0;
    storyClockPausedAt.value = null;
    storyOpeningSince.value = null;
    if (mode === "offset") {
      // 初次切換到偏移模式，預設為當前時間（偏移 0）
      offsetStartDateTime.value = toDatetimeLocal(new Date());
    } else if (mode === "loop") {
      anchorLoopToStart();
    } else if (mode === "story") {
      // 線上：從切換前的聊天時間接著走（原本是真實時間就還是真實時間）
      // 面對面：立刻暫停在最後一則訊息的時間
      fakeTimeOffset.value = previousNow - Date.now();
      syncFaceToFace(isFaceToFace);
    } else {
      stopDisplayTimer();
    }
    refreshDisplay();
  }

  /** 設定輪迴區間；區間有效時從起始時間開始跑 */
  function setLoopRange(start: string, end: string) {
    fakeTimeLoop.value = { startDateTime: start, endDateTime: end };
    anchorLoopToStart();
    refreshDisplay();
  }

  /**
   * 設定偏移/劇情模式的「假的現在」
   * 偏移：偏移量 = 目標時間 - 當前真實時間；劇情時鐘暫停中則直接停在目標時間
   */
  function setOffsetFromDateTime(dateTimeStr: string) {
    const target = new Date(dateTimeStr);
    if (isNaN(target.getTime())) return;
    offsetStartDateTime.value = dateTimeStr;
    if (fakeTimeMode.value === "story") {
      setStoryNow(target.getTime());
    } else {
      fakeTimeOffset.value = target.getTime() - Date.now();
    }
    refreshDisplay();
  }

  /**
   * 跳轉時間（偏移模式和輪迴模式通用）
   *
   * 偏移模式：重新計算偏移量，讓假時間跳到目標
   * 輪迴模式：目標必須落在輪迴區間內，跳過去後繼續在區間內循環
   *
   * 返回 true 表示跳轉成功；失敗時回傳錯誤訊息
   */
  function jumpToTime(dateTimeStr: string): true | string {
    const target = new Date(dateTimeStr);
    if (isNaN(target.getTime())) return "時間格式不正確";

    if (fakeTimeMode.value === "offset" || fakeTimeMode.value === "story") {
      setOffsetFromDateTime(dateTimeStr);
      return true;
    }

    if (fakeTimeMode.value === "loop") {
      const range = parseLoopRange(fakeTimeLoop.value);
      if (!range) return "請先設定有效的輪迴起始與結束時間";
      if (
        target.getTime() < range.start.getTime() ||
        target.getTime() >= range.end.getTime()
      ) {
        return "輪迴模式只能跳到起始與結束之間的時間";
      }
      // computeChatNow 會把 (real + offset) 映射進區間；目標在區間內時，
      // offset = 目標 - 現在 即可讓當下的輪迴時間等於目標
      fakeTimeOffset.value = target.getTime() - Date.now();
      refreshDisplay();
      return true;
    }

    return "真實時間模式不能跳轉";
  }

  function loadFromChat(chat: Chat) {
    fakeTimeMode.value = chat.fakeTimeMode ?? "real";
    fakeTimeLoop.value = chat.fakeTimeLoop ?? {
      startDateTime: "",
      endDateTime: "",
    };
    fakeTimeOffset.value = chat.fakeTimeOffset ?? 0;
    storyClockPausedAt.value =
      fakeTimeMode.value === "story" && typeof chat.storyClockPausedAt === "number"
        ? chat.storyClockPausedAt
        : null;
    storyOpeningSince.value =
      storyClockPausedAt.value !== null &&
      typeof chat.storyClockOpeningSince === "number"
        ? chat.storyClockOpeningSince
        : null;
    isFaceToFace = chat.faceToFaceMode === true;
    // 舊資料或同步差異：面對面狀態與暫停狀態不一致時補齊
    syncFaceToFace(isFaceToFace);

    offsetStartDateTime.value = toDatetimeLocal(getChatNow());
    refreshDisplay();
  }

  function toChatFields(): Partial<Chat> {
    return {
      fakeTimeMode: fakeTimeMode.value,
      // 切到其他模式時仍保留輪迴區間，切回來不用重填
      fakeTimeLoop:
        fakeTimeLoop.value.startDateTime || fakeTimeLoop.value.endDateTime
          ? { ...fakeTimeLoop.value }
          : undefined,
      fakeTimeOffset:
        fakeTimeMode.value !== "real" ? fakeTimeOffset.value : undefined,
      storyClockPausedAt:
        fakeTimeMode.value === "story" && storyClockPausedAt.value !== null
          ? storyClockPausedAt.value
          : undefined,
      storyClockOpeningSince: isStoryOpeningPending.value
        ? storyOpeningSince.value!
        : undefined,
    };
  }

  return {
    fakeTimeMode,
    fakeTimeLoop,
    fakeTimeOffset,
    offsetStartDateTime,
    isStoryClockPaused,
    isStoryOpeningPending,
    getChatNow,
    getLegacyOffsetMs,
    formattedFakeTime,
    refreshDisplay,
    isLoopRangeValid,
    setMode,
    setLoopRange,
    setOffsetFromDateTime,
    jumpToTime,
    advanceBy,
    syncFaceToFace,
    resumeFromLastMessage,
    consumeStoryOpening,
    loadFromChat,
    toChatFields,
    stopDisplayTimer,
  };
}
