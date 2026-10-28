import { ref, watch, type Ref, type ComputedRef } from "vue";
import { OpenAICompatibleClient } from "@/api/OpenAICompatible";
import { pickGenerationToggles } from "@/utils/generationToggles";
import { PromptBuilder } from "@/engine/prompt/PromptBuilder";
import { parseGroupChatResponse } from "@/services/ResponseParser";
import type { ChatMessage, GroupMember, MultiCharMember } from "@/types/chat";
import type { Lorebook } from "@/types/worldinfo";
import type { RegexScript } from "@/types/character";
import {
  applyPromptRegexToHistory,
  applyWorldInfoRegexToLorebooks,
  chatMessageRole,
} from "@/services/promptRegex";
import {
  getGroupMemberAvatarUrl,
  getGroupMemberDisplayName,
  toPromptGroupMember,
  withLiveSubCharSnapshot,
} from "@/utils/groupMembers";
import {
  useAIGenerationStore,
  useCharactersStore,
  useLorebooksStore,
  usePromptManagerStore,
  useSettingsStore,
} from "@/stores";
import { useChatVariablesStore } from "@/stores/chatVariables";
import { useUserStore } from "@/stores/user";
import { convertToStorableMessage } from "@/utils/chatMessageMapping";

interface Message {
  id: string;
  role: "user" | "ai" | "system";
  content: string;
  timestamp: number;
  [key: string]: any;
}

interface GroupCallParticipant {
  characterId: string;
  name: string;
  avatar?: string;
  isSpeaking?: boolean;
}

interface GroupCallMessage {
  type: "voice" | "system" | "user";
  senderName?: string;
  content: string;
  timestamp: number;
  /** 只給用戶看的提示（失敗、沒人接話），不帶進提示詞 */
  localHint?: boolean;
  /** 這輪失敗了，按「再試一次」用同一種方式重新回覆 */
  retryTurn?: GroupCallTurn;
}

/** 這一輪群通話回覆是怎麼觸發的 */
type GroupCallTurn = "open" | "reply" | "autoTalk";

/** 這輪 AI 有回東西、卻沒有任何角色開口時，告訴用戶大概發生什麼事 */
function describeSilentTurn(rawContent: string, finishReason?: string): string {
  if (finishReason === "length") {
    return "回覆寫到長度上限被切掉，角色還沒開口。可以到設定 › 主要模型調高「最大回覆長度」";
  }
  if (rawContent.trim()) {
    return "這輪回覆沒有照通話格式（可能只寫了思考過程，或中途被截斷），沒有人開口";
  }
  return "這輪沒有人接話";
}

/** 通話前帶進提示詞的群聊訊息數，讓角色記得剛剛在聊什麼 */
const CALL_CONTEXT_MESSAGE_LIMIT = 20;

/**
 * 群通話功能
 * 從 ChatScreen.vue 抽取的獨立 composable
 */
