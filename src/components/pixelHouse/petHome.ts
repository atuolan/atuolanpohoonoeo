/**
 * 養寵物的家：好幾隻共用的東西——貓糧、狗糧、鼠糧、零食、貓砂、尿布墊、木屑（庫存）、貓砂盆、地上的便便、寵物保險，
 * 還有生病、看醫生、健康檢查、狗散步。這裡只有算的部分（不碰畫面、不碰存檔），好測。
 *
 * 省電：不用計時器扣庫存、不用計時器判斷生病。存「算到什麼時候」，打開小屋時用 simulatePets
 * 一小時一小時補算（最多補 60 天），小屋開著的時候牠們換一件事時順便算一下。
 */
import {
  adoptCat,
  awayUntil,
  catStat,
  catStatAdd,
  eatKibble,
  hungryBelow,
  MEALS_PER_DAY,
  nextShedAt,
  nextToiletAt,
  SPECIES_DECAY,
  parseCat,
  reanchorCat,
  walkOverdue,
  WALK_OVERDUE_MOOD_PER_HOUR,
  type CatState,
  type PetColor,
  type PetSpecies,
} from "./houseCat";
import type { RoomId } from "./houseData";

// ===== 用品（庫存） =====

export type SupplyId =
  | "kibble"
  | "can"
  | "treat"
  | "litter"
  | "dogFood"
  | "chew"
  | "pad"
  | "ferretFood"
  | "paste"
  | "pellet"
  | "seeds"
  | "bedding"
  | "hay"
  | "veg"
  | "fruit"
  | "mealworm"
  | "mouse"
  | "bulb";

/** users：哪幾種會用到（第一個是主要的；面板的用品照這個分組） */
export const SUPPLIES: Record<SupplyId, { name: string; unit: string; pack: number; price: number; desc: string; users: PetSpecies[] }> = {
  kibble: { name: "貓糧", unit: "份", pack: 40, price: 600, desc: "倒在碗裡，牠們餓了自己去吃。少量多餐，一隻一天大約吃 4 份", users: ["cat"] },
  can: { name: "罐頭", unit: "個", pack: 1, price: 150, desc: "加菜：很飽，心情也變好", users: ["cat"] },
  treat: { name: "貓條", unit: "條", pack: 5, price: 400, desc: "零食，親密度加比較多；訓練上廁所時當獎勵", users: ["cat"] },
  litter: { name: "貓砂", unit: "次", pack: 30, price: 300, desc: "倒在貓砂盆裡。貓一天大約用 4 次、雪貂 3 次", users: ["cat", "ferret"] },
  dogFood: { name: "狗糧", unit: "份", pack: 20, price: 800, desc: "倒在狗碗裡，餓了自己去吃。一隻一天大約吃 2 份", users: ["dog"] },
  chew: { name: "潔牙骨", unit: "根", pack: 5, price: 400, desc: "零食，親密度加比較多；訓練上尿布墊時當獎勵", users: ["dog"] },
  pad: { name: "尿布墊", unit: "片", pack: 30, price: 300, desc: "狗在家上廁所用。有散步的話一隻一天大約用 2 片", users: ["dog"] },
  ferretFood: { name: "雪貂糧", unit: "份", pack: 40, price: 700, desc: "倒在雪貂的碗裡，餓了自己去吃。少量多餐，一隻一天大約吃 4 份", users: ["ferret"] },
  paste: { name: "營養膏", unit: "條", pack: 5, price: 300, desc: "零食，親密度加比較多；訓練上廁所時當獎勵", users: ["ferret"] },
  pellet: { name: "鼠糧", unit: "份", pack: 30, price: 200, desc: "放在籠子裡，餓了自己吃。一隻一天大約吃 2 份", users: ["hamster"] },
  seeds: { name: "葵花子", unit: "顆", pack: 10, price: 100, desc: "零食，親密度加比較多；餵熟了比較不會咬人", users: ["hamster"] },
  bedding: { name: "木屑", unit: "包", pack: 2, price: 200, desc: "換一次籠子用一包，大約一週換一次", users: ["hamster", "guineaPig"] },
  hay: { name: "牧草", unit: "份", pack: 40, price: 300, desc: "天竺鼠的主食，吃很多：一隻一天大約 4 份", users: ["guineaPig"] },
  veg: { name: "蔬菜", unit: "份", pack: 7, price: 150, desc: "一天一份補維他命 C，太久沒吃容易生病；也可以當零食", users: ["guineaPig"] },
  fruit: { name: "水果", unit: "份", pack: 14, price: 300, desc: "蜜袋鼯的主食。一隻一天大約吃 2 份", users: ["glider"] },
  mealworm: { name: "麵包蟲", unit: "隻", pack: 20, price: 200, desc: "零食，親密度加比較多", users: ["glider"] },
  mouse: { name: "冷凍鼠", unit: "隻", pack: 4, price: 400, desc: "蛇大約一週吃一隻", users: ["snake"] },
  bulb: { name: "保溫燈泡", unit: "顆", pack: 1, price: 300, desc: "飼養箱的保溫燈，一顆用 30 天；沒有燈泡蛇會冷、容易生病", users: ["snake"] },
};
export const SUPPLY_IDS = Object.keys(SUPPLIES) as SupplyId[];

