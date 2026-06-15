import { ref, computed, type Ref, type ComputedRef } from "vue";
import {
  createChatRecord,
  deleteChatCascade,
  loadChatsByCharacter,
  renameChat,
  setLastActiveChatId,
  toggleChatPinned,
} from "@/storage/chatStorage";
import type { Chat, ChatMessage } from "@/types/chat";
import { useAffinityStore } from "@/stores/affinity";
import { applyGreetingInitToAffinity } from "@/services/AffinityGreetingInit";

/** 聊天分類 */
export type ChatCategory = "normal" | "theater";

/**
 * 聊天檔案管理功能
 * 從 ChatScreen.vue 抽取的獨立 composable
 */
export function useChatFiles(deps: {
  messages: Ref<any[]>;
  currentChatId: Ref<string | null>;
  currentChatData: Ref<Chat | null>;
  currentCharacter: ComputedRef<any>;
  isGroupChat: ComputedRef<boolean>;
  characterId: string;
  characterName: string;
  showMoreFeatures: Ref<boolean>;
  saveChatImmediate: () => Promise<void>;
  loadOrCreateChat: (chatId?: string) => Promise<void>;
  scrollToBottom: () => void;
  emit: (e: string, ...args: any[]) => void;
}) {
  const showChatFilesPanel = ref(false);
  const chatFilesList = ref<Chat[]>([]);
  const renamingChatId = ref<string | null>(null);
  const renamingChatName = ref("");
  const showNewChatConfirm = ref(false);
  const newChatPinToList = ref(false);
  const selectedGreetingIndex = ref(0);

  // ── 多選狀態 ──
  const isSelectingChats = ref(false);
  const selectedChatIds = ref<Set<string>>(new Set());

  // ── 分類收闔狀態 ──
  const normalCategoryExpanded = ref(true);
  const theaterCategoryExpanded = ref(true);

  /** 普通聊天（含分支，分支不再獨立分類） */
  const normalChats = computed(() =>
    chatFilesList.value.filter((c) => !c.isTheater),
  );

  /** 小劇場聊天（獨立分類） */
  const theaterChats = computed(() =>
    chatFilesList.value.filter((c) => c.isTheater),
  );

  /** 取得當前角色所有開場白列表 */
  const availableGreetings = computed(() => {
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

  async function openChatFilesPanel() {
    deps.showMoreFeatures.value = false;
    showChatFilesPanel.value = true;
    await refreshChatFilesList();
  }

  async function refreshChatFilesList() {
    try {
      const charId = deps.characterId || deps.currentCharacter.value?.id || "";
      const allChats = await loadChatsByCharacter(
        charId,
        { isGroupChat: deps.isGroupChat.value },
      );
      chatFilesList.value = allChats;
    } catch (e) {
      console.error("[ChatFiles] 載入失敗:", e);
    }
  }

  async function switchChatFile(
    chatId: string,
    options?: { skipSaveCurrent?: boolean },
  ) {
    if (chatId === deps.currentChatId.value) {
      showChatFilesPanel.value = false;
      return;
    }
    if (!options?.skipSaveCurrent) {
      await deps.saveChatImmediate();
    }
    const charId = deps.characterId || deps.currentCharacter.value?.id || "";
    if (charId) {
      await setLastActiveChatId(charId, chatId);
    }
    deps.messages.value = [];
    showChatFilesPanel.value = false;
    await deps.loadOrCreateChat(chatId);
    deps.scrollToBottom();
    deps.emit("chatSwitched", chatId);
  }

  async function createNewChatFile(withGreeting: boolean) {
    const pinToList = newChatPinToList.value;
    const greetingIdx = selectedGreetingIndex.value;
    showNewChatConfirm.value = false;
    newChatPinToList.value = false;
    selectedGreetingIndex.value = 0;
    await deps.saveChatImmediate();

    const charId = deps.characterId || deps.currentCharacter.value?.id || "";
    const charName =
      deps.currentCharacter.value?.data?.name || deps.characterName;
    const newChatId = `chat_${Date.now()}`;

    const newMessages: ChatMessage[] = [];
    if (withGreeting && availableGreetings.value.length > 0) {
      const greeting =
        availableGreetings.value[greetingIdx] ?? availableGreetings.value[0];
      if (greeting) {
        newMessages.push({
          id: crypto.randomUUID(),
          sender: "assistant",
          name: charName,
          content: greeting.content,
          is_user: false,
          status: "sent",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    const newChat: Chat = {
      id: newChatId,
      name: `與 ${charName} 的對話`,
      characterId: charId,
      messages: [],
      metadata: {
        skipGreeting: !withGreeting, // 標記是否跳過開場白
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pinnedToList: pinToList || undefined,
      messageCount: newMessages.length,
      lastMessagePreview:
        newMessages[newMessages.length - 1]?.content?.slice(0, 100) || "",
    };
    await createChatRecord(newChat, newMessages);

    // 套用 greeting 內嵌的 <UpdateVariable><JSONPatch> 作為該開場白的好感度初始值
    if (withGreeting && availableGreetings.value.length > 0) {
      const greeting =
        availableGreetings.value[greetingIdx] ?? availableGreetings.value[0];
      if (greeting && charId) {
        try {
          const affinityStore = useAffinityStore();
          await applyGreetingInitToAffinity(
            affinityStore,
            newChatId,
            charId,
            greeting.content,
          );
          // greeting 即是最後一筆 AI 訊息；標記為已 rescan 以避免進入聊天時重複套用
          const greetingMsgId = newMessages[newMessages.length - 1]?.id;
          if (greetingMsgId) {
            affinityStore.setLastRescannedMessageId(newChatId, greetingMsgId);
            await affinityStore.saveState(newChatId);
          }
        } catch (e) {
          console.error("[ChatFiles] 套用開場白好感度初始值失敗:", e);
        }
      }
    }

    deps.messages.value = [];
    showChatFilesPanel.value = false;
    await deps.loadOrCreateChat(newChatId);
    deps.scrollToBottom();
    deps.emit("chatSwitched", newChatId);
  }

  async function togglePinChatToList(chatId: string, event: Event) {
    event.stopPropagation();
    try {
      const chat = await toggleChatPinned(chatId);
      if (!chat) return;
      if (chatId === deps.currentChatId.value && deps.currentChatData.value) {
        deps.currentChatData.value.pinnedToList = chat.pinnedToList;
      }
      await refreshChatFilesList();
    } catch (e) {
      console.error("[ChatFiles] 切換釘選失敗:", e);
    }
  }

  function startRenameChat(chat: Chat, event: Event) {
    event.stopPropagation();
    renamingChatId.value = chat.id;
    renamingChatName.value = chat.name || "";
  }

  async function confirmRenameChat(chatId: string) {
    const newName = renamingChatName.value.trim();
    renamingChatId.value = null;
    if (!newName) return;
    try {
      const chat = await renameChat(chatId, newName);
      if (chat) {
        if (chatId === deps.currentChatId.value && deps.currentChatData.value) {
          deps.currentChatData.value.name = newName;
        }
      }
    } catch (e) {
      console.error("[ChatFiles] 重命名失敗:", e);
    }
    await refreshChatFilesList();
  }

  async function deleteChatFile(chatId: string, event: Event) {
    event.stopPropagation();
    if (chatFilesList.value.length <= 1) {
      alert("至少需要保留一個聊天記錄");
      return;
    }
    if (!confirm("確定要刪除這個聊天記錄嗎？")) return;
    try {
      await deleteChatCascade(chatId);
      if (chatId === deps.currentChatId.value) {
        const remaining = chatFilesList.value.filter((c) => c.id !== chatId);
        if (remaining.length > 0) {
          await switchChatFile(remaining[0].id, { skipSaveCurrent: true });
          return;
        }
      }
      await refreshChatFilesList();
    } catch (e) {
      console.error("[ChatFiles] 刪除失敗:", e);
    }
  }

  function formatChatFileTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < minute) return "剛剛";
    if (diff < hour) return `${Math.floor(diff / minute)} 分鐘前`;
    if (diff < day) return `${Math.floor(diff / hour)} 小時前`;
    if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  // ── 多選操作 ──

  function enterSelectMode() {
    isSelectingChats.value = true;
    selectedChatIds.value = new Set();
  }

  function exitSelectMode() {
    isSelectingChats.value = false;
    selectedChatIds.value = new Set();
  }

  function toggleChatSelection(chatId: string) {
    const next = new Set(selectedChatIds.value);
    if (next.has(chatId)) {
      next.delete(chatId);
    } else {
      next.add(chatId);
    }
    selectedChatIds.value = next;
  }

  function selectAllInCategory(category: ChatCategory) {
    const list = category === "normal" ? normalChats.value : theaterChats.value;
    const next = new Set(selectedChatIds.value);
    const allSelected = list.every((c) => next.has(c.id));
    if (allSelected) {
      // 全部已選 → 取消全選
      list.forEach((c) => next.delete(c.id));
    } else {
      // 否則全選
      list.forEach((c) => next.add(c.id));
    }
    selectedChatIds.value = next;
  }

  function isCategoryAllSelected(category: ChatCategory): boolean {
    const list = category === "normal" ? normalChats.value : theaterChats.value;
    return list.length > 0 && list.every((c) => selectedChatIds.value.has(c.id));
  }

  async function deleteSelectedChats() {
    const ids = [...selectedChatIds.value];
    if (ids.length === 0) return;

    // 不能刪到最後一個普通聊天（至少保留一個）
    const remainingNormal = normalChats.value.filter((c) => !selectedChatIds.value.has(c.id));
    if (remainingNormal.length === 0 && normalChats.value.length > 0) {
      alert("至少需要保留一個普通聊天記錄");
      return;
    }

    if (!confirm(`確定要刪除選中的 ${ids.length} 個聊天記錄嗎？此操作不可恢復！`)) return;

    exitSelectMode();

    let needSwitch = false;
    for (const chatId of ids) {
      try {
        await deleteChatCascade(chatId);
        if (chatId === deps.currentChatId.value) needSwitch = true;
      } catch (e) {
        console.error("[ChatFiles] 批量刪除失敗:", chatId, e);
      }
    }

    await refreshChatFilesList();

    if (needSwitch && chatFilesList.value.length > 0) {
      await switchChatFile(chatFilesList.value[0].id, { skipSaveCurrent: true });
    }
  }

  return {
    showChatFilesPanel,
    chatFilesList,
    normalChats,
    theaterChats,
    renamingChatId,
    renamingChatName,
    showNewChatConfirm,
    newChatPinToList,
    selectedGreetingIndex,
    availableGreetings,
    // 多選
    isSelectingChats,
    selectedChatIds,
    normalCategoryExpanded,
    theaterCategoryExpanded,
    // 函數
    openChatFilesPanel,
    refreshChatFilesList,
    switchChatFile,
    createNewChatFile,
    togglePinChatToList,
    startRenameChat,
    confirmRenameChat,
    deleteChatFile,
    formatChatFileTime,
    enterSelectMode,
    exitSelectMode,
    toggleChatSelection,
    selectAllInCategory,
    isCategoryAllSelected,
    deleteSelectedChats,
  };
}
