import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultMiniMaxTTSSettings } from "@/api/MiniMaxTTSApi";
import { recordCharAwayCall, wakeCharAwayNow } from "@/services/charAwayRuntime";
import { loadChatById } from "@/storage/chatStorage";
import type { Chat } from "@/types/chat";
import { usePhoneCallStore } from "./phoneCall";

vi.mock("@/api/OpenAICompatible", () => ({}));
vi.mock("@/composables/useStreamingWindow", () => ({
  useStreamingWindow: () => ({
    show: vi.fn(),
    hide: vi.fn(),
    appendToken: vi.fn(),
    setComplete: vi.fn(),
  }),
}));
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
vi.mock("@/services/charAwayRuntime", () => ({
  recordCharAwayCall: vi.fn(async () => {}),
  wakeCharAwayNow: vi.fn(async () => null),
}));
vi.mock("@/stores", () => ({
  useSettingsStore: () => ({
    minimaxTTS: createDefaultMiniMaxTTSSettings(),
    getAPIForTask: () => ({ generation: {} }),
  }),
  useCharactersStore: () => ({ characters: [] }),
  useLorebooksStore: () => ({ lorebooks: [] }),
  usePromptManagerStore: () => ({ config: {} }),
  useAIGenerationStore: () => ({
    startGeneration: vi.fn(),
    setError: vi.fn(),
    appendContent: vi.fn(),
    completeGeneration: vi.fn(),
  }),
}));
vi.mock("@/stores/user", () => ({ useUserStore: () => ({ currentPersona: null }) }));

const info = { chatId: "chat-1", characterId: "char-1", characterName: "小雪" };

function chatWithAway(endedAt?: number, extra: Record<string, unknown> = {}) {
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
      ...extra,
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
    expect(recordCharAwayCall).toHaveBeenCalledWith("chat-1", "小雪", false);

    await vi.advanceTimersByTimeAsync(8000);
    expect(store.callState).toBe("rejected");
    expect(store.rejectReason).toBe("無人接聽");
  });

  it("能看手機的忙碌：響 3 秒就被掛斷", async () => {
    vi.mocked(loadChatById).mockResolvedValue(chatWithAway(undefined, { kind: "busy", checkMinutes: 40 }));
    const store = usePhoneCallStore();

    await store.startVideoCall(info);
    expect(store.callState).toBe("ringing");
    await vi.advanceTimersByTimeAsync(0);
    expect(recordCharAwayCall).toHaveBeenCalledWith("chat-1", "小雪", true);

    await vi.advanceTimersByTimeAsync(3000);
    expect(store.callState).toBe("rejected");
    expect(store.rejectReason).toBe("對方已掛斷");
  });

  it("5 分鐘內再打就是無人接聽", async () => {
    vi.mocked(loadChatById).mockResolvedValue(
      chatWithAway(undefined, { kind: "busy", checkMinutes: 40, lastHangUpAt: Date.now() }),
    );
    const store = usePhoneCallStore();

    await store.startVideoCall(info);
    await vi.advanceTimersByTimeAsync(0);
    expect(recordCharAwayCall).toHaveBeenCalledWith("chat-1", "小雪", false);

    await vi.advanceTimersByTimeAsync(3000);
    expect(store.callState).toBe("ringing");
    await vi.advanceTimersByTimeAsync(5000);
    expect(store.rejectReason).toBe("無人接聽");
  });

  it("走不開的忙碌照舊無人接聽", async () => {
    vi.mocked(loadChatById).mockResolvedValue(chatWithAway(undefined, { kind: "busy" }));
    const store = usePhoneCallStore();

    await store.startVideoCall(info);
    await vi.advanceTimersByTimeAsync(8000);
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

describe("角色睡覺時打電話", () => {
  it("10 分鐘內第 3 通會把他吵醒並接起來，睡覺結束", async () => {
    const now = Date.now();
    vi.mocked(loadChatById).mockResolvedValue(
      chatWithAway(undefined, {
        kind: "sleep",
        reason: "睡覺",
        callAts: [now - 5 * 60_000, now - 2 * 60_000],
      }),
    );
    const store = usePhoneCallStore();

    await store.startCall(info);

    expect(wakeCharAwayNow).toHaveBeenCalledWith("chat-1");
    expect(store.callState).toBe("connected");
    expect(store.callMessages[0]?.content).toContain("吵醒");
    expect(recordCharAwayCall).not.toHaveBeenCalled();
  });

  it("前面只有一通在 10 分鐘內就照常無人接聽", async () => {
    const now = Date.now();
    vi.mocked(loadChatById).mockResolvedValue(
      chatWithAway(undefined, {
        kind: "sleep",
        reason: "睡覺",
        callAts: [now - 11 * 60_000, now - 5 * 60_000],
      }),
    );
    const store = usePhoneCallStore();

    await store.startCall(info);
    await vi.advanceTimersByTimeAsync(0);
    expect(wakeCharAwayNow).not.toHaveBeenCalled();
    expect(recordCharAwayCall).toHaveBeenCalledWith("chat-1", "小雪", false);

    await vi.advanceTimersByTimeAsync(8000);
    expect(store.callState).toBe("rejected");
    expect(store.rejectReason).toBe("無人接聽");
  });

  it("忙碌時連打三通也一樣無人接聽", async () => {
    const now = Date.now();
    vi.mocked(loadChatById).mockResolvedValue(
      chatWithAway(undefined, {
        kind: "busy",
        reason: "開會",
        callAts: [now - 6 * 60_000, now - 4 * 60_000, now - 1 * 60_000],
      }),
    );
    const store = usePhoneCallStore();

    await store.startCall(info);
    await vi.advanceTimersByTimeAsync(0);
    expect(wakeCharAwayNow).not.toHaveBeenCalled();
    expect(recordCharAwayCall).toHaveBeenCalledWith("chat-1", "小雪", false);

    await vi.advanceTimersByTimeAsync(8000);
    expect(store.callState).toBe("rejected");
    expect(store.rejectReason).toBe("無人接聽");
  });
});
