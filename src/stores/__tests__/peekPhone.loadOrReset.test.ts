import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { StoredCharacter } from "@/types/character";
import type { Chat } from "@/types/chat";

// 生成中的請求：測試裡手動控制什麼時候結束，並記下它收到的 AbortSignal
const { pending } = vi.hoisted(() => ({
  pending: [] as { signal: AbortSignal }[],
}));

vi.mock("@/db/database", () => ({
  DB_STORES: { PEEK_PHONE_DATA: "peekPhoneData" },
  db: {
    init: vi.fn(async () => {}),
    get: vi.fn(async () => undefined),
    put: vi.fn(async () => ""),
    delete: vi.fn(async () => {}),
  },
}));

vi.mock("@/services/PeekPhoneService", () => ({
  extractChatContext: vi.fn(async () => ""),
  extractSummariesAndEvents: vi.fn(async () => ""),
  generateContactReply: vi.fn(),
  generateSinglePhase: vi.fn(),
  generateSequential: vi.fn(
    (..._args: unknown[]) =>
      new Promise((_resolve, reject) => {
        const signal = _args[2] as AbortSignal;
        pending.push({ signal });
        signal.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      }),
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

describe("peekPhone store：loadOrReset 遇到背景生成", () => {
  beforeEach(() => {
    pending.length = 0;
    setActivePinia(createPinia());
  });

  it("回到同一支還在生成的手機：保留進度，不重置、不中止", async () => {
    const store = usePeekPhoneStore();
    void store.generateAll("c1", "chat-1", character, chat);
    await vi.waitFor(() => expect(pending).toHaveLength(1));

    const hasData = await store.loadOrReset("c1", "chat-1");

    expect(hasData).toBe(true);
    expect(store.groupStatus.A).toBe("loading");
    expect(store.data).not.toBeNull();
    expect(pending[0].signal.aborted).toBe(false);
  });

  it("換到另一支手機：中止上一支的生成，這一支從空的開始", async () => {
    const store = usePeekPhoneStore();
    void store.generateAll("c1", "chat-1", character, chat);
    await vi.waitFor(() => expect(pending).toHaveLength(1));

    const hasData = await store.loadOrReset("c2", "chat-2");

    expect(pending[0].signal.aborted).toBe(true);
    expect(hasData).toBe(false);
    expect(store.data).toBeNull();
    expect(store.groupStatus).toEqual({ A: "idle", B: "idle", C: "idle", D: "idle" });
  });
});
