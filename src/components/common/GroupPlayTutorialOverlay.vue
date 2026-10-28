<script setup lang="ts">
/**
 * 群聊玩法教學（只出現一次）
 * 第一次打開群聊（含多人卡）時出現：輸入框打指令擲骰、＋ → 禮物 → 紅包分頁、角色擲骰與紅包過期退回。
 * 版面照抄 AI 回覆提示教學；沒有略過，按「下一步」走完。
 */
import { useAIGenerationStore } from "@/stores";
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";

const props = defineProps<{
  chatId: string | null;
}>();

const STORAGE_KEY = "aguaphone-group-play-tutorial-done";
/** 外觀教學還沒走完時先不出現，免得兩個疊在一起 */
const THEME_TUTORIAL_KEY = "aguaphone-theme-tutorial-done";

type StepId = "dice" | "redpacket" | "rules";
const steps: StepId[] = ["dice", "redpacket", "rules"];

const aiGenerationStore = useAIGenerationStore();

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

function updateSpotlight() {
  if (!visible.value) return;
  const step = currentStep.value;

  if (step === "dice") {
    const input = document.querySelector<HTMLElement>(".message-input");
    spotlightRect.value = isOnScreen(input) ? input.getBoundingClientRect() : null;
    label.value =
      "群聊有骰子機器人了！在輸入框打 .r 擲骰（例如 .r 2d6+3 攻擊）、.ra 偵查 60 做技能檢定，打 .help 看全部指令，句點打全形「。」也可以。";
    return;
  }

  if (step === "redpacket") {
    // 功能面板打開了就直接框「禮物」
    const gift = document.querySelector<HTMLElement>(".gift-feature-icon")?.closest<HTMLElement>(".feature-item") ?? null;
    if (isOnScreen(gift)) {
      spotlightRect.value = gift.getBoundingClientRect();
      label.value = "點「禮物」，裡面多了「紅包」分頁：拼手氣、平分、專屬三種，角色會自己來搶。";
      return;
    }
    const plus = document.querySelector<HTMLElement>(".plus-btn");
    spotlightRect.value = isOnScreen(plus) ? plus.getBoundingClientRect() : null;
    label.value =
      "想發紅包？點＋打開功能面板，再點「禮物」，裡面多了「紅包」分頁：拼手氣、平分、專屬三種，角色會自己來搶。";
    return;
  }

  spotlightRect.value = null;
  label.value =
    "角色也會自己擲骰，🎲 卡片上的點數都是系統真的擲出來的，角色不能自己編；需要你檢定時，角色會請你自己擲。紅包 24 小時沒領完會過期，你發的紅包剩下的錢會退回錢包。";
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
  if (visible.value || readFlag(STORAGE_KEY) || !readFlag(THEME_TUTORIAL_KEY)) return;
  // AI 正在回覆或別的教學還開著（AI 回覆提示教學這時會出現），等一下再來
  const busy =
    (!!props.chatId && aiGenerationStore.isTaskGenerating(props.chatId, "chat")) ||
    !!document.querySelector(".ai-tutorial");
  if (busy) {
    startTimer = setTimeout(tryStart, 3000);
    return;
  }
  stepIndex.value = 0;
  visible.value = true;
  nextTick(scheduleUpdate);
}

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
  // 等聊天頁畫好、輸入框出現再開始
  startTimer = setTimeout(tryStart, 800);
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
    <Transition name="group-tutorial-fade">
      <div v-if="visible" class="group-tutorial">
        <template v-if="spotlightRect">
          <div class="group-tutorial-mask" :style="{ top: '0', left: '0', right: '0', height: Math.max(0, spotlightRect.top - 8) + 'px' }" />
          <div class="group-tutorial-mask" :style="{ top: spotlightRect.bottom + 8 + 'px', left: '0', right: '0', bottom: '0' }" />
          <div
            class="group-tutorial-mask"
            :style="{ top: spotlightRect.top - 8 + 'px', left: '0', width: Math.max(0, spotlightRect.left - 8) + 'px', height: spotlightRect.height + 16 + 'px' }"
          />
          <div
            class="group-tutorial-mask"
            :style="{ top: spotlightRect.top - 8 + 'px', left: spotlightRect.right + 8 + 'px', right: '0', height: spotlightRect.height + 16 + 'px' }"
          />
          <div
            class="group-tutorial-ring"
            :style="{
              top: spotlightRect.top - 8 + 'px',
              left: spotlightRect.left - 8 + 'px',
              width: spotlightRect.width + 16 + 'px',
              height: spotlightRect.height + 16 + 'px',
            }"
          />
        </template>
        <div v-else class="group-tutorial-mask" style="inset: 0" />

        <div :key="currentStep" class="group-tutorial-card" :style="tooltipStyle" role="dialog" aria-live="polite">
          <div
            v-if="spotlightRect"
            class="group-tutorial-arrow"
            :class="arrowBelow ? 'arrow-up' : 'arrow-down'"
            :style="{ left: arrowLeft }"
          />
          <p class="group-tutorial-text">{{ label }}</p>
          <div class="group-tutorial-footer">
            <span v-if="steps.length > 1" class="group-tutorial-progress">{{ stepIndex + 1 }} / {{ steps.length }}</span>
            <button type="button" class="group-tutorial-next" @click="next">{{ isLastStep ? "知道了" : "下一步" }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.group-tutorial {
  position: fixed;
  inset: 0;
  z-index: 99999;
  pointer-events: none;
}

.group-tutorial-mask {
  position: absolute;
  background: rgba(0, 0, 0, 0.52);
  pointer-events: auto;
}

.group-tutorial-ring {
  position: absolute;
  border-radius: 14px;
  pointer-events: none;
  animation: group-tutorial-pulse 1.6s ease-in-out infinite;
}

@keyframes group-tutorial-pulse {
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

.group-tutorial-card {
  position: absolute;
  width: 260px;
  max-width: calc(100vw - 24px);
  padding: 12px 14px 10px;
  border-radius: 12px;
  background: var(--color-surface, #fff);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.22);
  pointer-events: auto;
  animation: group-tutorial-pop 0.25s ease;
}

@keyframes group-tutorial-pop {
  from {
    opacity: 0;
    translate: 0 -4px;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}

.group-tutorial-arrow {
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

.group-tutorial-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text, #333);
}

.group-tutorial-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.group-tutorial-progress {
  font-size: 12px;
  color: var(--color-text-secondary, #999);
}

.group-tutorial-next {
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

.group-tutorial-fade-enter-active,
.group-tutorial-fade-leave-active {
  transition: opacity 0.25s ease;
}

.group-tutorial-fade-enter-from,
.group-tutorial-fade-leave-to {
  opacity: 0;
}
</style>
