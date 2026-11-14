import { parseAffinityUpdateTags } from "@/services/ResponseParser";
import type { AffinityPathUpdate } from "@/stores/affinity";
import { useAffinityStore } from "@/stores/affinity";
import type { CharacterAffinityConfig, ChatAffinityState } from "@/schemas/affinity";
import { nextTick, ref, type Ref } from "vue";

interface AffinityMessageLike {
  id: string;
  role?: string;
  content?: string;
  timestamp?: number;
  _rawAffinityBlock?: string;
}

export function useChatAffinity(context: {
  currentChatId: Ref<string | null | undefined>;
  messages: Ref<any[]>;
}) {
  const affinityStore = useAffinityStore();

  const _affinityConfig = ref<CharacterAffinityConfig | null>(null);
  const _affinityState = ref<ChatAffinityState | null>(null);
  const showAffinityPanel = ref(false);

  function handleAvatarClick(_messageId: string) {
    if (_affinityConfig.value?.enabled) showAffinityPanel.value = true;
  }

  function _messages(): AffinityMessageLike[] {
    return context.messages.value as AffinityMessageLike[];
  }

  /** 這則訊息之前沒有使用者訊息 → 是開場白，數值不受「單次最大變化」限制 */
  function _isGreeting(index: number): boolean {
    const list = _messages();
    for (let i = index - 1; i >= 0; i--) {
      if (list[i].role === "user") return false;
    }
    return true;
  }

  function _handleAffinityUpdates(
    updates: AffinityPathUpdate[],
    messageId?: string,
  ) {
    const chatId = context.currentChatId.value;
    if (!chatId) {
      console.warn("[useChatAffinity] MVU/好感更新跳過：目前沒有 chatId", { updates });
      return;
    }
    if (!_affinityConfig.value) {
      console.warn("[useChatAffinity] MVU/好感更新跳過：好感度配置尚未載入", {
        chatId,
        updates,
      });
      return;
    }
    if (!_affinityConfig.value.enabled) {
      console.warn("[useChatAffinity] MVU/好感更新跳過：好感度未啟用", {
        chatId,
        characterId: _affinityConfig.value.characterId,
        updates,
      });
      return;
    }

    const ids = _messages().map((m) => m.id);
    const index = messageId ? ids.indexOf(messageId) : -1;
    // 先回到這則訊息之前的數值，再套用 → 重抽、重新掃描都不會疊加
    if (messageId) {
      affinityStore.beginMessageUpdate(
        chatId,
        messageId,
        index >= 0 ? ids.slice(0, index) : undefined,
      );
    }
    const resetDeltaOk = affinityStore.resetMvuDeltaData(chatId);
    let updateResult;
    try {
      updateResult = affinityStore.batchUpdateByPath(chatId, updates, {
        limitChange: index >= 0 ? !_isGreeting(index) : true,
      });
    } finally {
      if (messageId) affinityStore.commitMessageUpdate(chatId, messageId);
    }
    _affinityState.value = affinityStore.getState(chatId) ?? null;

    // 套用完即標記此訊息，避免 rescanAffinityFromMessages() 之後重複套用同一筆更新
    if (messageId) affinityStore.setLastRescannedMessageId(chatId, messageId);

    if (!updateResult.applied) {
      const hadTargets =
        updateResult.resolvedCount + updateResult.repairedCount > 0;
      if (hadTargets) {
        console.log("[useChatAffinity] MVU/好感更新無數值變化", {
          chatId,
          messageId,
          resetDeltaOk,
          ...updateResult,
        });
      } else {
        console.warn("[useChatAffinity] MVU/好感更新未生效：找不到可對應的指標", {
          chatId,
          messageId,
          resetDeltaOk,
          ...updateResult,
        });
      }
      return;
    }

    console.log("[useChatAffinity] MVU/好感更新已套用", {
      chatId,
      messageId,
      appliedCount: updateResult.appliedCount,
      updates: updates
        .map((u) => {
          if (u.stringValue !== undefined) return `${u.metric} → "${u.stringValue}"`;
          if (u.isAbsolute && u.absoluteValue !== undefined) return `${u.metric} = ${u.absoluteValue}`;
          return `${u.metric} ${u.change > 0 ? "+" : ""}${u.change}`;
        })
        .join(", "),
    });
  }

  function _updatesOf(msg: AffinityMessageLike) {
    const searchContent = msg._rawAffinityBlock || msg.content || "";
    return searchContent ? parseAffinityUpdateTags(searchContent) : [];
  }

  /**
   * 補套用還沒套用過的更新（例如回覆在別的畫面生成完）。
   *
   * - 一般：只看最後一輪；已經有樓層記錄、或比重置時間早的訊息不動
   * - force（面板的重新掃描）：找最後一則帶更新的訊息，從它之前的數值重新套用一次
   */
  function rescanAffinityFromMessages(options?: { force?: boolean }) {
    const chatId = context.currentChatId.value;
    if (!chatId) return;
    const force = options?.force === true;
    const list = _messages();
    const state = affinityStore.getState(chatId);
    const lastApplied = affinityStore.getLastRescannedMessageId(chatId);

    let seenAi = false;
    for (let i = list.length - 1; i >= 0; i--) {
      const msg = list[i];
      if (msg.role === "user") {
        // 一般掃描只看最後一輪，避免把更早、已經算過的更新再套一次
        if (!force && seenAi) break;
        continue;
      }
      if (msg.role !== "ai" || !msg.content) continue;
      seenAi = true;

      if (!force) {
        if (affinityStore.hasMessageState(chatId, msg.id)) return;
        if (lastApplied === msg.id) return;
        if (state?.resetAt && (msg.timestamp ?? 0) <= state.resetAt) return;
      }

      const updates = _updatesOf(msg);
      if (updates.length === 0) continue;
      _handleAffinityUpdates(updates, msg.id);
      console.log("[useChatAffinity] 從訊息", msg.id, "套用", updates.length, "筆更新");
      return;
    }
  }

  /**
   * 訊息列表變了（重抽、換回覆、刪除、開分支）之後呼叫：數值對齊到最後一則還在的訊息。
   * 舊聊天還沒有樓層記錄時，退回舊的「回到被刪訊息之前」做法。
   */
  function resyncAffinityToMessages(
    removedMessageIds: string[] = [],
    options?: { legacyRollback?: boolean },
  ) {
    const chatId = context.currentChatId.value;
    if (!chatId || !_affinityConfig.value?.enabled) return;
    const removed = new Set(removedMessageIds);
    const ids = _messages()
      .map((m) => m.id)
      .filter((id) => !removed.has(id));
    const synced = affinityStore.syncToMessages(chatId, ids);
    if (!synced && removedMessageIds.length > 0 && options?.legacyRollback !== false) {
      affinityStore.rollbackToBeforeMessages(chatId, removedMessageIds);
    }
    _affinityState.value = affinityStore.getState(chatId) ?? null;
  }

  async function _loadAffinityForChat(chatId: string, characterId: string) {
    try {
      await affinityStore.initialize();
      const config = await affinityStore.loadConfig(characterId);
      _affinityConfig.value = config;
      if (config?.enabled) {
        const state = await affinityStore.loadState(chatId);
        if (state) {
          _affinityState.value = state;
        } else {
          _affinityState.value = await affinityStore.initializeFromConfig(chatId, config);
        }
        nextTick(() => {
          if (context.currentChatId.value !== chatId) return;
          if (context.messages.value.length > 0) {
            resyncAffinityToMessages();
            rescanAffinityFromMessages();
          }
        });
      } else {
        _affinityState.value = null;
      }
    } catch (e) {
      console.error("[useChatAffinity] 載入好感度失敗:", e);
    }
  }

  function onAffinityRollback(_chatId: string, deletedMessageIds: string[]) {
    resyncAffinityToMessages(deletedMessageIds);
  }

  return {
    _affinityConfig,
    _affinityState,
    showAffinityPanel,
    handleAvatarClick,
    _handleAffinityUpdates,
    rescanAffinityFromMessages,
    resyncAffinityToMessages,
    _loadAffinityForChat,
    onAffinityRollback,
  };
}
