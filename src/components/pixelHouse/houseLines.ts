/**
 * 小屋裡的互動內容：他頭上冒的話、摸頭的反應、他留給你的東西。
 * 都是寫好的句子，不呼叫 AI（不花額度、不耗電）。
 */
import type { RoomId, Scene } from "./houseData";

// ===== 他到新的地方開始做事時，頭上冒的一句話 =====

/** 動作（houseData 的 ACTS 的 key）→ 可能說的話。睡覺不說話 */
export const ACT_LINES: Record<string, string[]> = {
  tv: ["這集好好看", "廣告怎麼這麼久", "等一下，快演到重點了", "要不要一起看？", "又重播這個"],
  game: ["再一場就好", "啊，差一點！", "這關好難", "破紀錄了！", "不要偷看我的畫面"],
  sofa: ["沙發好舒服", "滑一下就好", "這個好好笑", "不想動了", "你看這個"],
  workout: ["一、二、一、二", "再十下", "好喘", "今天有動到了", "流汗好舒服"],
  door: ["外送怎麼還沒來", "好像有腳步聲？", "肚子餓了", "應該快到了吧", "是不是送錯樓了"],
  pc: ["這個要怎麼弄", "先存檔", "再五分鐘", "眼睛好酸", "嗯，原來是這樣"],
  read: ["看哪一本好", "這本看過了", "上次看到哪裡了？", "想看點輕鬆的", "書好像又變多了"],
  bedphone: ["躺著滑最舒服", "再看一則就睡", "手機快沒電了", "這個好可愛", "不想起來"],
  daze: ["……", "剛剛要做什麼來著", "今天天氣不錯", "嗯——", "放空一下"],
  cook: ["今天煮什麼好", "好香", "鹽放太多了嗎", "再等一下就好", "小心燙"],
  fridge: ["有什麼可以吃", "布丁還在", "牛奶快沒了", "該去買菜了", "這個過期了嗎"],
  dishes: ["碗好多", "洗碗精快沒了", "這個黏住了", "洗乾淨了", "手都皺了"],
  eat: ["開動了", "好吃", "有點燙", "你吃了嗎？", "吃飽了"],
  brush: ["呼嚕呼嚕", "牙膏擠太多", "刷三分鐘", "薄荷好涼", "刷乾淨了"],
  mirror: ["今天頭髮有點亂", "這樣好看嗎？", "還不錯", "要不要換個造型", "嗯，可以出門了"],
  shower: ["水溫剛剛好", "好舒服", "哼歌中～", "洗髮精在哪", "熱水萬歲"],
};

/** 黃昏、晚上多一些有時間感的話（跟上面的合在一起挑） */
export const SCENE_LINES: Partial<Record<Scene, Record<string, string[]>>> = {
  dusk: {
    cook: ["晚餐快好了", "今天想吃熱的"],
    sofa: ["今天好累", "終於可以休息了"],
    eat: ["晚餐時間", "今天辛苦了"],
  },
  night: {
    bedphone: ["該睡了…再五分鐘", "明天要早起"],
    fridge: ["宵夜時間", "半夜吃東西最香"],
    brush: ["刷完就睡", "好睏"],
    shower: ["洗完好睡覺"],
  },
};

/** 到新的地方時有多少機會說話（不是每次都說，才不會吵） */
export const SAY_CHANCE = 0.45;
/** 一句話顯示多久（毫秒） */
export const SAY_MS = 3500;

/** 挑一句這件事會說的話；這件事沒有話（睡覺）回傳 null */
export function pickLine(act: string, scene: Scene, rand: () => number = Math.random): string | null {
  const lines = [...(ACT_LINES[act] ?? []), ...(SCENE_LINES[scene]?.[act] ?? [])];
  if (!lines.length) return null;
  return lines[Math.min(lines.length - 1, Math.floor(rand() * lines.length))];
}

// ===== 摸頭 =====

/** 開心、被摸太多次有點煩、睡覺被吵到 */
export type PatMood = "happy" | "annoyed" | "sleepy";

export const PAT_LINES: Record<PatMood, string[]> = {
  happy: ["嘿嘿", "怎麼了？", "再摸一下", "好舒服", "今天心情很好喔", "在想我嗎？"],
  annoyed: ["頭髮要亂了啦", "好了好了", "摸太多了！", "我在忙啦"],
  sleepy: ["唔…", "…再五分鐘", "嗯…？", "Zzz…別鬧"],
};

/** 幾秒內摸超過幾次會煩 */
export const PAT_WINDOW_MS = 6000;
export const PAT_ANNOY_COUNT = 5;
/** 摸頭的反應維持多久（毫秒） */
export const PAT_MS = 1800;

/**
 * 這次摸頭他的反應。taps 是最近幾次摸頭的時間（含這次）。
 * 睡覺時一律是被吵到；短時間摸太多次會煩。
 */
