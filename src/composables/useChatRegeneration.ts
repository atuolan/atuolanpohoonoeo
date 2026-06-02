import { ref, type ComputedRef, type Ref } from "vue";
import type { ChatScreenMessage as Message } from "@/types/chatScreen";

export function useChatRegeneration(context: {
  messages: Ref<Message[]>;
  isGenerating: ComputedRef<boolean>;
  lastAIMessage: ComputedRef<Message | null>;
  currentTurnId: Ref<string>;
  saveChat: () => void | Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
  triggerAIResponse: (options?: { skipAutoTrigger?: boolean }) => Promise<void>;
}) {
  const pendingRoundSwipes = ref<Message[][] | null>(null);

  function handleMessageSwipe(id: string, direction: "prev" | "next") {
    const msgIndex = context.messages.value.findIndex((m) => m.id === id);
    if (msgIndex === -1) return;

    const msg = context.messages.value[msgIndex];
    if (!msg.swipes || msg.swipes.length <= 1) return;

    const currentIndex = msg.swipeId ?? 0;
    const newIndex =
      direction === "next"
        ? (currentIndex + 1) % msg.swipes.length
        : currentIndex === 0
          ? msg.swipes.length - 1
          : currentIndex - 1;

    context.messages.value[msgIndex] = {
      ...msg,
      content: msg.swipes[newIndex],
      swipeId: newIndex,
    };

    void context.saveChat();
  }

  async function handleRegenerate(id: string) {
    if (context.isGenerating.value) return;

    const msg = context.messages.value.find((m) => m.id === id);
    if (!msg) return;

    if (msg.turnId) {
      await doRegenerateByTurnId(msg.turnId);
    } else {
      const msgIndex = context.messages.value.findIndex((m) => m.id === id);
      const currentRoundMessages = collectCurrentRoundMessages(msgIndex);
      const firstAI = currentRoundMessages[0];
      if (firstAI) {
        await doRegenerateFromMessage(firstAI);
      }
    }
  }

  async function regenerateLastAIResponse() {
    if (context.isGenerating.value) return;

    const lastMessage = context.messages.value[context.messages.value.length - 1];
    if (!lastMessage) return;

    let lastTurnId: string | undefined;
    for (let i = context.messages.value.length - 1; i >= 0; i--) {
      if (context.messages.value[i].turnId) {
        lastTurnId = context.messages.value[i].turnId;
        break;
      }
    }

    if (lastMessage.role === "user") {
      if (lastTurnId) {
        const userChoice = confirm(
          "當前輪次尚未有 AI 回復。\n\n" +
            "點擊「確定」：重新生成上一輪 AI 回復\n" +
            "點擊「取消」：生成本輪 AI 回復",
        );
        if (userChoice) {
          const lastTurnLastIdx = context.messages.value.reduce(
            (acc, m, i) => (m.turnId === lastTurnId ? i : acc),
            -1,
          );
          if (lastTurnLastIdx !== -1) {
            const removedMsgs = context.messages.value.slice(lastTurnLastIdx + 1);
            context.messages.value = context.messages.value.slice(0, lastTurnLastIdx + 1);
            if (removedMsgs.length > 0) {
              await Promise.all(removedMsgs.map((m) => context.deleteMessage(m.id)));
            }
          }
          await doRegenerateByTurnId(lastTurnId);
        } else {
          context.currentTurnId.value = crypto.randomUUID();
          await context.triggerAIResponse({ skipAutoTrigger: true });
        }
      } else {
        const firstAIOfLastRound = findFirstAIMessageOfLastRound();
        if (firstAIOfLastRound) {
          const userChoice = confirm(
            "當前輪次尚未有 AI 回復。\n\n" +
              "點擊「確定」：重新生成上一輪 AI 回復\n" +
              "點擊「取消」：生成本輪 AI 回復",
          );
          if (userChoice) {
            const lastAIIdx = context.messages.value.reduce(
              (acc, m, i) => (m.role === "ai" || m.role === "system" ? i : acc),
              -1,
            );
            if (lastAIIdx !== -1) {
              const removedMsgsFb = context.messages.value.slice(lastAIIdx + 1);
              context.messages.value = context.messages.value.slice(0, lastAIIdx + 1);
              if (removedMsgsFb.length > 0) {
                await Promise.all(removedMsgsFb.map((m) => context.deleteMessage(m.id)));
              }
            }
            await doRegenerateFromMessage(firstAIOfLastRound);
          } else {
            context.currentTurnId.value = crypto.randomUUID();
            await context.triggerAIResponse({ skipAutoTrigger: true });
          }
        } else {
          context.currentTurnId.value = crypto.randomUUID();
          await context.triggerAIResponse({ skipAutoTrigger: true });
        }
      }
      return;
    }

    if (lastTurnId) {
      await doRegenerateByTurnId(lastTurnId);
    } else {
      const firstAIOfCurrentRound = findFirstAIMessageOfCurrentRound();
      if (firstAIOfCurrentRound) {
        await doRegenerateFromMessage(firstAIOfCurrentRound);
      }
    }
  }

  function findFirstAIMessageOfCurrentRound(): Message | null {
    let lastUserIndex = -1;
    for (let i = context.messages.value.length - 1; i >= 0; i--) {
      if (context.messages.value[i].role === "user") {
        lastUserIndex = i;
        break;
      }
    }

    if (lastUserIndex >= 0) {
      for (let i = lastUserIndex + 1; i < context.messages.value.length; i++) {
        const msg = context.messages.value[i];
        if (msg.role === "ai" || (msg.role === "system" && msg.isTimetravel)) {
          return msg;
        }
      }
    }

    return context.messages.value.find((m) => m.role === "ai") || null;
  }

  function findFirstAIMessageOfLastRound(): Message | null {
    let foundLastUser = false;
    let lastAIIndex = -1;

    for (let i = context.messages.value.length - 1; i >= 0; i--) {
      const msg = context.messages.value[i];
      if (msg.role === "user") {
        if (!foundLastUser) {
          foundLastUser = true;
        } else if (lastAIIndex !== -1) {
          for (let j = i + 1; j < context.messages.value.length; j++) {
            if (context.messages.value[j].role === "ai") {
              return context.messages.value[j];
            }
          }
        }
      } else if (msg.role === "ai" && foundLastUser) {
        lastAIIndex = i;
      }
    }

    if (lastAIIndex !== -1) {
      for (let i = 0; i <= lastAIIndex; i++) {
        if (context.messages.value[i].role === "ai") {
          let hasUserBefore = false;
          for (let j = i - 1; j >= 0; j--) {
            if (context.messages.value[j].role === "user") {
              hasUserBefore = true;
              break;
            }
          }
          if (hasUserBefore || i === 0) {
            for (let j = 0; j < context.messages.value.length; j++) {
              if (context.messages.value[j].role === "user") {
                for (let k = j + 1; k < context.messages.value.length; k++) {
                  if (context.messages.value[k].role === "ai") {
                    return context.messages.value[k];
                  }
                }
              }
            }
          }
        }
      }
    }

    return null;
  }

  function collectCurrentRoundMessages(targetIndex: number): Message[] {
    const roundMessages: Message[] = [];
    for (let i = targetIndex; i < context.messages.value.length; i++) {
      const msg = context.messages.value[i];
      if (msg.role === "user" && i > targetIndex) break;
      if (
        msg.role === "ai" ||
        (msg.role === "system" && (msg.isTimetravel || msg.isAvatarChange))
      ) {
        roundMessages.push(msg);
      }
    }
    return roundMessages;
  }

  function getDisplayedRoundBounds(anchorIndex: number): {
    startIdx: number;
    endIdx: number;
    roundMessages: Message[];
  } | null {
    if (anchorIndex < 0 || anchorIndex >= context.messages.value.length) return null;

    let startIdx = anchorIndex;
    for (let i = anchorIndex - 1; i >= 0; i--) {
      if (context.messages.value[i].role === "user") {
        startIdx = i + 1;
        break;
      }
      startIdx = i;
    }

    let endIdx = context.messages.value.length;
    for (let i = anchorIndex + 1; i < context.messages.value.length; i++) {
      if (context.messages.value[i].role === "user") {
        endIdx = i;
        break;
      }
    }

    const roundMessages = context.messages.value.slice(startIdx, endIdx).filter(
      (msg) =>
        msg.role === "ai" ||
        (msg.role === "system" && (msg.isTimetravel || msg.isAvatarChange)),
    );

    return { startIdx, endIdx, roundMessages };
  }

  function findRoundSwipeCarrier(roundMessages: Message[]): Message | null {
    for (let i = roundMessages.length - 1; i >= 0; i--) {
      if (roundMessages[i].roundSwipes) return roundMessages[i];
    }
    return null;
  }

  async function doRegenerateByTurnId(turnId: string) {
    const currentRoundMessages = context.messages.value.filter(
      (m) => m.turnId === turnId,
    );
    if (currentRoundMessages.length === 0) return;

    const carrier = findRoundSwipeCarrier(currentRoundMessages);
    const existingSwipes: Message[][] = carrier?.roundSwipes
      ? [...carrier.roundSwipes]
      : [];
    const existingSwipeId = carrier?.roundSwipeId ?? -1;

    const savedRound: Message[] = currentRoundMessages.map((m) => {
      const clone = { ...m };
      delete clone.roundSwipes;
      delete clone.roundSwipeId;
      return clone;
    });

    if (existingSwipes.length === 0) {
      existingSwipes.push(savedRound);
    } else if (existingSwipeId >= 0 && existingSwipeId < existingSwipes.length) {
      existingSwipes[existingSwipeId] = savedRound;
    } else {
      existingSwipes.push(savedRound);
    }

    pendingRoundSwipes.value = existingSwipes;

    const idsToRemove = currentRoundMessages.map((m) => m.id);
    context.messages.value = context.messages.value.filter((m) => m.turnId !== turnId);
    await Promise.all(idsToRemove.map((id) => context.deleteMessage(id)));

    context.currentTurnId.value = crypto.randomUUID();
    await context.triggerAIResponse({ skipAutoTrigger: true });
  }

  async function doRegenerateFromMessage(targetAIMessage: Message) {
    const targetIndex = context.messages.value.findIndex(
      (m) => m.id === targetAIMessage.id,
    );
    if (targetIndex === -1) return;

    const currentRoundMessages = collectCurrentRoundMessages(targetIndex);
    if (currentRoundMessages.length === 0) {
      console.warn("[useChatRegeneration] 沒有 AI 訊息需要重新生成");
      return;
    }

    const carrier = findRoundSwipeCarrier(currentRoundMessages);
    const existingSwipes: Message[][] = carrier?.roundSwipes
      ? [...carrier.roundSwipes]
      : [];
    const existingSwipeId = carrier?.roundSwipeId ?? -1;

    const savedRound: Message[] = currentRoundMessages.map((m) => {
      const clone = { ...m };
      delete clone.roundSwipes;
      delete clone.roundSwipeId;
      return clone;
    });

    if (existingSwipes.length === 0) {
      existingSwipes.push(savedRound);
    } else if (existingSwipeId >= 0 && existingSwipeId < existingSwipes.length) {
      existingSwipes[existingSwipeId] = savedRound;
    } else {
      existingSwipes.push(savedRound);
    }

    console.log(
      `[useChatRegeneration] 重新生成：保存輪次（共 ${existingSwipes.length} 個候選），刪除 ${currentRoundMessages.length} 條 AI 訊息`,
    );

    pendingRoundSwipes.value = existingSwipes;

    const idsToDelete = new Set(currentRoundMessages.map((m) => m.id));
    context.messages.value = context.messages.value.filter((m) => !idsToDelete.has(m.id));
    await Promise.all([...idsToDelete].map((id) => context.deleteMessage(id)));

    context.currentTurnId.value = crypto.randomUUID();
    await context.triggerAIResponse({ skipAutoTrigger: true });
  }

  function attachPendingRoundSwipes(targetTurnId?: string) {
    if (!pendingRoundSwipes.value) return;

    const roundMessages = (
      targetTurnId
        ? context.messages.value.filter((m) => m.turnId === targetTurnId)
        : context.currentTurnId.value
          ? context.messages.value.filter((m) => m.turnId === context.currentTurnId.value)
          : (() => {
              const firstAI = findFirstAIMessageOfCurrentRound();
              if (!firstAI) return [];
              const idx = context.messages.value.findIndex((m) => m.id === firstAI.id);
              return idx === -1 ? [] : collectCurrentRoundMessages(idx);
            })()
    ).map((m) => {
      const clone = { ...m };
      delete clone.roundSwipes;
      delete clone.roundSwipeId;
      return clone;
    });

    const lastAI =
      [...context.messages.value]
        .reverse()
        .find(
          (m) =>
            m.role === "ai" &&
            (!targetTurnId || m.turnId === targetTurnId),
        ) || null;

    if (lastAI) {
      if (roundMessages.length > 0) {
        pendingRoundSwipes.value.push(roundMessages);
      }

      lastAI.roundSwipes = pendingRoundSwipes.value;
      lastAI.roundSwipeId = pendingRoundSwipes.value.length - 1;
      console.log(
        `[useChatRegeneration] 附加 roundSwipes：${pendingRoundSwipes.value.length} 個候選，當前索引 ${lastAI.roundSwipeId}`,
      );
    }

    pendingRoundSwipes.value = null;
  }

  function handleRoundSwipe(lastAIMessageId: string, direction: "prev" | "next") {
    const carrierIndex = context.messages.value.findIndex(
      (m) => m.id === lastAIMessageId,
    );
    if (carrierIndex === -1) return;

    const carrier = context.messages.value[carrierIndex];
    if (!carrier.roundSwipes || carrier.roundSwipes.length <= 1) return;

    const currentIdx = carrier.roundSwipeId ?? 0;
    const newIdx =
      direction === "next"
        ? (currentIdx + 1) % carrier.roundSwipes.length
        : currentIdx === 0
          ? carrier.roundSwipes.length - 1
          : currentIdx - 1;

    const targetRound = carrier.roundSwipes[newIdx];
    if (!targetRound || targetRound.length === 0) return;

    const displayedRound = getDisplayedRoundBounds(carrierIndex);
    if (displayedRound) {
      const currentRound = displayedRound.roundMessages.map((m) => {
        const clone = { ...m };
        delete clone.roundSwipes;
        delete clone.roundSwipeId;
        return clone;
      });
      carrier.roundSwipes[currentIdx] = currentRound;
    }

    const roundBounds = displayedRound;
    if (!roundBounds) return;
    const { startIdx, endIdx } = roundBounds;

    const newMessages = targetRound.map((m, i) => {
      const clone = { ...m };
      if (i === targetRound.length - 1) {
        clone.roundSwipes = carrier.roundSwipes;
        clone.roundSwipeId = newIdx;
      }
      return clone;
    });

    context.messages.value.splice(startIdx, endIdx - startIdx, ...newMessages);

    const restoredTurnId = newMessages.find((m) => m.turnId)?.turnId;
    context.currentTurnId.value = restoredTurnId || "";

    void context.saveChat();
  }

  function clearRoundSwipes() {
    for (const msg of context.messages.value) {
      if (msg.roundSwipes) {
        delete msg.roundSwipes;
        delete msg.roundSwipeId;
      }
    }
  }

  async function continueGeneration() {
    if (!context.lastAIMessage.value || context.isGenerating.value) return;

    clearSwipesOnLastAIMessage();

    const continuePrompt: Message = {
      id: `msg_continue_${Date.now()}`,
      role: "user",
      content: "[繼續]",
      timestamp: Date.now(),
      isContinuePrompt: true,
    };
    context.messages.value.push(continuePrompt);

    await context.triggerAIResponse();
  }

  function clearSwipesOnLastAIMessage() {
    const lastAI = context.lastAIMessage.value;
    if (!lastAI) return;

    const msgIndex = context.messages.value.findIndex((m) => m.id === lastAI.id);
    if (msgIndex !== -1) {
      const msg = context.messages.value[msgIndex];
      context.messages.value[msgIndex] = {
        ...msg,
        swipes: undefined,
        swipeId: undefined,
      };
    }
  }

  return {
    pendingRoundSwipes,
    handleMessageSwipe,
    handleRegenerate,
    regenerateLastAIResponse,
    findFirstAIMessageOfCurrentRound,
    collectCurrentRoundMessages,
    attachPendingRoundSwipes,
    handleRoundSwipe,
    clearRoundSwipes,
    continueGeneration,
    clearSwipesOnLastAIMessage,
  };
}
