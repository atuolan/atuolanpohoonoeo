/**
 * 噗浪共用的「現在」：每 30 秒更新，讓排到之後的回應時間到就冒出來
 */

import { onMounted, onUnmounted, ref } from "vue";

const now = ref(Date.now());
let timer: number | null = null;
let users = 0;

export function usePlurkClock() {
  onMounted(() => {
    users++;
    now.value = Date.now();
    if (timer === null) timer = window.setInterval(() => (now.value = Date.now()), 30_000);
  });
  onUnmounted(() => {
    users--;
    if (users <= 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  });
  return now;
}
