import { describe, expect, it } from "vitest";
import type { DiaryEntry } from "@/db/database";
import type { PeekPhoneData } from "@/types/peekPhone";
import type { ImportantEvent } from "@/types/importantEvents";
import {
  formatJournalDate,
  pickJournalFromPeek,
  pickLatestChatDiary,
} from "../useCharJournal";
import { getNextMilestone, pickLatestPromise } from "../useRelationshipMilestone";

function peek(partial: Partial<PeekPhoneData>): PeekPhoneData {
  return {
    characterId: "c1",
    chats: [],
    schedule: [],
    meals: [],
    balance: 0,
    transactions: [],
    memos: [],
    notes: [],
    diary: [],
    gallery: [],
    browserHistory: [],
    hiddenPhotos: [],
    ...partial,
  };
}

describe("pickJournalFromPeek", () => {
  it("取最新日期的日記，行程未完成的排前面、最多 2 筆", () => {
    const view = pickJournalFromPeek(
      peek({
        diary: [
          { id: "d1", date: "2026-10-08", mood: "sad", content: "舊的" },
          { id: "d2", date: "2026-10-10", mood: "happy", content: " 新的 ", weather: "晴" },
        ],
        schedule: [
          { id: "s1", time: "09:00", title: "早餐", done: true },
          { id: "s2", time: "19:30", title: "健身房", done: false },
          { id: "s3", time: "15:00", title: "寫報告", done: false },
        ],
      }),
    );
    expect(view).toMatchObject({
      source: "peek",
      dateLabel: "10/10 六",
      mood: "happy",
      weather: "晴",
      content: "新的",
    });
    expect(view?.schedule.map((s) => s.id)).toEqual(["s3", "s2"]);
  });

  it("沒有日記也沒有行程時回傳 null，讓呼叫端退回聊天日記", () => {
    expect(pickJournalFromPeek(peek({}))).toBeNull();
    expect(pickJournalFromPeek(null)).toBeNull();
  });
});

describe("pickLatestChatDiary", () => {
  const base = { chatId: "chat", messageCount: 10 };
  const diaries: DiaryEntry[] = [
    { ...base, id: "a", characterId: "c1", content: "# 標題\n\n**舊**日記", createdAt: 1, status: "ready" },
    { ...base, id: "b", characterId: "c1", content: "# 新\n\n今天*很*好", createdAt: 3, status: "ready" },
    { ...base, id: "c", characterId: "c1", content: "寫到一半", createdAt: 5, status: "writing" },
    { ...base, id: "d", characterId: "c2", content: "別人的", createdAt: 9, status: "ready" },
  ];

  it("只取該角色已寫好的最新一篇，並去掉 Markdown 符號", () => {
    expect(pickLatestChatDiary(diaries, "c1")).toMatchObject({
      source: "diary",
      content: "新 今天很好",
      schedule: [],
    });
  });

  it("該角色沒有日記時回傳 null", () => {
    expect(pickLatestChatDiary(diaries, "c3")).toBeNull();
  });
});

describe("formatJournalDate", () => {
  it("格式為 月/日 星期", () => {
    expect(formatJournalDate("2026-10-11")).toBe("10/11 日");
  });
});

describe("getNextMilestone", () => {
  it.each([
    [0, 100, "第 100 天", 100],
    [87, 100, "第 100 天", 13],
    [301, 365, "1 週年", 64],
    [450, 500, "第 500 天", 50],
    [501, 520, "第 520 天", 19],
    [1250, 1300, "第 1300 天", 50],
  ])("認識 %i 天 → 下一個是 %i（%s），還有 %i 天", (days, day, label, left) => {
    expect(getNextMilestone(days)).toEqual({ day, label, daysLeft: left });
  });

  it("今天剛好是里程碑時 daysLeft 為 0", () => {
    expect(getNextMilestone(365)).toEqual({ day: 365, label: "1 週年", daysLeft: 0 });
    expect(getNextMilestone(520)).toEqual({ day: 520, label: "第 520 天", daysLeft: 0 });
  });
});

describe("pickLatestPromise", () => {
  const ev = (id: string, category: ImportantEvent["category"], timestamp: number): ImportantEvent => ({
    id,
    content: id,
    timestamp,
    category,
  });

  it("優先取最新的約定", () => {
    expect(
      pickLatestPromise([ev("p1", "promise", 1), ev("p2", "promise", 2), ev("r1", "relationship", 9)])?.id,
    ).toBe("p2");
  });

  it("沒有約定時退回最新的關係事件，再沒有就 null", () => {
    expect(pickLatestPromise([ev("r1", "relationship", 1), ev("f1", "fact", 5)])?.id).toBe("r1");
    expect(pickLatestPromise([ev("f1", "fact", 5)])).toBeNull();
  });
});
