<script setup lang="ts">
import { db, DB_STORES } from "@/db/database";
import type { CalendarEvent } from "@/types/calendar";
import type { Holiday } from "@/types/holiday";
import {
    detectTodayHoliday,
    detectUpcomingHolidays,
    getHolidaysForYear,
    getLunarDateString,
} from "@/utils/holidayDetector";
import {
    ArrowLeft,
    CalendarCheck,
    ChevronLeft,
    ChevronRight,
    Plus,
    Star,
    Trash2,
    X,
} from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";

const emit = defineEmits<{ back: [] }>();

// 狀態
const currentDate = ref(new Date());
const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
const todayHoliday = ref<Holiday | null>(null);
const upcomingHolidays = ref<Holiday[]>([]);
const lunarDate = ref<string | null>(null);
const events = ref<CalendarEvent[]>([]);
const showAddModal = ref(false);
const newEvent = ref({
  title: "",
  date: "",
  description: "",
  type: "user" as "user" | "period",
});

// 月份顯示
const currentMonthDisplay = computed(() => {
  const y = currentDate.value.getFullYear();
  const m = currentDate.value.getMonth() + 1;
  return `${y}年 ${m}月`;
});

// 節日 Map
const holidayMap = computed(() => {
  const year = currentDate.value.getFullYear();
  const map = new Map<string, Holiday>();
  for (const h of getHolidaysForYear(year)) map.set(h.date, h);
  return map;
});

// 事件 Map（by date YYYY-MM-DD -> events）
const eventsByDate = computed(() => {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events.value) {
    const list = map.get(e.date) || [];
    list.push(e);
    map.set(e.date, list);
  }
  return map;
});

interface DayInfo {
  date: number;
  fullDateStr: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  holiday: Holiday | null;
  events: CalendarEvent[];
}

