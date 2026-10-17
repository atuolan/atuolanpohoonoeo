/// <reference types="vitest/globals" />

const { layout } = vi.hoisted(() => ({ layout: { widgets: [] as unknown[], fail: false } }));

vi.mock("@/services/storage", () => ({
  storageService: {
    loadLayout: vi.fn(async () => {
      if (layout.fail) throw new Error("db closed");
      return layout.widgets;
    }),
  },
}));

import {
  formatUserMoodNote,
  getUserMoodNoteForPrompt,
  USER_MOOD_NOTE_MAX_AGE_MS,
  USER_MOOD_NOTE_MAX_LENGTH,
} from "@/services/userMoodNote";

const now = new Date(2026, 9, 18, 14, 30).getTime();
const HOUR = 60 * 60 * 1000;

function diary(data: Record<string, unknown>) {
  return { type: "mood-diary", data };
}

describe("formatUserMoodNote", () => {
  it("有心情也有文字", () => {
    const text = formatUserMoodNote(
      [diary({ content: "好累，明天還要考試", mood: "sad", moodChosen: true, updatedAt: now - HOUR })],
      now,
    );
    expect(text).toBe("心情：難過\n今天 13:30 寫的：好累，明天還要考試");
  });

  it("沒點過心情就不寫心情", () => {
    const text = formatUserMoodNote(
      [diary({ content: "今天還行", mood: "happy", updatedAt: now - HOUR })],
      now,
    );
    expect(text).toBe("今天 13:30 寫的：今天還行");
  });

  it("只有心情沒有文字", () => {
    expect(
      formatUserMoodNote([diary({ content: "  ", mood: "love", moodChosen: true, updatedAt: now - HOUR })], now),
    ).toBe("心情：心動（今天 13:30）");
  });

  it("沒文字也沒點心情就是空的", () => {
    expect(formatUserMoodNote([diary({ content: "", mood: "happy", updatedAt: now })], now)).toBe("");
  });

  it("沒有 updatedAt 或超過 72 小時不帶", () => {
    expect(formatUserMoodNote([diary({ content: "舊的" })], now)).toBe("");
    expect(
      formatUserMoodNote([diary({ content: "太久了", updatedAt: now - USER_MOOD_NOTE_MAX_AGE_MS - 1 })], now),
    ).toBe("");
    expect(
      formatUserMoodNote([diary({ content: "剛好", updatedAt: now - USER_MOOD_NOTE_MAX_AGE_MS })], now),
    ).toContain("剛好");
  });

  it("有好幾個心情便籤時取最近改的，其他組件不管", () => {
    const text = formatUserMoodNote(
      [
        { type: "todo", data: { content: "不是心情", updatedAt: now } },
        diary({ content: "早上的", updatedAt: now - 5 * HOUR }),
        diary({ content: "剛剛的", updatedAt: now - HOUR }),
      ],
      now,
    );
    expect(text).toBe("今天 13:30 寫的：剛剛的");
  });

  it("太長只帶前 300 字", () => {
    const text = formatUserMoodNote(
      [diary({ content: "字".repeat(USER_MOOD_NOTE_MAX_LENGTH + 20), updatedAt: now - HOUR })],
      now,
    );
    expect(text).toBe(`今天 13:30 寫的：${"字".repeat(USER_MOOD_NOTE_MAX_LENGTH)}…`);
  });
});

describe("getUserMoodNoteForPrompt", () => {
  beforeEach(() => {
    layout.widgets = [];
    layout.fail = false;
  });

  it("讀主畫面配置", async () => {
    layout.widgets = [diary({ content: "想放假", updatedAt: now - HOUR })];
    await expect(getUserMoodNoteForPrompt(now)).resolves.toBe("今天 13:30 寫的：想放假");
  });

  it("讀不到時當作沒有", async () => {
    layout.fail = true;
    await expect(getUserMoodNoteForPrompt(now)).resolves.toBe("");
  });
});
