import { isNativeApp } from "@/native/platform";
import { detectPlatform } from "@/services/phoneCalendar";
import { useAIGenerationStore } from "@/stores/aiGeneration";
import { useSettingsStore } from "@/stores/settings";
import { watch } from "vue";

// ===== 背景運行模式（保活） =====
// 1. 靜音 <audio> 循環播放 + Media Session：手機上讓網頁在背景不被暫停的關鍵
// 2. 靜音振盪器（AudioContext）：讓 Chrome 把分頁當成有聲音，不限制背景計時器；
//    iPhone 上對保活沒幫助，還會讓音訊處理一直高頻運作、發熱，所以不開
// 3. Web Lock：讓瀏覽器認為頁面正在做重要的事，不輕易凍結
// 4. 輪詢（每 10 秒）：靜音被停了就接回來，但不跟使用者、別的 App 搶
//    - 使用者在音樂欄按暫停：回到 App 或按播放之前都不接
//    - 被打斷（來電、別的 App 放音樂）：等一下再接；剛接回又被停就加倍等待，最長 5 分鐘
//    - 畫面在前台時最多搶回兩次，回到 App 才重新計算
// 5. Worker 心跳（每 30 秒）：背景時主程式的計時器會被系統放慢，Worker 的比較準，
//    心跳叫醒主程式做一次跟輪詢一樣的檢查；只傳訊息、不連網路（以前每次心跳都連網路，耗電發熱）
// 6. 回到前台、頁面從凍結恢復：重新確認並接回
// 保活時機：一直保活，或只在生成時（生成開始就播、結束後等幾秒才停，平常不佔音樂欄、不搶別的 App）
// 所有聲音都等使用者第一次觸摸/點擊後才啟動，避免被瀏覽器自動播放策略攔截

/** 5 分鐘單聲道靜音，循環播放（Android 要超過 5 秒才會出現在音樂欄、保活才有效） */
const KEEPALIVE_AUDIO_URL = `${import.meta.env.BASE_URL}keepalive-5min.mp3`;

const POLL_INTERVAL_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
/** Worker 掛掉後隔多久重開 */
const HEARTBEAT_RESTART_MS = 1_000;

/** Worker 只負責定時傳 ping 回來，不做別的事 */
export const HEARTBEAT_WORKER_CODE = `let t = null;
self.onmessage = (e) => {
  if (e.data && e.data.type === "start") {
    clearInterval(t);
    t = setInterval(() => self.postMessage("ping"), e.data.intervalMs);
  } else if (e.data && e.data.type === "stop") {
    clearInterval(t);
    t = null;
  }
};`;
/** 被打斷後第一次等多久再接回 */
const BASE_RETRY_MS = 10_000;
const MAX_RETRY_MS = 5 * 60_000;
/** 接回後這段時間內又被停，多半是別的 App 在放音樂 */
const CONTENTION_WINDOW_MS = 60_000;
/** 連續播放這麼久沒被打斷，等待時間和搶回次數歸零 */
const STABLE_PLAY_MS = 5 * 60_000;
/** 畫面在前台時最多自動搶回幾次（使用者可能正在聽別的音樂） */
const MAX_FOREGROUND_GRABS = 2;
/** play() 太久沒結果就當作卡住，允許再試 */
const RESUME_TIMEOUT_MS = 15_000;
/** 冷卻期內音檔載入失敗最多重新載入幾次，避免無限重建 */
const MAX_AUDIO_RELOADS = 3;
const AUDIO_ERROR_COOLDOWN_MS = 30_000;

type ResumeTrigger = "poll" | "return" | "user";

export interface KeepAliveOptions {
  /** always：開著就一直保活；generation：只在生成時保活 */
  trigger: "always" | "generation";
  /** 僅生成時：生成結束後等多久才停（留給生成後的變數更新、旁支生成收尾，連續重骰也不會一停一開） */
  idleStopMs: number;
  /** 測試用的舊做法：音樂欄按暫停也繼續播 */
  pauseForcesPlay: boolean;
}

