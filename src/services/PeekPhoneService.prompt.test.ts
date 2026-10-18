import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredCharacter } from "@/types/character";
import type { Chat } from "@/types/chat";
import type { ImportantEventsLog } from "@/types/importantEvents";

// 重要事件記錄本和總結：測試裡直接放資料
const { tables } = vi.hoisted(() => ({
  tables: { importantEvents: new Map<string, unknown>(), summaries: [] as unknown[] },
}));

// 只測組 prompt 資料，不會真的呼叫 API
vi.mock("@/api/OpenAICompatible", () => ({ OpenAICompatibleClient: vi.fn() }));
vi.mock("@/stores/promptManager", () => ({ usePromptManagerStore: vi.fn() }));
vi.mock("@/stores/settings", () => ({ useSettingsStore: vi.fn() }));
vi.mock("@/storage/chatMessageStorage", () => ({ loadMessages: vi.fn(async () => []) }));
vi.mock("@/db/database", () => ({
  DB_STORES: { IMPORTANT_EVENTS: "importantEvents", SUMMARIES: "summaries" },
  db: {
    init: vi.fn(async () => {}),
    get: vi.fn(async (store: string, key: string) =>
      store === "importantEvents" ? tables.importantEvents.get(key) : undefined,
    ),
    getAll: vi.fn(async (store: string) => (store === "summaries" ? tables.summaries : [])),
  },
}));

import {
  buildPromptContext,
  extractChatContext,
  extractSummariesAndEvents,
  pickImportantEvents,
  type PeekSources,
} from "./PeekPhoneService";

function sources(over: Partial<PeekSources> = {}): PeekSources {
  return {
    chatContext: "（聊天）",
    userName: "小栩",
    userDescription: "",
    worldInfo: "",
    summariesAndEvents: "",
    now: new Date(2026, 9, 18, 1, 47),
    ...over,
  };
}

function eventsLog(over: Partial<ImportantEventsLog> = {}): ImportantEventsLog {
  return {
    id: "chat-1",
    characterId: "c1",
    chatId: "chat-1",
    events: [],
    settings: { enabled: true, autoSave: true, maxEvents: 50 },
    ...over,
  };
}

describe("PeekPhoneService：組 prompt 資料", () => {
  it("角色卡裡的 {{char}}／{{user}} 換成真名", async () => {
    const character = {
      id: "c1",
      nickname: "",
      data: {
        name: "沈既白",
        description: "{{char}}是外科醫生。",
        personality: "對{{user}}嘴硬",
        scenario: "{{user}}和{{char}}是同事",
      },
    } as unknown as StoredCharacter;

    const ctx = await buildPromptContext(
      character,
      sources({ userDescription: "{{user}}是策展人", worldInfo: "{{char}}住在台北" }),
    );

    expect(ctx.charDesc).toBe("沈既白是外科醫生。");
    expect(ctx.personality).toBe("對小栩嘴硬");
    expect(ctx.scenario).toBe("小栩和沈既白是同事");
    expect(ctx.userDescription).toBe("小栩是策展人");
    expect(ctx.worldInfo).toBe("沈既白住在台北");
  });

  it("現在時間用 store 給的（聊天的假時間），不是現實時間", async () => {
    const character = { id: "c1", nickname: "", data: { name: "沈既白" } } as unknown as StoredCharacter;
    const storyNow = new Date(2019, 6, 2, 21, 30);

    const ctx = await buildPromptContext(character, sources({ now: storyNow }));

    expect(ctx.now).toBe(storyNow);
  });

  it("最近的聊天紀錄用使用者的名字，不寫「用戶」", async () => {
    const chat = {
      id: "chat-1",
      messages: [
        { is_user: true, name: "You", content: "早點睡" },
        { is_user: false, name: "沈既白", content: "你也是" },
      ],
    } as unknown as Chat;

    const text = await extractChatContext(chat, 15, "小栩");

    expect(text).toBe("小栩: 早點睡\n沈既白: 你也是");
  });
});

describe("PeekPhoneService：重要事件", () => {
  beforeEach(() => {
    tables.importantEvents.clear();
    tables.summaries = [];
  });

  it("從記錄本的 events 裡挑：重要的在前、同樣重要時新的在前，帶上分類", () => {
    const log = eventsLog({
      events: [
        { id: "e1", content: "第一次在美術館見面", timestamp: 1, priority: 2, category: "relationship" },
        { id: "e2", content: "答應週末一起去看海", timestamp: 3, priority: 1, category: "promise" },
        { id: "e3", content: "對貓過敏", timestamp: 2, priority: 2, category: "fact" },
        { id: "e4", content: "  ", timestamp: 4, priority: 1 },
      ],
    });

    expect(pickImportantEvents(log)).toEqual([
      "[約定] 答應週末一起去看海",
      "[事實] 對貓過敏",
      "[關係] 第一次在美術館見面",
    ]);
  });

  it("記錄本關掉時不用", () => {
    const log = eventsLog({
      events: [{ id: "e1", content: "答應週末一起去看海", timestamp: 1 }],
      settings: { enabled: false, autoSave: true, maxEvents: 50 },
    });

    expect(pickImportantEvents(log)).toEqual([]);
  });

  it("送進 prompt 的是事件內容，不是空白", async () => {
    tables.importantEvents.set(
      "chat-1",
      eventsLog({ events: [{ id: "e1", content: "答應週末一起去看海", timestamp: 1, category: "promise" }] }),
    );

    const text = await extractSummariesAndEvents("chat-1", "c1");

    expect(text).toBe("【重要事件記錄】\n- [約定] 答應週末一起去看海");
  });

  it("這段聊天沒有記錄本時，用舊的角色記錄本", async () => {
    tables.importantEvents.set(
      "c1",
      eventsLog({ id: "c1", chatId: undefined, events: [{ id: "e1", content: "對貓過敏", timestamp: 1 }] }),
    );

    const text = await extractSummariesAndEvents("chat-1", "c1");

    expect(text).toContain("- 對貓過敏");
  });
});
