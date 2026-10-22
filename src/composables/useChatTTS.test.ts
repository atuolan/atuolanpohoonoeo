import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { synthesizeSpeech } from "@/api/MiniMaxTTSApi";
import { useChatTTS } from "./useChatTTS";

vi.mock("@/api/MiniMaxTTSApi", () => ({
  synthesizeSpeech: vi.fn(),
}));

const aiMessage = {
  id: "ai-1",
  role: "ai" as const,
  content: "沒有標記的句子",
  timestamp: Date.now(),
};

function createContext(messages = [aiMessage]) {
  return {
    messages: ref(messages),
    chatMinimaxTTSEnabled: ref(true),
    showChatSettingsMenu: ref(false),
    settingsStore: {
      minimaxTTS: {
        apiKey: "key",
        voiceId: "voice",
        speed: 1,
        volume: 1,
        pitch: 0,
        model: "speech-2.8-hd",
        format: "mp3",
        sampleRate: 32000,
        languageBoost: "",
        timberWeights: [],
        timberWeightsEnabled: false,
      },
    },
    saveChat: vi.fn().mockResolvedValue(undefined),
  };
}

describe("useChatTTS manual regeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
  });

  it("blocks manual regeneration when chat TTS is disabled", async () => {
    const context = createContext();
    context.chatMinimaxTTSEnabled.value = false;
    const { regenerateMessageTTS } = useChatTTS(context);

    await expect(regenerateMessageTTS(aiMessage.id)).resolves.toEqual({
      success: false,
      reason: "disabled",
    });
    expect(synthesizeSpeech).not.toHaveBeenCalled();
  });

  it("uses content when an AI message has no previous TTS source", async () => {
    vi.mocked(synthesizeSpeech).mockResolvedValue({
      success: true,
      audioUrl: "data:audio/mp3;base64,new",
    });
    const context = createContext();
    const { regenerateMessageTTS } = useChatTTS(context);

    await expect(regenerateMessageTTS(aiMessage.id)).resolves.toEqual({
      success: true,
    });
    expect(synthesizeSpeech).toHaveBeenCalledWith(
      "没有标记的句子",
      expect.anything(),
      expect.anything(),
    );
  });

  it("does not send stale extra words from a previous raw TTS source", async () => {
    vi.mocked(synthesizeSpeech).mockResolvedValue({
      success: true,
      audioUrl: "data:audio/mp3;base64,new",
    });
    const message = {
      ...aiMessage,
      content: "目前氣泡內容",
      ttsRawContent: "目前氣泡內容，聽懂了嗎？",
    };
    const context = createContext([message]);
    const { regenerateMessageTTS } = useChatTTS(context);

    await expect(regenerateMessageTTS(message.id)).resolves.toEqual({
      success: true,
    });
    expect(synthesizeSpeech).toHaveBeenCalledWith(
      "目前气泡内容",
      expect.anything(),
      expect.anything(),
    );
  });

  it("removes the audio bubble prefix without dropping raw tone tags", async () => {
    vi.mocked(synthesizeSpeech).mockResolvedValue({
      success: true,
      audioUrl: "data:audio/mp3;base64,new",
    });
    const message = {
      ...aiMessage,
      content: "[語音訊息] 你好",
      ttsRawContent: "你好(laughs)",
    };
    const context = createContext([message]);
    const { regenerateMessageTTS } = useChatTTS(context);

    await expect(regenerateMessageTTS(message.id)).resolves.toEqual({
      success: true,
    });
    expect(synthesizeSpeech).toHaveBeenCalledWith(
      "你好(laughs)",
      expect.anything(),
      expect.anything(),
    );
  });

  it("removes HTML and Chinese translation when regeneration selects foreign", async () => {
    vi.mocked(synthesizeSpeech).mockResolvedValue({
      success: true,
      audioUrl: "data:audio/mp3;base64,new",
    });
    const message = {
      ...aiMessage,
      content: "How are you?<br>你最近好嗎？",
    };
    const context = createContext([message]);
    const { regenerateMessageTTS } = useChatTTS(context);

    await expect(regenerateMessageTTS(message.id, "foreign")).resolves.toEqual({
      success: true,
    });
    expect(synthesizeSpeech).toHaveBeenCalledWith(
      "How are you?",
      expect.anything(),
      expect.anything(),
    );
  });

  it("restores the previous audio when regeneration fails", async () => {
    const message = {
      ...aiMessage,
      ttsRawContent: "舊原文",
      ttsAudioUrl: "data:audio/mp3;base64,old",
      ttsSegments: [
        {
          emotion: "neutral",
          speed: 1,
          text: "舊原文",
          clean: "舊原文",
          audioUrl: "data:audio/mp3;base64,old",
        },
      ],
    };
    vi.mocked(synthesizeSpeech).mockResolvedValue({
      success: false,
      error: "failed",
    });
    const context = createContext([message]);
    const { regenerateMessageTTS } = useChatTTS(context);

    await expect(regenerateMessageTTS(message.id)).resolves.toEqual({
      success: false,
      reason: "synthesis-failed",
    });
    expect(message.ttsAudioUrl).toBe("data:audio/mp3;base64,old");
    expect(message.ttsSegments?.[0].audioUrl).toBe(
      "data:audio/mp3;base64,old",
    );
  });

  it.each([
    [undefined, "Chinese", "时间"],
    ["Japanese", "Japanese", "時間"],
    ["auto", "auto", "时间"],
    ["", "", "时间"],
  ])("applies the per-chat language override %s during regeneration", async (override, expected, text) => {
    vi.mocked(synthesizeSpeech).mockResolvedValue({ success: false, error: "test" });
    const context = createContext([{ ...aiMessage, content: "時間" }]);
    context.settingsStore.minimaxTTS.languageBoost = "Chinese";
    const tts = useChatTTS(context);
    tts.chatMinimaxTTSOverride.value = { languageBoost: override };

    await tts.regenerateMessageTTS(aiMessage.id, "all");

    expect(synthesizeSpeech).toHaveBeenCalledWith(
      text, expect.objectContaining({ languageBoost: expected }), expect.anything(),
    );
    expect(context.settingsStore.minimaxTTS.languageBoost).toBe("Chinese");
  });

  it("uses the override for automatic speech without leaking to another chat or reset", async () => {
    vi.mocked(synthesizeSpeech).mockResolvedValue({ success: false, error: "test" });
    const context = createContext();
    context.settingsStore.minimaxTTS.languageBoost = "Chinese";
    const first = useChatTTS(context);
    const second = useChatTTS({ ...context, messages: ref([{ ...aiMessage }]) });
    first.chatMinimaxTTSOverride.value = { languageBoost: "Japanese" };

    await first.processMessageTTS(aiMessage.id, "時間[emotion=happy]");
    await second.processMessageTTS(aiMessage.id, "時間[emotion=happy]");
    first.chatMinimaxTTSOverride.value = {};
    await first.processMessageTTS(aiMessage.id, "時間[emotion=happy]");

    expect(vi.mocked(synthesizeSpeech).mock.calls.map(([text, settings]) => [text, settings.languageBoost]))
      .toEqual([["時間", "Japanese"], ["时间", "Chinese"], ["时间", "Chinese"]]);
    expect(context.settingsStore.minimaxTTS.languageBoost).toBe("Chinese");
  });

  it("聊天的語速是基準，AI 標的 speed 是相對值", async () => {
    vi.mocked(synthesizeSpeech).mockResolvedValue({ success: false, error: "test" });
    const context = createContext();
    const { chatMinimaxTTSOverride, processMessageTTS } = useChatTTS(context);
    chatMinimaxTTSOverride.value = { speed: 0.8 };

    await processMessageTTS(aiMessage.id, "「你好[emotion=happy]」「再見[emotion=sad;speed=1.5]」");

    const speeds = vi.mocked(synthesizeSpeech).mock.calls.map(([, s]) => s.speed);
    expect(speeds[0]).toBe(0.8);
    expect(speeds[1]).toBeCloseTo(1.2);
  });

  it("群聊成員有自己的音色就用它，沒有的用群組音色", async () => {
    vi.mocked(synthesizeSpeech).mockResolvedValue({ success: false, error: "test" });
    const messages = [
      { ...aiMessage, id: "ai-a", senderCharacterId: "char-a" },
      { ...aiMessage, id: "ai-b", senderCharacterId: "char-b" },
      { ...aiMessage, id: "ai-c", senderCharacterId: "char-c" },
    ];
    const context = createContext(messages);
    Object.assign(context.settingsStore.minimaxTTS, {
      timberWeightsEnabled: true,
      timberWeights: [{ voiceId: "female-yujie", weight: 50 }],
    });
    const { chatMinimaxTTSOverride, processMessageTTS } = useChatTTS(context);
    chatMinimaxTTSOverride.value = { memberVoices: { "char-a": "voice-a", "char-b": " " } };

    for (const m of messages) await processMessageTTS(m.id, "你好[emotion=happy]");
    chatMinimaxTTSOverride.value.voiceId = "group-voice";
    await processMessageTTS("ai-b", "你好[emotion=happy]");

    expect(vi.mocked(synthesizeSpeech).mock.calls.map(([, s]) => [s.voiceId, s.timberWeightsEnabled]))
      .toEqual([
        ["voice-a", false],
        ["voice", true],
        ["voice", true],
        ["group-voice", false],
      ]);
  });

  it("多人卡面對面：每句台詞照標的說話者用成員音色，對不上的用群組音色", async () => {
    vi.mocked(synthesizeSpeech).mockResolvedValue({ success: false, error: "test" });
    const context = {
      ...createContext(),
      resolveSpeakerId: (name: string) => ({ 阿晴: "m-a", 小澈: "m-b", 路人: "m-c" })[name],
    };
    const { chatMinimaxTTSOverride, processMessageTTS } = useChatTTS(context);
    chatMinimaxTTSOverride.value = { voiceId: "group-voice", memberVoices: { "m-a": "voice-a", "m-b": "voice-b" } };

    await processMessageTTS(
      aiMessage.id,
      "「走啦[emotion=happy;speaker=阿晴]」「嗯[emotion=calm;speaker=小澈]」「喂[emotion=angry;speaker=路人]」「好[emotion=sad;speaker=不認識]」「哦[emotion=calm]」",
    );

    expect(vi.mocked(synthesizeSpeech).mock.calls.map(([text, s]) => [text, s.voiceId, s.timberWeightsEnabled]))
      .toEqual([
        ["走啦", "voice-a", false],
        ["嗯", "voice-b", false],
        ["喂", "group-voice", false],
        ["好", "group-voice", false],
        ["哦", "group-voice", false],
      ]);
  });

  it("雙語訊息的情緒標記在翻譯那行：自動合成和重新生成都念原文、帶情緒", async () => {
    vi.mocked(synthesizeSpeech).mockResolvedValue({ success: false, error: "test" });
    const content = "How are you?<br>你最近好嗎？[emotion=happy]";
    const message: typeof aiMessage & { ttsRawContent?: string } = { ...aiMessage, content };
    const context = createContext([message]);
    const { processMessageTTS, regenerateMessageTTS } = useChatTTS(context);

    await processMessageTTS(message.id, content);
    message.ttsRawContent = undefined;
    await regenerateMessageTTS(message.id, "auto");

    expect(vi.mocked(synthesizeSpeech).mock.calls.map(([text, , opts]) => [text, opts?.emotion]))
      .toEqual([["How are you?", "happy"], ["How are you?", "happy"]]);
  });

  it("聊天自己指定音色時不套用全域音色混合", async () => {
    vi.mocked(synthesizeSpeech).mockResolvedValue({ success: false, error: "test" });
    const context = createContext();
    Object.assign(context.settingsStore.minimaxTTS, {
      timberWeightsEnabled: true,
      timberWeights: [{ voiceId: "female-yujie", weight: 50 }],
    });
    const { chatMinimaxTTSOverride, processMessageTTS } = useChatTTS(context);

    await processMessageTTS(aiMessage.id, "你好[emotion=happy]");
    chatMinimaxTTSOverride.value = { voiceId: "my_clone_01" };
    await processMessageTTS(aiMessage.id, "你好[emotion=happy]");

    expect(vi.mocked(synthesizeSpeech).mock.calls.map(([, s]) => [s.voiceId, s.timberWeightsEnabled]))
      .toEqual([["voice", true], ["my_clone_01", false]]);
    expect(context.settingsStore.minimaxTTS.timberWeightsEnabled).toBe(true);
  });

  it.each([
    ["時間、大丈夫ですか？", "all", "", "時間、大丈夫ですか？"],
    ["時間はﾀﾞｲｼﾞｮｳﾌﾞ？", "all", "", "時間はﾀﾞｲｼﾞｮｳﾌﾞ？"],
    ["時間", "all", "Japanese", "時間"],
    ["時間、大丈夫ですか？（時間方便嗎？）", "foreign", "auto", "時間、大丈夫ですか？"],
  ] as const)("preserves Japanese when synthesizing %s", async (content, mode, boost, expected) => {
    vi.mocked(synthesizeSpeech).mockResolvedValue({ success: false, error: "test" });
    const message = { ...aiMessage, content };
    const context = createContext([message]);
    context.settingsStore.minimaxTTS.languageBoost = boost;
    const { regenerateMessageTTS } = useChatTTS(context);

    await regenerateMessageTTS(message.id, mode);

    expect(synthesizeSpeech).toHaveBeenCalledWith(expected, expect.anything(), expect.anything());
  });

  it("clears the legacy audio URL while synthesizing", async () => {
    const message = {
      ...aiMessage,
      ttsAudioUrl: "data:audio/mp3;base64,old",
    };
    vi.mocked(synthesizeSpeech).mockImplementation(async () => {
      expect(message.ttsAudioUrl).toBeUndefined();
      return { success: false, error: "failed" };
    });
    const context = createContext([message]);
    const { regenerateMessageTTS } = useChatTTS(context);

    await expect(regenerateMessageTTS(message.id)).resolves.toEqual({
      success: false,
      reason: "synthesis-failed",
    });
    expect(message.ttsAudioUrl).toBe("data:audio/mp3;base64,old");
  });
});
