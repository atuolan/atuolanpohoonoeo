/**
 * 伴讀聊天 Composable
 * 管理書籍伴讀角色的聊天狀態、翻頁觸發、內容累積等核心邏輯
 */

import type { APIMessage } from "@/api/OpenAICompatible";
import type { PromptBuilderOptions } from "@/engine/prompt/PromptBuilder";
import type { Lorebook } from "@/types/worldinfo";
import { pickGenerationToggles } from "@/utils/generationToggles";
import { useCharactersStore } from "@/stores/characters";
import {
  createChatRecord,
  refreshChatDerivedMetadata,
  resolvePreferredDirectChat,
} from "@/storage/chatStorage";
import { appendMessages } from "@/storage/chatMessageStorage";
import { useStreamingWindow } from "@/composables/useStreamingWindow";
import type {
  BookChapter,
  CompanionChatState,
  CompanionMessage,
  StoredBook,
} from "@/types/book";
import type { Chat, ChatMessage } from "@/types/chat";
import type { StoredCharacter } from "@/types/character";
import { ref, type Ref } from "vue";

// ===== 純函式：可獨立測試的核心邏輯 =====

/**
 * 翻頁觸發邏輯的核心狀態機
 * 設計為純類別，不依賴 Vue reactivity，方便 property testing
 */
export class CompanionChatCore {
  pageTurnCounter: number = 0;
  triggerFrequency: number = 3;
  accumulatedChapterIndices: number[] = [];
  messages: CompanionMessage[] = [];
  /** messages 中已同步到主聊天的前幾則 */
  syncedCount: number = 0;
  isActive: boolean = false;
  isPanelExpanded: boolean = true;
  hasUnread: boolean = false;
  bubblePosition: { x: number; y: number } = { x: 20, y: 200 };

  /**
   * 處理翻頁事件
   * @returns true 如果達到觸發門檻
   */
  onPageTurn(chapterIndex: number): boolean {
    if (!this.isActive) return false;

    this.pageTurnCounter++;
    this.accumulatedChapterIndices.push(chapterIndex);

    if (this.pageTurnCounter >= this.triggerFrequency) {
      return true;
    }
    return false;
  }

  /**
   * 觸發後重置計數器和累積內容
   */
  resetAfterTrigger(): void {
    this.pageTurnCounter = 0;
    this.accumulatedChapterIndices = [];
  }

  /**
   * 設定觸發頻率，同時重置計數器
   */
  setTriggerFrequency(n: number): void {
    this.triggerFrequency = n;
    this.pageTurnCounter = 0;
  }

  /**
   * 啟動伴讀
   */
  start(): void {
    this.isActive = true;
    this.isPanelExpanded = true;
    this.hasUnread = false;
  }

  /**
   * 停止伴讀，重置所有狀態
   */
  stop(): void {
    this.isActive = false;
    this.pageTurnCounter = 0;
    this.accumulatedChapterIndices = [];
    this.messages = [];
    this.syncedCount = 0;
    this.isPanelExpanded = true;
    this.hasUnread = false;
  }

  /**
   * 切換面板展開/收合
   */
  togglePanel(): void {
    this.isPanelExpanded = !this.isPanelExpanded;
    if (this.isPanelExpanded) {
      this.hasUnread = false;
    }
  }

  setPanelExpanded(expanded: boolean): void {
    this.isPanelExpanded = expanded;
    if (expanded) {
      this.hasUnread = false;
    }
  }

  /**
   * 新增助手訊息時更新未讀狀態
   */
  onNewAssistantMessage(): void {
    if (!this.isPanelExpanded) {
      this.hasUnread = true;
    }
  }

  /**
   * 更新氣泡位置
   */
  updateBubblePosition(x: number, y: number): void {
    this.bubblePosition = { x, y };
  }
}

/**
 * 從章節列表中取得累積內容，並進行截斷處理
 * @param chapters 書籍所有章節
 * @param chapterIndices 累積的章節索引
 * @param maxChars 最大字元數（預設 3000）
 */
export function getAccumulatedContent(
  chapters: BookChapter[],
  chapterIndices: number[],
  maxChars: number = 3000,
): string {
  let content = "";

  for (const idx of chapterIndices) {
    const chapter = chapters[idx];
    if (!chapter) continue;
    const chapterText = `【${chapter.title}】\n${chapter.content}`;
    content += chapterText + "\n\n";
  }

  if (content.length > maxChars) {
    const half = Math.floor(maxChars / 2);
    const head = content.slice(0, half);
    const tail = content.slice(-half);
    content = head + "\n\n...（中間內容省略）...\n\n" + tail;
  }

  return content.trim();
}

