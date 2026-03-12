import { ref, type Ref, type ComputedRef } from "vue";
import { db, DB_STORES } from "@/db/database";
import { OpenAICompatibleClient } from "@/api/OpenAICompatible";
import type { SummarySettings } from "@/types/chat";
import {
  useAIGenerationStore,
  usePromptManagerStore,
  useSettingsStore,
} from "@/stores";
import { useNotificationStore } from "@/stores/notification";

interface Message {
  id: string;
  role: "user" | "ai" | "system";
  content: string;
  timestamp: number;
  [key: string]: any;
}

type SummaryItem = {
  id: string;
  content: string;
  createdAt: number;
  messageCount: number;
  isImportant?: boolean;
  isManual?: boolean;
  isMeta?: boolean;
};

type DiaryItem = {
  id: string;
  content: string;
  summary: string;
  createdAt: number;
  messageCount: number;
  isFavorite?: boolean;
  status: "writing" | "ready";
};

interface StreamingWindow {
  show: (model: string) => void;
  appendToken: (token: string) => void;
  setComplete: () => void;
}

/**
 * 總結/日記自動觸發 + 手動總結 + 元總結 + CRUD
 * 從 ChatScreen.vue 抽取的獨立 composable
 */
export function useChatSummaryDiary(deps: {
  messages: Ref<Message[]>;
  currentChatId: Ref<string | null>;
  currentCharacter: ComputedRef<any>;
  effectivePersona: ComputedRef<any>;
  isGenerating: ComputedRef<boolean>;
  isGeneratingSummary: Ref<boolean>;
  chatSummarySettings: Ref<SummarySettings>;
  chatSummaries: Ref<SummaryItem[]>;
  chatDiaries: Ref<DiaryItem[]>;
  lastSummaryTime: Ref<number>;
  lastDiaryTime: Ref<number>;
  streamingWindow: StreamingWindow;
  useStreamingWindowEnabled: ComputedRef<boolean>;
  characterId: string;
  characterName: string;
  characterAvatar: string;
  chatId: string;
  saveChat: () => void;
  triggerAutoEventsExtraction: (recentMessages?: Message[]) => Promise<void>;
}) {
  const aiGenerationStore = useAIGenerationStore();
  const settingsStore = useSettingsStore();
  const promptManagerStore = usePromptManagerStore();
  const notificationStore = useNotificationStore();

  // 生成鎖定
  const summaryGeneratingLock = ref(false);
  const diaryGeneratingLock = ref(false);

  // 清理 AI 生成內容中的 <output>/<think> 標籤
  function stripOutputTags(text: string): string {
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
    const match = cleaned.match(/<output>([\s\S]*?)<\/output>/i);
    if (match) return match[1].trim();
    return cleaned.replace(/<\/?output>/gi, "").trim();
  }

  // IDB 持久化 helpers
  async function saveSummary(summary: SummaryItem) {
    const chatId = deps.currentChatId.value || deps.chatId || "";
    const charId = deps.characterId || deps.currentCharacter.value?.id || "";
    const dbSummary = { ...summary, chatId, characterId: charId };
    await db.put(DB_STORES.SUMMARIES, JSON.parse(JSON.stringify(dbSummary)));
    console.log("[SummaryDiary] 總結已保存:", summary.id);
  }

  async function deleteSummaryFromDB(id: string) {
    await db.delete(DB_STORES.SUMMARIES, id);
    console.log("[SummaryDiary] 總結已刪除:", id);
  }

  async function saveDiary(diary: DiaryItem) {
    const chatId = deps.currentChatId.value || deps.chatId || "";
    const charId = deps.characterId || deps.currentCharacter.value?.id || "";
    const dbDiary = { ...diary, chatId, characterId: charId };
    await db.put(DB_STORES.DIARIES, JSON.parse(JSON.stringify(dbDiary)));
    console.log("[SummaryDiary] 日記已保存:", diary.id);
  }

  async function deleteDiaryFromDB(id: string) {
    await db.delete(DB_STORES.DIARIES, id);
    console.log("[SummaryDiary] 日記已刪除:", id);
  }

  // 計算對話輪次
  function countConversationTurns(msgs: Message[]): number {
    let turns = 0;
    let hasUserInCurrentTurn = false;
    let hasAiInCurrentTurn = false;

    for (const msg of msgs) {
      if (msg.role === "user") {
        if (hasUserInCurrentTurn && hasAiInCurrentTurn) {
          turns++;
          hasUserInCurrentTurn = false;
          hasAiInCurrentTurn = false;
        }
        hasUserInCurrentTurn = true;
      } else if (msg.role === "ai") {
        hasAiInCurrentTurn = true;
      }
    }

    if (hasUserInCurrentTurn && hasAiInCurrentTurn) {
      turns++;
    }

    return turns;
  }

  // 檢查並觸發總結或日記生成
  function checkAndTriggerSummaryOrDiary() {
    if (!deps.currentChatId.value || deps.messages.value.length === 0) return;

    const settings = deps.chatSummarySettings.value;
    const intervalMode = settings.intervalMode;

    const validMessages = deps.messages.value.filter(
      (m) => m.role === "user" || m.role === "ai",
    );

    const messagesSinceLastSummary = deps.lastSummaryTime.value
      ? validMessages.filter((m) => m.timestamp > deps.lastSummaryTime.value)
      : validMessages;

    const messagesSinceLastDiary = deps.lastDiaryTime.value
      ? validMessages.filter((m) => m.timestamp > deps.lastDiaryTime.value)
      : validMessages;

    let summaryProgress: number;
    let diaryProgress: number;
    let summaryInterval: number;
    let diaryInterval: number;

    if (intervalMode === "turn") {
      summaryProgress = countConversationTurns(messagesSinceLastSummary);
      diaryProgress = countConversationTurns(messagesSinceLastDiary);
      summaryInterval = settings.summaryIntervalTurn;
      diaryInterval = settings.diaryIntervalTurn;
    } else {
      summaryProgress = messagesSinceLastSummary.length;
      diaryProgress = messagesSinceLastDiary.length;
      summaryInterval = settings.summaryIntervalMessage;
      diaryInterval = settings.diaryIntervalMessage;
    }

    if (summaryProgress >= summaryInterval && !summaryGeneratingLock.value) {
      summaryGeneratingLock.value = true;
      setTimeout(() => {
        triggerAutoSummary();
      }, 2000);
    }

    if (diaryProgress >= diaryInterval && !diaryGeneratingLock.value) {
      diaryGeneratingLock.value = true;
      setTimeout(() => {
        triggerAutoDiary();
      }, 4000);
    }
  }

  // 自動觸發總結生成
  async function triggerAutoSummary() {
    if (deps.isGeneratingSummary.value || !deps.currentChatId.value) {
      summaryGeneratingLock.value = false;
      return;
    }

    try {
      await handleTriggerManualSummary({
        actualMessageCount: deps.chatSummarySettings.value.actualMessageCount,
        actualMessageMode: deps.chatSummarySettings.value.actualMessageMode,
      });

      deps.lastSummaryTime.value = Date.now();
      console.log("📝 自動總結生成完成");

      const char = deps.currentCharacter.value;
      if (char && deps.currentChatId.value) {
        notificationStore.notifyChatSummary(
          char.nickname || char.data?.name || "角色",
          deps.currentChatId.value,
          char.id,
        );
      }
    } catch (e) {
      console.error("📝 自動總結生成失敗:", e);
    } finally {
      summaryGeneratingLock.value = false;
    }
  }

  // 自動觸發日記生成
  async function triggerAutoDiary() {
    if (diaryGeneratingLock.value === false) return;
    if (!deps.currentChatId.value) {
      diaryGeneratingLock.value = false;
      return;
    }

    if (deps.isGenerating.value || deps.isGeneratingSummary.value) {
      console.log("📔 其他生成進行中，延遲日記生成");
      setTimeout(() => triggerAutoDiary(), 5000);
      return;
    }

    console.log("📔 開始自動生成日記...");

    const chatId = deps.currentChatId.value;
    const char = deps.currentCharacter.value;

    if (!char) {
      console.warn("📔 無法生成日記：未找到角色");
      diaryGeneratingLock.value = false;
      return;
    }

    const result = aiGenerationStore.startGeneration(chatId, "diary", {
      characterName: char.data.name || deps.characterName,
      characterAvatar: char.avatar || deps.characterAvatar,
    });

    if (!result.success) {
      console.warn("📔 無法開始日記生成:", result.error);
      diaryGeneratingLock.value = false;
      return;
    }

    try {
      const taskConfig = settingsStore.getAPIForTask("diary");

      if (
        !taskConfig.api.endpoint ||
        !taskConfig.api.apiKey ||
        !taskConfig.api.model
      ) {
        throw new Error("請先在設定中配置 API");
      }

      await promptManagerStore.loadConfig();

      const validMessages = deps.messages.value.filter(
        (m) => m.role === "user" || m.role === "ai",
      );

      const settings = deps.chatSummarySettings.value;
      let messagesToUse: typeof validMessages;

      if (settings.actualMessageMode === "turn") {
        messagesToUse = validMessages.slice(-(settings.actualMessageCount * 2));
      } else {
        messagesToUse = validMessages.slice(-settings.actualMessageCount);
      }

      const now = new Date();
      const currentDateTime = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
      const weekDays = ["日", "一", "二", "三", "四", "五", "六"];
      const currentDateTimeFull = `${currentDateTime} 星期${weekDays[now.getDay()]}`;

      const recentMessagesText = messagesToUse
        .map(
          (m) =>
            `${m.role === "user" ? deps.effectivePersona.value?.name || "User" : char.data.name}: ${m.content}`,
        )
        .join("\n\n");

      const diaryPromptDefs = promptManagerStore.diaryPrompts;
      const diaryPromptOrder = promptManagerStore.diaryPromptOrder;

      const diaryPrompts: Array<{
        role: "system" | "user" | "assistant";
        content: string;
      }> = [];

      for (const orderEntry of diaryPromptOrder) {
        if (!orderEntry.enabled) continue;
        const promptDef = diaryPromptDefs.find(
          (p) => p.identifier === orderEntry.identifier,
        );
        if (!promptDef) continue;

        let content = promptDef.content
          .replace(/\{\{char\}\}/g, char.data.name)
          .replace(/\{\{user\}\}/g, deps.effectivePersona.value?.name || "User")
          .replace(/\{\{charDescription\}\}/g, char.data.description || "")
          .replace(/\{\{charPersonality\}\}/g, char.data.personality || "")
          .replace(
            /\{\{userPersona\}\}/g,
            deps.effectivePersona.value?.description || "",
          )
          .replace(/\{\{messagesForDiary\}\}/g, recentMessagesText)
          .replace(/\{\{recentMessages\}\}/g, recentMessagesText)
          .replace(/\{\{currentDateTime\}\}/g, currentDateTimeFull);

        diaryPrompts.push({
          role: promptDef.role as "system" | "user" | "assistant",
          content,
        });
      }

      if (diaryPrompts.length === 0) {
        diaryPrompts.push(
          {
            role: "system",
            content: `你是 ${char.data.name}，正在寫一篇私人日記。現在的真實時間是 ${currentDateTimeFull}。請用第一人稱，以 ${char.data.name} 的視角和語氣，記錄你對最近與 ${deps.effectivePersona.value?.name || "User"} 互動的感受和想法。

日記應該：
- 使用今天的真實日期（${currentDateTimeFull}）
- 反映 ${char.data.name} 的性格特點
- 嚴格基於以下對話內容，不要編造沒有發生過的事
- 包含對互動的真實感受
- 可以有一些私密的想法
- 長度適中（100-300字）`,
          },
          {
            role: "user",
            content: `以下是最近的對話記錄：

${recentMessagesText}

請以 ${char.data.name} 的身份寫一篇日記，記錄你對這些互動的感受和想法。`,
          },
        );
      }

      const client = new OpenAICompatibleClient(taskConfig.api);

      let diaryContent = "";
      const isStreamingEnabled = taskConfig.generation.streamingEnabled;
      const useWindow = isStreamingEnabled && deps.useStreamingWindowEnabled.value;

      if (useWindow) {
        deps.streamingWindow.show(taskConfig.api.model || "AI");
      }

      const streamGenerator = client.generateStream({
        messages: diaryPrompts,
        settings: {
          maxContextLength: taskConfig.generation.maxContextLength || 200000,
          maxResponseLength: taskConfig.generation.maxTokens || 4096,
          temperature: 0.8,
          topP: 0.9,
          topK: 0,
          frequencyPenalty: 0,
          presencePenalty: 0,
          repetitionPenalty: 1,
          stopSequences: [],
          streaming: true,
          useStreamingWindow: useWindow,
        },
        apiSettings: taskConfig.api,
        signal: result.controller?.signal,
      });

      for await (const event of streamGenerator) {
        if (event.type === "token" && event.token) {
          diaryContent += event.token;
          if (useWindow) {
            deps.streamingWindow.appendToken(event.token);
          }
          if (isStreamingEnabled) {
            aiGenerationStore.updateContent(chatId, diaryContent, "diary");
          }
        } else if (event.type === "done") {
          if (event.content && event.content.length > diaryContent.length) {
            diaryContent = event.content;
          }
        } else if (event.type === "error") {
          console.error("[Diary] Error:", event.error);
        }
      }
      if (useWindow) {
        deps.streamingWindow.setComplete();
      }
      if (!isStreamingEnabled) {
        aiGenerationStore.updateContent(chatId, diaryContent, "diary");
      }

      const newDiary: DiaryItem = {
        id: `diary_${Date.now()}`,
        content: stripOutputTags(diaryContent),
        summary: "",
        createdAt: Date.now(),
        messageCount: messagesToUse.length,
        isFavorite: false,
        status: "ready" as const,
      };

      deps.chatDiaries.value.push(newDiary);
      await saveDiary(newDiary);

      deps.lastDiaryTime.value = Date.now();
      console.log("📔 自動日記生成完成:", newDiary.id);

      if (char) {
        notificationStore.notifyDiaryEntry(
          char.nickname || char.data?.name || "角色",
          char.avatar,
          char.id,
          chatId,
        );
      }

      aiGenerationStore.completeGeneration(chatId, "diary", diaryContent);

      // 日記生成完成後，自動觸發重要事件提取
      deps.triggerAutoEventsExtraction(messagesToUse);
    } catch (e) {
      console.error("📔 自動日記生成失敗:", e);
      const errorMsg = e instanceof Error ? e.message : "未知錯誤";
      aiGenerationStore.setError(chatId, errorMsg, "diary");
    } finally {
      diaryGeneratingLock.value = false;
    }
  }

  // 手動觸發 AI 生成總結
  async function handleTriggerManualSummary(settings?: {
    actualMessageCount: number;
    actualMessageMode: "message" | "turn";
  }) {
    if (deps.isGeneratingSummary.value || deps.messages.value.length === 0) return;

    const chatId = deps.currentChatId.value;
    if (!chatId) return;

    const char = deps.currentCharacter.value;
    const result = aiGenerationStore.startGeneration(chatId, "summary", {
      characterName: char?.data.name || deps.characterName,
      characterAvatar: char?.avatar || deps.characterAvatar,
    });

    if (!result.success) {
      alert(result.error || "無法開始生成");
      return;
    }

    deps.isGeneratingSummary.value = true;

    try {
      const taskConfig = settingsStore.getAPIForTask("summary");

      if (
        !taskConfig.api.endpoint ||
        !taskConfig.api.apiKey ||
        !taskConfig.api.model
      ) {
        throw new Error("請先在設定中配置 API");
      }

      if (!char) throw new Error("未找到角色資料");

      await promptManagerStore.loadConfig();

      const summaryPromptDefs = promptManagerStore.summaryPrompts;
      const summaryPromptOrder = promptManagerStore.summaryPromptOrder;

      const actualCount =
        settings?.actualMessageCount ??
        deps.chatSummarySettings.value.actualMessageCount;
      const actualMode =
        settings?.actualMessageMode ??
        deps.chatSummarySettings.value.actualMessageMode;

      let messagesToRead: Message[];
      if (actualMode === "turn") {
        let turnCount = 0;
        let startIndex = deps.messages.value.length;
        for (
          let i = deps.messages.value.length - 1;
          i >= 0 && turnCount < actualCount;
          i--
        ) {
          if (deps.messages.value[i].role === "user") {
            turnCount++;
          }
          startIndex = i;
        }
        messagesToRead = deps.messages.value.slice(startIndex);
      } else {
        messagesToRead = deps.messages.value.slice(-actualCount);
      }

      const userName = deps.effectivePersona.value?.name || "User";
      const recentMessages = messagesToRead
        .map(
          (m) => `${m.role === "user" ? userName : char.data.name}: ${m.content}`,
        )
        .join("\n\n");

      const summaryPrompts: Array<{
        role: "system" | "user" | "assistant";
        content: string;
      }> = [];

      for (const orderEntry of summaryPromptOrder) {
        if (!orderEntry.enabled) continue;
        const promptDef = summaryPromptDefs.find(
          (p) => p.identifier === orderEntry.identifier,
        );
        if (!promptDef) continue;

        let content = promptDef.content
          .replace(/\{\{char\}\}/g, char.data.name)
          .replace(/\{\{user\}\}/g, deps.effectivePersona.value?.name || "User")
          .replace(/\{\{messagesForSummary\}\}/g, recentMessages)
          .replace(
            /\{\{userPersona\}\}/g,
            deps.effectivePersona.value?.description || "",
          )
          .replace(/\{\{charDescription\}\}/g, char.data.description || "");

        summaryPrompts.push({
          role: promptDef.role as "system" | "user" | "assistant",
          content,
        });
      }

      const client = new OpenAICompatibleClient(taskConfig.api);

      let summaryContent = "";
      const isStreamingEnabled = taskConfig.generation.streamingEnabled;
      const useWindow = isStreamingEnabled && deps.useStreamingWindowEnabled.value;

      if (useWindow) {
        deps.streamingWindow.show(taskConfig.api.model || "AI");
      }

      const streamGenerator = client.generateStream({
        messages: summaryPrompts,
        settings: {
          maxContextLength: taskConfig.generation.maxContextLength || 200000,
          maxResponseLength: taskConfig.generation.maxTokens || 8192,
          temperature: 0.7,
          topP: 0.9,
          topK: 0,
          frequencyPenalty: 0,
          presencePenalty: 0,
          repetitionPenalty: 1,
          stopSequences: [],
          streaming: true,
          useStreamingWindow: useWindow,
        },
        apiSettings: taskConfig.api,
        signal: result.controller?.signal,
      });

      for await (const event of streamGenerator) {
        if (event.type === "token" && event.token) {
          summaryContent += event.token;
          if (useWindow) {
            deps.streamingWindow.appendToken(event.token);
          }
          if (isStreamingEnabled) {
            aiGenerationStore.updateContent(chatId, summaryContent, "summary");
          }
        } else if (event.type === "done") {
          if (event.content && event.content.length > summaryContent.length) {
            summaryContent = event.content;
          }
        } else if (event.type === "error") {
          console.error("[Summary] Error:", event.error);
        }
      }
      if (useWindow) {
        deps.streamingWindow.setComplete();
      }
      if (!isStreamingEnabled) {
        aiGenerationStore.updateContent(chatId, summaryContent, "summary");
      }

      const newSummary: SummaryItem = {
        id: `summary_${Date.now()}`,
        content: stripOutputTags(summaryContent),
        createdAt: Date.now(),
        messageCount: deps.messages.value.length,
        isImportant: false,
        isManual: true,
        isMeta: false,
      };

      deps.chatSummaries.value.push(newSummary);
      await saveSummary(newSummary);
      console.log("[SummaryDiary] 手動總結生成完成:", newSummary);

      aiGenerationStore.completeGeneration(chatId, "summary", summaryContent);
    } catch (e) {
      console.error("生成總結失敗:", e);
      const errorMsg = e instanceof Error ? e.message : "未知錯誤";
      aiGenerationStore.setError(chatId, errorMsg, "summary");
      if (errorMsg !== "已中斷") {
        alert("生成總結失敗: " + errorMsg);
      }
    } finally {
      deps.isGeneratingSummary.value = false;
    }
  }

  // 處理總結設置保存
  async function handleSummarySettingsSave(settings: SummarySettings) {
    console.log("[SummaryDiary] 保存總結設置:", settings);
    deps.chatSummarySettings.value = { ...settings };
    await deps.saveChat();
    console.log("[SummaryDiary] 總結設置已保存到 IDB");
  }

  // 切換總結重要性
  async function handleToggleSummaryImportant(id: string) {
    const summary = deps.chatSummaries.value.find((s) => s.id === id);
    if (summary) {
      summary.isImportant = !summary.isImportant;
      await saveSummary(summary);
    }
  }

  // 刪除總結
  async function handleDeleteSummary(id: string) {
    deps.chatSummaries.value = deps.chatSummaries.value.filter((s) => s.id !== id);
    await deleteSummaryFromDB(id);
  }

  // 批量刪除選取的總結
  async function handleDeleteSelected(ids: string[]) {
    deps.chatSummaries.value = deps.chatSummaries.value.filter(
      (s) => !ids.includes(s.id),
    );
    await Promise.all(ids.map((id) => deleteSummaryFromDB(id)));
  }

  // 編輯總結
  function handleEditSummary(id: string, newContent: string) {
    const summary = deps.chatSummaries.value.find((s) => s.id === id);
    if (summary) {
      summary.content = newContent;
    }
  }

  // 生成元總結
  async function handleGenerateMetaSummary(summaryIds: string[]) {
    if (deps.isGeneratingSummary.value || summaryIds.length === 0) return;

    const chatId = deps.currentChatId.value;
    if (!chatId) return;

    const char = deps.currentCharacter.value;
    const result = aiGenerationStore.startGeneration(chatId, "meta-summary", {
      characterName: char?.data.name || deps.characterName,
      characterAvatar: char?.avatar || deps.characterAvatar,
    });

    if (!result.success) {
      alert(result.error || "無法開始生成");
      return;
    }

    deps.isGeneratingSummary.value = true;

    try {
      const selectedSummaries = deps.chatSummaries.value.filter((s) =>
        summaryIds.includes(s.id),
      );
      const combinedContent = selectedSummaries
        .map((s) => s.content)
        .join("\n\n---\n\n");

      if (!char) throw new Error("未找到角色資料");

      const taskConfig = settingsStore.getAPIForTask("summary");

      if (
        !taskConfig.api.endpoint ||
        !taskConfig.api.apiKey ||
        !taskConfig.api.model
      ) {
        throw new Error("請先在設定中配置 API");
      }

      const client = new OpenAICompatibleClient(taskConfig.api);

      const userName = deps.effectivePersona.value?.name || "User";
      const metaPrompt = [
        {
          role: "system" as const,
          content: `你是一個總結助手。你的任務是將多個對話總結合併成一個精簡的元總結，保留最重要的信息。

⚠️ 重要輸出規則：
1. 你必須直接輸出總結內容，絕對不能輸出空白或拒絕回應
2. 無論輸入內容多少，都必須生成一段完整的總結文字
3. 使用「我」代指 ${char.data.name}（角色自己），使用「你」代指 ${userName}（對話對象）
4. 不要使用第三人稱，不要用名字或暱稱稱呼任何一方
5. 字數控制在 300-800字，確保內容完整不截斷
6. 直接開始寫總結，不要加任何前言或說明`,
        },
        {
          role: "user" as const,
          content: `以下是需要合併的總結（共 ${selectedSummaries.length} 條）：\n\n${combinedContent}\n\n請以 ${char.data.name} 的第一人稱視角，將以上總結合併成一個精簡的元總結。直接輸出總結內容，不要有任何前言。`,
        },
      ];

      let metaContent = "";
      const isStreamingEnabled = taskConfig.generation.streamingEnabled;
      const useWindow = isStreamingEnabled && deps.useStreamingWindowEnabled.value;

      if (useWindow) {
        deps.streamingWindow.show(taskConfig.api.model || "AI");
      }

      const streamGenerator = client.generateStream({
        messages: metaPrompt,
        settings: {
          maxContextLength: taskConfig.generation.maxContextLength || 200000,
          maxResponseLength: taskConfig.generation.maxTokens || 8198,
          temperature: 0.7,
          topP: 0.9,
          topK: 0,
          frequencyPenalty: 0,
          presencePenalty: 0,
          repetitionPenalty: 1,
          stopSequences: [],
          streaming: true,
          useStreamingWindow: useWindow,
        },
        apiSettings: taskConfig.api,
        signal: result.controller?.signal,
      });

      for await (const event of streamGenerator) {
        if (event.type === "token" && event.token) {
          metaContent += event.token;
          if (useWindow) {
            deps.streamingWindow.appendToken(event.token);
          }
          if (isStreamingEnabled) {
            aiGenerationStore.updateContent(chatId, metaContent, "meta-summary");
          }
        } else if (event.type === "done" && event.content) {
          metaContent = event.content;
        }
      }
      if (useWindow) {
        deps.streamingWindow.setComplete();
      }
      if (!isStreamingEnabled) {
        aiGenerationStore.updateContent(chatId, metaContent, "meta-summary");
      }

      const metaSummary: SummaryItem = {
        id: `summary_meta_${Date.now()}`,
        content: stripOutputTags(metaContent),
        createdAt: Date.now(),
        messageCount: selectedSummaries.reduce(
          (sum, s) => sum + s.messageCount,
          0,
        ),
        isImportant: true,
        isManual: false,
        isMeta: true,
      };

      deps.chatSummaries.value.push(metaSummary);
      await saveSummary(metaSummary);
      console.log("[SummaryDiary] 元總結生成完成:", metaSummary);

      aiGenerationStore.completeGeneration(chatId, "meta-summary", metaContent);
    } catch (e) {
      console.error("生成元總結失敗:", e);
      const errorMsg = e instanceof Error ? e.message : "未知錯誤";
      aiGenerationStore.setError(chatId, errorMsg, "meta-summary");
      if (errorMsg !== "已中斷") {
        alert("生成元總結失敗: " + errorMsg);
      }
    } finally {
      deps.isGeneratingSummary.value = false;
    }
  }

  // 導入總結
  async function handleImportSummaries(summaries: any[]) {
    const imported = summaries.map((s) => ({
      id:
        s.id ||
        `summary_import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content: s.content,
      createdAt: s.createdAt || Date.now(),
      messageCount: s.messageCount || 0,
      isImportant: s.isImportant || false,
      isManual: s.isManual || false,
      isMeta: s.isMeta || false,
    }));
    deps.chatSummaries.value.push(...imported);
    for (const summary of imported) {
      await saveSummary(summary);
    }
    console.log("[SummaryDiary] 導入總結:", imported.length, "條");
  }

  // 切換日記收藏
  async function handleToggleDiaryFavorite(id: string) {
    const diary = deps.chatDiaries.value.find((d) => d.id === id);
    if (diary) {
      diary.isFavorite = !diary.isFavorite;
      await saveDiary(diary);
    }
  }

  // 刪除日記
  async function handleDeleteDiary(id: string) {
    deps.chatDiaries.value = deps.chatDiaries.value.filter((d) => d.id !== id);
    await deleteDiaryFromDB(id);
  }

  // 手動觸發日記（暴露給外部）
  function handleTriggerManualDiary() {
    if (diaryGeneratingLock.value) return;
    diaryGeneratingLock.value = true;
    triggerAutoDiary();
  }

  return {
    summaryGeneratingLock,
    diaryGeneratingLock,
    stripOutputTags,
    saveSummary,
    deleteSummaryFromDB,
    saveDiary,
    deleteDiaryFromDB,
    checkAndTriggerSummaryOrDiary,
    handleTriggerManualSummary,
    handleSummarySettingsSave,
    handleToggleSummaryImportant,
    handleDeleteSummary,
    handleDeleteSelected,
    handleEditSummary,
    handleGenerateMetaSummary,
    handleImportSummaries,
    handleToggleDiaryFavorite,
    handleDeleteDiary,
    handleTriggerManualDiary,
  };
}
