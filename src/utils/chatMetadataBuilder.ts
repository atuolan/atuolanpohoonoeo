import type { Chat, ChatMessage, ChatAppearance, ChatLocationOverride } from "@/types/chat";
import type { ChatPersonaOverride } from "@/composables/useChatPersona";
import type { SummarySettings } from "@/types/chat";

export interface BuildChatMetadataOptions {
  chatId: string;
  storableMessages: ChatMessage[];
  charName: string;
  currentChatData: Chat | null;
  characterId: string;
  existingMetadata: Chat["metadata"] | undefined;
  personaId: string;
  chatPersonaOverride: ChatPersonaOverride;
  enablePhoneDecision: boolean;
  doNotDisturb: boolean;
  faceToFaceMode: boolean;
  thirdPersonMode: boolean;
  enableRealTimeAwareness: boolean;
  fakeTimeFields: Partial<Chat>;
  minimaxTTSEnabled: boolean;
  imageSearchEnabled: boolean;
  speakerMode: Chat["speakerMode"];
  minimaxTTSOverride: Chat["minimaxTTSOverride"] | undefined;
  appearance: ChatAppearance | undefined;
  summarySettings: SummarySettings;
  locationOverride: ChatLocationOverride | null;
  charAvatarOverride: string | undefined;
  userAvatarOverride: string | undefined;
  coupleAvatarLibrary: Chat["coupleAvatarLibrary"] | undefined;
  activeCoupleAvatarId: string | null;
}

export function buildChatMetadataFromState(options: BuildChatMetadataOptions): Chat {
  const lastMsg = options.storableMessages[options.storableMessages.length - 1];
  return {
    id: options.chatId,
    name: options.currentChatData?.name || `與 ${options.charName} 的對話`,
    characterId: options.characterId,
    messages: options.storableMessages,
    metadata: {
      ...JSON.parse(JSON.stringify(options.existingMetadata ?? {})),
      personaOverride: {
        personaId: options.personaId,
        secrets: options.chatPersonaOverride.secrets,
        powerDynamic: options.chatPersonaOverride.powerDynamic,
      },
    },
    createdAt: options.currentChatData?.createdAt || Date.now(),
    updatedAt: Date.now(),
    enablePhoneDecision: options.enablePhoneDecision,
    doNotDisturb: options.doNotDisturb,
    faceToFaceMode: options.faceToFaceMode,
    thirdPersonMode: options.thirdPersonMode,
    enableRealTimeAwareness: options.enableRealTimeAwareness,
    ...options.fakeTimeFields,
    minimaxTTSEnabled: options.minimaxTTSEnabled,
    imageSearchEnabled: options.imageSearchEnabled,
    speakerMode: options.speakerMode,
    minimaxTTSOverride: options.minimaxTTSOverride,
    appearance: options.appearance
      ? JSON.parse(JSON.stringify(options.appearance))
      : undefined,
    summarySettings: JSON.parse(JSON.stringify(options.summarySettings)),
    isGroupChat: options.currentChatData?.isGroupChat,
    groupMetadata: options.currentChatData?.groupMetadata
      ? JSON.parse(JSON.stringify(options.currentChatData.groupMetadata))
      : undefined,
    lastMessagePreview: lastMsg?.content?.slice(0, 100) || "",
    messageCount: options.storableMessages.length,
    isBranch: options.currentChatData?.isBranch,
    pinnedToList: options.currentChatData?.pinnedToList,
    blockState: options.currentChatData?.blockState,
    locationOverride: options.locationOverride ?? undefined,
    charAvatarOverride: options.charAvatarOverride,
    userAvatarOverride: options.userAvatarOverride,
    coupleAvatarLibrary: options.coupleAvatarLibrary,
    activeCoupleAvatarId: options.activeCoupleAvatarId,
  };
}
