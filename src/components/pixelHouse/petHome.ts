/**
 * 養貓的家：好幾隻貓共用的東西——貓糧、罐頭、貓條、貓砂（庫存）、貓砂盆、地上的便便、寵物保險，
 * 還有生病、看醫生、健康檢查。這裡只有算的部分（不碰畫面、不碰存檔），好測。
 *
 * 省電：不用計時器扣庫存、不用計時器判斷生病。存「算到什麼時候」，打開小屋時用 simulatePets
 * 一小時一小時補算（最多補 60 天），小屋開著的時候牠們換一件事時順便算一下。
 */
import {
  adoptCat,
  catStat,
  eatKibble,
  KIBBLE_HUNGRY,
  nextToiletAt,
  parseCat,
  reanchorCat,
  type CatColor,
  type CatState,
} from "./houseCat";
import type { RoomId } from "./houseData";

// ===== 幾隻、多少錢 =====

export const MAX_CATS = 3;
/** 第一隻免費，之後每隻都是這個價錢 */
export const EXTRA_CAT_PRICE = 32_000;

export function adoptPrice(owned: number): number {
  return owned <= 0 ? 0 : EXTRA_CAT_PRICE;
}

// ===== 用品（庫存） =====

export type SupplyId = "kibble" | "can" | "treat" | "litter";

export const SUPPLIES: Record<SupplyId, { name: string; unit: string; pack: number; price: number; desc: string }> = {
  kibble: { name: "貓糧", unit: "份", pack: 20, price: 600, desc: "倒在碗裡，牠們餓了自己去吃。一隻一天大約吃 2 份" },
  can: { name: "罐頭", unit: "個", pack: 1, price: 150, desc: "加菜：很飽，心情也變好" },
  treat: { name: "貓條", unit: "條", pack: 5, price: 400, desc: "零食，親密度加比較多；訓練上廁所時當獎勵" },
  litter: { name: "貓砂", unit: "次", pack: 30, price: 300, desc: "倒在貓砂盆裡。一隻一天大約用 4 次" },
};
export const SUPPLY_IDS = Object.keys(SUPPLIES) as SupplyId[];

export type PetStock = Record<SupplyId, number>;

/** 每領養一隻送的新手包 */
export const STARTER_STOCK: PetStock = { kibble: 10, can: 1, treat: 3, litter: 15 };

// ===== 健康 =====

export const CHECKUP_PRICE = 3_000;
export const INSURANCE_PRICE = 1_500;
export const COVER_DAYS = 30;
const DAY = 24 * 3_600_000;
const HOUR = 3_600_000;

/** 看醫生：病了兩天以上算比較嚴重 */
export const VET_MILD = 2_000;
export const VET_SERIOUS = 5_000;
export const VET_SERIOUS_AFTER = 2 * DAY;
/** 帶去醫院之後多久回家 */
export const VET_STAY_MS = 30 * 60_000;
/** 從醫院回來心情掉一點 */
export const VET_MOOD = -10;

export function vetCost(cat: CatState, now: number, insured: boolean): number {
  if (!cat.sickSince) return 0;
  const base = now - cat.sickSince >= VET_SERIOUS_AFTER ? VET_SERIOUS : VET_MILD;
  return insured ? Math.round(base / 2) : base;
}

/**
 * 這一小時生病的機率：照顧不好才會病（看得出原因、可以預防），健康檢查有效時低很多。
 * 好好照顧又有做健康檢查：大約一年病一次；餓著、髒著放好幾天：幾天內就會病。
 */
export function sickRiskPerHour(
  levels: { food: number; clean: number },
  home: { messes: number; boxFull: boolean },
  checkup: boolean,
): number {
  let risk = 0.0004;
  if (levels.food < 20) risk += 0.006;
  if (levels.clean < 20) risk += 0.004;
  risk += home.messes * 0.001;
  if (home.boxFull) risk += 0.003;
  return checkup ? risk * 0.3 : risk;
}

// ===== 貓砂盆、地上的便便 =====

/** 鏟一次之前最多能用幾次；愛乾淨的貓用到一半就嫌髒 */
export const BOX_FULL = 6;
export const BOX_FULL_NEAT = 3;

export function boxLimit(cat: Pick<CatState, "personality">): number {
  return cat.personality === "neat" ? BOX_FULL_NEAT : BOX_FULL;
}

/** 牠這次會不會自己去貓砂盆：貓砂盆能用的話，訓練度越高越會去 */
export function litterChance(cat: Pick<CatState, "training" | "personality">, home: { box: number; litter: number }): number {
  if (home.litter <= 0 || home.box >= boxLimit(cat)) return 0;
  return 0.3 + (0.7 * cat.training) / 100;
}