let options: KeepAliveOptions = {
  trigger: "always",
  idleStopMs: 20_000,
  pauseForcesPlay: false,
};
let generating = false;
/** 真的在保活（播靜音、輪詢、心跳）：一直保活＝開關開著；僅生成時＝生成中加上結束後的等待 */
let engaged = false;
let idleStopTimer: ReturnType<typeof setTimeout> | null = null;

let audioCtx: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let silentAudioEl: HTMLAudioElement | null = null;
let webLockAbortController: AbortController | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatWorker: Worker | null = null;
let heartbeatWorkerUrl: string | null = null;
let heartbeatRestartTimer: ReturnType<typeof setTimeout> | null = null;
/** App 裡回到前景的原生事件（WKWebView 切回來不一定有 visibilitychange） */
let nativeResumeListener: { remove: () => Promise<void> } | null = null;
let isActive = false;
let userInteracted = false;
let interactionListenersBound = false;

/** 使用者在音樂欄按了暫停：回到 App 或按播放之前不自動接回 */
let pausedByUser = false;
let retryDelayMs = BASE_RETRY_MS;
let nextRetryAt = 0;
let lastResumedAt = 0;
let foregroundGrabs = 0;
let resumeAttempt = 0;
let resumeAttemptAt = 0;
let resumePending = false;
let audioErrorCount = 0;
let audioErrorTimer: ReturnType<typeof setTimeout> | null = null;

function isIOS(): boolean {
  return detectPlatform() === "ios";
}

function isPageVisible(): boolean {
  return document.visibilityState === "visible";
}

function resetRetryState() {
  retryDelayMs = BASE_RETRY_MS;
  nextRetryAt = 0;
  foregroundGrabs = 0;
}

// ---------- 音檔載入失敗的重試限制 ----------
function trackAudioError(): boolean {
  if (audioErrorTimer) clearTimeout(audioErrorTimer);
  audioErrorCount++;
  // 一段時間沒有新的 error 就重置計數
  audioErrorTimer = setTimeout(() => {
    audioErrorCount = 0;
    audioErrorTimer = null;
  }, AUDIO_ERROR_COOLDOWN_MS);

  if (audioErrorCount > MAX_AUDIO_RELOADS) {
    console.warn(`[KeepAlive] 靜音音檔連續 error ${audioErrorCount} 次，停止重新載入`);
    return false;
  }
  return true;
}

function clearAudioErrorTracking() {
  audioErrorCount = 0;
  if (audioErrorTimer) clearTimeout(audioErrorTimer);
  audioErrorTimer = null;
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

// ---------- 靜音振盪器（iPhone 不開） ----------
function startSilentOscillator() {
  if (audioCtx || isIOS()) return;
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

// ---------- Media Session（系統音樂欄） ----------
function setPlaybackState(state: MediaSessionPlaybackState) {
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = state;
}

function setupMediaSession() {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: "保活中",
    artist: "Aguaphone",
  });
  navigator.mediaSession.setActionHandler("play", resumeFromMusicBar);
  navigator.mediaSession.setActionHandler("pause", pauseFromMusicBar);
  try {
    navigator.mediaSession.setActionHandler("stop", pauseFromMusicBar);
  } catch {
    /* 舊版瀏覽器不支援 stop */
  }
}

function clearMediaSession() {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = null;
  navigator.mediaSession.playbackState = "none";
  for (const action of ["play", "pause", "stop"] as const) {
    try {
      navigator.mediaSession.setActionHandler(action, null);
    } catch {
      /* 舊版瀏覽器不支援 stop */
    }
  }
}

/** 音樂欄按暫停：真的停下來，回到 App 或按播放之前不自動接回 */
function pauseFromMusicBar() {
  if (!engaged) return;
  if (options.pauseForcesPlay) {
    // 測試用的舊做法：按暫停也繼續播
    setPlaybackState("playing");
    if (silentAudioEl?.paused) void playSilentAudio();
    return;
  }
  pausedByUser = true;
  silentAudioEl?.pause();
  audioCtx?.suspend().catch(() => {});
  setPlaybackState("paused");
  console.log("[KeepAlive] 使用者在音樂欄暫停，回到 App 前不自動接回");
}

