<script setup lang="ts">
import {
  deleteCalendarEvent,
  loadCalendarEvents,
  saveCalendarEvent,
  updateCalendarEvent,
} from "@/services/calendarEvents";
import { useCharactersStore } from "@/stores";
import { useUserStore } from "@/stores/user";
import type { CalendarEvent } from "@/types/calendar";
import type { Holiday } from "@/types/holiday";
import {
  compareCalendarEvents,
  eventLastDate,
  eventNotes,
  formatEventTime,
  isEventOnDate,
} from "@/utils/calendarEventFormat";
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

const userStore = useUserStore();
const charactersStore = useCharactersStore();

// 狀態
const currentDate = ref(new Date());
const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
const todayHoliday = ref<Holiday | null>(null);
const upcomingHolidays = ref<Holiday[]>([]);
const lunarDate = ref<string | null>(null);
const events = ref<CalendarEvent[]>([]);
/** 點開的那一天：先看當天有什麼，再決定要新增還是改 */
const selectedDate = ref<string | null>(null);
const showAddModal = ref(false);
/** 正在改的事件；新增時是 null */
const editingEvent = ref<CalendarEvent | null>(null);
const saveError = ref("");

interface EventForm {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  endDate: string;
  description: string;
  type: "user" | "period";
  /** 屬於哪個 user；空字串是所有 user */
  personaId: string;
  /** 哪些角色讀得到：所有角色、勾選的角色、只有自己 */
  charAccess: "all" | "some" | "none";
  visibleCharacterIds: string[];
}

const hasManyPersonas = computed(() => userStore.personas.length > 1);

function emptyForm(date = ""): EventForm {
  // 只有一個 user 時不綁，之後多開 user 也讀得到以前記的
  const personaId = hasManyPersonas.value ? (userStore.currentPersonaId ?? "") : "";
  return {
    title: "",
    date,
    startTime: "",
    endTime: "",
    endDate: "",
    description: "",
    type: "user",
    personaId,
    charAccess: "all",
    visibleCharacterIds: [],
  };
}

const form = ref<EventForm>(emptyForm());
const formValid = computed(
  () => !!form.value.title.trim() && !!form.value.date && (!form.value.endDate || form.value.endDate >= form.value.date),
);

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

