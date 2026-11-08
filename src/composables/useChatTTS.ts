import { ref, type Ref } from "vue";
import type { ChatScreenMessage as Message } from "@/types/chatScreen";
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
  applyTTSVoiceOverride,
  getOverrideMemberVoices,
  getOverrideVoice,
  isTTSConfigured,
} from "@/api/ttsProvider";
import { isMessageAudioRef, messageAudioExists, storeMessageAudio } from "@/db/messageAudio";
import {
  convertTTSContentToSimplified,
  prepareTTSContent,
  type TTSLanguageMode,
} from "@/utils/ttsTextSelector";

export interface ChatMinimaxTTSOverride {
  voiceId?: string;
  speed?: number;
  pitch?: number;
  emotion?: string;
  /** undefined follows global settings; an empty string disables the language hint. */
  languageBoost?: string;
  /** 通話雙語字幕：角色說外語時語音念原文、畫面以中文字幕為主 */
  callBilingual?: boolean;
  /** 群聊成員各自的音色：key 是訊息的 senderCharacterId，value 是 voice_id */
  memberVoices?: Record<string, string>;
  /** Fish Audio 的音色（reference_id）；跟 MiniMax 的 voice_id 不通用，分開存 */
  fishVoiceId?: string;
  /** Fish Audio 的群聊成員音色 */
  fishMemberVoices?: Record<string, string>;
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

export type MessageTTSSegmentResult =
  | { success: true; audioUrl: string }
  | {
      success: false;
      reason: "missing-api-key" | "not-found" | "synthesis-failed";
    };

export function useChatTTS(context: {
  messages: Ref<Message[]>;
  chatMinimaxTTSEnabled: Ref<boolean>;
  showChatSettingsMenu: Ref<boolean>;
  settingsStore: any;
  saveChat: () => void | Promise<void>;
  /** 群聊：把台詞標的說話者名字對到成員 id（對不到回 undefined） */
  resolveSpeakerId?: (name: string) => string | undefined;
}) {
  const chatMinimaxTTSOverride = ref<ChatMinimaxTTSOverride>({});
  const showMinimaxTTSSettingsModal = ref(false);
  const regeneratingMessageIds = new Set<string>();
  /** 正在生成中的段落（key = messageId#index），避免連點重複扣費 */
  const segmentJobs = new Map<string, Promise<MessageTTSSegmentResult>>();

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

  /**
   * 音檔存進 audio-blobs，訊息裡只留引用（audioblob_…）。
   * 以前轉成 base64 直接放在訊息裡，語音多的聊天每次回覆都把全部語音讀進記憶體，手機會閃退。
   * MiniMax 回傳的是 Aliyun OSS 簽名 URL（約 24h 後過期），要先下載；Fish Audio 直接回傳 data URL。
   */
  async function persistAudioUrl(audioUrl: string): Promise<string> {
    if (audioUrl.startsWith("data:")) {
      try {
        return await storeMessageAudio(audioUrl);
      } catch (err) {
        console.warn("[TTS] 語音存檔失敗，先放在訊息裡：", err);
        return audioUrl;
      }
    }
    try {
      const audioResp = await fetch(audioUrl);
      if (!audioResp.ok) {
        console.warn(
          `[MiniMax TTS] 下載音頻失敗，HTTP ${audioResp.status}，仍使用臨時 URL`,
        );
        return audioUrl;
      }
      const blob = await audioResp.blob();
      return await storeMessageAudio(blob, blob.type || "audio/mpeg");
    } catch (fetchErr) {
      console.warn("[MiniMax TTS] 下載或保存音頻失敗，仍使用臨時 URL：", fetchErr);
      return audioUrl;
    }
  }

  /**
   * 合成一則訊息的第 index 段並寫回 audioUrl（不存檔）。
   * 設定在合成當下才讀，所以點播放時用的是最新的音色、語速。
   */
  async function synthesizeSegment(
    messageId: string,
    index: number,
  ): Promise<string | undefined> {
    const message = context.messages.value.find((m) => m.id === messageId);
    const seg = message?.ttsSegments?.[index];
    if (!message || !seg) return undefined;

    const { synthesizeSpeech } = await import("@/api/MiniMaxTTSApi");
    const override = chatMinimaxTTSOverride.value;
    const globalSettings = context.settingsStore.minimaxTTS;
    const memberVoices = getOverrideMemberVoices(globalSettings, override);
    const memberVoice = (id: string | undefined) => (id && memberVoices?.[id]?.trim()) || undefined;
    // 群聊：說話的成員有自己的音色就用它，其次才是這個聊天的音色
    const senderVoice = memberVoice(message.senderCharacterId);
    const baseSettings = {
      ...globalSettings,
      ...(override.pitch !== undefined && { pitch: override.pitch }),
      ...(override.languageBoost !== undefined && { languageBoost: override.languageBoost }),
    };
    // 聊天設定的語速是基準，AI 標的 speed 是相對快慢（1 = 照基準）
    const baseSpeed = override.speed ?? baseSettings.speed ?? 1;
    // 多人卡面對面一則訊息有好幾個人說話，台詞自己標的說話者優先
    const speakerVoice = seg.speaker
      ? memberVoice(context.resolveSpeakerId?.(seg.speaker))
      : undefined;
    const voiceId = speakerVoice || senderVoice || getOverrideVoice(globalSettings, override);
    // 每段用自己的 speed 和 emotion；成員或聊天自己指定的音色優先於全域的音色混合
    const mergedSettings = applyTTSVoiceOverride(
      { ...baseSettings, speed: baseSpeed * (seg.speed ?? 1) },
      voiceId,
    );
    const ttsText = convertTTSContentToSimplified(seg.text, mergedSettings.languageBoost);

    const result = await synthesizeSpeech(ttsText, mergedSettings, {
      emotion: seg.emotion !== "neutral" ? seg.emotion : override.emotion,
    });
    if (!result.success || !result.audioUrl) {
      console.warn(`[TTS] 段落 ${index} 合成失敗:`, result.error);
      return undefined;
    }

    const persistedUrl = await persistAudioUrl(result.audioUrl);

    // 合成期間訊息可能被重新生成，段落換了就不寫回去
    const current = context.messages.value.find((m) => m.id === messageId);
    const segment = current?.ttsSegments?.[index];
    if (!current || !segment || segment.text !== seg.text) return undefined;
    segment.audioUrl = persistedUrl;
    // 向下相容：第一段也寫入 ttsAudioUrl
    if (index === 0) {
      current.ttsAudioUrl = persistedUrl;
    }
    return persistedUrl;
  }

  /**
   * 處理 AI 回覆的 TTS 語音
   * 1. 如果 TTS 啟用且內容含 TTS 標記，保存原始文字到 ttsRawContent
   * 2. 逐句解析對話段落寫進 ttsSegments（畫面上變成行內播放按鈕）
   * 3. 只有開了「自動生成」或 synthesize: true（手動重新生成）才馬上呼叫 MiniMax，
   *    否則等使用者點播放按鈕時才生成那一段（synthesizeMessageTTSSegment）
   */
  async function processMessageTTS(
    messageId: string,
    content: string,
    options?: {
      force?: boolean;
      languageMode?: TTSLanguageMode;
      /** 不管設定，立刻把所有段落都合成（手動重新生成用） */
      synthesize?: boolean;
    },
  ): Promise<boolean> {
    if (!context.chatMinimaxTTSEnabled.value) return false;
    if (!isTTSConfigured(context.settingsStore.minimaxTTS)) return false;
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
              // 段落語速是相對值，聊天的語速設定在合成時才乘上去
              speed: 1,
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
      ...(s.speaker && { speaker: s.speaker }),
    }));
    // 清除舊版單一音頻欄位，避免部分分段成功時殘留過期 URL。
    context.messages.value[idx].ttsAudioUrl = undefined;

    const shouldSynthesize =
      options?.synthesize ?? !!context.settingsStore.minimaxTTS.autoGenerate;
    if (!shouldSynthesize) {
      // 點了才生成：先把段落存起來，播放按鈕會在點擊時呼叫 synthesizeMessageTTSSegment
      await context.saveChat();
      return true;
    }

    // 逐句合成語音
    try {
      let anySuccess = false;
      for (let i = 0; i < segments.length; i++) {
        if (await synthesizeSegment(messageId, i)) anySuccess = true;
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

  /**
   * 點播放按鈕時才生成某一段的語音（已經有就直接回傳）。
   * 同一段連點只會打一次 API。
   */
  async function synthesizeMessageTTSSegment(
    messageId: string,
    index: number,
  ): Promise<MessageTTSSegmentResult> {
    const message = context.messages.value.find((m) => m.id === messageId);
    const segment = message?.ttsSegments?.[index];
    if (!message || !segment) return { success: false, reason: "not-found" };
    if (segment.audioUrl) {
      // 從別台裝置同步過來的語音只有引用、音檔不在這台：當成還沒生成
      if (!isMessageAudioRef(segment.audioUrl) || (await messageAudioExists(segment.audioUrl))) {
        return { success: true, audioUrl: segment.audioUrl };
      }
      segment.audioUrl = undefined;
      if (index === 0) message.ttsAudioUrl = undefined;
    }
    if (!isTTSConfigured(context.settingsStore.minimaxTTS)) {
      return { success: false, reason: "missing-api-key" };
    }

    const key = `${messageId}#${index}`;
    let job = segmentJobs.get(key);
    if (!job) {
      job = (async (): Promise<MessageTTSSegmentResult> => {
        try {
          const audioUrl = await synthesizeSegment(messageId, index);
          if (!audioUrl) return { success: false, reason: "synthesis-failed" };
          await context.saveChat();
          return { success: true, audioUrl };
        } catch (error) {
          console.error("[MiniMax TTS] 錯誤:", error);
          return { success: false, reason: "synthesis-failed" };
        } finally {
          segmentJobs.delete(key);
        }
      })();
      segmentJobs.set(key, job);
    }
    return job;
  }

  async function regenerateMessageTTS(
    messageId: string,
    languageMode: TTSLanguageMode = "auto",
  ): Promise<MessageTTSRegenerationResult> {
    if (!context.chatMinimaxTTSEnabled.value) {
      return { success: false, reason: "disabled" };
    }
    if (!isTTSConfigured(context.settingsStore.minimaxTTS)) {
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
      // 使用者主動按「重新生成語音」：照舊立刻把整則合成好
      const success = await processMessageTTS(messageId, source, {
        force: true,
        languageMode,
        synthesize: true,
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
    synthesizeMessageTTSSegment,
    regenerateMessageTTS,
  };
}
