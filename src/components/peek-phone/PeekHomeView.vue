<script setup lang="ts">
/**
 * 角色手機的主畫面：週曆＋心情句、時間、照片與時鐘小工具、行事曆、App 和 Dock
 * 小工具都用既有資料（日記、相簿、行程），不會另外呼叫 AI
 */
import type { PeekGalleryItem, PeekPhoneTab } from "@/types/peekPhone";
import { Camera } from "lucide-vue-next";
import { computed } from "vue";
import PeekAppIcon from "./PeekAppIcon.vue";
import PeekWallpaper from "./PeekWallpaper.vue";
import { formatClock, photoTone, type HomeApp } from "./peekPhoneView";

const props = defineProps<{
  avatar?: string;
  now: Date;
  moodLine: string;
  photo: PeekGalleryItem | null;
  gridApps: HomeApp[];
  dockApps: HomeApp[];
}>();

const emit = defineEmits<{ open: [tab: PeekPhoneTab] }>();

const WEEK = ["一", "二", "三", "四", "五", "六", "日"];
// 星期一排第一個
const todayIndex = computed(() => (props.now.getDay() + 6) % 7);

const dateLabel = computed(() => {
  const d = props.now;
  return {
    year: String(d.getFullYear()),
    day: `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`,
  };
});

const monthLabel = computed(
  () => ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"][props.now.getMonth()] + "月",
);

const calendarCells = computed(() => {
  const d = props.now;
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const cells: { key: string; text: string; today: boolean; weekend: boolean }[] = [];
  for (let i = 0; i < offset; i++) cells.push({ key: `b${i}`, text: "", today: false, weekend: false });
  for (let day = 1; day <= days; day++) {
    const col = (offset + day - 1) % 7;
    cells.push({ key: `d${day}`, text: String(day), today: day === d.getDate(), weekend: col >= 5 });
  }
  return cells;
});

// 指針角度
const hourAngle = computed(() => (props.now.getHours() % 12) * 30 + props.now.getMinutes() * 0.5);
const minuteAngle = computed(() => props.now.getMinutes() * 6);
// 秒針用 CSS 轉，只在掛載時對齊一次，之後不用每秒重繪
const secondDelay = `-${new Date().getSeconds()}s`;
</script>

<template>
  <div class="peek-home">
    <PeekWallpaper :avatar="props.avatar" />

    <div class="peek-home-body">
      <div class="peek-home-scroll">
        <div class="peek-home-inner">
          <div class="peek-home-top">
            <div>
              <div class="peek-home-week" aria-hidden="true">
                <span
                  v-for="(w, i) in WEEK"
                  :key="w"
                  class="peek-home-weekday"
                  :class="{ 'is-today': i === todayIndex }"
                >周<br />{{ w }}</span>
              </div>
              <div v-if="props.moodLine" class="peek-home-mood">{{ props.moodLine }}</div>
            </div>
            <div class="peek-home-date">{{ dateLabel.year }}<br />{{ dateLabel.day }}</div>
          </div>

          <div class="peek-home-time">{{ formatClock(props.now) }}</div>

          <div class="peek-home-grid">
            <button type="button" class="peek-widget" aria-label="相簿" @click="emit('open', 'gallery')">
              <span
                class="peek-widget-tile peek-photo"
                :style="props.photo ? { background: photoTone(props.photo.description) } : undefined"
              >
                <img v-if="!props.photo && props.avatar" class="peek-photo-img" :src="props.avatar" alt="" />
                <Camera v-else-if="!props.photo" :size="28" class="peek-photo-empty" aria-hidden="true" />
                <span v-if="props.photo" class="peek-photo-caption">
                  <span class="peek-photo-caption-text">{{ props.photo.description }}</span>
                </span>
              </span>
              <span class="peek-widget-label">相簿</span>
            </button>

            <div class="peek-widget" role="img" :aria-label="`時鐘 ${formatClock(props.now)}`">
              <svg class="peek-clock" viewBox="0 0 150 150" aria-hidden="true">
                <g stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
                  <line
                    v-for="i in 12"
                    :key="i"
                    x1="75"
                    y1="4"
                    x2="75"
                    y2="10"
                    :transform="`rotate(${i * 30} 75 75)`"
                  />
                </g>
                <g fill="currentColor" font-size="11" text-anchor="middle" class="peek-clock-nums">
                  <text x="75" y="25">12</text><text x="104" y="33">1</text><text x="122" y="52">2</text>
                  <text x="129" y="79">3</text><text x="122" y="106">4</text><text x="104" y="125">5</text>
                  <text x="75" y="133">6</text><text x="46" y="125">7</text><text x="28" y="106">8</text>
                  <text x="21" y="79">9</text><text x="28" y="52">10</text><text x="46" y="33">11</text>
                </g>
                <line x1="75" y1="75" x2="75" y2="46" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" :transform="`rotate(${hourAngle} 75 75)`" />
                <line x1="75" y1="75" x2="75" y2="26" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" :transform="`rotate(${minuteAngle} 75 75)`" />
                <g class="peek-clock-second" :style="{ animationDelay: secondDelay }">
                  <line x1="75" y1="84" x2="75" y2="22" stroke="#FF8A4C" stroke-width="1" stroke-linecap="round" />
                </g>
                <circle cx="75" cy="75" r="3" fill="currentColor" />
              </svg>
              <span class="peek-widget-label">時鐘</span>
            </div>

            <button type="button" class="peek-widget peek-cal" aria-label="行事曆" @click="emit('open', 'schedule')">
              <span class="peek-cal-month">{{ monthLabel }}</span>
              <span class="peek-cal-grid" aria-hidden="true">
                <span v-for="(w, i) in WEEK" :key="w" class="peek-cal-cell" :class="{ 'is-weekend': i >= 5 }">{{ w }}</span>
                <span
                  v-for="c in calendarCells"
                  :key="c.key"
                  class="peek-cal-cell"
                  :class="{ 'is-weekend': c.weekend, 'is-today': c.today }"
                ><span>{{ c.text }}</span></span>
              </span>
              <span class="peek-widget-label">行事曆</span>
            </button>

            <div class="peek-home-apps">
              <PeekAppIcon
                v-for="app in props.gridApps"
                :key="app.key"
                :app="app"
                show-label
                @open="emit('open', app.key)"
              />
            </div>
          </div>
        </div>
      </div>

      <nav class="peek-home-dock" aria-label="Dock">
        <PeekAppIcon
          v-for="app in props.dockApps"
          :key="app.key"
          :app="app"
          @open="emit('open', app.key)"
        />
      </nav>
    </div>
  </div>
