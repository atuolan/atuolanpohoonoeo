<script setup lang="ts">
/**
 * 忙碌教學（只出現一次）
 * 第一次在角色忙碌時留言、聊天裡出現忙碌小字時出現：說明他可能晚點回、可以試什麼、怎麼馬上結束。
 * 版面照抄圓桌模式教學。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

const props = defineProps<{
  /** 聊天裡有忙碌小字可以框 */
  ready: boolean;
}>();

const STORAGE_KEY = "aguaphone-char-busy-tutorial-done";
/** 外觀教學還沒走完時先不出現，免得兩個疊在一起 */
const THEME_TUTORIAL_KEY = "aguaphone-theme-tutorial-done";

type StepId = "hint" | "try" | "finish";
const steps: StepId[] = ["hint", "try", "finish"];

const visible = ref(false);
const stepIndex = ref(0);
const currentStep = computed(() => steps[stepIndex.value]);
const isLastStep = computed(() => stepIndex.value === steps.length - 1);

const spotlightRect = ref<DOMRect | null>(null);
const label = ref("");

function readFlag(key: string): boolean {
  try {
    return !!localStorage.getItem(key);
  } catch {
    return false;
  }
}

function isOnScreen(el: HTMLElement | null): el is HTMLElement {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0;
}

/** 最新的忙碌小字 */
function findHint(): HTMLElement | null {
  const hints = document.querySelectorAll<HTMLElement>(".away-hint");
  return hints[hints.length - 1] ?? null;
}

function updateSpotlight() {
  if (!visible.value) return;
  const hint = findHint();
  if (currentStep.value === "hint") {
    spotlightRect.value = isOnScreen(hint) ? hint.getBoundingClientRect() : null;
    label.value =
      "他在忙的時候不一定馬上回，可能晚點才看手機。有些事走不開，例如搭飛機，就只能等他忙完。";
    return;
  }
  if (currentStep.value === "try") {
    const action = hint?.querySelector<HTMLElement>(".away-hint-action") ?? null;
    spotlightRect.value = isOnScreen(action) ? action.getBoundingClientRect() : null;
    label.value =
      "試試看：連傳幾則他會比較快看到，也可以打電話給他，或按這裡的「偷偷回我」。他回你之後的幾分鐘空檔，可以多聊幾句。";
    return;
  }
  spotlightRect.value = null;
  label.value =
    "想馬上結束他的忙碌：刪掉他說要去忙的那則訊息，或到聊天設定的「時間模式」把時間調到忙完之後。";
}

let rafId: number | null = null;
function scheduleUpdate() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    rafId = null;
    updateSpotlight();
  });
}

function next() {
  if (isLastStep.value) {
    visible.value = false;
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // 存不了就下次再看一次
    }
    return;
  }
  stepIndex.value++;
  nextTick(scheduleUpdate);
}

let startTimer: ReturnType<typeof setTimeout> | null = null;

function tryStart() {
  startTimer = null;
  if (!props.ready || visible.value || readFlag(STORAGE_KEY) || !readFlag(THEME_TUTORIAL_KEY)) return;
  // 別的教學還開著就等一下
  if (document.querySelector(".ai-tutorial, .group-tutorial, .busy-tutorial")) {
    startTimer = setTimeout(tryStart, 3000);
    return;
  }
  if (!isOnScreen(findHint())) {
    startTimer = setTimeout(tryStart, 1500);
    return;
  }
  stepIndex.value = 0;
  visible.value = true;
  nextTick(scheduleUpdate);
}

watch(
  () => props.ready,
  (ready) => {
    if (startTimer) clearTimeout(startTimer);
    // 等訊息上屏再框
    if (ready) startTimer = setTimeout(tryStart, 1200);
  },
);

