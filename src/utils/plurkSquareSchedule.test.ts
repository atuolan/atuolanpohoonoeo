import { describe, expect, it } from "vitest";
import type { QZonePost } from "@/types/qzone";
import {
  SQUARE_BACKFILL_MAX,
  SQUARE_IMMEDIATE_WINDOW,
  SQUARE_REFILL_AHEAD,
  DEFAULT_SQUARE_BATCH,
  isGeneratedSquarePost,
  isModerationShown,
  isQuietHour,
  latestSquareAt,
  moderationDelayAt,
  needsSquareRefill,
  normalizeSquareBatch,
  planSquareTimes,
  scheduleSquareTimes,
  squarePostsPerHour,
  squareStock,
  squareStockText,
} from "@/utils/plurkSquareSchedule";

const MIN = 60_000;
const H = 3600_000;

/** 中午，避開凌晨 2–7 點的安靜時段 */
const NOW = new Date(2026, 9, 21, 12, 0).getTime();
const AT_3AM = new Date(2026, 9, 21, 3, 0).getTime();
const fixedRandom = () => 0.5;

const post = (id: string, timestamp: number, extra: Partial<QZonePost> = {}): QZonePost => ({
  id,
  authorId: "x",
  type: "shuoshuo",
  timestamp,
  comments: [],
  likes: [],
  visibility: "public",
  authorType: "ai",
  ...extra,
});

describe("squarePostsPerHour", () => {
  it("把 npcLevel 夾在 1–5 之間", () => {
    expect(squarePostsPerHour(0)).toBe(0.5);
    expect(squarePostsPerHour(9)).toBe(8);
    expect(squarePostsPerHour(3)).toBe(2);
  });
});

describe("normalizeSquareBatch", () => {
  it("合法值原樣回傳，不合法回傳預設", () => {
    expect(normalizeSquareBatch(15)).toBe(15);
    expect(normalizeSquareBatch(7)).toBe(DEFAULT_SQUARE_BATCH);
    expect(normalizeSquareBatch(undefined)).toBe(DEFAULT_SQUARE_BATCH);
  });
});

describe("isQuietHour", () => {
  it("2 點到 7 點之間是安靜時段", () => {
    expect(isQuietHour(1)).toBe(false);
    expect(isQuietHour(2)).toBe(true);
    expect(isQuietHour(6)).toBe(true);
    expect(isQuietHour(7)).toBe(false);
  });
});

describe("scheduleSquareTimes", () => {
  it("每小時 2 則時，每則間隔 30 分鐘", () => {
    const times = scheduleSquareTimes({ count: 4, perHour: 2, start: NOW, random: fixedRandom });
    expect(times).toHaveLength(4);
    expect(times[0] - NOW).toBe(30 * MIN);
    expect(times[1] - times[0]).toBe(30 * MIN);
    expect(times[2] - times[1]).toBe(30 * MIN);
    expect(times[3] - times[2]).toBe(30 * MIN);
  });

  it("凌晨 3 點開始時，間隔加倍成 60 分鐘", () => {
    const times = scheduleSquareTimes({ count: 3, perHour: 2, start: AT_3AM, random: fixedRandom });
    expect(times[0] - AT_3AM).toBe(60 * MIN);
    expect(times[1] - times[0]).toBe(60 * MIN);
  });

  it("count 為 0 時回傳空陣列", () => {
    expect(scheduleSquareTimes({ count: 0, perHour: 2, start: NOW, random: fixedRandom })).toEqual([]);
  });
});

