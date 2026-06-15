/**
 * PeekPhone Store
 * 管理偷窺手機的狀態，包括快取、載入狀態、AI 生成結果
 */

import { useStreamingWindow } from "@/composables/useStreamingWindow";
import { db, DB_STORES } from "@/db/database";
import {
  extractChatContext,
  extractSummariesAndEvents,
  generateContactReply,
  generateSequential,
  generateSinglePhase,
} from "@/services/PeekPhoneService";
import { useLorebooksStore } from "@/stores/lorebooks";
import { useNotificationStore } from "@/stores/notification";
import { isWorldInfoEntryEnabled } from "@/utils/worldInfoEntryState";
import { useSettingsStore } from "@/stores/settings";
import { useUserStore } from "@/stores/user";
import type { StoredCharacter } from "@/types/character";
import type { Chat } from "@/types/chat";
import type {
  PeekChatMessage,
  PeekChatThread,
  PeekPhoneData,
} from "@/types/peekPhone";
import { defineStore } from "pinia";
import { ref } from "vue";

export type GroupStatus = "idle" | "loading" | "done" | "error";

export const usePeekPhoneStore = defineStore("peekPhone", () => {
  // ===== State =====
  const groupStatus = ref<{
    A: GroupStatus;
    B: GroupStatus;
    C: GroupStatus;
    D: GroupStatus;
  }>({
    A: "idle",
    B: "idle",
    C: "idle",
    D: "idle",
  });
  const groupErrors = ref<{
    A: string | null;
    B: string | null;
    C: string | null;
    D: string | null;
  }>({
    A: null,
    B: null,
    C: null,
    D: null,
  });
  const data = ref<PeekPhoneData | null>(null);
  const characterId = ref<string | null>(null);
  const chatId = ref<string | null>(null);

  /** 快取 Map，key = `${characterId}:${chatId}` */
  const cache = new Map<string, PeekPhoneData>();

  /** AbortController for the current combined in-flight request */
  const abortController = ref<AbortController | null>(null);

  /** 正在等待聯絡人回覆的聊天串 id（用於顯示「對方輸入中」與避免重複發送） */
  const replyingThreadId = ref<string | null>(null);
  /** 聯絡人回覆專用的 AbortController（與批量生成分開） */
  const replyAbortController = ref<AbortController | null>(null);

  // ===== Cache Actions =====

  function cacheKey(charId: string, cId: string): string {
    return `${charId}:${cId}`;
  }

  function getCached(charId: string, cId: string): PeekPhoneData | null {
    return cache.get(cacheKey(charId, cId)) ?? null;
  }

  function clearCache(charId: string, cId: string): void {
    cache.delete(cacheKey(charId, cId));
  }

  function storeCache(
    charId: string,
    cId: string,
    phoneData: PeekPhoneData,
  ): void {
    cache.set(cacheKey(charId, cId), phoneData);
  }

  // ===== IDB Persistence =====

  /** 從 IDB 載入偷窺手機資料 */
  async function loadFromIDB(charId: string, cId: string): Promise<PeekPhoneData | null> {
    try {
      await db.init();
      const key = cacheKey(charId, cId);
      const record = await db.get<{ id: string; characterId: string; chatId: string; data: PeekPhoneData; updatedAt: number }>(DB_STORES.PEEK_PHONE_DATA, key);
      if (record?.data) {
        // 同步寫入記憶體快取
        cache.set(key, record.data);
        return record.data;
      }
    } catch (err) {
      console.warn("[PeekPhone] 從 IDB 載入失敗:", err);
    }
    return null;
  }

  /** 將偷窺手機資料寫入 IDB */
  async function saveToIDB(charId: string, cId: string, phoneData: PeekPhoneData): Promise<void> {
    try {
      await db.init();
      const key = cacheKey(charId, cId);
      await db.put(DB_STORES.PEEK_PHONE_DATA, {
        id: key,
        characterId: charId,
        chatId: cId,
        data: phoneData,
        updatedAt: Date.now(),
      });
    } catch (err) {
      console.warn("[PeekPhone] 寫入 IDB 失敗:", err);
    }
  }

  /** 從 IDB 刪除偷窺手機資料 */
  async function deleteFromIDB(charId: string, cId: string): Promise<void> {
    try {
      await db.init();
      await db.delete(DB_STORES.PEEK_PHONE_DATA, cacheKey(charId, cId));
    } catch (err) {
      console.warn("[PeekPhone] 從 IDB 刪除失敗:", err);
    }
  }

  /**
   * 載入指定聊天的偷窺手機資料，或重置為空
   * 優先順序：記憶體快取 → IDB → 重置為 null
   * 確保切換聊天時不會看到上一個聊天的內容
   */
  async function loadOrReset(charId: string, cId: string): Promise<boolean> {
    characterId.value = charId;
    chatId.value = cId;

    // 1. 檢查記憶體快取
    const cached = getCached(charId, cId);
    if (cached) {
      data.value = cached;
      groupStatus.value = { A: "done", B: "done", C: "done", D: "done" };
      groupErrors.value = { A: null, B: null, C: null, D: null };
      return true;
    }

    // 2. 嘗試從 IDB 載入
    const fromIDB = await loadFromIDB(charId, cId);
    if (fromIDB) {
      data.value = fromIDB;
      groupStatus.value = { A: "done", B: "done", C: "done", D: "done" };
      groupErrors.value = { A: null, B: null, C: null, D: null };
      return true;
    }

    // 3. 無資料，重置為 null（確保不顯示其他聊天的內容）
    data.value = null;
    groupStatus.value = { A: "idle", B: "idle", C: "idle", D: "idle" };
    groupErrors.value = { A: null, B: null, C: null, D: null };
    return false;
  }

  // ===== Generation Actions =====

  /** 確保 store 基本狀態已初始化（不觸發 API），供單組 refresh 時使用 */
  function ensureInitialized(charId: string, cId: string): void {
    if (characterId.value === charId && chatId.value === cId && data.value) {
      return; // 已初始化
    }
    characterId.value = charId;
    chatId.value = cId;
    if (!data.value) {
      data.value = createEmptyData(charId);
    }
  }

  /** 建立空的 PeekPhoneData 骨架 */
  function createEmptyData(charId: string): PeekPhoneData {
    return {
      characterId: charId,
      chats: [],
      schedule: [],
      meals: [],
      balance: 0,
      transactions: [],
      memos: [],
      notes: [],
      diary: [],
      gallery: [],
      browserHistory: [],
      hiddenPhotos: [],
    };
  }

  /** 從聊天解析對應的 user persona 名稱和描述 */
  function resolveUserInfo(
    chat: Chat,
    characterId: string,
  ): { userName: string; userDescription: string } {
    const userStore = useUserStore();
    const chatPersonaId = chat.metadata?.personaOverride?.personaId ?? null;
    const resolvedId = userStore.resolvePersonaForChat(
      characterId,
      chatPersonaId,
    );
    if (resolvedId) {
      const persona = userStore.personas.find((p) => p.id === resolvedId);
      if (persona) {
        return {
          userName: persona.name || "使用者",
          userDescription: persona.description || "",
        };
      }
    }
    return {
      userName: userStore.currentName || "使用者",
      userDescription: userStore.currentDescription || "",
    };
  }

  /** 從角色綁定的世界書中提取世界觀設定文字 */
  function extractWorldInfo(character: StoredCharacter): string {
    const lorebooksStore = useLorebooksStore();
    const lorebookIds = character.lorebookIds ?? [];
    if (lorebookIds.length === 0) return "";

    const lorebooks = lorebooksStore.getLorebooksForCharacter(lorebookIds);
    if (lorebooks.length === 0) return "";

    const lines: string[] = [];
    for (const lb of lorebooks) {
      const enabledEntries = lb.entries.filter(isWorldInfoEntryEnabled);
      if (enabledEntries.length === 0) continue;
      lines.push(`【${lb.name || "世界書"}】`);
      for (const entry of enabledEntries) {
        const label = entry.comment || entry.key.join(", ") || "條目";
        lines.push(`- ${label}: ${entry.content.slice(0, 200)}`);
      }
    }
    return lines.join("\n");
  }

  /** 取消進行中的請求 */
  function abortAll(): void {
    abortController.value?.abort();
    abortController.value = null;
  }

  /** 取消正在進行的聯絡人回覆 */
  function cancelContactReply(): void {
    replyAbortController.value?.abort();
    replyAbortController.value = null;
    replyingThreadId.value = null;
  }

  /**
   * 以手機主人（角色本人）的身份向某個聯絡人發送訊息，並取得該聯絡人的 AI 回覆。
   * 與批量重新生成完全分開，使用獨立的 generateContactReply。
   * 流程：追加 isSelf=true 的主人訊息 → 呼叫 generateContactReply → 追加聯絡人回覆
   *       → 更新 thread.updatedAt → 更新 data 與快取 → 持久化到 IDB。
   */
  async function sendMessageToContact(
    threadId: string,
    text: string,
    character: StoredCharacter,
  ): Promise<void> {
    const content = text.trim();
    if (!content) return;
    if (!characterId.value || !chatId.value || !data.value) return;
    // 避免在等待回覆時重複發送
    if (replyingThreadId.value) return;

    const charId = characterId.value;
    const cId = chatId.value;

    const thread = data.value.chats.find((t) => t.id === threadId);
    if (!thread) return;

    const ownerName = character.data.name || character.nickname || "我";

    // 1. 追加手機主人送出的訊息（isSelf=true）
    const ownerMessage: PeekChatMessage = {
      id: `peek-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      senderName: ownerName,
      content,
      isSelf: true,
      timestamp: Date.now(),
    };
    appendMessageToThread(threadId, ownerMessage);

    // 2. 呼叫 AI 取得聯絡人回覆
    const controller = new AbortController();
    replyAbortController.value = controller;
    replyingThreadId.value = threadId;

    try {
      const worldInfo = extractWorldInfo(character);
      const reply = await generateContactReply(
        {
          ownerName,
          ownerDesc: character.data.description || "",
          ownerPersona: character.data.personality || "",
          scenario: character.data.scenario || "",
          worldInfo,
          contactName: thread.contactName,
          thread,
          newMessage: content,
        },
        controller.signal,
      );

      // 3. 追加聯絡人回覆（isSelf=false）
      const contactMessage: PeekChatMessage = {
        id: `peek-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        senderName: thread.contactName,
        senderAvatar: thread.contactAvatar,
        content: reply,
        isSelf: false,
        timestamp: Date.now(),
      };
      appendMessageToThread(threadId, contactMessage);

      // 4. 持久化
      storeCache(charId, cId, data.value);
      await saveToIDB(charId, cId, data.value);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return;
      }
      const msg = err?.message ?? "聯絡人回覆失敗";
      const notificationStore = useNotificationStore();
      notificationStore.addNotification({
        type: "system",
        title: "📱 聯絡人回覆失敗",
        message: `${thread.contactName} 沒有回覆：${msg}`,
        characterId: charId,
        characterName: character.data.name || character.nickname || "角色",
        characterAvatar: character.avatar,
        priority: "normal",
      });
      throw err;
    } finally {
      if (replyAbortController.value === controller) {
        replyAbortController.value = null;
      }
      if (replyingThreadId.value === threadId) {
        replyingThreadId.value = null;
      }
    }
  }

  /**
   * 將一則訊息追加到指定聊天串，並把該串移到列表最前面、更新 updatedAt。
   * 以不可變方式更新 data.value，確保 Vue 響應式正確觸發。
   */
  function appendMessageToThread(
    threadId: string,
    message: PeekChatMessage,
  ): void {
    if (!data.value) return;
    const now = Date.now();
    let updatedThread: PeekChatThread | null = null;
    const chats = data.value.chats.map((t) => {
      if (t.id !== threadId) return t;
      updatedThread = {
        ...t,
        messages: [...t.messages, message],
        updatedAt: now,
      };
      return updatedThread;
    });
    if (!updatedThread) return;
    data.value = { ...data.value, chats };
  }

  /**
   * 觸發合併生成（單次 API 呼叫生成全部模塊）
   */
  async function generateAll(
    charId: string,
    cId: string,
    character: StoredCharacter,
    chat: Chat,
  ): Promise<void> {
    // 檢查記憶體快取
    const cached = getCached(charId, cId);
    if (cached) {
      data.value = cached;
      characterId.value = charId;
      chatId.value = cId;
      groupStatus.value = { A: "done", B: "done", C: "done", D: "done" };
      groupErrors.value = { A: null, B: null, C: null, D: null };
      return;
    }

    // 檢查 IDB 持久化資料
    const fromIDB = await loadFromIDB(charId, cId);
    if (fromIDB) {
      data.value = fromIDB;
      characterId.value = charId;
      chatId.value = cId;
      groupStatus.value = { A: "done", B: "done", C: "done", D: "done" };
      groupErrors.value = { A: null, B: null, C: null, D: null };
      return;
    }

    // 設定當前狀態
    characterId.value = charId;
    chatId.value = cId;
    data.value = createEmptyData(charId);
    groupStatus.value = { A: "loading", B: "idle", C: "idle", D: "idle" };
    groupErrors.value = { A: null, B: null, C: null, D: null };

    const chatContext = await extractChatContext(chat, 15);
    const summariesAndEvents = await extractSummariesAndEvents(cId, charId);
    const { userName, userDescription } = resolveUserInfo(chat, charId);
    const worldInfo = extractWorldInfo(character);

    const settingsStore = useSettingsStore();
    const taskConfig = settingsStore.getAPIForTask("peekPhone");
    const isStreamingEnabled = taskConfig.generation.streamingEnabled;
    const useWindow = isStreamingEnabled && taskConfig.generation.useStreamingWindow;

    const streamingWindow = useWindow ? useStreamingWindow() : null;
    if (streamingWindow) {
      streamingWindow.show(taskConfig.api.model || "AI");
    }

    const controller = new AbortController();
    abortController.value = controller;
    const unbindAbort = streamingWindow
      ? streamingWindow.bindAbortController(controller)
      : null;

    try {
      const result = await generateSequential(
        character,
        chatContext,
        userName,
        userDescription,
        worldInfo,
        summariesAndEvents,
        cId,
        controller.signal,
        (phase, partial) => {
          data.value = { ...data.value!, ...partial };
          if (phase === "A") {
            groupStatus.value.A = "done";
            groupStatus.value.B = "loading";
            groupStatus.value.C = "loading";
          } else if (phase === "BC") {
            groupStatus.value.B = "done";
            groupStatus.value.C = "done";
            groupStatus.value.D = "loading";
          }
        },
        streamingWindow
          ? (_phase, token) => streamingWindow.appendToken(token)
          : undefined,
      );

      data.value = result;
      groupStatus.value = { A: "done", B: "done", C: "done", D: "done" };
      groupErrors.value = { A: null, B: null, C: null, D: null };

      if (streamingWindow) streamingWindow.setComplete();

      const notificationStore = useNotificationStore();
      const charName = character.data.name || character.nickname || "角色";
      notificationStore.addNotification({
        type: "system",
        title: "📱 偷窺手機生成完成",
        message: `${charName} 的手機內容已全部生成完成`,
        characterId: charId,
        characterName: charName,
        characterAvatar: character.avatar,
        priority: "normal",
      });

      storeCache(charId, cId, data.value);
      // 持久化到 IDB
      saveToIDB(charId, cId, data.value);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        streamingWindow?.clearAbortBinding();
        if (streamingWindow) streamingWindow.setComplete();
        return;
      }
      const msg = err?.message ?? "生成失敗";
      groupStatus.value = { A: "error", B: "error", C: "error", D: "error" };
      groupErrors.value = { A: msg, B: msg, C: msg, D: msg };
      if (streamingWindow) streamingWindow.setError(msg);

      const notificationStore = useNotificationStore();
      const charName = character.data.name || character.nickname || "角色";
      notificationStore.addNotification({
        type: "system",
        title: "📱 偷窺手機生成失敗",
        message: `${charName} 的手機內容生成失敗：${msg}`,
        characterId: charId,
        characterName: charName,
        characterAvatar: character.avatar,
        priority: "normal",
      });
    } finally {
      unbindAbort?.();
      streamingWindow?.clearAbortBinding();
      abortController.value = null;
    }
  }

  /**
   * 重試（合併模式：重試即重新生成全部）
   */
  async function retryGroup(
    _group: "A" | "B" | "C" | "D",
    character: StoredCharacter,
    chat: Chat,
  ): Promise<void> {
    if (!characterId.value || !chatId.value) return;
    abortController.value?.abort();
    clearCache(characterId.value, chatId.value);
    deleteFromIDB(characterId.value, chatId.value);
    await generateAll(characterId.value, chatId.value, character, chat);
  }

  /**
   * 單獨重新生成某一階段（A / BC / D）
   * - 清除該階段對應的欄位
   * - 保留其他已生成的欄位作為上下文
   * - 生成完成後合併回 data 並儲存到快取 + IDB
   */
  async function regeneratePhase(
    phase: "A" | "BC" | "D",
    character: StoredCharacter,
    chat: Chat,
  ): Promise<void> {
    if (!characterId.value || !chatId.value) return;
    const charId = characterId.value;
    const cId = chatId.value;

    abortController.value?.abort();

    // 確保 data 存在
    if (!data.value) {
      data.value = createEmptyData(charId);
    }

    // 清除該階段對應的欄位
    if (phase === "A") {
      data.value = { ...data.value, chats: [] };
      groupStatus.value.A = "loading";
      groupErrors.value.A = null;
    } else if (phase === "BC") {
      data.value = { ...data.value, schedule: [], meals: [], memos: [], notes: [], diary: [], balance: 0, transactions: [] };
      groupStatus.value.B = "loading";
      groupStatus.value.C = "loading";
      groupErrors.value.B = null;
      groupErrors.value.C = null;
    } else if (phase === "D") {
      data.value = { ...data.value, gallery: [], browserHistory: [], hiddenPhotos: [] };
      groupStatus.value.D = "loading";
      groupErrors.value.D = null;
    }

    const chatContext = await extractChatContext(chat, 15);
    const summariesAndEvents = await extractSummariesAndEvents(cId, charId);
    const { userName, userDescription } = resolveUserInfo(chat, charId);
    const worldInfo = extractWorldInfo(character);

    const settingsStore = useSettingsStore();
    const taskConfig = settingsStore.getAPIForTask("peekPhone");
    const isStreamingEnabled = taskConfig.generation.streamingEnabled;
    const useWindow = isStreamingEnabled && taskConfig.generation.useStreamingWindow;

    const streamingWindow = useWindow ? useStreamingWindow() : null;
    if (streamingWindow) {
      streamingWindow.show(taskConfig.api.model || "AI");
    }

    const controller = new AbortController();
    abortController.value = controller;
    const unbindAbort = streamingWindow
      ? streamingWindow.bindAbortController(controller)
      : null;

    try {
      const partial = await generateSinglePhase(
        phase,
        character,
        chatContext,
        userName,
        userDescription,
        worldInfo,
        summariesAndEvents,
        data.value,
        cId,
        controller.signal,
        streamingWindow
          ? (token) => streamingWindow.appendToken(token)
          : undefined,
      );

      // 合併回 data
      data.value = { ...data.value!, ...partial };

      // 更新狀態
      if (phase === "A") {
        groupStatus.value.A = "done";
      } else if (phase === "BC") {
        groupStatus.value.B = "done";
        groupStatus.value.C = "done";
      } else if (phase === "D") {
        groupStatus.value.D = "done";
      }

      if (streamingWindow) streamingWindow.setComplete();

      // 儲存到快取 + IDB
      storeCache(charId, cId, data.value);
      saveToIDB(charId, cId, data.value);

      const notificationStore = useNotificationStore();
      const charName = character.data.name || character.nickname || "角色";
      const phaseLabel = phase === "A" ? "聊天紀錄" : phase === "BC" ? "行程/日記/錢包" : "相冊/瀏覽紀錄";
      notificationStore.addNotification({
        type: "system",
        title: "📱 偷窺手機局部刷新完成",
        message: `${charName} 的${phaseLabel}已重新生成`,
        characterId: charId,
        characterName: charName,
        characterAvatar: character.avatar,
        priority: "normal",
      });
    } catch (err: any) {
      if (err?.name === "AbortError") {
        streamingWindow?.clearAbortBinding();
        if (streamingWindow) streamingWindow.setComplete();
        return;
      }
      const msg = err?.message ?? "生成失敗";
      if (phase === "A") {
        groupStatus.value.A = "error";
        groupErrors.value.A = msg;
      } else if (phase === "BC") {
        groupStatus.value.B = "error";
        groupStatus.value.C = "error";
        groupErrors.value.B = msg;
        groupErrors.value.C = msg;
      } else if (phase === "D") {
        groupStatus.value.D = "error";
        groupErrors.value.D = msg;
      }
      if (streamingWindow) streamingWindow.setError(msg);
    } finally {
      unbindAbort?.();
      streamingWindow?.clearAbortBinding();
      abortController.value = null;
    }
  }

  return {
    // State
    groupStatus,
    groupErrors,
    data,
    characterId,
    chatId,
    // Cache actions
    getCached,
    clearCache,
    storeCache,
    // IDB persistence
    loadFromIDB,
    saveToIDB,
    deleteFromIDB,
    loadOrReset,
    // Generation actions
    ensureInitialized,
    generateAll,
    regeneratePhase,
    retryGroup,
    abortAll,
    // Contact reply (interactive chat)
    replyingThreadId,
    replyAbortController,
    sendMessageToContact,
    cancelContactReply,
    // Exposed for testing
    cache,
    abortController,
  };
});
