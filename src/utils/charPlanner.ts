/**
 * 角色待辦與行程的純函式：解析回覆標籤、套用改動、清理、組給 AI 看的清單、重新生成時換回
 */
import type {
  CharPlan,
  CharPlanner,
  CharTodo,
  PlannerOp,
  PlannerSource,
  PlannerState,
  PlannerTurn,
} from "@/types/charPlanner";
import { normalizeEventTime, normalizeEventTitle } from "@/utils/calendarEventFormat";

/** 回覆裡的 <char-todo …/>、<char-plan …/>（也認得成對的寫法） */
export const CHAR_PLANNER_TAG_REGEX = /<char-(?:todo|plan)\b[^>]*?\/?>(?:<\/char-(?:todo|plan)>)?/gi;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** 做完的待辦留幾天、過去的行程留幾天（給偷窺手機和之後的時光機看） */
const DONE_TODO_KEEP_MS = 7 * 86_400_000;
const PAST_PLAN_KEEP_DAYS = 14;
/** 最多記幾輪的改動 */
const TURN_KEEP = 6;

function attr(attrs: string, name: string): string | undefined {
  const match = attrs.match(new RegExp(`(?:^|\\s)${name}=["']([^"']*)["']`, "i"));
  const value = match?.[1].trim();
  return value ? value : undefined;
}

function boolAttr(attrs: string, name: string): boolean | undefined {
  const value = attr(attrs, name);
  return value ? /^(true|1|yes|是)$/i.test(value) : undefined;
}

function dateAttr(attrs: string, name: string): string | undefined {
  const value = attr(attrs, name);
  return value && DATE_RE.test(value) ? value : undefined;
}

/** 解析回覆裡的待辦、行程標籤；看不懂的略過 */
export function parseCharPlannerTags(raw: string): PlannerOp[] {
  const ops: PlannerOp[] = [];
  const tagRe = /<char-(todo|plan)\b([^>]*?)\/?>(?:<\/char-(?:todo|plan)>)?/gi;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(raw)) !== null) {
    const kind = match[1].toLowerCase();
    const attrs = ` ${match[2]}`;
    if (kind === "todo") {
      const add = attr(attrs, "add");
      const done = attr(attrs, "done");
      const drop = attr(attrs, "drop");
      if (add) {
        ops.push({ kind: "todo-add", text: add, due: dateAttr(attrs, "due"), secret: boolAttr(attrs, "secret") });
      } else if (done) {
        ops.push({ kind: "todo-done", match: done });
      } else if (drop) {
        ops.push({ kind: "todo-drop", match: drop });
      }
    } else {
      const cancel = attr(attrs, "cancel");
      if (cancel) {
        ops.push({ kind: "plan-cancel", match: cancel });
        continue;
      }
      const title = attr(attrs, "title");
      const date = dateAttr(attrs, "date");
      if (!title || !date) continue;
      ops.push({
        kind: "plan-add",
        date,
        title,
        time: normalizeEventTime(attr(attrs, "time")),
        end: normalizeEventTime(attr(attrs, "end")),
        place: attr(attrs, "place"),
        withUser: boolAttr(attrs, "with-user"),
        secret: boolAttr(attrs, "secret"),
      });
    }
  }
  return ops;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 照「開頭幾個字」找：開頭對得上的優先，其次是包含 */
function findByMatch<T>(items: T[], text: (item: T) => string, match: string): T | undefined {
  const key = normalizeEventTitle(match);
  if (!key) return undefined;
  return (
    items.find((item) => normalizeEventTitle(text(item)).startsWith(key)) ??
    items.find((item) => normalizeEventTitle(text(item)).includes(key))
  );
}

