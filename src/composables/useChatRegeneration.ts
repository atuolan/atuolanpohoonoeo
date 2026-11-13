import { ref, type ComputedRef, type Ref } from "vue";
import type { ChatScreenMessage as Message } from "@/types/chatScreen";

/**
 * 整輪翻頁鈕只畫在一般角色泡泡上：飲食通知、骰子結果、日記提示這類 role 也是 ai，
 * 但畫成系統小字，掛在它們上面翻頁鈕就不見了
 */
export function canCarryRoundSwipes(m: Message): boolean {
  return (
    m.role === "ai" &&
    !m.isSystemNotification &&
    !m.isTransactionClaimNotice &&
    !m.isDiceRoll &&
    !m.diaryNoticeId &&
    !m.isDollTouch &&
    !m.roundTableCard
  );
}

/** 小劇場指令（system「小劇場：…」）：AI 要接著它回覆，跟用戶訊息一樣是一輪的開頭 */
function isTheaterStartMessage(m: Pick<Message, "role" | "content">): boolean {
  return m.role === "system" && typeof m.content === "string" && m.content.startsWith("小劇場：");
}

/** 一輪回覆從這種訊息之後開始：用戶訊息、小劇場指令 */
function isRoundStart(m: Message): boolean {
  return m.role === "user" || isTheaterStartMessage(m);
}

/** 一輪回覆裡會被重新生成／翻頁換掉的訊息 */
function isRoundMessage(m: Message): boolean {
  return (
    m.role === "ai" ||
    (m.role === "system" && !!(m.isTimetravel || m.isAvatarChange || m.isCalendarEvent))
  );
}

function stripRoundSwipes(m: Message): Message {
  const clone = { ...m };
  delete clone.roundSwipes;
  delete clone.roundSwipeId;
  return clone;
}

type RegenerateTriggerOptions = {
  skipAutoTrigger?: boolean;
  theaterNudge?: boolean;
  theaterPhoneScript?: boolean;
};

