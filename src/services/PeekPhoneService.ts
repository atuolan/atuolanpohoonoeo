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
  PeekBrowserEntry,
  PeekChatThread,
  PeekDiaryEntry,
  PeekGalleryItem,
  PeekHiddenPhoto,
  PeekMealRecord,
  PeekMemo,
  PeekNote,
  PeekPhoneData,
  PeekScheduleItem,
  PeekTransaction,
} from "@/types/peekPhone";
import {
  buildCombinedPrompt,
  buildGroupAPrompt,
  buildGroupBCPrompt,
  buildGroupBPrompt,
  buildGroupCPrompt,
  buildGroupDPrompt,
} from "./PeekPhonePromptBuilder";
import {
  parseFullData,
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
export type GroupDResult = {
  gallery: PeekGalleryItem[];
  browserHistory: PeekBrowserEntry[];
  hiddenPhotos: PeekHiddenPhoto[];
};

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
      return parseGroupD(yamlContent);
  }
}

/**
 * 將已生成的部分 PeekPhoneData 序列化為人可讀的文字摘要，供後續 prompt 參考
 */
export function serializeForContext(partial: Partial<PeekPhoneData>): string {
  const lines: string[] = [];

  if (partial.chats?.length) {
    lines.push("【聊天紀錄】");
    for (const thread of partial.chats) {
      lines.push(`- 與 ${thread.contactName} 的對話（${thread.messages.length} 條訊息）`);
      const lastMsg = thread.messages[thread.messages.length - 1];
      if (lastMsg) {
        const preview = lastMsg.content.slice(0, 60).replace(/\n/g, " ");
        lines.push(`  最後訊息：${preview}`);
      }
    }
  }

  if (partial.schedule?.length) {
    lines.push("【行程】");
    for (const s of partial.schedule) {
      const title = s.title.split("\n")[0].slice(0, 30);
      lines.push(`- ${s.time} ${title}${s.done ? " [已完成]" : ""}`);
    }
  }

  if (partial.memos?.length) {
    lines.push("【備忘錄】");
    for (const m of partial.memos) {
      const text = m.content.split("\n")[0].slice(0, 30);
      lines.push(`- ${text}${m.done ? " ✓" : ""}`);
    }
  }

  if (partial.diary?.length) {
    lines.push("【日記】");
    for (const d of partial.diary) {
      const preview = d.content.split("\n")[0].slice(0, 60);
      lines.push(`- ${d.date} (${d.mood}): ${preview}`);
    }
  }

  if (partial.notes?.length) {
    lines.push("【記事本】");
    for (const n of partial.notes) {
      const title = n.title.split("\n")[0].slice(0, 30);
      lines.push(`- ${title}`);
    }
  }

  if (partial.transactions?.length) {
    lines.push(`【帳戶餘額】${partial.balance ?? 0}`);
    lines.push("【最近交易】");
    for (const t of partial.transactions.slice(-4)) {
      const desc = t.description.split("\n")[0].slice(0, 30);
      const sign = t.amount > 0 ? "+" : "";
      lines.push(`- ${t.time} ${desc} ${sign}${t.amount}`);
    }
  }

  return lines.join("\n");
}

/**
 * 內部共用：呈句呼叫 API，支持串流和非串流模式
 */
async function callAPIForPhase(
  prompt: string,
  maxResponseLength: number,
  signal: AbortSignal | undefined,
  onToken?: (token: string) => void,
): Promise<string> {
  const settingsStore = useSettingsStore();
  const taskConfig = settingsStore.getAPIForTask("peekPhone");
  const client = getAPIClient(taskConfig.api);
  const messages: APIMessage[] = [{ role: "user", content: prompt }];
  const isStreaming = taskConfig.generation.streamingEnabled;

  const baseSettings = {
    maxContextLength: 200000,
    maxResponseLength,
    temperature: 0.9,
    topP: 0.95,
    topK: 0,
    frequencyPenalty: 0.3,
    presencePenalty: 0.3,
    repetitionPenalty: 1,
    stopSequences: [] as string[],
    useStreamingWindow: false,
  };

  if (isStreaming) {
    let full = "";
    const stream = client.generateStream({
      messages,
      settings: { ...baseSettings, streaming: true },
      apiSettings: taskConfig.api,
      signal,
    });
    for await (const chunk of stream) {
      if (chunk.type === "token" && chunk.token) {
        full += chunk.token;
        onToken?.(chunk.token);
      } else if (chunk.type === "done") {
        if (!full && chunk.content) full = chunk.content;
      } else if (chunk.type === "error") {
        throw new Error(chunk.error || "生成失敗");
      }
    }
    return full;
  } else {
    const result = await client.generate({
      messages,
      settings: { ...baseSettings, streaming: false },
      apiSettings: taskConfig.api,
      signal,
    });
    return result.content;
  }
}

