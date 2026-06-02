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
    }

    context.messages.value.push(baseMessage);

    if (typeof msg !== "string" && msg.waimaiProgressMessages?.length) {
      const progressEntries = msg.waimaiProgressMessages
        .map((entry, idx) => ({
          id: `msg_${Date.now()}_waimai_progress_${idx}`,
          role: "system" as const,
          content: entry.content,
          timestamp: entry.timestamp ?? Date.now(),
          isWaimaiProgress: entry.isWaimaiProgress ?? true,
          isWaimaiDelivery: entry.isWaimaiDelivery,
          waimaiOrder: entry.waimaiOrder,
        }))
        .sort((a, b) => a.timestamp - b.timestamp);

      context.messages.value.push(...progressEntries);
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
