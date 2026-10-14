/**
 * 通話共用的 AudioContext
 *
 * iOS 只允許在使用者點擊的當下建立／恢復 AudioContext，所以撥打、接聽、
 * 按麥克風鍵時要「同步」呼叫 primeCallAudioContext()（不能在 await 之後）。
 * 不依賴任何 store，避免 phoneCall store 與語音 store 互相引用。
 */
let sharedContext: AudioContext | null = null;

function hasAudioContext(): boolean {
  return typeof window !== "undefined" && typeof window.AudioContext === "function";
}

export function isAudioCaptureSupported(): boolean {
  return (
    hasAudioContext() &&
    typeof AudioWorkletNode !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

/** 在點擊當下呼叫：建立或恢復共用 AudioContext（不等待結果） */
export function primeCallAudioContext(): void {
  if (!hasAudioContext()) return;
  try {
    if (!sharedContext || sharedContext.state === "closed") sharedContext = new AudioContext();
    if (sharedContext.state === "suspended") void sharedContext.resume().catch(() => {});
  } catch (err) {
    console.warn("[callVoice] 預熱音訊環境失敗:", err);
  }
}

/** 取得運作中的 AudioContext；回傳 null 代表必須等使用者點一下才能啟動 */
export async function getRunningCallAudioContext(): Promise<AudioContext | null> {
  if (!hasAudioContext()) return null;
  if (!sharedContext || sharedContext.state === "closed") sharedContext = new AudioContext();
  const ctx = sharedContext;
  if (ctx.state === "suspended") {
    // iOS 在非點擊情境下 resume 可能永遠不回應，所以設時限
    await Promise.race([
      ctx.resume().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  }
  return ctx.state === "running" ? ctx : null;
}

/** 通話結束時釋放 */
export function closeCallAudioContext(): void {
  const ctx = sharedContext;
  sharedContext = null;
  if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
}