export function patMood(taps: ReadonlyArray<number>, now: number, sleeping: boolean): PatMood {
  if (sleeping) return "sleepy";
  const recent = taps.filter((t) => now - t <= PAT_WINDOW_MS).length;
  return recent >= PAT_ANNOY_COUNT ? "annoyed" : "happy";
}

export function pickPatLine(mood: PatMood, rand: () => number = Math.random): string {
  const lines = PAT_LINES[mood];
  return lines[Math.min(lines.length - 1, Math.floor(rand() * lines.length))];
}

// ===== 他留給你的東西 =====

export type GiftKind = "dish" | "note";

export interface GiftDef {
  kind: GiftKind;
  /** 做完哪些事之後可能留下 */
  after: string[];
  /** 留下的機率 */
  chance: number;
  /** 放在哪間的哪件家具上 */
  room: RoomId;
  anchor: string;
  /** 在家具圖上的位置（房間格子，從家具左上角算；東西的左上角） */
  dx: number;
  dy: number;
  /** 可能是什麼（菜名、紙條上的話） */
  texts: string[];
  /** 收下拿到多少金幣 [最少, 最多]；紙條是 [0, 0] */
  coins: [number, number];
}

export const GIFTS: Record<GiftKind, GiftDef> = {
  dish: {
    kind: "dish",
    after: ["cook"],
    chance: 0.6,
    room: "kitchen",
    anchor: "table",
    // 餐桌左邊空著的地方（中間有水果、兩邊有杯子）
    dx: 3,
    dy: -5,
    texts: ["咖哩飯", "蛋炒飯", "番茄義大利麵", "味噌湯", "鬆餅", "蛋包飯", "燉菜"],
    coins: [15, 30],
  },
  note: {
    kind: "note",
    after: ["pc", "read"],
    chance: 0.35,
    room: "bedroom",
    anchor: "desk",
    dx: 6,
    dy: -6,
    texts: ["記得喝水。", "今天也辛苦了。", "冰箱有布丁，留給你的。", "晚點一起看電影？", "不要太晚睡。", "出門記得帶傘。", "想你了。"],
    coins: [0, 0],
  },
};

/** 一天最多留幾樣 */
export const GIFT_DAILY_LIMIT = 3;

/** 還沒收下的東西 */
export interface PendingGift {
  kind: GiftKind;
  text: string;
  coins: number;
}

/**
 * 他做完 act 這件事，會不會留下東西。
 * 同一種已經有一個還沒收的就不再留；今天的額度（left）用完也不留。
 */
export function rollGift(
  act: string,
  pending: ReadonlyArray<PendingGift>,
  left: number,
  rand: () => number = Math.random,
): PendingGift | null {
  if (left <= 0) return null;
  const def = Object.values(GIFTS).find((g) => g.after.includes(act));
  if (!def || pending.some((p) => p.kind === def.kind)) return null;
  if (rand() >= def.chance) return null;
  const text = def.texts[Math.min(def.texts.length - 1, Math.floor(rand() * def.texts.length))];
  const [lo, hi] = def.coins;
  const coins = lo + Math.floor(rand() * (hi - lo + 1));
  return { kind: def.kind, text, coins: Math.min(hi, coins) };
}

/** 讀存檔：只留認得的種類，每種最多一個 */
export function parsePendingGifts(raw: unknown): PendingGift[] {
  if (!Array.isArray(raw)) return [];
  const out: PendingGift[] = [];
  for (const g of raw) {
    if (!g || typeof g !== "object") continue;
    const r = g as Record<string, unknown>;
    const def = typeof r.kind === "string" ? GIFTS[r.kind as GiftKind] : undefined;
    if (!def || out.some((p) => p.kind === def.kind) || typeof r.text !== "string" || !r.text) continue;
    const coins = typeof r.coins === "number" && Number.isFinite(r.coins) ? Math.max(0, Math.min(def.coins[1], Math.floor(r.coins))) : 0;
    out.push({ kind: def.kind, text: r.text.slice(0, 40), coins });
  }
  return out;
}

// ===== 圖（用程式畫，不用另外載圖檔） =====

/** 每個字元對一個顏色，"." 是透明 */
export const GIFT_ART: Record<GiftKind, { rows: string[]; palette: Record<string, string> }> = {
  dish: {
    rows: [
      "...oooooo...",
      "..obbyybbo..",
      ".obbbyybbbo.",
      "owwwwwwwwwwo",
      ".owwwwwwwwo.",
      "..oooooooo..",
    ],
    palette: { o: "#3B2A26", w: "#FBF7EE", b: "#B9743F", y: "#F3D98B" },
  },
  note: {
    rows: [
      "ooooooooo",
      "oyyyyyyyo",
      "oylllllyo",
      "oyyyyyyyo",
      "oyllllyyo",
      "oyyyyyyyo",
      "oylllyydo",
      "oyyyyydo.",
      "ooooooo..",
    ],
    palette: { o: "#3B2A26", y: "#FFE89A", l: "#B08A4A", d: "#D9B95C" },
  },
};
