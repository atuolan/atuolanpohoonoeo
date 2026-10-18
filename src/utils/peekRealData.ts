/**
 * 偷窺手機上的真資料（純函式）：從真的聊天紀錄、聊天日記整理出角色手機上該有的東西。
 * 真資料每次打開手機時現讀，不存進偷窺手機的資料；AI 只補沒有真資料的部分。
 */
import type { DiaryEntry } from "@/db/database";
import type { ChatMessage } from "@/types/chat";
import type { ChatScreenMessage } from "@/types/chatScreen";
import type {
  PeekChatMessage,
  PeekChatThread,
  PeekDiaryEntry,
  PeekMealRecord,
  PeekTransaction,
} from "@/types/peekPhone";
import { summarizeForwardContent } from "@/utils/chatForward";
import { toDateString } from "@/utils/charPlanner";

export interface PeekRealData {
  /** 跟使用者那串的真訊息（角色的角度：角色傳的是 isSelf），最近的在後面 */
  userThread: PeekChatMessage[];
  /** 跟使用者有關的真交易（角色的角度：收到是正數），新的在前面 */
  transactions: PeekTransaction[];
  /** 這段聊天的日記（角色寫的），新的在前面 */
  diary: PeekDiaryEntry[];
  /** 今天使用者點給他的外賣 */
  meals: PeekMealRecord[];
}

export interface PeekRealDataOptions {
  userName: string;
  charName: string;
  /** 角色手機上的現在（聊天的有效時間） */
  now: Date;
}

const THREAD_LIMIT = 30;
const TRANSACTION_LIMIT = 8;
const DIARY_LIMIT = 5;