const calendarDays = computed(() => {
  const year = currentDate.value.getFullYear();
  const month = currentDate.value.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPadding = firstDay.getDay();
  const today = new Date();
  const days: DayInfo[] = [];

  const prevLast = new Date(year, month, 0).getDate();
  for (let i = startPadding - 1; i >= 0; i--) {
    const d = prevLast - i;
    const pm = month === 0 ? 12 : month;
    const py = month === 0 ? year - 1 : year;
    const ds = `${py}-${String(pm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    days.push({
      date: d,
      fullDateStr: ds,
      isCurrentMonth: false,
      isToday: false,
      holiday: null,
      events: [],
    });
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    const ds = `${year}-${mm}-${dd}`;
    const isToday =
      d === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear();
    days.push({
      date: d,
      fullDateStr: ds,
      isCurrentMonth: true,
      isToday,
      holiday: holidayMap.value.get(`${mm}-${dd}`) || null,
      events: eventsByDate.value.get(ds) || [],
    });
  }

  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push({
      date: i,
      fullDateStr: "",
      isCurrentMonth: false,
      isToday: false,
      holiday: null,
      events: [],
    });
  }
  return days;
});

// 當月節日
const monthHolidays = computed(() => {
  const mm = String(currentDate.value.getMonth() + 1).padStart(2, "0");
  const result: Holiday[] = [];
  for (const [dateStr, h] of holidayMap.value) {
    if (dateStr.startsWith(mm + "-")) result.push(h);
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
});

// 即將到來的事件
const upcomingEvents = computed(() => {
  const todayStr = formatDateStr(new Date());
  return events.value
    .filter((e) => e.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10);
});

function previousMonth() {
  const y = currentDate.value.getFullYear();
  const m = currentDate.value.getMonth();
  currentDate.value = new Date(y, m - 1, 1);
}

function nextMonth() {
  const y = currentDate.value.getFullYear();
  const m = currentDate.value.getMonth();
  currentDate.value = new Date(y, m + 1, 1);
}

function formatDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateDisplay(dateStr: string) {
  const [, mm, dd] = dateStr.split("-");
  return `${parseInt(mm)}月${parseInt(dd)}日`;
}

function formatHolidayDate(dateStr: string) {
  const [mm, dd] = dateStr.split("-");
  return `${parseInt(mm)}月${parseInt(dd)}日`;
}

function selectDay(day: DayInfo) {
  if (!day.isCurrentMonth) return;
  newEvent.value.date = day.fullDateStr;
  showAddModal.value = true;
}

function getEventColor(type: string) {
  return type === "period" ? "#ec4899" : "#3b82f6";
}

// DB 操作
async function loadEvents() {
  try {
    const all = await db.getAll<CalendarEvent>(DB_STORES.CALENDAR_EVENTS);
    events.value = all;
  } catch (e) {
    console.error("[Calendar] 載入事件失敗:", e);
    events.value = [];
  }
}

async function addEvent() {
  if (!newEvent.value.title.trim() || !newEvent.value.date) return;
  const event: CalendarEvent = {
    id: `cal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: newEvent.value.type,
    title: newEvent.value.title.trim(),
    date: newEvent.value.date,
    description: newEvent.value.description.trim() || undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  try {
    await db.put(DB_STORES.CALENDAR_EVENTS, JSON.parse(JSON.stringify(event)));
    events.value.push(event);
    newEvent.value = { title: "", date: "", description: "", type: "user" };
    showAddModal.value = false;
  } catch (e) {
    console.error("[Calendar] 儲存事件失敗:", e);
  }
}

async function deleteEvent(id: string) {
  try {
    await db.delete(DB_STORES.CALENDAR_EVENTS, id);
    events.value = events.value.filter((e) => e.id !== id);
  } catch (e) {
    console.error("[Calendar] 刪除事件失敗:", e);
  }
}

onMounted(async () => {
  todayHoliday.value = detectTodayHoliday();
  upcomingHolidays.value = detectUpcomingHolidays(7);
  lunarDate.value = getLunarDateString(new Date());
  await loadEvents();
});
</script>

<template>
  <div class="calendar-screen">
    <!-- 標題欄 -->
    <div class="header">
      <button class="icon-btn" @click="emit('back')">
        <ArrowLeft :size="22" />
      </button>
      <div class="header-title">
        <h1>行事曆</h1>
        <span v-if="lunarDate" class="lunar-date">農曆{{ lunarDate }}</span>
      </div>
      <button
        class="icon-btn"
        @click="
          newEvent.date = formatDateStr(new Date());
          showAddModal = true;
        "
      >
        <Plus :size="22" />
      </button>
    </div>

    <div class="content-wrapper">
      <!-- 日曆 -->
      <div class="calendar-side">
        <div class="month-selector">
          <button class="month-nav-btn" @click="previousMonth">
            <ChevronLeft :size="20" />
          </button>
          <div class="current-month">{{ currentMonthDisplay }}</div>
          <button class="month-nav-btn" @click="nextMonth">
            <ChevronRight :size="20" />
          </button>
        </div>
        <div class="calendar-container">
          <div class="weekdays">
            <div v-for="day in weekdays" :key="day" class="weekday">
              {{ day }}
            </div>
          </div>
          <div class="days-grid">
            <div
              v-for="(day, index) in calendarDays"
              :key="index"
              class="day-cell"
              :class="{
                'other-month': !day.isCurrentMonth,
                today: day.isToday,
                'has-holiday': !!day.holiday,
                'has-events': day.events.length > 0,
              }"
              @click="selectDay(day)"
            >
              <div class="day-number">{{ day.date }}</div>
              <div v-if="day.holiday || day.events.length > 0" class="dot-row">
                <span v-if="day.holiday" class="dot dot-holiday" />
                <span
                  v-for="e in day.events.slice(0, 2)"
                  :key="e.id"
                  class="dot"
                  :style="{ background: getEventColor(e.type) }"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右側資訊 -->
      <div class="events-section">
        <!-- 今日節日 -->
        <div v-if="todayHoliday" class="holiday-banner">
          <Star :size="22" color="white" fill="white" />
          <div>
            <div class="holiday-banner-name">{{ todayHoliday.name }}</div>
            <div class="holiday-banner-greeting">
              {{ todayHoliday.greeting }}
            </div>
          </div>
        </div>

        <!-- 即將到來的節日 -->
        <div v-if="upcomingHolidays.length > 0" class="upcoming-section">
          <div class="section-subtitle">
            <Star :size="14" />
            <span>即將到來的節日</span>
          </div>
          <div class="holiday-list">
            <div
              v-for="h in upcomingHolidays"
              :key="h.name"
              class="holiday-item"
            >
              <span class="holiday-date-tag">{{ h.date }}</span>
              <span class="holiday-name-small">{{ h.name }}</span>
            </div>
          </div>
        </div>

        <!-- 本月節日 -->
        <div v-if="monthHolidays.length > 0" class="month-section">
          <div class="section-title">
            <CalendarCheck :size="16" />
            <span>本月節日</span>
          </div>
          <div class="holiday-cards">
            <div v-for="h in monthHolidays" :key="h.name" class="holiday-card">
              <div class="holiday-card-date">
                {{ formatHolidayDate(h.date) }}
              </div>
              <div class="holiday-card-name">{{ h.name }}</div>
              <div class="holiday-card-greeting">{{ h.greeting }}</div>
            </div>
          </div>
        </div>

        <!-- 即將到來的事件 -->
        <div class="events-list-section">
          <div class="section-title">
            <CalendarCheck :size="16" />
            <span>即將到來的事件</span>
          </div>
          <div v-if="upcomingEvents.length === 0" class="empty-state">
            <p>點擊日期新增事件</p>
          </div>
          <div v-for="e in upcomingEvents" :key="e.id" class="event-item">
            <div
              class="event-color-bar"
              :style="{ background: getEventColor(e.type) }"
            />
            <div class="event-content">
              <div class="event-title">{{ e.title }}</div>
              <div class="event-date">{{ formatDateDisplay(e.date) }}</div>
              <div v-if="e.description" class="event-desc">
                {{ e.description }}
              </div>
            </div>
            <button class="delete-btn" @click="deleteEvent(e.id)">
              <Trash2 :size="16" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 新增事件彈窗 -->
    <div
      v-if="showAddModal"
      class="modal-overlay"
      @click.self="showAddModal = false"
    >
      <div class="modal-content">
        <div class="modal-header">
          <h2>新增事件</h2>
          <button class="icon-btn" @click="showAddModal = false">
            <X :size="20" />
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>類型</label>
            <select v-model="newEvent.type" class="form-control">
              <option value="user">一般事件</option>
              <option value="period">經期記錄</option>
            </select>
          </div>
          <div class="form-group">
            <label>標題</label>
            <input
              v-model="newEvent.title"
              type="text"
              class="form-control"
              placeholder="事件標題"
            />
          </div>
          <div class="form-group">
            <label>日期</label>
            <input v-model="newEvent.date" type="date" class="form-control" />
          </div>
          <div class="form-group">
            <label>描述（可選）</label>
            <textarea
              v-model="newEvent.description"
              class="form-control"
              rows="3"
              placeholder="事件描述..."
            />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="showAddModal = false">
            取消
          </button>
          <button
            class="btn-primary"
            @click="addEvent"
            :disabled="!newEvent.title.trim() || !newEvent.date"
          >
            新增
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.calendar-screen {
  width: 100%;
  height: 100%;
  background: #f9fafb;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: white;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  flex-shrink: 0;
}
.icon-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #1f2937;
  &:active {
    background: #f3f4f6;
  }
}
.header-title {
  text-align: center;
  h1 {
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
    margin: 0;
  }
  .lunar-date {
    font-size: 12px;
    color: #9ca3af;
  }
}
.content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.calendar-side {
  flex-shrink: 0;
  background: white;
}
.month-selector {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}
.month-nav-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: none;
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #6b7280;
  &:active {
    background: #e5e7eb;
  }
}
.current-month {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}
.calendar-container {
  padding: 6px 12px;
}
.weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  margin-bottom: 4px;
}
.weekday {
  text-align: center;
  font-size: 11px;
  font-weight: 500;
  color: #9ca3af;
  padding: 4px 0;
}
.days-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}
.day-cell {
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  position: relative;
  cursor: pointer;
  transition: background 0.15s;
  &.other-month {
    opacity: 0.3;
    pointer-events: none;
  }
  &.today {
    background: #bfdbfe;
    border: 2px solid #3b82f6;
    .day-number {
      color: #1e40af;
      font-weight: 700;
    }
  }
  &.has-holiday:not(.today) {
    background: rgba(245, 158, 11, 0.08);
  }
  &.has-events:not(.today):not(.has-holiday) {
    background: rgba(59, 130, 246, 0.06);
  }
  &:hover:not(.other-month) {
    background: #e5e7eb;
  }
}
.day-number {
  font-size: 12px;
  color: #1f2937;
}
.dot-row {
  display: flex;
  gap: 2px;
  position: absolute;
  bottom: 2px;
}
.dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
}
.dot-holiday {
  background: #f59e0b;
}
.events-section {
  flex: 1;
  min-height: 0;
  padding: 12px 16px;
  padding-bottom: calc(12px + var(--safe-bottom, 0px));
  overflow-y: auto;
}
.holiday-banner {
  background: #f59e0b;
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  .holiday-banner-name {
    font-size: 15px;
    font-weight: 700;
    color: white;
  }
  .holiday-banner-greeting {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.9);
  }
}
.upcoming-section {
  background: white;
  border-radius: 12px;
  padding: 10px;
  margin-bottom: 14px;
}
.section-subtitle {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: #f59e0b;
  margin-bottom: 8px;
}
.holiday-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.holiday-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: #fef3c7;
  border-radius: 6px;
  font-size: 12px;
}
.holiday-date-tag {
  color: #f59e0b;
  font-weight: 600;
  min-width: 42px;
}
.holiday-name-small {
  color: #92400e;
  font-weight: 500;
}
.month-section,
.events-list-section {
  margin-bottom: 14px;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 10px;
}
.holiday-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.holiday-card {
  background: white;
  border-radius: 10px;
  padding: 12px;
  border-left: 4px solid #f59e0b;
  .holiday-card-date {
    font-size: 11px;
    color: #f59e0b;
    font-weight: 600;
    margin-bottom: 2px;
  }
  .holiday-card-name {
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 2px;
  }
  .holiday-card-greeting {
    font-size: 12px;
    color: #6b7280;
  }
}
.empty-state {
  padding: 24px;
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
}
.event-item {
  background: white;
  border-radius: 10px;
  padding: 12px;
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
}
.event-color-bar {
  width: 4px;
  border-radius: 2px;
  flex-shrink: 0;
}
.event-content {
  flex: 1;
  min-width: 0;
}
.event-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}
.event-date {
  font-size: 12px;
  color: #6b7280;
  margin-top: 2px;
}
.event-desc {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.delete-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #ef4444;
  flex-shrink: 0;
  &:hover {
    background: #fee2e2;
  }
}
/* 彈窗 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}
.modal-content {
  background: white;
  border-radius: 18px;
  max-width: 420px;
  width: 100%;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  h2 {
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
    margin: 0;
  }
}
.modal-body {
  padding: 20px;
  overflow-y: auto;
  background: #f9fafb;
}
.form-group {
  margin-bottom: 14px;
  label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: #374151;
    margin-bottom: 6px;
  }
}
.form-control {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  color: #1f2937;
  background: white;
  box-sizing: border-box;
  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  }
}
textarea.form-control {
  resize: vertical;
  min-height: 70px;
  font-family: inherit;
}
.modal-footer {
  display: flex;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  background: white;
}
.btn-primary,
.btn-secondary {
  flex: 1;
  padding: 9px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  &:active {
    transform: scale(0.98);
  }
}
.btn-primary {
  background: #3b82f6;
  color: white;
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
.btn-secondary {
  background: #f3f4f6;
  color: #6b7280;
}
/* 橫屏 */
@media (orientation: landscape) {
  .content-wrapper {
    flex-direction: row;
  }
  .calendar-side {
    flex: 0 0 50%;
    max-width: 50%;
    border-right: 1px solid rgba(0, 0, 0, 0.08);
    overflow-y: auto;
  }
}
</style>
