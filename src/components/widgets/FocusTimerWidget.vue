<script setup lang="ts">
import type { WidgetCustomStyle } from "@/types";
import { Brain, Coffee, Pause, Play, RotateCcw } from "lucide-vue-next";
import { computed, onUnmounted, ref } from "vue";

const props = defineProps<{
  data?: {
    customStyle?: WidgetCustomStyle;
  };
}>();

// 計時器設置
const FOCUS_TIME = 25 * 60; // 25分鐘
const BREAK_TIME = 5 * 60; // 5分鐘

const timeLeft = ref(FOCUS_TIME);
const isRunning = ref(false);
const isBreak = ref(false);
const completedSessions = ref(0);
let intervalId: number | null = null;

const minutes = computed(() => Math.floor(timeLeft.value / 60));
const seconds = computed(() => timeLeft.value % 60);
const progress = computed(() => {
  const total = isBreak.value ? BREAK_TIME : FOCUS_TIME;
  return ((total - timeLeft.value) / total) * 100;
});

function formatNum(n: number) {
  return n.toString().padStart(2, "0");
}

function toggleTimer() {
  isRunning.value = !isRunning.value;

  if (isRunning.value) {
    intervalId = window.setInterval(() => {
      if (timeLeft.value > 0) {
        timeLeft.value--;
      } else {
        // 時間到
        if (!isBreak.value) {
          completedSessions.value++;
        }
        isBreak.value = !isBreak.value;
        timeLeft.value = isBreak.value ? BREAK_TIME : FOCUS_TIME;
      }
    }, 1000);
  } else if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function resetTimer() {
  isRunning.value = false;
  isBreak.value = false;
  timeLeft.value = FOCUS_TIME;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

// 自定義樣式
const containerStyle = computed(() => {
  const style = props.data?.customStyle;
  if (!style) return {};

  const result: Record<string, string> = {};
  if (style.backgroundGradient) {
    result.background = style.backgroundGradient;
  } else if (style.backgroundColor) {
    result.background = style.backgroundColor;
  }
  if (style.borderColor) {
    result.borderColor = style.borderColor;
    result.borderWidth = `${style.borderWidth || 2}px`;
    result.borderStyle = "solid";
  }
  return result;
});

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId);
});

const currentLayout = computed(() => {
  return props.data?.customStyle?.layout || "pop";
});
</script>

