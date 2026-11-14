import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

vi.mock("@/db/database", () => ({
  db: { init: async () => {}, _instance: null, get: async () => undefined, put: async () => {} },
  DB_STORES: { CHAT_AFFINITY_STATES: "s", CHARACTER_AFFECTIONS: "c" },
}));

const judgeMock = vi.fn();
vi.mock("@/services/affinityJudge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/affinityJudge")>()),
  judgeAffinityUpdates: (...args: unknown[]) => judgeMock(...args),
}));

import { CharacterAffinityConfigSchema, createDefaultState } from "@/schemas/affinity";
import { parseJudgeReply } from "@/services/affinityJudge";
import { parseAffinityUpdateTags } from "@/services/ResponseParser";
import { useAffinityStore } from "@/stores/affinity";
import { useChatAffinity } from "./useChatAffinity";

const CHAT = "c1";

function setup(overrides: Record<string, unknown> = {}) {
  const config = CharacterAffinityConfigSchema.parse({
    characterId: "char1",
    enabled: true,
    metrics: [
      { id: "aff", name: "好感度", initial: 50 },
      { id: "mood", name: "心情", type: "string", initial: "平靜", options: ["開心", "平靜"] },
    ],
    ...overrides,
  });
  const store = useAffinityStore();
  store.configCache.set(config.characterId, config);
  store.affinityStates.set(CHAT, createDefaultState(CHAT, config));
  const messages = ref<any[]>([]);
  const a = useChatAffinity({
    currentChatId: ref(CHAT),
    messages,
    getNames: () => ({ char: "悠紀", user: "我" }),
  });
  a._affinityConfig.value = config;
  const push = (id: string, role: "ai" | "user", content = "…") =>
    messages.value.push({ id, role, content, timestamp: Date.now() });
  const reply = (id: string, content: string) => {
    push(id, "ai", content);
    const updates = parseAffinityUpdateTags(content);
    if (updates.length) a._handleAffinityUpdates(updates, id);
    a.afterAiReply(id, updates.length > 0);
  };
  return { store, messages, a, push, reply, value: () => store.getState(CHAT)!.values.aff };
}

describe("旁觀者判斷", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.spyOn(console, "log").mockImplementation(() => {});
    judgeMock.mockReset();
  });

  it("回答「無」不算變化；標籤照常解析", () => {
    expect(parseJudgeReply("無")).toEqual([]);
    expect(parseJudgeReply("<think>想一下</think>\n無。")).toEqual([]);
    expect(parseJudgeReply(`<affinity-update 好感度="+2"/>`)).toEqual([
      { metric: "好感度", change: 2, reason: "旁觀者判斷" },
    ]);
  });

  it("旁觀者模式：回覆後請旁觀者判斷，結果套到那一則", async () => {
    const t = setup({ updateMode: "judge" });
    judgeMock.mockResolvedValue([{ metric: "好感度", change: 4, reason: "被誇獎" }]);
    t.push("u1", "user", "你今天好可愛");
    t.reply("a1", "謝、謝謝…");
    await vi.waitFor(() => expect(t.value()).toBe(54));
    const input = judgeMock.mock.calls[0][0];
    expect(input.dialogue).toBe("我：你今天好可愛\n悠紀：謝、謝謝…");
    expect(t.a.affinityChips.value.get("a1")).toMatchObject({
      items: [{ text: "好感度 +4", kind: "up" }],
      reason: "被誇獎",
    });
  });

  it("判斷完之前那則被重抽掉了：結果作廢", async () => {
    const t = setup({ updateMode: "judge" });
    let resolve!: (v: unknown) => void;
    judgeMock.mockReturnValue(new Promise((r) => (resolve = r)));
    t.push("u1", "user");
    t.reply("a1", "…");
    t.messages.value = t.messages.value.filter((m) => m.id !== "a1");
    resolve([{ metric: "好感度", change: 10, reason: "x" }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(t.value()).toBe(50);
  });

  it("自己回報模式不會呼叫旁觀者；回覆自己有寫也不會", () => {
    const t = setup();
    t.push("u1", "user");
    t.reply("a1", "…");
    expect(judgeMock).not.toHaveBeenCalled();

    const j = setup({ updateMode: "judge" });
    j.push("u1", "user");
    j.reply("a1", `<affinity-update 好感度="+1"/>`);
    expect(judgeMock).not.toHaveBeenCalled();
  });
});

describe("訊息下方的膠囊", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("膠囊顯示在這輪最後一則 AI 訊息下；開場白不顯示；減少和文字型分開標示", () => {
    const t = setup();
    t.reply("g", `<affinity-update 好感度="+10"/>`);
    t.push("u1", "user");
    t.reply("a1", `<affinity-update 好感度="-3" 心情="開心" reason="吵架後又和好"/>`);
    t.push("a2", "ai");
    const chips = t.a.affinityChips.value;
    expect(chips.has("g")).toBe(false);
    expect(chips.has("a1")).toBe(false);
    expect(chips.get("a2")).toMatchObject({
      items: [
        { text: "好感度 -3", kind: "down" },
        { text: "心情 平靜→開心", kind: "text" },
      ],
      more: 0,
      reason: "",
    });
  });

  it("可以關掉膠囊", () => {
    const t = setup({ showChangeChips: false });
    t.push("u1", "user");
    t.reply("a1", `<affinity-update 好感度="+1"/>`);
    expect(t.a.affinityChips.value.size).toBe(0);
  });

  it("連續 5 輪都沒回報才提示改用旁觀者；按「先不用」後不再提示", () => {
    const t = setup();
    for (let i = 1; i <= 4; i++) {
      t.push(`u${i}`, "user");
      t.reply(`a${i}`, "…");
    }
    expect(t.a.judgeHintMessageId.value).toBeNull();
    t.push("u5", "user");
    t.reply("a5", "…");
    expect(t.a.judgeHintMessageId.value).toBe("a5");
    t.a.dismissJudgeHint();
    expect(t.a.judgeHintMessageId.value).toBeNull();
  });
});
