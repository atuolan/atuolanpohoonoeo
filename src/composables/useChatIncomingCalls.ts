import { ref, watch, type Ref, type ComputedRef } from "vue";
import { usePhoneCallStore } from "@/stores/phoneCall";
import { useSettingsStore } from "@/stores";
import { useNotificationStore } from "@/stores/notification";
import {
  buildPostCallPrompt,
  createCallNotificationCard,
} from "@/utils/postCallReaction";
import { getIncomingCallScheduler } from "@/services/IncomingCallScheduler";
import type { PendingCall } from "@/types/incomingCall";

interface Message {
  id: string;
  role: "user" | "ai" | "system";
  content: string;
  timestamp: number;
  [key: string]: any;
}

interface PhoneCallMessage {
  id: string;
  role: "user" | "ai" | "system";
  content: string;
  timestamp: number;
}

/**
 * 來電功能處理
 * 從 ChatScreen.vue 抽取的獨立 composable
 */
export function useChatIncomingCalls(deps: {
  messages: Ref<Message[]>;
  currentChatId: Ref<string | null>;
  currentCharacter: ComputedRef<any>;
  effectivePersona: ComputedRef<any>;
  lastMessage: ComputedRef<any>;
  chatDoNotDisturb: Ref<boolean>;
  characterId: string;
  characterName: string;
  characterAvatar: string;
  chatId: string;
  scrollToBottom: () => void;
  handlePhoneCallEnded: (msgs: PhoneCallMessage[], duration: number) => Promise<void>;
  triggerAIResponse: (options?: any) => Promise<void>;
}) {
  const phoneCallStore = usePhoneCallStore();
  const settingsStore = useSettingsStore();
  const notificationStore = useNotificationStore();
  const incomingCallScheduler = getIncomingCallScheduler();

  // 來電狀態
  const showIncomingCallModal = ref(false);
  const currentPendingCall = ref<PendingCall | null>(null);
  let pendingCallCheckTimer: ReturnType<typeof setInterval> | null = null;
  const isIncomingCallMode = ref(false);
  const incomingCallReason = ref("");

  /** 檢查待處理來電 */
  async function checkPendingCalls() {
    // 如果當前正在通話中，自動拒絕新來電
    if (phoneCallStore.isActive) {
      const chatDoNotDisturbMap = new Map<string, boolean>();
      if (deps.currentChatId.value && deps.chatDoNotDisturb.value) {
        chatDoNotDisturbMap.set(deps.currentChatId.value, true);
      }

      const pendingCall = await incomingCallScheduler.checkPendingCalls(
        settingsStore.doNotDisturb,
        chatDoNotDisturbMap,
      );
      if (pendingCall) {
        const charId = deps.characterId || deps.currentCharacter.value?.id;
        if (pendingCall.characterId === charId) {
          console.log("[IncomingCalls] 通話中，自動拒絕來電:", pendingCall.characterName);

          await incomingCallScheduler.recordCallHistory(
            pendingCall.characterId,
            pendingCall.chatId,
            "incoming",
            "declined",
            0,
            pendingCall.reason,
          );
          await incomingCallScheduler.cancelPendingCall(pendingCall.id);

          insertCallNotificationCard(
            "busy",
            pendingCall.characterName,
            pendingCall.reason,
          );

          const userName = deps.effectivePersona.value?.name || "User";
          const prompt = buildPostCallPrompt(
            "busy",
            pendingCall.reason,
            pendingCall.characterName,
            userName,
          );
          await deps.triggerAIResponse({ postCallPrompt: prompt });
        }
      }
      return;
    }

    const chatDoNotDisturbMap = new Map<string, boolean>();
    if (deps.currentChatId.value && deps.chatDoNotDisturb.value) {
      chatDoNotDisturbMap.set(deps.currentChatId.value, true);
    }

    const pendingCall = await incomingCallScheduler.checkPendingCalls(
      settingsStore.doNotDisturb,
      chatDoNotDisturbMap,
    );
    if (pendingCall) {
      const charId = deps.characterId || deps.currentCharacter.value?.id;
      if (pendingCall.characterId === charId) {
        console.log("[IncomingCalls] 觸發來電:", pendingCall);
        const isSamePendingCall = currentPendingCall.value?.id === pendingCall.id;

        currentPendingCall.value = pendingCall;
        showIncomingCallModal.value = true;

        if (!isSamePendingCall) {
          notificationStore.notifyIncomingCall(
            pendingCall.characterName,
            pendingCall.reason,
            pendingCall.chatId,
            pendingCall.characterId,
          );
        }
      }
    }
  }

  /** 處理接聽來電 */
  async function handleIncomingCallAccept() {
    if (!currentPendingCall.value) return;

    const pendingCall = currentPendingCall.value;

    await incomingCallScheduler.recordCallHistory(
      pendingCall.characterId,
      pendingCall.chatId,
      "incoming",
      "answered",
      0,
      pendingCall.reason,
    );

    await incomingCallScheduler.cancelPendingCall(pendingCall.id);

    showIncomingCallModal.value = false;

    isIncomingCallMode.value = true;
    incomingCallReason.value = pendingCall.reason;
    phoneCallStore.startCall({
      characterId: deps.characterId || "",
      characterName: deps.characterName || "角色",
      characterAvatar: deps.characterAvatar,
      chatId: deps.currentChatId.value || deps.chatId || undefined,
      lastMessageTime: deps.lastMessage.value?.timestamp,
      isIncoming: true,
      callReason: pendingCall.reason,
    });

    currentPendingCall.value = null;
  }

  /** 插入通話通知卡片到聊天記錄 */
  function insertCallNotificationCard(
    type: "declined" | "missed" | "busy",
    characterName: string,
    reason: string,
  ) {
    const card = createCallNotificationCard(type, characterName, reason);
    const msg: Message = {
      ...card,
      role: "system",
    };
    deps.messages.value.push(msg);
    deps.scrollToBottom();
  }

  /** 處理拒接來電 */
  async function handleIncomingCallDecline() {
    if (!currentPendingCall.value) return;

    const pendingCall = currentPendingCall.value;

    await incomingCallScheduler.recordCallHistory(
      pendingCall.characterId,
      pendingCall.chatId,
      "incoming",
      "declined",
      0,
      pendingCall.reason,
    );

    await incomingCallScheduler.cancelPendingCall(pendingCall.id);

    showIncomingCallModal.value = false;
    currentPendingCall.value = null;

    insertCallNotificationCard(
      "declined",
      pendingCall.characterName,
      pendingCall.reason,
    );

    const userName = deps.effectivePersona.value?.name || "User";
    const prompt = buildPostCallPrompt(
      "declined",
      pendingCall.reason,
      pendingCall.characterName,
      userName,
    );
    await deps.triggerAIResponse({ postCallPrompt: prompt });

    console.log("[IncomingCalls] 來電已拒接，已觸發來電後反應");
  }

  /** 處理未接來電（超時） */
  async function handleIncomingCallMissed() {
    if (!currentPendingCall.value) return;

    const pendingCall = currentPendingCall.value;

    await incomingCallScheduler.recordCallHistory(
      pendingCall.characterId,
      pendingCall.chatId,
      "incoming",
      "missed",
      0,
      pendingCall.reason,
    );

    await incomingCallScheduler.cancelPendingCall(pendingCall.id);

    showIncomingCallModal.value = false;
    currentPendingCall.value = null;

    insertCallNotificationCard(
      "missed",
      pendingCall.characterName,
      pendingCall.reason,
    );

    const userName = deps.effectivePersona.value?.name || "User";
    const prompt = buildPostCallPrompt(
      "missed",
      pendingCall.reason,
      pendingCall.characterName,
      userName,
    );
    await deps.triggerAIResponse({ postCallPrompt: prompt });

    console.log("[IncomingCalls] 來電未接，已觸發來電後反應");
  }

  /** 處理來電模式的電話通話結束 */
  async function handleIncomingPhoneCallEnded(
    callMessages: PhoneCallMessage[],
    duration: number,
  ) {
    isIncomingCallMode.value = false;
    incomingCallReason.value = "";
    await deps.handlePhoneCallEnded(callMessages, duration);
  }

  /** 啟動待處理來電檢查定時器 */
  function startPendingCallChecker() {
    pendingCallCheckTimer = setInterval(() => {
      checkPendingCalls();
    }, 5000);
    checkPendingCalls();
  }

  /** 停止待處理來電檢查定時器 */
  function stopPendingCallChecker() {
    if (pendingCallCheckTimer) {
      clearInterval(pendingCallCheckTimer);
      pendingCallCheckTimer = null;
    }
  }

  /** 電話通話關閉處理 */
  function handlePhoneCallClose() {
    isIncomingCallMode.value = false;
    incomingCallReason.value = "";
  }

  // 監聽 phoneCallStore 通話結束，自動保存通話記錄
  watch(
    () => phoneCallStore.callState,
    async (state) => {
      if (state === "ended" && phoneCallStore.callMessages.length > 0) {
        const msgs = phoneCallStore.callMessages.filter(
          (m) => m.role !== "system",
        );
        const duration = phoneCallStore.callDuration;
        const wasIncoming = isIncomingCallMode.value;
        isIncomingCallMode.value = false;
        incomingCallReason.value = "";
        if (wasIncoming) {
          await handleIncomingPhoneCallEnded(msgs, duration);
        } else {
          await deps.handlePhoneCallEnded(msgs, duration);
        }
      }
    },
  );

  return {
    showIncomingCallModal,
    currentPendingCall,
    isIncomingCallMode,
    incomingCallReason,
    checkPendingCalls,
    handleIncomingCallAccept,
    handleIncomingCallDecline,
    handleIncomingCallMissed,
    handleIncomingPhoneCallEnded,
    startPendingCallChecker,
    stopPendingCallChecker,
    handlePhoneCallClose,
  };
}
