<script setup lang="ts">
import type { WidgetCustomStyle } from "@/types";
import { getHolidaysForYear } from "@/utils/holidayDetector";
import { ChevronLeft, ChevronRight } from "lucide-vue-next";
import { computed, ref } from "vue";

const props = defineProps<{
  data?: {
    customStyle?: WidgetCustomStyle;
    calendarColors?: {
      today?: string;
      holiday?: string;
      weekday?: string;
    };
  };
}>();

const emit = defineEmits<{
  navigate: [page: string];
}>();

// 點擊日曆標題進入日曆 App
function openCalendarApp() {
  emit("navigate", "calendar");
}

// 當前顯示的月份
const currentDate = ref(new Date());
const today = new Date();

// 月份名稱
const monthNames = [
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
];
const weekDays = ["日", "一", "二", "三", "四", "五", "六"];

// 計算當月信息
const year = computed(() => currentDate.value.getFullYear());
const month = computed(() => currentDate.value.getMonth());
const monthName = computed(() => monthNames[month.value]);

// 計算當月的日期網格
const calendarDays = computed(() => {
  const firstDay = new Date(year.value, month.value, 1);
  const lastDay = new Date(year.value, month.value + 1, 0);
  const startPadding = firstDay.getDay();
  const totalDays = lastDay.getDate();

  // 取得當年節日（MM-DD 格式）
  const yearHolidays = getHolidaysForYear(year.value);
  const holidayDateSet = new Set(yearHolidays.map((h) => h.date));

  const days: Array<{
    day: number;
    isCurrentMonth: boolean;
    isToday: boolean;
    isHoliday: boolean;
  }> = [];

  // 上個月的填充
  const prevMonthLastDay = new Date(year.value, month.value, 0).getDate();
  for (let i = startPadding - 1; i >= 0; i--) {
    days.push({
      day: prevMonthLastDay - i,
      isCurrentMonth: false,
      isToday: false,
      isHoliday: false,
    });
  }

  // 當月的日期
  for (let i = 1; i <= totalDays; i++) {
    const isToday =
      i === today.getDate() &&
      month.value === today.getMonth() &&
      year.value === today.getFullYear();
    const mm = String(month.value + 1).padStart(2, "0");
    const dd = String(i).padStart(2, "0");
    days.push({
      day: i,
      isCurrentMonth: true,
      isToday,
      isHoliday: holidayDateSet.has(`${mm}-${dd}`),
    });
  }

  // 下個月的填充（補足 6 行）
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push({
      day: i,
      isCurrentMonth: false,
      isToday: false,
      isHoliday: false,
    });
  }

  return days;
});

// 切換月份
function prevMonth() {
  currentDate.value = new Date(year.value, month.value - 1, 1);
}

function nextMonth() {
  currentDate.value = new Date(year.value, month.value + 1, 1);
}

function goToToday() {
  currentDate.value = new Date();
}

// 自定義樣式計算
const containerStyle = computed(() => {
  const style: Record<string, string> = {};
  const customStyle = props.data?.customStyle;

  if (customStyle?.backgroundGradient) {
    style.background = customStyle.backgroundGradient;
  } else if (customStyle?.backgroundColor) {
    style.backgroundColor = customStyle.backgroundColor;
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
  }

  return style;
});

const hasCustomBackground = computed(() => {
  return !!(
    props.data?.customStyle?.backgroundColor ||
    props.data?.customStyle?.backgroundGradient
  );
});

// 日期顏色設定
const todayColor = computed(() => props.data?.calendarColors?.today || "");
const holidayColor = computed(() => props.data?.calendarColors?.holiday || "");
const weekdayColor = computed(() => props.data?.calendarColors?.weekday || "");

const currentLayout = computed(() => {
  return props.data?.customStyle?.layout || "pop";
});
</script>

