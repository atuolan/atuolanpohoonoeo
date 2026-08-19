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
