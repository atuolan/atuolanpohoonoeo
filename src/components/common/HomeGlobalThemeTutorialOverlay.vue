<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";

const props = defineProps<{
  globalThemeOpen?: boolean;
}>();

const STORAGE_KEY = "aguaphone-home-global-theme-tutorial-done";

const visible = ref(false);
const spotlightRect = ref<DOMRect | null>(null);
const tooltipLeft = ref(12);
const tooltipBelow = ref(false);
const tooltipBottom = ref(0);
const skipDeniedVisible = ref(false);

let rafId: number | null = null;
let mutationObserver: MutationObserver | null = null;
let skipDeniedTimer: ReturnType<typeof setTimeout> | null = null;

function isTargetVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.top < window.innerHeight &&
    rect.bottom > 0
  );
}

function updateSpotlight() {
  if (!visible.value) return;

  const coreButton = document.querySelector<HTMLElement>(".core-btn");
  if (!coreButton || !isTargetVisible(coreButton)) {
    spotlightRect.value = null;
    return;
  }

  const rect = coreButton.getBoundingClientRect();
  spotlightRect.value = rect;
  tooltipBelow.value = rect.bottom + 120 < window.innerHeight;
  tooltipLeft.value = Math.min(
    window.innerWidth - 260,
    Math.max(12, rect.left + rect.width / 2 - 130),
  );
  tooltipBottom.value = Math.max(88, window.innerHeight - rect.top + 18);
}

function scheduleUpdate() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    rafId = null;
    updateSpotlight();
  });
}

function dismiss() {
  visible.value = false;
  localStorage.setItem(STORAGE_KEY, "1");
}

function denySkip() {
  skipDeniedVisible.value = true;

  if (skipDeniedTimer) clearTimeout(skipDeniedTimer);
  skipDeniedTimer = setTimeout(() => {
    skipDeniedVisible.value = false;
    skipDeniedTimer = null;
  }, 2200);
}

watch(
  () => props.globalThemeOpen,
  (isOpen) => {
    if (isOpen && visible.value) {
      dismiss();
    }
  },
);

onMounted(() => {
  if (props.globalThemeOpen || localStorage.getItem(STORAGE_KEY)) return;

  window.setTimeout(() => {
    if (props.globalThemeOpen || localStorage.getItem(STORAGE_KEY)) return;
    visible.value = true;
    scheduleUpdate();
  }, 900);

  window.addEventListener("resize", scheduleUpdate);
  window.addEventListener("scroll", scheduleUpdate, true);

  mutationObserver = new MutationObserver(scheduleUpdate);
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style"],
  });
});

onUnmounted(() => {
  window.removeEventListener("resize", scheduleUpdate);
  window.removeEventListener("scroll", scheduleUpdate, true);
  mutationObserver?.disconnect();
  if (rafId) cancelAnimationFrame(rafId);
  if (skipDeniedTimer) clearTimeout(skipDeniedTimer);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="home-tutorial-fade">
      <div v-if="visible" class="home-tutorial-overlay">
        <template v-if="spotlightRect">
          <div
            class="home-tutorial-mask-piece"
            :style="{
              top: '0',
              left: '0',
              right: '0',
              height: Math.max(0, spotlightRect.top - 12) + 'px',
            }"
          />
          <div
            class="home-tutorial-mask-piece"
            :style="{
              top: spotlightRect.bottom + 12 + 'px',
              left: '0',
              right: '0',
              bottom: '0',
            }"
          />
          <div
            class="home-tutorial-mask-piece"
            :style="{
              top: spotlightRect.top - 12 + 'px',
              left: '0',
              width: Math.max(0, spotlightRect.left - 12) + 'px',
              height: spotlightRect.height + 24 + 'px',
            }"
          />
          <div
            class="home-tutorial-mask-piece"
            :style="{
              top: spotlightRect.top - 12 + 'px',
              left: spotlightRect.right + 12 + 'px',
              right: '0',
              height: spotlightRect.height + 24 + 'px',
            }"
          />

          <div
            class="home-tutorial-spotlight"
            :style="{
              top: spotlightRect.top - 12 + 'px',
              left: spotlightRect.left - 12 + 'px',
              width: spotlightRect.width + 24 + 'px',
              height: spotlightRect.height + 24 + 'px',
            }"
          />

          <div
            class="home-tutorial-tooltip"
            :style="
              tooltipBelow
                ? { top: spotlightRect.bottom + 18 + 'px', left: tooltipLeft + 'px' }
                : { bottom: tooltipBottom + 'px', left: tooltipLeft + 'px' }
            "
          >
            <div
              class="home-tutorial-arrow"
              :class="tooltipBelow ? 'arrow-up' : 'arrow-down'"
            />
            <div class="home-tutorial-title">全局設定在這裡</div>
            <div class="home-tutorial-desc">
              長按底部圓形核心按鈕，就能開啟全局美化／首頁設定。
            </div>
            <div v-if="skipDeniedVisible" class="home-tutorial-denied">
              我知道你想跳過但我不允許
            </div>
            <button class="home-tutorial-skip" type="button" @click="denySkip">
              跳過教學
            </button>
          </div>
        </template>

        <div v-else class="home-tutorial-no-target">
          <div class="home-tutorial-title">全局設定教學</div>
          <div class="home-tutorial-desc">請回到首頁底部，長按核心按鈕開啟全局設定。</div>
          <div v-if="skipDeniedVisible" class="home-tutorial-denied">
            我知道你想跳過但我不允許
          </div>
          <button class="home-tutorial-skip large" type="button" @click="denySkip">
            跳過教學
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.home-tutorial-overlay {
  position: fixed;
  inset: 0;
  z-index: 99990;
  pointer-events: none;
}

