/**
 * 手機搖一搖：偵測開始搖、停下來（六爻搖卦用）
 * iOS 要在點擊處理裡呼叫 start() 請求權限；沒有感應器或被拒絕就記下來，之後不再顯示
 */
import { getCurrentInstance, onBeforeUnmount, ref } from "vue";

export type ShakeStartResult = "ok" | "denied" | "unsupported";

export const SHAKE_UNSUPPORTED_KEY = "liuyao-shake-unsupported";

/** 加速度變化超過這個值算在搖 */
const SHAKE_THRESHOLD = 14;
/** 停下多久算落地 */
const STILL_MS = 450;
/** 至少要搖這麼久才算一次 */
const MIN_SHAKE_MS = 250;
/** 等第一個感應器事件的時間 */
const PROBE_MS = 1000;

export function isShakeMaybeSupported(): boolean {
  if (typeof window === "undefined" || typeof DeviceMotionEvent === "undefined") return false;
  if (!window.matchMedia?.("(pointer: coarse)").matches) return false;
  try {
    return !localStorage.getItem(SHAKE_UNSUPPORTED_KEY);
  } catch {
    return true;
  }
}

export function markShakeUnsupported(): void {
  try {
    localStorage.setItem(SHAKE_UNSUPPORTED_KEY, "1");
  } catch {
    // 無痕模式等情況存不了，下次再試一次就好
  }
}

export function buzz(ms = 30): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // iOS 網頁沒有震動
  }
}

export function useShake(opts: { onShakeStart?: () => void; onShakeEnd: () => void }) {
  const shaking = ref(false);
  const active = ref(false);

  let last: { x: number; y: number; z: number } | null = null;
  let shakeStartAt = 0;
  let lastShakeAt = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let gotEvent: (() => void) | null = null;

  function checkStill(now: number) {
    if (shaking.value && now - lastShakeAt > STILL_MS && now - shakeStartAt >= MIN_SHAKE_MS) {
      shaking.value = false;
      opts.onShakeEnd();
    }
  }

  function onMotion(e: DeviceMotionEvent) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x === null) return;
    gotEvent?.();
    const cur = { x: a.x ?? 0, y: a.y ?? 0, z: a.z ?? 0 };
    const now = Date.now();
    if (last) {
      const delta = Math.abs(cur.x - last.x) + Math.abs(cur.y - last.y) + Math.abs(cur.z - last.z);
      if (delta > SHAKE_THRESHOLD) {
        if (!shaking.value) {
          shaking.value = true;
          shakeStartAt = now;
          opts.onShakeStart?.();
        }
        lastShakeAt = now;
      }
    }
    last = cur;
    checkStill(now);
  }

  function stop() {
    window.removeEventListener("devicemotion", onMotion);
    if (timer) clearInterval(timer);
    timer = undefined;
    gotEvent = null;
    last = null;
    shaking.value = false;
    active.value = false;
  }

  async function start(): Promise<ShakeStartResult> {
    if (typeof DeviceMotionEvent === "undefined") return "unsupported";
    const req = (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
    if (typeof req === "function") {
      try {
        if ((await req()) !== "granted") return "denied";
      } catch {
        return "denied";
      }
    }
    stop();
    const ok = await new Promise<boolean>((resolve) => {
      const t = setTimeout(() => {
        gotEvent = null;
        resolve(false);
      }, PROBE_MS);
      gotEvent = () => {
        gotEvent = null;
        clearTimeout(t);
        resolve(true);
      };
      window.addEventListener("devicemotion", onMotion);
    });
    if (!ok) {
      stop();
      return "unsupported";
    }
    timer = setInterval(() => checkStill(Date.now()), 100);
    active.value = true;
    return "ok";
  }

  if (getCurrentInstance()) onBeforeUnmount(stop);

  return { shaking, active, start, stop };
}
