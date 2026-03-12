import { nextTick, ref, type Ref, type ComputedRef } from "vue";
import { db, DB_STORES } from "@/db/database";

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
}) {
  const jsonlFileInputRef = ref<HTMLInputElement | null>(null);

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

  async function startNewConversation() {
    deps.showMoreMenu.value = false;
    if (!deps.currentChatId.value) return;

    if (
      !confirm(
        "確定要開啟新對話嗎？當前對話記錄、總結記憶、日記和重要事件記錄本都將被清空，並重新加載角色的初始消息。",
      )
    )
      return;

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
        }
      }
      deps.chatDiaries.value = [];
      deps.lastDiaryTime.value = 0;

      // 4. 刪除此聊天的重要事件
      try {
        await db.delete(DB_STORES.IMPORTANT_EVENTS, chatId);
      } catch {
        // 可能不存在，忽略
      }
      if (charId && charId !== chatId) {
        try {
          await db.delete(DB_STORES.IMPORTANT_EVENTS, charId);
        } catch {
          // 忽略
        }
      }

      // 5. 重新加載角色初始消息
      const character = deps.currentCharacter.value;
      const firstMessage = character?.data?.first_mes;
      if (firstMessage) {
        deps.messages.value.push({
          id: `msg_${Date.now()}`,
          role: "ai",
          content: firstMessage,
          timestamp: Date.now(),
        });
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
    if (!deps.currentChatId.value) return;

    if (
      !confirm(
        "確定要清空所有聊天記錄嗎？此操作不可恢復！\n（日記、總結記憶也會一併清除，重要事件記錄本會保留）",
      )
    )
      return;

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
        }
      }
      deps.chatDiaries.value = [];
      deps.lastDiaryTime.value = 0;

      // 4. 保存聊天
      await deps.saveChatImmediate();

      alert("聊天記錄已清空");
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
    clearChatHistory,
  };
}