/** 小遊戲帶去貓砂盆成功：加多少訓練度；有貓條當獎勵再多加 */
export const TRAIN_GAIN = 10;
export const TRAIN_TREAT_BONUS = 5;
/** 自己去貓砂盆一次：習慣慢慢養成 */
export const TRAIN_HABIT = 1;

export type MessKind = "pee" | "poop";

export interface MessSpot {
  id: string;
  room: RoomId;
  x: number;
  y: number;
}

/** 隨地大小便可能出現的地方（跟家事的髒污分開；清掉沒有錢） */
export const MESS_SPOTS: MessSpot[] = [
  { id: "mess-living-a", room: "living", x: 22, y: 198 },
  { id: "mess-living-b", room: "living", x: 96, y: 206 },
  { id: "mess-bedroom", room: "bedroom", x: 100, y: 186 },
  { id: "mess-kitchen", room: "kitchen", x: 28, y: 192 },
  { id: "mess-bath", room: "bath", x: 100, y: 180 },
];
export const MESS_BY_ID: Record<string, MessSpot> = Object.fromEntries(MESS_SPOTS.map((m) => [m.id, m]));

/** 貓砂盆放在浴室的哪裡（左上角，房間格子） */
export const LITTER_SPOT = { room: "bath" as RoomId, x: 76, y: 254 };

// ===== 整個家 =====

export interface PetHome {
  cats: CatState[];
  stock: PetStock;
  /** 貓砂盆用了幾次還沒鏟 */
  box: number;
  /** 寵物保險有效到什麼時候 */
  insuranceUntil: number;
  /** 地上的便便：id → 種類 */
  messes: Record<string, MessKind>;
  /** 算到什麼時候 */
  simAt: number;
}

export function emptyPetHome(now: number): PetHome {
  return { cats: [], stock: { kibble: 0, can: 0, treat: 0, litter: 0 }, box: 0, insuranceUntil: 0, messes: {}, simAt: now };
}

/** 讀存檔。舊版只有一隻 `cat`：搬進 cats，送一份新手包（舊版沒有庫存，不送會一打開就沒東西吃） */
export function parsePetHome(raw: unknown, legacyCat: unknown, now: number): PetHome {
  const home = emptyPetHome(now);
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const seen = new Set<string>();
    const cats = Array.isArray(r.cats) ? r.cats : [];
    for (let i = 0; i < cats.length && home.cats.length < MAX_CATS; i++) {
      const cat = parseCat(cats[i], now, `cat-${i + 1}`);
      if (cat && !seen.has(cat.id)) {
        seen.add(cat.id);
        home.cats.push(cat);
      }
    }
    const st = (r.stock && typeof r.stock === "object" ? r.stock : {}) as Record<string, unknown>;
    for (const id of SUPPLY_IDS) {
      const n = st[id];
      home.stock[id] = typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    }
    home.box = typeof r.box === "number" && Number.isFinite(r.box) ? Math.max(0, Math.min(99, Math.floor(r.box))) : 0;
    home.insuranceUntil = typeof r.insuranceUntil === "number" && Number.isFinite(r.insuranceUntil) ? r.insuranceUntil : 0;
    if (r.messes && typeof r.messes === "object" && !Array.isArray(r.messes)) {
      for (const [id, kind] of Object.entries(r.messes as Record<string, unknown>)) {
        if (MESS_BY_ID[id] && (kind === "pee" || kind === "poop")) home.messes[id] = kind;
      }
    }
    home.simAt = typeof r.simAt === "number" && Number.isFinite(r.simAt) ? r.simAt : now;
    return home;
  }
  const old = parseCat(legacyCat, now, "cat-1");
  if (old) {
    home.cats.push(old);
    home.stock = { ...STARTER_STOCK };
  }
  return home;
}

/** 領養一隻（不檢查錢；錢在外面扣）。滿了回傳 null */
export function addCat(home: PetHome, name: string, color: CatColor, now: number, rand: () => number = Math.random): PetHome | null {
  if (home.cats.length >= MAX_CATS) return null;
  let cat = adoptCat(name, color, now, rand);
  while (home.cats.some((c) => c.id === cat.id)) cat = { ...cat, id: `${cat.id}x` };
  const stock = { ...home.stock };
  for (const id of SUPPLY_IDS) stock[id] += STARTER_STOCK[id];
  return { ...home, cats: [...home.cats, cat], stock, simAt: home.cats.length ? home.simAt : now };
}

