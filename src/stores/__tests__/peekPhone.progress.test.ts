import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { StoredCharacter } from "@/types/character";
import type { Chat } from "@/types/chat";
import type { PeekPhoneData } from "@/types/peekPhone";

// 生成中的請求：測試裡手動決定什麼時候完成
const { pending, puts } = vi.hoisted(() => ({
  pending: [] as { resolve: (data: unknown) => void }[],
  puts: [] as { data: PeekPhoneData }[],
}));

vi.mock("@/db/database", () => ({
  DB_STORES: { PEEK_PHONE_DATA: "peekPhoneData" },
  db: {
    init: vi.fn(async () => {}),
    get: vi.fn(async () => undefined),
    put: vi.fn(async (_store: string, value: { data: PeekPhoneData }) => {
      puts.push(JSON.parse(JSON.stringify(value)));
      return "";
    }),
    delete: vi.fn(async () => {}),
  },
}));

vi.mock("@/services/PeekPhoneService", () => ({
  extractChatContext: vi.fn(async () => ""),
  extractSummariesAndEvents: vi.fn(async () => ""),
  generateContactReply: vi.fn(async () => "好啊"),
  generateSinglePhase: vi.fn(async () => ({ chats: [], lockScreen: { passcode: "1234", hint: "", reveal: "" } })),
  generateSequential: vi.fn(
    () => new Promise((resolve) => pending.push({ resolve })),
  ),
}));

vi.mock("@/composables/useStreamingWindow", () => ({ useStreamingWindow: vi.fn() }));
vi.mock("@/stores/settings", () => ({
  useSettingsStore: () => ({
    getAPIForTask: () => ({ api: {}, generation: { streamingEnabled: false } }),
  }),
}));
vi.mock("@/stores/user", () => ({
  useUserStore: () => ({ resolvePersonaForChat: () => null, personas: [], currentName: "", currentDescription: "" }),
}));
vi.mock("@/stores/lorebooks", () => ({ useLorebooksStore: () => ({}) }));
vi.mock("@/stores/notification", () => ({ useNotificationStore: () => ({ addNotification: vi.fn() }) }));

import { usePeekPhoneStore } from "@/stores/peekPhone";

const character = { id: "c1", data: { name: "沈既白" } } as unknown as StoredCharacter;
const chat = { id: "chat-1", characterId: "c1", messages: [] } as unknown as Chat;

function phoneData(): PeekPhoneData {
  return {
    characterId: "c1",
    chats: [
      {
        id: "t1",
        contactName: "栩",
        updatedAt: 1,
        draft: "其實那天我不是剛好路過。",
        draftHistory: ["那天"],
        messages: [{ id: "m1", senderName: "栩", content: "你睡了嗎", isSelf: false, timestamp: 1 }],
      },
    ],
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
    lockScreen: { passcode: "0912", hint: "初遇", reveal: "初遇那天" },
  };
}

/** 讓 store 處在「已經生成好」的狀態 */
async function readyStore() {
  const store = usePeekPhoneStore();
  void store.generateAll("c1", "chat-1", character, chat);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  pending[0].resolve(phoneData());
  // 生成完會存一次檔，等它寫完再開始算
  await vi.waitFor(() => expect(puts).toHaveLength(1));
  puts.length = 0;
  return store;
}

describe("peekPhone store：偷看進度", () => {
  beforeEach(() => {
    pending.length = 0;
    puts.length = 0;
    setActivePinia(createPinia());
  });

  it("生成好之後找到秘密、看過 App、解鎖都會存檔；重複的不會再存", async () => {
    const store = await readyStore();

    store.markRevealed("recalled:m1");
    store.markRevealed("recalled:m1");
    store.markViewed("chat");
    store.setUnlocked(true);

    expect(store.data?.progress).toEqual({ unlocked: true, revealed: ["recalled:m1"], viewed: ["chat"] });
    await vi.waitFor(() => expect(puts).toHaveLength(3));
    // 重複找到同一個秘密不會多存一次
    await new Promise((r) => setTimeout(r, 20));
    expect(puts).toHaveLength(3);
    expect(puts[2].data.progress).toEqual({ unlocked: true, revealed: ["recalled:m1"], viewed: ["chat"] });
  });

  it("生成中解鎖：先只記在記憶體，生成完連同結果一起存", async () => {
    const store = usePeekPhoneStore();
    void store.generateAll("c1", "chat-1", character, chat);
    await vi.waitFor(() => expect(pending).toHaveLength(1));

    store.setUnlocked(true);
    store.markRevealed("lock:0912");
    expect(puts).toHaveLength(0);

    pending[0].resolve(phoneData());
    await vi.waitFor(() => expect(puts).toHaveLength(1));
    expect(store.data?.progress).toEqual({ unlocked: true, revealed: ["lock:0912"], viewed: [] });
    expect(puts[0].data.progress?.revealed).toEqual(["lock:0912"]);
    expect(puts[0].data.lockScreen?.passcode).toBe("0912");
  });

  it("重新生成聊天會換一組密碼：要重新解鎖，找過的秘密留著", async () => {
    const store = await readyStore();
    store.setUnlocked(true);
    store.markRevealed("hidden");

    await store.regeneratePhase("A", character, chat);

    expect(store.data?.lockScreen?.passcode).toBe("1234");
    expect(store.data?.progress).toEqual({ unlocked: false, revealed: ["hidden"], viewed: [] });
  });

  it("把輸入框裡的草稿原封不動送出：草稿就不在了", async () => {
    const store = await readyStore();

    await store.sendMessageToContact("t1", "其實那天我不是剛好路過。", character);

    const thread = store.data!.chats[0];
    expect(thread.draft).toBeUndefined();
    expect(thread.draftHistory).toBeUndefined();
    expect(thread.messages.map((m) => m.content)).toEqual(["你睡了嗎", "其實那天我不是剛好路過。", "好啊"]);
  });

  it("送出別的話：草稿還在", async () => {
    const store = await readyStore();

    await store.sendMessageToContact("t1", "還沒", character);

    expect(store.data!.chats[0].draft).toBe("其實那天我不是剛好路過。");
  });
});