export function useChatGroupCall(deps: {
  messages: Ref<Message[]>;
  currentChatId: Ref<string | null>;
  currentChatData: Ref<any>;
  isGroupChat: ComputedRef<boolean>;
  isGenerating: ComputedRef<boolean>;
  groupMetadata: ComputedRef<any>;
  effectivePersona: ComputedRef<any>;
  chatEnableRealTimeAwareness: Ref<boolean>;
  getChatNow?: () => Date;
  characterName: string;
  characterAvatar: string;
  scrollToBottom: () => void;
  saveChatImmediate: () => Promise<void>;
  applyAIOutputRegex: (content: string) => string;
  /** 跟聊天同一組正則腳本，組通話提示詞時套用「僅提示詞」腳本 */
  getActiveRegexScripts?: () => RegexScript[];
  getGroupMemberIdByName: (name: string) => string | undefined;
}) {
  const aiGenerationStore = useAIGenerationStore();
  const settingsStore = useSettingsStore();
  const promptManagerStore = usePromptManagerStore();
  const charactersStore = useCharactersStore();
  const lorebooksStore = useLorebooksStore();
  const userStore = useUserStore();

  // 群通話狀態
  const showGroupCallModal = ref(false);
  const groupCallStartedAt = ref(0);
  const groupCallParticipants = ref<GroupCallParticipant[]>([]);
  const groupCallMessages = ref<GroupCallMessage[]>([]);
  /** 角色們說話時用戶插話：訊息先放進通話，這輪說完馬上接著回 */
  let replyQueued = false;

  watch(deps.isGenerating, (generating) => {
    if (generating || !replyQueued) return;
    replyQueued = false;
    if (showGroupCallModal.value) void triggerGroupCallAIResponse("reply");
  });

  /** 群裡可以進通話的成員：普通群看成員（含虛擬成員），多人卡看子角色 */
  function listCallMembers(): GroupCallParticipant[] {
    const meta = deps.groupMetadata.value;
    if (!meta) return [];
    if (meta.isMultiCharCard) {
      return (meta.multiCharMembers || []).map((m: MultiCharMember) => ({
        characterId: m.id,
        name: m.name,
        avatar: m.avatar || "",
        isSpeaking: false,
      }));
    }
    return (meta.members || []).map((m: GroupMember) => ({
      characterId: m.characterId,
      name: getGroupMemberDisplayName(m, charactersStore.characters),
      avatar: getGroupMemberAvatarUrl(m, charactersStore.characters),
      isSpeaking: false,
    }));
  }

  /** 發起群通話 */
  function startGroupCall() {
    if (!deps.isGroupChat.value || !deps.groupMetadata.value) return;

    console.log("[GroupCall] 發起群通話");

    groupCallStartedAt.value = Date.now();
    groupCallMessages.value = [];

    groupCallParticipants.value = listCallMembers();

    groupCallMessages.value.push({
      type: "system",
      content: "群通話已開始",
      timestamp: Date.now(),
    });

    if (deps.currentChatData.value?.groupMetadata) {
      deps.currentChatData.value.groupMetadata.callState = {
        isActive: true,
        initiatorCharacterId: null,
        startedAt: groupCallStartedAt.value,
        participants: groupCallParticipants.value.map((p) => ({
          characterId: p.characterId,
          joinedAt: Date.now(),
        })),
      };
    }

    showGroupCallModal.value = true;

    // 角色們接起電話先開口，不然通話一開始是空的
    void triggerGroupCallAIResponse("open");
  }

  /** 群通話掛斷 */
  async function handleGroupCallHangUp() {
    console.log("[GroupCall] 群通話掛斷");

    const duration = Math.floor(
      (Date.now() - groupCallStartedAt.value) / 1000,
    );

    const callHistoryMessage: Message = {
      id: crypto.randomUUID(),
      role: "system",
      content: `群通話記錄 - 時長 ${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, "0")}`,
      timestamp: groupCallStartedAt.value,
      senderCharacterId: undefined,
      isGroupCallHistory: true,
      groupCallHistoryData: {
        groupName:
          deps.currentChatData.value?.groupMetadata?.groupName || "群組",
        participants: groupCallParticipants.value.map((p) => ({
          characterId: p.characterId,
          name: p.name,
          avatar: p.avatar,
        })),
        messages: groupCallMessages.value.map((msg) => ({
          type: msg.type,
          senderName: msg.senderName,
          content: msg.content,
          timestamp: msg.timestamp,
        })),
        startedAt: groupCallStartedAt.value,
        endedAt: Date.now(),
      },
    };

    deps.messages.value.push(callHistoryMessage);

    if (deps.currentChatData.value?.groupMetadata) {
      deps.currentChatData.value.groupMetadata.callState = undefined;
    }

    showGroupCallModal.value = false;
    replyQueued = false;
    groupCallParticipants.value = [];
    groupCallMessages.value = [];
    groupCallStartedAt.value = 0;

    await deps.saveChatImmediate();
  }

  /** 處理群通話中角色加入 */
  function handleGroupCallJoin(characterId: string, characterName: string) {
    const existing = groupCallParticipants.value.find(
      (p) => p.characterId === characterId,
    );
    if (existing) return;

    const member = listCallMembers().find((p) => p.characterId === characterId);
    groupCallParticipants.value.push({
      characterId,
      name: characterName,
      avatar: member?.avatar || "",
      isSpeaking: false,
    });

    groupCallMessages.value.push({
      type: "system",
      content: `${characterName} 加入了通話`,
      timestamp: Date.now(),
    });
  }

  /** 處理群通話中角色離開 */
  function handleGroupCallLeave(
    characterId: string,
    characterName: string,
    reason?: string,
  ) {
    const index = groupCallParticipants.value.findIndex(
      (p) => p.characterId === characterId,
    );
    if (index !== -1) {
      groupCallParticipants.value.splice(index, 1);
    }

    let leaveText = `${characterName} 離開了通話`;
    if (reason === "生氣") {
      leaveText = `${characterName} 生氣掛斷了通話`;
    } else if (reason === "難過") {
      leaveText = `${characterName} 難過地離開了通話`;
    } else if (reason) {
      leaveText = `${characterName} 離開了通話：${reason}`;
    }

    groupCallMessages.value.push({
      type: "system",
      content: leaveText,
      timestamp: Date.now(),
    });
  }

  /** 添加群通話語音訊息 */
  function addGroupCallVoiceMessage(senderName: string, content: string) {
    groupCallParticipants.value.forEach((p) => {
      p.isSpeaking = p.name === senderName;
    });

    groupCallMessages.value.push({
      type: "voice",
      senderName,
      content,
      timestamp: Date.now(),
    });

    setTimeout(() => {
      const participant = groupCallParticipants.value.find(
        (p) => p.name === senderName,
      );
      if (participant) {
        participant.isSpeaking = false;
      }
    }, 2000);
  }

  /** 處理群通話中用戶發送訊息 */
  async function handleGroupCallSendMessage(content: string) {
    if (!content.trim()) return;

    groupCallMessages.value.push({
      type: "user",
      content,
      timestamp: Date.now(),
    });

    if (deps.isGenerating.value) {
      replyQueued = true;
      return;
    }
    await triggerGroupCallAIResponse("reply");
  }

  /** 失敗提示上的「再試一次」：拿掉提示，用同一種方式重新回覆 */
  async function retryGroupCallTurn(index: number) {
    const hint = groupCallMessages.value[index];
    if (!hint?.retryTurn || deps.isGenerating.value) return;
    groupCallMessages.value.splice(index, 1);
    await triggerGroupCallAIResponse(hint.retryTurn);
  }

  /** 處理群通話自動對話 */
  async function handleGroupCallAutoTalk() {
    if (!showGroupCallModal.value || deps.isGenerating.value) return;

    console.log("[GroupCall] 群通話自動對話觸發");

    await triggerGroupCallAIResponse("autoTalk");
  }

  /** 通話開始前最近的群聊訊息（純文字對話），轉成提示詞歷史 */
  function buildPreCallContext(): ChatMessage[] {
    const startedAt = groupCallStartedAt.value || Date.now();
    return deps.messages.value
      .filter(
        (m) =>
          (m.role === "user" || m.role === "ai") &&
          !m.isGroupCallHistory &&
          !m.isStreaming &&
          typeof m.content === "string" &&
          m.content.trim() &&
          m.timestamp <= startedAt,
      )
      .slice(-CALL_CONTEXT_MESSAGE_LIMIT)
      .map((m) => ({
        ...convertToStorableMessage(m, deps.characterName),
        // 通話只需要文字脈絡，不重送歷史圖片
        imageData: undefined,
        imageMimeType: undefined,
      }));
  }

  /** 每輪都放在歷史最後的通話狀態說明，提醒模型現在是在講電話、要接著往下聊 */
  function buildCallStateNote(turn: GroupCallTurn, userName: string): string {
    const inCall = groupCallParticipants.value.map((p) => p.name);
    const notInCall = listCallMembers()
      .map((p) => p.name)
      .filter((name) => !inCall.includes(name));
    const groupName = deps.groupMetadata.value?.groupName || "群組";

    const turnHint =
      turn === "open"
        ? `${userName} 剛打了這通群通話，大家剛接起來：先打招呼，再接著剛才群裡的話題聊。`
        : turn === "autoTalk"
          ? `${userName} 有一陣子沒說話了：角色們自己接著聊下去，開新話題或追問 ${userName}，不要冷場。`
          : `接著 ${userName} 剛剛說的話回應，再把話題往前推進。`;

    return [
      `【群通話進行中】這是「${groupName}」的語音群通話，大家是用嘴巴講話，不是打字。`,
      `目前在通話裡：${inCall.length ? inCall.join("、") : "（沒有角色）"}，還有 ${userName}。`,
      notInCall.length
        ? `不在通話裡的成員：${notInCall.join("、")}。他們想中途加入就用 <msg name="角色名"><join-call/>加入時說的話</msg>。`
        : "",
      turnHint,
      `- 每句話都用 <msg name="角色名">說的話</msg>，一句一條；口語、短句，角色之間可以互相接話、打斷、吐槽。`,
      `- 只有在通話裡的角色能說話；想離開用 <msg name="角色名"><leave-call reason="原因"/>離開前說的話</msg>。`,
      `- 不要重複前面已經講過的內容；不要再發 <group-call-request> 或 <call-response>，也不要用表情包、紅包、私信等打字功能。`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  /** 把一輪 AI 輸出放進通話：只保留說話、加入/離開通話，其他打字功能忽略 */
  function applyGroupCallResponse(content: string) {
    const parsed = parseGroupChatResponse(content);

    for (const parsedMsg of parsed.messages) {
      const senderName = parsedMsg.senderName || "";
      // 沒有說話者的是解析不出標籤時整段原文（常是思考過程或被截斷的回覆），不能當成有人在講
      if (!senderName) continue;
      const charId = senderName
        ? deps.getGroupMemberIdByName(senderName)
        : undefined;

      if (parsedMsg.isGroupCallResponse) {
        if (parsedMsg.groupCallResponseAction === "join") {
          if (charId) handleGroupCallJoin(charId, senderName);
        } else if (parsedMsg.groupCallResponseAction === "decline") {
          groupCallMessages.value.push({
            type: "system",
            content: `${senderName} 拒絕加入通話${parsedMsg.groupCallDeclineReason ? `：${parsedMsg.groupCallDeclineReason}` : ""}`,
            timestamp: Date.now(),
          });
        }
        continue;
      }
      if (parsedMsg.isLeaveCall) {
        if (parsedMsg.content) {
          addGroupCallVoiceMessage(senderName, parsedMsg.content);
        }
        if (charId)
          handleGroupCallLeave(charId, senderName, parsedMsg.leaveCallReason);
        continue;
      }
      if (
        parsedMsg.isGroupCallRequest ||
        parsedMsg.isRecall ||
        parsedMsg.isPrivateMessage ||
        parsedMsg.isGroupAction ||
        parsedMsg.isRedpacketClaim ||
        parsedMsg.isDiceRoll
      ) {
        continue;
      }

      const spoken =
        parsedMsg.isVoice && parsedMsg.voiceContent
          ? parsedMsg.voiceContent
          : parsedMsg.isStickerMsg && parsedMsg.stickerMeaning
            ? `[表情：${parsedMsg.stickerMeaning}]`
            : parsedMsg.content;

      // 有人開口就代表他在通話裡（含只寫 <join-call/> 的情況）
      if (
        charId &&
        (spoken || parsedMsg.isJoinCall) &&
        !groupCallParticipants.value.some((p) => p.characterId === charId)
      ) {
        handleGroupCallJoin(charId, senderName);
      }
      if (spoken) addGroupCallVoiceMessage(senderName, spoken);
    }
  }

  /** 群通話專用的 AI 回覆函數 */
  async function triggerGroupCallAIResponse(turn: GroupCallTurn) {
    if (
      !deps.currentChatId.value ||
      !deps.isGroupChat.value ||
      !deps.groupMetadata.value
    )
      return;
    if (deps.isGenerating.value) return;

    const startResult = aiGenerationStore.startGeneration(
      deps.currentChatId.value,
      "chat",
    );
    if (!startResult.success) {
      console.warn("[GroupCall] 生成任務啟動失敗:", startResult.error);
      groupCallMessages.value.push({
        type: "system",
        content: `沒辦法回覆：${startResult.error || "生成任務啟動失敗"}`,
        localHint: true,
        timestamp: Date.now(),
      });
      return;
    }

    try {
      const userName = userStore.currentPersona?.name || "User";
      const systemEntry = (
        id: string,
        content: string,
        at: number,
      ): ChatMessage => ({
        id,
        sender: "system",
        // 留空：PromptBuilder 只幫有名字的非用戶訊息加 [名字] 前綴
        name: "",
        content,
        is_user: false,
        status: "sent" as const,
        createdAt: at,
        updatedAt: at,
      });

      const callHistory: ChatMessage[] = [
        ...buildPreCallContext(),
        systemEntry(
          "call_start",
          "（以下是群通話中的語音對話）",
          groupCallStartedAt.value || Date.now(),
        ),
        ...groupCallMessages.value
          .filter((m) => !m.localHint)
          .map((m, idx): ChatMessage => {
            if (m.type === "system") {
              return systemEntry(
                `call_${idx}`,
                `（通話：${m.content}）`,
                m.timestamp,
              );
            }
            return {
              id: `call_${idx}`,
              sender: m.type === "user" ? "user" : "assistant",
              name: m.type === "user" ? userName : m.senderName || "角色",
              content: m.content,
              is_user: m.type === "user",
              status: "sent" as const,
              createdAt: m.timestamp,
              updatedAt: m.timestamp,
            };
          }),
        systemEntry(
          "call_state",
          buildCallStateNote(turn, userName),
          Date.now(),
        ),
      ];

      const meta = deps.groupMetadata.value;
      const isMultiCharCard = !!meta.isMultiCharCard;

      // 有角色卡的成員（世界書從這些卡讀）。多人卡只有卡本身；普通群是還在群裡、角色卡還在的成員
      const memberCharacters = isMultiCharCard
        ? charactersStore.characters.filter(
            (c) => c.id === deps.currentChatData.value?.characterId,
          )
        : (meta.members as GroupMember[])
            .filter((m) => !m.isVirtual)
            .map((m) =>
              charactersStore.characters.find((c) => c.id === m.characterId),
            )
            .filter((c): c is NonNullable<typeof c> => c !== undefined);

      if (memberCharacters.length === 0) {
        console.error("[GroupCall] 找不到任何群成員角色");
        groupCallMessages.value.push({
          type: "system",
          content: "找不到可用的角色卡，這通電話沒辦法回覆",
          timestamp: Date.now(),
        });
        return;
      }

      const linkedLorebooks: Lorebook[] = [];
      for (const char of memberCharacters) {
        if (char.lorebookIds?.length) {
          for (const id of char.lorebookIds) {
            const lb = lorebooksStore.lorebooks.find((l: any) => l.id === id);
            if (lb && !linkedLorebooks.find((l) => l.id === lb.id)) {
              linkedLorebooks.push(lb);
            }
          }
        }
      }
      const globalLorebooks = lorebooksStore.lorebooks.filter(
        (lb: any) => lb.isGlobal,
      );
      for (const lb of globalLorebooks) {
        if (!linkedLorebooks.find((l) => l.id === lb.id)) {
          linkedLorebooks.push(lb);
        }
      }

      if (deps.groupMetadata.value?.lorebookIds?.length) {
        for (const lorebookId of deps.groupMetadata.value.lorebookIds) {
          if (!linkedLorebooks.find((l) => l.id === lorebookId)) {
            const lb = lorebooksStore.lorebooks.find(
              (l: any) => l.id === lorebookId,
            );
            if (lb) {
              linkedLorebooks.push(lb);
            }
          }
        }
      }

      await promptManagerStore.loadConfig();

      const groupMembersData = isMultiCharCard
        ? undefined
        : (meta.members as GroupMember[]).map((m) =>
            toPromptGroupMember(m, charactersStore.characters),
          );
      const multiCharMembers = isMultiCharCard
        ? (meta.multiCharMembers || []).map((m: MultiCharMember) =>
            withLiveSubCharSnapshot(m, charactersStore.characters),
          )
        : undefined;

      const regexContext = {
        scripts: deps.getActiveRegexScripts?.() ?? [],
        characterName: memberCharacters[0].data.name,
        userName,
      };

      const builder = new PromptBuilder({
        character: memberCharacters[0],
        lorebooks: applyWorldInfoRegexToLorebooks(linkedLorebooks, regexContext),
        messages: applyPromptRegexToHistory(callHistory, chatMessageRole, regexContext),
        settings: {
          maxContextLength:
            settingsStore.generation.maxContextLength || 200000,
          maxResponseLength: settingsStore.generation.maxTokens || 200000,
          temperature: settingsStore.generation.temperature,
          topP: settingsStore.generation.topP,
          frequencyPenalty: 0,
          presencePenalty: 0,
          repetitionPenalty: 1,
          stopSequences: [],
          streaming: true,
          useStreamingWindow: settingsStore.generation.useStreamingWindow,
          ...pickGenerationToggles(settingsStore.generation),
        },
        userName,
        userPersona: deps.effectivePersona.value?.description,
        promptManagerConfig: promptManagerStore.config,
        ...(deps.currentChatData.value
          ? useChatVariablesStore().presetForChat(
              deps.currentChatData.value.id,
              deps.currentChatData.value,
            )
          : {}),
        groupChatMode: true,
        groupMembers: groupMembersData,
        isMultiCharCard,
        multiCharMembers,
        groupName: meta.groupName,
        groupCallMode: true,
        enableRealTimeAwareness: deps.chatEnableRealTimeAwareness.value,
        fakeTimeOverride: deps.getChatNow ? deps.getChatNow() : undefined,
      });

      const promptResult = await builder.build();

      const groupCallTaskConfig = settingsStore.getAPIForTask("groupCall");
      const client = new OpenAICompatibleClient(groupCallTaskConfig.api);

      // 將 BuiltMessage 轉換為 APIMessage，處理圖片數據
      const apiMessages = promptResult.messages.map((m: any) => {
        // 如果消息包含圖片數據，構建混合內容
        if (m.imageData) {
          const content: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
          
          // 添加文字內容
          if (m.content && m.content.trim()) {
            content.push({ type: "text", text: m.content });
          }
          
          // 添加圖片內容
          const mimeType = m.imageMimeType || "image/jpeg";
          content.push({
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${m.imageData}`,
            },
          });
          
          return { role: m.role, content };
        }
        
        // 普通文字消息
        return { role: m.role, content: m.content };
      });
      
      const streamGenerator = client.generateStream({
        messages: apiMessages,
        settings: {
          maxContextLength:
            settingsStore.generation.maxContextLength || 200000,
          maxResponseLength: settingsStore.generation.maxTokens || 200000,
          temperature: settingsStore.generation.temperature,
          topP: settingsStore.generation.topP,
          frequencyPenalty: 0,
          presencePenalty: 0,
          repetitionPenalty: 1,
          stopSequences: [],
          streaming: true,
          useStreamingWindow: false,
          ...pickGenerationToggles(settingsStore.generation),
        },
        apiSettings: groupCallTaskConfig.api,
        adjustLastMessageRole: true,
      });

      let fullContent = "";
      let doneContent: string | null = null;
      let finishReason: string | undefined;

      for await (const event of streamGenerator) {
        if (event.type === "token" && event.token) {
          fullContent += event.token;
        } else if (event.type === "done") {
          doneContent = event.content || fullContent;
          finishReason = event.finishReason;
        } else if (event.type === "error") {
          // 串流錯誤是用事件回報、不會 throw，沒接住的話畫面上就只是「沒人回應」
          throw new Error(event.error || "生成失敗");
        }
      }

      // 沒收到 done（串流被中斷）時，已收到的內容照樣拿來用
      const rawContent = doneContent ?? fullContent;
      const before = groupCallMessages.value.length;
      if (rawContent.trim()) {
        applyGroupCallResponse(deps.applyAIOutputRegex(rawContent));
      }
      if (groupCallMessages.value.length === before) {
        console.warn("[GroupCall] 這輪沒有解析出任何語音:", rawContent);
        groupCallMessages.value.push({
          type: "system",
          content: describeSilentTurn(rawContent, finishReason),
          localHint: true,
          retryTurn: turn,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.error("[GroupCall] AI 回覆失敗:", error);
      groupCallMessages.value.push({
        type: "system",
        content: `回覆失敗：${error instanceof Error ? error.message : String(error)}`,
        localHint: true,
        retryTurn: turn,
        timestamp: Date.now(),
      });
    } finally {
      aiGenerationStore.completeGeneration(deps.currentChatId.value!, "chat");
    }
  }

  return {
    showGroupCallModal,
    groupCallStartedAt,
    groupCallParticipants,
    groupCallMessages,
    startGroupCall,
    handleGroupCallHangUp,
    handleGroupCallJoin,
    handleGroupCallLeave,
    addGroupCallVoiceMessage,
    handleGroupCallSendMessage,
    handleGroupCallAutoTalk,
    retryGroupCallTurn,
  };
}
