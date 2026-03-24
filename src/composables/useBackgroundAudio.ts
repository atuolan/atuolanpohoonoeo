import { useSettingsStore } from "@/stores";
import { watch } from "vue";

// ===== 多層保活策略 =====
// 1. Web Lock：讓瀏覽器認為頁面「正在做重要事情」，不輕易回收
// 2. 靜音 OscillatorNode：1Hz + gain 0.001，不出聲也不觸發系統媒體控制欄
// 3. 靜音 <audio> 循環播放 + Media Session：移動端保活關鍵
// 4. Web Worker 心跳：每 15 秒 ping 主線程，檢查 AudioContext 是否被掛起
// 5. BroadcastChannel 自我心跳：Worker 被殺時的備用喚醒機制
// 6. Page Lifecycle（freeze/resume）：頁面凍結恢復後重建所有保活
// 7. visibilitychange 恢復：切回前台時重新確認所有保活層都在運作
// 8. 麥克風/鏡頭串流模式：透過 getUserMedia 保活，不佔媒體控制欄
// 所有音頻操作延遲到用戶第一次觸摸/點擊後才啟動，避免瀏覽器自動播放策略攔截

let audioCtx: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let silentAudioEl: HTMLAudioElement | null = null;
let heartbeatWorker: Worker | null = null;
let workerBlobUrl: string | null = null;
let webLockAbortController: AbortController | null = null;
let broadcastChannel: BroadcastChannel | null = null;
let broadcastTimer: ReturnType<typeof setInterval> | null = null;
let mediaStream: MediaStream | null = null;
let isActive = false;
let userInteracted = false;
let interactionListenersBound = false;
/** 當前保活模式（由 settings store 驅動） */
let currentMode: "audio" | "mic" | "camera" = "audio";

const SILENT_AUDIO_URL = "/silent.mp3";

// ---------- Web Lock ----------
function acquireWebLock() {
  // 先釋放舊的，避免重複
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
        // 回傳一個永遠不 resolve 的 Promise，鎖就會一直持有
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
    gainNode.gain.value = 0.001; // 幾乎無聲

    oscillator = audioCtx.createOscillator();
    oscillator.frequency.value = 1; // 1Hz，人耳聽不到
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

// ---------- 靜音 <audio> 循環播放 + Media Session ----------
// 這是移動端保活的關鍵：系統看到有媒體在播放就不會輕易殺進程
// 會觸發系統媒體控制欄，但這正是我們要的——讓 OS 認為 app 在播放媒體
function startSilentAudio() {
  if (silentAudioEl) return;

  try {
    silentAudioEl = new Audio(SILENT_AUDIO_URL);
    silentAudioEl.loop = true;
    silentAudioEl.volume = 0.001; // 幾乎無聲但不是 0（0 可能被瀏覽器優化掉）

    // 播放結束時自動重播（loop 的保險）
    silentAudioEl.addEventListener("ended", () => {
      if (isActive) silentAudioEl?.play().catch(() => {});
    });

    // 被暫停時自動恢復（系統或瀏覽器可能暫停）
    silentAudioEl.addEventListener("pause", () => {
      if (isActive) {
        setTimeout(() => {
          silentAudioEl?.play().catch(() => {});
        }, 500);
      }
    });

    silentAudioEl
      .play()
      .then(() => {
        setupMediaSession();
        console.log("[KeepAlive] 靜音 <audio> 播放成功");
      })
      .catch((e) => {
        console.warn("[KeepAlive] 靜音 <audio> 播放失敗:", e);
      });
  } catch (e) {
    console.warn("[KeepAlive] 靜音 <audio> 建立失敗:", e);
  }
}

function stopSilentAudio() {
  if (silentAudioEl) {
    silentAudioEl.pause();
    silentAudioEl.src = "";
    silentAudioEl.load(); // 釋放資源
    silentAudioEl = null;
  }
  // 清除 Media Session
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = "none";
  }
}

