/**
 * 小屋的貓：圖、花色、個性、數值（飽、乾淨、心情、親密、訓練）、牠會做的事。
 * 家裡的東西（貓糧、貓砂、生病、看醫生）在 petHome.ts。
 * 這裡只有算的部分（不碰畫面、不碰存檔），好測。
 *
 * 省電：
 * - 圖是用程式畫的小 SVG，不載圖檔；三種花色共用同一套圖，只換顏色
 * - 數值不用計時器扣，只存「上次的值和時間」，要看的時候照時間差算
 * - 牠比他懶：每件事做 40～90 秒，大部分時間是靜止的
 */
import type { RoomId, Scene } from "./houseData";

// ===== 花色 =====

export type CatColor = "orange" | "tuxedo" | "gray" | "white" | "siamese";

export const CAT_COLORS: Record<CatColor, { name: string; palette: Record<string, string> }> = {
  orange: { name: "橘貓", palette: { o: "#3B2A26", b: "#F0A552", s: "#CC7A2B", w: "#FBF7EE", e: "#3B2A26", n: "#F29CA3", c: "#3B2A26" } },
  tuxedo: { name: "賓士貓", palette: { o: "#1F1D24", b: "#4A4954", s: "#4A4954", w: "#FBF7EE", e: "#F3D98B", n: "#F29CA3", c: "#1F1D24" } },
  gray: { name: "灰貓", palette: { o: "#3B2A26", b: "#B4B8C2", s: "#8D929E", w: "#FBF7EE", e: "#3B2A26", n: "#F29CA3", c: "#3B2A26" } },
  white: { name: "白貓", palette: { o: "#5B4A44", b: "#F6F2EA", s: "#E2DBCF", w: "#FFFFFF", e: "#5A8FD8", n: "#F29CA3", c: "#5B4A44" } },
  siamese: { name: "暹羅貓", palette: { o: "#3B2A26", b: "#EEDFC4", s: "#7A5A45", w: "#F8F0E0", e: "#5A8FD8", n: "#7A5A45", c: "#3B2A26" } },
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
  // 低頭吃飯：前後腳都踩在地上，頭低到碗的高度
  eat: [
    "..o...............",
    ".obo..............",
    "obo...............",
    "obo..ooooooo......",
    "obo.obsbsbbboo.oo.",
    ".obbbbbbbbbobooobo",
    "..obbbbbbbbobbbbbo",
    "..obbbbbbbbobebbeo",
    "..obbbbbbbbobbbnbo",
    "..oboooooboooooooo",
    "..owo...owo.......",
    "..ooo...ooo.......",
  ],
};

/** 飼料碗（廚房地上）：空的、有飼料的 */
export const BOWL_ART: Record<"empty" | "full", string[]> = {
  empty: ["..........", "oooooooooo", "orrrrrrrro", ".orrrrrro.", "..oooooo.."],
  full: ["..okkkko..", "oooooooooo", "orrrrrrrro", ".orrrrrro.", "..oooooo.."],
};
export const BOWL_PALETTE: Record<string, string> = { o: "#3B2A26", r: "#E8627A", k: "#9A6A3A" };
/** 碗放在廚房的哪裡（房間格子，左上角）：冰箱前面的地上（避開右邊換房間的箭頭） */
export const BOWL_SPOT = { room: "kitchen" as RoomId, x: 94, y: 186 };

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

/** 這個數值現在是多少。mult：掉得多快（個性、生病）。時間被往回調就當作沒變 */
export function statNow(stat: CatStat, key: CatStatKey, now: number, mult = 1): number {
  const elapsed = Math.max(0, now - stat.at);
  return Math.max(0, Math.min(100, stat.v - ((elapsed * mult) / CAT_DECAY_MS[key]) * 100));
}

/** 加一些（或減一些），記下現在的時間 */
export function statAdd(stat: CatStat, key: CatStatKey, delta: number, now: number, mult = 1): CatStat {
  return { v: Math.max(0, Math.min(100, statNow(stat, key, now, mult) + delta)), at: now };
}

// ===== 個性 =====

export type CatPersonality = "glutton" | "neat" | "clingy" | "lazy" | "playful";

export const CAT_PERSONALITIES: Record<CatPersonality, { name: string; desc: string }> = {
  glutton: { name: "貪吃", desc: "餓得比較快，貓糧用得比較兇" },
  neat: { name: "愛乾淨", desc: "貓砂盆有點髒就不想用，要常鏟" },
  clingy: { name: "黏人", desc: "很常去蹭人、跟著走；沒人理心情掉得快" },
  lazy: { name: "懶洋洋", desc: "大部分時間都在睡" },
  playful: { name: "好動", desc: "很愛玩、常跳上窗台" },
};
export const CAT_PERSONALITY_IDS = Object.keys(CAT_PERSONALITIES) as CatPersonality[];