export type PetStock = Record<SupplyId, number>;

export function emptyStock(): PetStock {
  return Object.fromEntries(SUPPLY_IDS.map((id) => [id, 0])) as PetStock;
}

// ===== 種類：多少錢、吃什麼、在哪上廁所 =====

export interface SpeciesInfo {
  /** 第一隻免費（不管哪種），之後照這個價錢 */
  price: number;
  /** 會在家裡走（貓、狗、雪貂）；不會的住籠子（倉鼠、天竺鼠、蜜袋鼯、蛇） */
  roams: boolean;
  food: SupplyId;
  /** 零食（照顧的「零食」、訓練的獎勵）；蛇沒有 */
  snack: SupplyId | null;
  /** 清理用什麼（換木屑）；null = 不用買東西（洗澡、清籠子、噴水） */
  cleanSupply: SupplyId | null;
  /** 上廁所用什麼（倉鼠在籠子裡，不用管） */
  toilet: "litter" | "pad" | null;
  /** 看醫生、健康檢查的價錢乘幾倍（小動物便宜） */
  vetScale: number;
  /** 每領養一隻送的新手包 */
  starter: Partial<PetStock>;
}

const walker = { roams: true, cleanSupply: null } as const;
const caged = { roams: false, toilet: null } as const;

export const SPECIES_INFO: Record<PetSpecies, SpeciesInfo> = {
  cat: { ...walker, price: 32_000, food: "kibble", snack: "treat", toilet: "litter", vetScale: 1, starter: { kibble: 20, can: 1, treat: 3, litter: 15 } },
  dog: { ...walker, price: 32_000, food: "dogFood", snack: "chew", toilet: "pad", vetScale: 1.2, starter: { dogFood: 10, chew: 2, pad: 15 } },
  ferret: { ...walker, price: 20_000, food: "ferretFood", snack: "paste", toilet: "litter", vetScale: 1, starter: { ferretFood: 20, paste: 2, litter: 15 } },
  hamster: { ...caged, price: 1_500, food: "pellet", snack: "seeds", cleanSupply: "bedding", vetScale: 0.4, starter: { pellet: 15, seeds: 5, bedding: 2 } },
  guineaPig: { ...caged, price: 3_000, food: "hay", snack: "veg", cleanSupply: "bedding", vetScale: 0.5, starter: { hay: 20, veg: 3, bedding: 2 } },
  glider: { ...caged, price: 12_000, food: "fruit", snack: "mealworm", cleanSupply: null, vetScale: 0.6, starter: { fruit: 7, mealworm: 5 } },
  snake: { ...caged, price: 8_000, food: "mouse", snack: null, cleanSupply: null, vetScale: 0.8, starter: { mouse: 2, bulb: 1 } },
};

