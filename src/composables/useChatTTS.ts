import { ref, type Ref } from "vue";
import type { ChatScreenMessage as Message } from "@/types/chatScreen";
import { traditionalToSimplified } from "@/data/zhConversionMap";
import {
  cleanTTSTags,
  hasTTSTags,
  parseTTSSegments,
} from "@/utils/ttsTagCleaner";
import {
  canRegenerateMessageTTS,
  getMessageTTSSource,
} from "@/utils/messageTTS";
import {
  prepareTTSContent,
  type TTSLanguageMode,
} from "@/utils/ttsTextSelector";

export interface ChatMinimaxTTSOverride {
  voiceId?: string;
  speed?: number;
  pitch?: number;
  emotion?: string;
}

export type MessageTTSRegenerationResult =
  | { success: true }
  | {
      success: false;
      reason:
        | "disabled"
        | "missing-api-key"
        | "not-found"
        | "invalid-message"
        | "duplicate"
        | "synthesis-failed";
    };

export function useChatTTS(context: {
  messages: Ref<Message[]>;
  chatMinimaxTTSEnabled: Ref<boolean>;
  showChatSettingsMenu: Ref<boolean>;
  settingsStore: any;
  saveChat: () => void | Promise<void>;
}) {
  const chatMinimaxTTSOverride = ref<ChatMinimaxTTSOverride>({});
  const showMinimaxTTSSettingsModal = ref(false);
  const regeneratingMessageIds = new Set<string>();

  async function toggleMinimaxTTS() {
    context.chatMinimaxTTSEnabled.value = !context.chatMinimaxTTSEnabled.value;
    await context.saveChat();
  }

  function openMinimaxTTSSettings() {
    context.showChatSettingsMenu.value = false;
    showMinimaxTTSSettingsModal.value = true;
  }

  async function closeMinimaxTTSSettings() {
    showMinimaxTTSSettingsModal.value = false;
    await context.saveChat();
  }

  async function saveMinimaxTTSSettings() {
    await context.saveChat();
    showMinimaxTTSSettingsModal.value = false;
  }

  function convertTTSContentToSimplified(text: string): string {
    return text
      .split("")
      .map((char) => traditionalToSimplified[char] || char)
      .join("");
  }

  /**
   * 處理 AI 回覆的 TTS 語音合成
   * 1. 如果 TTS 啟用且內容含 TTS 標記，保存原始文字到 ttsRawContent
   * 2. 清除顯示文字中的 TTS 標記
   * 3. 逐句解析對話段落，各自獨立呼叫 MiniMax API 合成語音
   */
  async function processMessageTTS(
    messageId: string,
    content: string,
    options?: { force?: boolean; languageMode?: TTSLanguageMode },
  ): Promise<boolean> {
    if (!context.chatMinimaxTTSEnabled.value) return false;
    if (!context.settingsStore.minimaxTTS.apiKey) return false;
    if (!options?.force && !hasTTSTags(content)) return false;

    // 找到訊息並保存原始文字
    const idx = context.messages.value.findIndex((m) => m.id === messageId);
    if (idx === -1) return false;

    // 保存帶 TTS 標記的原始文字（renderedContent 會用來注入 🔊 按鈕）
    context.messages.value[idx].ttsRawContent = content;
    // 注意：不再預先清除 content 中的 TTS 標記！
    // renderedContent computed 會用 ttsSegments 偵測到有分段時，
    // 自動把 [emotion=...] 替換成行內播放按鈕，最後 cleanTTSTags 兜底。

    const ttsContent = prepareTTSContent(content, options?.languageMode ?? "auto");

    // 逐句解析對話段落
    const forcedParsedSegments = options?.force ? parseTTSSegments(ttsContent) : [];
    const segments = options?.force
      ? forcedParsedSegments.length > 0
        ? forcedParsedSegments
        : [
            {
              emotion: chatMinimaxTTSOverride.value.emotion || "neutral",
              speed: chatMinimaxTTSOverride.value.speed ?? 1,
              text: ttsContent,
              clean: cleanTTSTags(ttsContent),
            },
          ]
      : parseTTSSegments(ttsContent);
    if (segments.length === 0) return false;

    // 寫入段落（先不帶 audioUrl）
    context.messages.value[idx].ttsSegments = segments.map((s) => ({
      emotion: s.emotion,
      speed: s.speed,
      text: s.text,
      clean: s.clean,
    }));
    // 清除舊版單一音頻欄位，避免部分分段成功時殘留過期 URL。
    context.messages.value[idx].ttsAudioUrl = undefined;

    // 異步逐句合成語音
    try {
      const { synthesizeSpeech } = await import("@/api/MiniMaxTTSApi");
      const override = chatMinimaxTTSOverride.value;
      const baseSettings = {
        ...context.settingsStore.minimaxTTS,
        ...(override.voiceId && { voiceId: override.voiceId }),
        ...(override.pitch !== undefined && { pitch: override.pitch }),
      };

      let anySuccess = false;
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        // 每段用自己的 speed 和 emotion
        const mergedSettings = {
          ...baseSettings,
          speed: seg.speed,
        };
        const ttsText = convertTTSContentToSimplified(seg.text);

        const result = await synthesizeSpeech(ttsText, mergedSettings, {
          emotion: seg.emotion !== "neutral" ? seg.emotion : override.emotion,
        });

        const msgIdx = context.messages.value.findIndex((m) => m.id === messageId);
        if (msgIdx !== -1 && result.success && result.audioUrl) {
          // MiniMax 回傳的是 Aliyun OSS 簽名 URL（約 24h 後過期），
          // 立即下載並轉成 base64 data URL 保存，避免重新載入聊天時音頻失效。
          let persistedUrl = result.audioUrl;
          try {
            const audioResp = await fetch(result.audioUrl);
            if (audioResp.ok) {
              const blob = await audioResp.blob();
              persistedUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                  const r = reader.result;
                  if (typeof r === "string") resolve(r);
                  else reject(new Error("FileReader 結果非字串"));
                };
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(blob);
              });
            } else {
              console.warn(
                `[MiniMax TTS] 下載音頻失敗，HTTP ${audioResp.status}，仍使用臨時 URL`,
              );
            }
          } catch (fetchErr) {
            console.warn(
              "[MiniMax TTS] 下載音頻失敗，仍使用臨時 URL：",
              fetchErr,
            );
          }

          const segment = context.messages.value[msgIdx].ttsSegments?.[i];
          if (segment) {
            segment.audioUrl = persistedUrl;
          }
          // 向下相容：第一段也寫入 ttsAudioUrl
          if (i === 0) {
            context.messages.value[msgIdx].ttsAudioUrl = persistedUrl;
          }
          anySuccess = true;
        } else if (!result.success) {
          console.warn(`[MiniMax TTS] 段落 ${i} 合成失敗:`, result.error);
        }
      }

      if (anySuccess) {
        await context.saveChat();
      }
      return anySuccess;
    } catch (error) {
      console.error("[MiniMax TTS] 錯誤:", error);
      return false;
    }
  }

  async function regenerateMessageTTS(
    messageId: string,
    languageMode: TTSLanguageMode = "auto",
  ): Promise<MessageTTSRegenerationResult> {
    if (!context.chatMinimaxTTSEnabled.value) {
      return { success: false, reason: "disabled" };
    }
    if (!context.settingsStore.minimaxTTS.apiKey) {
      return { success: false, reason: "missing-api-key" };
    }
    if (regeneratingMessageIds.has(messageId)) {
      return { success: false, reason: "duplicate" };
    }

    const message = context.messages.value.find((m) => m.id === messageId);
    if (!message) {
      return { success: false, reason: "not-found" };
    }

    const source = getMessageTTSSource(message);
    if (
      !canRegenerateMessageTTS({
        role: message.role,
        content: source,
      })
    ) {
      return { success: false, reason: "invalid-message" };
    }

    const previousTTS = {
      ttsRawContent: message.ttsRawContent,
      ttsAudioUrl: message.ttsAudioUrl,
      ttsSegments: message.ttsSegments?.map((segment) => ({ ...segment })),
    };

    regeneratingMessageIds.add(messageId);
    try {
      const success = await processMessageTTS(messageId, source, {
        force: true,
        languageMode,
      });
      if (!success) {
        message.ttsRawContent = previousTTS.ttsRawContent;
        message.ttsAudioUrl = previousTTS.ttsAudioUrl;
        message.ttsSegments = previousTTS.ttsSegments;
        return { success: false, reason: "synthesis-failed" };
      }
      return { success: true };
    } finally {
      regeneratingMessageIds.delete(messageId);
    }
  }

  return {
    chatMinimaxTTSOverride,
    showMinimaxTTSSettingsModal,
    toggleMinimaxTTS,
    openMinimaxTTSSettings,
    closeMinimaxTTSSettings,
    saveMinimaxTTSSettings,
    processMessageTTS,
    regenerateMessageTTS,
  };
}
