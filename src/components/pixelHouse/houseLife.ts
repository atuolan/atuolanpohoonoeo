/**
 * 小屋的「生活」存檔（localStorage，跟著備份走）：摸頭、他留的東西、家事、貓…這些玩法的進度。
 * 跟擺設（houseState.ts）分開存：這邊常常寫，不要每次都讓擺設那邊重讀。
 *
 * 省電的做法：會隨時間變的東西都只存「上次的時間」，打開小屋時用「現在 − 上次」算一次，
 * 不用計時器一直算；App 關著的時候什麼都不跑。
 */
import { emptyPetHome, parsePetHome, type PetHome } from "./petHome";
import { DIRT_FIRST, DIRT_INTERVAL_MS, parseDeeds, parseDirt, parseMail, type DeedKind, type DirtMap, type MailState } from "./houseChores";
import { parsePendingGifts, type PendingGift } from "./houseLines";

export interface HouseLifeState {
  /** 每日次數算的是哪一天（當地日期 YYYY-MM-DD） */
  day: string;
  /** 今天各種事做了幾次（換日清空）：key 是玩法自己取的名字 */
  daily: Record<string, number>;
  /** 上次存檔的時間（毫秒）：用來發現手機時間被往回調 */
  lastSeenAt: number;
  /** 他留下、還沒收的東西（每種最多一個） */
  gifts: PendingGift[];
  /** 現在有哪幾處髒污：id → 什麼時候出現的 */
  dirt: DirtMap;
  /** 髒污算到什麼時候（下一處從這裡再過一段時間才出現） */
  dirtAt: number;
  /** 信箱每天一封信：上次哪天領的、連續幾天 */
  mail: MailState;
  /** 養的貓和家裡的貓用品（貓糧、貓砂、貓砂盆、地上的便便、保險） */
  pets: PetHome;
  /** 他上次自己打掃完是什麼時候（毫秒；0 = 還沒掃過）：隔一段時間才會再掃 */
  choreAt: number;
  /** 在別的 App 做了什麼可以回小屋領獎勵：種類 → 哪一天做的 */
  deeds: Record<string, string>;
  /** 他忙完帶錢回來：最後一次發過的是哪一趟（聊天裡暫離的 id） */
  paidAway: string;
}

const STORAGE_KEY = "pixel_house_life";

/** 當地日期 YYYY-MM-DD */
export function dayKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

export function defaultHouseLifeState(now: Date = new Date()): HouseLifeState {
  return {
    day: dayKey(now),
    daily: {},
    lastSeenAt: now.getTime(),
    gifts: [],
    dirt: {},
    // 第一次打開就先有幾處可以掃
    dirtAt: now.getTime() - DIRT_FIRST * DIRT_INTERVAL_MS,
    mail: { last: "", streak: 0 },
    choreAt: 0,
    pets: emptyPetHome(now.getTime()),
    deeds: {},
    paidAway: "",
  };
}

/** 讀不到或格式不對的欄位用預設值 */
export function parseHouseLifeState(raw: unknown, now: Date = new Date()): HouseLifeState {
  const base = defaultHouseLifeState(now);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const daily: Record<string, number> = {};
  if (r.daily && typeof r.daily === "object" && !Array.isArray(r.daily)) {
    for (const [k, n] of Object.entries(r.daily as Record<string, unknown>)) {
      if (k && typeof n === "number" && Number.isFinite(n) && n > 0) daily[k] = Math.floor(n);
    }
  }
  return {
    day: typeof r.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.day) ? r.day : base.day,
    daily,
    lastSeenAt: typeof r.lastSeenAt === "number" && Number.isFinite(r.lastSeenAt) ? r.lastSeenAt : base.lastSeenAt,
    gifts: parsePendingGifts(r.gifts),
    dirt: parseDirt(r.dirt),
    dirtAt: typeof r.dirtAt === "number" && Number.isFinite(r.dirtAt) ? r.dirtAt : base.dirtAt,
    mail: parseMail(r.mail),
    // 舊版的 cat（只有一隻）會搬進 pets
    pets: parsePetHome(r.pets, r.cat, now.getTime()),
    choreAt: typeof r.choreAt === "number" && Number.isFinite(r.choreAt) && r.choreAt > 0 ? r.choreAt : 0,
    deeds: parseDeeds(r.deeds),
    paidAway: typeof r.paidAway === "string" ? r.paidAway : "",
  };
}

/** 手機時間被往回調了（現在比上次存的還早，容許一分鐘誤差）：這時候不發獎勵 */
export function clockWentBack(state: HouseLifeState, now: Date): boolean {
  return now.getTime() < state.lastSeenAt - 60_000;
}

/**
 * 換日了就清掉每日次數。時間被往回調時不清（不然往回調一天就能再領一次）。
 * 回傳新的狀態，不改原本的。
 */
export function rollDay(state: HouseLifeState, now: Date): HouseLifeState {
  if (clockWentBack(state, now)) return state;
  const today = dayKey(now);
  if (today === state.day) return state;
  return { ...state, day: today, daily: {} };
}

/** 今天這件事還可以做幾次 */
export function dailyLeft(state: HouseLifeState, key: string, limit: number): number {
  return Math.max(0, limit - (state.daily[key] ?? 0));
}

/**
 * 今天這件事做了 n 次（預設一次）。超過上限或時間被往回調就不算，回傳 null。
 * 成功回傳新的狀態（已經換好日、記好時間）。
 */
export function countDaily(state: HouseLifeState, key: string, limit: number, now: Date, n = 1): HouseLifeState | null {
  if (clockWentBack(state, now)) return null;
  const rolled = rollDay(state, now);
  if (dailyLeft(rolled, key, limit) < n) return null;
  return { ...rolled, daily: { ...rolled.daily, [key]: (rolled.daily[key] ?? 0) + n }, lastSeenAt: now.getTime() };
}

/**
 * 有每日上限的錢（打掃、打工）：想發 coins，今天剩多少額度就發多少（可能是 0）。
 * 回傳新的狀態和實際發的金額；時間被往回調就不發。
 */
export function payCapped(state: HouseLifeState, key: string, cap: number, coins: number, now: Date): { state: HouseLifeState; paid: number } {
  if (clockWentBack(state, now)) return { state, paid: 0 };
  const rolled = rollDay(state, now);
  const paid = Math.max(0, Math.min(Math.floor(coins), dailyLeft(rolled, key, cap)));
  const next = countDaily(rolled, key, cap, now, paid);
  return next && paid > 0 ? { state: next, paid } : { state: rolled, paid: 0 };
}

export function loadHouseLifeState(now: Date = new Date()): HouseLifeState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return parseHouseLifeState(saved ? JSON.parse(saved) : null, now);
  } catch {
    return defaultHouseLifeState(now);
  }
}

/** 只在「發生事情」時存（摸了、領了、掃了），不照時間存 */
export function saveHouseLifeState(state: HouseLifeState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存不了就只在這次開啟有效
  }
}

/**
 * 別的 App 做完一件可以回小屋領獎勵的事（完成番茄鐘、健身打卡）：記下今天做過了。
 * 只寫一筆存檔，不載入小屋的任何東西；錢等回到小屋才發。
 */
export function markHouseDeed(kind: DeedKind, now: Date = new Date()): void {
  const state = loadHouseLifeState(now);
  const today = dayKey(now);
  if (state.deeds[kind] === today) return;
  saveHouseLifeState({ ...state, deeds: { ...state.deeds, [kind]: today } });
}
