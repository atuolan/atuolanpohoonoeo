import { ref, type Ref, type ComputedRef } from "vue";
import { db, DB_STORES } from "@/db/database";
import type { Chat, ChatMessage } from "@/types/chat";

/**
 * 多訊息刪除 + 分支聊天功能
 * 從 ChatScreen.vue 抽取的獨立 composable
 */
export function useChatMultiDelete(deps: {
  messages: Ref<any[]>;
  currentChatId: Ref<string | null>;
  currentChatData: Ref<Chat | null>;
  currentCharacter: ComputedRef<any>;
  characterId: string;
  characterName: string;
  showMoreMenu: Ref<boolean>;
  isSelectingForDelete: Ref<boolean>;
  selectedMessageIds: Ref<string[]>;
  saveChatImmediate: () => Promise<void>;
  convertToStorableMessage: (m: any, charName: string) => ChatMessage;
  switchChatFile: (chatId: string) => Promise<void>;
  /** 好感度回滾回調：刪除訊息時嘗試回滾好感度快照 */
  onAffinityRollback?: (chatId: string, deletedMessageIds: string[]) => void;
}) {
  // 分支確認彈窗狀態
  const showBranchConfirm = ref(false);
  const branchPendingMessageId = ref<string | null>(null);
  const branchCopyMemory = ref(false);

  function startDeleteMode() {
    deps.showMoreMenu.value = false;
    deps.isSelectingForDelete.value = true;
    deps.selectedMessageIds.value = [];
  }

  function handleMultiDeleteFromMessage(messageId: string) {
    deps.isSelectingForDelete.value = true;
    deps.selectedMessageIds.value = [messageId];
  }

  function handleBranchFromMessage(messageId: string) {
    branchPendingMessageId.value = messageId;
    branchCopyMemory.value = false;
    showBranchConfirm.value = true;
  }

  async function confirmBranch() {
    showBranchConfirm.value = false;
    const messageId = branchPendingMessageId.value;
    branchPendingMessageId.value = null;
    if (!messageId) return;

    const chatData = deps.currentChatData.value;
    if (!chatData) return;

    const msgIndex = deps.messages.value.findIndex(
      (m: any) => m.id === messageId,
    );
    if (msgIndex === -1) return;

    const charName =
      deps.currentCharacter.value?.data?.name || deps.characterName;
    const branchedMessages: ChatMessage[] = JSON.parse(
      JSON.stringify(
        deps.messages.value.slice(0, msgIndex + 1).map((m: any) => {
          return deps.convertToStorableMessage(m, charName);
        }),
      ),
    );

    const now = Date.now();
    const lastMsg = branchedMessages[branchedMessages.length - 1];
    const branchChat: Chat = {
      ...JSON.parse(JSON.stringify(chatData)),
      id: `chat_${now}`,
      name: `${chatData.name} [分支]`,
      messages: branchedMessages,
      lastMessagePreview: lastMsg?.content?.slice(0, 50) ?? "",
      messageCount: branchedMessages.length,
      createdAt: now,
      updatedAt: now,
      isBranch: true,
    };

    try {
      await db.init();
      await db.put(DB_STORES.CHATS, branchChat);

      if (branchCopyMemory.value) {
        const srcChatId =
          deps.currentChatId.value || "";
        const newChatId = branchChat.id;
        const charId =
          deps.characterId || deps.currentCharacter.value?.id || "";

        // 複製總結
        const allSummaries = await db.getAll<any>(DB_STORES.SUMMARIES);
        const srcSummaries = allSummaries.filter(
          (s: any) => s.chatId === srcChatId,
        );
        await Promise.all(
          srcSummaries.map((s: any) =>
            db.put(DB_STORES.SUMMARIES, {
              ...s,
              id: `${s.id}_branch_${now}`,
              chatId: newChatId,
            }),
          ),
        );

        // 複製日記
        const allDiaries = await db.getAll<any>(DB_STORES.DIARIES);
        const srcDiaries = allDiaries.filter(
          (d: any) => d.chatId === srcChatId,
        );
        await Promise.all(
          srcDiaries.map((d: any) =>
            db.put(DB_STORES.DIARIES, {
              ...d,
              id: `${d.id}_branch_${now}`,
              chatId: newChatId,
            }),
          ),
        );

        // 複製重要事件（嘗試多種 key 格式以兼容不同版本）
        let eventsLog = await db.get<any>(
          DB_STORES.IMPORTANT_EVENTS,
          srcChatId,
        );
        if (!eventsLog) {
          eventsLog = await db.get<any>(
            DB_STORES.IMPORTANT_EVENTS,
            `${charId}_${srcChatId}`,
          );
        }
        if (!eventsLog) {
          eventsLog = await db.get<any>(
            DB_STORES.IMPORTANT_EVENTS,
            charId,
          );
        }
        if (eventsLog) {
          await db.put(DB_STORES.IMPORTANT_EVENTS, {
            ...eventsLog,
            id: newChatId,
            chatId: newChatId,
          });
        }
      }

      await deps.switchChatFile(branchChat.id);
    } catch (e) {
      console.error("[ChatScreen] 建立分支失敗:", e);
    }
  }

  function toggleMessageSelection(messageId: string) {
    const index = deps.selectedMessageIds.value.indexOf(messageId);
    if (index > -1) {
      deps.selectedMessageIds.value.splice(index, 1);
      return;
    }

    deps.selectedMessageIds.value.push(messageId);

    if (deps.selectedMessageIds.value.length >= 2) {
      const allMessageIds = deps.messages.value.map((m: any) => m.id);
      const selectedIndices = deps.selectedMessageIds.value
        .map((id) => allMessageIds.indexOf(id))
        .filter((i: number) => i >= 0);

      if (selectedIndices.length >= 2) {
        const minIndex = Math.min(...selectedIndices);
        const maxIndex = Math.max(...selectedIndices);
        const rangeIds = allMessageIds.slice(minIndex, maxIndex + 1);
        deps.selectedMessageIds.value = [
          ...new Set([...deps.selectedMessageIds.value, ...rangeIds]),
        ];
      }
    }
  }

  async function deleteSelectedMessages() {
    if (deps.selectedMessageIds.value.length === 0) return;

    if (
      confirm(
        `確定要刪除選中的 ${deps.selectedMessageIds.value.length} 條消息嗎？此操作不可恢復！`,
      )
    ) {
      const idsToDelete = new Set(deps.selectedMessageIds.value);

      // 按訊息在陣列中的順序收集要刪的 ID（最早的在前），用於好感度回滾
      const orderedIds = deps.messages.value
        .filter((m: any) => idsToDelete.has(m.id))
        .map((m: any) => m.id as string);

      deps.messages.value = deps.messages.value.filter(
        (m: any) => !idsToDelete.has(m.id),
      );

      // 嘗試回滾好感度到最早被刪訊息之前的快照
      const chatId = deps.currentChatId.value;
      if (chatId && orderedIds.length > 0 && deps.onAffinityRollback) {
        deps.onAffinityRollback(chatId, orderedIds);
      }

      await deps.saveChatImmediate();
      cancelSelection();
    }
  }

  function cancelSelection() {
    deps.isSelectingForDelete.value = false;
    deps.selectedMessageIds.value = [];
  }

  return {
    showBranchConfirm,
    branchPendingMessageId,
    branchCopyMemory,
    startDeleteMode,
    handleMultiDeleteFromMessage,
    handleBranchFromMessage,
    confirmBranch,
    toggleMessageSelection,
    deleteSelectedMessages,
    cancelSelection,
  };
}
