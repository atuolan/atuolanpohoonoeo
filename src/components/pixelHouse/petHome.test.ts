import { describe, expect, it } from "vitest";
import { adoptCat, cagedPose, catStat, gliderOut, hamsterBites, hamsterPose, walkDog, WALK_MS, type CatState } from "./houseCat";
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
  emptyStock,
  catsHome,
  checkupPrice,
  MAX_CAGED,
  roomFor,
  SPECIES_INFO,
  hideStash,
  type PetStock,
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
    // 貓一天大約 4 份
    const h = homeWith([kitty("a"), kitty("b")], { stock: { ...emptyStock(), kibble: 40, litter: 16 } });
    expect(stockDays(h, "kibble")).toBe(5);
    expect(stockDays(h, "litter")).toBe(2);
    expect(stockDays(homeWith([kitty("a", { personality: "glutton" })], { stock: { ...emptyStock(), kibble: 52, litter: 0 } }), "kibble")).toBe(10);
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
    const h = homeWith([kitty("a")], { stock: { ...emptyStock(), kibble: 3, litter: 100 }, simAt: T0 });
    const r = simulatePets(h, T0 + 3 * DAY, { live: false }, () => 0.999);
    expect(r.home.stock.kibble).toBe(0);
    expect(r.events.some((e) => e.kind === "out" && e.supply === "kibble")).toBe(true);
    expect(catStat(r.home.cats[0], "food", T0 + 3 * DAY)).toBeLessThan(20);
    expect(r.home.simAt).toBe(T0 + 3 * DAY);
  });

  it("夠吃的話一直不會餓（貓少量多餐，一天大約四份）", () => {
    const h = homeWith([kitty("a")], { stock: { ...emptyStock(), kibble: 100, litter: 100 }, simAt: T0 });
    const r = simulatePets(h, T0 + 5 * DAY, { live: false }, () => 0.999);
    expect(catStat(r.home.cats[0], "food", T0 + 5 * DAY)).toBeGreaterThan(60);
    expect(100 - r.home.stock.kibble).toBeGreaterThanOrEqual(18);
    expect(100 - r.home.stock.kibble).toBeLessThanOrEqual(22);
  });

  it("關著的時候自己上廁所：大約每 6 小時一次", () => {
    const h = homeWith([kitty("a", { toiletAt: T0 + HOUR })], { stock: { ...emptyStock(), kibble: 100, litter: 100 }, simAt: T0 });
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
        foodVersion: 2,
        messes: { "mess-bath": "pee", 不存在: "poop", "mess-kitchen": "彩虹" },
      },
      null,
      T0,
    );
    expect(pets.cats.map((c) => c.id)).toEqual(["x", "y", "z"]);
    expect(pets.stock).toEqual({ ...emptyStock(), kibble: 5, litter: 0 });
    expect(pets.messes).toEqual({ "mess-bath": "pee" });
    // 有新版就不看舊版
    expect(parsePetHome({ cats: [] }, cat, T0).cats).toEqual([]);
  });

  it("舊存檔的貓糧、雪貂糧一份是現在的兩份：庫存乘 2，只換一次", () => {
    const old = parsePetHome({ cats: [], stock: { kibble: 7, ferretFood: 3, dogFood: 5 } }, null, T0);
    expect(old.stock).toMatchObject({ kibble: 14, ferretFood: 6, dogFood: 5 });
    expect(old.foodVersion).toBe(2);
    const again = parsePetHome(JSON.parse(JSON.stringify(old)), null, T0);
    expect(again.stock).toMatchObject({ kibble: 14, ferretFood: 6, dogFood: 5 });
  });
});

