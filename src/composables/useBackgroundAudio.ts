import { useSettingsStore } from "@/stores/settings";
import { watch } from "vue";

// ===== 多層保活策略 =====
// 1. Web Lock：讓瀏覽器認為頁面「正在做重要事情」，不輕易回收
// 2. 靜音 OscillatorNode：1Hz + gain 0.001，不出聲也不觸發系統媒體控制欄
// 3. 靜音 <audio> 循環播放 + Media Session：移動端保活關鍵
// 4. 備用 <audio> 元素：主音頻被暫停時立即接手，避免 iOS 30 秒超時殺進程
// 5. Web Worker 心跳：每 15 秒 ping 主線程，檢查 AudioContext 是否被掛起
// 6. 主線程輪詢：每 10 秒檢查音頻狀態（Worker 也可能被殺）
// 7. BroadcastChannel 自我心跳：Worker 被殺時的備用喚醒機制
// 8. Screen Wake Lock：前台時防止螢幕休眠（減少進入後台的機會）
// 9. Page Lifecycle（freeze/resume）：頁面凍結恢復後重建所有保活層
// 10. visibilitychange 恢復：切回前台時重新確認所有保活層都在運作
// 11. （已移除麥克風/鏡頭串流模式）
// 所有音頻操作延遲到用戶第一次觸摸/點擊後才啟動，避免瀏覽器自動播放策略攔截

let audioCtx: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let silentAudioEl: HTMLAudioElement | null = null;
let backupAudioEl: HTMLAudioElement | null = null;
let heartbeatWorker: Worker | null = null;
let workerBlobUrl: string | null = null;
let webLockAbortController: AbortController | null = null;
let broadcastChannel: BroadcastChannel | null = null;
let broadcastTimer: ReturnType<typeof setInterval> | null = null;
let mainThreadPollTimer: ReturnType<typeof setInterval> | null = null;
let wakeLockSentinel: WakeLockSentinel | null = null;
let isActive = false;
let userInteracted = false;
let interactionListenersBound = false;

const SILENT_AUDIO_URL = "/silent.mp3";

// ---------- 音頻重試限制 ----------
/** 每個音頻元素的連續 error 計數，避免無限重建循環 */
const audioErrorCounts = new Map<HTMLAudioElement, number>();
const MAX_AUDIO_RETRIES = 3;
/** 重試冷卻期（毫秒），超過此時間沒有 error 則重置計數 */
const ERROR_COOLDOWN_MS = 30_000;
const audioErrorTimers = new Map<
  HTMLAudioElement,
  ReturnType<typeof setTimeout>
>();

function trackAudioError(el: HTMLAudioElement): boolean {
  // 清除舊的冷卻計時器
  const oldTimer = audioErrorTimers.get(el);
  if (oldTimer) clearTimeout(oldTimer);

  const count = (audioErrorCounts.get(el) ?? 0) + 1;
  audioErrorCounts.set(el, count);

  // 設定冷卻計時器：一段時間沒有新 error 就重置計數
  audioErrorTimers.set(
    el,
    setTimeout(() => {
      audioErrorCounts.delete(el);
      audioErrorTimers.delete(el);
    }, ERROR_COOLDOWN_MS),
  );

  if (count > MAX_AUDIO_RETRIES) {
    console.warn(`[KeepAlive] 音頻連續 error ${count} 次，停止重試`);
    return false; // 不再重試
  }
  return true; // 可以重試
}

function clearAudioErrorTracking(el: HTMLAudioElement) {
  audioErrorCounts.delete(el);
  const timer = audioErrorTimers.get(el);
  if (timer) clearTimeout(timer);
  audioErrorTimers.delete(el);
}

// ---------- Screen Wake Lock ----------
async function acquireWakeLock() {
  if (wakeLockSentinel) return;
  if (!("wakeLock" in navigator)) return;
  try {
    wakeLockSentinel = await navigator.wakeLock.request("screen");
    wakeLockSentinel.addEventListener("release", () => {
      wakeLockSentinel = null;
    });
    console.log("[KeepAlive] Screen Wake Lock 已取得");
  } catch {
    // 可能在後台或權限被拒
  }
}

function releaseWakeLock() {
  wakeLockSentinel?.release().catch(() => {});
  wakeLockSentinel = null;
}

// ---------- Web Lock ----------
function acquireWebLock() {
  releaseWebLock();
  if (!("locks" in navigator)) {
    console.warn("[KeepAlive] Web Lock API 不支援");
    return;
  }
  webLockAbortController = new AbortController();
  const { signal } = webLockAbortController;
  navigator.locks
    .request(
      "aguaphone-keep-alive",
      { signal },
      () =>
        new Promise<void>(() => {
          console.log("[KeepAlive] Web Lock 已取得");
        }),
    )
    .catch((e) => {
      if (e.name !== "AbortError") {
        console.warn("[KeepAlive] Web Lock 取得失敗:", e);
      }
    });
}