function resumeFromMusicBar() {
  if (!engaged) return;
  pausedByUser = false;
  resetRetryState();
  tryResume("user");
}

// ---------- 靜音 <audio> ----------
function createSilentAudio(): HTMLAudioElement {
  const el = new Audio(KEEPALIVE_AUDIO_URL);
  el.loop = true;
  el.volume = 0.001;
  // 系統自己恢復播放（例如來電結束）也會走這裡，音樂欄狀態跟著實際播放
  el.addEventListener("play", () => {
    if (engaged) setPlaybackState("playing");
  });
  // loop 保險：萬一播到結尾停了，自己從頭播；播不起來就交給下一次輪詢
  el.addEventListener("ended", () => {
    if (!engaged || pausedByUser) return;
    el.play().catch(() => {
      nextRetryAt = 0;
    });
  });
  el.addEventListener("pause", onSilentAudioPaused);
  el.addEventListener("error", () => {
    if (!isActive || !trackAudioError()) return;
    console.warn(`[KeepAlive] 靜音音檔 error（第 ${audioErrorCount} 次），重新載入`);
    el.load();
  });
  return el;
}

/** 不是自己停的（來電、別的 App 放音樂）：不馬上搶回，交給輪詢 */
function onSilentAudioPaused() {
  // pause 事件是非同步的：處理時已經又在播（例如循環），就不算被停；
  // 播到結尾停的交給 ended 從頭播，也不算被別人搶
  if (!engaged || pausedByUser || !silentAudioEl?.paused || silentAudioEl.ended) return;
  const now = Date.now();
  // 剛接回又被停：多半是別的 App 在放音樂，等久一點
  if (now - lastResumedAt < CONTENTION_WINDOW_MS) {
    retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_MS);
  }
  nextRetryAt = now + retryDelayMs;
  setPlaybackState("paused");
  console.warn(`[KeepAlive] 靜音被暫停，${Math.round(retryDelayMs / 1000)} 秒後再試`);
}

/** 播放靜音（振盪器一起恢復），回傳有沒有播起來 */
async function playSilentAudio(): Promise<boolean> {
  const el = silentAudioEl;
  if (!el) return false;
  try {
    await el.play();
  } catch {
    return false;
  }
  if (!engaged || el !== silentAudioEl) return false;
  if (audioCtx?.state === "suspended") audioCtx.resume().catch(() => {});
  return true;
}

/**
 * 僅生成時保活、還沒開始生成：在使用者手勢裡先播一下再停。
 * 網頁版 iPhone 要手勢才能播，播過一次的元素之後生成時就不用手勢；App 裡沒這個限制
 */
function primeSilentAudio() {
  if (!isActive || engaged || silentAudioEl || isNativeApp()) return;
  const el = createSilentAudio();
  silentAudioEl = el;
  el.play()
    .then(() => {
      if (!engaged) el.pause();
    })
    .catch(() => {});
}

function startSilentAudio() {
  if (silentAudioEl) return;
  try {
    silentAudioEl = createSilentAudio();
    setupMediaSession();
    void playSilentAudio().then((ok) => {
      if (ok) {
        lastResumedAt = Date.now();
        console.log("[KeepAlive] 靜音音檔已啟動");
      } else if (engaged && isPageVisible()) {
        // 多半是還沒有使用者手勢：下次觸摸畫面再試
        addInteractionListeners();
      }
    });
  } catch (e) {
    console.warn("[KeepAlive] 靜音音檔建立失敗:", e);
  }
}

function stopSilentAudio() {
  if (silentAudioEl) {
    clearAudioErrorTracking();
    silentAudioEl.pause();
    silentAudioEl.src = "";
    silentAudioEl.load();
    silentAudioEl = null;
  }
  clearMediaSession();
}

