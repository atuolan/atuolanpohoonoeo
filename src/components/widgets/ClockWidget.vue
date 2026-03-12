<script setup lang="ts">
import { useThemeStore } from "@/stores";
import type { WidgetCustomStyle } from "@/types";
import { computed, onMounted, onUnmounted, ref } from "vue";

// 時鐘樣式類型
type ClockStyle =
  | "minimal"
  | "digital"
  | "analog"
  | "flip"
  | "neon"
  | "progress"
  | "binary"
  | "dotmatrix"
  | "orbit";

const props = defineProps<{
  data?: {
    customStyle?: WidgetCustomStyle;
    clockStyle?: ClockStyle;
    showSeconds?: boolean;
    showDate?: boolean;
  };
}>();

const themeStore = useThemeStore();

// 當前時間
const now = ref(new Date());
let intervalId: number | null = null;

// 時間狀態
const hours = computed(() => now.value.getHours());
const minutes = computed(() => now.value.getMinutes());
const seconds = computed(() => now.value.getSeconds());

// 格式化時間字符串
const hoursStr = computed(() => String(hours.value).padStart(2, "0"));
const minutesStr = computed(() => String(minutes.value).padStart(2, "0"));
const secondsStr = computed(() => String(seconds.value).padStart(2, "0"));

// 格式化日期
const formattedDate = computed(() => {
  const month = now.value.getMonth() + 1;
  const day = now.value.getDate();
  const weekdays = [
    "星期日",
    "星期一",
    "星期二",
    "星期三",
    "星期四",
    "星期五",
    "星期六",
  ];
  return `${month}月${day}日 ${weekdays[now.value.getDay()]}`;
});

// 設定
const clockStyle = computed(() => props.data?.clockStyle || "minimal");
const showSeconds = computed(() => props.data?.showSeconds ?? true);
const showDate = computed(() => props.data?.showDate ?? true);

// 模擬時鐘角度
const secondsAngle = computed(() => seconds.value * 6);
const minutesAngle = computed(() => minutes.value * 6 + seconds.value * 0.1);
const hoursAngle = computed(
  () => (hours.value % 12) * 30 + minutes.value * 0.5,
);

// 進度環計算
const circumference = 2 * Math.PI * 150;
const secondsOffset = computed(() => circumference * (1 - seconds.value / 60));
const minutesOffset = computed(() => circumference * (1 - minutes.value / 60));
const hoursOffset = computed(
  () => circumference * (1 - (hours.value % 12) / 12),
);

// 追踪重置用於進度環
const prevSeconds = ref(0);
const prevMinutes = ref(0);
const prevHours = ref(0);
const secondsNoTransition = ref(false);
const minutesNoTransition = ref(false);
const hoursNoTransition = ref(false);

// 極簡時鐘顏色（獨立設定）
const minimalClockColor = computed(
  () => props.data?.clockColor || props.data?.customStyle?.textColor || props.data?.customStyle?.foregroundColor || (themeStore.isWallpaperDark ? "#ffffff" : "#1f2937"),
);

// 三色時鐘顏色
const triColorHour = computed(
  () => props.data?.customStyle?.foregroundColor || "#3b82f6",
);
const triColorMinute = computed(() => "#a855f7");
const triColorSecond = computed(() => "#f472b6");

// 軌道時鐘：計算行星在 SVG 座標系中的位置（viewBox 0 0 200 200，中心 100,100）
function orbitPos(angleDeg: number, radius: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: 100 + radius * Math.cos(rad), y: 100 + radius * Math.sin(rad) };
}
const orbitHourPos = computed(() => orbitPos(((hours.value % 12) / 12) * 360, 35));
const orbitMinutePos = computed(() => orbitPos((minutes.value / 60) * 360, 55));
const orbitSecondPos = computed(() => orbitPos((seconds.value / 60) * 360, 75));
function getMarkerStyle(i: number) {
  const angle = (i * 30 - 90) * (Math.PI / 180);
  const x = 50 + 38 * Math.cos(angle);
  const y = 50 + 38 * Math.sin(angle);
  return {
    left: `${x}%`,
    top: `${y}%`,
    transform: "translate(-50%, -50%)",
  };
}

// 霓虹時鐘數字樣式
function getNeonDigitStyle(color: string) {
  return {
    color: color,
    borderColor: color + "80",
    textShadow: `0 0 20px ${color}cc, 0 0 40px ${color}66`,
  };
}

// 二進制時鐘輔助函數
function getBinaryArray(num: number): boolean[][] {
  const tens = Math.floor(num / 10);
  const ones = num % 10;
  const tensBin = tens
    .toString(2)
    .padStart(4, "0")
    .split("")
    .map((d) => d === "1");
  const onesBin = ones
    .toString(2)
    .padStart(4, "0")
    .split("")
    .map((d) => d === "1");
  return [
    [tensBin[0], onesBin[0]],
    [tensBin[1], onesBin[1]],
    [tensBin[2], onesBin[2]],
    [tensBin[3], onesBin[3]],
  ];
}