function releaseWebLock() {
  if (webLockAbortController) {
    webLockAbortController.abort();
    webLockAbortController = null;
  }
}

// ---------- 靜音振盪器 ----------
function startSilentOscillator() {
  if (audioCtx) return;
  try {
    audioCtx = new AudioContext();
    gainNode = audioCtx.createGain();
    gainNode.gain.value = 0.001;
    oscillator = audioCtx.createOscillator();
    oscillator.frequency.value = 1;
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.start();
    console.log("[KeepAlive] 靜音振盪器已啟動");
  } catch (e) {
    console.warn("[KeepAlive] 靜音振盪器啟動失敗:", e);
  }
}

function stopSilentOscillator() {
  if (oscillator) {
    try {
      oscillator.stop();
    } catch {
      /* 已停止 */
    }
    oscillator.disconnect();
    oscillator = null;
  }
  if (gainNode) {
    gainNode.disconnect();
    gainNode = null;
  }
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
}

// ---------- Media Session ----------
function setupMediaSession() {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: "保活中",
    artist: "Aguaphone",
  });
  // 攔截系統的 play/pause 控制，強制繼續播放
  navigator.mediaSession.setActionHandler("play", () => {
    silentAudioEl?.play().catch(() => {});
  });
  navigator.mediaSession.setActionHandler("pause", () => {
    // iOS 按暫停時，我們仍然嘗試恢復播放
    silentAudioEl?.play().catch(() => {});
  });
}

function clearMediaSession() {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = null;
  navigator.mediaSession.setActionHandler("play", null);
  navigator.mediaSession.setActionHandler("pause", null);
}

// ---------- 靜音 <audio> 雙元素策略 ----------
// 主音頻 + 備用音頻：當 iOS 暫停主音頻時，備用音頻立即接手
function createAudioElement(label: string): HTMLAudioElement {
  const el = new Audio(SILENT_AUDIO_URL);
  el.loop = true;
  el.volume = 0.001;
  // loop 保險：ended 時手動重播
  el.addEventListener("ended", () => {
    if (isActive) el.play().catch(() => {});
  });
  // 被系統暫停時嘗試恢復，同時啟動備用音頻
  el.addEventListener("pause", () => {
    if (!isActive) return;
    console.warn(`[KeepAlive] ${label} 被暫停，嘗試恢復`);
    setTimeout(() => {
      if (isActive && el.paused) {
        el.play().catch(() => {});
      }
    }, 300);
    // 如果是主音頻被暫停，啟動備用音頻
    if (el === silentAudioEl && backupAudioEl?.paused) {
      console.log("[KeepAlive] 主音頻被暫停，啟動備用音頻");
      backupAudioEl.play().catch(() => {});
    }
  });
  // stalled/waiting：僅嘗試恢復一次，不做 load 重建
  el.addEventListener("stalled", () => {
    if (isActive) {
      console.warn(`[KeepAlive] ${label} stalled，嘗試 play`);
      el.play().catch(() => {});
    }
  });
  el.addEventListener("waiting", () => {
    if (isActive) {
      console.warn(`[KeepAlive] ${label} waiting，嘗試 play`);
      el.play().catch(() => {});
    }
  });
  el.addEventListener("error", () => {
    if (!isActive) return;
    // 限制連續重試次數，避免無限循環導致手機崩潰
    if (!trackAudioError(el)) return;
    const count = audioErrorCounts.get(el) ?? 1;
    const delay = Math.min(1000 * Math.pow(2, count - 1), 16000); // 指數退避：1s, 2s, 4s...
    console.warn(
      `[KeepAlive] ${label} error（第 ${count} 次），${delay}ms 後重試`,
    );
    el.load();
    setTimeout(() => {
      if (isActive) el.play().catch(() => {});
    }, delay);
  });
  return el;
}

function startSilentAudio() {
  if (silentAudioEl) return;
  try {
    silentAudioEl = createAudioElement("主音頻");
    backupAudioEl = createAudioElement("備用音頻");
    silentAudioEl
      .play()
      .then(() => {
        setupMediaSession();
        console.log("[KeepAlive] 靜音音頻已啟動");
      })
      .catch((e) => console.warn("[KeepAlive] 靜音音頻播放失敗:", e));
    // 備用音頻延遲啟動（避免同時播放被系統視為重複）
    setTimeout(() => {
      if (isActive && backupAudioEl) {
        backupAudioEl.play().catch(() => {});
      }
    }, 2000);
  } catch (e) {
    console.warn("[KeepAlive] 靜音音頻建立失敗:", e);
  }
}

