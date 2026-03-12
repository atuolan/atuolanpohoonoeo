<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="beads-overlay" @click.self="$emit('close')">
        <div class="beads-modal">
          <div class="modal-header">
            <h2 class="title">盤佛珠</h2>
            <button class="close-btn" @click="$emit('close')">
              <X :size="20" />
            </button>
          </div>

          <div class="merit-display">
            <span class="merit-label">功德</span>
            <span class="merit-value">{{ meritStore.state.balance }}</span>
            <span v-if="sessionMerit > 0" class="session-merit"
              >+{{ sessionMerit }}</span
            >
          </div>

          <div class="float-area" ref="floatAreaRef">
            <TransitionGroup name="float-word">
              <div
                v-for="fw in floatingWords"
                :key="fw.id"
                class="floating-word"
                :style="{ left: fw.x + 'px' }"
              >
                {{ fw.text }}
              </div>
            </TransitionGroup>
          </div>

          <!-- 佛珠轉盤 - 只露出上半圈 -->
          <div class="beads-viewport">
            <div
              class="beads-ring"
              ref="ringRef"
              :style="{ transform: `rotate(${rotation}deg)` }"
              @touchstart.prevent="onTouchStart"
              @touchmove.prevent="onTouchMove"
              @touchend.prevent="onTouchEnd"
              @mousedown.prevent="onMouseDown"
            >
              <div
                v-for="(bead, i) in beads"
                :key="i"
                class="bead"
                :class="{ active: bead.active }"
                :style="beadStyle(i)"
              >
                <div class="bead-inner" :class="{ lit: bead.lit }"></div>
              </div>
            </div>
            <div class="center-marker">
              <svg viewBox="0 0 20 20" width="16" height="16">
                <polygon points="10,18 3,6 17,6" fill="#d97706" />
              </svg>
            </div>
          </div>

          <div class="progress-row">
            <div class="round-label">第 {{ currentRound + 1 }} 圈</div>
            <div class="progress-bar">
              <div
                class="progress-fill"
                :style="{ width: (beadsDone / BEAD_COUNT) * 100 + '%' }"
              ></div>
            </div>
            <div class="progress-text">{{ beadsDone }}/{{ BEAD_COUNT }}</div>
          </div>

          <div class="stats-row">
            <div class="stat">
              <span class="stat-label">本次</span>
              <span class="stat-value">{{ sessionMerit }}</span>
            </div>
            <div class="stat">
              <span class="stat-label">完成圈數</span>
              <span class="stat-value">{{
                meritStore.state.beads.completedRounds
              }}</span>
            </div>
            <div class="stat">
              <span class="stat-label">總功德</span>
              <span class="stat-value">{{ meritStore.state.totalEarned }}</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useMeritStore } from "@/stores/merit";
import { X } from "lucide-vue-next";
import { onUnmounted, ref, watch } from "vue";

const BEAD_COUNT = 18;
const RING_RADIUS = 130;
const BEAD_SIZE = 40;
const ANGLE_PER_BEAD = 360 / BEAD_COUNT;

const props = defineProps<{ visible: boolean }>();
defineEmits<{ close: [] }>();

const meritStore = useMeritStore();

const sessionMerit = ref(0);
const currentRound = ref(0);
const beadsDone = ref(0);
const rotation = ref(0);
const wordIndex = ref(0);
const floatingWords = ref<{ id: number; text: string; x: number }[]>([]);
const floatAreaRef = ref<HTMLElement | null>(null);
const ringRef = ref<HTMLElement | null>(null);
let floatId = 0;

interface BeadState {
  active: boolean;
  lit: boolean;
}

const beads = ref<BeadState[]>(
  Array.from({ length: BEAD_COUNT }, () => ({ active: false, lit: false })),
);

function beadStyle(index: number) {
  const angle = (index / BEAD_COUNT) * 2 * Math.PI - Math.PI / 2;
  const x = RING_RADIUS * Math.cos(angle);
  const y = RING_RADIUS * Math.sin(angle);
  return {
    width: BEAD_SIZE + "px",
    height: BEAD_SIZE + "px",
    left: `calc(50% + ${x}px - ${BEAD_SIZE / 2}px)`,
    top: `calc(50% + ${y}px - ${BEAD_SIZE / 2}px)`,
  };
}

