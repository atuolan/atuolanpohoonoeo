/**
 * 小屋的寵物（貓、狗、倉鼠；名字沿用 Cat，是因為一開始只有貓）：圖、花色、個性、數值（飽、乾淨、心情、親密、訓練）、牠會做的事。
 * 狗和倉鼠的圖在 petArt.ts；用品、價錢、幾隻在 petHome.ts。
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

// ===== 種類 =====

/** 貓、狗、雪貂會在家裡走來走去；倉鼠、天竺鼠、蜜袋鼯、蛇住籠子（飼養箱） */
export type PetSpecies = "cat" | "dog" | "ferret" | "hamster" | "guineaPig" | "glider" | "snake";
export const PET_SPECIES_IDS: PetSpecies[] = ["cat", "dog", "ferret", "hamster", "guineaPig", "glider", "snake"];
export const SPECIES_NAMES: Record<PetSpecies, string> = {
  cat: "貓",
  dog: "狗",
  ferret: "雪貂",
  hamster: "倉鼠",
  guineaPig: "天竺鼠",
  glider: "蜜袋鼯",
  snake: "蛇",
};
/** 住籠子的（不在家裡走） */
export const CAGED_SPECIES: PetSpecies[] = ["hamster", "guineaPig", "glider", "snake"];
export const isCaged = (species: PetSpecies) => CAGED_SPECIES.includes(species);

export type DogColor = "shiba" | "black" | "white" | "brown";
export type HamsterColor = "golden" | "gray" | "pearl";
export type FerretColor = "sable" | "albino" | "silver";
export type GuineaColor = "ginger" | "panda" | "cream";
export type GliderColor = "classic" | "white" | "cream";
export type SnakeColor = "corn" | "ball" | "green";
export type PetColor = CatColor | DogColor | HamsterColor | FerretColor | GuineaColor | GliderColor | SnakeColor;

type ColorTable<K extends string> = Record<K, { name: string; palette: Record<string, string> }>;

export const FERRET_COLORS: ColorTable<FerretColor> = {
  sable: {
    name: "貂色",
    palette: { o: "#261B21", d: "#3F2F34", s: "#604B4D", b: "#826966", h: "#9C817C", l: "#BEA29A", v: "#D7BEB4", w: "#F0DED4", p: "#E2929E", x: "#FFFFFF" },
  },
  albino: {
    name: "白化",
    palette: { o: "#6B5A52", d: "#CDBBA2", s: "#DCCDB6", b: "#E8DCC8", h: "#EFE5D4", l: "#F5EDE1", v: "#F9F4EC", w: "#FFFFFF", p: "#F2A0AC", x: "#FFFFFF" },
  },
  silver: {
    name: "銀灰",
    palette: { o: "#2B2830", d: "#4F4C57", s: "#73707C", b: "#97949E", h: "#AFADB6", l: "#C8C6CD", v: "#DCDADF", w: "#F4F2F2", p: "#E8A0AC", x: "#FFFFFF" },
  },
};

export const GUINEA_COLORS: ColorTable<GuineaColor> = {
  ginger: { name: "橘白", palette: { o: "#4A3328", b: "#E8A35A", s: "#FBF1DE", w: "#FBF1DE", e: "#2A1A14", n: "#E89AA0", c: "#4A3328", h: "#9BBF5A" } },
  panda: { name: "黑白", palette: { o: "#2A2730", b: "#4A4954", s: "#FBF7EE", w: "#FBF7EE", e: "#F3D98B", n: "#E89AA0", c: "#2A2730", h: "#9BBF5A" } },
  cream: { name: "奶油", palette: { o: "#6B5A52", b: "#F4DDB0", s: "#FFFFFF", w: "#FFFFFF", e: "#2A1A14", n: "#E89AA0", c: "#6B5A52", h: "#9BBF5A" } },
};