.home-tutorial-mask-piece {
  position: absolute;
  background: rgba(10, 14, 24, 0.58);
  pointer-events: auto;
  backdrop-filter: blur(1px);
}

.home-tutorial-spotlight {
  position: absolute;
  border-radius: 999px;
  pointer-events: none;
  box-shadow:
    0 0 0 3px rgba(255, 255, 255, 0.95),
    0 0 0 8px rgba(125, 211, 168, 0.35),
    0 0 28px rgba(125, 211, 168, 0.75);
  animation: home-tutorial-pulse 1.45s ease-in-out infinite;
}

@keyframes home-tutorial-pulse {
  0%,
  100% {
    transform: scale(1);
    box-shadow:
      0 0 0 3px rgba(255, 255, 255, 0.95),
      0 0 0 8px rgba(125, 211, 168, 0.35),
      0 0 28px rgba(125, 211, 168, 0.75);
  }
  50% {
    transform: scale(1.06);
    box-shadow:
      0 0 0 4px rgba(255, 255, 255, 1),
      0 0 0 13px rgba(125, 211, 168, 0.28),
      0 0 36px rgba(125, 211, 168, 0.9);
  }
}

.home-tutorial-tooltip,
.home-tutorial-no-target {
  position: absolute;
  width: min(260px, calc(100vw - 24px));
  padding: 14px 16px 12px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 18px;
  background: color-mix(in srgb, var(--color-surface, #ffffff) 94%, transparent);
  box-shadow: 0 16px 42px rgba(0, 0, 0, 0.28);
  color: var(--color-text, #1f2937);
  pointer-events: auto;
  animation: home-tutorial-pop 0.22s ease;
}

.home-tutorial-no-target {
  left: 50%;
  bottom: 92px;
  transform: translateX(-50%);
  text-align: center;
}

@keyframes home-tutorial-pop {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.home-tutorial-arrow {
  position: absolute;
  left: 50%;
  width: 0;
  height: 0;
  transform: translateX(-50%);
}

.home-tutorial-arrow.arrow-up {
  top: -8px;
  border-right: 8px solid transparent;
  border-bottom: 8px solid var(--color-surface, #ffffff);
  border-left: 8px solid transparent;
}

.home-tutorial-arrow.arrow-down {
  bottom: -8px;
  border-top: 8px solid var(--color-surface, #ffffff);
  border-right: 8px solid transparent;
  border-left: 8px solid transparent;
}

.home-tutorial-title {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.02em;
  margin-bottom: 5px;
}

.home-tutorial-desc {
  font-size: 13px;
  line-height: 1.55;
  color: var(--color-text-secondary, #667085);
}

.home-tutorial-denied {
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(255, 105, 135, 0.14);
  color: #d9466b;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.35;
  animation: home-tutorial-denied-shake 0.36s ease;
}

@keyframes home-tutorial-denied-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-3px);
  }
  50% {
    transform: translateX(3px);
  }
  75% {
    transform: translateX(-2px);
  }
}

.home-tutorial-skip {
  display: block;
  margin: 9px 0 0 auto;
  padding: 4px 8px;
  border: 0;
  border-radius: 999px;
  background: rgba(125, 211, 168, 0.14);
  color: var(--color-primary, #3f8f67);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.home-tutorial-skip.large {
  margin-right: auto;
  padding: 7px 14px;
}

.home-tutorial-fade-enter-active,
.home-tutorial-fade-leave-active {
  transition: opacity 0.2s ease;
}

.home-tutorial-fade-enter-from,
.home-tutorial-fade-leave-to {
  opacity: 0;
}
</style>
