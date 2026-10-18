<script setup lang="ts">
/**
 * 聊天裡的行事曆卡片：角色幫你記的行程，按一下加到手機日曆。
 * 網頁版沒辦法自己寫進手機日曆，所以要你按；加入方式在「設定 › 日曆與定位」。
 * 角色排了跟你一起的行程（data.plan）時還沒進你的行事曆，先給「加到我的行事曆」
 */
import { findSameCalendarEvent, saveCalendarEventOnce } from "@/services/calendarEvents";
import { replaceCharPlannerState } from "@/services/charPlanner";
import { eventNotes } from "@/utils/calendarEventFormat";
import {
  addToPhoneCalendar,
  phoneCalendarHint,
  toPhoneCalendarEvent,
} from "@/services/phoneCalendar";
import type { CalendarCardData, CalendarEventData } from "@/types/calendar";
import { CalendarDays, CalendarPlus, Users } from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref } from "vue";

const props = defineProps<{ data: CalendarCardData }>();

/** 一起的行程已經在使用者的行事曆裡了（按過，或本來就記了） */
const inCalendar = ref(!props.data.plan);
const adding = ref(false);

function eventData(): CalendarEventData {
  const { type, title, date, description, startTime, endTime, endDate } = props.data;
  return { type, title, date, description, startTime, endTime, endDate };
}

onMounted(async () => {
  if (!props.data.plan) return;
  inCalendar.value = !!(await findSameCalendarEvent(props.data).catch(() => undefined));
});

async function addToMyCalendar() {
  const plan = props.data.plan;
  if (!plan || adding.value) return;
  adding.value = true;
  try {
    const { event } = await saveCalendarEventOnce(eventData(), { characterId: plan.characterId, chatId: plan.chatId });
    inCalendar.value = true;
    // 記在角色的行程上，之後知道這個約已經在你的行事曆裡了
    await replaceCharPlannerState(plan.chatId, plan.characterId, (state) => ({
      ...state,
      plans: state.plans.map((p) => (p.id === plan.planId ? { ...p, calendarEventId: event.id } : p)),
    }));
  } catch (e) {
    showHint(`加不進去：${e instanceof Error ? e.message : String(e)}`);
  } finally {
    adding.value = false;
  }
}

const when = computed(() => {
  const { date, startTime, endTime, endDate } = props.data;
  const days = endDate && endDate !== date ? `${date} – ${endDate}` : date;
  if (!startTime) return days;
  return `${days}　${startTime}${endTime ? `–${endTime}` : ""}`;
});

// 說明開頭重複的時間上面已經顯示過，去掉
const notes = computed(() => eventNotes(props.data));

const hint = ref("");
let hintTimer: ReturnType<typeof setTimeout> | undefined;

function showHint(text: string) {
  hint.value = text;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    hint.value = "";
  }, 6000);
}

function addToPhone() {
  try {
    showHint(phoneCalendarHint(addToPhoneCalendar(toPhoneCalendarEvent(eventData()))));
  } catch (e) {
    showHint(`加不進去：${e instanceof Error ? e.message : String(e)}`);
  }
}

onUnmounted(() => clearTimeout(hintTimer));
</script>

<template>
  <div class="calendar-card">
    <div class="calendar-card__head">
      <Users v-if="data.plan && !inCalendar" aria-hidden="true" />
      <CalendarDays v-else aria-hidden="true" />
      <span>{{ data.plan && !inCalendar ? "排了跟你一起的行程" : data.type === "period" ? "經期紀錄" : "已加入行事曆" }}</span>
    </div>
    <div class="calendar-card__title">{{ data.title }}</div>
    <div class="calendar-card__when">{{ when }}</div>
    <div v-if="notes" class="calendar-card__notes">{{ notes }}</div>
    <button
      v-if="!inCalendar"
      type="button"
      class="calendar-card__add"
      :disabled="adding"
      @click.stop="addToMyCalendar"
    >
      <CalendarPlus aria-hidden="true" />加到我的行事曆
    </button>
    <button v-else type="button" class="calendar-card__add" @click.stop="addToPhone">
      <CalendarPlus aria-hidden="true" />加到手機日曆
    </button>
    <p v-if="hint" class="calendar-card__hint" role="status">{{ hint }}</p>
  </div>
</template>

<style scoped lang="scss">
.calendar-card {
  width: min(280px, 100%);
  margin: 0 auto;
  padding: 12px 14px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--color-border, #e5e5e5) 80%, transparent);
  background: var(--color-surface, #fff);
  color: var(--color-text, #333);
}

.calendar-card__head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-muted, #999);

  svg {
    width: 14px;
    height: 14px;
    flex: none;
  }
}

.calendar-card__title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.calendar-card__when {
  font-size: 13px;
  color: var(--color-text-secondary, #666);
  font-variant-numeric: tabular-nums;
}

.calendar-card__notes {
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text-secondary, #666);
  overflow-wrap: anywhere;
}

.calendar-card__add {
  margin-top: 8px;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 0;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-primary, #e8a0b4) 16%, var(--color-surface, #fff));
  color: color-mix(in srgb, var(--color-primary, #e8a0b4) 65%, var(--color-text, #333));
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;

  svg {
    width: 16px;
    height: 16px;
    flex: none;
  }

  &:active {
    background: color-mix(in srgb, var(--color-primary, #e8a0b4) 26%, var(--color-surface, #fff));
  }
}

.calendar-card__hint {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-muted, #999);
  text-align: center;
}
</style>
