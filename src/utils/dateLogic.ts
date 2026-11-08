/**
 * 約會的計算與文字（純函式）
 */
import {
  COMMON_DATE_EVENTS,
  CUSTOM_DATE_DURATION_MINUTES,
  DATE_EVENT_AFTER_REPLIES,
  DATE_EVENT_CHANCE,
  type DateSpot,
} from "@/data/dateSpots";
import type { DateCardData, DateEvent, DatePayer, DateSession } from "@/types/date";

export interface DateNames {
  userName: string;
  charName: string;
}

type Rng = () => number;

/** 自訂地點：使用者自己輸入名稱，選一個花費範圍 */
export interface CustomDatePlace {
  place: string;
  costPerPerson: [number, number];
}

function randInt(min: number, max: number, rng: Rng): number {
  return Math.floor(min + rng() * (max - min + 1));
}

/** 兩人份的總花費，取到十位 */
export function rollDateCost(costPerPerson: [number, number], rng: Rng = Math.random): number {
  const [min, max] = costPerPerson;
  return Math.round((randInt(min, max, rng) * 2) / 10) * 10;
}

/** 抽隨機事件：六成機率有，地點專屬和共用一起抽 */
export function rollDateEvent(
  spot: Pick<DateSpot, "events"> | null,
  names: DateNames,
  rng: Rng = Math.random,
): DateEvent | undefined {
  if (rng() >= DATE_EVENT_CHANCE) return undefined;
  const pool: Array<{ id: string; text: string; forgotWallet?: boolean }> = [
    ...(spot?.events ?? []).map((text, i) => ({ id: `spot-${i}`, text })),
    ...COMMON_DATE_EVENTS,
  ];
  const picked = pool[Math.floor(rng() * pool.length)];
  if (!picked) return undefined;
  if (picked.forgotWallet) {
    const who = rng() < 0.5 ? "user" : "char";
    return { id: picked.id, text: `${who === "user" ? names.userName : names.charName}${picked.text}`, forgotWallet: who };
  }
  return { id: picked.id, text: picked.text };
}

