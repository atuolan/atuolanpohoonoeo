import { detectPlatform } from "@/services/phoneCalendar";
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
// 5. 回到前台、頁面從凍結恢復：重新確認並接回
// 所有聲音都等使用者第一次觸摸/點擊後才啟動，避免被瀏覽器自動播放策略攔截

/** 5 分鐘單聲道靜音，循環播放（Android 要超過 5 秒才會出現在音樂欄、保活才有效） */
const KEEPALIVE_AUDIO_URL = `${import.meta.env.BASE_URL}keepalive-5min.mp3`;

const POLL_INTERVAL_MS = 10_000;
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

let audioCtx: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let silentAudioEl: HTMLAudioElement | null = null;
let webLockAbortController: AbortController | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
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
  if (!isActive) return;
  pausedByUser = true;
  silentAudioEl?.pause();
  audioCtx?.suspend().catch(() => {});
  setPlaybackState("paused");
  console.log("[KeepAlive] 使用者在音樂欄暫停，回到 App 前不自動接回");
}

function resumeFromMusicBar() {
  if (!isActive) return;
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
    setPlaybackState("playing");
  });
  // loop 保險：萬一播到結尾停了，自己從頭播；播不起來就交給下一次輪詢
  el.addEventListener("ended", () => {
    if (!isActive || pausedByUser) return;
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
  if (!isActive || pausedByUser || !silentAudioEl?.paused || silentAudioEl.ended) return;
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
  if (!isActive || el !== silentAudioEl) return false;
  if (audioCtx?.state === "suspended") audioCtx.resume().catch(() => {});
  return true;
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
      } else if (isActive && isPageVisible()) {
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
  if (!isActive || !userInteracted || pausedByUser) return;
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
      if (foreground && trigger !== "user") foregroundGrabs++;
      console.log("[KeepAlive] 已接回靜音");
      return;
    }
    retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_MS);
    nextRetryAt = Date.now() + retryDelayMs;
    // 前台播不起來多半是需要使用者手勢：下次觸摸畫面再試
    if (isActive && isPageVisible()) addInteractionListeners();
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

// ---------- 用戶互動偵測 ----------
function onUserInteraction() {
  userInteracted = true;
  removeInteractionListeners();
  tryResume("user");
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
function handleVisibilityChange() {
  if (!isActive || !isPageVisible()) return;
  // 回到 App：使用者在音樂欄的暫停到此為止，重新接回保活
  pausedByUser = false;
  resetRetryState();
  startPoll();
  tryResume("return");
}

function handlePageResume() {
  // 頁面從凍結恢復（Page Lifecycle resume 事件）
  if (!isActive) return;
  startPoll();
  tryResume("poll");
}

// ---------- 主控：啟動/停止 ----------
export function startKeepAlive() {
  if (isActive) return;
  isActive = true;
  pausedByUser = false;
  resetRetryState();

  acquireWebLock();
  startPoll();
  if (userInteracted) {
    tryResume("user");
  } else {
    addInteractionListeners();
  }

  document.addEventListener("visibilitychange", handleVisibilityChange);
  document.addEventListener("resume", handlePageResume);

  console.log("[KeepAlive] 已啟動");
}

export function stopKeepAlive() {
  if (!isActive) return;
  isActive = false;

  stopPoll();
  releaseWebLock();
  stopSilentOscillator();
  stopSilentAudio();
  removeInteractionListeners();
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  document.removeEventListener("resume", handlePageResume);

  pausedByUser = false;
  resumePending = false;
  resetRetryState();
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