export function useChatRegeneration(context: {
  messages: Ref<Message[]>;
  isGenerating: ComputedRef<boolean>;
  lastAIMessage: ComputedRef<Message | null>;
  currentTurnId: Ref<string>;
  saveChat: () => void | Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
  triggerAIResponse: (options?: RegenerateTriggerOptions) => Promise<void>;
  /** 一輪回覆被換下（重新生成、換候選）時：收回那一輪做過的事，換回來的再做一次（例如加的行程） */
  onRoundReplaced?: (removed: Message[], restored: Message[]) => void | Promise<void>;
}) {
  const pendingRoundSwipes = ref<Message[][] | null>(null);

  /**
   * 重新生成的回覆會接在目前聊天最後面。最近一則「一輪的開頭」是小劇場指令時，
   * 這一輪就是在回小劇場，要跟第一次生成一樣帶上小劇場的提示，不然重 roll 會跑回正文。
   */
  function triggerOptionsForNextReply(): RegenerateTriggerOptions {
    for (let i = context.messages.value.length - 1; i >= 0; i--) {
      const m = context.messages.value[i];
      if (!isRoundStart(m)) continue;
      if (!isTheaterStartMessage(m)) break;
      return {
        skipAutoTrigger: true,
        theaterNudge: true,
        ...(m.theaterPhoneScript ? { theaterPhoneScript: true } : {}),
      };
    }
    return { skipAutoTrigger: true };
  }

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

    if (isRoundStart(lastMessage)) {
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
          await context.triggerAIResponse(triggerOptionsForNextReply());
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
              (acc, m, i) =>
                m.role === "ai" || (m.role === "system" && !isTheaterStartMessage(m)) ? i : acc,
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
            await context.triggerAIResponse(triggerOptionsForNextReply());
          }
        } else {
          context.currentTurnId.value = crypto.randomUUID();
          await context.triggerAIResponse(triggerOptionsForNextReply());
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
      if (isRoundStart(context.messages.value[i])) {
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
      if (isRoundStart(msg)) {
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
      if (isRoundStart(msg) && i > targetIndex) break;
      if (isRoundMessage(msg)) {
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
      if (isRoundStart(context.messages.value[i])) {
        startIdx = i + 1;
        break;
      }
      startIdx = i;
    }

    let endIdx = context.messages.value.length;
    for (let i = anchorIndex + 1; i < context.messages.value.length; i++) {
      if (isRoundStart(context.messages.value[i])) {
        endIdx = i;
        break;
      }
    }

    // 有 turnId 時只算同一輪的：別輪的回覆（turnId 不同）不能被這一輪的翻頁換掉
    const anchorTurnId = context.messages.value[anchorIndex].turnId;
    const roundMessages = context.messages.value.slice(startIdx, endIdx).filter(
      (msg) =>
        isRoundMessage(msg) && (!anchorTurnId || !msg.turnId || msg.turnId === anchorTurnId),
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
    await context.onRoundReplaced?.(currentRoundMessages, []);

    const idsToRemove = currentRoundMessages.map((m) => m.id);
    context.messages.value = context.messages.value.filter((m) => m.turnId !== turnId);
    await Promise.all(idsToRemove.map((id) => context.deleteMessage(id)));

    context.currentTurnId.value = crypto.randomUUID();
    await context.triggerAIResponse(triggerOptionsForNextReply());
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
    await context.onRoundReplaced?.(currentRoundMessages, []);

    const idsToDelete = new Set(currentRoundMessages.map((m) => m.id));
    context.messages.value = context.messages.value.filter((m) => !idsToDelete.has(m.id));
    await Promise.all([...idsToDelete].map((id) => context.deleteMessage(id)));

    context.currentTurnId.value = crypto.randomUUID();
    await context.triggerAIResponse(triggerOptionsForNextReply());
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

    const inTurn = (m: Message) => !targetTurnId || m.turnId === targetTurnId;
    const reversed = [...context.messages.value].reverse();
    const lastAI =
      reversed.find((m) => canCarryRoundSwipes(m) && inTurn(m)) ||
      reversed.find((m) => m.role === "ai" && inTurn(m)) ||
      null;

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
    if (!displayedRound) return;
    const { startIdx, endIdx, roundMessages } = displayedRound;
    carrier.roundSwipes[currentIdx] = roundMessages.map(stripRoundSwipes);

    let carrierIdx = -1;
    for (let i = targetRound.length - 1; i >= 0; i--) {
      if (canCarryRoundSwipes(targetRound[i])) {
        carrierIdx = i;
        break;
      }
    }
    if (carrierIdx === -1) carrierIdx = targetRound.length - 1;

    const newMessages = targetRound.map((m, i) => {
      const clone = { ...m };
      if (i === carrierIdx) {
        clone.roundSwipes = carrier.roundSwipes;
        clone.roundSwipeId = newIdx;
      }
      return clone;
    });

    // 只換掉這一輪自己的訊息。同一段裡的其他訊息（小劇場指令、轉發的聊天記錄、別輪的回覆）
    // 留在原位：整段換掉會連它們一起從 IDB 刪掉，小劇場指令一不見，再重 roll 就接著正文寫了
    const roundIds = new Set(roundMessages.map((m) => m.id));
    const windowMessages = context.messages.value.slice(startIdx, endIdx);
    const firstRoundPos = windowMessages.findIndex((m) => roundIds.has(m.id));
    const insertPos = firstRoundPos === -1 ? windowMessages.length : firstRoundPos;
    const keptBefore = windowMessages.slice(0, insertPos);
    const keptAfter = windowMessages.slice(insertPos).filter((m) => !roundIds.has(m.id));
    const removedMessages = windowMessages.filter((m) => roundIds.has(m.id));
    context.messages.value.splice(
      startIdx,
      endIdx - startIdx,
      ...keptBefore,
      ...newMessages,
      ...keptAfter,
    );

    const restoredTurnId = newMessages.find((m) => m.turnId)?.turnId;
    context.currentTurnId.value = restoredTurnId || "";
    void context.onRoundReplaced?.(removedMessages, newMessages);

    // 被換下的候選必須從 IDB 刪除：saveChat 會保留「載入後才建立」的訊息（視為背景追加），
    // 分頁模式下也只做 upsert，若不刪除，重新載入後各候選會同時出現、分散成多組訊息。
    const newIds = new Set(newMessages.map((m) => m.id));
    const staleIds = removedMessages.map((m) => m.id).filter((id) => !newIds.has(id));
    void Promise.all(staleIds.map((id) => context.deleteMessage(id)))
      .catch((error) => console.warn("[useChatRegeneration] 刪除舊候選訊息失敗:", error))
      .finally(() => void context.saveChat());
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
