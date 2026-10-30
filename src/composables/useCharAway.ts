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
import type { Chat, CharAway, CharAwayKind } from "@/types/chat";
import type {
  ParsedCharAway,
  ParsedCharBusy,
  ParsedCharSleep,
} from "@/services/charAway";
import {
  awayHeaderText,
  awayKind,
  awayUrgeLabel,
  buildAwayHintText,
  buildCharAwayGuide,
  buildCharAwayPlanNote,
  buildCharAwayReturnNote,
  buildCharAwaySneakNote,
  buildCharBusyGuide,
  buildCharSleepGuide,
  canUseCharAway,
  canUseCharBusy,
  canUseCharSleep,
  clearReplyPending,
  countLeftSinceSneak,
  isCharAwayActive,
  isCharAwayPlanPending,
  pickQuickBackGame,
  quickBackTapTarget,
} from "@/services/charAway";
import {
  CHAR_AWAY_CHANGED_EVENT,
  cancelCharAway,
  cancelCharAwayPlan,
  finishCharAwaySneak,
  markCharAwayReplied,
  setCharAwayViewingChat,
  startCharAway,
  startCharBusy,
  startCharSleep,
  syncCharAwayF2F,
  urgeCharAway,
  wakeCharAwayNow,
} from "@/services/charAwayRuntime";

