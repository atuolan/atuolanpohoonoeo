import { describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { useChatRegeneration } from "@/composables/useChatRegeneration";
import type { ChatScreenMessage as Message } from "@/types/chatScreen";

/**
 * 小劇場重 roll 後換回別的版本，小劇場指令（system「小劇場：…」）不能被一起換掉；
 * 否則再重 roll 時 AI 看不到小劇場，就會接著正文寫下去。
 */
function setup(initial: Message[], replies: Array<(turnId: string) => Message[]>) {
  const messages = ref<Message[]>(initial);
  const currentTurnId = ref("");
  const deleteMessage = vi.fn(async (_id: string) => {});
  const onRoundReplaced = vi.fn(async (_removed: Message[], _restored: Message[]) => {});
  let call = 0;
  const triggerAIResponse = vi.fn(async (_opts?: unknown) => {
    const next = replies[call++];
    if (next) messages.value.push(...next(currentTurnId.value));
  });
  const regen = useChatRegeneration({
    messages,
    isGenerating: computed(() => false),
    lastAIMessage: computed(() => null),
    currentTurnId,
    saveChat: vi.fn(),
    deleteMessage,
    triggerAIResponse,
    onRoundReplaced,
  });
  return { messages, regen, currentTurnId, deleteMessage, triggerAIResponse, onRoundReplaced };
}

const theaterStart: Message = {
  id: "theater",
  role: "system",
  content: "小劇場：兩人在西餐廳假扮情侶",
  timestamp: 3,
};

describe("小劇場重新生成", () => {
  it("重 roll 失敗後翻回上一版，小劇場指令還在", async () => {
    const { messages, regen, currentTurnId, deleteMessage } = setup(
      [
        { id: "u", role: "user", content: "正文", timestamp: 1 },
        { id: "a-main", role: "ai", content: "正文回覆", timestamp: 2, turnId: "t-main" },
        theaterStart,
        { id: "a-theater", role: "ai", content: "小劇場正文", timestamp: 4, turnId: "t-theater" },
      ],
      [
        (turnId) => [
          { id: "err", role: "ai", content: "[錯誤] API error: 502", timestamp: 5, turnId },
        ],
      ],
    );
    currentTurnId.value = "t-theater";

    await regen.handleRegenerate("a-theater");
    regen.attachPendingRoundSwipes(currentTurnId.value);
    expect(messages.value.map((m) => m.id)).toEqual(["u", "a-main", "theater", "err"]);

    // 錯誤那版上按 ≪ 翻回原本的小劇場
    regen.handleRoundSwipe("err", "prev");

    expect(messages.value.map((m) => m.id)).toEqual(["u", "a-main", "theater", "a-theater"]);
    expect(deleteMessage).not.toHaveBeenCalledWith("theater");
    expect(deleteMessage).not.toHaveBeenCalledWith("a-main");
  });

  it("另開新檔的小劇場（前面沒有用戶訊息）翻頁也不會吃掉轉發卡片和小劇場指令", async () => {
    const forward: Message = {
      id: "forward",
      role: "system",
      content: "",
      timestamp: 1,
      isGroupChatHistory: true,
    };
    const { messages, regen, currentTurnId, deleteMessage } = setup(
      [forward, { ...theaterStart, timestamp: 2 }, { id: "a1", role: "ai", content: "小劇場", timestamp: 3, turnId: "t1" }],
      [(turnId) => [{ id: "a2", role: "ai", content: "", timestamp: 4, turnId }]],
    );
    currentTurnId.value = "t1";

    await regen.handleRegenerate("a1");
    regen.attachPendingRoundSwipes(currentTurnId.value);
    regen.handleRoundSwipe("a2", "prev");

    expect(messages.value.map((m) => m.id)).toEqual(["forward", "theater", "a1"]);
    expect(deleteMessage).not.toHaveBeenCalledWith("theater");
    expect(deleteMessage).not.toHaveBeenCalledWith("forward");
  });

  it("翻頁交給 onRoundReplaced 的只有這一輪的訊息", async () => {
    const { regen, currentTurnId, onRoundReplaced } = setup(
      [
        { id: "u", role: "user", content: "正文", timestamp: 1 },
        theaterStart,
        { id: "a1", role: "ai", content: "小劇場", timestamp: 4, turnId: "t1" },
      ],
      [(turnId) => [{ id: "a2", role: "ai", content: "再來", timestamp: 5, turnId }]],
    );
    currentTurnId.value = "t1";

    await regen.handleRegenerate("a1");
    regen.attachPendingRoundSwipes(currentTurnId.value);
    onRoundReplaced.mockClear();
    regen.handleRoundSwipe("a2", "prev");

    const [removed, restored] = onRoundReplaced.mock.calls[0];
    expect(removed.map((m) => m.id)).toEqual(["a2"]);
    expect(restored.map((m) => m.id)).toEqual(["a1"]);
  });

  it("重 roll 小劇場那一輪時帶上小劇場的生成選項", async () => {
    const { regen, currentTurnId, triggerAIResponse } = setup(
      [
        { id: "u", role: "user", content: "正文", timestamp: 1 },
        { ...theaterStart, theaterPhoneScript: true },
        { id: "a1", role: "ai", content: "小劇場", timestamp: 4, turnId: "t1" },
      ],
      [(turnId) => [{ id: "a2", role: "ai", content: "再來", timestamp: 5, turnId }]],
    );
    currentTurnId.value = "t1";

    await regen.handleRegenerate("a1");

    expect(triggerAIResponse).toHaveBeenCalledWith({
      skipAutoTrigger: true,
      theaterNudge: true,
      theaterPhoneScript: true,
    });
  });

  it("一般回合重 roll 不帶小劇場選項", async () => {
    const { regen, currentTurnId, triggerAIResponse } = setup(
      [
        theaterStart,
        { id: "a0", role: "ai", content: "小劇場", timestamp: 4, turnId: "t0" },
        { id: "u", role: "user", content: "回到正文", timestamp: 5 },
        { id: "a1", role: "ai", content: "正文", timestamp: 6, turnId: "t1" },
      ],
      [(turnId) => [{ id: "a2", role: "ai", content: "再來", timestamp: 7, turnId }]],
    );
    currentTurnId.value = "t1";

    await regen.handleRegenerate("a1");

    expect(triggerAIResponse).toHaveBeenCalledWith({ skipAutoTrigger: true });
  });
});
