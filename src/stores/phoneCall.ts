/**
 * 全局電話通話 Store
 * 讓通話狀態在全局持久，可以離開聊天頁面繼續通話
 */

import { OpenAICompatibleClient } from "@/api/OpenAICompatible";
import { useStreamingWindow } from "@/composables/useStreamingWindow";
import { db, DB_STORES } from "@/db/database";
import { PromptBuilder } from "@/engine/prompt/PromptBuilder";
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
  const isGenerating = ref(false);
  const rejectReason = ref("");
  const isMuted = ref(false);
  const isSpeaker = ref(false);

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

    durationTimer = setInterval(() => {
      callDuration.value++;
    }, 1000);
  }

  // ===== 開始通話 =====
  async function startCall(info: ActiveCallInfo) {
    // 清理舊通話
    cleanup();

    activeCall.value = info;
    callState.value = "ringing";
    callMessages.value = [];
    callDuration.value = 0;
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
        await handleAnswer();
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
  async function handleAnswer() {
    callState.value = "connected";
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
      const chat = await db.get<any>(DB_STORES.CHATS, info.chatId);
      if (!chat) return;

      const mins = Math.floor(callDuration.value / 60);
      const secs = callDuration.value % 60;
      const durationText = mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`;

      const callRecordMessage = {
        id: `msg_call_${Date.now()}`,
        role: "system",
        sender: "system",
        name: "系統",
        is_user: false,
        content: `📞 通話結束\n時長：${durationText}\n\n--- 通話內容 ---\n${msgs.map((m) => `${m.role === "user" ? "你" : info.characterName}: ${m.content}`).join("\n")}`,
        timestamp: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: "sent",
      };

      chat.messages = [...(chat.messages || []), callRecordMessage];
      chat.updatedAt = Date.now();
      await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)));
      console.log("[phoneCall] 通話記錄已直接寫入 IndexedDB");
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
  function toggleSpeakerState() { isSpeaker.value = !isSpeaker.value; }

  // ===== 重新生成最後一輪 AI 回覆（移除尾端 AI 連續段後重生） =====
  async function regenerateLastAiResponse() {
    if (!canRegenerateLastAi.value || isGenerating.value) return;

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

      const now = new Date();
      const lastChatTime = info.lastMessageTime ? formatTimeSince(info.lastMessageTime) : "未知";

      // 向量記憶檢索（使用全域開關）
      let vectorMemories: import('@/services/memoryRetriever').RetrievedMemory[] | undefined;
      if (info.chatId) {
        try {
          const chat = await db.get<any>(DB_STORES.CHATS, info.chatId);
          const summarySettings = chat?.summarySettings;
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
          topK: 0, frequencyPenalty: 0, presencePenalty: 0, repetitionPenalty: 1,
          stopSequences: [], streaming: isStreamingEnabled, useStreamingWindow: useWindow,
        },
        userName: userStore.currentPersona?.name || "User",
        userPersona: userStore.currentPersona?.description,
        promptManagerConfig: promptManagerStore.config,
        phoneCallMode: true,
        incomingCallMode: info.isIncoming && isIncomingFirstMessage,
        callReason: info.callReason,
        summaries: summaries.value,
        vectorMemories,
        importantEvents: importantEvents.value,
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
          topK: 0, frequencyPenalty: 0, presencePenalty: 0, repetitionPenalty: 1,
          stopSequences: [], streaming: isStreamingEnabled, useStreamingWindow: useWindow,
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
          for (const p of parsed) {
            callMessages.value.push({
              id: `call_msg_ai_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              role: "ai", content: p.text, timestamp: Date.now(),
              isStreaming: false, tone: p.tone,
            });
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
  function parsePhoneJsonOutput(content: string): { text: string; tone?: string }[] {
    if (!content?.trim()) return [{ text: "..." }];
    let cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    // 來電 assistant prefill 會導致 AI 回覆缺少開頭的 [，自動補齊
    if (cleaned.startsWith("{") && !cleaned.startsWith("[")) {
      cleaned = "[" + cleaned;
    }
    const jsonMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (jsonMatch) {
      try {
        let s = jsonMatch[0].replace(/[""]/g, '"').replace(/['']/g, "'");
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed) && parsed.length > 0)
          return parsed.map((item) => ({ text: String(item.text || item.content || "..."), tone: item.tone || item.emotion }));
      } catch { /* fall through */ }
    }
    const voiceMatch = cleaned.match(/<voice>([\s\S]*?)<\/voice>/i);
    if (voiceMatch) return [{ text: voiceMatch[1].trim() || "..." }];
    cleaned = cleaned.replace(/<\/?(?:voice|output|msg)>/gi, "").trim();
    return cleaned ? [{ text: cleaned }] : [{ text: "..." }];
  }

  // ===== AI 決定是否接聽 =====
  async function checkIfShouldAnswer(info: ActiveCallInfo): Promise<{ shouldAnswer: boolean; reason?: string }> {
    try {
      const { useCharactersStore, useSettingsStore } = await import("@/stores");
      const char = useCharactersStore().characters.find((c) => c.id === info.characterId);
      if (!char) return { shouldAnswer: true };

      const currentMissedCount = getMissedCallCount(info.characterId);
      if (currentMissedCount >= 2) return { shouldAnswer: true };

      const now = new Date();
      const lastChatTime = info.lastMessageTime ? formatTimeSince(info.lastMessageTime) : "未知";
      const callAttemptInfo = currentMissedCount > 0 ? `\n⚠️ 這是第 ${currentMissedCount + 1} 次來電` : "";

      const decisionPrompt = `你是 ${char.data.name}，${info.characterName} 正在打電話給你。
角色性格：${char.data.personality || "無特別設定"}
當前時間：${now.toLocaleTimeString("zh-TW")}（${now.toLocaleDateString("zh-TW")}）
上次聊天：${lastChatTime}${callAttemptInfo}
最近聊天紀錄：
${recentChatHistory.value.slice(-5).map((m) => `${m.name}: ${m.content}`).join("\n") || "（無）"}
重要事件：
${importantEvents.value.slice(0, 3).map((e) => `- ${e.content}`).join("\n") || "（無）"}
請決定是否接聽。回覆 JSON：{"answer": true/false, "reason": "簡短原因"}
規則：大多數情況接聽（80%以上），只有角色性格或情境非常不適合時才拒接。`;

      const settingsStore = useSettingsStore();
      const phoneCallDecisionConfig = settingsStore.getAPIForTask("phoneCall");
      const client = new OpenAICompatibleClient(phoneCallDecisionConfig.api);
      const response = await client.generate({
        messages: [{ role: "user", content: decisionPrompt }],
        settings: { maxContextLength: 32768, maxResponseLength: 32768, temperature: 0.7, topP: 1, topK: 0, frequencyPenalty: 0, presencePenalty: 0, repetitionPenalty: 1, stopSequences: [], streaming: false, useStreamingWindow: false },
        apiSettings: phoneCallDecisionConfig.api,
      });

      const jsonMatch = response.content.trim().match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return { shouldAnswer: parsed.answer !== false, reason: parsed.reason || "" };
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
        const chat = await db.get<any>(DB_STORES.CHATS, info.chatId);
        // 包含普通聊天消息和通話記錄（sender === "system" 且含通話內容）
        const msgs = (chat?.messages || []).filter((m: any) => {
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
      // 避免把大圖 base64 存進 localStorage 導致超量
      callMessages: callMessages.value
        .filter((m) => !m.isStreaming)
        .map(({ imageData: _img, imageMimeType: _mime, ...rest }) => rest),
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
      const mins = Math.floor(snapshot.callDuration / 60);
      const secs = snapshot.callDuration % 60;
      const durationText = mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`;
      const callRecordMessage = {
        id: `msg_call_${Date.now()}`,
        role: "system", sender: "system", name: "系統", is_user: false,
        content: `📞 通話結束（頁面關閉）\n時長：${durationText}\n\n--- 通話內容 ---\n${msgs.map((m) => `${m.role === "user" ? "你" : snapshot.activeCall.characterName}: ${m.content}`).join("\n")}`,
        timestamp: Date.now(), createdAt: Date.now(), updatedAt: Date.now(), status: "sent",
      };
      chat.messages = [...(chat.messages || []), callRecordMessage];
      chat.updatedAt = Date.now();
      await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)));
    } catch { /* 忽略 */ }
  }

  return {
    activeCall, callState, callMessages, callDuration, isGenerating,
    rejectReason, isMuted, isSpeaker, isExpanded,
    videoConfig, videoSession,
    isActive, isVideoCallActive, formattedDuration, canRegenerateLastAi, canTriggerManualResponse,
    startCall, startVideoCall, endCall, sendMessage, addUserMessage, triggerAIResponse, handleAnswer, regenerateLastAiResponse,
    updateVideoConfig,
    minimize, expand, toggleMuteState, toggleSpeakerState,
    saveCallSnapshot, loadCallSnapshot, clearCallSnapshot, resumeFromSnapshot, discardSnapshot,
  };
});
