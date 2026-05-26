<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue";

const props = defineProps<{
  themeSettingsOpen?: boolean;
}>();

const STORAGE_KEY = "aguaphone-theme-tutorial-done";

// step 0: guide to open settings (via rail-toggle or gear directly)
// step 1: inside settings, highlight preview area
// step 2: done
const step = ref(0);
const visible = ref(false);

const spotlightRect = ref<DOMRect | null>(null);
const tooltipLabel = ref("");
const tooltipBelow = ref(true);
const tooltipLeft = ref(12);
const tooltipBottom = ref(0); // used when tooltipBelow is false

let rafId: number | null = null;
let isCompleting = false;

function isVisible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0;
}

function updateSpotlight() {
  if (!visible.value || isCompleting) return;

  if (step.value === 0) {
    // Try gear button first
    const gear = document.querySelector<HTMLElement>('.header-btn[title="外觀設定"]');
    if (gear && isVisible(gear)) {
      const r = gear.getBoundingClientRect();
      spotlightRect.value = r;
      tooltipLabel.value = "點這裡打開外觀設定";
      tooltipBelow.value = true;
      tooltipLeft.value = Math.min(window.innerWidth - 220, Math.max(12, r.left - 12));
      return;
    }
    // Fall back to rail toggle button
    const rail = document.querySelector<HTMLElement>(".rail-toggle-btn");
    if (rail && isVisible(rail)) {
      const r = rail.getBoundingClientRect();
      spotlightRect.value = r;
      tooltipLabel.value = "先點這裡展開工具列";
      tooltipBelow.value = true;
      tooltipLeft.value = Math.min(window.innerWidth - 220, Math.max(12, r.left - 12));
      return;
    }
    spotlightRect.value = null;
  }

  if (step.value === 1) {
    // Target the AI bubble specifically
    const aiBubble = document.querySelector<HTMLElement>(".preview-bubble.ai");
    if (aiBubble) {
      // Scroll it into view within its scrollable parent
      aiBubble.scrollIntoView({ behavior: "smooth", block: "center" });
      // Wait for scroll to settle before measuring
      setTimeout(() => {
        if (!aiBubble) return;
        const r = aiBubble.getBoundingClientRect();
        spotlightRect.value = r;
        tooltipLabel.value = "點 AI 氣泡，調整它的外觀";
        tooltipBelow.value = r.bottom + 80 < window.innerHeight;
        tooltipLeft.value = Math.min(window.innerWidth - 220, Math.max(12, r.left - 12));
        tooltipBottom.value = window.innerHeight - r.top + 14;
      }, 400);
    } else {
      spotlightRect.value = null;
    }
  }
}

function scheduleUpdate() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    updateSpotlight();
    rafId = null;
  });
}

function dismiss() {
  visible.value = false;
  step.value = 2;
  localStorage.setItem(STORAGE_KEY, "1");
}

function showCompletionAndDismiss() {
  isCompleting = true;
  tooltipLabel.value = "✅ 下面可以編輯了！";
  setTimeout(dismiss, 1500);
}

// Watch themeSettingsOpen to advance to step 1
watch(() => props.themeSettingsOpen, (val) => {
  if (val && step.value === 0 && visible.value) {
    step.value = 1;
    setTimeout(scheduleUpdate, 400);
  }
});

let mo: MutationObserver | null = null;

onMounted(() => {
  if (!localStorage.getItem(STORAGE_KEY)) {
    setTimeout(() => {
      visible.value = true;
      step.value = 0;
      scheduleUpdate();
    }, 1500);
  }

  document.addEventListener("click", onDocumentClick, true);
  window.addEventListener("resize", scheduleUpdate);

  mo = new MutationObserver(scheduleUpdate);
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
});

onUnmounted(() => {
  document.removeEventListener("click", onDocumentClick, true);
  window.removeEventListener("resize", scheduleUpdate);
  mo?.disconnect();
  if (rafId) cancelAnimationFrame(rafId);
});

function onDocumentClick(e: MouseEvent) {
  if (!visible.value) return;
  const target = e.target as HTMLElement;

  if (step.value === 0) {
    // Either gear or rail-toggle was clicked → re-check spotlight after DOM updates
    if (
      target.closest('.header-btn[title="外觀設定"]') ||
      target.closest(".rail-toggle-btn")
    ) {
      setTimeout(scheduleUpdate, 350);
    }
  }

  if (step.value === 1) {
    // Clicked a preview-clickable element → show completion message
    if (target.closest(".preview-clickable")) {
      showCompletionAndDismiss();
    }
    // Clicked "跳過教學"
    if (target.closest(".tip-dismiss-btn")) {
      dismiss();
    }
  }
}
</script>

