import BlockService from "@/services/BlockService";
import { loadChatById } from "@/storage/chatStorage";
import { useSettingsStore } from "@/stores";
import { OpenAICompatibleClient } from "@/api/OpenAICompatible";
import { ref, type Ref } from "vue";

export function useChatBlock(context: {
  currentChatId: Ref<string | null | undefined>;
  currentChatData: Ref<any>;
  messages: Ref<any[]>;
  displayCharacterName: Ref<string>;
  currentCharacter: Ref<any>;
  characterName: string;
  effectivePersona: Ref<any>;
  userStore: any;
  scrollToBottom: () => void;
  saveChatImmediate: () => Promise<void>;
  showMoreMenu: Ref<boolean>;
  showRail: Ref<boolean>;
}) {
  const settingsStore = useSettingsStore();

  const isCharBlocked = ref(false);
  const isBlockedByChar = ref(false);
  const currentBlockedAt = ref<number>(0);
  const showFriendRequestInput = ref(false);
  const friendRequestMessage = ref("");

  async function refreshBlockStateFromStorage() {
    if (!context.currentChatId.value) return undefined;
    const updatedChat = await loadChatById(context.currentChatId.value);
    if (updatedChat && context.currentChatData.value) {
      context.currentChatData.value.blockState = updatedChat.blockState;
    }
    const status = updatedChat?.blockState?.status ?? "none";
    isCharBlocked.value = status === "user-blocked-char";
    isBlockedByChar.value = status === "char-blocked-user";
    currentBlockedAt.value = updatedChat?.blockState?.blockedAt ?? 0;
    return updatedChat;
  }

  async function loadBlockState() {
    if (!context.currentChatId.value) return;
    try {
      const chat = await loadChatById(context.currentChatId.value);
      if (chat?.blockState) {
        isCharBlocked.value = chat.blockState.status === "user-blocked-char";
        isBlockedByChar.value = chat.blockState.status === "char-blocked-user";
        currentBlockedAt.value = chat.blockState.blockedAt ?? 0;
      } else {
        isCharBlocked.value = false;
        isBlockedByChar.value = false;
        currentBlockedAt.value = 0;
      }
    } catch { /* ignore */ }
  }

  function shouldShowBlockedIndicator(message: any): boolean {
    if (message.isSystemNotification) return false;
    if (message.sentWhileBlocked) return true;
    const blockedAt = currentBlockedAt.value;
    if (!blockedAt) return false;
    if (isCharBlocked.value && message.role === "ai" && message.timestamp > blockedAt) return true;
    if (isBlockedByChar.value && message.role === "user" && message.timestamp > blockedAt) return true;
    return false;
  }

  async function toggleBlockCharacter() {
    if (!context.currentChatId.value) return;
    const blockService = BlockService.getInstance();
    if (isCharBlocked.value) {
      await blockService.unblockCharacter(context.currentChatId.value);
      currentBlockedAt.value = 0;
      isCharBlocked.value = false;
      await refreshBlockStateFromStorage();
      context.messages.value.push({
        id: `msg_notify_${Date.now()}`,
        role: "user",
        content: `已解除對 ${context.displayCharacterName.value} 的封鎖`,
        timestamp: Date.now(),
        isSystemNotification: true,
      });
      context.scrollToBottom();
      await context.saveChatImmediate();
    } else {
      if (!confirm("確定要封鎖這個角色嗎？封鎖後將停止接收主動訊息和來電。")) return;
      await blockService.blockCharacter(context.currentChatId.value);
      const updatedChat2 = await refreshBlockStateFromStorage();
      currentBlockedAt.value = updatedChat2?.blockState?.blockedAt ?? Date.now();
      isCharBlocked.value = true;
      context.messages.value.push({
        id: `msg_notify_${Date.now()}`,
        role: "user",
        content: `你已將 ${context.displayCharacterName.value} 封鎖`,
        timestamp: Date.now(),
        isSystemNotification: true,
      });
      context.scrollToBottom();
      await context.saveChatImmediate();
    }
    context.showMoreMenu.value = false;
    context.showRail.value = false;
  }

  async function submitFriendRequest() {
    if (!context.currentChatId.value || !friendRequestMessage.value.trim()) return;
    try {
      const requestMsg = friendRequestMessage.value.trim();
      showFriendRequestInput.value = false;
      friendRequestMessage.value = "";

      const chatTaskConfig = settingsStore.getAPIForTask("chat");
      if (!chatTaskConfig.api.endpoint || !chatTaskConfig.api.apiKey || !chatTaskConfig.api.model) {
        alert("請先在設定中配置 API");
        return;
      }

      const charName = context.currentCharacter.value?.data?.name || context.characterName || "角色";
      const charPersona = context.currentCharacter.value?.data?.description || context.currentCharacter.value?.data?.personality || "";
      const chat = await loadChatById(context.currentChatId.value);
      const blockState = chat?.blockState;
      const prevRejects = blockState?.friendRequests?.filter((r: any) => r.result === "rejected") ?? [];

      const historyMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];
      const recentMsgs = context.messages.value.filter((m) => m.content?.trim() && !m.isSystemNotification).slice(-15);
      for (const m of recentMsgs) {
        if (m.role === "user") {
          let content = (m.content || "").slice(0, 300);
          if (m.sentWhileBlocked) content += "\n（此訊息發送於被封鎖期間）";
          historyMessages.push({ role: "user", content });
        } else if (m.role === "ai") {
          historyMessages.push({ role: "assistant", content: (m.content || "").slice(0, 300) });
        } else if (m.role === "system" && m.isCharBlockedNotification) {
          historyMessages.push({ role: "system", content: "（你在此時拉黑了用戶）" });
        }
      }

      let prompt = `你是「${charName}」。你的人設：\n${charPersona}\n\n`;
      prompt += `你之前拉黑了用戶。用戶現在發來好友申請，申請理由：「${requestMsg.slice(0, 200)}」。\n`;
      prompt += `這是用戶第 ${prevRejects.length + 1} 次申請。`;
      if (prevRejects.length > 0) prompt += ` 之前你拒絕過 ${prevRejects.length} 次。`;
      prompt += `\n\n請根據你的性格和對話記錄，決定是否接受好友申請。`;
      prompt += `\n只輸出以下 JSON，不要任何其他文字：`;
      prompt += `\n接受：{"accept":true,"reply":"你想對用戶說的話（符合你的性格）"}`;
      prompt += `\n拒絕：{"accept":false,"rejectReason":"拒絕理由(30字內)","hint":"給用戶的小提示(可選)"}`;

      const client = new OpenAICompatibleClient(chatTaskConfig.api);
      const result = await client.generate({
        messages: [
          { role: "system", content: `你是「${charName}」，一個角色扮演助手。根據對話歷史和你的性格決定是否接受好友申請。只輸出一行 JSON，不要 markdown，不要解釋。` },
          ...historyMessages,
          { role: "user", content: prompt },
        ],
        settings: {
          maxContextLength: chatTaskConfig.generation.maxContextLength,
          maxResponseLength: chatTaskConfig.generation.maxTokens,
          temperature: chatTaskConfig.generation.temperature,
          topP: chatTaskConfig.generation.topP,
          topK: 0,
          frequencyPenalty: chatTaskConfig.generation.frequencyPenalty,
          presencePenalty: chatTaskConfig.generation.presencePenalty,
          repetitionPenalty: 1,
          stopSequences: [],
          streaming: false,
          useStreamingWindow: false,
        },
        apiSettings: chatTaskConfig.api,
      });

      let accept = false;
      let rejectReason = "";
      let hint = "";
      let reply = "";
      try {
        let raw = result.content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
        const jsonStr = raw.replace(/^[\s\S]*?(\{[\s\S]*?\})[\s\S]*$/, "$1");
        const obj = JSON.parse(jsonStr);
        accept = !!obj.accept;
        rejectReason = (obj.rejectReason || "").trim().slice(0, 100);
        hint = (obj.hint || "").trim().slice(0, 100);
        reply = (obj.reply || "").trim();
      } catch {
        const raw = result.content.toLowerCase();
        if (raw.includes('"accept":true') || raw.includes('"accept": true')) {
          accept = true;
        } else {
          rejectReason = "對方暫時無法回應，請稍後再試。";
        }
      }

      const blockService = BlockService.getInstance();
      if (accept) {
        await blockService.handleCharacterUnblock(context.currentChatId.value);
        currentBlockedAt.value = 0;
        isBlockedByChar.value = false;
        await refreshBlockStateFromStorage();
        context.messages.value.push({
          id: `msg_unblocked_${Date.now()}`,
          role: "system",
          content: `${charName} 已同意你的好友申請，可以繼續聊天`,
          timestamp: Date.now(),
          isSystemNotification: true,
        });
        if (reply) {
          context.messages.value.push({
            id: `msg_${Date.now()}_reply`,
            role: "ai",
            content: reply,
            timestamp: Date.now(),
          });
        }
        await context.saveChatImmediate();
      } else {
        const rejectText = rejectReason || "對方拒絕了你的好友申請";
        context.messages.value.push({
          id: `msg_reject_${Date.now()}`,
          role: "system",
          content: rejectText + (hint ? `\n💡 ${hint}` : ""),
          timestamp: Date.now(),
          isSystemNotification: true,
        });
        await context.saveChatImmediate();
      }
    } catch (err: any) {
      console.error("[submitFriendRequest] 錯誤:", err);
      context.messages.value.push({
        id: `msg_req_err_${Date.now()}`,
        role: "system",
        content: `好友申請發送失敗：${err.message || "未知錯誤"}`,
        timestamp: Date.now(),
        isSystemNotification: true,
      });
    }
  }

  return {
    isCharBlocked,
    isBlockedByChar,
    currentBlockedAt,
    showFriendRequestInput,
    friendRequestMessage,
    loadBlockState,
    refreshBlockStateFromStorage,
    shouldShowBlockedIndicator,
    toggleBlockCharacter,
    submitFriendRequest,
  };
}