// 點陣數字模式
const dotMatrixPatterns: Record<string, boolean[][]> = {
  "0": [
    [true, true, true],
    [true, false, true],
    [true, false, true],
    [true, false, true],
    [true, true, true],
  ],
  "1": [
    [false, true, false],
    [true, true, false],
    [false, true, false],
    [false, true, false],
    [true, true, true],
  ],
  "2": [
    [true, true, true],
    [false, false, true],
    [true, true, true],
    [true, false, false],
    [true, true, true],
  ],
  "3": [
    [true, true, true],
    [false, false, true],
    [true, true, true],
    [false, false, true],
    [true, true, true],
  ],
  "4": [
    [true, false, true],
    [true, false, true],
    [true, true, true],
    [false, false, true],
    [false, false, true],
  ],
  "5": [
    [true, true, true],
    [true, false, false],
    [true, true, true],
    [false, false, true],
    [true, true, true],
  ],
  "6": [
    [true, true, true],
    [true, false, false],
    [true, true, true],
    [true, false, true],
    [true, true, true],
  ],
  "7": [
    [true, true, true],
    [false, false, true],
    [false, true, false],
    [true, false, false],
    [true, false, false],
  ],
  "8": [
    [true, true, true],
    [true, false, true],
    [true, true, true],
    [true, false, true],
    [true, true, true],
  ],
  "9": [
    [true, true, true],
    [true, false, true],
    [true, true, true],
    [false, false, true],
    [true, true, true],
  ],
};

function getDotPattern(digit: string): boolean[][] {
  return dotMatrixPatterns[digit] || dotMatrixPatterns["0"];
}

function updateTime() {
  const newNow = new Date();
  const newSeconds = newNow.getSeconds();
  const newMinutes = newNow.getMinutes();
  const newHours = newNow.getHours();

  // 檢測重置，禁用 transition 讓進度瞬間跳轉
  if (newSeconds < prevSeconds.value) {
    secondsNoTransition.value = true;
    requestAnimationFrame(() => {
      secondsNoTransition.value = false;
    });
  }
  if (newMinutes < prevMinutes.value) {
    minutesNoTransition.value = true;
    requestAnimationFrame(() => {
      minutesNoTransition.value = false;
    });
  }
  if (newHours % 12 < prevHours.value % 12) {
    hoursNoTransition.value = true;
    requestAnimationFrame(() => {
      hoursNoTransition.value = false;
    });
  }

  prevSeconds.value = newSeconds;
  prevMinutes.value = newMinutes;
  prevHours.value = newHours;
  now.value = newNow;
}

onMounted(() => {
  updateTime();
  intervalId = window.setInterval(updateTime, 1000);
});

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId);
});

// 自定義樣式計算
const containerStyle = computed(() => {
  const style: Record<string, string> = {};
  const customStyle = props.data?.customStyle;

  if (customStyle?.backgroundGradient) {
    style.background = customStyle.backgroundGradient;
  } else if (customStyle?.backgroundColor) {
    style.backgroundColor = customStyle.backgroundColor;
    if (customStyle.backgroundColor === "transparent") {
      style.backdropFilter = "none";
      style.webkitBackdropFilter = "none";
      style.border = "none";
      style.boxShadow = "none";
    }
  }

  if (customStyle?.borderColor) {
    style.borderColor = customStyle.borderColor;
    style.borderWidth = `${customStyle.borderWidth || 2}px`;
    style.borderStyle = "solid";
  }

  return style;
});

const textStyle = computed(() => {
  const style: Record<string, string> = {};
  const customStyle = props.data?.customStyle;
  if (customStyle?.textColor) {
    style.color = customStyle.textColor;
  } else if (customStyle?.foregroundColor) {
    style.color = customStyle.foregroundColor;
  } else if (themeStore.isWallpaperDark) {
    // 深色桌布時使用白色文字
    style.color = "#ffffff";
  } else {
    // 淺色桌布時使用深色文字
    style.color = "#1f2937";
  }
  return style;
});

const hasCustomBackground = computed(() => {
  return !!(
    props.data?.customStyle?.backgroundColor ||
    props.data?.customStyle?.backgroundGradient
  );
});
</script>

