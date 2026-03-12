/**
 * PeekPhoneService
 * 核心服務，負責協調 prompt 建構、API 呼叫、回應解析
 * 生成偷窺手機各模塊組的 AI 內容
 */
import { getAPIClient, type APIMessage } from "@/api/OpenAICompatible";
import { useSettingsStore } from "@/stores/settings";
import type { StoredCharacter } from "@/types/character";
import type { Chat, ChatMessage } from "@/types/chat";
import type {
  PeekChatThread,
  PeekDiaryEntry,
  PeekGalleryItem,
  PeekMealRecord,
  PeekMemo,
  PeekNote,
  PeekPhoneData,
  PeekScheduleItem,
  PeekTransaction,
} from "@/types/peekPhone";
import {
  buildGroupAPrompt,
  buildGroupBPrompt,
  buildGroupCPrompt,
  buildGroupDPrompt,
} from "./PeekPhonePromptBuilder";
import {
  parseGroupA,
  parseGroupB,
  parseGroupC,
  parseGroupD,
} from "./PeekPhoneYAMLParser";

/** 模塊組類型 */
export type ModuleGroup = "A" | "B" | "C" | "D";

/** 各組的回傳型別 */
export type GroupAResult = { chats: PeekChatThread[] };
export type GroupBResult = {
  schedule: PeekScheduleItem[];
  meals: PeekMealRecord[];
  memos: PeekMemo[];
};
export type GroupCResult = {
  notes: PeekNote[];
  diary: PeekDiaryEntry[];
  balance: number;
  transactions: PeekTransaction[];
};
export type GroupDResult = { gallery: PeekGalleryItem[] };

export type GroupResult =
  | GroupAResult
  | GroupBResult
  | GroupCResult
  | GroupDResult;

/**
 * 從聊天紀錄提取上下文摘要
 * 取最近 maxTurns 輪對話（一輪 = 用戶訊息 + AI回覆）
 */
export function extractChatContext(
  chat: Chat,
  maxTurns: number = 30,
): string {
  const messages = chat.messages ?? [];

  if (messages.length === 0) {
    return "（無聊天紀錄）";
  }

  // 從後往前計算對話輪次
  const recentMessages: ChatMessage[] = [];
  let turnCount = 0;
  let hasUserInCurrentTurn = false;
  let hasAiInCurrentTurn = false;

  // 從最後一條訊息往前遍歷
  for (let i = messages.length - 1; i >= 0 && turnCount < maxTurns; i--) {
    const msg = messages[i];
    recentMessages.unshift(msg);

    if (msg.is_user) {
      hasUserInCurrentTurn = true;
    } else {
      hasAiInCurrentTurn = true;
    }

    // 當遇到用戶訊息且當前輪次已有AI回覆時，計為一輪
    if (msg.is_user && hasAiInCurrentTurn) {
      turnCount++;
      hasUserInCurrentTurn = false;
      hasAiInCurrentTurn = false;
    }
  }

  // 組合為簡要摘要格式
  const lines = recentMessages.map((msg: ChatMessage) => {
    const sender = msg.is_user ? "用戶" : msg.name;
    // 截取前 150 字避免過長
    const content =
      msg.content.length > 150
        ? msg.content.slice(0, 150) + "..."
        : msg.content;
    return `${sender}: ${content}`;
  });

  return lines.join("\n");
}

/**
 * 從數據庫中提取聊天的總結和重要事件
 * 注意：這是一個異步函數，需要從 IndexedDB 讀取數據
 */
export async function extractSummariesAndEvents(
  chatId: string,
  characterId: string,
): Promise<string> {
  const { db, DB_STORES } = await import("@/db/database");
  await db.init();

  const lines: string[] = [];

  try {
    // 讀取總結
    const allSummaries = await db.getAll(DB_STORES.SUMMARIES);
    const summaries = allSummaries.filter(
      (s: any) => s.chatId === chatId && s.characterId === characterId,
    );

    if (summaries.length > 0) {
      lines.push("【對話總結】");
      const importantSummaries = summaries.filter(
        (s: any) => s.isImportant || s.isMeta,
      );
      const regularSummaries = summaries.filter(
        (s: any) => !s.isImportant && !s.isMeta,
      );

      // 先顯示重要總結（最多3條）
      importantSummaries.slice(-3).forEach((s: any) => {
        const label = s.isMeta ? "[元總結]" : "[重要]";
        const content = s.content || "";
        lines.push(`${label} ${content.slice(0, 200)}`);
      });

      // 再顯示一般總結（最多2條）
      regularSummaries.slice(-2).forEach((s: any) => {
        const content = s.content || "";
        lines.push(`- ${content.slice(0, 150)}`);
      });
    }

    // 讀取重要事件
    const allEvents = await db.getAll(DB_STORES.IMPORTANT_EVENTS);
    const importantEvents = allEvents.filter(
      (e: any) => e.chatId === chatId && e.characterId === characterId,
    );

    if (importantEvents.length > 0) {
      lines.push("");
      lines.push("【重要事件記錄】");
      importantEvents.slice(-5).forEach((event: any) => {
        const eventText = event.content || event.description || "";
        lines.push(`- ${eventText.slice(0, 100)}`);
      });
    }
  } catch (error) {
    console.error("[PeekPhone] 讀取總結和事件失敗:", error);
  }

  return lines.length > 0 ? lines.join("\n") : "";
}