<template>
  <div class="focus-timer" :class="currentLayout" :style="containerStyle">
    <!-- 模式指示 -->
    <div class="mode-indicator" :class="{ break: isBreak }">
      <Brain v-if="!isBreak" :size="14" />
      <Coffee v-else :size="14" />
      <span>{{ isBreak ? "休息時間" : "專注模式" }}</span>
    </div>

    <!-- 圓形進度 -->
    <div class="timer-circle">
      <svg class="progress-ring" viewBox="0 0 120 120">
        <circle
          class="progress-bg"
          cx="60"
          cy="60"
          r="52"
          fill="none"
          stroke-width="8"
        />
        <circle
          class="progress-bar"
          :class="{ break: isBreak }"
          cx="60"
          cy="60"
          r="52"
          fill="none"
          stroke-width="8"
          :stroke-dasharray="326.7"
          :stroke-dashoffset="326.7 - (326.7 * progress) / 100"
        />
      </svg>
      <div class="timer-display">
        <span class="time"
          >{{ formatNum(minutes) }}:{{ formatNum(seconds) }}</span
        >
        <span class="sessions">🍅 {{ completedSessions }}</span>
      </div>
    </div>

    <!-- 控制按鈕 -->
    <div class="controls">
      <button class="control-btn reset" @click="resetTimer">
        <RotateCcw :size="18" />
      </button>
      <button
        class="control-btn play"
        :class="{ pause: isRunning }"
        @click="toggleTimer"
      >
        <Pause v-if="isRunning" :size="24" />
        <Play v-else :size="24" />
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.focus-timer {
  width: 100%;
  height: 100%;
  background-color: #fef3c7;
  background-image: linear-gradient(145deg, #fef3c7 0%, #fde68a 100%);
  border-radius: 16px;
  border: 3px solid #1a1a1a;
  box-shadow: 4px 4px 0px #1a1a1a;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  container-type: size;
  overflow: hidden;

  // Classic 傳統樣式
  &.classic {
    background-color: #fef3c7;
    background-image: linear-gradient(145deg, #fef3c7 0%, #fde68a 100%);
    border-radius: var(--radius-lg, 16px);
    padding: 16px;

    .mode-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: rgba(255, 255, 255, 0.4);
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
      color: #374151;

      &.break {
        background: rgba(167, 243, 208, 0.5);
      }
    }

    .timer-circle {
      position: relative;
      width: 120px;
      height: 120px;

      .progress-ring {
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
      }

      .progress-bg {
        stroke: rgba(0, 0, 0, 0.1);
      }

      .progress-bar {
        stroke: #f59e0b;
        stroke-linecap: round;
        transition: stroke-dashoffset 0.3s ease;

        &.break {
          stroke: #10b981;
        }
      }

      .timer-display {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;

        .time {
          font-size: 28px;
          font-weight: 700;
          color: #1f2937;
          font-variant-numeric: tabular-nums;
        }

        .sessions {
          font-size: 12px;
          color: #4b5563;
        }
      }
    }

    .controls {
      display: flex;
      align-items: center;
      gap: 16px;

      .control-btn {
        border: none;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 0.2s, background-color 0.2s;

        &.reset {
          width: 40px;
          height: 40px;
          background: rgba(255, 255, 255, 0.6);
          color: #4b5563;

          &:hover {
            background: rgba(255, 255, 255, 0.8);
            transform: scale(1.05);
          }
        }

        &.play {
          width: 52px;
          height: 52px;
          background: #f59e0b;
          color: white;
          box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);

          &:hover {
            transform: scale(1.05);
            background: #d97706;
          }

          &.pause {
            background: #10b981;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
            &:hover {
              background: #059669;
            }
          }
        }
      }
    }
  }

  // Pop普普風/新粗野派樣式
  &.pop {
    background-color: #fef3c7;
    background-image: linear-gradient(145deg, #fef3c7 0%, #fde68a 100%);
    border-radius: 16px;
    border: 3px solid #1a1a1a;
    box-shadow: 4px 4px 0px #1a1a1a;
    padding: 16px;
    transition: transform 0.2s ease, box-shadow 0.2s ease;

    &:hover {
      transform: translate(-1px, -1px);
      box-shadow: 5px 5px 0px #1a1a1a;
    }

    .mode-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      background: #ffb4b4;
      color: #1a1a1a;
      border: 2px solid #1a1a1a;
      box-shadow: 2px 2px 0px #1a1a1a;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 800;
      flex-shrink: 0;

      &.break {
        background: #a3ffac;
      }
      
      svg {
        filter: drop-shadow(1px 1px 0px rgba(255,255,255,0.6));
      }
    }

    .timer-circle {
      position: relative;
      width: 120px;
      height: 120px;
      flex-shrink: 0;

      .progress-ring {
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
      }

      .progress-bg {
        stroke: #1a1a1a;
        stroke-opacity: 0.15;
      }

      .progress-bar {
        stroke: #ef4444;
        stroke-linecap: square;
        transition: stroke-dashoffset 0.3s ease;
        filter: drop-shadow(2px 2px 0px #1a1a1a);

        &.break {
          stroke: #22c55e;
        }
      }

      .timer-display {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: white;
        margin: 14px;
        border-radius: 50%;
        border: 3px solid #1a1a1a;
        box-shadow: inset 2px 2px 0px rgba(0,0,0,0.1), 2px 2px 0px #1a1a1a;

        .time {
          font-size: 26px;
          font-weight: 900;
          color: #1a1a1a;
          font-variant-numeric: tabular-nums;
          margin-top: 4px;
        }

        .sessions {
          font-size: 13px;
          font-weight: 800;
          color: #1a1a1a;
          margin-top: -2px;
        }
      }
    }

    .controls {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-shrink: 0;

      .control-btn {
        border-radius: 50%;
        border: 2px solid #1a1a1a;
        box-shadow: 2px 2px 0px #1a1a1a;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);

        &.reset {
          width: 40px;
          height: 40px;
          background: white;
          color: #1a1a1a;

          &:hover {
            background: #f0f0f0;
            transform: scale(1.1);
          }
          
          &:active {
            transform: scale(0.95);
            box-shadow: 0px 0px 0px #1a1a1a;
          }
        }

        &.play {
          width: 52px;
          height: 52px;
          background: #ef4444;
          color: white;

          &:hover {
            transform: scale(1.1);
          }

          &:active {
            transform: scale(0.95);
            box-shadow: 0px 0px 0px #1a1a1a;
          }

          &.pause {
            background: #fcd34d;
            color: #1a1a1a;
          }
          
          svg {
            filter: drop-shadow(1px 1px 0px rgba(0,0,0,0.3));
          }
        }
      }
    }
  }

  // 平面風
  &.flat {
    background-color: #FFF0F5;
    border-radius: 32px;
    border: 3px solid #332650;
    box-shadow: 0 6px 0px #332650;
    padding: 24px;

    .mode-indicator {
      display: flex; align-items: center; gap: 6px; padding: 6px 14px;
      background: #FCD24B; color: #332650; border: 3px solid #332650;
      border-radius: 9999px; font-size: 13px; font-weight: 800; flex-shrink: 0;
      &.break { background: #A7F3D0; }
    }

    .timer-circle {
      position: relative; width: 130px; height: 130px; flex-shrink: 0;
      .progress-ring { width: 100%; height: 100%; transform: rotate(-90deg); }
      .progress-bg { stroke: #332650; stroke-opacity: 0.1; }
      .progress-bar { stroke: #FCD24B; stroke-linecap: round; transition: stroke-dashoffset 0.3s ease; &.break { stroke: #10B981; } }
      .timer-display {
        position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
        background: white; margin: 16px; border-radius: 50%;
        border: 3px solid #332650; box-shadow: 0 4px 0px #332650;
        .time { font-size: 28px; font-weight: 900; color: #332650; font-variant-numeric: tabular-nums; margin-top: 4px; }
        .sessions { font-size: 13px; font-weight: 800; color: #332650; margin-top: -2px; }
      }
    }

    .controls {
      display: flex; align-items: center; gap: 16px; flex-shrink: 0;
      .control-btn {
        border-radius: 50%; border: 3px solid #332650; display: flex; align-items: center; justify-content: center;
        transition: transform 0.2s; box-shadow: 0 4px 0px #332650;
        &.reset { width: 44px; height: 44px; background: white; color: #332650; &:hover { transform: scale(1.05); } &:active { transform: translateY(2px); box-shadow: 0 2px 0px #332650; } }
        &.play {
          width: 56px; height: 56px; background: #FCD24B; color: #332650;
          &:hover { transform: scale(1.05); } &:active { transform: translateY(2px); box-shadow: 0 2px 0px #332650; }
          &.pause { background: #F43F5E; color: white; }
        }
      }
    }
  }

  // 插圖風
  &.illustration {
    background-color: #F6F3EB;
    border-radius: 6px;
    border: 2px solid #1a1a1a;
    box-shadow: 4px 4px 0px #1a1a1a;
    padding: 34px 16px 16px;
    position: relative;

    &::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 22px; border-bottom: 2px solid #1a1a1a;
      background: #F6F3EB; background-image: repeating-linear-gradient(to bottom, transparent, transparent 2px, #1a1a1a 2px, #1a1a1a 3px); background-size: 100% 12px; background-position: center 5px; background-repeat: no-repeat;
    }
    &::after {
      content: ''; position: absolute; top: 5px; left: 8px; width: 12px; height: 12px; border: 2px solid #1a1a1a; background: white; box-shadow: inset 1px 1px 0 rgba(0,0,0,0.1);
    }

    .mode-indicator {
      display: flex; align-items: center; gap: 6px; padding: 4px 12px;
      background: white; color: #1a1a1a; border: 2px solid #1a1a1a;
      border-radius: 4px; font-size: 13px; font-weight:bold; flex-shrink: 0; box-shadow: 2px 2px 0px #1a1a1a;
      &.break { background: #E8F4F8; }
    }

    .timer-circle {
      position: relative; width: 120px; height: 120px; flex-shrink: 0;
      .progress-ring { width: 100%; height: 100%; transform: rotate(-90deg); }
      .progress-bg { stroke: #1a1a1a; stroke-opacity: 0.15; }
      .progress-bar { stroke: #1a1a1a; stroke-linecap: square; transition: stroke-dashoffset 0.3s ease; }
      .timer-display {
        position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
        background: #FBC9CB; margin: 12px; border-radius: 50%;
        border: 2px solid #1a1a1a; box-shadow: 2px 2px 0px #1a1a1a;
        .time { font-size: 26px; font-weight: 900; color: #1a1a1a; font-variant-numeric: tabular-nums; margin-top: 4px; }
        .sessions { font-size: 13px; font-weight: bold; color: #1a1a1a; margin-top: -2px; }
      }
    }

    .controls {
      display: flex; align-items: center; gap: 16px; flex-shrink: 0;
      .control-btn {
        border-radius: 4px; border: 2px solid #1a1a1a; display: flex; align-items: center; justify-content: center;
        box-shadow: 2px 2px 0px #1a1a1a; transition: all 0.1s;
        &.reset { width: 40px; height: 40px; background: white; color: #1a1a1a; &:active { transform: translate(2px, 2px); box-shadow: 0px 0px 0px #1a1a1a; } }
        &.play {
          width: 52px; height: 52px; background: #B0D0DB; color: #1a1a1a;
          &:active { transform: translate(2px, 2px); box-shadow: 0px 0px 0px #1a1a1a; }
          &.pause { background: #FCEAEA; }
        }
      }
    }
  }

  // 像素風
  &.pixel {
    background-color: #FFF1F5;
    background-image: linear-gradient(#F8C6DB 1px, transparent 1px), linear-gradient(90deg, #F8C6DB 1px, transparent 1px);
    background-size: 16px 16px;
    border-radius: 8px;
    border: 4px solid #F4A2C5;
    box-shadow: 4px 4px 0px #F5C6DA;
    padding: 34px 16px 16px;
    font-family: 'DotGothic16', 'Press Start 2P', monospace, sans-serif;
    position: relative;

    &::before {
      content: 'TIMER.SYS'; position: absolute; top: -4px; right: -4px; left: -4px; height: 26px; background: #F4A2C5; color: white; font-size: 13px; line-height: 26px; padding-left: 8px; font-weight: bold; border: 4px solid #F4A2C5;
    }

    .mode-indicator {
      display: flex; align-items: center; gap: 6px; padding: 4px 12px;
      background: white; border: 2px solid #EAA3C5; box-shadow: 2px 2px 0px #F5C6DA; color: #d06d9a;
      border-radius: 4px; font-size: 13px; font-weight: bold; flex-shrink: 0; text-transform: uppercase;
      &.break { background: #A7F3D0; color: #10B981; }
    }

    .timer-circle {
      position: relative; width: 120px; height: 120px; flex-shrink: 0;
      .progress-ring { width: 100%; height: 100%; transform: rotate(-90deg); }
      .progress-bg { stroke: #F4A2C5; stroke-opacity: 0.3; }
      .progress-bar { stroke: #F4A2C5; stroke-linecap: square; transition: stroke-dashoffset 0.3s ease; }
      .timer-display {
        position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
        background: white; margin: 12px; border-radius: 4px; // Square-ish look for pixel
        border: 2px dashed #EAA3C5; box-shadow: 2px 2px 0px #F5C6DA;
        .time { font-size: 26px; font-weight: bold; color: #d06d9a; margin-top: 4px; letter-spacing: 2px; }
        .sessions { font-size: 13px; font-weight: bold; color: #d06d9a; margin-top: -2px; }
      }
    }

    .controls {
      display: flex; align-items: center; gap: 16px; flex-shrink: 0;
      .control-btn {
        border-radius: 4px; border: 2px solid #EAA3C5; box-shadow: 2px 2px 0px #F5C6DA; display: flex; align-items: center; justify-content: center; padding: 0;
        &.reset { width: 40px; height: 40px; background: white; color: #F4A2C5; &:active { box-shadow: none; transform: translate(2px, 2px); } }
        &.play {
          width: 52px; height: 52px; background: #93E2B6; color: white;
          &:active { box-shadow: none; transform: translate(2px, 2px); }
          &.pause { background: #FCD24B; }
        }
      }
    }
  }
}

// 小尺寸響應式調整
@container (max-height: 200px) {
  .focus-timer {
    padding: 10px;
    gap: 8px;
  }

  .mode-indicator {
    padding: 4px 10px;
    font-size: 10px;
    gap: 4px;

    svg {
      width: 12px;
      height: 12px;
    }
  }

  .timer-circle {
    width: 80px;
    height: 80px;

    .timer-display {
      .time {
        font-size: 20px;
      }

      .sessions {
        font-size: 10px;
      }
    }
  }

  .controls {
    gap: 10px;

    .control-btn {
      &.reset {
        width: 32px;
        height: 32px;

        svg {
          width: 14px;
          height: 14px;
        }
      }

      &.play {
        width: 40px;
        height: 40px;

        svg {
          width: 18px;
          height: 18px;
        }
      }
    }
  }
}

@container (max-height: 150px) {
  .focus-timer {
    padding: 8px;
    gap: 6px;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
  }

  .mode-indicator {
    order: 1;
    width: 100%;
    justify-content: center;
    padding: 3px 8px;
    font-size: 9px;
  }

  .timer-circle {
    order: 2;
    width: 60px;
    height: 60px;

    .timer-display {
      .time {
        font-size: 16px;
      }

      .sessions {
        font-size: 8px;
        margin-top: 0;
      }
    }
  }

  .controls {
    order: 3;
    gap: 8px;

    .control-btn {
      &.reset {
        width: 28px;
        height: 28px;

        svg {
          width: 12px;
          height: 12px;
        }
      }

      &.play {
        width: 36px;
        height: 36px;

        svg {
          width: 16px;
          height: 16px;
        }
      }
    }
  }
}

@container (max-width: 140px) {
  .mode-indicator {
    padding: 3px 8px;
    font-size: 9px;

    span {
      display: none;
    }
  }

  .timer-circle {
    width: 70px;
    height: 70px;

    .timer-display {
      .time {
        font-size: 18px;
      }

      .sessions {
        font-size: 9px;
      }
    }
  }

  .controls {
    gap: 8px;

    .control-btn.reset {
      display: none;
    }

    .control-btn.play {
      width: 36px;
      height: 36px;
    }
  }
}

// 極小尺寸：只顯示時間和播放按鈕
@container (max-height: 100px) {
  .mode-indicator {
    display: none;
  }

  .focus-timer {
    flex-direction: row;
    gap: 8px;
  }

  .timer-circle {
    width: 50px;
    height: 50px;

    .progress-ring {
      display: none;
    }

    .timer-display {
      .time {
        font-size: 16px;
      }

      .sessions {
        font-size: 8px;
      }
    }
  }

  .controls {
    .control-btn.reset {
      display: none;
    }

    .control-btn.play {
      width: 32px;
      height: 32px;

      svg {
        width: 14px;
        height: 14px;
      }
    }
  }
}
</style>
