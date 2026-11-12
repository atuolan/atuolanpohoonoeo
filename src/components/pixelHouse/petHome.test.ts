import { describe, expect, it } from "vitest";
import { adoptCat, catStat, type CatState } from "./houseCat";
import { ROOM_H, ROOM_W } from "./houseData";
import { defaultHouseLifeState, parseHouseLifeState } from "./houseLife";
import {
  addCat,
  adoptPrice,
  boxLimit,
  doToilet,
  emptyPetHome,
  EXTRA_CAT_PRICE,
  ICON_ART,
  litterChance,
  LITTER_ART,
  MAX_CATS,
  MESS_ART,
  MESS_SPOTS,
  parsePetHome,
  sickRiskPerHour,
  simulatePets,
  STARTER_STOCK,
  stockDays,
  SUPPLIES,
  treatCat,
  TRAIN_GAIN,
  TRAIN_TREAT_BONUS,
  VET_MILD,
  VET_SERIOUS,
  VET_STAY_MS,
  vetCost,
  type PetHome,
} from "./petHome";

const T0 = 1_800_000_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** 測試用的貓：個性固定成「懶洋洋」（不影響數值掉的速度） */
const kitty = (id: string, patch: Partial<CatState> = {}): CatState => ({ ...adoptCat(id, "gray", T0, () => 0.5, id), personality: "lazy", ...patch });
const homeWith = (cats: CatState[], patch: Partial<PetHome> = {}): PetHome => ({ ...emptyPetHome(T0), cats, stock: { ...STARTER_STOCK }, ...patch });

describe("買貓", () => {
  it("第一隻免費，之後每隻都一樣價錢，最多三隻", () => {
    expect(adoptPrice(0)).toBe(0);
    expect(adoptPrice(1)).toBe(EXTRA_CAT_PRICE);
    expect(adoptPrice(2)).toBe(EXTRA_CAT_PRICE);
    expect(EXTRA_CAT_PRICE).toBe(32_000);
    let h: PetHome | null = emptyPetHome(T0);
    for (let i = 0; i < MAX_CATS; i++) h = addCat(h!, `貓${i}`, "orange", T0 + i);
    expect(h!.cats).toHaveLength(MAX_CATS);
    expect(new Set(h!.cats.map((c) => c.id)).size).toBe(MAX_CATS);
    expect(addCat(h!, "第四隻", "gray", T0)).toBeNull();
  });

  it("每隻來的時候送一份新手包", () => {
    const one = addCat(emptyPetHome(T0), "咪", "gray", T0)!;
    expect(one.stock).toEqual(STARTER_STOCK);
    const two = addCat(one, "嚕", "white", T0)!;
    expect(two.stock.kibble).toBe(STARTER_STOCK.kibble * 2);
  });

  it("同一毫秒、同一個亂數領養兩隻，id 也不會撞", () => {
    const a = addCat(emptyPetHome(T0), "咪", "gray", T0, () => 0.3)!;
    const b = addCat(a, "咪", "gray", T0, () => 0.3)!;
    expect(new Set(b.cats.map((c) => c.id)).size).toBe(2);
  });
});

describe("用品", () => {
  it("價錢、份量都是正的；貓糧大約夠幾天", () => {
    for (const s of Object.values(SUPPLIES)) {
      expect(s.price).toBeGreaterThan(0);
      expect(s.pack).toBeGreaterThan(0);
    }
    const h = homeWith([kitty("a"), kitty("b")], { stock: { kibble: 20, can: 0, treat: 0, litter: 16 } });
    expect(stockDays(h, "kibble")).toBe(5);
    expect(stockDays(h, "litter")).toBe(2);
    expect(stockDays(homeWith([kitty("a", { personality: "glutton" })], { stock: { kibble: 26, can: 0, treat: 0, litter: 0 } }), "kibble")).toBe(10);
    expect(stockDays(emptyPetHome(T0), "kibble")).toBe(Infinity);
  });
});

