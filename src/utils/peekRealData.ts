/**
 * 偷窺手機上的真資料（純函式）：從真的聊天紀錄、聊天日記整理出角色手機上該有的東西。
 * 真資料每次打開手機時現讀，不存進偷窺手機的資料；AI 只補沒有真資料的部分。
 */
import type { DiaryEntry } from "@/db/database";
import type { ChatMessage } from "@/types/chat";
import type { ChatScreenMessage } from "@/types/chatScreen";
import type { PendingCall } from "@/types/incomingCall";
import type {
  PeekChatMessage,
  PeekChatThread,
  PeekDiaryEntry,
  PeekGalleryItem,
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
  /** 聊天裡傳過的照片：他傳的、使用者傳給他的（當作他存了），新的在前面 */
  photos: PeekGalleryItem[];
  /** 他排好、還沒打給使用者的電話；reason 是秘密 */
  pendingCalls: PeekPendingCall[];
  /** 兩人第一次聊天的日期（YYYY-MM-DD），給鎖屏密碼參考 */
  firstChatDate?: string;
  /** 他在噗浪的近況：被禁言、偷偷說發過的噗 */
  plurk?: PeekPlurkNotes;
}

export interface PeekPlurkNotes {
  ban?: { reason: string; until: string };
  /** 他用偷偷說匿名發的噗，新的在前 */
  anonPosts: string[];
}

export interface PeekPendingCall {
  id: string;
  /** 什麼時候要打（劇情時間） */
  at: number;
  /** 「時:分」或「月/日 時:分」 */
  time: string;
  reason: string;
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
const PHOTO_LIMIT = 12;

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

/** 他打給使用者沒接通：在他手機上是他打出去的那通 */
function callLine(m: ChatMessage): string {
  return m.callNotificationType === "declined" ? "📞 撥出的電話 · 對方拒接" : "📞 撥出的電話 · 沒有接通";
}

/** 跟使用者那串：最近 30 則一般訊息（雙方收回的不放），加上他打過去沒接通的電話 */
function buildUserThread(messages: ChatMessage[], options: PeekRealDataOptions): PeekChatMessage[] {
  const thread: PeekChatMessage[] = [];
  for (const m of messages) {
    if (m.isCallNotification) {
      thread.push({
        id: `real-${m.id}`,
        senderName: options.charName,
        content: callLine(m),
        isSelf: true,
        timestamp: timeOf(m),
        callReason: m.callReason?.trim() || undefined,
      });
      continue;
    }
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

function isPhoto(m: ChatMessage): boolean {
  return (
    m.messageType === "image" ||
    m.messageType === "descriptive-image" ||
    m.messageType === "image-url" ||
    !!m.imageUrl
  );
}

/** 相簿：他傳過的照片、使用者傳給他的（當作他存了）；描述用圖片說明 */
function buildPhotos(messages: ChatMessage[], options: PeekRealDataOptions): PeekGalleryItem[] {
  const photos: PeekGalleryItem[] = [];
  for (const m of messages) {
    if (!isChatMessage(m) || m.isUserRecalled || m.isCharRecall || !isPhoto(m)) continue;
    const fromChar = m.sender === "assistant";
    const caption = (m.imageCaption || m.imagePrompt || "").trim();
    const text = (m.content || "").trim();
    const description = caption || (text && !/^https?:|^data:/.test(text) ? text : "") ||
      (fromChar ? `傳給${options.userName}的照片` : `${options.userName}傳來的照片`);
    const url = m.imageUrl && /^(https?:|data:image\/)/.test(m.imageUrl) ? m.imageUrl : undefined;
    photos.push({
      id: `real-${m.id}`,
      description,
      source: fromChar ? (/自拍|selfie/i.test(description) ? "selfie" : "scene") : "saved",
      reason: fromChar ? `傳給${options.userName}看的` : `${options.userName}傳給我的`,
      date: toDateString(new Date(timeOf(m))),
      imageUrl: url,
    });
  }
  return photos.reverse().slice(0, PHOTO_LIMIT);
}

/** 排好要打的電話，早的在前面；觸發時間是現實時間，換成聊天的時間（realNow：現實的現在） */
export function buildPendingCalls(calls: PendingCall[], now: Date, realNow = Date.now()): PeekPendingCall[] {
  const offset = now.getTime() - realNow;
  return calls
    .filter((c) => c.reason?.trim())
    .sort((a, b) => a.triggerTime - b.triggerTime)
    .map((c) => {
      const at = c.triggerTime + offset;
      return { id: c.id, at, time: shortStamp(at, now), reason: c.reason.trim() };
    });
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

export interface PeekRealDataExtras {
  pendingCalls?: PendingCall[];
  /** 已經讀到最舊的訊息了：第一則的日期就是第一次聊天 */
  hasAllMessages?: boolean;
  /** 讀不到最舊的訊息時用聊天建立的時間 */
  chatCreatedAt?: number;
}

export function buildPeekRealData(
  messages: ChatMessage[],
  diaries: DiaryEntry[],
  options: PeekRealDataOptions,
  extras: PeekRealDataExtras = {},
): PeekRealData {
  const sorted = [...messages].sort((a, b) => a.createdAt - b.createdAt);
  const firstAt = extras.hasAllMessages && sorted.length ? timeOf(sorted[0]) : extras.chatCreatedAt;
  return {
    userThread: buildUserThread(sorted, options),
    transactions: buildTransactions(sorted, options),
    diary: buildDiary(diaries),
    meals: buildMeals(sorted, options),
    photos: buildPhotos(sorted, options),
    pendingCalls: buildPendingCalls(extras.pendingCalls ?? [], options.now),
    firstChatDate: firstAt ? toDateString(new Date(firstAt)) : undefined,
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
  if (real.pendingCalls.length) {
    lines.push(`他排好等一下要打給${userName}的電話（會變成行事曆上的提醒，可以在心情、日記裡呼應）：`);
    for (const c of real.pendingCalls) lines.push(`- ${c.time}，原因：${c.reason}`);
  }
  if (real.plurk?.ban) {
    lines.push(
      `他在噗浪廣場被版主禁言中（原因：${real.plurk.ban.reason}，到 ${real.plurk.ban.until}）。備忘錄可以有一封寫到一半、還沒送出的申訴。`,
    );
  }
  if (real.plurk?.anonPosts.length) {
    lines.push("他在噗浪用「偷偷說」匿名發過這些（別人不知道是他；可以在搜尋紀錄、備忘錄或心情裡露出一點蛛絲馬跡，但不要直接承認）：");
    for (const text of real.plurk.anonPosts) lines.push(`- ${text}`);
  }
  return lines.join("\n");
}

/** 給相簿組的：聊天裡真的傳過的照片已經會顯示，gallery 不要重複寫 */
export function describeRealPhotosForPrompt(real: PeekRealData): string {
  if (real.photos.length === 0) return "";
  return [
    "相簿裡真的照片（聊天裡傳過的，已經會顯示，gallery 不要重複寫，可以呼應）：",
    ...real.photos.slice(0, 6).map((p) => `- ${p.date} ${p.description}（${p.reason}）`),
  ].join("\n");
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