function stopSilentAudio() {
  if (silentAudioEl) {
    clearAudioErrorTracking(silentAudioEl);
    silentAudioEl.pause();
    silentAudioEl.src = "";
    silentAudioEl.load();
    silentAudioEl = null;
  }
  if (backupAudioEl) {
    clearAudioErrorTracking(backupAudioEl);
    backupAudioEl.pause();
    backupAudioEl.src = "";
    backupAudioEl.load();
    backupAudioEl = null;
  }
  clearMediaSession();
}

// ---------- 音頻恢復輔助 ----------
function resumeSilentAudioIfPaused() {
  if (!isActive) return;
  if (silentAudioEl?.paused) {
    silentAudioEl.play().catch(() => {});
  }
  if (backupAudioEl?.paused) {
    backupAudioEl.play().catch(() => {});
  }
  // 如果兩個都不存在了，重建
  if (!silentAudioEl && userInteracted) {
    startSilentAudio();
  }
}

function resumeAudioContextIfSuspended() {
  if (!isActive) return;
  if (audioCtx?.state === "suspended") {
    audioCtx.resume().catch(() => {});
  } else if (!audioCtx && userInteracted) {
    startSilentOscillator();
  }
}

/** 恢復所有保活層 */
function resumeKeepAliveForCurrentMode() {
  if (!isActive) return;
  resumeAudioContextIfSuspended();
  resumeSilentAudioIfPaused();
}

// ---------- Web Worker 心跳 ----------
function startHeartbeatWorker() {
  if (heartbeatWorker) return;
  const code = `
    let t = null;
    self.onmessage = (e) => {
      if (e.data === 'start') {
        t = setInterval(() => {
          self.postMessage('ping');
          try { fetch(self.location.origin || '/', { method: 'HEAD', mode: 'no-cors' }).catch(() => {}); } catch {}
        }, 15000);
      } else if (e.data === 'stop') {
        clearInterval(t);
        t = null;
      }
    };
  `;
  const blob = new Blob([code], { type: "application/javascript" });
  workerBlobUrl = URL.createObjectURL(blob);
  heartbeatWorker = new Worker(workerBlobUrl);
  heartbeatWorker.onmessage = () => {
    resumeKeepAliveForCurrentMode();
  };
  heartbeatWorker.onerror = () => {
    console.warn("[KeepAlive] 心跳 Worker 終止，重啟中");
    cleanupHeartbeatWorker();
    if (isActive) setTimeout(startHeartbeatWorker, 1000);
  };
  heartbeatWorker.postMessage("start");
  console.log("[KeepAlive] 心跳 Worker 已啟動");
}

function cleanupHeartbeatWorker() {
  heartbeatWorker?.postMessage("stop");
  heartbeatWorker?.terminate();
  heartbeatWorker = null;
  if (workerBlobUrl) {
    URL.revokeObjectURL(workerBlobUrl);
    workerBlobUrl = null;
  }
}

function stopHeartbeatWorker() {
  cleanupHeartbeatWorker();
}

// ---------- 主線程輪詢（Worker 備用） ----------
// 每 10 秒獨立檢查音頻狀態，不依賴 Worker（iOS 可能殺 Worker）
function startMainThreadPoll() {
  if (mainThreadPollTimer) return;
  mainThreadPollTimer = setInterval(() => {
    if (!isActive) return;
    resumeKeepAliveForCurrentMode();
    // 確保 Worker 還活著
    if (!heartbeatWorker) {
      console.warn("[KeepAlive] 主線程輪詢發現 Worker 已死，重啟");
      startHeartbeatWorker();
    }
    // 確保 Web Lock 還在
    if (!webLockAbortController) {
      acquireWebLock();
    }
  }, 10000);
  console.log("[KeepAlive] 主線程輪詢已啟動（10s）");
}

function stopMainThreadPoll() {
  if (mainThreadPollTimer) {
    clearInterval(mainThreadPollTimer);
    mainThreadPollTimer = null;
  }
}

// ---------- BroadcastChannel 備用心跳 ----------
function startBroadcastHeartbeat() {
  if (broadcastChannel) return;
  try {
    broadcastChannel = new BroadcastChannel("aguaphone-keepalive");
    broadcastChannel.onmessage = () => {
      resumeKeepAliveForCurrentMode();
      // Worker 被殺時嘗試重啟
      if (!heartbeatWorker && isActive) startHeartbeatWorker();
    };
    broadcastTimer = setInterval(() => {
      try {
        broadcastChannel?.postMessage("heartbeat");
      } catch {
        /* channel 可能已關閉 */
      }
    }, 30000);
    console.log("[KeepAlive] BroadcastChannel 心跳已啟動");
  } catch {
    console.warn("[KeepAlive] BroadcastChannel 不支援");
  }
}