export const GLIDER_COLORS: ColorTable<GliderColor> = {
  classic: { name: "經典灰", palette: { o: "#3F3A40", b: "#B4B8C2", s: "#3F3A40", w: "#FBF7EE", e: "#1F1D24", n: "#F29CA3", c: "#3F3A40" } },
  white: { name: "白面", palette: { o: "#6B6470", b: "#EFEDF2", s: "#9A96A2", w: "#FFFFFF", e: "#1F1D24", n: "#F29CA3", c: "#6B6470" } },
  cream: { name: "奶油", palette: { o: "#5B4A44", b: "#E8D2B0", s: "#8A6A4E", w: "#FBF7EE", e: "#1F1D24", n: "#F29CA3", c: "#5B4A44" } },
};

export const SNAKE_COLORS: ColorTable<SnakeColor> = {
  corn: { name: "玉米蛇", palette: { o: "#5A2A1E", b: "#E8834A", s: "#C2452E", w: "#F6D9A8", e: "#1F1D24", t: "#D9453A", c: "#5A2A1E" } },
  ball: { name: "球蟒", palette: { o: "#2E2620", b: "#B88A52", s: "#4A3A2A", w: "#E8D8B0", e: "#1F1D24", t: "#D9453A", c: "#2E2620" } },
  green: { name: "綠樹蟒", palette: { o: "#2E3B22", b: "#7FB04A", s: "#4F7A2E", w: "#E8E2A6", e: "#1F1D24", t: "#D9453A", c: "#2E3B22" } },
};

export const DOG_COLORS: Record<DogColor, { name: string; palette: Record<string, string> }> = {
  shiba: { name: "柴犬", palette: { o: "#3B2A26", b: "#E39A4F", s: "#B86E2E", w: "#FBF1DE", e: "#3B2A26", n: "#3B2A26", c: "#3B2A26" } },
  black: { name: "黑柴", palette: { o: "#1F1D24", b: "#3E3A45", s: "#2A2730", w: "#E9C99A", e: "#F3D98B", n: "#1F1D24", c: "#E9C99A" } },
  white: { name: "白狗", palette: { o: "#5B4A44", b: "#F6F2EA", s: "#E2DBCF", w: "#FFFFFF", e: "#3B2A26", n: "#3B2A26", c: "#5B4A44" } },
  brown: { name: "米克斯", palette: { o: "#3B2A26", b: "#A87850", s: "#7E5534", w: "#F1E2C6", e: "#3B2A26", n: "#3B2A26", c: "#3B2A26" } },
};

export const HAMSTER_COLORS: Record<HamsterColor, { name: string; palette: Record<string, string> }> = {
  golden: { name: "黃金鼠", palette: { o: "#4A3328", b: "#F2B866", w: "#FFF6E6", e: "#2A1A14", n: "#F29CA3", c: "#4A3328", s: "#8A5A33" } },
  gray: { name: "三線鼠", palette: { o: "#3F3A40", b: "#A9A9B3", w: "#F4F1EC", e: "#1F1D24", n: "#F29CA3", c: "#3F3A40", s: "#8A5A33" } },
  pearl: { name: "白熊鼠", palette: { o: "#6B5A52", b: "#F7F0E2", w: "#FFFFFF", e: "#C2405A", n: "#F29CA3", c: "#6B5A52", s: "#8A5A33" } },
};

export const SPECIES_COLORS: Record<PetSpecies, Record<string, { name: string; palette: Record<string, string> }>> = {
  cat: CAT_COLORS,
  dog: DOG_COLORS,
  ferret: FERRET_COLORS,
  hamster: HAMSTER_COLORS,
  guineaPig: GUINEA_COLORS,
  glider: GLIDER_COLORS,
  snake: SNAKE_COLORS,
};

export function colorName(species: PetSpecies, color: string): string {
  return SPECIES_COLORS[species][color]?.name ?? SPECIES_NAMES[species];
}

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

