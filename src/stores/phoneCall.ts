/**
 * 全局電話通話 Store
 * 讓通話狀態在全局持久，可以離開聊天頁面繼續通話
 */

import { OpenAICompatibleClient } from "@/api/OpenAICompatible";
import { useStreamingWindow } from "@/composables/useStreamingWindow";
import { db, DB_STORES } from "@/db/database";
import { PromptBuilder } from "@/engine/prompt/PromptBuilder";
import { parseAffinityUpdateTags } from "@/services/ResponseParser";
import { loadChatById, refreshChatDerivedMetadata } from "@/storage/chatStorage";
import { appendMessages, loadMessages } from "@/storage/chatMessageStorage";
import { cleanTTSTags } from "@/utils/ttsTagCleaner";
import { traditionalToSimplified } from "@/data/zhConversionMap";
import { computeChatNow } from "@/utils/fakeTime";
import { pickGenerationToggles } from "@/utils/generationToggles";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

export interface CallMessage {
  id: string;
  role: "user" | "ai" | "system";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  tone?: string;
  imageData?: string;
  imageMimeType?: string;
  imageCaption?: string;
  /** MiniMax TTS 合成後的語音（base64 data URL），用於即時播放與事後回放 */
  audioUrl?: string;
}

export type CallState = "ringing" | "connected" | "ended" | "rejected";

interface Summary {
  id: string;
  content: string;
  createdAt: number;
  isImportant?: boolean;
}

interface ImportantEvent {
  id: string;
  content: string;
  category?: string;
  priority?: number;
}

interface RecentChatMessage {
  role: "user" | "assistant";
  name: string;
  content: string;
  createdAt: number;
}

export interface ActiveCallInfo {
  characterId: string;
  characterName: string;
  characterAvatar?: string;
  chatId?: string;
  lastMessageTime?: number;
  enablePhoneDecision?: boolean;
  isIncoming?: boolean;
  callReason?: string;
}

interface PhoneAnswerDecision {
  shouldAnswer: boolean;
  reason?: string;
  opening?: string;
  openingMessages?: { text: string; tone?: string }[];
}

interface VideoCallConfig {
  enabled: boolean;
  remoteVideoUrl: string;
  localVideoUrl: string;
}

interface VideoCallSession {
  isActive: boolean;
  remoteImageUrl: string;
  localImageUrl: string;
}