export interface CatState {
  /** 每隻貓自己的 id（存檔、畫面用）；上線後不要改 */
  id: string;
  name: string;
  color: CatColor;
  personality: CatPersonality;
  food: CatStat;
  clean: CatStat;
  mood: CatStat;
  /** 親密度 0～100：摸、玩、餵零食會加，越高越常叼東西回來 */
  affinity: number;
  /** 上廁所的訓練度 0～100：越高越會自己去貓砂盆 */
  training: number;
  /** 什麼時候開始生病的（0 = 沒生病） */
  sickSince: number;
  /** 在醫院到什麼時候（這段時間不在家） */
  vetUntil: number;
  /** 健康檢查有效到什麼時候（有效時比較不會生病） */
  checkupUntil: number;
  /** 下次要上廁所的時間 */
  toiletAt: number;
}

/** 數值掉得多快：個性和生病會改 */
export function decayMult(cat: Pick<CatState, "personality" | "sickSince">, key: CatStatKey): number {
  let m = 1;
  if (key === "food" && cat.personality === "glutton") m *= 1.3;
  if (key === "clean" && cat.personality === "neat") m *= 0.8;
  if (key === "mood" && cat.personality === "clingy") m *= 1.2;
  if (key === "mood" && cat.personality === "playful") m *= 1.1;
  if (cat.sickSince && key !== "clean") m *= 1.5;
  return m;
}

/** 某個數值現在是多少（照這隻貓的個性、有沒有生病） */
export function catStat(cat: CatState, key: CatStatKey, now: number): number {
  return statNow(cat[key], key, now, decayMult(cat, key));
}

/** 把三個數值都記成「現在」的值：之後個性或生病改了，從這裡開始用新的速度算 */
export function reanchorCat(cat: CatState, now: number): CatState {
  const at = (key: CatStatKey): CatStat => ({ v: catStat(cat, key, now), at: now });
  return { ...cat, food: at("food"), clean: at("clean"), mood: at("mood") };
}

/** 改一個數值（加減），照這隻貓的速度算 */
export function catStatAdd(cat: CatState, key: CatStatKey, delta: number, now: number): CatState {
  return { ...cat, [key]: statAdd(cat[key], key, delta, now, decayMult(cat, key)) };
}

export const CAT_NAME_MAX = 8;

/** 上廁所的間隔：大約 6 小時（前後差 1 小時） */
export const TOILET_EVERY_MS = 6 * 3_600_000;
export function nextToiletAt(now: number, rand: () => number = Math.random): number {
  return now + TOILET_EVERY_MS + (rand() * 2 - 1) * 3_600_000;
}

/** 剛領養：數值都是八成、個性隨機、還沒訓練 */
export function adoptCat(name: string, color: CatColor, now: number, rand: () => number = Math.random, id?: string): CatState {
  const stat = { v: 80, at: now };
  const personality = CAT_PERSONALITY_IDS[Math.min(CAT_PERSONALITY_IDS.length - 1, Math.floor(rand() * CAT_PERSONALITY_IDS.length))];
  return {
    id: id ?? `cat-${now.toString(36)}-${Math.floor(rand() * 1e6).toString(36)}`,
    name: cleanCatName(name) || CAT_COLORS[color].name,
    color,
    personality,
    food: { ...stat },
    clean: { ...stat },
    mood: { ...stat },
    affinity: 10,
    training: 0,
    sickSince: 0,
    vetUntil: 0,
    checkupUntil: 0,
    toiletAt: nextToiletAt(now, rand),
  };
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

const num = (v: unknown, fallback: number, lo = -Infinity, hi = Infinity) =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;

/**
 * 讀存檔：沒有貓、格式不對回傳 null。
 * 舊版（只有一隻、沒有 id、個性、訓練度）的欄位補上預設值；個性照名字固定挑一個，每次讀都一樣。
 */
export function parseCat(raw: unknown, now: number, fallbackId = "cat-1"): CatState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.color !== "string" || !(r.color in CAT_COLORS)) return null;
  const color = r.color as CatColor;
  const name = (typeof r.name === "string" ? cleanCatName(r.name) : "") || CAT_COLORS[color].name;
  const personality =
    typeof r.personality === "string" && r.personality in CAT_PERSONALITIES
      ? (r.personality as CatPersonality)
      : CAT_PERSONALITY_IDS[[...name].reduce((h, ch) => h + ch.codePointAt(0)!, 0) % CAT_PERSONALITY_IDS.length];
  return {
    id: typeof r.id === "string" && r.id ? r.id.slice(0, 40) : fallbackId,
    name,
    color,
    personality,
    food: parseStat(r.food, now),
    clean: parseStat(r.clean, now),
    mood: parseStat(r.mood, now),
    affinity: num(r.affinity, 10, 0, 100),
    training: num(r.training, 0, 0, 100),
    sickSince: num(r.sickSince, 0, 0),
    vetUntil: num(r.vetUntil, 0, 0),
    checkupUntil: num(r.checkupUntil, 0, 0),
    toiletAt: num(r.toiletAt, now + TOILET_EVERY_MS),
  };
}

