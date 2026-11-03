import { describe, expect, it } from "vitest";
import { CARE_ITEMS, getShopItemById, type ShopItem } from "@/data/shopItems";
import type { CharAway } from "@/types/chat";
import { buildCharAwaySneakNote } from "./charAway";
import { applyCareItemToAway, careItemNotice, careItemStatus } from "./careItems";

const HOUR = 3_600_000;
const NIGHT = new Date(2026, 9, 23, 23, 40).getTime();
const MORNING = new Date(2026, 9, 24, 7, 0).getTime();
const AFTERNOON = new Date(2026, 9, 23, 14, 0).getTime();

const item = (id: string): ShopItem => getShopItemById(id)!;

function sleep(overrides: Partial<CharAway> = {}): CharAway {
  return {
    id: "sleep_1",
    kind: "sleep",
    reason: "睡覺",
    backText: "早安",
    startedAt: NIGHT,
    returnAt: NIGHT + 9 * HOUR,
    urgeCount: 0,
    callCount: 0,
    sneakCount: 0,
    updatedAt: NIGHT,
    ...overrides,
  };
}

function busy(overrides: Partial<CharAway> = {}): CharAway {
  return {
    id: "busy_1",
    kind: "busy",
    reason: "上班",
    backText: "我忙完了",
    startedAt: AFTERNOON,
    returnAt: AFTERNOON + 4 * HOUR,
    urgeCount: 0,
    callCount: 0,
    sneakCount: 0,
    checkMinutes: 30,
    peekAt: AFTERNOON + 30 * 60_000,
    updatedAt: AFTERNOON,
    ...overrides,
  };
}

const ctx = (away: CharAway | null, now: number) => ({
  away,
  now,
  faceToFace: false,
  isGroupChat: false,
});

describe("照顧他的道具：什麼時候能用", () => {
  it("每個道具都上架在「照顧他」，而且有效果說明", () => {
    expect(CARE_ITEMS.length).toBeGreaterThan(0);
    for (const care of CARE_ITEMS) {
      expect(care.category).toBe("care");
      expect(care.careUse?.note).toBeTruthy();
      expect(care.careUse?.notice).toContain("{{char}}");
    }
  });

  it("咖啡、能量飲料只有他在忙的時候能用", () => {
    const coffee = item("care_coffee").careUse!;
    expect(careItemStatus(coffee, ctx(busy(), AFTERNOON + HOUR))).toEqual({ ok: true });
    expect(careItemStatus(coffee, ctx(null, AFTERNOON))).toMatchObject({ ok: false });
    expect(careItemStatus(coffee, ctx(sleep(), NIGHT + HOUR))).toMatchObject({ ok: false });
  });

  it("鬧鐘他在睡就能用；早餐要天亮後", () => {
    const alarm = item("care_alarm").careUse!;
    const breakfast = item("care_breakfast").careUse!;
    expect(careItemStatus(alarm, ctx(sleep(), NIGHT + HOUR))).toEqual({ ok: true });
    expect(careItemStatus(breakfast, ctx(sleep(), NIGHT + HOUR))).toEqual({
      ok: false,
      reason: "天還沒亮（06:00 以後才能用）",
    });
    expect(careItemStatus(breakfast, ctx(sleep(), MORNING))).toEqual({ ok: true });
  });

  it("香氛要晚上、他醒著、有開睡覺功能", () => {
    const aroma = item("care_aroma").careUse!;
    expect(careItemStatus(aroma, ctx(null, NIGHT))).toEqual({ ok: true });
    expect(careItemStatus(aroma, ctx(null, AFTERNOON))).toMatchObject({ ok: false });
    expect(careItemStatus(aroma, ctx(sleep(), NIGHT + HOUR))).toEqual({ ok: false, reason: "他已經睡了" });
    expect(careItemStatus(aroma, { ...ctx(null, NIGHT), sleepEnabled: false })).toMatchObject({ ok: false });
  });

  it("劇情時間決定是不是晚上", () => {
    const aroma = item("care_aroma").careUse!;
    // 現實是下午兩點，劇情時間調到晚上十一點
    expect(careItemStatus(aroma, { ...ctx(null, AFTERNOON), shiftMs: 9 * HOUR })).toEqual({ ok: true });
  });

  it("群聊、面對面、他正在回的時候都不能用", () => {
    const coffee = item("care_coffee").careUse!;
    expect(careItemStatus(coffee, { ...ctx(busy(), AFTERNOON), isGroupChat: true })).toMatchObject({ ok: false });
    expect(careItemStatus(coffee, { ...ctx(busy(), AFTERNOON), faceToFace: true })).toMatchObject({ ok: false });
    expect(careItemStatus(coffee, ctx(busy({ sneakPending: true }), AFTERNOON))).toEqual({
      ok: false,
      reason: "他正在回你",
    });
  });
});

describe("照顧他的道具：用了之後", () => {
  it("咖啡：他馬上回一則，擲骰過了就提早忙完，原本排的看手機取消", () => {
    const now = AFTERNOON + HOUR;
    const lucky = applyCareItemToAway(busy(), item("care_coffee"), now, 0, () => 0.1);
    expect(lucky).toMatchObject({
      sneakPending: true,
      sneakReason: "item",
      careItemId: "care_coffee",
      earlyEndPending: true,
      sneakCount: 1,
    });
    expect(lucky.peekAt).toBeUndefined();

    const unlucky = applyCareItemToAway(busy(), item("care_coffee"), now, 0, () => 0.9);
    expect(unlucky.earlyEndPending).toBe(false);
  });

  it("能量飲料一定提早忙完", () => {
    const next = applyCareItemToAway(busy(), item("care_energy"), AFTERNOON + HOUR, 0, () => 0.999);
    expect(next.earlyEndPending).toBe(true);
  });

  it("鬧鐘：天亮後起床，天還沒亮只吵醒一下", () => {
    expect(applyCareItemToAway(sleep(), item("care_alarm"), MORNING, 0, () => 0).earlyEndPending).toBe(true);
    expect(applyCareItemToAway(sleep(), item("care_alarm"), NIGHT + HOUR, 0, () => 0).earlyEndPending).toBe(false);
  });

  it("回覆說明寫出道具和結果", () => {
    const woke = applyCareItemToAway(sleep(), item("care_breakfast"), MORNING, 0, () => 0);
    const note = buildCharAwaySneakNote(woke, 2)!;
    expect(note).toContain("[愛心早餐]");
    expect(note).toContain("就起床了");
    expect(note).toContain("留的 2 則訊息");

    const stillBusy = applyCareItemToAway(busy(), item("care_coffee"), AFTERNOON + HOUR, 0, () => 0.9);
    const busyNote = buildCharAwaySneakNote(stillBusy, 0)!;
    expect(busyNote).toContain("[外帶咖啡]");
    expect(busyNote).toContain("回完還是在忙");
  });

  it("聊天裡那一行換上角色名", () => {
    expect(careItemNotice(item("care_coffee"), "梁sir")).toBe("☕ 你幫梁sir叫了一杯外帶咖啡");
  });
});
