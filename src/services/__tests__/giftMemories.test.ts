import { describe, expect, it } from "vitest";
import {
  buildGiftNudgeNote,
  findMemoryForMessage,
  GIFT_NUDGE_GAP_MS,
  lastGiftToUserAt,
  type GiftMemory,
} from "../giftMemories";

const mem = (over: Partial<GiftMemory>): GiftMemory => ({
  id: "m1",
  characterId: "c1",
  direction: "to-char",
  name: "巧克力",
  sentAt: 1_000_000,
  entries: [],
  ...over,
});

describe("findMemoryForMessage", () => {
  const list = [
    mem({ id: "a", sentAt: 1_000_000, messageId: "msg-a" }),
    mem({ id: "b", sentAt: 1_000_000 + 5 * 60_000 }),
    mem({ id: "c", direction: "to-user", sentAt: 1_000_000 }),
  ];

  it("先用 giftMemoryId，再用 messageId", () => {
    expect(findMemoryForMessage(list, { giftMemoryId: "b" }, "to-char")?.id).toBe("b");
    expect(findMemoryForMessage(list, { id: "msg-a" }, "to-char")?.id).toBe("a");
  });

  it("舊訊息照名稱＋最接近的時間找，方向要一樣", () => {
    const found = findMemoryForMessage(
      list,
      { id: "old", giftName: "巧克力", timestamp: 1_000_000 + 4 * 60_000 },
      "to-char",
    );
    expect(found?.id).toBe("b");
    expect(
      findMemoryForMessage(list, { giftName: "巧克力", timestamp: 1_000_000 }, "to-user")?.id,
    ).toBe("c");
  });

  it("超過 10 分鐘就找不到", () => {
    expect(
      findMemoryForMessage(list, { giftName: "巧克力", timestamp: 1_000_000 + 30 * 60_000 }, "to-char"),
    ).toBeNull();
  });
});

describe("lastGiftToUserAt", () => {
  it("只看角色送的", () => {
    expect(lastGiftToUserAt([mem({ sentAt: 9 })])).toBeNull();
    expect(
      lastGiftToUserAt([mem({ direction: "to-user", sentAt: 5 }), mem({ direction: "to-user", sentAt: 7 })]),
    ).toBe(7);
  });
});

describe("buildGiftNudgeNote", () => {
  const now = 100 * GIFT_NUDGE_GAP_MS;

  it("節日或提到禮物時一定帶", () => {
    expect(buildGiftNudgeNote({ now, lastGiftToUserAt: now, todayHolidayName: "聖誕節" })).toContain(
      "今天是聖誕節",
    );
    expect(buildGiftNudgeNote({ now, lastGiftToUserAt: now, latestUserText: "你會送我禮物嗎" })).toContain(
      "剛剛提到了禮物",
    );
  });

  it("剛送過、沒提到時不帶", () => {
    expect(
      buildGiftNudgeNote({ now, lastGiftToUserAt: now - 1000, latestUserText: "早安", random: () => 0 }),
    ).toBeUndefined();
  });

  it("很久沒送時照機率", () => {
    const old = now - GIFT_NUDGE_GAP_MS;
    expect(buildGiftNudgeNote({ now, lastGiftToUserAt: old, random: () => 0.01 })).toContain("很久沒送");
    expect(buildGiftNudgeNote({ now, lastGiftToUserAt: old, random: () => 0.5 })).toBeUndefined();
    expect(buildGiftNudgeNote({ now, lastGiftToUserAt: null, random: () => 0.01 })).toBeDefined();
  });
});
