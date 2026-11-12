/**
 * 小屋的貓：圖、三個數值（飽、乾淨、心情）、牠會做的事。
 * 這裡只有算的部分（不碰畫面、不碰存檔），好測。
 *
 * 省電：
 * - 圖是用程式畫的小 SVG，不載圖檔；三種花色共用同一套圖，只換顏色
 * - 數值不用計時器扣，只存「上次的值和時間」，要看的時候照時間差算
 * - 牠比他懶：每件事做 40～90 秒，大部分時間是靜止的
 */
import type { RoomId, Scene } from "./houseData";

// ===== 花色 =====

export type CatColor = "orange" | "tuxedo" | "gray";

export const CAT_COLORS: Record<CatColor, { name: string; palette: Record<string, string> }> = {
  orange: { name: "橘貓", palette: { o: "#3B2A26", b: "#F0A552", s: "#CC7A2B", w: "#FBF7EE", e: "#3B2A26", n: "#F29CA3", c: "#3B2A26" } },
  tuxedo: { name: "賓士貓", palette: { o: "#1F1D24", b: "#4A4954", s: "#4A4954", w: "#FBF7EE", e: "#F3D98B", n: "#F29CA3", c: "#1F1D24" } },
  gray: { name: "灰貓", palette: { o: "#3B2A26", b: "#B4B8C2", s: "#8D929E", w: "#FBF7EE", e: "#3B2A26", n: "#F29CA3", c: "#3B2A26" } },
};

export const CAT_COLOR_IDS = Object.keys(CAT_COLORS) as CatColor[];

// ===== 圖：18×12，面向右（向左走時整張左右翻），腳底在最下面一列的中間 =====

export const CAT_W = 18;
export const CAT_H = 12;

export type CatPose = "walk-a" | "walk-b" | "sit" | "sleep" | "eat";

/** o 外框、b 身體、s 花紋、w 白色（胸口、腳掌）、e 眼睛、n 鼻子、c 閉著的眼睛 */
export const CAT_ART: Record<CatPose, string[]> = {
  "walk-a": [
    "..........oo..oo..",
    ".o........obooobo.",
    "obo.......obbbbbo.",
    "obo.......obebbeo.",
    "obo..oooooobbbnbo.",
    "obo.obsbsbbbooooo.",
    ".obbbbbbbbbbbwo...",
    "..obbbbbbbbbbwo...",
    "..obbbbbbbbbbbo...",
    "..obooooooooobo...",
    "..owo.......owo...",
    "..ooo.......ooo...",
  ],
  "walk-b": [
    "..........oo..oo..",
    "..........obooobo.",
    ".o........obbbbbo.",
    "obo.......obebbeo.",
    "obo..oooooobbbnbo.",
    "obo.obsbsbbbooooo.",
    ".obbbbbbbbbbbwo...",
    "..obbbbbbbbbbwo...",
    "..obbbbbbbbbbbo...",
    "..ooobooooobooo...",
    "....owo...owo.....",
    "....ooo...ooo.....",
  ],
  sit: [
    "..........oo..oo..",
    "..........obooobo.",
    "..........obbbbbo.",
    "..........obebbeo.",
    ".........oobbbnbo.",
    ".......oobsbooooo.",
    "......obbbsbbwo...",
    ".....obbbbbbbwo...",
    ".....obbbbbbbwo...",
    "....obbbbbbbobo...",
    "....obbbbbbbowo...",
    "....ooooooooooo...",
  ],
  sleep: [
    "..................",
    "..................",
    "..................",
    "..................",
    "..................",
    "...........o...o..",
    "...oooooooobooobo.",
    "..obsbsbsbobbbbbo.",
    ".obbbbbbbbobcbbco.",
    ".obbbbbbbbobbbnbo.",
    ".obbbbbbbbbooooo..",
    "..ooooooooo.......",
  ],
  eat: [
    "..o...............",
    ".obo..............",
    "obo...............",
    "obo...............",
    "obo..ooooooo......",
    "obo.obsbsbbboo.oo.",
    ".obbbbbbbbbobooobo",
    "..obbbbbbbbobbbbbo",
    "..obbbbbbbbobebbeo",
    "..oooboooooobbbnbo",
    "....owo.....ooooo.",
    "....ooo...........",
  ],
};

/** 飼料碗（廚房地上）：空的、有飼料的 */
export const BOWL_ART: Record<"empty" | "full", string[]> = {
  empty: ["..........", "oooooooooo", "orrrrrrrro", ".orrrrrro.", "..oooooo.."],
  full: ["..okkkko..", "oooooooooo", "orrrrrrrro", ".orrrrrro.", "..oooooo.."],
};
export const BOWL_PALETTE: Record<string, string> = { o: "#3B2A26", r: "#E8627A", k: "#9A6A3A" };
/** 碗放在廚房的哪裡（房間格子，左上角）：冰箱前面的地上 */
export const BOWL_SPOT = { room: "kitchen" as RoomId, x: 106, y: 170 };

