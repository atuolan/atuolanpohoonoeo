import { ref, type Ref, type ComputedRef } from "vue";
import { OpenAICompatibleClient } from "@/api/OpenAICompatible";
import { PromptBuilder } from "@/engine/prompt/PromptBuilder";
import { parseGroupChatResponse } from "@/services/ResponseParser";
import type { ChatMessage } from "@/types/chat";
import type { Lorebook } from "@/types/worldinfo";
import {
  useAIGenerationStore,
  useCharactersStore,
  useLorebooksStore,
  usePromptManagerStore,
  useSettingsStore,
} from "@/stores";
import { useUserStore } from "@/stores/user";

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
}

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

  /** 發起群通話 */
  function startGroupCall() {
    if (!deps.isGroupChat.value || !deps.groupMetadata.value) return;

    console.log("[GroupCall] 發起群通話");

    groupCallStartedAt.value = Date.now();
    groupCallMessages.value = [];

    groupCallParticipants.value = deps.groupMetadata.value.members.map(
      (member: any) => {
        const char = charactersStore.characters.find(
          (c) => c.id === member.characterId,
        );
        return {
          characterId: member.characterId,
          name: char?.nickname || char?.data?.name || "未知角色",
          avatar: char?.avatar || "",
          isSpeaking: false,
        };
      },
    );

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
        participants: deps.groupMetadata.value.members.map((m: any) => ({
          characterId: m.characterId,
          joinedAt: Date.now(),
        })),
      };
    }

    showGroupCallModal.value = true;
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

    const char = charactersStore.characters.find((c) => c.id === characterId);
    groupCallParticipants.value.push({
      characterId,
      name: characterName,
      avatar: char?.avatar || "",
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
    if (!content.trim() || deps.isGenerating.value) return;

    groupCallMessages.value.push({
      type: "user",
      content,
      timestamp: Date.now(),
    });

    await triggerGroupCallAIResponse();
  }

  /** 處理群通話自動對話 */
  async function handleGroupCallAutoTalk() {
    if (!showGroupCallModal.value || deps.isGenerating.value) return;

    console.log("[GroupCall] 群通話自動對話觸發");

    groupCallMessages.value.push({
      type: "system",
      content: "角色們繼續聊天中...",
      timestamp: Date.now(),
    });

    await triggerGroupCallAIResponse();
  }

  /** 群通話專用的 AI 回覆函數 */
  async function triggerGroupCallAIResponse() {
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
      return;
    }

    try {
      const callHistory: ChatMessage[] = groupCallMessages.value
        .filter((m) => m.type !== "system")
        .map((m, idx) => ({
          id: `call_${idx}`,
          sender: (m.type === "user" ? "user" : "assistant") as
            | "user"
            | "assistant",
          name:
            m.type === "user"
              ? userStore.currentPersona?.name || "User"
              : m.senderName || "角色",
          content: m.content,
          is_user: m.type === "user",
          status: "sent" as const,
          createdAt: m.timestamp,
          updatedAt: m.timestamp,
        }));

      const memberCharacters = deps.groupMetadata.value.members
        .map((m: any) =>
          charactersStore.characters.find((c) => c.id === m.characterId),
        )
        .filter((c: any): c is NonNullable<typeof c> => c !== undefined);

      if (memberCharacters.length === 0) {
        console.error("[GroupCall] 找不到任何群成員角色");
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

      const groupMembersData = deps.groupMetadata.value.members.map(
        (m: any) => {
          const char = memberCharacters.find((c: any) => c.id === m.characterId);
          return {
            characterId: m.characterId,
            name: char?.data?.name || char?.nickname || m.characterId,
            nickname: m.nickname,
            personality: char?.data?.personality || "",
            description: char?.data?.description || "",
            avatar: char?.avatar || "",
            isAdmin: m.isAdmin,
            isMuted: m.isMuted,
          };
        },
      );

      const builder = new PromptBuilder({
        character: memberCharacters[0],
        lorebooks: linkedLorebooks,
        messages: callHistory,
        settings: {
          maxContextLength:
            settingsStore.generation.maxContextLength || 200000,
          maxResponseLength: settingsStore.generation.maxTokens || 200000,
          temperature: settingsStore.generation.temperature,
          topP: settingsStore.generation.topP,
          topK: 0,
          frequencyPenalty: 0,
          presencePenalty: 0,
          repetitionPenalty: 1,
          stopSequences: [],
          streaming: true,
          useStreamingWindow: settingsStore.generation.useStreamingWindow,
        },
        userName: userStore.currentPersona?.name || "User",
        userPersona: deps.effectivePersona.value?.description,
        promptManagerConfig: promptManagerStore.config,
        groupChatMode: true,
        groupMembers: groupMembersData,
        groupName: deps.groupMetadata.value.groupName,
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
          topK: 0,
          frequencyPenalty: 0,
          presencePenalty: 0,
          repetitionPenalty: 1,
          stopSequences: [],
          streaming: true,
          useStreamingWindow: false,
        },
        apiSettings: groupCallTaskConfig.api,
        adjustLastMessageRole: true,
      });

      let fullContent = "";

      for await (const event of streamGenerator) {
        if (event.type === "token" && event.token) {
          fullContent += event.token;
        } else if (event.type === "done") {
          const finalContent = deps.applyAIOutputRegex(
            event.content || fullContent,
          );

          const parsed = parseGroupChatResponse(finalContent);

          for (const parsedMsg of parsed.messages) {
            const senderName = parsedMsg.senderName || "";

            if (parsedMsg.isJoinCall) {
              const charId = deps.getGroupMemberIdByName(senderName);
              if (charId) handleGroupCallJoin(charId, senderName);
              if (parsedMsg.content) {
                addGroupCallVoiceMessage(senderName, parsedMsg.content);
              }
              continue;
            }
            if (parsedMsg.isLeaveCall) {
              const charId = deps.getGroupMemberIdByName(senderName);
              if (charId)
                handleGroupCallLeave(
                  charId,
                  senderName,
                  parsedMsg.leaveCallReason,
                );
              if (parsedMsg.content) {
                addGroupCallVoiceMessage(senderName, parsedMsg.content);
              }
              continue;
            }

            if (parsedMsg.isVoice && parsedMsg.voiceContent) {
              addGroupCallVoiceMessage(senderName, parsedMsg.voiceContent);
              continue;
            }

            if (parsedMsg.content) {
              addGroupCallVoiceMessage(senderName, parsedMsg.content);
            }
          }
        }
      }
    } catch (error) {
      console.error("[GroupCall] AI 回覆失敗:", error);
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
  };
}
