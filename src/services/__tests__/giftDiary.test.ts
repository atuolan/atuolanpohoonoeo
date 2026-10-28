import { describe, expect, it } from "vitest";
import {
  canAddEntry,
  GIFT_DIARY_AUTO_MIN_AGE_MS,
  GIFT_DIARY_AUTO_REPEAT_MS,
  pickAutoDiaryTarget,
  soloAuthorOf,
  sortEntries,
  todayString,
} from "../giftDiary";
import type { GiftDiaryEntry, GiftMemory } from "../giftMemories";

const mem = (over: Partial<GiftMemory>): GiftMemory => ({
  id: "m",
  characterId: "c",
  direction: "to-char",
  itemId: "gift_crystal_moonstone",
  name: "月光石",
  sentAt: 0,
  entries: [],
  ...over,
});
const entry = (over: Partial<GiftDiaryEntry>): GiftDiaryEntry => ({
  id: "e",
  kind: "solo",
  author: "char",
  date: "2026-10-01",
  content: "x",
  createdAt: 0,
  ...over,
});

describe("canAddEntry", () => {
  it("消耗品每種只能一篇，耐用品不限", () => {
    const choco = mem({ itemId: "gift_chocolate", entries: [entry({ kind: "together", author: "user" })] });
    expect(canAddEntry(choco, "together")).toBe(false);
    expect(canAddEntry(choco, "solo")).toBe(true);
    const stone = mem({ entries: [entry({ kind: "together" }), entry({ kind: "together" })] });
    expect(canAddEntry(stone, "together")).toBe(true);
  });

  it("角色自己編的禮物當耐用品", () => {
    expect(canAddEntry(mem({ itemId: undefined, entries: [entry({})] }), "solo")).toBe(true);
  });
});

describe("soloAuthorOf", () => {
  it("你送他由他寫，他送你由你寫", () => {
    expect(soloAuthorOf(mem({}))).toBe("char");
    expect(soloAuthorOf(mem({ direction: "to-user" }))).toBe("user");
  });
});

describe("pickAutoDiaryTarget", () => {
  const now = 100 * GIFT_DIARY_AUTO_REPEAT_MS;

  it("只挑送出超過 2 天、你送他的", () => {
    const fresh = mem({ id: "fresh", sentAt: now - 1000 });
    const toUser = mem({ id: "toUser", direction: "to-user", sentAt: 0 });
    expect(pickAutoDiaryTarget([fresh, toUser], now)).toBeNull();
    const old = mem({ id: "old", sentAt: now - GIFT_DIARY_AUTO_MIN_AGE_MS });
    expect(pickAutoDiaryTarget([fresh, old], now)?.id).toBe("old");
  });

  it("7 天內寫過的不挑；沒寫過的優先", () => {
    const recent = mem({ id: "recent", entries: [entry({ createdAt: now - 1000 })] });
    const written = mem({ id: "written", entries: [entry({ createdAt: now - GIFT_DIARY_AUTO_REPEAT_MS })] });
    const never = mem({ id: "never" });
    expect(pickAutoDiaryTarget([recent], now)).toBeNull();
    expect(pickAutoDiaryTarget([written, never], now)?.id).toBe("never");
    expect(pickAutoDiaryTarget([recent, written], now)?.id).toBe("written");
  });

  it("消耗品他寫過就不再挑", () => {
    const choco = mem({ itemId: "gift_chocolate", entries: [entry({ createdAt: 0 })] });
    expect(pickAutoDiaryTarget([choco], now)).toBeNull();
  });
});

describe("sortEntries / todayString", () => {
  it("照日期再照寫的時間", () => {
    const list = sortEntries([
      entry({ id: "b", date: "2026-10-02", createdAt: 1 }),
      entry({ id: "c", date: "2026-10-01", createdAt: 5 }),
      entry({ id: "a", date: "2026-10-01", createdAt: 2 }),
    ]);
    expect(list.map((e) => e.id)).toEqual(["a", "c", "b"]);
  });

  it("本地日期", () => {
    expect(todayString(new Date(2026, 0, 5, 23, 0).getTime())).toBe("2026-01-05");
  });
});
