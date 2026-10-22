/**
 * 聊天頁的角色暫時離開（<char-away>）邏輯。
 *
 * 純函式在 charAway.ts、存取與排程在 charAwayRuntime.ts；
 * 這裡只把兩者接到聊天頁的狀態上，ChatScreen 只做少量接線。
 */
import {
  computed,
  getCurrentInstance,
  nextTick,
  onActivated,
  onDeactivated,
  onScopeDispose,
  ref,
  watch,
} from "vue";
import type { Ref } from "vue";
import type { ChatScreenMessage as Message } from "@/types/chatScreen";
import type { Chat, CharAway } from "@/types/chat";
import type { ParsedCharAway } from "@/services/charAway";
import {
  buildAwayHintText,
  buildCharAwayGuide,
  buildCharAwayReturnNote,
  canUseCharAway,
  clearReplyPending,
  isCharAwayActive,
  pickQuickBackGame,
  quickBackTapTarget,
} from "@/services/charAway";
import {
  CHAR_AWAY_CHANGED_EVENT,
  cancelCharAway,
  markCharAwayReplied,
  setCharAwayViewingChat,
  startCharAway,
  urgeCharAway,
} from "@/services/charAwayRuntime";

export interface AwayHint {
  text: string;
  action: "urge" | "locked" | "none";
  lockedText?: string;
}

/** 已經替這個 away 試過自動回覆（模組層級，跨元件共用） */
const autoReplyAttempted = new Set<string>();