export function newDateSessionId(): string {
  return `date_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createDateSession(options: {
  chatId: string;
  characterId: string;
  spot: DateSpot | null;
  custom?: CustomDatePlace;
  startedBy: "user" | "char";
  inviteMessageId: string;
  reason?: string;
  names: DateNames;
  now?: number;
  rng?: Rng;
}): DateSession {
  const rng = options.rng ?? Math.random;
  const spot = options.spot;
  const costRange = spot?.costPerPerson ?? options.custom?.costPerPerson ?? [300, 800];
  return {
    id: newDateSessionId(),
    chatId: options.chatId,
    characterId: options.characterId,
    spotId: spot?.id ?? "custom",
    place: spot?.name ?? options.custom?.place ?? "外面",
    emoji: spot?.emoji ?? "📍",
    vibe: spot?.vibe ?? "",
    startedBy: options.startedBy,
    status: "invited",
    inviteMessageId: options.inviteMessageId,
    reason: options.reason,
    durationMinutes: spot?.durationMinutes ?? CUSTOM_DATE_DURATION_MINUTES,
    cost: rollDateCost(costRange, rng),
    invitedAt: options.now ?? Date.now(),
    event: rollDateEvent(spot, options.names, rng),
    aiReplies: 0,
  };
}

/** 角色說的地點名稱對到內建地點（包含就算），對不到回 null 當自訂地點 */
export function matchDateSpot(place: string, spots: DateSpot[]): DateSpot | null {
  const p = place.trim();
  if (!p) return null;
  return spots.find((s) => p.includes(s.name) || s.name.includes(p)) ?? null;
}

/** 各付多少：忘了帶錢包的人付不了，改由另一個人付 */
export function resolveDateShares(
  cost: number,
  payer: DatePayer,
  event?: DateEvent,
): { payer: DatePayer; userShare: number; charShare: number } {
  let effective = payer;
  if (event?.forgotWallet === "char" && payer !== "user") effective = "user";
  if (event?.forgotWallet === "user" && payer !== "char") effective = "char";
  if (effective === "char") return { payer: effective, userShare: 0, charShare: cost };
  if (effective === "user") return { payer: effective, userShare: cost, charShare: 0 };
  const charShare = Math.floor(cost / 2);
  return { payer: effective, userShare: cost - charShare, charShare };
}

export function parsePayer(value: string | undefined): DatePayer | null {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "char" || v === "user" || v === "split") return v;
  return null;
}

/** 開始後角色回了幾輪才把事件交給 AI */
export function shouldInjectDateEvent(session: DateSession): boolean {
  return (
    session.status === "ongoing" &&
    !!session.event &&
    !session.eventInjected &&
    session.aiReplies >= DATE_EVENT_AFTER_REPLIES
  );
}

/** 結束時劇情時間還要往後推幾分鐘（約會中 AI 自己推過的扣掉） */
export function remainingDateMinutes(session: DateSession, storyNowMs: number): number {
  if (typeof session.startedStoryTime !== "number") return session.durationMinutes;
  const passed = Math.max(0, (storyNowMs - session.startedStoryTime) / 60_000);
  return Math.max(0, Math.round(session.durationMinutes - passed));
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} 分鐘`;
  return m === 0 ? `${h} 小時` : `${h} 小時 ${m} 分`;
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** 付完錢的結果文字 */
export function paymentNoteText(
  payer: DatePayer,
  shares: { userShare: number; charShare: number },
  names: DateNames,
): string {
  if (payer === "char") return `${names.charName}請客，付了 ${money(shares.charShare)}`;
  if (payer === "user") return `${names.userName}請客，付了 ${money(shares.userShare)}`;
  return `各付各的：${names.userName} ${money(shares.userShare)}、${names.charName} ${money(shares.charShare)}`;
}

/**
 * 這一輪要給 AI 的約會說明（插在聊天紀錄最後面）；不需要時是空字串。
 * - 使用者約他、還沒回：請他答應或拒絕
 * - 約會中：地點、花費、誰付、事件、怎麼結束
 */
export function buildDateNote(session: DateSession | null, names: DateNames, includeEvent: boolean): string {
  if (!session) return "";
  const { userName, charName } = names;
  const vibe = session.vibe ? `（${session.vibe}）` : "";
  if (session.status === "invited" && session.startedBy === "user") {
    return [
      `【約會邀請】${userName}約${charName}去${session.place}${vibe}，大約 ${formatDuration(session.durationMinutes)}，兩個人大概要花 ${money(session.cost)}。`,
      `${charName}照自己的心情、行程和經濟狀況決定：答應就在 </content> 後面輸出 <date-accept/>，拒絕就輸出 <date-decline reason="拒絕的理由"/>。`,
    ].join("\n");
  }
  if (session.status !== "ongoing") return "";
  const lines = [
    `【約會中】${charName}和${userName}正在${session.place}約會${vibe}，預計 ${formatDuration(session.durationMinutes)}，這次總共要花 ${money(session.cost)}。`,
  ];
  if (session.payment) {
    lines.push(`已經付過錢了：${session.payment.note}。`);
  } else {
    lines.push(
      `還沒決定誰付錢。到了要付錢的時候，由${charName}決定，在 </content> 後面輸出 <date-pay payer="char|user|split"/>（char＝${charName}請客、user＝${userName}付、split＝各付一半）。`,
    );
  }
  if (includeEvent && session.event) lines.push(`【突發】${session.event.text}。自然地演出這件事。`);
  lines.push(`約會差不多該結束時，在 </content> 後面輸出 <date-end/>。`);
  return lines.join("\n");
}

/** 卡片那則訊息的文字（AI 讀得到，畫面上用卡片顯示） */
export function dateCardContent(card: DateCardData, names: DateNames): string {
  const { userName, charName } = names;
  const where = `${card.place}`;
  switch (card.kind) {
    case "invite": {
      const base = `（${userName}約${charName}去${where}約會`;
      if (card.status === "accepted") return `${base}，${charName}答應了）`;
      if (card.status === "declined") return `${base}，${charName}拒絕了${card.reason ? `：${card.reason}` : ""}）`;
      return `${base}，等${charName}回覆）`;
    }
    case "request": {
      const base = `（${charName}約${userName}去${where}${card.reason ? `：${card.reason}` : ""}`;
      if (card.status === "accepted") return `${base}。${userName}答應了）`;
      if (card.status === "declined") return `${base}。${userName}拒絕了）`;
      return `${base}）`;
    }
    case "started":
      return `（出發去${where}約會）`;
    case "ended":
      return `（${where}的約會結束了${card.paymentNote ? `，${card.paymentNote}` : ""}${card.recap ? `。${card.recap}` : ""}）`;
  }
}

/** 角色主動約出門的標籤說明（{{dateGuide}}，只在單人線上、沒有約會進行中時給） */
export const DATE_REQUEST_GUIDE =
  '- 約會：想約 {{user}} 出門時，在 </content> 後面輸出 <date-request place="地點" reason="想約的理由"/>（地點例如咖啡廳、電影院、水族館、夜市、遊樂園、海邊、高級餐廳、逛街，也可以是別的地方；看心情和時機，偶爾才約，不要常約）';
