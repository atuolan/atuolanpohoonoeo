<script setup lang="ts">
/**
 * 圓桌模式教學（只出現一次）
 * 圓桌群聊第一次有成員講完話時出現：沒有重新生成，想讓誰重說就長按這一輪他的頭像；其他功能在群組詳情。
 * 版面照抄群聊玩法教學。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

const props = defineProps<{
  /** 圓桌開著、這一輪講完了（畫面上有成員的頭像可以框） */
  ready: boolean;
}>();

const STORAGE_KEY = "aguaphone-round-table-tutorial-done";
/** 外觀教學還沒走完時先不出現，免得兩個疊在一起 */
const THEME_TUTORIAL_KEY = "aguaphone-theme-tutorial-done";

type StepId = "avatar" | "details";
const steps: StepId[] = ["avatar", "details"];

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

/** 最後一則圓桌成員訊息的頭像（名字旁有模型小字的那種） */
function findLatestMemberAvatar(): HTMLElement | null {
  const models = document.querySelectorAll<HTMLElement>(".sender-model");
  const row = models[models.length - 1]?.closest<HTMLElement>("[data-message-id]");
  return row?.querySelector<HTMLElement>(".avatar-container") ?? null;
}

function updateSpotlight() {
  if (!visible.value) return;
  if (currentStep.value === "avatar") {
    const avatar = findLatestMemberAvatar();
    spotlightRect.value = isOnScreen(avatar) ? avatar.getBoundingClientRect() : null;
    label.value =
      "圓桌模式沒有「重新生成」：想讓哪位成員重說，就長按這一輪他的頭像，可以用原本的模型重說，或換一個模型講講看，原本那段會留著方便比較。點一下頭像還是 @ 他。";
    return;
  }
  spotlightRect.value = null;
  label.value =
    "其他圓桌功能都在群組詳情：幫成員換 API、發言順序、討論風格、加入模型本人；成員面板可以填身份與工作、辯論立場、跟他講悄悄話；最下面還有整理討論、請大家投票、請裁判結論。";
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
  if (document.querySelector(".ai-tutorial, .group-tutorial")) {
    startTimer = setTimeout(tryStart, 3000);
    return;
  }
  if (!isOnScreen(findLatestMemberAvatar())) {
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
    // 最後一則訊息照字數延遲上屏，等一下再框
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
    <Transition name="rt-tutorial-fade">
      <div v-if="visible" class="rt-tutorial">
        <template v-if="spotlightRect">
          <div class="rt-tutorial-mask" :style="{ top: '0', left: '0', right: '0', height: Math.max(0, spotlightRect.top - 8) + 'px' }" />
          <div class="rt-tutorial-mask" :style="{ top: spotlightRect.bottom + 8 + 'px', left: '0', right: '0', bottom: '0' }" />
          <div
            class="rt-tutorial-mask"
            :style="{ top: spotlightRect.top - 8 + 'px', left: '0', width: Math.max(0, spotlightRect.left - 8) + 'px', height: spotlightRect.height + 16 + 'px' }"
          />
          <div
            class="rt-tutorial-mask"
            :style="{ top: spotlightRect.top - 8 + 'px', left: spotlightRect.right + 8 + 'px', right: '0', height: spotlightRect.height + 16 + 'px' }"
          />
          <div
            class="rt-tutorial-ring"
            :style="{
              top: spotlightRect.top - 8 + 'px',
              left: spotlightRect.left - 8 + 'px',
              width: spotlightRect.width + 16 + 'px',
              height: spotlightRect.height + 16 + 'px',
            }"
          />
        </template>
        <div v-else class="rt-tutorial-mask" style="inset: 0" />

        <div :key="currentStep" class="rt-tutorial-card" :style="tooltipStyle" role="dialog" aria-live="polite">
          <div
            v-if="spotlightRect"
            class="rt-tutorial-arrow"
            :class="arrowBelow ? 'arrow-up' : 'arrow-down'"
            :style="{ left: arrowLeft }"
          />
          <p class="rt-tutorial-text">{{ label }}</p>
          <div class="rt-tutorial-footer">
            <span v-if="steps.length > 1" class="rt-tutorial-progress">{{ stepIndex + 1 }} / {{ steps.length }}</span>
            <button type="button" class="rt-tutorial-next" @click="next">{{ isLastStep ? "知道了" : "下一步" }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.rt-tutorial {
  position: fixed;
  inset: 0;
  z-index: 99999;
  pointer-events: none;
}

.rt-tutorial-mask {
  position: absolute;
  background: rgba(0, 0, 0, 0.52);
  pointer-events: auto;
}

.rt-tutorial-ring {
  position: absolute;
  border-radius: 14px;
  pointer-events: none;
  animation: rt-tutorial-pulse 1.6s ease-in-out infinite;
}

@keyframes rt-tutorial-pulse {
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

.rt-tutorial-card {
  position: absolute;
  width: 260px;
  max-width: calc(100vw - 24px);
  padding: 12px 14px 10px;
  border-radius: 12px;
  background: var(--color-surface, #fff);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.22);
  pointer-events: auto;
  animation: rt-tutorial-pop 0.25s ease;
}

@keyframes rt-tutorial-pop {
  from {
    opacity: 0;
    translate: 0 -4px;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}

.rt-tutorial-arrow {
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

.rt-tutorial-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text, #333);
}

.rt-tutorial-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.rt-tutorial-progress {
  font-size: 12px;
  color: var(--color-text-secondary, #999);
}

.rt-tutorial-next {
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

.rt-tutorial-fade-enter-active,
.rt-tutorial-fade-leave-active {
  transition: opacity 0.25s ease;
}

.rt-tutorial-fade-enter-from,
.rt-tutorial-fade-leave-to {
  opacity: 0;
}
</style>
