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
  addCharStickyNote,
  CHAR_STICKY_NOTE_ADDED_EVENT,
  CHAR_STICKY_NOTE_LIMIT,
  CHAR_STICKY_NOTE_REPLACE_WINDOW_MS,
  getCharStickyNoteForPrompt,
  loadCharStickyNotes,
} from "@/services/charStickyNotes";

const MINUTE = 60 * 1000;
const base = new Date(2026, 9, 18, 14, 20).getTime();

function note(chatId: string, text: string, createdAt: number) {
  return { chatId, characterId: `char-${chatId}`, characterName: "阿澈", text, createdAt };
}

describe("charStickyNotes", () => {
  beforeEach(() => {
    storage.clear();
    // 測試環境是 node，用 EventTarget 當 window 收事件
    vi.stubGlobal("window", new EventTarget());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("沒存過時是空的", async () => {
    await expect(loadCharStickyNotes()).resolves.toEqual([]);
    await expect(getCharStickyNoteForPrompt("chat-a", base)).resolves.toBe("");
  });

  it("新的在前，並發出事件", async () => {
    const events: unknown[] = [];
    window.addEventListener(CHAR_STICKY_NOTE_ADDED_EVENT, (ev) =>
      events.push((ev as CustomEvent).detail),
    );

    const first = await addCharStickyNote(note("chat-a", "記得帶傘", base));
    const second = await addCharStickyNote(note("chat-b", "考試加油", base + MINUTE));

    const notes = await loadCharStickyNotes();
    expect(notes.map((n) => n.text)).toEqual(["考試加油", "記得帶傘"]);
    expect(first.id).not.toBe(second.id);
    expect(events).toEqual([first, second]);
  });

  it("最多留 20 張，丟最舊的", async () => {
    for (let i = 0; i <= CHAR_STICKY_NOTE_LIMIT; i++) {
      // 每張隔 11 分鐘、輪流不同聊天，不觸發取代
      await addCharStickyNote(note(`chat-${i}`, `第 ${i} 張`, base + i * 11 * MINUTE));
    }
    const notes = await loadCharStickyNotes();
    expect(notes).toHaveLength(CHAR_STICKY_NOTE_LIMIT);
    expect(notes[0].text).toBe(`第 ${CHAR_STICKY_NOTE_LIMIT} 張`);
    expect(notes.some((n) => n.text === "第 0 張")).toBe(false);
  });

  it("同一個聊天 10 分鐘內再寫，取代上一張", async () => {
    await addCharStickyNote(note("chat-a", "舊的", base));
    await addCharStickyNote(note("chat-b", "別的角色", base + MINUTE));
    await addCharStickyNote(note("chat-a", "重新生成的", base + 2 * MINUTE));

    const notes = await loadCharStickyNotes();
    expect(notes.map((n) => n.text)).toEqual(["重新生成的", "別的角色"]);
  });

  it("超過 10 分鐘就是新的一張", async () => {
    await addCharStickyNote(note("chat-a", "早上的", base));
    await addCharStickyNote(
      note("chat-a", "晚一點的", base + CHAR_STICKY_NOTE_REPLACE_WINDOW_MS + MINUTE),
    );
    expect((await loadCharStickyNotes()).map((n) => n.text)).toEqual(["晚一點的", "早上的"]);
  });

  it("給提示詞的是這個聊天最新的一張", async () => {
    await addCharStickyNote(note("chat-a", "記得帶傘", base));
    await addCharStickyNote(note("chat-b", "考試加油", base + 20 * MINUTE));

    await expect(getCharStickyNoteForPrompt("chat-a", base + 30 * MINUTE)).resolves.toBe(
      "今天 14:20：記得帶傘",
    );
    await expect(getCharStickyNoteForPrompt("chat-c", base)).resolves.toBe("");
  });
});
