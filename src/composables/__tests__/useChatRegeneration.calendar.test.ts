import { describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { useChatRegeneration } from "@/composables/useChatRegeneration";
import type { ChatScreenMessage as Message } from "@/types/chatScreen";

function setup(initial: Message[]) {
  const messages = ref<Message[]>(initial);
  const order: string[] = [];
  const onRoundReplaced = vi.fn(async () => {
    order.push("replaced");
  });
  const triggerAIResponse = vi.fn(async () => {
    order.push("trigger");
  });
  const regen = useChatRegeneration({
    messages,
    isGenerating: computed(() => false),
    lastAIMessage: computed(() => null),
    currentTurnId: ref(""),
    saveChat: vi.fn(),
    deleteMessage: vi.fn(async () => {}),
    triggerAIResponse,
    onRoundReplaced,
  });
  return { messages, regen, onRoundReplaced, order };
}

const card: Message = {
  id: "cal",
  role: "system",
  content: "[行事曆] 已建立事件：一起吃飯（2026-10-24）",
  timestamp: 3,
  turnId: "t1",
  isCalendarEvent: true,
  calendarEventData: { type: "user", title: "一起吃飯", date: "2026-10-24", eventId: "cal_1" },
};

describe("重新生成時收回那一輪加的行程", () => {
  it("同一輪的行事曆卡片一起交出去，而且在重新生成之前", async () => {
    const { regen, onRoundReplaced, order, messages } = setup([
      { id: "u", role: "user", content: "週六吃飯？", timestamp: 1 },
      { id: "a", role: "ai", content: "好", timestamp: 2, turnId: "t1" },
      card,
    ]);

    await regen.handleRegenerate("a");

    const [removed, restored] = onRoundReplaced.mock.calls[0] as unknown as [Message[], Message[]];
    expect(removed.map((m) => m.id)).toEqual(["a", "cal"]);
    expect(restored).toEqual([]);
    expect(order).toEqual(["replaced", "trigger"]);
    expect(messages.value.map((m) => m.id)).toEqual(["u"]);
  });

  it("舊訊息沒有 turnId 時，卡片也算在那一輪裡", async () => {
    const oldCard = { ...card, turnId: undefined };
    const { regen, onRoundReplaced } = setup([
      { id: "u", role: "user", content: "週六吃飯？", timestamp: 1 },
      { id: "a", role: "ai", content: "好", timestamp: 2 },
      oldCard,
    ]);

    await regen.handleRegenerate("a");

    const [removed] = onRoundReplaced.mock.calls[0] as unknown as [Message[]];
    expect(removed.map((m) => m.id)).toContain("cal");
  });
});
