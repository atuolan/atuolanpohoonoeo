<script setup lang="ts">
/**
 * AI 回覆提示搬家教學（只出現一次）
 * 在聊天頁第一次有回覆開始生成時出現：頂欄「正在輸入...」可以點、上次輸出在聊天設定裡、
 * 其他畫面的提示改成貼邊按鈕。沒有略過，按「下一步」走完。
 */
import { useAIGenerationStore } from "@/stores";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

const props = defineProps<{
  chatId: string | null;
  /** 有開流式輸出窗口：才講頂欄小圖示和查看上次輸出 */
  streamingWindowEnabled: boolean;
}>();

const STORAGE_KEY = "aguaphone-ai-indicator-tutorial-done";
/** 外觀教學還沒走完時先不出現，免得兩個疊在一起 */
const THEME_TUTORIAL_KEY = "aguaphone-theme-tutorial-done";

type StepId = "status" | "menu" | "edge";

const aiGenerationStore = useAIGenerationStore();

const visible = ref(false);
const steps = ref<StepId[]>([]);
const stepIndex = ref(0);
const currentStep = computed(() => steps.value[stepIndex.value]);
const isLastStep = computed(() => stepIndex.value === steps.value.length - 1);

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

function updateSpotlight() {
  if (!visible.value) return;
  const step = currentStep.value;

  if (step === "status") {
    const status = document.querySelector<HTMLElement>(".chat-status-btn");
    spotlightRect.value = isOnScreen(status) ? status.getBoundingClientRect() : null;
    // 回覆可能在看說明時就寫完了，頂欄的提示跟著消失，改成講位置
    label.value = spotlightRect.value
      ? "AI 回覆的提示搬家了！以前角落那顆「••• 數字」不見了，AI 回覆時點這裡，就能看它正在寫什麼。"
      : "AI 回覆的提示搬家了！以前角落那顆「••• 數字」不見了，之後 AI 回覆時，點頂欄名字下面的「正在輸入...」，就能看它正在寫什麼。";
    return;
  }

  if (step === "menu") {
    const settingsBtn = document.querySelector<HTMLElement>('.header-btn[title="聊天設定"]');
    if (isOnScreen(settingsBtn)) {
      spotlightRect.value = settingsBtn.getBoundingClientRect();
      label.value =
        "回覆完想再看一次？到「聊天設定 → AI 回覆 → 查看上次輸出」，調試資訊、提示詞、複製輸出都在。";
      return;
    }
    // 手機上工具列收起來時，聊天設定藏在 ⌄ 裡
    const rail = document.querySelector<HTMLElement>(".rail-toggle-btn");
    spotlightRect.value = isOnScreen(rail) ? rail.getBoundingClientRect() : null;
    label.value =
      "回覆完想再看一次？點這裡展開工具列，再到「聊天設定 → AI 回覆 → 查看上次輸出」，調試資訊、提示詞、複製輸出都在。";
    return;
  }

  spotlightRect.value = null;
  label.value =
    "在其他畫面，AI 還在忙時，螢幕邊緣會出現一顆小按鈕，可以拖到左邊或右邊，點開能看進度或中止。";
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

function start() {
  if (visible.value || readFlag(STORAGE_KEY) || !readFlag(THEME_TUTORIAL_KEY)) return;
  steps.value = props.streamingWindowEnabled ? ["status", "menu", "edge"] : ["edge"];
  stepIndex.value = 0;
  visible.value = true;
  nextTick(scheduleUpdate);
}

let startTimer: ReturnType<typeof setTimeout> | null = null;

// 這個聊天開始回覆時才出現：頂欄的「正在輸入...」小圖示這時才在
watch(
  () => !!props.chatId && aiGenerationStore.isTaskGenerating(props.chatId, "chat"),
  (generating) => {
    if (!generating || startTimer) return;
    startTimer = setTimeout(() => {
      startTimer = null;
      start();
    }, 600);
  },
  { immediate: true },
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
    <Transition name="ai-tutorial-fade">
      <div v-if="visible" class="ai-tutorial">
        <template v-if="spotlightRect">
          <div class="ai-tutorial-mask" :style="{ top: '0', left: '0', right: '0', height: Math.max(0, spotlightRect.top - 8) + 'px' }" />
          <div class="ai-tutorial-mask" :style="{ top: spotlightRect.bottom + 8 + 'px', left: '0', right: '0', bottom: '0' }" />
          <div
            class="ai-tutorial-mask"
            :style="{ top: spotlightRect.top - 8 + 'px', left: '0', width: Math.max(0, spotlightRect.left - 8) + 'px', height: spotlightRect.height + 16 + 'px' }"
          />
          <div
            class="ai-tutorial-mask"
            :style="{ top: spotlightRect.top - 8 + 'px', left: spotlightRect.right + 8 + 'px', right: '0', height: spotlightRect.height + 16 + 'px' }"
          />
          <div
            class="ai-tutorial-ring"
            :style="{
              top: spotlightRect.top - 8 + 'px',
              left: spotlightRect.left - 8 + 'px',
              width: spotlightRect.width + 16 + 'px',
              height: spotlightRect.height + 16 + 'px',
            }"
          />
        </template>
        <div v-else class="ai-tutorial-mask" style="inset: 0" />

        <div :key="currentStep" class="ai-tutorial-card" :style="tooltipStyle" role="dialog" aria-live="polite">
          <div
            v-if="spotlightRect"
            class="ai-tutorial-arrow"
            :class="arrowBelow ? 'arrow-up' : 'arrow-down'"
            :style="{ left: arrowLeft }"
          />
          <p class="ai-tutorial-text">{{ label }}</p>
          <div class="ai-tutorial-footer">
            <span v-if="steps.length > 1" class="ai-tutorial-progress">{{ stepIndex + 1 }} / {{ steps.length }}</span>
            <button type="button" class="ai-tutorial-next" @click="next">{{ isLastStep ? "知道了" : "下一步" }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ai-tutorial {
  position: fixed;
  inset: 0;
  z-index: 99999;
  pointer-events: none;
}

.ai-tutorial-mask {
  position: absolute;
  background: rgba(0, 0, 0, 0.52);
  pointer-events: auto;
}

.ai-tutorial-ring {
  position: absolute;
  border-radius: 14px;
  pointer-events: none;
  animation: ai-tutorial-pulse 1.6s ease-in-out infinite;
}

@keyframes ai-tutorial-pulse {
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

.ai-tutorial-card {
  position: absolute;
  width: 260px;
  max-width: calc(100vw - 24px);
  padding: 12px 14px 10px;
  border-radius: 12px;
  background: var(--color-surface, #fff);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.22);
  pointer-events: auto;
  animation: ai-tutorial-pop 0.25s ease;
}

@keyframes ai-tutorial-pop {
  from {
    opacity: 0;
    translate: 0 -4px;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}

.ai-tutorial-arrow {
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

.ai-tutorial-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text, #333);
}

.ai-tutorial-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.ai-tutorial-progress {
  font-size: 12px;
  color: var(--color-text-secondary, #999);
}

.ai-tutorial-next {
  margin-left: auto;
  padding: 6px 16px;
  border: none;
  border-radius: 999px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: var(--color-primary, #6c8ebf);
  cursor: pointer;
}

.ai-tutorial-fade-enter-active,
.ai-tutorial-fade-leave-active {
  transition: opacity 0.25s ease;
}

.ai-tutorial-fade-enter-from,
.ai-tutorial-fade-leave-to {
  opacity: 0;
}
</style>
