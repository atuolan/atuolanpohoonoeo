import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

/** 每次 generateStream 都回一個等外面放行的串流 */
const { streams, generation } = vi.hoisted(() => ({
  streams: [] as Array<{ resolve: (text: string) => void; reject: (e: Error) => void }>,
  generation: {} as { streamingEnabled?: boolean; useStreamingWindow?: boolean },
}));

vi.mock("@/db/database", () => ({
  DB_STORES: { APP_SETTINGS: "appSettings", SUMMARIES: "summaries", IMPORTANT_EVENTS: "events" },
  db: { get: vi.fn(async () => undefined), put: vi.fn(async () => {}), delete: vi.fn(async () => {}), getAll: vi.fn(async () => []) },
}));
vi.mock("@/storage/chatStorage", () => ({
  resolvePreferredDirectChat: vi.fn(async () => undefined),
  createChatRecord: vi.fn(async () => {}),
  refreshChatDerivedMetadata: vi.fn(async () => {}),
}));
vi.mock("@/storage/chatMessageStorage", () => ({ appendMessages: vi.fn(), loadMessages: vi.fn(async () => []) }));
vi.mock("@/stores/characters", () => ({
  useCharactersStore: () => ({ characters: [{ id: "char-1", data: { name: "小鯤" } }] }),
}));
vi.mock("@/stores/lorebooks", () => ({ useLorebooksStore: () => ({ lorebooks: [] }) }));
vi.mock("@/stores/user", () => ({ useUserStore: () => ({ currentName: "我", currentPersona: null }) }));
vi.mock("@/stores/settings", () => ({
  useSettingsStore: () => ({
    getAPIForTask: () => ({ api: { endpoint: "http://x", apiKey: "k", model: "m" }, generation: { ...generation } }),
  }),
}));
vi.mock("@/engine/prompt/PromptBuilder", () => ({
  PromptBuilder: class {
    async build() {
      return { messages: [] };
    }
  },
}));
vi.mock("@/api/OpenAICompatible", () => ({
  OpenAICompatibleClient: class {
    async *generateStream(params: { signal?: AbortSignal }) {
      const text = await new Promise<string>((resolve, reject) => {
        streams.push({ resolve, reject });
        // 跟真的 client 一樣：被中止時帶著半截內容正常結束
        params.signal?.addEventListener("abort", () => resolve("半截"));
      });
      yield { type: "token", token: text };
      yield { type: "done", content: text };
    }
  },
}));

import { useCompanionChat } from "@/composables/useCompanionChat";
import { useStreamingWindow } from "@/composables/useStreamingWindow";
import type { StoredBook } from "@/types/book";

const flush = () => new Promise((r) => setTimeout(r, 0));

async function waitForStreams(n: number) {
  for (let i = 0; i < 50 && streams.length < n; i++) await flush();
  expect(streams).toHaveLength(n);
}

function setup() {
  const windows: number[] = [];
  let page = 0;
  const replied = vi.fn();
  const book = ref({ id: "b", title: "莊子", chapters: [] } as unknown as StoredBook);
  const c = useCompanionChat({
    book,
    currentChapterIndex: ref(0),
    getReadingWindow: () => {
      windows.push(page);
      return `讀到第 ${page} 頁`;
    },
    onReplied: replied,
  });
  c.startCompanion("char-1");
  c.setTriggerFrequency(3);
  const turn = (n: number) => {
    for (let i = 0; i < n; i++) {
      page++;
      if (c.onPageTurn(0)) c.triggerAutoResponse();
    }
  };
  return { c, turn, windows, replied };
}

describe("伴讀：生成中翻頁", () => {
  beforeEach(() => {
    streams.length = 0;
  });

  it("生成中多翻的頁不會丟，回完後只再生成一次，一起講", async () => {
    const { c, turn, windows, replied } = setup();
    turn(3);
    await waitForStreams(1);
    // 生成中又翻了 7 頁：沒有多開請求
    turn(7);
    await flush();
    expect(streams).toHaveLength(1);

    streams[0].resolve("第一則");
    await waitForStreams(2);
    // 第二次拿到的是最新的位置（第 10 頁），不是一頁一頁補
    expect(windows).toEqual([3, 10]);
    expect(c.pageTurnCounter.value).toBe(0);

    streams[1].resolve("第二則");
    for (let i = 0; i < 10; i++) await flush();
    expect(streams).toHaveLength(2);
    expect(c.messages.value.map((m) => m.content)).toEqual(["第一則", "第二則"]);
    expect(replied).toHaveBeenCalledTimes(2);
  });

  it("生成中翻的頁不夠一輪，就留著算進下一輪", async () => {
    const { c, turn } = setup();
    turn(3);
    await waitForStreams(1);
    turn(2);
    streams[0].resolve("回覆");
    for (let i = 0; i < 10; i++) await flush();
    expect(streams).toHaveLength(1);
    expect(c.pageTurnCounter.value).toBe(2);
    turn(1);
    await waitForStreams(2);
  });

  it("失敗了不自動接著打，也不算聊過", async () => {
    const { c, turn, replied } = setup();
    turn(3);
    await waitForStreams(1);
    turn(5);
    streams[0].reject(new Error("壞掉"));
    for (let i = 0; i < 10; i++) await flush();
    expect(streams).toHaveLength(1);
    expect(c.errorMessage.value).toBe("壞掉");
    expect(replied).not.toHaveBeenCalled();
  });

  it("Enter 先打好幾則不會叫角色回，按送出才一起回", async () => {
    const { c } = setup();
    await c.addUserMessage("等等");
    await c.addUserMessage("這個女皇好狠");
    await flush();
    expect(streams).toHaveLength(0);
    expect(c.messages.value.map((m) => m.content)).toEqual(["等等", "這個女皇好狠"]);

    c.sendMessage("");
    await waitForStreams(1);
    streams[0].resolve("回覆");
    for (let i = 0; i < 10; i++) await flush();
    expect(c.messages.value.map((m) => m.role)).toEqual(["user", "user", "assistant"]);
  });

  it("在串流視窗按停止：寫到哪留到哪，但生成中翻夠的頁不接著補講", async () => {
    generation.streamingEnabled = true;
    generation.useStreamingWindow = true;
    try {
      const { c, turn } = setup();
      turn(3);
      await waitForStreams(1);
      expect(c.streamInWindow.value).toBe(true);
      turn(3);
      useStreamingWindow().emit("stop");
      for (let i = 0; i < 10; i++) await flush();
      expect(streams).toHaveLength(1);
      expect(c.messages.value.map((m) => m.content)).toEqual(["半截"]);
      expect(c.pageTurnCounter.value).toBe(3);
    } finally {
      delete generation.streamingEnabled;
      delete generation.useStreamingWindow;
      useStreamingWindow().reset();
    }
  });

  it("設定關掉串流視窗時不寫進視窗", async () => {
    const { c, turn } = setup();
    turn(3);
    await waitForStreams(1);
    expect(c.streamInWindow.value).toBe(false);
    expect(useStreamingWindow().windowState.value).toBe("hidden");
    expect(c.openStream()).toBe(false);
    streams[0].resolve("回覆");
  });

  it("自己問的問題回完後，生成中翻夠的頁也會接著講", async () => {
    const { c, turn } = setup();
    c.sendMessage("這段在說什麼？");
    await waitForStreams(1);
    turn(3);
    streams[0].resolve("回答");
    await waitForStreams(2);
    expect(c.pageTurnCounter.value).toBe(0);
  });
});
