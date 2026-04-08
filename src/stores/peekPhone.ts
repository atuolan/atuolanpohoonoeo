/**
 * PeekPhone Store
 * 管理偷窺手機的狀態，包括快取、載入狀態、AI 生成結果
 */

import { useStreamingWindow } from "@/composables/useStreamingWindow";
import {
  extractChatContext,
  extractSummariesAndEvents,
  generateSequential,
} from "@/services/PeekPhoneService";
import { useLorebooksStore } from "@/stores/lorebooks";
import { useNotificationStore } from "@/stores/notification";
import { useSettingsStore } from "@/stores/settings";
import { useUserStore } from "@/stores/user";
import type { StoredCharacter } from "@/types/character";
import type { Chat } from "@/types/chat";
import type { PeekPhoneData } from "@/types/peekPhone";
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
      const enabledEntries = lb.entries.filter((e) => !e.disable && e.content);
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

  /**
   * 觸發合併生成（單次 API 呼叫生成全部模塊）
   */
  async function generateAll(
    charId: string,
    cId: string,
    character: StoredCharacter,
    chat: Chat,
  ): Promise<void> {
    // 檢查快取
    const cached = getCached(charId, cId);
    if (cached) {
      data.value = cached;
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

    const chatContext = extractChatContext(chat, 15);
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
    await generateAll(characterId.value, chatId.value, character, chat);
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
    // Generation actions
    ensureInitialized,
    generateAll,
    retryGroup,
    abortAll,
    // Exposed for testing
    cache,
    abortController,
  };
});