export const usePhoneCallStore = defineStore("phoneCall", () => {
  // ===== 通話狀態 =====
  const activeCall = ref<ActiveCallInfo | null>(null);
  const callState = ref<CallState>("ringing");
  const callMessages = ref<CallMessage[]>([]);
  const callDuration = ref(0);
  const callStartedAt = ref<number | null>(null);
  const isGenerating = ref(false);
  const rejectReason = ref("");
  const isMuted = ref(false);
  const isSpeaker = ref(false);
  /** 該聊天是否開啟 MiniMax（決定喇叭按鈕是否可用，作為自動語音開關前提） */
  const ttsAvailable = ref(false);
  /** 聊天專屬 MiniMax 音色覆蓋（不設則用全域設定） */
  const ttsOverride = ref<{ voiceId?: string; speed?: number; pitch?: number; emotion?: string }>({});
  /** 最近一次 TTS 合成/播放錯誤訊息（供 UI 顯示，null = 無錯誤） */
  const ttsError = ref<string | null>(null);
  /** 目前正在播放（或合成中）的訊息 id，供 UI 標示播放狀態（null = 無） */
  const playingMessageId = ref<string | null>(null);
  // 語音播放基礎設施：單一已解鎖的 Audio 實例 + 播放序號（遞增即可中斷進行中的序列）
  // 在使用者手勢（接聽/撥打按鈕）內預先 play 一次來解鎖手機自動播放限制，之後重設 src 重用
  let unlockedAudio: HTMLAudioElement | null = null;
  let audioUnlocked = false;
  let playbackToken = 0;

  /** 繁→簡轉換（MiniMax 對簡體發音較準，比照聊天路徑） */
  function convertTTSContentToSimplified(text: string): string {
    return text
      .split("")
      .map((char) => traditionalToSimplified[char] || char)
      .join("");
  }


  // UI 狀態：是否展開全屏（false = 縮小成迷你條）
  const isExpanded = ref(true);

  // 視訊設定與狀態（先支援靜態畫面）
  const videoConfig = ref<VideoCallConfig>({
    enabled: true,
    remoteVideoUrl: "",
    localVideoUrl: "",
  });
  const videoSession = ref<VideoCallSession>({
    isActive: false,
    remoteImageUrl: "",
    localImageUrl: "",
  });

  // 內部計時器和控制器
  let durationTimer: ReturnType<typeof setInterval> | null = null;
  let abortController: AbortController | null = null;
  let autoAnswerTimer: ReturnType<typeof setTimeout> | null = null;

  // 輔助資料
  const summaries = ref<Summary[]>([]);
  const importantEvents = ref<ImportantEvent[]>([]);
  const recentChatHistory = ref<RecentChatMessage[]>([]);

  // ===== Getters =====
  const isActive = computed(() => activeCall.value !== null && callState.value !== "ended" && callState.value !== "rejected");
  const isVideoCallActive = computed(
    () => isActive.value && videoSession.value.isActive,
  );
  const formattedDuration = computed(() => {
    const mins = Math.floor(callDuration.value / 60);
    const secs = callDuration.value % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  });

  function formatCallDateTime(timestamp: number): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  function formatDurationText(durationSeconds: number): string {
    const mins = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    return mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`;
  }

  function buildPhoneCallRecordContent(options: {
    title?: string;
    durationSeconds: number;
    startedAt?: number | null;
    endedAt: number;
    characterName: string;
    messages: CallMessage[];
  }): string {
    const startedAt = options.startedAt ?? Math.max(options.endedAt - options.durationSeconds * 1000, 0);
    const callLines = options.messages
      .map((m) => `${m.role === "user" ? "你" : options.characterName}: ${m.content}`)
      .join("\n");

    return `<phone_call>\n${options.title || "📞 通話結束"}\n開始時間：${formatCallDateTime(startedAt)}\n結束時間：${formatCallDateTime(options.endedAt)}\n時長：${formatDurationText(options.durationSeconds)}\n\n電話內容：\n${callLines}\n</phone_call>`;
  }

  /** 構建結構化通話記錄數據（含逐條語音 audioUrl，供事後回放） */
  function buildPhoneCallHistoryData(options: {
    characterName: string;
    characterAvatar?: string;
    startedAt: number;
    endedAt: number;
    messages: CallMessage[];
  }) {
    return {
      characterName: options.characterName,
      characterAvatar: options.characterAvatar,
      startedAt: options.startedAt,
      endedAt: options.endedAt,
      messages: options.messages.map((m) => ({
        role: (m.role === "user" ? "user" : "ai") as "user" | "ai",
        content: m.content,
        tone: m.tone,
        audioUrl: m.audioUrl,
        timestamp: m.timestamp,
      })),
    };
  }
  const canRegenerateLastAi = computed(() => {
    if (isGenerating.value || callState.value !== "connected") return false;
    const last = callMessages.value[callMessages.value.length - 1];
    return !!last && last.role === "ai";
  });
  const canTriggerManualResponse = computed(() => {
    if (isGenerating.value || callState.value !== "connected") return false;
    const lastNonSystem = [...callMessages.value].reverse().find((m) => m.role !== "system");
    return !!lastNonSystem && lastNonSystem.role === "user";
  });

  const VIDEO_CALL_CONFIG_KEY = "video_call_config";

  function loadVideoConfig() {
    try {
      const raw = localStorage.getItem(VIDEO_CALL_CONFIG_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<VideoCallConfig>;
      videoConfig.value = {
        ...videoConfig.value,
        ...parsed,
      };
    } catch {
      // ignore
    }
  }

  function saveVideoConfig() {
    try {
      localStorage.setItem(VIDEO_CALL_CONFIG_KEY, JSON.stringify(videoConfig.value));
    } catch {
      // ignore
    }
  }

  function updateVideoConfig(patch: Partial<VideoCallConfig>) {
    videoConfig.value = {
      ...videoConfig.value,
      ...patch,
    };
    saveVideoConfig();
  }

  loadVideoConfig();

  // ===== MiniMax TTS 自動語音 =====
  /** 載入該聊天的 MiniMax 開關與音色覆蓋，決定自動語音是否可用 */
  async function loadTTSConfig(info: ActiveCallInfo) {
    ttsAvailable.value = false;
    ttsOverride.value = {};
    isSpeaker.value = false;
    try {
      if (!info.chatId) return;
      const chat = await loadChatById(info.chatId);
      if (!chat) return;
      const { useSettingsStore } = await import("@/stores");
      const settingsStore = useSettingsStore();
      const enabled =
        !!(chat as any).minimaxTTSEnabled && !!settingsStore.minimaxTTS?.apiKey;
      ttsAvailable.value = enabled;
      ttsOverride.value = (chat as any).minimaxTTSOverride
        ? { ...(chat as any).minimaxTTSOverride }
        : {};
      // 自動語音預設：可用時開啟（喇叭亮起）
      isSpeaker.value = enabled;
    } catch (e) {
      console.warn("[phoneCall] 載入 TTS 設定失敗:", e);
    }
  }

  /** 取得合併後的 MiniMax 設定（全域 + 聊天覆蓋） */
  function getMergedTTSSettings(settingsStore: any) {
    const override = ttsOverride.value;
    return {
      ...settingsStore.minimaxTTS,
      ...(override.voiceId && { voiceId: override.voiceId }),
      ...(override.pitch !== undefined && { pitch: override.pitch }),
      ...(override.speed !== undefined && { speed: override.speed }),
    };
  }

  /**
   * 在使用者手勢（接聽/撥打按鈕）內解鎖音頻播放。
   * 手機（尤其 iOS Safari）只允許在使用者手勢中啟動的 Audio 後續以程式播放，
   * 因此這裡建立單一可重用的 Audio 元素並在手勢內 play 一次（用靜音檔），
   * 之後自動語音只需重設這個元素的 src 即可繞過自動播放限制。
   */
  function unlockAudioPlayback() {
    try {
      if (!unlockedAudio) {
        unlockedAudio = new Audio();
        unlockedAudio.preload = "auto";
      }
      // 用內建靜音檔做一次手勢內播放來解鎖
      unlockedAudio.src = "/silent.mp3";
      const p = unlockedAudio.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          audioUnlocked = true;
        }).catch((e) => {
          console.warn("[phoneCall] 音頻解鎖失敗（將於播放時重試）:", e);
        });
      } else {
        audioUnlocked = true;
      }
    } catch (e) {
      console.warn("[phoneCall] 音頻解鎖異常:", e);
    }
  }

  /** 停止當前播放並使進行中的播放序列失效 */
  function stopPlayback() {
    playbackToken++;
    if (unlockedAudio) {
      try {
        unlockedAudio.pause();
        unlockedAudio.removeAttribute("src");
        unlockedAudio.onended = null;
        unlockedAudio.onerror = null;
      } catch {
        /* ignore */
      }
    }
  }

  /** 播放單一音頻並等待結束（可被 stopPlayback 中斷）。重用已解鎖的 Audio 元素。 */
  function playAudioUrl(url: string, token: number): Promise<void> {
    return new Promise((resolve) => {
      if (token !== playbackToken) {
        resolve();
        return;
      }
      // 若尚未建立解鎖元素（例如非手勢觸發路徑），退而求其次建立新元素
      if (!unlockedAudio) {
        unlockedAudio = new Audio();
        unlockedAudio.preload = "auto";
      }
      const audio = unlockedAudio;
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        audio.onended = null;
        audio.onerror = null;
        resolve();
      };
      audio.onended = done;
      audio.onerror = () => {
        ttsError.value = "語音播放失敗";
        console.warn("[phoneCall] 語音播放錯誤");
        done();
      };
      audio.src = url;
      audio.play().catch((e) => {
        ttsError.value = "瀏覽器封鎖了自動播放，請點一下喇叭按鈕";
        console.warn("[phoneCall] 自動播放被封鎖:", e);
        done();
      });
    });
  }

  /** 合成單條通話訊息語音，下載轉 base64 存入該訊息 audioUrl；回傳 url（失敗回傳 null） */
  async function synthesizeCallMessage(msg: CallMessage): Promise<string | null> {
    if (msg.audioUrl) return msg.audioUrl;
    const text = cleanTTSTags(msg.content || "").trim();
    if (!text) return null;
    try {
      const { useSettingsStore } = await import("@/stores");
      const settingsStore = useSettingsStore();
      if (!settingsStore.minimaxTTS?.apiKey) {
        ttsError.value = "尚未設定 MiniMax API Key";
        return null;
      }
      const { synthesizeSpeech } = await import("@/api/MiniMaxTTSApi");
      const mergedSettings = getMergedTTSSettings(settingsStore);
      const emotion = msg.tone?.trim() || ttsOverride.value.emotion || undefined;
      // 比照聊天路徑做繁→簡轉換，MiniMax 對簡體發音較準
      const ttsText = convertTTSContentToSimplified(text);
      const result = await synthesizeSpeech(
        ttsText,
        mergedSettings,
        emotion ? { emotion } : undefined,
      );
      if (!result.success || !result.audioUrl) {
        ttsError.value = `語音合成失敗：${result.error || "未知錯誤"}`;
        console.warn("[phoneCall] TTS 合成失敗:", result.error);
        return null;
      }
      ttsError.value = null;
      // MiniMax 回傳的是簽名 URL（約 24h 後過期），立即下載轉 base64 保存
      let persistedUrl = result.audioUrl;
      try {
        const resp = await fetch(result.audioUrl);
        if (resp.ok) {
          const blob = await resp.blob();
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
        }
      } catch (e) {
        console.warn("[phoneCall] TTS 音頻下載失敗，使用臨時 URL:", e);
      }
      // 用 id 查找寫回，避免引用失效
      const idx = callMessages.value.findIndex((m) => m.id === msg.id);
      if (idx !== -1) callMessages.value[idx].audioUrl = persistedUrl;
      msg.audioUrl = persistedUrl;
      return persistedUrl;
    } catch (e) {
      console.error("[phoneCall] TTS 合成異常:", e);
      return null;
    }
  }

  /** 依序合成並即時播放一組 AI 訊息（喇叭開啟且 TTS 可用時） */
  async function autoVoiceMessages(messageIds: string[]) {
    if (!ttsAvailable.value || !isSpeaker.value) return;
    const token = ++playbackToken;
    for (const id of messageIds) {
      if (token !== playbackToken) return;
      const msg = callMessages.value.find((m) => m.id === id);
      if (!msg || msg.role !== "ai") continue;
      const url = await synthesizeCallMessage(msg);
      if (!url) continue;
      if (token !== playbackToken || !isSpeaker.value) return;
      await playAudioUrl(url, token);
    }
  }

  /**
   * 手動播放單一訊息語音（由使用者點擊氣泡觸發）。
   * 點擊本身即為使用者手勢，因此繞過喇叭開關判斷，並在此同步解鎖音頻。
   * 同一訊息再次點擊則停止播放（切換）。
   */
  async function playMessageAudio(messageId: string) {
    const msg = callMessages.value.find((m) => m.id === messageId);
    if (!msg || msg.role !== "ai") return;
    // 同一則正在播放 → 視為停止
    if (playingMessageId.value === messageId) {
      stopPlayback();
      playingMessageId.value = null;
      return;
    }
    // 趁點擊手勢有效，立即解鎖音頻（手機限制）
    unlockAudioPlayback();
    ttsError.value = null;
    // 中斷既有播放並取得新 token
    const token = ++playbackToken;
    playingMessageId.value = messageId;
    const url = await synthesizeCallMessage(msg);
    if (!url) {
      playingMessageId.value = null;
      return;
    }
    if (token !== playbackToken) return;
    await playAudioUrl(url, token);
    if (token === playbackToken) playingMessageId.value = null;
  }

  // ===== 開始視訊通話（靜態模式 MVP） =====
  async function startVideoCall(
    info: ActiveCallInfo,
    options?: {
      remoteImageUrl?: string;
      localImageUrl?: string;
    },
  ) {
    cleanup();

    activeCall.value = info;
    callState.value = "connected";
    callMessages.value = [];
    callDuration.value = 0;
    callStartedAt.value = Date.now();
    isGenerating.value = false;
    rejectReason.value = "";
    isMuted.value = false;
    isSpeaker.value = false;
    isExpanded.value = true;

    const { useUserStore } = await import("@/stores/user");
    const userStore = useUserStore();

    videoSession.value = {
      isActive: true,
      remoteImageUrl:
        options?.remoteImageUrl ||
        videoConfig.value.remoteVideoUrl ||
        info.characterAvatar ||
        "",
      localImageUrl:
        options?.localImageUrl ||
        videoConfig.value.localVideoUrl ||
        userStore.currentPersona?.avatar ||
        "",
    };

    await loadTTSConfig(info);

    durationTimer = setInterval(() => {
      callDuration.value++;
    }, 1000);
  }

  // ===== 開始通話 =====
  async function startCall(info: ActiveCallInfo) {
    // 清理舊通話
    cleanup();

    // 趁使用者手勢（撥打/接聽按鈕）尚未失效，立即解鎖音頻自動播放（手機限制）
    // 必須在任何 await 之前同步呼叫，否則手勢上下文消失，後續自動語音會被封鎖
    unlockAudioPlayback();
    ttsError.value = null;

    activeCall.value = info;
    callState.value = "ringing";
    callMessages.value = [];
    callDuration.value = 0;
    callStartedAt.value = null;
    isGenerating.value = false;
    rejectReason.value = "";
    isMuted.value = false;
    isSpeaker.value = false;
    isExpanded.value = true;
    videoSession.value = {
      isActive: false,
      remoteImageUrl: "",
      localImageUrl: "",
    };

    // 載入輔助資料
    await loadSummariesAndEvents(info);
    await loadTTSConfig(info);

    // 來電模式：直接接聽
    if (info.isIncoming) {
      await handleAnswer();
      return;
    }

    // 撥出模式：等 1.5 秒後決定是否接聽
    autoAnswerTimer = setTimeout(async () => {
      if (callState.value !== "ringing") return;

      if (info.enablePhoneDecision === false) {
        updateMissedCallCount(info.characterId, 0);
        await handleAnswer();
        return;
      }

      const decision = await checkIfShouldAnswer(info);
      if (decision.shouldAnswer) {
        updateMissedCallCount(info.characterId, 0);
        await handleAnswer(decision.openingMessages);
      } else {
        const newCount = getMissedCallCount(info.characterId) + 1;
        updateMissedCallCount(info.characterId, newCount);
        callState.value = "rejected";
        rejectReason.value = decision.reason || "對方現在不方便接聽";
        setTimeout(() => endCall(), 3000);
      }
    }, 1500);
  }

  // ===== 接聽 =====
  async function handleAnswer(openingMessages?: { text: string; tone?: string }[]) {
    callState.value = "connected";
    callStartedAt.value = Date.now();
    durationTimer = setInterval(() => { callDuration.value++; }, 1000);

    const info = activeCall.value!;
    // 動態 import stores 避免循環依賴
    const { useUserStore } = await import("@/stores/user");
    const userStore = useUserStore();

    if (info.isIncoming) {
      callMessages.value.push({
        id: `call_trigger_${Date.now()}`,
        role: "system",
        content: `（${info.characterName} 主動打電話給 ${userStore.currentPersona?.name || "User"}，電話接通了...請以角色身份先開口說話）`,
        timestamp: Date.now(),
      });
      await generateAIResponse(true);
    } else {
      if (openingMessages?.length) {
        const openingIds: string[] = [];
        for (const message of openingMessages) {
          const text = message.text?.trim();
          if (!text) continue;
          const id = `call_msg_ai_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          openingIds.push(id);
          callMessages.value.push({
            id,
            role: "ai",
            content: text,
            timestamp: Date.now(),
            isStreaming: false,
            tone: message.tone?.trim() || undefined,
          });
        }
        // 開場白自動語音
        if (openingIds.length) void autoVoiceMessages(openingIds);
      }

      if (openingMessages?.some((message) => message.text?.trim())) {
        return;
      }

      callMessages.value.push({
        id: `call_trigger_${Date.now()}`,
        role: "system",
        content: `（${userStore.currentPersona?.name || "User"} 正在打電話給你，電話響了...請接聽並回應）`,
        timestamp: Date.now(),
      });
      await generateAIResponse(false);
    }
  }

  // ===== 掛斷 =====
  async function endCall() {
    cleanup();
    callState.value = "ended";

    // 立即把通話記錄存進 IndexedDB，防止頁面被系統殺掉後丟失
    await persistCallRecord();

    // 短暫延遲後清除 activeCall，讓 UI 可以顯示「通話結束」
    setTimeout(() => {
      activeCall.value = null;
      callMessages.value = [];
      videoSession.value = {
        isActive: false,
        remoteImageUrl: "",
        localImageUrl: "",
      };
    }, 1500);
  }

  // ===== 將通話記錄直接寫入 IndexedDB =====
  async function persistCallRecord() {
    const info = activeCall.value;
    if (!info?.chatId) return;
    const msgs = callMessages.value.filter((m) => m.role !== "system");
    if (msgs.length === 0) return;

    try {
      const chat = await loadChatById(info.chatId);
      if (!chat) return;

      const endedAt = Date.now();
      const startedAt =
        callStartedAt.value ??
        Math.max(endedAt - callDuration.value * 1000, 0);

      const callRecordMessage = {
        id: `msg_call_${Date.now()}`,
        role: "system",
        sender: "system",
        name: "系統",
        is_user: false,
        content: buildPhoneCallRecordContent({
          durationSeconds: callDuration.value,
          startedAt,
          endedAt,
          characterName: info.characterName,
          messages: msgs,
        }),
        isPhoneCallHistory: true,
        phoneCallHistoryData: buildPhoneCallHistoryData({
          characterName: info.characterName,
          characterAvatar: info.characterAvatar,
          startedAt,
          endedAt,
          messages: msgs,
        }),
        timestamp: endedAt,
        createdAt: endedAt,
        updatedAt: endedAt,
        status: "sent",
      };

      // v24：用 appendChatMessages 追加通話記錄
      await appendMessages(chat.id, [callRecordMessage as any]);
      await refreshChatDerivedMetadata(chat.id);
      console.log("[phoneCall] 通話記錄已寫入 chatMessages 表");
    } catch (e) {
      console.error("[phoneCall] 寫入通話記錄失敗", e);
    }
  }

  // ===== 發送/排隊訊息 =====
  function addUserMessage(
    text: string,
    options?: {
      tone?: string;
      imageData?: string;
      imageMimeType?: string;
      imageCaption?: string;
    },
  ): boolean {
    if (!text.trim() || isGenerating.value || callState.value !== "connected") return false;
    callMessages.value.push({
      id: `call_msg_${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
      tone: options?.tone?.trim() || undefined,
      imageData: options?.imageData,
      imageMimeType: options?.imageMimeType,
      imageCaption: options?.imageCaption,
    });
    return true;
  }

  async function triggerAIResponse() {
    if (!canTriggerManualResponse.value) return;
    await generateAIResponse(false);
  }

  // 相容舊調用：保留 sendMessage = 送出後立刻觸發 AI
  async function sendMessage(
    text: string,
    options?: {
      tone?: string;
      imageData?: string;
      imageMimeType?: string;
      imageCaption?: string;
    },
  ) {
    const added = addUserMessage(text, options);
    if (!added) return;
    await triggerAIResponse();
  }

  // ===== 縮小/展開 =====
  function minimize() { isExpanded.value = false; }
  function expand() { isExpanded.value = true; }
  function toggleMuteState() { isMuted.value = !isMuted.value; }
  function toggleSpeakerState() {
    isSpeaker.value = !isSpeaker.value;
    if (isSpeaker.value) {
      // 開啟喇叭是使用者手勢，趁機解鎖音頻自動播放（二次保險）
      unlockAudioPlayback();
      ttsError.value = null;
    } else {
      // 關閉自動語音時立即停止當前播放
      stopPlayback();
    }
  }

  // ===== 重新生成最後一輪 AI 回覆（移除尾端 AI 連續段後重生） =====
  async function regenerateLastAiResponse() {
    if (!canRegenerateLastAi.value || isGenerating.value) return;
    stopPlayback();

    let end = callMessages.value.length - 1;
    if (end < 0 || callMessages.value[end].role !== "ai") return;

    let start = end;
    while (start - 1 >= 0 && callMessages.value[start - 1].role === "ai") {
      start--;
    }

    callMessages.value.splice(start, end - start + 1);
    await generateAIResponse(false);
  }

  // ===== 生成 AI 回覆 =====
  async function generateAIResponse(isIncomingFirstMessage: boolean) {
    if (isGenerating.value || !activeCall.value) return;

    isGenerating.value = true;
    abortController = new AbortController();

    const info = activeCall.value;
    const phoneTaskId = info.chatId || `phone_${info.characterId}`;

    // 動態 import 避免循環依賴
    const { useCharactersStore, useLorebooksStore, usePromptManagerStore, useSettingsStore, useAIGenerationStore } = await import("@/stores");
    const { useUserStore } = await import("@/stores/user");

    const settingsStore = useSettingsStore();
    const charactersStore = useCharactersStore();
    const lorebooksStore = useLorebooksStore();
    const promptManagerStore = usePromptManagerStore();
    const userStore = useUserStore();
    const aiGenerationStore = useAIGenerationStore();
    const streamingWindow = useStreamingWindow();

    aiGenerationStore.startGeneration(phoneTaskId, "chat", {
      characterName: info.characterName,
      characterAvatar: info.characterAvatar,
    });

    const phoneCallTaskConfig = settingsStore.getAPIForTask("phoneCall");
    const isStreamingEnabled = phoneCallTaskConfig.generation.streamingEnabled;
    const useWindow = isStreamingEnabled && phoneCallTaskConfig.generation.useStreamingWindow;
    if (useWindow) streamingWindow.show(phoneCallTaskConfig.api.model);

    try {
      const char = charactersStore.characters.find((c) => c.id === info.characterId);
      if (!char) throw new Error("未找到角色");

      // 佔位符
      const aiMsg: CallMessage = {
        id: `call_msg_ai_${Date.now()}`,
        role: "ai",
        content: "",
        timestamp: Date.now(),
        isStreaming: true,
      };
      callMessages.value.push(aiMsg);

      // 收集世界書
      const linkedLorebooks = [];
      if (char.lorebookIds?.length) {
        for (const id of char.lorebookIds) {
          const lb = lorebooksStore.lorebooks.find((l) => l.id === id);
          if (lb) linkedLorebooks.push(lb);
        }
      }
      linkedLorebooks.push(...lorebooksStore.lorebooks.filter((lb) => lb.isGlobal));

      // 構建歷史
      // 來電首次觸發時，過濾掉 system trigger（由 incomingCallContext + phoneCallIncomingTrigger 負責觸發）
      const filteredCallMessages = isIncomingFirstMessage
        ? callMessages.value.filter((m) => !m.isStreaming && m.role !== "system")
        : callMessages.value.filter((m) => !m.isStreaming);
      const chatMessages = filteredCallMessages
        .map((m) => ({
          id: m.id,
          sender: (m.role === "user" || m.role === "system" ? "user" : "assistant") as "user" | "assistant",
          name: m.role === "user" || m.role === "system" ? "User" : char.data.name,
          content: m.role === "user" && m.tone
            ? `[使用者語氣: ${m.tone}]\n${m.content}`
            : m.content,
          is_user: m.role === "user" || m.role === "system",
          status: "sent" as const,
          createdAt: m.timestamp,
          updatedAt: m.timestamp,
          imageData: m.imageData,
          imageMimeType: m.imageMimeType,
          imageCaption: m.imageCaption,
        }));

      await promptManagerStore.loadConfig();

      const lastChatTime = info.lastMessageTime ? formatTimeSince(info.lastMessageTime) : "未知";

      const chatRecord = info.chatId
        ? await db.get<any>(DB_STORES.CHATS, info.chatId).catch(() => undefined)
        : undefined;

      // 感知現實時間設定（預設開啟）；關閉時電話不注入任何時間，純依劇情時間推進
      const enableRealTimeAwareness = chatRecord?.enableRealTimeAwareness !== false;
      // 依聊天的假時間設定計算有效時間（輪迴／偏移模式沿用聊天設定，real 模式即真實時間）
      const now = computeChatNow(chatRecord);

      let chatPromptToggles: Record<string, boolean> | undefined;
      let chatLocalPrompts: import("@/types/chat").ChatLocalPrompt[] | undefined;
      if (chatRecord) {
        const { loadPromptOverrideForChat } = await import("@/utils/promptOverrideScope");
        const overrides = await loadPromptOverrideForChat({
          id: chatRecord.id,
          characterId: chatRecord.characterId,
          isGroupChat: chatRecord.isGroupChat,
          groupMetadata: chatRecord.groupMetadata,
          chatVariables: chatRecord.chatVariables,
        });
        chatPromptToggles = overrides.chatPromptToggles;
        chatLocalPrompts = overrides.chatLocalPrompts;
      }

      // 向量記憶檢索（使用全域開關）
      let vectorMemories: import('@/services/memoryRetriever').RetrievedMemory[] | undefined;
      if (info.chatId) {
        try {
          const summarySettings = chatRecord?.summarySettings;
          if (settingsStore.vectorMemoryEnabled && summarySettings?.summaryReadMode !== 'all') {
            const lastUserMsg = [...filteredCallMessages].reverse().find((m) => m.role === 'user');
            if (lastUserMsg?.content) {
              const { MemoryRetrieverService } = await import('@/services/memoryRetriever');
              const retriever = new MemoryRetrieverService();
              vectorMemories = await retriever.retrieve(
                lastUserMsg.content,
                info.chatId,
                summarySettings?.vectorTopK ?? 5,
                summarySettings?.vectorThreshold ?? 0.3,
                undefined, // 電話模式暫不傳入近期訊息
                [char.data.name].filter(Boolean),
                summarySettings?.summaryReadCount ?? 5,
              );
              console.log(`[向量記憶] 電話模式檢索到 ${vectorMemories.length} 條相關記憶`);
            }
          }
        } catch (err) {
          console.error('[向量記憶] 電話模式檢索失敗:', err);
        }
      }

      const builder = new PromptBuilder({
        character: char,
        lorebooks: linkedLorebooks,
        messages: chatMessages,
        settings: {
          maxContextLength: settingsStore.generation.maxContextLength || 200000,
          maxResponseLength: settingsStore.generation.maxTokens || 200000,
          temperature: settingsStore.generation.temperature,
          topP: settingsStore.generation.topP,
          frequencyPenalty: settingsStore.generation.frequencyPenalty ?? 0, presencePenalty: settingsStore.generation.presencePenalty ?? 0, repetitionPenalty: 1,
          stopSequences: [], streaming: isStreamingEnabled, useStreamingWindow: useWindow,
          ...pickGenerationToggles(settingsStore.generation),
        },
        userName: userStore.currentPersona?.name || "User",
        userPersona: userStore.currentPersona?.description,
        promptManagerConfig: promptManagerStore.config,
        chatPromptToggles,
        chatLocalPrompts,
        phoneCallMode: true,
        // 該聊天開啟 MiniMax 且有 apiKey 時，注入電話語音合成標記提示詞
        minimaxTTSEnabled: ttsAvailable.value,
        incomingCallMode: info.isIncoming && isIncomingFirstMessage,
        callReason: info.callReason,
        summaries: summaries.value,
        vectorMemories,
        importantEvents: importantEvents.value,
        // 感知現實時間：關閉時 PromptBuilder 會跳過電話模式的時間注入
        enableRealTimeAwareness,
        // 假時間覆蓋：讓訊息時間戳與時間提示沿用聊天的輪迴／偏移設定
        fakeTimeOverride: now,
        phoneContext: {
          currentTime: now.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }),
          currentDate: now.toLocaleDateString("zh-TW"),
          lastChatTime,
        },
        recentChatHistory: recentChatHistory.value,
      });

      const promptResult = await builder.build();
      const client = new OpenAICompatibleClient(phoneCallTaskConfig.api);
      
      // 將 BuiltMessage 轉換為 APIMessage，處理圖片數據
      const apiMessages = promptResult.messages.map((m) => {
        const msg = m as typeof m & {
          imageData?: string;
          imageMimeType?: string;
        };

        // 如果消息包含圖片數據，構建混合內容
        if (msg.imageData) {
          const content: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];

          // 添加文字內容
          if (msg.content && msg.content.trim()) {
            content.push({ type: "text", text: msg.content });
          }

          // 添加圖片內容
          const mimeType = msg.imageMimeType || "image/jpeg";
          content.push({
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${msg.imageData}`,
            },
          });

          return { role: msg.role, content };
        }

        // 普通文字消息
        return { role: msg.role, content: msg.content };
      });
      
      const streamGen = client.generateStream({
        messages: apiMessages,
        settings: {
          maxContextLength: settingsStore.generation.maxContextLength || 200000,
          maxResponseLength: settingsStore.generation.maxTokens || 200000,
          temperature: settingsStore.generation.temperature,
          topP: settingsStore.generation.topP,
          frequencyPenalty: settingsStore.generation.frequencyPenalty ?? 0, presencePenalty: settingsStore.generation.presencePenalty ?? 0, repetitionPenalty: 1,
          stopSequences: [], streaming: isStreamingEnabled, useStreamingWindow: useWindow,
          ...pickGenerationToggles(settingsStore.generation),
        },
        apiSettings: phoneCallTaskConfig.api,
        signal: abortController!.signal,
        // 電話模式不轉換末尾角色，confirmLastOutput 本身就是 user role
        adjustLastMessageRole: false,
      });

      let fullContent = "";
      for await (const event of streamGen) {
        if (event.type === "token" && event.token) {
          fullContent += event.token;
          if (useWindow) {
            streamingWindow.appendToken(event.token);
            aiGenerationStore.appendContent(phoneTaskId, event.token);
          }
          const idx = callMessages.value.findIndex((m) => m.id === aiMsg.id);
          if (idx !== -1) {
            callMessages.value[idx].content = fullContent;
            callMessages.value[idx].isStreaming = true;
          }
        } else if (event.type === "done") {
          const finalContent = event.content || fullContent;
          if (useWindow) streamingWindow.setComplete();
          aiGenerationStore.completeGeneration(phoneTaskId, "chat", finalContent);
          callMessages.value = callMessages.value.filter((m) => m.id !== aiMsg.id);
          const parsed = parsePhoneJsonOutput(finalContent);
          const newAiMessageIds: string[] = [];
          for (const p of parsed.messages) {
            const id = `call_msg_ai_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            newAiMessageIds.push(id);
            callMessages.value.push({
              id,
              role: "ai", content: p.text, timestamp: Date.now(),
              isStreaming: false, tone: p.tone,
            });
          }

          // 自動語音：合成並即時播放每條新 AI 訊息
          if (newAiMessageIds.length) void autoVoiceMessages(newAiMessageIds);

          // 提取並套用 MVU 變量更新（卡內帶 MVU 時 AI 會輸出 <UpdateVariable>/<update> 標籤）
          await applyMvuUpdatesFromResponse(finalContent);

          // AI 主動掛斷：在播放完訊息後結束通話
          if (parsed.hangup && callState.value === "connected") {
            console.log("[phoneCall] AI 主動掛斷", parsed.hangup.reason || "");
            const delay = Math.min(
              4000,
              1500 + Math.max(0, parsed.messages.length - 1) * 800,
            );
            setTimeout(() => {
              if (callState.value === "connected") {
                endCall();
              }
            }, delay);
          }
        }
      }
    } catch (error) {
      const { useAIGenerationStore: useAIGen } = await import("@/stores");
      useAIGen().setError(phoneTaskId, String(error));
      callMessages.value = callMessages.value.filter((m) => !m.isStreaming);
    } finally {
      isGenerating.value = false;
      abortController = null;
    }
  }

  // ===== 解析 JSON 輸出 =====
  function parsePhoneJsonOutput(content: string): {
    messages: { text: string; tone?: string }[];
    hangup?: { reason?: string };
  } {
    if (!content?.trim()) return { messages: [{ text: "..." }] };
    let cleaned = content.replace(/^[\s\S]*?<\/think(?:ing)?>\s*/si, "")
      .replace(/```json\s*/gi, "").replace(/```\s*/g, "")
      // 剝離 MVU 變量更新標籤（卡內帶 MVU 時 AI 會輸出這些）
      .replace(/<UpdateVariable>[\s\S]*?<\/UpdateVariable>/gi, "")
      .replace(/<update>[\s\S]*?<\/update>/gi, "")
      .replace(/<Analysis>[\s\S]*?<\/Analysis>/gi, "")
      // 剝離 affinity-update 標籤
      .replace(/<affinity-update\s+[^>]*?\s*\/?>/gi, "")
      // 剝離噗浪發文標籤
      .replace(/<plurk>[\s\S]*?<\/plurk>/gi, "")
      .trim();
    // 來電 assistant prefill 會導致 AI 回覆缺少開頭的 [，自動補齊
    if (cleaned.startsWith("{") && !cleaned.startsWith("[")) {
      cleaned = "[" + cleaned;
    }
    const jsonMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (jsonMatch) {
      try {
        const s = jsonMatch[0].replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'");
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const messages: { text: string; tone?: string }[] = [];
          let hangup: { reason?: string } | undefined;
          for (const item of parsed) {
            if (!item || typeof item !== "object") continue;
            const action = typeof item.action === "string" ? item.action.toLowerCase() : "";
            const isHangup =
              action === "hangup" ||
              action === "hang_up" ||
              action === "endcall" ||
              action === "end_call" ||
              item.endCall === true ||
              item.hangup === true;
            if (isHangup) {
              hangup = { reason: typeof item.reason === "string" ? item.reason : undefined };
              // 動作項目仍可能附帶最後一句話
              const rawText = item.text ?? item.content;
              const text = rawText !== undefined && rawText !== null ? String(rawText).trim() : "";
              if (text) {
                messages.push({ text, tone: item.tone || item.emotion });
              }
              continue;
            }
            const rawText = item.text ?? item.content;
            if (rawText === undefined || rawText === null) continue;
            const text = String(rawText).trim();
            if (!text) continue;
            messages.push({ text, tone: item.tone || item.emotion });
          }
          if (messages.length === 0 && !hangup) {
            messages.push({ text: "..." });
          }
          return { messages, hangup };
        }
      } catch { /* fall through */ }
    }
    const voiceMatch = cleaned.match(/<voice>([\s\S]*?)<\/voice>/i);
    if (voiceMatch) return { messages: [{ text: voiceMatch[1].trim() || "..." }] };
    cleaned = cleaned.replace(/<\/?(?:voice|content|msg)>/gi, "").trim();
    return { messages: cleaned ? [{ text: cleaned }] : [{ text: "..." }] };
  }

  // ===== 從 AI 回覆中提取並套用 MVU 變量更新 =====
  async function applyMvuUpdatesFromResponse(rawContent: string) {
    try {
      const updates = parseAffinityUpdateTags(rawContent);
      if (!updates.length) return;

      const info = activeCall.value;
      const chatId = info?.chatId;
      if (!chatId) {
        console.log("[phoneCall] 無 chatId，跳過 MVU 更新");
        return;
      }

      const { useAffinityStore } = await import("@/stores/affinity");
      const affinityStore = useAffinityStore();

      // 確認好感度功能已啟用
      const chat = await db.get<any>(DB_STORES.CHATS, chatId);
      const affinityConfig = chat?.affinityConfig;
      if (!affinityConfig?.enabled) {
        console.log("[phoneCall] 好感度未啟用，跳過 MVU 更新");
        return;
      }

      affinityStore.resetMvuDeltaData(chatId);
      affinityStore.batchUpdateByPath(chatId, updates);
      console.log(
        "[phoneCall] MVU 變量更新:",
        updates
          .map((u) => {
            if (u.stringValue !== undefined) return `${u.metric} → "${u.stringValue}"`;
            if (u.isAbsolute && u.absoluteValue !== undefined) return `${u.metric} = ${u.absoluteValue}`;
            return `${u.metric} ${u.change > 0 ? "+" : ""}${u.change}`;
          })
          .join(", "),
      );
    } catch (err) {
      console.error("[phoneCall] MVU 更新失敗:", err);
    }
  }

  // ===== AI 決定是否接聽 =====
  async function checkIfShouldAnswer(info: ActiveCallInfo): Promise<PhoneAnswerDecision> {
    try {
      const { useCharactersStore, useSettingsStore } = await import("@/stores");
      const { useUserStore } = await import("@/stores/user");

      const char = useCharactersStore().characters.find((c) => c.id === info.characterId);
      if (!char) return { shouldAnswer: true };

      const userStore = useUserStore();
      const userName = userStore.currentPersona?.name || "User";

      const currentMissedCount = getMissedCallCount(info.characterId);
      if (currentMissedCount >= 2) return { shouldAnswer: true };

      const now = new Date();
      const lastChatTime = info.lastMessageTime ? formatTimeSince(info.lastMessageTime) : "未知";
      const callAttemptInfo = currentMissedCount > 0 ? `\n⚠️ 這是第 ${currentMissedCount + 1} 次來電` : "";

      const decisionPrompt = `你是 ${char.data.name}，${userName} 正在打電話給你。
角色性格：${char.data.personality || "無特別設定"}
當前時間：${now.toLocaleTimeString("zh-TW")}（${now.toLocaleDateString("zh-TW")}）
上次聊天：${lastChatTime}${callAttemptInfo}
最近聊天紀錄：
${recentChatHistory.value.slice(-5).map((m) => `${m.name}: ${m.content}`).join("\n") || "（無）"}
重要事件：
${importantEvents.value.slice(0, 3).map((e) => `- ${e.content}`).join("\n") || "（無）"}
請決定是否接聽。
若拒接，回覆 JSON：{"answer": false, "reason": "簡短原因"}
若接聽，回覆 JSON：{"answer": true, "reason": "簡短原因", "openingMessages": [{"text": "第一句", "tone": "語氣"}, {"text": "第二句", "tone": "語氣"}]}
規則：
1. 大多數情況接聽（80%以上），只有角色性格或情境非常不適合時才拒接。
2. 若 answer=true，openingMessages 必填，數量為 1 到 3 條。
3. 每條都要是角色接起 ${userName} 的電話後立刻說出口的自然台詞，可依節奏拆成短句，並為每條提供 tone。
4. 不要寫旁白、動作描述、說明、引號或 JSON 以外內容。
5. 只輸出一個 JSON 物件，不要加任何額外文字。
6. 為了相容舊格式，你也可以額外附帶 opening 字串，但以 openingMessages 為主。`;

      const settingsStore = useSettingsStore();
      const phoneCallDecisionConfig = settingsStore.getAPIForTask("phoneCall");
      const client = new OpenAICompatibleClient(phoneCallDecisionConfig.api);
      const response = await client.generate({
        messages: [{ role: "user", content: decisionPrompt }],
        settings: {
          maxContextLength: phoneCallDecisionConfig.generation.maxContextLength,
          maxResponseLength: phoneCallDecisionConfig.generation.maxTokens,
          temperature: phoneCallDecisionConfig.generation.temperature,
          topP: phoneCallDecisionConfig.generation.topP,
          frequencyPenalty: phoneCallDecisionConfig.generation.frequencyPenalty,
          presencePenalty: phoneCallDecisionConfig.generation.presencePenalty,
          repetitionPenalty: 1,
          stopSequences: [],
          streaming: false,
          useStreamingWindow: false,
          ...pickGenerationToggles(phoneCallDecisionConfig.generation),
        },
        apiSettings: phoneCallDecisionConfig.api,
      });

      const jsonMatch = response.content.trim().match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const openingMessages = Array.isArray(parsed.openingMessages)
          ? parsed.openingMessages
            .map((item: any) => ({
              text: String(item?.text || item?.content || "").trim(),
              tone: typeof item?.tone === "string"
                ? item.tone.trim()
                : typeof item?.emotion === "string"
                  ? item.emotion.trim()
                  : undefined,
            }))
            .filter((item: { text: string; tone?: string }) => item.text)
            .slice(0, 3)
          : [];
        const legacyOpening = typeof parsed.opening === "string"
          ? parsed.opening
          : typeof parsed.text === "string"
            ? parsed.text
            : typeof parsed.content === "string"
              ? parsed.content
              : typeof parsed.message === "string"
                ? parsed.message
                : "";
        return {
          shouldAnswer: parsed.answer !== false,
          reason: parsed.reason || "",
          opening: legacyOpening,
          openingMessages: openingMessages.length > 0
            ? openingMessages
            : legacyOpening.trim()
              ? [{ text: legacyOpening.trim() }]
              : [],
        };
      }
    } catch { /* 默認接聽 */ }
    return { shouldAnswer: true };
  }

  // ===== 載入輔助資料 =====
  async function loadSummariesAndEvents(info: ActiveCallInfo) {
    try {
      const allSummaries = await db.getAll<any>(DB_STORES.SUMMARIES);
      summaries.value = allSummaries
        .filter((s: any) => s.chatId === info.chatId || s.characterId === info.characterId)
        .map((s: any) => ({ id: s.id, content: s.content, createdAt: s.createdAt, isImportant: s.isImportant }))
        .sort((a: any, b: any) => b.createdAt - a.createdAt).slice(0, 5);

      const allEvents = await db.getAll<any>(DB_STORES.IMPORTANT_EVENTS);
      importantEvents.value = allEvents
        .filter((e: any) => e.characterId === info.characterId)
        .map((e: any) => ({ id: e.id, content: e.content, category: e.category, priority: e.priority }));

      if (info.chatId) {
        // 包含普通聊天消息和通話記錄（sender === "system" 且含通話內容）
        const msgs = (await loadMessages(info.chatId)).filter((m: any) => {
          if (m.sender === "user" || m.sender === "assistant") return true;
          if (m.sender === "system" && typeof m.content === "string" && m.content.includes("📞 通話結束")) return true;
          return false;
        }).slice(-15);
        recentChatHistory.value = msgs.map((m: any) => ({
          role: (m.is_user ? "user" : "assistant") as "user" | "assistant",
          name: m.name,
          content: m.content,
          createdAt: m.createdAt,
        }));
      }
    } catch { /* 忽略 */ }
  }

  // ===== 工具函數 =====
  function formatTimeSince(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (days > 0) return `${days} 天前`;
    if (hours > 0) return `${hours} 小時前`;
    if (minutes > 0) return `${minutes} 分鐘前`;
    return "剛剛";
  }

  const MISSED_CALL_KEY = "phone_missed_calls";
  function getMissedCallCount(characterId: string): number {
    try {
      const records = JSON.parse(localStorage.getItem(MISSED_CALL_KEY) || "{}");
      const record = records[characterId];
      if (!record) return 0;
      if (Date.now() - record.lastTime > 3600000) return 0;
      return record.count;
    } catch { return 0; }
  }
  function updateMissedCallCount(characterId: string, count: number) {
    try {
      const records = JSON.parse(localStorage.getItem(MISSED_CALL_KEY) || "{}");
      if (count === 0) delete records[characterId];
      else records[characterId] = { count, lastTime: Date.now() };
      localStorage.setItem(MISSED_CALL_KEY, JSON.stringify(records));
    } catch { /* 忽略 */ }
  }

  function cleanup() {
    if (durationTimer) { clearInterval(durationTimer); durationTimer = null; }
    if (autoAnswerTimer) { clearTimeout(autoAnswerTimer); autoAnswerTimer = null; }
    if (abortController) { abortController.abort(); abortController = null; }
    stopPlayback();
  }

  // ===== 通話快照（防止頁面關閉/崩潰時丟失） =====
  const CALL_SNAPSHOT_KEY = "phone_call_snapshot";

  /** 把當前通話狀態存進 localStorage（IDB 是非同步，beforeunload 來不及） */
  function saveCallSnapshot() {
    if (!activeCall.value || callState.value === "ended" || callState.value === "rejected") {
      localStorage.removeItem(CALL_SNAPSHOT_KEY);
      return;
    }
    const snapshot = {
      activeCall: activeCall.value,
      callState: callState.value,
      callDuration: callDuration.value,
      callStartedAt: callStartedAt.value,
      // 避免把大圖 base64 存進 localStorage 導致超量
      callMessages: callMessages.value
        .filter((m) => !m.isStreaming)
        // 避免把大圖與 base64 音頻存進 localStorage 導致超量
        .map(({ imageData: _img, imageMimeType: _mime, audioUrl: _audio, ...rest }) => rest),
      videoSession: videoSession.value,
      savedAt: Date.now(),
    };
    localStorage.setItem(CALL_SNAPSHOT_KEY, JSON.stringify(snapshot));
  }

  /** 讀取快照，若存在且未過期（1小時內）則返回 */
  function loadCallSnapshot(): {
    activeCall: ActiveCallInfo;
    callState: CallState;
    callDuration: number;
    callStartedAt?: number | null;
    callMessages: CallMessage[];
    videoSession?: VideoCallSession;
    savedAt: number;
  } | null {
    try {
      const raw = localStorage.getItem(CALL_SNAPSHOT_KEY);
      if (!raw) return null;
      const snapshot = JSON.parse(raw);
      // 超過 1 小時視為過期
      if (Date.now() - snapshot.savedAt > 3600000) {
        localStorage.removeItem(CALL_SNAPSHOT_KEY);
        return null;
      }
      return snapshot;
    } catch {
      return null;
    }
  }

  /** 清除快照 */
  function clearCallSnapshot() {
    localStorage.removeItem(CALL_SNAPSHOT_KEY);
  }

  /** 從快照恢復通話（重新接入） */
  async function resumeFromSnapshot() {
    const snapshot = loadCallSnapshot();
    if (!snapshot) return;
    clearCallSnapshot();

    activeCall.value = snapshot.activeCall;
    callState.value = "connected";
    callDuration.value = snapshot.callDuration;
    callStartedAt.value = snapshot.callStartedAt ?? Math.max(snapshot.savedAt - snapshot.callDuration * 1000, 0);
    callMessages.value = snapshot.callMessages;
    isExpanded.value = true;
    videoSession.value =
      snapshot.videoSession ||
      {
        isActive: false,
        remoteImageUrl: "",
        localImageUrl: "",
      };

    // 重新啟動計時器
    durationTimer = setInterval(() => { callDuration.value++; }, 1000);

    // 載入輔助資料
    await loadSummariesAndEvents(snapshot.activeCall);
  }

  /** 把快照中的通話記錄存進 IDB 後清除（選擇掛掉時） */
  async function discardSnapshot() {
    const snapshot = loadCallSnapshot();
    clearCallSnapshot();
    if (!snapshot?.activeCall?.chatId || snapshot.callMessages.filter((m) => m.role !== "system").length === 0) return;

    try {
      const chat = await db.get<any>(DB_STORES.CHATS, snapshot.activeCall.chatId);
      if (!chat) return;
      const msgs = snapshot.callMessages.filter((m) => m.role !== "system");
      const endedAt = Date.now();
      const startedAt =
        snapshot.callStartedAt ??
        Math.max(snapshot.savedAt - snapshot.callDuration * 1000, 0);
      const callRecordMessage = {
        id: `msg_call_${Date.now()}`,
        role: "system", sender: "system", name: "系統", is_user: false,
        content: buildPhoneCallRecordContent({
          title: "📞 通話結束（頁面關閉）",
          durationSeconds: snapshot.callDuration,
          startedAt,
          endedAt,
          characterName: snapshot.activeCall.characterName,
          messages: msgs,
        }),
        isPhoneCallHistory: true,
        phoneCallHistoryData: buildPhoneCallHistoryData({
          characterName: snapshot.activeCall.characterName,
          characterAvatar: snapshot.activeCall.characterAvatar,
          startedAt,
          endedAt,
          messages: msgs,
        }),
        timestamp: endedAt, createdAt: endedAt, updatedAt: endedAt, status: "sent",
      };
      // v24：用 appendChatMessages 追加通話記錄
      await appendMessages(chat.id, [callRecordMessage as any]);
      await refreshChatDerivedMetadata(chat.id);
    } catch { /* 忽略 */ }
  }

  return {
    activeCall, callState, callMessages, callDuration, isGenerating,
    rejectReason, isMuted, isSpeaker, ttsAvailable, ttsError, isExpanded,
    playingMessageId,
    videoConfig, videoSession,
    isActive, isVideoCallActive, formattedDuration, canRegenerateLastAi, canTriggerManualResponse,
    startCall, startVideoCall, endCall, sendMessage, addUserMessage, triggerAIResponse, handleAnswer, regenerateLastAiResponse,
    playMessageAudio,
    updateVideoConfig,
    minimize, expand, toggleMuteState, toggleSpeakerState,
    saveCallSnapshot, loadCallSnapshot, clearCallSnapshot, resumeFromSnapshot, discardSnapshot,
  };
});
