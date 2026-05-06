import { computed, ref, type Ref, type ComputedRef } from "vue";
import { db, DB_STORES } from "@/db/database";
import { createChatRecord } from "@/storage/chatStorage";
import { deleteMessage } from "@/storage/chatMessageStorage";
import type { Chat, ChatMessage } from "@/types/chat";
import { useAffinityStore } from "@/stores/affinity";
import {
  applyGreetingInitToAffinity,
  resetAffinityToCharacterDefaults,
} from "@/services/AffinityGreetingInit";

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
  /**
   * 分支好感度起點模式：
   *  - inherit：複製來源 chat 當下數值（預設）
   *  - reset：重設為角色預設值（metric.initial / mvuInitialData）
   *  - greeting：使用某個開場白內嵌的 <UpdateVariable><JSONPatch> 作為起點
   */
  const branchAffinityMode = ref<"inherit" | "reset" | "greeting">("inherit");
  const branchAffinityGreetingIndex = ref(0);

  /** 供分支對話框使用的開場白列表 */
  const branchAvailableGreetings = computed(() => {
    const char = deps.currentCharacter.value;
    if (!char?.data) return [];
    const list: { label: string; content: string }[] = [];
    if (char.data.first_mes) {
      list.push({ label: "開場白 1（預設）", content: char.data.first_mes });
    }
    if (Array.isArray(char.data.alternate_greetings)) {
      char.data.alternate_greetings.forEach((g: string, i: number) => {
        if (g) list.push({ label: `開場白 ${i + 2}`, content: g });
      });
    }
    return list;
  });

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
    branchAffinityMode.value = "inherit";
    branchAffinityGreetingIndex.value = 0;
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
    const rawBranchedMessages: ChatMessage[] = JSON.parse(
      JSON.stringify(
        deps.messages.value.slice(0, msgIndex + 1).map((m: any) => {
          return deps.convertToStorableMessage(m, charName);
        }),
      ),
    );

    // 重新配發 id，避免與原聊天訊息共用 chatMessages 主鍵而互相覆蓋
    const idMap = new Map<string, string>();
    for (const msg of rawBranchedMessages) {
      const newId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      idMap.set(msg.id, newId);
      msg.id = newId;
    }
    // 修正訊息內部可能引用到的舊 id（如 replyTo）
    for (const msg of rawBranchedMessages) {
      const anyMsg = msg as any;
      if (anyMsg.replyTo && idMap.has(anyMsg.replyTo)) {
        anyMsg.replyTo = idMap.get(anyMsg.replyTo);
      }
    }
    const branchedMessages = rawBranchedMessages;

    const now = Date.now();
    const lastMsg = branchedMessages[branchedMessages.length - 1];
    const branchChat: Chat = {
      ...JSON.parse(JSON.stringify(chatData)),
      id: `chat_${now}`,
      name: `${chatData.name} [分支]`,
      messages: [],
      lastMessagePreview: lastMsg?.content?.slice(0, 50) ?? "",
      messageCount: branchedMessages.length,
      createdAt: now,
      updatedAt: now,
      isBranch: true,
    };

    try {
      await db.init();
      await createChatRecord(branchChat, branchedMessages);

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
              characterId: charId,
              updatedAt: now,
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
              characterId: charId,
              updatedAt: now,
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

      // 處理好感度起點（在切換聊天之前完成，讓 _loadAffinityForChat 能讀到正確 state）
      try {
        const charId = deps.characterId || deps.currentCharacter.value?.id || "";
        const srcChatId = deps.currentChatId.value || "";
        const newChatId = branchChat.id;
        const lastAiMsgId = (() => {
          for (let i = branchedMessages.length - 1; i >= 0; i--) {
            const m = branchedMessages[i] as any;
            // ChatMessage 與 UI message 標記 AI 的字段不同，取得 sender / role / is_user 標示
            const isAi =
              m.role === "ai" ||
              m.role === "assistant" ||
              m.sender === "assistant" ||
              m.is_user === false;
            if (isAi) return m.id as string;
          }
          return undefined;
        })();

        if (charId) {
          const affinityStore = useAffinityStore();
          await affinityStore.initialize();
          const config = await affinityStore.loadConfig(charId);
          if (config?.enabled) {
            const mode = branchAffinityMode.value;
            if (mode === "inherit" && srcChatId) {
              await affinityStore.cloneStateForBranch(srcChatId, newChatId);
              if (lastAiMsgId) {
                affinityStore.setLastRescannedMessageId(newChatId, lastAiMsgId);
                await affinityStore.saveState(newChatId);
              }
            } else if (mode === "greeting") {
              const greeting =
                branchAvailableGreetings.value[branchAffinityGreetingIndex.value] ??
                branchAvailableGreetings.value[0];
              if (greeting) {
                await applyGreetingInitToAffinity(
                  affinityStore,
                  newChatId,
                  charId,
                  greeting.content,
                );
              } else {
                await resetAffinityToCharacterDefaults(
                  affinityStore,
                  newChatId,
                  charId,
                );
              }
              if (lastAiMsgId) {
                affinityStore.setLastRescannedMessageId(newChatId, lastAiMsgId);
                await affinityStore.saveState(newChatId);
              }
            } else {
              // reset 或 inherit 但找不到來源
              await resetAffinityToCharacterDefaults(
                affinityStore,
                newChatId,
                charId,
              );
              if (lastAiMsgId) {
                affinityStore.setLastRescannedMessageId(newChatId, lastAiMsgId);
                await affinityStore.saveState(newChatId);
              }
            }
          }
        }
      } catch (affErr) {
        console.error("[ChatScreen] 分支好感度處理失敗:", affErr);
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

      await Promise.all(orderedIds.map((id) => deleteMessage(id)));

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
    branchAffinityMode,
    branchAffinityGreetingIndex,
    branchAvailableGreetings,
    startDeleteMode,
    handleMultiDeleteFromMessage,
    handleBranchFromMessage,
    confirmBranch,
    toggleMessageSelection,
    deleteSelectedMessages,
    cancelSelection,
  };
}
