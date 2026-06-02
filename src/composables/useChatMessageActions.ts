import { nextTick, ref, type ComputedRef, type Ref } from "vue";
import { deleteMessage } from "@/storage/chatMessageStorage";
import type { ChatScreenMessage as Message } from "@/types/chatScreen";
import { extractModeRequestReason, getPreviewText } from "@/utils/chatScreenHelpers";

export function useChatMessageActions(context: {
  messages: Ref<Message[]>;
  chatFaceToFaceMode: Ref<boolean>;
  displayCharacterName: ComputedRef<string>;
  userName: ComputedRef<string> | Ref<string>;
  effectivePersona: ComputedRef<{ name?: string } | null | undefined>;
  currentCharacter: ComputedRef<any>;
  saveChatImmediate: () => Promise<void>;
  focusReplyInput?: () => void;
}) {
  const editingMessageId = ref<string | null>(null);
  const editingContent = ref("");
  const editingThought = ref("");
  const editContentTextareaRef = ref<HTMLTextAreaElement | null>(null);
  const editThoughtTextareaRef = ref<HTMLTextAreaElement | null>(null);
  const replyingTo = ref<Message | null>(null);

  function handleMessageClick(id: string) {
    console.log("Message clicked:", id);
  }

  function handleMessageEdit(id: string) {
    const message = context.messages.value.find((m) => m.id === id);
    if (!message) return;

    editingMessageId.value = id;
    editingContent.value = message.content;
    editingThought.value = message.thought || "";

    nextTick(() => {
      if (editContentTextareaRef.value) {
        editContentTextareaRef.value.value = message.content;
      }
      if (editThoughtTextareaRef.value) {
        editThoughtTextareaRef.value.value = message.thought || "";
      }
    });
  }

  function syncModeRequestFieldsFromContent(message: Message, content: string): void {
    const faceToFaceMatch = content.match(/<face-to-face-request\s+([^>]*?)\s*\/?>/i);
    if (faceToFaceMatch) {
      const preservedStatus = message.isFaceToFaceRequest
        ? message.faceToFaceRequestStatus
        : undefined;
      message.isFaceToFaceRequest = true;
      message.faceToFaceRequestReason = extractModeRequestReason(faceToFaceMatch[1]);
      message.faceToFaceRequestStatus = preservedStatus || "pending";
      message.isOnlineModeRequest = false;
      message.onlineModeRequestReason = undefined;
      message.onlineModeRequestStatus = undefined;
      return;
    }

    const onlineModeMatch = content.match(/<online-mode-request\s+([^>]*?)\s*\/?>/i);
    if (onlineModeMatch) {
      const preservedStatus = message.isOnlineModeRequest
        ? message.onlineModeRequestStatus
        : undefined;
      message.isOnlineModeRequest = true;
      message.onlineModeRequestReason = extractModeRequestReason(onlineModeMatch[1]);
      message.onlineModeRequestStatus = preservedStatus || "pending";
      message.isFaceToFaceRequest = false;
      message.faceToFaceRequestReason = undefined;
      message.faceToFaceRequestStatus = undefined;
      return;
    }

    message.isFaceToFaceRequest = false;
    message.faceToFaceRequestReason = undefined;
    message.faceToFaceRequestStatus = undefined;
    message.isOnlineModeRequest = false;
    message.onlineModeRequestReason = undefined;
    message.onlineModeRequestStatus = undefined;
  }

  async function saveEdit() {
    if (!editingMessageId.value) return;
    const message = context.messages.value.find((m) => m.id === editingMessageId.value);
    if (message) {
      const content = editContentTextareaRef.value?.value ?? editingContent.value;
      const thought = editThoughtTextareaRef.value?.value ?? editingThought.value;
      message.content = content;
      message.thought = thought || undefined;
      syncModeRequestFieldsFromContent(message, content);
      if (message.isTimetravel) {
        message.timetravelContent = content;
      }
      await context.saveChatImmediate();
    }
    cancelEdit();
  }

  function cancelEdit() {
    editingMessageId.value = null;
    editingContent.value = "";
    editingThought.value = "";
  }

  async function handleMessageDelete(id: string) {
    if (!confirm("確定要刪除這條訊息嗎？")) return;
    context.messages.value = context.messages.value.filter((m) => m.id !== id);
    await deleteMessage(id);
    await context.saveChatImmediate();
  }

  async function handleMessageRecall(id: string, type: "seen" | "unseen") {
    const msg = context.messages.value.find((m) => m.id === id);
    if (!msg || msg.role !== "user") return;

    msg.recallContent = msg.content;
    msg.isUserRecalled = true;
    msg.userRecalledType = type;

    const charName = context.displayCharacterName.value || "對方";
    const userName = context.userName.value || "用戶";
    msg.content =
      type === "seen"
        ? `(撤回的訊息被${charName}看見了，內容是「${msg.recallContent}」)`
        : `(${userName}撤回了此訊息)`;

    await context.saveChatImmediate();
  }

  async function handleUndoRecall(id: string) {
    const msg = context.messages.value.find((m) => m.id === id);
    if (!msg || !msg.isUserRecalled || !msg.recallContent) return;

    msg.content = msg.recallContent;
    msg.isUserRecalled = false;
    msg.userRecalledType = undefined;
    msg.recallContent = undefined;

    await context.saveChatImmediate();
  }

  async function handleCharRecallReveal(id: string) {
    const msg = context.messages.value.find((m) => m.id === id);
    if (!msg || !msg.isCharRecall || msg.charRecallType !== "seen") return;
    msg.charRecallRevealed = true;
    await context.saveChatImmediate();
  }

  async function handleAcceptFaceToFaceRequest(id: string) {
    const msg = context.messages.value.find((m) => m.id === id);
    if (!msg || !msg.isFaceToFaceRequest || msg.faceToFaceRequestStatus !== "pending") {
      return;
    }
    msg.faceToFaceRequestStatus = "accepted";
    context.chatFaceToFaceMode.value = true;
    await context.saveChatImmediate();
  }

  async function handleRejectFaceToFaceRequest(id: string) {
    const msg = context.messages.value.find((m) => m.id === id);
    if (!msg || !msg.isFaceToFaceRequest || msg.faceToFaceRequestStatus !== "pending") {
      return;
    }
    msg.faceToFaceRequestStatus = "rejected";
    await context.saveChatImmediate();
  }

  async function handleAcceptOnlineModeRequest(id: string) {
    const msg = context.messages.value.find((m) => m.id === id);
    if (!msg || !msg.isOnlineModeRequest || msg.onlineModeRequestStatus !== "pending") {
      return;
    }
    msg.onlineModeRequestStatus = "accepted";
    context.chatFaceToFaceMode.value = false;
    await context.saveChatImmediate();
  }

  async function handleRejectOnlineModeRequest(id: string) {
    const msg = context.messages.value.find((m) => m.id === id);
    if (!msg || !msg.isOnlineModeRequest || msg.onlineModeRequestStatus !== "pending") {
      return;
    }
    msg.onlineModeRequestStatus = "rejected";
    await context.saveChatImmediate();
  }

  function handleMessageCopy(id: string) {
    console.log("Message copied:", id);
  }

  function handleReply(message: Message) {
    console.log("回覆消息:", message);
    replyingTo.value = message;
    nextTick(() => {
      context.focusReplyInput?.();
    });
  }

  function handleReplyById(messageId: string) {
    const message = context.messages.value.find((m) => m.id === messageId);
    if (message) {
      handleReply(message);
    }
  }

  function cancelReply() {
    replyingTo.value = null;
  }

  function getReplyToContent(messageId: string): string {
    const msg = context.messages.value.find((m) => m.id === messageId);
    return msg ? getPreviewText(msg.content) : "";
  }

  function getReplyToName(messageId: string): string {
    const msg = context.messages.value.find((m) => m.id === messageId);
    if (!msg) return "";
    if (msg.role === "user") return context.effectivePersona.value?.name || "我";
    return msg.senderCharacterName || context.currentCharacter.value?.data?.name || "";
  }

  return {
    editingMessageId,
    editingContent,
    editingThought,
    editContentTextareaRef,
    editThoughtTextareaRef,
    replyingTo,
    handleMessageClick,
    handleMessageEdit,
    syncModeRequestFieldsFromContent,
    saveEdit,
    cancelEdit,
    handleMessageDelete,
    handleMessageRecall,
    handleUndoRecall,
    handleCharRecallReveal,
    handleAcceptFaceToFaceRequest,
    handleRejectFaceToFaceRequest,
    handleAcceptOnlineModeRequest,
    handleRejectOnlineModeRequest,
    handleMessageCopy,
    handleReply,
    handleReplyById,
    cancelReply,
    getReplyToContent,
    getReplyToName,
  };
}