/** 現在的三個數值（四捨五入） */
export function catLevels(cat: CatState, now: number): Record<CatStatKey, number> {
  return {
    food: Math.round(catStat(cat, "food", now)),
    clean: Math.round(catStat(cat, "clean", now)),
    mood: Math.round(catStat(cat, "mood", now)),
  };
}

/** 沒精神：太餓、心情太差、生病。只會趴著，不玩、不蹭人、不叼東西 */
export function catListless(levels: Record<CatStatKey, number>, sick = false): boolean {
  return sick || levels.food < 20 || levels.mood < 20;
}

// ===== 照顧 =====

/** 吃一份貓糧加多少飽；飽低於這個才會去吃 */
export const KIBBLE_GAIN = 50;
export const KIBBLE_HUNGRY = 50;
/** 洗完很乾淨，但牠不太高興；很乾淨就不用洗 */
export const CAT_WASH_MOOD = -8;
export const CAT_WASH_BELOW = 80;

/**
 * 照顧：摸、玩、洗澡、餵罐頭、餵貓條。數字是 [飽, 心情, 親密]。
 * 貓糧不在這裡：牠們餓了自己去碗那邊吃。
 */
export const CAT_CARE_EFFECT = {
  pet: [0, 6, 2],
  play: [0, 18, 3],
  can: [40, 15, 3],
  treat: [5, 10, 6],
} as const;

export type CatCare = "pet" | "play" | "wash" | "can" | "treat";

/** 照顧一下之後的貓（不檢查庫存和錢；在外面扣） */
export function careCat(cat: CatState, care: CatCare, now: number): CatState {
  if (care === "wash") return catStatAdd({ ...cat, clean: { v: 100, at: now } }, "mood", CAT_WASH_MOOD, now);
  const [food, mood, aff] = CAT_CARE_EFFECT[care];
  let next = catStatAdd(cat, "mood", mood, now);
  if (food) next = catStatAdd(next, "food", food, now);
  return { ...next, affinity: Math.min(100, next.affinity + aff) };
}

/** 吃一份貓糧 */
export function eatKibble(cat: CatState, now: number): CatState {
  return catStatAdd(cat, "food", KIBBLE_GAIN, now);
}

// ===== 牠叼東西回來 =====

export const CAT_GIFT_DAILY_LIMIT = 2;
export const CAT_GIFT_CHANCE = 0.08;
export const CAT_GIFT_COINS: [number, number] = [10, 25];

/** 心情好、沒餓著、沒生病的時候，換一件事時有小機會叼金幣回來；越親越常。回傳金幣數，沒有回傳 0 */
export function rollCatGift(levels: Record<CatStatKey, number>, left: number, rand: () => number = Math.random, affinity = 50, sick = false): number {
  if (sick || left <= 0 || levels.mood < 70 || levels.food < 40) return 0;
  if (rand() >= CAT_GIFT_CHANCE * (0.5 + affinity / 100)) return 0;
  const [lo, hi] = CAT_GIFT_COINS;
  return Math.min(hi, lo + Math.floor(rand() * (hi - lo + 1)));
}

/** 叼東西回來時，有多少機會是商店沒賣的小擺件（還有沒拿到的才會） */
export const CAT_FIND_CHANCE = 0.3;

/** 這次叼回來的是哪件小擺件；不是擺件（叼金幣）回傳 null */
export function pickCatFind(unowned: ReadonlyArray<string>, rand: () => number = Math.random): string | null {
  if (!unowned.length || rand() >= CAT_FIND_CHANCE) return null;
  return unowned[Math.min(unowned.length - 1, Math.floor(rand() * unowned.length))];
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
  /** 在地板上面（窗台）：先走到下面，再跳上去；離開時先跳下來 */
  perch?: boolean;
}

/** 跳上窗台前、跳下來後站的地方（靠牆的地板） */
export const PERCH_FLOOR_Y = 162;
/** 跳一下多久（毫秒） */
export const CAT_JUMP_MS = 320;