describe("上廁所", () => {
  it("訓練度越高越會去貓砂盆；沒貓砂、貓砂盆太髒就不會去；愛乾淨的比較挑", () => {
    const fresh = kitty("a");
    const trained = kitty("a", { training: 100 });
    const ok = { box: 0, litter: 10 };
    expect(litterChance(fresh, ok)).toBeCloseTo(0.3);
    expect(litterChance(trained, ok)).toBeCloseTo(1);
    expect(litterChance(trained, { box: 0, litter: 0 })).toBe(0);
    expect(litterChance(trained, { box: boxLimit(trained), litter: 10 })).toBe(0);
    const neat = kitty("a", { personality: "neat", training: 100 });
    expect(boxLimit(neat)).toBeLessThan(boxLimit(trained));
    expect(litterChance(neat, { box: boxLimit(neat), litter: 10 })).toBe(0);
  });

  it("去貓砂盆：用掉一次貓砂、貓砂盆髒一點、訓練度加一點，下次上廁所排在幾小時後", () => {
    const h = homeWith([kitty("a")]);
    const r = doToilet(h, "a", T0, () => 0);
    expect(r.result).toBe("box");
    expect(r.home.box).toBe(1);
    expect(r.home.stock.litter).toBe(STARTER_STOCK.litter - 1);
    expect(r.home.cats[0].training).toBe(1);
    expect(r.home.cats[0].toiletAt).toBeGreaterThan(T0 + 4 * HOUR);
  });

  it("沒去：地上多一灘；每個地方最多一灘，滿了就不再多", () => {
    let h = homeWith([kitty("a")], { stock: { ...STARTER_STOCK, litter: 0 } });
    for (let i = 0; i < MESS_SPOTS.length + 3; i++) {
      const r = doToilet(h, "a", T0, () => 0);
      expect(r.result).toBe("floor");
      h = r.home;
    }
    expect(Object.keys(h.messes)).toHaveLength(MESS_SPOTS.length);
  });

  it("小遊戲帶去：一定去貓砂盆、訓練度加比較多；有貓條當獎勵再多加，用掉一條", () => {
    const h = homeWith([kitty("a")]);
    const plain = doToilet(h, "a", T0, () => 0.99, { guided: true });
    expect(plain.result).toBe("box");
    expect(plain.trained).toBe(TRAIN_GAIN);
    expect(plain.home.stock.treat).toBe(STARTER_STOCK.treat);
    const treat = doToilet(h, "a", T0, () => 0.99, { guided: true, useTreat: true });
    expect(treat.trained).toBe(TRAIN_GAIN + TRAIN_TREAT_BONUS);
    expect(treat.home.stock.treat).toBe(STARTER_STOCK.treat - 1);
    // 沒有貓條：不加獎勵，也不會變負的
    const none = doToilet(homeWith([kitty("a")], { stock: { ...STARTER_STOCK, treat: 0 } }), "a", T0, () => 0.99, { guided: true, useTreat: true });
    expect(none.trained).toBe(TRAIN_GAIN);
    expect(none.home.stock.treat).toBe(0);
  });

  it("便便的位置都在房間裡、id 不重複；圖的每一列一樣寬", () => {
    expect(new Set(MESS_SPOTS.map((m) => m.id)).size).toBe(MESS_SPOTS.length);
    for (const m of MESS_SPOTS) {
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.x + 13).toBeLessThanOrEqual(ROOM_W);
      expect(m.y).toBeLessThan(ROOM_H);
    }
    for (const art of [...Object.values(LITTER_ART), ...Object.values(MESS_ART), ...Object.values(ICON_ART)]) {
      expect(new Set(art.rows.map((r) => r.length)).size).toBe(1);
      for (const ch of new Set(art.rows.join("").replace(/\./g, ""))) expect(art.palette[ch], ch).toBeTruthy();
    }
  });
});