// ===== 數值：照時間差算 =====

export interface CatStat {
  /** 上次記下來的值（0～100） */
  v: number;
  /** 上次記下來的時間（毫秒） */
  at: number;
}

export type CatStatKey = "food" | "clean" | "mood";

export const CAT_STAT_NAMES: Record<CatStatKey, string> = { food: "飽", clean: "乾淨", mood: "心情" };

/** 從滿到空要多久（毫秒） */
export const CAT_DECAY_MS: Record<CatStatKey, number> = {
  food: 24 * 3_600_000,
  clean: 48 * 3_600_000,
  mood: 24 * 3_600_000,
};

/** 這個數值現在是多少。時間被往回調就當作沒變 */
export function statNow(stat: CatStat, key: CatStatKey, now: number): number {
  const elapsed = Math.max(0, now - stat.at);
  return Math.max(0, Math.min(100, stat.v - (elapsed / CAT_DECAY_MS[key]) * 100));
}

/** 加一些（或減一些），記下現在的時間 */
export function statAdd(stat: CatStat, key: CatStatKey, delta: number, now: number): CatStat {
  return { v: Math.max(0, Math.min(100, statNow(stat, key, now) + delta)), at: now };
}

export interface CatState {
  name: string;
  color: CatColor;
  food: CatStat;
  clean: CatStat;
  mood: CatStat;
}

export const CAT_NAME_MAX = 8;

/** 剛領養：都是八成 */
export function adoptCat(name: string, color: CatColor, now: number): CatState {
  const stat = { v: 80, at: now };
  return { name: cleanCatName(name) || CAT_COLORS[color].name, color, food: { ...stat }, clean: { ...stat }, mood: { ...stat } };
}

export function cleanCatName(name: string): string {
  return [...name.replace(/\s+/g, " ").trim()].slice(0, CAT_NAME_MAX).join("");
}

function parseStat(raw: unknown, now: number): CatStat {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const v = typeof r.v === "number" && Number.isFinite(r.v) ? Math.max(0, Math.min(100, r.v)) : 50;
  const at = typeof r.at === "number" && Number.isFinite(r.at) ? r.at : now;
  return { v, at };
}

/** 讀存檔：沒有貓、格式不對回傳 null */
export function parseCat(raw: unknown, now: number): CatState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.color !== "string" || !(r.color in CAT_COLORS)) return null;
  const color = r.color as CatColor;
  const name = typeof r.name === "string" ? cleanCatName(r.name) : "";
  return { name: name || CAT_COLORS[color].name, color, food: parseStat(r.food, now), clean: parseStat(r.clean, now), mood: parseStat(r.mood, now) };
}

/** 現在的三個數值（四捨五入） */
export function catLevels(cat: CatState, now: number): Record<CatStatKey, number> {
  return {
    food: Math.round(statNow(cat.food, "food", now)),
    clean: Math.round(statNow(cat.clean, "clean", now)),
    mood: Math.round(statNow(cat.mood, "mood", now)),
  };
}

/** 沒精神：太餓或心情太差。只會趴著，不玩、不蹭人、不叼東西。餵一次、摸一摸就好 */
export function catListless(levels: Record<CatStatKey, number>): boolean {
  return levels.food < 20 || levels.mood < 20;
}

// ===== 照顧 =====

export const CAT_FEED_COINS = 30;
export const CAT_FEED_GAIN = 60;
export const CAT_PET_GAIN = 6;
export const CAT_PLAY_GAIN = 18;
/** 洗完很乾淨，但牠不太高興 */
export const CAT_WASH_MOOD = -8;
/** 很乾淨就不用洗、很飽就不用餵 */
export const CAT_WASH_BELOW = 80;
export const CAT_FEED_BELOW = 90;

export type CatCare = "feed" | "wash" | "pet" | "play";

/** 照顧一下之後的貓（不檢查錢；錢在外面扣） */
export function careCat(cat: CatState, care: CatCare, now: number): CatState {
  if (care === "feed") return { ...cat, food: statAdd(cat.food, "food", CAT_FEED_GAIN, now) };
  if (care === "wash") return { ...cat, clean: { v: 100, at: now }, mood: statAdd(cat.mood, "mood", CAT_WASH_MOOD, now) };
  if (care === "pet") return { ...cat, mood: statAdd(cat.mood, "mood", CAT_PET_GAIN, now) };
  return { ...cat, mood: statAdd(cat.mood, "mood", CAT_PLAY_GAIN, now) };
}

// ===== 牠叼東西回來 =====

export const CAT_GIFT_DAILY_LIMIT = 2;
export const CAT_GIFT_CHANCE = 0.08;
export const CAT_GIFT_COINS: [number, number] = [10, 25];

