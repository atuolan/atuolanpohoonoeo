/**
 * PeekPhone Store
 * 管理偷窺手機的狀態，包括快取、載入狀態、AI 生成結果
 */

import { useStreamingWindow } from "@/composables/useStreamingWindow";
import {
  extractChatContext,
  extractSummariesAndEvents,
  generateGroup,
  type GroupAResult,
  type GroupBResult,
  type GroupCResult,
  type GroupDResult,
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

  /** AbortControllers for in-flight requests */
  const abortControllers = ref<{
    A: AbortController | null;
    B: AbortController | null;
    C: AbortController | null;
    D: AbortController | null;
  }>({
    A: null,
    B: null,
    C: null,
    D: null,
  });

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

  /** 取消所有進行中的請求 */
  function abortAll(): void {
    for (const key of ["A", "B", "C", "D"] as const) {
      abortControllers.value[key]?.abort();
      abortControllers.value[key] = null;
    }
  }

  /** 組別名稱對應，用於串流窗口的組別標籤 */
  const GROUP_LABELS: Record<string, string> = {
    A: "聊天記錄",
    B: "行事曆/飲食/備忘錄",
    C: "記事本/日記/錢包",
    D: "相冊",
  };

  /**
   * 觸發全部 4 組並行生成
   * Requirements: 2.1, 2.4
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
    groupStatus.value = {
      A: "loading",
      B: "loading",
      C: "loading",
      D: "loading",
    };
    groupErrors.value = { A: null, B: null, C: null, D: null };

    // 提取聊天上下文（確保15輪對話）
    const chatContext = extractChatContext(chat, 15);

    // 提取總結和重要事件（異步）
    const summariesAndEvents = await extractSummariesAndEvents(cId, charId);

    // 解析用戶 persona
    const { userName, userDescription } = resolveUserInfo(chat, charId);

    // 提取世界書設定
    const worldInfo = extractWorldInfo(character);

    // 讀取全局串流設定
    const settingsStore = useSettingsStore();
    const taskConfig = settingsStore.getAPIForTask("peekPhone");
    const isStreamingEnabled = taskConfig.generation.streamingEnabled;
    const useWindow = isStreamingEnabled && taskConfig.generation.useStreamingWindow;

    // 如果啟用串流窗口，在所有組開始前顯示一次
    const streamingWindow = useWindow ? useStreamingWindow() : null;
    if (streamingWindow) {
      streamingWindow.show(taskConfig.api.model || "AI");
    }

    // 記錄各組是否已輸出過組別標籤
    const groupHeaderSent: Record<string, boolean> = {
      A: false,
      B: false,
      C: false,
      D: false,
    };

    // 並行呼叫 4 組
    const groups = ["A", "B", "C", "D"] as const;
    const promises = groups.map(async (group) => {
      const controller = new AbortController();
      abortControllers.value[group] = controller;
      try {
        groupStatus.value[group] = "loading";

        // 建立 onToken 回呼（串流窗口啟用時）
        const onToken = streamingWindow
          ? (token: string) => {
              // 首次收到 token 時先輸出組別標籤
              if (!groupHeaderSent[group]) {
                groupHeaderSent[group] = true;
                streamingWindow.appendToken(
                  `\n═══ 組 ${group}: ${GROUP_LABELS[group]} ═══\n`,
                );
              }
              streamingWindow.appendToken(token);
            }
          : undefined;

        const result = await generateGroup(
          group,
          character,
          chatContext,
          userName,
          userDescription,
          worldInfo,
          summariesAndEvents,
          cId,
          controller.signal,
          onToken,
        );
        applyGroupResult(group, result);
        groupStatus.value[group] = "done";
        groupErrors.value[group] = null;
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        groupStatus.value[group] = "error";
        groupErrors.value[group] = err?.message ?? "生成失敗";
      } finally {
        abortControllers.value[group] = null;
      }
    });

    await Promise.allSettled(promises);

    // 串流窗口完成
    if (streamingWindow) {
      const hasError = Object.values(groupStatus.value).some(
        (s) => s === "error",
      );
      if (hasError) {
        const errorGroups = (Object.entries(groupErrors.value) as [string, string | null][])
          .filter(([, v]) => v !== null)
          .map(([k, v]) => `組 ${k}: ${v}`)
          .join("; ");
        streamingWindow.setError(`部分組別生成失敗: ${errorGroups}`);
      } else {
        streamingWindow.setComplete();
      }
    }

    // 發送完成通知
    const notificationStore = useNotificationStore();
    const charName = character.data.name || character.nickname || "角色";
    const doneCount = Object.values(groupStatus.value).filter(
      (s) => s === "done",
    ).length;
    const errorCount = Object.values(groupStatus.value).filter(
      (s) => s === "error",
    ).length;
    if (errorCount > 0) {
      notificationStore.addNotification({
        type: "system",
        title: "📱 偷窺手機生成部分完成",
        message: `${charName} 的手機內容：${doneCount} 組成功，${errorCount} 組失敗`,
        characterId: charId,
        characterName: charName,
        characterAvatar: character.avatar,
        priority: "normal",
      });
    } else {
      notificationStore.addNotification({
        type: "system",
        title: "📱 偷窺手機生成完成",
        message: `${charName} 的手機內容已全部生成完成`,
        characterId: charId,
        characterName: charName,
        characterAvatar: character.avatar,
        priority: "normal",
      });
    }

    // 如果全部成功，存入快取
    if (
      groupStatus.value.A === "done" &&
      groupStatus.value.B === "done" &&
      groupStatus.value.C === "done" &&
      groupStatus.value.D === "done" &&
      data.value
    ) {
      storeCache(charId, cId, data.value);
    }
  }

  /**
   * 重試單一失敗的組
   * Requirements: 2.5, 4.3, 4.4
   */
  async function retryGroup(
    group: "A" | "B" | "C" | "D",
    character: StoredCharacter,
    chat: Chat,
  ): Promise<void> {
    if (!characterId.value || !chatId.value || !data.value) return;

    // 取消該組進行中的請求
    abortControllers.value[group]?.abort();

    const chatContext = extractChatContext(chat, 15);
    const summariesAndEvents = await extractSummariesAndEvents(
      chatId.value,
      characterId.value,
    );
    const { userName, userDescription } = resolveUserInfo(
      chat,
      characterId.value,
    );
    const worldInfo = extractWorldInfo(character);
    const controller = new AbortController();
    abortControllers.value[group] = controller;

    // 讀取全局串流設定
    const settingsStore = useSettingsStore();
    const taskConfig = settingsStore.getAPIForTask("peekPhone");
    const isStreamingEnabled = taskConfig.generation.streamingEnabled;
    const useWindow = isStreamingEnabled && taskConfig.generation.useStreamingWindow;

    // 單組重試時，正常顯示串流窗口
    const streamingWindow = useWindow ? useStreamingWindow() : null;
    if (streamingWindow) {
      streamingWindow.show(taskConfig.api.model || "AI");
    }

    try {
      groupStatus.value[group] = "loading";
      groupErrors.value[group] = null;

      // 建立 onToken 回呼（串流窗口啟用時）
      let headerSent = false;
      const onToken = streamingWindow
        ? (token: string) => {
            if (!headerSent) {
              headerSent = true;
              streamingWindow.appendToken(
                `═══ 重試組 ${group}: ${GROUP_LABELS[group]} ═══\n`,
              );
            }
            streamingWindow.appendToken(token);
          }
        : undefined;

      const result = await generateGroup(
        group,
        character,
        chatContext,
        userName,
        userDescription,
        worldInfo,
        summariesAndEvents,
        chatId.value,
        controller.signal,
        onToken,
      );
      applyGroupResult(group, result);
      groupStatus.value[group] = "done";

      // 串流窗口完成
      if (streamingWindow) {
        streamingWindow.setComplete();
      }

      // 發送完成通知
      const notificationStore = useNotificationStore();
      const charName = character.data.name || character.nickname || "角色";
      notificationStore.addNotification({
        type: "system",
        title: "📱 偷窺手機重試完成",
        message: `${charName} 的手機 - 組 ${group}（${GROUP_LABELS[group]}）重試成功`,
        characterId: characterId.value,
        characterName: charName,
        characterAvatar: character.avatar,
        priority: "normal",
      });

      // 如果全部成功，更新快取
      if (
        groupStatus.value.A === "done" &&
        groupStatus.value.B === "done" &&
        groupStatus.value.C === "done" &&
        groupStatus.value.D === "done"
      ) {
        storeCache(characterId.value, chatId.value, data.value);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        if (streamingWindow) streamingWindow.setComplete();
        return;
      }
      groupStatus.value[group] = "error";
      groupErrors.value[group] = err?.message ?? "重試失敗";
      if (streamingWindow) {
        streamingWindow.setError(err?.message ?? "重試失敗");
      }
    } finally {
      abortControllers.value[group] = null;
    }
  }

  /** 將組別結果合併到 data */
  function applyGroupResult(
    group: "A" | "B" | "C" | "D",
    result: GroupAResult | GroupBResult | GroupCResult | GroupDResult,
  ): void {
    if (!data.value) return;
    switch (group) {
      case "A":
        data.value.chats = (result as GroupAResult).chats;
        break;
      case "B": {
        const b = result as GroupBResult;
        data.value.schedule = b.schedule;
        data.value.meals = b.meals;
        data.value.memos = b.memos;
        break;
      }
      case "C": {
        const c = result as GroupCResult;
        data.value.notes = c.notes;
        data.value.diary = c.diary;
        data.value.balance = c.balance;
        data.value.transactions = c.transactions;
        break;
      }
      case "D":
        data.value.gallery = (result as GroupDResult).gallery;
        break;
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
    // Generation actions
    ensureInitialized,
    generateAll,
    retryGroup,
    abortAll,
    // Exposed for testing
    cache,
  };
});
