<script setup lang="ts">
/**
 * 噗浪第一次打開的導覽（只出現一次）：跟著用，每一步都可以直接點亮起來的地方試試。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    /** 外殼在河道分頁、沒有開任何彈窗時才給 true */
    active: boolean;
    /** 例：「噗浪發文走主 API；噗浪評論走備用「便宜」」 */
    apiRouteText: string;
  }>(),
  { apiRouteText: "" },
);

const emit = defineEmits<{ openGuide: []; openApiSettings: [] }>();

const STORAGE_KEY = "aguaphone-plurk-tour-done";
const STEP_KEY = "aguaphone-plurk-tour-step";

const STEPS: Array<{ id: string; selector: string | null; text: string; tryable: boolean }> = [
  {
    id: "river",
    selector: ".plurk-tabbar .tab:nth-child(1)",
    tryable: false,
    text: "這裡是河道：你和好友角色的噗都在這裡。接下來帶你走一圈，每一步都可以直接點亮起來的地方試試，不想試就按「下一步」。",
  },
  {
    id: "compose",
    selector: ".plurk-fab",
    tryable: true,
    text: "發噗：選發語詞、決定給誰看，角色會陸續來回應。想試就點「發噗」寫一則，關掉後會接著下一步。",
  },
  {
    id: "director",
    selector: '[aria-label="AI 導演"]',
    tryable: true,
    text: "AI 導演：設定角色多常自己發噗、回應，還有廣場的路人和版主。點開看看，或按「下一步」。",
  },
  {
    id: "square",
    selector: ".plurk-tabbar .tab:nth-child(2)",
    tryable: true,
    text: "廣場：陌生路人的噗。點進去後按「讓廣場熱鬧起來」，一次生一批、照時間慢慢出現；回到河道會接著說明。",
  },
  {
    id: "notice",
    selector: ".plurk-tabbar .tab:nth-child(3)",
    tryable: true,
    text: "通知：角色回你、按讚、版主處理和禁言都在這裡。",
  },
  {
    id: "api",
    selector: null,
    tryable: false,
    text: "省 API 小技巧：噗浪的發文和回應可以改走便宜的備用 API。到「設定 → 備用模型與分流」打開「啟用備用 API」，再在「各功能走哪個 API」把「噗浪發文」「噗浪評論」選成備用配置。",
  },
  {
    id: "done",
    selector: ".plurk-tabbar .tab:nth-child(4)",
    tryable: false,
    text: "完整的使用說明在「我」→「使用說明」，河道右上角的「⋯」裡也有。",
  },
];

const visible = ref(false);
const stepIndex = ref(0);
const currentStep = computed(() => STEPS[stepIndex.value]);
const isLastStep = computed(() => stepIndex.value === STEPS.length - 1);

const spotlightRect = ref<DOMRect | null>(null);

function readFlag(key: string): boolean {
  try {
    return !!localStorage.getItem(key);
  } catch {
    return false;
  }
}

function readStep(): number {
  try {
    const raw = localStorage.getItem(STEP_KEY);
    if (raw === null) return 0;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0 || n >= STEPS.length) return 0;
    return n;
  } catch {
    return 0;
  }
}

function saveStep(i: number) {
  try {
    localStorage.setItem(STEP_KEY, String(i));
  } catch {
    // 存不了就重來
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
  if (!step) return;
  const el = step.selector ? document.querySelector<HTMLElement>(step.selector) : null;
  spotlightRect.value = isOnScreen(el) ? el.getBoundingClientRect() : null;
}

let rafId: number | null = null;
function scheduleUpdate() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    rafId = null;
    updateSpotlight();
  });
}

function finish() {
  visible.value = false;
  try {
    localStorage.setItem(STORAGE_KEY, "1");
    localStorage.removeItem(STEP_KEY);
  } catch {
    // 存不了就下次再看一次
  }
}

function next() {
  if (isLastStep.value) {
    finish();
    return;
  }
  stepIndex.value++;
  saveStep(stepIndex.value);
  nextTick(scheduleUpdate);
}

function openGuide() {
  finish();
  emit("openGuide");
}

function goApiSettings() {
  stepIndex.value++;
  saveStep(stepIndex.value);
  visible.value = false;
  emit("openApiSettings");
}

function start() {
  if (visible.value || readFlag(STORAGE_KEY)) return;
  stepIndex.value = readStep();
  visible.value = true;
  nextTick(scheduleUpdate);
}

let startTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.active,
  (on) => {
    if (!on) {
      if (startTimer) {
        clearTimeout(startTimer);
        startTimer = null;
      }
      if (!visible.value) return;
      // 使用者點了亮起來的地方或開了別的畫面 → 先暫停，回來接著下一步
      if (isLastStep.value) {
        finish();
      } else {
        visible.value = false;
        stepIndex.value++;
        saveStep(stepIndex.value);
      }
      return;
    }
    if (startTimer) clearTimeout(startTimer);
    startTimer = setTimeout(() => {
      startTimer = null;
      if (!props.active) return;
      start();
    }, 800);
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
const arrowBelow = computed(
  () => !!spotlightRect.value && spotlightRect.value.bottom + 180 < window.innerHeight,
);
const arrowLeft = computed(() => {
  const r = spotlightRect.value;
  if (!r) return "18px";
  const left = Math.min(window.innerWidth - TOOLTIP_WIDTH - 12, Math.max(12, r.left - 12));
  return `${Math.max(14, Math.min(TOOLTIP_WIDTH - 28, r.left + r.width / 2 - left - 7))}px`;
});

let mo: MutationObserver | null = null;

onMounted(() => {
  window.addEventListener("resize", scheduleUpdate);
  window.addEventListener("scroll", scheduleUpdate, true);
  mo = new MutationObserver(scheduleUpdate);
  mo.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style"],
  });
});

