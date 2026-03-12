<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="woodfish-overlay" @click.self="$emit('close')">
        <div class="woodfish-modal">
          <!-- 頂部 -->
          <div class="modal-header">
            <h2 class="title">敲木魚</h2>
            <button class="close-btn" @click="$emit('close')">
              <X :size="20" />
            </button>
          </div>

          <!-- 功德顯示 -->
          <div class="merit-display">
            <span class="merit-label">功德</span>
            <span class="merit-value">{{ meritStore.state.balance }}</span>
            <span v-if="sessionMerit > 0" class="session-merit"
              >+{{ sessionMerit }}</span
            >
          </div>

          <!-- 飄字區域 -->
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

          <!-- 木魚 -->
          <div class="woodfish-area">
            <button
              class="woodfish-btn"
              :class="{ tapped: isTapped }"
              @click="tap"
            >
              <svg viewBox="0 0 120 120" class="woodfish-svg">
                <!-- 木魚身體 -->
                <ellipse cx="60" cy="65" rx="45" ry="35" fill="#8B6914" />
                <ellipse cx="60" cy="62" rx="42" ry="32" fill="#A0782C" />
                <!-- 木魚頂部裝飾 -->
                <ellipse cx="60" cy="38" rx="12" ry="8" fill="#8B6914" />
                <circle cx="60" cy="30" r="6" fill="#C4973B" />
                <!-- 木魚紋路 -->
                <path
                  d="M30 60 Q45 50 60 60 Q75 50 90 60"
                  stroke="#6B5010"
                  stroke-width="1.5"
                  fill="none"
                />
                <path
                  d="M35 72 Q50 62 65 72 Q80 62 85 72"
                  stroke="#6B5010"
                  stroke-width="1"
                  fill="none"
                />
                <!-- 眼睛 -->
                <circle cx="48" cy="58" r="4" fill="#4A3508" />
                <circle cx="72" cy="58" r="4" fill="#4A3508" />
                <circle cx="49" cy="57" r="1.5" fill="#C4973B" />
                <circle cx="73" cy="57" r="1.5" fill="#C4973B" />
              </svg>
            </button>
            <div class="tap-hint">點擊木魚積攢功德</div>
          </div>

          <!-- 統計 -->
          <div class="stats-row">
            <div class="stat">
              <span class="stat-label">本次</span>
              <span class="stat-value">{{ sessionMerit }}</span>
            </div>
            <div class="stat">
              <span class="stat-label">累計敲擊</span>
              <span class="stat-value">{{
                meritStore.state.woodfish.totalTaps
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

const props = defineProps<{ visible: boolean }>();
defineEmits<{ close: [] }>();

const meritStore = useMeritStore();

const sessionMerit = ref(0);
const isTapped = ref(false);
const wordIndex = ref(0);
const floatingWords = ref<{ id: number; text: string; x: number }[]>([]);
const floatAreaRef = ref<HTMLElement | null>(null);
let floatId = 0;

// 木魚音效（使用 Web Audio API）
let audioCtx: AudioContext | null = null;

function playWoodfishSound() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.setValueAtTime(180, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.type = "sine";
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.3);
  } catch {
    // 靜默失敗
  }
}

function tap() {
  meritStore.tapWoodfish();
  sessionMerit.value += 1;

  // 敲擊動畫
  isTapped.value = true;
  setTimeout(() => {
    isTapped.value = false;
  }, 100);

  // 播放音效
  playWoodfishSound();

  // 飄字
  const words = meritStore.getWoodfishWords();
  const word = words[wordIndex.value % words.length];
  wordIndex.value += 1;

  const areaWidth = floatAreaRef.value?.clientWidth ?? 200;
  const x = Math.random() * (areaWidth - 80) + 20;

  floatId += 1;
  const id = floatId;
  floatingWords.value.push({ id, text: word, x });

  // 1 秒後移除
  setTimeout(() => {
    floatingWords.value = floatingWords.value.filter((w) => w.id !== id);
  }, 1000);
}

// 自動保存
let saveTimer: ReturnType<typeof setInterval> | null = null;

watch(
  () => props.visible,
  (v) => {
    if (v) {
      sessionMerit.value = 0;
      wordIndex.value = 0;
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
});
</script>

<style scoped lang="scss">
.woodfish-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.woodfish-modal {
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
  margin-bottom: 8px;

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
  height: 80px;
  overflow: hidden;
}

.floating-word {
  position: absolute;
  bottom: 0;
  font-size: 20px;
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
    transform: translateY(-70px);
  }
}

.float-word-enter-active {
  animation: floatUp 1s ease-out forwards;
}

.float-word-leave-active {
  display: none;
}

.woodfish-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 8px 0 16px;

  .woodfish-btn {
    width: 140px;
    height: 140px;
    border: none;
    background: none;
    cursor: pointer;
    transition: transform 0.1s;
    padding: 0;

    &.tapped {
      transform: scale(0.92);
    }

    &:active {
      transform: scale(0.92);
    }

    .woodfish-svg {
      width: 100%;
      height: 100%;
    }
  }

  .tap-hint {
    margin-top: 8px;
    font-size: 12px;
    color: var(--color-text-secondary, #9ca3af);
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

// 模態框過渡
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.25s;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