/** 固定位置的事。「蹭他」和「跟著他」的位置是他現在在哪，另外算 */
export const CAT_ACTS: Record<string, CatActDef> = {
  "nap-sofa": { room: "living", x: 30, y: 236, anchor: "sofa", pose: "sleep", label: "在沙發上睡覺" },
  "nap-rug": { room: "living", x: 92, y: 272, anchor: "rug", pose: "sleep", label: "在地毯上打盹" },
  "sit-living": { room: "living", x: 30, y: 192, pose: "sit", label: "坐著發呆" },
  "play-living": { room: "living", x: 96, y: 184, pose: "sit", label: "自己玩", hop: true },
  "sit-kitchen": { room: "kitchen", x: 40, y: 186, pose: "sit", label: "看你們煮什麼" },
  eat: { room: "kitchen", x: 89, y: 192, pose: "eat", label: "吃飯" },
  "nap-bed": { room: "bedroom", x: 50, y: 230, anchor: "bed", pose: "sleep", label: "在床上睡覺" },
  "nap-bedroom-rug": { room: "bedroom", x: 46, y: 266, anchor: "rug", pose: "sleep", label: "在地毯上打盹" },
  "sit-bedroom": { room: "bedroom", x: 60, y: 174, pose: "sit", label: "坐著發呆" },
  "sit-bath": { room: "bath", x: 50, y: 248, anchor: "bath-mat", pose: "sit", label: "坐在浴墊上" },
  // 窗台：盆栽和花瓶中間那一小塊（跟著窗戶走）
  "sill-living": { room: "living", x: 38, y: 91, anchor: "window", pose: "sit", label: "在窗台看外面", perch: true },
  "sill-bedroom": { room: "bedroom", x: 67, y: 87, anchor: "window", pose: "sit", label: "在窗台看外面", perch: true },
};

/** 走到他旁邊蹭他（位置是他現在站的地方旁邊） */
export const CAT_RUB = "rub";
export const CAT_RUB_LABEL = "蹭蹭";
/** 跟著他走：他走到哪、牠跟到哪（他每走一段才重新找路，不是一直算） */
export const CAT_FOLLOW = "follow";
export const CAT_FOLLOW_LABEL = "跟在旁邊";

/** 白天、黃昏、晚上各做什麼的機率 */
export const CAT_WEIGHTS: Record<Scene, Record<string, number>> = {
  day: { "nap-sofa": 3, "nap-rug": 2, "nap-bedroom-rug": 2, "sit-living": 1, "sit-kitchen": 1, "sit-bedroom": 1, "sit-bath": 1, "play-living": 2, "sill-living": 2, "sill-bedroom": 2, [CAT_RUB]: 2, [CAT_FOLLOW]: 2 },
  dusk: { "nap-sofa": 2, "nap-rug": 1, "sit-living": 1, "sit-kitchen": 3, "sit-bedroom": 1, "play-living": 2, "sill-living": 2, "sill-bedroom": 1, [CAT_RUB]: 2, [CAT_FOLLOW]: 2 },
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
/** 個性：哪些事比較常做（乘幾倍） */
const PERSONALITY_BIAS: Record<CatPersonality, (key: string) => number> = {
  glutton: (k) => (k === "sit-kitchen" ? 3 : 1),
  neat: () => 1,
  clingy: (k) => (k === CAT_RUB || k === CAT_FOLLOW ? 2.5 : 1),
  lazy: (k) => (k.startsWith("nap-") ? 2.5 : k === "play-living" || k.startsWith("sill-") ? 0.4 : 1),
  playful: (k) => (k === "play-living" ? 3 : k.startsWith("sill-") ? 1.8 : k.startsWith("nap-") ? 0.6 : 1),
};

export function pickCatAct(
  opts: { scene: Scene; current: string | null; residentAsleep: boolean; residentHome: boolean; listless: boolean; personality?: CatPersonality },
  rand: () => number = Math.random,
): string {
  if (opts.residentAsleep) return "nap-bed";
  const bias = opts.personality ? PERSONALITY_BIAS[opts.personality] : () => 1;
  const weights = Object.fromEntries(Object.entries(CAT_WEIGHTS[opts.scene]).map(([k, w]) => [k, w * bias(k)]));
  let keys = Object.keys(weights).filter((k) => k !== opts.current);
  if (!opts.residentHome) keys = keys.filter((k) => k !== CAT_RUB && k !== CAT_FOLLOW);
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
  const base =
    act === CAT_RUB ? 12_000 + rand() * 10_000 : act === "eat" ? 8_000 : act === CAT_FOLLOW ? 30_000 + rand() * 30_000 : 40_000 + rand() * 50_000;
  return calm ? base * 4 : base;
}

/** 走路速度（房間格子／秒）：比他快一點 */
export const CAT_SPEED = 38;
