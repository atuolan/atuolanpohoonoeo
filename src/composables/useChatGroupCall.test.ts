import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";

const streamEvents = vi.hoisted(() => ({ current: [] as any[] }));
const builtOptions = vi.hoisted(() => ({ current: null as any }));
const generation = vi.hoisted(() => ({ active: false }));

vi.mock("@/api/OpenAICompatible", () => ({
  OpenAICompatibleClient: class {
    async *generateStream() {
      for (const event of streamEvents.current) yield event;
    }
  },
}));

vi.mock("@/engine/prompt/PromptBuilder", () => ({
  PromptBuilder: class {
    constructor(options: any) {
      builtOptions.current = options;
    }
    async build() {
      return { messages: [{ role: "user", content: "prompt" }] };
    }
  },
}));

vi.mock("@/stores", () => ({
  useAIGenerationStore: () => ({
    startGeneration: () => {
      if (generation.active) return { success: false, error: "busy" };
      generation.active = true;
      return { success: true };
    },
    completeGeneration: () => {
      generation.active = false;
    },
  }),
  useSettingsStore: () => ({
    generation: { temperature: 1, topP: 1 },
    getAPIForTask: () => ({ api: {} }),
  }),
  usePromptManagerStore: () => ({ loadConfig: async () => {}, config: {} }),
  useCharactersStore: () => ({
    characters: [
      { id: "a", data: { name: "小A" } },
      { id: "b", data: { name: "小B" } },
    ],
  }),
  useLorebooksStore: () => ({ lorebooks: [] }),
}));

vi.mock("@/stores/chatVariables", () => ({
  useChatVariablesStore: () => ({ presetForChat: () => ({}) }),
}));

vi.mock("@/stores/user", () => ({
  useUserStore: () => ({ currentPersona: { name: "我" } }),
}));

vi.mock("@/utils/groupMembers", () => ({
  getGroupMemberAvatarUrl: () => "",
  getGroupMemberDisplayName: (m: any) => (m.characterId === "a" ? "小A" : "小B"),
  toPromptGroupMember: (m: any) => m,
  withLiveSubCharSnapshot: (m: any) => m,
}));

import { useChatGroupCall } from "./useChatGroupCall";

function setup() {
  const messages = ref<any[]>([
    { id: "m1", role: "user", content: "週末去哪玩？", timestamp: 1 },
    { id: "m2", role: "ai", content: "去海邊！", timestamp: 2, senderCharacterName: "小A" },
  ]);
  const call = useChatGroupCall({
    messages,
    currentChatId: ref("chat-1"),
    currentChatData: ref({ id: "chat-1", groupMetadata: {} }),
    isGroupChat: computed(() => true),
    isGenerating: computed(() => generation.active),
    groupMetadata: computed(() => ({
      groupName: "好友群",
      members: [{ characterId: "a" }, { characterId: "b" }],
    })),
    effectivePersona: computed(() => null),
    chatEnableRealTimeAwareness: ref(false),
    characterName: "群組",
    characterAvatar: "",
    scrollToBottom: () => {},
    saveChatImmediate: async () => {},
    applyAIOutputRegex: (content) => content,
    getGroupMemberIdByName: (name) => ({ 小A: "a", 小B: "b" })[name],
  });
  return call;
}

const voices = (call: ReturnType<typeof setup>) =>
  call.groupCallMessages.value.filter((m) => m.type === "voice").map((m) => `${m.senderName}:${m.content}`);

async function flush() {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

describe("useChatGroupCall", () => {
  beforeEach(() => {
    generation.active = false;
    builtOptions.current = null;
  });

  it("keeps responding on every round after the call starts", async () => {
    const call = setup();
    streamEvents.current = [{ type: "done", content: '<msg name="小A">喂喂？</msg>' }];
    call.startGroupCall();
    await flush();
    expect(voices(call)).toEqual(["小A:喂喂？"]);

    streamEvents.current = [{ type: "done", content: '<msg name="小B">我在！</msg><msg name="小A">那就說定了</msg>' }];
    await call.handleGroupCallSendMessage("大家都在嗎");
    streamEvents.current = [{ type: "done", content: '<msg name="小A">好啊</msg>' }];
    await call.handleGroupCallSendMessage("那週六見");
    expect(voices(call)).toEqual(["小A:喂喂？", "小B:我在！", "小A:那就說定了", "小A:好啊"]);
  });

  it("puts pre-call chat and the call state at the end of the prompt history", async () => {
    const call = setup();
    streamEvents.current = [{ type: "done", content: '<msg name="小A">嗨</msg>' }];
    call.startGroupCall();
    await flush();
    await call.handleGroupCallSendMessage("繼續說海邊");

    const history = builtOptions.current.messages;
    expect(history[0].content).toBe("週末去哪玩？");
    expect(history.some((m: any) => m.content === "繼續說海邊" && m.is_user)).toBe(true);
    const last = history[history.length - 1];
    expect(last.sender).toBe("system");
    expect(last.content).toContain("群通話進行中");
  });

  it("shows stream errors instead of silently doing nothing", async () => {
    const call = setup();
    streamEvents.current = [{ type: "error", error: "429 rate limited" }];
    await call.handleGroupCallSendMessage("哈囉");
    const msgs = call.groupCallMessages.value;
    const last = msgs[msgs.length - 1];
    expect(last.type).toBe("system");
    expect(last.content).toContain("429 rate limited");
  });

  it("treats call-response joins and stickers as call activity", async () => {
    const call = setup();
    call.groupCallParticipants.value = [];
    streamEvents.current = [
      {
        type: "done",
        content: '<call-response name="小B" action="join"/><msg name="小A" type="sticker" meaning="開心"/><msg name="小B"><join-call/></msg>',
      },
    ];
    await call.handleGroupCallSendMessage("來聊天");
    expect(call.groupCallParticipants.value.map((p) => p.name)).toEqual(["小B", "小A"]);
    expect(voices(call)).toEqual(["小A:[表情：開心]"]);
  });
});