function setupMediaSession() {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: "背景運行中",
    artist: "Aguaphone",
    album: "",
  });
  // 攔截暫停操作，保持播放
  navigator.mediaSession.setActionHandler("play", () => {
    silentAudioEl?.play().catch(() => {});
  });
  navigator.mediaSession.setActionHandler("pause", () => {
    // 不允許暫停，保持後台活躍
    silentAudioEl?.play().catch(() => {});
  });
}

// ---------- 麥克風 / 鏡頭串流保活 ----------
// 透過 getUserMedia 取得串流，讓系統認為 app 正在使用麥克風/鏡頭
// 麥克風模式：iOS 顯示橘色指示燈，但會停掉背景音樂
// 鏡頭模式：iOS 顯示綠色指示燈，不影響音樂播放
async function startMediaStream() {
  if (mediaStream) return;
  const isMic = currentMode === "mic";
  const constraints: MediaStreamConstraints = isMic
    ? { audio: true, video: false }
    : { audio: false, video: true };
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log(`[KeepAlive] ${isMic ? "麥克風" : "鏡頭"}串流已啟動`);
  } catch (e: unknown) {
    const err = e as Error & { name?: string };
    if (err?.name === "NotAllowedError") {
      console.warn(`[KeepAlive] ${isMic ? "麥克風" : "鏡頭"}權限被拒絕`);
    } else {
      console.warn(`[KeepAlive] ${isMic ? "麥克風" : "鏡頭"}串流啟動失敗:`, e);
    }
  }
}

function stopMediaStream() {
  if (!mediaStream) return;
  mediaStream.getTracks().forEach((t) => t.stop());
  mediaStream = null;
  console.log("[KeepAlive] 串流已停止");
}

/** 恢復靜音 <audio>（被系統暫停後） */
function resumeSilentAudioIfPaused() {
  if (silentAudioEl && silentAudioEl.paused && isActive) {
    silentAudioEl.play().catch(() => {});
  }
}

/** 檢查並恢復被系統掛起的 AudioContext */
function resumeAudioContextIfSuspended() {
  if (!audioCtx) {
    // AudioContext 被回收了，重建
    if (userInteracted && isActive) {
      startSilentOscillator();
    }
    return;
  }
  if (audioCtx.state === "suspended") {
    audioCtx
      .resume()
      .then(() => {
        console.log("[KeepAlive] AudioContext 已從 suspended 恢復");
      })
      .catch(() => {});
  }
  // 同時檢查 <audio> 是否被暫停
  resumeSilentAudioIfPaused();
}

/** 根據當前模式恢復保活（音頻模式恢復音頻，串流模式恢復串流） */
function resumeKeepAliveForCurrentMode() {
  if (currentMode === "audio") {
    resumeAudioContextIfSuspended();
  } else {
    // 麥克風/鏡頭模式：如果串流斷了就重新啟動
    if (!mediaStream) startMediaStream();
  }
}

// ---------- Web Worker 心跳 ----------
function startHeartbeatWorker() {
  if (heartbeatWorker) return;

  // Worker 內部：每 15 秒 ping 主線程 + 發一個 HEAD 請求保持網路活動
  const workerCode = `
    let timer = null;
    self.onmessage = function(e) {
      if (e.data === 'start') {
        timer = setInterval(() => {
          self.postMessage('ping');
          // 發一個輕量 HEAD 請求，讓瀏覽器認為有網路活動
          try { fetch(self.location.origin || '/', { method: 'HEAD', mode: 'no-cors' }).catch(() => {}); } catch {}
        }, 15000);
      } else if (e.data === 'stop') {
        if (timer) { clearInterval(timer); timer = null; }
      }
    };
  `;

  const blob = new Blob([workerCode], { type: "application/javascript" });
  workerBlobUrl = URL.createObjectURL(blob);
  heartbeatWorker = new Worker(workerBlobUrl);

  heartbeatWorker.onmessage = () => {
    // 每 15 秒收到 ping，檢查所有保活層
    resumeKeepAliveForCurrentMode();
  };

  heartbeatWorker.onerror = () => {
    // Worker 意外死亡，嘗試重啟
    console.warn("[KeepAlive] 心跳 Worker 意外終止，嘗試重啟");
    cleanupHeartbeatWorker();
    if (isActive) {
      setTimeout(() => startHeartbeatWorker(), 1000);
    }
  };

  heartbeatWorker.postMessage("start");
  console.log("[KeepAlive] 心跳 Worker 已啟動（每 15 秒）");
}