</template>

<style scoped lang="scss">
.peek-home {
  position: absolute;
  inset: 0;
  color: var(--p-on-wall);
  overflow: hidden;
}

.peek-home-body {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  padding: calc(var(--safe-top, 0px) + 64px) 0 calc(var(--safe-bottom, 0px) + 16px);
  box-sizing: border-box;
}

.peek-home-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 22px 8px;
}

.peek-home-inner {
  max-width: 346px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.peek-home-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.peek-home-week {
  display: flex;
  gap: 5px;
}

.peek-home-weekday {
  width: 22px;
  padding: 3px 0;
  border-radius: 6px;
  font-size: 10px;
  line-height: 1.3;
  text-align: center;

  &.is-today {
    background: #ffffff;
    color: var(--p-app-glyph);
    font-weight: 700;
  }
}

.peek-home-mood {
  margin-top: 6px;
  font-size: 12px;
  color: var(--p-on-wall-2);
}

.peek-home-date {
  text-align: right;
  font-family: var(--p-num);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.35;
}

.peek-home-time {
  font-family: var(--p-num);
  font-size: 40px;
  font-weight: 500;
  letter-spacing: 0.02em;
  line-height: 1.1;
}

.peek-home-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 150px));
  justify-content: space-between;
  align-items: start;
  row-gap: 24px;
  margin-top: 6px;
}

.peek-widget {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font-family: inherit;
  cursor: pointer;

  &[role="img"] {
    cursor: default;
  }
}

.peek-widget-tile {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 26px;
  overflow: hidden;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.25);
}

.peek-widget-label {
  font-size: 12px;
}

.peek-photo {
  background: rgba(255, 255, 255, 0.16);
  display: flex;
  align-items: center;
  justify-content: center;
}

.peek-photo-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.peek-photo-empty {
  color: rgba(255, 255, 255, 0.7);
}

.peek-photo-caption {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 24px 14px 12px;
  background: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.45));
}

/* 行數限制放在沒有 padding 的內層：iOS Safari 會把第四行畫進 padding 裡 */
.peek-photo-caption-text {
  font-size: 12px;
  line-height: 1.4;
  max-height: 4.2em;
  text-align: left;
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.peek-clock {
  width: 100%;
  aspect-ratio: 1;
  color: #ffffff;
}

.peek-clock-nums {
  font-family: var(--p-num);
}

.peek-clock-second {
  transform-origin: 75px 75px;
  animation: peek-clock-tick 60s steps(60) infinite;
}

.peek-cal {
  align-items: stretch;
  gap: 8px;
}

.peek-cal-month {
  font-size: 13px;
  font-weight: 700;
  text-align: left;
}

.peek-cal-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  row-gap: 4px;
  text-align: center;
  font-family: var(--p-num);
  font-size: 10px;
}

.peek-cal-cell {
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;

  span {
    width: 18px;
    height: 18px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &.is-weekend {
    color: #c9c9ce;
  }

  &.is-today span {
    background: #ffffff;
    color: var(--p-app-glyph);
    font-weight: 700;
  }
}

.peek-home-apps {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  justify-items: center;
  row-gap: 16px;
  padding-top: 6px;
}

.peek-home-dock {
  flex-shrink: 0;
  align-self: center;
  width: calc(100% - 32px);
  max-width: 400px;
  height: 86px;
  margin-top: 12px;
  border-radius: 32px;
  background: rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  display: flex;
  justify-content: space-around;
  align-items: center;
}

// 矮螢幕（iPhone SE 之類）：縮一點，讓第一屏放得下
@media (max-height: 700px) {
  .peek-home-body {
    padding-top: calc(var(--safe-top, 0px) + 56px);
  }

  .peek-home-inner {
    gap: 8px;
  }

  .peek-home-time {
    font-size: 34px;
  }

  .peek-home-grid {
    grid-template-columns: repeat(2, minmax(0, 128px));
    row-gap: 16px;
  }

  .peek-home-dock {
    height: 76px;
  }
}

@keyframes peek-clock-tick {
  to {
    transform: rotate(360deg);
  }
}
</style>
