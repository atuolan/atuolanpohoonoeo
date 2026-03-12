import { ref, computed, type Ref, type ComputedRef } from "vue";
import { db, DB_STORES } from "@/db/database";
import type { Chat, ChatMessage } from "@/types/chat";

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
      await db.init();
      const allChats = await db.getAll<Chat>(DB_STORES.CHATS);
      const charId = deps.characterId || deps.currentCharacter.value?.id || "";
      chatFilesList.value = allChats
        .filter((c) =>
          deps.isGroupChat.value
            ? c.isGroupChat && c.characterId === charId
            : !c.isGroupChat && c.characterId === charId,
        )
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (e) {
      console.error("[ChatFiles] 載入失敗:", e);
    }
  }

  async function switchChatFile(chatId: string) {
    if (chatId === deps.currentChatId.value) {
      showChatFilesPanel.value = false;
      return;
    }
    await deps.saveChatImmediate();
    const charId = deps.characterId || deps.currentCharacter.value?.id || "";
    if (charId) {
      await db.put(DB_STORES.SETTINGS, chatId, `lastActiveChatId_${charId}`);
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
      messages: newMessages,
      metadata: {
        skipGreeting: !withGreeting, // 標記是否跳過開場白
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pinnedToList: pinToList || undefined,
    };
    await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(newChat)));

    deps.messages.value = [];
    showChatFilesPanel.value = false;
    await deps.loadOrCreateChat(newChatId);
    deps.scrollToBottom();
    deps.emit("chatSwitched", newChatId);
  }

  async function togglePinChatToList(chatId: string, event: Event) {
    event.stopPropagation();
    try {
      const chat = await db.get<Chat>(DB_STORES.CHATS, chatId);
      if (!chat) return;
      chat.pinnedToList = !chat.pinnedToList;
      chat.updatedAt = Date.now();
      await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)));
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
      const chat = await db.get<Chat>(DB_STORES.CHATS, chatId);
      if (chat) {
        chat.name = newName;
        chat.updatedAt = Date.now();
        await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)));
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
      const { collectImageRefs, deleteChatImagesByRefs } = await import(
        "@/db/operations"
      );
      const chat = await db.get<Chat>(DB_STORES.CHATS, chatId);
      const imageRefs = collectImageRefs(chat?.messages || []);
      await Promise.all([
        db.delete(DB_STORES.CHATS, chatId),
        deleteChatImagesByRefs(imageRefs),
      ]);
      if (chatId === deps.currentChatId.value) {
        const remaining = chatFilesList.value.filter((c) => c.id !== chatId);
        if (remaining.length > 0) {
          await switchChatFile(remaining[0].id);
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

  return {
    showChatFilesPanel,
    chatFilesList,
    renamingChatId,
    renamingChatName,
    showNewChatConfirm,
    newChatPinToList,
    selectedGreetingIndex,
    availableGreetings,
    openChatFilesPanel,
    refreshChatFilesList,
    switchChatFile,
    createNewChatFile,
    togglePinChatToList,
    startRenameChat,
    confirmRenameChat,
    deleteChatFile,
    formatChatFileTime,
  };
}