/** 個性的說明（狗、倉鼠沒有貓砂盆，愛乾淨、黏人說的不一樣） */
export function personalityDesc(species: PetSpecies, p: CatPersonality): string {
  if (species === "dog") {
    if (p === "neat") return "身上比較不容易髒";
    if (p === "playful") return "很愛玩球，常常跑來跑去";
  }
  if (species === "hamster") {
    if (p === "neat") return "籠子比較不容易髒";
    if (p === "clingy") return "很快就跟你熟，沒人理心情掉得快";
    if (p === "lazy") return "晚上也常在睡，比較少跑滾輪";
    if (p === "playful") return "晚上一直跑滾輪";
  }
  if (species === "ferret") {
    if (p === "neat") return "味道比較淡，比較不容易髒";
    if (p === "playful") return "醒著的時候很常偷東西藏起來";
    if (p === "lazy") return "比一般雪貂還會睡";
  }
  if (species === "guineaPig") {
    if (p === "neat") return "籠子比較不容易髒";
    if (p === "playful") return "開心的時候常常原地跳起來";
    if (p === "glutton") return "牧草吃得特別兇，常常嗶嗶叫討菜";
  }
  if (species === "glider") {
    if (p === "clingy") return "特別愛黏人，常常跑到身上";
    if (p === "lazy") return "晚上也常窩在睡袋裡";
    if (p === "playful") return "晚上在籠子裡爬來爬去";
  }
  if (species === "snake") {
    if (p === "glutton") return "比較常餓";
    if (p === "clingy") return "很喜歡被拿出來摸";
    if (p === "lazy") return "幾乎都盤著不動";
    if (p === "playful") return "常常在飼養箱裡伸長身子探險";
  }
  return CAT_PERSONALITIES[p].desc;
}

export interface CatState {
  /** 每隻貓自己的 id（存檔、畫面用）；上線後不要改 */
  id: string;
  /** 貓、狗、倉鼠（舊存檔沒有這欄 = 貓） */
  species: PetSpecies;
  name: string;
  /** 花色：照種類不同（貓 CAT_COLORS、狗 DOG_COLORS、倉鼠 HAMSTER_COLORS） */
  color: PetColor;
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
  /** 下次要上廁所的時間（倉鼠不用） */
  toiletAt: number;
  /** 狗：上次散步的時間（領養時算一次） */
  walkedAt: number;
  /** 天竺鼠：上次吃到蔬菜的時間（自己不會做維他命 C，太久沒吃容易生病） */
  vegAt: number;
  /** 蛇：保溫燈的燈泡用到什麼時候（過了要換一顆） */
  lampUntil: number;
  /** 蛇：下次蛻皮的時間 */
  shedAt: number;
  /** 狗：出門散步到什麼時候（這段時間不在家） */
  outUntil: number;
}

/** 不在家到什麼時候（看醫生、散步） */
export function awayUntil(cat: Pick<CatState, "vetUntil" | "outUntil">): number {
  return Math.max(cat.vetUntil, cat.outUntil);
}

const WEEK_MULT = 48 / (7 * 24);
/**
 * 每種動物的數值掉得多快（乘幾倍；1 = 跟貓一樣：飽、心情一天、乾淨兩天）。
 * 住籠子的「乾淨」是籠子（大約一週清一次）；蛇的是飼養箱的濕度（大約五天噴一次水）。
 */
export const SPECIES_DECAY: Record<PetSpecies, Record<CatStatKey, number>> = {
  cat: { food: 1, clean: 1, mood: 1 },
  dog: { food: 1, clean: 1, mood: 1 },
  // 味道重：乾淨掉得快
  ferret: { food: 1, clean: 1.5, mood: 1 },
  hamster: { food: 1, clean: WEEK_MULT, mood: 1 },
  // 牧草吃很多：一天大約四份
  guineaPig: { food: 2, clean: WEEK_MULT, mood: 1 },
  // 很黏人：不陪心情掉得快
  glider: { food: 1, clean: WEEK_MULT, mood: 1.4 },
  // 一週吃一次；心情很穩
  snake: { food: 1 / 14, clean: 48 / (5 * 24), mood: 0.3 },
};

