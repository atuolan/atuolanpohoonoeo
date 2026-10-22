import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultMiniMaxTTSSettings } from "@/api/MiniMaxTTSApi";
import { recordCharAwayCall } from "@/services/charAwayRuntime";
import { loadChatById } from "@/storage/chatStorage";
import type { Chat } from "@/types/chat";
import { usePhoneCallStore } from "./phoneCall";

vi.mock("@/api/OpenAICompatible", () => ({}));
vi.mock("@/composables/useStreamingWindow", () => ({}));
vi.mock("@/db/database", () => ({}));
vi.mock("@/engine/prompt/PromptBuilder", () => ({}));
vi.mock("@/services/ResponseParser", () => ({}));
vi.mock("@/storage/chatStorage", () => ({
  loadChatById: vi.fn(),
  refreshChatDerivedMetadata: vi.fn(),
}));
vi.mock("@/storage/chatMessageStorage", () => ({ appendMessages: vi.fn() }));
vi.mock("@/services/IncomingCallScheduler", () => ({
  getIncomingCallScheduler: () => ({ recordCallEnded: vi.fn() }),
}));
vi.mock("@/services/charAwayRuntime", () => ({ recordCharAwayCall: vi.fn(async () => {}) }));
vi.mock("@/stores", () => ({ useSettingsStore: () => ({ minimaxTTS: createDefaultMiniMaxTTSSettings() }) }));
vi.mock("@/stores/user", () => ({ useUserStore: () => ({ currentPersona: null }) }));

const info = { chatId: "chat-1", characterId: "char-1", characterName: "小雪" };

function chatWithAway(endedAt?: number) {
  return {
    id: "chat-1",
    charAway: {
      id: "away_1",
      reason: "開會",
      backText: "我回來了",
      startedAt: Date.now(),
      returnAt: Date.now() + 30 * 60 * 1000,
      urgeCount: 0,
      callCount: 0,
      endedAt,
      updatedAt: Date.now(),
    },
  } as unknown as Chat;
}

beforeEach(() => {
  vi.useFakeTimers();
  setActivePinia(createPinia());
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal(
    "Audio",
    class {
      play() {
        return Promise.resolve();
      }
      pause() {}
      removeAttribute() {}
    },
  );
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("角色暫時離開時打電話", () => {
  it("視訊不會接通：響 8 秒後無人接聽，記一通未接通", async () => {
    vi.mocked(loadChatById).mockResolvedValue(chatWithAway());
    const store = usePhoneCallStore();

    await store.startVideoCall(info);
    expect(store.callState).toBe("ringing");
    await vi.advanceTimersByTimeAsync(0);
    expect(recordCharAwayCall).toHaveBeenCalledWith("chat-1", "小雪");

    await vi.advanceTimersByTimeAsync(8000);
    expect(store.callState).toBe("rejected");
    expect(store.rejectReason).toBe("無人接聽");
  });

  it("他已經回來了就照常接通", async () => {
    vi.mocked(loadChatById).mockResolvedValue(chatWithAway(Date.now()));
    const store = usePhoneCallStore();

    await store.startVideoCall(info);
    expect(store.callState).toBe("connected");
    expect(recordCharAwayCall).not.toHaveBeenCalled();
  });

  it("他打來的電話不受影響", async () => {
    vi.mocked(loadChatById).mockResolvedValue(chatWithAway());
    const store = usePhoneCallStore();

    await store.startVideoCall({ ...info, isIncoming: true });
    expect(store.callState).toBe("connected");
    expect(recordCharAwayCall).not.toHaveBeenCalled();
  });
});