// ---------- 接回保活 ----------
function tryResume(trigger: ResumeTrigger) {
  if (!engaged || !userInteracted || pausedByUser) return;
  if (!audioCtx) startSilentOscillator();
  if (!silentAudioEl) {
    startSilentAudio();
    return;
  }

  const now = Date.now();
  if (!silentAudioEl.paused) {
    if (now - lastResumedAt >= STABLE_PLAY_MS) resetRetryState();
    if (audioCtx?.state === "suspended") audioCtx.resume().catch(() => {});
    return;
  }
  if (resumePending && now - resumeAttemptAt < RESUME_TIMEOUT_MS) return;

  const foreground = isPageVisible();
  if (trigger !== "user") {
    if (now < nextRetryAt) return;
    if (foreground && foregroundGrabs >= MAX_FOREGROUND_GRABS) return;
  }

  const attempt = ++resumeAttempt;
  resumePending = true;
  resumeAttemptAt = now;
  void playSilentAudio().then((ok) => {
    if (attempt !== resumeAttempt) return;
    resumePending = false;
    if (ok) {
      // 只記自己接回的時間；播到結尾從頭播、系統自己恢復都不算
      lastResumedAt = Date.now();
      // 只有輪詢自動搶回才算；回到 App、使用者自己按的都不算
      if (foreground && trigger === "poll") foregroundGrabs++;
      console.log("[KeepAlive] 已接回靜音");
      return;
    }
    retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_MS);
    nextRetryAt = Date.now() + retryDelayMs;
    // 前台播不起來多半是需要使用者手勢：下次觸摸畫面再試
    if (engaged && isPageVisible()) addInteractionListeners();
  });
}