// 事件 Map（by date YYYY-MM-DD -> events）；跨天的行程每一天都放
const eventsByDate = computed(() => {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events.value) {
    const last = eventLastDate(e);
    const day = new Date(`${e.date}T00:00:00`);
    // 最多鋪兩個月，壞掉的結束日期不會讓迴圈跑不完
    for (let i = 0; i < 62; i++) {
      const ds = formatDateStr(day);
      if (ds > last) break;
      const list = map.get(ds) || [];
      list.push(e);
      map.set(ds, list);
      day.setDate(day.getDate() + 1);
    }
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

// 即將到來的事件（還沒結束的跨天行程也算）
const upcomingEvents = computed(() => {
  const todayStr = formatDateStr(new Date());
  return events.value
    .filter((e) => eventLastDate(e) >= todayStr)
    .sort(compareCalendarEvents)
    .slice(0, 10);
});

// 點開那一天的行程和節日
const selectedDayEvents = computed(() =>
  selectedDate.value
    ? events.value.filter((e) => isEventOnDate(e, selectedDate.value!)).sort(compareCalendarEvents)
    : [],
);
const selectedDayHoliday = computed(() =>
  selectedDate.value ? holidayMap.value.get(selectedDate.value.slice(5)) ?? null : null,
);

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

function formatDayTitle(dateStr: string) {
  const day = new Date(`${dateStr}T00:00:00`);
  return `${formatDateDisplay(dateStr)} 星期${weekdays[day.getDay()]}`;
}

function formatHolidayDate(dateStr: string) {
  const [mm, dd] = dateStr.split("-");
  return `${parseInt(mm)}月${parseInt(dd)}日`;
}

/** 日期（跨天的寫起訖）加時間 */
function eventWhen(e: CalendarEvent) {
  const last = eventLastDate(e);
  const days = last !== e.date ? `${formatDateDisplay(e.date)} – ${formatDateDisplay(last)}` : formatDateDisplay(e.date);
  const time = formatEventTime(e);
  return time ? `${days}　${time}` : days;
}

function selectDay(day: DayInfo) {
  if (!day.isCurrentMonth) return;
  selectedDate.value = day.fullDateStr;
}

function openAdd(date: string) {
  editingEvent.value = null;
  form.value = emptyForm(date);
  saveError.value = "";
  showAddModal.value = true;
}

function openEdit(e: CalendarEvent) {
  editingEvent.value = e;
  form.value = {
    title: e.title,
    date: e.date,
    startTime: e.startTime ?? "",
    endTime: e.endTime ?? "",
    endDate: e.endDate ?? "",
    // 時間有自己的欄位了，說明裡重複的那段拿掉
    description: eventNotes(e),
    type: e.type === "period" ? "period" : "user",
    personaId: e.personaId ?? "",
    charAccess: !e.visibleCharacterIds ? "all" : e.visibleCharacterIds.length > 0 ? "some" : "none",
    visibleCharacterIds: e.visibleCharacterIds ?? [],
  };
  saveError.value = "";
  showAddModal.value = true;
}

function closeForm() {
  showAddModal.value = false;
  editingEvent.value = null;
}

/** 角色（或群聊）記的；這種只有那個角色讀得到，不能改給別的 user */
function isCharEvent(e: CalendarEvent | null) {
  return !!(e?.sourceCharacterId || e?.sourceChatId);
}

function personaName(id: string | undefined) {
  return userStore.personas.find((p) => p.id === id)?.name;
}

function characterName(char: { nickname?: string; data: { name: string } }) {
  return char.nickname || char.data.name;
}

function charEventAuthor(e: CalendarEvent) {
  const char = charactersStore.characters.find((c) => c.id === e.sourceCharacterId);
  return char ? characterName(char) : undefined;
}

function charEventHint(e: CalendarEvent) {
  const author = charEventAuthor(e);
  return author ? `${author}記的，只有${author}讀得到` : "聊天裡記的，只有那個聊天讀得到";
}

function selfEventUser(e: CalendarEvent) {
  if (!hasManyPersonas.value) return "";
  if (personaName(e.personaId)) return `${personaName(e.personaId)}自己記的`;
  return e.personaId ? "已刪除的 user" : "所有 user";
}

function selfEventAccess(e: CalendarEvent) {
  const ids = e.visibleCharacterIds;
  if (!ids) return "";
  if (ids.length === 0) return "只有我看得到";
  const names = charactersStore.characters.filter((c) => ids.includes(c.id)).map(characterName);
  return `只給${names.join("、")}`;
}

/** 這筆是誰的：行事曆 App 看得到全部，要分得出來 */
function eventOwner(e: CalendarEvent) {
  if (isCharEvent(e)) {
    const author = `${charEventAuthor(e) ?? "聊天裡"}記的`;
    const persona = personaName(e.personaId);
    return hasManyPersonas.value && persona ? `${author}（${persona}）` : author;
  }
  return [selfEventUser(e), selfEventAccess(e)].filter(Boolean).join("・");
}

/** 改成勾選時先全勾，只想瞞一個角色就取消那一個 */
function onCharAccessChange() {
  if (form.value.charAccess === "some" && form.value.visibleCharacterIds.length === 0) {
    form.value.visibleCharacterIds = charactersStore.characters.map((c) => c.id);
  }
}

function getEventColor(type: string) {
  return type === "period" ? "#ec4899" : "#3b82f6";
}

// DB 操作
async function loadEvents() {
  try {
    events.value = await loadCalendarEvents();
  } catch (e) {
    console.error("[Calendar] 載入事件失敗:", e);
    events.value = [];
  }
}

async function saveEvent() {
  if (!formValid.value) return;
  const f = form.value;
  const isPeriod = f.type === "period";
  const fields = {
    type: f.type,
    title: f.title.trim(),
    date: f.date,
    description: f.description.trim() || undefined,
    // 經期紀錄不記時間
    startTime: !isPeriod && f.startTime ? f.startTime : undefined,
    endTime: !isPeriod && f.endTime ? f.endTime : undefined,
    endDate: f.endDate && f.endDate > f.date ? f.endDate : undefined,
  };
  const personaId = f.personaId || undefined;
  const visibleCharacterIds = f.charAccess === "all" ? undefined : f.charAccess === "some" ? f.visibleCharacterIds : [];
  try {
    if (editingEvent.value) {
      const owner = isCharEvent(editingEvent.value) ? {} : { personaId, visibleCharacterIds };
      const updated = await updateCalendarEvent({ ...editingEvent.value, ...fields, ...owner }, { byUser: true });
      events.value = events.value.map((e) => (e.id === updated.id ? updated : e)).sort(compareCalendarEvents);
    } else {
      const created = await saveCalendarEvent({ ...fields, visibleCharacterIds }, { personaId });
      events.value = [...events.value, created].sort(compareCalendarEvents);
    }
    closeForm();
  } catch (e) {
    console.error("[Calendar] 儲存事件失敗:", e);
    saveError.value = "存不進去，請再試一次";
  }
}

async function deleteEvent(id: string) {
  try {
    await deleteCalendarEvent(id);
    events.value = events.value.filter((e) => e.id !== id);
    if (editingEvent.value?.id === id) closeForm();
  } catch (e) {
    console.error("[Calendar] 刪除事件失敗:", e);
  }
}

onMounted(async () => {
  todayHoliday.value = detectTodayHoliday();
  upcomingHolidays.value = detectUpcomingHolidays(7);
  lunarDate.value = getLunarDateString(new Date());
  await Promise.all([
    loadEvents(),
    userStore.isLoaded ? undefined : userStore.loadUserData(),
    charactersStore.characters.length > 0 ? undefined : charactersStore.loadCharacters(),
  ]);
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
      <button class="icon-btn" aria-label="新增事件" @click="openAdd(formatDateStr(new Date()))">
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
              <span class="holiday-date-tag">{{ formatHolidayDate(h.date) }}</span>
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
          <div v-for="e in upcomingEvents" :key="e.id" class="event-item" @click="openEdit(e)">
            <div
              class="event-color-bar"
              :style="{ background: getEventColor(e.type) }"
            />
            <div class="event-content">
              <div class="event-title">{{ e.title }}</div>
              <div class="event-date">{{ eventWhen(e) }}</div>
              <div v-if="eventNotes(e)" class="event-desc">
                {{ eventNotes(e) }}
              </div>
              <div v-if="eventOwner(e)" class="event-desc">{{ eventOwner(e) }}</div>
            </div>
            <button class="delete-btn" aria-label="刪除" @click.stop="deleteEvent(e.id)">
              <Trash2 :size="16" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 點開某一天：當天的行程 -->
    <div
      v-if="selectedDate && !showAddModal"
      class="modal-overlay"
      @click.self="selectedDate = null"
    >
      <div class="modal-content" role="dialog" aria-modal="true" :aria-label="formatDayTitle(selectedDate)">
        <div class="modal-header">
          <h2>{{ formatDayTitle(selectedDate) }}</h2>
          <button class="icon-btn" aria-label="關閉" @click="selectedDate = null">
            <X :size="20" />
          </button>
        </div>
        <div class="modal-body">
          <div v-if="selectedDayHoliday" class="day-holiday">
            <Star :size="14" />
            <span>{{ selectedDayHoliday.name }}</span>
          </div>
          <p v-if="selectedDayEvents.length === 0" class="empty-state">這天沒有行程</p>
          <div v-for="e in selectedDayEvents" :key="e.id" class="event-item" @click="openEdit(e)">
            <div class="event-color-bar" :style="{ background: getEventColor(e.type) }" />
            <div class="event-content">
              <div class="event-title">{{ e.title }}</div>
              <div class="event-date">{{ eventWhen(e) }}</div>
              <div v-if="eventNotes(e)" class="event-desc">{{ eventNotes(e) }}</div>
              <div v-if="eventOwner(e)" class="event-desc">{{ eventOwner(e) }}</div>
            </div>
            <button class="delete-btn" aria-label="刪除" @click.stop="deleteEvent(e.id)">
              <Trash2 :size="16" />
            </button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-primary" @click="openAdd(selectedDate)">新增事件</button>
        </div>
      </div>
    </div>

    <!-- 新增／編輯事件 -->
    <div
      v-if="showAddModal"
      class="modal-overlay"
      @click.self="closeForm"
    >
      <div class="modal-content" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h2>{{ editingEvent ? "編輯事件" : "新增事件" }}</h2>
          <button class="icon-btn" aria-label="關閉" @click="closeForm">
            <X :size="20" />
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>類型</label>
            <select v-model="form.type" class="form-control">
              <option value="user">一般事件</option>
              <option value="period">經期記錄</option>
            </select>
          </div>
          <div class="form-group">
            <label>標題</label>
            <input
              v-model="form.title"
              type="text"
              class="form-control"
              placeholder="事件標題"
            />
          </div>
          <div class="form-group">
            <label>日期</label>
            <input v-model="form.date" type="date" class="form-control" />
          </div>
          <div v-if="form.type === 'user'" class="form-row">
            <div class="form-group">
              <label>開始時間（可選）</label>
              <input v-model="form.startTime" type="time" class="form-control" />
            </div>
            <div class="form-group">
              <label>結束時間（可選）</label>
              <input v-model="form.endTime" type="time" class="form-control" />
            </div>
          </div>
          <div class="form-group">
            <label>結束日期（跨天才填）</label>
            <input v-model="form.endDate" type="date" class="form-control" :min="form.date" />
          </div>
          <div class="form-group">
            <label>描述（可選）</label>
            <textarea
              v-model="form.description"
              class="form-control"
              rows="3"
              placeholder="事件描述..."
            />
          </div>
          <p v-if="isCharEvent(editingEvent)" class="form-hint">{{ charEventHint(editingEvent!) }}</p>
          <div v-else-if="hasManyPersonas" class="form-group">
            <label>這是誰的行程</label>
            <select v-model="form.personaId" class="form-control">
              <option value="">所有 user</option>
              <option v-for="p in userStore.personas" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <p class="form-hint">
              {{ form.personaId ? `只有 ${personaName(form.personaId)} 的角色讀得到` : "每個 user 的角色都讀得到" }}
            </p>
          </div>
          <div v-if="!isCharEvent(editingEvent)" class="form-group">
            <label>哪些角色讀得到</label>
            <select v-model="form.charAccess" class="form-control" @change="onCharAccessChange">
              <option value="all">所有角色</option>
              <option value="some">只有勾選的角色</option>
              <option value="none">只有我自己</option>
            </select>
            <div v-if="form.charAccess === 'some'" class="char-checks">
              <label v-for="c in charactersStore.characters" :key="c.id" class="char-check">
                <input v-model="form.visibleCharacterIds" type="checkbox" :value="c.id" />
                <span>{{ characterName(c) }}</span>
              </label>
            </div>
          </div>
          <p v-if="saveError" class="form-error" role="alert">{{ saveError }}</p>
        </div>
        <div class="modal-footer">
          <button v-if="editingEvent" class="btn-danger" @click="deleteEvent(editingEvent.id)">
            刪除
          </button>
          <button class="btn-secondary" @click="closeForm">
            取消
          </button>
          <button
            class="btn-primary"
            @click="saveEvent"
            :disabled="!formValid"
          >
            {{ editingEvent ? "儲存" : "新增" }}
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
  padding-top: max(12px, var(--safe-top, 0px));
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
  cursor: pointer;
  &:active {
    background: #f3f4f6;
  }
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
.btn-danger {
  flex: 0 0 auto;
  padding: 9px 16px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  background: #fee2e2;
  color: #dc2626;
}
.form-row {
  display: flex;
  gap: 10px;
  .form-group {
    flex: 1;
    min-width: 0;
  }
}
.form-group .char-checks {
  margin-top: 8px;
  max-height: 160px;
  overflow-y: auto;
}
.form-group .char-check {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 6px 2px;
  font-weight: 400;
}
.form-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: #9ca3af;
}
.form-error {
  margin: 0;
  font-size: 13px;
  color: #dc2626;
}
.day-holiday {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fef3c7;
  color: #92400e;
  font-size: 13px;
  font-weight: 500;
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