/**
 * 構建同步到正式聊天的 GroupChatHistoryCard 資料
 */
export function buildSyncData(
  bookTitle: string,
  roundMessages: CompanionMessage[],
): {
  groupName: string;
  messages: Array<{
    senderName: string;
    content: string;
    timestamp: number;
    isUser: boolean;
  }>;
} {
  return {
    groupName: `📖 共讀：${bookTitle}`,
    messages: roundMessages.map((m) => ({
      senderName: m.senderName,
      content: m.content,
      timestamp: m.timestamp,
      isUser: m.role === "user",
    })),
  };
}

/**
 * 伴讀對話轉成 PromptBuilder 用的聊天訊息（最近 maxCount 則）
 * 自動觸發時在最後補一句「翻了幾頁」的提示，讓角色主動開口
 */
export function toCompanionChatMessages(
  history: CompanionMessage[],
  userName: string,
  charName: string,
  autoTrigger: boolean,
  maxCount = 20,
): ChatMessage[] {
  const toChat = (m: CompanionMessage): ChatMessage => ({
    id: m.id,
    sender: m.role === "user" ? "user" : "assistant",
    name: m.role === "user" ? userName : charName,
    is_user: m.role === "user",
    content: m.content,
    status: "sent",
    createdAt: m.timestamp,
    updatedAt: m.timestamp,
  });
  const messages = history.slice(-maxCount).map(toChat);
  if (autoTrigger) {
    const now = Date.now();
    messages.push(
      toChat({
        id: `comp_${now}_nudge`,
        role: "user",
        content: `（${userName}又翻了幾頁，讀到了上面那段。聊聊你讀到這裡的感想吧）`,
        timestamp: now,
        senderName: userName,
      }),
    );
  }
  return messages;
}

// ===== 持久化純函式 =====

/**
 * 將伴讀狀態序列化為 CompanionChatState（可存入 IDB）
 */
export function serializeCompanionState(
  bookId: string,
  characterId: string,
  triggerFrequency: number,
  pageTurnCounter: number,
  bubblePosition: { x: number; y: number },
  messages: CompanionMessage[],
  syncedCount: number = messages.length,
): CompanionChatState {
  return {
    bookId,
    characterId,
    triggerFrequency,
    pageTurnCounter,
    bubblePosition: { x: bubblePosition.x, y: bubblePosition.y },
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      senderName: m.senderName,
    })),
    syncedCount,
  };
}

/**
 * 從 CompanionChatState 反序列化，回傳與輸入等價的物件
 * 舊存檔沒有 syncedCount：當時每輪都整段貼過，視為全部已同步
 */
export function deserializeCompanionState(
  state: CompanionChatState,
): CompanionChatState {
  const syncedCount = Math.min(
    Math.max(state.syncedCount ?? state.messages.length, 0),
    state.messages.length,
  );
  return {
    syncedCount,
    bookId: state.bookId,
    characterId: state.characterId,
    triggerFrequency: state.triggerFrequency,
    pageTurnCounter: state.pageTurnCounter,
    bubblePosition: { x: state.bubblePosition.x, y: state.bubblePosition.y },
    messages: state.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      senderName: m.senderName,
    })),
  };
}

// ===== 伴讀時要帶的私聊記憶 =====

interface CompanionContext {
  lorebooks: Lorebook[];
  summaries: NonNullable<PromptBuilderOptions["summaries"]>;
  importantEvents: NonNullable<PromptBuilderOptions["importantEvents"]>;
  recentChatHistory: NonNullable<PromptBuilderOptions["recentChatHistory"]>;
}