export interface AwayHint {
  text: string;
  label: string;
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
  /** 聊天時間減現實時間（AI 說的幾點用劇情時間換算）；沒給時當作 0 */
  getClockShiftMs?: () => number;
}) {
  const charAway = ref<CharAway | null>(null);
  const charAwayPlan = ref<CharAway | null>(null);
  const charAwayEnabled = ref(true);
  const charSleepEnabled = ref(true);
  const charBusyEnabled = ref(true);
  const now = ref(Date.now());
  const quickBackGame = ref<null | {
    kind: "tap" | "rps";
    mode: CharAwayKind;
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
      ? awayHeaderText(charAway.value)
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
    // 重新讀聊天可能晚於事件送達：同一次暫離，讀到的比手上的舊就不覆蓋
    const current = charAway.value;
    const incoming = chat.charAway ?? null;
    const stale =
      !!current && !!incoming && current.id === incoming.id && current.updatedAt > incoming.updatedAt;
    if (!stale) charAway.value = incoming;

    const currentPlan = charAwayPlan.value;
    const incomingPlan = chat.charAwayPlan ?? null;
    const planStale =
      !!currentPlan &&
      !!incomingPlan &&
      currentPlan.id === incomingPlan.id &&
      currentPlan.updatedAt > incomingPlan.updatedAt;
    if (!planStale) charAwayPlan.value = incomingPlan;

    charAwayEnabled.value = chat.charAwayEnabled !== false;
    charSleepEnabled.value = chat.charSleepEnabled !== false;
    charBusyEnabled.value = chat.charBusyEnabled !== false;
    if (!isCharAwayActive(charAway.value ?? undefined)) quickBackGame.value = null;
    void nextTick(() => maybeAutoReply());
  }

  const firstAwayEntryId = computed<string | null>(() => {
    const away = charAway.value;
    if (!away) return null;
    const since = away.lastSneakAt ?? 0;
    const first = ctx.messages.value.find(
      (m) => m.sentWhileAway === away.id && m.timestamp > since,
    );
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

  function awayHintTextFor(away: CharAway): string {
    return buildAwayHintText(
      ctx.characterName.value,
      away,
      ctx.getClockShiftMs?.() ?? 0,
      Date.now(),
    );
  }

  function awayHintFor(message: Message): AwayHint | null {
    const away = charAway.value;
    if (!away) return null;
    if (message.id !== firstAwayEntryId.value) return null;

    const text = awayHintTextFor(away);
    const label = awayUrgeLabel(away);
    const { action, lockedText } = hintAction(away);
    return lockedText ? { text, label, action, lockedText } : { text, label, action };
  }

  function awayHintKey(messageId: string): string {
    const away = charAway.value;
    if (!away) return "";
    if (messageId !== firstAwayEntryId.value) return "";

    const { action, lockedText } = hintAction(away);
    return `${away.id}|${awayHintTextFor(away)}|${awayUrgeLabel(away)}|${action}|${lockedText ?? ""}`;
  }

  // --- 提示詞 ---
  function promptOptions(): {
    charAwayGuide: string;
    charSleepGuide: string;
    charBusyGuide: string;
    charAwayReturnNote?: string;
  } {
    const away = charAway.value ?? undefined;
    const plan = charAwayPlan.value ?? undefined;
    const nowTs = Date.now();
    const shiftMs = ctx.getClockShiftMs?.() ?? 0;
    const opts = { faceToFace: ctx.faceToFace.value, now: nowTs, shiftMs };
    const availability = {
      charAway: away,
      charAwayPlan: plan,
      charAwayEnabled: charAwayEnabled.value,
      charSleepEnabled: charSleepEnabled.value,
      charBusyEnabled: charBusyEnabled.value,
      isGroupChat: ctx.isGroupChat.value,
    };

    const charAwayGuide = buildCharAwayGuide(
      canUseCharAway(availability, opts),
    );
    const charSleepGuide = buildCharSleepGuide(
      canUseCharSleep(availability, opts),
    );
    const charBusyGuide = buildCharBusyGuide(
      canUseCharBusy(availability, opts),
      plan,
      nowTs,
      shiftMs,
    );

    const entries = away
      ? ctx.messages.value
          .filter((m) => m.sentWhileAway === away.id)
          .map((m) => ({
            sentWhileAway: m.sentWhileAway,
            isUser: m.role === "user",
            at: m.timestamp,
          }))
      : [];
    const leftCount = away ? countLeftSinceSneak(away, entries) : 0;

    const notes = [
      buildCharAwayReturnNote(away, leftCount),
      buildCharAwaySneakNote(away, leftCount),
      buildCharAwayPlanNote(plan, nowTs, shiftMs),
    ].filter((note): note is string => !!note);
    const charAwayReturnNote = notes.length > 0 ? notes.join("\n\n") : undefined;

    return { charAwayGuide, charSleepGuide, charBusyGuide, charAwayReturnNote };
  }

  // --- 生成前後的接線 ---
  async function beforeGenerate(): Promise<boolean> {
    if (!isAwayActive.value) {
      const plan = charAwayPlan.value;
      const chatId = ctx.currentChatId.value;
      if (
        chatId &&
        plan &&
        isCharAwayPlanPending(plan) &&
        !!plan.startMessageId &&
        !ctx.messages.value.some((m) => m.id === plan.startMessageId)
      ) {
        await cancelCharAwayPlan(chatId);
        const ts = Date.now();
        if (charAwayPlan.value?.id === plan.id) {
          charAwayPlan.value = {
            ...plan,
            endedAt: ts,
            endedBy: "cancel",
            updatedAt: ts,
          };
        }
      }
      return false;
    }

    const away = charAway.value;
    if (!away) return false;

    if (away.sneakPending) return false;

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

  async function afterReply(tags?: {
    away?: ParsedCharAway;
    sleep?: ParsedCharSleep;
    busy?: ParsedCharBusy;
    wake?: boolean;
  }): Promise<void> {
    const chatId = ctx.currentChatId.value;

    const pendingAway = charAway.value;
    if (pendingAway?.replyPending) {
      if (chatId) await markCharAwayReplied(chatId);
      const current = charAway.value;
      if (current && current.id === pendingAway.id) {
        charAway.value = clearReplyPending(current, Date.now());
      }
    }

    const sneakAway = charAway.value;
    if (sneakAway && isCharAwayActive(sneakAway) && sneakAway.sneakPending) {
      if (!chatId) return;
      const next = tags?.wake
        ? await wakeCharAwayNow(chatId)
        : await finishCharAwaySneak(chatId, true);
      if (next) charAway.value = next;
      return;
    }

    if (!tags) return;
    if (ctx.faceToFace.value || ctx.isGroupChat.value) return;
    if (!chatId) return;

    const lastAi = [...ctx.messages.value].reverse().find((m) => m.role === "ai");

    if (tags.sleep) {
      const started = await startCharSleep(chatId, tags.sleep, lastAi?.id);
      if (started) charAway.value = started;
      return;
    }

    if (tags.busy) {
      const result = await startCharBusy(chatId, tags.busy, lastAi?.id);
      if (result?.active) charAway.value = result.active;
      if (result?.plan) charAwayPlan.value = result.plan;
      return;
    }

    if (tags.away) {
      const started = await startCharAway(chatId, tags.away, lastAi?.id);
      if (started) charAway.value = started;
    }
  }

  // --- 「快回來」小遊戲 ---
  function openQuickBack(): void {
    const away = charAway.value;
    if (!isAwayActive.value || !away) return;

    const ts = Date.now();
    if (away.urgeLockedUntil && away.urgeLockedUntil > ts) return;

    quickBackGame.value = {
      kind: pickQuickBackGame(),
      mode: awayKind(away),
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

    if (!won || !next) return;

    await ctx.triggerAIResponse();

    const current = charAway.value;
    if (current && current.id === next.id && current.sneakPending) {
      const finished = await finishCharAwaySneak(chatId, false);
      if (finished) charAway.value = finished;
    }
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
      event as CustomEvent<{
        chatId?: string;
        charAway?: CharAway | null;
        charAwayPlan?: CharAway | null;
      }>
    ).detail;
    if (!detail || detail.chatId !== ctx.currentChatId.value) return;

    charAway.value = detail.charAway ?? null;
    if ("charAwayPlan" in detail) {
      charAwayPlan.value = detail.charAwayPlan ?? null;
    }
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

  // 面對面時暫停睡覺／忙碌／暫離，回線上從剩下的時間繼續（載入聊天時也會對齊）
  watch(ctx.faceToFace, (faceToFace) => {
    const chatId = ctx.currentChatId.value;
    if (chatId) void syncCharAwayF2F(chatId, faceToFace);
  });

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
    charAwayPlan,
    charAwayEnabled,
    charSleepEnabled,
    charBusyEnabled,
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
