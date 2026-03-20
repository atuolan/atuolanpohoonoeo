/**
 * 伴讀聊天 Composable
 * 管理書籍伴讀角色的聊天狀態、翻頁觸發、內容累積等核心邏輯
 */

import type { APIMessage } from "@/api/OpenAICompatible";
import type {
  BookChapter,
  CompanionChatState,
  CompanionMessage,
  StoredBook,
} from "@/types/book";
import type { Chat, ChatMessage } from "@/types/chat";
import type { StoredCharacter } from "@/types/character";
import { computed, ref, type ComputedRef, type Ref } from "vue";

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
 * 構建伴讀聊天的 AI prompt
 * 純函式，不依賴 Vue reactivity
 *
 * @param character 角色資料
 * @param bookTitle 書名
 * @param readingContent 累積的閱讀內容
 * @param chatHistory 聊天歷史
 * @param userMessage 使用者手動輸入的訊息（undefined 表示自動觸發）
 * @param worldInfoText 世界書注入文字（角色綁定 + 全域世界書）
 * @param userName 使用者名稱（persona 名稱）
 */
export function buildCompanionPrompt(
  character: StoredCharacter,
  bookTitle: string,
  readingContent: string,
  chatHistory: CompanionMessage[],
  userMessage?: string,
  worldInfoText?: string,
  userName?: string,
): APIMessage[] {
  const displayUserName = userName || "用戶";
  const systemPrompt = `你是 ${character.data.name}，正在和${displayUserName}一起閱讀《${bookTitle}》。
${character.data.description || ""}
${character.data.personality || ""}

你的任務是作為伴讀夥伴，對${displayUserName}正在閱讀的內容發表評論、提出見解或與${displayUserName}討論。
請保持角色性格，用自然的語氣交流。

【回覆格式要求】
你的回覆必須像線上聊天一樣，分成多段訊息，每段之間用換行分隔。
- 總共 8 到 12 段
- 每段最多 50 個字
- 像在傳訊息一樣，一段一段地說
- 不要用一大段文字回覆`;

  const messages: APIMessage[] = [{ role: "system", content: systemPrompt }];

  // 注入世界書設定
  if (worldInfoText) {
    messages.push({
      role: "system",
      content: `【世界觀設定】\n${worldInfoText}`,
    });
  }

  if (readingContent) {
    messages.push({
      role: "system",
      content: `【${displayUserName}正在閱讀的內容】\n${readingContent}`,
    });
  }

  // 加入聊天歷史（最近 10 條）
  const recentHistory = chatHistory.slice(-10);
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    });
  }

  // 自動觸發（無 userMessage）vs 手動訊息
  if (userMessage === undefined) {
    messages.push({
      role: "user",
      content: `（${displayUserName}翻了幾頁，請對上面的閱讀內容發表你的看法或評論）`,
    });
  } else {
    messages.push({ role: "user", content: userMessage });
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
  };
}

/**
 * 從 CompanionChatState 反序列化，回傳與輸入等價的物件
 */
