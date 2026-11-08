/**
 * 聊天裡的約會出門：邀請、回覆、開始（進面對面）、付錢、隨機事件、結束（回線上）
 *
 * 只在單人聊天用。一個聊天同時只有一場約會（存在 settings 表）。
 */
import { getDateSpot, DATE_SPOTS } from "@/data/dateSpots";
import { debitCharWallet } from "@/services/charWallet";
import {
  addDateMemory,
  clearDateSession,
  generateDateRecap,
  loadDateSession,
  recordDateImportantEvent,
  saveDateSession,
} from "@/services/dateOuting";
import type { DateCardData, DatePayer, DateSession } from "@/types/date";
import {
  buildDateNote,
  createDateSession,
  dateCardContent,
  matchDateSpot,
  parsePayer,
  paymentNoteText,
  remainingDateMinutes,
  resolveDateShares,
  shouldInjectDateEvent,
  type CustomDatePlace,
  type DateNames,
} from "@/utils/dateLogic";
import type { ParsedDateTags } from "@/utils/dateTags";
import { computed, nextTick, ref, type Ref } from "vue";

export interface ChatDateDeps {
  messages: Ref<any[]>;
  chatId: () => string | undefined;
  characterId: () => string | undefined;
  names: () => DateNames;
  isGroupChat: () => boolean;
  chatFaceToFaceMode: Ref<boolean>;
  saveChatImmediate: () => Promise<void>;
  showToast: (msg: string) => void;
  /** 劇情時間（毫秒） */
  storyNow: () => number;
  /** 劇情時間往後推（真實時間模式推不了，回 false） */
  advanceStory: (minutes: number) => boolean;
  /** 使用者錢包扣錢，不夠回 false */
  spendUserMoney: (amount: number, description: string) => Promise<boolean>;
  /** 回到線上之後（問要不要對齊現實時間） */
  onReturnedOnline: () => void;
}

export type DatePick = { spotId: string } | { custom: CustomDatePlace };

