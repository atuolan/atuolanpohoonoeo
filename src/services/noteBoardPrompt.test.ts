import { describe, expect, it } from "vitest";
import type { NoteBoardData } from "@/services/noteBoard";
import {
  formatCharStickyNoteForPrompt,
  formatMoodNoteForPrompt,
  MOOD_NOTE_MAX_AGE_MS,
  MOOD_NOTE_MAX_LENGTH,
} from "@/services/noteBoardPrompt";

const now = new Date(2026, 9, 18, 14, 30).getTime();
const HOUR = 60 * 60 * 1000;

function board(partial: Partial<NoteBoardData>): NoteBoardData {
  return { posts: [], notes: [], verbalReplies: [], seenAt: 0, ...partial };
}

function note(id: string, chatId: string, text: string, createdAt: number, replyTo?: string) {
  return { id, chatId, characterId: `char-${chatId}`, characterName: "阿澈", text, createdAt, replyTo };
}

describe("formatCharStickyNoteForPrompt", () => {
  it("這個聊天最新的一張，回覆和提醒都算", () => {
    const data = board({
      notes: [
        note("n3", "chat-b", "別的角色", now - HOUR),
        note("n2", "chat-a", "先睡", now - 2 * HOUR, "post-1"),
        note("n1", "chat-a", "帶傘", now - 3 * HOUR),
      ],
    });
    expect(formatCharStickyNoteForPrompt(data, "chat-a", now)).toBe("今天 12:30：先睡");
    expect(formatCharStickyNoteForPrompt(data, "chat-c", now)).toBe("");
  });
});

describe("formatMoodNoteForPrompt", () => {
  const post = { id: "post-1", text: "好累，明天還要考試", mood: "sad" as const, createdAt: now - HOUR };

  it("沒有心情時是空的", () => {
    expect(formatMoodNoteForPrompt(board({}), "chat-a", now)).toEqual({ text: "", postId: null });
  });

  it("最新一則心情，有心情行", () => {
    const data = board({ posts: [post, { id: "post-0", text: "舊的", createdAt: now - 5 * HOUR }] });
    expect(formatMoodNoteForPrompt(data, "chat-a", now)).toEqual({
      text: "心情：難過\n今天 13:30 寫的：好累，明天還要考試",
      postId: "post-1",
    });
  });

  it("送出時沒點心情就不寫心情行", () => {
    const data = board({ posts: [{ id: "post-1", text: "還行", createdAt: now - HOUR }] });
    expect(formatMoodNoteForPrompt(data, "chat-a", now).text).toBe("今天 13:30 寫的：還行");
  });

  it("超過 72 小時不帶", () => {
    const old = board({ posts: [{ ...post, createdAt: now - MOOD_NOTE_MAX_AGE_MS - 1 }] });
    expect(formatMoodNoteForPrompt(old, "chat-a", now)).toEqual({ text: "", postId: null });
    const edge = board({ posts: [{ ...post, createdAt: now - MOOD_NOTE_MAX_AGE_MS }] });
    expect(formatMoodNoteForPrompt(edge, "chat-a", now).postId).toBe("post-1");
  });

  it("太長只帶前 300 字", () => {
    const data = board({
      posts: [{ id: "post-1", text: "字".repeat(MOOD_NOTE_MAX_LENGTH + 5), createdAt: now - HOUR }],
    });
    expect(formatMoodNoteForPrompt(data, "chat-a", now).text).toBe(
      `今天 13:30 寫的：${"字".repeat(MOOD_NOTE_MAX_LENGTH)}…`,
    );
  });

  it("用紙條回過，帶上紙條內容", () => {
    const data = board({
      posts: [post],
      notes: [note("n1", "chat-a", "考試不會跑掉，先睡。", now - 30 * 60 * 1000, "post-1")],
    });
    expect(formatMoodNoteForPrompt(data, "chat-a", now).text).toBe(
      "心情：難過\n今天 13:30 寫的：好累，明天還要考試\n" +
        "（你已經在今天 14:00 用紙條回過這則心情：「考試不會跑掉，先睡。」；發新的心情之前不要再提）",
    );
  });

  it("只在聊天裡回過", () => {
    const data = board({
      posts: [post],
      verbalReplies: [{ postId: "post-1", chatId: "chat-a", repliedAt: now - 30 * 60 * 1000 }],
    });
    expect(formatMoodNoteForPrompt(data, "chat-a", now).text).toContain(
      "（你已經在今天 14:00 在聊天裡回應過這則心情了；發新的心情之前不要再提）",
    );
  });

  it("別的聊天回過、或回的是舊心情，都不算", () => {
    const data = board({
      posts: [post],
      notes: [
        note("n2", "chat-b", "別人回的", now - 10 * 60 * 1000, "post-1"),
        note("n1", "chat-a", "回舊的", now - 2 * HOUR, "post-0"),
      ],
      verbalReplies: [{ postId: "post-0", chatId: "chat-a", repliedAt: now - 2 * HOUR }],
    });
    expect(formatMoodNoteForPrompt(data, "chat-a", now).text).not.toContain("你已經");
  });
});
