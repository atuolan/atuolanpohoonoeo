/**
 * 小屋的「生活」存檔（localStorage，跟著備份走）：摸頭、他留的東西、家事、貓…這些玩法的進度。
 * 跟擺設（houseState.ts）分開存：這邊常常寫，不要每次都讓擺設那邊重讀。
 *
 * 省電的做法：會隨時間變的東西都只存「上次的時間」，打開小屋時用「現在 − 上次」算一次，
 * 不用計時器一直算；App 關著的時候什麼都不跑。
 */
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
}

const STORAGE_KEY = "pixel_house_life";

/** 當地日期 YYYY-MM-DD */
export function dayKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

export function defaultHouseLifeState(now: Date = new Date()): HouseLifeState {
  return { day: dayKey(now), daily: {}, lastSeenAt: now.getTime(), gifts: [] };
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
