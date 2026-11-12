/**
 * 小屋的家事和每日收入：房間會髒（你點掉或他自己掃）、信箱每天一封信、他忙完帶錢回來、
 * 番茄鐘和健身的獎勵。這裡只有算的部分（不碰畫面、不碰存檔），好測。
 *
 * 省電：髒污不用計時器長出來，只記「上次算到什麼時候」，打開小屋時用時間差補上。
 */
import type { ActDef, Pose, RoomId } from "./houseData";
import { dayKey } from "./houseLife";

// ===== 髒污 =====

export type DirtKind = "dishes" | "dust" | "crumbs" | "clothes" | "paper" | "puddle" | "laundry";

export interface DirtDef {
  id: string;
  room: RoomId;
  kind: DirtKind;
  /** 髒污左上角（房間格子，設計稿的預設擺法下） */
  x: number;
  y: number;
  /** 跟著哪件家具走（碗在水槽、衣服在洗衣籃）；沒有就是地板上固定的位置 */
  anchor?: string;
  /** 他去清的時候站哪（腳的位置）和姿勢 */
  stand: [number, number];
  pose: Pose;
  /** 他在清的時候顯示的字、清完說的話 */
  doing: string;
  done: string;
}

/** 每間最多三處。id 上線後不要改（存檔記的是 id） */
export const DIRT: DirtDef[] = [
  { id: "k-dishes", room: "kitchen", kind: "dishes", x: 23, y: 120, anchor: "faucet", stand: [27, 158], pose: "back", doing: "洗碗中", done: "碗洗好了" },
  { id: "k-crumbs", room: "kitchen", kind: "crumbs", x: 54, y: 188, stand: [74, 192], pose: "stand", doing: "掃地中", done: "廚房掃好了" },
  { id: "k-spill", room: "kitchen", kind: "puddle", x: 92, y: 168, stand: [82, 174], pose: "stand", doing: "擦地板", done: "地板擦乾了" },
  { id: "l-dust-a", room: "living", kind: "dust", x: 18, y: 180, stand: [38, 186], pose: "stand", doing: "掃地中", done: "客廳掃好了" },
  { id: "l-dust-b", room: "living", kind: "dust", x: 84, y: 194, stand: [70, 200], pose: "stand", doing: "掃地中", done: "灰塵掃掉了" },
  { id: "l-socks", room: "living", kind: "clothes", x: 46, y: 174, stand: [66, 180], pose: "stand", doing: "收衣服", done: "衣服收好了" },
  { id: "b-clothes", room: "bedroom", kind: "clothes", x: 18, y: 166, stand: [38, 172], pose: "stand", doing: "收衣服", done: "衣服收好了" },
  { id: "b-paper", room: "bedroom", kind: "paper", x: 82, y: 168, stand: [96, 174], pose: "stand", doing: "撿紙團", done: "紙團丟掉了" },
  { id: "b-dust", room: "bedroom", kind: "dust", x: 78, y: 196, stand: [96, 202], pose: "stand", doing: "掃地中", done: "臥室掃好了" },
  { id: "t-puddle", room: "bath", kind: "puddle", x: 38, y: 176, stand: [60, 182], pose: "stand", doing: "擦地板", done: "水擦乾了" },
  { id: "t-laundry", room: "bath", kind: "laundry", x: 101, y: 213, anchor: "laundry-basket", stand: [88, 248], pose: "stand", doing: "洗衣服", done: "衣服洗好了" },
  { id: "t-foam", room: "bath", kind: "puddle", x: 78, y: 198, stand: [100, 204], pose: "stand", doing: "擦地板", done: "浴室擦好了" },
];

export const DIRT_BY_ID: Record<string, DirtDef> = Object.fromEntries(DIRT.map((d) => [d.id, d]));

