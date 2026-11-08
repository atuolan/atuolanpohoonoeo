import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/database", () => ({
  db: { init: vi.fn(async () => undefined), get: vi.fn(async () => undefined), put: vi.fn(async () => undefined), delete: vi.fn() },
  DB_STORES: { GAME_ECONOMY: "gameEconomy" },
}));

const { useGameEconomyStore } = await import("./gameEconomy");

const W = "global";
const MINUTE = 60_000;

function setup(money = 100_000) {
  const store = useGameEconomyStore();
  store.getState(W).wallet = money;
  return store;
}

function buy(store: ReturnType<typeof useGameEconomyStore>, itemId: string, times = 1) {
  for (let i = 0; i < times; i++) expect(store.purchaseItem(W, itemId).success).toBe(true);
}

function equipStarterRod(store: ReturnType<typeof useGameEconomyStore>) {
  const state = store.getState(W);
  state.fishingRods.push({
    id: "rod1",
    rodId: "rod_basic",
    name: "竹竿",
    durability: 1000,
    maxDurability: 1000,
    minFishTier: 1,
    maxFishTier: 1,
    efficiency: 1,
  } as any);
  state.equippedRodId = "rod1";
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers({ now: new Date(2026, 10, 4, 10, 0) });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("洗碗道具會用完", () => {
  it("每洗一個盤子扣一次，50 次用完就從背包移除", () => {
    const store = setup();
    buy(store, "item_gloves");
    expect(store.getConsumableUsesLeft(W, "item_gloves")).toBe(50);

    const first = store.washDish(W);
    expect(first.efficiencyMultiplier).toBeCloseTo(1.2);
    expect(store.getConsumableUsesLeft(W, "item_gloves")).toBe(49);

    // 每日上限是 50，跨天再洗
    for (let i = 0; i < 49; i++) store.washDish(W);
    expect(store.getConsumableUsesLeft(W, "item_gloves")).toBe(0);
    expect(store.getInventory(W).some((i) => i.itemId === "item_gloves")).toBe(false);

    vi.setSystemTime(new Date(2026, 10, 5, 10, 0));
    expect(store.washDish(W).efficiencyMultiplier).toBe(1);
  });

  it("買兩份：第一份用完接著開第二份", () => {
    const store = setup();
    buy(store, "item_gloves", 2);
    expect(store.getConsumableUsesLeft(W, "item_gloves")).toBe(100);
    for (let i = 0; i < 50; i++) store.washDish(W);
    expect(store.getConsumableUsesLeft(W, "item_gloves")).toBe(50);
    expect(store.getInventory(W).find((i) => i.itemId === "item_gloves")).toMatchObject({ quantity: 1 });
  });
});

describe("高級魚餌", () => {
  it("釣到魚就扣一次，大約三成多釣一條、不多扣耐久", () => {
    const store = setup();
    equipStarterRod(store);
    buy(store, "item_bait", 4);

    let casts = 0;
    let bonus = 0;
    for (let i = 0; i < 200; i++) {
      const result = store.catchFish(W);
      expect(result.success).toBe(true);
      casts += 1;
      expect(result.remainingDurability).toBe(1000 - casts);
      if (result.bonusFish) bonus += 1;
    }
    // 垃圾不算，釣到魚的那幾次才扣魚餌；大約三成會多一條
    const fishCasts = 200 - store.getConsumableUsesLeft(W, "item_bait");
    expect(store.getConsumableUsesLeft(W, "item_bait")).toBeGreaterThan(0);
    expect(bonus).toBeGreaterThan(fishCasts * 0.15);
    expect(bonus).toBeLessThan(fishCasts * 0.45);
    expect(store.getState(W).fishInventory).toHaveLength(fishCasts + bonus);
  });
});

describe("自動釣魚器", () => {
  it("掛機有加成，扣掉用到的分鐘數；沒有它的時候沒有加成", () => {
    const store = setup();
    equipStarterRod(store);
    expect(store.startIdleSession(W).success).toBe(true);
    vi.advanceTimersByTime(60 * MINUTE);
    const plain = store.calculateIdleRewards(W);
    expect(plain.boostedMinutes).toBe(0);

    buy(store, "item_auto_fish");
    const boosted = store.calculateIdleRewards(W);
    expect(boosted.boostedMinutes).toBe(60);
    expect(boosted.fishCount).toBe(Math.floor(plain.fishCount * 1.5));

    vi.spyOn(Math, "random").mockReturnValue(0.99); // 都是垃圾也沒關係，只看扣時間
    expect(store.claimIdleRewards(W).success).toBe(true);
    expect(store.getConsumableUsesLeft(W, "item_auto_fish")).toBe(300 - 60);
  });

  it("效率 1.x 的魚竿掛機真的比較多", () => {
    const store = setup();
    equipStarterRod(store);
    store.startIdleSession(W);
    vi.advanceTimersByTime(600 * MINUTE);
    const base = store.calculateIdleRewards(W).fishCount;
    store.getState(W).currentIdleSession!.efficiency = 1.5;
    expect(store.calculateIdleRewards(W).fishCount).toBeGreaterThan(base);
  });
});
