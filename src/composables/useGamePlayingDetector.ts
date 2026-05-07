/**
 * 遊戲遊玩偵測器（全域單例）
 *
 * 當 user 進入任一遊戲畫面停留 3-5 分鐘時，觸發
 * ProactiveMessageService.sendGamePlayingProactiveMessage(gameId)，
 * 由「最近一次有對話的非群組聊天角色」主動發訊關心 user 在玩什麼。
 *
 * 不沿用 ProactiveMessageService 的封鎖 / 夜間免打擾 / 通話中 / 活躍 chat 檢查，
 * 唯一保留的是該服務內部的 pendingCharacters 防同角色併發 API。
 */

import { ref } from "vue";

const MIN_DELAY_MS = 3 * 60 * 1000; // 3 分鐘
const MAX_DELAY_MS = 5 * 60 * 1000; // 5 分鐘

let timer: ReturnType<typeof setTimeout> | null = null;
let activeGameId: string | null = null;
let triggeredThisSession = false;

const _isInGameScreen = ref(false);
const _activeGameIdRef = ref<string | null>(null);

function clearTimer(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

function scheduleTrigger(gameId: string): void {
  clearTimer();
  if (triggeredThisSession) {
    // 本次「進入遊戲」週期已觸發過一次，不再重啟
    return;
  }
  const delay =
    MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
  console.log(
    `[GamePlayingDetector] 排程 ${gameId} 觸發於 ${Math.round(delay / 1000)}s 後`,
  );
  timer = setTimeout(async () => {
    timer = null;
    if (activeGameId !== gameId) {
      // 已切到別的遊戲或離開，由其他流程處理
      return;
    }
    triggeredThisSession = true;
    try {
      const { proactiveMessageService } = await import(
        "@/services/ProactiveMessageService"
      );
      await proactiveMessageService.sendGamePlayingProactiveMessage(gameId);
    } catch (err) {
      console.error(
        "[GamePlayingDetector] sendGamePlayingProactiveMessage 失敗:",
        err,
      );
    }
  }, delay);
}

/**
 * 進入某個遊戲畫面（遊戲中心子遊戲、或從聊天打開的小遊戲皆可）
 * 每次進入會重置計時器並隨機 3-5 分鐘
 */
export function enterGameScreen(gameId: string): void {
  if (!gameId) return;
  if (activeGameId === gameId && timer !== null) {
    // 已在同一遊戲且 timer 還在跑，不重置
    return;
  }
  // 切換到不同遊戲：重置 session（允許再次觸發）
  if (activeGameId !== gameId) {
    triggeredThisSession = false;
  }
  activeGameId = gameId;
  _activeGameIdRef.value = gameId;
  _isInGameScreen.value = true;
  scheduleTrigger(gameId);
}

/**
 * 離開遊戲畫面
 * @param gameId 若提供，僅在該 id 與當前 active 一致時才清除；否則無條件清除
 */
export function leaveGameScreen(gameId?: string): void {
  if (gameId && activeGameId !== gameId) {
    return;
  }
  clearTimer();
  activeGameId = null;
  _activeGameIdRef.value = null;
  _isInGameScreen.value = false;
  triggeredThisSession = false;
}

export function useGamePlayingDetector() {
  return {
    isInGameScreen: _isInGameScreen,
    activeGameId: _activeGameIdRef,
    enterGameScreen,
    leaveGameScreen,
  };
}