/** 舊名字：貓的新手包 */
export const STARTER_STOCK: PetStock = { ...emptyStock(), ...SPECIES_INFO.cat.starter };

// ===== 幾隻、多少錢 =====

/** 在家裡走的（貓＋狗＋雪貂）最多幾隻：畫面上會動的東西不要太多 */
export const MAX_WALKERS = 3;
/** 住籠子的（倉鼠、天竺鼠、蜜袋鼯、蛇）最多幾隻：籠子疊在客廳角落 */
export const MAX_CAGED = 3;
/** 舊名字 */
export const MAX_CATS = MAX_WALKERS;
/** 舊名字：貓的價錢 */
export const EXTRA_CAT_PRICE = SPECIES_INFO.cat.price;

/** 家裡第一隻免費，之後照種類的價錢 */
export function adoptPrice(owned: number, species: PetSpecies = "cat"): number {
  return owned <= 0 ? 0 : SPECIES_INFO[species].price;
}

export const roams = (cat: Pick<CatState, "species">) => SPECIES_INFO[cat.species].roams;

/** 這種還能再養嗎（會走的、住籠子的分開算） */
export function roomFor(home: Pick<PetHome, "cats">, species: PetSpecies): boolean {
  const walker = SPECIES_INFO[species].roams;
  const n = home.cats.filter((c) => roams(c) === walker).length;
  return n < (walker ? MAX_WALKERS : MAX_CAGED);
}

/** 這種動物最多幾隻（給畫面顯示） */
export const speciesMax = (species: PetSpecies) => (SPECIES_INFO[species].roams ? MAX_WALKERS : MAX_CAGED);

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
/** 看完醫生回家後這段時間不會再病 */
export const VET_RECOVER_MS = 7 * DAY;
/** 從醫院回來心情掉一點 */
export const VET_MOOD = -10;

const round100 = (n: number) => Math.round(n / 100) * 100;

export function vetCost(cat: CatState, now: number, insured: boolean): number {
  if (!cat.sickSince) return 0;
  const base = round100((now - cat.sickSince >= VET_SERIOUS_AFTER ? VET_SERIOUS : VET_MILD) * SPECIES_INFO[cat.species].vetScale);
  return insured ? Math.round(base / 2) : base;
}

/** 健康檢查多少錢（照種類） */
export function checkupPrice(species: PetSpecies): number {
  return round100(CHECKUP_PRICE * SPECIES_INFO[species].vetScale);
}

/**
 * 這一小時生病的機率：照顧不好病得更常（看得出原因、可以預防），健康檢查有效時低很多。
 * 好好照顧：大約一個月病一次；再做健康檢查：大約三個月一次；餓著、髒著放好幾天：一兩天內就會病。
 */
