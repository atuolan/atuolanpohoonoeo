import { describe, expect, it } from "vitest";
import { ACTS, ACT_WEIGHTS } from "./houseData";
import { parseHouseLifeState } from "./houseLife";
import { ACT_LINES, GIFTS, GIFT_ART, PAT_ANNOY_COUNT, PAT_LINES, parsePendingGifts, patMood, pickLine, pickPatLine, rollGift, SCENE_LINES } from "./houseLines";

/** 照順序回傳的假亂數 */
const seq = (...ns: number[]) => {
  let i = 0;
  return () => ns[Math.min(i++, ns.length - 1)];
};

describe("他頭上冒的話", () => {
  it("睡覺以外的每件事都有話可說，而且都很短", () => {
    for (const act of Object.keys(ACTS)) {
      if (act === "sleep") continue;
      expect(ACT_LINES[act]?.length, act).toBeGreaterThanOrEqual(4);
    }
    const all = [...Object.values(ACT_LINES).flat(), ...Object.values(SCENE_LINES).flatMap((m) => Object.values(m ?? {}).flat())];
    for (const line of all) expect(line.length, line).toBeLessThanOrEqual(14);
  });

  it("有話的動作都是真的動作", () => {
    for (const act of Object.keys(ACT_LINES)) expect(ACTS[act], act).toBeDefined();
    for (const [scene, m] of Object.entries(SCENE_LINES)) {
      for (const act of Object.keys(m ?? {})) expect(ACT_WEIGHTS[scene as "dusk"][act], `${scene}:${act}`).toBeGreaterThan(0);
    }
  });

  it("睡覺不說話；亂數到 1 也不會超出範圍", () => {
    expect(pickLine("sleep", "night")).toBeNull();
    expect(pickLine("不存在", "day")).toBeNull();
    expect(ACT_LINES.tv).toContain(pickLine("tv", "day", () => 0.999999));
    expect(pickLine("tv", "day", () => 0)).toBe(ACT_LINES.tv[0]);
  });

  it("晚上會多挑到晚上才說的話", () => {
    const night = SCENE_LINES.night!.brush!;
    expect(pickLine("brush", "night", () => 0.999)).toBe(night[night.length - 1]);
    expect(ACT_LINES.brush).toContain(pickLine("brush", "day", () => 0.999));
  });
});

describe("摸頭", () => {
  it("平常開心，短時間摸太多次會煩，過一陣子就好了", () => {
    const now = 100_000;
    expect(patMood([now], now, false)).toBe("happy");
    const many = Array.from({ length: PAT_ANNOY_COUNT }, (_, i) => now - i * 500);
    expect(patMood(many, now, false)).toBe("annoyed");
    expect(patMood(many, now + 10_000, false)).toBe("happy");
  });

  it("睡覺時一律是被吵到", () => {
    expect(patMood([1, 2, 3, 4, 5, 6], 6, true)).toBe("sleepy");
  });

  it("每種反應都有話", () => {
    for (const mood of ["happy", "annoyed", "sleepy"] as const) {
      expect(PAT_LINES[mood]).toContain(pickPatLine(mood, () => 0.999999));
    }
  });
});

describe("他留的東西", () => {
  it("煮完飯可能留一盤菜，金幣在範圍內", () => {
    const g = rollGift("cook", [], 3, seq(0.1, 0, 0.999));
    expect(g).toEqual({ kind: "dish", text: GIFTS.dish.texts[0], coins: GIFTS.dish.coins[1] });
    expect(rollGift("cook", [], 3, seq(0.1, 0, 0))?.coins).toBe(GIFTS.dish.coins[0]);
  });

  it("機率沒中、今天額度用完、同一種還沒收，都不留", () => {
    expect(rollGift("cook", [], 3, () => 0.99)).toBeNull();
    expect(rollGift("cook", [], 0, () => 0)).toBeNull();
    expect(rollGift("cook", [{ kind: "dish", text: "咖哩飯", coins: 20 }], 3, () => 0)).toBeNull();
    // 有一盤菜還沒收，還是可以留紙條
    expect(rollGift("pc", [{ kind: "dish", text: "咖哩飯", coins: 20 }], 3, () => 0)?.kind).toBe("note");
  });

  it("不會留東西的事就不留", () => {
    expect(rollGift("tv", [], 3, () => 0)).toBeNull();
  });

  it("留東西的家具和動作都存在，圖的每一列一樣寬", () => {
    for (const g of Object.values(GIFTS)) {
      for (const act of g.after) expect(ACTS[act], act).toBeDefined();
      expect(g.texts.length).toBeGreaterThan(2);
      const art = GIFT_ART[g.kind];
      expect(new Set(art.rows.map((r) => r.length)).size).toBe(1);
    }
  });

  it("存檔壞掉的、不認得的、重複的都丟掉，金幣不會超過上限", () => {
    expect(parsePendingGifts("x")).toEqual([]);
    expect(
      parsePendingGifts([
        { kind: "dish", text: "咖哩飯", coins: 99999 },
        { kind: "dish", text: "第二盤", coins: 20 },
        { kind: "gold", text: "一噸黃金", coins: 5 },
        { kind: "note", text: "", coins: 0 },
        null,
      ]),
    ).toEqual([{ kind: "dish", text: "咖哩飯", coins: GIFTS.dish.coins[1] }]);
    expect(parseHouseLifeState({ gifts: [{ kind: "note", text: "記得喝水。", coins: 0 }] }).gifts).toHaveLength(1);
  });
});
