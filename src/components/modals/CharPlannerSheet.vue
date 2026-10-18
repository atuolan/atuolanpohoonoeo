<script setup lang="ts">
/**
 * 「他的今天」：角色自己的待辦和行程（聊天頁頂欄打開）。
 * 秘密的不顯示（只有偷窺手機看得到）；使用者只能刪掉 AI 記錯的。
 */
import type { CalendarEvent } from "@/types/calendar";
import type { CharPlan, CharPlanner } from "@/types/charPlanner";
import { eventLastDate, formatEventTime, formatMonthDayWeekday } from "@/utils/calendarEventFormat";
import {
  comparePlans,
  compareTodos,
  formatPlanDate,
  formatPlanTime,
  shiftDate,
  visiblePlanner,
} from "@/utils/charPlanner";
import { CalendarDays, Check, ListChecks, Trash2, X } from "lucide-vue-next";
import { computed } from "vue";

const props = defineProps<{
  planner: CharPlanner | null;
  charName: string;
  /** 聊天的有效日期 YYYY-MM-DD */
  today: string;
  /** 角色在這個聊天幫使用者記進行事曆的 */
  helpedEvents?: CalendarEvent[];
}>();

const emit = defineEmits<{
  close: [];
  deleteTodo: [id: string];
  deletePlan: [id: string];
}>();

const visible = computed(() => visiblePlanner(props.planner ?? { todos: [], plans: [] }));
const todos = computed(() => [...visible.value.todos].sort(compareTodos));

interface PlanGroup {
  label: string;
  plans: CharPlan[];
}

const planGroups = computed<PlanGroup[]>(() => {
  const tomorrow = shiftDate(props.today, 1);
  const upcoming = visible.value.plans.filter((p) => p.date >= props.today).sort(comparePlans);
  const groups: PlanGroup[] = [
    { label: "今天", plans: upcoming.filter((p) => p.date === props.today) },
    { label: "明天", plans: upcoming.filter((p) => p.date === tomorrow) },
    { label: "之後", plans: upcoming.filter((p) => p.date > tomorrow) },
  ];
  return groups.filter((g) => g.plans.length > 0);
});

const helped = computed(() => props.helpedEvents ?? []);
const isEmpty = computed(
  () => todos.value.length === 0 && planGroups.value.length === 0 && helped.value.length === 0,
);

function helpedWhen(e: CalendarEvent): string {
  const last = eventLastDate(e);
  const days = last !== e.date ? `${formatMonthDayWeekday(e.date)}–${formatMonthDayWeekday(last)}` : formatMonthDayWeekday(e.date);
  const time = formatEventTime(e);
  return time ? `${days}　${time}` : days;
}

/** 行程下面那行：之後的寫日期，有地點寫地點 */
function planSub(plan: CharPlan, group: string): string {
  return [group === "之後" ? formatPlanDate(plan.date) : "", plan.place ?? ""].filter(Boolean).join("　");
}
</script>

<template>
  <div class="planner-overlay" @click.self="emit('close')">
    <div class="planner-sheet" role="dialog" aria-modal="true" :aria-label="`${charName} 的今天`">
      <header class="planner-head">
        <h2>{{ charName }} 的今天</h2>
        <button type="button" class="planner-icon-btn" aria-label="關閉" @click="emit('close')">
          <X :size="20" />
        </button>
      </header>

      <div class="planner-body">
        <p v-if="isEmpty" class="planner-empty">
          還沒有待辦和行程。聊天時 {{ charName }} 提到要做的事、排的約，會記在這裡。
        </p>

        <section v-if="todos.length" class="planner-section">
          <h3><ListChecks :size="15" aria-hidden="true" />待辦</h3>
          <ul class="planner-list">
            <li v-for="t in todos" :key="t.id" class="planner-row" :class="{ done: t.done }">
              <span class="planner-check" aria-hidden="true">
                <Check v-if="t.done" :size="13" />
              </span>
              <span class="planner-main">
                <span class="planner-text">{{ t.text }}</span>
                <span v-if="t.due && !t.done" class="planner-sub">{{ formatPlanDate(t.due) }}前</span>
              </span>
              <button type="button" class="planner-icon-btn danger" aria-label="刪掉這條" @click="emit('deleteTodo', t.id)">
                <Trash2 :size="15" />
              </button>
            </li>
          </ul>
        </section>

        <section v-for="g in planGroups" :key="g.label" class="planner-section">
          <h3><CalendarDays :size="15" aria-hidden="true" />{{ g.label }}</h3>
          <ul class="planner-list">
            <li v-for="p in g.plans" :key="p.id" class="planner-row">
              <span class="planner-time">{{ formatPlanTime(p) || "整天" }}</span>
              <span class="planner-main">
                <span class="planner-text">{{ p.title }}</span>
                <span v-if="planSub(p, g.label) || p.withUser" class="planner-sub">
                  <span v-if="planSub(p, g.label)">{{ planSub(p, g.label) }}</span>
                  <span v-if="p.withUser" class="planner-tag">跟你</span>
                </span>
              </span>
              <button type="button" class="planner-icon-btn danger" aria-label="刪掉這個行程" @click="emit('deletePlan', p.id)">
                <Trash2 :size="15" />
              </button>
            </li>
          </ul>
        </section>

        <section v-if="helped.length" class="planner-section">
          <h3><CalendarDays :size="15" aria-hidden="true" />幫你記進行事曆的</h3>
          <ul class="planner-list">
            <li v-for="e in helped" :key="e.id" class="planner-row">
              <span class="planner-main">
                <span class="planner-text">{{ e.title }}</span>
                <span class="planner-sub">{{ helpedWhen(e) }}</span>
              </span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.planner-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
}

.planner-sheet {
  width: 100%;
  max-width: 480px;
  max-height: min(78vh, 640px);
  display: flex;
  flex-direction: column;
  border-radius: 20px 20px 0 0;
  background: var(--color-surface, #fff);
  color: var(--color-text, #1f2937);
  padding-bottom: var(--safe-bottom, 0px);
}

.planner-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px 20px;
  border-bottom: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));

  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
}

.planner-body {
  overflow-y: auto;
  padding: 8px 16px 20px;
}

.planner-empty {
  margin: 24px 8px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-secondary, #6b7280);
  text-align: center;
}

.planner-section {
  margin-top: 12px;

  h3 {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-secondary, #6b7280);
  }
}

.planner-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.planner-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 8px 6px 8px 12px;
  border-radius: 12px;
  background: var(--color-background, rgba(0, 0, 0, 0.04));

  &.done .planner-text {
    text-decoration: line-through;
    color: var(--color-text-muted, #9ca3af);
  }
}

.planner-check {
  width: 18px;
  height: 18px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1.5px solid var(--color-text-muted, #9ca3af);
  color: var(--color-surface, #fff);

  .done & {
    border-color: var(--color-primary, #7dd3a8);
    background: var(--color-primary, #7dd3a8);
  }
}

.planner-time {
  flex: none;
  // 「08:00–18:00」放得下，只有開始時間的也對齊
  width: 84px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary, #6b7280);
}

.planner-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.planner-text {
  font-size: 14px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.planner-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);
}

.planner-tag {
  display: inline-block;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  background: color-mix(in srgb, var(--color-primary, #7dd3a8) 22%, transparent);
  color: var(--color-text, #1f2937);
}

.planner-icon-btn {
  width: 36px;
  height: 36px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-secondary, #6b7280);
  cursor: pointer;

  &.danger {
    color: #ef4444;
  }

  &:active {
    background: var(--color-background, rgba(0, 0, 0, 0.06));
  }
}
</style>