export function sickRiskPerHour(
  levels: { food: number; clean: number },
  home: { messes: number; boxFull: boolean },
  checkup: boolean,
  /** 種類自己的風險（天竺鼠沒吃蔬菜、蛇沒有保溫燈） */
  extra = 0,
): number {
  let risk = 0.0014 + extra;
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

/** 牠這次會不會自己去貓砂盆（狗：尿布墊）：能用的話，訓練度越高越會去 */
export function litterChance(
  cat: Pick<CatState, "training" | "personality"> & { species?: PetSpecies },
  home: { box: number; litter: number; pad?: number },
): number {
  if (cat.species === "dog") return (home.pad ?? 0) > 0 ? 0.3 + (0.7 * cat.training) / 100 : 0;
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
/** 狗的尿布墊：浴室，浴墊下面 */
export const PAD_SPOT = { room: "bath" as RoomId, x: 32, y: 258 };
/** 狗碗：廚房，貓碗右邊 */
export const DOG_BOWL_SPOT = { room: "kitchen" as RoomId, x: 106, y: 189 };
/** 雪貂的碗：廚房，貓碗左邊 */
export const FERRET_BOWL_SPOT = { room: "kitchen" as RoomId, x: 82, y: 189 };
/** 雪貂藏東西的地方：沙發底下、床底下、洗衣籃後面（左上角，房間格子） */
export const STASH_SPOTS: { id: string; room: RoomId; x: number; y: number; where: string }[] = [
  { id: "stash-sofa", room: "living", x: 66, y: 242, where: "沙發底下" },
  { id: "stash-bed", room: "bedroom", x: 52, y: 235, where: "床底下" },
  { id: "stash-basket", room: "bath", x: 88, y: 242, where: "洗衣籃後面" },
];
export const STASH_BY_ID: Record<string, (typeof STASH_SPOTS)[number]> = Object.fromEntries(STASH_SPOTS.map((s) => [s.id, s]));

/** 雪貂藏東西（不檢查每日次數；在外面算）。已經藏了一處就不再藏 */
export function hideStash(home: PetHome, by: string, coins: number, rand: () => number = Math.random): PetHome {
  if (home.stash || coins <= 0) return home;
  const spot = STASH_SPOTS[Math.min(STASH_SPOTS.length - 1, Math.floor(rand() * STASH_SPOTS.length))];
  return { ...home, stash: { spot: spot.id, coins, by } };
}
/** 倉鼠籠：客廳左邊兩盆植物中間，第二個、第三個疊在上面（左上角） */
export const CAGE_SPOTS: { room: RoomId; x: number; y: number }[] = [
  { room: "living", x: 18, y: 156 },
  { room: "living", x: 18, y: 136 },
  { room: "living", x: 18, y: 116 },
];

// ===== 整個家 =====

export interface PetHome {
  /** 每一隻寵物（貓、狗、倉鼠；名字沿用 cats） */
  cats: CatState[];
  stock: PetStock;
  /** 貓砂盆用了幾次還沒鏟 */
  box: number;
  /** 寵物保險有效到什麼時候 */
  insuranceUntil: number;
  /** 地上的便便：id → 種類 */
  messes: Record<string, MessKind>;
  /** 雪貂藏起來的東西（一次最多一處）：藏在哪、裡面有多少金幣、誰藏的 */
  stash: Stash | null;
  /** 算到什麼時候 */
  simAt: number;
  /** 一份飼料的大小改過的版本（舊存檔沒有這欄 = 1） */
  foodVersion?: number;
}

/**
 * 一份飼料的大小：第 2 版起貓、雪貂少量多餐，一份是以前的一半（一包的份數加倍）。
 * 讀到舊存檔時把這兩種的庫存乘 2，能吃的天數不變。
 */
export const FOOD_VERSION = 2;

export interface Stash {
  spot: string;
  coins: number;
  by: string;
}

export function emptyPetHome(now: number): PetHome {
  return { cats: [], stock: emptyStock(), box: 0, insuranceUntil: 0, messes: {}, stash: null, simAt: now, foodVersion: FOOD_VERSION };
}

/** 讀存檔。舊版只有一隻 `cat`：搬進 cats，送一份新手包（舊版沒有庫存，不送會一打開就沒東西吃） */
export function parsePetHome(raw: unknown, legacyCat: unknown, now: number): PetHome {
  const home = emptyPetHome(now);
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const seen = new Set<string>();
    const cats = Array.isArray(r.cats) ? r.cats : [];
    for (let i = 0; i < cats.length; i++) {
      const cat = parseCat(cats[i], now, `cat-${i + 1}`);
      if (cat && !seen.has(cat.id) && roomFor(home, cat.species)) {
        seen.add(cat.id);
        home.cats.push(cat);
      }
    }
    const st = (r.stock && typeof r.stock === "object" ? r.stock : {}) as Record<string, unknown>;
    for (const id of SUPPLY_IDS) {
      const n = st[id];
      home.stock[id] = typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    }
    // 舊存檔的一份是現在的兩份
    if (r.foodVersion !== FOOD_VERSION) {
      home.stock.kibble *= 2;
      home.stock.ferretFood *= 2;
    }
    home.box = typeof r.box === "number" && Number.isFinite(r.box) ? Math.max(0, Math.min(99, Math.floor(r.box))) : 0;
    home.insuranceUntil = typeof r.insuranceUntil === "number" && Number.isFinite(r.insuranceUntil) ? r.insuranceUntil : 0;
    if (r.messes && typeof r.messes === "object" && !Array.isArray(r.messes)) {
      for (const [id, kind] of Object.entries(r.messes as Record<string, unknown>)) {
        if (MESS_BY_ID[id] && (kind === "pee" || kind === "poop")) home.messes[id] = kind;
      }
    }
    const st2 = r.stash as Record<string, unknown> | null | undefined;
    if (st2 && typeof st2 === "object" && typeof st2.spot === "string" && STASH_BY_ID[st2.spot] && typeof st2.coins === "number" && st2.coins > 0) {
      home.stash = { spot: st2.spot, coins: Math.min(500, Math.floor(st2.coins)), by: typeof st2.by === "string" ? st2.by.slice(0, 20) : "" };
    }
    home.simAt = typeof r.simAt === "number" && Number.isFinite(r.simAt) ? r.simAt : now;
    return home;
  }
  const old = parseCat(legacyCat, now, "cat-1");
  if (old) {
    home.cats.push(old);
    home.stock = { ...emptyStock(), ...SPECIES_INFO.cat.starter };
  }
  return home;
}

/** 領養一隻（不檢查錢；錢在外面扣）。滿了回傳 null */
export function addCat(
  home: PetHome,
  name: string,
  color: PetColor,
  now: number,
  rand: () => number = Math.random,
  species: PetSpecies = "cat",
): PetHome | null {
  if (!roomFor(home, species)) return null;
  let cat = adoptCat(name, color, now, rand, undefined, species);
  while (home.cats.some((c) => c.id === cat.id)) cat = { ...cat, id: `${cat.id}x` };
  const stock = { ...home.stock };
  const starter = SPECIES_INFO[species].starter;
  for (const id of SUPPLY_IDS) stock[id] += starter[id] ?? 0;
  return { ...home, cats: [...home.cats, cat], stock, simAt: home.cats.length ? home.simAt : now };
}

export function updateCat(home: PetHome, id: string, fn: (cat: CatState) => CatState): PetHome {
  return { ...home, cats: home.cats.map((c) => (c.id === id ? fn(c) : c)) };
}

/** 現在在家的（在醫院、出門散步的不算） */
export function catsHome(home: PetHome, now: number): CatState[] {
  return home.cats.filter((c) => awayUntil(c) <= now);
}

/** 一隻一天大約用掉多少（零食、罐頭不算：要你餵才會用） */
function usePerDay(cat: CatState, id: SupplyId): number {
  const info = SPECIES_INFO[cat.species];
  if (info.food === id) return MEALS_PER_DAY[cat.species] * SPECIES_DECAY[cat.species].food * (cat.personality === "glutton" ? 1.3 : 1);
  if (id === "litter" && info.toilet === "litter") return cat.species === "ferret" ? 3 : 4;
  if (id === "pad" && info.toilet === "pad") return 2;
  if (id === "bedding" && info.cleanSupply === "bedding") return 1 / 7;
  if (id === "veg" && cat.species === "guineaPig") return 1;
  if (id === "bulb" && cat.species === "snake") return 1 / LAMP_DAYS;
  return 0;
}

/** 會自己用掉的用品（照顧的時候才用的零食、罐頭不算；蔬菜天竺鼠每天自己吃一份，算） */
export const isDaily = (id: SupplyId) =>
  Object.values(SPECIES_INFO).some((info) => info.food === id) || ["litter", "pad", "bedding", "veg", "bulb"].includes(id);

/** 蛇的保溫燈泡一顆用幾天 */
export const LAMP_DAYS = 30;
/** 天竺鼠多久沒吃到蔬菜開始容易生病 */
export const VEG_SICK_AFTER = 2 * DAY;
/** 蛇蛻皮時飼養箱的濕度（「乾淨」）低於這個會蛻不乾淨、生病 */
export const SHED_DRY_BELOW = 40;

/** 庫存大約還夠幾天（沒有會用到的回傳 Infinity） */
export function stockDays(home: PetHome, id: SupplyId): number {
  // 保溫燈泡：裝著的那顆還能用多久，加上庫存
  if (id === "bulb") {
    const snakes = home.cats.filter((c) => c.species === "snake");
    if (!snakes.length) return Infinity;
    const left = Math.min(...snakes.map((c) => Math.max(0, c.lampUntil - home.simAt))) / DAY;
    return left + (home.stock.bulb * LAMP_DAYS) / snakes.length;
  }
  const perDay = home.cats.reduce((sum, c) => sum + usePerDay(c, id), 0);
  return perDay > 0 ? home.stock[id] / perDay : Infinity;
}

/** 家裡有養的種類（用品只顯示這些的） */
export function speciesOwned(home: Pick<PetHome, "cats">): PetSpecies[] {
  return (["cat", "dog", "hamster"] as PetSpecies[]).filter((sp) => home.cats.some((c) => c.species === sp));
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
  const info = SPECIES_INFO[cat.species];
  const chance = litterChance(cat, { box: home.box, litter: home.stock.litter, pad: home.stock.pad });
  const toBox = opts.guided ? chance > 0 : rand() < chance;
  let next = updateCat(home, catId, (c) => ({ ...c, toiletAt: nextToiletAt(now, rand) }));
  if (toBox) {
    const snack = info.snack;
    const treat = !!opts.guided && !!opts.useTreat && !!snack && next.stock[snack] > 0;
    const trained = opts.guided ? TRAIN_GAIN + (treat ? TRAIN_TREAT_BONUS : 0) : TRAIN_HABIT;
    const dog = info.toilet === "pad";
    const stock = { ...next.stock };
    if (treat && snack) stock[snack] -= 1;
    // 貓：用掉一次貓砂、貓砂盆髒一點；狗：用掉一片尿布墊（換新的，不用鏟）
    if (dog) stock.pad -= 1;
    else stock.litter -= 1;
    next = { ...next, box: next.box + (dog ? 0 : 1), stock };
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
  /** 會自己用掉的用品用完了 */
  | { kind: "out"; supply: SupplyId }
  /** 蛇蛻皮了（ok = false：飼養箱太乾，蛻不乾淨生病了） */
  | { kind: "shed"; catId: string; ok: boolean };

/** 最多補算多久（很久沒開，只算最後這段） */
export const SIM_MAX_MS = 60 * DAY;

/**
 * 從上次算到的時間補算到 to，一次一小時。
 * - live = false（小屋關著的那段時間）：牠們自己吃飯、自己上廁所、可能生病
 * - live = true（小屋開著）：判斷生病；貓狗吃飯、上廁所由畫面上的牠自己走去做（才看得到），倉鼠在籠子裡照樣自己吃
 * - 狗太久沒散步：心情多掉一些
 * - 天竺鼠一天自己吃一份蔬菜（太久沒吃容易生病）
 * - 蛇：保溫燈泡用完自己換一顆（沒有燈泡會冷，心情掉、容易生病）；大約三週蛻一次皮，飼養箱太乾會蛻不乾淨、生病
 * 時間被往回調：什麼都不算，只把「算到什麼時候」改成現在。
 */
export function simulatePets(home: PetHome, to: number, opts: { live: boolean }, rand: () => number = Math.random): { home: PetHome; events: PetEvent[] } {
  const events: PetEvent[] = [];
  if (to <= home.simAt || !home.cats.length) return { home: { ...home, simAt: to }, events };
  let h: PetHome = { ...home };
  let t = Math.max(home.simAt, to - SIM_MAX_MS);
  // 會自己用掉的用品：本來有、算一算用完了 → 說一聲
  const watched = SUPPLY_IDS.filter((id) => h.cats.some((c) => usePerDay(c, id) > 0) && id !== "bedding" && id !== "bulb");
  const had = new Set(watched.filter((id) => h.stock[id] > 0));
  while (t < to) {
    const step = Math.min(HOUR, to - t);
    t += step;
    for (const id of h.cats.map((c) => c.id)) {
      let cat = h.cats.find((c) => c.id === id)!;
      if (awayUntil(cat) > t) continue;
      const info = SPECIES_INFO[cat.species];
      if (!opts.live || !info.roams) {
        const food = info.food;
        if (catStat(cat, "food", t) < hungryBelow(cat.species) && h.stock[food] > 0) {
          h = { ...updateCat(h, id, (c) => eatKibble(c, t)), stock: { ...h.stock, [food]: h.stock[food] - 1 } };
        }
        cat = h.cats.find((c) => c.id === id)!;
      }
      if (walkOverdue(cat, t)) {
        h = updateCat(h, id, (c) => catStatAdd(c, "mood", (-WALK_OVERDUE_MOOD_PER_HOUR * step) / HOUR, t));
        cat = h.cats.find((c) => c.id === id)!;
      }
      let extra = 0;
      if (cat.species === "guineaPig") {
        if (t - cat.vegAt >= DAY && h.stock.veg > 0) {
          h = { ...updateCat(h, id, (c) => ({ ...c, vegAt: t })), stock: { ...h.stock, veg: h.stock.veg - 1 } };
          cat = h.cats.find((c) => c.id === id)!;
        }
        if (t - cat.vegAt > VEG_SICK_AFTER) extra += 0.004;
      }
      if (cat.species === "snake") {
        if (t >= cat.lampUntil && h.stock.bulb > 0) {
          h = { ...updateCat(h, id, (c) => ({ ...c, lampUntil: t + LAMP_DAYS * DAY })), stock: { ...h.stock, bulb: h.stock.bulb - 1 } };
          cat = h.cats.find((c) => c.id === id)!;
        }
        // 燈泡剛好在這一小時燒完、又沒有新的：說一聲
        if (t >= cat.lampUntil && cat.lampUntil > t - step) events.push({ kind: "out", supply: "bulb" });
        if (t >= cat.lampUntil) {
          // 沒有燈泡：冷
          extra += 0.004;
          h = updateCat(h, id, (c) => catStatAdd(c, "mood", (-2 * step) / HOUR, t));
          cat = h.cats.find((c) => c.id === id)!;
        }
        if (t >= cat.shedAt) {
          const ok = !!cat.sickSince || catStat(cat, "clean", t) >= SHED_DRY_BELOW;
          h = updateCat(h, id, (c) => ({ ...c, shedAt: nextShedAt(t, rand) }));
          if (!ok) h = updateCat(h, id, (c) => ({ ...reanchorCat(c, t), sickSince: t }));
          events.push({ kind: "shed", catId: id, ok });
          cat = h.cats.find((c) => c.id === id)!;
        }
      }
      if (!opts.live && info.toilet) {
        if (t >= cat.toiletAt) {
          const r = doToilet(h, id, t, rand);
          h = r.home;
          if (r.result === "floor") events.push({ kind: "floor", catId: id });
        }
        cat = h.cats.find((c) => c.id === id)!;
      }
      if (!cat.sickSince && cat.vetUntil + VET_RECOVER_MS <= t) {
        // 地上的便便、貓砂盆滿了：只影響在家裡走的（倉鼠在籠子裡，看的是籠子乾不乾淨）
        const risk = sickRiskPerHour(
          { food: catStat(cat, "food", t), clean: catStat(cat, "clean", t) },
          {
            messes: info.roams ? Object.keys(h.messes).length : 0,
            boxFull: info.toilet === "litter" && h.box >= boxLimit(cat),
          },
          cat.checkupUntil > t,
          extra,
        );
        if (rand() < risk * (step / HOUR)) {
          // 生病之後數值掉得比較快：先記下現在的值，從這裡開始用新的速度
          h = updateCat(h, id, (c) => ({ ...reanchorCat(c, t), sickSince: t }));
          events.push({ kind: "sick", catId: id });
        }
      }
    }
    for (const supply of had) {
      if (h.stock[supply] <= 0) {
        events.push({ kind: "out", supply });
        had.delete(supply);
      }
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