export function useCharAway(ctx: {
  currentChatId: Ref<string | null | undefined>;
  messages: Ref<Message[]>;
  faceToFace: Ref<boolean>;
  isGroupChat: Readonly<Ref<boolean>>;
  characterName: Readonly<Ref<string>>;
  isGenerating: () => boolean;
  triggerAIResponse: () => Promise<void>;
}) {
  const charAway = ref<CharAway | null>(null);
  const charAwayEnabled = ref(true);
  const now = ref(Date.now());
  const quickBackGame = ref<null | {
    kind: "tap" | "rps";
    tapTarget: number;
  }>(null);

  const isAwayActive = computed(
    () =>
      isCharAwayActive(charAway.value ?? undefined) &&
      !ctx.faceToFace.value &&
      !ctx.isGroupChat.value,
  );

  const activeAwayId = computed<string | null>(() =>
    isAwayActive.value ? charAway.value?.id ?? null : null,
  );

  const headerStatusText = computed(() =>
    isAwayActive.value && charAway.value
      ? `忙碌中・${charAway.value.reason}`
      : "",
  );

  // --- 每秒更新 now（只在本來就進行中時跑） ---
  let nowTimer: ReturnType<typeof setInterval> | null = null;

  function stopNowTimer(): void {
    if (nowTimer !== null) {
      clearInterval(nowTimer);
      nowTimer = null;
    }
  }

  watch(
    isAwayActive,
    (active) => {
      stopNowTimer();
      if (!active) return;
      now.value = Date.now();
      nowTimer = setInterval(() => {
        now.value = Date.now();
      }, 1000);
    },
    { immediate: true },
  );

  // --- 資料 ---
  function loadFromChat(chat: Chat): void {
    charAway.value = chat.charAway ?? null;
    charAwayEnabled.value = chat.charAwayEnabled !== false;
    if (!isCharAwayActive(charAway.value ?? undefined)) quickBackGame.value = null;
    void nextTick(() => maybeAutoReply());
  }

  const firstAwayEntryId = computed<string | null>(() => {
    const away = charAway.value;
    if (!away) return null;
    const first = ctx.messages.value.find((m) => m.sentWhileAway === away.id);
    return first?.id ?? null;
  });

  function hintAction(away: CharAway): { action: AwayHint["action"]; lockedText?: string } {
    if (!isCharAwayActive(away)) return { action: "none" };

    const lockedUntil = away.urgeLockedUntil;
    if (lockedUntil && lockedUntil > now.value) {
      const remainSec = Math.max(0, Math.floor((lockedUntil - now.value) / 1000));
      const m = Math.floor(remainSec / 60);
      const ss = String(remainSec % 60).padStart(2, "0");
      return { action: "locked", lockedText: `${m}:${ss} 後可以再催` };
    }

    return { action: "urge" };
  }

  function awayHintFor(message: Message): AwayHint | null {
    const away = charAway.value;
    if (!away) return null;
    if (message.id !== firstAwayEntryId.value) return null;

    const text = buildAwayHintText(ctx.characterName.value, away);
    const { action, lockedText } = hintAction(away);
    return lockedText ? { text, action, lockedText } : { text, action };
  }

  function awayHintKey(messageId: string): string {
    const away = charAway.value;
    if (!away) return "";
    if (messageId !== firstAwayEntryId.value) return "";

    const { action, lockedText } = hintAction(away);
    return `${away.id}|${action}|${lockedText ?? ""}`;
  }

  // --- 提示詞 ---
  function promptOptions(): {
    charAwayGuide: string;
    charAwayReturnNote?: string;
  } {
    const away = charAway.value ?? undefined;

    const charAwayGuide = buildCharAwayGuide(
      canUseCharAway(
        {
          charAway: away,
          charAwayEnabled: charAwayEnabled.value,
          isGroupChat: ctx.isGroupChat.value,
        },
        { faceToFace: ctx.faceToFace.value, now: Date.now() },
      ),
    );

    let charAwayReturnNote: string | undefined;
    if (away) {
      const leftCount = ctx.messages.value.filter(
        (m) => m.role === "user" && m.sentWhileAway === away.id,
      ).length;
      charAwayReturnNote = buildCharAwayReturnNote(away, leftCount) ?? undefined;
    }

    return { charAwayGuide, charAwayReturnNote };
  }

  // --- 生成前後的接線 ---
  async function beforeGenerate(): Promise<boolean> {
    if (!isAwayActive.value) return false;

    const away = charAway.value;
    if (!away) return false;

    const gone =
      !!away.startMessageId &&
      !ctx.messages.value.some((m) => m.id === away.startMessageId);

    if (!gone) return true;

    const chatId = ctx.currentChatId.value;
    if (chatId) await cancelCharAway(chatId);

    const current = charAway.value;
    if (current && current.id === away.id && isCharAwayActive(current)) {
      const ts = Date.now();
      charAway.value = {
        ...current,
        endedAt: ts,
        endedBy: "cancel",
        replyPending: false,
        updatedAt: ts,
      };
    }

    return false;
  }

  async function afterReply(parsed?: ParsedCharAway): Promise<void> {
    const chatId = ctx.currentChatId.value;

    const pendingAway = charAway.value;
    if (pendingAway?.replyPending) {
      if (chatId) await markCharAwayReplied(chatId);
      const current = charAway.value;
      if (current && current.id === pendingAway.id) {
        charAway.value = clearReplyPending(current, Date.now());
      }
    }

    if (!parsed) return;
    if (ctx.faceToFace.value || ctx.isGroupChat.value) return;
    if (!chatId) return;

    const lastAi = [...ctx.messages.value].reverse().find((m) => m.role === "ai");
    const started = await startCharAway(chatId, parsed, lastAi?.id);
    if (started) charAway.value = started;
  }

  // --- 「快回來」小遊戲 ---
  function openQuickBack(): void {
    const away = charAway.value;
    if (!isAwayActive.value || !away) return;

    const ts = Date.now();
    if (away.urgeLockedUntil && away.urgeLockedUntil > ts) return;

    quickBackGame.value = {
      kind: pickQuickBackGame(),
      tapTarget: quickBackTapTarget(away.returnAt - ts),
    };
  }

  function closeQuickBack(): void {
    quickBackGame.value = null;
  }

  async function onQuickBackFinish(won: boolean): Promise<void> {
    quickBackGame.value = null;

    const chatId = ctx.currentChatId.value;
    if (!chatId) return;

    const next = await urgeCharAway(chatId, won);
    if (next) charAway.value = next;

    if (won && next) await ctx.triggerAIResponse();
  }

  // --- 時間到回來後自動接著回留言 ---
  function maybeAutoReply(): void {
    const away = charAway.value;
    if (!away) return;
    if (!away.endedAt) return;
    if (!away.replyPending) return;
    if (away.endedBy !== "time") return;
    if (ctx.isGenerating()) return;
    if (autoReplyAttempted.has(away.id)) return;

    const backMessage = ctx.messages.value.some(
      (m) =>
        m.id.startsWith("msg_away_back_") && m.timestamp >= away.returnAt,
    );
    if (!backMessage) return;

    autoReplyAttempted.add(away.id);
    void ctx.triggerAIResponse();
  }

  // --- 訊息變動 / 事件 ---
  watch(
    () => ctx.messages.value.length,
    () => {
      void nextTick(() => maybeAutoReply());
    },
  );

  function handleCharAwayChanged(event: Event): void {
    const detail = (
      event as CustomEvent<{ chatId?: string; charAway?: CharAway | null }>
    ).detail;
    if (!detail || detail.chatId !== ctx.currentChatId.value) return;

    charAway.value = detail.charAway ?? null;
    if (!isCharAwayActive(charAway.value ?? undefined)) {
      quickBackGame.value = null;
    }
    void nextTick(() => maybeAutoReply());
  }

  if (typeof window !== "undefined") {
    window.addEventListener(CHAR_AWAY_CHANGED_EVENT, handleCharAwayChanged);
    onScopeDispose(() => {
      window.removeEventListener(CHAR_AWAY_CHANGED_EVENT, handleCharAwayChanged);
    });
  }

  // --- 目前看著哪個聊天 ---
  watch(
    ctx.currentChatId,
    (id) => {
      setCharAwayViewingChat(id ?? null);
    },
    { immediate: true },
  );

  if (getCurrentInstance()) {
    onActivated(() => {
      setCharAwayViewingChat(ctx.currentChatId.value ?? null);
    });
    onDeactivated(() => {
      setCharAwayViewingChat(null);
    });
  }

  onScopeDispose(() => {
    stopNowTimer();
    setCharAwayViewingChat(null);
  });

  return {
    charAway,
    charAwayEnabled,
    isAwayActive,
    activeAwayId,
    headerStatusText,
    quickBackGame,
    loadFromChat,
    awayHintFor,
    awayHintKey,
    promptOptions,
    beforeGenerate,
    afterReply,
    openQuickBack,
    closeQuickBack,
    onQuickBackFinish,
  };
}