// ---------- 輪詢 ----------
function startPoll() {
  if (pollTimer) return;
  pollTimer = setInterval(() => tryResume("poll"), POLL_INTERVAL_MS);
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// ---------- Worker 心跳 ----------
function startHeartbeat() {
  if (heartbeatWorker || typeof Worker === "undefined") return;
  try {
    heartbeatWorkerUrl = URL.createObjectURL(
      new Blob([HEARTBEAT_WORKER_CODE], { type: "application/javascript" }),
    );
    const worker = new Worker(heartbeatWorkerUrl);
    worker.onmessage = () => tryResume("poll");
    worker.onerror = () => {
      console.warn("[KeepAlive] 心跳 Worker 終止，重開中");
      stopHeartbeat();
      if (!engaged || heartbeatRestartTimer) return;
      heartbeatRestartTimer = setTimeout(() => {
        heartbeatRestartTimer = null;
        if (engaged) startHeartbeat();
      }, HEARTBEAT_RESTART_MS);
    };
    worker.postMessage({ type: "start", intervalMs: HEARTBEAT_INTERVAL_MS });
    heartbeatWorker = worker;
  } catch (e) {
    console.warn("[KeepAlive] 心跳 Worker 啟動失敗:", e);
    stopHeartbeat();
  }
}

function stopHeartbeat() {
  if (heartbeatWorker) {
    heartbeatWorker.postMessage({ type: "stop" });
    heartbeatWorker.terminate();
    heartbeatWorker = null;
  }
  if (heartbeatWorkerUrl) {
    URL.revokeObjectURL(heartbeatWorkerUrl);
    heartbeatWorkerUrl = null;
  }
}

// ---------- 用戶互動偵測 ----------
function onUserInteraction() {
  userInteracted = true;
  removeInteractionListeners();
  if (engaged) {
    tryResume("user");
  } else {
    primeSilentAudio();
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
/** 回到 App：使用者在音樂欄的暫停到此為止，重新接回保活 */
function handleReturnToApp() {
  if (!engaged) return;
  pausedByUser = false;
  resetRetryState();
  startPoll();
  startHeartbeat();
  tryResume("return");
}

function handleVisibilityChange() {
  if (isPageVisible()) handleReturnToApp();
}

/** App 裡（iOS 切出去整個 App 可能被暫停）：回到前景時接回 */
function listenNativeResume() {
  if (!isNativeApp() || nativeResumeListener) return;
  void import("@capacitor/app")
    .then(({ App }) => App.addListener("resume", handleReturnToApp))
    .then((handle) => {
      if (isActive && !nativeResumeListener) {
        nativeResumeListener = handle;
      } else {
        void handle.remove();
      }
    })
    .catch((e) => console.warn("[KeepAlive] 監聽 App 回到前景失敗:", e));
}

function stopNativeResume() {
  void nativeResumeListener?.remove();
  nativeResumeListener = null;
}

function handlePageResume() {
  // 頁面從凍結恢復（Page Lifecycle resume 事件）
  if (!engaged) return;
  startPoll();
  startHeartbeat();
  tryResume("poll");
}

// ---------- 真的開始／停止保活 ----------
function shouldEngage(): boolean {
  return isActive && (options.trigger === "always" || generating);
}

function engage() {
  cancelIdleStop();
  if (engaged || !isActive) return;
  engaged = true;
  pausedByUser = false;
  resetRetryState();
  acquireWebLock();
  startPoll();
  startHeartbeat();
  if (silentAudioEl) setupMediaSession();
  if (userInteracted) {
    tryResume("user");
  } else {
    addInteractionListeners();
  }
  console.log("[KeepAlive] 保活中");
}

/** 停住但不銷毀靜音元素：下次生成時不用手勢就能再播 */
function disengage() {
  cancelIdleStop();
  if (!engaged) return;
  engaged = false;
  stopPoll();
  stopHeartbeat();
  if (heartbeatRestartTimer) {
    clearTimeout(heartbeatRestartTimer);
    heartbeatRestartTimer = null;
  }
  releaseWebLock();
  // 讓進行中的接回作廢
  resumeAttempt++;
  resumePending = false;
  silentAudioEl?.pause();
  audioCtx?.suspend().catch(() => {});
  clearMediaSession();
  console.log("[KeepAlive] 生成已結束，保活停住");
}

function cancelIdleStop() {
  if (idleStopTimer) {
    clearTimeout(idleStopTimer);
    idleStopTimer = null;
  }
}

function scheduleIdleStop() {
  if (!engaged || idleStopTimer) return;
  idleStopTimer = setTimeout(() => {
    idleStopTimer = null;
    if (!shouldEngage()) disengage();
  }, options.idleStopMs);
}

function syncEngagement() {
  if (!isActive) return;
  if (shouldEngage()) {
    engage();
  } else {
    scheduleIdleStop();
  }
}

/** 設定頁的保活時機、停止秒數、暫停鍵選項 */
export function setKeepAliveOptions(next: KeepAliveOptions) {
  options = { ...next };
  // 秒數可能改了，重新計時
  cancelIdleStop();
  syncEngagement();
}

/** 有沒有任何 AI 生成正在進行 */
export function setGenerating(value: boolean) {
  if (generating === value) return;
  generating = value;
  syncEngagement();
}

// ---------- 主控：開關 ----------
export function startKeepAlive() {
  if (isActive) return;
  isActive = true;

  document.addEventListener("visibilitychange", handleVisibilityChange);
  document.addEventListener("resume", handlePageResume);
  listenNativeResume();
  // 僅生成時保活也要先等第一次觸摸，網頁版才能在手勢裡先準備好聲音
  if (!userInteracted) addInteractionListeners();

  syncEngagement();
  console.log(`[KeepAlive] 已啟動（${options.trigger === "always" ? "一直保活" : "僅生成時保活"}）`);
}

export function stopKeepAlive() {
  if (!isActive) return;
  isActive = false;

  disengage();
  stopSilentOscillator();
  stopSilentAudio();
  removeInteractionListeners();
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  document.removeEventListener("resume", handlePageResume);
  stopNativeResume();

  pausedByUser = false;
  resumePending = false;
  resetRetryState();
  console.log("[KeepAlive] 已停止");
}

// ---------- 導出 composable ----------
export function useBackgroundAudio() {
  const settings = useSettingsStore();
  const generation = useAIGenerationStore();

  watch(
    () => ({
      trigger: settings.keepAliveTrigger,
      idleStopMs: settings.keepAliveIdleStopSec * 1000,
      pauseForcesPlay: settings.keepAlivePauseForcesPlay,
    }),
    (next) => setKeepAliveOptions(next),
    { immediate: true },
  );

  watch(
    () => generation.hasActiveGeneration,
    (active) => setGenerating(active),
    { immediate: true },
  );

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