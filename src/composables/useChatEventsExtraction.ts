import { type Ref, type ComputedRef } from "vue";
import { db, DB_STORES } from "@/db/database";
import { OpenAICompatibleClient } from "@/api/OpenAICompatible";
import {
  createDefaultImportantEventsLog,
  createImportantEvent,
  type ImportantEventsLog,
} from "@/types";
import {
  useAIGenerationStore,
  usePromptManagerStore,
  useSettingsStore,
} from "@/stores";

interface Message {
  id: string;
  role: "user" | "ai" | "system";
  content: string;
  timestamp: number;
  [key: string]: any;
}

interface StreamingWindow {
  show: (model: string) => void;
  appendToken: (token: string) => void;
  setComplete: () => void;
}

/**
 * 重要事件提取功能（自動 + 手動）
 * 從 ChatScreen.vue 抽取的獨立 composable
 */
export function useChatEventsExtraction(deps: {
  messages: Ref<Message[]>;
  currentChatId: Ref<string | null>;
  currentCharacter: ComputedRef<any>;
  effectivePersona: ComputedRef<any>;
  isGenerating: ComputedRef<boolean>;
  isGeneratingSummary: Ref<boolean>;
  isExtractingEvents: Ref<boolean>;
  chatSummarySettings: Ref<any>;
  streamingWindow: StreamingWindow;
  useStreamingWindowEnabled: ComputedRef<boolean>;
  characterName: string;
  characterAvatar: string;
}) {
  const aiGenerationStore = useAIGenerationStore();
  const settingsStore = useSettingsStore();
  const promptManagerStore = usePromptManagerStore();

  /** 共用：執行 AI 事件提取流程 */
  async function _runEventsExtraction(
    chatId: string,
    char: any,
    messagesToUse: Message[],
    controller?: AbortController,
  ): Promise<{ parsedEvents: any[]; eventsContent: string } | null> {
    await promptManagerStore.loadConfig();

    const recentMessagesText = messagesToUse
      .map(
        (m) =>
          `${m.role === "user" ? deps.effectivePersona.value?.name || "User" : char.data.name}: ${m.content}`,
      )
      .join("\n\n");

    const eventsPromptDefs = promptManagerStore.eventsPrompts;
    const eventsPromptOrder = promptManagerStore.eventsPromptOrder;

    const eventsPrompts: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [];

    for (const orderEntry of eventsPromptOrder) {
      if (!orderEntry.enabled) continue;
      const promptDef = eventsPromptDefs.find(
        (p) => p.identifier === orderEntry.identifier,
      );
      if (!promptDef) continue;

      let content = promptDef.content
        .replace(/\{\{char\}\}/g, char.data.name)
        .replace(/\{\{user\}\}/g, deps.effectivePersona.value?.name || "User")
        .replace(/\{\{messagesForAnalysis\}\}/g, recentMessagesText)
        .replace(/\{\{recentMessages\}\}/g, recentMessagesText);

      eventsPrompts.push({
        role: promptDef.role as "system" | "user" | "assistant",
        content,
      });
    }

    if (eventsPrompts.length === 0) {
      console.warn("📋 沒有可用的事件提取提示詞");
      aiGenerationStore.completeGeneration(chatId, "events", "");
      return null;
    }

    const taskConfig = settingsStore.getAPIForTask("importantEvents");
    const client = new OpenAICompatibleClient(taskConfig.api);

    let eventsContent = "";
    const isStreamingEnabled = settingsStore.generation.streamingEnabled;
    const useWindow = isStreamingEnabled && deps.useStreamingWindowEnabled.value;

    if (useWindow) {
      deps.streamingWindow.show(taskConfig.api.model || "AI");
    }

    const streamGenerator = client.generateStream({
      messages: eventsPrompts,
      settings: {
        maxContextLength: settingsStore.generation.maxContextLength || 200000,
        maxResponseLength: settingsStore.generation.maxTokens || 4096,
        temperature: 0.3,
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
      signal: controller?.signal,
    });

    for await (const event of streamGenerator) {
      if (event.type === "token" && event.token) {
        eventsContent += event.token;
        if (useWindow) {
          deps.streamingWindow.appendToken(event.token);
        }
        if (isStreamingEnabled) {
          aiGenerationStore.updateContent(chatId, eventsContent, "events");
        }
      } else if (event.type === "done") {
        if (event.content && event.content.length > eventsContent.length) {
          eventsContent = event.content;
        }
      } else if (event.type === "error") {
        console.error("[Events] Error:", event.error);
      }
    }
    if (useWindow) {
      deps.streamingWindow.setComplete();
    }
    if (!isStreamingEnabled) {
      aiGenerationStore.updateContent(chatId, eventsContent, "events");
    }

    // 解析 AI 回傳的 JSON
    const trimmed = eventsContent.trim();
    const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log("📋 AI 未返回有效的事件 JSON，跳過");
      aiGenerationStore.completeGeneration(chatId, "events", eventsContent);
      return null;
    }

    let parsedEvents: Array<{
      title?: string;
      description?: string;
      emotion?: string;
      importance?: number;
    }>;

    try {
      parsedEvents = JSON.parse(jsonMatch[0]);
    } catch {
      console.warn("📋 事件 JSON 解析失敗:", jsonMatch[0]);
      aiGenerationStore.completeGeneration(chatId, "events", eventsContent);
      return null;
    }

    if (!Array.isArray(parsedEvents) || parsedEvents.length === 0) {
      console.log("📋 沒有提取到重要事件");
      aiGenerationStore.completeGeneration(chatId, "events", eventsContent);
      return null;
    }

    return { parsedEvents, eventsContent };
  }

  /** 共用：將解析的事件寫入 IDB */
  async function _saveEventsToLog(
    parsedEvents: any[],
    eventsLog: ImportantEventsLog,
  ) {
    for (const pe of parsedEvents) {
      const content = pe.title
        ? `${pe.title}${pe.description ? ` - ${pe.description}` : ""}`
        : pe.description || "";
      if (!content) continue;

      const event = createImportantEvent(content, {
        category: "custom",
        priority:
          pe.importance && pe.importance <= 2 ? 1 : pe.importance === 3 ? 2 : 3,
        source: "ai",
        tags: pe.emotion ? [pe.emotion] : [],
      });

      eventsLog.events.unshift(event);
    }

    if (eventsLog.events.length > eventsLog.settings.maxEvents) {
      eventsLog.events = eventsLog.events.slice(0, eventsLog.settings.maxEvents);
    }

    eventsLog.updatedAt = Date.now();
    const plainData = JSON.parse(JSON.stringify(eventsLog));
    await db.put(DB_STORES.IMPORTANT_EVENTS, plainData);
  }

  /** 自動提取重要事件 */
  async function triggerAutoEventsExtraction(
    recentMessages?: Message[],
  ) {
    const chatId = deps.currentChatId.value;
    const char = deps.currentCharacter.value;
    if (!chatId || !char) return;

    try {
      let eventsLog = await db.get<ImportantEventsLog>(
        DB_STORES.IMPORTANT_EVENTS,
        chatId,
      );

      if (!eventsLog) {
        eventsLog = createDefaultImportantEventsLog(char.id, chatId);
      }

      if (!eventsLog.settings.enabled || !eventsLog.settings.autoSave) {
        console.log("📋 重要事件自動提取已停用，跳過");
        return;
      }

      if (deps.isGenerating.value || deps.isGeneratingSummary.value) {
        console.log("📋 其他生成進行中，延遲事件提取");
        setTimeout(() => triggerAutoEventsExtraction(recentMessages), 5000);
        return;
      }

      const result = aiGenerationStore.startGeneration(chatId, "events", {
        characterName: char.data.name || deps.characterName,
        characterAvatar: char.avatar || deps.characterAvatar,
      });

      if (!result.success) {
        console.warn("📋 無法開始事件提取:", result.error);
        return;
      }

      console.log("📋 開始自動提取重要事件...");

      const messagesToUse =
        recentMessages ||
        deps.messages.value
          .filter((m) => m.role === "user" || m.role === "ai")
          .slice(-deps.chatSummarySettings.value.actualMessageCount);

      const extracted = await _runEventsExtraction(
        chatId,
        char,
        messagesToUse,
        result.controller,
      );

      if (extracted) {
        await _saveEventsToLog(extracted.parsedEvents, eventsLog);
        console.log(`📋 自動提取了 ${extracted.parsedEvents.length} 個重要事件`);
        aiGenerationStore.completeGeneration(chatId, "events", extracted.eventsContent);
      }
    } catch (e) {
      console.error("📋 自動提取重要事件失敗:", e);
      if (chatId) {
        const errorMsg = e instanceof Error ? e.message : "未知錯誤";
        aiGenerationStore.setError(chatId, errorMsg, "events");
      }
    }
  }

  /** 手動提取重要事件 */
  async function handleTriggerManualEvents() {
    const chatId = deps.currentChatId.value;
    const char = deps.currentCharacter.value;
    if (!chatId || !char) return;

    deps.isExtractingEvents.value = true;

    try {
      let eventsLog = await db.get<ImportantEventsLog>(
        DB_STORES.IMPORTANT_EVENTS,
        chatId,
      );

      if (!eventsLog) {
        eventsLog = createDefaultImportantEventsLog(char.id, chatId);
      }

      const result = aiGenerationStore.startGeneration(chatId, "events", {
        characterName: char.data.name || deps.characterName,
        characterAvatar: char.avatar || deps.characterAvatar,
      });

      if (!result.success) {
        console.warn("📋 無法開始事件提取:", result.error);
        deps.isExtractingEvents.value = false;
        return;
      }

      console.log("📋 開始手動提取重要事件...");

      const messagesToUse = deps.messages.value
        .filter((m) => m.role === "user" || m.role === "ai")
        .slice(-deps.chatSummarySettings.value.actualMessageCount);

      const extracted = await _runEventsExtraction(
        chatId,
        char,
        messagesToUse,
        result.controller,
      );

      if (extracted) {
        await _saveEventsToLog(extracted.parsedEvents, eventsLog);
        console.log(`📋 手動提取了 ${extracted.parsedEvents.length} 個重要事件`);
        aiGenerationStore.completeGeneration(chatId, "events", extracted.eventsContent);
      }
    } catch (e) {
      console.error("📋 手動提取重要事件失敗:", e);
      if (chatId) {
        const errorMsg = e instanceof Error ? e.message : "未知錯誤";
        aiGenerationStore.setError(chatId, errorMsg, "events");
      }
    } finally {
      deps.isExtractingEvents.value = false;
    }
  }

  return {
    triggerAutoEventsExtraction,
    handleTriggerManualEvents,
  };
}