// ===== 拖曳旋轉 =====
let isDragging = false;
let lastAngle = 0;
let accumulatedAngle = 0;
let lastTriggerAngle = 0;

function getAngleFromCenter(cx2: number, cy2: number): number {
  if (!ringRef.value) return 0;
  const rect = ringRef.value.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return Math.atan2(cy2 - cy, cx2 - cx) * (180 / Math.PI);
}

function onTouchStart(e: TouchEvent) {
  if (e.touches.length !== 1) return;
  startDrag(e.touches[0].clientX, e.touches[0].clientY);
}
function onTouchMove(e: TouchEvent) {
  if (!isDragging || e.touches.length !== 1) return;
  moveDrag(e.touches[0].clientX, e.touches[0].clientY);
}
function onTouchEnd() {
  endDrag();
}

function onMouseDown(e: MouseEvent) {
  startDrag(e.clientX, e.clientY);
  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", handleMouseUp);
}
function handleMouseMove(e: MouseEvent) {
  moveDrag(e.clientX, e.clientY);
}
function handleMouseUp() {
  endDrag();
  window.removeEventListener("mousemove", handleMouseMove);
  window.removeEventListener("mouseup", handleMouseUp);
}

function startDrag(x: number, y: number) {
  isDragging = true;
  lastAngle = getAngleFromCenter(x, y);
}

function moveDrag(x: number, y: number) {
  if (!isDragging) return;
  const cur = getAngleFromCenter(x, y);
  let delta = cur - lastAngle;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;

  rotation.value += delta;
  accumulatedAngle += delta;
  lastAngle = cur;

  const dist = Math.abs(accumulatedAngle - lastTriggerAngle);
  if (dist >= ANGLE_PER_BEAD) {
    const count = Math.floor(dist / ANGLE_PER_BEAD);
    for (let i = 0; i < count; i++) countOneBead();
    lastTriggerAngle +=
      count * ANGLE_PER_BEAD * Math.sign(accumulatedAngle - lastTriggerAngle);
  }
}

function endDrag() {
  isDragging = false;
}

// ===== 計數 =====
let audioCtx: AudioContext | null = null;

function playBeadSound() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      400,
      audioCtx.currentTime + 0.08,
    );
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
    osc.type = "triangle";
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.12);
  } catch {
    /* silent */
  }
}

function countOneBead() {
  meritStore.rollBead();
  sessionMerit.value += 1;
  beadsDone.value += 1;
  playBeadSound();
  addFloatingWord();

  const idx = (beadsDone.value - 1) % BEAD_COUNT;
  beads.value[idx].lit = true;
  beads.value[idx].active = true;
  setTimeout(() => {
    beads.value[idx].active = false;
  }, 200);

  if (beadsDone.value >= BEAD_COUNT) {
    meritStore.completeBeadRound();
    sessionMerit.value += 5;
    currentRound.value += 1;
    setTimeout(() => {
      beadsDone.value = 0;
      beads.value = Array.from({ length: BEAD_COUNT }, () => ({
        active: false,
        lit: false,
      }));
    }, 300);
  }
}

function addFloatingWord() {
  const words = meritStore.getBeadsWords();
  const word = words[wordIndex.value % words.length];
  wordIndex.value += 1;
  const areaWidth = floatAreaRef.value?.clientWidth ?? 200;
  const x = Math.random() * (areaWidth - 80) + 20;
  floatId += 1;
  const id = floatId;
  floatingWords.value.push({ id, text: word, x });
  setTimeout(() => {
    floatingWords.value = floatingWords.value.filter((w) => w.id !== id);
  }, 1000);
}

function resetState() {
  sessionMerit.value = 0;
  currentRound.value = 0;
  beadsDone.value = 0;
  rotation.value = 0;
  wordIndex.value = 0;
  accumulatedAngle = 0;
  lastTriggerAngle = 0;
  beads.value = Array.from({ length: BEAD_COUNT }, () => ({
    active: false,
    lit: false,
  }));
}