/** 你點髒污時提示列寫的話（種類 → 動作） */
export const DIRT_USER_DONE: Record<DirtKind, string> = {
  dishes: "碗洗好了",
  dust: "灰塵掃掉了",
  crumbs: "碎屑掃掉了",
  clothes: "衣服收好了",
  paper: "紙團丟掉了",
  puddle: "擦乾了",
  laundry: "衣服洗好了",
};

/** 多久多一處髒污 */
export const DIRT_INTERVAL_MS = 4 * 60 * 60 * 1000;
/** 第一次打開小屋時先有幾處（有事可做） */
export const DIRT_FIRST = 3;
/** 打掃的錢：你點的、他掃的 [最少, 最多] */
export const CLEAN_COINS = { user: [30, 50], resident: [20, 30] } as const;
/** 打掃一天最多賺多少（你點的和他掃的合起來算） */
export const CLEAN_DAILY_CAP = 400;

/** 髒污 id → 什麼時候出現的（毫秒） */
export type DirtMap = Record<string, number>;

/**
 * 照過了多久補上新的髒污。回傳新的髒污和「算到什麼時候」。
 * - 每 DIRT_INTERVAL_MS 多一處，隨機挑還沒髒的地方；全部都髒了就不再累積
 * - 時間被往回調：不長，從現在重新算起
 */
export function accrueDirt(dirt: DirtMap, dirtAt: number, now: number, rand: () => number = Math.random): { dirt: DirtMap; dirtAt: number } {
  if (now < dirtAt) return { dirt, dirtAt: now };
  const due = Math.floor((now - dirtAt) / DIRT_INTERVAL_MS);
  if (due <= 0) return { dirt, dirtAt };
  const absent = DIRT.map((d) => d.id).filter((id) => !(id in dirt));
  const next = { ...dirt };
  let added = 0;
  while (added < due && absent.length) {
    const i = Math.min(absent.length - 1, Math.floor(rand() * absent.length));
    const [id] = absent.splice(i, 1);
    added++;
    // 出現的時間照順序排（第幾輪）
    next[id] = dirtAt + added * DIRT_INTERVAL_MS;
  }
  // 全部都髒了：不把多的時間存起來（清掉一處後要再等一輪才會再髒）
  return { dirt: next, dirtAt: absent.length ? dirtAt + due * DIRT_INTERVAL_MS : now };
}

/** 讀存檔：只留認得的髒污 */
export function parseDirt(raw: unknown): DirtMap {
  const out: DirtMap = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, at] of Object.entries(raw as Record<string, unknown>)) {
    if (DIRT_BY_ID[id] && typeof at === "number" && Number.isFinite(at)) out[id] = at;
  }
  return out;
}

export function cleanCoins(by: "user" | "resident", rand: () => number = Math.random): number {
  const [lo, hi] = CLEAN_COINS[by];
  return Math.min(hi, lo + Math.floor(rand() * (hi - lo + 1)));
}

// ===== 他自己打掃 =====

const CHORE_PREFIX = "clean:";
/** 他挑下一件事時，有髒污的話多少機會去打掃 */
export const CHORE_CHANCE = 0.2;
/** 小屋打開（或回到前景）多久之後他才會開始打掃：留時間給你自己點 */
export const CHORE_WAIT_MS = 45_000;
/** 他掃完一處之後，隔多久才會再掃下一處 */
export const CHORE_GAP_MS = 4 * 60 * 60 * 1000;

export function choreKey(dirtId: string): string {
  return CHORE_PREFIX + dirtId;
}

/** 這個動作是在清哪一處（不是打掃的動作回傳 null） */
export function choreDirtId(actKey: string): string | null {
  return actKey.startsWith(CHORE_PREFIX) ? actKey.slice(CHORE_PREFIX.length) : null;
}

/** 打掃的動作：站哪、什麼姿勢、顯示什麼字（跟 houseData 的 ACTS 同一種格式） */
export function choreAct(actKey: string): ActDef | undefined {
  const id = choreDirtId(actKey);
  const d = id ? DIRT_BY_ID[id] : undefined;
  if (!d) return undefined;
  return { room: d.room, x: d.stand[0], y: d.stand[1], anchor: d.anchor, pose: d.pose, label: d.doing };
}