describe("生病", () => {
  it("好好照顧很少病；餓著、髒著、便便沒清、貓砂盆滿了機率變高；健康檢查有效時低很多", () => {
    const good = sickRiskPerHour({ food: 80, clean: 80 }, { messes: 0, boxFull: false }, false);
    const bad = sickRiskPerHour({ food: 10, clean: 10 }, { messes: 3, boxFull: true }, false);
    expect(bad).toBeGreaterThan(good * 10);
    // 餓著、髒著、便便沒清、貓砂盆滿了：兩天內多半會病
    expect(1 - (1 - bad) ** 48).toBeGreaterThan(0.5);
    expect(sickRiskPerHour({ food: 80, clean: 80 }, { messes: 0, boxFull: false }, true)).toBeLessThan(good);
    // 好好照顧：大約一個月一次；再加健康檢查：大約三個月一次
    const month = 24 * 30;
    expect(good * month).toBeGreaterThan(0.8);
    expect(good * month).toBeLessThan(1.2);
    const checked = sickRiskPerHour({ food: 80, clean: 80 }, { messes: 0, boxFull: false }, true) * month;
    expect(checked).toBeGreaterThan(0.25);
    expect(checked).toBeLessThan(0.45);
  });

  it("看醫生：病了兩天以上比較貴，有保險打對折；沒病是 0", () => {
    const sick = kitty("a", { sickSince: T0 });
    expect(vetCost(sick, T0 + HOUR, false)).toBe(VET_MILD);
    expect(vetCost(sick, T0 + 3 * DAY, false)).toBe(VET_SERIOUS);
    expect(vetCost(sick, T0 + 3 * DAY, true)).toBe(VET_SERIOUS / 2);
    expect(vetCost(kitty("a"), T0, false)).toBe(0);
  });

  it("看完醫生：病好了、在醫院待一陣子、心情掉一點", () => {
    const h = homeWith([kitty("a", { sickSince: T0 - DAY })]);
    const after = treatCat(h, "a", T0).cats[0];
    expect(after.sickSince).toBe(0);
    expect(after.vetUntil).toBe(T0 + VET_STAY_MS);
    expect(catStat(after, "mood", T0)).toBeLessThan(catStat(h.cats[0], "mood", T0));
  });

  it("看完醫生回家一週內不會再病，一週後才會", () => {
    const h = homeWith([kitty("a", { vetUntil: T0 })], { simAt: T0 });
    const week = simulatePets(h, T0 + 6 * DAY, { live: true }, () => 0);
    expect(week.home.cats[0].sickSince).toBe(0);
    const later = simulatePets(week.home, T0 + 8 * DAY, { live: true }, () => 0);
    expect(later.home.cats[0].sickSince).toBeGreaterThan(T0 + 6 * DAY);
  });
});

