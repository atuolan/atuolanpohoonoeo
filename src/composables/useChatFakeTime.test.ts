import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Chat } from "@/types/chat";
import { useChatFakeTime } from "./useChatFakeTime";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 28, 10, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

function setupStory() {
  const ft = useChatFakeTime();
  ft.setMode("story");
  return ft;
}

describe("劇情時鐘", () => {
  it("線上時跟著現實流動", () => {
    const ft = setupStory();
    const start = ft.getChatNow().getTime();
    vi.advanceTimersByTime(3 * HOUR);
    expect(ft.getChatNow().getTime() - start).toBe(3 * HOUR);
    expect(ft.isStoryClockPaused.value).toBe(false);
    ft.stopDisplayTimer();
  });

  it("面對面時暫停，現實經過多久都不變", () => {
    const ft = setupStory();
    ft.syncFaceToFace(true);
    const paused = ft.getChatNow().getTime();
    vi.advanceTimersByTime(8 * HOUR);
    expect(ft.getChatNow().getTime()).toBe(paused);
    expect(ft.isStoryClockPaused.value).toBe(true);
    ft.stopDisplayTimer();
  });

  it("暫停中 time-advance 推進暫停點", () => {
    const ft = setupStory();
    ft.syncFaceToFace(true);
    const paused = ft.getChatNow().getTime();
    ft.advanceBy(20);
    expect(ft.getChatNow().getTime()).toBe(paused + 20 * MIN);
    ft.stopDisplayTimer();
  });

  it("切回線上從最後的劇情時間繼續走", () => {
    const ft = setupStory();
    ft.syncFaceToFace(true);
    const paused = ft.getChatNow().getTime();
    ft.advanceBy(30);
    vi.advanceTimersByTime(5 * HOUR);
    ft.syncFaceToFace(false);
    expect(ft.getChatNow().getTime()).toBe(paused + 30 * MIN);
    vi.advanceTimersByTime(HOUR);
    expect(ft.getChatNow().getTime()).toBe(paused + 90 * MIN);
    ft.stopDisplayTimer();
  });

  it("暫停中跳轉會直接改暫停點", () => {
    const ft = setupStory();
    ft.syncFaceToFace(true);
    expect(ft.jumpToTime("2024-07-04T08:00")).toBe(true);
    vi.advanceTimersByTime(HOUR);
    expect(ft.getChatNow().getTime()).toBe(new Date(2024, 6, 4, 8, 0).getTime());
    ft.stopDisplayTimer();
  });

  it("存檔再載入後保持暫停狀態", () => {
    const ft = setupStory();
    ft.syncFaceToFace(true);
    const paused = ft.getChatNow().getTime();
    const fields = ft.toChatFields();
    ft.stopDisplayTimer();

    vi.advanceTimersByTime(12 * HOUR);
    const loaded = useChatFakeTime();
    loaded.loadFromChat({ ...fields, faceToFaceMode: true } as Chat);
    expect(loaded.getChatNow().getTime()).toBe(paused);
    loaded.stopDisplayTimer();
  });

  it("在面對面中切換到劇情時鐘會立刻暫停", () => {
    const ft = useChatFakeTime();
    ft.syncFaceToFace(true);
    ft.setMode("story");
    expect(ft.isStoryClockPaused.value).toBe(true);
    ft.stopDisplayTimer();
  });
});

describe("劇情時鐘接續最後一則訊息", () => {
  it("進入面對面時停在最後一則訊息的時間，而不是現實的現在", () => {
    const lastMsg = new Date(2026, 7, 19, 21, 30).getTime();
    const ft = useChatFakeTime({ getLastMessageStoryTime: () => lastMsg });
    ft.setMode("story");
    // 線上時仍是現實時間
    expect(ft.getChatNow().getTime()).toBe(Date.now());
    ft.syncFaceToFace(true);
    expect(ft.getChatNow().getTime()).toBe(lastMsg);
    ft.stopDisplayTimer();
  });

  it("已經在面對面時切換到劇情時鐘，也從最後一則訊息接續", () => {
    const lastMsg = new Date(2026, 7, 19, 21, 30).getTime();
    const ft = useChatFakeTime({ getLastMessageStoryTime: () => lastMsg });
    ft.syncFaceToFace(true);
    ft.setMode("story");
    expect(ft.getChatNow().getTime()).toBe(lastMsg);
    ft.stopDisplayTimer();
  });

  it("可以手動拉回最後一則訊息的時間", () => {
    const lastMsg = new Date(2026, 7, 19, 21, 30).getTime();
    const ft = useChatFakeTime({ getLastMessageStoryTime: () => lastMsg });
    ft.setMode("story");
    ft.syncFaceToFace(true);
    ft.advanceBy(600);
    expect(ft.resumeFromLastMessage()).toBe(true);
    expect(ft.getChatNow().getTime()).toBe(lastMsg);
    ft.stopDisplayTimer();
  });

  it("劇情時鐘下舊訊息不套用暫停點的偏移", () => {
    const ft = useChatFakeTime({ getLastMessageStoryTime: () => new Date(2026, 7, 19).getTime() });
    ft.setMode("story");
    ft.syncFaceToFace(true);
    expect(ft.getLegacyOffsetMs()).toBe(0);
    ft.stopDisplayTimer();
  });
});

describe("面對面開場由 AI 決定見面時間", () => {
  const lastMsg = new Date(2026, 7, 19, 21, 30).getTime();

  it("進入面對面後標記開場，第一輪回覆取出後清除", () => {
    const ft = useChatFakeTime({ getLastMessageStoryTime: () => lastMsg });
    ft.setMode("story");
    ft.syncFaceToFace(true);
    expect(ft.isStoryOpeningPending.value).toBe(true);
    expect(ft.consumeStoryOpening()).toBe(Date.now());
    expect(ft.isStoryOpeningPending.value).toBe(false);
    expect(ft.consumeStoryOpening()).toBeNull();
    ft.stopDisplayTimer();
  });

  it("手動調整時間後不再交給 AI 判斷", () => {
    const ft = useChatFakeTime({ getLastMessageStoryTime: () => lastMsg });
    ft.setMode("story");
    ft.syncFaceToFace(true);
    ft.advanceBy(30);
    expect(ft.isStoryOpeningPending.value).toBe(false);
    ft.stopDisplayTimer();
  });

  it("切回線上會清除開場標記；開場狀態會存檔", () => {
    const ft = useChatFakeTime({ getLastMessageStoryTime: () => lastMsg });
    ft.setMode("story");
    ft.syncFaceToFace(true);
    expect(ft.toChatFields().storyClockOpeningSince).toBe(Date.now());
    ft.syncFaceToFace(false);
    expect(ft.isStoryOpeningPending.value).toBe(false);
    expect(ft.toChatFields().storyClockOpeningSince).toBeUndefined();
    ft.stopDisplayTimer();
  });
});
