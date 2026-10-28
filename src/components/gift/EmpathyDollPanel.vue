<script setup lang="ts">
/**
 * 共感娃娃互動面板
 *
 * 選動作 → 點／按住娃娃部位 → 累積碰觸 → 「戳完了」送出
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { CSSProperties } from "vue";
import {
  DOLL_ACTIONS,
  DOLL_HOLD_MIN_MS,
  DOLL_HUG_ACTION,
  DOLL_WHOLE_ZONE,
  addDollTouch,
  describeDollTouches,
  zonesFor,
  type DollSide,
  type DollTouch,
} from "@/services/empathyDoll";

const props = defineProps<{
  characterName: string;
  characterAvatar?: string;
  touches: DollTouch[];
  intimate: boolean;
  sending?: boolean;
}>();

const emit = defineEmits<{
  "update:touches": [DollTouch[]];
  "update:intimate": [boolean];
  send: [];
  close: [];
}>();

// ===== 基本狀態 =====
const actionId = ref<string>("stroke");
const side = ref<DollSide>("front");
const menuOpen = ref(false);

const currentActionLabel = computed<string>(
  () => DOLL_ACTIONS.find((a) => a.id === actionId.value)?.label ?? "摸",
);

const visibleZones = computed(() => zonesFor(props.intimate, side.value));

const summary = computed<string>(() => describeDollTouches(props.touches));

const initial = computed<string>(() => (props.characterName || "?").slice(0, 1));

function onIntimateChange(event: Event): void {
  const checked = (event.target as HTMLInputElement | null)?.checked ?? false;
  emit("update:intimate", checked);
}

// ===== 部位熱區幾何（舞台座標 240 x 380）=====
interface ZoneShape {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: string;
}

const ZONE_SHAPES: Record<string, ZoneShape[]> = {
  head: [{ x: 76, y: 16, w: 88, h: 46, radius: "50%" }],
  ear: [
    { x: 32, y: 84, w: 36, h: 36, radius: "50%" },
    { x: 172, y: 84, w: 36, h: 36, radius: "50%" },
  ],
  cheek: [
    { x: 60, y: 96, w: 40, h: 40, radius: "50%" },
    { x: 140, y: 96, w: 40, h: 40, radius: "50%" },
  ],
  lips: [{ x: 100, y: 132, w: 40, h: 26, radius: "50%" }],
  neck: [{ x: 102, y: 152, w: 36, h: 20, radius: "10px" }],
  hand: [
    { x: 22, y: 202, w: 36, h: 60, radius: "50%" },
    { x: 182, y: 202, w: 36, h: 60, radius: "50%" },
  ],
  chest: [{ x: 84, y: 176, w: 72, h: 46, radius: "50%" }],
  belly: [{ x: 82, y: 218, w: 76, h: 44, radius: "50%" }],
  waist: [
    { x: 60, y: 226, w: 24, h: 40, radius: "12px" },
    { x: 156, y: 226, w: 24, h: 40, radius: "12px" },
  ],
  thigh: [
    { x: 84, y: 296, w: 32, h: 52, radius: "16px" },
    { x: 124, y: 296, w: 32, h: 52, radius: "16px" },
  ],
  groin: [{ x: 102, y: 258, w: 36, h: 26, radius: "12px" }],
  back: [{ x: 74, y: 168, w: 92, h: 108, radius: "26px" }],
  butt: [{ x: 82, y: 250, w: 76, h: 52, radius: "26px" }],
};

function shapesOf(zoneId: string): ZoneShape[] {
  return ZONE_SHAPES[zoneId] ?? [];
}

function shapeStyle(shape: ZoneShape): CSSProperties {
  return {
    left: `${shape.x}px`,
    top: `${shape.y}px`,
    width: `${shape.w}px`,
    height: `${shape.h}px`,
    borderRadius: shape.radius,
  };
}

// ===== 按住計時 =====
const stageRef = ref<HTMLElement | null>(null);
const activeZone = ref<string | null>(null);
const holdMs = ref(0);
const holding = ref(false);
const hugHolding = ref(false);

let holdStartedAt = 0;
let holdTimer: number | undefined;
let hugStartedAt = 0;
let lastPoint = { x: 120, y: 180 };

interface Particle {
  id: number;
  text: string;
  x: number;
  y: number;
}

const particles = ref<Particle[]>([]);
let particleSeq = 0;

function stagePoint(event: PointerEvent): { x: number; y: number } {
  const rect = stageRef.value?.getBoundingClientRect();
  if (!rect) return { x: 120, y: 180 };
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function startTimer(): void {
  stopTimer();
  holdTimer = window.setInterval(() => {
    holdMs.value = performance.now() - holdStartedAt;
  }, 80);
}

function stopTimer(): void {
  if (holdTimer !== undefined) {
    window.clearInterval(holdTimer);
    holdTimer = undefined;
  }
}

function spawnParticle(x: number, y: number, text: string): void {
  const id = ++particleSeq;
  particles.value = [...particles.value, { id, text, x, y }];
  window.setTimeout(() => {
    particles.value = particles.value.filter((p) => p.id !== id);
  }, 800);
}

function commitTouch(
  action: string,
  zone: string,
  durationMs: number,
  point: { x: number; y: number },
  text: string,
): void {
  emit(
    "update:touches",
    addDollTouch(props.touches, { action, zone, holdMs: durationMs }),
  );
  spawnParticle(point.x, point.y, text);
}

function startZoneHold(zoneId: string, event: PointerEvent): void {
  if (props.sending) return;
  event.preventDefault();
  // 鎖住指標：娃娃抖動時部位會移開，不鎖的話會觸發 pointerleave 提早結束
  (event.currentTarget as Element | null)?.setPointerCapture?.(event.pointerId);
  activeZone.value = zoneId;
  lastPoint = stagePoint(event);
  holdStartedAt = performance.now();
  holdMs.value = 0;
  holding.value = true;
  startTimer();
}

function endZoneHold(event?: PointerEvent): void {
  const zoneId = activeZone.value;
  if (!zoneId) return;
  if (event) lastPoint = stagePoint(event);
  const duration = Math.max(0, performance.now() - holdStartedAt);
  activeZone.value = null;
  holding.value = false;
  holdMs.value = 0;
  stopTimer();
  commitTouch(actionId.value, zoneId, duration, lastPoint, currentActionLabel.value);
}

function startHug(event: PointerEvent): void {
  if (props.sending) return;
  (event.currentTarget as Element | null)?.setPointerCapture?.(event.pointerId);
  hugHolding.value = true;
  hugStartedAt = performance.now();
}

function endHug(): void {
  if (!hugHolding.value) return;
  hugHolding.value = false;
  const duration = Math.max(0, performance.now() - hugStartedAt);
  commitTouch(DOLL_HUG_ACTION, DOLL_WHOLE_ZONE, duration, { x: 120, y: 150 }, "抱住");
}

const showHoldHint = computed<boolean>(() => holding.value && holdMs.value >= DOLL_HOLD_MIN_MS);

function onWindowPointerUp(): void {
  if (activeZone.value) endZoneHold();
  if (hugHolding.value) endHug();
}

onMounted(() => {
  window.addEventListener("pointerup", onWindowPointerUp);
  window.addEventListener("pointercancel", onWindowPointerUp);
});

onBeforeUnmount(() => {
  window.removeEventListener("pointerup", onWindowPointerUp);
  window.removeEventListener("pointercancel", onWindowPointerUp);
  stopTimer();
});
</script>

<template>
  <Teleport to="body">
    <div class="doll-panel">
      <header class="doll-panel__top">
        <button type="button" class="doll-panel__text-btn" @click="emit('close')">先這樣</button>
        <h2 class="doll-panel__title">{{ characterName }}的共感娃娃</h2>
        <div class="doll-panel__menu-wrap">
          <button
            type="button"
            class="doll-panel__gear"
            :class="{ 'is-open': menuOpen }"
            aria-label="設定"
            @click="menuOpen = !menuOpen"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" stroke-linecap="round" />
            </svg>
          </button>
          <div v-if="menuOpen" class="doll-panel__menu">
            <label class="doll-switch">
              <span class="doll-switch__label">親密互動</span>
              <input
                class="doll-switch__input"
                type="checkbox"
                :checked="intimate"
                @change="onIntimateChange"
              />
              <span class="doll-switch__track"><span class="doll-switch__thumb"></span></span>
            </label>
          </div>
        </div>
      </header>

      <div class="doll-panel__scroll">
        <div class="doll-panel__actions">
          <button
            v-for="action in DOLL_ACTIONS"
            :key="action.id"
            type="button"
            class="doll-action"
            :class="{ 'is-active': action.id === actionId }"
            @click="actionId = action.id"
          >
            {{ action.label }}
          </button>
        </div>

        <div class="doll-stage-wrap">
          <div
            ref="stageRef"
            class="doll-stage"
            :class="{ 'is-holding': holding, 'is-hugging': hugHolding }"
          >
            <svg class="doll-stage__svg" viewBox="0 0 240 380" fill="none" aria-hidden="true">
              <ellipse class="doll-body" cx="188" cy="226" rx="17" ry="36" transform="rotate(14 188 226)" />
              <ellipse class="doll-body" cx="52" cy="226" rx="17" ry="36" transform="rotate(-14 52 226)" />
              <rect class="doll-body" x="92" y="258" width="24" height="96" rx="12" />
              <rect class="doll-body" x="124" y="258" width="24" height="96" rx="12" />
              <ellipse class="doll-body" cx="120" cy="208" rx="58" ry="74" />
              <circle class="doll-body" cx="52" cy="104" r="13" />
              <circle class="doll-body" cx="188" cy="104" r="13" />

              <template v-if="side === 'front'">
                <circle class="doll-body" cx="120" cy="96" r="68" />
                <path class="doll-stitch" d="M120 30v16M108 30v16M132 30v16" />
                <path class="doll-stitch" d="M120 158v98" />
                <path class="doll-stitch" d="M96 276h48" />
              </template>
              <template v-else>
                <circle class="doll-body" cx="120" cy="96" r="68" />
                <circle class="doll-hair" cx="120" cy="96" r="68" />
                <path class="doll-stitch" d="M120 34v124" />
                <path class="doll-stitch" d="M96 276h48" />
              </template>
            </svg>

            <div v-if="side === 'front'" class="doll-stage__face">
              <img v-if="characterAvatar" class="doll-stage__face-img" :src="characterAvatar" alt="" />
              <span v-else class="doll-stage__face-letter">{{ initial }}</span>
            </div>

            <template v-for="zone in visibleZones" :key="zone.id">
              <div
                v-for="(shape, index) in shapesOf(zone.id)"
                :key="`${zone.id}-${index}`"
                class="doll-zone"
                :class="{ 'is-active': activeZone === zone.id }"
                :style="shapeStyle(shape)"
                :aria-label="zone.label"
                @pointerdown="startZoneHold(zone.id, $event)"
                @pointerup="endZoneHold($event)"
                @pointercancel="endZoneHold($event)"
              />
            </template>

            <span
              v-for="particle in particles"
              :key="particle.id"
              class="doll-particle"
              :style="{ left: `${particle.x}px`, top: `${particle.y}px` }"
            >
              {{ particle.text }}
            </span>

            <span v-if="showHoldHint" class="doll-hold-hint">按住中…</span>
          </div>

          <button type="button" class="doll-flip" @click="side = side === 'front' ? 'back' : 'front'">
            翻過來
          </button>

          <button
            type="button"
            class="doll-hug"
            :class="{ 'is-holding': hugHolding }"
            @pointerdown.prevent="startHug($event)"
            @pointerup="endHug"
            @pointercancel="endHug"
          >
            抱住
          </button>
        </div>
      </div>

      <footer class="doll-panel__footer">
        <div class="doll-summary">
          <p v-if="touches.length" class="doll-summary__text">這次：{{ summary }}</p>
          <p v-else class="doll-summary__empty">選一個動作，點或按住娃娃</p>
        </div>
        <div class="doll-panel__buttons">
          <button
            v-if="touches.length"
            type="button"
            class="doll-btn doll-btn--ghost"
            @click="emit('update:touches', [])"
          >
            清除
          </button>
          <button
            type="button"
            class="doll-btn doll-btn--primary"
            :disabled="!touches.length || sending"
            @click="emit('send')"
          >
            {{ sending ? "送出中…" : "戳完了" }}
          </button>
        </div>
        <p class="doll-note">「先這樣」的話，累積的會在你下次傳訊息時一起送出。</p>
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
  background: var(--color-background, #f8f5f0);
  color: var(--color-text, #2f2a24);
  box-sizing: border-box;
  padding-top: var(--safe-area-inset-top, env(safe-area-inset-top));
  padding-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom));

  &__top {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--color-border, #e6ded2);
    background: var(--color-surface, #fff);
  }

  &__text-btn {
    flex: 0 0 auto;
    border: none;
    background: transparent;
    color: var(--color-text-secondary, #8a7f70);
    font-size: 14px;
    padding: 6px 4px;
    cursor: pointer;
  }

  &__title {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__menu-wrap {
    position: relative;
    flex: 0 0 auto;
  }

  &__gear {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--color-text-secondary, #8a7f70);
    cursor: pointer;

    &.is-open,
    &:hover {
      background: var(--color-surface-hover, #f1ece3);
    }
  }

  &__menu {
    position: absolute;
    right: 0;
    top: 42px;
    z-index: 2;
    min-width: 172px;
    padding: 10px 12px;
    border: 1px solid var(--color-border, #e6ded2);
    border-radius: 14px;
    background: var(--color-surface, #fff);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  }

  &__scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 14px 8px;
    box-sizing: border-box;
  }

  &__actions {
    flex: 0 0 auto;
    display: flex;
    gap: 8px;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 2px 0 6px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  &__footer {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px 10px;
    box-sizing: border-box;
    border-top: 1px solid var(--color-border, #e6ded2);
    border-radius: 18px 18px 0 0;
    background: var(--color-surface, #fff);
    box-shadow: 0 -6px 20px rgba(0, 0, 0, 0.06);
  }

  &__buttons {
    display: flex;
    gap: 10px;
    align-items: center;
    box-sizing: border-box;

    .doll-btn--ghost {
      flex: 0 0 auto;
    }

    .doll-btn--primary {
      flex: 1 1 auto;
    }
  }
}

.doll-action {
  flex: 0 0 auto;
  padding: 7px 16px;
  border: 1px solid var(--color-border, #e6ded2);
  border-radius: 999px;
  background: var(--color-surface, #fff);
  color: var(--color-text, #2f2a24);
  font-size: 14px;
  line-height: 1.3;
  white-space: nowrap;
  cursor: pointer;
  box-sizing: border-box;

  &.is-active {
    background: var(--color-primary, #d98c6a);
    border-color: var(--color-primary, #d98c6a);
    color: var(--color-on-primary-contrast, #fff);
    font-weight: 600;
  }
}

.doll-stage-wrap {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding-bottom: 8px;
  box-sizing: border-box;
}

.doll-stage {
  position: relative;
  width: 240px;
  max-width: 100%;
  height: 380px;
  flex: 0 0 auto;
  box-sizing: border-box;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  transition: transform 0.16s ease;

  --doll-fill: #f3e3cf;
  --doll-stroke: #c9a988;

  &.is-holding {
    animation: doll-shake 0.4s ease-in-out infinite;
  }

  &.is-hugging {
    transform: scale(0.95);
  }

  &__svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  &__face {
    position: absolute;
    left: 76px;
    top: 52px;
    width: 88px;
    height: 88px;
    border-radius: 50%;
    overflow: hidden;
    background: #e7d3bc;
    box-shadow: inset 0 0 0 2px rgba(201, 169, 136, 0.7);
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__face-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  &__face-letter {
    font-size: 30px;
    font-weight: 700;
    color: #8a6f55;
  }
}

.doll-body {
  fill: var(--doll-fill);
  stroke: var(--doll-stroke);
  stroke-width: 2.5;
}

.doll-hair {
  fill: #6b5a4a;
  stroke: var(--doll-stroke);
  stroke-width: 2.5;
}

.doll-stitch {
  stroke: var(--doll-stroke);
  stroke-width: 1.6;
  stroke-dasharray: 4 5;
  stroke-linecap: round;
  fill: none;
  opacity: 0.75;
}

.doll-zone {
  position: absolute;
  box-sizing: border-box;
  border-radius: 50%;
  background: transparent;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  cursor: pointer;
  transition: background-color 0.14s ease, box-shadow 0.14s ease;

  &.is-active {
    background: var(--color-primary, #d98c6a);
    opacity: 0.32;
    box-shadow: 0 0 0 6px var(--color-primary, #d98c6a);
  }
}

.doll-particle {
  position: absolute;
  transform: translate(-50%, -50%);
  font-size: 16px;
  font-weight: 700;
  color: var(--color-primary, #d98c6a);
  pointer-events: none;
  animation: doll-float 0.8s ease-out forwards;
  white-space: nowrap;
}

.doll-hold-hint {
  position: absolute;
  left: 50%;
  bottom: 6px;
  transform: translateX(-50%);
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e6ded2);
  color: var(--color-text-secondary, #8a7f70);
  font-size: 12px;
  pointer-events: none;
  white-space: nowrap;
}

.doll-flip {
  flex: 0 0 auto;
  padding: 6px 18px;
  border: 1px solid var(--color-border, #e6ded2);
  border-radius: 999px;
  background: var(--color-surface, #fff);
  color: var(--color-text-secondary, #8a7f70);
  font-size: 13px;
  cursor: pointer;
  box-sizing: border-box;
}

.doll-hug {
  flex: 0 0 auto;
  width: 100%;
  max-width: 320px;
  padding: 12px 16px;
  border: 1px solid var(--color-border, #e6ded2);
  border-radius: 16px;
  background: var(--color-surface-hover, #f1ece3);
  color: var(--color-text, #2f2a24);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  box-sizing: border-box;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  transition: transform 0.14s ease, background-color 0.14s ease;

  &.is-holding {
    transform: scale(0.96);
    background: var(--color-primary, #d98c6a);
    border-color: var(--color-primary, #d98c6a);
    color: var(--color-on-primary-contrast, #fff);
  }
}

.doll-summary {
  box-sizing: border-box;
  max-height: 3.9em;
  overflow-y: auto;
  line-height: 1.3;

  &__text {
    margin: 0;
    font-size: 13px;
    color: var(--color-text, #2f2a24);
    word-break: break-word;
  }

  &__empty {
    margin: 0;
    font-size: 13px;
    color: var(--color-text-secondary, #8a7f70);
  }
}

.doll-btn {
  padding: 12px 16px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  box-sizing: border-box;
  border: 1px solid var(--color-border, #e6ded2);
  background: var(--color-surface, #fff);
  color: var(--color-text, #2f2a24);

  &--ghost {
    color: var(--color-text-secondary, #8a7f70);
  }

  &--primary {
    border-color: var(--color-primary, #d98c6a);
    background: var(--color-primary, #d98c6a);
    color: var(--color-on-primary-contrast, #fff);

    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }
}

.doll-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-text-secondary, #8a7f70);
}

// ===== 開關 =====
.doll-switch {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;

  &__label {
    font-size: 13px;
    color: var(--color-text, #2f2a24);
  }

  &__input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
    pointer-events: none;
  }

  &__track {
    position: relative;
    display: block;
    flex: 0 0 auto;
    width: 40px;
    height: 24px;
    border-radius: 999px;
    background: var(--color-border, #e6ded2);
    transition: background-color 0.18s ease;
  }

  &__thumb {
    position: absolute;
    left: 3px;
    top: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.18s ease;
  }

  &__input:checked ~ &__track {
    background: var(--color-primary, #d98c6a);
  }

  &__input:checked ~ &__track &__thumb {
    transform: translateX(16px);
  }
}

// ===== 夜晚模式 =====
body.is-night-mode .doll-panel {
  background: var(--color-background, #1c1917);
  color: var(--color-text, #efe8df);
}

body.is-night-mode .doll-panel__top,
body.is-night-mode .doll-panel__footer,
body.is-night-mode .doll-panel__menu {
  background: var(--color-surface, #26221e);
  border-color: var(--color-border, #3a332c);
}

body.is-night-mode .doll-panel .doll-action,
body.is-night-mode .doll-panel .doll-flip,
body.is-night-mode .doll-panel .doll-btn {
  background: var(--color-surface, #26221e);
  color: var(--color-text, #efe8df);
  border-color: var(--color-border, #3a332c);
}

body.is-night-mode .doll-panel .doll-action.is-active,
body.is-night-mode .doll-panel .doll-btn--primary {
  background: var(--color-primary, #d98c6a);
  border-color: var(--color-primary, #d98c6a);
  color: var(--color-on-primary-contrast, #fff);
}

body.is-night-mode .doll-panel .doll-hug {
  background: var(--color-surface-hover, #322c26);
}

body.is-night-mode .doll-stage {
  --doll-fill: #4a3f36;
  --doll-stroke: #8a7563;
}

body.is-night-mode .doll-stage .doll-hold-hint {
  background: var(--color-surface, #26221e);
}

@keyframes doll-shake {
  0%,
  100% {
    transform: translateX(0) rotate(0deg);
  }
  25% {
    transform: translateX(-2px) rotate(-0.6deg);
  }
  75% {
    transform: translateX(2px) rotate(0.6deg);
  }
}

@keyframes doll-float {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.8);
  }
  25% {
    opacity: 1;
    transform: translate(-50%, -70%) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -150%) scale(1.05);
  }
}

@media (max-width: 360px) {
  .doll-panel__scroll {
    padding-left: 10px;
    padding-right: 10px;
  }

  .doll-panel__footer {
    padding-left: 10px;
    padding-right: 10px;
  }
}
</style>