/** 角色綁定＋全域世界書、私聊的總結／重要事件／最近 15 則對話（跟電話模式同樣的取法） */
async function loadCompanionContext(character: StoredCharacter): Promise<CompanionContext> {
  const { useLorebooksStore } = await import("@/stores/lorebooks");
  const { db, DB_STORES } = await import("@/db/database");
  const { loadMessages } = await import("@/storage/chatMessageStorage");
  const { selectSummariesForPrompt } = await import("@/utils/summarySelection");

  const lorebooksStore = useLorebooksStore();
  const linked = (character.lorebookIds ?? [])
    .map((id) => lorebooksStore.lorebooks.find((l) => l.id === id))
    .filter((l): l is Lorebook => !!l);
  const lorebooks = [
    ...linked,
    ...lorebooksStore.lorebooks.filter((l) => l.isGlobal && !linked.includes(l)),
  ];

  const context: CompanionContext = {
    lorebooks,
    summaries: [],
    importantEvents: [],
    recentChatHistory: [],
  };

  try {
    const chat = await resolvePreferredDirectChat(character.id);
    const allSummaries = await db.getAll<any>(DB_STORES.SUMMARIES);
    context.summaries = selectSummariesForPrompt(
      allSummaries.filter((s: any) => (chat && s.chatId === chat.id) || s.characterId === character.id),
      5,
    ).map((s: any) => ({
      id: s.id,
      content: s.content,
      createdAt: s.createdAt,
      coveredUntil: s.coveredUntil,
      isImportant: s.isImportant,
    }));

    const allEvents = await db.getAll<any>(DB_STORES.IMPORTANT_EVENTS);
    context.importantEvents = allEvents
      .filter((e: any) => e.characterId === character.id)
      .map((e: any) => ({ id: e.id, content: e.content, category: e.category, priority: e.priority }));

    if (chat) {
      // 只取一般對話；共讀卡本身就是伴讀紀錄，不重複放
      context.recentChatHistory = (await loadMessages(chat.id))
        .filter((m) => (m.sender === "user" || m.sender === "assistant") && !m.isGroupChatHistory)
        .slice(-15)
        .map((m) => ({
          role: (m.is_user ? "user" : "assistant") as "user" | "assistant",
          name: m.name,
          content: m.content,
          createdAt: m.createdAt,
        }));
    }
  } catch (e) {
    console.warn("[CompanionChat] 讀取私聊記憶失敗:", e);
  }
  return context;
}

// ===== Vue Composable =====

export interface UseCompanionChatOptions {
  book: Ref<StoredBook>;
  currentChapterIndex: Ref<number>;
  /** 使用者實際讀到的那幾頁（到目前這頁結尾為止）；有提供就不用整章內容 */
  getReadingWindow?: () => string;
  /** 目前位置之前最近幾則分段摘要（排版好的文字） */
  getReadingSummaries?: () => string;
  /** 角色成功回完一次（閱讀器用來記下「已經聊到哪」） */
  onReplied?: () => void;
}

/** 伴讀串流視窗擁有者 id 的前綴；閱讀器開著時用它標記「畫面上看得到」 */
export function companionStreamOwnerPrefix(bookId: string): string {
  return `companion:${bookId}:`;
}

export interface UseCompanionChatReturn {
  isActive: Ref<boolean>;
  selectedCharacterId: Ref<string | null>;
  triggerFrequency: Ref<number>;
  pageTurnCounter: Ref<number>;
  accumulatedChapters: Ref<number[]>;
  messages: Ref<CompanionMessage[]>;
  isGenerating: Ref<boolean>;
  errorMessage: Ref<string>;
  isPanelExpanded: Ref<boolean>;
  hasUnread: Ref<boolean>;
  bubblePosition: Ref<{ x: number; y: number }>;
  startCompanion(characterId: string): void;
  stopCompanion(): void;
  onPageTurn(chapterIndex: number): boolean;
  setTriggerFrequency(n: number): void;
  getAccumulatedContentText(): string;
  togglePanel(): void;
  setPanelExpanded(expanded: boolean): void;
  updateBubblePosition(x: number, y: number): void;
  sendMessage(content: string): Promise<void>;
  triggerAutoResponse(): Promise<void>;
  /** 展開這次伴讀的串流視窗；串流已經不在視窗裡時回傳 false */
  openStream(): boolean;
  syncToMainChat(): Promise<void>;
  saveState(): Promise<void>;
  restoreState(): Promise<void>;
  /** 離開閱讀器時呼叫：把這次的新對話貼成一張共讀卡，並保存狀態 */
  endSession(): Promise<void>;
}