/** 訊息在劇情裡的時間（假時間模式下跟 createdAt 不同） */
function timeOf(m: ChatMessage): number {
  return m.storyTime ?? m.createdAt;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** 今天的寫「時:分」，不是今天的寫「月/日 時:分」 */
function shortStamp(ms: number, now: Date): string {
  const d = new Date(ms);
  const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return toDateString(d) === toDateString(now) ? clock : `${d.getMonth() + 1}/${d.getDate()} ${clock}`;
}

function mealTypeAt(ms: number): PeekMealRecord["mealType"] {
  const h = new Date(ms).getHours();
  if (h >= 5 && h < 10) return "breakfast";
  if (h >= 10 && h < 14) return "lunch";
  if (h >= 17 && h < 21) return "dinner";
  return "snack";
}

function isChatMessage(m: ChatMessage): boolean {
  return m.sender === "user" || m.sender === "assistant";
}

/** 跟使用者那串：最近 30 則一般訊息（雙方收回的不放） */
function buildUserThread(messages: ChatMessage[], options: PeekRealDataOptions): PeekChatMessage[] {
  const thread: PeekChatMessage[] = [];
  for (const m of messages) {
    if (!isChatMessage(m) || m.isUserRecalled || m.isCharRecall) continue;
    const isSelf = m.sender === "assistant";
    const content = summarizeForwardContent(m as unknown as ChatScreenMessage);
    if (!content || content === "[訊息]") continue;
    thread.push({
      id: `real-${m.id}`,
      senderName: isSelf ? options.charName : options.userName,
      content,
      isSelf,
      timestamp: timeOf(m),
    });
  }
  return thread.slice(-THREAD_LIMIT);
}

interface Dated<T> {
  at: number;
  item: T;
}

/** 錢包：轉帳、紅包、他幫使用者付的外賣（角色的角度） */
function buildTransactions(messages: ChatMessage[], options: PeekRealDataOptions): PeekTransaction[] {
  const list: Dated<PeekTransaction>[] = [];
  const add = (m: ChatMessage, description: string, amount: number, at = timeOf(m)) => {
    if (!amount) return;
    list.push({ at, item: { id: `real-${m.id}`, description, amount, time: shortStamp(at, options.now) } });
  };

  // 一張外賣單會有好幾張卡片（請款、付款、送達），只算最後的狀態
  const orders = new Map<string, { m: ChatMessage; order: NonNullable<ChatMessage["waimaiOrder"]> }>();

  for (const m of messages) {
    if (!isChatMessage(m)) continue;
    const fromUser = m.sender === "user";

    if (m.isTransfer && m.transferType === "pay" && m.transferStatus === "received") {
      const note = m.transferNote ? `（${m.transferNote}）` : "";
      const amount = Math.abs(m.transferAmount ?? 0);
      if (fromUser) add(m, `收到${options.userName}的轉帳${note}`, amount);
      else add(m, `轉帳給${options.userName}${note}`, -amount);
    }

    if (m.isRedpacket && m.redpacketState) {
      const claims = m.redpacketState.claims ?? [];
      if (fromUser) {
        const mine = claims.find((c) => !c.isUser);
        if (mine) add(m, `領了${options.userName}的紅包`, mine.cents / 100, mine.timestamp || timeOf(m));
      } else {
        const theirs = claims.find((c) => c.isUser);
        if (theirs) add(m, `${options.userName}領了我的紅包`, -theirs.cents / 100, theirs.timestamp || timeOf(m));
      }
    }

    if (m.waimaiOrder) orders.set(m.waimaiOrder.orderId, { m, order: m.waimaiOrder });
  }

  for (const { m, order } of orders.values()) {
    if (order.payer !== "assistant") continue;
    if (!["paid", "in_transit", "customs", "delivering", "delivered"].includes(order.status)) continue;
    add(m, `幫${options.userName}付外送：${order.item.name}`, -Math.abs(order.totalPrice), order.paidAt ?? timeOf(m));
  }

  return list
    .sort((a, b) => b.at - a.at)
    .slice(0, TRANSACTION_LIMIT)
    .map((d) => d.item);
}

/** 今天使用者點給他、已經送到的外賣 */
function buildMeals(messages: ChatMessage[], options: PeekRealDataOptions): PeekMealRecord[] {
  const today = toDateString(options.now);
  const orders = new Map<string, NonNullable<ChatMessage["waimaiOrder"]>>();
  for (const m of messages) if (m.waimaiOrder) orders.set(m.waimaiOrder.orderId, m.waimaiOrder);
  const meals: PeekMealRecord[] = [];
  for (const order of orders.values()) {
    if (order.payer !== "user" || order.status !== "delivered" || !order.deliveredAt) continue;
    if (toDateString(new Date(order.deliveredAt)) !== today) continue;
    meals.push({
      id: `real-${order.orderId}`,
      mealType: mealTypeAt(order.deliveredAt),
      food: order.item.name,
      note: `${options.userName}點給我的`,
      time: shortStamp(order.deliveredAt, options.now),
    });
  }
  return meals;
}

/** 聊天日記：寫好的、最近 5 篇；Markdown 記號拿掉 */
function buildDiary(diaries: DiaryEntry[]): PeekDiaryEntry[] {
  return diaries
    .filter((d) => d.status === "ready" && d.content?.trim())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, DIARY_LIMIT)
    .map((d) => ({
      id: `real-${d.id}`,
      date: toDateString(new Date(d.createdAt)),
      mood: "neutral" as const,
      content: d.content.replace(/^#+\s*/gm, "").replace(/[*_`>]/g, "").trim(),
    }));
}

export function buildPeekRealData(
  messages: ChatMessage[],
  diaries: DiaryEntry[],
  options: PeekRealDataOptions,
): PeekRealData {
  const sorted = [...messages].sort((a, b) => a.createdAt - b.createdAt);
  return {
    userThread: buildUserThread(sorted, options),
    transactions: buildTransactions(sorted, options),
    diary: buildDiary(diaries),
    meals: buildMeals(sorted, options),
  };
}

/** 給生成用的 prompt：真的已經會顯示在手機裡，AI 不要重複寫，也不要跟它衝突 */
export function describeRealDataForPrompt(real: PeekRealData, userName: string): string {
  const lines: string[] = [];
  if (real.transactions.length) {
    lines.push("錢包裡真的交易（已經會顯示，transactions 不要重複寫）：");
    for (const t of real.transactions) lines.push(`- ${t.time} ${t.description} ${t.amount > 0 ? "+" : ""}${t.amount}`);
  }
  if (real.meals.length) {
    lines.push(`今天${userName}點給他的（已經會顯示，meals 不要重複寫）：`);
    for (const m of real.meals) lines.push(`- ${m.time} ${m.food}`);
  }
  if (real.diary.length) {
    lines.push(`已經有的日記日期（diary 不要寫這幾天）：${[...new Set(real.diary.map((d) => d.date))].join("、")}`);
  }
  return lines.join("\n");
}

/**
 * 跟使用者那串換成真的聊天：AI 寫的備註名、草稿留著，訊息換成真的；
 * AI 沒寫那串時補一串，名字用使用者的名字
 */
export function mergeRealUserThread(
  threads: PeekChatThread[],
  real: PeekChatMessage[],
  userName: string,
): PeekChatThread[] {
  if (real.length === 0) return threads;
  const updatedAt = real[real.length - 1].timestamp;
  const index = threads.findIndex((t) => t.isUser);
  // 一對一的對話：使用者的訊息掛他手機裡給使用者的備註名，畫面才不會每則都標名字
  const named = (contactName: string) => real.map((m) => (m.isSelf ? m : { ...m, senderName: contactName }));
  if (index === -1) {
    return [{ id: "real-user", contactName: userName, isUser: true, messages: named(userName), updatedAt }, ...threads];
  }
  return threads.map((t, i) =>
    i === index ? { ...t, messages: named(t.contactName), updatedAt: Math.max(t.updatedAt, updatedAt) } : t,
  );
}
