import { describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { useChatRegeneration } from "@/composables/useChatRegeneration";
import type { ChatScreenMessage as Message } from "@/types/chatScreen";

function setup(initial: Message[]) {
  const messages = ref<Message[]>(initial);
  const currentTurnId = ref("");
  const regen = useChatRegeneration({
    messages,
    isGenerating: computed(() => false),
    lastAIMessage: computed(() => null),
    currentTurnId,
    saveChat: vi.fn(),
    deleteMessage: vi.fn(async () => {}),
    triggerAIResponse: vi.fn(async () => {
      // 模擬新的一輪回覆：一則角色訊息＋最後一則飲食通知
      messages.value.push(
        { id: "a2", role: "ai", content: "換個說法", timestamp: 5, turnId: currentTurnId.value },
        {
          id: "food2",
          role: "ai",
          content: "已記錄:10/29,拉麵",
          timestamp: 6,
          turnId: currentTurnId.value,
          isSystemNotification: true,
          isFoodRecord: true,
        },
      );
    }),
  });
  return { messages, regen, currentTurnId };
}

describe("整輪翻頁鈕掛在角色泡泡上", () => {
  it("這一輪最後是飲食通知時，翻頁資料掛在前面那則角色訊息", async () => {
    const { messages, regen, currentTurnId } = setup([
      { id: "u", role: "user", content: "吃什麼", timestamp: 1 },
      { id: "a1", role: "ai", content: "拉麵", timestamp: 2, turnId: "t1" },
      {
        id: "food1",
        role: "ai",
        content: "已記錄:10/29,拉麵",
        timestamp: 3,
        turnId: "t1",
        isSystemNotification: true,
        isFoodRecord: true,
      },
    ]);

    await regen.handleRegenerate("a1");
    regen.attachPendingRoundSwipes(currentTurnId.value);

    const a2 = messages.value.find((m) => m.id === "a2")!;
    const food2 = messages.value.find((m) => m.id === "food2")!;
    expect(a2.roundSwipes).toHaveLength(2);
    expect(a2.roundSwipeId).toBe(1);
    expect(food2.roundSwipes).toBeUndefined();

    // 翻回上一版：翻頁資料一樣掛在角色訊息，不是飲食通知
    regen.handleRoundSwipe("a2", "prev");
    const a1 = messages.value.find((m) => m.id === "a1")!;
    const food1 = messages.value.find((m) => m.id === "food1")!;
    expect(a1.roundSwipes).toHaveLength(2);
    expect(a1.roundSwipeId).toBe(0);
    expect(food1.roundSwipes).toBeUndefined();
  });
});