describe("補算一段時間", () => {
  it("有貓糧：餓了自己吃，庫存變少；貓糧吃完會說一聲，之後就開始餓", () => {
    const h = homeWith([kitty("a")], { stock: { kibble: 3, can: 0, treat: 0, litter: 100 }, simAt: T0 });
    const r = simulatePets(h, T0 + 3 * DAY, { live: false }, () => 0.999);
    expect(r.home.stock.kibble).toBe(0);
    expect(r.events.some((e) => e.kind === "kibble-out")).toBe(true);
    expect(catStat(r.home.cats[0], "food", T0 + 3 * DAY)).toBeLessThan(20);
    expect(r.home.simAt).toBe(T0 + 3 * DAY);
  });

  it("夠吃的話一直不會餓（一天大約兩份）", () => {
    const h = homeWith([kitty("a")], { stock: { kibble: 100, can: 0, treat: 0, litter: 100 }, simAt: T0 });
    const r = simulatePets(h, T0 + 5 * DAY, { live: false }, () => 0.999);
    expect(catStat(r.home.cats[0], "food", T0 + 5 * DAY)).toBeGreaterThan(30);
    expect(100 - r.home.stock.kibble).toBeGreaterThanOrEqual(8);
    expect(100 - r.home.stock.kibble).toBeLessThanOrEqual(12);
  });

  it("關著的時候自己上廁所：大約每 6 小時一次", () => {
    const h = homeWith([kitty("a", { toiletAt: T0 + HOUR })], { stock: { kibble: 100, can: 0, treat: 0, litter: 100 }, simAt: T0 });
    const r = simulatePets(h, T0 + DAY, { live: false }, () => 0);
    expect(r.home.box).toBeGreaterThanOrEqual(3);
    expect(r.home.box).toBeLessThanOrEqual(5);
  });

  it("小屋開著（live）：不自己吃、不自己上廁所，只判斷生病", () => {
    const h = homeWith([kitty("a", { toiletAt: T0 })], { simAt: T0 });
    const r = simulatePets(h, T0 + 2 * HOUR, { live: true }, () => 0.999);
    expect(r.home.stock).toEqual(h.stock);
    expect(r.home.box).toBe(0);
    const sick = simulatePets(h, T0 + 2 * HOUR, { live: true }, () => 0);
    expect(sick.home.cats[0].sickSince).toBeGreaterThan(T0);
    expect(sick.events).toEqual([{ kind: "sick", catId: "a" }]);
  });

  it("在醫院的貓不算；時間被往回調什麼都不算；很久沒開最多補算 60 天", () => {
    const atVet = homeWith([kitty("a", { vetUntil: T0 + DAY })], { simAt: T0 });
    expect(simulatePets(atVet, T0 + 10 * HOUR, { live: false }, () => 0).home.stock).toEqual(atVet.stock);
    const h = homeWith([kitty("a")], { simAt: T0 });
    expect(simulatePets(h, T0 - DAY, { live: false })).toEqual({ home: { ...h, simAt: T0 - DAY }, events: [] });
    const start = performance.now();
    const long = simulatePets(homeWith([kitty("a"), kitty("b"), kitty("c")], { simAt: T0 }), T0 + 400 * DAY, { live: false });
    expect(long.home.simAt).toBe(T0 + 400 * DAY);
    // 60 天 × 3 隻，一小時一步：很快就算完
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("生病不會死、不會跑：放一年還是在", () => {
    const r = simulatePets(homeWith([kitty("a")], { simAt: T0 }), T0 + 365 * DAY, { live: false });
    expect(r.home.cats).toHaveLength(1);
  });
});

describe("存檔", () => {
  it("沒有養貓：空的家", () => {
    const s = defaultHouseLifeState(new Date(T0));
    expect(s.pets.cats).toEqual([]);
    expect(parseHouseLifeState({}).pets.cats).toEqual([]);
  });

  it("舊版只有一隻 cat：搬進來，送一份新手包", () => {
    const s = parseHouseLifeState({ cat: { name: "麻糬", color: "orange", food: { v: 50, at: T0 }, clean: { v: 50, at: T0 }, mood: { v: 50, at: T0 } } });
    expect(s.pets.cats).toHaveLength(1);
    expect(s.pets.cats[0]).toMatchObject({ name: "麻糬", color: "orange", id: "cat-1", training: 0 });
    expect(s.pets.stock).toEqual(STARTER_STOCK);
  });

  it("新版：壞掉的欄位用預設值，重複的貓、超過三隻、不認得的便便丟掉", () => {
    const cat = { name: "咪", color: "gray", id: "x" };
    const pets = parsePetHome(
      {
        cats: [cat, cat, { ...cat, id: "y" }, { ...cat, id: "z" }, { ...cat, id: "w" }, "壞掉"],
        stock: { kibble: 5.7, can: -3, litter: "很多" },
        box: 2,
        messes: { "mess-bath": "pee", 不存在: "poop", "mess-kitchen": "彩虹" },
      },
      null,
      T0,
    );
    expect(pets.cats.map((c) => c.id)).toEqual(["x", "y", "z"]);
    expect(pets.stock).toEqual({ kibble: 5, can: 0, treat: 0, litter: 0 });
    expect(pets.messes).toEqual({ "mess-bath": "pee" });
    // 有新版就不看舊版
    expect(parsePetHome({ cats: [] }, cat, T0).cats).toEqual([]);
  });
});
