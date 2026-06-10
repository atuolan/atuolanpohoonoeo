import { ref, type Ref, type ComputedRef } from "vue";
import { db, DB_STORES } from "@/db/database";
import { OpenAICompatibleClient } from "@/api/OpenAICompatible";
import {
  recordDeletedEntity,
  scheduleSelfHostedAutoSync,
} from "@/services/selfHostedSyncState";
import type { SummarySettings } from "@/types/chat";
import {
  useAIGenerationStore,
  usePromptManagerStore,
  useSettingsStore,
} from "@/stores";
import { useNotificationStore } from "@/stores/notification";
import { MemoryRetrieverService } from "@/services/memoryRetriever";
import { deleteVectorEmbedding, markVectorStale } from "@/db/vectorStore";
import { extractSummaryKeywords } from "@/utils/summaryKeywordExtractor";
import { sliceMessagesByTurns } from "@/utils/chatScreenHelpers";

/**
 * 將消息列表格式化為帶日期標記的文本
 * 當日期變化時插入 [YYYY/MM/DD] 標記，讓 AI 知道時間脈絡
 */
function formatMessagesWithDates(
  messages: Message[],
  getUserName: () => string,
  getCharName: () => string,
): string {
  let lastDateStr = ''
  const lines: string[] = []

  for (const m of messages) {
    const d = new Date(m.timestamp)
    const dateStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`

    // 日期變化時插入日期標記
    if (dateStr !== lastDateStr) {
      lines.push(`[${dateStr}]`)
      lastDateStr = dateStr
    }

    const speaker = m.role === 'user' ? getUserName() : getCharName()
    lines.push(`${speaker}: ${m.content}`)
  }

  return lines.join('\n\n')
}

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
  keywords?: string[];
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

/** 日記觸發時的消息快照，避免延遲執行時讀到過期資料 */
interface DiarySnapshot {
  messages: Message[];
  settings: SummarySettings;
  capturedAt: number;
  chatId: string;
}

/**
 * 總結/日記自動觸發 + 手動總結 + 元總結 + CRUD
 * 從 ChatScreen.vue 抽取的獨立 composable
 */
export function useChatSummaryDiary(deps: {
  messages: Ref<Message[]>;
  currentChatId: Ref<string | null>;
  currentChatData: Ref<any> | ComputedRef<any>;
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

  // 向量記憶 helpers（使用全域設定）
  function isVectorMemoryEnabled(): boolean {
    return settingsStore.vectorMemoryEnabled === true
  }

  function getChatContext() {
    return {
      chatId: deps.currentChatId.value || deps.chatId || '',
      characterId: deps.characterId || deps.currentCharacter.value?.id || '',
    }
  }

  function isGroupSummaryMode(): boolean {
    return deps.currentChatData.value?.isGroupChat === true;
  }

  function getGroupSummaryContext() {
    const chatData = deps.currentChatData.value;
    const groupName =
      chatData?.groupMetadata?.groupName || chatData?.name || "這個群聊";
    const memberNames = [
      ...(chatData?.groupMetadata?.members?.map((m: any) => m.nickname || m.characterId) || []),
      ...(chatData?.groupMetadata?.multiCharMembers?.map((m: any) => m.name) || []),
    ].filter(Boolean);

    return {
      groupName,
      memberNamesText:
        memberNames.length > 0 ? memberNames.join("、") : "群裡的大家",
    };
  }

  function buildGroupSummaryPrompts(sourceText: string) {
    const { groupName, memberNamesText } = getGroupSummaryContext();
    return [
      {
        role: "system" as const,
        content: `你是群聊總結的代筆者。請從群成員中選出一位最適合擔任「主筆」的角色，以他／她的第一人稱視角，把這段群聊寫成一篇帶有個人觀點的群像總結。

輸出規則：
1. 第一行固定格式為「主筆角色名：」，緊接著直接開始正文，不要換行、不要其他前言
2. 全篇以主筆角色的第一人稱（「我」）敘述，其他成員一律用名字稱呼，禁止用「我們」代替個別角色的動作或言語
3. 可以帶入主筆角色對其他人的主觀印象、吐槽、觀察或情緒，讓文字有個人溫度
4. 重點保留群聊的關鍵事件、互動細節、氣氛與角色間的關係變化
5. 文風像是這個角色私下寫給自己的備忘或感想，自然、有性格
6. 字數控制在 100～300 字之間
7. 直接輸出「角色名：正文」，不要加標題、額外說明或清單`,
      },
      {
        role: "user" as const,
        content: `請為群聊「${groupName}」寫一篇主筆總結。群成員包含：${memberNamesText}。

以下是這段時間的群聊內容：

${sourceText}

請先從群成員中選出最適合當主筆的角色，然後直接以「角色名：正文」的格式輸出約 100～300 字的總結。`,
      },
    ];
  }

  function buildGroupDiaryPrompts(sourceText: string, currentDateTimeFull: string) {
    const { groupName, memberNamesText } = getGroupSummaryContext();
    return [
      {
        role: "system" as const,
        content: `你是群聊共同日記的代筆者。請把這段群聊寫成一篇像是群裡眾人輪流接龍寫下來的共同日記。

輸出規則：
1. 必須呈現「多人接龍共寫」的感覺，可以有彼此補充、吐槽、搗亂、插話、糾正、搶筆的趣味感
2. 但整體仍需可讀、連貫，最後看起來像一篇完整的群像日記，而不是零散聊天截圖
3. 描述個別角色的動作、言語或反應時，必須直接使用該角色的名字，不要用「我們」代替；「我們」只保留給真正的集體行動（如「我們一起出發」）；短句插嘴、括號補充等也要帶上角色名
4. 要保留這段群聊的氣氛、關鍵事件、情緒起伏、角色間互動與好笑細節
5. 文風要有生活感、玩鬧感與共同記錄感，像大家一起在日記本上亂入留言
6. 字數控制在 600～1000 字之間
7. 直接輸出正文，不要加標題、前言、角色名清單或條列`,
      },
      {
        role: "user" as const,
        content: `今天的時間是 ${currentDateTimeFull}。請為群聊「${groupName}」寫一篇群像接龍日記。群成員包含：${memberNamesText}。

以下是這段時間的群聊內容：

${sourceText}

請把它寫成一篇約 600～1000 字、像群裡大家輪流動筆寫下來的共同日記：有人補充、有人吐槽、有人故意搗亂一下也可以，但整體仍要自然好讀。`,
      },
    ];
  }

  // 生成鎖定
  const summaryGeneratingLock = ref(false);
  const diaryGeneratingLock = ref(false);

  // 清理 AI 生成內容中的 <content>/<think> 標籤
  function stripOutputTags(text: string): string {
    let cleaned = text.replace(/^[\s\S]*?<\/think(?:ing)?>\s*/si, "");
    const match = cleaned.match(/<content>([\s\S]*?)<\/content>/i);
    if (match) return match[1].trim();
    return cleaned.replace(/<\/?content>/gi, "").trim();
  }

  // IDB 持久化 helpers
  async function saveSummary(summary: SummaryItem) {
    const chatId = deps.currentChatId.value || deps.chatId || "";
    const charId = deps.currentCharacter.value?.id || deps.characterId || "";
    const dbSummary = {
      ...summary,
      chatId,
      characterId: charId,
      updatedAt: Date.now(),
    };
    await db.put(DB_STORES.SUMMARIES, JSON.parse(JSON.stringify(dbSummary)));
    scheduleSelfHostedAutoSync();
    console.log("[SummaryDiary] 總結已保存:", summary.id);
  }

  async function deleteSummaryFromDB(id: string) {
    const existing = await db.get(DB_STORES.SUMMARIES, id);
    if (!existing) {
      return;
    }
    await db.delete(DB_STORES.SUMMARIES, id);
    const deletedAt = Date.now();
    await recordDeletedEntity({
      entityType: "conversation_summary",
      entityId: id,
      updatedAt: deletedAt,
      deletedAt,
      payload: null,
    });
    scheduleSelfHostedAutoSync();
    console.log("[SummaryDiary] 總結已刪除:", id);
  }

  async function saveDiary(diary: DiaryItem) {
    const chatId = deps.currentChatId.value || deps.chatId || "";
    const charId = deps.currentCharacter.value?.id || deps.characterId || "";
    const dbDiary = {
      ...diary,
      chatId,
      characterId: charId,
      updatedAt: Date.now(),
    };
    await db.put(DB_STORES.DIARIES, JSON.parse(JSON.stringify(dbDiary)));
    scheduleSelfHostedAutoSync();
    console.log("[SummaryDiary] 日記已保存:", diary.id);
  }

  async function deleteDiaryFromDB(id: string) {
    const existing = await db.get(DB_STORES.DIARIES, id);
    if (!existing) {
      return;
    }
    await db.delete(DB_STORES.DIARIES, id);
    const deletedAt = Date.now();
    await recordDeletedEntity({
      entityType: "diary_entry",
      entityId: id,
      updatedAt: deletedAt,
      deletedAt,
      payload: null,
    });
    scheduleSelfHostedAutoSync();
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

  /**
   * 根據設定裁切消息列表（與 ChatScreen triggerAIResponse 一致的輪次計算）
   * 按輪次時：從末尾往前數 AI 訊息，找到對應 user 訊息後 slice
   * 按條數時：直接取最後 N 條
   */
  function sliceMessagesBySettings(
    msgs: Message[],
    actualMessageCount: number,
    actualMessageMode: "message" | "turn",
  ): Message[] {
    if (actualMessageMode === "turn") {
      // 一輪 = 一個完整回合（用戶發言 + AI 整段回覆）。
      // 同一輪 AI 即使被拆成多條氣泡（共享 turnId 或 shadow segment），只計為一輪。
      return sliceMessagesByTurns(msgs, actualMessageCount);
    } else {
      return msgs.slice(-actualMessageCount);
    }
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
      // 快照當前消息與設定，避免 4 秒後執行時讀到過期資料
      const snapshot: DiarySnapshot = {
        messages: [...validMessages],
        settings: { ...deps.chatSummarySettings.value },
        capturedAt: Date.now(),
        chatId: deps.currentChatId.value,
      };
      setTimeout(() => {
        triggerAutoDiary(snapshot);
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
  async function triggerAutoDiary(snapshot?: DiarySnapshot) {
    if (diaryGeneratingLock.value === false) return;
    if (!deps.currentChatId.value) {
      diaryGeneratingLock.value = false;
      return;
    }

    if (deps.isGenerating.value || deps.isGeneratingSummary.value) {
      console.log("📔 其他生成進行中，延遲日記生成");
      setTimeout(() => triggerAutoDiary(snapshot), 5000);
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

      // 優先使用快照，否則即時讀取
      const validMessages = snapshot?.messages ?? deps.messages.value.filter(
        (m) => m.role === "user" || m.role === "ai",
      );

      if (validMessages.length === 0) {
        console.warn("📔 無法生成日記：沒有可用的對話訊息");
        aiGenerationStore.completeGeneration(chatId, "diary", "");
        diaryGeneratingLock.value = false;
        return;
      }

      const settings = snapshot?.settings ?? deps.chatSummarySettings.value;
      const messagesToUse = sliceMessagesBySettings(
        validMessages,
        settings.actualMessageCount,
        settings.actualMessageMode,
      );

      // 診斷日誌：記錄日記實際讀取的消息範圍
      console.log(`📔 日記消息選擇:`, {
        totalValid: validMessages.length,
        mode: settings.actualMessageMode,
        count: settings.actualMessageCount,
        selectedCount: messagesToUse.length,
        firstMsgTime: messagesToUse[0]?.timestamp
          ? new Date(messagesToUse[0].timestamp).toLocaleString()
          : "N/A",
        lastMsgTime: messagesToUse.length > 0
          ? new Date(messagesToUse[messagesToUse.length - 1].timestamp).toLocaleString()
          : "N/A",
        snapshotAge: snapshot
          ? `${Date.now() - snapshot.capturedAt}ms`
          : "no snapshot",
        snapshotChatId: snapshot?.chatId ?? "N/A",
        currentChatId: chatId,
      });

      const now = new Date();
      const currentDateTime = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
      const weekDays = ["日", "一", "二", "三", "四", "五", "六"];
      const currentDateTimeFull = `${currentDateTime} 星期${weekDays[now.getDay()]}`;

      const recentMessagesText = formatMessagesWithDates(
        messagesToUse,
        () => deps.effectivePersona.value?.name || "User",
        () => char.data.name,
      );

      const diaryPromptDefs = promptManagerStore.diaryPrompts;
      const diaryPromptOrder = promptManagerStore.diaryPromptOrder;

      const diaryPrompts: Array<{
        role: "system" | "user" | "assistant";
        content: string;
      }> = [];

      if (isGroupSummaryMode()) {
        diaryPrompts.push(
          ...buildGroupDiaryPrompts(recentMessagesText, currentDateTimeFull),
        );
      } else {
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

      // 日記不參與向量化（日記是角色私人視角，不在 char 感知範圍內）

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

      // 過濾 user/ai 消息後用統一算法裁切（與 ChatScreen / 日記一致）
      const validMsgs = deps.messages.value.filter(
        (m) => m.role === "user" || m.role === "ai",
      );
      const messagesToRead = sliceMessagesBySettings(
        validMsgs,
        actualCount,
        actualMode,
      );

      const userName = deps.effectivePersona.value?.name || "User";
      const recentMessages = formatMessagesWithDates(
        messagesToRead,
        () => userName,
        () => char.data.name,
      );

      const summaryPrompts: Array<{
        role: "system" | "user" | "assistant";
        content: string;
      }> = [];

      if (isGroupSummaryMode()) {
        summaryPrompts.push(...buildGroupSummaryPrompts(recentMessages));
      } else {
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
        keywords: extractSummaryKeywords(stripOutputTags(summaryContent)),
      };

      deps.chatSummaries.value.push(newSummary);
      await saveSummary(newSummary);
      console.log("[SummaryDiary] 手動總結生成完成:", newSummary);

      // 向量記憶：自動嵌入
      if (isVectorMemoryEnabled()) {
        const ctx = getChatContext()
        const retriever = new MemoryRetrieverService()
        retriever.generateAndStoreEmbedding(
          newSummary.id, 'summary', newSummary.content, ctx.chatId, ctx.characterId,
          newSummary.keywords, [deps.characterName],
        ).catch(err => console.error('[向量記憶] 總結嵌入失敗:', err))
      }

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
    await deleteSummaryFromDB(id);
    deps.chatSummaries.value = deps.chatSummaries.value.filter((s) => s.id !== id);
    // 向量記憶：刪除對應向量
    deleteVectorEmbedding(`vec_${id}`).catch(err => console.error('[向量記憶] 刪除向量失敗:', err))
  }

  // 批量刪除選取的總結
  async function handleDeleteSelected(ids: string[]) {
    await Promise.all(ids.map((id) => deleteSummaryFromDB(id)));
    deps.chatSummaries.value = deps.chatSummaries.value.filter(
      (s) => !ids.includes(s.id),
    );
    // 向量記憶：批量刪除向量
    await Promise.all(ids.map(id => deleteVectorEmbedding(`vec_${id}`).catch(err => console.error('[向量記憶] 刪除向量失敗:', err))));
  }

  // 編輯總結
  async function handleEditSummary(id: string, newContent: string) {
    const summary = deps.chatSummaries.value.find((s) => s.id === id);
    if (summary) {
      summary.content = newContent;
      await saveSummary(summary);
      // 向量記憶：標記向量為 stale
      markVectorStale(id).catch(err => console.error('[向量記憶] 標記 stale 失敗:', err))
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
      const metaPrompt = isGroupSummaryMode()
        ? buildGroupSummaryPrompts(combinedContent)
        : [
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
        keywords: extractSummaryKeywords(stripOutputTags(metaContent)),
      };

      deps.chatSummaries.value.push(metaSummary);
      await saveSummary(metaSummary);
      console.log("[SummaryDiary] 元總結生成完成:", metaSummary);

      // 向量記憶：自動嵌入
      if (isVectorMemoryEnabled()) {
        const ctx = getChatContext()
        const retriever = new MemoryRetrieverService()
        retriever.generateAndStoreEmbedding(
          metaSummary.id, 'summary', metaSummary.content, ctx.chatId, ctx.characterId,
          metaSummary.keywords, [deps.characterName],
        ).catch(err => console.error('[向量記憶] 元總結嵌入失敗:', err))
      }

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
      keywords: s.keywords || extractSummaryKeywords(s.content),
    }));
    deps.chatSummaries.value.push(...imported);
    for (const summary of imported) {
      await saveSummary(summary);
    }
    console.log("[SummaryDiary] 導入總結:", imported.length, "條");

    // 向量記憶：批量嵌入導入的總結
    if (isVectorMemoryEnabled() && imported.length > 0) {
      const ctx = getChatContext()
      const retriever = new MemoryRetrieverService()
      const items = imported.map(s => ({
        sourceId: s.id,
        sourceType: 'summary' as const,
        content: s.content,
        keywords: s.keywords,
      }))
      retriever.generateBatchEmbeddings(items, ctx.chatId, ctx.characterId, undefined, [deps.characterName])
        .catch(err => console.error('[向量記憶] 導入總結批量嵌入失敗:', err))
    }
  }

  // =============================
  // 單批總結（供外部逐批呼叫）
  // =============================

  /**
   * 對一批訊息執行 AI 總結，儲存結果並回傳成功/失敗
   * 由 AISummaryPanel 逐批呼叫，面板自行管理批次列表與狀態
   */
  async function summarizeSingleBatch(
    batchMessages: Message[],
    charName: string,
    userName: string,
    signal?: AbortSignal,
  ): Promise<{ success: boolean; error?: string }> {
    const chatId = deps.currentChatId.value || deps.chatId || '';
    if (!chatId) return { success: false, error: '無聊天 ID' };

    const char = deps.currentCharacter.value;

    try {
      const taskConfig = settingsStore.getAPIForTask('summary');
      if (!taskConfig.api.endpoint || !taskConfig.api.apiKey || !taskConfig.api.model) {
        throw new Error('請先在設定中配置 API');
      }

      await promptManagerStore.loadConfig();

      const batchText = formatMessagesWithDates(batchMessages, () => userName, () => charName);

      const summaryPromptDefs = promptManagerStore.summaryPrompts;
      const summaryPromptOrder = promptManagerStore.summaryPromptOrder;

      const summaryPrompts: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

      if (isGroupSummaryMode()) {
        summaryPrompts.push(...buildGroupSummaryPrompts(batchText));
      } else {
        for (const orderEntry of summaryPromptOrder) {
          if (!orderEntry.enabled) continue;
          const promptDef = summaryPromptDefs.find(p => p.identifier === orderEntry.identifier);
          if (!promptDef) continue;

          const content = promptDef.content
            .replace(/\{\{char\}\}/g, charName)
            .replace(/\{\{user\}\}/g, userName)
            .replace(/\{\{messagesForSummary\}\}/g, batchText)
            .replace(/\{\{userPersona\}\}/g, deps.effectivePersona.value?.description || '')
            .replace(/\{\{charDescription\}\}/g, char?.data?.description || '');

          summaryPrompts.push({ role: promptDef.role as 'system' | 'user' | 'assistant', content });
        }
      }

      if (summaryPrompts.length === 0) {
        const turnCount = batchMessages.filter(m => m.role === 'user').length;
        summaryPrompts.push(
          { role: 'system', content: `你是一個對話總結助手。請為以下對話片段生成簡潔的中文總結，保留關鍵情節、情感變化和重要信息。直接輸出總結內容，不要有前言。` },
          { role: 'user', content: `以下是對話片段（共 ${turnCount} 輪）：\n\n${batchText}\n\n請生成總結。` },
        );
      }

      const client = new OpenAICompatibleClient(taskConfig.api);
      let summaryContent = '';

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
          useStreamingWindow: false,
        },
        apiSettings: taskConfig.api,
        signal,
      });

      for await (const event of streamGenerator) {
        if (event.type === 'token' && event.token) {
          summaryContent += event.token;
        } else if (event.type === 'done') {
          if (event.content && event.content.length > summaryContent.length) {
            summaryContent = event.content;
          }
        } else if (event.type === 'error') {
          console.error('[BatchSummary] 單批錯誤:', event.error);
          throw new Error(String(event.error));
        }
      }

      if (!summaryContent.trim()) {
        throw new Error('AI 回傳空內容');
      }

      const newSummary: SummaryItem = {
        id: `summary_batch_${Date.now()}`,
        content: stripOutputTags(summaryContent),
        createdAt: Date.now(),
        messageCount: batchMessages.length,
        isImportant: false,
        isManual: true,
        isMeta: false,
        keywords: extractSummaryKeywords(stripOutputTags(summaryContent)),
      };

      deps.chatSummaries.value.push(newSummary);
      await saveSummary(newSummary);
      console.log('[BatchSummary] 單批總結完成:', newSummary.id);

      if (isVectorMemoryEnabled()) {
        const ctx = getChatContext();
        const retriever = new MemoryRetrieverService();
        retriever.generateAndStoreEmbedding(
          newSummary.id, 'summary', newSummary.content, ctx.chatId, ctx.characterId,
          newSummary.keywords, [deps.characterName],
        ).catch(err => console.error('[向量記憶] 批量總結嵌入失敗:', err));
      }

      return { success: true };
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      console.error('[BatchSummary] 單批總結失敗:', errMsg);
      return { success: false, error: errMsg };
    }
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

  // 手動觸發日記（暴露給外部，可傳入覆蓋設定）
  function handleTriggerManualDiary(overrideSettings?: {
    actualMessageCount: number;
    actualMessageMode: "message" | "turn";
  }) {
    if (diaryGeneratingLock.value) return;
    diaryGeneratingLock.value = true;
    // 快照當前消息，使用覆蓋設定或已保存設定
    const validMessages = deps.messages.value.filter(
      (m) => m.role === "user" || m.role === "ai",
    );
    const settings = overrideSettings
      ? { ...deps.chatSummarySettings.value, ...overrideSettings }
      : { ...deps.chatSummarySettings.value };
    const snapshot: DiarySnapshot = {
      messages: [...validMessages],
      settings,
      capturedAt: Date.now(),
      chatId: deps.currentChatId.value || deps.chatId,
    };
    triggerAutoDiary(snapshot);
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
    summarizeSingleBatch,
  };
}
