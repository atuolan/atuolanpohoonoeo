import { describe, expect, it } from "vitest";
import {
  computeChatNow,
  resolveStoryTime,
  stampStoryTimes,
  STORY_TIME_STAMP_WINDOW_MS,
} from "@/utils/fakeTime";

const t = (y: number, m: number, d: number, h = 0) =>
  new Date(y, m - 1, d, h).getTime();

describe("computeChatNow", () => {
  const realNow = new Date(t(2026, 9, 28, 10));

  it("真實模式回傳真實時間", () => {
    expect(computeChatNow({ fakeTimeMode: "real" }, realNow)).toEqual(realNow);
  });

  it("偏移模式加上偏移量", () => {
    const offset = t(2024, 7, 1, 10) - realNow.getTime();
    expect(
      computeChatNow({ fakeTimeMode: "offset", fakeTimeOffset: offset }, realNow).getTime(),
    ).toBe(t(2024, 7, 1, 10));
  });

  it("輪迴模式會套用 offset（跳轉／從起點開始跑）", () => {
    const loop = {
      startDateTime: "2024-07-01T00:00",
      endDateTime: "2024-07-02T00:00",
    };
    const target = t(2024, 7, 1, 15);
    const result = computeChatNow(
      { fakeTimeMode: "loop", fakeTimeLoop: loop, fakeTimeOffset: target - realNow.getTime() },
      realNow,
    );
    expect(result.getTime()).toBe(target);

    // 超過結束會回到起始
    const later = new Date(realNow.getTime() + 10 * 60 * 60 * 1000);
    const wrapped = computeChatNow(
      { fakeTimeMode: "loop", fakeTimeLoop: loop, fakeTimeOffset: target - realNow.getTime() },
      later,
    );
    expect(wrapped.getTime()).toBe(t(2024, 7, 1, 1));
  });

  it("輪迴區間無效時退回真實時間", () => {
    const loop = {
      startDateTime: "2024-07-02T00:00",
      endDateTime: "2024-07-01T00:00",
    };
    expect(computeChatNow({ fakeTimeMode: "loop", fakeTimeLoop: loop }, realNow)).toEqual(realNow);
  });
});

describe("resolveStoryTime", () => {
  it("優先使用 storyTime", () => {
    expect(resolveStoryTime({ storyTime: 5, timestamp: 100 }, 1000)).toBe(5);
  });

  it("沒有 storyTime 時用發送時間 + 偏移", () => {
    expect(resolveStoryTime({ timestamp: 100 }, 1000)).toBe(1100);
    expect(resolveStoryTime({ createdAt: 100 }, 0)).toBe(100);
  });
});

describe("stampStoryTimes", () => {
  it("只替剛建立、尚未標記的訊息補上劇情時間", () => {
    const now = t(2026, 9, 28, 10);
    const offset = -1000 * 60 * 60 * 24;
    const messages: Array<{ timestamp: number; storyTime?: number }> = [
      { timestamp: now - STORY_TIME_STAMP_WINDOW_MS - 1 }, // 舊訊息
      { timestamp: now - 5000, storyTime: 42 }, // 已標記
      { timestamp: now - 2000 },
      { timestamp: now - 1000 },
    ];

    stampStoryTimes(messages, () => new Date(now + offset), now);

    expect(messages[0].storyTime).toBeUndefined();
    expect(messages[1].storyTime).toBe(42);
    expect(messages[2].storyTime).toBe(now - 2000 + offset);
    expect(messages[3].storyTime).toBe(now - 1000 + offset);
  });

  it("載入的舊訊息不會被標記", () => {
    const now = t(2026, 9, 28, 10);
    const messages: Array<{ timestamp: number; storyTime?: number }> = [
      { timestamp: t(2026, 1, 1) },
      { timestamp: t(2026, 2, 1) },
    ];
    stampStoryTimes(messages, () => new Date(0), now);
    expect(messages.every((m) => m.storyTime === undefined)).toBe(true);
  });
});
