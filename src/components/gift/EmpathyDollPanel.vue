<script setup lang="ts">
/**
 * 共感娃娃面板
 * 互動：選動作 → 點／按住部位（或整隻抱住）→ 累積碰觸 → 「戳完了」送出
 * 換裝：DollWardrobe，改了立刻反映在娃娃上
 */
import { computed, onBeforeUnmount, ref } from "vue";
import CottonDoll from "@/components/gift/CottonDoll.vue";
import DollWardrobe from "@/components/gift/DollWardrobe.vue";
import type { DollLook } from "@/data/dollWardrobe";
import {
  DOLL_ACTIONS,
  DOLL_HOLD_MIN_MS,
  DOLL_HUG_ACTION,
  DOLL_WHOLE_ZONE,
  addDollTouch,
  describeDollTouches,
  zonesFor,
  type DollTouch,
} from "@/services/empathyDoll";

const props = defineProps<{
  characterName: string;
  characterAvatar?: string;
  touches: DollTouch[];
  intimate: boolean;
  look: DollLook;
  sending?: boolean;
}>();

const emit = defineEmits<{
  "update:touches": [DollTouch[]];
  "update:intimate": [boolean];
  "update:look": [DollLook];
  send: [];
  close: [];
}>();

const tab = ref<"play" | "dress">("play");
const actionId = ref("stroke");
const menuOpen = ref(false);

const zones = computed(() => zonesFor(props.intimate));
const summary = computed(() => describeDollTouches(props.touches));

/** 碰越多、按越久，臉越紅 */
const flush = computed(() => {
  const score = props.touches.reduce((sum, t) => sum + t.count + t.holdMs / 2000, 0);
  return Math.min(1, score / 10);
});

// ===== 碰觸 =====
const activeZone = ref<string | null>(null);
const hugging = ref(false);
const holdMs = ref(0);
const reaction = ref<string | null>(null);
const tilt = ref({ x: 0, y: 0 });
let holdStartedAt = 0;
let holdTimer: number | undefined;
let reactionTimer: number | undefined;

interface Particle {
  id: number;
  text: string;
  x: number;
  y: number;
}
const particles = ref<Particle[]>([]);
let particleSeq = 0;

function startHold(zoneId: string, event: PointerEvent) {
  if (props.sending) return;
  event.preventDefault();
  // 鎖住指標：娃娃傾斜時部位會移開，不鎖的話會觸發 pointerleave 提早結束
  (event.currentTarget as Element | null)?.setPointerCapture?.(event.pointerId);
  const action = zoneId === DOLL_WHOLE_ZONE ? DOLL_HUG_ACTION : actionId.value;
  if (zoneId === DOLL_WHOLE_ZONE) hugging.value = true;
  else activeZone.value = zoneId;
  clearTimeout(reactionTimer);
  reaction.value = action;
  holdStartedAt = performance.now();
  holdMs.value = 0;
  holdTimer = window.setInterval(() => (holdMs.value = performance.now() - holdStartedAt), 80);
  // 往碰的那一側微微傾斜
  const stage = (event.currentTarget as HTMLElement).closest(".doll-stage") as HTMLElement | null;
  const rect = stage?.getBoundingClientRect();
  if (rect && zoneId !== DOLL_WHOLE_ZONE) {
    tilt.value = {
      x: ((event.clientX - rect.left) / rect.width - 0.5) * 14,
      y: ((event.clientY - rect.top) / rect.height - 0.5) * -10,
    };
  }
}

function endHold(event: PointerEvent) {
  const zoneId = hugging.value ? DOLL_WHOLE_ZONE : activeZone.value;
  if (!zoneId) return;
  const duration = performance.now() - holdStartedAt;
  const action = zoneId === DOLL_WHOLE_ZONE ? DOLL_HUG_ACTION : actionId.value;
  window.clearInterval(holdTimer);
  activeZone.value = null;
  hugging.value = false;
  holdMs.value = 0;
  tilt.value = { x: 0, y: 0 };
  emit("update:touches", addDollTouch(props.touches, { action, zone: zoneId, holdMs: duration }));
  // 表情多停一下再回去
  reactionTimer = window.setTimeout(() => (reaction.value = null), 700);
  spawnParticle(event, action);
}

function spawnParticle(event: PointerEvent, action: string) {
  const stage = document.querySelector(".doll-stage") as HTMLElement | null;
  const rect = stage?.getBoundingClientRect();
  if (!rect) return;
  const label = action === DOLL_HUG_ACTION ? "♡" : DOLL_ACTIONS.find((a) => a.id === action)?.label ?? "♡";
  const isHug = action === DOLL_HUG_ACTION;
  const id = ++particleSeq;
  particles.value.push({
    id,
    text: label,
    x: isHug ? rect.width / 2 : event.clientX - rect.left,
    y: isHug ? rect.height * 0.3 : event.clientY - rect.top,
  });
  window.setTimeout(() => (particles.value = particles.value.filter((p) => p.id !== id)), 900);
}

