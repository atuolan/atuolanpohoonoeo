import { describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { useChatMessageActions } from "@/composables/useChatMessageActions";
import type { ChatScreenMessage } from "@/types/chatScreen";

function setup(messages: ChatScreenMessage[], chance = 100) {
  const ctx = {
    messages: ref(messages),
    currentChatId: ref("chat-1"),
    chatFaceToFaceMode: ref(false),
    editNoticeChance: ref(chance),
    displayCharacterName: computed(() => "阿玄"),
    userName: ref("小明"),
    effectivePersona: computed(() => null),
    currentCharacter: computed(() => null),
    saveChatImmediate: vi.fn(async () => {}),
  };
  return { ctx, actions: useChatMessageActions(ctx as any) };
}

async function edit(actions: ReturnType<typeof useChatMessageActions>, id: string, content: string) {
  actions.handleMessageEdit(id);
  actions.editingContent.value = content;
  await actions.saveEdit();
}

describe("saveEdit：改字被發現", () => {
  it("被發現後再編輯一次：仍然算被發現、原文還是第一次的", async () => {
    const { ctx, actions } = setup([
      { id: "a", role: "ai", content: "你會親我嗎", timestamp: 1 } as ChatScreenMessage,
      { id: "u", role: "user", content: "該親的時候會清", timestamp: 2 } as ChatScreenMessage,
    ]);
    await edit(actions, "u", "該親的時候會親");
    const msg = ctx.messages.value[1];
    expect(msg.editNoticed).toBe(true);
    await edit(actions, "u", "該親的時候就會親");
    expect(msg.content).toBe("該親的時候就會親");
    expect(msg.editNoticed).toBe(true);
    expect(msg.editOriginalContent).toBe("該親的時候會清");
  });
});
