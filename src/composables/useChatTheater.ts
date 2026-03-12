import { ref, type Ref, type ComputedRef } from "vue";
import { db, DB_STORES } from "@/db/database";
import type { Chat, ChatMessage } from "@/types/chat";

/**
 * 小劇場功能
 * 從 ChatScreen.vue 抽取的獨立 composable
 */
export function useChatTheater(deps: {
  messages: Ref<any[]>;
  currentChatId: Ref<string | null>;
  currentChatData: Ref<Chat | null>;
  currentCharacter: ComputedRef<any>;
  characterId: string;
  characterName: string;
  chatId: string;
  chatSummarySettings: Ref<any>;
  userPersonaName: () => string;
  scrollToBottom: () => void;
  saveChat: () => void;
  switchChatFile: (chatId: string) => Promise<void>;
  triggerAIResponse: (opts?: { theaterNudge?: boolean }) => Promise<void>;
}) {
  const showSmallTheaterModal = ref(false);
  const smallTheaterInput = ref("");
  const theaterStep = ref<
    "branch-confirm" | "options" | "forwarded-history" | "input"
  >("branch-confirm");
  const theaterUseBranch = ref(false);
  const theaterInheritHistory = ref(false);
  const theaterInheritSummary = ref(false);
  const theaterNewChatFile = ref(false);
  const theaterForwardedMessages = ref<
    Array<{
      senderName: string;
      content: string;
      timestamp: number;
      isUser: boolean;
    }>
  >([]);

  function openTheater() {
    smallTheaterInput.value = "";
    theaterStep.value = "branch-confirm";
    theaterUseBranch.value = false;
    theaterInheritHistory.value = false;
    theaterInheritSummary.value = false;
    theaterNewChatFile.value = false;
    theaterForwardedMessages.value = [];
    showSmallTheaterModal.value = true;
  }

  // 步驟1：用戶選擇是否開啟分支
  function theaterChooseBranch(useBranch: boolean) {
    theaterUseBranch.value = useBranch;
    if (useBranch) {
      theaterNewChatFile.value = true;
      theaterStep.value = "options";
    } else {
      theaterStep.value = "input";
    }
  }

  // 步驟2：確認選項後，準備轉發記錄或直接進入輸入
  async function theaterConfirmOptions() {
    if (theaterInheritHistory.value) {
      const settings = deps.chatSummarySettings.value;
      const roundCount =
        settings.intervalMode === "turn"
          ? settings.summaryIntervalTurn
          : Math.floor(settings.summaryIntervalMessage / 2);

      const validMsgs = deps.messages.value.filter(
        (m: any) => m.role === "user" || m.role === "ai",
      );
      const takeMsgs = validMsgs.slice(-(roundCount * 2));
      const charName =
        deps.currentCharacter.value?.data?.name || deps.characterName;
      const userName = deps.userPersonaName();

      theaterForwardedMessages.value = takeMsgs.map((m: any) => ({
        senderName: m.role === "user" ? userName : charName,
        content: m.content?.slice(0, 200) ?? "",
        timestamp: m.timestamp,
        isUser: m.role === "user",
      }));

      theaterStep.value = "forwarded-history";
    } else {
      theaterStep.value = "input";
    }
  }

  function theaterConfirmForwarded() {
    theaterStep.value = "input";
  }

  async function confirmSmallTheater() {
    const content = smallTheaterInput.value.trim();
    if (!content) return;

    showSmallTheaterModal.value = false;

    if (theaterUseBranch.value) {
      const now = Date.now();
      const chatData = deps.currentChatData.value;
      if (!chatData) return;

      let branchMessages: ChatMessage[] = [];

      if (theaterInheritHistory.value) {
        const settings = deps.chatSummarySettings.value;
        const roundCount =
          settings.intervalMode === "turn"
            ? settings.summaryIntervalTurn
            : Math.floor(settings.summaryIntervalMessage / 2);
        const validMsgs = deps.messages.value.filter(
          (m: any) => m.role === "user" || m.role === "ai",
        );
        const takeMsgs = validMsgs.slice(-(roundCount * 2));

        const charName =
          deps.currentCharacter.value?.data?.name || deps.characterName;
        const userName = deps.userPersonaName();
        const forwardCard: ChatMessage = {
          id: `msg_forward_${now}`,
          sender: "system",
          name: "system",
          content: "",
          is_user: false,
          status: "sent",
          createdAt: now,
          updatedAt: now,
          isGroupChatHistory: true,
          groupChatHistoryData: {
            groupName: chatData.name || "聊天記錄",
            messages: takeMsgs.map((m: any) => ({
              senderName: m.role === "user" ? userName : charName,
              content: m.content?.slice(0, 200) ?? "",
              timestamp: m.timestamp,
              isUser: m.role === "user",
            })),
          },
        } as any;

        branchMessages = [forwardCard];
      }

      const theaterStartMsg: ChatMessage = {
        id: `msg_theater_start_${now}`,
        sender: "system",
        name: "system",
        content: `小劇場：${content}`,
        is_user: false,
        status: "sent",
        createdAt: now + 1,
        updatedAt: now + 1,
      } as any;
      branchMessages.push(theaterStartMsg);

      let targetChatId: string;

      if (theaterNewChatFile.value) {
        const newChatId = `chat_${now}`;
        const newChat: Chat = {
          ...JSON.parse(JSON.stringify(chatData)),
          id: newChatId,
          name: `${chatData.name} [小劇場]`,
          messages: branchMessages,
          lastMessagePreview: `小劇場：${content}`.slice(0, 50),
          messageCount: branchMessages.length,
          createdAt: now,
          updatedAt: now,
          isBranch: true,
        };
        await db.init();
        await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(newChat)));

        if (theaterInheritSummary.value) {
          const srcChatId = deps.currentChatId.value || deps.chatId || "";
          const charIdForEvents =
            deps.characterId || deps.currentCharacter.value?.id || "";
          const allSummaries = await db.getAll<any>(DB_STORES.SUMMARIES);
          const srcSummaries = allSummaries.filter(
            (s: any) => s.chatId === srcChatId,
          );
          await Promise.all(
            srcSummaries.map((s: any) =>
              db.put(DB_STORES.SUMMARIES, {
                ...s,
                id: `${s.id}_theater_${now}`,
                chatId: newChatId,
              }),
            ),
          );
          let eventsLog = await db.get<any>(
            DB_STORES.IMPORTANT_EVENTS,
            srcChatId,
          );
          if (!eventsLog) {
            eventsLog = await db.get<any>(
              DB_STORES.IMPORTANT_EVENTS,
              `${charIdForEvents}_${srcChatId}`,
            );
          }
          if (!eventsLog) {
            eventsLog = await db.get<any>(
              DB_STORES.IMPORTANT_EVENTS,
              charIdForEvents,
            );
          }
          if (eventsLog) {
            await db.put(DB_STORES.IMPORTANT_EVENTS, {
              ...eventsLog,
              id: newChatId,
              chatId: newChatId,
            });
          }
        }

        targetChatId = newChatId;
      } else {
        targetChatId = deps.currentChatId.value || "";
        for (const msg of branchMessages) {
          deps.messages.value.push(msg as any);
        }
        deps.scrollToBottom();
        await deps.saveChat();
        smallTheaterInput.value = "";
        await deps.triggerAIResponse({ theaterNudge: true });
        return;
      }

      await deps.switchChatFile(targetChatId);
      await deps.triggerAIResponse({ theaterNudge: true });
    } else {
      const smallTheaterMessage = {
        id: `msg_theater_${Date.now()}`,
        role: "system",
        content: `小劇場：${content}`,
        timestamp: Date.now(),
      };
      deps.messages.value.push(smallTheaterMessage);
      deps.scrollToBottom();
      await deps.saveChat();
      await deps.triggerAIResponse({ theaterNudge: true });
    }

    smallTheaterInput.value = "";
  }

  function cancelSmallTheater() {
    showSmallTheaterModal.value = false;
    smallTheaterInput.value = "";
  }

  return {
    showSmallTheaterModal,
    smallTheaterInput,
    theaterStep,
    theaterUseBranch,
    theaterInheritHistory,
    theaterInheritSummary,
    theaterNewChatFile,
    theaterForwardedMessages,
    openTheater,
    theaterChooseBranch,
    theaterConfirmOptions,
    theaterConfirmForwarded,
    confirmSmallTheater,
    cancelSmallTheater,
  };
}