const holdingLong = computed(() => holdMs.value >= DOLL_HOLD_MIN_MS);

const stageStyle = computed(() => {
  if (hugging.value) return { transform: "scale(1.04, 0.95)" };
  const { x, y } = tilt.value;
  return { transform: `perspective(700px) rotateY(${x}deg) rotateX(${y}deg)` };
});

function zoneStyle(shape: { x: number; y: number; w: number; h: number }) {
  return {
    left: `${(shape.x / 240) * 100}%`,
    top: `${(shape.y / 340) * 100}%`,
    width: `${(shape.w / 240) * 100}%`,
    height: `${(shape.h / 340) * 100}%`,
  };
}

onBeforeUnmount(() => {
  window.clearInterval(holdTimer);
  clearTimeout(reactionTimer);
});
</script>

<template>
  <Teleport to="body">
    <div class="doll-panel">
      <header class="doll-header">
        <button type="button" class="header-btn" @click="emit('close')">先這樣</button>
        <h2 class="doll-title">{{ characterName }}的共感娃娃</h2>
        <div class="header-menu">
          <button type="button" class="header-btn icon" aria-label="設定" @click="menuOpen = !menuOpen">⚙</button>
          <div v-if="menuOpen" class="menu-pop">
            <label class="menu-row">
              <span>親密互動</span>
              <input
                type="checkbox"
                :checked="intimate"
                @change="emit('update:intimate', ($event.target as HTMLInputElement).checked)"
              />
            </label>
          </div>
        </div>
      </header>

      <div class="doll-tabs">
        <button type="button" :class="{ active: tab === 'play' }" @click="tab = 'play'">互動</button>
        <button type="button" :class="{ active: tab === 'dress' }" @click="tab = 'dress'">換裝</button>
      </div>

      <main class="doll-main" :class="`tab-${tab}`">
        <div v-if="tab === 'play'" class="action-row">
          <button
            v-for="a in DOLL_ACTIONS"
            :key="a.id"
            type="button"
            class="action-chip"
            :class="{ active: actionId === a.id }"
            @click="actionId = a.id"
          >
            {{ a.label }}
          </button>
        </div>

        <div class="doll-stage-wrap">
          <div class="doll-stage" :class="{ holding: !!activeZone }" :style="stageStyle">
            <CottonDoll :look="look" :reaction="reaction" :flush="flush" />
            <template v-if="tab === 'play'">
              <template v-for="zone in zones" :key="zone.id">
                <div
                  v-for="(shape, i) in zone.shapes"
                  :key="`${zone.id}-${i}`"
                  class="doll-zone"
                  :class="{ active: activeZone === zone.id }"
                  :style="zoneStyle(shape)"
                  :aria-label="zone.label"
                  @pointerdown="startHold(zone.id, $event)"
                  @pointerup="endHold($event)"
                  @pointercancel="endHold($event)"
                />
              </template>
            </template>
            <span
              v-for="p in particles"
              :key="p.id"
              class="doll-particle"
              :style="{ left: `${p.x}px`, top: `${p.y}px` }"
            >{{ p.text }}</span>
          </div>
          <span v-if="tab === 'play' && holdingLong" class="hold-hint">按住中…</span>
        </div>

        <button
          v-if="tab === 'play'"
          type="button"
          class="hug-btn"
          :class="{ active: hugging }"
          @pointerdown="startHold(DOLL_WHOLE_ZONE, $event)"
          @pointerup="endHold($event)"
          @pointercancel="endHold($event)"
        >
          {{ hugging ? "抱緊緊…" : "按住抱住" }}
        </button>

        <DollWardrobe v-if="tab === 'dress'" :look="look" @update:look="emit('update:look', $event)" />
      </main>

      <footer v-if="tab === 'play'" class="doll-footer">
        <p v-if="touches.length" class="summary">這次：{{ summary }}</p>
        <p v-else class="summary muted">選一個動作，點或按住娃娃</p>
        <div class="footer-actions">
          <button v-if="touches.length" type="button" class="clear-btn" @click="emit('update:touches', [])">清除</button>
          <button type="button" class="send-btn" :disabled="!touches.length || sending" @click="emit('send')">
            {{ sending ? "送出中…" : "戳完了" }}
          </button>
        </div>
        <p class="footer-note">按「先這樣」的話，累積的會在你下次傳訊息時一起送出。</p>
      </footer>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.doll-panel {
  position: fixed;
  inset: 0;
  z-index: 1250;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(circle at 50% 38%, rgba(255, 255, 255, 0.75), transparent 60%),
    var(--color-background, #f8f2ea);
  padding-top: var(--safe-area-inset-top, env(safe-area-inset-top));
  padding-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom));
  box-sizing: border-box;
  user-select: none;
  -webkit-user-select: none;
}

.doll-header {
  display: grid;
  grid-template-columns: 72px 1fr 72px;
  align-items: center;
  padding: 10px 12px;
}