/** 數值掉得多快：種類、個性、生病會改 */
export function decayMult(cat: Pick<CatState, "personality" | "sickSince"> & { species?: PetSpecies }, key: CatStatKey): number {
  let m = 1;
  m *= SPECIES_DECAY[cat.species ?? "cat"][key];
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

/** 剛領養：數值都是八成、個性隨機、還沒訓練。花色不是這個種類的就用第一種 */
export function adoptCat(
  name: string,
  color: PetColor,
  now: number,
  rand: () => number = Math.random,
  id?: string,
  species: PetSpecies = "cat",
): CatState {
  const stat = { v: 80, at: now };
  const personality = CAT_PERSONALITY_IDS[Math.min(CAT_PERSONALITY_IDS.length - 1, Math.floor(rand() * CAT_PERSONALITY_IDS.length))];
  const colors = SPECIES_COLORS[species];
  const c = (color in colors ? color : Object.keys(colors)[0]) as PetColor;
  return {
    id: id ?? `${species}-${now.toString(36)}-${Math.floor(rand() * 1e6).toString(36)}`,
    species,
    name: cleanCatName(name) || colors[c].name,
    color: c,
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
    walkedAt: now,
    outUntil: 0,
    vegAt: now,
    lampUntil: now,
    shedAt: nextShedAt(now, rand),
  };
}

/** 蛇大約三週蛻一次皮（前後差三天） */
export const SHED_EVERY_MS = 21 * 24 * 3_600_000;
export function nextShedAt(now: number, rand: () => number = Math.random): number {
  return now + SHED_EVERY_MS + (rand() * 2 - 1) * 3 * 24 * 3_600_000;
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
  const species: PetSpecies = PET_SPECIES_IDS.includes(r.species as PetSpecies) ? (r.species as PetSpecies) : "cat";
  const colors = SPECIES_COLORS[species];
  if (typeof r.color !== "string" || !(r.color in colors)) return null;
  const color = r.color as PetColor;
  const name = (typeof r.name === "string" ? cleanCatName(r.name) : "") || colors[color].name;
  const personality =
    typeof r.personality === "string" && r.personality in CAT_PERSONALITIES
      ? (r.personality as CatPersonality)
      : CAT_PERSONALITY_IDS[[...name].reduce((h, ch) => h + ch.codePointAt(0)!, 0) % CAT_PERSONALITY_IDS.length];
  return {
    id: typeof r.id === "string" && r.id ? r.id.slice(0, 40) : fallbackId,
    species,
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
    walkedAt: num(r.walkedAt, now, 0),
    vegAt: num(r.vegAt, now, 0),
    lampUntil: num(r.lampUntil, now, 0),
    shedAt: num(r.shedAt, now + SHED_EVERY_MS, 0),
    outUntil: num(r.outUntil, 0, 0),
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
  // 住籠子的「洗」是清籠子（換木屑、噴水）：乾淨了，牠不會不高興
  if (care === "wash" && isCaged(cat.species)) return { ...cat, clean: { v: 100, at: now } };
  // 天竺鼠的零食是蔬菜：順便補了維他命 C
  if (care === "treat" && cat.species === "guineaPig") {
    const [food, mood, aff] = CAT_CARE_EFFECT.treat;
    const next = catStatAdd(catStatAdd(cat, "mood", mood, now), "food", food, now);
    return { ...next, affinity: Math.min(100, next.affinity + aff), vegAt: now };
  }
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
  opts: {
    scene: Scene;
    current: string | null;
    residentAsleep: boolean;
    residentHome: boolean;
    listless: boolean;
    personality?: CatPersonality;
    species?: PetSpecies;
  },
  rand: () => number = Math.random,
): string {
  if (opts.residentAsleep) return "nap-bed";
  const bias = opts.personality ? PERSONALITY_BIAS[opts.personality] : () => 1;
  const dog = opts.species === "dog";
  const ferret = opts.species === "ferret";
  // 狗：跳不上窗台；比貓更常黏著他。雪貂：一天睡大半天，也不上窗台
  const speciesBias = (k: string) =>
    dog ? (k === CAT_RUB || k === CAT_FOLLOW ? 1.8 : 1) : ferret ? (k.startsWith("nap-") ? 3 : k === "play-living" ? 4 : 1) : 1;
  const weights = Object.fromEntries(Object.entries(CAT_WEIGHTS[opts.scene]).map(([k, w]) => [k, w * bias(k) * speciesBias(k)]));
  let keys = Object.keys(weights).filter((k) => k !== opts.current && !((dog || ferret) && CAT_ACTS[k]?.perch));
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
export function catDwellMs(act: string, rand: () => number = Math.random, calm = false, species?: PetSpecies): number {
  // 雪貂一睡就很久；醒著的時候靜不下來，換事情比貓勤快
  const sleepy = species === "ferret" ? (act.startsWith("nap-") ? 2 : 0.6) : 1;
  const base =
    sleepy *
    (act === CAT_RUB ? 12_000 + rand() * 10_000 : act === "eat" ? 8_000 : act === CAT_FOLLOW ? 30_000 + rand() * 30_000 : 40_000 + rand() * 50_000);
  return calm ? base * 4 : base;
}

/** 走路速度（房間格子／秒）：比他快一點 */
export const CAT_SPEED = 38;
/** 雪貂跑得快（彈著跑） */
export const FERRET_SPEED = 62;

// ===== 狗：散步 =====

/** 散步多久（狗和他都不在家） */
export const WALK_MS = 30 * 60_000;
/** 多久沒散步心情開始掉得快（一天要兩次） */
export const WALK_DUE_MS = 12 * 3_600_000;
/** 太久沒散步：心情每小時多掉這麼多 */
export const WALK_OVERDUE_MOOD_PER_HOUR = 4;
/** 散步：心情、親密加多少；路上會上廁所，下次上廁所從現在重算 */
export const WALK_MOOD = 25;
export const WALK_AFFINITY = 3;

/** 出門散步（不檢查他在不在家；在外面檢查） */
export function walkDog(cat: CatState, now: number, rand: () => number = Math.random): CatState {
  const next = catStatAdd(cat, "mood", WALK_MOOD, now);
  return {
    ...next,
    affinity: Math.min(100, next.affinity + WALK_AFFINITY),
    walkedAt: now,
    outUntil: now + WALK_MS,
    toiletAt: nextToiletAt(now, rand),
  };
}

/** 散步過期了嗎（狗才會） */
export function walkOverdue(cat: Pick<CatState, "species" | "walkedAt">, now: number): boolean {
  return cat.species === "dog" && now - cat.walkedAt > WALK_DUE_MS;
}

// ===== 住籠子的：在籠子裡做什麼 =====

/** 每 10 分鐘換一個 0～99 的數字（照 id 錯開）：不用計時器，照時間就知道現在在幹嘛 */
export function slotRoll(id: string, now: number, salt = 0): number {
  const slot = Math.floor(now / 600_000) + [...id].reduce((h, ch) => h + ch.charCodeAt(0), 0) + salt * 7919;
  return (Math.imul(slot, 2654435761) >>> 0) % 100;
}

export type HamsterPose = "sit" | "eat" | "sleep" | "run";

/**
 * 倉鼠現在在幹嘛：白天睡覺、黃昏吃東西、晚上跑滾輪（每 10 分鐘換一次，照 id 錯開）。
 * 不用計時器：畫面每幾分鐘重算一次就好。
 */
export function hamsterPose(
  cat: Pick<CatState, "id" | "personality" | "sickSince">,
  scene: Scene,
  listless: boolean,
  now: number,
): HamsterPose {
  if (cat.sickSince || listless) return "sleep";
  const r = slotRoll(cat.id, now);
  if (scene === "day") return cat.personality === "playful" && r < 25 ? "sit" : "sleep";
  if (scene === "dusk") return r < 50 ? "eat" : "sit";
  const run = cat.personality === "lazy" ? 30 : cat.personality === "playful" ? 85 : 60;
  return r < run ? "run" : r < run + 20 ? "eat" : "sit";
}

/** 不熟的倉鼠摸牠可能會被咬一口（親密度越低越常） */
export const HAMSTER_BITE_BELOW = 30;
export function hamsterBites(cat: Pick<CatState, "species" | "affinity">, rand: () => number = Math.random): boolean {
  if (cat.species !== "hamster" || cat.affinity >= HAMSTER_BITE_BELOW) return false;
  return rand() < 0.5 * (1 - cat.affinity / HAMSTER_BITE_BELOW) + 0.1;
}

/**
 * 籠子裡的姿勢（倉鼠以外的；倉鼠用 hamsterPose）：
 * - 天竺鼠：白天黃昏醒著吃牧草，心情好偶爾原地跳（popcorn）；晚上一半在睡
 * - 蜜袋鼯：白天窩在睡袋裡；晚上醒來吃東西、在籠子裡爬
 * - 蛇：大多盤著，偶爾伸長身子
 * 沒精神、生病：都在睡（蜜袋鼯窩在睡袋、蛇盤著）
 */
export type CagePose = HamsterPose | "popcorn" | "pouch" | "climb" | "coil" | "stretch";

export function cagedPose(
  cat: Pick<CatState, "id" | "personality" | "sickSince" | "species">,
  scene: Scene,
  listless: boolean,
  now: number,
  mood = 50,
): CagePose {
  const resting = !!cat.sickSince || listless;
  const r = slotRoll(cat.id, now);
  if (cat.species === "hamster") return hamsterPose(cat, scene, listless, now);
  if (cat.species === "guineaPig") {
    if (resting) return "sleep";
    if (scene === "night") return r < 50 ? "sleep" : r < 80 ? "eat" : "sit";
    const hop = cat.personality === "playful" ? 25 : 10;
    if (mood >= 70 && r < hop) return "popcorn";
    return r < 60 ? "eat" : "sit";
  }
  if (cat.species === "glider") {
    if (resting || scene === "day") return "pouch";
    const lazy = cat.personality === "lazy" ? 40 : 15;
    if (r < lazy) return "pouch";
    return r < lazy + 30 ? "eat" : "climb";
  }
  if (resting) return "coil";
  const stretch = cat.personality === "playful" ? 40 : cat.personality === "lazy" ? 5 : 20;
  return r < stretch ? "stretch" : "coil";
}

/**
 * 蜜袋鼯跑到他身上：晚上醒著的時候滑翔到他肩上；白天熟了偶爾窩在他口袋裡睡。
 * 他要在家、醒著、沒在陪狗散步（residentFree）。越親越常來。回傳 null = 在籠子裡
 */
export function gliderOut(
  cat: Pick<CatState, "id" | "affinity" | "sickSince" | "personality">,
  scene: Scene,
  listless: boolean,
  now: number,
  residentFree: boolean,
): "shoulder" | "pocket" | null {
  if (!residentFree || cat.sickSince || listless) return null;
  const r = slotRoll(cat.id, now, 1);
  const clingy = cat.personality === "clingy" ? 20 : 0;
  if (scene === "day") return cat.affinity >= 40 && r < 20 + clingy ? "pocket" : null;
  return r < 25 + cat.affinity / 4 + clingy ? "shoulder" : null;
}