onUnmounted(() => {
  window.removeEventListener("resize", scheduleUpdate);
  window.removeEventListener("scroll", scheduleUpdate, true);
  mo?.disconnect();
  if (rafId) cancelAnimationFrame(rafId);
  if (startTimer) clearTimeout(startTimer);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="plurk-tour-fade">
      <div v-if="visible" class="plurk-tour">
        <template v-if="spotlightRect">
          <div
            class="plurk-tour-mask"
            :style="{
              top: '0',
              left: '0',
              right: '0',
              height: Math.max(0, spotlightRect.top - 8) + 'px',
            }"
          />
          <div
            class="plurk-tour-mask"
            :style="{ top: spotlightRect.bottom + 8 + 'px', left: '0', right: '0', bottom: '0' }"
          />
          <div
            class="plurk-tour-mask"
            :style="{
              top: spotlightRect.top - 8 + 'px',
              left: '0',
              width: Math.max(0, spotlightRect.left - 8) + 'px',
              height: spotlightRect.height + 16 + 'px',
            }"
          />
          <div
            class="plurk-tour-mask"
            :style="{
              top: spotlightRect.top - 8 + 'px',
              left: spotlightRect.right + 8 + 'px',
              right: '0',
              height: spotlightRect.height + 16 + 'px',
            }"
          />
          <div
            class="plurk-tour-ring"
            :style="{
              top: spotlightRect.top - 8 + 'px',
              left: spotlightRect.left - 8 + 'px',
              width: spotlightRect.width + 16 + 'px',
              height: spotlightRect.height + 16 + 'px',
            }"
          />
        </template>
        <div v-else class="plurk-tour-mask" style="inset: 0" />

        <div
          :key="stepIndex"
          class="plurk-tour-card"
          :style="tooltipStyle"
          role="dialog"
          aria-live="polite"
        >
          <div
            v-if="spotlightRect"
            class="plurk-tour-arrow"
            :class="arrowBelow ? 'arrow-up' : 'arrow-down'"
            :style="{ left: arrowLeft }"
          />
          <p class="plurk-tour-text">{{ currentStep?.text }}</p>
          <p v-if="currentStep?.id === 'api' && props.apiRouteText" class="plurk-tour-sub">
            目前：{{ props.apiRouteText }}
          </p>
          <p v-if="currentStep?.tryable" class="plurk-tour-sub">點亮起來的地方試試看</p>
          <div class="plurk-tour-footer">
            <span class="plurk-tour-progress">{{ stepIndex + 1 }} / {{ STEPS.length }}</span>
            <div class="plurk-tour-actions">
              <template v-if="currentStep?.id === 'api'">
                <button type="button" class="plurk-tour-skip" @click="goApiSettings">去設定</button>
                <button type="button" class="plurk-tour-next" @click="next">下一步</button>
              </template>
              <template v-else-if="isLastStep">
                <button type="button" class="plurk-tour-skip" @click="finish">知道了</button>
                <button type="button" class="plurk-tour-next" @click="openGuide">看使用說明</button>
              </template>
              <template v-else>
                <button type="button" class="plurk-tour-skip" @click="finish">結束導覽</button>
                <button type="button" class="plurk-tour-next" @click="next">下一步</button>
              </template>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.plurk-tour {
  position: fixed;
  inset: 0;
  z-index: 99999;
  pointer-events: none;
}

.plurk-tour-mask {
  position: absolute;
  background: rgba(0, 0, 0, 0.52);
  pointer-events: auto;
}

.plurk-tour-ring {
  position: absolute;
  border-radius: 14px;
  pointer-events: none;
  animation: plurk-tour-pulse 1.6s ease-in-out infinite;
}

@keyframes plurk-tour-pulse {
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

.plurk-tour-card {
  position: absolute;
  width: 260px;
  max-width: calc(100vw - 24px);
  padding: 12px 14px 10px;
  border-radius: 12px;
  background: var(--color-surface, #fff);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.22);
  pointer-events: auto;
  animation: plurk-tour-pop 0.25s ease;
}

@keyframes plurk-tour-pop {
  from {
    opacity: 0;
    translate: 0 -4px;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}

.plurk-tour-arrow {
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

.plurk-tour-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text, #333);
}

.plurk-tour-sub {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-secondary, #999);
}

.plurk-tour-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.plurk-tour-progress {
  font-size: 12px;
  color: var(--color-text-secondary, #999);
}

.plurk-tour-actions {
  display: flex;
  gap: 4px;
  align-items: center;
  margin-left: auto;
}

.plurk-tour-skip {
  background: transparent;
  border: none;
  font: inherit;
  font-size: 14px;
  padding: 8px 10px;
  color: var(--color-text-secondary, #999);
  cursor: pointer;
}

.plurk-tour-next {
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

.plurk-tour-fade-enter-active,
.plurk-tour-fade-leave-active {
  transition: opacity 0.25s ease;
}

.plurk-tour-fade-enter-from,
.plurk-tour-fade-leave-to {
  opacity: 0;
}
</style>