<template>
  <div
    class="calendar-widget"
    :class="[currentLayout, { 'has-custom-bg': hasCustomBackground }]"
    :style="containerStyle"
  >
    <!-- 月份導航 -->
    <div class="calendar-header" :style="textStyle">
      <button class="nav-btn" @click="prevMonth">
        <ChevronLeft :size="18" :stroke-width="2" />
      </button>
      <span class="month-year" @click="openCalendarApp">
        {{ year }}年 {{ monthName }}
      </span>
      <button class="nav-btn" @click="nextMonth">
        <ChevronRight :size="18" :stroke-width="2" />
      </button>
    </div>

    <!-- 星期標題 -->
    <div class="weekdays">
      <span v-for="day in weekDays" :key="day" class="weekday">{{ day }}</span>
    </div>

    <!-- 日期網格 -->
    <div class="days-grid">
      <span
        v-for="(day, index) in calendarDays"
        :key="index"
        class="day"
        :class="{
          'other-month': !day.isCurrentMonth,
          today: day.isToday,
          holiday: day.isHoliday && day.isCurrentMonth,
        }"
        :style="
          day.isToday && todayColor
            ? { background: todayColor, color: '#fff' }
            : day.isHoliday && day.isCurrentMonth && holidayColor
              ? { color: holidayColor }
              : day.isCurrentMonth && weekdayColor
                ? { color: weekdayColor }
                : {}
        "
      >
        {{ day.day }}
      </span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.calendar-widget {
  width: 100%;
  height: 100%;
  padding: 12px;
  display: flex;
  flex-direction: column;
  container-type: size;
  overflow: hidden;

  // Classic 傳統樣式
  &.classic {
    background: rgba(255, 255, 255, 0.75);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-radius: var(--radius-lg, 16px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);

    .calendar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
      flex-shrink: 0;

      .nav-btn {
        width: 28px;
        height: 28px;
        min-width: 28px;
        border-radius: 8px;
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #4b5563;
        background: transparent;
        transition: background-color 0.2s;
        flex-shrink: 0;

        &:hover {
          background: rgba(0, 0, 0, 0.05);
        }
      }

      .month-year {
        font-size: 14px;
        font-weight: 600;
        color: #1f2937;
        cursor: pointer;
        white-space: nowrap;
        padding: 4px 8px;
        border-radius: 6px;
        transition: background-color 0.2s;

        &:hover {
          background: rgba(0, 0, 0, 0.05);
        }
      }
    }

    .weekdays {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 2px;
      margin-bottom: 8px;
      flex-shrink: 0;

      .weekday {
        text-align: center;
        font-size: 12px;
        font-weight: 500;
        color: #6b7280;
      }
    }

    .days-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 2px;
      flex: 1;
      min-height: 0;

      .day {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        color: #374151;
        border-radius: 8px;
        aspect-ratio: 1;
        transition: background-color 0.2s;
        cursor: default;

        &.other-month {
          color: rgba(55, 65, 81, 0.3);
        }

        &.today {
          background: #6366f1;
          color: white;
          font-weight: 600;
        }

        &.holiday:not(.today) {
          color: #f59e0b;
          font-weight: 500;
        }

        &:not(.other-month):not(.today):hover {
          background: rgba(0, 0, 0, 0.05);
        }
      }
    }
  }

  // Pop普普風/新粗野派樣式
  &.pop {
    background: white;
    border: 3px solid #1a1a1a;
    border-radius: 16px;
    box-shadow: 4px 4px 0px #1a1a1a;
    transition: transform 0.2s ease, box-shadow 0.2s ease;

    &:hover {
      transform: translate(-1px, -1px);
      box-shadow: 5px 5px 0px #1a1a1a;
    }

    &.has-custom-bg {
      box-shadow: 4px 4px 0px rgba(0, 0, 0, 0.8);
    }

    .calendar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
      flex-shrink: 0;

      .nav-btn {
        width: 32px;
        height: 32px;
        min-width: 32px;
        border-radius: 8px;
        border: 2px solid transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #1a1a1a;
        background: transparent;
        transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        flex-shrink: 0;

        &:hover {
          background: #fdfaf6;
          border: 2px solid #1a1a1a;
          box-shadow: 2px 2px 0px #1a1a1a;
          transform: translate(-1px, -1px);
        }
        
        &:active {
          transform: scale(0.95);
          box-shadow: 0px 0px 0px #1a1a1a;
        }
      }

      .month-year {
        font-size: 15px;
        font-weight: 900;
        color: #1a1a1a;
        cursor: pointer;
        white-space: nowrap;
        padding: 4px 12px;
        border-radius: 12px;
        transition: all 0.2s;

        &:hover {
          background: #e0e7ff;
          border: 2px solid #1a1a1a;
          box-shadow: 2px 2px 0px #1a1a1a;
          transform: translate(-1px, -1px);
        }
      }
    }

    .weekdays {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 2px;
      margin-bottom: 6px;
      flex-shrink: 0;

      .weekday {
        text-align: center;
        font-size: 11px;
        font-weight: 800;
        color: rgba(26,26,26,0.6);
        text-transform: uppercase;
      }
    }

    .days-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 4px;
      flex: 1;
      min-height: 0;
      padding: 4px;

      .day {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 700;
        color: #1a1a1a;
        border-radius: 8px;
        border: 2px solid transparent;
        aspect-ratio: 1;
        transition: all 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
        cursor: default;

        &.other-month {
          color: rgba(26,26,26,0.3);
          font-weight: 600;
        }

        &.today {
          background: #c4b5fd;
          color: #1a1a1a;
          font-weight: 900;
          border: 2px solid #1a1a1a;
          box-shadow: 2px 2px 0px #1a1a1a;
        }

        &.holiday:not(.today) {
          color: #ef4444;
          font-weight: 900;
          position: relative;
          &::after {
            content: "";
            position: absolute;
            bottom: 2px;
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background: #ef4444;
          }
        }

        &:not(.other-month):not(.today):hover {
          background: #fdfaf6;
          border: 2px solid #1a1a1a;
          box-shadow: 2px 2px 0px #1a1a1a;
          transform: translate(-1px, -1px);
        }
      }
    }
  }

  // 平面風
  &.flat {
    background: #FFF0F5;
    border: 3px solid #332650;
    border-radius: 32px;
    box-shadow: 0 6px 0px #332650;
    
    .calendar-header {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-shrink: 0;
      .nav-btn {
        width: 36px; height: 36px; min-width: 36px; border-radius: 50%; border: 3px solid #332650; display: flex; align-items: center; justify-content: center; color: #332650; background: white; transition: transform 0.2s; flex-shrink: 0;
        &:hover { transform: scale(1.1); }
      }
      .month-year { font-size: 16px; font-weight: 800; color: #332650; cursor: pointer; white-space: nowrap; padding: 4px 16px; border-radius: 9999px; border: 3px solid #332650; background: #FCD24B; transition: transform 0.2s; &:hover { transform: scale(1.05); } }
    }

    .weekdays {
      display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; margin-bottom: 8px; flex-shrink: 0;
      .weekday { text-align: center; font-size: 12px; font-weight: 800; color: rgba(51,38,80,0.6); text-transform: uppercase; }
    }

    .days-grid {
      display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; flex: 1; min-height: 0;
      .day {
        display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; color: #332650; border-radius: 50%; border: 3px solid transparent; aspect-ratio: 1; transition: transform 0.2s; cursor: default;
        &.other-month { color: rgba(51,38,80,0.3); font-weight: 600; }
        &.today { background: #332650; color: white; border: 3px solid #332650; }
        &.holiday:not(.today) { color: #f43f5e; }
        &:not(.other-month):not(.today):hover { border: 3px solid #332650; transform: scale(1.1); }
      }
    }
  }

  // 插圖風
  &.illustration {
    background: #F6F3EB;
    border: 2px solid #1a1a1a;
    border-radius: 6px;
    box-shadow: 4px 4px 0px #1a1a1a;
    padding-top: 34px !important;
    position: relative;

    &::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 22px; border-bottom: 2px solid #1a1a1a;
      background: #F6F3EB; background-image: repeating-linear-gradient(to bottom, transparent, transparent 2px, #1a1a1a 2px, #1a1a1a 3px); background-size: 100% 12px; background-position: center 5px; background-repeat: no-repeat;
    }
    &::after {
      content: ''; position: absolute; top: 5px; left: 8px; width: 12px; height: 12px; border: 2px solid #1a1a1a; background: white; box-shadow: inset 1px 1px 0 rgba(0,0,0,0.1);
    }

    .calendar-header {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-shrink: 0;
      .nav-btn {
        width: 28px; height: 28px; min-width: 28px; border-radius: 4px; border: 2px solid #1a1a1a; display: flex; align-items: center; justify-content: center; color: #1a1a1a; background: white; transition: all 0.1s; box-shadow: 2px 2px 0px #1a1a1a;
        &:active { transform: translate(2px, 2px); box-shadow: 0px 0px 0px #1a1a1a; }
      }
      .month-year { font-size: 14px; font-weight: bold; color: #1a1a1a; cursor: pointer; white-space: nowrap; padding: 4px 12px; border: 2px solid #1a1a1a; background: white; }
    }

    .weekdays {
      display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; margin-bottom: 6px; flex-shrink: 0;
      .weekday { text-align: center; font-size: 12px; font-weight: bold; color: #1a1a1a; text-transform: uppercase; }
    }

    .days-grid {
      display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; flex: 1; min-height: 0; border: 2px solid #1a1a1a; padding: 4px; background: white;
      .day {
        display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: #1a1a1a; background: transparent; transition: all 0.1s; cursor: default;
        &.other-month { color: rgba(26,26,26,0.2); }
        &.today { background: #1a1a1a; color: white; }
        &.holiday:not(.today) { color: #f43f5e; font-weight: bold; }
        &:not(.other-month):not(.today):hover { background: #B0D0DB; border: 2px solid #1a1a1a; }
      }
    }
  }

  // 像素風
  &.pixel {
    background: #FFF1F5;
    background-image: linear-gradient(#F8C6DB 1px, transparent 1px), linear-gradient(90deg, #F8C6DB 1px, transparent 1px);
    background-size: 16px 16px;
    border: 4px solid #F4A2C5;
    border-radius: 8px;
    box-shadow: 4px 4px 0px #F5C6DA;
    padding-top: 34px !important;
    font-family: 'DotGothic16', 'Press Start 2P', monospace, sans-serif;
    position: relative;

    &::before {
      content: 'CALENDAR.EXE'; position: absolute; top: -4px; right: -4px; left: -4px; height: 26px; background: #F4A2C5; color: white; font-size: 13px; line-height: 26px; padding-left: 8px; font-weight: bold; border: 4px solid #F4A2C5;
    }

    .calendar-header {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-shrink: 0;
      .nav-btn {
        width: 28px; height: 28px; min-width: 28px; border: 2px solid #EAA3C5; display: flex; align-items: center; justify-content: center; color: #d06d9a; background: white; transition: all 0.1s; box-shadow: 2px 2px 0px #F5C6DA;
        &:active { transform: translate(2px, 2px); box-shadow: none; }
      }
      .month-year { font-size: 14px; font-weight: bold; color: #d06d9a; cursor: pointer; white-space: nowrap; padding: 4px 8px; border: 2px dashed #EAA3C5; background: white; }
    }

    .weekdays {
      display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; margin-bottom: 6px; flex-shrink: 0;
      .weekday { text-align: center; font-size: 12px; font-weight: bold; color: #d06d9a; text-transform: uppercase; }
    }

    .days-grid {
      display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; flex: 1; min-height: 0; background: white; border: 2px solid #EAA3C5; padding: 4px; box-shadow: inset 2px 2px 0 rgba(0,0,0,0.05);
      .day {
        display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; color: #d06d9a; transition: all 0.1s; cursor: default;
        &.other-month { opacity: 0; }
        &.today { background: #93E2B6; color: white; }
        &.holiday:not(.today) { color: #f43f5e; position: relative; }
        &:not(.other-month):not(.today):hover { background: #F8C6DB; color: white; }
      }
    }
  }
}

// 小尺寸響應式調整
@container (max-height: 200px) {
  .calendar-header {
    margin-bottom: 6px;

    .nav-btn {
      width: 22px;
      height: 22px;
      min-width: 22px;

      svg {
        width: 14px;
        height: 14px;
      }
    }

    .month-year {
      font-size: 12px;
    }
  }

  .weekdays {
    margin-bottom: 4px;

    .weekday {
      font-size: 8px;
    }
  }

  .days-grid .day {
    font-size: 9px;

    &.holiday:not(.today)::after {
      width: 3px;
      height: 3px;
      bottom: 1px;
    }
  }
}

@container (max-width: 160px) {
  .calendar-header {
    .nav-btn {
      width: 20px;
      height: 20px;
      min-width: 20px;

      svg {
        width: 12px;
        height: 12px;
      }
    }

    .month-year {
      font-size: 11px;
    }
  }

  .weekdays .weekday {
    font-size: 7px;
  }

  .days-grid .day {
    font-size: 8px;
  }
}

// 極小尺寸：隱藏非當月日期的數字，只顯示當月
@container (max-height: 150px) {
  .calendar-widget {
    padding: 8px;
  }

  .calendar-header {
    margin-bottom: 4px;
  }

  .weekdays {
    display: none;
  }

  .days-grid {
    gap: 1px;

    .day {
      font-size: 8px;

      &.other-month {
        visibility: hidden;
      }
    }
  }
}

// 超小尺寸：只顯示月份和今天日期
@container (max-height: 100px) {
  .calendar-header {
    .nav-btn {
      display: none;
    }
  }

  .days-grid {
    display: none;
  }

  .calendar-widget {
    justify-content: center;
    align-items: center;

    .calendar-header {
      margin-bottom: 0;
      justify-content: center;
    }
  }
}
</style>