/** 依序套用動作，回傳新的狀態（不改傳進來的） */
export function applyPlannerOps(
  state: PlannerState,
  ops: PlannerOp[],
  options: { source: PlannerSource; today: string; now?: number },
): PlannerState {
  const now = options.now ?? Date.now();
  let todos = state.todos.map((t) => ({ ...t }));
  let plans = state.plans.map((p) => ({ ...p }));

  for (const op of ops) {
    switch (op.kind) {
      case "todo-add": {
        const key = normalizeEventTitle(op.text);
        if (!key) break;
        const same = todos.find((t) => !t.done && normalizeEventTitle(t.text) === key);
        if (same) {
          if (op.due) same.due = op.due;
          if (op.secret !== undefined) same.secret = op.secret || undefined;
          break;
        }
        todos.push({
          id: newId("todo"),
          text: op.text,
          done: false,
          due: op.due,
          secret: op.secret || undefined,
          source: options.source,
          createdAt: now,
        });
        break;
      }
      case "todo-done": {
        const todo = findByMatch(todos.filter((t) => !t.done), (t) => t.text, op.match);
        if (todo) {
          todo.done = true;
          todo.doneAt = now;
        }
        break;
      }
      case "todo-drop": {
        const todo = findByMatch(todos, (t) => t.text, op.match);
        if (todo) todos = todos.filter((t) => t !== todo);
        break;
      }
      case "plan-add": {
        const key = normalizeEventTitle(op.title);
        const same = plans.find((p) => p.date === op.date && normalizeEventTitle(p.title) === key);
        if (same) {
          if (op.time) same.time = op.time;
          if (op.end) same.end = op.end;
          if (op.place) same.place = op.place;
          if (op.withUser !== undefined) same.withUser = op.withUser || undefined;
          if (op.secret !== undefined) same.secret = op.secret || undefined;
          break;
        }
        plans.push({
          id: newId("plan"),
          date: op.date,
          time: op.time,
          end: op.end,
          title: op.title,
          place: op.place,
          withUser: op.withUser || undefined,
          secret: op.secret || undefined,
          source: options.source,
          createdAt: now,
        });
        break;
      }
      case "plan-cancel": {
        // 還沒到的優先，最近的那個
        const upcoming = plans.filter((p) => p.date >= options.today).sort(comparePlans);
        const plan =
          findByMatch(upcoming, (p) => p.title, op.match) ?? findByMatch(plans, (p) => p.title, op.match);
        if (plan) plans = plans.filter((p) => p !== plan);
        break;
      }
    }
  }
  return { todos, plans: plans.sort(comparePlans) };
}

export function comparePlans(a: CharPlan, b: CharPlan): number {
  return (
    a.date.localeCompare(b.date) ||
    (a.time ? 1 : 0) - (b.time ? 1 : 0) ||
    (a.time ?? "").localeCompare(b.time ?? "") ||
    a.createdAt - b.createdAt
  );
}

/** YYYY-MM-DD 加減天數 */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 清掉做完很久的待辦和過去很久的行程 */
export function prunePlanner(state: PlannerState, today: string, now = Date.now()): PlannerState {
  const oldestPlan = shiftDate(today, -PAST_PLAN_KEEP_DAYS);
  return {
    todos: state.todos.filter((t) => !t.done || now - (t.doneAt ?? now) <= DONE_TODO_KEEP_MS),
    plans: state.plans.filter((p) => p.date >= oldestPlan),
  };
}

function sameState(a: PlannerState, b: PlannerState): boolean {
  return JSON.stringify({ t: a.todos, p: a.plans }) === JSON.stringify({ t: b.todos, p: b.plans });
}

function snapshot(state: PlannerState): PlannerState {
  return JSON.parse(JSON.stringify({ todos: state.todos, plans: state.plans }));
}

/** 記下這一輪改了什麼；同一輪又改（例如工具和標籤都有）時 before 不動、after 更新 */
export function recordPlannerTurn(
  turns: PlannerTurn[] | undefined,
  turnId: string,
  before: PlannerState,
  after: PlannerState,
): PlannerTurn[] {
  const list = (turns ?? []).filter((t) => t.turnId !== turnId);
  const existing = turns?.find((t) => t.turnId === turnId);
  list.push({ turnId, before: existing?.before ?? snapshot(before), after: snapshot(after) });
  return list.slice(-TURN_KEEP);
}

/**
 * 一輪回覆被換下（重新生成、換候選）：被換下那輪改的換回改之前；換回來的那輪再套回它改的。
 * 之後又有別的改動（例如使用者刪了一條）就不動，免得把那些改動蓋掉。回傳 null 表示不用改
 */
export function replanForReplacedRound(
  planner: Pick<CharPlanner, "todos" | "plans" | "turns">,
  removedTurnId: string | undefined,
  restoredTurnId: string | undefined,
): PlannerState | null {
  let state: PlannerState = { todos: planner.todos, plans: planner.plans };
  let changed = false;
  const removed = removedTurnId ? planner.turns?.find((t) => t.turnId === removedTurnId) : undefined;
  if (removed && sameState(state, removed.after)) {
    state = removed.before;
    changed = true;
  }
  const restored = restoredTurnId ? planner.turns?.find((t) => t.turnId === restoredTurnId) : undefined;
  if (restored && sameState(state, restored.before)) {
    state = restored.after;
    changed = true;
  }
  return changed ? snapshot(state) : null;
}