/**
 * 他要不要去打掃、掃哪一處。回傳動作的 key，不掃回傳 null。
 * 晚上不掃；剛打開小屋不掃；上次掃完還沒隔夠久不掃；有機率；同一間的優先（比較像順手收一下）。
 */
export function pickChore(
  dirt: DirtMap,
  opts: { night: boolean; openMs: number; sinceLastMs: number; room: RoomId | null; current: string | null },
  rand: () => number = Math.random,
): string | null {
  if (opts.night || opts.openMs < CHORE_WAIT_MS || opts.sinceLastMs < CHORE_GAP_MS) return null;
  const ids = Object.keys(dirt).filter((id) => DIRT_BY_ID[id] && choreKey(id) !== opts.current);
  if (!ids.length || rand() >= CHORE_CHANCE) return null;
  const same = ids.filter((id) => DIRT_BY_ID[id].room === opts.room);
  const pool = same.length && rand() < 0.6 ? same : ids;
  return choreKey(pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]);
}

// ===== 信箱每天一封信 =====

export interface MailState {
  /** 上次領信是哪一天（YYYY-MM-DD；空字串 = 還沒領過） */
  last: string;
  /** 連續幾天 */
  streak: number;
}

export const MAIL_COINS = 50;
export const MAIL_WEEK_COINS = 300;

/** 今天的信領了沒 */
export function mailWaiting(mail: MailState, now: Date): boolean {
  return mail.last !== dayKey(now);
}

/**
 * 領今天的信。今天領過了回傳 null。
 * 昨天有領就連續 +1，斷了從 1 開始；每滿 7 天那封比較多。
 */
export function claimMail(mail: MailState, now: Date): { mail: MailState; coins: number } | null {
  const today = dayKey(now);
  if (mail.last === today) return null;
  const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const streak = mail.last === yesterday ? mail.streak + 1 : 1;
  return { mail: { last: today, streak }, coins: streak % 7 === 0 ? MAIL_WEEK_COINS : MAIL_COINS };
}

export function parseMail(raw: unknown): MailState {
  if (!raw || typeof raw !== "object") return { last: "", streak: 0 };
  const r = raw as Record<string, unknown>;
  const last = typeof r.last === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.last) ? r.last : "";
  const streak = typeof r.streak === "number" && Number.isFinite(r.streak) && r.streak > 0 ? Math.floor(r.streak) : 0;
  return { last, streak: last ? Math.max(1, streak) : 0 };
}

// ===== 他忙完帶錢回來 =====

export const WORK_COINS_PER_HOUR = 30;
export const WORK_MAX_COINS = 240;
export const WORK_DAILY_CAP = 480;
/** 不到這麼久不算 */
export const WORK_MIN_MS = 10 * 60 * 1000;
/** 回來超過這麼久才看到的不補發（剛更新時不會把很久以前的都算進來） */
const WORK_STALE_MS = 24 * 60 * 60 * 1000;

/** 聊天裡的暫離紀錄，只看這裡用到的欄位 */
export interface AwayLike {
  id: string;
  startedAt: number;
  endedAt?: number;
  kind?: string;
}

/**
 * 他在聊天裡「在忙」或「暫離」結束了，這趟帶回多少錢。
 * 睡覺不算；還沒回來、已經發過、太短、太久以前的都是 0。
 */
export function workPay(away: AwayLike | undefined, paidId: string, now: number): number {
  if (!away || !away.endedAt || away.id === paidId) return 0;
  if (away.kind === "sleep") return 0;
  if (now - away.endedAt > WORK_STALE_MS || away.endedAt > now + 60_000) return 0;
  const ms = away.endedAt - away.startedAt;
  if (ms < WORK_MIN_MS) return 0;
  return Math.min(WORK_MAX_COINS, Math.floor((ms / 3_600_000) * WORK_COINS_PER_HOUR));
}

