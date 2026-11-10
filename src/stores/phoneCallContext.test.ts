import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/database";
import { loadChatById } from "@/storage/chatStorage";
import { loadMessages } from "@/storage/chatMessageStorage";
import { loadCallContext, pickRecentChatForCall } from "./phoneCallContext";

vi.mock("@/db/database", () => ({
  DB_STORES: { SUMMARIES: "summaries", IMPORTANT_EVENTS: "importantEvents" },
  db: { getAll: vi.fn(), get: vi.fn() },
}));
vi.mock("@/storage/chatStorage", () => ({ loadChatById: vi.fn() }));
vi.mock("@/storage/chatMessageStorage", () => ({ loadMessages: vi.fn() }));

const summaries = Array.from({ length: 8 }, (_, i) => ({
  id: `s${i}`,
  chatId: "chat-1",
  content: `總結 ${i}`,
  createdAt: i + 1,
  coveredUntil: i + 1,
}));

beforeEach(() => {
  vi.mocked(db.getAll).mockResolvedValue(summaries);
  vi.mocked(db.get).mockResolvedValue(undefined);
  vi.mocked(loadChatById).mockResolvedValue(undefined);
  vi.mocked(loadMessages).mockResolvedValue([]);
});

describe("loadCallContext", () => {
  it("沒有設定時跟聊天一樣讀最近 5 條總結，加上最早那條", async () => {
    const ctx = await loadCallContext({ chatId: "chat-1", characterId: "char-1" });
    expect(ctx.summaries.map((s) => s.id)).toEqual(["s0", "s3", "s4", "s5", "s6", "s7"]);
  });

  it("總結數量照這個聊天的讀取設定", async () => {
    vi.mocked(loadChatById).mockResolvedValue({
      summarySettings: { summaryReadMode: "recent", summaryReadCount: 2 },
    } as any);
    const ctx = await loadCallContext({ chatId: "chat-1", characterId: "char-1" });
    expect(ctx.summaries.map((s) => s.id)).toEqual(["s0", "s6", "s7"]);
  });

  it("設成讀取全部時，通話也讀全部", async () => {
    vi.mocked(loadChatById).mockResolvedValue({
      summarySettings: { summaryReadMode: "all", summaryReadCount: 2 },
    } as any);
    const ctx = await loadCallContext({ chatId: "chat-1", characterId: "char-1" });
    expect(ctx.summaries).toHaveLength(8);
  });

  it("只讀這個聊天或這個角色的總結", async () => {
    vi.mocked(db.getAll).mockResolvedValue([
      { id: "mine", chatId: "chat-1", content: "我的", createdAt: 1 },
      { id: "other", chatId: "chat-2", characterId: "char-2", content: "別人的", createdAt: 2 },
    ]);
    const ctx = await loadCallContext({ chatId: "chat-1", characterId: "char-1" });
    expect(ctx.summaries.map((s) => s.id)).toEqual(["mine"]);
  });

  it("帶上通話前最近的聊天，略過一般系統訊息", async () => {
    vi.mocked(loadMessages).mockResolvedValue([
      { sender: "user", is_user: true, name: "我", content: "嗨", createdAt: 1 },
      { sender: "system", content: "系統提示", createdAt: 2 },
      { sender: "assistant", is_user: false, name: "小雪", content: "你好", createdAt: 3 },
    ] as any);
    const ctx = await loadCallContext({ chatId: "chat-1", characterId: "char-1" });
    expect(ctx.recentChatHistory.map((m) => m.content)).toEqual(["嗨", "你好"]);
  });

  it("一則回覆拆成很多泡泡時，往前多帶到字數預算內的聊天，不只最後 15 則", async () => {
    const msgs = Array.from({ length: 40 }, (_, i) => ({
      sender: i % 2 ? "assistant" : "user",
      is_user: i % 2 === 0,
      name: i % 2 ? "小雪" : "我",
      content: i === 0 ? "我們等下玩雙人成行吧" : `短句${i}`,
      createdAt: i,
    }));
    vi.mocked(loadMessages).mockResolvedValue(msgs as any);
    const ctx = await loadCallContext({ chatId: "chat-1", characterId: "char-1" });
    expect(ctx.recentChatHistory).toHaveLength(40);
    expect(ctx.recentChatHistory[0].content).toBe("我們等下玩雙人成行吧");
  });

  it("略過群聊同步過來的紀錄", async () => {
    vi.mocked(loadMessages).mockResolvedValue([
      { sender: "assistant", is_user: false, name: "A", content: "群聊", createdAt: 1, isGroupChatHistory: true },
      { sender: "user", is_user: true, name: "我", content: "私聊", createdAt: 2 },
    ] as any);
    const ctx = await loadCallContext({ chatId: "chat-1", characterId: "char-1" });
    expect(ctx.recentChatHistory.map((m) => m.content)).toEqual(["私聊"]);
  });

  it("讀取失敗時回傳空的，不會沿用舊資料", async () => {
    vi.mocked(db.getAll).mockRejectedValue(new Error("db 壞了"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctx = await loadCallContext({ chatId: "chat-1", characterId: "char-1" });
    expect(ctx).toEqual({ summaries: [], importantEvents: [], recentChatHistory: [] });
  });
});

describe("pickRecentChatForCall", () => {
  const make = (n: number, len: number) =>
    Array.from({ length: n }, (_, i) => ({ id: i, content: "x".repeat(len) }));

  it("訊息很長時仍保底帶最近 min 則", () => {
    const picked = pickRecentChatForCall(make(30, 1000), { min: 15, max: 80, charBudget: 2000 });
    expect(picked).toHaveLength(15);
    expect(picked[picked.length - 1].id).toBe(29);
  });

  it("超過保底後依字數預算停下", () => {
    const picked = pickRecentChatForCall(make(100, 100), { min: 5, max: 80, charBudget: 2000 });
    expect(picked).toHaveLength(20);
  });

  it("不超過上限則數", () => {
    expect(pickRecentChatForCall(make(200, 1), { min: 5, max: 80, charBudget: 99999 })).toHaveLength(80);
  });
});