/**
 * 生成指定模塊組的內容
 * 建構 prompt → 呼叫 API → 解析 YAML 回應
 * 支援串流模式：由全局設定決定是否使用串流 API
 */
export async function generateGroup(
  group: ModuleGroup,
  character: StoredCharacter,
  chatContext: string,
  userName: string,
  userDescription: string,
  worldInfo: string,
  summariesAndEvents: string,
  _chatId: string,
  signal?: AbortSignal,
  onToken?: (token: string) => void,
): Promise<GroupResult> {
  const settingsStore = useSettingsStore();
  const charName = character.data.name || character.nickname;
  const charDesc = character.data.description || "";
  const personality = character.data.personality || "";
  const scenario = character.data.scenario || "";

  // 根據組別建構 prompt
  let prompt: string;
  switch (group) {
    case "A":
      prompt = buildGroupAPrompt(
        charName,
        charDesc,
        personality,
        scenario,
        chatContext,
        userName,
        userDescription,
        worldInfo,
        summariesAndEvents,
      );
      break;
    case "B":
      prompt = buildGroupBPrompt(
        charName,
        charDesc,
        personality,
        scenario,
        chatContext,
        userName,
        userDescription,
        worldInfo,
        summariesAndEvents,
      );
      break;
    case "C":
      prompt = buildGroupCPrompt(
        charName,
        charDesc,
        personality,
        scenario,
        chatContext,
        userName,
        userDescription,
        worldInfo,
        summariesAndEvents,
      );
      break;
    case "D":
      prompt = buildGroupDPrompt(
        charName,
        charDesc,
        personality,
        scenario,
        chatContext,
        userName,
        userDescription,
        worldInfo,
        summariesAndEvents,
      );
      break;
  }

  // 呼叫 API（優先使用備用 API）
  const taskConfig = settingsStore.getAPIForTask("peekPhone");
  const client = getAPIClient(taskConfig.api);
  const messages: APIMessage[] = [{ role: "user", content: prompt }];

  // 讀取全局串流設定
  const isStreamingEnabled = taskConfig.generation.streamingEnabled;

  let yamlContent: string;

  if (isStreamingEnabled) {
    // 串流模式：使用 generateStream
    let fullContent = "";
    const stream = client.generateStream({
      messages,
      settings: {
        maxContextLength: 200000,
        maxResponseLength: 20000,
        temperature: 0.9,
        topP: 0.95,
        topK: 0,
        frequencyPenalty: 0.3,
        presencePenalty: 0.3,
        repetitionPenalty: 1,
        stopSequences: [],
        streaming: true,
        useStreamingWindow: false,
      },
      apiSettings: taskConfig.api,
      signal,
    });

    for await (const chunk of stream) {
      if (chunk.type === "token" && chunk.token) {
        fullContent += chunk.token;
        onToken?.(chunk.token);
      } else if (chunk.type === "done") {
        // 使用 done 事件的完整內容作為 fallback
        if (!fullContent && chunk.content) {
          fullContent = chunk.content;
        }
      } else if (chunk.type === "error") {
        throw new Error(chunk.error || `組 ${group} 串流生成失敗`);
      }
    }

    yamlContent = fullContent;
  } else {
    // 非串流模式：使用 generate
    const result = await client.generate({
      messages,
      settings: {
        maxContextLength: 200000,
        maxResponseLength: 20000,
        temperature: 0.9,
        topP: 0.95,
        topK: 0,
        frequencyPenalty: 0.3,
        presencePenalty: 0.3,
        repetitionPenalty: 1,
        stopSequences: [],
        streaming: false,
        useStreamingWindow: false,
      },
      apiSettings: taskConfig.api,
      signal,
    });

    yamlContent = result.content;
  }

  // 解析 YAML 回應
  switch (group) {
    case "A":
      return { chats: parseGroupA(yamlContent) };
    case "B":
      return parseGroupB(yamlContent);
    case "C":
      return parseGroupC(yamlContent);
    case "D":
      return { gallery: parseGroupD(yamlContent) };
  }
}
