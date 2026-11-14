import { describe, expect, it } from "vitest";
import {
  adoptCat,
  BOWL_ART,
  careCat,
  catDwellMs,
  catLevels,
  catListless,
  cleanCatName,
  parseCat,
  pickCatAct,
  rollCatGift,
  statNow,
  CAT_ACTS,
  CAT_ART,
  CAT_COLORS,
  CAT_COLOR_IDS,
  CAT_DECAY_MS,
  CAT_CARE_EFFECT,
  CAT_PERSONALITY_IDS,
  decayMult,
  eatKibble,
  KIBBLE_GAIN,
  CAT_GIFT_COINS,
  CAT_H,
  CAT_FIND_CHANCE,
  CAT_FOLLOW,
  CAT_RUB,
  CAT_W,
  pickCatFind,
  PERCH_FLOOR_Y,
  CAT_WEIGHTS,
} from "./houseCat";
import { ROOM_H, ROOM_W } from "./houseData";
import { parseHouseLifeState } from "./houseLife";

const T0 = 1_800_000_000_000;
/** 測試用的貓：個性固定成「懶洋洋」（不影響數值掉的速度） */
const kitty = (patch: Record<string, unknown> = {}) => ({ ...adoptCat("咪", "gray", T0, () => 0.5), personality: "lazy" as const, ...patch });
const HOUR = 3_600_000;

describe("貓的圖", () => {
  it("每個姿勢都是 36×24（畫面上 24×16，比例一樣），用到的顏色每種花色都有", () => {
    expect(36 / 24).toBe(CAT_W / CAT_H);
    for (const [pose, rows] of Object.entries(CAT_ART)) {
      expect(rows.length, pose).toBe(24);
      for (const row of rows) expect(row.length, `${pose}: ${row}`).toBe(36);
      const used = new Set(rows.join("").replace(/\./g, ""));
      for (const id of CAT_COLOR_IDS) for (const ch of used) expect(CAT_COLORS[id].palette[ch], `${pose} ${id} ${ch}`).toBeTruthy();
    }
    expect(new Set(Object.values(BOWL_ART).flat().map((r) => r.length)).size).toBe(1);
  });
});