function stopBroadcastHeartbeat() {
  if (broadcastTimer) {
    clearInterval(broadcastTimer);
    broadcastTimer = null;
  }
  broadcastChannel?.close();
  broadcastChannel = null;
}

// ---------- 用戶互動偵測 ----------
function onUserInteraction() {
  if (userInteracted) return;
  userInteracted = true;
  removeInteractionListeners();
  // 用戶已互動，如果保活已啟動但音頻還沒開始，現在啟動
  if (isActive && currentMode === "audio") {
    startSilentOscillator();
    startSilentAudio();
  }
}

function addInteractionListeners() {
  if (interactionListenersBound) return;
  interactionListenersBound = true;
  document.addEventListener("click", onUserInteraction, {
    once: true,
    capture: true,
  });
  document.addEventListener("touchstart", onUserInteraction, {
    once: true,
    capture: true,
  });
  document.addEventListener("keydown", onUserInteraction, {
    once: true,
    capture: true,
  });
}

function removeInteractionListeners() {
  if (!interactionListenersBound) return;
  interactionListenersBound = false;
  document.removeEventListener("click", onUserInteraction, { capture: true });
  document.removeEventListener("touchstart", onUserInteraction, {
    capture: true,
  });
  document.removeEventListener("keydown", onUserInteraction, { capture: true });
}

// ---------- 頁面生命週期事件 ----------
function handleVisibilityForKeepAlive() {
  if (document.visibilityState === "visible" && isActive) {
    console.log("[KeepAlive] 頁面回到前台，檢查保活狀態");
    // 回到前台時重新取得 Wake Lock
    acquireWakeLock();
    // 恢復當前模式的保活
    resumeKeepAliveForCurrentMode();
    // 確保輔助層都在
    if (!webLockAbortController) acquireWebLock();
    if (!heartbeatWorker) startHeartbeatWorker();
    if (!broadcastChannel) startBroadcastHeartbeat();
    if (!mainThreadPollTimer) startMainThreadPoll();
  }
}

function handleFreeze() {
  // 頁面被凍結（Page Lifecycle freeze 事件）
  // 無法做太多事，但記錄狀態
  console.log("[KeepAlive] 頁面被凍結");
}

function handleResume() {
  // 頁面從凍結恢復（Page Lifecycle resume 事件）
  if (!isActive) return;
  console.log("[KeepAlive] 頁面從凍結恢復，重建保活層");
  // 重建所有可能被殺的保活層
  resumeKeepAliveForCurrentMode();
  if (!webLockAbortController) acquireWebLock();
  if (!heartbeatWorker) startHeartbeatWorker();
  if (!broadcastChannel) startBroadcastHeartbeat();
  if (!mainThreadPollTimer) startMainThreadPoll();
  acquireWakeLock();
}

// ---------- 主控：啟動/停止 ----------
function startKeepAlive() {
  if (isActive) return;
  isActive = true;

  // 基礎層：Web Lock + Worker + BroadcastChannel + 主線程輪詢
  acquireWebLock();
  startHeartbeatWorker();
  startBroadcastHeartbeat();
  startMainThreadPoll();
  acquireWakeLock();

  // 音頻保活層
  if (userInteracted) {
    startSilentOscillator();
    startSilentAudio();
  } else {
    // 等待用戶互動
    addInteractionListeners();
  }

  // 註冊生命週期事件
  document.addEventListener("visibilitychange", handleVisibilityForKeepAlive);
  document.addEventListener("freeze", handleFreeze);
  document.addEventListener("resume", handleResume);

  console.log("[KeepAlive] 已啟動（音頻模式）");
}

function stopKeepAlive() {
  if (!isActive) return;
  isActive = false;

  // 停止所有層
  releaseWebLock();
  stopSilentOscillator();
  stopSilentAudio();
  stopHeartbeatWorker();
  stopBroadcastHeartbeat();
  stopMainThreadPoll();
  releaseWakeLock();
  removeInteractionListeners();

  // 移除生命週期事件
  document.removeEventListener(
    "visibilitychange",
    handleVisibilityForKeepAlive,
  );
  document.removeEventListener("freeze", handleFreeze);
  document.removeEventListener("resume", handleResume);

  console.log("[KeepAlive] 已停止");
}

// ---------- 導出 composable ----------
export function useBackgroundAudio() {
  const settings = useSettingsStore();

  // 監聽開關變化
  watch(
    () => settings.backgroundAudioEnabled,
    (enabled) => {
      if (enabled) {
        startKeepAlive();
      } else {
        stopKeepAlive();
      }
    },
  );

  // 如果已經啟用，立即啟動
  if (settings.backgroundAudioEnabled) {
    startKeepAlive();
  }
}