const TOOLTIP_WIDTH = 260;
const tooltipStyle = computed(() => {
  const r = spotlightRect.value;
  if (!r) return { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  const left = Math.min(window.innerWidth - TOOLTIP_WIDTH - 12, Math.max(12, r.left - 12));
  // 下方放不下就放上方
  return r.bottom + 180 < window.innerHeight
    ? { left: `${left}px`, top: `${r.bottom + 14}px` }
    : { left: `${left}px`, bottom: `${window.innerHeight - r.top + 14}px` };
});
const arrowBelow = computed(() => !!spotlightRect.value && spotlightRect.value.bottom + 180 < window.innerHeight);
const arrowLeft = computed(() => {
  const r = spotlightRect.value;
  if (!r) return "18px";
  const left = Math.min(window.innerWidth - TOOLTIP_WIDTH - 12, Math.max(12, r.left - 12));
  return `${Math.max(14, Math.min(TOOLTIP_WIDTH - 28, r.left + r.width / 2 - left - 7))}px`;
});

let mo: MutationObserver | null = null;

onMounted(() => {
  window.addEventListener("resize", scheduleUpdate);
  mo = new MutationObserver(scheduleUpdate);
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
  if (props.ready) startTimer = setTimeout(tryStart, 1200);
});

onUnmounted(() => {
  window.removeEventListener("resize", scheduleUpdate);
  mo?.disconnect();
  if (rafId) cancelAnimationFrame(rafId);
  if (startTimer) clearTimeout(startTimer);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="busy-tutorial-fade">
      <div v-if="visible" class="busy-tutorial">
        <template v-if="spotlightRect">
          <div class="busy-tutorial-mask" :style="{ top: '0', left: '0', right: '0', height: Math.max(0, spotlightRect.top - 8) + 'px' }" />
          <div class="busy-tutorial-mask" :style="{ top: spotlightRect.bottom + 8 + 'px', left: '0', right: '0', bottom: '0' }" />
          <div
            class="busy-tutorial-mask"
            :style="{ top: spotlightRect.top - 8 + 'px', left: '0', width: Math.max(0, spotlightRect.left - 8) + 'px', height: spotlightRect.height + 16 + 'px' }"
          />
          <div
            class="busy-tutorial-mask"
            :style="{ top: spotlightRect.top - 8 + 'px', left: spotlightRect.right + 8 + 'px', right: '0', height: spotlightRect.height + 16 + 'px' }"
          />
          <div
            class="busy-tutorial-ring"
            :style="{
              top: spotlightRect.top - 8 + 'px',
              left: spotlightRect.left - 8 + 'px',
              width: spotlightRect.width + 16 + 'px',
              height: spotlightRect.height + 16 + 'px',
            }"
          />
        </template>
        <div v-else class="busy-tutorial-mask" style="inset: 0" />

        <div :key="currentStep" class="busy-tutorial-card" :style="tooltipStyle" role="dialog" aria-live="polite">
          <div
            v-if="spotlightRect"
            class="busy-tutorial-arrow"
            :class="arrowBelow ? 'arrow-up' : 'arrow-down'"
            :style="{ left: arrowLeft }"
          />
          <p class="busy-tutorial-text">{{ label }}</p>
          <div class="busy-tutorial-footer">
            <span v-if="steps.length > 1" class="busy-tutorial-progress">{{ stepIndex + 1 }} / {{ steps.length }}</span>
            <button type="button" class="busy-tutorial-next" @click="next">{{ isLastStep ? "知道了" : "下一步" }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.busy-tutorial {
  position: fixed;
  inset: 0;
  z-index: 99999;
  pointer-events: none;
}

.busy-tutorial-mask {
  position: absolute;
  background: rgba(0, 0, 0, 0.52);
  pointer-events: auto;
}

.busy-tutorial-ring {
  position: absolute;
  border-radius: 14px;
  pointer-events: none;
  animation: busy-tutorial-pulse 1.6s ease-in-out infinite;
}

@keyframes busy-tutorial-pulse {
  0%,
  100% {
    box-shadow:
      0 0 0 3px rgba(108, 142, 191, 0.85),
      0 0 0 6px rgba(108, 142, 191, 0.25);
  }
  50% {
    box-shadow:
      0 0 0 4px rgba(108, 142, 191, 1),
      0 0 0 10px rgba(108, 142, 191, 0.35);
  }
}

.busy-tutorial-card {
  position: absolute;
  width: 260px;
  max-width: calc(100vw - 24px);
  padding: 12px 14px 10px;
  border-radius: 12px;
  background: var(--color-surface, #fff);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.22);
  pointer-events: auto;
  animation: busy-tutorial-pop 0.25s ease;
}

@keyframes busy-tutorial-pop {
  from {
    opacity: 0;
    translate: 0 -4px;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}

.busy-tutorial-arrow {
  position: absolute;
  width: 0;
  height: 0;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
}

.arrow-up {
  top: -7px;
  border-bottom: 7px solid var(--color-surface, #fff);
}

.arrow-down {
  bottom: -7px;
  border-top: 7px solid var(--color-surface, #fff);
}

.busy-tutorial-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text, #333);
}

.busy-tutorial-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.busy-tutorial-progress {
  font-size: 12px;
  color: var(--color-text-secondary, #999);
}

.busy-tutorial-next {
  margin-left: auto;
  padding: 6px 16px;
  border: none;
  border-radius: 999px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-on-primary-contrast, #fff);
  background: var(--color-primary, #6c8ebf);
  cursor: pointer;
}

.busy-tutorial-fade-enter-active,
.busy-tutorial-fade-leave-active {
  transition: opacity 0.25s ease;
}

.busy-tutorial-fade-enter-from,
.busy-tutorial-fade-leave-to {
  opacity: 0;
}
</style>