/**
 * 順序生成模式：A → BC → D
 * 每階段將已生成結果序列化為上下文傳入下一階段
 * onPhaseComplete 在每階段完成後被呼叫，供 store 游淨杈案更新 groupStatus
 */
export async function generateSequential(
  character: StoredCharacter,
  chatContext: string,
  userName: string,
  userDescription: string,
  worldInfo: string,
  summariesAndEvents: string,
  _chatId: string,
  signal?: AbortSignal,
  onPhaseComplete?: (
    phase: "A" | "BC" | "D",
    partial: Partial<PeekPhoneData>,
  ) => void,
  onToken?: (phase: "A" | "BC" | "D", token: string) => void,
): Promise<PeekPhoneData> {
  const charName = character.data.name || character.nickname;
  const charDesc = character.data.description || "";
  const personality = character.data.personality || "";
  const scenario = character.data.scenario || "";

  // === Phase A: 聊天紀錄 ===
  const promptA = buildGroupAPrompt(
    charName, charDesc, personality, scenario, chatContext,
    userName, userDescription, worldInfo, summariesAndEvents,
  );
  const yamlA = await callAPIForPhase(promptA, 16000, signal,
    onToken ? (t) => onToken("A", t) : undefined);
  const chats = parseGroupA(yamlA);
  const partialA: Partial<PeekPhoneData> = { chats };
  onPhaseComplete?.("A", partialA);

  // === Phase BC: 行程+飲食+備忘+記事+日記+錢包 ===
  const aContext = serializeForContext(partialA);
  const promptBC = buildGroupBCPrompt(
    charName, charDesc, personality, scenario, chatContext,
    userName, userDescription, worldInfo, summariesAndEvents, aContext,
  );
  const yamlBC = await callAPIForPhase(promptBC, 16000, signal,
    onToken ? (t) => onToken("BC", t) : undefined);
  const { schedule, meals, memos } = parseGroupB(yamlBC);
  const { notes, diary, balance, transactions } = parseGroupC(yamlBC);
  const partialBC: Partial<PeekPhoneData> = { schedule, meals, memos, notes, diary, balance, transactions };
  onPhaseComplete?.("BC", partialBC);

  // === Phase D: 相冊+瀏覽紀錄+私密照片 ===
  const abcContext = serializeForContext({ ...partialA, ...partialBC });
  const promptD = buildGroupDPrompt(
    charName, charDesc, personality, scenario, chatContext,
    userName, userDescription, worldInfo, summariesAndEvents, abcContext,
  );
  const yamlD = await callAPIForPhase(promptD, 12000, signal,
    onToken ? (t) => onToken("D", t) : undefined);
  const { gallery, browserHistory, hiddenPhotos } = parseGroupD(yamlD);

  return {
    characterId: character.id,
    chats,
    schedule,
    meals,
    memos,
    notes,
    diary,
    balance,
    transactions,
    gallery,
    browserHistory,
    hiddenPhotos,
  };
}

/**
 * 一次生成所有模塊內容（合併模式）
 * 建構單一 prompt → 呼叫 API → 解析完整 YAML 回應
 * 所有模塊在同一次 AI 生成中完成，確保內容互相呼應一致
 */