/** 聊天頁看得到的（秘密的不給看） */
export function visiblePlanner(state: PlannerState): PlannerState {
  return {
    todos: state.todos.filter((t) => !t.secret),
    plans: state.plans.filter((p) => !p.secret),
  };
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/** 「10/24（六）」 */
export function formatPlanDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
}

/** 「19:00–21:00」「19:00」，整天的回傳空字串 */
export function formatPlanTime(plan: Pick<CharPlan, "time" | "end">): string {
  if (plan.time && plan.end) return `${plan.time}–${plan.end}`;
  return plan.time ?? "";
}

/** 待辦排序：沒做完的在前；期限近的在前；先記的在前 */
export function compareTodos(a: CharTodo, b: CharTodo): number {
  return (
    (a.done ? 1 : 0) - (b.done ? 1 : 0) ||
    (a.due ? 0 : 1) - (b.due ? 0 : 1) ||
    (a.due ?? "").localeCompare(b.due ?? "") ||
    a.createdAt - b.createdAt
  );
}

/**
 * 給 AI 看的清單（{{charPlanner}}）：還沒做完的待辦最多 8 條，今天到後天的行程。
 * 秘密的也給，標出來
 */
export function buildPlannerPromptText(state: PlannerState, today: string, userName: string): string {
  const todos = state.todos.filter((t) => !t.done).sort(compareTodos).slice(0, 8);
  const lastDay = shiftDate(today, 2);
  const plans = state.plans.filter((p) => p.date >= today && p.date <= lastDay).sort(comparePlans);
  if (todos.length === 0 && plans.length === 0) return "（目前沒有待辦和行程）";

  const lines: string[] = [];
  if (todos.length) {
    lines.push("還沒做完的待辦：");
    for (const t of todos) {
      const notes = [t.due ? `${formatPlanDate(t.due)}前` : "", t.secret ? `秘密，${userName}看不到` : ""].filter(Boolean);
      lines.push(`- ${t.text}${notes.length ? `（${notes.join("，")}）` : ""}`);
    }
  }
  if (plans.length) {
    lines.push("今天到後天的行程：");
    for (const p of plans) {
      const day = p.date === today ? "今天" : p.date === shiftDate(today, 1) ? "明天" : "後天";
      const time = formatPlanTime(p);
      const notes = [p.withUser ? `和${userName}` : "", p.place ?? "", p.secret ? `秘密，${userName}看不到` : ""].filter(Boolean);
      lines.push(`- ${day} ${formatPlanDate(p.date)}${time ? ` ${time}` : ""} ${p.title}${notes.length ? `（${notes.join("，")}）` : ""}`);
    }
  }
  return lines.join("\n");
}

/** 偷窺手機生成的行程（只有今天的時間）和備忘 */
export interface PeekPlannerItems {
  schedule?: { time?: string; title: string; location?: string }[];
  memos?: { content: string; done: boolean }[];
}

/**
 * 偷窺手機生成的行程、備忘寫回角色的待辦和行程（來源標 peek）：
 * 先拿掉上一次偷窺手機寫的（行程只拿今天的），再補上這次的；聊天裡已經有的不重複加
 */
export function mergePeekItems(
  state: PlannerState,
  items: PeekPlannerItems,
  today: string,
  now = Date.now(),
): PlannerState {
  let todos = state.todos;
  let plans = state.plans;

  if (items.memos) {
    todos = todos.filter((t) => t.source !== "peek");
    for (const memo of items.memos) {
      const key = normalizeEventTitle(memo.content);
      if (!key || todos.some((t) => normalizeEventTitle(t.text) === key)) continue;
      todos = [
        ...todos,
        {
          id: newId("todo"),
          text: memo.content,
          done: memo.done,
          doneAt: memo.done ? now : undefined,
          source: "peek",
          createdAt: now,
        },
      ];
    }
  }

  if (items.schedule) {
    plans = plans.filter((p) => !(p.source === "peek" && p.date === today));
    for (const item of items.schedule) {
      const key = normalizeEventTitle(item.title);
      if (!key || plans.some((p) => p.date === today && normalizeEventTitle(p.title) === key)) continue;
      plans = [
        ...plans,
        {
          id: newId("plan"),
          date: today,
          time: normalizeEventTime(item.time),
          title: item.title,
          place: item.location || undefined,
          source: "peek",
          createdAt: now,
        },
      ];
    }
  }

  return { todos, plans: [...plans].sort(comparePlans) };
}
