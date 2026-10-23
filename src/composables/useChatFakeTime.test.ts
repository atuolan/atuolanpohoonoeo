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

describe("劇情時鐘：手動調過時間後進面對面", () => {
  it("手動調過（pinned）就停在目前時鐘，不設開場", () => {
    const ft = useChatFakeTime({ getLastMessageStoryTime: () => Date.now() - 3 * HOUR });
    ft.setMode("story");
    ft.advanceBy(60);
    ft.markStoryPinned();
    const expected = ft.getChatNow().getTime();
    ft.syncFaceToFace(true);
    expect(ft.getChatNow().getTime()).toBe(expected);
    expect(ft.isStoryOpeningPending.value).toBe(false);
    ft.stopDisplayTimer();
  });

  it("沒有 pinned 時照舊停在最後一則訊息的時間並等 AI 開場", () => {
    const last = Date.now() - 3 * HOUR;
    const ft = useChatFakeTime({ getLastMessageStoryTime: () => last });
    ft.setMode("story");
    ft.advanceBy(60);
    ft.syncFaceToFace(true);
    expect(ft.getChatNow().getTime()).toBe(last);
    expect(ft.isStoryOpeningPending.value).toBe(true);
    ft.stopDisplayTimer();
  });

  it("面對面中 markStoryPinned 沒有作用；clearStoryPinned 會清掉", () => {
    const ft = setupStory();
    ft.markStoryPinned();
    ft.clearStoryPinned();
    expect(ft.toChatFields().storyClockPinned).toBeUndefined();
    ft.syncFaceToFace(true);
    ft.markStoryPinned();
    expect(ft.toChatFields().storyClockPinned).toBeUndefined();
    ft.stopDisplayTimer();
  });
});

describe("劇情時鐘：開場的線上時鐘", () => {
  it("開場時回傳進面對面那一刻的線上時鐘，開場結束後為 null", () => {
    const last = Date.now() - 5 * HOUR;
    const ft = useChatFakeTime({ getLastMessageStoryTime: () => last });
    ft.setMode("story");
    const onlineNow = ft.getChatNow().getTime();
    ft.syncFaceToFace(true);
    vi.advanceTimersByTime(10 * MIN);
    expect(ft.getOpeningOnlineNow()).toBe(onlineNow);
    ft.consumeStoryOpening();
    expect(ft.getOpeningOnlineNow()).toBeNull();
    ft.stopDisplayTimer();
  });
});

describe("劇情時鐘：重新生成還原", () => {
  it("restoreBeforeTurn 對到 turnId 才還原（含開場標記）", () => {
    const ft = useChatFakeTime({ getLastMessageStoryTime: () => Date.now() });
    ft.setMode("story");
    ft.syncFaceToFace(true);
    const before = ft.getChatNow().getTime();
    ft.snapshotBeforeTurn("t1");
    ft.consumeStoryOpening();
    ft.setStoryNowMs(before + 2 * HOUR);
    expect(ft.restoreBeforeTurn("other")).toBe(false);
    expect(ft.getChatNow().getTime()).toBe(before + 2 * HOUR);
    expect(ft.restoreBeforeTurn("t1")).toBe(true);
    expect(ft.getChatNow().getTime()).toBe(before);
    expect(ft.isStoryOpeningPending.value).toBe(true);
    ft.stopDisplayTimer();
  });

  it("面對面狀態跟記錄時不同就不還原", () => {
    const ft = setupStory();
    ft.snapshotBeforeTurn("t1");
    ft.syncFaceToFace(true);
    expect(ft.restoreBeforeTurn("t1")).toBe(false);
    ft.stopDisplayTimer();
  });

  it("applyRoundAfter 設成那一輪之後的時鐘，之後重刷仍還原到同一個起點", () => {
    const ft = useChatFakeTime({ getLastMessageStoryTime: () => Date.now() });
    ft.setMode("story");
    ft.syncFaceToFace(true);
    const start = ft.getChatNow().getTime();
    ft.snapshotBeforeTurn("t1");
    ft.setStoryNowMs(start + HOUR);
    const afterA = ft.getClockState();
    ft.restoreBeforeTurn("t1");
    ft.setStoryNowMs(start + 3 * HOUR);
    expect(ft.applyRoundAfter("t1", afterA)).toBe(true);
    expect(ft.getChatNow().getTime()).toBe(start + HOUR);
    expect(ft.restoreBeforeTurn("t1")).toBe(true);
    expect(ft.getChatNow().getTime()).toBe(start);
    ft.stopDisplayTimer();
  });

  it("toChatFields／loadFromChat 帶著 storyClockUndo 和 storyClockPinned", () => {
    const ft = setupStory();
    ft.markStoryPinned();
    ft.snapshotBeforeTurn("t9");
    const fields = ft.toChatFields();
    expect(fields.storyClockPinned).toBe(true);
    expect(fields.storyClockUndo?.turnId).toBe("t9");
    const ft2 = useChatFakeTime();
    ft2.loadFromChat({ ...fields, faceToFaceMode: false } as Chat);
    expect(ft2.toChatFields().storyClockPinned).toBe(true);
    expect(ft2.restoreBeforeTurn("t9")).toBe(true);
    ft.stopDisplayTimer();
    ft2.stopDisplayTimer();
  });
});

describe("劇情時鐘：對齊現實與差距", () => {
  it("劇情比現實慢：對齊後等於現在，差距歸零", () => {
    const ft = setupStory();
    ft.setOffsetFromDateTime("2026-09-28T07:00");
    expect(ft.storyGapMs.value).toBe(-3 * HOUR);
    expect(ft.realignToReality()).toBe(true);
    expect(ft.getChatNow().getTime()).toBe(Date.now());
    expect(ft.storyGapMs.value).toBe(0);
    ft.stopDisplayTimer();
  });

  it("劇情比現實快：對齊到隔天同一時刻", () => {
    const ft = setupStory();
    ft.setOffsetFromDateTime("2026-09-28T15:00");
    ft.realignToReality();
    expect(ft.getChatNow().getTime()).toBe(new Date(2026, 8, 29, 10, 0).getTime());
    ft.stopDisplayTimer();
  });

  it("面對面暫停中不能對齊，差距與換算差距都是 0", () => {
    const ft = setupStory();
    ft.advanceBy(60);
    expect(ft.getClockShiftMs()).toBe(HOUR);
    ft.syncFaceToFace(true);
    expect(ft.realignToReality()).toBe(false);
    expect(ft.storyGapMs.value).toBe(0);
    expect(ft.getClockShiftMs()).toBe(0);
    ft.stopDisplayTimer();
  });
});