export async function generateCombined(
  character: StoredCharacter,
  chatContext: string,
  userName: string,
  userDescription: string,
  worldInfo: string,
  summariesAndEvents: string,
  _chatId: string,
  signal?: AbortSignal,
  onToken?: (token: string) => void,
): Promise<PeekPhoneData> {
  const settingsStore = useSettingsStore();
  const charName = character.data.name || character.nickname;
  const charDesc = character.data.description || "";
  const personality = character.data.personality || "";
  const scenario = character.data.scenario || "";

  const prompt = buildCombinedPrompt(
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

  const taskConfig = settingsStore.getAPIForTask("peekPhone");
  const client = getAPIClient(taskConfig.api);
  const messages: APIMessage[] = [{ role: "user", content: prompt }];
  const isStreamingEnabled = taskConfig.generation.streamingEnabled;

  let yamlContent: string;

  if (isStreamingEnabled) {
    let fullContent = "";
    const stream = client.generateStream({
      messages,
      settings: {
        maxContextLength: 200000,
        maxResponseLength: 32000,
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
        if (!fullContent && chunk.content) {
          fullContent = chunk.content;
        }
      } else if (chunk.type === "error") {
        throw new Error(chunk.error || "合併生成失敗");
      }
    }

    yamlContent = fullContent;
  } else {
    const result = await client.generate({
      messages,
      settings: {
        maxContextLength: 200000,
        maxResponseLength: 32000,
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

  const parsed = parseFullData(yamlContent);
  parsed.characterId = character.id;
  return parsed;
}

/**
 * 單獨重新生成某一個階段（A / BC / D），使用現有資料作為上下文
 * - A: 只重新生成聊天紀錄
 * - BC: 只重新生成行程+飲食+備忘+記事+日記+錢包
 * - D: 只重新生成相冊+瀏覽紀錄+隱藏照片
 */
export async function generateSinglePhase(
  phase: "A" | "BC" | "D",
  character: StoredCharacter,
  chatContext: string,
  userName: string,
  userDescription: string,
  worldInfo: string,
  summariesAndEvents: string,
  existingData: Partial<PeekPhoneData>,
  _chatId: string,
  signal?: AbortSignal,
  onToken?: (token: string) => void,
): Promise<Partial<PeekPhoneData>> {
  const charName = character.data.name || character.nickname;
  const charDesc = character.data.description || "";
  const personality = character.data.personality || "";
  const scenario = character.data.scenario || "";

  switch (phase) {
    case "A": {
      const prompt = buildGroupAPrompt(
        charName, charDesc, personality, scenario, chatContext,
        userName, userDescription, worldInfo, summariesAndEvents,
      );
      const yaml = await callAPIForPhase(prompt, 16000, signal, onToken);
      const chats = parseGroupA(yaml);
      return { chats };
    }
    case "BC": {
      // 使用現有 A 組資料作為上下文
      const aContext = serializeForContext({ chats: existingData.chats });
      const prompt = buildGroupBCPrompt(
        charName, charDesc, personality, scenario, chatContext,
        userName, userDescription, worldInfo, summariesAndEvents, aContext,
      );
      const yaml = await callAPIForPhase(prompt, 16000, signal, onToken);
      const { schedule, meals, memos } = parseGroupB(yaml);
      const { notes, diary, balance, transactions } = parseGroupC(yaml);
      return { schedule, meals, memos, notes, diary, balance, transactions };
    }
    case "D": {
      // 使用現有 A+BC 組資料作為上下文
      const abcContext = serializeForContext({
        chats: existingData.chats,
        schedule: existingData.schedule,
        meals: existingData.meals,
        memos: existingData.memos,
        notes: existingData.notes,
        diary: existingData.diary,
        balance: existingData.balance,
        transactions: existingData.transactions,
      });
      const prompt = buildGroupDPrompt(
        charName, charDesc, personality, scenario, chatContext,
        userName, userDescription, worldInfo, summariesAndEvents, abcContext,
      );
      const yaml = await callAPIForPhase(prompt, 12000, signal, onToken);
      const { gallery, browserHistory, hiddenPhotos } = parseGroupD(yaml);
      return { gallery, browserHistory, hiddenPhotos };
    }
  }
}