describe("planSquareTimes", () => {
  it("手動時先塞三分之一在過去 40 分鐘內，其餘排在未來", () => {
    const times = planSquareTimes({
      count: 10,
      perHour: 2,
      now: NOW,
      lastAt: null,
      manual: true,
      random: fixedRandom,
    });
    expect(times).toHaveLength(10);
    const past = times.filter((t) => t <= NOW);
    const future = times.filter((t) => t > NOW);
    expect(past).toHaveLength(4);
    expect(future).toHaveLength(6);
    for (const t of past) {
      expect(t).toBeGreaterThanOrEqual(NOW - SQUARE_IMMEDIATE_WINDOW);
    }
    // 回傳已排序
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("手動時若 lastAt 在未來，未來那幾則都排在 lastAt 之後", () => {
    const lastAt = NOW + 2 * H;
    const times = planSquareTimes({
      count: 10,
      perHour: 2,
      now: NOW,
      lastAt,
      manual: true,
      random: fixedRandom,
    });
    const future = times.filter((t) => t > NOW);
    expect(future).toHaveLength(6);
    for (const t of future) expect(t).toBeGreaterThan(lastAt);
  });

  it("自動排程：lastAt 是 10 小時前，最多往回補 3 小時", () => {
    const times = planSquareTimes({
      count: 10,
      perHour: 2,
      now: NOW,
      lastAt: NOW - 10 * H,
      manual: false,
      random: fixedRandom,
    });
    expect(times[0]).toBeGreaterThan(NOW - SQUARE_BACKFILL_MAX);
    expect(times[0]).toBeGreaterThanOrEqual(NOW - SQUARE_BACKFILL_MAX);
    expect(times.some((t) => t <= NOW)).toBe(true);
    expect(times.some((t) => t > NOW)).toBe(true);
  });

  it("自動排程：lastAt 在未來時全部排在 lastAt 之後", () => {
    const lastAt = NOW + 2 * H;
    const times = planSquareTimes({
      count: 5,
      perHour: 2,
      now: NOW,
      lastAt,
      manual: false,
      random: fixedRandom,
    });
    expect(times).toHaveLength(5);
    for (const t of times) expect(t).toBeGreaterThan(lastAt);
  });

  it("自動排程：lastAt 為 null 時從 now 往回 3 小時開始排", () => {
    const times = planSquareTimes({
      count: 5,
      perHour: 2,
      now: NOW,
      lastAt: null,
      manual: false,
      random: fixedRandom,
    });
    const start = NOW - SQUARE_BACKFILL_MAX;
    expect(times[0]).toBeGreaterThan(start);
    expect(times[0]).toBeLessThan(start + H);
  });
});

describe("isGeneratedSquarePost／squareStock／latestSquareAt／needsSquareRefill", () => {
  const npcPost = post("npc", NOW - 2 * H, { npc: { id: "npc-1", name: "小魚", color: "#000" } });
  const anonPost = post("anon", NOW - 3 * H, { anonOf: "char-1" });
  const normalPost = post("normal", NOW + 5 * H);

  it("路人噗與偷偷說算廣場生成的噗，一般角色噗不算", () => {
    expect(isGeneratedSquarePost(npcPost)).toBe(true);
    expect(isGeneratedSquarePost(anonPost)).toBe(true);
    expect(isGeneratedSquarePost(normalPost)).toBe(false);
    expect(latestSquareAt([npcPost, anonPost, normalPost])).toBe(NOW - 2 * H);
    expect(latestSquareAt([normalPost])).toBeNull();
  });

  it("只算還沒出現的噗的庫存", () => {
    const soon = post("soon", NOW + 2 * H, { npc: { id: "npc-2", name: "阿明", color: "#111" } });
    const later = post("later", NOW + 4 * H, { anonOf: "char-2" });
    expect(squareStock([npcPost, anonPost, normalPost], NOW)).toEqual({ count: 0, until: null });
    expect(squareStock([npcPost, soon, later, normalPost], NOW)).toEqual({
      count: 2,
      until: NOW + 4 * H,
    });
  });

  it("未來 2 小時還有存貨不必補，只剩 30 分鐘或都沒了就要補", () => {
    const twoHours = post("2h", NOW + 2 * H, { npc: { id: "npc-3", name: "小美", color: "#222" } });
    const halfHour = post("30m", NOW + 30 * MIN, { npc: { id: "npc-4", name: "阿德", color: "#333" } });
    expect(SQUARE_REFILL_AHEAD).toBe(H);
    expect(needsSquareRefill([twoHours, normalPost], NOW)).toBe(false);
    expect(needsSquareRefill([halfHour, normalPost], NOW)).toBe(true);
    expect(needsSquareRefill([npcPost, normalPost], NOW)).toBe(true);
  });
});

describe("moderationDelayAt", () => {
  it("噗出現後 10 到 90 分鐘才處理", () => {
    expect(moderationDelayAt(NOW, () => 0)).toBe(NOW + 10 * MIN);
    expect(moderationDelayAt(NOW, () => 1)).toBe(NOW + 90 * MIN);
  });
});

describe("isModerationShown", () => {
  const moderation = { action: "fold" as const, reason: "離題", by: "版主", at: NOW - MIN };

  it("沒有處分、時間還沒到都不顯示，時間到了才顯示", () => {
    expect(isModerationShown(undefined, NOW)).toBe(false);
    expect(isModerationShown({ ...moderation, at: NOW + MIN }, NOW)).toBe(false);
    expect(isModerationShown(moderation, NOW)).toBe(true);
  });
});

describe("squareStockText", () => {
  it("沒有存貨與有存貨兩種文案", () => {
    expect(squareStockText({ count: 0, until: null }, NOW)).toBe("排好的路人噗都出完了");
    expect(squareStockText({ count: 0, until: NOW + H }, NOW)).toBe("排好的路人噗都出完了");
    expect(squareStockText({ count: 3, until: NOW + 2 * H }, NOW)).toBe(
      "還有 3 則會在接下來 2 小時陸續出現",
    );
    expect(squareStockText({ count: 1, until: NOW + 10 * MIN }, NOW)).toBe(
      "還有 1 則會在接下來 1 小時陸續出現",
    );
  });
});