export function useChatDate(deps: ChatDateDeps) {
  const session = ref<DateSession | null>(null);
  const showPicker = ref(false);
  const ending = ref(false);

  const isActive = computed(
    () => !!session.value && (session.value.status === "invited" || session.value.status === "ongoing"),
  );
  const isOngoing = computed(() => session.value?.status === "ongoing");

  async function load(): Promise<void> {
    const chatId = deps.chatId();
    session.value = chatId && !deps.isGroupChat() ? await loadDateSession(chatId) : null;
    // 結束、拒絕的不用留著
    if (session.value && !isActive.value) session.value = null;
  }

  async function persist(): Promise<void> {
    if (session.value) await saveDateSession(session.value);
  }

  // ===== 卡片 =====

  function findCardMessage(messageId: string | undefined) {
    return messageId ? deps.messages.value.find((m) => m.id === messageId) : undefined;
  }

  /** 改卡片：換一個新物件，畫面才會更新；文字（AI 讀的）跟著改 */
  function updateCard(messageId: string | undefined, patch: Partial<DateCardData>): void {
    const msg = findCardMessage(messageId);
    if (!msg?.dateCard) return;
    msg.dateCard = { ...msg.dateCard, ...patch };
    msg.content = dateCardContent(msg.dateCard, deps.names());
  }

  function pushCard(card: DateCardData): string {
    const id = `msg_date_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    deps.messages.value.push({
      id,
      role: "user",
      content: dateCardContent(card, deps.names()),
      timestamp: Date.now(),
      dateCard: card,
    });
    return id;
  }

  function pushNotice(text: string): void {
    deps.messages.value.push({
      id: `msg_claim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
      isTransactionClaimNotice: true,
    });
  }

  // ===== 邀請 =====

  function openPicker(): void {
    if (deps.isGroupChat()) {
      deps.showToast("群聊還不能約會");
      return;
    }
    if (isOngoing.value) {
      deps.showToast(`正在${session.value!.place}約會中`);
      return;
    }
    if (isActive.value) {
      deps.showToast("還有一個約會邀請在等回覆");
      return;
    }
    showPicker.value = true;
  }

  /** 使用者約他：送出邀請卡，等他下一輪回覆 */
  async function inviteFromUser(pick: DatePick): Promise<void> {
    const chatId = deps.chatId();
    const characterId = deps.characterId();
    if (!chatId || !characterId || isActive.value) return;
    showPicker.value = false;
    const spot = "spotId" in pick ? (getDateSpot(pick.spotId) ?? null) : null;
    const draft = createDateSession({
      chatId,
      characterId,
      spot,
      custom: "custom" in pick ? pick.custom : undefined,
      startedBy: "user",
      inviteMessageId: "",
      names: deps.names(),
    });
    draft.inviteMessageId = pushCard({
      kind: "invite",
      sessionId: draft.id,
      place: draft.place,
      emoji: draft.emoji,
      startedBy: "user",
      status: "pending",
    });
    session.value = draft;
    await persist();
    await deps.saveChatImmediate();
  }

  /** 使用者取消還沒回覆的邀請 */
  async function cancelInvite(messageId: string): Promise<void> {
    const s = session.value;
    if (!s || s.status !== "invited" || s.inviteMessageId !== messageId) return;
    updateCard(messageId, { status: "declined", reason: "取消了" });
    session.value = null;
    await clearDateSession(s.chatId);
    await deps.saveChatImmediate();
  }

  /** 角色約使用者，使用者按答應 */
  async function acceptRequest(messageId: string): Promise<void> {
    const s = session.value;
    if (!s || s.status !== "invited" || s.startedBy !== "char" || s.inviteMessageId !== messageId) return;
    updateCard(messageId, { status: "accepted" });
    await start();
  }

  async function declineRequest(messageId: string): Promise<void> {
    const s = session.value;
    if (!s || s.status !== "invited" || s.startedBy !== "char" || s.inviteMessageId !== messageId) return;
    updateCard(messageId, { status: "declined" });
    session.value = null;
    await clearDateSession(s.chatId);
    await deps.saveChatImmediate();
  }

  // ===== 開始 =====

  async function start(): Promise<void> {
    const s = session.value;
    if (!s) return;
    s.status = "ongoing";
    s.startedAt = Date.now();
    s.aiReplies = 0;
    pushCard({ kind: "started", sessionId: s.id, place: s.place, emoji: s.emoji, startedBy: s.startedBy });
    // 進面對面；劇情時鐘停在見面那一刻後再記開始時間
    deps.chatFaceToFaceMode.value = true;
    await nextTick();
    s.startedStoryTime = deps.storyNow();
    await persist();
    await deps.saveChatImmediate();
  }

  // ===== 付錢 =====

  async function pay(requested: DatePayer): Promise<void> {
    const s = session.value;
    const characterId = deps.characterId();
    if (!s || s.status !== "ongoing" || s.payment || !characterId) return;
    const names = deps.names();
    let { payer, userShare, charShare } = resolveDateShares(s.cost, requested, s.event);
    let charEntryId: string | undefined;
    const shortNotes: string[] = [];

    if (charShare > 0) {
      const charged = await debitCharWallet({
        characterId,
        amount: charShare,
        kind: "date",
        description: `${s.place}約會`,
        storyNowMs: deps.storyNow(),
        chatId: s.chatId,
      });
      if (charged.ok) {
        charEntryId = charged.entryId;
      } else {
        // 他的錢不夠：剩下的由使用者付
        shortNotes.push(`${names.charName}的帳戶只剩 $${charged.balance}，不夠付`);
        userShare += charShare;
        charShare = 0;
        payer = "user";
      }
    }
    if (userShare > 0 && !(await deps.spendUserMoney(userShare, `${s.place}約會`))) {
      shortNotes.push(`${names.userName}的錢包也不夠，這次先欠著`);
      userShare = 0;
    }

    const note = paymentNoteText(payer, { userShare, charShare }, names);
    s.payment = {
      payer,
      userPaid: userShare,
      charPaid: charShare,
      charEntryId,
      note: shortNotes.length > 0 ? `${shortNotes.join("；")}。${note}` : note,
    };
    pushNotice(`💸 ${s.payment.note}`);
    await persist();
  }

  // ===== 結束 =====

  /** 約會中的對話（給回顧用） */
  function conversationSinceStart(s: DateSession): string {
    const startIndex = deps.messages.value.findIndex((m) => m.dateCard?.kind === "started" && m.dateCard.sessionId === s.id);
    const names = deps.names();
    return deps.messages.value
      .slice(startIndex >= 0 ? startIndex + 1 : -40)
      .filter((m) => (m.role === "user" || m.role === "ai") && !m.dateCard && !m.isTransactionClaimNotice && typeof m.content === "string")
      .map((m) => `${m.role === "user" ? names.userName : names.charName}：${m.content}`)
      .join("\n");
  }

  async function end(): Promise<void> {
    const s = session.value;
    const characterId = deps.characterId();
    if (!s || s.status !== "ongoing" || ending.value || !characterId) return;
    ending.value = true;
    try {
      if (!s.payment) await pay("split");
      // 劇情時間推到約會結束（約會中 AI 自己推過的不重複推）
      const minutes = remainingDateMinutes(s, deps.storyNow());
      if (minutes > 0) deps.advanceStory(minutes);

      const names = deps.names();
      deps.showToast("約會結束，正在整理回憶…");
      const recap = await generateDateRecap({
        charName: names.charName,
        userName: names.userName,
        place: s.place,
        conversation: conversationSinceStart(s),
        eventText: s.event && s.eventInjected ? s.event.text : undefined,
        paymentNote: s.payment?.note,
      }).catch((e) => {
        console.warn("[約會] 回顧生成失敗:", e);
        return null;
      });

      const eventText = s.event && s.eventInjected ? s.event.text : undefined;
      pushCard({
        kind: "ended",
        sessionId: s.id,
        place: s.place,
        emoji: s.emoji,
        startedBy: s.startedBy,
        cost: s.cost,
        paymentNote: s.payment?.note,
        eventText,
        recap: recap?.recap,
        diary: recap?.diary,
      });
      s.status = "ended";
      s.endedAt = Date.now();
      await addDateMemory({
        id: s.id,
        characterId,
        chatId: s.chatId,
        place: s.place,
        emoji: s.emoji,
        startedAt: s.startedAt ?? s.invitedAt,
        endedAt: s.endedAt,
        cost: s.cost,
        paymentNote: s.payment?.note,
        eventText,
        recap: recap?.recap,
        diary: recap?.diary,
      });
      await recordDateImportantEvent(
        s.chatId,
        characterId,
        `${names.userName}和${names.charName}去${s.place}約會${eventText ? `，${eventText}` : ""}${recap?.recap ? `。${recap.recap}` : ""}`.slice(0, 120),
        [s.place],
      );

      session.value = null;
      await clearDateSession(s.chatId);
      deps.chatFaceToFaceMode.value = false;
      await nextTick();
      await deps.saveChatImmediate();
      deps.onReturnedOnline();
    } finally {
      ending.value = false;
    }
  }

  // ===== AI 的標籤 =====

  /** 一輪回覆處理完：約會標籤、回覆次數、事件是否已交出 */
  async function handleAiReply(tags: ParsedDateTags | null): Promise<void> {
    if (deps.isGroupChat()) return;
    const s = session.value;

    // 角色約使用者（沒有進行中的約會時才算）
    if (tags?.request && !isActive.value) {
      const chatId = deps.chatId();
      const characterId = deps.characterId();
      if (chatId && characterId) {
        const spot = matchDateSpot(tags.request.place, DATE_SPOTS);
        const draft = createDateSession({
          chatId,
          characterId,
          spot,
          custom: spot ? undefined : { place: tags.request.place, costPerPerson: [300, 800] },
          startedBy: "char",
          inviteMessageId: "",
          reason: tags.request.reason,
          names: deps.names(),
        });
        draft.inviteMessageId = pushCard({
          kind: "request",
          sessionId: draft.id,
          place: draft.place,
          emoji: draft.emoji,
          startedBy: "char",
          status: "pending",
          reason: tags.request.reason,
        });
        session.value = draft;
        await persist();
        await deps.saveChatImmediate();
      }
      return;
    }

    if (!s) return;

    // 角色回覆使用者的邀請
    if (s.status === "invited" && s.startedBy === "user") {
      if (tags?.accept) {
        updateCard(s.inviteMessageId, { status: "accepted" });
        await start();
      } else if (tags?.decline) {
        updateCard(s.inviteMessageId, { status: "declined", reason: tags.decline.reason });
        session.value = null;
        await clearDateSession(s.chatId);
        await deps.saveChatImmediate();
      }
      return;
    }

    if (s.status !== "ongoing") return;
    s.aiReplies += 1;
    const payer = parsePayer(tags?.pay);
    if (payer) await pay(payer);
    await persist();
    if (tags?.end) await end();
  }

  /** 這一輪給 AI 的約會說明；事件第一次交出時記下來 */
  async function promptNote(): Promise<string> {
    const s = session.value;
    if (!s || deps.isGroupChat()) return "";
    if (shouldInjectDateEvent(s)) {
      s.eventInjected = true;
      await persist();
    }
    return buildDateNote(s, deps.names(), !!s.eventInjected);
  }

  /** 約會中已經過了幾分鐘（劇情時間） */
  function elapsedMinutes(): number {
    const s = session.value;
    if (!s || typeof s.startedStoryTime !== "number") return 0;
    return Math.max(0, Math.round((deps.storyNow() - s.startedStoryTime) / 60_000));
  }

  return {
    session,
    showPicker,
    ending,
    isActive,
    isOngoing,
    load,
    openPicker,
    inviteFromUser,
    cancelInvite,
    acceptRequest,
    declineRequest,
    end,
    handleAiReply,
    promptNote,
    elapsedMinutes,
  };
}