// ===== 番茄鐘、健身的獎勵 =====

export type DeedKind = "pomodoro" | "fitness";
export const DEED_COINS = 40;
export const DEED_NAMES: Record<DeedKind, string> = { pomodoro: "完成一個番茄鐘", fitness: "健身打卡" };

/** 今天做了、還沒領的 */
export function deedsToClaim(deeds: Record<string, string>, daily: Record<string, number>, now: Date): DeedKind[] {
  const today = dayKey(now);
  return (Object.keys(DEED_NAMES) as DeedKind[]).filter((k) => deeds[k] === today && !daily[`deed:${k}`]);
}

export function parseDeeds(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, day] of Object.entries(raw as Record<string, unknown>)) {
    if (k in DEED_NAMES && typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)) out[k] = day;
  }
  return out;
}

// ===== 圖（用程式畫，不用另外載圖檔） =====

const INK = "#3B2A26";

export const DIRT_ART: Record<DirtKind, { rows: string[]; palette: Record<string, string> }> = {
  // 一疊盤子和一個杯子
  dishes: {
    rows: [
      "...ooooooo...",
      "..owwwwwwwo..",
      ".oooooooooo..",
      ".owwwwwwwwooo",
      "oooooooooooco",
      "owwwwwwwwwoco",
      "oooooooooooo.",
      ".owwwwwwwwo..",
      "..oooooooo...",
    ],
    palette: { o: INK, w: "#FBF7EE", c: "#9CC7E6" },
  },
  // 灰塵球
  dust: {
    rows: [
      "....ooo......",
      "..oogggoo.oo.",
      ".oggggggoogo.",
      "ogghgggggggo.",
      "oggggghggggo.",
      ".ogggggggoo..",
      "..ooooooo....",
    ],
    palette: { o: "#5A4E48", g: "#B9B0A8", h: "#E2DCD6" },
  },
  // 碎屑
  crumbs: {
    rows: [
      ".bb....c....",
      ".bb.b......b",
      "......bb....",
      "c..b..bb..c.",
      "....b.....b.",
      ".b......c...",
    ],
    palette: { b: "#6B4226", c: "#E9C98F" },
  },
  // 丟在地上的衣服
  clothes: {
    rows: [
      "...ooooo.....",
      "..oppppo.ooo.",
      ".oppppppoppo.",
      "oppwwpppppppo",
      "opppppppwwppo",
      ".oppppppppoo.",
      "..oooppppo...",
      ".....oooo....",
    ],
    palette: { o: INK, p: "#F4A9B8", w: "#FBF7EE" },
  },
  // 紙團
  paper: {
    rows: [
      "..oooo..",
      ".owwgwo.",
      "owwgwwwo",
      "owgwwgwo",
      "owwwgwwo",
      ".owgwwo.",
      "..oooo..",
    ],
    palette: { o: INK, w: "#FBF7EE", g: "#CFC5B5" },
  },
  // 一灘水
  puddle: {
    rows: [
      "...oooooooo...",
      ".oobbbbbbbboo.",
      "obbwwbbbbbbbbo",
      "obbbbbbbbwbbbo",
      ".oobbbbbbbboo.",
      "...oooooooo...",
    ],
    palette: { o: "#4F8DB8", b: "#A9D4EE", w: "#F2FAFF" },
  },
  // 洗衣籃滿出來的衣服
  laundry: {
    rows: [
      "....ooo..ooo..",
      "...oyyyooqqqo.",
      "..oyyyyyoqqqqo",
      ".oyyyyyyyqqqqo",
      "oyywyyyyyqqwqo",
      "oyyyyyyyyqqqqo",
      "oooooooooooooo",
    ],
    palette: { o: INK, y: "#F3D98B", q: "#9ED3A5", w: "#FBF7EE" },
  },
};
