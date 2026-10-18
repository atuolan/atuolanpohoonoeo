/// <reference types="vitest/globals" />

const { storage } = vi.hoisted(() => ({ storage: new Map<string, unknown>() }));

vi.mock("@/db/database", () => ({
  DB_STORES: { APP_SETTINGS: "appSettings" },
  db: {
    get: vi.fn(async (_store: string, key: string) => structuredClone(storage.get(key))),
    put: vi.fn(async (_store: string, value: { id: string }) => {
      storage.set(value.id, structuredClone(value));
    }),
  },
}));

import {
  addCharNote,
  addMoodPost,
  CHAR_NOTE_REPLACE_WINDOW_MS,
  loadNoteBoard,
  markMoodReplied,
  markNoteBoardSeen,
  NOTE_BOARD_CHANGED_EVENT,
  NOTE_BOARD_LIMITS,
  unreadCharNotes,
} from "@/services/noteBoard";

const MINUTE = 60 * 1000;
const base = new Date(2026, 9, 18, 14, 20).getTime();

function charNote(chatId: string, text: string, createdAt: number, replyTo?: string) {
  return { chatId, characterId: `char-${chatId}`, characterName: "阿澈", text, createdAt, replyTo };
}

describe("noteBoard", () => {
  beforeEach(() => {
    storage.clear();
    // 測試環境是 node，用 EventTarget 當 window 收事件
    vi.stubGlobal("window", new EventTarget());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("沒存過時是空的", async () => {
    await expect(loadNoteBoard()).resolves.toEqual({
      posts: [],
      notes: [],
      verbalReplies: [],
      seenAt: 0,
    });
  });

  it("心情與紙條都是新的在前，寫入後發事件", async () => {
    let events = 0;
    window.addEventListener(NOTE_BOARD_CHANGED_EVENT, () => events++);

    const post = await addMoodPost({ text: "好累", mood: "sad", createdAt: base });
    await addMoodPost({ text: "考完了", createdAt: base + MINUTE });
    await addCharNote(charNote("chat-a", "先睡", base + 2 * MINUTE, post.id));
    await addCharNote(charNote("chat-b", "帶傘", base + 3 * MINUTE));

    const data = await loadNoteBoard();
    expect(data.posts.map((p) => p.text)).toEqual(["考完了", "好累"]);
    expect(data.posts[1]).toMatchObject({ text: "好累", mood: "sad", createdAt: base });
    expect(data.posts[0].mood).toBeUndefined();
    expect(data.notes.map((n) => n.text)).toEqual(["帶傘", "先睡"]);
    expect(data.notes[1].replyTo).toBe(post.id);
    expect(events).toBe(4);
  });

  it("同一個聊天、同一種紙條 10 分鐘內再寫，取代上一張", async () => {
    await addCharNote(charNote("chat-a", "舊的提醒", base));
    await addCharNote(charNote("chat-b", "別的角色", base + MINUTE));
    await addCharNote(charNote("chat-a", "重新生成的提醒", base + 2 * MINUTE));

    expect((await loadNoteBoard()).notes.map((n) => n.text)).toEqual(["重新生成的提醒", "別的角色"]);
  });

  it("回覆和提醒不互相取代，回覆不同心情也不取代", async () => {
    await addCharNote(charNote("chat-a", "提醒", base));
    await addCharNote(charNote("chat-a", "回心情一", base + MINUTE, "post-1"));
    await addCharNote(charNote("chat-a", "回心情二", base + 2 * MINUTE, "post-2"));
    await addCharNote(charNote("chat-a", "重寫回心情一", base + 3 * MINUTE, "post-1"));

    expect((await loadNoteBoard()).notes.map((n) => n.text)).toEqual([
      "重寫回心情一",
      "回心情二",
      "提醒",
    ]);
  });

  it("超過 10 分鐘就是新的一張", async () => {
    await addCharNote(charNote("chat-a", "早上的", base));
    await addCharNote(charNote("chat-a", "晚一點的", base + CHAR_NOTE_REPLACE_WINDOW_MS + MINUTE));
    expect((await loadNoteBoard()).notes.map((n) => n.text)).toEqual(["晚一點的", "早上的"]);
  });

  it("超過上限時丟最舊的", async () => {
    const notes = Array.from({ length: NOTE_BOARD_LIMITS.notes }, (_, i) => ({
      id: `n${i}`,
      ...charNote(`chat-${i}`, `第 ${i} 張`, base - i * MINUTE),
    }));
    storage.set("note-board", { id: "note-board", posts: [], notes, verbalReplies: [], seenAt: 0 });

    await addCharNote(charNote("chat-new", "最新", base + MINUTE));
    const data = await loadNoteBoard();
    expect(data.notes).toHaveLength(NOTE_BOARD_LIMITS.notes);
    expect(data.notes[0].text).toBe("最新");
    expect(data.notes.some((n) => n.id === `n${NOTE_BOARD_LIMITS.notes - 1}`)).toBe(false);
  });

  it("只在聊天裡回應的記號，同一組只記一次", async () => {
    await markMoodReplied("post-1", "chat-a", base);
    await markMoodReplied("post-1", "chat-a", base + MINUTE);
    await markMoodReplied("post-1", "chat-b", base + MINUTE);

    expect((await loadNoteBoard()).verbalReplies).toEqual([
      { postId: "post-1", chatId: "chat-b", repliedAt: base + MINUTE },
      { postId: "post-1", chatId: "chat-a", repliedAt: base },
    ]);
  });

  it("已讀時間只往後推，之後的紙條才算新的", async () => {
    await addCharNote(charNote("chat-a", "舊的", base));
    await markNoteBoardSeen(base + MINUTE);
    await markNoteBoardSeen(base);
    await addCharNote(charNote("chat-b", "新的", base + 2 * MINUTE));

    const data = await loadNoteBoard();
    expect(data.seenAt).toBe(base + MINUTE);
    expect(unreadCharNotes(data).map((n) => n.text)).toEqual(["新的"]);
  });

  it("上一版的便利貼轉成提醒紙條，不算新的", async () => {
    storage.set("char-sticky-notes", {
      id: "char-sticky-notes",
      notes: [
        { id: "old-2", chatId: "chat-a", characterId: "char-a", characterName: "阿澈", text: "帶傘", createdAt: base },
        { id: "old-1", chatId: "chat-b", characterId: "char-b", characterName: "Chris", text: "加油", createdAt: base - MINUTE },
      ],
    });

    const data = await loadNoteBoard();
    expect(data.notes.map((n) => n.text)).toEqual(["帶傘", "加油"]);
    expect(data.notes.every((n) => n.replyTo === undefined)).toBe(true);
    expect(data.seenAt).toBe(base);
    expect(unreadCharNotes(data)).toEqual([]);

    // 第一次寫入時存成新的 key，舊的紙條也一起留著
    await addMoodPost({ text: "心情", createdAt: base + MINUTE });
    const stored = storage.get("note-board") as { notes: unknown[] };
    expect(stored.notes).toHaveLength(2);
  });
});