export function useCompanionChat(
  options: UseCompanionChatOptions,
): UseCompanionChatReturn {
  const core = new CompanionChatCore();

  const isActive = ref(false);
  const selectedCharacterId = ref<string | null>(null);
  const triggerFrequency = ref(3);
  const pageTurnCounter = ref(0);
  const accumulatedChapters = ref<number[]>([]);
  const messages = ref<CompanionMessage[]>([]);
  const isGenerating = ref(false);
  /** 上一次叫角色回話失敗的原因（成功或重試時清空） */
  const errorMessage = ref("");
  const isPanelExpanded = ref(true);
  const hasUnread = ref(false);
  const bubblePosition = ref({ x: 20, y: 200 });
  const streamingWindow = useStreamingWindow();
  /** 最近一輪生成的串流視窗擁有者 */
  let streamOwnerId: string | null = null;

  function syncFromCore() {
    isActive.value = core.isActive;
    pageTurnCounter.value = core.pageTurnCounter;
    accumulatedChapters.value = [...core.accumulatedChapterIndices];
    messages.value = [...core.messages];
    isPanelExpanded.value = core.isPanelExpanded;
    hasUnread.value = core.hasUnread;
    triggerFrequency.value = core.triggerFrequency;
    bubblePosition.value = { ...core.bubblePosition };
  }

  function startCompanion(characterId: string) {
    selectedCharacterId.value = characterId;
    core.start();
    syncFromCore();
  }

  async function stopCompanion() {
    // 關閉時把還沒同步的對話貼到主聊天
    await syncToMainChat();
    // 刪掉存檔，下次打開這本書不會自動恢復伴讀
    await clearSavedState();
    core.stop();
    selectedCharacterId.value = null;
    syncFromCore();
  }

  function onPageTurn(chapterIndex: number): boolean {
    const triggered = core.onPageTurn(chapterIndex);
    syncFromCore();
    return triggered;
  }

  function setTriggerFrequency(n: number) {
    core.setTriggerFrequency(n);
    syncFromCore();
  }

  function getAccumulatedContentText(): string {
    if (options.getReadingWindow) return options.getReadingWindow();
    return getAccumulatedContent(
      options.book.value.chapters,
      core.accumulatedChapterIndices,
    );
  }

  function togglePanel() {
    core.togglePanel();
    syncFromCore();
  }

  function setPanelExpanded(expanded: boolean) {
    core.setPanelExpanded(expanded);
    syncFromCore();
  }

  function updateBubblePosition(x: number, y: number) {
    core.updateBubblePosition(x, y);
    syncFromCore();
  }

  /**
   * 叫角色回一次話：走 PromptBuilder 的伴讀模式，
   * 角色資料、人設、世界書（照關鍵字觸發）、私聊記憶都跟聊天一致
   */
  async function generateReply(autoTrigger: boolean): Promise<void> {
    const { useSettingsStore } = await import("@/stores/settings");
    const { useUserStore } = await import("@/stores/user");
    const { OpenAICompatibleClient } = await import("@/api/OpenAICompatible");
    const { PromptBuilder } = await import("@/engine/prompt/PromptBuilder");

    const character = useCharactersStore().characters.find(
      (c: StoredCharacter) => c.id === selectedCharacterId.value,
    );
    if (!character) return;
    const userStore = useUserStore();
    const userName = userStore.currentName || "我";
    const charName = character.data.name;

    isGenerating.value = true;
    errorMessage.value = "";
    if (autoTrigger) {
      // 觸發的當下就重新計數：生成中翻的頁算進下一輪，回完再一次講完
      core.resetAfterTrigger();
      syncFromCore();
    }
    let succeeded = false;
    // 串流視窗：縮小開著，點打字泡泡才展開；閱讀器開著時貼邊按鈕不浮出來（見 coverOwner）
    const ownerId = `${companionStreamOwnerPrefix(options.book.value.id)}${Date.now()}`;
    streamOwnerId = ownerId;
    const abort = new AbortController();
    const settingsStore = useSettingsStore();
    const chatTaskConfig = settingsStore.getAPIForTask("chat");
    streamingWindow.show(chatTaskConfig.api.model, true, ownerId);
    const unbindAbort = streamingWindow.bindAbortController(abort);
    try {
      if (!chatTaskConfig.api.endpoint || !chatTaskConfig.api.apiKey || !chatTaskConfig.api.model) {
        throw new Error("請先在設定中配置 API");
      }

      const context = await loadCompanionContext(character);
      const settings = {
        maxContextLength: chatTaskConfig.generation.maxContextLength || 200000,
        maxResponseLength: chatTaskConfig.generation.maxTokens || 8190,
        temperature: chatTaskConfig.generation.temperature ?? 0.7,
        topP: chatTaskConfig.generation.topP ?? 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
        repetitionPenalty: 1,
        stopSequences: [],
        streaming: true,
        useStreamingWindow: false,
        ...pickGenerationToggles(chatTaskConfig.generation),
      };

      const builder = new PromptBuilder({
        character,
        lorebooks: context.lorebooks,
        messages: toCompanionChatMessages(core.messages, userName, charName, autoTrigger),
        settings,
        userName,
        userPersona: userStore.currentPersona?.description,
        companionReadingMode: true,
        companionReading: {
          bookTitle: options.book.value.title,
          readingWindow: getAccumulatedContentText(),
          readingSummaries: options.getReadingSummaries?.(),
        },
        summaries: context.summaries,
        importantEvents: context.importantEvents,
        recentChatHistory: context.recentChatHistory,
        enableRealTimeAwareness: false,
      });
      const built = await builder.build();
      const prompt: APIMessage[] = built.messages.map((m) => ({ role: m.role, content: m.content }));

      const client = new OpenAICompatibleClient({ ...chatTaskConfig.api });
      const streamGen = client.generateStream({
        messages: prompt,
        settings,
        apiSettings: chatTaskConfig.api,
        adjustLastMessageRole: true,
        signal: abort.signal,
      });

      let fullContent = "";
      for await (const event of streamGen) {
        if (event.type === "token" && event.token) {
          fullContent += event.token;
          streamingWindow.appendToken(event.token, ownerId);
        } else if (event.type === "error") {
          throw new Error(String(event.error || "AI 沒有回應"));
        } else if (event.type === "done") {
          fullContent = event.content || fullContent;
        }
      }

      fullContent = fullContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      if (!fullContent) throw new Error("AI 沒有回應");

      core.messages.push({
        id: `comp_${Date.now()}_ai`,
        role: "assistant",
        content: fullContent,
        timestamp: Date.now(),
        senderName: charName,
      });
      core.onNewAssistantMessage();
      syncFromCore();

      // 先存起來，離開閱讀器時再一次貼到正式聊天
      await saveState();
      streamingWindow.setComplete(ownerId);
      options.onReplied?.();
      succeeded = true;
    } catch (e: any) {
      if (abort.signal.aborted) {
        errorMessage.value = "已停止";
        streamingWindow.setComplete(ownerId);
      } else {
        console.error("[CompanionChat] 生成失敗:", e);
        errorMessage.value = e?.message || "角色沒有回應";
        streamingWindow.setError(errorMessage.value, ownerId);
      }
    } finally {
      unbindAbort();
      streamingWindow.releaseOwnership(ownerId);
      isGenerating.value = false;
    }
    // 生成中又翻夠了頁：只再生成一次，把這段期間讀的一起講（失敗就不接著打，免得一直重試）
    if (succeeded && core.isActive && core.pageTurnCounter >= core.triggerFrequency) {
      await triggerAutoResponse();
    }
  }

  /** 這次伴讀的串流還在視窗裡：展開視窗 */
  function openStream(): boolean {
    if (!streamOwnerId || !streamingWindow.isOwnedBy(streamOwnerId)) return false;
    streamingWindow.restore();
    return true;
  }

  /**
   * 發送使用者訊息並取得 AI 回覆
   */
  async function sendMessage(content: string): Promise<void> {
    if (!selectedCharacterId.value || !core.isActive) return;
    if (isGenerating.value) return;

    const { useUserStore } = await import("@/stores/user");
    core.messages.push({
      id: `comp_${Date.now()}_user`,
      role: "user",
      content,
      timestamp: Date.now(),
      senderName: useUserStore().currentName || "我",
    });
    syncFromCore();
    await generateReply(false);
  }

  /**
   * 自動觸發 AI 回覆（翻頁達到門檻時呼叫）
   */
  async function triggerAutoResponse(): Promise<void> {
    if (!selectedCharacterId.value || !core.isActive) return;
    if (isGenerating.value) return;
    await generateReply(true);
  }

  // 同步排隊執行，避免離開閱讀器與停止伴讀同時觸發時重複貼卡
  let syncQueue: Promise<void> = Promise.resolve();

  /**
   * 將還沒同步的對話貼到正式聊天（一張 GroupChatHistoryCard）
   * 只貼 syncedCount 之後的新訊息，貼過的不會再貼
   */
  function syncToMainChat(): Promise<void> {
    syncQueue = syncQueue.then(syncPendingMessages);
    return syncQueue;
  }

  async function syncPendingMessages(): Promise<void> {
    if (!selectedCharacterId.value) return;
    const upTo = core.messages.length;
    const pending = core.messages.slice(core.syncedCount, upTo);
    if (pending.length === 0) return;

    try {
      const characterId = selectedCharacterId.value;
      const bookTitle = options.book.value.title;
      const historyData = buildSyncData(bookTitle, pending);

      let targetChat: Chat | undefined = await resolvePreferredDirectChat(characterId);

      if (!targetChat) {
        const charsStore = useCharactersStore();
        const character = charsStore.characters.find(
          (c: StoredCharacter) => c.id === characterId,
        );
        const charName = character?.data.name || "角色";

        targetChat = {
          id: crypto.randomUUID(),
          name: `Chat with ${charName}`,
          characterId,
          messages: [],
          metadata: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await createChatRecord(targetChat);
      }

      const syncMessage: ChatMessage = {
        id: `msg_companion_${Date.now()}`,
        sender: "system",
        name: "系統",
        is_user: false,
        content: `📖 共讀記錄`,
        isGroupChatHistory: true,
        groupChatHistoryData: historyData,
        status: "sent",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await appendMessages(targetChat.id, [syncMessage]);
      core.syncedCount = upTo;
      await refreshChatDerivedMetadata(targetChat.id);
    } catch (e) {
      console.warn("[CompanionChat] syncToMainChat 失敗:", e);
    }
  }

  /**
   * 將當前伴讀狀態儲存到 IndexedDB
   * 使用 key: companion-chat-{bookId}
   */
  async function saveState(): Promise<void> {
    if (!selectedCharacterId.value) return;

    try {
      const { db, DB_STORES } = await import("@/db/database");
      const bookId = options.book.value.id;
      const state = serializeCompanionState(
        bookId,
        selectedCharacterId.value,
        core.triggerFrequency,
        core.pageTurnCounter,
        core.bubblePosition,
        core.messages,
        core.syncedCount,
      );
      await db.put(DB_STORES.APP_SETTINGS, {
        ...state,
        id: `companion-chat-${bookId}`,
      });
    } catch (e) {
      console.warn("[CompanionChat] saveState 失敗:", e);
    }
  }

  /**
   * 從 IndexedDB 恢復伴讀狀態
   * 如果找到匹配的 bookId 狀態，自動啟動 CompanionChat
   */
  async function restoreState(): Promise<void> {
    try {
      const { db, DB_STORES } = await import("@/db/database");
      const bookId = options.book.value.id;
      const saved = await db.get<CompanionChatState>(
        DB_STORES.APP_SETTINGS,
        `companion-chat-${bookId}`,
      );

      if (!saved || saved.bookId !== bookId) return;

      const state = deserializeCompanionState(saved);

      // Restore core state
      selectedCharacterId.value = state.characterId;
      core.triggerFrequency = state.triggerFrequency;
      core.pageTurnCounter = state.pageTurnCounter;
      core.bubblePosition = { ...state.bubblePosition };
      core.messages = [...state.messages];
      core.syncedCount = state.syncedCount ?? state.messages.length;
      core.isActive = true;
      core.isPanelExpanded = true;
      core.hasUnread = false;

      syncFromCore();

      // 上次沒正常離開（例如 App 被關掉）留下的對話，現在補貼
      if (core.syncedCount < core.messages.length) {
        await endSession();
      }
    } catch (e) {
      console.warn("[CompanionChat] restoreState 失敗:", e);
    }
  }

  async function endSession(): Promise<void> {
    await syncToMainChat();
    await saveState();
  }

  async function clearSavedState(): Promise<void> {
    try {
      const { db, DB_STORES } = await import("@/db/database");
      await db.delete(DB_STORES.APP_SETTINGS, `companion-chat-${options.book.value.id}`);
    } catch (e) {
      console.warn("[CompanionChat] clearSavedState 失敗:", e);
    }
  }

  return {
    isActive,
    selectedCharacterId,
    triggerFrequency,
    pageTurnCounter,
    accumulatedChapters,
    messages,
    isGenerating,
    errorMessage,
    isPanelExpanded,
    hasUnread,
    bubblePosition,
    startCompanion,
    stopCompanion,
    onPageTurn,
    setTriggerFrequency,
    getAccumulatedContentText,
    togglePanel,
    setPanelExpanded,
    updateBubblePosition,
    sendMessage,
    triggerAutoResponse,
    openStream,
    syncToMainChat,
    saveState,
    restoreState,
    endSession,
  };
}