function cleanupHeartbeatWorker() {
  if (heartbeatWorker) {
    heartbeatWorker.postMessage("stop");
    heartbeatWorker.terminate();
    heartbeatWorker = null;
  }
  if (workerBlobUrl) {
    URL.revokeObjectURL(workerBlobUrl);
    workerBlobUrl = null;
  }
}

function stopHeartbeatWorker() {
  cleanupHeartbeatWorker();
}

// ---------- BroadcastChannel 自我心跳 ----------
// 當 Worker 被系統殺掉時，BroadcastChannel 的 message 事件仍可能觸發
// 作為備用喚醒機制
function startBroadcastHeartbeat() {
  if (broadcastChannel) return;

  try {
    broadcastChannel = new BroadcastChannel("aguaphone-keepalive");
    broadcastChannel.onmessage = () => {
      // 收到自己的心跳，順便檢查保活狀態
      resumeKeepAliveForCurrentMode();
      // 如果 Worker 死了，重啟
      if (!heartbeatWorker && isActive) {
        startHeartbeatWorker();
      }
    };

    // 每 30 秒發一次（比 Worker 頻率低，作為備用）
    broadcastTimer = setInterval(() => {
      try {
        broadcastChannel?.postMessage("heartbeat");
      } catch {
        /* channel 可能已關閉 */
      }
    }, 30000);

    console.log("[KeepAlive] BroadcastChannel 心跳已啟動");
  } catch {
    // BroadcastChannel 不支援（極少數瀏覽器）
    console.warn("[KeepAlive] BroadcastChannel 不支援");
  }
}

function stopBroadcastHeartbeat() {
  if (broadcastTimer) {
    clearInterval(broadcastTimer);
    broadcastTimer = null;
  }
  if (broadcastChannel) {
    broadcastChannel.close();
    broadcastChannel = null;
  }
}

// ---------- 用戶互動偵測 ----------
function onUserInteraction() {
  if (userInteracted) return;
  userInteracted = true;
  removeInteractionListeners();

  // 用戶已互動，如果保活已啟用就啟動音頻（兩層都啟動）
  if (isActive) {
    startSilentOscillator();
    startSilentAudio();
  }
}

function addInteractionListeners() {
  if (interactionListenersBound) return;
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
  interactionListenersBound = true;
}

function removeInteractionListeners() {
  document.removeEventListener("click", onUserInteraction, { capture: true });
  document.removeEventListener("touchstart", onUserInteraction, {
    capture: true,
  });
  document.removeEventListener("keydown", onUserInteraction, {
    capture: true,
  });
  interactionListenersBound = false;
}

// ---------- 頁面生命週期事件 ----------

/** visibilitychange：切回前台時全面檢查並恢復 */
function handleVisibilityForKeepAlive() {
  if (document.visibilityState === "visible" && isActive) {
    // 根據模式恢復對應的保活層
    resumeKeepAliveForCurrentMode();
    // 音頻模式：如果 <audio> 被回收了，重建
    if (currentMode === "audio" && !silentAudioEl && userInteracted) {
      startSilentAudio();
    }
    // 重新確認 Web Lock（某些瀏覽器後台久了會釋放）
    if (!webLockAbortController) {
      acquireWebLock();
    }
    // 確認 Worker 還活著
    if (!heartbeatWorker) {
      startHeartbeatWorker();
    }
  }
}

/** Page Lifecycle API：freeze 事件（頁面被凍結前） */
function handleFreeze() {
  console.log("[KeepAlive] 頁面被凍結 (freeze)");
  // 凍結前無法做太多事，但記錄狀態
}