export function updateCat(home: PetHome, id: string, fn: (cat: CatState) => CatState): PetHome {
  return { ...home, cats: home.cats.map((c) => (c.id === id ? fn(c) : c)) };
}

/** 現在在家的貓（在醫院的不算） */
export function catsHome(home: PetHome, now: number): CatState[] {
  return home.cats.filter((c) => c.vetUntil <= now);
}

/** 庫存大約還夠幾天（沒有貓回傳 Infinity） */
export function stockDays(home: PetHome, id: "kibble" | "litter"): number {
  if (!home.cats.length) return Infinity;
  const perDay = id === "kibble" ? home.cats.reduce((sum, c) => sum + (c.personality === "glutton" ? 2.6 : 2), 0) : home.cats.length * 4;
  return home.stock[id] / perDay;
}

// ===== 上廁所 =====

export type ToiletResult = "box" | "floor";

/**
 * 牠上了一次廁所。forced：小遊戲帶去貓砂盆（true）；沒有就照機率。
 * 去貓砂盆：用掉一次貓砂、貓砂盆髒一點、訓練度加一點；沒去：地上多一灘（滿了就沒地方多）。
 */
export function doToilet(
  home: PetHome,
  catId: string,
  now: number,
  rand: () => number = Math.random,
  opts: { guided?: boolean; useTreat?: boolean } = {},
): { home: PetHome; result: ToiletResult; trained: number } {
  const cat = home.cats.find((c) => c.id === catId);
  if (!cat) return { home, result: "floor", trained: 0 };
  const chance = litterChance(cat, { box: home.box, litter: home.stock.litter });
  const toBox = opts.guided ? chance > 0 : rand() < chance;
  let next = updateCat(home, catId, (c) => ({ ...c, toiletAt: nextToiletAt(now, rand) }));
  if (toBox) {
    const treat = !!opts.guided && !!opts.useTreat && next.stock.treat > 0;
    const trained = opts.guided ? TRAIN_GAIN + (treat ? TRAIN_TREAT_BONUS : 0) : TRAIN_HABIT;
    next = {
      ...next,
      box: next.box + 1,
      stock: { ...next.stock, litter: next.stock.litter - 1, treat: next.stock.treat - (treat ? 1 : 0) },
    };
    next = updateCat(next, catId, (c) => ({ ...c, training: Math.min(100, c.training + trained) }));
    return { home: next, result: "box", trained };
  }
  const free = MESS_SPOTS.filter((m) => !(m.id in next.messes));
  if (free.length) {
    const spot = free[Math.min(free.length - 1, Math.floor(rand() * free.length))];
    next = { ...next, messes: { ...next.messes, [spot.id]: rand() < 0.6 ? "pee" : "poop" } };
  }
  return { home: next, result: "floor", trained: 0 };
}

// ===== 補算一段時間 =====

export type PetEvent =
  | { kind: "sick"; catId: string }
  | { kind: "floor"; catId: string }
  | { kind: "kibble-out" }
  | { kind: "litter-out" };

/** 最多補算多久（很久沒開，只算最後這段） */
export const SIM_MAX_MS = 60 * DAY;

/**
 * 從上次算到的時間補算到 to，一次一小時。
 * - live = false（小屋關著的那段時間）：牠們自己吃貓糧、自己上廁所、可能生病
 * - live = true（小屋開著）：只判斷生病；吃飯、上廁所由畫面上的牠自己走去做（才看得到）
 * 時間被往回調：什麼都不算，只把「算到什麼時候」改成現在。
 */