describe("貓的數值", () => {
  it("照時間慢慢掉，一天從滿到空，不會低於 0", () => {
    const stat = { v: 100, at: T0 };
    expect(statNow(stat, "food", T0)).toBe(100);
    expect(statNow(stat, "food", T0 + 12 * HOUR)).toBeCloseTo(50);
    expect(statNow(stat, "food", T0 + CAT_DECAY_MS.food)).toBe(0);
    expect(statNow(stat, "food", T0 + 900 * HOUR)).toBe(0);
    // 乾淨掉得比較慢
    expect(statNow(stat, "clean", T0 + 24 * HOUR)).toBeCloseTo(50);
  });

  it("手機時間往回調：不會變多", () => {
    expect(statNow({ v: 40, at: T0 }, "mood", T0 - 5 * HOUR)).toBe(40);
  });

  it("剛領養都是八成；名字太長會截掉、沒取名用花色的名字", () => {
    const cat = adoptCat("  小橘子是全世界最可愛的貓  ", "orange", T0);
    expect([...cat.name].length).toBe(8);
    expect(catLevels(cat, T0)).toEqual({ food: 80, clean: 80, mood: 80 });
    expect(adoptCat("   ", "tuxedo", T0).name).toBe("賓士貓");
    expect(cleanCatName("咪  咪")).toBe("咪 咪");
  });

  it("吃貓糧、罐頭變飽，摸、逗、貓條心情和親密度變好，洗了變乾淨但有點不高興，都不超過 100", () => {
    const hungry = kitty({ food: { v: 10, at: T0 } });
    expect(catLevels(eatKibble(hungry, T0), T0).food).toBe(10 + KIBBLE_GAIN);
    expect(catLevels(eatKibble(eatKibble(eatKibble(hungry, T0), T0), T0), T0).food).toBe(100);
    expect(catLevels(careCat(hungry, "can", T0), T0).food).toBe(10 + CAT_CARE_EFFECT.can[0]);
    const base = kitty();
    expect(catLevels(careCat(base, "pet", T0), T0).mood).toBeGreaterThan(80);
    expect(catLevels(careCat(base, "play", T0), T0).mood).toBeGreaterThan(catLevels(careCat(base, "pet", T0), T0).mood);
    expect(careCat(base, "treat", T0).affinity).toBe(base.affinity + CAT_CARE_EFFECT.treat[2]);
    expect(careCat({ ...base, affinity: 99 }, "treat", T0).affinity).toBe(100);
    const washed = careCat({ ...base, clean: { v: 20, at: T0 } }, "wash", T0);
    expect(catLevels(washed, T0).clean).toBe(100);
    expect(catLevels(washed, T0).mood).toBeLessThan(80);
  });

  it("太餓、心情太差、生病會沒精神；很久沒開也只是沒精神，餵一次就好", () => {
    const cat = kitty();
    const later = T0 + 30 * 24 * HOUR;
    expect(catListless(catLevels(cat, T0))).toBe(false);
    expect(catListless(catLevels(cat, T0), true)).toBe(true);
    expect(catListless(catLevels(cat, later))).toBe(true);
    const cared = careCat(careCat(eatKibble(cat, later), "play", later), "can", later);
    expect(catListless(catLevels(cared, later))).toBe(false);
  });

  it("個性和生病改數值掉的速度", () => {
    expect(decayMult({ personality: "glutton", sickSince: 0 }, "food")).toBeCloseTo(1.3);
    expect(decayMult({ personality: "neat", sickSince: 0 }, "clean")).toBeCloseTo(0.8);
    expect(decayMult({ personality: "lazy", sickSince: 0 }, "food")).toBe(1);
    expect(decayMult({ personality: "lazy", sickSince: 5 }, "food")).toBeCloseTo(1.5);
    expect(decayMult({ personality: "lazy", sickSince: 5 }, "clean")).toBe(1);
    const glutton = kitty({ personality: "glutton" });
    expect(catLevels(glutton, T0 + 12 * HOUR).food).toBeLessThan(catLevels(kitty(), T0 + 12 * HOUR).food);
  });

  it("領養：個性隨機、還沒訓練、id 不一樣", () => {
    const seen = new Set(Array.from({ length: 20 }, (_, i) => adoptCat("咪", "gray", T0, () => i / 20).personality));
    expect(seen.size).toBe(CAT_PERSONALITY_IDS.length);
    const a = adoptCat("咪", "gray", T0);
    expect(a.training).toBe(0);
    expect(a.sickSince).toBe(0);
    expect(a.toiletAt).toBeGreaterThan(T0);
    expect(adoptCat("咪", "gray", T0, () => 0.1).id).not.toBe(adoptCat("咪", "gray", T0, () => 0.2).id);
  });

  it("存檔：沒有貓、花色不認得是 null；數值壞掉用一半；舊版的貓補上新欄位、個性每次讀都一樣", () => {
    expect(parseCat(null, T0)).toBeNull();
    expect(parseCat({ name: "咪", color: "彩虹" }, T0)).toBeNull();
    const cat = parseCat({ name: "咪", color: "gray", food: { v: 999, at: T0 }, clean: "壞掉" }, T0)!;
    expect(cat.food.v).toBe(100);
    expect(cat.clean).toEqual({ v: 50, at: T0 });
    expect(cat.id).toBe("cat-1");
    expect(cat.training).toBe(0);
    expect(parseCat({ name: "咪", color: "gray" }, T0)!.personality).toBe(cat.personality);
    expect(parseCat({ name: "咪", color: "gray", personality: "neat", training: 300, affinity: -5 }, T0)).toMatchObject({ personality: "neat", training: 100, affinity: 0 });
  });
});

describe("貓叼東西回來", () => {
  const happy = { food: 80, clean: 50, mood: 90 };
  it("心情好、沒餓著、今天還有額度、機率中了才有", () => {
    expect(rollCatGift(happy, 2, () => 0)).toBe(CAT_GIFT_COINS[0]);
    expect(rollCatGift(happy, 2, () => 0.5)).toBe(0);
    expect(rollCatGift(happy, 0, () => 0)).toBe(0);
    expect(rollCatGift({ ...happy, mood: 60 }, 2, () => 0)).toBe(0);
    expect(rollCatGift({ ...happy, food: 30 }, 2, () => 0)).toBe(0);
  });
});