export function deserializeCompanionState(
  state: CompanionChatState,
): CompanionChatState {
  return {
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

// ===== 世界書收集輔助函式 =====

/**
 * 收集角色綁定的世界書 + 全域世界書的啟用條目文字
 * 跟隨 phoneCall store 的相同模式
 */
function collectWorldInfo(
  character: StoredCharacter,
  lorebooksStore: ReturnType<typeof import("@/stores/lorebooks").useLorebooksStore>,
): string {
  const linkedLorebooks = [];

  // 角色綁定的世界書
  if (character.lorebookIds?.length) {
    for (const id of character.lorebookIds) {
      const lb = lorebooksStore.lorebooks.find((l) => l.id === id);
      if (lb) linkedLorebooks.push(lb);
    }
  }

  // 全域世界書
  linkedLorebooks.push(
    ...lorebooksStore.lorebooks.filter((lb) => lb.isGlobal),
  );

  if (linkedLorebooks.length === 0) return "";

  const lines: string[] = [];
  for (const lb of linkedLorebooks) {
    const enabledEntries = lb.entries.filter((e) => !e.disable && e.content);
    if (enabledEntries.length === 0) continue;
    lines.push(`[${lb.name}]`);
    for (const entry of enabledEntries) {
      lines.push(entry.content);
    }
  }

  return lines.join("\n");
}

// ===== Vue Composable =====

export interface UseCompanionChatOptions {
  book: Ref<StoredBook>;
  currentChapterIndex: Ref<number>;
}

export interface UseCompanionChatReturn {
  isActive: Ref<boolean>;
  selectedCharacterId: Ref<string | null>;
  triggerFrequency: Ref<number>;
  pageTurnCounter: Ref<number>;
  accumulatedChapters: Ref<number[]>;
  messages: Ref<CompanionMessage[]>;
  isGenerating: Ref<boolean>;
  isPanelExpanded: Ref<boolean>;
  hasUnread: Ref<boolean>;
  bubblePosition: Ref<{ x: number; y: number }>;
  startCompanion(characterId: string): void;
  stopCompanion(): void;
  onPageTurn(chapterIndex: number): boolean;
  setTriggerFrequency(n: number): void;
  getAccumulatedContentText(): string;
  togglePanel(): void;
  updateBubblePosition(x: number, y: number): void;
  sendMessage(content: string): Promise<void>;
  triggerAutoResponse(): Promise<void>;
  syncToMainChat(): Promise<void>;
  saveState(): Promise<void>;
  restoreState(): Promise<void>;
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
  const isPanelExpanded = ref(true);
  const hasUnread = ref(false);
  const bubblePosition = ref({ x: 20, y: 200 });

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
    // Auto-save before stopping
    await saveState();
    // 關閉時將伴讀對話同步到主聊天
    await syncToMainChat();
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
    return getAccumulatedContent(
      options.book.value.chapters,
      core.accumulatedChapterIndices,
    );
  }

  function togglePanel() {
    core.togglePanel();
    syncFromCore();
  }

  function updateBubblePosition(x: number, y: number) {
    core.updateBubblePosition(x, y);
    syncFromCore();
  }

  /**
   * 發送使用者訊息並取得 AI 回覆
   */
  async function sendMessage(content: string): Promise<void> {
    if (!selectedCharacterId.value || !core.isActive) return;
    if (isGenerating.value) return;

    // 取得角色和設定
    const { useCharactersStore } = await import("@/stores/characters");
    const { useSettingsStore } = await import("@/stores/settings");
    const { useLorebooksStore } = await import("@/stores/lorebooks");
    const { OpenAICompatibleClient } = await import("@/api/OpenAICompatible");
    const { useUserStore } = await import("@/stores/user");

    const charsStore = useCharactersStore();
    const settingsStore = useSettingsStore();
    const lorebooksStore = useLorebooksStore();
    const userStore = useUserStore();
    const character = charsStore.characters.find(
      (c: StoredCharacter) => c.id === selectedCharacterId.value,
    );
    if (!character) return;

    const userName = userStore.currentName || "我";

    // 收集世界書內容
    const worldInfoText = collectWorldInfo(character, lorebooksStore);

    // 加入使用者訊息
    const userMsg: CompanionMessage = {
      id: `comp_${Date.now()}_user`,
      role: "user",
      content,
      timestamp: Date.now(),
      senderName: userName,
    };
    core.messages.push(userMsg);
    syncFromCore();

    // 構建 prompt 並呼叫 AI
    isGenerating.value = true;
    try {
      const readingContent = getAccumulatedContentText();
      const prompt = buildCompanionPrompt(
        character,
        options.book.value.title,
        readingContent,
        core.messages,
        content,
        worldInfoText,
        userName,
      );
      const chatTaskConfig = settingsStore.getAPIForTask("chat");

      const client = new OpenAICompatibleClient(chatTaskConfig.api);
      const streamGen = client.generateStream({
        messages: prompt,
        settings: {
          maxContextLength: chatTaskConfig.generation.maxContextLength || 200000,
          maxResponseLength: chatTaskConfig.generation.maxTokens || 8190,
          temperature: chatTaskConfig.generation.temperature ?? 0.7,
          topP: chatTaskConfig.generation.topP ?? 1,
          topK: 0,
          frequencyPenalty: 0,
          presencePenalty: 0,
          repetitionPenalty: 1,
          stopSequences: [],
          streaming: true,
          useStreamingWindow: false,
        },
        apiSettings: chatTaskConfig.api,
        adjustLastMessageRole: true,
      });

      let fullContent = "";
      for await (const event of streamGen) {
        if (event.type === "token" && event.token) {
          fullContent += event.token;
        } else if (event.type === "error") {
          console.error("[CompanionChat] AI 生成錯誤:", event.error);
          break;
        } else if (event.type === "done") {
          fullContent = event.content || fullContent;
        }
      }

      if (fullContent) {
        const aiMsg: CompanionMessage = {
          id: `comp_${Date.now()}_ai`,
          role: "assistant",
          content: fullContent,
          timestamp: Date.now(),
          senderName: character.data.name,
        };
        core.messages.push(aiMsg);
        core.onNewAssistantMessage();
        syncFromCore();

        // 同步到正式聊天
        await syncToMainChat();
      }
    } catch (e) {
      console.error("[CompanionChat] sendMessage 失敗:", e);
    } finally {
      isGenerating.value = false;
    }
  }

  /**
   * 自動觸發 AI 回覆（翻頁達到門檻時呼叫）
   */
  async function triggerAutoResponse(): Promise<void> {
    if (!selectedCharacterId.value || !core.isActive) return;
    if (isGenerating.value) return;

    const { useCharactersStore } = await import("@/stores/characters");
    const { useSettingsStore } = await import("@/stores/settings");
    const { useLorebooksStore } = await import("@/stores/lorebooks");
    const { OpenAICompatibleClient } = await import("@/api/OpenAICompatible");
    const { useUserStore } = await import("@/stores/user");

    const charsStore = useCharactersStore();
    const settingsStore = useSettingsStore();
    const lorebooksStore = useLorebooksStore();
    const userStore = useUserStore();
    const character = charsStore.characters.find(
      (c: StoredCharacter) => c.id === selectedCharacterId.value,
    );
    if (!character) return;

    const userName = userStore.currentName || "我";

    // 收集世界書內容
    const worldInfoText = collectWorldInfo(character, lorebooksStore);

    isGenerating.value = true;
    try {
      const readingContent = getAccumulatedContentText();
      const prompt = buildCompanionPrompt(
        character,
        options.book.value.title,
        readingContent,
        core.messages,
        // no userMessage → auto-trigger
        undefined,
        worldInfoText,
        userName,
      );
      const chatTaskConfig = settingsStore.getAPIForTask("chat");

      const client = new OpenAICompatibleClient(chatTaskConfig.api);
      const streamGen = client.generateStream({
        messages: prompt,
        settings: {
          maxContextLength: chatTaskConfig.generation.maxContextLength || 200000,
          maxResponseLength: chatTaskConfig.generation.maxTokens || 8190,
          temperature: chatTaskConfig.generation.temperature ?? 0.7,
          topP: chatTaskConfig.generation.topP ?? 1,
          topK: 0,
          frequencyPenalty: 0,
          presencePenalty: 0,
          repetitionPenalty: 1,
          stopSequences: [],
          streaming: true,
          useStreamingWindow: false,
        },
        apiSettings: chatTaskConfig.api,
        adjustLastMessageRole: true,
      });

      let fullContent = "";
      for await (const event of streamGen) {
        if (event.type === "token" && event.token) {
          fullContent += event.token;
        } else if (event.type === "error") {
          console.error("[CompanionChat] AI 自動觸發錯誤:", event.error);
          break;
        } else if (event.type === "done") {
          fullContent = event.content || fullContent;
        }
      }

      if (fullContent) {
        const aiMsg: CompanionMessage = {
          id: `comp_${Date.now()}_ai`,
          role: "assistant",
          content: fullContent,
          timestamp: Date.now(),
          senderName: character.data.name,
        };
        core.messages.push(aiMsg);
        core.onNewAssistantMessage();
        syncFromCore();

        // 重置觸發計數
        core.resetAfterTrigger();
        syncFromCore();

        // 同步到正式聊天
        await syncToMainChat();
      }
    } catch (e) {
      console.error("[CompanionChat] triggerAutoResponse 失敗:", e);
    } finally {
      isGenerating.value = false;
    }
  }

  /**
   * 將最近一輪對話同步到正式聊天（GroupChatHistoryCard）
   */
  async function syncToMainChat(): Promise<void> {
    if (!selectedCharacterId.value || core.messages.length === 0) return;

    try {
      const { db, DB_STORES } = await import("@/db/database");

      const bookTitle = options.book.value.title;
      const characterId = selectedCharacterId.value;

      // 構建 GroupChatHistoryCard 資料
      const historyData = buildSyncData(bookTitle, core.messages);

      // 從 IDB 找到該角色的一對一聊天（排除群聊）
      const allChats = await db.getAll<Chat>(DB_STORES.CHATS);
      let targetChat: Chat | undefined = allChats.find(
        (c) => c.characterId === characterId && !c.isGroupChat,
      );

      if (!targetChat) {
        // 沒有現有聊天，建立一個新的
        const { useCharactersStore } = await import("@/stores/characters");
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
      }

      // 建立 isGroupChatHistory 訊息
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

      targetChat.messages = [...(targetChat.messages || []), syncMessage];
      targetChat.updatedAt = Date.now();

      await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(targetChat)));
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
      core.isActive = true;
      core.isPanelExpanded = true;
      core.hasUnread = false;

      syncFromCore();
    } catch (e) {
      console.warn("[CompanionChat] restoreState 失敗:", e);
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
    isPanelExpanded,
    hasUnread,
    bubblePosition,
    startCompanion,
    stopCompanion,
    onPageTurn,
    setTriggerFrequency,
    getAccumulatedContentText,
    togglePanel,
    updateBubblePosition,
    sendMessage,
    triggerAutoResponse,
    syncToMainChat,
    saveState,
    restoreState,
  };
}
