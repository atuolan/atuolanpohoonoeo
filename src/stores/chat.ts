/**
 * 聊天 Store
 * 管理當前聊天狀態
 */

import type {
    Chat,
    ChatAppearance,
    ChatMessage,
    ChatSettings,
    GroupChatMetadata,
    GroupMember,
} from "@/types/chat";
import {
    createDefaultChat,
    createDefaultChatSettings,
    createDefaultGroupChat,
    createDefaultMessage,
} from "@/types/chat";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

export const useChatStore = defineStore("chat", () => {
  // ===== State =====
  const currentChat = ref<Chat | null>(null);
  const chatHistory = ref<Chat[]>([]);
  const settings = ref<ChatSettings>(createDefaultChatSettings());
  const isGenerating = ref(false);
  const streamingContent = ref("");
  const abortController = ref<AbortController | null>(null);

  // 輸入框草稿暫存（key: chatId, value: 草稿文字）
  const draftTexts = ref<Record<string, string>>({});

  // 當前聊天外觀緩存（用於 ChatScreen 和 App.vue 之間同步）
  const currentChatAppearance = ref<ChatAppearance | undefined>(undefined);

  // ===== Getters =====
  const messages = computed(() => currentChat.value?.messages ?? []);
  const messageCount = computed(() => messages.value.length);
  const lastMessage = computed(
    () => messages.value[messages.value.length - 1] ?? null,
  );
  const hasChat = computed(() => currentChat.value !== null);

  const chatHistoryForCharacter = computed(() => {
    if (!currentChat.value) return [];
    return chatHistory.value.filter(
      (c) => c.characterId === currentChat.value?.characterId,
    );
  });

  // ===== Actions =====

  /**
   * 創建新聊天
   */
  function createChat(characterId: string, characterName: string): Chat {
    const chat = createDefaultChat(characterId, characterName);
    currentChat.value = chat;
    return chat;
  }

  /**
   * 載入聊天
   */
  function loadChat(chat: Chat): void {
    currentChat.value = chat;
  }

  /**
   * 添加消息
   */
  function addMessage(message: ChatMessage): void {
    if (!currentChat.value) return;
    currentChat.value.messages.push(message);
    currentChat.value.updatedAt = Date.now();
  }

  /**
   * 添加用戶消息
   */
  function addUserMessage(
    content: string,
    userName: string = "User",
  ): ChatMessage {
    const message = createDefaultMessage("user", userName, content);
    addMessage(message);
    return message;
  }

  /**
   * 添加助手消息
   */
  function addAssistantMessage(content: string, charName: string): ChatMessage {
    const message = createDefaultMessage("assistant", charName, content);
    addMessage(message);
    return message;
  }

  /**
   * 添加多條助手消息（用於解析後的訊息列表）
   */
  function addAssistantMessages(
    contents: string[],
    charName: string,
  ): ChatMessage[] {
    const messages: ChatMessage[] = [];
    for (const content of contents) {
      if (content.trim()) {
        const message = createDefaultMessage("assistant", charName, content);
        addMessage(message);
        messages.push(message);
      }
    }
    return messages;
  }

  /**
   * 更新消息
   */
  function updateMessage(
    messageId: string,
    updates: Partial<ChatMessage>,
  ): void {
    if (!currentChat.value) return;
    const index = currentChat.value.messages.findIndex(
      (m) => m.id === messageId,
    );
    if (index !== -1) {
      currentChat.value.messages[index] = {
        ...currentChat.value.messages[index],
        ...updates,
        updatedAt: Date.now(),
      };
    }
  }

  /**
   * 刪除消息
   */
  function deleteMessage(messageId: string): void {
    if (!currentChat.value) return;
    currentChat.value.messages = currentChat.value.messages.filter(
      (m) => m.id !== messageId,
    );
    currentChat.value.updatedAt = Date.now();
  }

  /**
   * 開始流式生成
   */
  function startStreaming(): void {
    isGenerating.value = true;
    streamingContent.value = "";
    abortController.value = new AbortController();
  }

  /**
   * 更新流式內容
   */
  function updateStreamingContent(content: string): void {
    streamingContent.value = content;
  }

  /**
   * 追加流式內容
   */
  function appendStreamingContent(token: string): void {
    streamingContent.value += token;
  }

  /**
   * 結束流式生成
   */
  function endStreaming(): void {
    isGenerating.value = false;
    streamingContent.value = "";
    abortController.value = null;
  }

  /**
   * 中止生成
   */
  function abortGeneration(): void {
    if (abortController.value) {
      abortController.value.abort();
    }
    endStreaming();
  }

  /**
   * 滑動消息（切換到下一個回覆）
   */
  function swipeMessage(messageId: string, direction: "next" | "prev"): void {
    if (!currentChat.value) return;
    const message = currentChat.value.messages.find((m) => m.id === messageId);
    if (!message || !message.swipes || message.swipes.length <= 1) return;

    const currentIndex = message.swipeId ?? 0;
    let newIndex: number;

    if (direction === "next") {
      newIndex = (currentIndex + 1) % message.swipes.length;
    } else {
      newIndex =
        currentIndex === 0 ? message.swipes.length - 1 : currentIndex - 1;
    }

    message.content = message.swipes[newIndex];
    message.swipeId = newIndex;
    message.updatedAt = Date.now();
  }

  /**
   * 添加滑動選項
   */
  function addSwipe(messageId: string, content: string): void {
    if (!currentChat.value) return;
    const message = currentChat.value.messages.find((m) => m.id === messageId);
    if (!message) return;

    if (!message.swipes) {
      message.swipes = [message.content];
      message.swipeId = 0;
    }

    message.swipes.push(content);
    message.swipeId = message.swipes.length - 1;
    message.content = content;
    message.updatedAt = Date.now();
  }

  /**
   * 重新生成最後一條消息
   */
  function prepareRegenerate(): ChatMessage | null {
    if (!currentChat.value) return null;
    const lastAssistantMsg = [...currentChat.value.messages]
      .reverse()
      .find((m) => m.sender === "assistant");
    return lastAssistantMsg ?? null;
  }

  /**
   * 更新設定
   */
  function updateSettings(updates: Partial<ChatSettings>): void {
    settings.value = { ...settings.value, ...updates };
  }

  /**
   * 清除當前聊天
   */
  function clearChat(): void {
    currentChat.value = null;
    streamingContent.value = "";
    isGenerating.value = false;
  }

  /**
   * 獲取聊天消息（用於發送到 API）
   */
  function getMessagesForAPI(): Array<{
    role: string;
    content: string;
    name?: string;
  }> {
    if (!currentChat.value) return [];

    return currentChat.value.messages.map((m) => ({
      role:
        m.sender === "user"
          ? "user"
          : m.sender === "assistant"
            ? "assistant"
            : "system",
      content: m.content,
      name: m.name,
    }));
  }

  /**
   * 設置作者筆記
   */
  function setAuthorsNote(content: string, depth: number = 4): void {
    if (!currentChat.value) return;
    if (!currentChat.value.metadata.authorsNote) {
      currentChat.value.metadata.authorsNote = {
        prompt: content,
        interval: 0,
        depth,
        position: 0,
        role: 0,
      };
    } else {
      currentChat.value.metadata.authorsNote.prompt = content;
      currentChat.value.metadata.authorsNote.depth = depth;
    }
  }

  /**
   * 更新聊天外觀設定（同時更新緩存）
   */
  function updateAppearance(appearance: ChatAppearance): void {
    // 更新緩存
    currentChatAppearance.value = appearance;
    // 如果有 currentChat 也更新它
    if (currentChat.value) {
      currentChat.value.appearance = appearance;
      currentChat.value.updatedAt = Date.now();
    }
  }

  /**
   * 設置聊天外觀緩存（用於 ChatScreen 載入時同步）
   */
  function setAppearanceCache(appearance: ChatAppearance | undefined): void {
    currentChatAppearance.value = appearance;
  }

  /**
   * 獲取聊天外觀設定（優先從緩存獲取）
   */
  function getAppearance(): ChatAppearance | undefined {
    return currentChatAppearance.value ?? currentChat.value?.appearance;
  }

  // ===== 群聊 Actions =====

  /**
   * 建立群聊
   * Requirements: 1.1, 7.1
   */
  function createGroupChat(groupName: string, characterIds: string[]): Chat {
    const chat = createDefaultGroupChat(groupName, characterIds);
    currentChat.value = chat;
    return chat;
  }

  /**
   * 新增群聊訊息
   * Requirements: 1.2, 1.3
   */
  function addGroupMessage(
    message: ChatMessage,
    senderCharacterId: string,
  ): void {
    if (!currentChat.value?.isGroupChat) return;
    message.senderCharacterId = senderCharacterId;
    addMessage(message);
  }

  /**
   * 更新群聊元數據
   * Requirements: 7.2
   */
  function updateGroupMetadata(updates: Partial<GroupChatMetadata>): void {
    if (!currentChat.value?.isGroupChat || !currentChat.value.groupMetadata)
      return;
    currentChat.value.groupMetadata = {
      ...currentChat.value.groupMetadata,
      ...updates,
    };
    currentChat.value.updatedAt = Date.now();
  }

  /**
   * 禁言/解禁群成員
   * Requirements: 7.5
   */
  function muteGroupMember(characterId: string, muted: boolean): void {
    if (!currentChat.value?.isGroupChat || !currentChat.value.groupMetadata)
      return;
    const member = currentChat.value.groupMetadata.members.find(
      (m) => m.characterId === characterId,
    );
    if (member) {
      member.isMuted = muted;
      currentChat.value.updatedAt = Date.now();
    }
  }

  /**
   * 設定/取消管理員
   * Requirements: 7.4
   */
  function setGroupAdmin(characterId: string, isAdmin: boolean): void {
    if (!currentChat.value?.isGroupChat || !currentChat.value.groupMetadata)
      return;
    const member = currentChat.value.groupMetadata.members.find(
      (m) => m.characterId === characterId,
    );
    if (member) {
      member.isAdmin = isAdmin;
      currentChat.value.updatedAt = Date.now();
    }
  }

  /**
   * 新增群成員
   * Requirements: 7.3
   */
  function addGroupMember(characterId: string): void {
    if (!currentChat.value?.isGroupChat || !currentChat.value.groupMetadata)
      return;
    const exists = currentChat.value.groupMetadata.members.some(
      (m) => m.characterId === characterId,
    );
    if (exists) return;
    const newMember: GroupMember = {
      characterId,
      isAdmin: false,
      isMuted: false,
      joinedAt: Date.now(),
    };
    currentChat.value.groupMetadata.members.push(newMember);
    currentChat.value.updatedAt = Date.now();
  }

  /**
   * 移除群成員
   * Requirements: 7.3
   */
  function removeGroupMember(characterId: string): void {
    if (!currentChat.value?.isGroupChat || !currentChat.value.groupMetadata)
      return;
    const members = currentChat.value.groupMetadata.members;
    // 群聊至少需要 2 個成員
    if (members.length <= 2) return;
    currentChat.value.groupMetadata.members = members.filter(
      (m) => m.characterId !== characterId,
    );
    currentChat.value.updatedAt = Date.now();
  }

  /**
   * 更新群聊綁定的世界書 ID 列表
   */
  function updateGroupLorebookIds(lorebookIds: string[]): void {
    if (!currentChat.value?.isGroupChat || !currentChat.value.groupMetadata)
      return;
    currentChat.value.groupMetadata.lorebookIds = [...lorebookIds];
    currentChat.value.updatedAt = Date.now();
  }

  // ===== 輸入框草稿暫存 =====

  /**
   * 保存草稿文字
   */
  function saveDraft(chatId: string, text: string): void {
    if (text.trim()) {
      draftTexts.value[chatId] = text;
    } else {
      delete draftTexts.value[chatId];
    }
  }

  /**
   * 讀取草稿文字
   */
  function getDraft(chatId: string): string {
    return draftTexts.value[chatId] ?? "";
  }

  /**
   * 清除草稿文字
   */
  function clearDraft(chatId: string): void {
    delete draftTexts.value[chatId];
  }

  return {
    // State
    currentChat,
    chatHistory,
    settings,
    isGenerating,
    streamingContent,
    abortController,
    currentChatAppearance,
    // Getters
    messages,
    messageCount,
    lastMessage,
    hasChat,
    chatHistoryForCharacter,
    // Actions
    createChat,
    loadChat,
    addMessage,
    addUserMessage,
    addAssistantMessage,
    addAssistantMessages,
    updateMessage,
    deleteMessage,
    startStreaming,
    updateStreamingContent,
    appendStreamingContent,
    endStreaming,
    abortGeneration,
    swipeMessage,
    addSwipe,
    prepareRegenerate,
    updateSettings,
    clearChat,
    getMessagesForAPI,
    setAuthorsNote,
    updateAppearance,
    setAppearanceCache,
    getAppearance,
    // 群聊 Actions
    createGroupChat,
    addGroupMessage,
    updateGroupMetadata,
    muteGroupMember,
    setGroupAdmin,
    addGroupMember,
    removeGroupMember,
    updateGroupLorebookIds,
    // 草稿暫存 Actions
    saveDraft,
    getDraft,
    clearDraft,
  };
});