describe("狗和倉鼠", () => {
  const dog = (id: string, patch: Partial<CatState> = {}): CatState => ({ ...adoptCat(id, "shiba", T0, () => 0.5, id, "dog"), personality: "lazy", ...patch });
  const ham = (id: string, patch: Partial<CatState> = {}): CatState => ({ ...adoptCat(id, "golden", T0, () => 0.5, id, "hamster"), personality: "lazy", ...patch });

  it("價錢：第一隻免費（不管哪種），之後狗 32,000、倉鼠 1,500", () => {
    expect(adoptPrice(0, "dog")).toBe(0);
    expect(adoptPrice(1, "dog")).toBe(32_000);
    expect(adoptPrice(1, "hamster")).toBe(1_500);
  });

  it("貓狗加起來最多三隻，倉鼠另外最多三隻", () => {
    let h: PetHome | null = emptyPetHome(T0);
    h = addCat(h, "咪", "orange", T0, Math.random, "cat");
    h = addCat(h!, "旺", "shiba", T0, Math.random, "dog");
    h = addCat(h!, "財", "black", T0, Math.random, "dog");
    expect(addCat(h!, "第四隻", "orange", T0, Math.random, "cat")).toBeNull();
    expect(addCat(h!, "第四隻", "white", T0, Math.random, "dog")).toBeNull();
    for (let i = 0; i < MAX_CAGED; i++) h = addCat(h!, `鼠${i}`, "golden", T0, Math.random, "hamster");
    expect(h!.cats).toHaveLength(6);
    expect(addCat(h!, "鼠鼠", "gray", T0, Math.random, "hamster")).toBeNull();
    expect(roomFor(h!, "hamster")).toBe(false);
  });

  it("花色不是這個種類的：用這個種類的第一種", () => {
    expect(adoptCat("", "orange", T0, () => 0.5, "x", "dog").color).toBe("shiba");
    expect(adoptCat("", "orange", T0, () => 0.5, "x", "hamster").color).toBe("golden");
  });

  it("新手包照種類送", () => {
    const h = addCat(emptyPetHome(T0), "旺", "shiba", T0, Math.random, "dog")!;
    expect(h.stock).toEqual({ ...emptyStock(), ...SPECIES_INFO.dog.starter });
    const h2 = addCat(h, "鼠", "golden", T0, Math.random, "hamster")!;
    expect(h2.stock.pellet).toBe(SPECIES_INFO.hamster.starter.pellet);
    expect(h2.stock.dogFood).toBe(SPECIES_INFO.dog.starter.dogFood);
  });

  it("存檔讀回來：種類、散步時間都在；舊的貓沒有種類就是貓", () => {
    const d = dog("d", { walkedAt: T0 - HOUR, outUntil: T0 + 10 });
    const back = parsePetHome(JSON.parse(JSON.stringify({ cats: [d, ham("h"), { name: "咪", color: "gray", id: "c" }] })), null, T0);
    expect(back.cats.map((c) => c.species)).toEqual(["dog", "hamster", "cat"]);
    expect(back.cats[0]).toMatchObject({ walkedAt: T0 - HOUR, outUntil: T0 + 10, color: "shiba" });
    // 花色跟種類對不上：壞掉的，丟掉
    expect(parsePetHome({ cats: [{ species: "dog", color: "orange", id: "q" }] }, null, T0).cats).toEqual([]);
  });

  it("狗用尿布墊：用掉一片，不會弄髒貓砂盆；沒有尿布墊就上在地上", () => {
    const h = homeWith([dog("d", { training: 100 })], { stock: { ...emptyStock(), pad: 2 } });
    const r = doToilet(h, "d", T0, () => 0);
    expect(r.result).toBe("box");
    expect(r.home.stock.pad).toBe(1);
    expect(r.home.box).toBe(0);
    const none = doToilet(homeWith([dog("d", { training: 100 })], { stock: emptyStock() }), "d", T0, () => 0);
    expect(none.result).toBe("floor");
  });

  it("狗帶去尿布墊訓練：獎勵用潔牙骨", () => {
    const h = homeWith([dog("d")], { stock: { ...emptyStock(), pad: 5, chew: 1, treat: 3 } });
    const r = doToilet(h, "d", T0, () => 0.9, { guided: true, useTreat: true });
    expect(r.trained).toBe(TRAIN_GAIN + TRAIN_TREAT_BONUS);
    expect(r.home.stock.chew).toBe(0);
    expect(r.home.stock.treat).toBe(3);
  });

  it("散步：心情變好、出門半小時、路上上過廁所；不在家的時候不補算", () => {
    const d = dog("d", { mood: { v: 40, at: T0 } });
    const w = walkDog(d, T0, () => 0.5);
    expect(catStat(w, "mood", T0)).toBe(40 + 25);
    expect(w.outUntil).toBe(T0 + WALK_MS);
    expect(w.toiletAt).toBeGreaterThan(T0 + 4 * HOUR);
    expect(catsHome(homeWith([w]), T0 + 10 * 60_000)).toHaveLength(0);
    expect(catsHome(homeWith([w]), T0 + WALK_MS)).toHaveLength(1);
  });

  it("太久沒散步：心情掉得比較快", () => {
    const fresh = dog("a", { walkedAt: T0 });
    const stale = dog("b", { walkedAt: T0 - 2 * DAY });
    const h = homeWith([fresh, stale], { stock: { ...emptyStock(), dogFood: 100, pad: 100 }, simAt: T0 });
    const r = simulatePets(h, T0 + 10 * HOUR, { live: true }, () => 0.999);
    const mood = (id: string) => catStat(r.home.cats.find((c) => c.id === id)!, "mood", T0 + 10 * HOUR);
    expect(mood("a") - mood("b")).toBeGreaterThan(30);
  });

  it("倉鼠在籠子裡：小屋開著也自己吃鼠糧；不上廁所、不會在地上留便便", () => {
    const h = homeWith([ham("h", { food: { v: 30, at: T0 }, toiletAt: T0 })], { stock: { ...emptyStock(), pellet: 10 }, simAt: T0 });
    const live = simulatePets(h, T0 + 2 * HOUR, { live: true }, () => 0.999);
    expect(live.home.stock.pellet).toBe(9);
    const off = simulatePets(h, T0 + 3 * DAY, { live: false }, () => 0.999);
    expect(off.home.messes).toEqual({});
    expect(off.home.stock.litter).toBe(0);
  });

  it("倉鼠的籠子大約一週才要換木屑；用品大約夠幾天", () => {
    const h = ham("h", { clean: { v: 100, at: T0 } });
    expect(catStat(h, "clean", T0 + 3 * DAY)).toBeGreaterThan(50);
    expect(catStat(h, "clean", T0 + 8 * DAY)).toBe(0);
    const home = homeWith([h], { stock: { ...emptyStock(), pellet: 20, bedding: 2 } });
    expect(stockDays(home, "pellet")).toBe(10);
    expect(stockDays(home, "bedding")).toBe(14);
    expect(stockDays(home, "kibble")).toBe(Infinity);
  });

  it("看醫生、健康檢查：倉鼠便宜、狗貴一點", () => {
    const sick = (c: CatState) => ({ ...c, sickSince: T0 });
    expect(vetCost(sick(ham("h")), T0, false)).toBe(800);
    expect(vetCost(sick(dog("d")), T0, false)).toBe(2_400);
    expect(vetCost(sick(kitty("c")), T0, false)).toBe(VET_MILD);
    expect(checkupPrice("hamster")).toBe(1_200);
    expect(checkupPrice("cat")).toBe(3_000);
  });

  it("用完了會說是哪一樣", () => {
    const h = homeWith([dog("d")], { stock: { ...emptyStock(), dogFood: 1, pad: 100 }, simAt: T0 });
    const r = simulatePets(h, T0 + 2 * DAY, { live: false }, () => 0.999);
    expect(r.events).toContainEqual({ kind: "out", supply: "dogFood" });
  });

  it("倉鼠：白天睡、晚上常跑滾輪；生病只會睡", () => {
    const h = ham("h");
    const nights = Array.from({ length: 50 }, (_, i) => hamsterPose(h, "night", false, T0 + i * 600_000));
    expect(nights.filter((p) => p === "run").length).toBeGreaterThan(15);
    expect(hamsterPose(h, "day", false, T0)).toBe("sleep");
    expect(hamsterPose({ ...h, sickSince: T0 }, "night", false, T0)).toBe("sleep");
  });

  it("倉鼠還不熟會咬人，熟了就不會；貓狗不會", () => {
    expect(hamsterBites(ham("h", { affinity: 5 }), () => 0.1)).toBe(true);
    expect(hamsterBites(ham("h", { affinity: 80 }), () => 0)).toBe(false);
    expect(hamsterBites(kitty("c", { affinity: 0 }), () => 0)).toBe(false);
  });
});

