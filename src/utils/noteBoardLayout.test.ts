import { describe, expect, it } from "vitest";
import type { NoteBoardData } from "@/services/noteBoard";
import { buildBoardDays, noteTilt } from "./noteBoardLayout";

const at = (month: number, day: number, hour: number, minute = 0) =>
  new Date(2026, month - 1, day, hour, minute).getTime();
const now = at(10, 18, 15);

function note(id: string, text: string, createdAt: number, replyTo?: string) {
  return { id, chatId: "chat-a", characterId: "char-a", characterName: "阿澈", text, createdAt, replyTo };
}

function board(partial: Partial<NoteBoardData>): NoteBoardData {
  return { posts: [], notes: [], verbalReplies: [], seenAt: 0, ...partial };
}

describe("buildBoardDays", () => {
  it("空的就沒有分段", () => {
    expect(buildBoardDays(board({}), now)).toEqual([]);
  });

  it("按日期分段、新的在上，回覆掛在心情下面（舊到新）", () => {
    const data = board({
      posts: [
        { id: "p2", text: "好累", createdAt: at(10, 18, 2, 29) },
        { id: "p1", text: "考完了", createdAt: at(10, 15, 21, 5) },
      ],
      notes: [
        note("n4", "帶傘", at(10, 18, 14, 20)),
        note("n3", "加油", at(10, 18, 8, 40), "p2"),
        note("n2", "先睡", at(10, 18, 3, 10), "p2"),
        note("n1", "恭喜", at(10, 16, 9), "p1"),
      ],
    });

    const days = buildBoardDays(data, now);
    expect(days.map((d) => d.label)).toEqual(["今天", "10/15 · 星期四"]);

    const today = days[0].items;
    expect(today.map((i) => (i.kind === "post" ? `post:${i.post.id}` : `note:${i.note.id}`))).toEqual([
      "note:n4",
      "post:p2",
    ]);
    const p2 = today[1];
    expect(p2.kind === "post" && p2.replies.map((r) => r.id)).toEqual(["n2", "n3"]);

    // 隔天才回的，也掛在原本那則心情下面
    const p1 = days[1].items[0];
    expect(p1.kind === "post" && p1.replies.map((r) => r.id)).toEqual(["n1"]);
  });

  it("昨天的標籤", () => {
    const days = buildBoardDays(board({ notes: [note("n1", "早安", at(10, 17, 9))] }), now);
    expect(days[0].label).toBe("昨天");
  });

  it("找不到心情的回覆當成一般紙條", () => {
    const days = buildBoardDays(board({ notes: [note("n1", "回很舊的心情", at(10, 18, 9), "gone")] }), now);
    expect(days[0].items).toEqual([{ kind: "note", note: expect.objectContaining({ id: "n1" }) }]);
  });
});

describe("noteTilt", () => {
  it("同一張紙條的角度固定，在 -4 到 4 度之間", () => {
    for (const id of ["n1", "post-1777", "note-abc", ""]) {
      const tilt = noteTilt(id);
      expect(noteTilt(id)).toBe(tilt);
      expect(tilt).toBeGreaterThanOrEqual(-4);
      expect(tilt).toBeLessThanOrEqual(4);
    }
    expect(new Set(["a", "b", "c", "d", "e", "f"].map(noteTilt)).size).toBeGreaterThan(1);
  });
});