<template>
  <Teleport to="body">
  <Transition name="tutorial-fade">
    <div v-if="visible && step <= 1" class="tutorial-overlay">
      <template v-if="spotlightRect">
        <!-- Four mask pieces surrounding the spotlight hole -->
        <div class="tutorial-mask-piece"
          :style="{ top: '0', left: '0', right: '0', height: Math.max(0, spotlightRect.top - 8) + 'px' }" />
        <div class="tutorial-mask-piece"
          :style="{ top: (spotlightRect.bottom + 8) + 'px', left: '0', right: '0', bottom: '0' }" />
        <div class="tutorial-mask-piece"
          :style="{ top: (spotlightRect.top - 8) + 'px', left: '0', width: Math.max(0, spotlightRect.left - 8) + 'px', height: (spotlightRect.height + 16) + 'px' }" />
        <div class="tutorial-mask-piece"
          :style="{ top: (spotlightRect.top - 8) + 'px', left: (spotlightRect.right + 8) + 'px', right: '0', height: (spotlightRect.height + 16) + 'px' }" />

        <!-- Pulsing ring around target -->
        <div class="tutorial-spotlight" :style="{
          top: (spotlightRect.top - 8) + 'px',
          left: (spotlightRect.left - 8) + 'px',
          width: (spotlightRect.width + 16) + 'px',
          height: (spotlightRect.height + 16) + 'px',
        }" />

        <!-- Tooltip: below or above the spotlight -->
        <div class="tutorial-tooltip" :style="tooltipBelow
          ? { top: (spotlightRect.bottom + 14) + 'px', left: tooltipLeft + 'px' }
          : { bottom: tooltipBottom + 'px', left: tooltipLeft + 'px' }
        ">
          <div class="tooltip-arrow" :class="tooltipBelow ? 'arrow-up' : 'arrow-down'" />
          <div class="tooltip-label">{{ tooltipLabel }}</div>
          <button class="tutorial-skip-btn" @click="dismiss">跳過教學</button>
        </div>
      </template>

      <!-- No spotlight found yet: show minimal centered skip -->
      <div v-else class="tutorial-no-target">
        <button class="tutorial-skip-btn large" @click="dismiss">跳過教學</button>
      </div>
    </div>
  </Transition>
  </Teleport>
</template>

<style scoped>
.tutorial-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  pointer-events: none;
}

.tutorial-mask-piece {
  position: absolute;
  background: rgba(0, 0, 0, 0.52);
  pointer-events: auto;
}

.tutorial-spotlight {
  position: absolute;
  border-radius: 14px;
  box-shadow: 0 0 0 3px rgba(108, 142, 191, 0.85), 0 0 0 6px rgba(108, 142, 191, 0.25);
  background: transparent;
  pointer-events: none;
  animation: spotlight-pulse 1.6s ease-in-out infinite;
}

@keyframes spotlight-pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(108, 142, 191, 0.85), 0 0 0 6px rgba(108, 142, 191, 0.25); }
  50%       { box-shadow: 0 0 0 4px rgba(108, 142, 191, 1),    0 0 0 10px rgba(108, 142, 191, 0.35); }
}

.tutorial-tooltip {
  position: absolute;
  z-index: 1;
  pointer-events: auto;
  background: var(--color-surface, #fff);
  border-radius: 12px;
  padding: 10px 14px 8px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.22);
  min-width: 160px;
  max-width: 210px;
  animation: tooltip-pop 0.25s ease;
}

@keyframes tooltip-pop {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}

.tooltip-arrow {
  position: absolute;
  left: 18px;
  width: 0;
  height: 0;
}
.arrow-up {
  top: -7px;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-bottom: 7px solid var(--color-surface, #fff);
}
.arrow-down {
  bottom: -7px;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-top: 7px solid var(--color-surface, #fff);
}

.tooltip-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #333);
  margin-bottom: 4px;
}

.tutorial-skip-btn {
  display: block;
  margin-left: auto;
  background: none;
  border: none;
  color: var(--color-text-secondary, #999);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
}
.tutorial-skip-btn.large {
  font-size: 14px;
  padding: 8px 18px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  color: #333;
}

.tutorial-no-target {
  position: absolute;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: auto;
}

.tutorial-fade-enter-active,
.tutorial-fade-leave-active { transition: opacity 0.25s ease; }
.tutorial-fade-enter-from,
.tutorial-fade-leave-to    { opacity: 0; }
</style>
