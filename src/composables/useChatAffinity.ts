import { parseAffinityUpdateTags } from "@/services/ResponseParser";
import { useAffinityStore } from "@/stores/affinity";
import type { CharacterAffinityConfig, ChatAffinityState } from "@/schemas/affinity";
import { nextTick, ref, type Ref } from "vue";

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

  function _handleAffinityUpdates(
    updates: {
      metric: string;
      change: number;
      reason: string;
      operation?: "remove" | "insert";
      stringValue?: string;
      isAbsolute?: boolean;
      absoluteValue?: number;
      sourceMetric?: string;
      insertIndex?: string | number;
    }[],
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

    if (messageId) affinityStore.snapshotBeforeMessage(chatId, messageId);
    const resetDeltaOk = affinityStore.resetMvuDeltaData(chatId);
    const updateResult = affinityStore.batchUpdateByPath(chatId, updates);
    _affinityState.value = affinityStore.getState(chatId) ?? null;

    if (!updateResult.applied) {
      console.warn("[useChatAffinity] MVU/好感更新未生效", {
        chatId,
        messageId,
        resetDeltaOk,
        ...updateResult,
      });
      return;
    }

    console.log("[useChatAffinity] MVU/好感更新已套用", {
      chatId,
      messageId,
      resetDeltaOk,
      appliedCount: updateResult.appliedCount,
      repairedCount: updateResult.repairedCount,
      resolvedCount: updateResult.resolvedCount,
      updates: updates
        .map((u) => {
          if (u.stringValue !== undefined) return `${u.metric} → "${u.stringValue}"`;
          if (u.isAbsolute && u.absoluteValue !== undefined) return `${u.metric} = ${u.absoluteValue}`;
          return `${u.metric} ${u.change > 0 ? "+" : ""}${u.change}`;
        })
        .join(", "),
    });
  }

  function rescanAffinityFromMessages(options?: { force?: boolean }) {
    const chatId = context.currentChatId.value;
    if (!chatId) return;
    const force = options?.force === true;
    for (let i = context.messages.value.length - 1; i >= 0; i--) {
      const msg = context.messages.value[i];
      if (msg.role !== "ai" || !msg.content) continue;
      const searchContent = msg._rawAffinityBlock || msg.content;
      const updates = parseAffinityUpdateTags(searchContent);
      if (updates.length > 0) {
        const lastApplied = affinityStore.getLastRescannedMessageId(chatId);
        if (!force && lastApplied === msg.id) {
          console.log("[useChatAffinity] 訊息", msg.id, "已套用過，跳過");
          return;
        }
        _handleAffinityUpdates(updates, msg.id);
        affinityStore.setLastRescannedMessageId(chatId, msg.id);
        console.log("[useChatAffinity] 從訊息", msg.id, "獲取", updates.length, "筆更新");
        return;
      }
    }
    console.warn("[useChatAffinity] 未找到可套用的 MVU/好感更新標籤", {
      chatId,
      messageCount: context.messages.value.length,
    });
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
          if (context.messages.value.length > 0) rescanAffinityFromMessages();
        });
      } else {
        _affinityState.value = null;
      }
    } catch (e) {
      console.error("[useChatAffinity] 載入好感度失敗:", e);
    }
  }

  function onAffinityRollback(chatId: string, deletedMessageIds: string[]) {
    const rolled = affinityStore.rollbackToBeforeMessages(chatId, deletedMessageIds);
    if (rolled) {
      _affinityState.value = affinityStore.getState(chatId) ?? null;
      console.log("[useChatAffinity] 回滾好感度，刪除訊息:", deletedMessageIds);
    }
  }

  return {
    _affinityConfig,
    _affinityState,
    showAffinityPanel,
    handleAvatarClick,
    _handleAffinityUpdates,
    rescanAffinityFromMessages,
    _loadAffinityForChat,
    onAffinityRollback,
  };
}