export function simulatePets(home: PetHome, to: number, opts: { live: boolean }, rand: () => number = Math.random): { home: PetHome; events: PetEvent[] } {
  const events: PetEvent[] = [];
  if (to <= home.simAt || !home.cats.length) return { home: { ...home, simAt: to }, events };
  let h: PetHome = { ...home };
  let t = Math.max(home.simAt, to - SIM_MAX_MS);
  let hadKibble = h.stock.kibble > 0;
  let hadLitter = h.stock.litter > 0;
  while (t < to) {
    const step = Math.min(HOUR, to - t);
    t += step;
    for (const id of h.cats.map((c) => c.id)) {
      let cat = h.cats.find((c) => c.id === id)!;
      if (cat.vetUntil > t) continue;
      if (!opts.live) {
        if (catStat(cat, "food", t) < KIBBLE_HUNGRY && h.stock.kibble > 0) {
          h = { ...updateCat(h, id, (c) => eatKibble(c, t)), stock: { ...h.stock, kibble: h.stock.kibble - 1 } };
        }
        cat = h.cats.find((c) => c.id === id)!;
        if (t >= cat.toiletAt) {
          const r = doToilet(h, id, t, rand);
          h = r.home;
          if (r.result === "floor") events.push({ kind: "floor", catId: id });
        }
        cat = h.cats.find((c) => c.id === id)!;
      }
      if (!cat.sickSince) {
        const risk = sickRiskPerHour(
          { food: catStat(cat, "food", t), clean: catStat(cat, "clean", t) },
          { messes: Object.keys(h.messes).length, boxFull: h.box >= boxLimit(cat) },
          cat.checkupUntil > t,
        );
        if (rand() < risk * (step / HOUR)) {
          // 生病之後數值掉得比較快：先記下現在的值，從這裡開始用新的速度
          h = updateCat(h, id, (c) => ({ ...reanchorCat(c, t), sickSince: t }));
          events.push({ kind: "sick", catId: id });
        }
      }
    }
    if (hadKibble && h.stock.kibble <= 0) {
      events.push({ kind: "kibble-out" });
      hadKibble = false;
    }
    if (hadLitter && h.stock.litter <= 0) {
      events.push({ kind: "litter-out" });
      hadLitter = false;
    }
  }
  return { home: { ...h, simAt: to }, events };
}

/** 看完醫生：病好了、在醫院待一陣子、心情掉一點 */
export function treatCat(home: PetHome, catId: string, now: number): PetHome {
  return updateCat(home, catId, (c) => {
    const healed = { ...reanchorCat(c, now), sickSince: 0, vetUntil: now + VET_STAY_MS };
    return { ...healed, mood: { v: Math.max(0, healed.mood.v + VET_MOOD), at: now } };
  });
}

// ===== 圖（用程式畫） =====

const INK = "#3B2A26";

export const LITTER_ART: Record<"clean" | "dirty" | "empty", { rows: string[]; palette: Record<string, string> }> = {
  clean: {
    rows: [
      ".oooooooooooooooo.",
      "oppppppppppppppppo",
      "opsssssssssssssspo",
      "opsssssssssssssspo",
      "oppppppppppppppppo",
      "oddddddddddddddddo",
      ".oooooooooooooooo.",
    ],
    palette: { o: INK, p: "#9CC7E6", d: "#73A9CF", s: "#EDE3CF" },
  },
  dirty: {
    rows: [
      ".oooooooooooooooo.",
      "oppppppppppppppppo",
      "opssbbsssssbsssspo",
      "opssbbssbbsssbsspo",
      "oppppppppppppppppo",
      "oddddddddddddddddo",
      ".oooooooooooooooo.",
    ],
    palette: { o: INK, p: "#9CC7E6", d: "#73A9CF", s: "#D9CCB2", b: "#8A5A33" },
  },
  empty: {
    rows: [
      ".oooooooooooooooo.",
      "oppppppppppppppppo",
      "opwwwwwwwwwwwwwwpo",
      "opwwwwwwwwwwwwwwpo",
      "oppppppppppppppppo",
      "oddddddddddddddddo",
      ".oooooooooooooooo.",
    ],
    palette: { o: INK, p: "#9CC7E6", d: "#73A9CF", w: "#FBF7EE" },
  },
};

export const MESS_ART: Record<MessKind, { rows: string[]; palette: Record<string, string> }> = {
  pee: {
    rows: [
      "...yyyyyyy...",
      ".yyyyllyyyyy.",
      "yyyyyyyyyylyy",
      ".yyyyyyyyyy..",
      "...yyyyyy....",
    ],
    palette: { y: "#E8CF6A", l: "#F6E7A6" },
  },
  poop: {
    rows: [
      "...oo...",
      "..obbo..",
      ".obbbbo.",
      "obbhbbbo",
      "obbbbbbo",
      ".oooooo.",
    ],
    palette: { o: "#4A2E1C", b: "#7A4A2A", h: "#9A6A44" },
  },
};

/** 頭上的小圖示：生病（溫度計）、想上廁所（驚嘆號） */
export const ICON_ART: Record<"sick" | "urge", { rows: string[]; palette: Record<string, string> }> = {
  sick: {
    rows: [".ooo.", ".owo.", ".owo.", ".owo.", ".oro.", "orrro", "orrro", ".ooo."],
    palette: { o: INK, w: "#FBF7EE", r: "#D9453A" },
  },
  urge: {
    rows: [".ooo.", "oyyyo", "oyyyo", "oyyyo", ".oyo.", "..o..", ".ooo.", ".oyo.", ".ooo."],
    palette: { o: INK, y: "#F3D98B" },
  },
};