describe("貓會做的事", () => {
  const base = { scene: "day" as const, current: null, residentAsleep: false, residentHome: true, listless: false };

  it("每件事都在房間裡、機率表裡的事都存在", () => {
    for (const [key, a] of Object.entries(CAT_ACTS)) {
      expect(a.x, key).toBeGreaterThan(0);
      expect(a.x, key).toBeLessThan(ROOM_W);
      expect(a.y, key).toBeLessThan(ROOM_H);
    }
    for (const weights of Object.values(CAT_WEIGHTS)) {
      for (const key of Object.keys(weights)) expect(key === CAT_RUB || key === CAT_FOLLOW || !!CAT_ACTS[key], key).toBe(true);
    }
  });

  it("他在睡覺：跳上床一起睡", () => {
    expect(pickCatAct({ ...base, residentAsleep: true })).toBe("nap-bed");
  });

  it("他不在家：不會去蹭他", () => {
    for (let i = 0; i < 50; i++) expect(pickCatAct({ ...base, residentHome: false }, () => i / 50)).not.toBe(CAT_RUB);
  });

  it("沒精神：只找地方趴著，不玩不蹭", () => {
    for (let i = 0; i < 50; i++) {
      const act = pickCatAct({ ...base, listless: true }, () => i / 50);
      expect(CAT_ACTS[act]?.pose, act).toBe("sleep");
    }
  });

  it("不會連續做同一件事；亂數到 1 也不會出錯", () => {
    for (let i = 0; i <= 50; i++) expect(pickCatAct({ ...base, current: "nap-sofa" }, () => i / 50)).not.toBe("nap-sofa");
    expect(pickCatAct({ ...base, scene: "night" }, () => 0.999999)).toBeTruthy();
  });

  it("比他懶：每件事 40～90 秒，少走動再久四倍", () => {
    expect(catDwellMs("nap-sofa", () => 0)).toBe(40_000);
    expect(catDwellMs("nap-sofa", () => 1)).toBe(90_000);
    expect(catDwellMs("nap-sofa", () => 0, true)).toBe(160_000);
    expect(catDwellMs(CAT_RUB, () => 0)).toBeLessThan(40_000);
  });

  it("窗台在地板上面、跟著窗戶走；他不在家不會跟著他走", () => {
    for (const key of ["sill-living", "sill-bedroom"]) {
      const a = CAT_ACTS[key];
      expect(a.perch, key).toBe(true);
      expect(a.anchor).toBe("window");
      expect(a.y).toBeLessThan(PERCH_FLOOR_Y);
    }
    for (let i = 0; i < 50; i++) expect(pickCatAct({ ...base, residentHome: false }, () => i / 50)).not.toBe(CAT_FOLLOW);
  });

  it("跟著他走一陣子就換別的事", () => {
    expect(catDwellMs(CAT_FOLLOW, () => 0)).toBe(30_000);
    expect(catDwellMs(CAT_FOLLOW, () => 1)).toBe(60_000);
  });
});

describe("貓叼回來的小擺件", () => {
  it("還有沒拿到的才會叼，機率沒中就是金幣", () => {
    expect(pickCatFind([], () => 0)).toBeNull();
    expect(pickCatFind(["cat-yarn", "cat-feather"], () => CAT_FIND_CHANCE)).toBeNull();
    expect(pickCatFind(["cat-yarn", "cat-feather"], () => 0)).toBe("cat-yarn");
    let n = 0;
    expect(pickCatFind(["cat-yarn", "cat-feather"], () => (n++ ? 0.999 : 0))).toBe("cat-feather");
  });

  it("decor.json 裡的小擺件價錢是 0、標成貓叼回來的", async () => {
    const { readFileSync } = await import("node:fs");
    const defs = JSON.parse(readFileSync("public/pixel-house/decor/decor.json", "utf-8")) as { id: string; price: number; catOnly?: boolean }[];
    const finds = defs.filter((d) => d.catOnly);
    expect(finds.map((d) => d.id).sort()).toEqual(["cat-feather", "cat-flower", "cat-yarn"]);
    for (const d of finds) expect(d.price).toBe(0);
  });
});