describe("雪貂、天竺鼠、蜜袋鼯、蛇", () => {
  const mk = (id: string, species: CatState["species"], color: string, patch: Partial<CatState> = {}): CatState => ({
    ...adoptCat(id, color as CatState["color"], T0, () => 0.5, id, species),
    personality: "lazy",
    ...patch,
  });
  const full = (patch: Partial<PetStock> = {}): PetStock => ({ ...emptyStock(), ...patch });

  it("價錢、上限：雪貂算在家裡走的（貓狗雪貂合計三隻），另外三種跟倉鼠一起算籠子（合計三隻）", () => {
    expect(adoptPrice(1, "ferret")).toBe(20_000);
    expect(adoptPrice(1, "glider")).toBe(12_000);
    expect(adoptPrice(1, "snake")).toBe(8_000);
    expect(adoptPrice(1, "guineaPig")).toBe(3_000);
    let h: PetHome | null = emptyPetHome(T0);
    for (const sp of ["cat", "dog", "ferret"] as const) h = addCat(h!, sp, sp === "cat" ? "orange" : sp === "dog" ? "shiba" : "sable", T0, Math.random, sp);
    expect(roomFor(h!, "ferret")).toBe(false);
    for (const [sp, c] of [["guineaPig", "ginger"], ["glider", "classic"], ["snake", "corn"]] as const) h = addCat(h!, sp, c, T0, Math.random, sp);
    expect(h!.cats).toHaveLength(6);
    expect(roomFor(h!, "hamster")).toBe(false);
  });

  it("雪貂用貓砂盆：用掉貓砂、貓砂盆會髒；吃雪貂糧", () => {
    const h = homeWith([mk("f", "ferret", "sable", { training: 100 })], { stock: full({ litter: 5, ferretFood: 3 }) });
    const r = doToilet(h, "f", T0, () => 0);
    expect(r.result).toBe("box");
    expect(r.home.stock.litter).toBe(4);
    expect(r.home.box).toBe(1);
    const fed = simulatePets(homeWith([mk("f", "ferret", "sable", { food: { v: 30, at: T0 } })], { stock: full({ ferretFood: 3, litter: 50 }), simAt: T0 }), T0 + HOUR, { live: false }, () => 0.999);
    expect(fed.home.stock.ferretFood).toBe(2);
  });

  it("雪貂藏東西：一次一處，找到拿金幣；存檔讀回來還在", () => {
    const h = hideStash(homeWith([mk("f", "ferret", "sable")]), "小貂", 30, () => 0);
    expect(h.stash).toEqual({ spot: "stash-sofa", coins: 30, by: "小貂" });
    expect(hideStash(h, "小貂", 99).stash!.coins).toBe(30);
    const back = parsePetHome(JSON.parse(JSON.stringify(h)), null, T0);
    expect(back.stash).toEqual(h.stash);
    // 新的種類存檔讀回來還是同一種、同一個花色
    const all = [mk("a", "ferret", "silver"), mk("b", "guineaPig", "panda"), mk("c", "glider", "white"), mk("d", "snake", "ball")];
    const round = parsePetHome(JSON.parse(JSON.stringify(homeWith(all))), null, T0);
    expect(round.cats.map((c) => [c.species, c.color])).toEqual(all.map((c) => [c.species, c.color]));
    expect(parsePetHome({ cats: [], stash: { spot: "不存在", coins: 5 } }, null, T0).stash).toBeNull();
  });

  it("天竺鼠：牧草吃很多，一天自己吃一份蔬菜；沒有蔬菜好幾天容易生病", () => {
    const g = mk("g", "guineaPig", "ginger", { vegAt: T0 - 2 * DAY });
    const h = homeWith([g], { stock: full({ hay: 100, veg: 5, bedding: 2 }), simAt: T0 });
    const r = simulatePets(h, T0 + 3 * DAY, { live: true }, () => 0.999);
    expect(100 - r.home.stock.hay).toBeGreaterThanOrEqual(10);
    expect(5 - r.home.stock.veg).toBe(3);
    const noVeg = homeWith([{ ...g, vegAt: T0 - 5 * DAY }], { stock: full({ hay: 100 }), simAt: T0 });
    const sick = (home: PetHome) => {
      let n = 0;
      for (let i = 0; i < 200; i++) if (simulatePets(home, T0 + DAY, { live: true }).events.some((e) => e.kind === "sick")) n++;
      return n;
    };
    expect(sick(noVeg)).toBeGreaterThan(sick(homeWith([{ ...g, vegAt: T0 }], { stock: full({ hay: 100, veg: 30 }), simAt: T0 })));
  });

  it("蛇：一週吃一隻冷凍鼠；燈泡用完自己換，沒有燈泡會冷、說一聲", () => {
    const sn = mk("s", "snake", "corn", { lampUntil: T0 + DAY, shedAt: T0 + 90 * DAY });
    const h = homeWith([sn], { stock: full({ mouse: 10, bulb: 1 }), simAt: T0 });
    const r = simulatePets(h, T0 + 28 * DAY, { live: true }, () => 0.999);
    expect(10 - r.home.stock.mouse).toBeGreaterThanOrEqual(3);
    expect(10 - r.home.stock.mouse).toBeLessThanOrEqual(5);
    expect(r.home.stock.bulb).toBe(0);
    expect(r.home.cats[0].lampUntil).toBe(T0 + DAY + 30 * DAY);
    const cold = simulatePets(homeWith([sn], { stock: full({ mouse: 10 }), simAt: T0 }), T0 + 2 * DAY, { live: true }, () => 0.999);
    expect(cold.events).toContainEqual({ kind: "out", supply: "bulb" });
    expect(cold.events.filter((e) => e.kind === "out")).toHaveLength(1);
  });

  it("蛇蛻皮：飼養箱夠濕就順利，太乾會生病", () => {
    const wet = mk("s", "snake", "corn", { shedAt: T0 + HOUR, lampUntil: T0 + 30 * DAY, clean: { v: 100, at: T0 } });
    const ok = simulatePets(homeWith([wet], { stock: full({ mouse: 5 }), simAt: T0 }), T0 + 2 * HOUR, { live: true }, () => 0.999);
    expect(ok.events).toContainEqual({ kind: "shed", catId: "s", ok: true });
    expect(ok.home.cats[0].shedAt).toBeGreaterThan(T0 + 17 * DAY);
    const dry = simulatePets(homeWith([{ ...wet, clean: { v: 10, at: T0 } }], { stock: full({ mouse: 5 }), simAt: T0 }), T0 + 2 * HOUR, { live: true }, () => 0.999);
    expect(dry.events).toContainEqual({ kind: "shed", catId: "s", ok: false });
    expect(dry.home.cats[0].sickSince).toBeGreaterThan(0);
  });

  it("保溫燈泡夠幾天：裝著的加上庫存", () => {
    const sn = mk("s", "snake", "corn", { lampUntil: T0 + 10 * DAY });
    expect(stockDays(homeWith([sn], { stock: full({ bulb: 1 }), simAt: T0 }), "bulb")).toBe(40);
    expect(stockDays(homeWith([sn], { stock: full(), simAt: T0 + 11 * DAY }), "bulb")).toBe(0);
  });

  it("籠子裡的姿勢：蜜袋鼯白天窩在睡袋；天竺鼠開心偶爾跳；蛇大多盤著", () => {
    const gl = mk("gl", "glider", "classic");
    expect(cagedPose(gl, "day", false, T0)).toBe("pouch");
    const nights = Array.from({ length: 60 }, (_, i) => cagedPose(gl, "night", false, T0 + i * 600_000));
    expect(nights.some((p) => p === "climb")).toBe(true);
    const gp = mk("gp", "guineaPig", "ginger", { personality: "playful" });
    const days = Array.from({ length: 80 }, (_, i) => cagedPose(gp, "day", false, T0 + i * 600_000, 90));
    expect(days.some((p) => p === "popcorn")).toBe(true);
    expect(cagedPose(gp, "day", false, T0, 10)).not.toBe("popcorn");
    const sn = mk("sn", "snake", "corn");
    expect(cagedPose({ ...sn, sickSince: T0 }, "night", false, T0)).toBe("coil");
  });

  it("蜜袋鼯跑到他身上：晚上在肩上、白天熟了在口袋；他不在或在睡就不會", () => {
    const gl = mk("gl", "glider", "classic", { affinity: 100, personality: "clingy" });
    const nights = Array.from({ length: 60 }, (_, i) => gliderOut(gl, "night", false, T0 + i * 600_000, true));
    expect(nights.filter((w) => w === "shoulder").length).toBeGreaterThan(20);
    expect(nights.some((w) => w === "pocket")).toBe(false);
    const days = Array.from({ length: 60 }, (_, i) => gliderOut(gl, "day", false, T0 + i * 600_000, true));
    expect(days.some((w) => w === "pocket")).toBe(true);
    expect(gliderOut(gl, "night", false, T0, false)).toBeNull();
    expect(gliderOut({ ...gl, affinity: 10 }, "day", false, T0, true)).toBeNull();
  });

  it("看醫生照種類：天竺鼠便宜、雪貂跟貓一樣", () => {
    expect(vetCost({ ...mk("g", "guineaPig", "ginger"), sickSince: T0 }, T0, false)).toBe(1_000);
    expect(vetCost({ ...mk("f", "ferret", "sable"), sickSince: T0 }, T0, false)).toBe(VET_MILD);
    expect(checkupPrice("snake")).toBe(2_400);
  });
});