let saveTimer: ReturnType<typeof setInterval> | null = null;

watch(
  () => props.visible,
  (v) => {
    if (v) {
      resetState();
      meritStore.initialize();
      saveTimer = setInterval(() => meritStore.saveState(), 5000);
    } else {
      meritStore.saveState();
      if (saveTimer) {
        clearInterval(saveTimer);
        saveTimer = null;
      }
    }
  },
);

onUnmounted(() => {
  if (saveTimer) clearInterval(saveTimer);
  meritStore.saveState();
  window.removeEventListener("mousemove", handleMouseMove);
  window.removeEventListener("mouseup", handleMouseUp);
});
</script>

<style scoped lang="scss">
.beads-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.beads-modal {
  background: var(--color-surface, #fff);
  border-radius: 20px;
  width: 100%;
  max-width: 360px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
}

.modal-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;

  .title {
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text, #1f2937);
    margin: 0;
  }

  .close-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: var(--color-background, #f3f4f6);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--color-text-secondary, #6b7280);
  }
}

.merit-display {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 4px;

  .merit-label {
    font-size: 14px;
    color: var(--color-text-secondary, #6b7280);
  }
  .merit-value {
    font-size: 28px;
    font-weight: 700;
    color: #d97706;
  }
  .session-merit {
    font-size: 16px;
    font-weight: 600;
    color: #16a34a;
  }
}

.float-area {
  position: relative;
  width: 100%;
  height: 60px;
  overflow: hidden;
}

.floating-word {
  position: absolute;
  bottom: 0;
  font-size: 18px;
  font-weight: 700;
  color: #d97706;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  pointer-events: none;
  animation: floatUp 1s ease-out forwards;
}

@keyframes floatUp {
  0% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateY(-50px);
  }
}

.float-word-enter-active {
  animation: floatUp 1s ease-out forwards;
}
.float-word-leave-active {
  display: none;
}

/* 佛珠轉盤 - 只顯示上半圈 */
.beads-viewport {
  position: relative;
  width: 300px;
  height: 170px;
  overflow: hidden;
  margin: 0 auto 12px;
  cursor: grab;
  touch-action: none;
  user-select: none;

  &:active {
    cursor: grabbing;
  }
}

.beads-ring {
  position: absolute;
  width: 300px;
  height: 300px;
  top: 0;
  left: 0;
  transition: none;
  will-change: transform;
}

.bead {
  position: absolute;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s;

  &.active {
    transform: scale(1.25);
  }

  .bead-inner {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #f5e6c8, #c4973b);
    border: 2.5px solid #a0782c;
    box-shadow:
      inset 0 -2px 4px rgba(0, 0, 0, 0.15),
      0 2px 6px rgba(0, 0, 0, 0.12);
    transition: all 0.2s;

    &.lit {
      background: radial-gradient(circle at 35% 35%, #fde68a, #d97706);
      border-color: #b45309;
      box-shadow:
        inset 0 -2px 4px rgba(0, 0, 0, 0.1),
        0 0 10px rgba(217, 119, 6, 0.4);
    }
  }
}

.center-marker {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin-bottom: 14px;

  .round-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text, #1f2937);
    white-space: nowrap;
  }

  .progress-bar {
    flex: 1;
    height: 8px;
    background: var(--color-background, #e5e7eb);
    border-radius: 4px;
    overflow: hidden;

    .progress-fill {
      height: 100%;
      background: #d97706;
      border-radius: 4px;
      transition: width 0.2s;
    }
  }

  .progress-text {
    font-size: 13px;
    font-weight: 600;
    color: #d97706;
    white-space: nowrap;
  }
}

.stats-row {
  display: flex;
  gap: 20px;
  width: 100%;
  justify-content: center;

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;

    .stat-label {
      font-size: 11px;
      color: var(--color-text-secondary, #9ca3af);
    }
    .stat-value {
      font-size: 16px;
      font-weight: 600;
      color: var(--color-text, #1f2937);
    }
  }
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.25s;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
