import {
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type Ref,
} from "vue";
import type {
  ChatScreenMessage as Message,
  PendingInjectedMessage,
} from "@/types/chatScreen";
import { buildAutoProgressMessages } from "@/services/waimaiProgress";

const EXTERNAL_CHAT_APPEND_EVENT = "aguaphone:chat-messages-appended";

export function useChatSideEffects(context: {
  messages: Ref<Message[]>;
  pendingMessage: () => string | PendingInjectedMessage;
  currentChatId: Ref<string | null | undefined>;
  isChatGenerating: () => boolean;
  loadOrCreateChat: () => Promise<unknown>;
  scrollToBottom: () => void;
  saveChatImmediate: () => void | Promise<void>;
  emitPendingMessageConsumed: () => void;
}) {
  // 外賣物流進度時間閘門：用於逐日顯示排程訊息。
  const waimaiProgressNow = ref(Date.now());
  let waimaiProgressTimer: ReturnType<typeof setInterval> | undefined;

  const isInitialChatLoadDone = ref(false);
  let deferredPendingMessage: string | PendingInjectedMessage | null = null;

  function isMessageDisplayable(
    message: Message,
    now = waimaiProgressNow.value,
  ): boolean {
    if (message.isContinuePrompt) return false;
    if (message.isWaimaiProgress && message.timestamp > now) return false;
    return true;
  }

  /** 把物流進度條目轉成聊天訊息（依時間排序） */
  function toProgressChatMessages(
    entries: NonNullable<PendingInjectedMessage["waimaiProgressMessages"]>,
    idPrefix = `msg_${Date.now()}_waimai_progress_`,
  ): Message[] {
    return entries
      .map((entry, idx) => ({
        id: `${idPrefix}${idx}`,
        role: "system" as const,
        content: entry.content,
        timestamp: entry.timestamp ?? Date.now(),
        isWaimaiProgress: entry.isWaimaiProgress ?? true,
        isWaimaiDelivery: entry.isWaimaiDelivery,
        waimaiOrder: entry.waimaiOrder,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  function injectPendingMessage(msg: string | PendingInjectedMessage) {
    const baseMessage: Message = {
      id: `msg_${Date.now()}`,
      role: "user",
      content: typeof msg === "string" ? msg : msg.content,
      timestamp: Date.now(),
    };

    if (typeof msg !== "string") {
      baseMessage.isWaimaiShare = msg.isWaimaiShare;
      baseMessage.isWaimaiPaymentRequest = msg.isWaimaiPaymentRequest;
      baseMessage.isWaimaiPaymentConfirm = msg.isWaimaiPaymentConfirm;
      baseMessage.isWaimaiPaymentResult = msg.isWaimaiPaymentResult;
      baseMessage.isWaimaiProgress = msg.isWaimaiProgress;
      baseMessage.isWaimaiDelivery = msg.isWaimaiDelivery;
      baseMessage.waimaiOrder = msg.waimaiOrder;
      baseMessage.isMusicShare = msg.isMusicShare;
      baseMessage.musicShareData = msg.musicShareData;
      baseMessage.plurkShare = msg.plurkShare;
      baseMessage.liuyaoShare = msg.liuyaoShare;
      baseMessage.houseNews = msg.houseNews;
    }

    context.messages.value.push(baseMessage);

    if (typeof msg !== "string" && msg.followUpText?.trim()) {
      context.messages.value.push({
        id: `msg_${Date.now()}_text`,
        role: "user",
        content: msg.followUpText.trim(),
        timestamp: Date.now() + 1,
      });
    }

    if (typeof msg !== "string" && msg.waimaiProgressMessages?.length) {
      context.messages.value.push(
        ...toProgressChatMessages(msg.waimaiProgressMessages),
      );
    }

    context.scrollToBottom();
    context.saveChatImmediate();
    context.emitPendingMessageConsumed();
  }

  function flushDeferredPendingMessage() {
    if (!deferredPendingMessage) return;
    const msg = deferredPendingMessage;
    deferredPendingMessage = null;
    nextTick(() => injectPendingMessage(msg));
  }

  function markInitialChatLoadDone() {
    isInitialChatLoadDone.value = true;
    flushDeferredPendingMessage();
  }

  async function handleExternalChatAppend(ev: Event) {
    const detail = (ev as CustomEvent).detail || {};
    const targetChatId = detail.chatId;
    if (!targetChatId) return;
    if (context.currentChatId.value !== targetChatId) return;
    // 若正在生成中，避免破壞 streaming 佔位符。
    if (context.isChatGenerating()) return;

    try {
      await context.loadOrCreateChat();
      nextTick(() => context.scrollToBottom());
    } catch (err) {
      console.warn("[ChatScreen] handleExternalChatAppend reload failed:", err);
    }
  }

  watch(
    context.pendingMessage,
    (msg: string | PendingInjectedMessage) => {
      if (!msg) return;

      if (!isInitialChatLoadDone.value) {
        deferredPendingMessage = msg;
        return;
      }

      injectPendingMessage(msg);
    },
    { immediate: true },
  );

  // 角色代付成功後補上物流進度；生成中不動，避免干擾串流佔位訊息
  watch(
    [() => context.messages.value.length, () => context.isChatGenerating()],
    () => {
      if (context.isChatGenerating()) return;

      const list = context.messages.value;
      const pushed: Message[] = [];
      for (const m of list.slice(-30)) {
        if (!m.waimaiNeedsProgress || m.waimaiOrder?.status !== "paid") continue;
        delete m.waimaiNeedsProgress;
        const order = m.waimaiOrder;
        const entries = buildAutoProgressMessages(order).map((p) => ({
          content: p.content,
          timestamp: p.timestamp,
          isWaimaiProgress: true,
          isWaimaiDelivery: p.isWaimaiDelivery,
          waimaiOrder: p.order,
        }));
        if (!entries.length) continue;
        pushed.push(
          ...toProgressChatMessages(
            entries,
            `msg_${Date.now()}_waimai_progress_${order.orderId}_`,
          ),
        );
      }

      if (pushed.length) {
        list.push(...pushed);
        context.saveChatImmediate();
      }
    },
  );

  onMounted(() => {
    waimaiProgressTimer = setInterval(() => {
      waimaiProgressNow.value = Date.now();
    }, 60_000);

    window.addEventListener(
      EXTERNAL_CHAT_APPEND_EVENT,
      handleExternalChatAppend as EventListener,
    );
  });

  onUnmounted(() => {
    window.removeEventListener(
      EXTERNAL_CHAT_APPEND_EVENT,
      handleExternalChatAppend as EventListener,
    );

    if (waimaiProgressTimer) {
      clearInterval(waimaiProgressTimer);
      waimaiProgressTimer = undefined;
    }
  });

  return {
    waimaiProgressNow,
    isMessageDisplayable,
    injectPendingMessage,
    flushDeferredPendingMessage,
    markInitialChatLoadDone,
    handleExternalChatAppend,
  };
}