/** 心情好、沒餓著的時候，換一件事時有小機會叼金幣回來。回傳金幣數，沒有回傳 0 */
export function rollCatGift(levels: Record<CatStatKey, number>, left: number, rand: () => number = Math.random): number {
  if (left <= 0 || levels.mood < 70 || levels.food < 40) return 0;
  if (rand() >= CAT_GIFT_CHANCE) return 0;
  const [lo, hi] = CAT_GIFT_COINS;
  return Math.min(hi, lo + Math.floor(rand() * (hi - lo + 1)));
}

// ===== 牠會做的事 =====

export interface CatActDef {
  room: RoomId;
  /** 腳的位置（房間格子，設計稿的預設擺法下） */
  x: number;
  y: number;
  /** 跟著哪件家具走（沙發、床、地毯） */
  anchor?: string;
  pose: "sit" | "sleep" | "eat";
  label: string;
  /** 原地跳（玩耍） */
  hop?: boolean;
}

/** 固定位置的事。「蹭他」和「跟著他」的位置是他現在在哪，另外算 */
export const CAT_ACTS: Record<string, CatActDef> = {
  "nap-sofa": { room: "living", x: 30, y: 236, anchor: "sofa", pose: "sleep", label: "在沙發上睡覺" },
  "nap-rug": { room: "living", x: 92, y: 272, anchor: "rug", pose: "sleep", label: "在地毯上打盹" },
  "sit-living": { room: "living", x: 30, y: 192, pose: "sit", label: "坐著發呆" },
  "play-living": { room: "living", x: 96, y: 184, pose: "sit", label: "自己玩", hop: true },
  "sit-kitchen": { room: "kitchen", x: 40, y: 186, pose: "sit", label: "看你們煮什麼" },
  eat: { room: "kitchen", x: 101, y: 176, pose: "eat", label: "吃飯" },
  "nap-bed": { room: "bedroom", x: 50, y: 230, anchor: "bed", pose: "sleep", label: "在床上睡覺" },
  "nap-bedroom-rug": { room: "bedroom", x: 46, y: 266, anchor: "rug", pose: "sleep", label: "在地毯上打盹" },
  "sit-bedroom": { room: "bedroom", x: 60, y: 174, pose: "sit", label: "坐著發呆" },
  "sit-bath": { room: "bath", x: 50, y: 248, anchor: "bath-mat", pose: "sit", label: "坐在浴墊上" },
};

/** 走到他旁邊蹭他（位置是他現在站的地方旁邊） */
export const CAT_RUB = "rub";
export const CAT_RUB_LABEL = "蹭蹭";

/** 白天、黃昏、晚上各做什麼的機率 */
export const CAT_WEIGHTS: Record<Scene, Record<string, number>> = {
  day: { "nap-sofa": 3, "nap-rug": 2, "nap-bedroom-rug": 2, "sit-living": 2, "sit-kitchen": 1, "sit-bedroom": 1, "sit-bath": 1, "play-living": 2, [CAT_RUB]: 3 },
  dusk: { "nap-sofa": 2, "nap-rug": 1, "sit-living": 2, "sit-kitchen": 3, "sit-bedroom": 1, "play-living": 2, [CAT_RUB]: 3 },
  night: { "nap-bed": 6, "nap-sofa": 3, "nap-rug": 2, "nap-bedroom-rug": 2, "sit-bedroom": 1 },
};

/** 沒精神時只做這些 */
const LISTLESS_ACTS = ["nap-sofa", "nap-rug", "nap-bedroom-rug"];

/**
 * 牠下一件事做什麼。
 * - 他在睡覺：跳上床一起睡
 * - 沒精神：只找地方趴著
 * - 他不在家：不蹭他
 */
export function pickCatAct(
  opts: { scene: Scene; current: string | null; residentAsleep: boolean; residentHome: boolean; listless: boolean },
  rand: () => number = Math.random,
): string {
  if (opts.residentAsleep) return "nap-bed";
  const weights = CAT_WEIGHTS[opts.scene];
  let keys = Object.keys(weights).filter((k) => k !== opts.current);
  if (!opts.residentHome) keys = keys.filter((k) => k !== CAT_RUB);
  if (opts.listless) keys = keys.filter((k) => LISTLESS_ACTS.includes(k));
  if (!keys.length) return LISTLESS_ACTS.find((k) => k !== opts.current) ?? LISTLESS_ACTS[0];
  const total = keys.reduce((sum, k) => sum + weights[k], 0);
  let r = rand() * total;
  for (const k of keys) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return keys[keys.length - 1];
}

/** 每件事做多久（毫秒）：40～90 秒；蹭他短一點；「少走動」再乘 4 倍 */
export function catDwellMs(act: string, rand: () => number = Math.random, calm = false): number {
  const base = act === CAT_RUB ? 12_000 + rand() * 10_000 : act === "eat" ? 8_000 : 40_000 + rand() * 50_000;
  return calm ? base * 4 : base;
}

/** 走路速度（房間格子／秒）：比他快一點 */
export const CAT_SPEED = 38;
