import { ref, type Ref } from "vue";
import {
  extractImagesFromMessages,
  getChatImage,
  isChatImageRef,
} from "@/db/operations";
import { appendMessages } from "@/storage/chatMessageStorage";
import { refreshChatDerivedMetadata } from "@/storage/chatStorage";
import type { ChatMessage } from "@/types/chat";
import type { ChatScreenMessage } from "@/types/chatScreen";
import {
  buildForwardRecord,
  canForwardIndividually,
  extractRecordParts,
  isForwardSelectable,
  summarizeForwardContent,
} from "@/utils/chatForward";
import { convertToStorableMessage } from "@/utils/chatMessageMapping";

export type ForwardMode = "single" | "merge";

/**
 * 訊息轉發（逐條 / 合併）
 * 轉發出去的訊息一律算「我」發的，只寫入目標聊天，不觸發角色回覆。
 */
export function useChatForward(deps: {
  messages: Ref<ChatScreenMessage[]>;
  currentChatId: Ref<string | null>;
  selectedMessageIds: Ref<string[]>;
  /** 來源聊天的顯示名稱（角色名或群名） */
  getSourceChatName: () => string;
  /** 合併轉發卡片的標題，例如「小明和Claude」或群名 */
  getRecordTitle: () => string;
  getSenderName: (m: ChatScreenMessage) => string;
  getSenderAvatar: (m: ChatScreenMessage) => string;
  /** 貼圖名稱 → 圖片網址（給聊天記錄查看頁顯示貼圖） */
  resolveStickerUrl: (name: string) => string | undefined;
  saveChatImmediate: () => Promise<void>;
  scrollToBottom: () => void;
  cancelSelection: () => void;
  showToast: (text: string) => void;
}) {
  const showForwardPicker = ref(false);
  const forwardMode = ref<ForwardMode>("single");
  const forwardMessageIds = ref<string[]>([]);
  const isForwarding = ref(false);

  function newId(): string {
    return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  /** 依畫面上的順序取出要轉發的訊息 */
  function getOrderedForwardMessages(ids: string[]): ChatScreenMessage[] {
    const idSet = new Set(ids);
    return deps.messages.value.filter(
      (m) => idSet.has(m.id) && isForwardSelectable(m),
    );
  }

  /** 開啟目標選擇器；ids 未給時使用目前多選的訊息 */
  function openForward(mode: ForwardMode, ids?: string[]) {
    const candidates = getOrderedForwardMessages(ids ?? deps.selectedMessageIds.value);
    if (candidates.length === 0) {
      deps.showToast("沒有可轉發的訊息");
      return;
    }
    if (mode === "single" && !candidates.some(canForwardIndividually)) {
      deps.showToast("這些訊息無法逐條轉發，請改用合併轉發");
      return;
    }
    forwardMode.value = mode;
    forwardMessageIds.value = candidates.map((m) => m.id);
    showForwardPicker.value = true;
  }

  /** 長按選單的「轉發」：一般訊息逐條轉發，紅包、語音等特殊訊息改用聊天記錄卡片 */
  function openForwardForMessage(id: string) {
    const m = deps.messages.value.find((msg) => msg.id === id);
    openForward(m && canForwardIndividually(m) ? "single" : "merge", [id]);
  }

  function closeForwardPicker() {
    showForwardPicker.value = false;
    forwardMessageIds.value = [];
  }

  /** 建立要寫入目標聊天的訊息（UI 格式，尚未配發 id） */
  function buildOutgoing(note: string): {
    items: Omit<ChatScreenMessage, "id">[];
    skipped: number;
  } {
    const sources = getOrderedForwardMessages(forwardMessageIds.value);
    const now = Date.now();
    const items: Omit<ChatScreenMessage, "id">[] = [];
    let skipped = 0;

    if (forwardMode.value === "merge") {
      const senderAvatars: Record<string, string> = {};
      const recordItems = sources.map((m) => {
        const senderName = deps.getSenderName(m);
        if (!(senderName in senderAvatars)) {
          const avatar = deps.getSenderAvatar(m);
          if (avatar) senderAvatars[senderName] = avatar;
        }
        return {
          senderName,
          isUser: m.role === "user",
          timestamp: m.timestamp,
          content: summarizeForwardContent(m),
          parts: extractRecordParts(m, deps.resolveStickerUrl),
        };
      });
      const record = buildForwardRecord(deps.getRecordTitle(), recordItems, senderAvatars);
      items.push({
        role: "user",
        content: record.content,
        timestamp: now,
        isGroupChatHistory: true,
        groupChatHistoryData: record.groupChatHistoryData,
      });
    } else {
      const chatName = deps.getSourceChatName();
      for (const m of sources) {
        if (!canForwardIndividually(m)) {
          skipped++;
          continue;
        }
        items.push({
          role: "user",
          content: m.content,
          timestamp: now + items.length,
          messageType: m.messageType,
          imageUrl: m.imageUrl,
          imageData: m.imageData,
          imageMimeType: m.imageMimeType,
          imageCaption: m.imageCaption,
          isLocation: m.isLocation,
          locationContent: m.locationContent,
          isMusicShare: m.isMusicShare,
          musicShareData: m.musicShareData ? { ...m.musicShareData } : undefined,
          plurkShare: m.plurkShare ? JSON.parse(JSON.stringify(m.plurkShare)) : undefined,
          isGroupChatHistory: m.isGroupChatHistory,
          groupChatHistoryData: m.groupChatHistoryData
            ? JSON.parse(JSON.stringify(m.groupChatHistoryData))
            : undefined,
          isHtmlBlock: m.isHtmlBlock,
          htmlContent: m.htmlContent,
          forwardedFrom: { chatName, senderName: deps.getSenderName(m) },
        });
      }
    }

    const trimmedNote = note.trim();
    if (trimmedNote) {
      items.push({
        role: "user",
        content: trimmedNote,
        timestamp: now + items.length,
      });
    }
    return { items, skipped };
  }

  /**
   * 圖片在 IndexedDB 以引用 ID 存放，刪除聊天時會連帶刪除。
   * 寫到別的聊天前先還原成 base64，再重新抽出成新的引用，兩邊就不會共用同一張圖。
   */
  async function detachImageRefs(msgs: ChatMessage[]): Promise<ChatMessage[]> {
    const resolved = await Promise.all(
      msgs.map(async (msg) => {
        const next = { ...msg };
        if (isChatImageRef(next.imageUrl)) {
          next.imageUrl = (await getChatImage(next.imageUrl!)) ?? undefined;
        }
        if (isChatImageRef(next.imageData)) {
          next.imageData = (await getChatImage(next.imageData!)) ?? undefined;
        }
        return next;
      }),
    );
    return extractImagesFromMessages(resolved);
  }

  async function confirmForward(targetChatIds: string[], note: string) {
    if (isForwarding.value || targetChatIds.length === 0) return;
    const { items, skipped } = buildOutgoing(note);
    if (items.length === 0) {
      deps.showToast("沒有可轉發的訊息");
      return;
    }

    isForwarding.value = true;
    let failed = 0;
    try {
      for (const chatId of targetChatIds) {
        // 每個目標都要新的 id：chatMessages 以 id 為主鍵，共用會互相覆蓋
        const uiMessages = items.map(
          (item) => ({ ...item, id: newId() }) as ChatScreenMessage,
        );
        try {
          if (chatId === deps.currentChatId.value) {
            deps.messages.value.push(...uiMessages);
            await deps.saveChatImmediate();
            deps.scrollToBottom();
          } else {
            const stored = await detachImageRefs(
              uiMessages.map((m) => convertToStorableMessage(m, "")),
            );
            await appendMessages(chatId, stored);
            await refreshChatDerivedMetadata(chatId);
          }
        } catch (e) {
          failed++;
          console.error("[ChatForward] 轉發失敗:", chatId, e);
        }
      }
    } finally {
      isForwarding.value = false;
    }

    closeForwardPicker();
    deps.cancelSelection();
    if (failed === targetChatIds.length) {
      deps.showToast("轉發失敗");
    } else if (failed > 0) {
      deps.showToast(`已轉發，但有 ${failed} 個聊天失敗`);
    } else if (skipped > 0) {
      deps.showToast(`已轉發，${skipped} 條特殊訊息無法逐條轉發已略過`);
    } else {
      deps.showToast("已轉發");
    }
  }

  return {
    showForwardPicker,
    forwardMode,
    forwardMessageIds,
    isForwarding,
    openForward,
    openForwardForMessage,
    closeForwardPicker,
    confirmForward,
  };
}
