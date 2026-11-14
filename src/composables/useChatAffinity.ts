import { parseAffinityUpdateTags } from "@/services/ResponseParser";
import { judgeAffinityUpdates } from "@/services/affinityJudge";
import type { AffinityPathUpdate } from "@/stores/affinity";
import { useAffinityStore } from "@/stores/affinity";
import type {
  AffinityChangeRecord,
  CharacterAffinityConfig,
  ChatAffinityState,
} from "@/schemas/affinity";
import { computed, nextTick, ref, type Ref } from "vue";

/** 訊息下方膠囊要顯示的內容 */
export interface AffinityChip {
  items: { text: string; kind: "up" | "down" | "text" }[];
  /** 超過兩項時沒顯示出來的數量 */
  more: number;
  /** 只有一項變化時附上的原因（已截短） */
  reason: string;
  /** 滑鼠停留時的完整說明 */
  title: string;
}

/** 連續幾則 AI 回覆都沒回報數值，才提示改用旁觀者 */
const JUDGE_HINT_AFTER = 5;
const CHIP_REASON_MAX = 10;

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
  /** 角色和使用者的名字（旁觀者判斷時把對話整理成「名字：內容」） */
  getNames?: () => { char: string; user: string };
}) {
  const affinityStore = useAffinityStore();

  const _affinityConfig = ref<CharacterAffinityConfig | null>(null);
  const _affinityState = ref<ChatAffinityState | null>(null);
  const showAffinityPanel = ref(false);
  /** 旁觀者正在判斷的訊息 id */
  const judgingMessageIds = ref<Set<string>>(new Set());

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
    // 這則後面還有已記錄的訊息時（例如旁觀者比較慢才判斷完），數值要回到最新那一則
    if (messageId && index >= 0 && index < ids.length - 1) {
      affinityStore.syncToMessages(chatId, ids);
    }
    _affinityState.value = affinityStore.getState(chatId) ?? null;

    // 套用完即標記此訊息，避免 rescanAffinityFromMessages() 之後重複套用同一筆更新
    if (messageId) affinityStore.setLastRescannedMessageId(chatId, messageId);

    if (updates.length === 0) return;
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
      if (updates.length === 0) {
        // 旁觀者模式下，面板的「重新判斷」直接請旁觀者看最新這一輪
        if (force && _affinityConfig.value?.updateMode === "judge") {
          let first = i;
          for (let j = i - 1; j >= 0 && list[j].role !== "user"; j--) {
            if (list[j].role === "ai") first = j;
          }
          void runAffinityJudge(list[first].id);
          return;
        }
        continue;
      }
      _handleAffinityUpdates(updates, msg.id);
      console.log("[useChatAffinity] 從訊息", msg.id, "套用", updates.length, "筆更新");
      return;
    }
  }

  // ===== 旁觀者判斷 =====

  /** 把某則 AI 訊息所在的這一輪整理成對話文字（前面的使用者發言 + 這輪的 AI 回覆） */
  function _roundDialogue(messageId: string): string {
    const list = _messages();
    const index = list.findIndex((m) => m.id === messageId);
    if (index < 0) return "";
    const names = context.getNames?.() ?? { char: "角色", user: "使用者" };
    const clip = (text: string) => (text.length > 1500 ? `${text.slice(0, 1500)}…` : text);

    let start = index;
    // 往前找到這輪的使用者發言（遇到更早的 AI 回覆就停）
    for (let i = index - 1; i >= 0; i--) {
      const role = list[i].role;
      if (role === "ai") break;
      start = i;
    }
    let end = index;
    for (let i = index + 1; i < list.length; i++) {
      if (list[i].role === "user") break;
      end = i;
    }
    return list
      .slice(start, end + 1)
      .filter((m) => (m.role === "user" || m.role === "ai") && m.content?.trim())
      .map((m) => `${m.role === "user" ? names.user : names.char}：${clip(m.content!.trim())}`)
      .join("\n");
  }

  /** 請旁觀者判斷某則 AI 回覆造成的數值變化；失敗就安靜略過 */
  async function runAffinityJudge(messageId: string): Promise<void> {
    const chatId = context.currentChatId.value;
    const config = _affinityConfig.value;
    const state = chatId ? affinityStore.getState(chatId) : undefined;
    if (!chatId || !config?.enabled || !state) return;
    if (judgingMessageIds.value.has(messageId)) return;
    const dialogue = _roundDialogue(messageId);
    if (!dialogue) return;

    judgingMessageIds.value = new Set(judgingMessageIds.value).add(messageId);
    try {
      const names = context.getNames?.() ?? { char: "角色", user: "使用者" };
      const updates = await judgeAffinityUpdates({
        config,
        state: JSON.parse(JSON.stringify(state)) as ChatAffinityState,
        charName: names.char,
        userName: names.user,
        dialogue,
      });
      // 判斷期間換了聊天、或這則被重抽／刪掉了：結果作廢
      if (context.currentChatId.value !== chatId) return;
      if (!_messages().some((m) => m.id === messageId)) return;
      if (updates.length > 0) {
        _handleAffinityUpdates(updates, messageId);
      } else {
        // 沒有變化也記一筆，之後不會再重複判斷這則
        _handleAffinityUpdates([], messageId);
      }
    } finally {
      const next = new Set(judgingMessageIds.value);
      next.delete(messageId);
      judgingMessageIds.value = next;
    }
  }

  /**
   * AI 回覆完成後呼叫：設定成旁觀者判斷、而且這則回覆自己沒寫更新時，請旁觀者判斷。
   */
  function afterAiReply(messageId: string | undefined, hadInlineUpdates: boolean) {
    if (!messageId || hadInlineUpdates) return;
    const config = _affinityConfig.value;
    if (!config?.enabled || config.updateMode !== "judge") return;
    void runAffinityJudge(messageId);
  }

  // ===== 訊息下方的膠囊 =====

  function _metricLabel(metricId: string): string {
    const config = _affinityConfig.value;
    const metric = config?.metrics.find((m) => m.id === metricId || m.path === metricId);
    if (metric) return metric.name;
    return metricId.split(".").pop() || metricId;
  }

  function _buildChip(changes: AffinityChangeRecord[]): AffinityChip | null {
    // 同一個數值在這輪改了好幾次（例如被規則夾回去），只看頭尾
    const merged = new Map<string, { first: AffinityChangeRecord["oldValue"]; last: AffinityChangeRecord }>();
    for (const c of changes) {
      const prev = merged.get(c.metricId);
      merged.set(c.metricId, { first: prev ? prev.first : c.oldValue, last: c });
    }
    const all = [...merged.values()]
      .filter(({ first, last }) => first !== last.newValue)
      .map(({ first, last }) => {
        const label = _metricLabel(last.metricId);
        if (typeof first === "number" && typeof last.newValue === "number") {
          const diff = Number((last.newValue - first).toPrecision(12));
          return {
            text: `${label} ${diff > 0 ? "+" : ""}${diff}`,
            kind: diff > 0 ? ("up" as const) : ("down" as const),
            numeric: true,
            reason: last.reason,
          };
        }
        return {
          text: `${label} ${first === "" ? "" : `${first}→`}${last.newValue}`,
          kind: "text" as const,
          numeric: false,
          reason: last.reason,
        };
      })
      // 數字排前面
      .sort((a, b) => Number(b.numeric) - Number(a.numeric));
    if (all.length === 0) return null;

    const shown = all.slice(0, 2);
    const generic = (r: string) => !r || r.startsWith("MVU") || r === "旁觀者判斷";
    const single = all.length === 1 && !generic(all[0].reason) ? all[0].reason : "";
    return {
      items: shown.map(({ text, kind }) => ({ text, kind })),
      more: all.length - shown.length,
      reason: single.length > CHIP_REASON_MAX ? `${single.slice(0, CHIP_REASON_MAX)}…` : single,
      title: all.map((c) => (generic(c.reason) ? c.text : `${c.text}（${c.reason}）`)).join("\n"),
    };
  }

  /**
   * 每一輪的數值變化膠囊，key 是這一輪最後一則 AI 訊息的 id（膠囊顯示在那則下面）。
   * 開場白不顯示；重抽、換回覆時跟著訊息的樓層記錄走。
   */
  const affinityChips = computed(() => {
    const map = new Map<string, AffinityChip>();
    const chatId = context.currentChatId.value;
    const config = _affinityConfig.value;
    if (!chatId || !config?.enabled || config.showChangeChips === false) return map;
    const floors = affinityStore.affinityStates.get(chatId)?.messageStates;
    if (!floors) return map;

    const list = _messages();
    let roundChanges: AffinityChangeRecord[] = [];
    let lastAiId: string | null = null;
    let seenUser = false;
    const flush = () => {
      if (lastAiId && seenUser && roundChanges.length) {
        const chip = _buildChip(roundChanges);
        if (chip) map.set(lastAiId, chip);
      }
      roundChanges = [];
      lastAiId = null;
    };
    for (const msg of list) {
      if (msg.role === "user") {
        flush();
        seenUser = true;
        continue;
      }
      if (msg.role !== "ai") continue;
      lastAiId = msg.id;
      const floor = floors[msg.id];
      if (floor?.changes.length) roundChanges.push(...floor.changes);
    }
    flush();
    return map;
  });

  /** 要在哪一則（最新的 AI 回覆）下面提示「角色好像忘了回報數值」；不用提示是 null */
  const judgeHintMessageId = computed<string | null>(() => {
    const chatId = context.currentChatId.value;
    const config = _affinityConfig.value;
    if (!chatId || !config?.enabled || config.updateMode === "judge") return null;
    if (config.injectRules === false || config.metrics.length === 0) return null;
    const state = affinityStore.affinityStates.get(chatId);
    if (!state || state.judgeHintDismissed) return null;

    const list = _messages();
    let lastAiId: string | null = null;
    let rounds = 0;
    let roundHasUpdate = false;
    let inRound = false;
    for (let i = list.length - 1; i >= 0; i--) {
      const msg = list[i];
      if (msg.role === "ai") {
        lastAiId ??= msg.id;
        if (state.resetAt && (msg.timestamp ?? 0) <= state.resetAt) return null;
        inRound = true;
        if (state.messageStates?.[msg.id]) roundHasUpdate = true;
      } else if (msg.role === "user" && inRound) {
        if (roundHasUpdate) return null;
        rounds += 1;
        if (rounds >= JUDGE_HINT_AFTER) return lastAiId;
        inRound = false;
        roundHasUpdate = false;
      }
    }
    return null;
  });

  /** 提示裡按「改用」：改成旁觀者判斷，並立刻判斷最新這一則，讓使用者馬上看到效果 */
  async function switchToJudgeMode(messageId: string) {
    const config = _affinityConfig.value;
    if (!config) return;
    config.updateMode = "judge";
    await affinityStore.saveConfig(config);
    _affinityConfig.value = affinityStore.getConfig(config.characterId) ?? config;
    await runAffinityJudge(messageId);
  }

  function dismissJudgeHint() {
    const chatId = context.currentChatId.value;
    if (chatId) affinityStore.setJudgeHintDismissed(chatId);
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
    judgingMessageIds,
    afterAiReply,
    runAffinityJudge,
    affinityChips,
    judgeHintMessageId,
    switchToJudgeMode,
    dismissJudgeHint,
    handleAvatarClick,
    _handleAffinityUpdates,
    rescanAffinityFromMessages,
    resyncAffinityToMessages,
    _loadAffinityForChat,
    onAffinityRollback,
  };
}
