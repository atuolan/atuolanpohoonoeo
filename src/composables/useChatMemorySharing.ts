import { computed, ref, type Ref } from "vue";
import {
  loadLinkedGroupNames,
  loadMemberLinkOptions,
  type MemberLinkOption,
} from "@/services/linkedMemoryLoader";
import type { Chat, MemoryLink, MemorySharingSettings } from "@/types/chat";
import { clampMaxRawTurns, DEFAULT_MAX_RAW_TURNS } from "@/utils/linkedMemory";

/**
 * 記憶互通設定：群組詳情的面板與私聊詳情的唯讀說明
 * 從 ChatScreen.vue 抽取的獨立 composable
 */
export function useChatMemorySharing(deps: {
  currentChat: Ref<Chat | null>;
  getCharacterName: (characterId: string) => string | undefined;
  saveChatImmediate: () => Promise<void>;
}) {
  const memberLinkOptions = ref<MemberLinkOption[]>([]);
  const linkedGroupNames = ref<string[]>([]);

  const memorySharing = computed<MemorySharingSettings>(() => ({
    enabled: false,
    maxRawTurns: DEFAULT_MAX_RAW_TURNS,
    ...deps.currentChat.value?.groupMetadata?.memorySharing,
  }));

  /** 重新讀取面板資料（開啟詳情頁、成員變動、改連結後呼叫） */
  async function refreshMemorySharing() {
    const chat = deps.currentChat.value;
    memberLinkOptions.value = [];
    linkedGroupNames.value = [];
    if (!chat) return;
    try {
      if (chat.isGroupChat) {
        if (!chat.groupMetadata?.isMultiCharCard) {
          memberLinkOptions.value = await loadMemberLinkOptions(chat, deps.getCharacterName);
        }
      } else {
        linkedGroupNames.value = await loadLinkedGroupNames(chat);
      }
    } catch (err) {
      console.warn("[記憶互通] 讀取設定資料失敗", err);
    }
  }

  /** 修改開關或輪數（即時儲存） */
  async function updateMemorySharing(patch: Partial<MemorySharingSettings>) {
    const meta = deps.currentChat.value?.groupMetadata;
    if (!meta) return;
    const next = { ...memorySharing.value, ...patch };
    meta.memorySharing = {
      enabled: next.enabled,
      maxRawTurns: clampMaxRawTurns(next.maxRawTurns),
    };
    await deps.saveChatImmediate();
  }

  /** 修改成員連結（即時儲存） */
  async function updateMemberMemoryLink(characterId: string, link: MemoryLink) {
    const member = deps.currentChat.value?.groupMetadata?.members.find(
      (m) => m.characterId === characterId,
    );
    if (!member) return;
    member.memoryLink = link;
    await deps.saveChatImmediate();
    await refreshMemorySharing();
  }

  return {
    memorySharing,
    memberLinkOptions,
    linkedGroupNames,
    refreshMemorySharing,
    updateMemorySharing,
    updateMemberMemoryLink,
  };
}