.doll-title {
  margin: 0;
  text-align: center;
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text, #3a2f2a);
}

.header-btn {
  justify-self: start;
  padding: 6px 8px;
  border: none;
  background: none;
  color: var(--color-text-secondary, #8a7a70);
  font-size: 14px;
  cursor: pointer;

  &.icon {
    justify-self: end;
    font-size: 18px;
  }
}

.header-menu {
  position: relative;
  justify-self: end;
}

.menu-pop {
  position: absolute;
  right: 0;
  top: 100%;
  z-index: 2;
  min-width: 150px;
  padding: 10px 14px;
  border-radius: 14px;
  background: var(--color-surface, #fff);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
}

.menu-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
  color: var(--color-text, #333);

  input {
    width: 18px;
    height: 18px;
    accent-color: var(--color-primary, #c98b6b);
  }
}

.doll-tabs {
  display: flex;
  gap: 4px;
  margin: 0 auto 6px;
  padding: 3px;
  border-radius: 999px;
  background: var(--color-surface-hover, rgba(0, 0, 0, 0.05));

  button {
    padding: 6px 22px;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--color-text-secondary, #8a7a70);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;

    &.active {
      background: var(--color-surface, #fff);
      color: var(--color-text, #3a2f2a);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
    }
  }
}

.doll-main {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.action-row {
  display: flex;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  padding: 4px 16px 8px;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.action-chip {
  flex: 0 0 auto;
  min-width: 52px;
  padding: 8px 14px;
  border: 1px solid var(--color-border, #e6ddd3);
  border-radius: 999px;
  background: var(--color-surface, #fff);
  color: var(--color-text, #3a2f2a);
  font-size: 14px;
  cursor: pointer;

  &.active {
    border-color: var(--color-primary, #c98b6b);
    background: var(--color-primary, #c98b6b);
    color: var(--color-on-primary-contrast, #fff);
  }
}

.doll-stage-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 0 4px;
}

.doll-stage {
  position: relative;
  width: min(240px, 62vw);
  aspect-ratio: 240 / 340;
  transition: transform 0.18s ease;
  touch-action: none;

  &.holding {
    animation: doll-wobble 0.5s ease-in-out infinite;
  }
}

.tab-dress .doll-stage {
  width: min(150px, 40vw);
}

.doll-zone {
  position: absolute;
  border-radius: 50%;
  cursor: pointer;
  touch-action: none;

  &.active {
    background: radial-gradient(circle, rgba(255, 140, 160, 0.38), transparent 70%);
  }
}

.doll-particle {
  position: absolute;
  pointer-events: none;
  font-size: 16px;
  font-weight: 700;
  color: #e8708a;
  transform: translate(-50%, -50%);
  animation: doll-float 0.9s ease-out forwards;
  white-space: nowrap;
}

.hold-hint {
  margin-top: 2px;
  font-size: 12px;
  color: var(--color-text-secondary, #8a7a70);
}

.hug-btn {
  width: min(320px, calc(100% - 32px));
  margin: 6px 0 12px;
  padding: 12px;
  border: 1px solid var(--color-border, #e6ddd3);
  border-radius: 16px;
  background: var(--color-surface, #fff);
  color: var(--color-text, #3a2f2a);
  font-size: 15px;
  font-weight: 600;
  touch-action: none;
  cursor: pointer;

  &.active {
    background: #ffe3e8;
    border-color: #f3a6b5;
  }
}

.doll-footer {
  padding: 12px 16px 10px;
  border-radius: 20px 20px 0 0;
  background: var(--color-surface, #fff);
  box-shadow: 0 -4px 18px rgba(0, 0, 0, 0.06);
}

.summary {
  margin: 0 0 10px;
  max-height: 4.5em;
  overflow-y: auto;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text, #3a2f2a);

  &.muted {
    color: var(--color-text-secondary, #8a7a70);
  }
}

.footer-actions {
  display: flex;
  gap: 10px;
}

.clear-btn,
.send-btn {
  padding: 12px 16px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

.clear-btn {
  border: 1px solid var(--color-border, #e6ddd3);
  background: transparent;
  color: var(--color-text-secondary, #8a7a70);
}

.send-btn {
  flex: 1;
  border: none;
  background: var(--color-primary, #c98b6b);
  color: var(--color-on-primary-contrast, #fff);

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
}

.footer-note {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--color-text-secondary, #8a7a70);
}

body.is-night-mode .doll-panel {
  background:
    radial-gradient(circle at 50% 38%, rgba(255, 255, 255, 0.06), transparent 60%),
    var(--color-background, #1c1a24);
}

body.is-night-mode .hug-btn.active {
  background: rgba(243, 166, 181, 0.2);
}

@keyframes doll-wobble {
  0%,
  100% {
    translate: 0 0;
  }
  50% {
    translate: 0 -2px;
  }
}

@keyframes doll-float {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.8);
  }
  25% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -160%) scale(1.1);
  }
}
</style>
