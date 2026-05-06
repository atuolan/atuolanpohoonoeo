import { computed, nextTick, ref, type Ref, type ComputedRef } from "vue";
import { db, DB_STORES } from "@/db/database";
import {
  recordDeletedEntity,
  scheduleSelfHostedAutoSync,
} from "@/services/selfHostedSyncState";
import type { Chat } from "@/types/chat";
import { createDefaultBlockState } from "@/types/block";
import { deleteChatMessagesForChat } from "@/db/chatMessageStore";
import { refreshChatDerivedMetadata } from "@/storage/chatStorage";

/**
 * 聊天匯入/匯出/新對話/清空功能
 * 從 ChatScreen.vue 抽取的獨立 composable
 */
export function useChatExport(deps: {
  currentChatId: Ref<string | null>;
  messages: Ref<any[]>;
  currentCharacter: ComputedRef<any>;
  characterId: string;
  characterName: string;
  chatSummaries: Ref<any[]>;
  chatDiaries: Ref<any[]>;
  lastSummaryTime: Ref<number>;
  lastDiaryTime: Ref<number>;
  resetVisibleCount: () => void;
  scrollToBottom: () => void;
  saveChatImmediate: () => Promise<void>;
  loadOrCreateChat: () => Promise<void>;
  showMoreMenu: Ref<boolean>;
  /**
   * 通知 ChatScreen 已外部清空訊息（直接寫 DB）。
   * ChatScreen 應於回呼中：取消 pending 的 debounce 保存、
   * 重置 _lastSavedMessageCount / _lastSavedLastMessageId / _lastSavedMessageIds、
   * 並把 _messagesLoadedAt 推進到現在，避免後續保存把舊訊息補回。
   */
  notifyChatCleared?: () => Promise<void> | void;
}) {
  const jsonlFileInputRef = ref<HTMLInputElement | null>(null);
  const showNewConversationConfirm = ref(false);
  const newConvGreetingIndex = ref(0);

  /** 取得當前角色所有開場白列表 */
  const newConvAvailableGreetings = computed(() => {
    const char = deps.currentCharacter.value;
    if (!char?.data) return [];
    const list: { label: string; content: string }[] = [];
    if (char.data.first_mes) {
      list.push({ label: "開場白 1（預設）", content: char.data.first_mes });
    }
    if (char.data.alternate_greetings?.length) {
      char.data.alternate_greetings.forEach((g: string, i: number) => {
        if (g) list.push({ label: `開場白 ${i + 2}`, content: g });
      });
    }
    return list;
  });

  function triggerJsonlImport() {
    deps.showMoreMenu.value = false;
    jsonlFileInputRef.value?.click();
  }

  async function handleJsonlFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".jsonl")) {
      alert("請選擇 JSONL 檔案");
      input.value = "";
      return;
    }

    if (!deps.currentChatId.value) {
      alert("沒有當前聊天");
      input.value = "";
      return;
    }

    // 詢問用戶選擇匯入方式
    const choice = confirm(
      `請選擇匯入方式：\n\n確定 = 覆蓋當前聊天\n取消 = 創建新聊天\n\n檔案: ${file.name}`,
    );

    try {
      const { getImportExportService } =
        await import("@/services/ImportExportService");
      const service = getImportExportService();

      if (choice) {
        // 覆蓋當前聊天
        const result = await service.replaceChatFromJsonl(
          file,
          deps.currentChatId.value,
        );

        if (result.success) {
          await deps.loadOrCreateChat();
          await nextTick();
          deps.scrollToBottom();
          alert(`匯入成功！已覆蓋當前聊天，共 ${result.messageCount || 0} 條訊息`);
        } else {
          alert(`匯入失敗: ${result.error}`);
        }
      } else {
        // 創建新聊天
        const result = await service.createChatFromJsonl(
          file,
          deps.characterId || deps.currentCharacter.value?.id || "",
        );

        if (result.success) {
          alert(
            `匯入成功！已創建新聊天，共 ${result.messageCount || 0} 條訊息\n請從聊天列表中查看`,
          );
        } else {
          alert(`匯入失敗: ${result.error}`);
        }
      }
    } catch (e) {
      console.error("JSONL 匯入失敗:", e);
      alert("匯入失敗");
    } finally {
      input.value = "";
    }
  }

  async function exportCurrentChat() {
    deps.showMoreMenu.value = false;
    if (!deps.currentChatId.value) return;

    try {
      const { getImportExportService } =
        await import("@/services/ImportExportService");
      const service = getImportExportService();
      const blob = await service.exportChatAsJsonl(deps.currentChatId.value);
      if (blob) {
        const charName =
          deps.currentCharacter.value?.nickname ||
          deps.currentCharacter.value?.data?.name ||
          "chat";
        const date = new Date()
          .toISOString()
          .replace(/[-:]/g, "")
          .slice(0, 15);
        service.downloadBlob(blob, `${charName}_${date}.jsonl`);
      }
    } catch (e) {
      console.error("導出失敗:", e);
      alert("導出失敗");
    }
  }

  function startNewConversation() {
    deps.showMoreMenu.value = false;
    if (!deps.currentChatId.value) return;
    newConvGreetingIndex.value = 0;
    showNewConversationConfirm.value = true;
  }

  async function confirmNewConversation(withGreeting: boolean) {
    showNewConversationConfirm.value = false;
    if (!deps.currentChatId.value) return;

    try {
      const chatId = deps.currentChatId.value;
      const charId =
        deps.characterId || deps.currentCharacter.value?.id || "";

      // 1. 清空消息
      deps.messages.value = [];
      deps.resetVisibleCount();

      // 2. 刪除此聊天的總結
      const allSummaries = await db.getAll<{
        id: string;
        chatId: string;
        characterId: string;
      }>(DB_STORES.SUMMARIES);
      for (const s of allSummaries) {
        if (s.chatId === chatId || s.characterId === charId) {
          await db.delete(DB_STORES.SUMMARIES, s.id);
          const deletedAt = Date.now();
          await recordDeletedEntity({
            entityType: "conversation_summary",
            entityId: s.id,
            updatedAt: deletedAt,
            deletedAt,
            payload: null,
          });
        }
      }
      deps.chatSummaries.value = [];
      deps.lastSummaryTime.value = 0;

      // 3. 刪除此聊天的日記
      const allDiaries = await db.getAll<{
        id: string;
        chatId: string;
        characterId: string;
      }>(DB_STORES.DIARIES);
      for (const d of allDiaries) {
        if (d.chatId === chatId || d.characterId === charId) {
          await db.delete(DB_STORES.DIARIES, d.id);
          const deletedAt = Date.now();
          await recordDeletedEntity({
            entityType: "diary_entry",
            entityId: d.id,
            updatedAt: deletedAt,
            deletedAt,
            payload: null,
          });
        }
      }
      deps.chatDiaries.value = [];
      deps.lastDiaryTime.value = 0;

      // 4. 刪除此聊天的重要事件
      try {
        const existing = await db.get(DB_STORES.IMPORTANT_EVENTS, chatId);
        await db.delete(DB_STORES.IMPORTANT_EVENTS, chatId);
        if (existing) {
          const deletedAt = Date.now();
          await recordDeletedEntity({
            entityType: "important_events_log",
            entityId: chatId,
            updatedAt: deletedAt,
            deletedAt,
            payload: null,
          });
        }
      } catch {
        // 可能不存在，忽略
      }
      if (charId && charId !== chatId) {
        try {
          const existing = await db.get(DB_STORES.IMPORTANT_EVENTS, charId);
          await db.delete(DB_STORES.IMPORTANT_EVENTS, charId);
          if (existing) {
            const deletedAt = Date.now();
            await recordDeletedEntity({
              entityType: "important_events_log",
              entityId: charId,
              updatedAt: deletedAt,
              deletedAt,
              payload: null,
            });
          }
        } catch {
          // 忽略
        }
      }

      scheduleSelfHostedAutoSync();

      // 4.5. 重置封鎖狀態（清除封鎖歷史，避免舊記錄持續注入 prompt）
      try {
        const chatObj = await db.get<Chat>(DB_STORES.CHATS, chatId);
        if (chatObj?.blockState) {
          chatObj.blockState = createDefaultBlockState();
          chatObj.updatedAt = Date.now();
          await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chatObj)));
        }
      } catch {
        // 忽略
      }

      // 5. 重新加載角色開場白
      if (withGreeting && newConvAvailableGreetings.value.length > 0) {
        const greetingIdx = newConvGreetingIndex.value;
        const greeting =
          newConvAvailableGreetings.value[greetingIdx] ??
          newConvAvailableGreetings.value[0];
        if (greeting) {
          deps.messages.value.push({
            id: `msg_${Date.now()}`,
            role: "ai",
            content: greeting.content,
            timestamp: Date.now(),
          });
        }
      }

      // 6. 保存聊天
      await deps.saveChatImmediate();

      nextTick(() => deps.scrollToBottom());
      alert("已開啟新對話");
    } catch (e) {
      console.error("開啟新對話失敗:", e);
      alert("開啟新對話失敗");
    }
  }

  async function clearChatHistory() {
    deps.showMoreMenu.value = false;
    const chatId = deps.currentChatId.value;
    if (!chatId) return;

    if (
      !confirm(
        "確定要清空聊天內容嗎？此操作不可恢復！\n（總結記憶、重要事件、日記將會保留）",
      )
    )
      return;

    try {
      // 1. UI 清空
      deps.messages.value = [];
      deps.resetVisibleCount();

      // 2. 直接從 IndexedDB 刪除該聊天的所有訊息
      //    繞過 _saveChatImplInner 的「DB ≥5 條、本地 ≤2 條」安全閘門
      //    （該閘門對清空操作會誤判為意外覆蓋而拒絕保存）
      await deleteChatMessagesForChat(chatId);

      // 3. 重新計算 chat metadata（messageCount=0, lastMessagePreview=""）
      await refreshChatDerivedMetadata(chatId);

      // 4. 通知 ChatScreen 重置內部保存追蹤狀態，
      //    避免下一次 saveChat 觸發安全閘門或把舊訊息補回
      try {
        await deps.notifyChatCleared?.();
      } catch (notifyErr) {
        console.warn("[useChatExport] notifyChatCleared 失敗（不影響清空結果）:", notifyErr);
      }

      // 5. 不寫 sync 刪除墓碑：保留「雲同步可救回誤清訊息」的能力
      alert("聊天內容已清空（總結、日記、重要事件已保留）");
    } catch (e) {
      console.error("清空聊天記錄失敗:", e);
      alert("清空聊天記錄失敗");
    }
  }

  return {
    jsonlFileInputRef,
    triggerJsonlImport,
    handleJsonlFileSelected,
    exportCurrentChat,
    startNewConversation,
    confirmNewConversation,
    showNewConversationConfirm,
    newConvGreetingIndex,
    newConvAvailableGreetings,
    clearChatHistory,
  };
}