/** Page Lifecycle API：resume 事件（頁面從凍結恢復） */
function handleResume() {
  console.log("[KeepAlive] 頁面從凍結恢復 (resume)");
  if (!isActive) return;

  // 凍結恢復後，所有保活層可能都已失效，全部重建
  resumeKeepAliveForCurrentMode();

  if (currentMode === "audio" && !silentAudioEl && userInteracted) {
    startSilentAudio();
  }
  if (!webLockAbortController) {
    acquireWebLock();
  }
  if (!heartbeatWorker) {
    startHeartbeatWorker();
  }
  if (!broadcastChannel) {
    startBroadcastHeartbeat();
  }
}

// ---------- 對外 API ----------
function startKeepAlive() {
  if (isActive) return;
  isActive = true;

  // 1. Web Lock（不需要用戶互動）
  acquireWebLock();

  // 2. 心跳 Worker（不需要用戶互動）
  startHeartbeatWorker();

  // 3. BroadcastChannel 備用心跳（不需要用戶互動）
  startBroadcastHeartbeat();

  // 4. 根據模式啟動對應的保活層
  if (currentMode !== "audio") {
    // 麥克風/鏡頭模式：直接啟動串流（會觸發權限彈窗）
    startMediaStream();
  } else if (userInteracted) {
    // 音頻模式：需要用戶互動後才能啟動
    startSilentOscillator();
    startSilentAudio();
  } else {
    addInteractionListeners();
  }

  // 5. 監聽頁面生命週期事件
  document.addEventListener("visibilitychange", handleVisibilityForKeepAlive);
  document.addEventListener("freeze", handleFreeze);
  document.addEventListener("resume", handleResume);

  console.log(`[KeepAlive] 保活已啟用（${currentMode} 模式）`);
}

function stopKeepAlive() {
  if (!isActive) return;
  isActive = false;

  releaseWebLock();
  stopMediaStream();
  stopSilentOscillator();
  stopSilentAudio();
  stopHeartbeatWorker();
  stopBroadcastHeartbeat();
  removeInteractionListeners();
  document.removeEventListener("visibilitychange", handleVisibilityForKeepAlive);
  document.removeEventListener("freeze", handleFreeze);
  document.removeEventListener("resume", handleResume);

  console.log("[KeepAlive] 保活已停用");
}

/**
 * 背景保活 composable（多層策略）
 *
 * - Web Lock：Chrome/Edge/Safari 17+ 支援，讓瀏覽器不輕易回收頁面
 * - 靜音 <audio> 循環播放 + Media Session：移動端保活關鍵，系統看到媒體播放就不殺進程
 * - 靜音 OscillatorNode（1Hz + gain 0.001）：不觸發系統媒體控制欄的輔助保活
 * - Web Worker 心跳：每 15 秒 ping 主線程 + HEAD 請求保持網路活動
 * - BroadcastChannel 自我心跳：Worker 被殺時的備用喚醒機制
 * - Page Lifecycle（freeze/resume）：頁面凍結恢復後重建所有保活層
 * - visibilitychange：切回前台時全面檢查並恢復所有保活層
 *
 * 注意：用戶手動從最近任務裡劃掉頁面，什麼方案都救不了——這是系統級行為。
 */
export function useBackgroundAudio() {
  const settingsStore = useSettingsStore();

  watch(
    () => settingsStore.backgroundAudioEnabled,
    (enabled) => {
      if (enabled) {
        currentMode = settingsStore.keepAliveMode;
        startKeepAlive();
      } else {
        stopKeepAlive();
      }
    },
    { immediate: true },
  );

  // 模式切換時：停止再重啟（如果保活正在運行）
  watch(
    () => settingsStore.keepAliveMode,
    (newMode) => {
      if (!settingsStore.backgroundAudioEnabled) {
        currentMode = newMode;
        return;
      }
      stopKeepAlive();
      currentMode = newMode;
      startKeepAlive();
    },
  );

  return {
    startAudio: startKeepAlive,
    stopAudio: stopKeepAlive,
  };
}