<template>
  <div
    class="clock-widget"
    :class="[
      `style-${clockStyle}`,
      {
        'has-custom-bg': hasCustomBackground,
        'has-custom-color': !!data?.customStyle?.foregroundColor,
      },
    ]"
    :style="{ ...containerStyle, ...textStyle }"
  >
    <!-- ===== 極簡時鐘 (Minimal) ===== -->
    <template v-if="clockStyle === 'minimal'">
      <div class="minimal-clock">
        <div class="time-display" :style="minimalClockColor ? { color: minimalClockColor } : textStyle">
          <span class="hours">{{ hoursStr }}</span>
          <span class="separator">:</span>
          <span class="minutes">{{ minutesStr }}</span>
          <span v-if="showSeconds" class="seconds">{{ secondsStr }}</span>
        </div>
        <div v-if="showDate" class="date-display" :style="minimalClockColor ? { color: minimalClockColor } : textStyle">
          {{ formattedDate }}
        </div>
      </div>
    </template>

    <!-- ===== 數字時鐘 (Digital) ===== -->
    <template v-else-if="clockStyle === 'digital'">
      <div class="digital-clock" :style="textStyle">
        <div class="time-units">
          <div class="time-unit">
            <div
              v-for="(digit, idx) in hoursStr.split('')"
              :key="'h' + idx"
              class="digit-card"
            >
              <span class="digit">{{ digit }}</span>
            </div>
          </div>
          <div class="separator-dots">
            <div class="dot"></div>
            <div class="dot"></div>
          </div>
          <div class="time-unit">
            <div
              v-for="(digit, idx) in minutesStr.split('')"
              :key="'m' + idx"
              class="digit-card"
            >
              <span class="digit">{{ digit }}</span>
            </div>
          </div>
          <template v-if="showSeconds">
            <div class="separator-dots">
              <div class="dot"></div>
              <div class="dot"></div>
            </div>
            <div class="time-unit">
              <div
                v-for="(digit, idx) in secondsStr.split('')"
                :key="'s' + idx"
                class="digit-card"
              >
                <span class="digit">{{ digit }}</span>
              </div>
            </div>
          </template>
        </div>
        <div v-if="showDate" class="digital-date">{{ formattedDate }}</div>
      </div>
    </template>

    <!-- ===== 模擬時鐘 (Analog) ===== -->
    <template v-else-if="clockStyle === 'analog'">
      <div class="analog-clock" :style="textStyle">
        <div class="clock-face">
          <div
            v-for="i in 12"
            :key="'marker-' + i"
            class="hour-marker"
            :class="{ quarter: i % 3 === 0 }"
            :style="getMarkerStyle(i)"
          />
          <div class="center-dot"></div>
          <div
            class="hand hour-hand"
            :style="{ transform: `rotate(${hoursAngle}deg)` }"
          ></div>
          <div
            class="hand minute-hand"
            :style="{ transform: `rotate(${minutesAngle}deg)` }"
          ></div>
          <div
            v-if="showSeconds"
            class="hand second-hand"
            :style="{ transform: `rotate(${secondsAngle}deg)` }"
          ></div>
        </div>
        <div v-if="showDate" class="analog-date">{{ formattedDate }}</div>
      </div>
    </template>

    <!-- ===== 翻頁時鐘 (Flip) ===== -->
    <template v-else-if="clockStyle === 'flip'">
      <div class="flip-clock" :style="textStyle">
        <div class="flip-units">
          <div class="flip-unit">
            <div class="flip-digits">
              <div
                v-for="(digit, idx) in hoursStr.split('')"
                :key="'fh' + idx"
                class="flip-card"
              >
                <span class="flip-digit">{{ digit }}</span>
                <div class="flip-line"></div>
              </div>
            </div>
            <span class="flip-label">時</span>
          </div>
          <div class="flip-separator">:</div>
          <div class="flip-unit">
            <div class="flip-digits">
              <div
                v-for="(digit, idx) in minutesStr.split('')"
                :key="'fm' + idx"
                class="flip-card"
              >
                <span class="flip-digit">{{ digit }}</span>
                <div class="flip-line"></div>
              </div>
            </div>
            <span class="flip-label">分</span>
          </div>
          <template v-if="showSeconds">
            <div class="flip-separator">:</div>
            <div class="flip-unit">
              <div class="flip-digits">
                <div
                  v-for="(digit, idx) in secondsStr.split('')"
                  :key="'fs' + idx"
                  class="flip-card"
                >
                  <span class="flip-digit">{{ digit }}</span>
                  <div class="flip-line"></div>
                </div>
              </div>
              <span class="flip-label">秒</span>
            </div>
          </template>
        </div>
        <div v-if="showDate" class="flip-date">{{ formattedDate }}</div>
      </div>
    </template>

    <!-- ===== 霓虹時鐘 (Neon) ===== -->
    <template v-else-if="clockStyle === 'neon'">
      <div class="neon-clock" :style="textStyle">
        <div
          class="neon-glow"
          :style="{ background: triColorHour + '26' }"
        ></div>
        <div class="neon-time">
          <div class="neon-digit" :style="getNeonDigitStyle(triColorHour)">
            {{ hoursStr }}
          </div>
          <div class="neon-separator">
            <div class="neon-dot"></div>
            <div class="neon-dot"></div>
          </div>
          <div class="neon-digit" :style="getNeonDigitStyle(triColorMinute)">
            {{ minutesStr }}
          </div>
          <template v-if="showSeconds">
            <div class="neon-separator">
              <div class="neon-dot"></div>
              <div class="neon-dot"></div>
            </div>
            <div class="neon-digit" :style="getNeonDigitStyle(triColorSecond)">
              {{ secondsStr }}
            </div>
          </template>
        </div>
        <p
          class="neon-label"
          :style="{
            color: triColorHour,
            textShadow: `0 0 10px ${triColorHour}cc`,
          }"
        >
          DIGITAL TIME
        </p>
        <div v-if="showDate" class="neon-date">{{ formattedDate }}</div>
      </div>
    </template>

    <!-- ===== 進度環時鐘 (Progress) ===== -->
    <template v-else-if="clockStyle === 'progress'">
      <div class="progress-clock" :style="textStyle">
        <div class="progress-rings">
          <svg class="ring seconds-ring" viewBox="0 0 320 320">
            <circle class="ring-bg" cx="160" cy="160" r="150" />
            <circle
              class="ring-progress"
              :class="{ 'no-transition': secondsNoTransition }"
              :style="{ stroke: triColorSecond }"
              cx="160"
              cy="160"
              r="150"
              :stroke-dasharray="circumference"
              :stroke-dashoffset="secondsOffset"
            />
          </svg>
          <svg class="ring minutes-ring" viewBox="0 0 320 320">
            <circle class="ring-bg" cx="160" cy="160" r="150" />
            <circle
              class="ring-progress"
              :class="{ 'no-transition': minutesNoTransition }"
              :style="{ stroke: triColorMinute }"
              cx="160"
              cy="160"
              r="150"
              :stroke-dasharray="circumference"
              :stroke-dashoffset="minutesOffset"
            />
          </svg>
          <svg class="ring hours-ring" viewBox="0 0 320 320">
            <circle class="ring-bg" cx="160" cy="160" r="150" />
            <circle
              class="ring-progress"
              :class="{ 'no-transition': hoursNoTransition }"
              :style="{ stroke: triColorHour }"
              cx="160"
              cy="160"
              r="150"
              :stroke-dasharray="circumference"
              :stroke-dashoffset="hoursOffset"
            />
          </svg>
          <div class="progress-center">
            <div class="progress-time">{{ hoursStr }}:{{ minutesStr }}</div>
            <div v-if="showSeconds" class="progress-seconds">
              {{ secondsStr }}
            </div>
          </div>
        </div>
        <div class="progress-legend">
          <div class="legend-item">
            <div class="legend-dot" :style="{ background: triColorHour }"></div>
            <span>時</span>
          </div>
          <div class="legend-item">
            <div
              class="legend-dot"
              :style="{ background: triColorMinute }"
            ></div>
            <span>分</span>
          </div>
          <div class="legend-item">
            <div
              class="legend-dot"
              :style="{ background: triColorSecond }"
            ></div>
            <span>秒</span>
          </div>
        </div>
        <div v-if="showDate" class="progress-date">{{ formattedDate }}</div>
      </div>
    </template>

    <!-- ===== 二進制時鐘 (Binary) ===== -->
    <template v-else-if="clockStyle === 'binary'">
      <div class="binary-clock" :style="textStyle">
        <p class="binary-label">二進制時鐘</p>
        <div class="binary-columns">
          <div class="binary-column">
            <span class="column-label">時</span>
            <div class="binary-grid">
              <div
                v-for="(row, rowIdx) in getBinaryArray(hours)"
                :key="'bh' + rowIdx"
                class="binary-row"
              >
                <div
                  v-for="(bit, bitIdx) in row"
                  :key="'bhb' + bitIdx"
                  class="binary-dot"
                  :class="{ active: bit }"
                  :style="
                    bit
                      ? {
                          background: triColorHour,
                          boxShadow: `0 0 8px ${triColorHour}`,
                        }
                      : {}
                  "
                />
              </div>
            </div>
            <span class="column-value">{{ hoursStr }}</span>
          </div>
          <div class="binary-separator"></div>
          <div class="binary-column">
            <span class="column-label">分</span>
            <div class="binary-grid">
              <div
                v-for="(row, rowIdx) in getBinaryArray(minutes)"
                :key="'bm' + rowIdx"
                class="binary-row"
              >
                <div
                  v-for="(bit, bitIdx) in row"
                  :key="'bmb' + bitIdx"
                  class="binary-dot"
                  :class="{ active: bit }"
                  :style="
                    bit
                      ? {
                          background: triColorMinute,
                          boxShadow: `0 0 8px ${triColorMinute}`,
                        }
                      : {}
                  "
                />
              </div>
            </div>
            <span class="column-value">{{ minutesStr }}</span>
          </div>
          <template v-if="showSeconds">
            <div class="binary-separator"></div>
            <div class="binary-column">
              <span class="column-label">秒</span>
              <div class="binary-grid">
                <div
                  v-for="(row, rowIdx) in getBinaryArray(seconds)"
                  :key="'bs' + rowIdx"
                  class="binary-row"
                >
                  <div
                    v-for="(bit, bitIdx) in row"
                    :key="'bsb' + bitIdx"
                    class="binary-dot"
                    :class="{ active: bit }"
                    :style="
                      bit
                        ? {
                            background: triColorSecond,
                            boxShadow: `0 0 8px ${triColorSecond}`,
                          }
                        : {}
                    "
                  />
                </div>
              </div>
              <span class="column-value">{{ secondsStr }}</span>
            </div>
          </template>
        </div>
        <div v-if="showDate" class="binary-date">{{ formattedDate }}</div>
      </div>
    </template>

    <!-- ===== 點陣時鐘 (Dot Matrix) ===== -->
    <template v-else-if="clockStyle === 'dotmatrix'">
      <div class="dotmatrix-clock" :style="textStyle">
        <p class="dotmatrix-label">點陣顯示器</p>
        <div class="dotmatrix-display">
          <div class="dotmatrix-digits">
            <div class="dotmatrix-digit">
              <div
                v-for="(row, ri) in getDotPattern(hoursStr[0])"
                :key="'d0r' + ri"
                class="dot-row"
              >
                <div
                  v-for="(on, ci) in row"
                  :key="'d0c' + ci"
                  class="dot"
                  :class="{ active: on }"
                  :style="
                    on
                      ? {
                          background: triColorHour,
                          boxShadow: `0 0 6px ${triColorHour}`,
                        }
                      : {}
                  "
                ></div>
              </div>
            </div>
            <div class="dotmatrix-digit">
              <div
                v-for="(row, ri) in getDotPattern(hoursStr[1])"
                :key="'d1r' + ri"
                class="dot-row"
              >
                <div
                  v-for="(on, ci) in row"
                  :key="'d1c' + ci"
                  class="dot"
                  :class="{ active: on }"
                  :style="
                    on
                      ? {
                          background: triColorHour,
                          boxShadow: `0 0 6px ${triColorHour}`,
                        }
                      : {}
                  "
                ></div>
              </div>
            </div>
            <div class="dotmatrix-colon">
              <div class="colon-dot"></div>
              <div class="colon-dot"></div>
            </div>
            <div class="dotmatrix-digit">
              <div
                v-for="(row, ri) in getDotPattern(minutesStr[0])"
                :key="'d2r' + ri"
                class="dot-row"
              >
                <div
                  v-for="(on, ci) in row"
                  :key="'d2c' + ci"
                  class="dot"
                  :class="{ active: on }"
                  :style="
                    on
                      ? {
                          background: triColorMinute,
                          boxShadow: `0 0 6px ${triColorMinute}`,
                        }
                      : {}
                  "
                ></div>
              </div>
            </div>
            <div class="dotmatrix-digit">
              <div
                v-for="(row, ri) in getDotPattern(minutesStr[1])"
                :key="'d3r' + ri"
                class="dot-row"
              >
                <div
                  v-for="(on, ci) in row"
                  :key="'d3c' + ci"
                  class="dot"
                  :class="{ active: on }"
                  :style="
                    on
                      ? {
                          background: triColorMinute,
                          boxShadow: `0 0 6px ${triColorMinute}`,
                        }
                      : {}
                  "
                ></div>
              </div>
            </div>
            <template v-if="showSeconds">
              <div class="dotmatrix-colon">
                <div class="colon-dot"></div>
                <div class="colon-dot"></div>
              </div>
              <div class="dotmatrix-digit">
                <div
                  v-for="(row, ri) in getDotPattern(secondsStr[0])"
                  :key="'d4r' + ri"
                  class="dot-row"
                >
                  <div
                    v-for="(on, ci) in row"
                    :key="'d4c' + ci"
                    class="dot"
                    :class="{ active: on }"
                    :style="
                      on
                        ? {
                            background: triColorSecond,
                            boxShadow: `0 0 6px ${triColorSecond}`,
                          }
                        : {}
                    "
                  ></div>
                </div>
              </div>
              <div class="dotmatrix-digit">
                <div
                  v-for="(row, ri) in getDotPattern(secondsStr[1])"
                  :key="'d5r' + ri"
                  class="dot-row"
                >
                  <div
                    v-for="(on, ci) in row"
                    :key="'d5c' + ci"
                    class="dot"
                    :class="{ active: on }"
                    :style="
                      on
                        ? {
                            background: triColorSecond,
                            boxShadow: `0 0 6px ${triColorSecond}`,
                          }
                        : {}
                    "
                  ></div>
                </div>
              </div>
            </template>
          </div>
        </div>
        <div v-if="showDate" class="dotmatrix-date">{{ formattedDate }}</div>
      </div>
    </template>

    <!-- ===== 軌道時鐘 (Orbit) ===== -->
    <template v-else-if="clockStyle === 'orbit'">
      <div class="orbit-clock" :style="textStyle">
        <!-- 純 SVG 軌道，天然跟容器縮放 -->
        <svg class="orbit-svg" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <!-- 軌道圓圈 -->
          <circle cx="100" cy="100" r="35" :stroke="triColorHour + '4d'" stroke-width="1.5" fill="none" stroke-dasharray="4 4" />
          <circle cx="100" cy="100" r="55" :stroke="triColorMinute + '4d'" stroke-width="1.5" fill="none" stroke-dasharray="4 4" />
          <circle v-if="showSeconds" cx="100" cy="100" r="75" :stroke="triColorSecond + '4d'" stroke-width="1.5" fill="none" stroke-dasharray="4 4" />
          <!-- 太陽 -->
          <circle cx="100" cy="100" r="8" fill="url(#sunGrad)" />
          <circle cx="100" cy="100" r="12" :fill="'rgba(251,191,36,0.25)'" />
          <defs>
            <radialGradient id="sunGrad">
              <stop offset="0%" stop-color="#fcd34d" />
              <stop offset="100%" stop-color="#f97316" />
            </radialGradient>
          </defs>
          <!-- 行星 -->
          <circle
            :cx="orbitHourPos.x" :cy="orbitHourPos.y" r="5"
            :fill="triColorHour"
          >
            <animate attributeName="opacity" values="0.8;1;0.8" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle
            :cx="orbitMinutePos.x" :cy="orbitMinutePos.y" r="4"
            :fill="triColorMinute"
          >
            <animate attributeName="opacity" values="0.8;1;0.8" dur="2s" begin="0.3s" repeatCount="indefinite" />
          </circle>
          <circle
            v-if="showSeconds"
            :cx="orbitSecondPos.x" :cy="orbitSecondPos.y" r="3"
            :fill="triColorSecond"
          >
            <animate attributeName="opacity" values="0.8;1;0.8" dur="1s" repeatCount="indefinite" />
          </circle>
        </svg>
        <div class="orbit-time">
          {{ hoursStr }}:{{ minutesStr
          }}<span v-if="showSeconds">:{{ secondsStr }}</span>
        </div>
        <div class="orbit-legend">
          <div class="legend-item">
            <div class="legend-dot" :style="{ background: triColorHour }"></div>
            <span>時</span>
          </div>
          <div class="legend-item">
            <div class="legend-dot" :style="{ background: triColorMinute }"></div>
            <span>分</span>
          </div>
          <div class="legend-item">
            <div class="legend-dot" :style="{ background: triColorSecond }"></div>
            <span>秒</span>
          </div>
        </div>
        <div v-if="showDate" class="orbit-date">{{ formattedDate }}</div>
      </div>
    </template>

    <!-- ===== 默認：極簡時鐘 ===== -->
    <template v-else>
      <div class="minimal-clock">
        <div class="time-display" :style="minimalClockColor ? { color: minimalClockColor } : textStyle">
          <span class="hours">{{ hoursStr }}</span>
          <span class="separator">:</span>
          <span class="minutes">{{ minutesStr }}</span>
          <span v-if="showSeconds" class="seconds">{{ secondsStr }}</span>
        </div>
        <div v-if="showDate" class="date-display" :style="minimalClockColor ? { color: minimalClockColor } : textStyle">
          {{ formattedDate }}
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.clock-widget {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: var(--radius-lg);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
  overflow: hidden;
  container-type: size;

  &.has-custom-bg {
    border: none;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12);
  }

  // 深色樣式（霓虹、二進制、點陣、軌道）
  &.style-neon,
  &.style-binary,
  &.style-dotmatrix,
  &.style-orbit,
  &.style-progress {
    background: rgba(15, 23, 42, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
}

/* ===== 極簡時鐘 (Minimal) ===== */
.minimal-clock {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;

  .time-display {
    display: flex;
    align-items: baseline;
    gap: 2px;

    .hours,
    .minutes {
      font-size: clamp(20px, 18cqw, 56px);
      font-weight: 300;
      letter-spacing: -0.05em;
      line-height: 1;
    }

    .separator {
      font-size: clamp(16px, 15cqw, 48px);
      font-weight: 300;
      opacity: 0.6;
      animation: blink 1s ease-in-out infinite;
    }

    .seconds {
      font-size: clamp(10px, 7cqw, 22px);
      font-weight: 400;
      opacity: 0.5;
      margin-left: 4px;
      align-self: flex-end;
      padding-bottom: 0.1em;
    }
  }

  .date-display {
    margin-top: 6px;
    font-size: clamp(9px, 5cqw, 14px);
    opacity: 0.7;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }
}

@keyframes blink {
  0%,
  50% {
    opacity: 1;
  }
  51%,
  100% {
    opacity: 0.3;
  }
}

/* ===== 數字時鐘 (Digital) ===== */
.digital-clock {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;

  .time-units {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .time-unit {
    display: flex;
    gap: 3px;
  }

  .digit-card {
    width: clamp(22px, 7cqw, 36px);
    height: clamp(32px, 10cqw, 50px);
    background: rgba(0, 0, 0, 0.1);
    backdrop-filter: blur(8px);
    border-radius: 8px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .digit {
    font-size: clamp(14px, 8cqw, 28px);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .separator-dots {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0 2px;

    .dot {
      width: 5px;
      height: 5px;
      background: rgba(0, 0, 0, 0.4);
      border-radius: 50%;
      animation: pulse 1s ease-in-out infinite;
    }
  }

  .digital-date {
    margin-top: 12px;
    font-size: clamp(9px, 4cqw, 14px);
    opacity: 0.7;
    letter-spacing: 1px;
  }
}

/* ===== 模擬時鐘 (Analog) ===== */
.analog-clock {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;

  .clock-face {
    position: relative;
    width: min(140px, 80%);
    height: min(140px, 80%);
    aspect-ratio: 1;
    border-radius: 50%;
    background: linear-gradient(
      135deg,
      rgba(0, 0, 0, 0.1) 0%,
      rgba(0, 0, 0, 0.05) 100%
    );
    backdrop-filter: blur(10px);
    border: 3px solid rgba(0, 0, 0, 0.2);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  }

  .hour-marker {
    position: absolute;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.5);

    &.quarter {
      width: 7px;
      height: 7px;
    }
  }

  .center-dot {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 10px;
    height: 10px;
    background: #374151;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    z-index: 20;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  .hand {
    position: absolute;
    top: 50%;
    left: 50%;
    transform-origin: left center;
    border-radius: 4px;
  }

  .hour-hand {
    width: 25%;
    height: 4px;
    background: #374151;
    transform: translate(0, -2px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .minute-hand {
    width: 35%;
    height: 3px;
    background: #6b7280;
    transform: translate(0, -1.5px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .second-hand {
    width: 38%;
    height: 1.5px;
    background: #f472b6;
    transform: translate(0, -0.75px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .analog-date {
    margin-top: 12px;
    font-size: clamp(9px, 4cqw, 14px);
    opacity: 0.7;
    letter-spacing: 1px;
  }
}

/* ===== 翻頁時鐘 (Flip) ===== */
.flip-clock {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;

  .flip-units {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .flip-unit {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .flip-digits {
    display: flex;
    gap: 3px;
  }

  .flip-card {
    position: relative;
    width: clamp(22px, 7cqw, 36px);
    height: clamp(32px, 10cqw, 52px);
    background: linear-gradient(180deg, #374151 0%, #1f2937 100%);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    border: 1px solid #4b5563;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .flip-digit {
    font-size: clamp(14px, 8cqw, 28px);
    font-weight: 500;
    color: white;
    font-variant-numeric: tabular-nums;
  }

  .flip-line {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 1px;
    background: rgba(0, 0, 0, 0.4);
    transform: translateY(-50%);
  }

  .flip-separator {
    font-size: clamp(14px, 8cqw, 28px);
    color: rgba(0, 0, 0, 0.4);
    padding-bottom: 20px;
  }

  .flip-label {
    font-size: clamp(8px, 2.5cqw, 11px);
    color: rgba(0, 0, 0, 0.5);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .flip-date {
    margin-top: 12px;
    font-size: clamp(9px, 4cqw, 14px);
    opacity: 0.6;
    letter-spacing: 1px;
  }
}

/* ===== 霓虹時鐘 (Neon) ===== */
.neon-clock {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;

  .neon-glow {
    position: absolute;
    width: 150px;
    height: 150px;
    border-radius: 50%;
    filter: blur(40px);
    animation: pulse 3s ease-in-out infinite;
  }

  .neon-time {
    position: relative;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .neon-digit {
    font-size: clamp(16px, 9cqw, 32px);
    font-variant-numeric: tabular-nums;
    letter-spacing: 2px;
    padding: 6px 10px;
    border-radius: 8px;
    border: 2px solid;
    background: rgba(0, 0, 0, 0.4);
  }

  .neon-separator {
    display: flex;
    flex-direction: column;
    gap: 6px;

    .neon-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #facc15;
      box-shadow: 0 0 15px rgba(250, 204, 21, 0.8);
      animation: pulse 1s ease-in-out infinite;
    }
  }

  .neon-label {
    margin-top: 12px;
    font-size: clamp(7px, 2cqw, 10px);
    letter-spacing: 3px;
    animation: pulse 2s ease-in-out infinite;
  }

  .neon-date {
    margin-top: 8px;
    font-size: clamp(9px, 4cqw, 14px);
    color: rgba(255, 255, 255, 0.7);
    letter-spacing: 1px;
  }
}

/* ===== 進度環時鐘 (Progress) ===== */
.progress-clock {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;

  .progress-rings {
    position: relative;
    width: min(160px, 70%);
    height: min(160px, 70%);
    aspect-ratio: 1;
  }

  .ring {
    position: absolute;
    inset: 0;
    transform: rotate(-90deg);

    &.minutes-ring {
      transform: rotate(-90deg) scale(0.75);
    }

    &.hours-ring {
      transform: rotate(-90deg) scale(0.5);
    }
  }

  .ring-bg {
    fill: none;
    stroke: rgba(255, 255, 255, 0.1);
    stroke-width: 8;
  }

  .ring-progress {
    fill: none;
    stroke-width: 8;
    stroke-linecap: round;
    transition: stroke-dashoffset 1s linear;

    &.no-transition {
      transition: none !important;
    }
  }

  .minutes-ring .ring-bg,
  .minutes-ring .ring-progress {
    stroke-width: 12;
  }

  .hours-ring .ring-bg,
  .hours-ring .ring-progress {
    stroke-width: 16;
  }

  .progress-center {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .progress-time {
    font-size: clamp(14px, 7cqw, 28px);
    color: white;
    font-variant-numeric: tabular-nums;
  }

  .progress-seconds {
    font-size: clamp(8px, 3cqw, 12px);
    color: rgba(255, 255, 255, 0.6);
    font-variant-numeric: tabular-nums;
    margin-top: 2px;
  }

  .progress-legend {
    display: flex;
    gap: 10px;
    margin-top: 8px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 4px;

    span {
      font-size: clamp(7px, 2cqw, 10px);
      color: rgba(255, 255, 255, 0.7);
    }
  }

  .legend-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .progress-date {
    margin-top: 6px;
    font-size: clamp(8px, 3cqw, 12px);
    color: rgba(255, 255, 255, 0.7);
    letter-spacing: 1px;
  }
}

/* ===== 二進制時鐘 (Binary) ===== */
.binary-clock {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;

  .binary-label {
    font-size: clamp(7px, 2cqw, 10px);
    text-transform: uppercase;
    letter-spacing: 2px;
    color: rgba(255, 255, 255, 0.5);
    margin-bottom: 10px;
  }

  .binary-columns {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .binary-separator {
    width: 1px;
    height: 60px;
    background: rgba(255, 255, 255, 0.2);
  }

  .binary-column {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .column-label {
    font-size: clamp(7px, 2cqw, 10px);
    color: rgba(255, 255, 255, 0.7);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .binary-grid {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .binary-row {
    display: flex;
    gap: 3px;
  }

  .binary-dot {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    transition: all 0.3s;
  }

  .column-value {
    font-size: clamp(10px, 4cqw, 14px);
    color: white;
    font-variant-numeric: tabular-nums;
  }

  .binary-date {
    margin-top: 10px;
    font-size: clamp(8px, 3cqw, 12px);
    color: rgba(255, 255, 255, 0.7);
    letter-spacing: 1px;
  }
}

/* ===== 點陣時鐘 (Dot Matrix) ===== */
.dotmatrix-clock {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;

  .dotmatrix-label {
    font-size: clamp(7px, 2cqw, 10px);
    text-transform: uppercase;
    letter-spacing: 2px;
    color: rgba(255, 255, 255, 0.5);
    margin-bottom: 10px;
  }

  .dotmatrix-display {
    background: rgba(0, 0, 0, 0.5);
    border-radius: 12px;
    padding: 12px 16px;
    border: 2px solid #374151;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }

  .dotmatrix-digits {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .dotmatrix-digit {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .dot-row {
    display: flex;
    gap: 2px;
  }

  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #1f2937;
    transition: all 0.2s;
  }

  .dotmatrix-colon {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 4px;

    .colon-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.7);
      box-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
    }
  }

  .dotmatrix-date {
    margin-top: 10px;
    font-size: clamp(8px, 3cqw, 12px);
    color: rgba(255, 255, 255, 0.7);
    letter-spacing: 1px;
  }
}

/* ===== 軌道時鐘 (Orbit) ===== */
.orbit-clock {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;

  .orbit-svg {
    width: min(100%, 100cqh);
    flex: 1;
    min-height: 0;
    overflow: visible;
  }

  .orbit-time {
    margin-top: 4px;
    font-size: clamp(12px, 6cqw, 24px);
    color: white;
    font-variant-numeric: tabular-nums;
  }

  .orbit-legend {
    display: flex;
    gap: 12px;
    margin-top: 4px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 4px;

    span {
      font-size: clamp(7px, 2cqw, 10px);
      color: rgba(255, 255, 255, 0.7);
    }
  }

  .legend-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .orbit-date {
    margin-top: 4px;
    font-size: clamp(8px, 3cqw, 12px);
    color: rgba(255, 255, 255, 0.7);
    letter-spacing: 1px;
  }
}

/* ===== 通用動畫 ===== */
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* 自定義文字顏色覆蓋：當用戶設定了前景色時，所有子元素繼承該顏色 */
.clock-widget.has-custom-color {
  .flip-digit,
  .flip-separator,
  .flip-label,
  .flip-date,
  .digit,
  .separator-dots .dot,
  .digital-date,
  .analog-date,
  .neon-date,
  .neon-label,
  .progress-time,
  .progress-seconds,
  .progress-date,
  .progress-legend span,
  .binary-label,
  .column-label,
  .column-value,
  .binary-date,
  .dotmatrix-label,
  .dotmatrix-date,
  .orbit-time,
  .orbit-date,
  .orbit-legend span {
    color: inherit;
  }

  .separator-dots .dot {
    background: currentColor;
  }
}
</style>
