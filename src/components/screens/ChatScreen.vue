<script setup lang="ts">
import {
  AVAILABLE_SAMPLERS as novelAISamplers,
  PRESET_SIZES as novelAISizePresets,
} from "@/api/NovelAIImageApi";
import {
  createImageMessage,
  OpenAICompatibleClient,
  type APIMessage,
} from "@/api/OpenAICompatible";
import { MessageBubble } from "@/components/common";
import ChatScreenHeader from "@/components/screens/ChatScreenHeader.vue";
import ChatDetailsScreen from "@/components/screens/ChatDetailsScreen.vue";
import ChatScreenInputArea from "@/components/screens/ChatScreenInputArea.vue";
import ChatGameModals from "@/components/screens/ChatGameModals.vue";
import GiftDrawer from "@/components/common/GiftDrawer.vue";
import MediaSendDrawer from "@/components/common/MediaSendDrawer.vue";
import AISummaryPanel from "@/components/modals/AISummaryPanel.vue";
import AffinityPanel from "@/components/modals/AffinityPanel.vue";
import ChatInfoModal from "@/components/modals/ChatInfoModal.vue";
import DiaryViewModal from "@/components/modals/DiaryViewModal.vue";
import GameScorePickerModal from "@/components/modals/GameScorePickerModal.vue";
import GroupCallModal from "@/components/modals/GroupCallModal.vue";
import IncomingCallModal from "@/components/modals/IncomingCallModal.vue";
import PersonaEditPanel from "@/components/modals/PersonaEditPanel.vue";
import PhoneCallModal from "@/components/modals/PhoneCallModal.vue";
import ProactiveMessageSettingsModal from "@/components/modals/ProactiveMessageSettingsModal.vue";
import RedPacketVoiceClaimModal from "@/components/modals/RedPacketVoiceClaimModal.vue";
import ScreenshotPreviewModal from "@/components/modals/ScreenshotPreviewModal.vue";
import VideoCallModal from "@/components/modals/VideoCallModal.vue";
import ImageSearchPanel from "@/components/panels/ImageSearchPanel.vue";
import { _delay, _escapeRegex, _messageRenderDelay, formatClaimAmount, hashString, isShadowBubbleOf } from "@/utils/chatScreenHelpers";
import { useChatAffinity } from "@/composables/useChatAffinity";
import { useChatBlock } from "@/composables/useChatBlock";
import { useChatRedpacket } from "@/composables/useChatRedpacket";
import { useChatRegex } from "@/composables/useChatRegex";
import { useChatWeatherModal } from "@/composables/useChatWeatherModal";
import {
  runChatGenerationRequest,
  useChatGeneration,
  type ChatTriggerAIResponseOptions,
} from "@/composables/useChatGeneration";
import { useChatRegeneration } from "@/composables/useChatRegeneration";
import { useChatAppearance } from "@/composables/useChatAppearance";
import { useChatAudioRecording } from "@/composables/useChatAudioRecording";
import { useChatAvatarChange } from "@/composables/useChatAvatarChange";
import { useChatEventsExtraction } from "@/composables/useChatEventsExtraction";
import { useChatExport } from "@/composables/useChatExport";
import { useChatFakeTime } from "@/composables/useChatFakeTime";
import { useChatFiles } from "@/composables/useChatFiles";
import {
  enterGameScreen,
  leaveGameScreen,
} from "@/composables/useGamePlayingDetector";
import { useChatGroupCall } from "@/composables/useChatGroupCall";
import { useChatGroupSettings } from "@/composables/useChatGroupSettings";
import { useChatIncomingCalls } from "@/composables/useChatIncomingCalls";
import { useChatInputHelper } from "@/composables/useChatInputHelper";
import { useChatMedia } from "@/composables/useChatMedia";
import { useChatMiniFeatures } from "@/composables/useChatMiniFeatures";
import { useChatMessageActions } from "@/composables/useChatMessageActions";
import { useMultiCharMembers } from "@/composables/useMultiCharMembers";
import { useChatTTS } from "@/composables/useChatTTS";
import { useChatSideEffects } from "@/composables/useChatSideEffects";
import { useChatInit } from "@/composables/useChatInit";
import {
  applyWaimaiParsedResultToMessage,
  buildWaimaiAuthorsNote,
} from "@/composables/useChatWaimai";
import { useChatStreamingHandlers } from "@/composables/useChatStreamingHandlers";
import { useChatCleanup } from "@/composables/useChatCleanup";
import { WORLD_CITIES, type CityEntry } from "@/data/worldCities";
import PvButton from "primevue/button";
import PvSelect from "primevue/select";
import PvTag from "primevue/tag";
import { CloudSun, User, Bot, X, MapPin, Wifi, ChevronRight, ChevronDown, ChevronUp, RefreshCcw, ArrowLeft, Search, Clock } from "lucide-vue-next";
import { useChatMultiDelete } from "@/composables/useChatMultiDelete";
import { useChatPersona } from "@/composables/useChatPersona";
import { useChatPersistence } from "@/composables/useChatPersistence";
import { useChatPlusMenuRouter } from "@/composables/useChatPlusMenuRouter";
import { useChatScreenshot } from "@/composables/useChatScreenshot";
import { useChatSearch } from "@/composables/useChatSearch";
import { useChatSummaryDiary } from "@/composables/useChatSummaryDiary";
import { useChatTheater } from "@/composables/useChatTheater";
import { useHolidayTrigger } from "@/composables/useHolidayTrigger";
import {
  useStreamingWindow,
  type PromptDebugMessage,
} from "@/composables/useStreamingWindow";
import { db, DB_STORES } from "@/db/database";
import {
  getChatImage,
  isChatImageRef,
} from "@/db/operations";
import {
  createChatRecord,
  deleteChatCascade,
  loadChatById,
  loadChatsByCharacter,
  refreshChatDerivedMetadata,
  resolvePreferredDirectChat,
  renameChat,
  setLocalChatUnreadCount,
  setLastActiveChatId,
  toggleChatPinned,
} from "@/storage/chatStorage";
import {
  appendMessages,
  deleteMessage,
  loadMessages,
  saveMessages,
} from "@/storage/chatMessageStorage";
import { PromptBuilder } from "@/engine/prompt/PromptBuilder";
import BlockService from "@/services/BlockService";
import {
  applyHtmlTemplateRules,
  buildHtmlTemplatePrompt,
  hasRenderableHtmlBlock,
} from "@/services/HtmlTemplateEngine";
import { proactiveMessageService } from "@/services/ProactiveMessageService";
import { getRegexedString, regex_placement } from "@/services/RegexEngine";
import {
  needsParsing,
  parseAffinityUpdateTags,
  parseAIResponse,
  parseCalendarEventTags,
  parseFoodRecordTags,
  parseGroupChatResponse,
} from "@/services/ResponseParser";
import { createStTemplateContext } from "@/services/StTemplateContextService";
import {
  getNearbyPlaces,
  getWeatherByCity,
  getWeatherByCoords,
} from "@/services/WeatherService";
import {
  useCharactersStore,
  useChatStore,
  useLorebooksStore,
  useMusicStore,
  usePromptManagerStore,
  useSettingsStore,
  useStickerStore,
  useThemeStore,
} from "@/stores";
import { usePhoneCallStore } from "@/stores/phoneCall";
import { useRegexScriptsStore } from "@/stores/regexScripts";
import { useUserStore } from "@/stores/user";
import { useFitnessStore } from "@/stores/fitness";
import type {
  Chat,
  ChatAppearance,
  ChatLocationOverride,
  ChatMessage,
  GenerationDiagnostics,
  GenerationContaminationProbeResult,
} from "@/types/chat";
import type {
  ChatScreenImageData as ImageData,
  ChatScreenMediaType as MediaType,
  ChatScreenMessage as Message,
  ChatScreenProps as ChatProps,
  PendingInjectedMessage,
} from "@/types/chatScreen";
import { createDefaultChat } from "@/types/chat";
import { formatMediaLogsForPrompt } from "@/types/mediaLog";
import { formatFoodLogsForPrompt } from "@/types/fitness";
import type { Lorebook } from "@/types/worldinfo";
import ejs from "ejs";
import {
  buildPostCallPrompt,
  createCallNotificationCard,
} from "@/utils/postCallReaction";
import {
  convertStoredMessageToUiMessage as mapStoredMessageToUiMessage,
  convertToStorableMessage as mapToStorableMessage,
} from "@/utils/chatMessageMapping";
import { buildChatMetadataFromState } from "@/utils/chatMetadataBuilder";
import { createGreetingMessages } from "@/utils/chatGreetingMessages";
import {
  loadAndRepairChatMessages,
  repairSystemSenderRegressionIfNeeded,
} from "@/utils/chatMessageLoading";
import {
  computed,
  nextTick,
  onMounted,
  ref,
  toRaw,
  watch,
  watchEffect,
} from "vue";

const props = withDefaults(defineProps<ChatProps>(), {
  chatId: "",
  characterId: "",
  characterName: "角色",
  characterAvatar: "",
  pendingAppearance: undefined,
  pendingMessage: "",
  startPhoneCall: false,
  incomingCallReason: "",
});

// Emits
const emit = defineEmits<{
  (e: "back"): void;
  (e: "settings"): void;
  (e: "menu"): void;
  (
    e: "navigate",
    page: "character" | "worldbook" | "settings" | "shop" | "media-log" | "peek-phone",
  ): void;
  (e: "editCharacter", id: string): void;
  (e: "editLorebook", id: string): void;
  (e: "appearanceApplied"): void;
  (e: "pendingMessageConsumed"): void;
  (e: "phoneCallStarted"): void;
  (e: "incomingCallConsumed"): void;
  (e: "openChat", chatId: string, characterId: string): void;
  (e: "chatSwitched", chatId: string): void;
}>();


const onHeaderSelectPersona = (...args: any[]) => selectPersona(args[0] as string);
const onHeaderOpenGame = (...args: any[]) =>
  openGame(args[0] as "dishwashing" | "fishing" | "gambling" | "merit");
const onHeaderSetFakeTimeMode = (...args: any[]) =>
  setFakeTimeMode(args[0] as "real" | "loop" | "offset");
const onHeaderUpdateFakeTimeLoopStart = (...args: any[]) =>
  updateFakeTimeLoopStart(args[0] as string);
const onHeaderUpdateFakeTimeLoopEnd = (...args: any[]) =>
  updateFakeTimeLoopEnd(args[0] as string);
const onHeaderUpdateOffsetStartDateTime = (...args: any[]) =>
  updateOffsetStartDateTime(args[0] as string);
const onHeaderNavigate = (...args: any[]) =>
  navigateTo(args[0] as "character" | "worldbook" | "settings" | "peek-phone");

// 快捷導航
const showCharacterNavModal = ref(false);
const showWorldbookNavModal = ref(false);

function navigateTo(page: "character" | "worldbook" | "settings" | "peek-phone") {
  showMoreMenu.value = false;
  showRail.value = false;
  
  if (page === "character") {
    if (!isGroupChat.value && currentCharacter.value) {
      showCharacterNavModal.value = true;
    } else {
      emit("navigate", "character");
    }
    return;
  }
  
  if (page === "worldbook") {
    if (!isGroupChat.value && currentCharacter.value && currentCharacter.value.lorebookIds && currentCharacter.value.lorebookIds.length > 0) {
      showWorldbookNavModal.value = true;
    } else {
      emit("navigate", "worldbook");
    }
    return;
  }

  emit("navigate", page);
}

function handleCharacterNavChoice(choice: 'edit' | 'list') {
  showCharacterNavModal.value = false;
  if (choice === 'edit' && currentCharacter.value) {
    emit("editCharacter", currentCharacter.value.id);
  } else {
    emit("navigate", "character");
  }
}

function handleWorldbookNavChoice(choice: 'edit' | 'list') {
  showWorldbookNavModal.value = false;
  if (choice === 'edit' && currentCharacter.value && currentCharacter.value.lorebookIds && currentCharacter.value.lorebookIds.length > 0) {
    emit("editLorebook", currentCharacter.value.lorebookIds[0]);
  } else {
    emit("navigate", "worldbook");
  }
}

// Stores
const chatStore = useChatStore();
const charactersStore = useCharactersStore();
const settingsStore = useSettingsStore();
const themeStore = useThemeStore();
const lorebooksStore = useLorebooksStore();
const stickerStore = useStickerStore();
const userStore = useUserStore();
const fitnessStore = useFitnessStore();
const gameEconomyStore = useGameEconomyStore();
const affinityStore = useAffinityStore();
const chatVariablesStore = useChatVariablesStore();
const regexScriptsStore = useRegexScriptsStore();
const phoneCallStore = usePhoneCallStore();
const weatherStore = useWeatherStore();

// 通知 Store
import { useNotificationStore } from "@/stores/notification";
const notificationStore = useNotificationStore();

// 全局錢包 ID
const GLOBAL_WALLET_ID = "global";

// QZone Store（噗浪發文用）
import { useQzoneStore } from "@/stores/qzone";
const qzoneStore = useQzoneStore();

// 使用者 Store
import {
  getIncomingCallScheduler,
  type CharacterInfo,
} from "@/services/IncomingCallScheduler";
import type { FoodRecordData, ScheduleCallData } from "@/services/ResponseParser";
import {
  initRedPacketState,
  applyClaim as applyRedpacketClaim,
  canClaim as canClaimRedpacket,
  findClaimableRedPacket,
  userSpokeVoice,
  fuzzyVoiceMatch,
} from "@/services/RedPacketService";
import { useWeatherStore } from "@/stores/weather";
import type { CalendarEvent, CalendarEventData } from "@/types/calendar";
import type { Holiday } from "@/types/holiday";
import type { PendingCall } from "@/types/incomingCall";
import {
  detectTodayHoliday,
  detectUpcomingHolidays,
  getLunarDateString,
} from "@/utils/holidayDetector";

// ===== 使用者 Persona（由 useChatPersona composable 管理，見下方初始化） =====
// _restoreGlobalPersona → persona.restoreGlobalPersona
// showPersonaSelector, showPersonaEditPanel, chatPersonaOverride, hasPersonaOverride,
// effectivePersona, togglePersonaSelector, selectPersona, openPersonaEditPanel, savePersonaEdit
// 均由 composable 提供

// 當前聊天綁定的 persona ID（用於保存時避免被全局 currentPersonaId 覆蓋）
// 解決切換聊天時的競態條件：組件卸載時的 pending save 可能讀到新聊天的全局 persona
const chatBoundPersonaId = ref<string | null>(null);

const promptManagerStore = usePromptManagerStore();

// 當前聊天 ID
const currentChatId = ref<string | null>(null);

// ===== AI 生成狀態 composable =====
const {
  isGenerating,
  startChatGeneration,
  updateChatGenerationContent,
  completeChatGeneration,
  setChatGenerationError,
  stopChatGeneration,
  isChatGenerating,
  getChatGenerationTask,
} = useChatGeneration({ currentChatId });

// ===== 節日主動祝福觸發 =====
// 進入聊天時，若今天是節日且尚未觸發，角色會主動發送祝福
const holidayChatId = computed(() => currentChatId.value ?? undefined);
useHolidayTrigger(holidayChatId, async (holiday: Holiday) => {
  // 建構節日提示詞，注入到 API prompt 中（不會出現在聊天記錄裡）
  const userName = userStore.currentPersona?.name || "User";
  const charName =
    currentCharacter.value?.data?.name || props.characterName || "角色";
  const isFaceToFace = chatFaceToFaceMode.value;

  const basePrompt = holiday.aiPrompt
    ? holiday.aiPrompt
        .replace(/\{\{user\}\}/g, userName)
        .replace(/\{\{char\}\}/g, charName)
    : `今天是 ${holiday.name}！請讓 ${charName} 祝賀 ${userName} ${holiday.name}快樂。`;

  const fullPrompt = isFaceToFace
    ? `${basePrompt}

要求：
1. 根據目前的劇情脈絡和你與 ${userName} 的關係親密度來決定祝福方式
2. 如果關係還不夠熟，用禮貌但保持距離的方式祝福，不要過度親密
3. 只有在關係夠親密時才考慮使用 <pay> 發紅包，不熟的話不需要
4. 表達符合角色性格的情感，可以用 *動作描寫* 增加氛圍
5. 用面對面模式的敘事風格，自然地融入當前場景`
    : `${basePrompt}

要求：
1. 根據目前的對話脈絡和你與 ${userName} 的關係親密度來決定祝福方式
2. 如果關係還不夠熟，用禮貌但保持距離的方式祝福，不要過度親密
3. 只有在關係夠親密時才考慮使用 <pay> 發紅包，不熟的話不需要
4. 表達符合你性格的情感，語氣要自然真實
5. 可以使用表情符號`;

  await triggerAIResponse({ holidayTriggerPrompt: fullPrompt });
});

// 群聊相關狀態
const currentChatData = ref<Chat | null>(null);
const isGroupChat = computed(() => currentChatData.value?.isGroupChat === true);
const groupMetadata = computed(() => currentChatData.value?.groupMetadata);
// 是否使用群聊模式的提示詞（多人卡 + 面對面 = 不使用群聊提示詞）
const useGroupChatMode = computed(() => {
  if (groupMetadata.value?.isMultiCharCard && chatFaceToFaceMode.value) {
    return false;
  }
  return isGroupChat.value;
});
// 是否使用群聊解析器（多人卡 + 面對面模式用普通解析器，輸出是小說式一整段）
const useGroupChatParser = computed(() => {
  if (groupMetadata.value?.isMultiCharCard && chatFaceToFaceMode.value) {
    return false;
  }
  return isGroupChat.value;
});
const groupDisplayName = computed(
  () => groupMetadata.value?.groupName || props.characterName,
);
const groupMemberCount = computed(() => {
  if (!groupMetadata.value) return 0;
  // 多人卡模式：從 multiCharMembers 計算
  if (
    groupMetadata.value.isMultiCharCard &&
    groupMetadata.value.multiCharMembers
  ) {
    return groupMetadata.value.multiCharMembers.length;
  }
  return groupMetadata.value.members?.length || 0;
});

// 群聊成員頭像版本鍵（用於 v-memo，當頭像變更時觸發重新渲染）
const groupMemberAvatarVersion = computed(() => {
  if (!groupMetadata.value?.multiCharMembers) return '';
  return groupMetadata.value.multiCharMembers
    .map((m: any) => `${m.id}:${(m.avatar || '').slice(-16)}`)
    .join(',');
});

// 群聊成員資訊（用於 ChatInfoModal）
const groupMembersForInfo = computed(() => {
  if (!isGroupChat.value || !groupMetadata.value) return [];

  // 多人卡模式：從 multiCharMembers 構建
  if (
    groupMetadata.value.isMultiCharCard &&
    groupMetadata.value.multiCharMembers
  ) {
    return groupMetadata.value.multiCharMembers.map((member) => ({
      characterId: member.id,
      name: member.name,
      nickname: undefined,
      avatar: member.avatar,
      isAdmin: false,
      isMuted: false,
    }));
  }

  return groupMetadata.value.members.map((member) => {
    const char = charactersStore.characters.find(
      (c) => c.id === member.characterId,
    );
    return {
      characterId: member.characterId,
      name: char?.data?.name || "未知角色",
      nickname: member.nickname,
      avatar: char?.avatar || "",
      isAdmin: member.isAdmin,
      isMuted: member.isMuted,
    };
  });
});

// 訊息資訊（用於 ChatInfoModal，包含 senderCharacterId）
const messagesForInfo = computed(() => {
  return messages.value.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: m.timestamp,
    senderCharacterId: m.senderCharacterId,
    senderCharacterName: m.senderCharacterName,
  }));
});

function resolveGroupMemberByName(senderName: string): {
  characterId?: string;
  avatar: string;
  canonicalName: string;
} {
  const rawName = senderName.trim();
  if (!groupMetadata.value || !rawName) {
    return {
      characterId: undefined,
      avatar: "",
      canonicalName: rawName,
    };
  }

  const candidateNames = [
    rawName,
    rawName.replace(/[（(][^）)]*[）)]$/u, "").trim(),
  ].filter((name, index, arr) => !!name && arr.indexOf(name) === index);

  if (
    groupMetadata.value.isMultiCharCard &&
    groupMetadata.value.multiCharMembers
  ) {
    for (const candidate of candidateNames) {
      const member = groupMetadata.value.multiCharMembers.find(
        (m) => m.name === candidate,
      );
      if (member) {
        return {
          characterId: member.id,
          avatar: member.avatar || "",
          canonicalName: member.name,
        };
      }
    }

    return {
      characterId: undefined,
      avatar: "",
      canonicalName: rawName,
    };
  }

  for (const candidate of candidateNames) {
    for (const member of groupMetadata.value.members) {
      const char = charactersStore.characters.find(
        (c) => c.id === member.characterId,
      );
      const aliases = [member.nickname, char?.nickname, char?.data?.name]
        .map((name) => name?.trim())
        .filter((name, index, arr): name is string => !!name && arr.indexOf(name) === index);

      if (aliases.includes(candidate)) {
        return {
          characterId: member.characterId,
          avatar: char?.avatar || "",
          canonicalName: member.nickname?.trim() || char?.nickname?.trim() || char?.data?.name || rawName,
        };
      }
    }
  }

  return {
    characterId: undefined,
    avatar: "",
    canonicalName: rawName,
  };
 }

// 群聊輔助：根據角色名稱取得角色頭像
function getGroupMemberAvatar(senderName: string): string {
  return resolveGroupMemberByName(senderName).avatar;
}

// 群聊輔助：根據角色名稱取得角色 ID
function getGroupMemberIdByName(senderName: string): string | undefined {
  return resolveGroupMemberByName(senderName).characterId;
}

/**
 * 構建群聊記錄數據（用於私信中的群聊記錄卡片）
 * @param msgs 當前群聊訊息列表
 * @param maxRounds 最多取幾輪（預設 15）
 */
function buildGroupChatHistoryData(
  msgs: Message[],
  maxRounds: number = 15,
): ChatMessage["groupChatHistoryData"] | null {
  if (!msgs || msgs.length === 0) return null;

  // 過濾出有效的聊天訊息（排除系統訊息、私信通知等）
  const validMsgs = msgs.filter(
    (m) =>
      m.content &&
      !m.isPrivateMessage &&
      !m.isGroupAction &&
      !m.isRecall &&
      (m.role === "user" || m.role === "ai"),
  );

  // 取最近 maxRounds 條
  const recent = validMsgs.slice(-maxRounds);
  if (recent.length === 0) return null;

  const groupName = groupMetadata.value?.groupName || "群聊";
  const messages = recent.map((m) => {
    const senderName =
      m.role === "user"
        ? userStore.currentPersona?.name || "我"
        : m.senderCharacterName || "角色";
    let content = m.content;
    // 簡化特殊內容
    if (content.startsWith("[sticker:")) {
      content = "[表情]";
    } else if (content.startsWith("<pic>")) {
      content = "[圖片]";
    } else if (content.startsWith("🎤 ")) {
      content = "[語音]";
    }
    return {
      senderName,
      content,
      timestamp: m.timestamp,
      isUser: m.role === "user",
    };
  });

  return { groupName, messages };
}

// 當前角色（用於構建 prompt）
const currentCharacter = computed(() => {
  // 優先使用 characterId 查找
  if (props.characterId) {
    return charactersStore.characters.find((c) => c.id === props.characterId);
  }
  // 備用：使用 characterName 查找
  return charactersStore.characters.find(
    (c) =>
      c.nickname === props.characterName || c.data.name === props.characterName,
  );
});

// 頂欄顯示名稱（即時從 store 讀取，暱稱優先）
const displayCharacterName = computed(() => {
  const char = currentCharacter.value;
  return char?.nickname || char?.data?.name || props.characterName;
});

// 根據 characterId 獲取角色頭像
function getCharacterAvatar(characterId: string): string {
  const char = charactersStore.characters.find((c) => c.id === characterId);
  return char?.avatar || "";
}

// 根據 characterId 獲取角色名稱
function getCharacterNameById(characterId: string): string {
  const char = charactersStore.characters.find((c) => c.id === characterId);
  return char?.data?.name || "未知";
}

// 訊息列表（從 store 或新建）
const messages = ref<Message[]>([]);

// ===== 訊息分頁顯示（性能優化） =====
const MESSAGE_PAGE_SIZE = 100; // 每次載入的訊息數量
const visibleCount = ref(MESSAGE_PAGE_SIZE); // 當前顯示的訊息數量
const isLoadingMore = ref(false); // 是否正在載入更多
const loadMoreSentinelRef = ref<HTMLElement | null>(null); // 頂部哨兵元素

// ===== 聊天側效 composable（外賣時間閘門 / pending 注入 / 外部訊息 reload） =====
const {
  waimaiProgressNow,
  isMessageDisplayable,
  markInitialChatLoadDone,
} = useChatSideEffects({
  messages,
  pendingMessage: () => props.pendingMessage,
  currentChatId,
  isChatGenerating,
  loadOrCreateChat,
  scrollToBottom,
  saveChatImmediate,
  emitPendingMessageConsumed: () => emit("pendingMessageConsumed"),
});

const SEARCH_CONTEXT_BEFORE_COUNT = 30;
const SEARCH_CONTEXT_AFTER_COUNT = 30;
const MAX_SEARCH_RESULT_ITEMS = 80;
const isSearchContextMode = ref(false);
const searchContextTargetId = ref<string | null>(null);
const searchContextMessages = ref<Message[]>([]);
const searchJumpStatus = ref<"idle" | "loading" | "error">("idle");

function exitSearchContextMode() {
  isSearchContextMode.value = false;
  searchContextTargetId.value = null;
  searchContextMessages.value = [];
  searchJumpStatus.value = "idle";
}

// 可見訊息列表（正常模式只渲染最後 N 條；搜尋定位模式只渲染目標附近上下文）
const visibleMessages = computed(() => {
  const now = waimaiProgressNow.value;
  if (isSearchContextMode.value) {
    return searchContextMessages.value.filter((m) => isMessageDisplayable(m, now));
  }

  const filteredMessages = messages.value.filter((m) => isMessageDisplayable(m, now));
  const total = filteredMessages.length;
  return total <= visibleCount.value
    ? filteredMessages
    : filteredMessages.slice(total - visibleCount.value);
});

// 是否還有更早的訊息可以載入
const hasMoreMessages = computed(() => {
  if (isSearchContextMode.value) return false;
  return messages.value.length > visibleCount.value;
});

// 載入更多歷史訊息（向上滾動時觸發）
function loadMoreMessages() {
  if (isSearchContextMode.value || isLoadingMore.value || !hasMoreMessages.value) return;
  isLoadingMore.value = true;

  const container = messagesContainer.value;
  if (!container) {
    isLoadingMore.value = false;
    return;
  }

  // 記錄當前滾動位置，用於載入後恢復
  const prevScrollHeight = container.scrollHeight;
  const prevScrollTop = container.scrollTop;

  // 增加可見數量
  visibleCount.value = Math.min(
    visibleCount.value + MESSAGE_PAGE_SIZE,
    messages.value.length,
  );

  // 等待 DOM 更新後恢復滾動位置
  nextTick(() => {
    if (container) {
      const newScrollHeight = container.scrollHeight;
      container.scrollTop =
        prevScrollTop + (newScrollHeight - prevScrollHeight);
    }
    isLoadingMore.value = false;
  });
}

// IntersectionObserver 實例（用於偵測滾動到頂部載入更多）
let _loadMoreObserver: IntersectionObserver | null = null;

function setupLoadMoreObserver() {
  if (_loadMoreObserver) _loadMoreObserver.disconnect();
  _loadMoreObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && hasMoreMessages.value) {
        loadMoreMessages();
      }
    },
    {
      root: messagesContainer.value,
      rootMargin: "200px 0px 0px 0px", // 提前 200px 觸發
      threshold: 0,
    },
  );
  // 延遲觀察，等待 DOM 渲染
  nextTick(() => {
    if (loadMoreSentinelRef.value && _loadMoreObserver) {
      _loadMoreObserver.observe(loadMoreSentinelRef.value);
    }
  });
}

function cleanupLoadMoreObserver() {
  if (_loadMoreObserver) {
    _loadMoreObserver.disconnect();
    _loadMoreObserver = null;
  }
}

// 最後一條訊息（用於電話模式）
const lastMessage = computed(() => {
  if (messages.value.length === 0) return null;
  return messages.value[messages.value.length - 1];
});

// 輸入框內容
const inputText = ref("");

// 訊息列表容器
const messagesContainer = ref<HTMLElement | null>(null);

// ChatScreen 根元素（用於聊天專屬外觀）
const chatScreenRef = ref<HTMLElement | null>(null);

// 輸入區子元件 ref（用於同步 textarea DOM ref 回 composable）
const inputAreaRef = ref<InstanceType<typeof ChatScreenInputArea> | null>(null);

// 顯示更多選單
const showMoreMenu = ref(false);

// 顯示聊天詳情頁
const showChatDetails = ref(false);

// Rail 收合狀態（手機端頂欄按鈕收合）
const showRail = ref(false);

// 暱稱編輯
const showNicknameEdit = ref(false);
const nicknameEditValue = ref("");

// 仿照 OVO 的做法：用獨立的輕量 API 呼叫讓角色決定接受/拒絕
// 不走主聊天流程，避免觸發重複 AI 生成
function startNicknameEdit() {
  const char = currentCharacter.value;
  if (!char) return;
  nicknameEditValue.value = char.nickname || char.data.name || "";
  showNicknameEdit.value = true;
}

async function saveNickname() {
  const char = currentCharacter.value;
  if (!char) return;
  const newNickname = nicknameEditValue.value.trim();
  await charactersStore.updateCharacter(char.id, { nickname: newNickname });
  showNicknameEdit.value = false;
}

function closeNicknameEdit() {
  showNicknameEdit.value = false;
}

async function setFakeTimeMode(mode: "real" | "loop" | "offset") {
  fakeTime.setMode(mode);
  await saveChat();
}

async function updateFakeTimeLoopStart(value: string) {
  fakeTime.setLoopRange(value, fakeTime.fakeTimeLoop.value.endDateTime);
  await saveChat();
}

async function updateFakeTimeLoopEnd(value: string) {
  fakeTime.setLoopRange(fakeTime.fakeTimeLoop.value.startDateTime, value);
  await saveChat();
}

async function updateOffsetStartDateTime(value: string) {
  fakeTime.setOffsetFromDateTime(value);
  await saveChat();
}

function toggleRail() {
  showRail.value = !showRail.value;
  if (!showRail.value) {
    // 收合時關閉所有子選單
    showMoreMenu.value = false;
    showGameMenu.value = false;
    showChatSettingsMenu.value = false;
    showPersonaSelector.value = false;
  }
}

function closeRail() {
  showRail.value = false;
  showMoreMenu.value = false;
  showGameMenu.value = false;
  showChatSettingsMenu.value = false;
  showPersonaSelector.value = false;
}

// 顯示表情包面板
const showStickerPanel = ref(false);

// ===== AI 記憶管理面板 =====
const showAISummaryPanel = ref(false);
const isGeneratingSummary = ref(false);
const isExtractingEvents = ref(false);
// 聊天專屬總結設定
import { getMacroEngine } from "@/engine/macros/MacroEngine";
import { useAffinityStore } from "@/stores/affinity";
import { useChatVariablesStore } from "@/stores/chatVariables";
import { useGameEconomyStore } from "@/stores/gameEconomy";
import {
  createDefaultImportantEventsLog,
  createImportantEvent,
  ImportantEventsLog,
} from "@/types";
import {
  createDefaultSummarySettings,
  type SummarySettings,
} from "@/types/chat";
const chatSummarySettings = ref<SummarySettings>(
  createDefaultSummarySettings(),
);
const chatSummaries = ref<
  Array<{
    id: string;
    content: string;
    createdAt: number;
    messageCount: number;
    isImportant?: boolean;
    isManual?: boolean;
    isMeta?: boolean;
    keywords?: string[];
  }>
>([]);
const chatDiaries = ref<
  Array<{
    id: string;
    content: string;
    summary: string;
    createdAt: number;
    messageCount: number;
    isFavorite?: boolean;
    status: "writing" | "ready";
  }>
>([]);

// ===== 日記查看 =====
const viewingDiary = ref<(typeof chatDiaries.value)[number] | null>(null);

function handleViewDiary(diary: any) {
  viewingDiary.value = diary;
}

// ===== 多訊息刪除功能 =====
const isSelectingForDelete = ref(false);
const selectedMessageIds = ref<string[]>([]);

// ===== 加號選單功能 =====
const showMoreFeatures = ref(false);
const showImageSearchPanel = ref(false);

// ===== 聊天檔案管理 composable =====
const {
  showChatFilesPanel,
  chatFilesList,
  normalChats,
  branchChats,
  renamingChatId,
  renamingChatName,
  showNewChatConfirm,
  newChatPinToList,
  selectedGreetingIndex,
  availableGreetings,
  isSelectingChats,
  selectedChatIds,
  normalCategoryExpanded,
  branchCategoryExpanded,
  openChatFilesPanel,
  refreshChatFilesList,
  switchChatFile,
  createNewChatFile,
  togglePinChatToList,
  startRenameChat,
  confirmRenameChat,
  deleteChatFile,
  formatChatFileTime,
  enterSelectMode,
  exitSelectMode,
  toggleChatSelection,
  selectAllInCategory,
  isCategoryAllSelected,
  deleteSelectedChats,
} = useChatFiles({
  messages,
  currentChatId,
  currentChatData,
  currentCharacter,
  isGroupChat,
  characterId: props.characterId,
  characterName: props.characterName,
  showMoreFeatures,
  saveChatImmediate,
  loadOrCreateChat,
  scrollToBottom,
  emit: emit as (e: string, ...args: any[]) => void,
});

// ===== 好感度 composable =====
const {
  _affinityConfig,
  _affinityState,
  showAffinityPanel,
  handleAvatarClick,
  _handleAffinityUpdates,
  rescanAffinityFromMessages,
  _loadAffinityForChat,
  onAffinityRollback,
} = useChatAffinity({ currentChatId, messages });

// ===== 多訊息刪除 composable =====
const {
  showBranchConfirm,
  branchPendingMessageId,
  branchCopyMemory,
  branchAffinityMode,
  branchAffinityGreetingIndex,
  branchAvailableGreetings,
  startDeleteMode,
  handleMultiDeleteFromMessage,
  handleBranchFromMessage,
  confirmBranch,
  toggleMessageSelection,
  deleteSelectedMessages,
  cancelSelection,
} = useChatMultiDelete({
  messages,
  currentChatId,
  currentChatData,
  currentCharacter,
  characterId: props.characterId,
  characterName: props.characterName,
  showMoreMenu,
  isSelectingForDelete,
  selectedMessageIds,
  saveChatImmediate,
  convertToStorableMessage,
  switchChatFile,
  onAffinityRollback,
});

// ===== 批量截圖功能 =====
const isSelectingForScreenshot = ref(false);
const screenshotSelectedIds = ref<string[]>([]);

// ===== Persona composable 初始化 =====
const {
  showPersonaSelector,
  showPersonaEditPanel,
  chatPersonaOverride,
  hasPersonaOverride,
  effectivePersona,
  restoreGlobalPersona: _restoreGlobalPersona,
  togglePersonaSelector,
  selectPersona: _selectPersonaInner,
  openPersonaEditPanel,
  savePersonaEdit,
} = useChatPersona({
  currentChatId,
  showMoreMenu,
  showMoreFeatures,
  saveChatImmediate,
});

// 包裝 selectPersona，同步更新 chatBoundPersonaId
async function selectPersona(personaId: string) {
  chatBoundPersonaId.value = personaId;
  await _selectPersonaInner(personaId);
}

// ===== 封鎖/好友申請 composable =====
const {
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
} = useChatBlock({
  currentChatId,
  currentChatData,
  messages,
  displayCharacterName,
  currentCharacter,
  characterName: props.characterName,
  effectivePersona,
  userStore,
  scrollToBottom,
  saveChatImmediate,
  showMoreMenu,
  showRail,
});

// ===== Regex 腳本套用 composable =====
const {
  getActiveRegexScripts,
  applyAIOutputRegex,
  applyUserInputRegex,
  processAiOutputTemplate,
} = useChatRegex({
  currentCharacter,
  characterName: props.characterName,
  effectivePersona,
  currentChatId,
  messages,
  _affinityConfig,
  _affinityState,
});

// ===== 媒體發送抽屜 =====
const showMediaDrawer = ref(false);

// ===== 禮物面板 =====
const showGiftDrawer = ref(false);

// 獲取最後一條 AI 訊息
const lastAIMessage = computed(() => {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    if (messages.value[i].role === "ai") {
      return messages.value[i];
    }
  }
  return null;
});

// 當前輪次 ID（user 送出訊息時生成，本輪所有 AI 生成內容都帶此 ID）
const currentTurnId = ref<string>("");

// ===== 重新生成 / swipe composable =====
const {
  handleMessageSwipe,
  handleRegenerate,
  regenerateLastAIResponse,
  attachPendingRoundSwipes,
  handleRoundSwipe,
  clearRoundSwipes,
  continueGeneration,
  clearSwipesOnLastAIMessage,
} = useChatRegeneration({
  messages,
  isGenerating,
  lastAIMessage,
  currentTurnId,
  saveChat,
  deleteMessage,
  triggerAIResponse,
});

// ===== 語音錄音 composable =====
const {
  isRecording,
  recordingDuration,
  recordingVolumeLevel,
  isCancelMode,
  canRecord,
  audioSettings,
  showTextVoiceModal,
  textVoiceInput,
  sendTextAsVoice,
  loadAudioSettings,
  onMicDown,
  onMicUp,
  startRecording,
  finishRecording,
  showToast,
} = useChatAudioRecording({
  messages,
  isGenerating,
  scrollToBottom,
  saveChatImmediate,
  clearSwipesOnLastAIMessage,
  clearRoundSwipes,
  triggerAIResponse,
});

// ===== 小遊戲 =====
const showGameMenu = ref(false);
const showDishWashingGame = ref(false);
const showFishingGame = ref(false);
const showGamblingGame = ref(false);
const showMeritHub = ref(false);

// ===== 主動發訊息設置 =====
const showProactiveMessageSettings = ref(false);

// ===== 小劇場 composable =====
const {
  showSmallTheaterModal,
  smallTheaterInput,
  theaterStep,
  theaterUseBranch,
  theaterInheritHistory,
  theaterInheritSummary,
  theaterNewChatFile,
  theaterFaceToFaceMode,
  theaterPhoneScript,
  theaterForwardedMessages,
  openTheater,
  theaterChooseBranch,
  theaterConfirmOptions,
  theaterConfirmForwarded,
  confirmSmallTheater,
  cancelSmallTheater,
} = useChatTheater({
  messages,
  currentChatId,
  currentChatData,
  currentCharacter,
  characterId: props.characterId,
  characterName: props.characterName,
  chatId: props.chatId,
  chatSummarySettings,
  userPersonaName: () => userStore.currentPersona?.name || "我",
  scrollToBottom,
  saveChat,
  saveChatImmediate,
  switchChatFile,
  setFaceToFaceMode: (enabled: boolean) => {
    chatFaceToFaceMode.value = enabled;
  },
  triggerAIResponse,
});

// ===== 假時間 composable =====
const fakeTime = useChatFakeTime();

// ===== 遊戲成績 + 話題引導 + 位置分享 + 天氣分享 composable =====
const {
  showGameScorePicker,
  handleGameScoreSelect,
  showTopicPromptModal,
  topicPromptInput,
  showTopicPromptChoiceModal,
  confirmTopicPrompt,
  useHistoryBasedTopic,
  useRandomTopic,
  cancelTopicPrompt,
  showLocationModal,
  locationInput,
  confirmLocation,
  cancelLocation,
  showWeatherModal,
  openWeatherModal,
  sendWeatherMessage,
  cancelWeather,
  weatherSearchQuery,
  weatherSearchResults,
  weatherSearchLoading,
  customWeatherData,
  customWeatherCity,
  charWeatherData,
  charWeatherLoading,
  searchWeatherCities,
  selectWeatherCity,
  clearCustomWeather,
  weatherEditTarget,
  startWeatherEdit,
  cancelWeatherEdit,
  weatherSendTarget,
  weatherPreview,
  formatFullLocation,
  getVirtualLocalTime,
} = useChatMiniFeatures({
  messages,
  scrollToBottom,
  saveChat,
  saveChatImmediate,
  triggerAIResponse,
  currentCharacter,
  getFakeTime: () => fakeTime.getChatNow(),
  getRealTimeAwareness: () =>
    currentChatData.value?.enableRealTimeAwareness ?? true,
});

// 聊天專屬位置覆蓋（null 表示使用全域設定）
const chatLocationOverride = ref<ChatLocationOverride | null>(null);

const hasChatLocationOverride = computed(() => chatLocationOverride.value !== null);

async function resetChatLocationOverride() {
  if (!chatLocationOverride.value) return;
  chatLocationOverride.value = null;
  await saveChatImmediate();
}

// ===== 天氣 modal composable =====
const {
  wmCountry,
  wmSavedCities,
  wmKeepInThisChat,
  weatherCitySheetTarget,
  weatherPreviewExpanded,
  wmCountryOptions,
  detectCountryKey,
  wmFormatCityLabel,
  loadWmSavedCities,
  saveWmSavedCities,
  openWeatherCitySheet,
  closeWeatherCitySheet,
  onWmKeepInThisChatChange,
  applyUserChatLocationOverride,
  upsertMyCity,
  selectWmWorldCity,
  selectWmSavedCity,
  selectWmSearchResult,
  weatherCanSend,
  weatherSendTargetOptions,
  weatherTimeDiffSummary,
  refreshWeatherInModal,
} = useChatWeatherModal({
  currentCharacter,
  weatherStore,
  customWeatherData,
  charWeatherData,
  charWeatherLoading,
  chatLocationOverride,
  weatherSendTarget,
  weatherSearchQuery,
  weatherPreview,
  selectWeatherCity,
  startWeatherEdit,
  cancelWeatherEdit,
  resetChatLocationOverride,
  saveChatImmediate,
  formatFullLocation,
  showToast,
});

watch(showWeatherModal, (v) => {
  if (v) {
    loadWmSavedCities();
    wmKeepInThisChat.value = chatLocationOverride.value !== null;
    weatherPreviewExpanded.value = false;
    const hasUser = !!(customWeatherData.value || weatherStore.weatherData);
    const hasChar = !!charWeatherData.value;
    if (hasUser && hasChar) weatherSendTarget.value = "both";
    else if (hasUser) weatherSendTarget.value = "user";
    else if (hasChar) weatherSendTarget.value = "char";
  } else {
    weatherCitySheetTarget.value = null;
  }
});

// ===== 聊天專屬頭像覆蓋 =====
const charAvatarOverride = ref<string | undefined>(undefined);
const userAvatarOverride = ref<string | undefined>(undefined);

// ===== 情頭系統 =====
const coupleAvatarLibrary = ref<import('@/types/chat').CoupleAvatarEntry[]>([]);
const activeCoupleAvatarId = ref<string | null>(null);

async function handleChangeChatUserAvatar(avatar: string | undefined) {
  userAvatarOverride.value = avatar;
  await saveChatImmediate();
}

// ===== 換頭像 composable =====
const {
  moodAvatarUrl,
  showForceAvatarConfirm,
  handleAvatarChange,
  confirmForceAvatar,
  findLastUserImage,
  handleCoupleAvatarAction,
} = useChatAvatarChange({
  messages,
  currentCharacter,
  characterName: props.characterName,
  saveChatImmediate,
  charAvatarOverride,
  userAvatarOverride,
  coupleAvatarLibrary,
  activeCoupleAvatarId,
});

/** 當前顯示的角色頭像（群聊模式優先使用自訂群頭像） */
const displayAvatar = computed(() => {
  // 群聊模式
  if (currentChatData.value?.isGroupChat) {
    // 多人卡模式：使用角色卡本身的頭像
    if (currentChatData.value.groupMetadata?.isMultiCharCard) {
      const char = currentCharacter.value;
      if (char?.avatar) return char.avatar;
      return props.characterAvatar;
    }
    // 普通群聊：優先使用自訂群頭像，否則返回空讓 template 顯示預設群組 SVG
    return currentChatData.value.groupMetadata?.groupAvatar || "";
  }
  if (moodAvatarUrl.value) return moodAvatarUrl.value;
  // 聊天專屬頭像覆蓋（優先於角色卡原始頭像）
  if (charAvatarOverride.value) return charAvatarOverride.value;
  // 從 character store 取最新頭像
  const char = currentCharacter.value;
  if (char?.avatar) return char.avatar;
  return props.characterAvatar;
});

/** 當前顯示的用戶頭像（聊天專屬覆蓋優先於 Persona 頭像） */
const displayUserAvatar = computed(() => {
  if (userAvatarOverride.value) return userAvatarOverride.value;
  return userStore.currentAvatar;
});

// ===== 電話 / 視訊通話 =====
const showVideoCallModal = computed(
  () => phoneCallStore.isVideoCallActive && phoneCallStore.isExpanded,
);
const showPhoneCallModal = computed(
  () =>
    phoneCallStore.isActive &&
    phoneCallStore.isExpanded &&
    !phoneCallStore.isVideoCallActive,
);

// 從 Dock 直接撥打電話：透過 store 啟動通話
watch(
  () => props.startPhoneCall,
  (val) => {
    if (val) {
      phoneCallStore.startCall({
        characterId: props.characterId || "",
        characterName: props.characterName || "角色",
        characterAvatar: props.characterAvatar,
        chatId: currentChatId.value || props.chatId || undefined,
        lastMessageTime: lastMessage.value?.timestamp,
        enablePhoneDecision: enablePhoneDecision.value,
        isIncoming: false,
      });
      emit("phoneCallStarted");
    }
  },
  { immediate: true },
);

watch(
  () => chatStore.currentChat,
  (chat) => {
    if (!chat?.id) {
      return;
    }
    if (currentChatId.value && chat.id !== currentChatId.value) {
      return;
    }

    currentChatId.value = chat.id;
    currentChatData.value = JSON.parse(JSON.stringify(chat));
    messages.value = Array.isArray(chat.messages)
      ? JSON.parse(JSON.stringify(chat.messages))
      : [];
  },
  { deep: true },
);

// 從 App 級別接聽來電：透過 store 啟動來電通話
watch(
  () => props.incomingCallReason,
  (val) => {
    if (val) {
      phoneCallStore.startCall({
        characterId: props.characterId || "",
        characterName: props.characterName || "角色",
        characterAvatar: props.characterAvatar,
        chatId: currentChatId.value || props.chatId || undefined,
        lastMessageTime: lastMessage.value?.timestamp,
        isIncoming: true,
        callReason: val,
      });
      emit("incomingCallConsumed");
    }
  },
  { immediate: true },
);

// ===== 聊天資訊 =====
const showChatInfoModal = ref(false);
const showFakeTimePanel = ref(false);
const timeJumpInput = ref("");
const enablePhoneDecision = ref(true); // 默認開啟角色決定接電話
const chatDoNotDisturb = ref(false); // 聊天專屬勿擾模式
const chatFaceToFaceMode = ref(false); // 聊天專屬面對面模式
const chatThirdPersonMode = ref(false); // 聊天專屬第三人稱模式
const chatEnableRealTimeAwareness = ref(true); // 感知現實時間（默認開啟）
const chatMinimaxTTSEnabled = ref(false); // 聊天專屬 MiniMax TTS（默認關閉）
const chatImageSearchEnabled = ref(true);
const chatSpeakerMode = ref<"user" | "char" | "system">("user");
const showSpeakerModePopover = ref(false);
async function setSpeakerMode(mode: "user" | "char" | "system") {
  chatSpeakerMode.value = mode;
  showSpeakerModePopover.value = false;
  await saveChatImmediate();
}

/**
 * 處理 MessageBubble 拆分請求：依原訊息中的順序，
 * 在源氣泡後面插入「文字 / HTML」shadow 氣泡。
 */

function handleSplitRegexSegments(
  messageId: string,
  segments: Array<{ type: "text" | "html"; content: string }>,
) {
  const idx = messages.value.findIndex((m) => m.id === messageId);
  if (idx === -1) return;
  const sourceMessage = messages.value[idx];
  const nonEmptySegments = segments.filter((seg) => seg.content.trim());
  const htmlSegmentCount = nonEmptySegments.filter(
    (seg) => seg.type === "html",
  ).length;
  if (htmlSegmentCount === 0) return;

  // 1) 計算期望的 shadow 氣泡（含穩定 ID）
  // ★ 同時為 text 段產生獨立 shadow bubble，避免源氣泡被隱藏後正文消失
  const desired = nonEmptySegments.map((seg, i) => {
    const ordinal = i + 1; // segment 0 留在源氣泡裡
    const sigHash = hashString(seg.content.replace(/\s+/g, " ").trim());
    const id = `${messageId}_seg_${ordinal}_${seg.type}_${sigHash}`;
    return { id, ordinal, seg };
  });

  // 2) 找出當前所有屬於此源訊息的 shadow 氣泡（含舊版相容）
  const existing = messages.value
    .map((msg, index) => ({ msg, index }))
    .filter(({ msg }) => isShadowBubbleOf(msg, messageId));

  // 3) 完全匹配（ID 相同 + 緊接源氣泡 + 順序正確）→ 不動
  const expectedStart = idx + 1;
  const exactMatch =
    existing.length === desired.length &&
    existing.every((e, i) => e.msg.id === desired[i].id) &&
    existing.every((e, i) => {
      const seg = desired[i].seg;
      if (e.msg.content !== seg.content) return false;
      if (seg.type === "html") {
        return e.msg.isHtmlBlock === true && e.msg.htmlContent === seg.content;
      }
      return !e.msg.isHtmlBlock;
    }) &&
    existing.every((e, i) => e.index === expectedStart + i);
  if (exactMatch) return;

  // 4) 不一致就先把舊的 shadow 全部移除（從尾端開始 splice 才不會錯位）
  for (const { index } of [...existing].sort((a, b) => b.index - a.index)) {
    messages.value.splice(index, 1);
  }

  // 5) 重新定位源氣泡（理論上 idx 不變，但保險起見重找）
  const refreshedIdx = messages.value.findIndex((m) => m.id === messageId);
  if (refreshedIdx === -1) return;

  // 6) 依序插入新的 shadow 氣泡
  const newMessages: Message[] = desired.map(({ id, ordinal, seg }) => ({
    id,
    role: sourceMessage.role,
    content: seg.content,
    timestamp: sourceMessage.timestamp + ordinal * 0.001,
    isHtmlBlock: seg.type === "html",
    htmlContent: seg.type === "html" ? seg.content : undefined,
    // 讓 text shadow bubble 繼承源訊息的頭像/名稱，避免顯示錯位
    senderCharacterId: sourceMessage.senderCharacterId,
    senderCharacterName: sourceMessage.senderCharacterName,
    senderCharacterAvatar: sourceMessage.senderCharacterAvatar,
    isShadowSegment: true,
    shadowSourceId: messageId,
    shadowOrdinal: ordinal,
  }));

  messages.value.splice(refreshedIdx + 1, 0, ...newMessages);
  saveChat();
}

const onMessageEdit = (...args: any[]) => handleMessageEdit(args[0] as string);
const onMessageDelete = (...args: any[]) => handleMessageDelete(args[0] as string);
const onMessageCopy = (...args: any[]) => handleMessageCopy(args[0] as string);
const onMessageRegenerate = (...args: any[]) => handleRegenerate(args[0] as string);
const onMessageRegenerateImage = (...args: any[]) =>
  handleRegenerateImage(args[0] as string);
const onMessageSwipe = (...args: any[]) =>
  handleMessageSwipe(args[0] as string, args[1] as "prev" | "next");
const onMessageRoundSwipe = (...args: any[]) =>
  handleRoundSwipe(args[0] as string, args[1] as "prev" | "next");
const onMessageReply = (...args: any[]) => handleReplyById(args[0] as string);
const onMessageScrollToReply = (...args: any[]) => scrollToMessage(args[0] as string);
const onMessageMultiDelete = (...args: any[]) => handleMultiDeleteFromMessage(args[0] as string);
const onMessageBranch = (...args: any[]) => handleBranchFromMessage(args[0] as string);
const onMessageAcceptTransfer = (...args: any[]) => handleAcceptTransfer(args[0] as string);
const onMessageRefundTransfer = (...args: any[]) => handleRefundTransfer(args[0] as string);
const onMessageUpdateTranscript = (...args: any[]) =>
  handleUpdateTranscript(args[0] as string, args[1] as string);
const onMessageScreenshot = (...args: any[]) => handleMessageScreenshot(args[0] as string);
const onMessageBatchScreenshot = (...args: any[]) =>
  startScreenshotSelectMode(args[0] as string | undefined);
const onMessageAvatarClick = (...args: any[]) => handleAvatarClick(args[0] as string);
const onMessageSplitRegexSegments = (...args: any[]) =>
  handleSplitRegexSegments(
    args[0] as string,
    args[1] as Array<{ type: "text" | "html"; content: string }>,
  );
const onMessageRecall = (...args: any[]) =>
  handleMessageRecall(args[0] as string, args[1] as "seen" | "unseen");
const onMessageCharRecallReveal = (...args: any[]) => handleCharRecallReveal(args[0] as string);
const onMessageAcceptFaceToFaceRequest = (...args: any[]) =>
  handleAcceptFaceToFaceRequest(args[0] as string);
const onMessageRejectFaceToFaceRequest = (...args: any[]) =>
  handleRejectFaceToFaceRequest(args[0] as string);
const onMessageAcceptOnlineModeRequest = (...args: any[]) =>
  handleAcceptOnlineModeRequest(args[0] as string);
const onMessageRejectOnlineModeRequest = (...args: any[]) =>
  handleRejectOnlineModeRequest(args[0] as string);

// ===== 紅包 composable =====
const {
  voiceClaimModalState,
  createTransactionClaimNoticeMessage,
  executeUserRedpacketClaim,
  onMessageClaimRedpacket,
  handleVoiceRedpacketSubmit,
  getUserDisplayName,
  getCharacterDisplayNameFromMessage,
  getRedpacketPayerName,
} = useChatRedpacket({
  messages,
  currentCharacter,
  characterName: props.characterName,
  effectivePersona,
  userStore,
  groupMetadata,
  charactersStore,
  saveChatImmediate,
  showToast,
});

// ===== 來電功能 composable =====
const {
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
} = useChatIncomingCalls({
  messages,
  currentChatId,
  currentCharacter,
  effectivePersona,
  lastMessage,
  chatDoNotDisturb,
  characterId: props.characterId,
  characterName: props.characterName,
  characterAvatar: props.characterAvatar,
  chatId: props.chatId,
  scrollToBottom,
  handlePhoneCallEnded,
  triggerAIResponse,
});

// ===== 群通話 composable =====
const {
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
} = useChatGroupCall({
  messages,
  currentChatId,
  currentChatData,
  isGroupChat,
  isGenerating,
  groupMetadata,
  effectivePersona,
  chatEnableRealTimeAwareness,
  getChatNow: fakeTime.getChatNow,
  characterName: props.characterName,
  characterAvatar: props.characterAvatar,
  scrollToBottom,
  saveChatImmediate,
  applyAIOutputRegex,
  getGroupMemberIdByName,
});

// ===== 多人卡子角色管理 =====
const {
  showAddMultiCharMember,
  newMultiCharName,
  newMultiCharAvatar,
  multiCharAvatarInput,
  editingMultiCharId,
  failedMultiCharAvatars,
  getProxiedUrl,
  triggerMultiCharAvatarUpload,
  handleMultiCharAvatarChange,
  addMultiCharMember,
  editMultiCharMember,
  removeMultiCharMember,
  resetMultiCharForm,
} = useMultiCharMembers({
  groupMetadata,
});

// ===== 群聊設定 composable =====
const {
  showGroupSettingsModal,
  editGroupName,
  editGroupLorebookIds,
  groupAvatarInput,
  handleOpenGroupSettings,
  closeGroupSettings,
  toggleGroupLorebook,
  triggerGroupAvatarUpload,
  handleGroupAvatarChange,
  removeGroupAvatar,
  saveGroupSettings,
  toggleGroupMemberAdmin,
  toggleGroupMemberMute,
  removeGroupMember,
  addMemberToGroup,
} = useChatGroupSettings({
  isGroupChat,
  groupMetadata,
  showChatInfoModal,
  saveChatImmediate,
  resetMultiCharForm,
});

// ===== 分享歌曲到聊天 =====
async function handleShareMusicToChat() {
  const musicStore = useMusicStore();
  const track = musicStore.currentTrack;

  if (!track) {
    if (typeof showToast === "function") {
      showToast("目前沒有正在播放的歌曲");
    }
    return;
  }

  const lyrics = await musicStore.ensureLyrics();

  const message: Message = {
    id: `msg_${Date.now()}`,
    role: "user",
    content: `<分享歌曲>${track.name} - ${track.artist}</分享歌曲>${lyrics ? `\n[歌詞]\n${lyrics}` : ""}`,
    timestamp: Date.now(),
    isMusicShare: true,
    musicShareData: {
      name: track.name,
      artist: track.artist,
      album: track.album || "",
      cover: track.cover || "",
      lyrics: lyrics,
    },
  };
  messages.value.push(message);
  scrollToBottom();
  saveChat();
  showMoreFeatures.value = false;
}

// ===== 加號選單路由 + 跳轉魔法 composable =====
const {
  showTimeTravelModal,
  timeTravelInput,
  toggleMoreFeatures,
  handleFeatureClick,
  toggleStickerPanel,
  handleStickerSelect,
  confirmTimeTravel,
  cancelTimeTravel,
} = useChatPlusMenuRouter({
  messages,
  inputText,
  currentChatId,
  chatId: props.chatId,
  characterId: props.characterId,
  characterName: props.characterName,
  characterAvatar: props.characterAvatar,
  isGroupChat,
  enablePhoneDecision,
  lastMessage,
  showMoreFeatures,
  showStickerPanel,
  locationInput,
  showLocationModal,
  showWeatherModal,
  openWeatherModal,
  topicPromptInput,
  showTopicPromptModal,
  showGameScorePicker,
  showImageSearchPanel,
  imageSearchEnabled: chatImageSearchEnabled,
  scrollToBottom,
  saveChat,
  openTheater,
  openChatFilesPanel,
  startGroupCall,
  onShareMusic: handleShareMusicToChat,
  emit: emit as (e: string, ...args: any[]) => void,
});

const onInputQuickWheel = (...args: any[]) => handleQuickInputWheel(args[0] as WheelEvent);
const onInputInsertQuickAction = (...args: any[]) => insertQuickAction(args[0] as string);
const onInputKeydown = (...args: any[]) => handleKeydown(args[0] as KeyboardEvent);
const onInputMicDown = (...args: any[]) => onMicDown(args[0] as MouseEvent | TouchEvent);
const onInputStartRecording = (...args: any[]) =>
  startRecording(args[0] as MouseEvent | TouchEvent);
const onInputStickerSelect = (...args: any[]) => handleStickerSelect(args[0]);
const onInputFeatureClick = (...args: any[]) => handleFeatureClick(args[0] as string);

// ===== 聊天設定選單 =====
const showChatSettingsMenu = ref(false);

// ===== MiniMax TTS 語音合成 composable =====
const {
  chatMinimaxTTSOverride,
  showMinimaxTTSSettingsModal,
  toggleMinimaxTTS,
  openMinimaxTTSSettings,
  closeMinimaxTTSSettings,
  saveMinimaxTTSSettings,
  processMessageTTS,
} = useChatTTS({
  messages,
  chatMinimaxTTSEnabled,
  showChatSettingsMenu,
  settingsStore,
  saveChat,
});

// ===== 快速輸入助手 composable =====
const {
  isInputFocused,
  messageInputRef,
  isInputExpanded,
  expandedInputRef,
  showQuickActionEditor,
  editingQuickActions,
  newActionLabel,
  newActionText,
  newActionHint,
  quickActions,
  toggleInputExpand,
  closeExpandedInput,
  sendFromExpanded,
  openQuickActionEditor,
  addNewQuickAction,
  removeEditingQuickAction,
  saveQuickActions,
  cancelQuickActionEdit,
  onInputFocus,
  onInputBlur,
  autoResizeInput,
  insertQuickAction,
} = useChatInputHelper({
  inputText,
  sendAndTriggerAI,
});

// 同步子元件 textarea DOM ref 回 composable（autoResize、focus、insertQuickAction 需要直接操作 DOM）
watchEffect(() => {
  if (inputAreaRef.value) {
    messageInputRef.value = inputAreaRef.value.messageTextareaRef ?? null;
    expandedInputRef.value = inputAreaRef.value.expandedTextareaRef ?? null;
  }
});

// ===== 訊息操作 composable =====
const {
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
  handleReplyById,
  cancelReply,
  getReplyToContent,
  getReplyToName,
} = useChatMessageActions({
  messages,
  chatFaceToFaceMode,
  displayCharacterName,
  userName: computed(() => userStore.currentName || "用戶"),
  effectivePersona,
  currentCharacter,
  saveChatImmediate,
  focusReplyInput: () => {
    const textarea = isInputExpanded.value
      ? expandedInputRef.value
      : messageInputRef.value;
    if (!textarea) return;
    textarea.focus();
    const cursorPosition = textarea.value.length;
    textarea.setSelectionRange(cursorPosition, cursorPosition);
  },
});

// 快速輸入助手橫向捲動
function handleQuickInputWheel(e: WheelEvent) {
  const container = e.currentTarget as HTMLElement;
  // 觸控板原生橫向滾動（deltaX）優先，否則將垂直滾輪（deltaY）轉換為橫向
  const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
  if (delta === 0) return;
  container.scrollLeft += delta;
}

// ===== 外觀設定 composable =====
const { chatAppearance, saveAppearance, applyChatAppearance } = useChatAppearance({
  chatScreenRef,
  settingsStore,
  themeStore,
  chatStore,
  saveChat,
  getPendingAppearance: () => props.pendingAppearance,
  onAppearanceApplied: () => emit("appearanceApplied"),
});

// ===== 流式輸出窗口 =====
const streamingWindow = useStreamingWindow();
// 是否正在最小化（用於動畫）— 現在由 App.vue 管理動畫
// 保留 ref 以防其他地方引用
const isMinimizing = ref(false);

// 是否使用流式輸出窗口
const useStreamingWindowEnabled = computed(
  () => settingsStore.generation.useStreamingWindow,
);

// 上次總結/日記的時間戳（用於計算間隔）
const lastSummaryTime = ref<number>(0);
const lastDiaryTime = ref<number>(0);

// ===== 重要事件提取 composable =====
const { triggerAutoEventsExtraction, handleTriggerManualEvents } =
  useChatEventsExtraction({
    messages,
    currentChatId,
    currentCharacter,
    effectivePersona,
    isGenerating,
    isGeneratingSummary,
    isExtractingEvents,
    chatSummarySettings,
    streamingWindow,
    useStreamingWindowEnabled,
    characterName: props.characterName,
    characterAvatar: props.characterAvatar,
  });

// ===== 總結/日記 composable =====
const {
  summaryGeneratingLock,
  diaryGeneratingLock,
  stripOutputTags,
  saveSummary,
  deleteSummaryFromDB,
  saveDiary,
  deleteDiaryFromDB,
  checkAndTriggerSummaryOrDiary,
  handleTriggerManualSummary,
  handleSummarySettingsSave,
  handleToggleSummaryImportant,
  handleDeleteSummary,
  handleDeleteSelected,
  handleEditSummary,
  handleGenerateMetaSummary,
  handleImportSummaries,
  handleToggleDiaryFavorite,
  handleDeleteDiary,
  handleTriggerManualDiary,
  summarizeSingleBatch,
} = useChatSummaryDiary({
  messages,
  currentChatId,
  currentChatData,
  currentCharacter,
  effectivePersona,
  isGenerating,
  isGeneratingSummary,
  chatSummarySettings,
  chatSummaries,
  chatDiaries,
  lastSummaryTime,
  lastDiaryTime,
  streamingWindow,
  useStreamingWindowEnabled,
  characterId: props.characterId,
  characterName: props.characterName,
  characterAvatar: props.characterAvatar,
  chatId: props.chatId,
  saveChat,
  triggerAutoEventsExtraction,
});

// 是否有 AI 訊息（用於顯示重新生成按鈕）
const hasAIMessages = computed(() =>
  messages.value.some((m) => m.role === "ai"),
);

// 滾動到底部
function scrollToBottom() {
  exitSearchContextMode();
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
}

// 輸入框聚焦 + 鍵盤彈出後自動滾到底部
function handleInputFocusWithScroll() {
  onInputFocus();
  // 聚焦輸入框時自動關閉表情包面板與更多功能面板
  if (showStickerPanel.value) showStickerPanel.value = false;
  if (showMoreFeatures.value) showMoreFeatures.value = false;
  setTimeout(scrollToBottom, 350);
}

// ===== 搜索功能（composable） =====
const {
  showSearchBar,
  searchQuery,
  searchResults,
  currentSearchIndex,
  openSearchBar: _openSearchBar,
  closeSearchBar: _closeSearchBar,
  performSearch,
  resetVisibleCount,
} = useChatSearch({
  messages,
  visibleCount,
  messagePageSize: MESSAGE_PAGE_SIZE,
  scrollToBottom,
});

// openSearchBar 需要額外關閉 showMoreMenu
function openSearchBar() {
  showMoreMenu.value = false;
  _openSearchBar();
}

function closeSearchBar() {
  exitSearchContextMode();
  _closeSearchBar();
}

const searchResultTotal = computed(() => searchResults.value.length);
const searchResultOverflowCount = computed(() =>
  Math.max(0, searchResults.value.length - MAX_SEARCH_RESULT_ITEMS),
);

// 搜尋結果清單項目（含片段文字、角色、時間）
const searchResultItems = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query || searchResults.value.length === 0) return [];
  const msgMap = new Map(messages.value.map((m) => [m.id, m]));
  const SNIPPET_PAD = 28;
  return searchResults.value.slice(0, MAX_SEARCH_RESULT_ITEMS).map((id) => {
    const msg = msgMap.get(id);
    if (!msg) {
      return {
        id,
        role: "ai",
        roleLabel: "?",
        timeLabel: "",
        before: "",
        match: "",
        after: "",
      };
    }
    const content = msg.content || "";
    const lower = content.toLowerCase();
    const pos = lower.indexOf(query);
    const safePos = pos >= 0 ? pos : 0;
    const before = safePos > 0 ? content.slice(Math.max(0, safePos - SNIPPET_PAD), safePos) : "";
    const match = pos >= 0 ? content.slice(safePos, safePos + query.length) : content.slice(0, query.length);
    const afterStart = safePos + query.length;
    const after = content.slice(afterStart, afterStart + SNIPPET_PAD);
    const role = msg.role as "user" | "ai" | "system";
    const roleLabel = role === "user" ? "我" : role === "ai" ? "對方" : "系統";
    const ts = msg.timestamp ? new Date(msg.timestamp) : null;
    const timeLabel = ts
      ? `${ts.getMonth() + 1}/${ts.getDate()} ${String(ts.getHours()).padStart(2, "0")}:${String(ts.getMinutes()).padStart(2, "0")}`
      : "";
    return {
      id,
      role,
      roleLabel,
      timeLabel,
      before: before ? (safePos > SNIPPET_PAD ? "…" + before : before) : "",
      match,
      after: after + (afterStart + SNIPPET_PAD < content.length ? "…" : ""),
    };
  });
});

function scrollRenderedMessageIntoView(messageId: string): boolean {
  const messageElement = document.querySelector(
    `[data-message-id="${CSS.escape(messageId)}"]`,
  );
  if (!messageElement) return false;
  messageElement.scrollIntoView({ behavior: "auto", block: "center" });
  messageElement.classList.add("highlight-message");
  setTimeout(() => {
    messageElement.classList.remove("highlight-message");
  }, 2000);
  return true;
}

async function activateSearchContext(targetMessageId: string): Promise<boolean> {
  const targetIndex = messages.value.findIndex((m) => m.id === targetMessageId);
  if (targetIndex === -1) return false;

  const start = Math.max(0, targetIndex - SEARCH_CONTEXT_BEFORE_COUNT);
  const end = Math.min(
    messages.value.length,
    targetIndex + SEARCH_CONTEXT_AFTER_COUNT + 1,
  );
  searchContextMessages.value = messages.value.slice(start, end);
  searchContextTargetId.value = targetMessageId;
  isSearchContextMode.value = true;

  await nextTick();
  await nextTick();
  return scrollRenderedMessageIntoView(targetMessageId);
}

// 滾動到指定消息；搜尋/回覆定位時只渲染目標附近上下文，避免一次展開大量歷史訊息
async function scrollToMessage(messageId: string) {
  searchJumpStatus.value = "loading";
  try {
    if (scrollRenderedMessageIntoView(messageId)) {
      searchJumpStatus.value = "idle";
      return;
    }
    const ok = await activateSearchContext(messageId);
    searchJumpStatus.value = ok ? "idle" : "error";
  } catch (error) {
    console.warn("[ChatScreen] 跳轉訊息失敗:", error);
    searchJumpStatus.value = "error";
  }
}

// 點擊結果清單某筆：設定為當前項目並跳轉
function onSearchResultClick(idx: number) {
  if (idx < 0 || idx >= searchResults.value.length) return;
  currentSearchIndex.value = idx;
  scrollToMessage(searchResults.value[idx]);
}

function goToPrevSearchResult() {
  if (searchResults.value.length === 0) return;
  const nextIdx =
    currentSearchIndex.value <= 0
      ? searchResults.value.length - 1
      : currentSearchIndex.value - 1;
  onSearchResultClick(nextIdx);
}

function goToNextSearchResult() {
  if (searchResults.value.length === 0) return;
  const nextIdx =
    currentSearchIndex.value >= searchResults.value.length - 1
      ? 0
      : currentSearchIndex.value + 1;
  onSearchResultClick(nextIdx);
}

// Enter 鍵：若有結果就跳到當前選中筆（預設第 0 筆）
function onSearchEnter() {
  if (searchResults.value.length === 0) return;
  const idx = Math.max(0, currentSearchIndex.value);
  onSearchResultClick(idx);
}

// 發送訊息（只添加用戶訊息，不觸發 AI）
function addUserMessage() {
  const text = inputText.value.trim();
  if (!text || isGenerating.value) return;

  // 清除整輪滑動候選（進入下一輪後不再需要）
  clearRoundSwipes();

  // 生成新的輪次 ID
  currentTurnId.value = crypto.randomUUID();

  // 依發言模式決定 role：char → ai、system → system、user → user
  const mode = chatSpeakerMode.value;
  const role: "user" | "ai" | "system" =
    mode === "char" ? "ai" : mode === "system" ? "system" : "user";
  const content = mode === "user" ? applyUserInputRegex(text) : text;

  const newMessage: Message = {
    id: `msg_${Date.now()}`,
    role,
    content,
    timestamp: Date.now(),
    replyTo: replyingTo.value?.id, // 添加回覆引用
    // 被角色封鎖時，用戶發的訊息標記為「發送失敗」（角色暫時看不到，解封後可見）
    ...(mode === "user" && isBlockedByChar.value
      ? { sentWhileBlocked: true }
      : {}),
  };
  messages.value.push(newMessage);
  inputText.value = "";
  if (currentChatId.value) chatStore.clearDraft(currentChatId.value);
  replyingTo.value = null; // 清除回覆目標
  scrollToBottom();

  // 保存聊天
  saveChat();
}

// 發送訊息並觸發 AI 回覆（點擊發送按鈕時使用）
async function sendAndTriggerAI() {
  const text = inputText.value.trim();

  // 發言模式：char / system 時不觸發 AI，直接以對應 role 插入訊息
  if (text && !isGenerating.value && chatSpeakerMode.value !== "user") {
    const mode = chatSpeakerMode.value;
    clearSwipesOnLastAIMessage();
    clearRoundSwipes();
    currentTurnId.value = crypto.randomUUID();
    const newMessage: Message = {
      id: `msg_${Date.now()}`,
      role: mode === "char" ? "ai" : "system",
      content: text,
      timestamp: Date.now(),
      replyTo: replyingTo.value?.id,
    };
    messages.value.push(newMessage);
    inputText.value = "";
    if (currentChatId.value) chatStore.clearDraft(currentChatId.value);
    replyingTo.value = null;
    scrollToBottom();
    await saveChatImmediate();
    return;
  }

  // 如果有輸入內容，先添加用戶訊息
  if (text && !isGenerating.value) {
    // 清理最後一條 AI 訊息的滑動選項（對話繼續後不需要保留其他選項）
    clearSwipesOnLastAIMessage();
    // 清除整輪滑動候選（進入下一輪後不再需要）
    clearRoundSwipes();

    // 生成新的輪次 ID
    currentTurnId.value = crypto.randomUUID();

    // 添加用戶訊息（套用角色 regex_scripts USER_INPUT）
    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: "user",
      content: applyUserInputRegex(text),
      timestamp: Date.now(),
      replyTo: replyingTo.value?.id,
      // 被角色封鎖時，用戶發的訊息標記為「發送失敗」（角色暫時看不到，解封後可見）
      ...(isBlockedByChar.value ? { sentWhileBlocked: true } : {}),
    };
    messages.value.push(userMessage);
    inputText.value = "";
    if (currentChatId.value) chatStore.clearDraft(currentChatId.value);
    replyingTo.value = null;
    scrollToBottom();

    // 先保存用戶訊息到 IDB，防止切頁面後丟失
    await saveChatImmediate();

    // 重置主動發訊息計時器（用戶有互動，重新計算下次自動發訊時間）
    if (props.characterId) {
      proactiveMessageService.resetTimer(props.characterId).catch(() => {});
    }
  }

  // 被角色封鎖期間，不觸發 AI 回覆（訊息已標記 sentWhileBlocked，角色看不到）
  if (isBlockedByChar.value) return;

  // 空輸入 + 最後一條是 AI 訊息 → 視為「繼續」（讓 AI 接著說）
  // 但 char / system 發言模式下不觸發繼續，避免誤觸
  if (!text && lastAIMessage.value && chatSpeakerMode.value === "user") {
    const lastMsg = messages.value[messages.value.length - 1];
    // 確認最後一條確實是 AI 訊息（排除中間有系統通知的情況）
    if (lastMsg && lastMsg.role === "ai" && !lastMsg.isStreaming) {
      await continueGeneration();
      return;
    }
  }

  // 空輸入時，char / system 發言模式下不觸發 AI 生成
  if (!text && chatSpeakerMode.value !== "user") return;

  // 空輸入觸發 AI 回覆時（如跳轉魔法後），生成新的輪次 ID
  // 避免與上一輪共用 turnId，否則重新生成時會誤刪上一輪訊息
  if (!text) {
    currentTurnId.value = crypto.randomUUID();
  }

  // 觸發 AI 回覆
  await triggerAIResponse();
}

// 處理按鍵（線上模式：Enter 發送訊息；面對面模式：Enter 換行，不發送）
function handleKeydown(e: KeyboardEvent) {
  // 面對面模式：Enter 總是換行，不發送訊息
  if (chatFaceToFaceMode.value) {
    // 不阻止默認行為，允許自由換行
    return;
  }

  // 線上模式：Enter 發送訊息（Shift+Enter 換行）
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    // 輸入框為空時，直接觸發 AI 回覆（相當於再按一次發送）
    if (!inputText.value.trim()) {
      sendAndTriggerAI();
    } else {
      addUserMessage();
    }
  }
}

// 日期分隔符：判斷是否顯示
function shouldShowDateSeparator(index: number): boolean {
  if (index === 0) return true;
  const currentMsg = visibleMessages.value[index];
  const prevMsg = visibleMessages.value[index - 1];
  if (!currentMsg || !prevMsg) return false;
  const currentDate = new Date(currentMsg.timestamp).toDateString();
  const prevDate = new Date(prevMsg.timestamp).toDateString();
  return currentDate !== prevDate;
}

// 日期分隔符：格式化日期文字
function getDateSeparatorText(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return "今天";
  } else if (date.toDateString() === yesterday.toDateString()) {
    return "昨天";
  } else {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }
}

// ===== 截圖 composable =====
const {
  screenshotPreviewUrl,
  screenshotTargetId,
  handleMessageScreenshot,
  handleScreenshotRetake,
  startScreenshotSelectMode,
  toggleScreenshotSelection,
  executeBatchScreenshot,
  cancelScreenshotSelect,
} = useChatScreenshot({
  messages,
  isSelectingForScreenshot,
  screenshotSelectedIds,
});

// ===== 媒體發送 composable =====
const {
  isGeneratingImage,
  handleMediaSelect,
  handleImageUpload,
  tryGenerateImageForMessage,
  handleAIGenerateImage,
} = useChatMedia({
  messages,
  currentCharacter,
  scrollToBottom,
  saveChat,
  imageSearchEnabled: chatImageSearchEnabled,
});

// ===== 禮物面板處理 =====

// 打開商城
function handleOpenShop() {
  showGiftDrawer.value = false;
  emit("navigate", "shop");
}

// 處理轉帳
function handleTransfer(amount: number, note: string = "") {
  // 添加用戶轉帳訊息（使用新的 <pay> 格式）
  const message: Message = {
    id: `msg_${Date.now()}`,
    role: "user",
    content: note ? `<pay>${amount}:${note}</pay>` : `<pay>${amount}</pay>`,
    timestamp: Date.now(),
    isTransfer: true,
    transferType: "pay",
    transferAmount: amount,
    transferNote: note || undefined,
    transferStatus: "sent",
  };
  messages.value.push(message);
  scrollToBottom();
  saveChat();
  // 不自動觸發 AI 回覆，讓用戶可以繼續發送其他訊息
}

// 處理確認收款（用戶收取 AI 的轉帳）
async function handleAcceptTransfer(messageId: string) {
  const msgIndex = messages.value.findIndex((m) => m.id === messageId);
  if (msgIndex === -1) return;

  const msg = messages.value[msgIndex];
  if (!msg.isTransfer || msg.transferStatus !== "pending") return;

  // 更新狀態為已收款
  messages.value[msgIndex].transferStatus = "received";

  // 將金額加入用戶錢包
  if (msg.transferAmount) {
    gameEconomyStore.earnMoney(
      GLOBAL_WALLET_ID,
      msg.transferAmount,
      "transfer",
      `收到 ${getCharacterDisplayNameFromMessage(msg)} 的轉帳`,
    );
    await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
    messages.value.push(
      createTransactionClaimNoticeMessage({
        claimerName: getUserDisplayName(),
        payerName: getCharacterDisplayNameFromMessage(msg),
        kind: "轉帳",
        amount: msg.transferAmount,
        idSuffix: "transfer_user",
      }),
    );
  }

  await saveChatImmediate();
}

// 處理退回轉帳（用戶退回 AI 的轉帳，或 AI 退回用戶的轉帳）
async function handleRefundTransfer(messageId: string) {
  const msgIndex = messages.value.findIndex((m) => m.id === messageId);
  if (msgIndex === -1) return;

  const msg = messages.value[msgIndex];
  if (!msg.isTransfer || msg.transferStatus !== "pending") return;

  // 更新狀態為已退回
  messages.value[msgIndex].transferStatus = "refunded";

  // AI 的轉帳被退回，不需要處理金流（虛擬轉帳）
  saveChat();
}

// 處理語音轉文字結果更新
async function handleUpdateTranscript(messageId: string, transcript: string) {
  const msg = messages.value.find((m) => m.id === messageId);
  if (!msg) return;
  msg.audioTranscript = transcript;
  await saveChatImmediate();
}

// 處理 AI 退回用戶的轉帳
async function processAIRefund(amount: number) {
  // 將金額退回用戶錢包
  gameEconomyStore.earnMoney(
    GLOBAL_WALLET_ID,
    amount,
    "transfer",
    `${props.characterName} 退回了轉帳`,
  );
  await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
}

// 處理送禮
function handleSendGift(_giftItemId: string, giftName: string) {
  // 添加用戶送禮訊息（直接設置 isGift 屬性，不需要解析）
  const message: Message = {
    id: `msg_${Date.now()}`,
    role: "user",
    content: `<送禮物>${giftName}</送禮物>`,
    timestamp: Date.now(),
    isGift: true,
    giftName: giftName,
  };
  messages.value.push(message);
  scrollToBottom();
  saveChat();
  // 不自動觸發 AI 回覆，讓用戶可以繼續發送其他訊息
}

// 處理 Pixabay 圖片搜尋選擇：建立 image-url 訊息並加入聊天
function handleImageSearchSelect(imageUrl: string, caption: string) {
  const message: Message = {
    id: `msg_${Date.now()}`,
    role: "user",
    content: caption || "[圖片]",
    timestamp: Date.now(),
    messageType: "image-url",
    imageUrl,
    imageCaption: caption,
  };
  messages.value.push(message);
  scrollToBottom();
  saveChat();
  showImageSearchPanel.value = false;
}

// 處理禮物接收（AI 回覆後自動觸發）
async function processGiftReceived() {
  // 找到最近一條未接收的用戶禮物訊息
  const pendingGiftIndex = messages.value.findIndex(
    (m) => m.role === "user" && m.isGift && !m.giftReceived,
  );

  if (pendingGiftIndex === -1) return;

  const giftMessage = messages.value[pendingGiftIndex];

  // 檢查禮物訊息後面是否有 AI 回覆（表示角色已收到禮物）
  const hasAIReplyAfterGift = messages.value
    .slice(pendingGiftIndex + 1)
    .some((m) => m.role === "ai");

  if (!hasAIReplyAfterGift) return;

  // 標記禮物為已接收
  messages.value[pendingGiftIndex].giftReceived = true;

  // 記錄到重要事件紀錄本
  await recordGiftToImportantEvents(giftMessage.giftName || "禮物");

  // 發送禮物接收通知
  const charName =
    currentCharacter.value?.data?.name || props.characterName || "角色";
  notificationStore.notifyGiftReceived(
    giftMessage.giftName || "禮物",
    charName,
  );

  // 保存聊天
  await saveChatImmediate();

  console.log(`[ChatScreen] 禮物「${giftMessage.giftName}」已被角色接收並記錄`);
}

// 記錄禮物到重要事件紀錄本
async function recordGiftToImportantEvents(giftName: string) {
  if (!currentChatId.value) return;

  const characterId = props.characterId || currentCharacter.value?.id;
  if (!characterId) return;

  const charName =
    currentCharacter.value?.data?.name || props.characterName || "角色";
  const userName = userStore.currentPersona?.name || "{{user}}";

  try {
    // 載入或創建重要事件記錄本
    const logId = currentChatId.value;
    let eventsLog = await db.get<ImportantEventsLog>(
      DB_STORES.IMPORTANT_EVENTS,
      logId,
    );

    if (!eventsLog) {
      eventsLog = createDefaultImportantEventsLog(
        characterId,
        currentChatId.value,
      );
    }

    // 檢查是否啟用
    if (!eventsLog.settings.enabled) return;

    // 創建禮物接收事件
    const event = createImportantEvent(
      `${userName} 送了「${giftName}」給 ${charName}`,
      {
        category: "relationship",
        priority: 2,
        source: "system",
        tags: ["禮物", giftName],
      },
    );

    // 添加到事件列表
    eventsLog.events.unshift(event);

    // 限制最大事件數量
    if (eventsLog.events.length > eventsLog.settings.maxEvents) {
      eventsLog.events = eventsLog.events.slice(
        0,
        eventsLog.settings.maxEvents,
      );
    }

    eventsLog.updatedAt = Date.now();

    // 保存
    const plainData = JSON.parse(JSON.stringify(eventsLog));
    await db.put(DB_STORES.IMPORTANT_EVENTS, plainData);

    console.log(`[ChatScreen] 禮物事件已記錄到重要事件紀錄本:`, event.content);

    // 為禮物事件生成向量嵌入（背景執行）
    if (settingsStore.vectorMemoryEnabled && currentChatId.value) {
      import("@/services/memoryRetriever").then(
        ({ MemoryRetrieverService }) => {
          const retriever = new MemoryRetrieverService();
          retriever
            .generateAndStoreEmbedding(
              event.id,
              "event",
              event.content,
              currentChatId.value!,
              characterId,
            )
            .catch((e) => console.warn("[重要事件] 禮物事件嵌入失敗:", e));
        },
      );
    }
  } catch (e) {
    console.error("[ChatScreen] 記錄禮物事件失敗:", e);
  }
}

// 重新生成文生圖（支援失敗後的描述卡，以及已成功生成的圖片）
async function handleRegenerateImage(id: string) {
  const msg = messages.value.find((m) => m.id === id);
  if (!msg) return;
  const isRegenerableImage =
    ["descriptive-image", "image", "image-url"].includes(msg.messageType || "") ||
    !!msg.imageUrl;
  if (!isRegenerableImage) return;
  if (msg.isStreaming) return;

  const prompt = msg.imagePrompt?.trim();
  const caption = msg.imageCaption?.trim();
  if (!prompt && !caption) return;

  await tryGenerateImageForMessage(id, prompt, caption);
}

/**
 * 標記目前正在進行的 AI 生成是否處於小劇場「小手機劇本格式」模式。
 * triggerAIResponse 啟動時設值，結束（finally）清掉；handleStreamingClose
 * 也會讀這個 flag 以便在使用者手動關閉串流窗口時套用左右分邊。
 */
let _theaterPhoneScriptForCurrentGeneration = false;

/**
 * 小劇場「小手機劇本格式」前綴檢測：
 * 支援的前綴（不分大小寫，半形/全形冒號皆可，前後空格容錯）：
 *   - 字面：user / char / 使用者 / 用戶 / 用户 / 角色
 *   - 實際名字：傳入的 userName（如 persona 名稱）/ charName（如角色名）
 * 若以「user 類」開頭 → 回傳 role: 'user'；以「char 類」開頭 → role: 'ai'。
 * 沒有匹配時回傳 null（呼叫端維持原本的 role）。
 */
function applyTheaterPhoneScriptPrefix(
  content: string | undefined | null,
  userName?: string,
  charName?: string,
): { role: "user" | "ai"; content: string } | null {
  if (!content || typeof content !== "string") return null;

  // 1) 字面 user/char 前綴
  const literalMatch = content.match(
    /^\s*(user|char|使用者|用戶|用户|角色)\s*[：:]\s*/i,
  );
  if (literalMatch) {
    const tag = literalMatch[1].toLowerCase();
    const stripped = content.slice(literalMatch[0].length);
    if (tag === "user" || tag === "使用者" || tag === "用戶" || tag === "用户") {
      return { role: "user", content: stripped };
    }
    return { role: "ai", content: stripped };
  }

  // 2) 實際名字前綴（user persona 名 / char 名）
  const trimmedUser = (userName || "").trim();
  const trimmedChar = (charName || "").trim();
  if (trimmedUser) {
    const re = new RegExp(`^\\s*${_escapeRegex(trimmedUser)}\\s*[：:]\\s*`, "i");
    const m = content.match(re);
    if (m) return { role: "user", content: content.slice(m[0].length) };
  }
  if (trimmedChar) {
    const re = new RegExp(`^\\s*${_escapeRegex(trimmedChar)}\\s*[：:]\\s*`, "i");
    const m = content.match(re);
    if (m) return { role: "ai", content: content.slice(m[0].length) };
  }

  return null;
}

/**
 * 判斷某個 parsedMsg 是否適用「小手機劇本格式」前綴/分邊處理。
 * 純文字訊息才會套，特殊類型（紅包、語音、時空跳轉、撤回、面對面…）一律跳過。
 */
function _isTheaterScriptEligible(parsedMsg: any): boolean {
  if (!parsedMsg) return false;
  return !(
    parsedMsg.isTimetravel ||
    parsedMsg.isRedpacket ||
    parsedMsg.isLocation ||
    parsedMsg.isTransfer ||
    parsedMsg.isGift ||
    parsedMsg.isAvatarChange ||
    parsedMsg.isAiImage ||
    parsedMsg.isHtmlBlock ||
    parsedMsg.isVoice ||
    parsedMsg.isCharRecall ||
    parsedMsg.isFaceToFaceRequest ||
    parsedMsg.isOnlineModeRequest ||
    parsedMsg.isWaimaiPaymentResult ||
    parsedMsg.isWaimaiDelivery
  );
}

/**
 * 為一整批 parsedMessages 預先決定每條訊息的左右分邊與內容清理。
 *
 * 邏輯：
 *   1. 對每條符合資格的訊息嘗試前綴偵測（user:/char: 字面或實際名字）。
 *   2. 若全批一條前綴都沒命中（AI 沒照格式輸出），且符合資格的訊息 ≥ 2
 *      條，回退成「user 起頭交替分邊」（user, ai, user, ai…），避免全部
 *      擠在同一側。
 *   3. 部分命中的情況：尊重命中結果，沒命中的維持 null（由呼叫端用預設 ai）。
 *
 * 回傳的 Map：key = parsed.messages 索引；value = { role, content }（content 已剝前綴）。
 */
function computeTheaterPhoneScriptRoleMap(
  parsedMessages: any[],
  userName?: string,
  charName?: string,
): Map<number, { role: "user" | "ai"; content: string }> {
  const result = new Map<number, { role: "user" | "ai"; content: string }>();
  if (!Array.isArray(parsedMessages) || parsedMessages.length === 0) return result;

  // 比對 senderName 用：除了 {{user}} / {{char}} 字面標記，也容忍 AI 改寫成實際名字。
  const _normName = (s: unknown): string =>
    typeof s === "string" ? s.trim().toLowerCase() : "";
  const _trimmedUser = (userName || "").trim();
  const _trimmedChar = (charName || "").trim();
  const _userAliases = new Set<string>(
    ["{{user}}", "user", "使用者", "用戶", "用户"]
      .concat(_trimmedUser ? [_trimmedUser] : [])
      .map((s) => s.toLowerCase()),
  );
  const _charAliases = new Set<string>(
    ["{{char}}", "char", "角色"]
      .concat(_trimmedChar ? [_trimmedChar] : [])
      .map((s) => s.toLowerCase()),
  );
  const _roleFromSenderName = (
    senderName: unknown,
  ): "user" | "ai" | null => {
    const norm = _normName(senderName);
    if (!norm) return null;
    if (_userAliases.has(norm)) return "user";
    if (_charAliases.has(norm)) return "ai";
    return null;
  };

  // pass 1：先看 <msg name="..."> 屬性，再看舊式內容前綴
  const eligibleIndices: number[] = [];
  let hits = 0;
  for (let i = 0; i < parsedMessages.length; i++) {
    const pm = parsedMessages[i];
    if (!_isTheaterScriptEligible(pm)) continue;
    eligibleIndices.push(i);

    // 1a) 優先：<msg name="{{user}}"> / <msg name="{{char}}"> 屬性
    const roleFromAttr = _roleFromSenderName(pm?.senderName);
    if (roleFromAttr) {
      result.set(i, {
        role: roleFromAttr,
        content: typeof pm?.content === "string" ? pm.content : "",
      });
      hits++;
      continue;
    }

    // 1b) 後備：舊版內容前綴（user:/char:/persona名/角色名）
    const stripped = applyTheaterPhoneScriptPrefix(pm?.content, userName, charName);
    if (stripped) {
      result.set(i, stripped);
      hits++;
    }
  }

  // pass 2：AI 完全沒下前綴 → 交替分邊 fallback
  if (hits === 0 && eligibleIndices.length >= 2) {
    let toggle: "user" | "ai" = "user";
    for (const idx of eligibleIndices) {
      const pm = parsedMessages[idx];
      result.set(idx, {
        role: toggle,
        content: typeof pm?.content === "string" ? pm.content : "",
      });
      toggle = toggle === "user" ? "ai" : "user";
    }
  }

  return result;
}

// 觸發 AI 回覆（不發送用戶訊息，只生成 AI 回覆）
// skipAutoTrigger: 跳過自動觸發總結/日記（用於重新生成場景）
async function triggerAIResponse(options?: ChatTriggerAIResponseOptions) {
  if (!currentChatId.value) return;
  if (isGenerating.value) return;
  // 被角色封鎖期間，除非明確繞過（如好友申請），否則不觸發 AI 生成
  if (isBlockedByChar.value && !options?.bypassBlockCheck) return;
  const generationTurnId = currentTurnId.value || "";

  // 使用全局狀態管理開始生成
  const startResult = startChatGeneration({
    characterName: currentCharacter.value?.data?.name || props.characterName,
    characterAvatar: props.characterAvatar,
  });

  if (!startResult.success) {
    console.warn("[ChatScreen] 無法開始生成:", startResult.error);
    return;
  }

  const controller = startResult.controller!;
  let latestFinalContent = "";
  let usedStreamingWindowForCurrentGeneration = false;
  // 把本輪是否為小劇場小手機劇本格式存到模組變數，handleStreamingClose 可以讀
  _theaterPhoneScriptForCurrentGeneration = !!options?.theaterPhoneScript;

  try {
    const chatTaskConfig = settingsStore.getAPIForTask("chat");

    if (
      !chatTaskConfig.api.endpoint ||
      !chatTaskConfig.api.apiKey ||
      !chatTaskConfig.api.model
    ) {
      throw new Error("請先在設定中配置 API");
    }

    const char = currentCharacter.value;
    if (!char) {
      console.warn(
        "[ChatScreen] 未找到角色資料! characterId:",
        props.characterId,
        "characterName:",
        props.characterName,
      );
      throw new Error("未找到角色資料");
    }

    // 收集關聯的世界書
    const linkedLorebooks: Lorebook[] = [];

    // 輔助函數：標準化 position 值
    const normalizePosition = (entry: any): number => {
      // 優先使用 extensions.position（SillyTavern 標準格式）
      if (
        entry.extensions?.position !== undefined &&
        typeof entry.extensions.position === "number"
      ) {
        return entry.extensions.position;
      }
      // 數字格式直接返回
      if (typeof entry.position === "number") {
        return entry.position;
      }
      // 字串格式轉換
      if (typeof entry.position === "string") {
        const positionMap: Record<string, number> = {
          before_char: 0,
          after_char: 1,
          an_top: 2,
          an_bottom: 3,
          at_depth: 4,
          em_top: 5,
          em_bottom: 6,
          outlet: 7,
          "0": 0,
          "1": 1,
          "2": 2,
          "3": 3,
          "4": 4,
          "5": 5,
          "6": 6,
          "7": 7,
        };
        return positionMap[entry.position.toLowerCase()] ?? 0;
      }
      return 0;
    };

    // 1. 角色卡內嵌的世界書
    if (char.data.character_book) {
      linkedLorebooks.push({
        id: `embedded_${char.id}`,
        name: `${char.data.name}_embedded`,
        description: "角色卡內嵌世界書",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        entries: (char.data.character_book.entries || []).map(
          (e: any, idx: number) => ({
            uid: e.id || idx,
            key: Array.isArray(e.keys) ? e.keys : e.key ? [e.key] : [],
            keysecondary: Array.isArray(e.secondary_keys)
              ? e.secondary_keys
              : [],
            comment: e.comment || e.name || "",
            content: e.content || "",
            constant: e.constant || false,
            disable: e.enabled === false || e.disable === true,
            selective: e.selective || false,
            selectiveLogic:
              e.selectiveLogic ?? e.extensions?.selectiveLogic ?? 0,
            order: e.insertion_order ?? e.order ?? 100,
            position: normalizePosition(e),
            depth: e.extensions?.depth ?? e.depth ?? 4,
            role: e.extensions?.role ?? e.role ?? 0,
            useProbability: e.extensions?.useProbability ?? false,
            probability: e.extensions?.probability ?? 100,
            preventRecursion: e.extensions?.prevent_recursion ?? false,
            excludeRecursion: e.extensions?.exclude_recursion ?? false,
            delayUntilRecursion: 0,
            sticky: 0,
            cooldown: 0,
            delay: 0,
            scanDepth: e.extensions?.scan_depth ?? null,
            caseSensitive: e.extensions?.case_sensitive ?? null,
            matchWholeWords: e.extensions?.match_whole_words ?? null,
            useGroupScoring: e.extensions?.use_group_scoring ?? null,
            automationId: e.extensions?.automation_id ?? null,
            vectorized: e.extensions?.vectorized ?? false,
            groupOverride: e.extensions?.group_override ?? false,
            groupWeight: e.extensions?.group_weight ?? 100,
            group: e.extensions?.group ?? "",
            ignoreBudget: false,
            matchPersonaDescription: false,
            matchCharacterDescription: false,
            matchCharacterPersonality: false,
            matchCharacterDepthPrompt: false,
            matchScenario: false,
            matchCreatorNotes: false,
            triggers: [],
            outletName: e.extensions?.outletName ?? "",
            addMemo: false,
          }),
        ),
        recursiveScanning: false,
        scanDepth: 2,
        caseSensitive: false,
        matchWholeWords: false,
      });
    }

    // 2. 角色關聯的世界書
    if (char.lorebookIds && char.lorebookIds.length > 0) {
      for (const lorebookId of char.lorebookIds) {
        const lorebook = lorebooksStore.lorebooks.find(
          (lb) => lb.id === lorebookId,
        );
        if (lorebook) {
          linkedLorebooks.push(lorebook);
        }
      }
    }

    // 3. 全局世界書
    const globalLorebooks = lorebooksStore.lorebooks.filter(
      (lb) => lb.isGlobal,
    );
    linkedLorebooks.push(...globalLorebooks);

    // 4. 群聊綁定的世界書（僅此群組生效，不重複添加）
    if (isGroupChat.value && groupMetadata.value?.lorebookIds?.length) {
      for (const lorebookId of groupMetadata.value.lorebookIds) {
        if (!linkedLorebooks.some((lb) => lb.id === lorebookId)) {
          const lorebook = lorebooksStore.lorebooks.find(
            (lb) => lb.id === lorebookId,
          );
          if (lorebook) {
            linkedLorebooks.push(lorebook);
          }
        }
      }
    }

    // 將本地消息轉換為 ChatMessage 格式（包含圖片資訊）
    // 根據設定限制讀取的消息數量
    const actualCount = chatSummarySettings.value.actualMessageCount;
    const actualMode = chatSummarySettings.value.actualMessageMode;

    // 先過濾掉尚未到達排程時間的物流進度訊息，避免角色「看到未來」
    const now = Date.now();
    const eligibleMessages = messages.value.filter(
      (m) => !(m.isWaimaiProgress && m.timestamp > now),
    );

    let messagesToUse: typeof messages.value;
    if (actualMode === "turn") {
      // 按輪次讀取：每輪 = 用戶發言 + AI 回覆
      let turnCount = 0;
      let startIndex = eligibleMessages.length;
      for (let i = eligibleMessages.length - 1; i >= 0; i--) {
        if (eligibleMessages[i].role === "ai") {
          turnCount++;
          if (turnCount >= actualCount) {
            // 往前找到這輪的 user 消息
            for (let j = i - 1; j >= 0; j--) {
              if (eligibleMessages[j].role === "user") {
                startIndex = j;
                break;
              }
            }
            if (startIndex === eligibleMessages.length) {
              startIndex = i;
            }
            break;
          }
        }
        startIndex = i;
      }
      messagesToUse = eligibleMessages.slice(startIndex);
    } else {
      // 按消息數讀取
      messagesToUse = eligibleMessages.slice(-actualCount);
    }

    const chatMessages: ChatMessage[] = messagesToUse.map((m) => ({
      id: m.id,
      sender:
        m.role === "user"
          ? ("user" as const)
          : m.role === "system"
            ? ("system" as const)
            : ("assistant" as const),
      name:
        m.role === "user"
          ? "User"
          : m.role === "system"
            ? "system"
            : m.senderCharacterName || char.data.name,
      content: m.content,
      is_user: m.role === "user",
      status: "sent" as const,
      createdAt: m.timestamp,
      updatedAt: m.timestamp,
      // 圖片相關欄位
      messageType: m.messageType,
      imageUrl: m.imageUrl,
      imageData: m.imageData,
      imageMimeType: m.imageMimeType,
      imageCaption: m.imageCaption,
      // 時間跳轉 / 小劇場相關
      isTimetravel: m.isTimetravel,
      timetravelContent: m.timetravelContent,
      // 回覆引用
      replyTo: m.replyTo,
      replyToContent: m.replyToContent,
      // 封鎖狀態
      sentWhileBlocked: m.sentWhileBlocked,
      // 發送者角色 ID（群聊）
      senderCharacterId: m.senderCharacterId,
    }));

    // 使用 PromptBuilder 構建提示詞
    // 確保 promptManagerStore 已載入最新配置
    await promptManagerStore.loadConfig();

    // 準備總結數據（根據設定決定讀取數量）
    const summaryReadCount =
      chatSummarySettings.value.summaryReadMode === "all"
        ? chatSummaries.value.length
        : chatSummarySettings.value.summaryReadCount;
    const summariesToSend =
      chatSummaries.value.length > 0
        ? chatSummaries.value
            .sort((a, b) => b.createdAt - a.createdAt) // 最新的在前
            .slice(0, summaryReadCount)
            .map((s) => ({
              id: s.id,
              content: s.content,
              createdAt: s.createdAt,
              isImportant: s.isImportant,
            }))
        : [];

    // 向量記憶檢索（使用全域開關，排除數量跟隨總結讀取設定）
    let vectorMemories:
      | import("@/services/memoryRetriever").RetrievedMemory[]
      | undefined;
    if (
      settingsStore.vectorMemoryEnabled &&
      chatSummarySettings.value.summaryReadMode !== "all"
    ) {
      try {
        // 取得最後一條用戶訊息作為查詢文本
        const lastUserMsg = [...messagesToUse]
          .reverse()
          .find((m) => m.role === "user");
        if (lastUserMsg?.content) {
          const retriever = new (
            await import("@/services/memoryRetriever")
          ).MemoryRetrieverService();
          // 傳入近期對話訊息和角色名稱，啟用雙路搜尋 + 關鍵詞擴展
          const recentMsgs = messages.value.slice(-15);
          const charNames = [
            char.data.name,
            ...(char.data.alternate_greetings ? [] : []),
          ].filter(Boolean);
          vectorMemories = await retriever.retrieve(
            lastUserMsg.content,
            props.chatId,
            chatSummarySettings.value.vectorTopK ?? 5,
            chatSummarySettings.value.vectorThreshold ?? 0.3,
            recentMsgs,
            charNames,
            chatSummarySettings.value.summaryReadCount,
          );
          console.log(`[向量記憶] 檢索到 ${vectorMemories.length} 條相關記憶`);
        }
      } catch (err) {
        console.error("[向量記憶] 檢索失敗，使用時間排序總結:", err);
      }
    } else if (
      settingsStore.vectorMemoryEnabled &&
      chatSummarySettings.value.summaryReadMode === "all"
    ) {
      console.log("[向量記憶] ℹ️ 總結讀取模式為「全部」，向量檢索不適用，跳過");
    }

    // 準備重要事件數據（向量記憶啟用時，從檢索結果中分離事件類型）
    let eventsToSend: Array<{
      id: string;
      content: string;
      category?: string;
      priority?: number;
    }> = [];

    if (
      settingsStore.vectorMemoryEnabled &&
      vectorMemories &&
      vectorMemories.length > 0
    ) {
      // 從向量檢索結果中提取 event 類型的記憶
      const vectorEvents = vectorMemories.filter(
        (m) => m.sourceType === "event",
      );
      // 非 event 類型的保留在 vectorMemories 中（總結/日記）
      vectorMemories = vectorMemories.filter((m) => m.sourceType !== "event");

      if (vectorEvents.length > 0) {
        eventsToSend = vectorEvents.map((m) => ({
          id: m.sourceId,
          content: m.content,
        }));
        console.log(
          `[向量記憶] 📋 從檢索結果分離出 ${vectorEvents.length} 條重要事件`,
        );
      }

      // 補充：始終注入高優先級事件（priority=1），即使向量未命中
      const allEvents = await loadImportantEventsForPrompt();
      const highPriorityEvents = allEvents.filter(
        (e) => e.priority === 1 && !eventsToSend.some((ve) => ve.id === e.id),
      );
      if (highPriorityEvents.length > 0) {
        eventsToSend.push(...highPriorityEvents);
        console.log(
          `[向量記憶] ⭐ 補充 ${highPriorityEvents.length} 條高優先級事件`,
        );
      }
    } else {
      // 向量記憶未啟用，使用全量載入（原有行為）
      eventsToSend = await loadImportantEventsForPrompt();
    }

    // 準備天氣數據（優先使用聊天專屬位置覆蓋，回退至全域天氣）
    let weatherInfoToSend: typeof weatherStore.weatherData extends null
      ? undefined
      :
          | {
              location: string;
              condition: string;
              temperature: number;
              feelsLike: number;
              humidity: number;
              windSpeed?: number;
              windDir?: string;
              uv?: number;
            }
          | undefined = undefined;

    const locOverride = chatLocationOverride.value;
    if (locOverride) {
      // 嘗試取得覆蓋位置的天氣
      try {
        let overrideWeather = null;
        if (locOverride.lat !== undefined && locOverride.lon !== undefined) {
          overrideWeather = await getWeatherByCoords(
            locOverride.lat,
            locOverride.lon,
          );
        } else if (locOverride.city) {
          overrideWeather = await getWeatherByCity(locOverride.city);
        }
        if (overrideWeather) {
          weatherInfoToSend = {
            location: formatFullLocation(overrideWeather.location) || overrideWeather.location.name,
            condition: overrideWeather.current.condition.text,
            temperature: Math.round(overrideWeather.current.temp_c),
            feelsLike: Math.round(overrideWeather.current.feelslike_c),
            humidity: overrideWeather.current.humidity,
            windSpeed: overrideWeather.current.wind_kph,
            windDir: overrideWeather.current.wind_dir,
            uv: overrideWeather.current.uv,
          };
        }
      } catch {
        console.warn("[ChatScreen] 聊天位置覆蓋天氣取得失敗，回退至全域天氣");
      }
    }

    // 若覆蓋失敗或無覆蓋，使用全域天氣
    if (
      !weatherInfoToSend &&
      weatherStore.hasWeatherData &&
      weatherStore.weatherData
    ) {
      weatherInfoToSend = {
        location:
          formatFullLocation(weatherStore.weatherData.location) ||
          weatherStore.locationName,
        condition: weatherStore.weatherCondition,
        temperature: Math.round(weatherStore.currentTemp || 0),
        feelsLike: Math.round(weatherStore.weatherData.current.feelslike_c),
        humidity: weatherStore.weatherData.current.humidity,
        windSpeed: weatherStore.weatherData.current.wind_kph,
        windDir: weatherStore.weatherData.current.wind_dir,
        uv: weatherStore.weatherData.current.uv,
      };
    }

    // 準備附近地點（僅 browser GPS 模式且有座標時查詢）
    let nearbyPlacesToSend:
      | import("@/services/WeatherService").NearbyPlace[]
      | undefined;
    const userLoc = weatherStore.userLocation;
    if (
      userLoc.mode === "browser" &&
      userLoc.lat !== undefined &&
      userLoc.lon !== undefined
    ) {
      nearbyPlacesToSend = await getNearbyPlaces(
        userLoc.lat,
        userLoc.lon,
        settingsStore.nearbyPlacesRadius,
        settingsStore.nearbyPlacesLimit,
      );
    }

    // 準備角色世界設定
    const charWorldSettings = char.worldSettings
      ? { ...char.worldSettings }
      : undefined;

    // 準備角色天氣數據（結構化，與用戶天氣格式統一）
    let charWeatherInfoToSend:
      | {
          location: string;
          condition: string;
          temperature: number;
          feelsLike: number;
          humidity: number;
          windSpeed?: number;
          windDir?: string;
          uv?: number;
        }
      | undefined;
    if (charWorldSettings?.location) {
      try {
        const charWeather = await getWeatherByCity(charWorldSettings.location);
        charWeatherInfoToSend = {
          location: charWeather.location.name,
          condition: charWeather.current.condition.text,
          temperature: Math.round(charWeather.current.temp_c),
          feelsLike: Math.round(charWeather.current.feelslike_c),
          humidity: charWeather.current.humidity,
          windSpeed: charWeather.current.wind_kph,
          windDir: charWeather.current.wind_dir,
          uv: charWeather.current.uv,
        };
      } catch {
        console.warn("[ChatScreen] 角色天氣查詢失敗");
      }
    }

    // 準備表情包列表（只取自定義表情的名稱）
    const stickerNames = stickerStore.customCategories
      .flatMap((cat) => cat.stickers)
      .map((s) => s.name)
      .filter((name) => name && name.trim());

    const waimaiAuthorsNote = buildWaimaiAuthorsNote(messagesToUse);
    const htmlTemplatePrompt = buildHtmlTemplatePrompt(getActiveRegexScripts(), {
      characterName: char.data.name || props.characterName,
      userName: effectivePersona.value?.name || "User",
      placement: regex_placement.AI_OUTPUT,
    });

    const builder = new PromptBuilder({
      character: char,
      lorebooks: linkedLorebooks,
      messages: chatMessages,
      settings: {
        maxContextLength: settingsStore.generation.maxContextLength || 200000,
        maxResponseLength: settingsStore.generation.maxTokens || 200000,
        temperature: settingsStore.generation.temperature,
        topP: settingsStore.generation.topP,
        topK: 0,
        frequencyPenalty: 0,
        presencePenalty: 0,
        repetitionPenalty: 1,
        stopSequences: [],
        streaming: false,
        useStreamingWindow: false,
      },
      userName: effectivePersona.value?.name || "User",
      userPersona: effectivePersona.value?.description || undefined,
      userSecrets: effectivePersona.value?.secrets || undefined,
      powerDynamic: effectivePersona.value?.powerDynamic || undefined,
      htmlTemplatePrompt: htmlTemplatePrompt || undefined,
      authorsNote: waimaiAuthorsNote,
      // 傳入提示詞管理器配置，使用用戶自定義的角色和位置設定
      promptManagerConfig: promptManagerStore.config,
      // 傳入總結和重要事件
      summaries: summariesToSend,
      importantEvents: eventsToSend,
      // 向量記憶檢索結果（啟用時優先使用語義檢索）
      vectorMemories,
      // 傳入天氣數據（用戶 + 角色）
      weatherInfo: weatherInfoToSend,
      charWeatherInfo: charWeatherInfoToSend,
      // 傳入附近地點（GPS 可用時）
      nearbyPlaces: nearbyPlacesToSend,
      // 傳入角色世界設定
      characterWorldSettings: charWorldSettings,
      // 傳入節日資訊
      holidayInfo: (() => {
        const todayHoliday = detectTodayHoliday();
        const upcomingHolidays = detectUpcomingHolidays();
        const lunarDateString = getLunarDateString(new Date());
        if (!todayHoliday && upcomingHolidays.length === 0 && !lunarDateString)
          return undefined;
        return {
          todayHoliday: todayHoliday
            ? {
                name: todayHoliday.name,
                greeting: todayHoliday.greeting,
                aiPrompt: todayHoliday.aiPrompt,
                suggestionAmount: todayHoliday.suggestionAmount,
              }
            : null,
          upcomingHolidays: upcomingHolidays.map((h) => ({
            name: h.name,
            greeting: h.greeting,
          })),
          lunarDateString,
        };
      })(),
      // 傳入勿擾模式狀態
      doNotDisturb: chatDoNotDisturb.value,
      // 傳入表情包列表
      stickerList: stickerNames,
      // 傳入面對面模式狀態
      faceToFaceMode: chatFaceToFaceMode.value,
      // 傳入第三人稱模式狀態
      thirdPersonMode: chatThirdPersonMode.value,
      // 傳入感知現實時間狀態
      enableRealTimeAwareness: chatEnableRealTimeAwareness.value,
      // 傳入假時間覆蓋（非 real 模式時計算假時間）
      fakeTimeOverride:
        fakeTime.fakeTimeMode.value !== "real"
          ? fakeTime.getChatNow()
          : undefined,
      // 傳入假時間模式（用於決定是否注入 time-jump 提示詞）
      fakeTimeMode: fakeTime.fakeTimeMode.value,
      // 傳入 MiniMax TTS 語音合成狀態
      minimaxTTSEnabled: chatMinimaxTTSEnabled.value,
      // 傳入群聊模式狀態（多人卡 + 面對面 = 不使用群聯模式）
      groupChatMode:
        isGroupChat.value &&
        !(groupMetadata.value?.isMultiCharCard && chatFaceToFaceMode.value),
      // 多人卡模式參數
      isMultiCharCard: groupMetadata.value?.isMultiCharCard || false,
      multiCharMembers: groupMetadata.value?.isMultiCharCard
        ? groupMetadata.value.multiCharMembers
        : undefined,
      // 普通群聊成員（多人卡模式不需要）
      groupMembers:
        isGroupChat.value &&
        groupMetadata.value &&
        !groupMetadata.value.isMultiCharCard
          ? groupMetadata.value.members.map((m) => {
              const char = charactersStore.characters.find(
                (c) => c.id === m.characterId,
              );
              return {
                characterId: m.characterId,
                name: char?.nickname || char?.data?.name || m.characterId,
                nickname: m.nickname,
                originalName: char?.data?.name || m.characterId,
                personality: char?.data?.personality || "",
                description: char?.data?.description || "",
                avatar: char?.avatar || "",
                isAdmin: m.isAdmin,
                isMuted: m.isMuted,
              };
            })
          : undefined,
      groupName: isGroupChat.value ? groupMetadata.value?.groupName : undefined,
      // 傳入飲食記錄
      foodLogs: fitnessStore.mealLogs.length > 0
        ? formatFoodLogsForPrompt(fitnessStore.mealLogs, 3)
        : undefined,
      // 傳入書影記錄
      mediaLogs: userStore.mediaLogSettings.showInPrompt
        ? formatMediaLogsForPrompt(
            userStore.mediaLogs,
            userStore.mediaLogSettings.maxLogsInPrompt,
          )
        : undefined,
      // 傳入伴讀共讀記錄（從聊天訊息中提取最近的共讀記錄卡片）
      companionReadingLogs: (() => {
        const companionMsgs = messagesToUse.filter(
          (m) =>
            m.isGroupChatHistory &&
            m.groupChatHistoryData?.groupName?.startsWith("📖 共讀："),
        );
        if (companionMsgs.length === 0) return undefined;
        // 取最近 5 條共讀記錄，格式化為極簡格式
        const recent = companionMsgs.slice(-5);
        return recent
          .map((m) => {
            const data = m.groupChatHistoryData!;
            const bookName = data.groupName.replace("📖 共讀：", "");
            const dialog = data.messages
              .slice(-6) // 每輪取最後 6 條對話
              .map((msg) => `${msg.senderName}：${msg.content.slice(0, 80)}`)
              .join("\n");
            return `《${bookName}》\n${dialog}`;
          })
          .join("\n---\n");
      })(),
      // 傳入好感度配置和狀態
      affinityConfig: _affinityConfig.value ?? undefined,
      affinityState: _affinityState.value ?? undefined,
      // 傳入封鎖狀態（讓 AI 知道自己被封鎖）
      blockState: currentChatData.value?.blockState ?? undefined,
      // 傳入最近的音樂分享事件（讓 AI 知道歌曲和歌詞）
      // 搜尋最近 10 條訊息中的音樂分享（用戶可能在分享後又發了其他訊息）
      recentMusicShareEvent: (() => {
        const recent = [...messagesToUse].reverse().slice(0, 10);
        const musicMsg = recent.find((m) => m.isMusicShare && m.musicShareData);
        if (musicMsg?.musicShareData) {
          return {
            name: musicMsg.musicShareData.name,
            artist: musicMsg.musicShareData.artist,
            lyrics: musicMsg.musicShareData.lyrics,
          };
        }
        return undefined;
      })(),
      // 進行中通話狀態：告知 AI 目前是否有通話進行中
      // - 若當前聊天角色就是通話對象 → AI 收到「你正在和 user 通電話中」
      // - 若通話對象是別人 → 當前角色收到「user 目前正在通話中」（不洩漏對方身分）
      // - 群聊：一律以「user 忙線中」呈現，不提及對方是誰
      ongoingCallContext: (() => {
        const call = phoneCallStore.activeCall;
        if (!call || !phoneCallStore.isActive) return undefined;
        const isGroup = isGroupChat.value;
        const withCurrent = !isGroup && call.characterId === (props.characterId || "");
        return {
          withCurrentCharacter: withCurrent,
          durationSeconds: phoneCallStore.callDuration,
          isVideo: phoneCallStore.isVideoCallActive,
        };
      })(),
    });

    const promptResult = await builder.build();
    const chatHistoryBudget = promptResult.chatHistoryBudget;
    const isChatHistoryDroppedByBudget =
      !!chatHistoryBudget?.enabled &&
      chatHistoryBudget.sourceMessageCount > 0 &&
      chatHistoryBudget.includedMessageCount === 0;
    if (isChatHistoryDroppedByBudget && chatHistoryBudget) {
      const budgetMessage = [
        "聊天歷史沒有被送出：上下文預算不足。",
        `上下文長度 ${chatHistoryBudget.maxContextLength} - 固定提示 ${chatHistoryBudget.fixedPromptTokens} - 預留回覆 ${chatHistoryBudget.reservedResponseTokens} = 歷史可用 ${chatHistoryBudget.maxHistoryTokens}`,
        "請提高「上下文長度（符元數）」、降低「最大回覆長度」，或精簡角色卡/世界書/提示詞。",
      ].join("\n");
      console.warn("[ChatScreen] 聊天歷史因上下文預算不足被完全裁掉", {
        chatHistoryBudget,
      });
      notificationStore.notifySystem("聊天歷史未送出", budgetMessage);
    }

    const resolveImageDataForApi = async (
      imageData: string | undefined,
    ): Promise<string | null> => {
      if (!imageData) return null;

      const source = isChatImageRef(imageData)
        ? await getChatImage(imageData)
        : imageData;

      if (!source) return null;

      if (source.startsWith("data:")) {
        const commaIndex = source.indexOf(",");
        return commaIndex >= 0 ? source.slice(commaIndex + 1).replace(/\s+/g, "") : null;
      }

      return source.replace(/\s+/g, "");
    };

    const formatImageMessageAsText = (message: any) => {
      const caption = message.imageCaption || "";
      const prompt = message.imagePrompt || "";
      const desc = caption || prompt || "圖片";
      return {
        role: message.role,
        content: message.content
          ? `${message.content}\n[圖片：${desc}]`
          : `[圖片：${desc}]`,
      };
    };

    // 將消息轉換為 API 格式（處理圖片訊息）
    // 只保留最後一條帶圖片的用戶訊息的 base64 數據，歷史圖片用文字描述替代
    // 避免大量 base64 數據導致請求 body 過大（nginx 413 錯誤）
    const reversedIndices = promptResult.messages.map((_, i) => i).reverse();
    const lastImageMsgIndex = reversedIndices.find((i) => {
      const msg = promptResult.messages[i] as any;
      return msg.role === "user" && msg.imageData && msg.imageMimeType;
    });

    const apiMessages = [] as Array<any>;
    const promptDebugMessages: PromptDebugMessage[] = [];
    const stringifyDebugContent = (content: unknown): string =>
      typeof content === "string" ? content : JSON.stringify(content);
    const toPromptDebugMessage = (
      source: any,
      apiMessage: any,
    ): PromptDebugMessage => ({
      role: String(apiMessage.role),
      content: stringifyDebugContent(apiMessage.content),
      identifier:
        typeof source.identifier === "string" ? source.identifier : undefined,
      name: typeof source.name === "string" ? source.name : undefined,
    });
    if (isChatHistoryDroppedByBudget && chatHistoryBudget) {
      promptDebugMessages.push({
        role: "system",
        identifier: "chatHistoryBudgetWarning",
        name: "聊天歷史預算警告",
        content: [
          "[聊天歷史預算警告]",
          "聊天歷史模組已啟用，但本次沒有任何聊天歷史被送入 API。",
          `上下文長度：${chatHistoryBudget.maxContextLength}`,
          `固定提示詞/角色卡/世界書：${chatHistoryBudget.fixedPromptTokens}`,
          `最大回覆長度預留：${chatHistoryBudget.reservedResponseTokens}`,
          `聊天歷史可用預算：${chatHistoryBudget.maxHistoryTokens}`,
          `可用歷史訊息數：${chatHistoryBudget.sourceMessageCount}`,
          `實際送入歷史訊息數：${chatHistoryBudget.includedMessageCount}`,
        ].join("\n"),
      });
    }
    for (let index = 0; index < promptResult.messages.length; index++) {
      const m = promptResult.messages[index];
      const msgWithImage = m as any;
      if (msgWithImage.imageData && msgWithImage.imageMimeType) {
        if (index === lastImageMsgIndex) {
          // 最後一條帶圖片的用戶訊息：保留 base64 給 Vision API
          const resolvedImageBase64 = await resolveImageDataForApi(msgWithImage.imageData);
          if (resolvedImageBase64) {
            const apiMessage = createImageMessage(
              m.content,
              resolvedImageBase64,
              msgWithImage.imageMimeType,
              "auto",
            );
            apiMessages.push(apiMessage);
            promptDebugMessages.push(toPromptDebugMessage(m, apiMessage));
          } else {
            console.warn("[ChatScreen] 圖片訊息無法解析為可送出的 base64，已降級為文字描述", {
              messageId: msgWithImage.id,
              imageData: msgWithImage.imageData,
            });
            const apiMessage = formatImageMessageAsText(msgWithImage);
            apiMessages.push(apiMessage);
            promptDebugMessages.push(toPromptDebugMessage(m, apiMessage));
          }
          continue;
        }
        // 歷史圖片訊息：去掉 base64，用文字描述替代
        const apiMessage = formatImageMessageAsText(msgWithImage);
        apiMessages.push(apiMessage);
        promptDebugMessages.push(toPromptDebugMessage(m, apiMessage));
        continue;
      }
      // 普通文字訊息
      const apiMessage = {
        role: m.role,
        content: m.content,
      };
      apiMessages.push(apiMessage);
      promptDebugMessages.push(toPromptDebugMessage(m, apiMessage));
    }

    const client = new OpenAICompatibleClient(chatTaskConfig.api);

    // 1. 🎤 如果是語音訊息，替換最後一條用戶訊息為帶音頻的 API 訊息
    // 必須在附加其他 user 提示詞之前執行，以免替換錯訊息
    if (options?.audioApiMessage) {
      // 找到最後一條 user 訊息並替換為帶音頻的版本
      for (let i = apiMessages.length - 1; i >= 0; i--) {
        if (apiMessages[i].role === "user") {
          const apiMessage = options.audioApiMessage as any;
          apiMessages[i] = apiMessage;
          promptDebugMessages[i] = {
            ...promptDebugMessages[i],
            role: String(apiMessage.role),
            content: stringifyDebugContent(apiMessage.content),
          };
          break;
        }
      }
    }

    // 2. 收集所有需要附加的 user 提示詞
    const appendedUserPrompts: string[] = [];
    const activeCharName = char.nickname || char.data.name || props.characterName || "角色";
    const activeCharCardName = char.data.name || activeCharName;
    const activeUserName = effectivePersona.value?.name || "User";
    
    // 🎉 如果是節日觸發，附加節日提示詞（不存入聊天記錄）
    if (options?.holidayTriggerPrompt) {
      appendedUserPrompts.push(options.holidayTriggerPrompt);
    }

    // 📞 如果是來電後反應，附加 postCallPrompt（不存入聊天記錄）
    if (options?.postCallPrompt) {
      appendedUserPrompts.push(options.postCallPrompt);
    }

    // 🎭 當小劇場指令是最後一條時，補一條隱藏催促消息
    if (options?.theaterNudge) {
      appendedUserPrompts.push(
        [
          "[小劇場角色鎖定]",
          `目前角色是「${activeCharName}」（角色卡名稱：${activeCharCardName}），使用者是「${activeUserName}」。`,
          `請嚴格沿用「${activeCharName}」的角色卡、性格、語氣、權力關係、聊天記憶與目前小劇場上下文。`,
          `不得改用其他角色、示例角色、模板角色或「測試小精靈」；不得把基拉祈/雪拉比當成正在對話的角色。`,
          "請根據上述場景指令，以目前角色身份繼續扮演。",
        ].join("\n"),
      );
      // 📱 小手機劇本格式：要求 AI 把每一句台詞用 <msg name="..."> 包起來，
      // name 屬性用字面字串 {{user}} / {{char}} 作分邊標記（含雙大括號），
      // 前端會根據 name 屬性把氣泡分到左右兩側。只在小劇場路徑使用，不影響日常聊天。
      if (options.theaterPhoneScript) {
        appendedUserPrompts.push(
          [
            "[小手機劇本格式｜強制規則]",
            "1. 整個劇本只能輸出 <msg name=\"...\">…</msg>，<msg> 之外不可有任何文字（不要正文、敘述、狀態欄、旁白、解說、開場白）。",
            "2. name 屬性只能填這兩種固定字串之一（請逐字輸出，包含雙大括號）：",
            "   - 用戶發言用 name=\"{{user}}\"",
            "   - 角色發言用 name=\"{{char}}\"",
            "   注意：不要把 {{user}} / {{char}} 替換成實際名字，要保留雙大括號字面字串輸出。",
            "3. 不允許省略 name 屬性，每一條 <msg> 都必須帶 name=\"{{user}}\" 或 name=\"{{char}}\"。",
            "4. <msg> 內容只放該句台詞本身，不要再寫「user:」「char:」之類的前綴。",
            "5. 一個 <msg> 只放一句短台詞，模仿真實手機聊天節奏；想連發就拆成多個 <msg>。",
            "6. 表情包用 [sticker:描述]、貼圖、語氣詞都正常使用，但同樣放在 <msg> 內。",
            "範例（請完全照這個格式輸出）：",
            "<msg name=\"{{user}}\">別生氣</msg><msg name=\"{{user}}\">我真的知道錯了</msg><msg name=\"{{char}}\">你只會說這一句嗎？</msg><msg name=\"{{user}}\">那我還能說什麼…</msg><msg name=\"{{char}}\">哄我。</msg>",
            "再次提醒：每一個 <msg> 都必須帶 name=\"{{user}}\" 或 name=\"{{char}}\" 屬性，違反此規則的訊息會被視為格式錯誤。",
          ].join("\n"),
        );
      }
    }

    if (appendedUserPrompts.length > 0) {
      const combinedPrompt = appendedUserPrompts.join("\n\n");
      
      // 尋找結尾的 assistant prefill 訊息（例如 <think>）
      // 我們希望附加的 user 訊息放在最後一個 user 訊息之後，且在 prefill 之前
      let insertIndex = apiMessages.length;
      while (insertIndex > 0 && apiMessages[insertIndex - 1].role === "assistant") {
        insertIndex--;
      }
      
      apiMessages.splice(insertIndex, 0, {
        role: "user",
        content: combinedPrompt,
      });
      promptDebugMessages.splice(insertIndex, 0, {
        role: "user",
        content: combinedPrompt,
        identifier: "appendedUserPrompt",
        name: "附加提示詞",
      });
    }

    // 創建 AI 訊息佔位符（用於流式輸出）
    const aiMessage: Message = {
      id: `msg_${Date.now()}`,
      role: "ai",
      content: "",
      timestamp: Date.now(),
      isStreaming: true,
      turnId: generationTurnId || undefined,
    };
    messages.value.push(aiMessage);
    scrollToBottom();

    // 根據設定決定是否使用串流
    const isStreamingEnabled = chatTaskConfig.generation.streamingEnabled;
    // 只有在串流開啟時才可能使用流式輸出窗口
    const useWindow = isStreamingEnabled && useStreamingWindowEnabled.value;
    usedStreamingWindowForCurrentGeneration = useWindow;

    if (useWindow) {
      // 顯示流式輸出窗口
      streamingWindow.show(chatTaskConfig.api.model);
      // 傳入提示詞內容（用於調試面板查看/隱藏）
      streamingWindow.setPromptContent(
        promptDebugMessages,
      );
    }

    const chatSettings = {
      maxContextLength: chatTaskConfig.generation.maxContextLength || 200000,
      maxResponseLength: chatTaskConfig.generation.maxTokens || 200000,
      temperature: chatTaskConfig.generation.temperature,
      topP: chatTaskConfig.generation.topP,
      topK: 0,
      frequencyPenalty: 0,
      presencePenalty: 0,
      repetitionPenalty: 1,
      stopSequences: [],
      streaming: isStreamingEnabled,
      useStreamingWindow: useWindow,
    };

    const getApiMessageTextLength = (message: any): number => {
      if (typeof message?.content === "string") return message.content.length;
      if (Array.isArray(message?.content)) {
        return message.content
          .filter((part: any) => part?.type === "text")
          .map((part: any) => String(part.text || ""))
          .join("\n")
          .length;
      }
      return 0;
    };
    const promptDebugByIndex = new Map<number, PromptDebugMessage>();
    promptDebugMessages.forEach((message, index) => promptDebugByIndex.set(index, message));
    let generationDiagnostics: GenerationDiagnostics = {
      model: chatTaskConfig.api.model,
      stream: isStreamingEnabled,
      maxTokens: chatSettings.maxResponseLength,
      requestMessageCount: apiMessages.length,
      requestRoles: apiMessages.map((message) => String(message.role)),
      lastMessages: apiMessages.slice(-8).map((message, offset) => ({
        index: apiMessages.length - Math.min(apiMessages.length, 8) + offset,
        role: String(message.role),
        contentLength: getApiMessageTextLength(message),
        contentType: Array.isArray(message.content) ? "multipart" : typeof message.content === "string" ? "text" : "unknown",
      })),
      promptDiagnostics: {
        faceToFaceMode: chatFaceToFaceMode.value,
        groupChatMode: isGroupChat.value,
        promptMessageCount: promptResult.messages.length,
        promptDebugMessageCount: promptDebugMessages.length,
        promptModules: promptDebugMessages
          .filter((message) => message.name || message.identifier)
          .map((message) => ({
            role: message.role,
            identifier: message.identifier,
            name: message.name,
            contentLength: message.content.length,
          })),
        chatHistoryBudget,
      },
      chatDiagnostics: {
        chatId: props.chatId,
        sourceMessageCount: messages.value.length,
        eligibleMessageCount: eligibleMessages.length,
        messagesToUseCount: messagesToUse.length,
        actualMode,
        actualCount,
        summariesCount: summariesToSend.length,
        summariesTotalLength: summariesToSend.reduce((sum, item) => sum + item.content.length, 0),
        eventsCount: eventsToSend.length,
        eventsTotalLength: eventsToSend.reduce((sum, item) => sum + item.content.length, 0),
        vectorMemoriesCount: vectorMemories?.length ?? 0,
        vectorMemoriesTotalLength: vectorMemories?.reduce((sum, item) => sum + item.content.length, 0) ?? 0,
        lastUiMessages: messagesToUse.slice(-10).map((message) => ({
          role: message.role,
          contentLength: message.content?.length ?? 0,
          isSystem: message.role === "system",
          isTimetravel: !!message.isTimetravel,
          sentWhileBlocked: !!message.sentWhileBlocked,
          hasReplyTo: !!message.replyTo,
          timestamp: message.timestamp,
        })),
      },
      rawResponseMeta: {
        preApiLastDebugMessages: apiMessages.slice(-8).map((message, offset) => {
          const index = apiMessages.length - Math.min(apiMessages.length, 8) + offset;
          const debug = promptDebugByIndex.get(index);
          return {
            index,
            role: String(message.role),
            identifier: debug?.identifier,
            name: debug?.name,
            contentLength: getApiMessageTextLength(message),
          };
        }),
      },
    };
    if (useWindow) {
      streamingWindow.setDiagnostics(generationDiagnostics);
    }

    const runContaminationDiagnostics = async (triggerReason: string) => {
      const startedAt = Date.now();
      const pairedMessages = apiMessages.map((message, index) => ({
        message,
        index,
        debug: promptDebugByIndex.get(index) ?? promptDebugMessages[index],
      }));
      const moduleMatches = (debug: PromptDebugMessage | undefined, marker: string) =>
        !!debug?.identifier?.includes(marker);
      const isChatHistoryModule = (debug: PromptDebugMessage | undefined) =>
        moduleMatches(debug, "chatMessage") ||
        moduleMatches(debug, "chatHistoryOpenTag") ||
        moduleMatches(debug, "chatHistoryCloseTag");
      const removedModulesFor = (removed: typeof pairedMessages) =>
        removed.slice(0, 30).map(({ message, index, debug }) => ({
          index,
          role: String(message.role),
          identifier: debug?.identifier,
          name: debug?.name,
          contentLength: debug?.content.length ?? getApiMessageTextLength(message),
        }));
      const probeSettings = {
        ...chatSettings,
        maxResponseLength: Math.min(96, Math.max(16, chatSettings.maxResponseLength || 96)),
        streaming: false,
        useStreamingWindow: false,
      };
      const variants: Array<{
        id: string;
        label: string;
        keep: (item: typeof pairedMessages[number]) => boolean;
      }> = [
        {
          id: "remove_chat_history",
          label: "移除聊天歷史",
          keep: (item) => !isChatHistoryModule(item.debug),
        },
        {
          id: "remove_events_context",
          label: "移除重要事件/時間/天氣/世界上下文包",
          keep: (item) => !moduleMatches(item.debug, "f2fImportantEvents"),
        },
        {
          id: "remove_userinfo_summaries",
          label: "移除用戶/角色/總結大包",
          keep: (item) =>
            !moduleMatches(item.debug, "f2fUserInfo") &&
            !moduleMatches(item.debug, "f2fSummaries") &&
            !moduleMatches(item.debug, "f2fCharDescription"),
        },
        {
          id: "remove_custom_modules",
          label: "移除自訂提示詞模組",
          keep: (item) => !moduleMatches(item.debug, "f2f_custom_"),
        },
        {
          id: "remove_tail_format",
          label: "移除尾端思考/格式規則",
          keep: (item) =>
            !moduleMatches(item.debug, "f2fThinkingGuide") &&
            !moduleMatches(item.debug, "f2fFormatRules") &&
            !moduleMatches(item.debug, "f2fExampleScript"),
        },
        {
          id: "minimal_shared_prompt",
          label: "最小共享提示詞（移除動態/歷史/自訂）",
          keep: (item) =>
            !isChatHistoryModule(item.debug) &&
            !moduleMatches(item.debug, "f2fImportantEvents") &&
            !moduleMatches(item.debug, "f2fUserInfo") &&
            !moduleMatches(item.debug, "f2fSummaries") &&
            !moduleMatches(item.debug, "f2fCharDescription") &&
            !moduleMatches(item.debug, "f2f_custom_"),
        },
      ];
      let apiEndpointHost: string | undefined;
      try {
        apiEndpointHost = new URL(chatTaskConfig.api.endpoint).host;
      } catch {
        apiEndpointHost = chatTaskConfig.api.endpoint;
      }
      generationDiagnostics.contaminationDiagnostics = {
        triggered: true,
        triggerReason,
        startedAt,
        baselineFinishReason: generationDiagnostics.rawFinishReason || generationDiagnostics.finishReason,
        results: [],
      };
      generationDiagnostics.rawResponseMeta = {
        ...(typeof generationDiagnostics.rawResponseMeta === "object" && generationDiagnostics.rawResponseMeta !== null
          ? generationDiagnostics.rawResponseMeta
          : {}),
        contaminationProbeEndpointHost: apiEndpointHost,
        contaminationProbeModel: chatTaskConfig.api.model,
      };
      if (useWindow) streamingWindow.setDiagnostics(generationDiagnostics);

      for (const variant of variants) {
        if (controller.signal.aborted) break;
        const kept = pairedMessages.filter(variant.keep);
        const removed = pairedMessages.filter((item) => !variant.keep(item));
        const baseResult: GenerationContaminationProbeResult = {
          id: variant.id,
          label: variant.label,
          status: removed.length === 0 || kept.length === pairedMessages.length ? "skipped" : "empty",
          messageCount: kept.length,
          removedMessageCount: removed.length,
          requestRoles: kept.map((item) => item.message.role),
          removedModules: removedModulesFor(removed),
        };
        if (baseResult.status === "skipped") {
          generationDiagnostics.contaminationDiagnostics.results.push(baseResult);
          if (useWindow) streamingWindow.setDiagnostics(generationDiagnostics);
          continue;
        }
        const probeStartedAt = Date.now();
        try {
          const result = await client.generate({
            messages: kept.map((item) => item.message) as APIMessage[],
            settings: probeSettings,
            apiSettings: chatTaskConfig.api,
            signal: controller.signal,
            adjustLastMessageRole: true,
          });
          const finishReason = result.rawFinishReason || result.finishReason || result.stopReason;
          const contentLength = result.content?.length ?? 0;
          const status =
            finishReason === "content_filter" ||
            finishReason === "safety" ||
            finishReason === "prohibited_content" ||
            finishReason === "blocklist"
              ? "filtered"
              : contentLength > 0
                ? "ok"
                : "empty";
          generationDiagnostics.contaminationDiagnostics.results.push({
            ...baseResult,
            status,
            rawFinishReason: result.rawFinishReason,
            finishReason: result.finishReason || result.stopReason,
            contentLength,
            promptTokens: result.tokenCount?.prompt,
            completionTokens: result.tokenCount?.completion,
            totalTokens: result.tokenCount?.total,
            requestBodyBytes: result.diagnostics?.requestBodyBytes,
            durationMs: Date.now() - probeStartedAt,
          });
        } catch (error) {
          if (controller.signal.aborted) break;
          generationDiagnostics.contaminationDiagnostics.results.push({
            ...baseResult,
            status: "error",
            durationMs: Date.now() - probeStartedAt,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        if (useWindow) streamingWindow.setDiagnostics(generationDiagnostics);
      }

      generationDiagnostics.contaminationDiagnostics.completedAt = Date.now();
      console.warn("[ChatScreen] 污染定位診斷", generationDiagnostics.contaminationDiagnostics);
      if (useWindow) streamingWindow.setDiagnostics(generationDiagnostics);
    };

    let fullContent = "";

    {
      // ===== 取得完整回覆（流式 / 非流式皆支援，解析邏輯統一在拿到完整內容後執行） =====
      const generationResult = await runChatGenerationRequest({
        client,
        messages: apiMessages,
        settings: chatSettings,
        apiSettings: chatTaskConfig.api,
        signal: controller.signal,
        streaming: isStreamingEnabled,
        initialDiagnostics: generationDiagnostics,
        onContentUpdate: updateChatGenerationContent,
        onToken: (token, tokenFullContent) => {
          if (useWindow) {
            streamingWindow.appendToken(token);
            return;
          }
          const msgIndex = messages.value.findIndex(
            (m) => m.id === aiMessage.id,
          );
          if (msgIndex !== -1) {
            messages.value[msgIndex].content = tokenFullContent;
          }
          scrollToBottom();
        },
      });
      fullContent = generationResult.content;
      generationDiagnostics = generationResult.diagnostics;

      if (useWindow && generationResult.tokenUsage) {
        streamingWindow.setUsage(generationResult.tokenUsage);
      }

      // 串流本身已結束（所有 token 已收到），立刻把窗口標為完成，
      // 讓「停止」按鈕 / spinner 停下來。後續的逐條氣泡渲染延遲（_delay 2000ms × N 條）
      // 是純 UX 修飾、與 API 生成無關，不應該繼續顯示 streaming 狀態。
      // setComplete 冪等，後面失敗/正常路徑仍會再呼叫一次（無副作用）。
      if (useWindow) {
        streamingWindow.setComplete();
      }
      console.log("[ChatScreen][render] stream 結束，setComplete 已呼叫，準備進入訊息解析/渲染");

      // 直接處理完整回覆（套用角色 regex_scripts AI_OUTPUT）
      const rawFullContent =
        useWindow &&
        streamingWindow.content.value &&
        streamingWindow.content.value.length > fullContent.length
          ? streamingWindow.content.value
          : fullContent;
      fullContent = rawFullContent;
      const finalContent = processAiOutputTemplate(applyAIOutputRegex(fullContent));
      latestFinalContent = finalContent;
      generationDiagnostics.apiContentLength = fullContent.length;
      generationDiagnostics.finalContentLength = finalContent.length;
      generationDiagnostics.parsingDiagnostics = {
        rawLength: fullContent.length,
        afterTemplateLength: finalContent.length,
        isEmpty: !finalContent || !finalContent.trim(),
      };
      if (useWindow) streamingWindow.setDiagnostics(generationDiagnostics);
      const msgIndex = messages.value.findIndex((m) => m.id === aiMessage.id);

      // 空回應檢測：若是使用者主動停止，直接移除佔位氣泡
      if (!finalContent || !finalContent.trim()) {
        if (controller.signal.aborted) {
          if (msgIndex !== -1) {
            messages.value.splice(msgIndex, 1);
          }
          if (useWindow) {
            streamingWindow.setComplete();
          }
          await saveChatImmediate();
          return;
        }

        const shouldRunContaminationDiagnostics =
          !generationDiagnostics.contaminationDiagnostics &&
          (generationDiagnostics.finishReason === "content_filter" ||
            generationDiagnostics.rawFinishReason === "content_filter" ||
            generationDiagnostics.finishReason === "safety" ||
            generationDiagnostics.rawFinishReason === "safety" ||
            generationDiagnostics.apiContentLength === 0);
        if (shouldRunContaminationDiagnostics) {
          if (msgIndex !== -1) {
            messages.value[msgIndex].content =
              "[空回應] API 返回了空內容，正在執行污染定位診斷...";
            messages.value[msgIndex].isStreaming = false;
          }
          await runContaminationDiagnostics(
            generationDiagnostics.rawFinishReason || generationDiagnostics.finishReason || "empty_response",
          );
        }

        if (msgIndex !== -1) {
          const _d = generationDiagnostics;
          const _diagParts: string[] = [];
          if (_d.rawFinishReason) _diagParts.push(`結束原因: ${_d.rawFinishReason}`);
          else if (_d.finishReason && _d.finishReason !== "stop") _diagParts.push(`結束原因: ${_d.finishReason}`);
          if (typeof _d.apiContentLength === "number") _diagParts.push(`API 原始長度: ${_d.apiContentLength}`);
          if (_d.requestRoles?.length) _diagParts.push(`最後 roles: ${_d.requestRoles.slice(-6).join(" > ")}`);
          if (_d.roleAdjustments?.length) {
            _diagParts.push(`role 轉換: ${(_d.roleAdjustments as Array<{reason:string;before:string;after:string}>).map((r) => `${r.reason}:${r.before}->${r.after}`).join("; ")}`);
          }
          if (_d.promptFeedback) _diagParts.push(`promptFeedback: ${JSON.stringify(_d.promptFeedback)}`);
          if (_d.safetyRatings) _diagParts.push(`safetyRatings: ${JSON.stringify(_d.safetyRatings)}`);
          if (typeof _d.chunkCount === "number") _diagParts.push(`chunks: ${_d.chunkCount}, bytes: ${_d.totalBytes ?? 0}`);
          const _probeResults = _d.contaminationDiagnostics?.results
            ?.filter((result) => result.status !== "skipped")
            .map((result) => `${result.label}: ${result.status}${result.rawFinishReason ? `(${result.rawFinishReason})` : ""}`);
          if (_probeResults?.length) _diagParts.push(`污染探針: ${_probeResults.join(" / ")}`);
          const _diagStr = _diagParts.length > 0 ? "\n診斷: " + _diagParts.join(" | ") : "";
          console.warn("[ChatScreen] 空回應診斷", generationDiagnostics);
          messages.value[msgIndex].content =
            "[空回應] API 返回了空內容" + _diagStr + "\n請查看串流視窗「調試資訊」並複製診斷 JSON，或開啟開發者工具 Console 查看完整污染定位結果。";
          messages.value[msgIndex].isStreaming = false;
        }
      } else {
        // 群聊/多人卡模式：使用群聊解析器
        if (useGroupChatParser.value) {
          console.log("[ChatScreen][render] 進入群聊解析器路徑");
          const parsed = parseGroupChatResponse(finalContent);
          console.log("[ChatScreen][render] parseGroupChatResponse 完成", { count: parsed.messages.length });

          // 移除原始的佔位訊息
          if (msgIndex !== -1) {
            messages.value.splice(msgIndex, 1);
          }

          // 群聊逐條顯示節奏：當有多條訊息時，每條之間根據訊息總數動態延遲
          const _totalGc = parsed.messages.length;
          let _shownGc = 0;
          const _gcDelayIfNeeded = async () => {
            if (_totalGc > 1 && _shownGc > 0) {
              await _delay(_messageRenderDelay(_totalGc));
            }
            _shownGc++;
            scrollToBottom();
          };

          for (let i = 0; i < parsed.messages.length; i++) {
            const parsedMsg = parsed.messages[i];
            const senderInfo = resolveGroupMemberByName(parsedMsg.senderName || "");
            const senderName = senderInfo.canonicalName;
            const senderCharId = senderInfo.characterId;
            const senderAvatar = senderInfo.avatar;

            // 處理群管理動作
            if (parsedMsg.isGroupAction && parsedMsg.groupActionType) {
              // 更新 groupMetadata
              if (
                parsedMsg.groupActionType === "rename" &&
                parsedMsg.groupActionValue &&
                currentChatData.value?.groupMetadata
              ) {
                currentChatData.value.groupMetadata.groupName =
                  parsedMsg.groupActionValue;
              }
              if (
                parsedMsg.groupActionType === "kick" &&
                parsedMsg.groupActionTarget &&
                currentChatData.value?.groupMetadata
              ) {
                const targetId = getGroupMemberIdByName(
                  parsedMsg.groupActionTarget,
                );
                if (targetId) {
                  currentChatData.value.groupMetadata.members =
                    currentChatData.value.groupMetadata.members.filter(
                      (m) => m.characterId !== targetId,
                    );
                }
              }
              if (
                (parsedMsg.groupActionType === "mute" ||
                  parsedMsg.groupActionType === "unmute") &&
                parsedMsg.groupActionTarget &&
                currentChatData.value?.groupMetadata
              ) {
                const targetId = getGroupMemberIdByName(
                  parsedMsg.groupActionTarget,
                );
                if (targetId) {
                  const member =
                    currentChatData.value.groupMetadata.members.find(
                      (m) => m.characterId === targetId,
                    );
                  if (member) {
                    member.isMuted = parsedMsg.groupActionType === "mute";
                  }
                }
              }

              const actionMsg: Message = {
                id: `msg_${Date.now()}_${i}`,
                role: "system",
                content: "",
                timestamp: Date.now() + i,
                isGroupAction: true,
                groupActionType: parsedMsg.groupActionType,
                groupActionActor: parsedMsg.groupActionActor,
                groupActionTarget: parsedMsg.groupActionTarget ?? undefined,
                groupActionValue: parsedMsg.groupActionValue ?? undefined,
              };
              await _gcDelayIfNeeded();
              messages.value.push(actionMsg);
              continue;
            }

            // 處理撤回
            if (parsedMsg.isRecall) {
              const recallMsg: Message = {
                id: `msg_${Date.now()}_${i}`,
                role: "system",
                content: "",
                timestamp: Date.now() + i,
                isRecall: true,
                recallContent: parsedMsg.recallContent,
                senderCharacterId: senderCharId,
                senderCharacterName: senderName,
              };
              await _gcDelayIfNeeded();
              messages.value.push(recallMsg);
              continue;
            }

            // 處理私信（DM）：找到對應角色的 1v1 聊天並插入訊息
            if (parsedMsg.isPrivateMessage) {
              // 在群聊中顯示私信通知
              const dmNotice: Message = {
                id: `msg_${Date.now()}_${i}`,
                role: "ai",
                content: parsedMsg.content,
                timestamp: Date.now() + i,
                turnId: generationTurnId || undefined,
                isPrivateMessage: true,
                senderCharacterId: senderCharId,
                senderCharacterName: senderName,
                senderCharacterAvatar: senderAvatar,
              };
              await _gcDelayIfNeeded();
              messages.value.push(dmNotice);

              // 嘗試找到對應角色的 1v1 聊天並插入訊息，找不到則自動建立
              if (senderCharId) {
                try {
                  const existingChat = await resolvePreferredDirectChat(senderCharId);

                  // 如果沒有 1v1 聊天，自動建立一個
                  const targetChat: Chat =
                    existingChat || createDefaultChat(senderCharId, senderName);

                  // 構建群聊記錄數據（最近 15 輪）
                  const groupChatHistoryData = buildGroupChatHistoryData(
                    messages.value,
                    15,
                  );

                  // 要追加的訊息列表
                  const newDmMessages: ChatMessage[] = [];

                  // 先插入群聊記錄卡片
                  if (groupChatHistoryData) {
                    newDmMessages.push({
                      id: crypto.randomUUID(),
                      sender: "system",
                      name: "系統",
                      content: "",
                      is_user: false,
                      status: "sent",
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                      isGroupChatHistory: true,
                      groupChatHistoryData,
                    });
                  }

                  // 插入私信內容
                  const dmMessage: ChatMessage = {
                    id: crypto.randomUUID(),
                    sender: "assistant",
                    name: senderName,
                    content: parsedMsg.content,
                    is_user: false,
                    status: "sent",
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                  };
                  newDmMessages.push(dmMessage);

                  // v24：用 appendChatMessages 追加訊息（無競態風險）
                  await appendMessages(targetChat.id, newDmMessages);
                  if (existingChat) {
                    await refreshChatDerivedMetadata(targetChat.id);
                  } else {
                    targetChat.messages = [];
                    await createChatRecord(targetChat);
                    await refreshChatDerivedMetadata(targetChat.id);
                  }
                } catch (e) {
                  console.warn("[ChatScreen] 無法插入私信到 1v1 聊天:", e);
                }
              }
              continue;
            }

            // 處理群通話請求（角色發起群通話）
            if (parsedMsg.isGroupCallRequest) {
              // 如果群通話尚未開始，顯示來電提示
              if (!showGroupCallModal.value) {
                // 添加系統訊息
                const callRequestMsg: Message = {
                  id: `msg_${Date.now()}_${i}`,
                  role: "system",
                  content: `${senderName} 發起了群通話${parsedMsg.groupCallRequestReason ? `：${parsedMsg.groupCallRequestReason}` : ""}`,
                  timestamp: Date.now() + i,
                };
                messages.value.push(callRequestMsg);

                // 自動開始群通話
                groupCallStartedAt.value = Date.now();
                groupCallMessages.value = [];
                groupCallParticipants.value = [];

                // 發起者先加入
                const initiatorChar = charactersStore.characters.find(
                  (c) => c.id === senderCharId,
                );
                if (senderCharId) {
                  groupCallParticipants.value.push({
                    characterId: senderCharId,
                    name: senderName,
                    avatar: initiatorChar?.avatar || "",
                    isSpeaking: false,
                  });
                }

                groupCallMessages.value.push({
                  type: "system",
                  content: `${senderName} 發起了群通話`,
                  timestamp: Date.now(),
                });

                // 更新 groupMetadata 的 callState
                if (currentChatData.value?.groupMetadata) {
                  currentChatData.value.groupMetadata.callState = {
                    isActive: true,
                    initiatorCharacterId: senderCharId || null,
                    startedAt: groupCallStartedAt.value,
                    participants: senderCharId
                      ? [{ characterId: senderCharId, joinedAt: Date.now() }]
                      : [],
                  };
                }

                showGroupCallModal.value = true;
              }
              continue;
            }

            // 處理群通話回應（角色回應通話邀請）
            if (parsedMsg.isGroupCallResponse) {
              if (parsedMsg.groupCallResponseAction === "join") {
                // 角色加入通話
                if (senderCharId) {
                  handleGroupCallJoin(senderCharId, senderName);
                }
              } else if (parsedMsg.groupCallResponseAction === "decline") {
                // 角色拒絕加入
                groupCallMessages.value.push({
                  type: "system",
                  content: `${senderName} 拒絕加入通話${parsedMsg.groupCallDeclineReason ? `：${parsedMsg.groupCallDeclineReason}` : ""}`,
                  timestamp: Date.now(),
                });
              }
              continue;
            }

            // 處理加入通話
            if (parsedMsg.isJoinCall) {
              if (senderCharId && showGroupCallModal.value) {
                handleGroupCallJoin(senderCharId, senderName);
              }
              // 如果有附帶的語音內容，也加入通話訊息
              if (parsedMsg.content && showGroupCallModal.value) {
                addGroupCallVoiceMessage(senderName, parsedMsg.content);
              }
              continue;
            }

            // 處理離開通話
            if (parsedMsg.isLeaveCall) {
              if (senderCharId && showGroupCallModal.value) {
                handleGroupCallLeave(
                  senderCharId,
                  senderName,
                  parsedMsg.leaveCallReason,
                );
              }
              // 如果有附帶的語音內容（離開前說的話），也加入通話訊息
              if (parsedMsg.content && showGroupCallModal.value) {
                addGroupCallVoiceMessage(senderName, parsedMsg.content);
              }
              continue;
            }

            // 如果群通話進行中，所有訊息都加入通話訊息列表（作為語音）
            if (showGroupCallModal.value) {
              // 語音訊息
              if (parsedMsg.isVoice && parsedMsg.voiceContent) {
                addGroupCallVoiceMessage(senderName, parsedMsg.voiceContent);
                continue;
              }
              // 普通文字訊息也作為語音加入通話
              if (parsedMsg.content) {
                addGroupCallVoiceMessage(senderName, parsedMsg.content);
                continue;
              }
              // 表情包
              if (parsedMsg.isStickerMsg && parsedMsg.stickerMeaning) {
                addGroupCallVoiceMessage(
                  senderName,
                  `[表情：${parsedMsg.stickerMeaning}]`,
                );
                continue;
              }
              continue;
            }

            // 處理 AI 領取群聊紅包（<redpacket-claim name="..." />）
            if (parsedMsg.isRedpacketClaim) {
              const claimerName = parsedMsg.redpacketClaimName || senderName;
              const target = findClaimableRedPacket(
                messages.value,
                claimerName,
                false,
              ) as Message | undefined;
              if (target) {
                const cents = applyRedpacketClaim(
                  target,
                  claimerName,
                  senderCharId,
                  false,
                );
                if (cents > 0) {
                  // 觸發響應式更新
                  target.redpacketState = {
                    ...target.redpacketState!,
                    claims: [...target.redpacketState!.claims],
                  };
                  await _gcDelayIfNeeded();
                  messages.value.push(
                    createTransactionClaimNoticeMessage({
                      claimerName,
                      payerName: getRedpacketPayerName(target),
                      kind: "紅包",
                      amount: cents / 100,
                      timestamp: Date.now() + i,
                      idSuffix: "rpc_char",
                    }),
                  );
                }
              }
              continue;
            }

            // 普通群聊訊息（非通話狀態）
            if (
              !parsedMsg.content &&
              !parsedMsg.isStickerMsg &&
              !parsedMsg.isVoice &&
              !parsedMsg.isAiImage &&
              !parsedMsg.isRedpacket &&
              !parsedMsg.isLocation &&
              !parsedMsg.isGift &&
              !parsedMsg.isTransfer
            )
              continue;

            // 表情包：將 stickerMeaning 轉為 MessageBubble 可識別的 [sticker:名稱] 格式
            let msgContent = parsedMsg.content;
            if (parsedMsg.isStickerMsg && parsedMsg.stickerMeaning) {
              msgContent = `[sticker:${parsedMsg.stickerMeaning}]`;
            }
            // AI 圖片：將描述轉為 <pic> 標籤以觸發拍立得渲染
            if (parsedMsg.isAiImage && parsedMsg.imageDescription) {
              msgContent = `<pic>${parsedMsg.imageDescription}</pic>`;
            }
            // 語音：顯示語音條 UI
            if (parsedMsg.isVoice && parsedMsg.voiceContent) {
              msgContent = `[語音訊息] ${parsedMsg.voiceContent}`;
            }

            const newMessage: Message = {
              id: `msg_${Date.now()}_${i}`,
              role: "ai",
              content: msgContent,
              timestamp: Date.now() + i,
              turnId: generationTurnId || undefined,
              thought: parsedMsg.thought,
              messageType: parsedMsg.isAiImage
                ? "descriptive-image"
                : parsedMsg.isVoice
                  ? "audio"
                  : undefined,
              imageCaption: parsedMsg.isAiImage
                ? parsedMsg.imageDescription
                : undefined,
              audioTranscript: parsedMsg.isVoice
                ? parsedMsg.voiceContent
                : undefined,
              senderCharacterId: senderCharId,
              senderCharacterName: senderName,
              senderCharacterAvatar: senderAvatar,
              // 複用現有的解析欄位
              isRedpacket: parsedMsg.isRedpacket,
              redpacketData: parsedMsg.redpacketData,
              isLocation: parsedMsg.isLocation,
              locationContent: parsedMsg.locationContent,
              replyToContent: parsedMsg.replyToContent,
              isGift: parsedMsg.isGift,
              giftName: parsedMsg.giftName,
              isTransfer: parsedMsg.isTransfer,
              transferType: parsedMsg.transferType,
              transferAmount: parsedMsg.transferAmount,
              transferNote: parsedMsg.transferNote,
              transferStatus: parsedMsg.isTransfer
                ? parsedMsg.transferType === "refund"
                  ? "refunded"
                  : "pending"
                : undefined,
              imagePrompt: parsedMsg.imagePrompt,
            };

            // 外賣付款結果/送達（群聊）
            applyWaimaiParsedResultToMessage(
              newMessage,
              parsedMsg,
              messages.value,
            );

            // 群聊紅包：初始化領取狀態
            if (newMessage.isRedpacket && newMessage.redpacketData) {
              newMessage.redpacketState = initRedPacketState(
                newMessage.redpacketData,
              );
            }

            await _gcDelayIfNeeded();
            messages.value.push(newMessage);

            // 如果文生圖已開啟且有英文 prompt 或中文描述，觸發生圖
            if (
              parsedMsg.isAiImage &&
              (parsedMsg.imagePrompt || parsedMsg.imageDescription)
            ) {
              tryGenerateImageForMessage(
                newMessage.id,
                parsedMsg.imagePrompt,
                parsedMsg.imageDescription,
              );
            }
            // MiniMax TTS 語音合成
            processMessageTTS(
              newMessage.id,
              parsedMsg.isVoice && parsedMsg.voiceContent
                ? parsedMsg.voiceContent
                : newMessage.content,
              parsedMsg.isVoice ? { force: true } : undefined,
            );
          }

          // Fallback
          if (parsed.messages.length === 0 && finalContent) {
            messages.value.push({
              id: `msg_${Date.now()}_fallback`,
              role: "ai",
              content: parsed.rawOutput || finalContent,
              timestamp: Date.now(),
              turnId: generationTurnId || undefined,
            });
          }

          // 群聊也支援行事曆事件標籤
          const gcCalendarEvents = parseCalendarEventTags(finalContent);
          if (gcCalendarEvents.length > 0) {
            for (const calEvent of gcCalendarEvents) {
              await handleCalendarEvent(calEvent);
            }
          }

          // 群聊也支援飲食記錄標籤
          const gcFoodRecords = parseFoodRecordTags(finalContent);
          for (const r of gcFoodRecords) await handleFoodRecord(r);
        }
        // 非群聊模式：檢查是否需要解析（包含導演系統標籤）
        else if (needsParsing(finalContent)) {
          console.log("[ChatScreen][render] 進入 1v1 解析路徑，準備呼叫 parseAIResponse");
          let parsed;
          try {
            const _parseStart = Date.now();
            parsed = parseAIResponse(finalContent);
            console.log("[ChatScreen][render] parseAIResponse 完成", {
              elapsedMs: Date.now() - _parseStart,
              messageCount: parsed?.messages?.length ?? 0,
              hasAffinityUpdate: parsed?.hasAffinityUpdate,
              hasScheduleCall: parsed?.hasScheduleCall,
              hasCharLocation: parsed?.hasCharLocation,
              hasCalendarEvent: parsed?.hasCalendarEvent,
              hasFoodRecord: parsed?.hasFoodRecord,
              hasTimeJump: parsed?.hasTimeJump,
              hasPlurkPost: parsed?.hasPlurkPost,
              charActionsCount: parsed?.charActions?.length ?? 0,
            });
          } catch (parseError) {
            console.warn(
              "[ChatScreen] AI 回覆解析失敗，使用原始內容:",
              parseError,
            );
            if (msgIndex !== -1) {
              messages.value[msgIndex].content = finalContent;
              messages.value[msgIndex].isStreaming = false;
            }
            parsed = null;
          }

          if (parsed) {
            // 處理來電預約標籤
            if (parsed.hasScheduleCall && parsed.scheduleCallData) {
              console.log("[ChatScreen][render] await handleScheduleCall");
              await handleScheduleCall(parsed.scheduleCallData);
              console.log("[ChatScreen][render] handleScheduleCall 完成");
            }

            // 處理角色位置推測標籤
            if (parsed.hasCharLocation && parsed.charLocationData) {
              console.log("[ChatScreen][render] await handleCharLocationUpdate");
              await handleCharLocationUpdate(parsed.charLocationData.location);
              console.log("[ChatScreen][render] handleCharLocationUpdate 完成");
            }

            // 處理行事曆事件標籤
            if (parsed.hasCalendarEvent && parsed.calendarEvents) {
              for (const calEvent of parsed.calendarEvents) {
                await handleCalendarEvent(calEvent);
              }
            }

            // 處理飲食記錄標籤
            if (parsed.hasFoodRecord && parsed.foodRecords) {
              for (const r of parsed.foodRecords) await handleFoodRecord(r);
            }

            // 處理時間跳轉標籤（偏移時間模式）
            if (
              parsed.hasTimeJump &&
              parsed.timeJumpTarget &&
              fakeTime.fakeTimeMode.value === "offset"
            ) {
              console.log("[ChatScreen][render] fakeTime.jumpToTime");
              fakeTime.jumpToTime(parsed.timeJumpTarget);
              console.log("[ChatScreen][render] fakeTime.jumpToTime 完成");
              await saveChat();
            }

            // 處理噗浪發文
            if (parsed.hasPlurkPost && parsed.plurkContent) {
              console.log("[ChatScreen][render] await handlePlurkPost");
              await handlePlurkPost(parsed.plurkContent);
              console.log("[ChatScreen][render] handlePlurkPost 完成");
            }

            // 處理角色動作標籤（封鎖、解封、道歉外賣等）
            if (
              parsed.charActions &&
              parsed.charActions.length > 0 &&
              currentChatId.value
            ) {
              const blockSvc = BlockService.getInstance();
              for (const action of parsed.charActions) {
                if (action.action === "block-user") {
                  const didBlock = await blockSvc.handleCharacterBlock(
                    currentChatId.value,
                    action.reason || "",
                  );
                  // 先從 DB 讀取封鎖時間，再更新 UI 狀態（避免 v-memo 重渲染時 blockedAt 還是舊值）
                  const updatedChat = await refreshBlockStateFromStorage();
                  if (!didBlock) continue;
                  currentBlockedAt.value = updatedChat?.blockState?.blockedAt ?? Date.now();
                  isBlockedByChar.value = true;
                  // 插入封鎖系統通知訊息（冪等：避免重複插入）
                  const alreadyHasBlockNotif = messages.value.some(
                    (m) => m.isCharBlockedNotification,
                  );
                  if (!alreadyHasBlockNotif) {
                    messages.value.push({
                      id: `msg_blocked_${Date.now()}`,
                      role: "system",
                      content: "對方已將你封鎖",
                      timestamp: Date.now(),
                      isCharBlockedNotification: true,
                      charBlockedReason: action.reason || "",
                    });
                  }
                } else if (action.action === "unblock-user") {
                  await blockSvc.handleCharacterUnblock(currentChatId.value);
                  // 即時更新 UI 封鎖狀態
                  currentBlockedAt.value = 0;
                  isBlockedByChar.value = false;
                  await refreshBlockStateFromStorage();
                } else if (action.action === "apology-food") {
                  // 道歉外賣：角色被封鎖時點外賣給用戶道歉
                  try {
                    const { default: ApologyFoodService } = await import("@/services/ApologyFoodService");
                    const charId = props.characterId || currentCharacter.value?.id || "";
                    await ApologyFoodService.getInstance().handleApologyFood(
                      currentChatId.value,
                      charId,
                      action.item || "",
                      action.message || "",
                    );
                    console.log("[ChatScreen] 道歉外賣已觸發:", { item: action.item, message: action.message });
                  } catch (err) {
                    console.error("[ChatScreen] 道歉外賣處理失敗:", err);
                  }
                }
              }
            }

            // 處理好感度更新（移至訊息建立後，以便綁定快照到第一條新 AI 訊息）
            let _pendingAffinityUpdates = parsed.hasAffinityUpdate
              ? parsed.affinityUpdates
              : null;

            console.log("[ChatScreen][render] 進入 1v1 渲染迴圈", {
              parsedCount: parsed.messages.length,
              theaterPhoneScript: !!options?.theaterPhoneScript,
              finalContentLen: finalContent.length,
            });

            // 移除原始的佔位訊息
            if (msgIndex !== -1) {
              messages.value.splice(msgIndex, 1);
            }

            // 為每個解析後的訊息創建獨立的聊天訊息（逐條顯示：首條延遲 500ms，後續每條間隔 300ms）
            let _firstNewAiMsgId: string | undefined;
            const _totalMsgs1 = parsed.messages.filter(
              (pm) =>
                pm.content ||
                pm.isTimetravel ||
                pm.isRedpacket ||
                pm.isLocation ||
                pm.isTransfer ||
                pm.isGift ||
                pm.isAvatarChange ||
                pm.isAiImage ||
                pm.isHtmlBlock ||
                pm.isVoice ||
                pm.isWaimaiPaymentResult ||
                pm.isWaimaiDelivery ||
                pm.isCharRecall,
            ).length;
            let _shownMsgs1 = 0;
            // 📱 小手機劇本格式：預先決定每條訊息的左右分邊（含 AI 沒下前綴時的交替 fallback）
            const _theaterRoleMap1 = options?.theaterPhoneScript
              ? computeTheaterPhoneScriptRoleMap(
                  parsed.messages,
                  userStore.currentPersona?.name,
                  currentCharacter.value?.data?.name || props.characterName,
                )
              : null;
            for (let i = 0; i < parsed.messages.length; i++) {
              const parsedMsg = parsed.messages[i];

              // 處理情頭動作（在跳過空內容之前執行，避免產生空白氣泡）
              if (parsedMsg.isCoupleAvatar && parsedMsg.coupleAvatarAction) {
                await handleCoupleAvatarAction(parsedMsg.coupleAvatarAction);
              }

              // 跳過空內容的訊息（例如只有 PLURKPOST 標籤被移除後的空訊息）
              if (
                !parsedMsg.content &&
                !parsedMsg.isTimetravel &&
                !parsedMsg.isRedpacket &&
                !parsedMsg.isLocation &&
                !parsedMsg.isTransfer &&
                !parsedMsg.isGift &&
                !parsedMsg.isAvatarChange &&
                !parsedMsg.isAiImage &&
                !parsedMsg.isHtmlBlock &&
                !parsedMsg.isVoice &&
                !parsedMsg.isWaimaiPaymentResult &&
                !parsedMsg.isWaimaiDelivery &&
                !parsedMsg.isCharRecall &&
                !parsedMsg.isFaceToFaceRequest &&
                !parsedMsg.isOnlineModeRequest
              ) {
                continue;
              }

              // 時空跳轉訊息使用 system role，這樣會渲染成特殊的系統訊息樣式
              let messageRole: "user" | "ai" | "system" =
                parsedMsg.isTimetravel ? "system" : "ai";
              // 📱 小劇場小手機劇本格式：套用預先計算的分邊決策（含 fallback 交替）
              if (_theaterRoleMap1) {
                const decision = _theaterRoleMap1.get(i);
                if (decision) {
                  messageRole = decision.role;
                  parsedMsg.content = decision.content;
                }
              }
              const charRecallContext = parsedMsg.isCharRecall
                ? parsedMsg.charRecallType === "seen"
                  ? `(你撤回了訊息「${parsedMsg.charRecallContent || ""}」，但用戶已看見)`
                  : `(你撤回了一條訊息，用戶沒看見，心情提示是${(parsedMsg.charRecallHints || []).join("、")})`
                : undefined;
              const newMessage: Message = {
                id: `msg_${Date.now()}_${i}`,
                role: messageRole,
                content:
                  parsedMsg.isCharRecall
                    ? charRecallContext || ""
                    : parsedMsg.isAiImage && parsedMsg.imageDescription
                      ? `<pic>${parsedMsg.imageDescription}</pic>`
                      : parsedMsg.isHtmlBlock
                        ? ""
                        : parsedMsg.isVoice
                          ? `[語音訊息] ${parsedMsg.voiceContent || ""}`
                          : parsedMsg.content,
                timestamp: Date.now() + i,
                turnId: generationTurnId || undefined,
                thought: parsedMsg.thought,
                isTimetravel: parsedMsg.isTimetravel,
                timetravelContent: parsedMsg.timetravelContent,
                isRedpacket: parsedMsg.isRedpacket,
                redpacketData: parsedMsg.redpacketData,
                isLocation: parsedMsg.isLocation,
                locationContent: parsedMsg.locationContent,
                replyToContent: parsedMsg.replyToContent,
                isGift: parsedMsg.isGift,
                giftName: parsedMsg.giftName,
                isTransfer: parsedMsg.isTransfer,
                transferType: parsedMsg.transferType,
                transferAmount: parsedMsg.transferAmount,
                transferNote: parsedMsg.transferNote,
                transferStatus: parsedMsg.isTransfer
                  ? parsedMsg.transferType === "refund"
                    ? "refunded"
                    : "pending"
                  : undefined,
                isAvatarChange: parsedMsg.isAvatarChange,
                avatarChangeAction: parsedMsg.avatarChangeAction,
                avatarChangeMood: parsedMsg.avatarChangeMood,
                avatarChangeDesc: parsedMsg.avatarChangeDesc,
                messageType: parsedMsg.isAiImage
                  ? "descriptive-image"
                  : parsedMsg.isVoice
                    ? "audio"
                    : undefined,
                imageCaption: parsedMsg.isAiImage
                  ? parsedMsg.imageDescription
                  : undefined,
                imagePrompt: parsedMsg.imagePrompt,
                isHtmlBlock: parsedMsg.isHtmlBlock,
                htmlContent: parsedMsg.isHtmlBlock
                  ? parsedMsg.content
                  : undefined,
                audioTranscript: parsedMsg.isVoice
                  ? parsedMsg.voiceContent
                  : undefined,
                isCharRecall: parsedMsg.isCharRecall,
                charRecallType: parsedMsg.charRecallType,
                charRecallContent: parsedMsg.charRecallContent,
                charRecallHints: parsedMsg.charRecallHints,
                isFaceToFaceRequest: parsedMsg.isFaceToFaceRequest,
                faceToFaceRequestReason: parsedMsg.faceToFaceRequestReason,
                faceToFaceRequestStatus: parsedMsg.isFaceToFaceRequest
                  ? "pending"
                  : undefined,
                isOnlineModeRequest: parsedMsg.isOnlineModeRequest,
                onlineModeRequestReason: parsedMsg.onlineModeRequestReason,
                onlineModeRequestStatus: parsedMsg.isOnlineModeRequest
                  ? "pending"
                  : undefined,
              };

              applyWaimaiParsedResultToMessage(
                newMessage,
                parsedMsg,
                messages.value,
              );

              if (_totalMsgs1 > 1) {
                await _delay(_messageRenderDelay(_totalMsgs1));
              }
              _shownMsgs1++;
              messages.value.push(newMessage);
              scrollToBottom();

              if (!_firstNewAiMsgId && newMessage.role === "ai") {
                _firstNewAiMsgId = newMessage.id;
              }

              if (parsedMsg.isAvatarChange && parsedMsg.avatarChangeAction) {
                await handleAvatarChange(
                  parsedMsg.avatarChangeAction,
                  parsedMsg.avatarChangeMood,
                  parsedMsg.avatarChangeDesc,
                );
              }

              if (
                parsedMsg.isTransfer &&
                parsedMsg.transferType === "refund" &&
                parsedMsg.transferAmount
              ) {
                processAIRefund(parsedMsg.transferAmount);
              }

              if (
                parsedMsg.isAiImage &&
                (parsedMsg.imagePrompt || parsedMsg.imageDescription)
              ) {
                tryGenerateImageForMessage(
                  newMessage.id,
                  parsedMsg.imagePrompt,
                  parsedMsg.imageDescription,
                );
              }
              processMessageTTS(
                newMessage.id,
                parsedMsg.isVoice && parsedMsg.voiceContent
                  ? parsedMsg.voiceContent
                  : newMessage.content,
                parsedMsg.isVoice ? { force: true } : undefined,
              );
            }

            if (parsed.messages.length === 0 || _shownMsgs1 === 0) {
              if (_shownMsgs1 === 0 && parsed.messages.length > 0) {
                console.warn(
                  "[ChatScreen] 生成完成：所有解析訊息被過濾，觸發 fallback",
                  { parsedCount: parsed.messages.length },
                );
              }
              const fallbackContent = parsed.rawOutput || finalContent;
              const strippedFallback = fallbackContent.replace(/<[^>]*>/g, "").trim();
              if (strippedFallback) {
                messages.value.push({
                  id: `msg_${Date.now()}_fallback`,
                  role: "ai",
                  content: fallbackContent,
                  timestamp: Date.now(),
                  turnId: generationTurnId || undefined,
                });
              }
            }
            streamingWindow.setComplete();
          }
        }
      }
    }
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      // 用戶取消生成：保留已有內容，沒有內容就直接移除佔位氣泡
      const lastMsg = getActiveStreamingAIMessage();
      if (lastMsg && lastMsg.isStreaming) {
        lastMsg.isStreaming = false;
        if (useStreamingWindowEnabled.value && streamingWindow.content.value) {
          lastMsg.content = streamingWindow.content.value;
        }

        if (!lastMsg.content || !lastMsg.content.trim()) {
          const msgIndex = messages.value.findIndex((m) => m.id === lastMsg.id);
          if (msgIndex !== -1) {
            messages.value.splice(msgIndex, 1);
          }
          await saveChatImmediate();
        }
      }

      if (useStreamingWindowEnabled.value) {
        streamingWindow.setComplete();
      }
      return;
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    // 檢查是否已有 AI 訊息佔位符
    const lastMsg = getActiveStreamingAIMessage();
    if (lastMsg && lastMsg.role === "ai" && lastMsg.isStreaming) {
      lastMsg.content = `[錯誤] ${errorMsg}`;
      lastMsg.isStreaming = false;
    } else {
      const aiMessage: Message = {
        id: `msg_${Date.now()}`,
        role: "ai",
        content: `[錯誤] ${errorMsg}`,
        timestamp: Date.now(),
        turnId: generationTurnId || undefined,
      };
      messages.value.push(aiMessage);
    }

    // 設置流式窗口錯誤狀態
    if (useStreamingWindowEnabled.value) {
      streamingWindow.setError(errorMsg);
    }

    // 設置全局狀態錯誤
    setChatGenerationError(errorMsg);
  } finally {
    let persistedGenerationContent = latestFinalContent;
    if (
      !persistedGenerationContent &&
      usedStreamingWindowForCurrentGeneration &&
      streamingWindow.content.value
    ) {
      try {
        persistedGenerationContent = processAiOutputTemplate(
          applyAIOutputRegex(streamingWindow.content.value),
        );
      } catch {
        persistedGenerationContent = streamingWindow.content.value;
      }
    }

    // 完成全局生成狀態
    completeChatGeneration(persistedGenerationContent || undefined);

    // 安全網：無論走哪個分支（含 needsParsing=false 的純文字回覆），
    // 都要將流式窗口標記為完成，避免底部一直顯示「停止」按鈕。
    // setComplete 是冪等的，重複調用無副作用。
    if (useStreamingWindowEnabled.value) {
      streamingWindow.setComplete();
    }

    // 安全網：非主動中止時，如果流式窗口已有內容，確保最後一條 AI 訊息也有內容
    if (
      useStreamingWindowEnabled.value &&
      streamingWindow.content.value &&
      !controller.signal.aborted
    ) {
      const lastAI = [...messages.value].reverse().find((m) => m.role === "ai");
      if (lastAI && lastAI.isStreaming && !lastAI.content) {
        const windowContent = processAiOutputTemplate(
          applyAIOutputRegex(streamingWindow.content.value),
        );
        if (windowContent) {
          console.warn(
            "[ChatScreen] 安全網：流式窗口有內容但訊息為空，同步內容",
          );
          lastAI.content = windowContent;
          lastAI.isStreaming = false;
        }
      }
    }

    // 附加暫存的 roundSwipes 到最後一條 AI 訊息
    attachPendingRoundSwipes(generationTurnId || undefined);

    scrollToBottom();
    await saveChatImmediate();

    // 處理禮物接收（標記為已接收並記錄重要事件）
    await processGiftReceived();

    // 發送聊天訊息通知（如果用戶不在此聊天頁面）
    if (currentChatId.value) {
      const lastAI = [...messages.value].reverse().find((m) => m.role === "ai");
      if (lastAI) {
        const charName =
          currentCharacter.value?.data?.name || props.characterName || "角色";
        const charAvatar =
          currentCharacter.value?.avatar || props.characterAvatar;
        const charId = props.characterId || currentCharacter.value?.id;
        notificationStore.notifyChatMessage(
          charName,
          lastAI.content,
          currentChatId.value,
          charId,
          charAvatar,
        );
      }
    }

    // 檢查是否需要觸發總結或日記生成（重新生成時跳過）
    if (!options?.skipAutoTrigger) {
      checkAndTriggerSummaryOrDiary();
    }
  }
}

// ===== 匯入/匯出 composable 初始化 =====
const {
  jsonlFileInputRef,
  triggerJsonlImport,
  handleJsonlFileSelected,
  exportCurrentChat,
  startNewConversation,
  confirmNewConversation,
  showNewConversationConfirm,
  newConvGreetingIndex,
  newConvAvailableGreetings,
  clearChatHistory,
} = useChatExport({
  currentChatId,
  messages,
  currentCharacter,
  characterId: props.characterId,
  characterName: props.characterName,
  chatSummaries,
  chatDiaries,
  lastSummaryTime,
  lastDiaryTime,
  resetVisibleCount,
  scrollToBottom,
  saveChatImmediate,
  loadOrCreateChat,
  showMoreMenu,
  notifyChatCleared: async () => {
    resetAfterChatCleared();
  },
});

// 停止 AI 生成
function stopAIGeneration() {
  stopChatGeneration();
}

function getActiveStreamingAIMessage() {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const message = messages.value[i];
    if (message.role === "ai" && message.isStreaming) {
      return message;
    }
  }
  return null;
}

// ===== 流式輸出窗口事件處理 =====

// 處理流式窗口停止
function handleStreamingStop() {
  stopAIGeneration();
}

// 處理流式窗口關閉
async function handleStreamingClose() {
  // 注意：如果流式已經完成（done 事件已處理），訊息已經被解析並添加了
  // 此時只需要隱藏窗口，不需要再次處理訊息

  // 取得目前仍在流式中的 AI 訊息，避免被隱藏的 [繼續] 提示干擾
  const lastMsg = getActiveStreamingAIMessage();
  const closeTurnId = lastMsg?.turnId || currentTurnId.value || "";
  const windowContent = processAiOutputTemplate(
    applyAIOutputRegex(streamingWindow.content.value),
  );

  // 只有當最後一條訊息還在流式狀態時，才需要處理
  if (
    lastMsg &&
    lastMsg.role === "ai" &&
    lastMsg.isStreaming &&
    windowContent
  ) {
    const lastMsgIndex = messages.value.findIndex((m) => m.id === lastMsg.id);

    // 關閉窗口時如果還在生成中，先停止生成以避免 done 事件重複處理
    stopAIGeneration();

    // 檢查是否需要解析（包含導演系統標籤）
    if (needsParsing(windowContent)) {
      // 群聊/多人卡模式使用群聊解析器
      if (useGroupChatParser.value) {
        const parsed = parseGroupChatResponse(windowContent);
        if (lastMsgIndex !== -1) {
          messages.value.splice(lastMsgIndex, 1);
        }

        for (let i = 0; i < parsed.messages.length; i++) {
          const parsedMsg = parsed.messages[i];
          const senderInfo = resolveGroupMemberByName(parsedMsg.senderName || "");
          const senderName = senderInfo.canonicalName;
          const senderCharId = senderInfo.characterId;
          const senderAvatar = senderInfo.avatar;

          if (parsedMsg.isGroupAction) {
            messages.value.push({
              id: `msg_${Date.now()}_${i}`,
              role: "system",
              content: "",
              timestamp: Date.now() + i,
              isGroupAction: true,
              groupActionType: parsedMsg.groupActionType,
              groupActionActor: parsedMsg.groupActionActor,
              groupActionTarget: parsedMsg.groupActionTarget ?? undefined,
              groupActionValue: parsedMsg.groupActionValue ?? undefined,
            });
            continue;
          }
          if (parsedMsg.isRecall) {
            messages.value.push({
              id: `msg_${Date.now()}_${i}`,
              role: "system",
              content: "",
              timestamp: Date.now() + i,
              isRecall: true,
              recallContent: parsedMsg.recallContent,
              senderCharacterId: senderCharId,
              senderCharacterName: senderName,
            });
            continue;
          }
          if (parsedMsg.isPrivateMessage) {
            messages.value.push({
              id: `msg_${Date.now()}_${i}`,
              role: "ai",
              content: parsedMsg.content,
              timestamp: Date.now() + i,
              turnId: closeTurnId || undefined,
              isPrivateMessage: true,
              senderCharacterId: senderCharId,
              senderCharacterName: senderName,
              senderCharacterAvatar: senderAvatar,
            });
            continue;
          }

          // 處理群通話請求（角色發起群通話）
          if (parsedMsg.isGroupCallRequest) {
            if (!showGroupCallModal.value) {
              const callRequestMsg: Message = {
                id: `msg_${Date.now()}_${i}`,
                role: "system",
                content: `${senderName} 發起了群通話${parsedMsg.groupCallRequestReason ? `：${parsedMsg.groupCallRequestReason}` : ""}`,
                timestamp: Date.now() + i,
              };
              messages.value.push(callRequestMsg);

              groupCallStartedAt.value = Date.now();
              groupCallMessages.value = [];
              groupCallParticipants.value = [];

              const initiatorChar = charactersStore.characters.find(
                (c) => c.id === senderCharId,
              );
              if (senderCharId) {
                groupCallParticipants.value.push({
                  characterId: senderCharId,
                  name: senderName,
                  avatar: initiatorChar?.avatar || "",
                  isSpeaking: false,
                });
              }

              groupCallMessages.value.push({
                type: "system",
                content: `${senderName} 發起了群通話`,
                timestamp: Date.now(),
              });

              if (currentChatData.value?.groupMetadata) {
                currentChatData.value.groupMetadata.callState = {
                  isActive: true,
                  initiatorCharacterId: senderCharId || null,
                  startedAt: groupCallStartedAt.value,
                  participants: senderCharId
                    ? [{ characterId: senderCharId, joinedAt: Date.now() }]
                    : [],
                };
              }

              showGroupCallModal.value = true;
            }
            continue;
          }

          // 處理群通話回應
          if (parsedMsg.isGroupCallResponse) {
            if (parsedMsg.groupCallResponseAction === "join") {
              if (senderCharId) {
                handleGroupCallJoin(senderCharId, senderName);
              }
            } else if (parsedMsg.groupCallResponseAction === "decline") {
              groupCallMessages.value.push({
                type: "system",
                content: `${senderName} 拒絕加入通話${parsedMsg.groupCallDeclineReason ? `：${parsedMsg.groupCallDeclineReason}` : ""}`,
                timestamp: Date.now(),
              });
            }
            continue;
          }

          // 處理加入通話
          if (parsedMsg.isJoinCall) {
            if (senderCharId && showGroupCallModal.value) {
              handleGroupCallJoin(senderCharId, senderName);
            }
            if (parsedMsg.content && showGroupCallModal.value) {
              addGroupCallVoiceMessage(senderName, parsedMsg.content);
            }
            continue;
          }

          // 處理離開通話
          if (parsedMsg.isLeaveCall) {
            if (senderCharId && showGroupCallModal.value) {
              handleGroupCallLeave(
                senderCharId,
                senderName,
                parsedMsg.leaveCallReason,
              );
            }
            if (parsedMsg.content && showGroupCallModal.value) {
              addGroupCallVoiceMessage(senderName, parsedMsg.content);
            }
            continue;
          }

          // 如果群通話進行中，所有訊息都加入通話訊息列表（作為語音）
          if (showGroupCallModal.value) {
            if (parsedMsg.isVoice && parsedMsg.voiceContent) {
              addGroupCallVoiceMessage(senderName, parsedMsg.voiceContent);
              continue;
            }
            if (parsedMsg.content) {
              addGroupCallVoiceMessage(senderName, parsedMsg.content);
              continue;
            }
            if (parsedMsg.isStickerMsg && parsedMsg.stickerMeaning) {
              addGroupCallVoiceMessage(
                senderName,
                `[表情：${parsedMsg.stickerMeaning}]`,
              );
              continue;
            }
            continue;
          }

          if (
            !parsedMsg.content &&
            !parsedMsg.isStickerMsg &&
            !parsedMsg.isVoice &&
            !parsedMsg.isAiImage
          )
            continue;

          // 表情包：將 stickerMeaning 轉為 MessageBubble 可識別的 [sticker:名稱] 格式
          let windowMsgContent = parsedMsg.content;
          if (parsedMsg.isStickerMsg && parsedMsg.stickerMeaning) {
            windowMsgContent = `[sticker:${parsedMsg.stickerMeaning}]`;
          }
          // AI 圖片：將描述轉為 <pic> 標籤以觸發拍立得渲染
          if (parsedMsg.isAiImage && parsedMsg.imageDescription) {
            windowMsgContent = `<pic>${parsedMsg.imageDescription}</pic>`;
          }
          // 語音：顯示語音條 UI
          if (parsedMsg.isVoice && parsedMsg.voiceContent) {
            windowMsgContent = `[語音訊息] ${parsedMsg.voiceContent}`;
          }

          const windowGcMsg: Message = {
            id: `msg_${Date.now()}_${i}`,
            role: "ai",
            content: windowMsgContent,
            timestamp: Date.now() + i,
            turnId: closeTurnId || undefined,
            thought: parsedMsg.thought,
            messageType: parsedMsg.isAiImage
              ? "descriptive-image"
              : parsedMsg.isVoice
                ? "audio"
                : undefined,
            imageCaption: parsedMsg.isAiImage
              ? parsedMsg.imageDescription
              : undefined,
            imagePrompt: parsedMsg.imagePrompt,
            audioTranscript: parsedMsg.isVoice
              ? parsedMsg.voiceContent
              : undefined,
            senderCharacterId: senderCharId,
            senderCharacterName: senderName,
            senderCharacterAvatar: senderAvatar,
            isRedpacket: parsedMsg.isRedpacket,
            redpacketData: parsedMsg.redpacketData,
            isLocation: parsedMsg.isLocation,
            locationContent: parsedMsg.locationContent,
            replyToContent: parsedMsg.replyToContent,
            isGift: parsedMsg.isGift,
            giftName: parsedMsg.giftName,
            isTransfer: parsedMsg.isTransfer,
            transferType: parsedMsg.transferType,
            transferAmount: parsedMsg.transferAmount,
            transferNote: parsedMsg.transferNote,
            transferStatus: parsedMsg.isTransfer
              ? parsedMsg.transferType === "refund"
                ? "refunded"
                : "pending"
              : undefined,
          };

          // 外賣付款結果/送達（群聊窗口模式）
          applyWaimaiParsedResultToMessage(
            windowGcMsg,
            parsedMsg,
            messages.value,
          );

          messages.value.push(windowGcMsg);

          // 如果文生圖已開啟且有英文 prompt 或中文描述，觸發生圖
          if (
            parsedMsg.isAiImage &&
            (parsedMsg.imagePrompt || parsedMsg.imageDescription)
          ) {
            tryGenerateImageForMessage(
              windowGcMsg.id,
              parsedMsg.imagePrompt,
              parsedMsg.imageDescription,
            );
          }
          // MiniMax TTS 語音合成
          processMessageTTS(
            windowGcMsg.id,
            parsedMsg.isVoice && parsedMsg.voiceContent
              ? parsedMsg.voiceContent
              : windowGcMsg.content,
            parsedMsg.isVoice ? { force: true } : undefined,
          );
        }

        if (parsed.messages.length === 0 && windowContent) {
          messages.value.push({
            id: `msg_${Date.now()}_fallback`,
            role: "ai",
            content: parsed.rawOutput || windowContent,
            timestamp: Date.now(),
            turnId: closeTurnId || undefined,
          });
        }
      } else {
        let parsed;
        try {
          parsed = parseAIResponse(windowContent);
        } catch (parseError) {
          console.warn(
            "[ChatScreen] 關閉窗口時 AI 回覆解析失敗，使用原始內容:",
            parseError,
          );
          if (lastMsgIndex !== -1) {
            messages.value.splice(lastMsgIndex, 1);
          }
          messages.value.push({
            id: `msg_${Date.now()}`,
            role: "ai",
            content: windowContent,
            timestamp: Date.now(),
            turnId: closeTurnId || undefined,
          });
          parsed = null;
        }

        if (parsed) {
          console.log("[ChatScreen] 關閉窗口時解析 AI 回覆:", {
            thinking: parsed.thinking ? "有" : "無",
            messageCount: parsed.messages.length,
          });

          // 移除原始的佔位訊息
          if (lastMsgIndex !== -1) {
            messages.value.splice(lastMsgIndex, 1);
          }

          // 為每個解析後的訊息創建獨立的聊天訊息（逐條顯示：首條延遲 500ms，後續每條間隔 300ms）
          let _firstNewAiMsgId3: string | undefined;
          const _totalMsgs3 = parsed.messages.length;
          let _shownMsgs3 = 0;
          // 📱 小手機劇本格式：預先決定每條訊息的左右分邊（含 AI 沒下前綴時的交替 fallback）
          const _theaterRoleMap3 = _theaterPhoneScriptForCurrentGeneration
            ? computeTheaterPhoneScriptRoleMap(
                parsed.messages,
                userStore.currentPersona?.name,
                currentCharacter.value?.data?.name || props.characterName,
              )
            : null;
          for (let i = 0; i < parsed.messages.length; i++) {
            const parsedMsg = parsed.messages[i];

            // 處理情頭動作（在建立訊息之前執行，避免產生空白氣泡）
            if (parsedMsg.isCoupleAvatar && parsedMsg.coupleAvatarAction) {
              await handleCoupleAvatarAction(parsedMsg.coupleAvatarAction);
              if (!parsedMsg.content) continue;
            }

            // 📱 小劇場小手機劇本格式：套用預先計算的分邊決策（含 fallback 交替）
            let messageRoleWindowClose: "user" | "ai" | "system" = "ai";
            if (_theaterRoleMap3) {
              const decision = _theaterRoleMap3.get(i);
              if (decision) {
                messageRoleWindowClose = decision.role;
                parsedMsg.content = decision.content;
              }
            }

            const newMessage: Message = {
              id: `msg_${Date.now()}_${i}`,
              role: messageRoleWindowClose,
              content:
                parsedMsg.isAiImage && parsedMsg.imageDescription
                  ? `<pic>${parsedMsg.imageDescription}</pic>`
                  : parsedMsg.isHtmlBlock
                    ? ""
                    : parsedMsg.isVoice
                      ? `[語音訊息] ${parsedMsg.voiceContent || ""}`
                      : parsedMsg.content,
              timestamp: Date.now() + i,
              turnId: closeTurnId || undefined,
              thought: parsedMsg.thought,
              isTimetravel: parsedMsg.isTimetravel,
              timetravelContent: parsedMsg.timetravelContent,
              isRedpacket: parsedMsg.isRedpacket,
              redpacketData: parsedMsg.redpacketData,
              isLocation: parsedMsg.isLocation,
              locationContent: parsedMsg.locationContent,
              replyToContent: parsedMsg.replyToContent,
              isGift: parsedMsg.isGift,
              giftName: parsedMsg.giftName,
              // 轉帳相關
              isTransfer: parsedMsg.isTransfer,
              transferType: parsedMsg.transferType,
              transferAmount: parsedMsg.transferAmount,
              transferNote: parsedMsg.transferNote,
              transferStatus: parsedMsg.isTransfer
                ? parsedMsg.transferType === "refund"
                  ? "refunded"
                  : "pending"
                : undefined,
              // 換頭像相關
              isAvatarChange: parsedMsg.isAvatarChange,
              avatarChangeAction: parsedMsg.avatarChangeAction,
              avatarChangeMood: parsedMsg.avatarChangeMood,
              avatarChangeDesc: parsedMsg.avatarChangeDesc,
              // AI 圖片相關
              messageType: parsedMsg.isAiImage
                ? "descriptive-image"
                : parsedMsg.isVoice
                  ? "audio"
                  : undefined,
              imageCaption: parsedMsg.isAiImage
                ? parsedMsg.imageDescription
                : undefined,
              imagePrompt: parsedMsg.imagePrompt,
              // HTML 區塊相關
              isHtmlBlock: parsedMsg.isHtmlBlock,
              htmlContent: parsedMsg.isHtmlBlock
                ? parsedMsg.content
                : undefined,
              // 語音訊息相關
              audioTranscript: parsedMsg.isVoice
                ? parsedMsg.voiceContent
                : undefined,
              // 角色撤回相關（線上模式）
              isCharRecall: parsedMsg.isCharRecall,
              charRecallType: parsedMsg.charRecallType,
              charRecallContent: parsedMsg.charRecallContent,
              charRecallHints: parsedMsg.charRecallHints,
            };

            // 外賣付款結果/送達（窗口關閉時解析）
            applyWaimaiParsedResultToMessage(
              newMessage,
              parsedMsg,
              messages.value,
            );

            // 逐條顯示延遲：多條訊息時，根據訊息總數動態調整間隔
            if (_totalMsgs3 > 1) {
              await _delay(_messageRenderDelay(_totalMsgs3));
            }
            _shownMsgs3++;
            messages.value.push(newMessage);
            scrollToBottom();

            // 記錄第一條新 AI 訊息的 ID，用於好感度快照綁定
            if (!_firstNewAiMsgId3 && newMessage.role === "ai") {
              _firstNewAiMsgId3 = newMessage.id;
            }

            // 處理換頭像動作
            if (parsedMsg.isAvatarChange && parsedMsg.avatarChangeAction) {
              await handleAvatarChange(
                parsedMsg.avatarChangeAction,
                parsedMsg.avatarChangeMood,
                parsedMsg.avatarChangeDesc,
              );
            }

            // 處理 AI 的退回標籤
            if (
              parsedMsg.isTransfer &&
              parsedMsg.transferType === "refund" &&
              parsedMsg.transferAmount
            ) {
              processAIRefund(parsedMsg.transferAmount);
            }

            // 如果文生圖已開啟且有英文 prompt 或中文描述，觸發生圖
            if (
              parsedMsg.isAiImage &&
              (parsedMsg.imagePrompt || parsedMsg.imageDescription)
            ) {
              tryGenerateImageForMessage(
                newMessage.id,
                parsedMsg.imagePrompt,
                parsedMsg.imageDescription,
              );
            }
            // MiniMax TTS 語音合成
            processMessageTTS(
              newMessage.id,
              parsedMsg.isVoice && parsedMsg.voiceContent
                ? parsedMsg.voiceContent
                : newMessage.content,
              parsedMsg.isVoice ? { force: true } : undefined,
            );
          }

          // 將原始 <update> 區塊附加到最後一條 AI 訊息，供重新掃描使用
          if (parsed.rawUpdateBlock) {
            const lastAiMsg = [...messages.value]
              .reverse()
              .find((m) => m.role === "ai" && m.turnId === currentTurnId.value);
            if (lastAiMsg) {
              lastAiMsg._rawAffinityBlock = parsed.rawUpdateBlock;
            }
          }

          // 處理好感度更新（窗口關閉時解析）
          if (parsed.hasAffinityUpdate && parsed.affinityUpdates) {
            _handleAffinityUpdates(parsed.affinityUpdates, _firstNewAiMsgId3);
          }

          // 處理角色動作標籤（封鎖、解封、道歉外賣等）— 窗口關閉時解析
          if (
            parsed.charActions &&
            parsed.charActions.length > 0 &&
            currentChatId.value
          ) {
            const blockSvc = BlockService.getInstance();
            for (const action of parsed.charActions) {
              if (action.action === "block-user") {
                const didBlock = await blockSvc.handleCharacterBlock(
                  currentChatId.value,
                  action.reason || "",
                );
                const updatedChat = await refreshBlockStateFromStorage();
                if (!didBlock) continue;
                currentBlockedAt.value = updatedChat?.blockState?.blockedAt ?? Date.now();
                isBlockedByChar.value = true;
                const alreadyHasBlockNotif3 = messages.value.some(
                  (m) => m.isCharBlockedNotification,
                );
                if (!alreadyHasBlockNotif3) {
                  messages.value.push({
                    id: `msg_blocked_${Date.now()}`,
                    role: "system",
                    content: "對方已將你封鎖",
                    timestamp: Date.now(),
                    isCharBlockedNotification: true,
                    charBlockedReason: action.reason || "",
                  });
                }
              } else if (action.action === "unblock-user") {
                await blockSvc.handleCharacterUnblock(currentChatId.value);
                currentBlockedAt.value = 0;
                isBlockedByChar.value = false;
                await refreshBlockStateFromStorage();
              } else if (action.action === "apology-food") {
                try {
                  const { default: ApologyFoodService } = await import("@/services/ApologyFoodService");
                  const charId = props.characterId || currentCharacter.value?.id || "";
                  await ApologyFoodService.getInstance().handleApologyFood(
                    currentChatId.value,
                    charId,
                    action.item || "",
                    action.message || "",
                  );
                  console.log("[ChatScreen] 窗口關閉時道歉外賣已觸發:", { item: action.item, message: action.message });
                } catch (err) {
                  console.error("[ChatScreen] 窗口關閉時道歉外賣處理失敗:", err);
                }
              }
            }
          }

          // 如果沒有解析出任何訊息 **或** 解析出的訊息全被過濾，保留原始內容
          if (parsed.messages.length === 0 || _shownMsgs3 === 0) {
            if (_shownMsgs3 === 0 && parsed.messages.length > 0) {
              console.warn(
                "[ChatScreen] 窗口關閉：所有解析訊息被過濾，觸發 fallback",
                { parsedCount: parsed.messages.length },
              );
            }
            const fallbackContent = parsed.rawOutput || windowContent;
            const strippedFallback = fallbackContent.replace(/<[^>]*>/g, "").trim();
            if (strippedFallback) {
              const fallbackMessage: Message = {
                id: `msg_${Date.now()}`,
                role: "ai",
                content: fallbackContent,
                timestamp: Date.now(),
                turnId: currentTurnId.value || undefined,
              };
              messages.value.push(fallbackMessage);
            }
          }
        }
      } // end else (non-group-chat)
    } else {
      // 不需要解析，直接使用原始內容
      // 但仍需抽取心聲標記（ˇ想法ˇ 或 ~(想法)~），否則心聲氣泡無法點擊 / 編輯
      let _wClean = windowContent;
      let _wThought: string | undefined;
      const _wtnNew = windowContent.match(/ˇ([^ˇ]+)ˇ/g);
      if (_wtnNew && _wtnNew.length > 0) {
        const _im = _wtnNew[_wtnNew.length - 1].match(/ˇ([^ˇ]+)ˇ/);
        if (_im) _wThought = _im[1];
        _wClean = windowContent.replace(/\s*ˇ[^ˇ]+ˇ/g, "").trim();
      } else {
        const _wtnOld = windowContent.match(/~\(([^)]+)\)~/g);
        if (_wtnOld && _wtnOld.length > 0) {
          const _im = _wtnOld[_wtnOld.length - 1].match(/~\(([^)]+)\)~/);
          if (_im) _wThought = _im[1];
          _wClean = windowContent.replace(/\s*~\([^)]+\)~/g, "").trim();
        }
      }
      lastMsg.content = _wClean;
      lastMsg.thought = _wThought;
      lastMsg.isStreaming = false;
    }

    // 保存聊天
    saveChat();
  }

  // 隱藏窗口並重置狀態
  streamingWindow.hide();
  streamingWindow.reset();
}

// 處理流式窗口最小化（由全局事件觸發）
function handleStreamingMinimize() {
  isMinimizing.value = true;
  // 延遲一幀後執行最小化，讓動畫有時間開始
  nextTick(() => {
    streamingWindow.minimize();
    // 動畫結束後重置標記
    setTimeout(() => {
      isMinimizing.value = false;
    }, 350);
  });
}

// 處理從最小化恢復（由全局事件觸發）
function handleStreamingRestore() {
  streamingWindow.restore();
}

// ===== 流式窗口事件註冊 composable =====
const { registerStreamingHandlers, unregisterStreamingHandlers } =
  useChatStreamingHandlers({
    streamingWindow,
    onClose: handleStreamingClose,
    onStop: handleStreamingStop,
    onMinimize: handleStreamingMinimize,
    onRestore: handleStreamingRestore,
  });

// 處理返回
async function handleBack() {
  // 如果正在流式輸出，不中斷生成，讓它在後台繼續
  // 只需要隱藏流式窗口（如果可見）
  if (isGenerating.value && streamingWindow.isVisible.value) {
    // 最小化流式窗口而不是關閉，讓用戶可以在其他地方看到進度
    streamingWindow.minimize();
    console.log("[ChatScreen] 離開聊天介面，生成將在後台繼續");
  }

  // 暫存輸入框草稿
  if (currentChatId.value) {
    chatStore.saveDraft(currentChatId.value, inputText.value);
  }

  // 保存當前聊天狀態 (不等待，避免阻塞 UI)
  saveChatImmediate().catch(err => {
    console.error("[ChatScreen] handleBack saveChatImmediate failed:", err);
  });

  emit("back");
}

// 處理設定
function handleSettings() {
  showRail.value = false;
  emit("settings");
}

// 切換更多選單
function toggleMoreMenu() {
  showMoreMenu.value = !showMoreMenu.value;
  // 關閉其他選單
  showChatSettingsMenu.value = false;
  showGameMenu.value = false;
}

function openChatDetails() {
  closeMenus();
  showChatDetails.value = true;
}

// 切換小遊戲選單
function toggleGameMenu() {
  showGameMenu.value = !showGameMenu.value;
  // 關閉其他選單
  showMoreMenu.value = false;
  showChatSettingsMenu.value = false;
  showPersonaSelector.value = false;
}

type ChatGameModalType = "dishwashing" | "fishing" | "gambling" | "merit";

// 打開小遊戲
function openGame(game: ChatGameModalType) {
  showGameMenu.value = false;
  showRail.value = false;
  switch (game) {
    case "dishwashing":
      showDishWashingGame.value = true;
      break;
    case "fishing":
      showFishingGame.value = true;
      break;
    case "gambling":
      showGamblingGame.value = true;
      break;
    case "merit":
      showMeritHub.value = true;
      break;
  }
  enterGameScreen(game);
}

function closeGameModal(game: ChatGameModalType) {
  switch (game) {
    case "dishwashing":
      showDishWashingGame.value = false;
      break;
    case "fishing":
      showFishingGame.value = false;
      break;
    case "gambling":
      showGamblingGame.value = false;
      break;
    case "merit":
      showMeritHub.value = false;
      break;
  }
  leaveGameScreen(game);
}

// 切換聊天設定選單
function toggleChatSettingsMenu() {
  showChatSettingsMenu.value = !showChatSettingsMenu.value;
  // 關閉其他選單
  showMoreMenu.value = false;
  showPersonaSelector.value = false;
}

// 切換面對面模式（聊天專屬）
async function toggleFaceToFaceMode() {
  chatFaceToFaceMode.value = !chatFaceToFaceMode.value;
  await saveChat();
}

// 切換第三人稱模式（聊天專屬，面對面模式下）
async function toggleThirdPersonMode() {
  chatThirdPersonMode.value = !chatThirdPersonMode.value;
  await saveChat();
}

// 切換夜晚模式
async function toggleNightMode() {
  settingsStore.toggleNightMode();
  await settingsStore.saveSettings();
  // watch 會自動同步到 theme store
}

// 切換聊天勿擾模式（從選單）
async function toggleChatDoNotDisturb() {
  chatDoNotDisturb.value = !chatDoNotDisturb.value;
  await saveChatImmediate();
}

// 切換感知現實時間
async function toggleRealTimeAwareness() {
  chatEnableRealTimeAwareness.value = !chatEnableRealTimeAwareness.value;
  await saveChatImmediate();
}

// 跳轉時間（假時間功能）
async function handleTimeJump() {
  const input = timeJumpInput.value.trim();
  if (!input) return;
  // datetime-local 的值已經是 ISO 格式，直接傳給 jumpToTime
  const ok = fakeTime.jumpToTime(input);
  if (ok) {
    timeJumpInput.value = "";
    await saveChat();
  }
}

// 切換電話決定設定（從選單）
async function togglePhoneDecisionFromMenu() {
  enablePhoneDecision.value = !enablePhoneDecision.value;
  await saveChatImmediate();
}

// ===== NovelAI 文生圖設定 =====
const showNovelAISettingsModal = ref(false);

function toggleNovelAIImage() {
  settingsStore.novelAIImage.enabled = !settingsStore.novelAIImage.enabled;
  settingsStore.saveSettings();
}

function toggleNovelAIUseUserTag() {
  settingsStore.novelAIImage.useUserTag =
    !settingsStore.novelAIImage.useUserTag;
  settingsStore.saveSettings();
}

async function toggleChatImageSearch() {
  chatImageSearchEnabled.value = !chatImageSearchEnabled.value;
  if (!chatImageSearchEnabled.value) {
    showImageSearchPanel.value = false;
  }
  await saveChatImmediate();
}

function openNovelAISettings() {
  showChatSettingsMenu.value = false;
  showNovelAISettingsModal.value = true;
}

async function closeNovelAISettings() {
  showNovelAISettingsModal.value = false;
  // 關閉時也保存，避免用戶點擊 overlay / X / 取消後設定丟失
  await settingsStore.saveSettings();
}

async function saveNovelAISettings() {
  await settingsStore.saveSettings();
  showNovelAISettingsModal.value = false;
}

// NAI 配置導出
function exportNovelAIConfig() {
  const config = {
    _type: "aguaphone-nai-config",
    _version: 1,
    _exportedAt: new Date().toISOString(),
    enabled: settingsStore.novelAIImage.enabled,
    apiKey: settingsStore.novelAIImage.apiKey,
    model: settingsStore.novelAIImage.model,
    width: settingsStore.novelAIImage.width,
    height: settingsStore.novelAIImage.height,
    steps: settingsStore.novelAIImage.steps,
    scale: settingsStore.novelAIImage.scale,
    sampler: settingsStore.novelAIImage.sampler,
    seed: settingsStore.novelAIImage.seed,
    negativePrompt: settingsStore.novelAIImage.negativePrompt,
    positivePromptPrefix: settingsStore.novelAIImage.positivePromptPrefix,
    positivePromptSuffix: settingsStore.novelAIImage.positivePromptSuffix,
    useUserTag: settingsStore.novelAIImage.useUserTag,
    cfgRescale: settingsStore.novelAIImage.cfgRescale,
    noiseSchedule: settingsStore.novelAIImage.noiseSchedule,
    dynamicThresholding: settingsStore.novelAIImage.dynamicThresholding,
    varietyBoost: settingsStore.novelAIImage.varietyBoost,
    qualityToggle: settingsStore.novelAIImage.qualityToggle,
    ucPreset: settingsStore.novelAIImage.ucPreset,
    useProxy: settingsStore.novelAIImage.useProxy,
    proxyBaseUrl: settingsStore.novelAIImage.proxyBaseUrl,
  };

  const json = JSON.stringify(config, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nai-config-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// NAI 配置導入
const naiConfigFileInput = ref<HTMLInputElement | null>(null);

function triggerNAIConfigImport() {
  naiConfigFileInput.value?.click();
}

async function handleNAIConfigImport(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const config = JSON.parse(text);

    // 驗證格式
    if (config._type !== "aguaphone-nai-config") {
      alert("無效的 NAI 配置檔案：格式不正確");
      return;
    }

    // 逐一寫入設定（跳過元資料欄位）
    const skipKeys = ["_type", "_version", "_exportedAt"];
    for (const [key, value] of Object.entries(config)) {
      if (skipKeys.includes(key)) continue;
      if (key in settingsStore.novelAIImage && value !== undefined) {
        (settingsStore.novelAIImage as Record<string, unknown>)[key] = value;
      }
    }

    await settingsStore.saveSettings();
    alert("NAI 配置已成功導入！");
  } catch (e) {
    console.error("[NAI Config Import] 失敗:", e);
    alert("導入失敗：檔案格式錯誤或已損壞");
  } finally {
    // 清空 input，允許再次選擇同一個檔案
    input.value = "";
  }
}

// 打開聊天資訊面板
function openChatInfo() {
  console.log("[ChatScreen] 打開聊天資訊面板");
  showMoreMenu.value = false;
  showChatInfoModal.value = true;
}

// 更新電話決定設定
async function updatePhoneDecision(value: boolean) {
  enablePhoneDecision.value = value;
  await saveChat();
}

// 更新勿擾模式設定
async function updateDoNotDisturb(value: boolean) {
  chatDoNotDisturb.value = value;
  await saveChat();
}

// 關閉選單（不關閉表情包面板）
function closeMenus() {
  showMoreMenu.value = false;
  showMoreFeatures.value = false;
  showPersonaSelector.value = false;
  showChatSettingsMenu.value = false;
  showGameMenu.value = false;
  showChatFilesPanel.value = false;
  showStickerPanel.value = false;
  showChatDetails.value = false;
}

// ===== AI 記憶管理 =====
// 函數定義在 saveChat 之後

function convertStoredMessageToUiMessage(m: ChatMessage, chat: Chat): Message {
  return mapStoredMessageToUiMessage(m, chat, {
    characters: charactersStore.characters,
    syncModeRequestFieldsFromContent,
  });
}

// 載入或創建聊天
async function loadOrCreateChat(overrideChatId?: string) {
  await db.init();
  resetVisibleCount();

  // 確保設定已載入
  if (settingsStore.isLoading) {
    await settingsStore.loadSettings();
  }

  const targetChatId = overrideChatId || props.chatId;

  if (targetChatId) {
    // 載入現有聊天
    try {
      const chat = await loadChatById(targetChatId);
      if (chat) {
        currentChatId.value = chat.id;
        currentChatData.value = chat;

        // 載入封鎖狀態
        await loadBlockState();

        // 初始化聊天變量（{{getvar}} / {{setvar}} 宏系統）
        chatVariablesStore.initForChat(chat.id);
        getMacroEngine().registerVarMacros(chatVariablesStore);

        // 清除未讀計數（只更新 metadata，不寫入訊息）
        if (chat.unreadCount) {
          chat.unreadCount = 0;
          await setLocalChatUnreadCount(chat.id, 0);
        }

        const rawMessages = await loadAndRepairChatMessages(chat);
        markMessagesLoaded();

        // 圖片：不再一次性還原所有 base64 到記憶體，改為 MessageBubble 按需從 IndexedDB 讀取
        // 保持引用 ID（chatimg_xxx）在訊息中，大幅降低記憶體佔用（P1 修復）

        // 音頻：不再一次性載入所有 Blob，改為按需載入（P1 修復：減少記憶體佔用）
        // audioBlobId 保留在訊息中，播放時再從 IndexedDB 讀取

        messages.value = rawMessages.map((m) =>
          convertStoredMessageToUiMessage(m, chat),
        );
        // 載入聊天專屬的 Persona 覆蓋數據
        const personaOverride = (chat.metadata as any)?.personaOverride;
        if (personaOverride) {
          chatPersonaOverride.value = {
            secrets: personaOverride.secrets ?? "",
            powerDynamic: personaOverride.powerDynamic ?? "",
          };
          // 只要 personaOverride 存在就標記為已設定
          hasPersonaOverride.value = true;
          console.log(
            "[ChatScreen] 載入 personaOverride:",
            JSON.stringify(chatPersonaOverride.value),
          );
          // 如果聊天有關聯的 persona，切換到該 persona
          if (
            personaOverride.personaId &&
            userStore.personas.some((p) => p.id === personaOverride.personaId)
          ) {
            userStore.switchPersona(personaOverride.personaId);
            chatBoundPersonaId.value = personaOverride.personaId;
          } else {
            // personaId 為空或對應的 persona 已被刪除
            // 從 IDB 重新讀取全局設定，避免繼承上一個聊天的 persona
            if (personaOverride.personaId) {
              console.warn(
                "[ChatScreen] 聊天關聯的 Persona 已不存在:",
                personaOverride.personaId,
              );
            }
            // 嘗試透過角色綁定或預設 persona 自動切換
            const charId = chat.characterId || props.characterId;
            if (!userStore.autoSwitchPersonaForChat(charId, null)) {
              await _restoreGlobalPersona();
            }
            chatBoundPersonaId.value = userStore.currentPersonaId;
          }
        } else {
          // 舊聊天沒有 personaOverride
          chatPersonaOverride.value = { secrets: "", powerDynamic: "" };
          hasPersonaOverride.value = false;
          // 嘗試透過角色綁定或預設 persona 自動切換
          const charId = chat.characterId || props.characterId;
          if (!userStore.autoSwitchPersonaForChat(charId, null)) {
            await _restoreGlobalPersona();
          }
          chatBoundPersonaId.value = userStore.currentPersonaId;
        }
        enablePhoneDecision.value = chat.enablePhoneDecision !== false;
        // 載入勿擾模式設定（默認為 false）
        chatDoNotDisturb.value = chat.doNotDisturb === true;
        // 載入面對面模式設定（默認為 false）
        chatFaceToFaceMode.value = chat.faceToFaceMode === true;
        // 載入第三人稱模式設定（默認為 false）
        chatThirdPersonMode.value = chat.thirdPersonMode === true;
        // 載入感知現實時間設定（默認為 true）
        chatEnableRealTimeAwareness.value =
          chat.enableRealTimeAwareness !== false;
        // 載入假時間設定
        fakeTime.loadFromChat(chat);
        // 載入 MiniMax TTS 設定（默認為 false）
        chatMinimaxTTSEnabled.value = chat.minimaxTTSEnabled === true;
        chatImageSearchEnabled.value = chat.imageSearchEnabled !== false;
        chatSpeakerMode.value =
          chat.speakerMode === "char" || chat.speakerMode === "system"
            ? chat.speakerMode
            : "user";
        // 載入 MiniMax TTS 音色覆蓋
        chatMinimaxTTSOverride.value = chat.minimaxTTSOverride
          ? { ...chat.minimaxTTSOverride }
          : {};

        // 載入聊天專屬位置覆蓋
        chatLocationOverride.value = chat.locationOverride ?? null;

        // 載入聊天專屬頭像覆蓋
        charAvatarOverride.value = chat.charAvatarOverride ?? undefined;
        userAvatarOverride.value = chat.userAvatarOverride ?? undefined;

        // 載入情頭系統
        coupleAvatarLibrary.value = chat.coupleAvatarLibrary ?? [];
        activeCoupleAvatarId.value = chat.activeCoupleAvatarId ?? null;

        // 載入總結設定
        if (chat.summarySettings) {
          chatSummarySettings.value = { ...chat.summarySettings };
          console.log("[ChatScreen] 載入總結設定:", chat.summarySettings);
        } else {
          chatSummarySettings.value = createDefaultSummarySettings();
        }

        // 載入好感度配置和狀態（必須 await，否則開場白中的 <update> 解析會因 config 尚未載入而失敗）
        await _loadAffinityForChat(
          chat.id,
          chat.characterId || props.characterId,
        );

        // 載入並套用外觀設定
        console.log(
          "[ChatScreen] 從 IDB 載入外觀:",
          chat.appearance
            ? {
                useCustom: chat.appearance.useCustom,
                wallpaperType: chat.appearance.wallpaper?.type,
                wallpaperValueLength: chat.appearance.wallpaper?.value?.length,
              }
            : "undefined",
        );
        chatAppearance.value = chat.appearance;
        // 同步到 chatStore 緩存（讓 App.vue 可以讀取）
        chatStore.setAppearanceCache(chat.appearance);
        // 使用 nextTick 確保 DOM 已更新
        nextTick(() => {
          applyChatAppearance(chat.appearance);
        });
      }
    } catch (e) {
      console.error("載入聊天失敗:", e);
    }
  } else {
    // 新聊天（沒有 chatId）：嘗試透過角色綁定或預設 persona 自動切換
    const charId = props.characterId;
    if (charId) {
      userStore.autoSwitchPersonaForChat(charId, null);
    }
    chatBoundPersonaId.value = userStore.currentPersonaId;
    chatImageSearchEnabled.value = true;
    chatSpeakerMode.value = "user";
  }

  // 如果沒有訊息，添加開場白（群聯模式不添加角色開場白）
  // 檢查 metadata.skipGreeting 標記，如果用戶明確選擇不帶開場白則跳過
  const skipGreeting =
    (currentChatData.value?.metadata as any)?.skipGreeting === true;
  if (
    messages.value.length === 0 &&
    !currentChatData.value?.isGroupChat &&
    !skipGreeting
  ) {
    // ★ 診斷日誌：為什麼 messages 是空的？
    const targetChatId2 = overrideChatId || props.chatId;
    console.warn(
      "[ChatScreen] ⚠️ loadOrCreateChat 結束時 messages 為空，即將添加開場白",
      {
        targetChatId: targetChatId2,
        propsCharacterId: props.characterId,
        currentChatId: currentChatId.value,
        hasChatData: !!currentChatData.value,
        chatDataMsgCount: currentChatData.value?.messages?.length,
      },
    );
    // 尋找角色的 first_mes
    const character = charactersStore.characters.find(
      (c) =>
        c.nickname === props.characterName ||
        c.data.name === props.characterName,
    );
    const firstMessage = character?.data.first_mes;

    if (firstMessage) {
      messages.value.push(...createGreetingMessages(firstMessage));

      // 解析開場白中的好感度更新（支援 <update> _.set() 和 <affinity-update> 兩種格式）
      const greetingAffinityUpdates = parseAffinityUpdateTags(firstMessage);
      if (greetingAffinityUpdates.length > 0) {
        // 找到最後一條 AI 訊息的 ID 作為快照 key
        const lastAiMsg = [...messages.value]
          .reverse()
          .find((m) => m.role === "ai");
        _handleAffinityUpdates(greetingAffinityUpdates, lastAiMsg?.id);
      }
    }
  }

  // 載入總結和日記（群聊模式不載入，群聊有自己的記憶管理）
  await loadSummariesAndDiaries();

  // 恢復輸入框草稿
  if (currentChatId.value) {
    const draft = chatStore.getDraft(currentChatId.value);
    inputText.value = draft || "";
  } else {
    inputText.value = "";
  }

  scrollToBottom();

  // 重新設置載入更多觀察器（哨兵元素可能已重建）
  nextTick(() => {
    setupLoadMoreObserver();
  });

  // 初始化增量寫入追蹤狀態（讓後續 saveChat 能正確判斷是否為純追加）
  resetSaveTrackingFromMessages();
}

// 載入總結和日記
async function loadSummariesAndDiaries() {
  const chatId = currentChatId.value || props.chatId;
  const charId = props.characterId || currentCharacter.value?.id;
  const isGroupChat = currentChatData.value?.isGroupChat === true;

  if (!chatId && !charId) return;

  // 切換角色時先清空舊數據和時間戳，避免殘留上一個角色的資料
  chatSummaries.value = [];
  chatDiaries.value = [];
  lastSummaryTime.value = 0;
  lastDiaryTime.value = 0;

  try {
    // 載入總結 — 同時按 chatId 和 characterId 過濾
    const allSummaries = await db.getAll<{
      id: string;
      chatId: string;
      characterId: string;
      content: string;
      createdAt: number;
      messageCount: number;
      isImportant?: boolean;
      isManual?: boolean;
      isMeta?: boolean;
      keywords?: string[];
    }>(DB_STORES.SUMMARIES);

    chatSummaries.value = allSummaries
      .filter(
        (s) =>
          s.chatId === chatId &&
          (isGroupChat ||
            !charId ||
            !s.characterId ||
            s.characterId === charId),
      )
      .map((s) => ({
        id: s.id,
        content: s.content,
        createdAt: s.createdAt,
        messageCount: s.messageCount,
        isImportant: s.isImportant,
        isManual: s.isManual,
        isMeta: s.isMeta,
        keywords: s.keywords,
      }));

    // 載入日記 — 同時按 chatId 和 characterId 過濾
    const allDiaries = await db.getAll<{
      id: string;
      chatId: string;
      characterId: string;
      content: string;
      summary: string;
      createdAt: number;
      messageCount: number;
      isFavorite?: boolean;
      status: "writing" | "ready";
    }>(DB_STORES.DIARIES);

    chatDiaries.value = allDiaries
      .filter(
        (d) =>
          d.chatId === chatId &&
          (isGroupChat ||
            !charId ||
            !d.characterId ||
            d.characterId === charId),
      )
      .map((d) => ({
        id: d.id,
        content: d.content,
        summary: d.summary || "",
        createdAt: d.createdAt,
        messageCount: d.messageCount,
        isFavorite: d.isFavorite,
        status: d.status,
      }));

    // 初始化上次總結/日記時間（用於觸發檢查）
    if (chatSummaries.value.length > 0) {
      const latestSummary = chatSummaries.value.reduce((a, b) =>
        a.createdAt > b.createdAt ? a : b,
      );
      lastSummaryTime.value = latestSummary.createdAt;
    }

    if (chatDiaries.value.length > 0) {
      const latestDiary = chatDiaries.value.reduce((a, b) =>
        a.createdAt > b.createdAt ? a : b,
      );
      lastDiaryTime.value = latestDiary.createdAt;
    }

    console.log(
      `[ChatScreen] 載入 ${chatSummaries.value.length} 條總結, ${chatDiaries.value.length} 篇日記 (chatId=${chatId}, charId=${charId})`,
      `lastSummaryTime=${lastSummaryTime.value ? new Date(lastSummaryTime.value).toLocaleString() : "無"}`,
      `lastDiaryTime=${lastDiaryTime.value ? new Date(lastDiaryTime.value).toLocaleString() : "無"}`,
    );
  } catch (e) {
    console.error("載入總結/日記失敗:", e);
  }
}

// 載入重要事件用於 prompt
async function loadImportantEventsForPrompt(): Promise<
  Array<{
    id: string;
    content: string;
    category?: string;
    priority?: number;
  }>
> {
  const chatId = currentChatId.value || props.chatId;
  const charId = props.characterId || currentCharacter.value?.id;

  if (!chatId && !charId) return [];

  try {
    const id = chatId || charId;
    const eventsLog = await db.get<{
      events: Array<{
        id: string;
        content: string;
        category?: string;
        priority?: number;
      }>;
      settings: { enabled: boolean; maxEvents?: number };
    }>(DB_STORES.IMPORTANT_EVENTS, id!);

    if (
      eventsLog &&
      eventsLog.settings?.enabled &&
      eventsLog.events?.length > 0
    ) {
      // 按優先級排序後截取 maxEvents 數量
      const maxEvents = eventsLog.settings?.maxEvents ?? 50;
      return eventsLog.events
        .slice()
        .sort((a, b) => (a.priority || 3) - (b.priority || 3))
        .slice(0, maxEvents);
    }
  } catch (e) {
    console.error("載入重要事件失敗:", e);
  }
  return [];
}

// 將內部訊息格式轉換為 ChatMessage 格式（供儲存用）
function convertToStorableMessage(m: any, charName: string): ChatMessage {
  return mapToStorableMessage(m, charName);
}

// ===== 聊天儲存系統（debounce + 增量寫入） =====

function buildChatMetadata(
  storableMessages: ChatMessage[],
  charName: string,
): Chat {
  return buildChatMetadataFromState({
    chatId: currentChatId.value!,
    storableMessages,
    charName,
    currentChatData: currentChatData.value,
    characterId: props.characterId || currentCharacter.value?.id || "",
    existingMetadata: toRaw(currentChatData.value?.metadata ?? {}),
    personaId: chatBoundPersonaId.value || userStore.currentPersonaId || "",
    chatPersonaOverride: chatPersonaOverride.value,
    enablePhoneDecision: enablePhoneDecision.value,
    doNotDisturb: chatDoNotDisturb.value,
    faceToFaceMode: chatFaceToFaceMode.value,
    thirdPersonMode: chatThirdPersonMode.value,
    enableRealTimeAwareness: chatEnableRealTimeAwareness.value,
    fakeTimeFields: fakeTime.toChatFields(),
    minimaxTTSEnabled: chatMinimaxTTSEnabled.value,
    imageSearchEnabled: chatImageSearchEnabled.value,
    speakerMode: chatSpeakerMode.value,
    minimaxTTSOverride:
      Object.keys(chatMinimaxTTSOverride.value).length > 0
        ? { ...chatMinimaxTTSOverride.value }
        : undefined,
    appearance: chatAppearance.value,
    summarySettings: toRaw(chatSummarySettings.value),
    locationOverride: chatLocationOverride.value,
    charAvatarOverride: charAvatarOverride.value,
    userAvatarOverride: userAvatarOverride.value,
    coupleAvatarLibrary:
      coupleAvatarLibrary.value.length > 0 ? coupleAvatarLibrary.value : undefined,
    activeCoupleAvatarId: activeCoupleAvatarId.value,
  });
}

const chatPersistence = useChatPersistence({
  messages,
  currentChatId,
  currentChatData,
  getCharName: () => currentCharacter.value?.data?.name || props.characterName,
  getDirectCharacterId: () => props.characterId || currentCharacter.value?.id || "",
  convertToStorableMessage,
  buildChatMetadata,
  initChatVariables: (chatId: string) => {
    chatVariablesStore.initForChat(chatId);
    getMacroEngine().registerVarMacros(chatVariablesStore);
  },
  refreshBlockStateFromStorage,
});

function markMessagesLoaded() {
  chatPersistence.markMessagesLoaded();
}

function resetSaveTrackingFromMessages() {
  chatPersistence.resetSaveTrackingFromMessages();
}

function resetAfterChatCleared() {
  chatPersistence.resetAfterChatCleared();
}

function cancelPendingSaveTimer() {
  chatPersistence.cancelPendingSaveTimer();
}

function hasPendingSave() {
  return chatPersistence.hasPendingSave();
}

async function _saveChatImpl() {
  await chatPersistence.runSaveNow();
}

function saveChat() {
  chatPersistence.saveChat();
}

async function saveChatImmediate() {
  await chatPersistence.saveChatImmediate();
}

// ===== 電話通話結束處理 =====
interface PhoneCallMessage {
  id: string;
  role: "user" | "ai" | "system";
  content: string;
  timestamp: number;
}

async function handlePhoneCallEnded(
  callMessages: PhoneCallMessage[],
  duration: number,
) {
  if (callMessages.length === 0) return;

  // 通話紀錄由 phoneCallStore.persistCallRecord() 統一寫入 DB（phoneCall.ts endCall 內）。
  // 這裡不再另建 callRecordMessage，避免造成「📞 通話結束」卡片雙寫 / 渲染兩次。
  // 只負責從儲存重新載入訊息，讓目前打開的聊天 UI 立即看到那張通話卡片。
  const chatId = currentChatId.value;
  if (!chatId) return;

  try {
    // persistCallRecord 是非同步 append，短暫等待確保寫入完成後再讀取
    await new Promise((r) => setTimeout(r, 50));
    const chat = (await loadChatById(chatId)) || currentChatData.value;
    let latest = await loadMessages(chatId);
    if (chat) {
      latest = await repairSystemSenderRegressionIfNeeded(chat, latest);
    }
    if (chat && latest && Array.isArray(latest)) {
      messages.value = latest.map((m) => convertStoredMessageToUiMessage(m, chat));
      markMessagesLoaded();
    }
    scrollToBottom();
  } catch (err) {
    console.error("[ChatScreen] 重新載入通話結束後的訊息失敗:", err);
  }

  console.log("[ChatScreen] 電話通話結束，已從儲存刷新 UI", {
    duration,
    messageCount: callMessages.length,
  });
}

// ===== 來電功能處理 =====

async function handleScheduleCall(data: ScheduleCallData) {
  const char = currentCharacter.value;
  if (!char) {
    console.warn("[ChatScreen] 無法排程來電：未找到角色");
    return;
  }

  const characterInfo: CharacterInfo = {
    id: char.id,
    name: char.nickname || char.data.name || props.characterName,
    avatar: char.avatar || props.characterAvatar,
  };

  const chatId = currentChatId.value || props.chatId || "";

  const pendingCall = await getIncomingCallScheduler().schedulePendingCall(
    data,
    characterInfo,
    chatId,
  );

  if (pendingCall) {
    console.log("[ChatScreen] 來電已排程:", {
      delay: data.delay,
      reason: data.reason,
      triggerTime: new Date(pendingCall.triggerTime).toLocaleString(),
    });
  }
}

// ===== 角色位置推測處理 =====

async function handleCharLocationUpdate(location: string) {
  const char = currentCharacter.value;
  if (!char) {
    console.warn("[ChatScreen] 無法更新角色位置：未找到角色");
    return;
  }

  const oldLocation = char.worldSettings?.location;

  // 若位置相同則跳過
  if (oldLocation && oldLocation.trim() === location.trim()) {
    console.log("[ChatScreen] 角色位置未變化，跳過更新:", location);
    return;
  }

  try {
    await charactersStore.updateCharacter(char.id, {
      worldSettings: {
        ...char.worldSettings,
        location,
      },
    });

    // 同步本地 ref
    if (char.worldSettings) {
      char.worldSettings.location = location;
    } else {
      char.worldSettings = { location };
    }

    console.log(
      "[ChatScreen] 角色位置已更新:",
      oldLocation || "(無)",
      "→",
      location,
    );
  } catch (error) {
    console.error("[ChatScreen] 更新角色位置失敗:", error);
  }
}

// ===== 行事曆事件處理 =====

async function handleCalendarEvent(data: CalendarEventData): Promise<void> {
  try {
    const char = currentCharacter.value;
    const event: CalendarEvent = {
      id: `cal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: data.type,
      title: data.title,
      date: data.date,
      description: data.description,
      sourceCharacterId: char?.id,
      sourceChatId: currentChatId.value || props.chatId || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.put(DB_STORES.CALENDAR_EVENTS, JSON.parse(JSON.stringify(event)));

    // 插入系統訊息到聊天中，讓 AI 下一輪能看到已建立的事件
    const calendarMessage: Message = {
      id: `msg_cal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: "system",
      content: `[行事曆] 已建立事件：${data.title}（${data.date}）${data.description ? " - " + data.description : ""}`,
      timestamp: Date.now(),
      isCalendarEvent: true,
      calendarEventData: {
        type: data.type,
        title: data.title,
        date: data.date,
        description: data.description,
      },
    };
    messages.value.push(calendarMessage);

    const charName =
      char?.nickname || char?.data?.name || props.characterName || "角色";
    notificationStore.notifySystem(
      "行事曆已更新",
      `${charName} 幫你記錄了「${data.title}」（${data.date}）`,
    );
    console.log("[ChatScreen] 行事曆事件已建立:", data);
  } catch (e) {
    console.error("[ChatScreen] 行事曆事件建立失敗:", e);
  }
}

// ===== 飲食記錄處理 =====

async function handleFoodRecord(data: FoodRecordData): Promise<void> {
  try {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const time = data.time || `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`

    // 根據時間推斷餐別（若 AI 未提供）
    const hour = parseInt(time.split(':')[0])
    const guessedMeal =
      data.meal ??
      (hour < 10 ? 'breakfast' : hour < 14 ? 'lunch' : hour < 17 ? 'snack' : 'dinner') as FoodRecordData['meal']

    await fitnessStore.addFoodToMeal(date, guessedMeal!, {
      name: data.name,
      portion: data.portion,
      calories: data.calories,
      time,
    })

    // 格式化 M/D（去掉前導零）
    const [, mm, dd] = date.split('-')
    const mdStr = `${parseInt(mm)}/${parseInt(dd)}`
    const recordContent = `已記錄:${mdStr},${data.name}`

    messages.value.push({
      id: `msg_food_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: 'ai',
      content: recordContent,
      timestamp: Date.now(),
      isSystemNotification: true,
      isFoodRecord: true,
    })

    console.log('[ChatScreen] 飲食記錄已建立:', data)
  } catch (e) {
    console.error('[ChatScreen] 飲食記錄建立失敗:', e)
  }
}

// ===== 噗浪發文處理 =====

async function handlePlurkPost(content: string) {
  console.log("[ChatScreen] handlePlurkPost 被調用，內容長度:", content.length);
  console.log("[ChatScreen] handlePlurkPost 內容:", content);

  const char = currentCharacter.value;
  if (!char) {
    console.warn("[ChatScreen] 無法發噗浪：未找到角色");
    return;
  }

  // 確保 qzone store 已初始化
  if (!qzoneStore.isLoaded) {
    await qzoneStore.loadPosts();
  }

  const authorName = char.nickname || char.data.name || props.characterName;
  const authorAvatar = char.avatar || props.characterAvatar;

  try {
    const newPost = await qzoneStore.addPost({
      authorId: char.id,
      username: authorName,
      avatar: authorAvatar,
      content,
      type: "shuoshuo",
      visibility: "public",
      authorType: "ai",
    });

    console.log("[ChatScreen] 噗浪發文成功:", {
      postId: newPost.id,
      author: authorName,
      contentLength: content.length,
      content: content.substring(0, 100) + (content.length > 100 ? "..." : ""),
    });
  } catch (error) {
    console.error("[ChatScreen] 噗浪發文失敗:", error);
  }
}

// ===== 聊天初始化 composable =====
const { initializeChatScreen } = useChatInit({
  characterId: props.characterId,
  regexScriptsStore,
  loadAudioSettings,
  registerStreamingHandlers,
  userStore,
  stickerStore,
  weatherStore,
  messages,
  currentChatId,
  isChatGenerating,
  getChatGenerationTask,
  loadOrCreateChat,
  markInitialChatLoadDone,
  startPendingCallChecker,
  notificationStore,
  setupLoadMoreObserver,
});

// 檢查待處理來電
onMounted(async () => {
  await initializeChatScreen();
});

// 監聽後台生成完成：如果重新進入聊天時有舊的生成任務還在跑，
// 等它完成後重新從 IDB 載入訊息（避免切頁面後訊息丟失）
watch(
  () => isChatGenerating(),
  async (isGenerating, wasGenerating) => {
    // 生成剛完成（從 true 變 false），重新載入聊天記錄
    if (wasGenerating && !isGenerating && currentChatId.value) {
      // 等一小段時間確保 saveChat 已寫入 IDB
      await new Promise((r) => setTimeout(r, 300));
      try {
        // v24：從 chatMessages 表讀取最新訊息
        const dbMessages = await loadMessages(currentChatId.value);
        const dbMessageCount = dbMessages.length;
        const localMessageCount = messages.value.length;

        // 檢查是否有正在流式的空佔位符（離開時被保留的）
        const hasStreamingPlaceholder = messages.value.some(
          (m) => m.isStreaming && m.role === "ai",
        );

        // 條件：IDB 訊息更多、或本地有空佔位符、或（IDB 與本地筆數相同時）最後一條訊息不同
        // 注意：當本地筆數 > IDB（例如剛注入分享訊息、尚在寫入）時不能重載，否則會把本地新訊息覆蓋掉
        const shouldReload =
          dbMessageCount > localMessageCount ||
          hasStreamingPlaceholder ||
          (dbMessageCount === localMessageCount &&
            dbMessageCount > 0 &&
            dbMessages[dbMessages.length - 1]?.content !==
              messages.value[messages.value.length - 1]?.content);

        if (shouldReload) {
          const prevRealTimeAwareness = chatEnableRealTimeAwareness.value;
          const prevDoNotDisturb = chatDoNotDisturb.value;
          const prevPhoneDecision = enablePhoneDecision.value;
          const prevFaceToFaceMode = chatFaceToFaceMode.value;
          const prevThirdPersonMode = chatThirdPersonMode.value;
          const prevImageSearchEnabled = chatImageSearchEnabled.value;
          const prevSpeakerMode = chatSpeakerMode.value;

          await loadOrCreateChat();

          chatEnableRealTimeAwareness.value = prevRealTimeAwareness;
          chatDoNotDisturb.value = prevDoNotDisturb;
          enablePhoneDecision.value = prevPhoneDecision;
          chatFaceToFaceMode.value = prevFaceToFaceMode;
          chatThirdPersonMode.value = prevThirdPersonMode;
          chatImageSearchEnabled.value = prevImageSearchEnabled;
          chatSpeakerMode.value = prevSpeakerMode;

          scrollToBottom();
          console.log(
            "[ChatScreen] 已重新載入，訊息數:",
            messages.value.length,
          );
        }
      } catch (e) {
        console.warn("[ChatScreen] 重新載入聊天失敗:", e);
      }

      // AI 輸出完畢後自動重新掃描好感度數值（安全網）
      if (_affinityConfig.value?.enabled) {
        nextTick(() => rescanAffinityFromMessages());
      }
    }
  },
);

useChatCleanup({
  characterId: props.characterId,
  showDishWashingGame,
  showFishingGame,
  showGamblingGame,
  showMeritHub,
  unregisterStreamingHandlers,
  isRecording,
  cancelPendingSaveTimer,
  isChatGenerating,
  messages,
  getChatGenerationTask,
  saveChatNow: _saveChatImpl,
  hasPendingSave,
  currentChatId,
  inputText,
  chatStore,
  stopPendingCallChecker,
  cleanupLoadMoreObserver,
  applyChatAppearance,
  notificationStore,
  fakeTime,
});
</script>

<template>
  <div
    ref="chatScreenRef"
    class="screen-container chat-screen"
    @click="closeMenus"
  >
    <!-- 標題欄 -->
    <ChatScreenHeader
      :display-avatar="displayAvatar"
      :character-name="props.characterName"
      :is-group-chat="isGroupChat"
      :group-display-name="groupDisplayName"
      :display-character-name="displayCharacterName"
      :current-character="currentCharacter"
      :show-nickname-edit="showNicknameEdit"
      :nickname-edit-value="nicknameEditValue"
      :is-generating="isGenerating"
      :group-member-count="groupMemberCount"
      :show-rail="showRail"
      :current-user-avatar="userStore.currentAvatar"
      :current-user-name="userStore.currentName"
      :personas="userStore.personas"
      :current-persona-id="userStore.currentPersonaId"
      :show-persona-selector="showPersonaSelector"
      :show-game-menu="showGameMenu"
      :show-chat-settings-menu="showChatSettingsMenu"
      :chat-face-to-face-mode="chatFaceToFaceMode"
      :chat-third-person-mode="chatThirdPersonMode"
      :night-mode="settingsStore.nightMode"
      :chat-enable-real-time-awareness="chatEnableRealTimeAwareness"
      :show-fake-time-panel="showFakeTimePanel"
      :fake-time-mode="fakeTime.fakeTimeMode.value"
      :fake-time-loop-start="fakeTime.fakeTimeLoop.value.startDateTime"
      :fake-time-loop-end="fakeTime.fakeTimeLoop.value.endDateTime"
      :offset-start-date-time="fakeTime.offsetStartDateTime.value"
      :formatted-fake-time="fakeTime.formattedFakeTime.value"
      :time-jump-input="timeJumpInput"
      :chat-do-not-disturb="chatDoNotDisturb"
      :enable-phone-decision="enablePhoneDecision"
      :novel-a-i-enabled="settingsStore.novelAIImage.enabled"
      :novel-a-i-use-user-tag="settingsStore.novelAIImage.useUserTag ?? false"
      :chat-image-search-enabled="chatImageSearchEnabled"
      :chat-minimax-t-t-s-enabled="chatMinimaxTTSEnabled"
      :show-more-menu="showMoreMenu"
      :is-char-blocked="isCharBlocked"
      :has-memory-badge="chatSummaries.length > 0 || chatDiaries.length > 0"
      @back="handleBack"
      @open-ai-summary="showAISummaryPanel = true"
      @start-nickname-edit="startNicknameEdit"
      @update:nicknameEditValue="nicknameEditValue = $event"
      @save-nickname="saveNickname"
      @close-nickname-edit="closeNicknameEdit"
      @toggle-rail="toggleRail"
      @toggle-persona-selector="togglePersonaSelector"
      @select-persona="onHeaderSelectPersona"
      @open-persona-edit="openPersonaEditPanel"
      @toggle-game-menu="toggleGameMenu"
      @open-game="onHeaderOpenGame"
      @open-settings="handleSettings"
      @open-proactive-message-settings="showProactiveMessageSettings = true"
      @toggle-chat-settings-menu="toggleChatSettingsMenu"
      @toggle-face-to-face-mode="toggleFaceToFaceMode"
      @toggle-third-person-mode="toggleThirdPersonMode"
      @toggle-night-mode="toggleNightMode"
      @toggle-real-time-awareness="toggleRealTimeAwareness"
      @toggle-fake-time-panel="showFakeTimePanel = !showFakeTimePanel"
      @set-fake-time-mode="onHeaderSetFakeTimeMode"
      @update-fake-time-loop-start="onHeaderUpdateFakeTimeLoopStart"
      @update-fake-time-loop-end="onHeaderUpdateFakeTimeLoopEnd"
      @update-offset-start-datetime="onHeaderUpdateOffsetStartDateTime"
      @update-time-jump-input="timeJumpInput = $event"
      @handle-time-jump="handleTimeJump"
      @toggle-chat-do-not-disturb="toggleChatDoNotDisturb"
      @toggle-phone-decision="togglePhoneDecisionFromMenu"
      @toggle-novel-ai-image="toggleNovelAIImage"
      @toggle-novel-ai-use-user-tag="toggleNovelAIUseUserTag"
      @toggle-chat-image-search="toggleChatImageSearch"
      @open-novel-ai-settings="openNovelAISettings"
      @toggle-minimax-tts="toggleMinimaxTTS"
      @open-minimax-tts-settings="openMinimaxTTSSettings"
      @toggle-more-menu="toggleMoreMenu"
      @open-chat-details="openChatDetails"
      @navigate="onHeaderNavigate"
      @open-search-bar="openSearchBar"
      @open-chat-info="openChatInfo"
      @open-chat-files-panel="openChatFilesPanel"
      @export-current-chat="exportCurrentChat"
      @trigger-jsonl-import="triggerJsonlImport"
      @start-new-conversation="startNewConversation"
      @toggle-block-character="toggleBlockCharacter"
      @clear-chat-history="clearChatHistory"
    />

    <!-- 聊天詳情頁 -->
    <Teleport to="body">
      <Transition name="slide-up">
        <ChatDetailsScreen
          v-if="showChatDetails"
          :display-avatar="displayAvatar"
          :character-name="props.characterName"
          :is-group-chat="isGroupChat"
          :group-display-name="groupDisplayName"
          :display-character-name="displayCharacterName"
          :current-character="currentCharacter"
          :group-member-count="groupMemberCount"
          :is-char-blocked="isCharBlocked"
          @close="showChatDetails = false"
          @navigate="onHeaderNavigate"
          @open-search-bar="openSearchBar"
          @open-chat-info="openChatInfo"
          @open-chat-files-panel="openChatFilesPanel"
          @export-current-chat="exportCurrentChat"
          @trigger-jsonl-import="triggerJsonlImport"
          @start-new-conversation="startNewConversation"
          @toggle-block-character="toggleBlockCharacter"
          @clear-chat-history="clearChatHistory"
          @open-proactive-message-settings="showProactiveMessageSettings = true"
        />
      </Transition>
    </Teleport>

    <!-- 隱藏的 JSONL 檔案輸入 -->
    <input
      ref="jsonlFileInputRef"
      type="file"
      accept=".jsonl"
      style="display: none"
      @change="handleJsonlFileSelected"
    />

    <!-- 搜索欄 -->
    <Transition name="slide-down">
      <div v-if="showSearchBar" class="search-bar" @click.stop>
        <div class="search-bar-content">
          <svg class="search-icon" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
            />
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            class="search-bar-input"
            placeholder="搜索聊天記錄..."
            @input="performSearch"
            @keydown.enter="onSearchEnter"
            @keydown.escape="closeSearchBar"
          />
          <div v-if="searchResults.length > 0" class="search-results-count">
            {{ currentSearchIndex + 1 }} / {{ searchResultTotal }} 筆
          </div>
          <div v-if="searchResults.length > 0" class="search-nav-buttons">
            <button class="search-nav-btn" title="上一筆" @click="goToPrevSearchResult">
              <ChevronUp :size="18" />
            </button>
            <button class="search-nav-btn" title="下一筆" @click="goToNextSearchResult">
              <ChevronDown :size="18" />
            </button>
          </div>
          <button class="search-close-btn" @click="closeSearchBar">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
              />
            </svg>
          </button>
        </div>

        <div v-if="searchJumpStatus === 'loading'" class="search-status-hint">
          正在定位訊息上下文…
        </div>
        <div v-else-if="searchJumpStatus === 'error'" class="search-status-hint error">
          無法定位該訊息，請稍後再試
        </div>
        <div v-if="isSearchContextMode" class="search-context-hint">
          已切到搜尋上下文，只顯示目標訊息前後各 {{ SEARCH_CONTEXT_BEFORE_COUNT }} 則
          <button @click="scrollToBottom">返回最新訊息</button>
        </div>

        <!-- 搜尋結果清單：點擊才跳轉，避免打字過程中擴張 DOM 造成崩潰 -->
        <div
          v-if="searchQuery.trim() && searchResults.length > 0"
          class="search-results-panel"
        >
          <div
            v-for="(item, idx) in searchResultItems"
            :key="item.id"
            class="search-result-item"
            :class="{ active: idx === currentSearchIndex }"
            @click="onSearchResultClick(idx)"
          >
            <div class="search-result-meta">
              <span
                class="search-result-role"
                :class="`role-${item.role}`"
              >{{ item.roleLabel }}</span>
              <span class="search-result-time">{{ item.timeLabel }}</span>
            </div>
            <div class="search-result-snippet">
              <span v-if="item.before">{{ item.before }}</span>
              <mark>{{ item.match }}</mark>
              <span v-if="item.after">{{ item.after }}</span>
            </div>
          </div>
          <div v-if="searchResultOverflowCount > 0" class="search-result-overflow">
            還有 {{ searchResultOverflowCount }} 筆結果未顯示，請輸入更精確的關鍵字
          </div>
        </div>
        <div
          v-else-if="searchQuery.trim() && searchResults.length === 0"
          class="search-results-panel search-results-empty"
        >
          沒有符合的訊息
        </div>
      </div>
    </Transition>

    <!-- 好友申請輸入框 -->
    <Teleport to="body">
      <div
        v-if="showFriendRequestInput"
        class="block-modal-overlay"
        @click.self="showFriendRequestInput = false"
      >
        <div class="friend-request-dialog">
          <h3 style="margin: 0 0 12px; font-size: 16px">發送好友申請</h3>
          <textarea
            v-model="friendRequestMessage"
            placeholder="寫點什麼讓對方知道你的心意..."
            rows="3"
            style="
              width: 100%;
              border: 1px solid var(--border-color);
              border-radius: 8px;
              padding: 8px;
              font-size: 14px;
              resize: none;
              box-sizing: border-box;
            "
          />
          <div
            style="
              display: flex;
              gap: 8px;
              margin-top: 12px;
              justify-content: flex-end;
            "
          >
            <button
              class="block-cancel-btn"
              @click="showFriendRequestInput = false"
            >
              取消
            </button>
            <button
              class="block-submit-btn"
              @click="submitFriendRequest"
              :disabled="!friendRequestMessage.trim()"
            >
              提交
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 訊息列表 -->
    <main
      ref="messagesContainer"
      class="messages-container"
      @click="showRail && closeRail()"
    >
      <div class="messages-list">
        <!-- 載入更多哨兵 -->
        <div
          v-if="hasMoreMessages"
          ref="loadMoreSentinelRef"
          class="load-more-sentinel"
        >
          <div v-if="isLoadingMore" class="load-more-indicator">
            <div class="load-more-dots">
              <span></span><span></span><span></span>
            </div>
          </div>
          <div v-else class="load-more-hint">向上滾動載入更多訊息</div>
        </div>
        <div
          v-for="(message, index) in visibleMessages"
          :key="message.id"
          v-memo="[
            message.content,
            message.swipeId,
            message.roundSwipeId,
            message.isStreaming,
            message.giftReceived,
            message.transferStatus,
            message.faceToFaceRequestStatus,
            message.onlineModeRequestStatus,
            isSelectingForDelete && selectedMessageIds.includes(message.id),
            isSelectingForScreenshot &&
              screenshotSelectedIds.includes(message.id),
            searchResults.includes(message.id),
            searchResults[currentSearchIndex] === message.id,
            searchContextTargetId === message.id,
            isCharBlocked,
            isBlockedByChar,
            currentBlockedAt,
            message.sentWhileBlocked,
            message.isUserRecalled,
            message.isTransactionClaimNotice,
            groupMemberAvatarVersion,
          ]"
          class="message-memo-wrapper"
        >
          <!-- 日期分隔符 -->
          <div v-if="shouldShowDateSeparator(index)" class="date-separator">
            <div class="separator-line"></div>
            <span class="separator-text">{{
              getDateSeparatorText(message.timestamp)
            }}</span>
            <div class="separator-line"></div>
          </div>

          <!-- 系統通知（封鎖/解封等）；交易領取通知資料上仍算 user role，但畫面使用系統通知樣式 -->
          <div
            v-if="message.isSystemNotification || message.isTransactionClaimNotice"
            class="system-notification"
            :class="{
              'is-selected':
                (isSelectingForDelete &&
                  selectedMessageIds.includes(message.id)) ||
                (isSelectingForScreenshot &&
                  screenshotSelectedIds.includes(message.id)),
            }"
            @click="
              isSelectingForScreenshot
                ? toggleScreenshotSelection(message.id)
                : isSelectingForDelete
                  ? toggleMessageSelection(message.id)
                  : undefined
            "
            @contextmenu.prevent="handleMessageDelete(message.id)"
          >
            <span class="system-notification-text">{{ message.content }}</span>
          </div>

          <!-- 用戶撤回的訊息（顯示為系統訊息樣式） -->
          <div
            v-else-if="message.isUserRecalled"
            class="system-notification user-recalled-notification"
            :class="{
              'is-selected':
                (isSelectingForDelete &&
                  selectedMessageIds.includes(message.id)) ||
                (isSelectingForScreenshot &&
                  screenshotSelectedIds.includes(message.id)),
            }"
            @click="
              isSelectingForScreenshot
                ? toggleScreenshotSelection(message.id)
                : isSelectingForDelete
                  ? toggleMessageSelection(message.id)
                  : undefined
            "
            @contextmenu.prevent="handleMessageDelete(message.id)"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" class="recall-notification-icon">
              <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z" />
            </svg>
            <span class="system-notification-text">你撤回了一條訊息</span>
            <button class="recall-undo-btn" @click.stop="handleUndoRecall(message.id)">取消</button>
          </div>

          <MessageBubble
            v-else
            :id="message.id"
            :role="message.role"
            :content="message.content"
            :avatar="
              message.role === 'ai'
                ? isGroupChat
                  ? groupMetadata?.isMultiCharCard &&
                    message.senderCharacterName
                    ? getGroupMemberAvatar(message.senderCharacterName)
                    : message.senderCharacterId
                      ? getCharacterAvatar(message.senderCharacterId)
                      : message.senderCharacterAvatar || ''
                  : displayAvatar
                : ''
            "
            :user-avatar="
              message.role === 'user' ? displayUserAvatar : ''
            "
            :sender-name="
              message.role === 'ai'
                ? isGroupChat
                  ? message.senderCharacterName || characterName
                  : characterName
                : ''
            "
            :timestamp="message.timestamp"
            :char-frame-id="chatAppearance?.avatarFrames?.charFrameId ?? null"
            :user-frame-id="chatAppearance?.avatarFrames?.userFrameId ?? null"
            :avatar-shape="chatAppearance?.avatar?.shape ?? 'circle'"
            :is-streaming="message.isStreaming"
            :swipes="message.swipes"
            :swipe-id="message.swipeId"
            :round-swipes="message.roundSwipes"
            :round-swipe-id="message.roundSwipeId"
            :thought="message.thought"
            :is-timetravel="message.isTimetravel"
            :timetravel-content="message.timetravelContent"
            :is-redpacket="message.isRedpacket"
            :redpacket-data="message.redpacketData"
            :redpacket-state="message.redpacketState"
            :current-user-name="
              effectivePersona?.name || userStore.currentPersona?.name || 'User'
            "
            :is-location="message.isLocation"
            :location-content="message.locationContent"
            :reply-to-content="
              message.replyTo
                ? getReplyToContent(message.replyTo)
                : message.replyToContent
            "
            :reply-to="message.replyTo"
            :reply-to-name="
              message.replyTo ? getReplyToName(message.replyTo) : ''
            "
            :message-type="message.messageType"
            :image-url="message.imageUrl"
            :image-caption="message.imageCaption"
            :image-prompt="message.imagePrompt"
            :is-gift="message.isGift"
            :gift-name="message.giftName"
            :gift-received="message.giftReceived"
            :is-transfer="message.isTransfer"
            :transfer-amount="message.transferAmount"
            :transfer-received="message.transferReceived"
            :transfer-type="message.transferType"
            :transfer-note="message.transferNote"
            :transfer-status="message.transferStatus"
            :is-waimai-share="message.isWaimaiShare"
            :is-waimai-payment-request="message.isWaimaiPaymentRequest"
            :is-waimai-payment-confirm="message.isWaimaiPaymentConfirm"
            :is-waimai-payment-result="message.isWaimaiPaymentResult"
            :is-waimai-progress="message.isWaimaiProgress"
            :is-waimai-delivery="message.isWaimaiDelivery"
            :waimai-order="message.waimaiOrder"
            :is-music-share="message.isMusicShare"
            :music-share-data="message.musicShareData"
            :is-avatar-change="message.isAvatarChange"
            :avatar-change-action="message.avatarChangeAction"
            :avatar-change-mood="message.avatarChangeMood"
            :is-group-chat="isGroupChat"
            :sender-character-avatar="
              isGroupChat &&
              groupMetadata?.isMultiCharCard &&
              message.senderCharacterName
                ? getGroupMemberAvatar(message.senderCharacterName)
                : isGroupChat && message.senderCharacterId
                  ? getCharacterAvatar(message.senderCharacterId)
                  : message.senderCharacterAvatar || ''
            "
            :sender-character-name="message.senderCharacterName || ''"
            :is-recall="message.isRecall"
            :recall-content="message.recallContent"
            :is-private-message="message.isPrivateMessage"
            :is-group-action="message.isGroupAction"
            :group-action-type="message.groupActionType"
            :group-action-actor="message.groupActionActor"
            :group-action-target="message.groupActionTarget"
            :group-action-value="message.groupActionValue"
            :is-group-chat-history="message.isGroupChatHistory"
            :group-chat-history-data="message.groupChatHistoryData"
            :is-group-call-history="message.isGroupCallHistory"
            :group-call-history-data="message.groupCallHistoryData"
            :is-call-notification="message.isCallNotification"
            :call-notification-type="message.callNotificationType"
            :call-reason="message.callReason"
            :is-html-block="message.isHtmlBlock"
            :html-content="message.htmlContent"
            :user-name="
              effectivePersona?.name || userStore.currentPersona?.name || 'User'
            "
            :character-name="characterName"
            :character-regex-scripts="
              currentCharacter?.data?.extensions?.regex_scripts ?? []
            "
            :tts-audio-url="message.ttsAudioUrl"
            :tts-segments="message.ttsSegments"
            :audio-blob="message._audioBlob || null"
            :audio-blob-id="message.audioBlobId"
            :audio-duration="message.audioDuration"
            :audio-waveform="message.audioWaveform"
            :audio-transcript="message.audioTranscript"
            :is-char-blocked-notification="message.isCharBlockedNotification"
            :char-blocked-reason="message.charBlockedReason"
            :is-char-recall="message.isCharRecall"
            :char-recall-type="message.charRecallType"
            :char-recall-content="message.charRecallContent"
            :char-recall-hints="message.charRecallHints"
            :char-recall-revealed="message.charRecallRevealed"
            :is-face-to-face-request="message.isFaceToFaceRequest"
            :face-to-face-request-reason="message.faceToFaceRequestReason"
            :face-to-face-request-status="message.faceToFaceRequestStatus"
            :is-online-mode-request="message.isOnlineModeRequest"
            :online-mode-request-reason="message.onlineModeRequestReason"
            :online-mode-request-status="message.onlineModeRequestStatus"
            :is-friend-request="message.isFriendRequest"
            :friend-request-data="message.friendRequestData"
            :friend-request-result="message.friendRequestResult"
            :is-selected="
              (isSelectingForDelete &&
                selectedMessageIds.includes(message.id)) ||
              (isSelectingForScreenshot &&
                screenshotSelectedIds.includes(message.id))
            "
            :is-search-highlight="searchResults.includes(message.id)"
            :is-current-search="
              searchResults[currentSearchIndex] === message.id ||
              searchContextTargetId === message.id
            "
            @click="
              isSelectingForScreenshot
                ? toggleScreenshotSelection(message.id)
                : isSelectingForDelete
                  ? toggleMessageSelection(message.id)
                  : handleMessageClick(message.id)
            "
            @edit="onMessageEdit"
            @delete="onMessageDelete"
            @copy="onMessageCopy"
            @regenerate="onMessageRegenerate"
            @regenerate-image="onMessageRegenerateImage"
            @swipe="onMessageSwipe"
            @round-swipe="onMessageRoundSwipe"
            @reply="onMessageReply"
            @scroll-to-reply="onMessageScrollToReply"
            @multi-delete="onMessageMultiDelete"
            @branch="onMessageBranch"
            @accept-transfer="onMessageAcceptTransfer"
            @refund-transfer="onMessageRefundTransfer"
            @update-transcript="onMessageUpdateTranscript"
            @screenshot="onMessageScreenshot"
            @batch-screenshot="onMessageBatchScreenshot"
            @avatar-click="onMessageAvatarClick"
            @split-regex-segments="onMessageSplitRegexSegments"
            @recall="onMessageRecall"
            @char-recall-reveal="onMessageCharRecallReveal"
            @accept-face-to-face-request="onMessageAcceptFaceToFaceRequest"
            @reject-face-to-face-request="onMessageRejectFaceToFaceRequest"
            @accept-online-mode-request="onMessageAcceptOnlineModeRequest"
            @reject-online-mode-request="onMessageRejectOnlineModeRequest"
            @claim-redpacket="onMessageClaimRedpacket"
          />
          <!-- 封鎖期間訊息的驚嘆號指示器（獨立行，在訊息下方顯示） -->
          <div
            v-if="shouldShowBlockedIndicator(message)"
            class="blocked-msg-badge"
          >
            <span class="blocked-badge-icon">⚠</span>
            <span class="blocked-badge-text">{{
              message.role === "ai" ? "訊息未送達" : "對方已讀不到此訊息"
            }}</span>
          </div>
        </div>

        <!-- 正在生成提示（僅在非流式時顯示） -->
        <div
          v-if="isGenerating && !messages[messages.length - 1]?.isStreaming"
          class="typing-indicator"
        >
          <div class="typing-avatar">
            <img
              v-if="displayAvatar"
              :src="displayAvatar"
              :alt="characterName"
            />
          </div>
          <div class="typing-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    </main>

    <!-- 刪除模式工具欄 -->
    <Transition name="slide-down">
      <div v-if="isSelectingForDelete" class="delete-toolbar">
        <button class="cancel-select-btn" @click="cancelSelection">取消</button>
        <span class="select-count"
          >已選擇 {{ selectedMessageIds.length }} 條消息</span
        >
        <button
          class="delete-selected-btn"
          :disabled="selectedMessageIds.length === 0"
          @click="deleteSelectedMessages"
        >
          刪除
        </button>
      </div>
    </Transition>

    <!-- 批量截圖選擇工具列 -->
    <Transition name="slide-down">
      <div
        v-if="isSelectingForScreenshot"
        class="delete-toolbar screenshot-toolbar"
      >
        <button class="cancel-select-btn" @click="cancelScreenshotSelect">
          取消
        </button>
        <span class="select-count"
          >已選擇 {{ screenshotSelectedIds.length }} 條消息</span
        >
        <button
          class="delete-selected-btn screenshot-confirm-btn"
          :disabled="screenshotSelectedIds.length === 0"
          @click="executeBatchScreenshot"
        >
          截圖
        </button>
      </div>
    </Transition>

    <ChatScreenInputArea
      ref="inputAreaRef"
      :is-blocked-by-char="isBlockedByChar"
      :replying-to="replyingTo"
      :character-name="characterName"
      :chat-face-to-face-mode="chatFaceToFaceMode"
      :is-input-focused="isInputFocused"
      :quick-actions="quickActions"
      :input-text="inputText"
      :show-more-features="showMoreFeatures"
      :show-sticker-panel="showStickerPanel"
      :is-generating="isGenerating"
      :has-a-i-messages="hasAIMessages"
      :can-record="canRecord"
      :is-recording="isRecording"
      :recording-duration="recordingDuration"
      :recording-volume-level="recordingVolumeLevel"
      :is-cancel-mode="isCancelMode"
      :show-text-voice-modal="showTextVoiceModal"
      :text-voice-input="textVoiceInput"
      :is-input-expanded="isInputExpanded"
      :speaker-mode="chatSpeakerMode"
      :show-speaker-mode-popover="showSpeakerModePopover"
      @update:show-speaker-mode-popover="showSpeakerModePopover = $event"
      @set-speaker-mode="setSpeakerMode($event)"
      @show-friend-request-input="showFriendRequestInput = true"
      @cancel-reply="cancelReply"
      @handle-quick-input-wheel="onInputQuickWheel"
      @insert-quick-action="onInputInsertQuickAction"
      @open-quick-action-editor="openQuickActionEditor"
      @toggle-more-features="toggleMoreFeatures"
      @open-media-drawer="showMediaDrawer = true"
      @update:input-text="inputText = $event"
      @handle-keydown="onInputKeydown"
      @auto-resize-input="autoResizeInput"
      @handle-input-focus-with-scroll="handleInputFocusWithScroll"
      @on-input-blur="onInputBlur"
      @toggle-sticker-panel="toggleStickerPanel"
      @toggle-input-expand="toggleInputExpand"
      @regenerate-last-a-i-response="regenerateLastAIResponse"
      @stop-a-i-generation="stopAIGeneration"
      @on-mic-down="onInputMicDown"
      @on-mic-up="onMicUp"
      @start-recording="onInputStartRecording"
      @finish-recording="finishRecording"
      @send-and-trigger-a-i="sendAndTriggerAI"
      @update:show-text-voice-modal="showTextVoiceModal = $event"
      @update:text-voice-input="textVoiceInput = $event"
      @send-text-as-voice="sendTextAsVoice"
      @handle-sticker-select="onInputStickerSelect"
      @close-sticker-panel="showStickerPanel = false"
      @open-gift-drawer="showGiftDrawer = true"
      @handle-feature-click="onInputFeatureClick"
      @close-expanded-input="closeExpandedInput"
      @send-from-expanded="sendFromExpanded"
      @update:show-more-features="showMoreFeatures = $event"
    />

    <!-- 編輯訊息模態框 -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="editingMessageId"
          class="edit-modal-overlay"
          @click="cancelEdit"
        >
          <div class="edit-modal" @click.stop>
            <div class="edit-modal-header">
              <h3>編輯訊息</h3>
              <button class="close-btn" @click="cancelEdit">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                  />
                </svg>
              </button>
            </div>
            <label class="edit-label">訊息內容</label>
            <textarea
              ref="editContentTextareaRef"
              :value="editingContent"
              class="edit-textarea"
              rows="6"
            ></textarea>
            <template
              v-if="
                messages.find((m) => m.id === editingMessageId)?.role === 'ai'
              "
            >
              <label class="edit-label edit-label-thought"
                >💭 心聲（想法）</label
              >
              <textarea
                ref="editThoughtTextareaRef"
                :value="editingThought"
                class="edit-textarea edit-textarea-thought"
                rows="3"
                placeholder="留空則移除心聲"
              ></textarea>
            </template>
            <div class="edit-modal-actions">
              <button class="cancel-btn" @click="cancelEdit">取消</button>
              <button class="save-btn" @click="saveEdit">保存</button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- 流式輸出窗口已移至 App.vue 全局顯示 -->

      <!-- AI 記憶管理面板 -->
      <AISummaryPanel
        v-if="showAISummaryPanel"
        :chat-id="currentChatId || ''"
        :character-id="characterId"
        :character-name="characterName"
        :summaries="chatSummaries"
        :diaries="chatDiaries"
        :is-generating-summary="isGeneratingSummary"
        :is-extracting-events="isExtractingEvents"
        :initial-settings="chatSummarySettings"
        @close="showAISummaryPanel = false"
        @save="handleSummarySettingsSave"
        @toggle-important="handleToggleSummaryImportant"
        @delete-summary="handleDeleteSummary"
        @edit-summary="handleEditSummary"
        @trigger-manual-summary="handleTriggerManualSummary"
        @generate-meta-summary="handleGenerateMetaSummary"
        @import-summaries="handleImportSummaries"
        @toggle-diary-favorite="handleToggleDiaryFavorite"
        @delete-diary="handleDeleteDiary"
        @view-diary="handleViewDiary"
        @trigger-manual-diary="handleTriggerManualDiary($event)"
        @trigger-manual-events="handleTriggerManualEvents"
        @delete-selected="handleDeleteSelected"
        @refresh-summaries="loadSummariesAndDiaries"
        :summarize-batch-fn="summarizeSingleBatch"
      />

      <!-- 日記查看模態框 -->
      <DiaryViewModal
        v-if="viewingDiary"
        :diary-data="viewingDiary"
        :char-name="characterName"
        :user-name="effectivePersona?.name || 'User'"
        @close="viewingDiary = null"
        @toggle-favorite="
          () => {
            if (viewingDiary) handleToggleDiaryFavorite(viewingDiary.id);
          }
        "
      />

      <!-- 視訊通話模態框（全局 store 管理，v-if 由 store 控制） -->
      <VideoCallModal v-if="showVideoCallModal" />

      <!-- 電話通話模態框（全局 store 管理，v-if 由 store 控制） -->
      <PhoneCallModal v-if="showPhoneCallModal" @close="handlePhoneCallClose" />

      <!-- 語音紅包輸入彈窗 -->
      <RedPacketVoiceClaimModal
        v-if="voiceClaimModalState.visible"
        :phrase="voiceClaimModalState.phrase"
        :blessing="voiceClaimModalState.blessing"
        @close="voiceClaimModalState.visible = false"
        @submit="handleVoiceRedpacketSubmit"
      />

      <!-- 群通話模態框 -->
      <GroupCallModal
        :visible="showGroupCallModal"
        :group-name="groupMetadata?.groupName || '群通話'"
        :participants="groupCallParticipants"
        :call-messages="groupCallMessages"
        :started-at="groupCallStartedAt"
        :is-generating="isGenerating"
        @hang-up="handleGroupCallHangUp"
        @send-message="handleGroupCallSendMessage"
        @auto-talk="handleGroupCallAutoTalk"
      />

      <!-- 來電模態框 -->
      <IncomingCallModal
        v-if="showIncomingCallModal && currentPendingCall"
        :pending-call="currentPendingCall"
        @accept="handleIncomingCallAccept"
        @decline="handleIncomingCallDecline"
        @missed="handleIncomingCallMissed"
      />

      <!-- 媒體發送抽屜 -->
      <MediaSendDrawer
        :visible="showMediaDrawer"
        :novel-a-i-enabled="settingsStore.novelAIImage.enabled"
        @close="showMediaDrawer = false"
        @select="handleMediaSelect"
        @image-upload="handleImageUpload"
        @ai-generate="handleAIGenerateImage"
      />

      <!-- 禮物面板 -->
      <GiftDrawer
        :visible="showGiftDrawer"
        :chat-id="currentChatId || ''"
        :character-name="characterName"
        :character-avatar="characterAvatar"
        @close="showGiftDrawer = false"
        @open-shop="handleOpenShop"
        @transfer="handleTransfer"
        @send-gift="handleSendGift"
      />

      <!-- 小遊戲模態框 -->
      <ChatGameModals
        :show-dish-washing-game="showDishWashingGame"
        :show-fishing-game="showFishingGame"
        :show-gambling-game="showGamblingGame"
        :show-merit-hub="showMeritHub"
        :chat-id="currentChatId || ''"
        @close-dish-washing="closeGameModal('dishwashing')"
        @close-fishing="closeGameModal('fishing')"
        @close-gambling="closeGameModal('gambling')"
        @close-merit="closeGameModal('merit')"
      />

      <!-- 聊天資訊面板 -->
      <!-- 好感度面板 -->
      <AffinityPanel
        :visible="showAffinityPanel"
        :chat-id="currentChatId || ''"
        :character-id="props.characterId || currentCharacter?.id || ''"
        :greetings="availableGreetings"
        @close="showAffinityPanel = false"
        @rescan="rescanAffinityFromMessages({ force: true })"
      />

      <ChatInfoModal
        :visible="showChatInfoModal"
        :character-name="characterName"
        :character-avatar="displayAvatar"
        :is-group-chat="isGroupChat"
        :group-name="groupMetadata?.groupName"
        :group-avatar="groupMetadata?.groupAvatar"
        :group-members="groupMembersForInfo"
        :messages="messagesForInfo"
        :created-at="messages[0]?.timestamp"
        @close="showChatInfoModal = false"
        @open-settings="handleOpenGroupSettings"
      />

      <!-- 群聊設定彈窗 -->
      <Teleport to="body">
        <Transition name="fade">
          <div
            v-if="showGroupSettingsModal && groupMetadata"
            class="group-settings-overlay"
            @click.self="closeGroupSettings"
          >
            <div class="group-settings-modal">
              <header class="modal-header">
                <h2>群聊設定</h2>
                <button class="close-btn" @click="closeGroupSettings">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                    />
                  </svg>
                </button>
              </header>

              <div class="modal-content">
                <!-- 群頭像 -->
                <div class="form-group">
                  <label>群頭像</label>
                  <div class="group-avatar-editor">
                    <div
                      class="group-avatar-preview"
                      @click="triggerGroupAvatarUpload"
                    >
                      <img
                        v-if="groupMetadata.groupAvatar"
                        :src="groupMetadata.groupAvatar"
                        alt="群頭像"
                      />
                      <div v-else class="avatar-placeholder">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path
                            d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
                          />
                        </svg>
                      </div>
                    </div>
                    <button
                      v-if="groupMetadata.groupAvatar"
                      class="remove-avatar-btn"
                      @click="removeGroupAvatar"
                    >
                      移除
                    </button>
                  </div>
                  <input
                    ref="groupAvatarInput"
                    type="file"
                    accept="image/*"
                    style="display: none"
                    @change="handleGroupAvatarChange"
                  />
                </div>

                <!-- 群名稱 -->
                <div class="form-group">
                  <label>群名稱</label>
                  <input
                    v-model="editGroupName"
                    type="text"
                    class="form-input"
                    placeholder="輸入群名稱"
                  />
                </div>

                <!-- 多人卡子角色管理 -->
                <div v-if="groupMetadata.isMultiCharCard" class="form-group">
                  <label
                    >子角色 ({{
                      groupMetadata.multiCharMembers?.length || 0
                    }}
                    位)</label
                  >
                  <div class="members-list">
                    <template
                      v-for="member in groupMetadata.multiCharMembers || []"
                      :key="member.id"
                    >
                      <div class="member-item">
                        <div class="member-avatar">
                          <img
                            v-if="
                              member.avatar &&
                              !failedMultiCharAvatars.has(member.avatar)
                            "
                            :src="getProxiedUrl(member.avatar)"
                            :alt="member.name"
                            @error="failedMultiCharAvatars.add(member.avatar)"
                          />
                          <div
                            class="avatar-placeholder small"
                            v-if="
                              !member.avatar ||
                              failedMultiCharAvatars.has(member.avatar)
                            "
                          >
                            {{ member.name.charAt(0) }}
                          </div>
                        </div>
                        <div class="member-info">
                          <span class="member-name">{{ member.name }}</span>
                        </div>
                        <div class="member-actions">
                          <button
                            class="action-btn"
                            @click="editMultiCharMember(member)"
                            title="編輯"
                          >
                            <svg viewBox="0 0 24 24" fill="currentColor">
                              <path
                                d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                              />
                            </svg>
                          </button>
                          <button
                            class="action-btn delete"
                            @click="removeMultiCharMember(member.id)"
                            title="移除"
                          >
                            <svg viewBox="0 0 24 24" fill="currentColor">
                              <path
                                d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <!-- 編輯表單：顯示在被編輯的角色下方 -->
                      <div
                        v-if="
                          showAddMultiCharMember &&
                          editingMultiCharId === member.id
                        "
                        class="multi-char-form"
                      >
                        <div class="multi-char-avatar-row">
                          <div
                            class="member-avatar clickable"
                            @click="triggerMultiCharAvatarUpload"
                          >
                            <img
                              v-if="newMultiCharAvatar"
                              :src="getProxiedUrl(newMultiCharAvatar)"
                              alt="頭像預覽"
                            />
                            <div v-else class="avatar-placeholder small">
                              <svg viewBox="0 0 24 24" fill="currentColor">
                                <path
                                  d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
                                />
                              </svg>
                            </div>
                          </div>
                          <input
                            v-model="newMultiCharName"
                            type="text"
                            class="form-input"
                            placeholder="角色名稱"
                            @keydown.enter="addMultiCharMember"
                          />
                        </div>
                        <input
                          v-model="newMultiCharAvatar"
                          type="text"
                          class="form-input"
                          placeholder="頭像連結（或點擊左側上傳圖片）"
                          style="margin-top: 6px"
                        />
                        <input
                          ref="multiCharAvatarInput"
                          type="file"
                          accept="image/*"
                          style="display: none"
                          @change="handleMultiCharAvatarChange"
                        />
                        <div class="multi-char-form-actions">
                          <button
                            class="btn-cancel small"
                            @click="resetMultiCharForm"
                          >
                            取消
                          </button>
                          <button
                            class="btn-confirm small"
                            @click="addMultiCharMember"
                            :disabled="!newMultiCharName.trim()"
                          >
                            更新
                          </button>
                        </div>
                      </div>
                    </template>
                  </div>

                  <!-- 新增子角色表單（不是編輯模式時顯示在列表底部） -->
                  <div
                    v-if="showAddMultiCharMember && !editingMultiCharId"
                    class="multi-char-form"
                  >
                    <div class="multi-char-avatar-row">
                      <div
                        class="member-avatar clickable"
                        @click="triggerMultiCharAvatarUpload"
                      >
                        <img
                          v-if="newMultiCharAvatar"
                          :src="getProxiedUrl(newMultiCharAvatar)"
                          alt="頭像預覽"
                        />
                        <div v-else class="avatar-placeholder small">
                          <svg viewBox="0 0 24 24" fill="currentColor">
                            <path
                              d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
                            />
                          </svg>
                        </div>
                      </div>
                      <input
                        v-model="newMultiCharName"
                        type="text"
                        class="form-input"
                        placeholder="角色名稱"
                        @keydown.enter="addMultiCharMember"
                      />
                    </div>
                    <input
                      v-model="newMultiCharAvatar"
                      type="text"
                      class="form-input"
                      placeholder="頭像連結（或點擊左側上傳圖片）"
                      style="margin-top: 6px"
                    />
                    <input
                      ref="multiCharAvatarInput"
                      type="file"
                      accept="image/*"
                      style="display: none"
                      @change="handleMultiCharAvatarChange"
                    />
                    <div class="multi-char-form-actions">
                      <button
                        class="btn-cancel small"
                        @click="resetMultiCharForm"
                      >
                        取消
                      </button>
                      <button
                        class="btn-confirm small"
                        @click="addMultiCharMember"
                        :disabled="!newMultiCharName.trim()"
                      >
                        新增
                      </button>
                    </div>
                  </div>

                  <button
                    v-if="!showAddMultiCharMember"
                    class="add-multi-char-btn"
                    @click="showAddMultiCharMember = true"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                    </svg>
                    新增子角色
                  </button>
                </div>

                <!-- 普通群聊成員管理 -->
                <template v-else>
                  <div class="form-group">
                    <label
                      >成員管理 ({{ groupMetadata.members.length }} 人)</label
                    >
                    <div class="members-list">
                      <div
                        v-for="member in groupMetadata.members"
                        :key="member.characterId"
                        class="member-item"
                      >
                        <div class="member-avatar">
                          <img
                            v-if="getCharacterAvatar(member.characterId)"
                            :src="getCharacterAvatar(member.characterId)"
                            :alt="getCharacterNameById(member.characterId)"
                          />
                          <div v-else class="avatar-placeholder small">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                              <path
                                d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                              />
                            </svg>
                          </div>
                        </div>
                        <div class="member-info">
                          <span class="member-name">{{
                            getCharacterNameById(member.characterId)
                          }}</span>
                          <div class="member-badges">
                            <span v-if="member.isAdmin" class="badge admin"
                              >管理員</span
                            >
                            <span v-if="member.isMuted" class="badge muted"
                              >已禁言</span
                            >
                          </div>
                        </div>
                        <div class="member-actions">
                          <button
                            class="action-btn"
                            :class="{ active: member.isAdmin }"
                            @click="toggleGroupMemberAdmin(member.characterId)"
                            title="管理員"
                          >
                            <svg viewBox="0 0 24 24" fill="currentColor">
                              <path
                                d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"
                              />
                            </svg>
                          </button>
                          <button
                            class="action-btn"
                            :class="{ active: member.isMuted }"
                            @click="toggleGroupMemberMute(member.characterId)"
                            title="禁言"
                          >
                            <svg viewBox="0 0 24 24" fill="currentColor">
                              <path
                                d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"
                              />
                            </svg>
                          </button>
                          <button
                            class="action-btn delete"
                            @click="removeGroupMember(member.characterId)"
                            title="移除"
                          >
                            <svg viewBox="0 0 24 24" fill="currentColor">
                              <path
                                d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- 添加成員 -->
                  <div class="form-group">
                    <label>添加成員</label>
                    <div class="add-member-list">
                      <div
                        v-for="char in charactersStore.characters.filter(
                          (c) =>
                            !groupMetadata?.members.some(
                              (m) => m.characterId === c.id,
                            ),
                        )"
                        :key="char.id"
                        class="add-member-item"
                        @click="addMemberToGroup(char.id)"
                      >
                        <div class="member-avatar">
                          <img
                            v-if="char.avatar"
                            :src="char.avatar"
                            :alt="char.data?.name || char.nickname"
                          />
                          <div v-else class="avatar-placeholder small">
                            {{ (char.data?.name || char.nickname).charAt(0) }}
                          </div>
                        </div>
                        <span class="member-name">{{
                          char.data?.name || char.nickname
                        }}</span>
                        <svg
                          class="add-icon"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </template>

                <!-- 綁定世界書（多人卡不顯示，因為角色卡本身可綁定世界書） -->
                <div v-if="!groupMetadata.isMultiCharCard" class="form-group">
                  <label>綁定世界書（僅此群組生效）</label>
                  <div
                    v-if="lorebooksStore.lorebooks.length === 0"
                    class="empty-hint"
                  >
                    尚無世界書，請先建立世界書
                  </div>
                  <div v-else class="lorebook-bind-list">
                    <div
                      v-for="lb in lorebooksStore.lorebooks"
                      :key="lb.id"
                      class="lorebook-bind-item"
                      :class="{ active: editGroupLorebookIds.includes(lb.id) }"
                      @click="toggleGroupLorebook(lb.id)"
                    >
                      <div class="lorebook-check">
                        <svg
                          v-if="editGroupLorebookIds.includes(lb.id)"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path
                            d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                          />
                        </svg>
                      </div>
                      <div class="lorebook-info">
                        <span class="lorebook-name">{{ lb.name }}</span>
                        <span class="lorebook-count"
                          >{{ lb.entries.length }} 條目</span
                        >
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <footer class="modal-footer">
                <button class="btn-cancel" @click="closeGroupSettings">
                  取消
                </button>
                <button class="btn-confirm" @click="saveGroupSettings">
                  儲存
                </button>
              </footer>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- Persona 編輯面板 -->
      <PersonaEditPanel
        :visible="showPersonaEditPanel"
        :persona-name="userStore.currentName"
        :persona-avatar="userStore.currentAvatar"
        :description="userStore.currentDescription"
        :secrets="
          hasPersonaOverride
            ? chatPersonaOverride.secrets
            : (userStore.currentPersona?.secrets ?? '')
        "
        :power-dynamic="
          hasPersonaOverride
            ? chatPersonaOverride.powerDynamic
            : (userStore.currentPersona?.powerDynamic ?? '')
        "
        :character-name="characterName"
        :chat-user-avatar="userAvatarOverride"
        @close="showPersonaEditPanel = false"
        @save="savePersonaEdit"
        @change-chat-avatar="handleChangeChatUserAvatar"
      />

      <!-- 遊戲成績選擇器 -->
      <GameScorePickerModal
        :visible="showGameScorePicker"
        @close="showGameScorePicker = false"
        @select="handleGameScoreSelect"
      />

      <!-- 快捷導航：角色卡選擇彈窗 -->
      <Transition name="fade">
        <div
          v-if="showCharacterNavModal"
          class="feature-modal-overlay"
          @click="showCharacterNavModal = false"
        >
          <div class="feature-modal" @click.stop>
            <h3 class="feature-modal-title">選擇前往頁面</h3>
            <div class="feature-modal-actions" style="display: flex; flex-direction: column; gap: 12px; margin-top: 16px;">
              <button class="modal-btn confirm" style="width: 100%;" @click="handleCharacterNavChoice('edit')">
                編輯當前角色卡
              </button>
              <button class="modal-btn cancel" style="width: 100%;" @click="handleCharacterNavChoice('list')">
                前往角色卡列表
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- 快捷導航：世界書選擇彈窗 -->
      <Transition name="fade">
        <div
          v-if="showWorldbookNavModal"
          class="feature-modal-overlay"
          @click="showWorldbookNavModal = false"
        >
          <div class="feature-modal" @click.stop>
            <h3 class="feature-modal-title">選擇前往頁面</h3>
            <div class="feature-modal-actions" style="display: flex; flex-direction: column; gap: 12px; margin-top: 16px;">
              <button class="modal-btn confirm" style="width: 100%;" @click="handleWorldbookNavChoice('edit')">
                編輯綁定的世界書
              </button>
              <button class="modal-btn cancel" style="width: 100%;" @click="handleWorldbookNavChoice('list')">
                前往世界書列表
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- 跳轉魔法模態框 -->
      <Transition name="fade">
        <div
          v-if="showTimeTravelModal"
          class="feature-modal-overlay"
          @click="cancelTimeTravel"
        >
          <div class="feature-modal" @click.stop>
            <h3 class="feature-modal-title">你想要前往的時間或地點</h3>
            <input
              v-model="timeTravelInput"
              type="text"
              class="feature-modal-input"
              placeholder="例如：三天後的早晨、圖書館、咖啡廳..."
              @keydown.enter="confirmTimeTravel"
            />
            <div class="feature-modal-actions">
              <button class="modal-btn cancel" @click="cancelTimeTravel">
                取消
              </button>
              <button class="modal-btn confirm" @click="confirmTimeTravel">
                確定
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- 強制換頭像確認框 -->
      <Transition name="fade">
        <div
          v-if="showForceAvatarConfirm"
          class="feature-modal-overlay"
          @click="showForceAvatarConfirm = false"
        >
          <div class="feature-modal" @click.stop>
            <h3 class="feature-modal-title">
              <svg viewBox="0 0 24 24" fill="currentColor" class="title-icon">
                <path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"
                />
              </svg>
              強制換頭像
            </h3>
            <p class="feature-modal-tip">
              {{ characterName }} 不想換，但你可以強制幫 TA 換頭像
            </p>
            <div class="force-avatar-preview" v-if="findLastUserImage()">
              <img :src="findLastUserImage()!.url" alt="新頭像預覽" />
            </div>
            <div class="feature-modal-actions">
              <button
                class="modal-btn cancel"
                @click="showForceAvatarConfirm = false"
              >
                算了
              </button>
              <button class="modal-btn confirm" @click="confirmForceAvatar">
                就是要換！
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- 小劇場模態框 -->
      <Transition name="fade">
        <div
          v-if="showSmallTheaterModal"
          class="feature-modal-overlay"
          @click="cancelSmallTheater"
        >
          <div class="feature-modal theater-modal" @click.stop>
            <!-- 步驟1：是否開啟分支 -->
            <template v-if="theaterStep === 'branch-confirm'">
              <h3 class="feature-modal-title">
                <svg viewBox="0 0 24 24" fill="currentColor" class="title-icon">
                  <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM8.5 8c.83 0 1.5.67 1.5 1.5S9.33 11 8.5 11 7 10.33 7 9.5 7.67 8 8.5 8zm3.5 9c-2.33 0-4.31-1.46-5.11-3.5h10.22c-.8 2.04-2.78 3.5-5.11 3.5zm3.5-6c-.83 0-1.5-.67-1.5-1.5S14.67 8 15.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
                  />
                </svg>
                平行世界・小劇場
              </h3>
              <p class="feature-modal-tip theater-notice">
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  class="notice-icon"
                >
                  <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
                  />
                </svg>
                開啟小劇場將會建立一個獨立分支，讓你在不影響主線的情況下遊玩劇情。
              </p>
              <div class="theater-choice-btns">
                <button
                  class="theater-choice-btn branch"
                  @click="theaterChooseBranch(true)"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"
                    />
                  </svg>
                  <span class="choice-title">開啟分支</span>
                  <span class="choice-desc">建立獨立分支，不影響主線</span>
                </button>
                <button
                  class="theater-choice-btn no-branch"
                  @click="theaterChooseBranch(false)"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"
                    />
                  </svg>
                  <span class="choice-title">在當前聊天繼續</span>
                  <span class="choice-desc">直接插入，總結可能受影響</span>
                </button>
              </div>
              <button
                class="modal-btn cancel"
                style="margin-top: 8px"
                @click="cancelSmallTheater"
              >
                取消
              </button>
            </template>

            <!-- 步驟2：選項（繼承記錄/總結、新聊天檔案） -->
            <template v-else-if="theaterStep === 'options'">
              <h3 class="feature-modal-title">
                <svg viewBox="0 0 24 24" fill="currentColor" class="title-icon">
                  <path
                    d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
                  />
                </svg>
                分支設定
              </h3>
              <div class="theater-options">
                <label class="theater-option-row">
                  <div class="option-info">
                    <span class="option-label">繼承聊天記錄</span>
                    <span class="option-hint"
                      >以轉發記錄形式帶入最近
                      {{
                        chatSummarySettings.intervalMode === "turn"
                          ? chatSummarySettings.summaryIntervalTurn + " 輪"
                          : chatSummarySettings.summaryIntervalMessage + " 條"
                      }}
                      對話</span
                    >
                  </div>
                  <div
                    class="toggle-switch"
                    :class="{ active: theaterInheritHistory }"
                    @click="theaterInheritHistory = !theaterInheritHistory"
                  >
                    <div class="toggle-thumb"></div>
                  </div>
                </label>
                <label class="theater-option-row">
                  <div class="option-info">
                    <span class="option-label">繼承總結與記憶</span>
                    <span class="option-hint"
                      >複製現有的 AI 總結、日記和重要事件</span
                    >
                  </div>
                  <div
                    class="toggle-switch"
                    :class="{ active: theaterInheritSummary }"
                    @click="theaterInheritSummary = !theaterInheritSummary"
                  >
                    <div class="toggle-thumb"></div>
                  </div>
                </label>
                <!-- 分支模式下不顯示此選項，因為分支本身就會建立新聊天檔案 -->
                <label v-if="!theaterUseBranch" class="theater-option-row">
                  <div class="option-info">
                    <span class="option-label">開啟新聊天檔案</span>
                    <span class="option-hint"
                      >建立獨立的聊天檔案（關閉則在當前聊天插入）</span
                    >
                  </div>
                  <div
                    class="toggle-switch"
                    :class="{ active: theaterNewChatFile }"
                    @click="theaterNewChatFile = !theaterNewChatFile"
                  >
                    <div class="toggle-thumb"></div>
                  </div>
                </label>
              </div>
              <div class="feature-modal-actions">
                <button
                  class="modal-btn cancel"
                  @click="theaterStep = 'branch-confirm'"
                >
                  返回
                </button>
                <button
                  class="modal-btn confirm"
                  @click="theaterConfirmOptions"
                >
                  下一步
                </button>
              </div>
            </template>

            <!-- 步驟3：預覽轉發記錄 -->
            <template v-else-if="theaterStep === 'forwarded-history'">
              <h3 class="feature-modal-title">
                <svg viewBox="0 0 24 24" fill="currentColor" class="title-icon">
                  <path
                    d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"
                  />
                </svg>
                轉發的聊天記錄
              </h3>
              <p class="feature-modal-tip">
                以下記錄將以「轉發」形式帶入分支開頭
              </p>
              <div class="theater-forwarded-preview">
                <div
                  v-for="(msg, idx) in theaterForwardedMessages.slice(0, 6)"
                  :key="idx"
                  class="forwarded-msg-row"
                  :class="{ 'is-user': msg.isUser }"
                >
                  <span class="forwarded-sender">{{ msg.senderName }}：</span>
                  <span class="forwarded-content"
                    >{{ msg.content.slice(0, 60)
                    }}{{ msg.content.length > 60 ? "..." : "" }}</span
                  >
                </div>
                <div
                  v-if="theaterForwardedMessages.length > 6"
                  class="forwarded-more"
                >
                  還有 {{ theaterForwardedMessages.length - 6 }} 條...
                </div>
                <div class="forwarded-total">
                  共 {{ theaterForwardedMessages.length }} 條
                </div>
              </div>
              <div class="feature-modal-actions">
                <button
                  class="modal-btn cancel"
                  @click="theaterStep = 'options'"
                >
                  返回
                </button>
                <button
                  class="modal-btn confirm"
                  @click="theaterConfirmForwarded"
                >
                  確認
                </button>
              </div>
            </template>

            <!-- 步驟4：輸入小劇場內容 -->
            <template v-else-if="theaterStep === 'input'">
              <h3 class="feature-modal-title">
                <svg viewBox="0 0 24 24" fill="currentColor" class="title-icon">
                  <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM8.5 8c.83 0 1.5.67 1.5 1.5S9.33 11 8.5 11 7 10.33 7 9.5 7.67 8 8.5 8zm3.5 9c-2.33 0-4.31-1.46-5.11-3.5h10.22c-.8 2.04-2.78 3.5-5.11 3.5zm3.5-6c-.83 0-1.5-.67-1.5-1.5S14.67 8 15.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
                  />
                </svg>
                平行世界・小劇場
              </h3>
              <p
                v-if="!theaterUseBranch"
                class="feature-modal-tip theater-warn"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  class="notice-icon warn"
                >
                  <path
                    d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"
                  />
                </svg>
                注意：未開啟分支，小劇場劇情可能影響 AI 總結記憶
              </p>
              <p v-else class="feature-modal-tip">
                描述這一段平行世界的小劇場內容
              </p>
              <textarea
                v-model="smallTheaterInput"
                class="feature-modal-textarea"
                rows="4"
                placeholder="例如：在平行世界裡，他們一起去海邊散步..."
              ></textarea>
              <div class="theater-options" style="margin-top: 8px;">
                <label class="theater-option-row">
                  <div class="option-info">
                    <span class="option-label">開啟面對面</span>
                    <span class="option-hint"
                      >開始小劇場前自動切到面對面模式，避免輸出混用線上聊天格式</span
                    >
                  </div>
                  <div
                    class="toggle-switch"
                    :class="{ active: theaterFaceToFaceMode }"
                    @click="theaterFaceToFaceMode = !theaterFaceToFaceMode"
                  >
                    <div class="toggle-thumb"></div>
                  </div>
                </label>
                <label class="theater-option-row">
                  <div class="option-info">
                    <span class="option-label">小手機劇本格式</span>
                    <span class="option-hint"
                      >每句獨立氣泡，自動依 user:/char: 前綴左右分邊</span
                    >
                  </div>
                  <div
                    class="toggle-switch"
                    :class="{ active: theaterPhoneScript }"
                    @click="theaterPhoneScript = !theaterPhoneScript"
                  >
                    <div class="toggle-thumb"></div>
                  </div>
                </label>
              </div>
              <div class="feature-modal-actions">
                <button
                  class="modal-btn cancel"
                  @click="
                    theaterUseBranch
                      ? (theaterStep = theaterInheritHistory
                          ? 'forwarded-history'
                          : 'options')
                      : (theaterStep = 'branch-confirm')
                  "
                >
                  返回
                </button>
                <button class="modal-btn confirm" @click="confirmSmallTheater">
                  開始小劇場
                </button>
              </div>
            </template>
          </div>
        </div>
      </Transition>

      <!-- 話題引導模態框 -->
      <Transition name="fade">
        <div
          v-if="showTopicPromptModal"
          class="feature-modal-overlay"
          @click="cancelTopicPrompt"
        >
          <div class="feature-modal" @click.stop>
            <h3 class="feature-modal-title">
              <svg viewBox="0 0 24 24" fill="currentColor" class="title-icon">
                <path
                  d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6C7.8 12.16 7 10.63 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z"
                />
              </svg>
              話題引導
            </h3>
            <p class="feature-modal-tip">
              輸入一個話題，Ta 會主動向你提起這個話題
            </p>
            <textarea
              v-model="topicPromptInput"
              class="feature-modal-textarea"
              rows="3"
              placeholder="例如：今天的天氣、週末的計劃、最近看的電影..."
              @keydown.ctrl.enter="confirmTopicPrompt"
            ></textarea>
            <div class="feature-modal-actions">
              <button class="modal-btn cancel" @click="cancelTopicPrompt">
                取消
              </button>
              <button class="modal-btn confirm" @click="confirmTopicPrompt">
                確定
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- 話題引導選擇模態框 -->
      <Transition name="fade">
        <div
          v-if="showTopicPromptChoiceModal"
          class="feature-modal-overlay"
          @click="cancelTopicPrompt"
        >
          <div class="feature-modal choice-modal" @click.stop>
            <h3 class="feature-modal-title">
              <svg viewBox="0 0 24 24" fill="currentColor" class="title-icon">
                <path
                  d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6C7.8 12.16 7 10.63 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z"
                />
              </svg>
              選擇話題生成方式
            </h3>
            <p class="feature-modal-tip">讓 Ta 主動發起對話</p>
            <div class="choice-buttons">
              <button class="choice-btn" @click="useHistoryBasedTopic">
                <div class="choice-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"
                    />
                  </svg>
                </div>
                <div class="choice-text">
                  <span class="choice-label">依照歷史對話</span>
                  <span class="choice-desc">根據最近的對話內容生成</span>
                </div>
              </button>
              <button class="choice-btn" @click="useRandomTopic">
                <div class="choice-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
                    />
                  </svg>
                </div>
                <div class="choice-text">
                  <span class="choice-label">使用隨機話題</span>
                  <span class="choice-desc">從預設話題中隨機選擇</span>
                </div>
              </button>
            </div>
            <button
              class="modal-btn cancel full-width"
              @click="cancelTopicPrompt"
            >
              取消
            </button>
          </div>
        </div>
      </Transition>

      <!-- 位置分享模態框 -->
      <Transition name="fade">
        <div
          v-if="showLocationModal"
          class="feature-modal-overlay"
          @click="cancelLocation"
        >
          <div class="location-modal-content" @click.stop>
            <div class="location-polaroid">
              <div class="location-map-container">
                <!-- 街區 -->
                <div class="location-block block1"></div>
                <div class="location-block block2"></div>
                <div class="location-block block3"></div>
                <div class="location-block block4"></div>
                <div class="location-block block5"></div>
                <!-- 道路 - 水平 -->
                <div class="location-road road-h1"></div>
                <div class="location-road road-h2"></div>
                <div class="location-road road-h3"></div>
                <!-- 道路 - 垂直 -->
                <div class="location-road road-v1"></div>
                <div class="location-road road-v2"></div>
                <div class="location-road road-v3"></div>
                <!-- 公園 -->
                <div class="location-park"></div>
                <!-- 位置標記 -->
                <div class="location-marker">
                  <div class="marker-pin"></div>
                  <div class="marker-stick"></div>
                </div>
              </div>
              <div class="location-caption">
                <input
                  v-model="locationInput"
                  type="text"
                  placeholder="輸入位置名稱"
                  @keydown.enter="confirmLocation"
                />
              </div>
            </div>
            <div class="location-actions">
              <button class="modal-btn cancel" @click="cancelLocation">
                取消
              </button>
              <button class="modal-btn confirm" @click="confirmLocation">
                發送位置
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- 天氣分享模態框（重新設計：堆疊 row + 對象選擇 + 預覽 + keep toggle） -->
      <Transition name="fade">
        <div
          v-if="showWeatherModal"
          class="feature-modal-overlay"
          @click="cancelWeather"
        >
          <div class="wm-panel" @click.stop>
            <!-- 標題列 -->
            <div class="wm-header">
              <span class="wm-title">
                <CloudSun :size="22" class="wm-title__icon" />
                天氣與位置
              </span>
              <div class="wm-header__actions">
                <button
                  class="wm-icon-btn"
                  :class="{ 'is-spinning': weatherStore.isLoading || charWeatherLoading }"
                  :disabled="weatherStore.isLoading || charWeatherLoading"
                  @click="refreshWeatherInModal"
                  title="重新整理天氣"
                >
                  <RefreshCcw :size="16" />
                </button>
                <button class="wm-icon-btn" @click="cancelWeather" title="關閉">
                  <X :size="18" />
                </button>
              </div>
            </div>

            <div class="wm-body">
              <!-- 堆疊式雙卡片：我 / 角色 -->
              <div class="wm-stack">
                <!-- 我 -->
                <button
                  type="button"
                  class="wm-row wm-row--user"
                  @click="openWeatherCitySheet('user')"
                >
                  <span class="wm-row__icon"><User :size="18" /></span>
                  <div class="wm-row__main">
                    <template
                      v-if="
                        weatherStore.isLoading &&
                        !weatherStore.hasWeatherData &&
                        !customWeatherData
                      "
                    >
                      <div class="wm-row__title">我</div>
                      <div class="wm-row__sub">載入中…</div>
                    </template>
                    <template v-else-if="customWeatherData">
                      <div class="wm-row__title">
                        <MapPin :size="13" />
                        <span class="wm-row__loc">{{ formatFullLocation(customWeatherData.location) || customWeatherData.location.name }}</span>
                        <span class="wm-row__time" v-if="getVirtualLocalTime(customWeatherData)">
                          · {{ (getVirtualLocalTime(customWeatherData) || "").split(" ")[1] || getVirtualLocalTime(customWeatherData) }}
                        </span>
                      </div>
                      <div class="wm-row__sub">
                        <b>{{ Math.round(customWeatherData.current.temp_c) }}°</b>
                        {{ customWeatherData.current.condition.text }} ·
                        體感 {{ Math.round(customWeatherData.current.feelslike_c) }}° ·
                        濕度 {{ customWeatherData.current.humidity }}%
                      </div>
                    </template>
                    <template v-else-if="weatherStore.hasWeatherData">
                      <div class="wm-row__title">
                        <MapPin :size="13" />
                        <span class="wm-row__loc">{{ (weatherStore.weatherData && formatFullLocation(weatherStore.weatherData.location)) || weatherStore.locationName }}</span>
                        <span
                          class="wm-row__time"
                          v-if="getVirtualLocalTime(weatherStore.weatherData)"
                        >
                          · {{ (getVirtualLocalTime(weatherStore.weatherData) || "").split(" ")[1] || getVirtualLocalTime(weatherStore.weatherData) }}
                        </span>
                        <span
                          v-if="weatherStore.userLocation.mode === 'ip'"
                          class="wm-row__ip-badge"
                          title="IP 定位可能不準確"
                        >
                          <Wifi :size="11" /> IP
                        </span>
                      </div>
                      <div class="wm-row__sub">
                        <b>{{ Math.round(weatherStore.currentTemp || 0) }}°</b>
                        {{ weatherStore.weatherCondition }} ·
                        體感 {{ Math.round(weatherStore.weatherData?.current.feelslike_c || 0) }}° ·
                        濕度 {{ weatherStore.weatherData?.current.humidity }}%
                      </div>
                    </template>
                    <template v-else>
                      <div class="wm-row__title wm-row__title--empty">
                        <User :size="13" /> 我
                      </div>
                      <div class="wm-row__sub wm-row__sub--cta">點此設定我的地點</div>
                    </template>
                  </div>
                  <ChevronRight :size="18" class="wm-row__chevron" />
                </button>

                <!-- 角色 -->
                <button
                  type="button"
                  class="wm-row wm-row--char"
                  @click="openWeatherCitySheet('char')"
                >
                  <span class="wm-row__icon" v-if="!currentCharacter?.avatar">
                    <Bot :size="18" />
                  </span>
                  <img
                    v-else
                    :src="currentCharacter.avatar"
                    class="wm-row__avatar"
                    alt=""
                  />
                  <div class="wm-row__main">
                    <template v-if="charWeatherLoading">
                      <div class="wm-row__title">{{ currentCharacter?.data?.name || "角色" }}</div>
                      <div class="wm-row__sub">載入中…</div>
                    </template>
                    <template v-else-if="charWeatherData">
                      <div class="wm-row__title">
                        <MapPin :size="13" />
                        <span class="wm-row__loc">{{ formatFullLocation(charWeatherData.location) || charWeatherData.location.name }}</span>
                        <span class="wm-row__time" v-if="getVirtualLocalTime(charWeatherData)">
                          · {{ (getVirtualLocalTime(charWeatherData) || "").split(" ")[1] || getVirtualLocalTime(charWeatherData) }}
                        </span>
                      </div>
                      <div class="wm-row__sub">
                        <b>{{ Math.round(charWeatherData.current.temp_c) }}°</b>
                        {{ charWeatherData.current.condition.text }} ·
                        體感 {{ Math.round(charWeatherData.current.feelslike_c) }}° ·
                        濕度 {{ charWeatherData.current.humidity }}%
                      </div>
                    </template>
                    <template v-else>
                      <div class="wm-row__title wm-row__title--empty">
                        {{ currentCharacter?.data?.name || "角色" }}
                      </div>
                      <div class="wm-row__sub wm-row__sub--cta">點此設定角色地點（會儲存到角色世界設定）</div>
                    </template>
                  </div>
                  <ChevronRight :size="18" class="wm-row__chevron" />
                </button>
              </div>

              <!-- 時差摘要 -->
              <div v-if="weatherTimeDiffSummary" class="wm-timediff">
                <Clock :size="14" />
                <span>{{ weatherTimeDiffSummary }}</span>
              </div>

              <!-- 對象選擇 chip -->
              <div class="wm-section">
                <div class="wm-section__label">要分享哪一邊？</div>
                <div class="wm-target-chips">
                  <button
                    v-for="opt in weatherSendTargetOptions"
                    :key="opt.value"
                    type="button"
                    class="wm-chip"
                    :class="{ 'is-active': weatherSendTarget === opt.value, 'is-disabled': opt.disabled }"
                    :disabled="opt.disabled"
                    @click="weatherSendTarget = opt.value"
                  >
                    {{ opt.label }}
                  </button>
                </div>
              </div>

              <!-- 預覽展開 -->
              <div class="wm-section wm-preview-wrap">
                <button
                  type="button"
                  class="wm-preview-toggle"
                  :disabled="!weatherPreview"
                  @click="weatherPreviewExpanded = !weatherPreviewExpanded"
                >
                  <component :is="weatherPreviewExpanded ? ChevronUp : ChevronDown" :size="14" />
                  <span>預覽要送給 AI 的訊息</span>
                </button>
                <Transition name="fade">
                  <pre v-if="weatherPreviewExpanded && weatherPreview" class="wm-preview">{{ weatherPreview.content }}</pre>
                </Transition>
              </div>

              <!-- keep-in-this-chat toggle -->
              <label class="wm-keep-toggle">
                <input
                  type="checkbox"
                  :checked="wmKeepInThisChat"
                  @change="onWmKeepInThisChatChange(($event.target as HTMLInputElement).checked)"
                />
                <span class="wm-keep-toggle__main">
                  <span class="wm-keep-toggle__title">只用在這個聊天，不影響其他聊天</span>
                  <span class="wm-keep-toggle__hint">
                    {{
                      wmKeepInThisChat
                        ? "之後選的「我」的城市，只會改這個對話的天氣。"
                        : "之後選的「我」的城市，會更新全域天氣設定。"
                    }}
                  </span>
                </span>
              </label>
            </div>

            <!-- 底部操作 -->
            <div class="wm-footer">
              <PvButton
                label="取消"
                severity="secondary"
                outlined
                class="wm-footer__btn"
                @click="cancelWeather"
              />
              <PvButton
                label="發送天氣"
                class="wm-footer__btn"
                :disabled="!weatherCanSend"
                @click="sendWeatherMessage"
              />
            </div>

            <!-- 城市選擇 bottom sheet（從卡片點擊觸發） -->
            <Transition name="wm-sheet">
              <div
                v-if="weatherCitySheetTarget"
                class="wm-city-sheet"
                @click.stop
              >
                <div class="wm-city-sheet__header">
                  <button class="wm-icon-btn" @click="closeWeatherCitySheet" title="返回">
                    <ArrowLeft :size="18" />
                  </button>
                  <span class="wm-city-sheet__title">
                    {{ weatherCitySheetTarget === "user" ? "變更我的地點" : `變更 ${currentCharacter?.data?.name || "角色"} 的地點` }}
                  </span>
                  <button
                    v-if="weatherCitySheetTarget === 'user' && customWeatherData"
                    class="wm-city-sheet__clear"
                    @click="clearCustomWeather(); closeWeatherCitySheet()"
                  >
                    清除自訂
                  </button>
                </div>

                <div class="wm-city-sheet__body">
                  <!-- 步驟 1：國家/地區（必選） -->
                  <div class="wm-city-sheet__section">
                    <div class="wm-city-sheet__section-title">
                      國家/地區（必選）
                      <PvTag value="步驟 1" severity="info" class="wm-city-sheet__tag" />
                    </div>
                    <PvSelect
                      v-model="wmCountry"
                      :options="wmCountryOptions"
                      placeholder="選擇或搜尋國家/地區..."
                      class="wm-city-sheet__select"
                      filter
                      show-clear
                    />
                  </div>

                  <!-- 步驟 2：地點 -->
                  <div class="wm-city-sheet__section">
                    <div class="wm-city-sheet__section-title">
                      地點（必選）
                      <PvTag value="步驟 2" severity="info" class="wm-city-sheet__tag" />
                    </div>

                    <!-- 搜尋 -->
                    <div
                      class="wm-city-sheet__search"
                      :class="{ 'is-disabled': !wmCountry }"
                    >
                      <Search :size="14" />
                      <input
                        v-model="weatherSearchQuery"
                        type="text"
                        :placeholder="wmCountry ? '搜尋城市名稱（中英文皆可）' : '請先選擇國家/地區再搜尋'"
                        :disabled="!wmCountry"
                        class="wm-city-sheet__search-input"
                      />
                    </div>

                    <!-- 搜尋結果 -->
                    <div
                      v-if="wmCountry && weatherSearchQuery && weatherSearchResults.length > 0"
                      class="wm-city-sheet__list"
                    >
                      <button
                        v-for="r in weatherSearchResults"
                        :key="r.id"
                        type="button"
                        class="wm-city-sheet__item"
                        @click="selectWmSearchResult(r)"
                      >
                        <MapPin :size="13" />
                        <span class="wm-city-sheet__item-name">
                          {{ r.name }}<span v-if="r.region" class="wm-city-sheet__item-region">, {{ r.region }}</span>
                        </span>
                        <span class="wm-city-sheet__item-country">{{ r.country || wmCountry }}</span>
                      </button>
                    </div>
                    <div
                      v-else-if="wmCountry && weatherSearchQuery && !weatherSearchLoading"
                      class="wm-city-sheet__empty"
                    >
                      {{ weatherSearchQuery.length < 2 ? "至少輸入 2 個字元" : "找不到符合的城市" }}
                    </div>

                    <!-- 依國家城市清單（精確座標） -->
                    <div
                      v-if="wmCountry && !weatherSearchQuery && WORLD_CITIES[wmCountry]"
                      class="wm-city-sheet__grid"
                    >
                      <PvButton
                        v-for="city in WORLD_CITIES[wmCountry]"
                        :key="city.name"
                        size="small"
                        severity="secondary"
                        text
                        class="wm-city-sheet__city"
                        @click="selectWmWorldCity(city, wmCountry)"
                      >
                        {{ city.name }}<span class="wm-city-sheet__city-country">, {{ wmCountry }}</span>
                      </PvButton>
                    </div>

                    <div v-if="!wmCountry" class="wm-city-sheet__empty">
                      請先在上方選擇國家/地區
                    </div>
                  </div>

                  <!-- 我的城市（已儲存的常用地點） -->
                  <div
                    v-if="wmSavedCities.length > 0"
                    class="wm-city-sheet__section"
                  >
                    <div class="wm-city-sheet__section-title">我的城市</div>
                    <div class="wm-city-sheet__chips">
                      <PvButton
                        v-for="c in wmSavedCities"
                        :key="c.name"
                        size="small"
                        severity="secondary"
                        :disabled="c.lat === undefined || c.lon === undefined"
                        class="wm-city-sheet__chip"
                        @click="selectWmSavedCity(c)"
                      >
                        <MapPin :size="12" style="margin-right: 4px" />
                        {{ wmFormatCityLabel(c.name, c.region, c.country) || c.name }}
                        <span v-if="!c.country" class="wm-city-sheet__chip-missing">（缺國家）</span>
                      </PvButton>
                    </div>
                  </div>
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </Transition>

      <!-- 快捷輸入編輯模態框 -->
      <Transition name="fade">
        <div
          v-if="showQuickActionEditor"
          class="quick-action-editor-overlay"
          @click="cancelQuickActionEdit"
        >
          <div class="quick-action-editor" @click.stop>
            <div class="editor-header">
              <h3>自定義快捷輸入</h3>
              <button class="close-btn" @click="cancelQuickActionEdit">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                  />
                </svg>
              </button>
            </div>

            <div class="editor-content">
              <!-- 現有自定義快捷列表 -->
              <div class="custom-actions-list">
                <div
                  v-for="(action, index) in editingQuickActions"
                  :key="index"
                  class="custom-action-item"
                >
                  <span class="action-label">{{ action.label }}</span>
                  <span class="action-text">{{ action.text }}</span>
                  <button
                    class="remove-btn"
                    @click="removeEditingQuickAction(index)"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                      />
                    </svg>
                  </button>
                </div>
                <div v-if="editingQuickActions.length === 0" class="empty-hint">
                  尚無自定義快捷，請在下方添加
                </div>
              </div>

              <!-- 添加新快捷 -->
              <div class="add-action-form">
                <div class="form-row">
                  <input
                    v-model="newActionLabel"
                    type="text"
                    placeholder="顯示文字（如：~）"
                    class="form-input"
                  />
                  <input
                    v-model="newActionText"
                    type="text"
                    placeholder="插入內容（如：~~）"
                    class="form-input"
                  />
                </div>
                <div class="form-row">
                  <input
                    v-model="newActionHint"
                    type="text"
                    placeholder="提示說明（可選）"
                    class="form-input hint-input"
                  />
                  <button
                    class="add-btn"
                    :disabled="!newActionLabel.trim() || !newActionText.trim()"
                    @click="addNewQuickAction"
                  >
                    添加
                  </button>
                </div>
              </div>
            </div>

            <div class="editor-footer">
              <button class="cancel-btn" @click="cancelQuickActionEdit">
                取消
              </button>
              <button class="save-btn" @click="saveQuickActions">保存</button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- NovelAI 文生圖設定 Modal -->
      <Transition name="fade">
        <div
          v-if="showNovelAISettingsModal"
          class="feature-modal-overlay"
          @click="closeNovelAISettings"
        >
          <div class="novelai-settings-modal" @click.stop>
            <header class="modal-header">
              <h3>
                <svg viewBox="0 0 24 24" fill="currentColor" class="title-icon">
                  <path
                    d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
                  />
                </svg>
                NovelAI 文生圖設定
              </h3>
              <button class="close-btn" @click="closeNovelAISettings">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                  />
                </svg>
              </button>
            </header>

            <div class="modal-body">
              <!-- 啟用開關 -->
              <div class="setting-row">
                <div class="setting-label">
                  <span>啟用文生圖</span>
                  <span class="setting-hint">在聊天中使用 AI 生成圖片</span>
                </div>
                <label class="toggle-switch">
                  <input
                    type="checkbox"
                    v-model="settingsStore.novelAIImage.enabled"
                  />
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <!-- 代理設定 -->
              <div class="setting-divider">連線/代理</div>

              <div class="setting-row">
                <div class="setting-label">
                  <span>使用代理（預設代理可不填地址）</span>
                  <span class="setting-hint">
                    透過 Cloudflare Worker 轉發（部分 iOS WebView
                    容器可能不穩定）
                  </span>
                </div>
                <label class="toggle-switch">
                  <input
                    type="checkbox"
                    v-model="settingsStore.novelAIImage.useProxy"
                  />
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <div
                class="setting-group"
                v-if="settingsStore.novelAIImage.useProxy"
              >
                <label class="setting-label">代理地址（可選）</label>
                <input
                  type="text"
                  class="setting-input"
                  v-model="settingsStore.novelAIImage.proxyBaseUrl"
                  placeholder="留空＝使用預設 https://nai-proxy.aguacloud.uk"
                  autocomplete="off"
                  autocorrect="off"
                  autocapitalize="off"
                  spellcheck="false"
                />
                <span class="setting-hint">
                  不需要填也能使用預設代理；只有你自架/更換代理時才需要填
                </span>
              </div>

              <!-- API Key -->
              <div class="setting-group">
                <label class="setting-label">NovelAI API Key</label>
                <input
                  type="text"
                  class="setting-input api-key-field masked"
                  v-model="settingsStore.novelAIImage.apiKey"
                  placeholder="pst-xxxx..."
                  autocomplete="off"
                  autocorrect="off"
                  autocapitalize="off"
                  spellcheck="false"
                />
                <span class="setting-hint">從 NovelAI 帳戶設定取得</span>
              </div>

              <!-- 模型選擇 -->
              <div class="setting-group">
                <label class="setting-label">模型</label>
                <select
                  class="setting-select"
                  v-model="settingsStore.novelAIImage.model"
                >
                  <option value="nai-diffusion-3">NAI Diffusion V3</option>
                  <option value="nai-diffusion-4-curated-preview">
                    NAI Diffusion V4 Curated
                  </option>
                  <option value="nai-diffusion-4-full">
                    NAI Diffusion V4 Full
                  </option>
                  <option value="nai-diffusion-4-5-curated">
                    NAI Diffusion V4.5 Curated
                  </option>
                  <option value="nai-diffusion-4-5-full">
                    NAI Diffusion V4.5 Full
                  </option>
                </select>
              </div>

              <!-- 尺寸選擇 -->
              <div class="setting-group">
                <label class="setting-label">圖片尺寸</label>
                <div class="size-presets">
                  <button
                    v-for="size in novelAISizePresets"
                    :key="size.label"
                    class="size-preset-btn"
                    :class="{
                      active:
                        settingsStore.novelAIImage.width === size.width &&
                        settingsStore.novelAIImage.height === size.height,
                    }"
                    @click="
                      settingsStore.novelAIImage.width = size.width;
                      settingsStore.novelAIImage.height = size.height;
                    "
                  >
                    {{ size.label }}
                  </button>
                </div>
              </div>

              <!-- 生成步數 -->
              <div class="setting-group">
                <label class="setting-label"
                  >生成步數: {{ settingsStore.novelAIImage.steps }}</label
                >
                <input
                  type="range"
                  class="setting-range"
                  v-model.number="settingsStore.novelAIImage.steps"
                  min="10"
                  max="50"
                  step="1"
                />
              </div>

              <!-- CFG Scale -->
              <div class="setting-group">
                <label class="setting-label"
                  >CFG Scale: {{ settingsStore.novelAIImage.scale }}</label
                >
                <input
                  type="range"
                  class="setting-range"
                  v-model.number="settingsStore.novelAIImage.scale"
                  min="1"
                  max="15"
                  step="0.5"
                />
              </div>

              <!-- 採樣器 -->
              <div class="setting-group">
                <label class="setting-label">採樣器</label>
                <select
                  class="setting-select"
                  v-model="settingsStore.novelAIImage.sampler"
                >
                  <option
                    v-for="sampler in novelAISamplers"
                    :key="sampler.value"
                    :value="sampler.value"
                  >
                    {{ sampler.label }}
                  </option>
                </select>
              </div>

              <!-- 負面提示詞 -->
              <div class="setting-group">
                <label class="setting-label">負面提示詞</label>
                <textarea
                  class="setting-textarea"
                  v-model="settingsStore.novelAIImage.negativePrompt"
                  rows="3"
                  placeholder="不想出現的元素..."
                ></textarea>
              </div>

              <!-- 正面提示詞前綴 -->
              <div class="setting-group">
                <label class="setting-label">正面提示詞前綴</label>
                <textarea
                  class="setting-textarea"
                  v-model="settingsStore.novelAIImage.positivePromptPrefix"
                  rows="2"
                  placeholder="固定加在提示詞前面，例如: masterpiece, best quality"
                ></textarea>
                <span class="setting-hint"
                  >會自動加在每次生成的提示詞最前面</span
                >
              </div>

              <!-- 正面提示詞後綴 -->
              <div class="setting-group">
                <label class="setting-label">正面提示詞後綴</label>
                <textarea
                  class="setting-textarea"
                  v-model="settingsStore.novelAIImage.positivePromptSuffix"
                  rows="2"
                  placeholder="固定加在提示詞後面，例如: anime style, detailed"
                ></textarea>
                <span class="setting-hint"
                  >會自動加在每次生成的提示詞最後面</span
                >
              </div>

              <!-- 進階設定分隔線 -->
              <div class="setting-divider">進階設定</div>

              <!-- Noise Schedule -->
              <div class="setting-group">
                <label class="setting-label">Noise Schedule</label>
                <select
                  class="setting-select"
                  v-model="settingsStore.novelAIImage.noiseSchedule"
                >
                  <option value="karras">Karras</option>
                  <option value="exponential">Exponential</option>
                  <option value="polyexponential">Polyexponential</option>
                  <option value="native">Native</option>
                </select>
              </div>

              <!-- CFG Rescale -->
              <div class="setting-group">
                <label class="setting-label"
                  >CFG Rescale:
                  {{ settingsStore.novelAIImage.cfgRescale ?? 0 }}</label
                >
                <input
                  type="range"
                  class="setting-range"
                  v-model.number="settingsStore.novelAIImage.cfgRescale"
                  min="0"
                  max="1"
                  step="0.02"
                />
              </div>

              <!-- UC Preset -->
              <div class="setting-group">
                <label class="setting-label">負面提示詞預設強度</label>
                <select
                  class="setting-select"
                  v-model.number="settingsStore.novelAIImage.ucPreset"
                >
                  <option :value="0">Heavy</option>
                  <option :value="1">Light</option>
                  <option :value="2">Human Focus</option>
                  <option :value="3">無</option>
                </select>
              </div>

              <!-- 開關選項 -->
              <div class="setting-row">
                <div class="setting-label">
                  <span>Variety Boost</span>
                  <span class="setting-hint">增加生成多樣性</span>
                </div>
                <label class="toggle-switch">
                  <input
                    type="checkbox"
                    v-model="settingsStore.novelAIImage.varietyBoost"
                  />
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <div class="setting-row">
                <div class="setting-label">
                  <span>Decrisper</span>
                  <span class="setting-hint">動態閾值，減少過飽和</span>
                </div>
                <label class="toggle-switch">
                  <input
                    type="checkbox"
                    v-model="settingsStore.novelAIImage.dynamicThresholding"
                  />
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <!-- 種子 -->
              <div class="setting-group">
                <label class="setting-label">種子 (0 = 隨機)</label>
                <input
                  type="number"
                  class="setting-input"
                  v-model.number="settingsStore.novelAIImage.seed"
                  min="0"
                  max="4294967295"
                  placeholder="0"
                />
              </div>
            </div>

            <footer class="modal-footer nai-footer">
              <div class="footer-left">
                <button
                  class="btn-icon-text"
                  @click="exportNovelAIConfig"
                  title="導出配置"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    width="16"
                    height="16"
                  >
                    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                  </svg>
                  <span>導出</span>
                </button>
                <button
                  class="btn-icon-text"
                  @click="triggerNAIConfigImport"
                  title="導入配置"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    width="16"
                    height="16"
                  >
                    <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z" />
                  </svg>
                  <span>導入</span>
                </button>
                <input
                  ref="naiConfigFileInput"
                  type="file"
                  accept=".json"
                  style="display: none"
                  @change="handleNAIConfigImport"
                />
              </div>
              <div class="footer-right">
                <button class="btn-cancel" @click="closeNovelAISettings">
                  取消
                </button>
                <button class="btn-confirm" @click="saveNovelAISettings">
                  儲存
                </button>
              </div>
            </footer>
          </div>
        </div>
      </Transition>

      <!-- MiniMax TTS 語音設定 Modal -->
      <Transition name="fade">
        <div
          v-if="showMinimaxTTSSettingsModal"
          class="feature-modal-overlay"
          @click="closeMinimaxTTSSettings"
        >
          <div class="novelai-settings-modal" @click.stop>
            <header class="modal-header">
              <h3>
                <svg viewBox="0 0 24 24" fill="currentColor" class="title-icon">
                  <path
                    d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"
                  />
                </svg>
                MiniMax 語音設定（此聊天）
              </h3>
              <button class="close-btn" @click="closeMinimaxTTSSettings">
                ✕
              </button>
            </header>

            <div class="modal-body">
              <p style="font-size: 12px; color: #888; margin-bottom: 12px">
                覆蓋此聊天的語音參數。留空則使用設定 App 中的全域預設值。
              </p>

              <!-- 音色 voice_id -->
              <div class="setting-group">
                <label class="setting-label">音色 (voice_id)</label>
                <input
                  type="text"
                  class="setting-input"
                  :value="chatMinimaxTTSOverride.voiceId ?? ''"
                  :placeholder="
                    settingsStore.minimaxTTS.voiceId || '使用全域預設'
                  "
                  @input="
                    chatMinimaxTTSOverride.voiceId =
                      ($event.target as HTMLInputElement).value || undefined
                  "
                />
                <span class="setting-hint"
                  >留空使用全域：{{ settingsStore.minimaxTTS.voiceId }}</span
                >
              </div>

              <!-- 語速 -->
              <div class="setting-group">
                <label class="setting-label"
                  >語速:
                  {{
                    chatMinimaxTTSOverride.speed ??
                    settingsStore.minimaxTTS.speed
                  }}</label
                >
                <input
                  type="range"
                  class="setting-range"
                  :value="
                    chatMinimaxTTSOverride.speed ??
                    settingsStore.minimaxTTS.speed
                  "
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  @input="
                    chatMinimaxTTSOverride.speed = parseFloat(
                      ($event.target as HTMLInputElement).value,
                    )
                  "
                />
              </div>

              <!-- 音調 -->
              <div class="setting-group">
                <label class="setting-label"
                  >音調:
                  {{
                    chatMinimaxTTSOverride.pitch ??
                    settingsStore.minimaxTTS.pitch
                  }}</label
                >
                <input
                  type="range"
                  class="setting-range"
                  :value="
                    chatMinimaxTTSOverride.pitch ??
                    settingsStore.minimaxTTS.pitch
                  "
                  min="-12"
                  max="12"
                  step="1"
                  @input="
                    chatMinimaxTTSOverride.pitch = parseInt(
                      ($event.target as HTMLInputElement).value,
                    )
                  "
                />
              </div>

              <!-- 情緒 -->
              <div class="setting-group">
                <label class="setting-label">預設情緒</label>
                <select
                  class="setting-select"
                  :value="chatMinimaxTTSOverride.emotion ?? ''"
                  @change="
                    chatMinimaxTTSOverride.emotion =
                      ($event.target as HTMLSelectElement).value || undefined
                  "
                >
                  <option value="">不設置（由 AI 標記決定）</option>
                  <option value="happy">😊 開心</option>
                  <option value="sad">😢 難過</option>
                  <option value="angry">😡 生氣</option>
                  <option value="fearful">😨 害怕</option>
                  <option value="disgusted">🤢 厭惡</option>
                  <option value="surprised">😲 驚訝</option>
                  <option value="calm">😌 平靜</option>
                </select>
              </div>

              <!-- 重置按鈕 -->
              <button
                class="btn-cancel"
                style="margin-top: 8px; font-size: 12px"
                @click="chatMinimaxTTSOverride = {}"
              >
                重置為全域預設
              </button>
            </div>

            <footer class="modal-footer">
              <button class="btn-cancel" @click="closeMinimaxTTSSettings">
                取消
              </button>
              <button class="btn-confirm" @click="saveMinimaxTTSSettings">
                儲存
              </button>
            </footer>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 聊天檔案面板 -->
    <Transition name="slide-up">
      <div
        v-if="showChatFilesPanel"
        class="chat-files-overlay"
        @click.self="showChatFilesPanel = false"
      >
        <div class="chat-files-panel">
          <div class="chat-files-header">
            <span class="chat-files-title">聊天檔案</span>
            <div class="chat-files-header-actions">
              <!-- 多選模式：顯示刪除 + 取消 -->
              <template v-if="isSelectingChats">
                <button
                  class="chat-files-action-btn danger"
                  :disabled="selectedChatIds.size === 0"
                  @click="deleteSelectedChats"
                >
                  刪除 {{ selectedChatIds.size > 0 ? `(${selectedChatIds.size})` : '' }}
                </button>
                <button class="chat-files-action-btn" @click="exitSelectMode">取消</button>
              </template>
              <!-- 一般模式：顯示多選 + 新建 -->
              <template v-else>
                <button class="chat-files-action-btn" @click="enterSelectMode">多選</button>
                <button
                  class="chat-files-new-btn"
                  @click="selectedGreetingIndex = 0; showNewChatConfirm = true;"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                  </svg>
                  新建
                </button>
              </template>
            </div>
          </div>
          <div class="chat-files-list">

            <!-- ── 普通聊天分類 ── -->
            <div class="chat-category-header" @click.stop="normalCategoryExpanded = !normalCategoryExpanded">
              <svg
                class="chat-category-arrow"
                :class="{ collapsed: !normalCategoryExpanded }"
                viewBox="0 0 24 24" fill="currentColor" width="14" height="14"
              >
                <path d="M7 10l5 5 5-5z"/>
              </svg>
              <span class="chat-category-label">普通聊天</span>
              <span class="chat-category-count">{{ normalChats.length }}</span>
              <!-- 分類全選 checkbox（多選模式才顯示） -->
              <label v-if="isSelectingChats && normalChats.length > 0" class="chat-category-select-all" @click.stop>
                <input
                  type="checkbox"
                  :checked="isCategoryAllSelected('normal')"
                  @change="selectAllInCategory('normal')"
                />
                全選
              </label>
            </div>
            <template v-if="normalCategoryExpanded">
              <div
                v-for="chat in normalChats"
                :key="chat.id"
                class="chat-file-item"
                :class="{
                  active: chat.id === currentChatId,
                  'select-mode': isSelectingChats,
                  selected: selectedChatIds.has(chat.id),
                }"
                @click="isSelectingChats ? toggleChatSelection(chat.id) : switchChatFile(chat.id)"
              >
                <!-- 多選 checkbox -->
                <label v-if="isSelectingChats" class="chat-file-checkbox" @click.stop>
                  <input
                    type="checkbox"
                    :checked="selectedChatIds.has(chat.id)"
                    @change="toggleChatSelection(chat.id)"
                  />
                </label>
                <div class="chat-file-info">
                  <template v-if="renamingChatId === chat.id">
                    <input
                      v-model="renamingChatName"
                      class="chat-file-rename-input"
                      @click.stop
                      @keydown.enter="confirmRenameChat(chat.id)"
                      @keydown.escape="renamingChatId = null"
                      @blur="confirmRenameChat(chat.id)"
                      autofocus
                    />
                  </template>
                  <template v-else>
                    <span class="chat-file-name">{{ chat.name || "未命名對話" }}</span>
                    <span class="chat-file-meta">
                      {{ chat.messageCount ?? chat.messages?.length ?? 0 }} 則訊息
                      · {{ formatChatFileTime(chat.updatedAt) }}
                    </span>
                  </template>
                </div>
                <div v-if="!isSelectingChats" class="chat-file-actions" @click.stop>
                  <button
                    class="chat-file-btn"
                    :class="{ pinned: chat.pinnedToList }"
                    :title="chat.pinnedToList ? '取消聊天置頂' : '聊天置頂'"
                    @click="togglePinChatToList(chat.id, $event)"
                  >
                    <svg v-if="chat.pinnedToList" viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                      <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
                    </svg>
                    <svg v-else viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                      <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h8v-2H7v2zm0 4h8v-2H7v2zM7 7v2h8V7H7zm9 8v-3h-2v3h-3v2h3v3h2v-3h3v-2h-3z"/>
                    </svg>
                  </button>
                  <button class="chat-file-btn" title="重命名" @click="startRenameChat(chat, $event)">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                    </svg>
                  </button>
                  <button class="chat-file-btn danger" title="刪除" @click="deleteChatFile(chat.id, $event)">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                    </svg>
                  </button>
                </div>
              </div>
            </template>

            <!-- ── 分支 / 小劇場分類（有才顯示） ── -->
            <template v-if="branchChats.length > 0">
              <div class="chat-category-header" @click.stop="branchCategoryExpanded = !branchCategoryExpanded">
                <svg
                  class="chat-category-arrow"
                  :class="{ collapsed: !branchCategoryExpanded }"
                  viewBox="0 0 24 24" fill="currentColor" width="14" height="14"
                >
                  <path d="M7 10l5 5 5-5z"/>
                </svg>
                <span class="chat-category-label">小劇場 / 分支</span>
                <span class="chat-category-count">{{ branchChats.length }}</span>
                <label v-if="isSelectingChats" class="chat-category-select-all" @click.stop>
                  <input
                    type="checkbox"
                    :checked="isCategoryAllSelected('branch')"
                    @change="selectAllInCategory('branch')"
                  />
                  全選
                </label>
              </div>
              <template v-if="branchCategoryExpanded">
                <div
                  v-for="chat in branchChats"
                  :key="chat.id"
                  class="chat-file-item"
                  :class="{
                    active: chat.id === currentChatId,
                    'select-mode': isSelectingChats,
                    selected: selectedChatIds.has(chat.id),
                  }"
                  @click="isSelectingChats ? toggleChatSelection(chat.id) : switchChatFile(chat.id)"
                >
                  <label v-if="isSelectingChats" class="chat-file-checkbox" @click.stop>
                    <input
                      type="checkbox"
                      :checked="selectedChatIds.has(chat.id)"
                      @change="toggleChatSelection(chat.id)"
                    />
                  </label>
                  <div class="chat-file-info">
                    <template v-if="renamingChatId === chat.id">
                      <input
                        v-model="renamingChatName"
                        class="chat-file-rename-input"
                        @click.stop
                        @keydown.enter="confirmRenameChat(chat.id)"
                        @keydown.escape="renamingChatId = null"
                        @blur="confirmRenameChat(chat.id)"
                        autofocus
                      />
                    </template>
                    <template v-else>
                      <span class="chat-file-name">{{ chat.name || "未命名對話" }}</span>
                      <span class="chat-file-meta">
                        {{ chat.messageCount ?? chat.messages?.length ?? 0 }} 則訊息
                        · {{ formatChatFileTime(chat.updatedAt) }}
                      </span>
                    </template>
                  </div>
                  <div v-if="!isSelectingChats" class="chat-file-actions" @click.stop>
                    <button
                      class="chat-file-btn"
                      :class="{ pinned: chat.pinnedToList }"
                      :title="chat.pinnedToList ? '取消聊天置頂' : '聊天置頂'"
                      @click="togglePinChatToList(chat.id, $event)"
                    >
                      <svg v-if="chat.pinnedToList" viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                        <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
                      </svg>
                      <svg v-else viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                        <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h8v-2H7v2zm0 4h8v-2H7v2zM7 7v2h8V7H7zm9 8v-3h-2v3h-3v2h3v3h2v-3h3v-2h-3z"/>
                      </svg>
                    </button>
                    <button class="chat-file-btn" title="重命名" @click="startRenameChat(chat, $event)">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                      </svg>
                    </button>
                    <button class="chat-file-btn danger" title="刪除" @click="deleteChatFile(chat.id, $event)">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </template>
            </template>

          </div>
        </div>
      </div>
    </Transition>

    <!-- 新建聊天確認彈窗（z-index 高於聊天檔案面板） -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showNewChatConfirm"
          class="new-chat-confirm-overlay"
          @click.self="showNewChatConfirm = false"
        >
          <div class="new-chat-confirm-modal">
            <h3>新建聊天</h3>
            <p>是否帶入角色開場白？</p>

            <!-- 開場白選擇列表 -->
            <div
              v-if="availableGreetings.length > 1"
              class="greeting-select-list"
            >
              <label class="greeting-select-label">選擇開場白：</label>
              <div
                v-for="(g, idx) in availableGreetings"
                :key="idx"
                class="greeting-option"
                :class="{ selected: selectedGreetingIndex === idx }"
                @click="selectedGreetingIndex = idx"
              >
                <div class="greeting-radio">
                  <div
                    v-if="selectedGreetingIndex === idx"
                    class="greeting-radio-dot"
                  ></div>
                </div>
                <div class="greeting-option-content">
                  <span class="greeting-option-label">{{ g.label }}</span>
                  <span class="greeting-option-preview"
                    >{{
                      g.content
                        .replace(/<[^>]*>/g, "")
                        .replace(/```[\s\S]*?```/g, "")
                        .substring(0, 80)
                    }}{{ g.content.length > 80 ? "..." : "" }}</span
                  >
                </div>
              </div>
            </div>

            <label class="branch-memory-option">
              <input v-model="newChatPinToList" type="checkbox" />
              <span>聊天置頂（可同時與同一角色開多個聊天）</span>
            </label>
            <div class="new-chat-confirm-actions">
              <button class="btn-cancel" @click="showNewChatConfirm = false">
                取消
              </button>
              <button class="btn-secondary" @click="createNewChatFile(false)">
                不帶開場白
              </button>
              <button class="btn-confirm" @click="createNewChatFile(true)">
                帶開場白
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 開啟新對話確認彈窗（清除全部重開 + 選擇開場白） -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showNewConversationConfirm"
          class="new-chat-confirm-overlay"
          @click.self="showNewConversationConfirm = false"
        >
          <div class="new-chat-confirm-modal">
            <h3>開啟新對話</h3>
            <p style="color: var(--color-danger, #e53e3e); font-size: 13px;">
              將清除所有聊天內容、總結記憶、日記和重要事件，不可恢復！
            </p>

            <!-- 開場白選擇列表 -->
            <div
              v-if="newConvAvailableGreetings.length > 1"
              class="greeting-select-list"
            >
              <label class="greeting-select-label">選擇開場白：</label>
              <div
                v-for="(g, idx) in newConvAvailableGreetings"
                :key="idx"
                class="greeting-option"
                :class="{ selected: newConvGreetingIndex === idx }"
                @click="newConvGreetingIndex = idx"
              >
                <div class="greeting-radio">
                  <div
                    v-if="newConvGreetingIndex === idx"
                    class="greeting-radio-dot"
                  ></div>
                </div>
                <div class="greeting-option-content">
                  <span class="greeting-option-label">{{ g.label }}</span>
                  <span class="greeting-option-preview"
                    >{{
                      g.content
                        .replace(/<[^>]*>/g, "")
                        .replace(/```[\s\S]*?```/g, "")
                        .substring(0, 80)
                    }}{{ g.content.length > 80 ? "..." : "" }}</span
                  >
                </div>
              </div>
            </div>

            <div class="new-chat-confirm-actions">
              <button class="btn-cancel" @click="showNewConversationConfirm = false">
                取消
              </button>
              <button class="btn-secondary" @click="confirmNewConversation(false)">
                不帶開場白
              </button>
              <button class="btn-confirm" @click="confirmNewConversation(true)">
                帶開場白
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 分支確認彈窗 -->
    <Transition name="fade">
      <div
        v-if="showBranchConfirm"
        class="modal-overlay"
        @click.self="showBranchConfirm = false"
      >
        <div class="new-chat-confirm-modal">
          <h3>建立分支</h3>
          <p>將從此訊息建立一個新的分支聊天。</p>
          <label class="branch-memory-option">
            <input v-model="branchCopyMemory" type="checkbox" />
            <span>同時複製總結、日記與重要事件</span>
          </label>

          <div
            v-if="_affinityConfig?.enabled"
            class="branch-affinity-section"
          >
            <div class="branch-affinity-title">好感度起點</div>
            <label class="branch-affinity-option">
              <input
                v-model="branchAffinityMode"
                type="radio"
                value="inherit"
              />
              <div class="branch-affinity-info">
                <span class="branch-affinity-label">繼承當下數值</span>
                <span class="branch-affinity-desc">
                  以目前聊天的好感度作為新分支起點（推薦）
                </span>
              </div>
            </label>
            <label class="branch-affinity-option">
              <input
                v-model="branchAffinityMode"
                type="radio"
                value="reset"
              />
              <div class="branch-affinity-info">
                <span class="branch-affinity-label">重設為角色預設值</span>
                <span class="branch-affinity-desc">
                  使用角色卡的初始值（metric.initial / mvuInitialData）
                </span>
              </div>
            </label>
            <label
              v-if="branchAvailableGreetings.length > 0"
              class="branch-affinity-option"
            >
              <input
                v-model="branchAffinityMode"
                type="radio"
                value="greeting"
              />
              <div class="branch-affinity-info">
                <span class="branch-affinity-label">使用開場白初始值</span>
                <span class="branch-affinity-desc">
                  套用所選開場白內嵌的 &lt;UpdateVariable&gt; 起始狀態
                </span>
              </div>
            </label>
            <select
              v-if="branchAffinityMode === 'greeting'"
              v-model="branchAffinityGreetingIndex"
              class="branch-affinity-greeting-select"
            >
              <option
                v-for="(g, idx) in branchAvailableGreetings"
                :key="idx"
                :value="idx"
              >
                {{ g.label }}
              </option>
            </select>
          </div>

          <div class="new-chat-confirm-actions">
            <button class="btn-cancel" @click="showBranchConfirm = false">
              取消
            </button>
            <button class="btn-confirm" @click="confirmBranch">建立分支</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 截圖預覽 Modal -->
    <ScreenshotPreviewModal
      v-if="screenshotPreviewUrl"
      :image-data-url="screenshotPreviewUrl"
      @close="screenshotPreviewUrl = null"
      @retake="handleScreenshotRetake"
    />

    <!-- 主動發訊息設置 Modal -->
    <ProactiveMessageSettingsModal
      v-if="showProactiveMessageSettings && currentCharacter"
      :character-id="currentCharacter.id"
      @close="showProactiveMessageSettings = false"
    />

    <!-- Pixabay 圖片搜尋面板 -->
    <ImageSearchPanel
      :visible="showImageSearchPanel"
      @close="showImageSearchPanel = false"
      @select="handleImageSearchSelect"
    />
  </div>
</template>

<style lang="scss" scoped>
.chat-screen {
  // 強制覆蓋 .screen-container 的全局背景色，讓 ::before 偽元素的桌布可見
  background: transparent !important;
  position: relative;
  overflow: hidden;

  // 聊天專屬桌布（或全局桌布，或默認背景色）
  &::before {
    content: "";
    position: absolute;
    inset: 0;
    // 優先使用聊天專屬桌布，其次全局桌布，最後才 fallback 到背景色
    background: var(
      --chat-wallpaper,
      var(--wallpaper-value, var(--color-background))
    );
    background-size: var(--chat-wallpaper-fit, var(--wallpaper-fit, cover));
    background-position: center;
    background-repeat: var(
      --chat-wallpaper-repeat,
      var(--wallpaper-repeat, no-repeat)
    );
    filter: blur(var(--chat-wallpaper-blur, var(--wallpaper-blur, 0px)));
    opacity: var(--chat-wallpaper-opacity, var(--wallpaper-opacity, 1));
    z-index: 0;
    pointer-events: none;
  }

  // 確保內容在桌布之上
  > * {
    position: relative;
    z-index: 1;
  }

  // 讓 header（含其下拉選單）疊在訊息列表之上，避免訊息氣泡/貼圖遮擋 dropdown
  > :deep(.chat-header) {
    z-index: 30;
  }

  // 聊天專屬外觀：覆蓋 MessageBubble 的樣式
  :deep(.bubble) {
    // 字體樣式
    font-size: var(--chat-font-size, 15px);
    font-family: var(--chat-font-family, inherit);
    line-height: var(--chat-line-height, 1.6);
    letter-spacing: var(--chat-letter-spacing, 0px);

    &.user {
      background: var(
        --chat-bubble-user-bg,
        var(--bubble-user-bg, linear-gradient(135deg, #ff85a2, #ffb6c8))
      );
      color: var(--chat-bubble-user-text, var(--bubble-user-text, white));

      .message-time {
        color: var(--chat-bubble-user-text, var(--bubble-user-text, white));
      }
    }

    &.ai {
      background: var(--chat-bubble-ai-bg, var(--bubble-ai-bg, white));
      color: var(--chat-bubble-ai-content, var(--bubble-ai-content, #4a4a6a));

      .message-time {
        color: var(--chat-bubble-ai-text, var(--bubble-ai-text, #4a4a6a));
      }
    }

    // Markdown 樣式
    em,
    i {
      color: var(--chat-md-italic, inherit);
    }

    strong,
    b {
      color: var(--chat-md-bold, inherit);
    }

    u {
      color: var(--chat-md-underline, inherit);
    }

    del,
    s {
      color: var(--chat-md-strikethrough, #999);
    }

    mark {
      background-color: var(--chat-md-highlight, #fff3cd);
      padding: 1px 4px;
      border-radius: 2px;
    }

    blockquote {
      color: var(--chat-md-quote, #8b5a2b);
      border-left: 3px solid var(--chat-md-quote, #8b5a2b);
      padding-left: 10px;
      margin: 8px 0;
      font-style: italic;
    }

    code {
      color: var(--chat-md-code, #e83e8c);
      background: rgba(0, 0, 0, 0.05);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: monospace;
    }

    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      color: var(--chat-md-heading, inherit);
    }

    // 中文引號「」樣式
    .chinese-quote {
      color: var(--chat-md-quote, #8b5a2b);
    }
  }

  :deep(.message-content) {
    max-width: var(--chat-bubble-max-width, var(--bubble-max-width, 75%));
  }

  // 純 HTML 訊息：跳過聊天外觀的 75% 寬度限制，由 .message-wrapper.html-only 自行撐滿
  :deep(.message-wrapper.html-only > .message-content) {
    max-width: 100% !important;
    width: 100% !important;
  }

  // 聊天專屬頭像樣式
  :deep(.soft-avatar) {
    border-radius: var(--avatar-border-radius, 50%);
    border: var(--avatar-border-width, 2px) solid
      var(--avatar-border-color, white);
    box-shadow: var(--avatar-shadow, 0 4px 12px var(--color-shadow));
  }
}

// 標題欄樣式已遷移至 ChatScreenHeader.vue（單一來源），此處不再定義 .chat-header
// 以避免父層 scoped CSS 透過 root element 的 data-v 套用造成 padding-top + margin-top 雙重 safe-top 疊加

.header-back {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  background: var(--color-background);
  color: var(--color-text);
  cursor: pointer;
  border: none;
  transition: all var(--transition-fast);

  svg {
    width: 24px;
    height: 24px;
  }

  &:hover {
    background: var(--color-surface-hover);
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }
}

.char-avatar-wrap {
  position: relative;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
}

.char-avatar-heart {
  position: absolute;
  bottom: -3px;
  right: -3px;
  width: 14px;
  height: 14px;
  color: #f472b6;
  pointer-events: none;
  filter: drop-shadow(0 0 1px rgba(0,0,0,0.4));
}

.char-avatar {
  width: 44px;
  height: 44px;
  border-radius: var(--avatar-border-radius, 50%);
  overflow: hidden;
  background: var(--color-background);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    transform: scale(1.05);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  &:active {
    transform: scale(0.95);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);

    svg {
      width: 28px;
      height: 28px;
    }
  }
}

.chat-info {
  flex: 1;
  min-width: 0;
}

.chat-name-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.nickname-edit-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary, #999);
  cursor: pointer;
  border-radius: 4px;
  padding: 0;
  opacity: 0.5;
  transition:
    opacity 0.2s,
    background 0.2s;

  svg {
    width: 14px;
    height: 14px;
  }

  &:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.1);
  }
}

.nickname-edit-popup {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.nickname-edit-input {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid var(--color-primary, #7dd3a8);
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  background: var(--color-surface, #fff);
  color: var(--color-text, #333);
  outline: none;

  &:focus {
    border-color: var(--color-primary, #7dd3a8);
    box-shadow: 0 0 0 2px rgba(125, 211, 168, 0.2);
  }
}

.nickname-save-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  background: var(--color-primary, #7dd3a8);
  color: white;
  border-radius: 6px;
  cursor: pointer;
  padding: 0;

  svg {
    width: 16px;
    height: 16px;
  }
}

.chat-name {
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-status {
  font-size: 12px;
  color: var(--color-primary);
  margin: 2px 0 0;
}

.header-actions {
  display: flex;
  gap: 8px;
}

// ===== Rail 收合按鈕（僅手機端） =====
.rail-toggle-btn {
  display: none; // 桌面端隱藏
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  background: var(--color-background);
  color: var(--color-text-secondary);
  cursor: pointer;
  border: none;
  flex-shrink: 0;
  transition: all var(--transition-fast);

  svg {
    width: 20px;
    height: 20px;
    transition: transform 0.2s ease;
  }

  &:hover {
    background: var(--color-primary-light);
    color: var(--color-primary);
  }

  &:active {
    transform: scale(0.95);
  }

  &.active {
    background: var(--color-primary-light);
    color: var(--color-primary);
  }
}

// ===== 手機端響應式 Rail =====
@media (max-width: 600px) {
  .rail-toggle-btn {
    display: flex;
  }

  .header-actions {
    // 手機端：隱藏原本的 inline 排列
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 100;
    flex-wrap: wrap;
    gap: 6px;
    padding: 10px 16px 12px;
    padding-left: calc(16px + var(--safe-left));
    padding-right: calc(16px + var(--safe-right));
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    justify-content: center;
    animation: rail-slide-in 0.2s ease-out;

    &.rail-open {
      display: flex;
    }
  }

  .chat-header {
    // 讓 header-actions 的 absolute 定位相對於 header
    position: relative;
  }

  // 手機端下拉選單調整：避免溢出螢幕
  .header-actions.rail-open {
    overflow: visible;

    .dropdown-menu {
      position: fixed;
      top: auto;
      right: 8px;
      left: 8px;
      width: auto;
      max-width: calc(100vw - 16px);
    }

    .persona-selector {
      position: fixed;
      top: auto;
      left: 50%;
      right: auto;
      transform: translateX(-50%);
      width: auto;
      min-width: 220px;
      max-width: min(280px, calc(100vw - 32px));
      z-index: 1000;
    }

    .persona-dropdown,
    .game-dropdown,
    .more-dropdown,
    .chat-settings-dropdown {
      position: static;
    }
  }
}

@keyframes rail-slide-in {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.header-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  background: var(--color-background);
  color: var(--color-text-secondary);
  cursor: pointer;
  border: none;
  transition: all var(--transition-fast);

  svg {
    width: 22px;
    height: 22px;
  }

  &:hover {
    background: var(--color-primary-light);
    color: var(--color-primary);
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }

  &.active {
    background: var(--color-primary-light);
    color: var(--color-primary);
  }
}

// 更多選單
.more-dropdown {
  position: relative;
}

// 小遊戲選單
.game-dropdown {
  position: relative;
}

.game-menu {
  min-width: 160px;

  .dropdown-item {
    svg {
      width: 20px;
      height: 20px;
      color: var(--color-text-secondary);
    }
  }
}

// ===== Persona 選擇器 =====
.persona-dropdown {
  position: relative;
}

.persona-btn {
  &.header-btn {
    overflow: hidden;
  }
}

.persona-avatar-mini {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.persona-selector {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  min-width: 220px;
  max-width: min(280px, calc(100vw - 40px));
  z-index: 500;
}

.persona-selector-header {
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-muted);
  border-bottom: 1px solid var(--color-border);
}

.persona-list {
  max-height: 300px;
  overflow-y: auto;
}

.persona-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background var(--transition-fast);
  text-align: left;

  &:hover {
    background: var(--color-background);
  }

  &.active {
    background: var(--color-primary-light);
  }
}

.persona-item-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--color-background);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  svg {
    width: 20px;
    height: 20px;
    color: var(--color-text-muted);
  }
}

.persona-item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.persona-item-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.persona-item-desc {
  font-size: 12px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.check-icon {
  width: 18px;
  height: 18px;
  color: var(--color-primary);
  flex-shrink: 0;
}

.persona-selector-footer {
  padding: 8px 12px;
  border-top: 1px solid var(--color-border);
}

.edit-persona-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 10px 12px;
  background: var(--color-background);
  border: none;
  border-radius: var(--radius-lg);
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);

  svg {
    width: 16px;
    height: 16px;
  }

  &:hover {
    background: var(--color-primary-light);
    color: var(--color-primary);
  }
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  overflow-y: auto;
  overflow-x: hidden;
  min-width: 180px;
  max-height: calc(100dvh - 120px); // 使用 dvh 適應動態視口（考慮地址欄）
  max-height: calc(100svh - 120px); // 回退到 svh（小視口高度）
  z-index: 500;

  // 自定義滾動條
  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 2px;
  }
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 18px;
  background: transparent;
  border: none;
  font-size: 15px;
  color: var(--color-text);
  cursor: pointer;
  transition: background var(--transition-fast);

  svg {
    width: 20px;
    height: 20px;
    color: var(--color-text-secondary);
  }

  &:hover {
    background: var(--color-background);
  }

  &.danger {
    color: var(--color-error);

    svg {
      color: var(--color-error);
    }

    &:hover {
      background: rgba(255, 123, 123, 0.1);
    }
  }
}

.dropdown-divider {
  height: 1px;
  background: var(--color-border);
  margin: 4px 0;
}

.dropdown-section-title {
  padding: 10px 18px 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

// 聊天設定下拉選單
.chat-settings-dropdown {
  position: relative;
}

.chat-settings-menu {
  min-width: 220px;
}

.dropdown-clear-btn {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.2));
  background: transparent;
  color: var(--color-text-secondary, rgba(255, 255, 255, 0.6));
  cursor: pointer;
  white-space: nowrap;
  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
}

// 帶開關的下拉選項
.dropdown-toggle-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 12px 18px;
  background: transparent;
  transition: background var(--transition-fast);

  &:hover {
    background: var(--color-background);
  }

  .toggle-item-info {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;

    svg {
      width: 20px;
      height: 20px;
      color: var(--color-text-secondary);
      flex-shrink: 0;
    }

    span {
      font-size: 14px;
      color: var(--color-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
}

// 迷你開關樣式
.toggle-switch-mini {
  position: relative;
  width: 40px;
  height: 22px;
  flex-shrink: 0;

  input {
    opacity: 0;
    width: 0;
    height: 0;

    &:checked + .toggle-slider-mini {
      background: var(--color-primary);

      &::before {
        transform: translateX(18px);
      }
    }
  }

  .toggle-slider-mini {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--color-border);
    border-radius: 11px;
    transition: 0.3s;

    &::before {
      content: "";
      position: absolute;
      height: 18px;
      width: 18px;
      left: 2px;
      bottom: 2px;
      background: white;
      border-radius: 50%;
      transition: 0.3s;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }
  }
}

// 假時間設定面板
.fake-time-panel {
  padding: 8px 18px 12px;
  border-top: 1px solid var(--color-border);

  .fake-time-mode-selector {
    display: flex;
    gap: 4px;
    margin-bottom: 8px;

    .fake-time-mode-btn {
      flex: 1;
      padding: 5px 0;
      font-size: 12px;
      border: 1px solid var(--color-border);
      border-radius: 6px;
      background: transparent;
      color: var(--color-text-secondary);
      cursor: pointer;
      transition: all 0.2s;

      &.active {
        background: var(--color-primary);
        color: white;
        border-color: var(--color-primary);
      }
    }
  }

  .fake-time-config {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .fake-time-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    color: var(--color-text-secondary);
    gap: 8px;
  }

  .fake-time-input {
    flex: 1;
    padding: 4px 8px;
    font-size: 12px;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-background);
    color: var(--color-text);
    max-width: 180px;
  }

  .fake-time-preview {
    margin-top: 8px;
    padding: 6px 10px;
    font-size: 11px;
    color: var(--color-primary);
    background: var(
      --color-primary-light,
      rgba(var(--color-primary-rgb, 99, 102, 241), 0.1)
    );
    border-radius: 6px;
    text-align: center;
  }

  .fake-time-jump {
    display: flex;
    gap: 6px;
    margin-top: 6px;
    align-items: center;

    .fake-time-jump-btn {
      padding: 4px 10px;
      font-size: 12px;
      border: none;
      border-radius: 6px;
      background: var(--color-primary);
      color: white;
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;

      &:active {
        opacity: 0.8;
      }
    }
  }
}

// 搜索欄
.search-bar {
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  padding: 8px 16px;
  padding-left: calc(16px + var(--safe-left));
  padding-right: calc(16px + var(--safe-right));
  z-index: 9;
}

.search-bar-content {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--color-background);
  border-radius: var(--radius-lg);
  padding: 8px 12px;
}

.search-icon {
  width: 20px;
  height: 20px;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.search-bar-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 15px;
  color: var(--color-text);
  outline: none;
  min-width: 0;

  &::placeholder {
    color: var(--color-text-muted);
  }
}

.search-results-count {
  font-size: 13px;
  color: var(--color-text-muted);
  white-space: nowrap;
  padding: 0 8px;
}

.search-nav-buttons {
  display: flex;
  gap: 4px;
}

.search-nav-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--color-text);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover:not(:disabled) {
    background: var(--color-surface-hover);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.search-close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }
}

.search-status-hint,
.search-context-hint {
  margin-top: 6px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-text);
  font-size: 12px;

  &.error {
    background: rgba(239, 68, 68, 0.12);
    color: #ef4444;
  }

  button {
    margin-left: 8px;
    border: none;
    background: transparent;
    color: var(--color-primary);
    font-weight: 600;
    cursor: pointer;
  }
}

// 搜索結果清單面板
.search-results-panel {
  max-height: 260px;
  overflow-y: auto;
  border-top: 1px solid var(--color-border);
  margin-top: 6px;

  &.search-results-empty {
    padding: 12px 16px;
    font-size: 13px;
    color: var(--color-text-muted);
    text-align: center;
  }
}

.search-result-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background var(--transition-fast);
  border-bottom: 1px solid var(--color-border);

  &:last-child {
    border-bottom: none;
  }

  &:hover,
  &.active {
    background: var(--color-surface-hover);
  }
}

.search-result-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--color-text-muted);
}

.search-result-role {
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;

  &.role-user {
    background: color-mix(in srgb, var(--color-primary) 15%, transparent);
    color: var(--color-primary);
  }

  &.role-ai {
    background: color-mix(in srgb, var(--color-success, #4caf50) 15%, transparent);
    color: var(--color-success, #4caf50);
  }

  &.role-system {
    background: color-mix(in srgb, var(--color-text-muted) 15%, transparent);
    color: var(--color-text-muted);
  }
}

.search-result-time {
  font-size: 11px;
}

.search-result-snippet {
  font-size: 13px;
  color: var(--color-text);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  mark {
    background: color-mix(in srgb, var(--color-primary) 30%, transparent);
    color: var(--color-primary);
    border-radius: 2px;
    padding: 0 1px;
    font-weight: 600;
  }
}

.search-result-overflow {
  padding: 8px 16px;
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
  border-top: 1px solid var(--color-border);
}

// 搜索欄動畫
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.2s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}

// 訊息列表
.messages-container {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  position: relative;
  // 透明背景，讓 .chat-screen::before 的桌布可見
  background: transparent;

  &::-webkit-scrollbar {
    width: 0;
    display: none;
  }
}

.messages-list {
  padding: 16px;
  padding-left: calc(16px + var(--safe-left));
  padding-right: calc(16px + var(--safe-right));
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 100%;
  min-width: 0;
}

// 載入更多歷史訊息
.load-more-sentinel {
  display: flex;
  justify-content: center;
  padding: 8px 0;
  min-height: 1px;
}

.load-more-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
}

.load-more-dots {
  display: flex;
  gap: 4px;

  span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-text-secondary, #999);
    opacity: 0.5;
    animation: load-more-bounce 1s infinite ease-in-out;

    &:nth-child(2) {
      animation-delay: 0.15s;
    }
    &:nth-child(3) {
      animation-delay: 0.3s;
    }
  }
}

@keyframes load-more-bounce {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  40% {
    opacity: 1;
    transform: scale(1);
  }
}

.load-more-hint {
  font-size: 12px;
  color: var(--color-text-secondary, #999);
  opacity: 0.6;
}

.message-memo-wrapper {
  display: contents;
}

// 正在輸入提示
.typing-indicator {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

.typing-avatar {
  width: var(--avatar-size, 40px);
  height: var(--avatar-size, 40px);
  border-radius: var(--avatar-border-radius, 50%);
  overflow: hidden;
  background: var(--color-background);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.typing-dots {
  display: flex;
  gap: 4px;
  padding: 16px 20px;
  // 優先使用聊天專屬氣泡樣式
  background: var(--chat-bubble-ai-bg, var(--bubble-ai-bg, white));
  border-radius: var(--chat-bubble-radius, var(--bubble-radius, 20px));
  border-bottom-left-radius: 6px;
  box-shadow: var(--shadow-sm);

  span {
    width: 8px;
    height: 8px;
    background: var(--color-text-muted);
    border-radius: 50%;
    animation: typingBounce 1.4s ease-in-out infinite;

    &:nth-child(2) {
      animation-delay: 0.2s;
    }

    &:nth-child(3) {
      animation-delay: 0.4s;
    }
  }
}

@keyframes typingBounce {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  30% {
    transform: translateY(-8px);
    opacity: 1;
  }
}

// 快捷輸入編輯模態框
.quick-action-editor-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.quick-action-editor {
  background: var(--color-surface, #fff);
  border-radius: 16px;
  width: 100%;
  max-width: 400px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);

  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text, #333);
  }

  .close-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    color: var(--color-text-muted, #999);

    svg {
      width: 20px;
      height: 20px;
    }

    &:hover {
      background: var(--color-background, #f5f5f5);
    }
  }
}

.editor-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.custom-actions-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.custom-action-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--color-background, #f5f5f5);
  border-radius: 8px;

  .action-label {
    font-weight: 500;
    color: var(--color-text, #333);
    min-width: 60px;
  }

  .action-text {
    flex: 1;
    color: var(--color-text-secondary, #666);
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .remove-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    color: var(--color-text-muted, #999);

    svg {
      width: 16px;
      height: 16px;
    }

    &:hover {
      background: rgba(229, 62, 62, 0.1);
      color: var(--color-error, #e53e3e);
    }
  }
}

.empty-hint {
  text-align: center;
  color: var(--color-text-muted, #999);
  font-size: 14px;
  padding: 20px;
}

.add-action-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border, #e2e8f0);
}

.form-row {
  display: flex;
  gap: 8px;
}

.form-input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text, #333);
  background: var(--color-background, #fff);
  outline: none;

  &::placeholder {
    color: var(--color-text-muted, #999);
  }

  &:focus {
    border-color: var(--color-primary, #7dd3a8);
  }
}

.hint-input {
  flex: 2;
}

.add-btn {
  padding: 10px 20px;
  background: var(--color-primary, #7dd3a8);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.editor-footer {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border, #e2e8f0);
  justify-content: flex-end;

  .cancel-btn {
    padding: 10px 24px;
    background: var(--color-background, #f5f5f5);
    border: 1px solid var(--color-border, #e2e8f0);
    border-radius: 20px;
    color: var(--color-text-secondary, #666);
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background: #eee;
    }
  }

  .save-btn {
    padding: 10px 24px;
    background: var(--color-primary, #7dd3a8);
    border: none;
    border-radius: 20px;
    color: white;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      filter: brightness(1.1);
    }
  }
}

// 日期分隔符
.date-separator {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 0;
  margin: 8px 0;
}

.separator-line {
  flex: 1;
  height: 1px;
  background: var(--color-border, #e2e8f0);
}

.separator-text {
  font-size: 12px;
  color: var(--color-text-muted, #999);
  padding: 4px 12px;
  background: var(--color-surface, #fff);
  border-radius: 12px;
}

.system-notification {
  display: flex;
  justify-content: center;
  padding: 8px 0;
  margin: 4px 0;
  cursor: default;

  &.is-selected {
    background: rgba(var(--color-primary-rgb, 76, 175, 80), 0.15);
    border-radius: 8px;
  }
}

.system-notification-text {
  font-size: 12px;
  color: var(--color-text-muted, #999);
  padding: 4px 16px;
  background: rgba(128, 128, 128, 0.1);
  border-radius: 12px;
}

.user-recalled-notification {
  align-items: center;
  gap: 4px;
}

.recall-undo-btn {
  background: none;
  border: none;
  font-size: 11px;
  color: var(--color-primary, #7dd3a8);
  cursor: pointer;
  padding: 2px 6px;
  margin-left: 2px;
  opacity: 0.7;
  transition: opacity 0.15s;

  &:hover {
    opacity: 1;
    text-decoration: underline;
  }
}

.recall-notification-icon {
  width: 14px;
  height: 14px;
  color: var(--color-text-muted, #999);
  flex-shrink: 0;
}

.blocked-msg-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 2px 0;
}

.blocked-badge-icon {
  color: #ff4d4f;
  font-size: 12px;
}

.blocked-badge-text {
  font-size: 11px;
  color: #ff4d4f;
  opacity: 0.8;
}

.message-memo-wrapper {
}

// 編輯模態框
.edit-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.edit-modal {
  background: var(--color-surface, #fff);
  border-radius: 16px;
  width: 100%;
  max-width: 500px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.edit-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);

  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text, #333);
  }

  .close-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    color: var(--color-text-muted, #999);

    svg {
      width: 20px;
      height: 20px;
    }

    &:hover {
      background: var(--color-background, #f5f5f5);
    }
  }
}

.edit-label {
  display: block;
  padding: 10px 20px 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted, #999);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.edit-label-thought {
  color: #9b8ec4;
  border-top: 1px solid var(--color-border, #e2e8f0);
  padding-top: 12px;
}

.edit-textarea {
  width: 100%;
  padding: 16px 20px;
  border: none;
  resize: none;
  font-size: 15px;
  line-height: 1.6;
  color: var(--color-text, #333);
  background: var(--color-background, #f5f5f5);
  outline: none;

  &:focus {
    background: var(--color-surface, #fff);
  }
}

.edit-textarea-thought {
  background: var(--color-surface-hover, #f5f0ff);
  font-style: italic;
  color: var(--color-text-secondary, #6b5b95);

  &:focus {
    background: var(--color-surface, #ede8ff);
  }
}

.edit-modal-actions {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  justify-content: flex-end;
  border-top: 1px solid var(--color-border, #e2e8f0);

  button {
    padding: 10px 24px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .cancel-btn {
    background: var(--color-background, #f5f5f5);
    border: 1px solid var(--color-border, #e2e8f0);
    color: var(--color-text-secondary, #666);

    &:hover {
      background: #eee;
    }
  }

  .save-btn {
    background: linear-gradient(135deg, #a8e6cf, #7dd3a8);
    border: none;
    color: white;

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(125, 211, 168, 0.4);
    }
  }
}

// 下拉動畫
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
}

// 淡入淡出動畫
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

// 表情包面板滑入動畫
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(100%);
}

// 下滑動畫
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}

// 刪除模式工具欄
.delete-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  padding-left: calc(16px + var(--safe-left));
  padding-right: calc(16px + var(--safe-right));
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);

  .cancel-select-btn {
    padding: 8px 16px;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 20px;
    color: var(--color-text-secondary);
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background: var(--color-background);
    }
  }

  .select-count {
    font-size: 14px;
    color: var(--color-text);
    font-weight: 500;
  }

  .delete-selected-btn {
    padding: 8px 20px;
    background: var(--color-error, #e53e3e);
    border: none;
    border-radius: 20px;
    color: white;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;

    &:hover:not(:disabled) {
      background: #c53030;
      transform: scale(1.02);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    &.screenshot-confirm-btn {
      background: var(--color-primary, #667eea);

      &:hover:not(:disabled) {
        background: #5a6fd6;
      }
    }
  }
}

// ===== 功能模態框樣式 =====
.feature-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.feature-modal {
  background: var(--color-surface, #fff);
  border-radius: 20px;
  width: 100%;
  max-width: 400px;
  padding: 24px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);

  &.choice-modal {
    max-width: 340px;
  }
}

.feature-modal-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text, #333);

  .title-icon {
    width: 24px;
    height: 24px;
    color: var(--color-primary, #7dd3a8);
  }
}

.feature-modal-tip {
  margin: 0 0 16px;
  font-size: 14px;
  color: var(--color-text-muted, #999);
}

.force-avatar-preview {
  margin: 0 0 16px;
  border-radius: 12px;
  overflow: hidden;
  border: 2px solid var(--color-border, #e2e8f0);
  background: var(--color-background, #f5f5f5);

  img {
    width: 100%;
    max-height: 200px;
    object-fit: contain;
    display: block;
  }
}

.feature-modal-input {
  width: 100%;
  padding: 14px 16px;
  border: 2px solid var(--color-border, #e2e8f0);
  border-radius: 12px;
  font-size: 15px;
  color: var(--color-text, #333);
  background: var(--color-background, #f5f5f5);
  outline: none;
  transition: all 0.2s;

  &:focus {
    border-color: var(--color-primary, #7dd3a8);
    background: #fff;
  }

  &::placeholder {
    color: var(--color-text-muted, #999);
  }
}

.feature-modal-textarea {
  width: 100%;
  padding: 14px 16px;
  border: 2px solid var(--color-border, #e2e8f0);
  border-radius: 12px;
  font-size: 15px;
  color: var(--color-text, #333);
  background: var(--color-background, #f5f5f5);
  outline: none;
  resize: none;
  transition: all 0.2s;
  font-family: inherit;

  &:focus {
    border-color: var(--color-primary, #7dd3a8);
    background: #fff;
  }

  &::placeholder {
    color: var(--color-text-muted, #999);
  }
}

.feature-modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.modal-btn {
  flex: 1;
  padding: 12px 20px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &.cancel {
    background: var(--color-background, #f5f5f5);
    border: 1px solid var(--color-border, #e2e8f0);
    color: var(--color-text-secondary, #666);

    &:hover {
      background: #eee;
    }
  }

  &.confirm {
    background: var(--color-primary, #7dd3a8);
    border: none;
    color: white;

    &:hover {
      filter: brightness(1.05);
      transform: translateY(-1px);
    }
  }

  &.full-width {
    margin-top: 16px;
  }
}

// 話題選擇按鈕
.choice-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.choice-btn {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 16px;
  background: var(--color-background, #f5f5f5);
  border: 2px solid transparent;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;

  &:hover {
    background: var(--color-primary-light, rgba(125, 211, 168, 0.15));
    border-color: var(--color-primary, #7dd3a8);
  }

  &:active {
    transform: scale(0.98);
  }
}

.choice-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface, #fff);
  border-radius: 12px;
  flex-shrink: 0;

  svg {
    width: 24px;
    height: 24px;
    color: var(--color-primary, #7dd3a8);
  }
}

.choice-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.choice-label {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text, #333);
}

.choice-desc {
  font-size: 13px;
  color: var(--color-text-muted, #999);
}

// ===== 跳轉魔法消息樣式 =====
.timetravel-message {
  display: flex;
  justify-content: center;
  padding: 16px 0;
}

.timetravel-content {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: linear-gradient(
    135deg,
    rgba(125, 211, 168, 0.15),
    rgba(137, 207, 240, 0.15)
  );
  border-radius: 20px;
  border: 1px dashed var(--color-primary, #7dd3a8);

  .timetravel-icon {
    width: 18px;
    height: 18px;
    color: var(--color-primary, #7dd3a8);
  }

  .timetravel-text {
    font-size: 14px;
    color: var(--color-text-secondary, #666);
    font-style: italic;
  }
}

// ===== 小劇場消息樣式 =====
.small-theater-message {
  display: flex;
  justify-content: center;
  padding: 16px 0;
}

.small-theater-content {
  max-width: 85%;
  padding: 16px 20px;
  background: rgba(245, 169, 184, 0.08);
  border-radius: 16px;
  border: 1px solid rgba(245, 169, 184, 0.3);
  text-align: center;

  .small-theater-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    background: rgba(245, 169, 184, 0.2);
    border-radius: 12px;
    font-size: 12px;
    color: #d4849a;
    margin-bottom: 10px;
  }

  .small-theater-text {
    font-size: 14px;
    color: var(--color-text-secondary, #666);
    line-height: 1.6;
  }
}

// ===== 小劇場模態框樣式 =====
.theater-modal {
  max-width: 360px;
  width: 92%;

  .theater-notice {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    background: rgba(137, 207, 240, 0.1);
    border: 1px solid rgba(137, 207, 240, 0.3);
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 13px;
    color: var(--color-text-secondary, #666);
    line-height: 1.5;
    margin-bottom: 16px;

    .notice-icon {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      margin-top: 1px;
      color: #89cff0;
    }
  }

  .theater-warn {
    background: rgba(255, 179, 71, 0.1);
    border-color: rgba(255, 179, 71, 0.3);

    .notice-icon.warn {
      color: #ffb347;
    }
  }

  .theater-choice-btns {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 12px;

    .theater-choice-btn {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.04);
      cursor: pointer;
      text-align: left;
      transition: all 0.2s;

      svg {
        width: 22px;
        height: 22px;
        flex-shrink: 0;
        color: var(--color-primary, #7dd3a8);
      }

      .choice-title {
        display: block;
        font-size: 14px;
        font-weight: 500;
        color: var(--color-text, #333);
      }

      .choice-desc {
        display: block;
        font-size: 12px;
        color: var(--color-text-secondary, #888);
        margin-top: 2px;
      }

      &:hover {
        background: rgba(125, 211, 168, 0.1);
        border-color: rgba(125, 211, 168, 0.3);
      }

      &.no-branch {
        svg {
          color: #ffb347;
        }
        &:hover {
          background: rgba(255, 179, 71, 0.08);
          border-color: rgba(255, 179, 71, 0.3);
        }
      }
    }
  }

  .theater-options {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 16px;

    .theater-option-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
      cursor: pointer;

      &:last-child {
        border-bottom: none;
      }

      .option-info {
        flex: 1;
        margin-right: 12px;

        .option-label {
          display: block;
          font-size: 14px;
          color: var(--color-text, #333);
        }

        .option-hint {
          display: block;
          font-size: 12px;
          color: var(--color-text-secondary, #888);
          margin-top: 2px;
        }
      }

      .toggle-switch {
        width: 40px;
        height: 22px;
        border-radius: 11px;
        // 關閉狀態：用 border token，深淺色模式都能看見
        background: var(--color-border, #d1d5db);
        position: relative;
        flex-shrink: 0;
        transition: background 0.2s;
        cursor: pointer;

        .toggle-thumb {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #fff;
          // 加陰影讓白底時也能看出圓點輪廓
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
          transition: transform 0.2s;
        }

        &.active {
          background: var(--color-primary, #7dd3a8);
          .toggle-thumb {
            transform: translateX(18px);
          }
        }
      }
    }
  }

  .theater-forwarded-preview {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 10px 12px;
    max-height: 200px;
    overflow-y: auto;
    margin-bottom: 16px;

    .forwarded-msg-row {
      padding: 4px 0;
      font-size: 13px;
      color: var(--color-text-secondary, #888);
      line-height: 1.4;

      &.is-user .forwarded-sender {
        color: var(--color-primary, #7dd3a8);
      }

      .forwarded-sender {
        font-weight: 500;
        color: #f5a9b8;
        margin-right: 4px;
      }
    }

    .forwarded-more {
      font-size: 12px;
      color: var(--color-text-secondary, #888);
      text-align: center;
      padding-top: 6px;
    }

    .forwarded-total {
      font-size: 12px;
      color: var(--color-text-secondary, #888);
      text-align: right;
      padding-top: 6px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      margin-top: 4px;
    }
  }
}

// ===== 位置分享模態框樣式 =====
.location-modal-content {
  background: var(--color-surface, #fff);
  border-radius: 16px;
  padding: 20px;
  max-width: 360px;
  width: 100%;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

.location-polaroid {
  background-color: var(--color-surface, #fff);
  padding: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-radius: 8px;
}

.location-map-container {
  width: 100%;
  aspect-ratio: 1;
  background-color: #7dd3fc;
  overflow: hidden;
  position: relative;
  border-radius: 4px;

  .location-block {
    position: absolute;
    background-color: #d1d5db;

    &.block1 {
      top: 12%;
      left: 8%;
      width: 20%;
      height: 16%;
    }
    &.block2 {
      top: 12%;
      right: 12%;
      width: 24%;
      height: 20%;
    }
    &.block3 {
      bottom: 16%;
      left: 12%;
      width: 16%;
      height: 24%;
    }
    &.block4 {
      bottom: 12%;
      right: 8%;
      width: 28%;
      height: 20%;
    }
    &.block5 {
      top: 40%;
      left: 32%;
      width: 20%;
      height: 16%;
    }
  }

  .location-road {
    position: absolute;
    background-color: white;

    &.road-h1 {
      top: 32%;
      left: 0;
      width: 100%;
      height: 2px;
    }
    &.road-h2 {
      top: 56%;
      left: 0;
      width: 100%;
      height: 2px;
    }
    &.road-h3 {
      bottom: 32%;
      left: 0;
      width: 100%;
      height: 2px;
    }
    &.road-v1 {
      top: 0;
      left: 28%;
      width: 2px;
      height: 100%;
    }
    &.road-v2 {
      top: 0;
      left: 48%;
      width: 2px;
      height: 100%;
    }
    &.road-v3 {
      top: 0;
      right: 20%;
      width: 2px;
      height: 100%;
    }
  }

  .location-park {
    position: absolute;
    top: 36%;
    right: 24%;
    width: 16%;
    height: 16%;
    background-color: #86efac;
    border-radius: 50%;
  }

  .location-marker {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);

    .marker-pin {
      width: 24px;
      height: 24px;
      background-color: #ef4444;
      border-radius: 50%;
      border: 4px solid white;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }

    .marker-stick {
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      width: 3px;
      height: 12px;
      background-color: #ef4444;
    }
  }
}

.location-caption {
  margin-top: 12px;

  input {
    width: 100%;
    text-align: center;
    color: var(--color-text, #4b5563);
    background-color: transparent;
    border: none;
    outline: none;
    padding: 8px;
    border-radius: 8px;
    font-size: 14px;

    &:focus {
      background-color: var(--color-background, #f9fafb);
    }

    &::placeholder {
      color: var(--color-text-muted, #9ca3af);
    }
  }
}

.location-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

// ===== 天氣與位置面板樣式（重新設計：堆疊 row + bottom sheet） =====
.wm-panel {
  position: relative; // 讓 .wm-city-sheet 能 absolute 蓋滿
  display: flex;
  flex-direction: column;
  max-height: 85vh;
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 32px;
  padding: 0;
  width: 90%;
  max-width: 380px;
  box-shadow:
    0 32px 64px rgba(0, 0, 0, 0.15),
    0 0 0 1px rgba(255, 255, 255, 0.3) inset;
  overflow: hidden;
  animation: wm-pop 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.wm-body {
  overflow-y: auto;
  overflow-x: hidden;
  flex: 1 1 auto;
  padding: 4px 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

@keyframes wm-pop {
  0% {
    transform: scale(0.95) translateY(10px);
    opacity: 0;
  }
  100% {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}

.wm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 8px;
  flex-shrink: 0;

  .wm-title {
    font-size: 18px;
    font-weight: 800;
    color: var(--color-text, #1a1a1a);
    letter-spacing: -0.02em;
    display: flex;
    align-items: center;
    gap: 8px;

    .wm-title__icon {
      color: var(--color-text-secondary, #666);
    }
  }
}

.wm-header__actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.wm-icon-btn {
  background: rgba(0, 0, 0, 0.05);
  border: none;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary, #666);
  cursor: pointer;
  border-radius: 50%;
  transition: background 0.2s ease, transform 0.2s ease;

  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.1);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.is-spinning svg {
    animation: spin 1s linear infinite;
  }
}

// ===== 堆疊式雙列卡片 =====
.wm-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wm-row {
  all: unset;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 14px;
  border-radius: 18px;
  cursor: pointer;
  text-align: left;
  border: 1.5px solid transparent;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.15s ease;

  &--user {
    background: linear-gradient(135deg, #f0f9ff 0%, #ffffff 100%);
    border-color: rgba(186, 230, 253, 0.5);
    color: #1e3a8a;

    .wm-row__icon { color: #3b82f6; }
  }

  &--char {
    background: linear-gradient(135deg, #fdf2f8 0%, #ffffff 100%);
    border-color: rgba(251, 207, 232, 0.5);
    color: #831843;

    .wm-row__icon { color: #ec4899; }
  }

  &:hover {
    border-color: var(--color-primary, #7dd3a8);
    transform: translateY(-1px);

    .wm-row__chevron {
      opacity: 1;
      transform: translateX(2px);
    }
  }
}

.wm-row__icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.7);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
}

.wm-row__avatar {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  object-fit: cover;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}

.wm-row__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wm-row__title {
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;

  &--empty {
    opacity: 0.7;
  }
}

.wm-row__loc {
  font-weight: 700;
}

.wm-row__time {
  font-size: 12px;
  opacity: 0.7;
  font-weight: 600;
}

.wm-row__ip-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.08);
  opacity: 0.8;
  margin-left: 4px;
}

.wm-row__sub {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.85;

  b {
    font-size: 16px;
    font-weight: 800;
    margin-right: 4px;
  }

  &--cta {
    color: var(--color-primary, #5b8def);
    opacity: 1;
  }
}

.wm-row__chevron {
  flex-shrink: 0;
  opacity: 0.4;
  transition: opacity 0.2s ease, transform 0.2s ease;
}

// ===== 時差摘要 =====
.wm-timediff {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-primary, #5b8def) 8%, transparent);
  color: var(--color-text-secondary, #555);
  font-size: 12px;
  font-weight: 600;
}

// ===== 共用 section =====
.wm-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wm-section__label {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary, #888);
}

// ===== 對象選擇 chip =====
.wm-target-chips {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.wm-chip {
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
  background: rgba(255, 255, 255, 0.72);
  color: var(--color-text-secondary, #666);
  border-radius: 12px;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;

  &.is-active {
    color: var(--color-primary, #5b8def);
    border-color: color-mix(in srgb, var(--color-primary, #5b8def) 50%, transparent);
    background: color-mix(in srgb, var(--color-primary, #5b8def) 10%, white);
  }

  &.is-disabled,
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

// ===== 預覽 =====
.wm-preview-wrap {
  gap: 6px;
}

.wm-preview-toggle {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary, #666);
  padding: 4px 0;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    color: var(--color-primary, #5b8def);
  }
}

.wm-preview {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.04);
  font-family: ui-monospace, "SFMono-Regular", "Menlo", "Consolas", monospace;
  font-size: 11px;
  line-height: 1.55;
  color: var(--color-text-secondary, #444);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 180px;
  overflow-y: auto;
}

// ===== keep-in-this-chat toggle =====
.wm-keep-toggle {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.03);
  cursor: pointer;

  input[type="checkbox"] {
    margin-top: 2px;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    accent-color: var(--color-primary, #5b8def);
    cursor: pointer;
  }
}

.wm-keep-toggle__main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.wm-keep-toggle__title {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text, #222);
}

.wm-keep-toggle__hint {
  font-size: 11px;
  color: var(--color-text-secondary, #777);
  line-height: 1.4;
}

// ===== 底部按鈕 =====
.wm-footer {
  display: flex;
  gap: 12px;
  padding: 14px 20px 18px;
  flex-shrink: 0;
  background: linear-gradient(to top, rgba(255, 255, 255, 0.9) 80%, transparent);

  .wm-footer__btn {
    flex: 1;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

// ===== 城市選擇 bottom sheet（覆蓋於 .wm-panel 內） =====
.wm-city-sheet {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  z-index: 2;
  border-radius: inherit;
}

.wm-city-sheet__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 16px 10px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.wm-city-sheet__title {
  flex: 1;
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text, #1a1a1a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wm-city-sheet__clear {
  background: transparent;
  border: none;
  color: var(--color-text-secondary, #666);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;

  &:hover {
    color: var(--color-primary, #5b8def);
    background: rgba(0, 0, 0, 0.04);
  }
}

.wm-city-sheet__body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.wm-city-sheet__search {
  display: flex;
  align-items: center;
  gap: 8px;

  &.is-disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.04);
  color: var(--color-text-secondary, #666);
}

.wm-city-sheet__search-input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 14px;
  color: var(--color-text, #222);

  &::placeholder {
    color: var(--color-text-secondary, #999);
  }
}

.wm-city-sheet__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wm-city-sheet__section-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary, #888);
  display: flex;
  align-items: center;
  gap: 6px;
}

.wm-city-sheet__tag {
  font-size: 10px;
}

.wm-city-sheet__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wm-city-sheet__item {
  all: unset;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  color: var(--color-text, #333);
  transition: background 0.2s ease;

  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }
}

.wm-city-sheet__item-name {
  font-weight: 600;
  flex: 1;
  min-width: 0;
}

.wm-city-sheet__item-region {
  font-weight: 500;
  opacity: 0.8;
}

.wm-city-sheet__item-country {
  font-size: 11px;
  opacity: 0.6;
  font-weight: 600;
}

.wm-city-sheet__city-country {
  font-size: 11px;
  opacity: 0.6;
  font-weight: 500;
  margin-left: 2px;
}

.wm-city-sheet__chip-missing {
  font-size: 10px;
  margin-left: 4px;
  opacity: 0.65;
  color: var(--color-warning, #d97706);
}

.wm-city-sheet__empty {
  padding: 20px 0;
  text-align: center;
  font-size: 13px;
  color: var(--color-text-secondary, #999);
}

.wm-city-sheet__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.wm-city-sheet__chip {
  font-size: 12px;
}

.wm-city-sheet__select {
  width: 100%;
}

.wm-city-sheet__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
  padding: 4px 0;
}

.wm-city-sheet__city {
  font-size: 12px;
}

// sheet 動畫
.wm-sheet-enter-active,
.wm-sheet-leave-active {
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
}
.wm-sheet-enter-from,
.wm-sheet-leave-to {
  transform: translateY(20px);
  opacity: 0;
}

// ===== 夜晚模式覆蓋（天氣與位置面板） =====
// body.is-night-mode 由 theme store 同步切換；保持 SCSS 巢狀讓 Vue scoped
// 自動把 data-v 附在內層 .wm-* 上，不會誤傷其他元件。
body.is-night-mode {
  .wm-panel {
    background: rgba(28, 32, 50, 0.85);
    color: var(--color-text, #eaeaea);
  }

  .wm-icon-btn {
    background: rgba(255, 255, 255, 0.06);
    color: var(--color-text-secondary, #b0b0c0);

    &:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.12);
    }
  }

  .wm-row {
    &--user {
      background: linear-gradient(135deg, #1e2a4a 0%, #16213e 100%);
      border-color: rgba(96, 140, 200, 0.25);
      color: #cfe0ff;

      .wm-row__icon {
        color: #7aa9ff;
        background: rgba(255, 255, 255, 0.06);
      }
    }

    &--char {
      background: linear-gradient(135deg, #3a1d2e 0%, #2a1626 100%);
      border-color: rgba(220, 130, 170, 0.25);
      color: #ffd1e3;

      .wm-row__icon {
        color: #ec99c0;
        background: rgba(255, 255, 255, 0.06);
      }
    }

    &:hover {
      border-color: var(--color-primary, #7dd3a8);
    }
  }

  .wm-row__avatar {
    background: rgba(255, 255, 255, 0.06);
  }

  .wm-row__ip-badge {
    background: rgba(255, 255, 255, 0.12);
  }

  .wm-row__sub--cta {
    color: var(--color-primary, #7dd3a8);
  }

  .wm-timediff {
    background: color-mix(in srgb, var(--color-primary, #7dd3a8) 14%, transparent);
    color: var(--color-text-secondary, #b0b0c0);
  }

  .wm-section__label {
    color: var(--color-text-secondary, #a0a0b8);
  }

  .wm-chip {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.08);
    color: var(--color-text-secondary, #b0b0c0);

    &.is-active {
      border-color: color-mix(in srgb, var(--color-primary, #7dd3a8) 60%, transparent);
      background: color-mix(in srgb, var(--color-primary, #7dd3a8) 18%, transparent);
      color: var(--color-text, #eaeaea);
    }
  }

  .wm-preview-toggle {
    color: var(--color-text-secondary, #b0b0c0);
  }

  .wm-preview {
    background: rgba(255, 255, 255, 0.04);
    color: var(--color-text-secondary, #c0c0d0);
  }

  .wm-keep-toggle {
    background: rgba(255, 255, 255, 0.04);
  }

  .wm-keep-toggle__title {
    color: var(--color-text, #eaeaea);
  }

  .wm-keep-toggle__hint {
    color: var(--color-text-secondary, #a0a0b8);
  }

  .wm-footer {
    background: linear-gradient(to top, rgba(22, 33, 62, 0.9) 80%, transparent);
  }

  .wm-city-sheet {
    background: rgba(22, 28, 48, 0.96);
  }

  .wm-city-sheet__header {
    border-bottom-color: rgba(255, 255, 255, 0.06);
  }

  .wm-city-sheet__title {
    color: var(--color-text, #eaeaea);
  }

  .wm-city-sheet__clear {
    color: var(--color-text-secondary, #b0b0c0);

    &:hover {
      background: rgba(255, 255, 255, 0.06);
    }
  }

  .wm-city-sheet__search {
    background: rgba(255, 255, 255, 0.05);
    color: var(--color-text-secondary, #b0b0c0);
  }

  .wm-city-sheet__search-input {
    color: var(--color-text, #eaeaea);

    &::placeholder {
      color: var(--color-text-secondary, #707080);
    }
  }

  .wm-city-sheet__section-title {
    color: var(--color-text-secondary, #a0a0b8);
  }

  .wm-city-sheet__item {
    color: var(--color-text, #d8d8e8);

    &:hover {
      background: rgba(255, 255, 255, 0.05);
    }
  }

  .wm-city-sheet__empty {
    color: var(--color-text-secondary, #808090);
  }

  // ===== PrimeVue 元件夜間覆蓋（穿透 scoped） =====
  // PvButton：.wm-city-sheet__chip / .wm-city-sheet__city / .wm-target chip
  :deep(.p-button.wm-city-sheet__chip),
  :deep(.p-button.wm-city-sheet__city) {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.1);
    color: var(--color-text, #eaeaea);

    &:not(:disabled):hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: color-mix(
        in srgb,
        var(--color-primary, #7dd3a8) 50%,
        transparent
      );
      color: var(--color-text, #eaeaea);
    }

    &:disabled {
      background: rgba(255, 255, 255, 0.03);
      color: var(--color-text-secondary, #707080);
    }
  }

  // PvSelect：.wm-city-sheet__select
  :deep(.p-select.wm-city-sheet__select) {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.12);
    color: var(--color-text, #eaeaea);

    .p-select-label {
      color: var(--color-text, #eaeaea);
    }

    .p-select-label.p-placeholder {
      color: var(--color-text-secondary, #808090);
    }

    .p-select-dropdown {
      color: var(--color-text-secondary, #b0b0c0);
    }

    &:not(.p-disabled):hover {
      border-color: color-mix(
        in srgb,
        var(--color-primary, #7dd3a8) 60%,
        transparent
      );
    }

    &.p-focus,
    &:not(.p-disabled).p-focus {
      border-color: var(--color-primary, #7dd3a8);
      box-shadow: 0 0 0 2px
        color-mix(in srgb, var(--color-primary, #7dd3a8) 30%, transparent);
    }
  }
}

// PvSelect 的 overlay 是 Teleport 到 body 的，無法被 scoped data-v 命中，
// 必須走全域 selector。用 :global 包起來避免被 scoped 機制改寫。
:global(body.is-night-mode .p-select-overlay) {
  background: rgba(22, 28, 48, 0.98);
  border-color: rgba(255, 255, 255, 0.1);
  color: var(--color-text, #eaeaea);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
}

:global(body.is-night-mode .p-select-overlay .p-select-list-container) {
  background: transparent;
}

:global(body.is-night-mode .p-select-option) {
  color: var(--color-text, #d8d8e8);

  &:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  &.p-select-option-selected {
    background: color-mix(in srgb, var(--color-primary, #7dd3a8) 22%, transparent);
    color: var(--color-text, #eaeaea);
  }
}

:global(body.is-night-mode .p-select-filter) {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
  color: var(--color-text, #eaeaea);

  &::placeholder {
    color: var(--color-text-secondary, #707080);
  }
}

// ===== 群聊設定彈窗 =====
.group-settings-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2100;
  padding: 20px;
}

.group-settings-modal {
  background: var(--color-surface, #fff);
  border-radius: 16px;
  width: 100%;
  max-width: 420px;
  max-height: 85vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-border, rgba(0, 0, 0, 0.1));

    h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--color-text, #333);
    }

    .close-btn {
      width: 32px;
      height: 32px;
      border: none;
      background: transparent;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-secondary, #666);

      &:hover {
        background: var(--color-hover, rgba(0, 0, 0, 0.05));
      }

      svg {
        width: 20px;
        height: 20px;
      }
    }
  }

  .modal-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
  }

  .modal-footer {
    display: flex;
    gap: 12px;
    padding: 16px 20px;
    border-top: 1px solid var(--color-border, rgba(0, 0, 0, 0.1));

    .btn-cancel,
    .btn-confirm {
      flex: 1;
      padding: 12px;
      border: none;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-cancel {
      background: var(--color-background, #f5f5f5);
      color: var(--color-text-secondary, #666);

      &:hover {
        background: var(--color-border, #e0e0e0);
      }
    }

    .btn-confirm {
      background: var(--color-primary, #7dd3a8);
      color: #fff;

      &:hover {
        filter: brightness(1.1);
      }
    }
  }

  .form-group {
    margin-bottom: 20px;

    label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--color-text-secondary, #666);
      margin-bottom: 8px;
    }
  }

  .form-input {
    width: 100%;
    padding: 12px;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 10px;
    font-size: 14px;
    background: var(--color-background, #f9f9f9);
    color: var(--color-text, #333);

    &:focus {
      outline: none;
      border-color: var(--color-primary, #7dd3a8);
    }
  }

  .group-avatar-editor {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .group-avatar-preview {
    width: 64px;
    height: 64px;
    border-radius: 16px;
    overflow: hidden;
    background: var(--color-background, #f5f5f5);
    cursor: pointer;
    transition: transform 0.2s;

    &:hover {
      transform: scale(1.05);
    }

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .avatar-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-secondary, #999);

      svg {
        width: 32px;
        height: 32px;
      }
    }
  }

  .remove-avatar-btn {
    padding: 8px 16px;
    border: none;
    border-radius: 8px;
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    font-size: 13px;
    cursor: pointer;

    &:hover {
      background: rgba(239, 68, 68, 0.2);
    }
  }

  .members-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 200px;
    overflow-y: auto;
  }

  .member-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--color-background, #f5f5f5);
    border-radius: 10px;
  }

  .member-avatar {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    overflow: hidden;
    flex-shrink: 0;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .avatar-placeholder.small {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-surface, #fff);
      color: var(--color-text-secondary, #999);

      svg {
        width: 18px;
        height: 18px;
      }
    }
  }

  .member-info {
    flex: 1;
    min-width: 0;

    .member-name {
      font-size: 14px;
      font-weight: 500;
      color: var(--color-text, #333);
    }

    .member-badges {
      display: flex;
      gap: 4px;
      margin-top: 2px;

      .badge {
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 4px;

        &.admin {
          background: rgba(125, 211, 168, 0.2);
          color: var(--color-primary, #7dd3a8);
        }

        &.muted {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }
      }
    }
  }

  .member-actions {
    display: flex;
    gap: 4px;

    .action-btn {
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 6px;
      background: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-secondary, #999);
      transition: all 0.2s;

      svg {
        width: 14px;
        height: 14px;
      }

      &:hover {
        background: var(--color-surface, #fff);
      }

      &.active {
        background: var(--color-primary-light, rgba(125, 211, 168, 0.2));
        color: var(--color-primary, #7dd3a8);
      }

      &.delete:hover {
        background: rgba(239, 68, 68, 0.1);
        color: #ef4444;
      }
    }
  }

  .add-member-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 150px;
    overflow-y: auto;
  }

  .add-member-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: var(--color-background, #f5f5f5);
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.2s;

    &:hover {
      background: var(--color-primary-light, rgba(125, 211, 168, 0.15));
    }

    .member-name {
      flex: 1;
      font-size: 14px;
      color: var(--color-text, #333);
    }

    .add-icon {
      width: 18px;
      height: 18px;
      color: var(--color-primary, #7dd3a8);
    }
  }

  .empty-hint {
    font-size: 13px;
    color: var(--color-text-secondary, #999);
    padding: 12px;
    text-align: center;
  }

  // 多人卡子角色管理
  .multi-char-form {
    margin-top: 10px;
    padding: 12px;
    background: var(--color-background, #f5f5f5);
    border-radius: 10px;

    .multi-char-avatar-row {
      display: flex;
      align-items: center;
      gap: 10px;

      .member-avatar.clickable {
        cursor: pointer;
        flex-shrink: 0;

        &:hover {
          opacity: 0.8;
        }
      }

      .form-input {
        flex: 1;
      }
    }

    .multi-char-form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 10px;

      .btn-cancel.small,
      .btn-confirm.small {
        padding: 5px 14px;
        font-size: 13px;
        border-radius: 8px;
        border: none;
        cursor: pointer;
      }

      .btn-cancel.small {
        background: var(--color-background, #eee);
        color: var(--color-text, #333);
      }

      .btn-confirm.small {
        background: var(--color-primary, #7dd3a8);
        color: #fff;

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }
    }
  }

  .add-multi-char-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    margin-top: 10px;
    padding: 10px;
    background: var(--color-background, #f5f5f5);
    border: 1px dashed var(--color-primary, #7dd3a8);
    border-radius: 10px;
    color: var(--color-primary, #7dd3a8);
    font-size: 14px;
    cursor: pointer;
    transition: background 0.2s;

    &:hover {
      background: var(--color-primary-light, rgba(125, 211, 168, 0.1));
    }

    svg {
      width: 18px;
      height: 18px;
    }
  }

  .lorebook-bind-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 200px;
    overflow-y: auto;
  }

  .lorebook-bind-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--color-background, #f5f5f5);
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.2s;

    &:hover {
      background: var(--color-primary-light, rgba(125, 211, 168, 0.15));
    }

    &.active {
      background: var(--color-primary-light, rgba(125, 211, 168, 0.15));
      border: 1px solid var(--color-primary, #7dd3a8);
    }

    .lorebook-check {
      width: 20px;
      height: 20px;
      border: 2px solid var(--color-border, #ddd);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;

      svg {
        width: 16px;
        height: 16px;
        color: var(--color-primary, #7dd3a8);
      }
    }

    &.active .lorebook-check {
      border-color: var(--color-primary, #7dd3a8);
      background: var(--color-primary, #7dd3a8);

      svg {
        color: #fff;
      }
    }

    .lorebook-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;

      .lorebook-name {
        font-size: 14px;
        font-weight: 500;
        color: var(--color-text, #333);
      }

      .lorebook-count {
        font-size: 12px;
        color: var(--color-text-secondary, #999);
      }
    }
  }
}

// fade 過渡
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

// ===== 聊天檔案面板 =====
.chat-files-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
}

.chat-files-panel {
  width: 100%;
  max-height: 70vh;
  background: var(--color-surface, #fff);
  border-radius: 16px 16px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-files-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
  flex-shrink: 0;
}

.chat-files-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, #333);
}

.chat-files-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-files-action-btn {
  padding: 5px 12px;
  border-radius: 16px;
  border: 1px solid var(--color-border, rgba(0,0,0,0.15));
  background: transparent;
  color: var(--color-text, #333);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: var(--color-hover, rgba(0,0,0,0.06));
  }

  &.danger {
    color: #e53935;
    border-color: rgba(229, 57, 53, 0.3);

    &:hover:not(:disabled) {
      background: rgba(229, 57, 53, 0.08);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }
}

.chat-files-new-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 20px;
  background: var(--color-primary, #7dd3a8);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  border: none;
  cursor: pointer;
}

/* ── 分類標題 ── */
.chat-category-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px 4px;
  cursor: pointer;
  user-select: none;

  &:hover {
    background: var(--color-hover, rgba(0,0,0,0.03));
  }
}

.chat-category-arrow {
  color: var(--color-text-secondary, #999);
  transition: transform 0.2s;
  flex-shrink: 0;

  &.collapsed {
    transform: rotate(-90deg);
  }
}

.chat-category-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary, #999);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex: 1;
}

.chat-category-count {
  font-size: 11px;
  color: var(--color-text-secondary, #bbb);
  background: var(--color-hover, rgba(0,0,0,0.06));
  border-radius: 10px;
  padding: 1px 7px;
}

.chat-category-select-all {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--color-text-secondary, #999);
  cursor: pointer;
  margin-left: 4px;

  input[type="checkbox"] {
    cursor: pointer;
  }
}

.chat-files-list {
  overflow-y: auto;
  flex: 1;
  padding: 8px 0;
}

.chat-file-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  gap: 8px;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: var(--color-hover, rgba(0, 0, 0, 0.04));
  }

  &.active {
    background: var(--color-primary-light, rgba(125, 211, 168, 0.12));

    .chat-file-name {
      color: var(--color-primary, #7dd3a8);
      font-weight: 600;
    }
  }

  &.select-mode {
    padding-left: 12px;
  }

  &.selected {
    background: rgba(125, 211, 168, 0.15);
  }
}

.chat-file-checkbox {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  cursor: pointer;

  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: var(--color-primary, #7dd3a8);
  }
}

.chat-file-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.chat-file-name {
  font-size: 14px;
  color: var(--color-text, #333);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-file-meta {
  font-size: 12px;
  color: var(--color-text-secondary, #999);
}

.chat-file-rename-input {
  width: 100%;
  font-size: 14px;
  padding: 4px 8px;
  border: 1px solid var(--color-primary, #7dd3a8);
  border-radius: 6px;
  background: var(--color-surface, #fff);
  color: var(--color-text, #333);
  outline: none;
}

.chat-file-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.chat-file-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary, #999);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background 0.15s,
    color 0.15s;

  &:hover {
    background: var(--color-hover, rgba(0, 0, 0, 0.06));
    color: var(--color-text, #333);
  }

  &.danger:hover {
    background: rgba(229, 62, 62, 0.1);
    color: #e53e3e;
  }

  &.pinned {
    color: var(--color-primary, #7dd3a8);
  }
}

// 新建聊天確認彈窗
.new-chat-confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1010;
  padding: 20px;
}

.new-chat-confirm-modal {
  background: var(--color-surface, #fff);
  border-radius: 16px;
  padding: 24px;
  width: min(360px, 90vw);
  display: flex;
  flex-direction: column;
  gap: 12px;

  h3 {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text, #333);
    margin: 0;
  }

  p {
    font-size: 14px;
    color: var(--color-text-secondary, #666);
    margin: 0;
  }

  .branch-memory-option {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--color-text, #333);
    cursor: pointer;

    input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: var(--color-primary, #7dd3a8);
      cursor: pointer;
    }
  }

  .branch-affinity-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
    border-radius: 10px;
    background: var(--color-surface-hover, rgba(0, 0, 0, 0.02));
  }

  .branch-affinity-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text, #333);
  }

  .branch-affinity-option {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    cursor: pointer;
    padding: 4px 0;

    input[type="radio"] {
      width: 16px;
      height: 16px;
      margin-top: 2px;
      accent-color: var(--color-primary, #7dd3a8);
      cursor: pointer;
      flex-shrink: 0;
    }
  }

  .branch-affinity-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }

  .branch-affinity-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text, #333);
  }

  .branch-affinity-desc {
    font-size: 11px;
    color: var(--color-text-secondary, #888);
    line-height: 1.4;
  }

  .branch-affinity-greeting-select {
    width: 100%;
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid var(--color-border, rgba(0, 0, 0, 0.15));
    background: var(--color-surface, #fff);
    font-size: 13px;
    color: var(--color-text, #333);
    cursor: pointer;
    margin-top: 2px;
  }
}

// 開場白選擇列表
.greeting-select-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;

  .greeting-select-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text, #333);
    margin-bottom: 2px;
  }
}

.greeting-option {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.1));
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: var(--color-surface-hover, rgba(0, 0, 0, 0.03));
  }

  &.selected {
    border-color: var(--color-primary, #7dd3a8);
    background: var(--color-primary-light, rgba(125, 211, 168, 0.08));
  }
}

.greeting-radio {
  width: 16px;
  height: 16px;
  min-width: 16px;
  border-radius: 50%;
  border: 2px solid var(--color-border, rgba(0, 0, 0, 0.2));
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;

  .selected & {
    border-color: var(--color-primary, #7dd3a8);
  }
}

.greeting-radio-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-primary, #7dd3a8);
}

.greeting-option-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.greeting-option-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text, #333);
}

.greeting-option-preview {
  font-size: 11px;
  color: var(--color-text-secondary, #999);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.new-chat-confirm-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  flex-wrap: wrap;
  margin-top: 4px;

  .btn-cancel {
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid var(--color-border, rgba(0, 0, 0, 0.12));
    background: transparent;
    color: var(--color-text-secondary, #666);
    font-size: 13px;
    cursor: pointer;
  }

  .btn-secondary {
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid var(--color-primary, #7dd3a8);
    background: transparent;
    color: var(--color-primary, #7dd3a8);
    font-size: 13px;
    cursor: pointer;
  }

  .btn-confirm {
    padding: 8px 14px;
    border-radius: 8px;
    border: none;
    background: var(--color-primary, #7dd3a8);
    color: #fff;
    font-size: 13px;
    cursor: pointer;
  }
}

// slide-up transition
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.25s ease;

  .chat-files-panel {
    transition: transform 0.25s ease;
  }
}

.slide-up-enter-from,
.slide-up-leave-to {
  .chat-files-panel {
    transform: translateY(100%);
  }
}
</style>

<style lang="scss" scoped>
/* NovelAI 設定 Modal 樣式 */
.novelai-settings-modal {
  background: var(--color-surface, #fff);
  border-radius: 16px;
  width: 100%;
  max-width: 480px;
  max-height: 85vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-border, #e2e8f0);

    h3 {
      margin: 0;
      font-size: 17px;
      font-weight: 600;
      color: var(--color-text, #333);
      display: flex;
      align-items: center;
      gap: 8px;

      .title-icon {
        width: 22px;
        height: 22px;
        color: var(--color-primary, #7dd3a8);
      }
    }

    .close-btn {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      color: var(--color-text-muted, #999);

      svg {
        width: 20px;
        height: 20px;
      }

      &:hover {
        background: var(--color-background, #f5f5f5);
      }
    }
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .setting-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid var(--color-border, #e2e8f0);
  }

  .setting-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .setting-label {
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text, #333);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .setting-hint {
    font-size: 12px;
    color: var(--color-text-secondary, #999);
    font-weight: 400;
  }

  .setting-input.masked {
    -webkit-text-security: disc;
  }

  .setting-input,
  .setting-select {
    padding: 10px 12px;
    border: 1px solid var(--color-border, #e2e8f0);
    border-radius: 8px;
    font-size: 14px;
    background: var(--color-background, #f8f9fa);
    color: var(--color-text, #333);
    outline: none;
    transition: border-color 0.2s;

    &:focus {
      border-color: var(--color-primary, #7dd3a8);
    }
  }

  .setting-textarea {
    padding: 10px 12px;
    border: 1px solid var(--color-border, #e2e8f0);
    border-radius: 8px;
    font-size: 13px;
    background: var(--color-background, #f8f9fa);
    color: var(--color-text, #333);
    outline: none;
    resize: vertical;
    min-height: 60px;
    font-family: inherit;

    &:focus {
      border-color: var(--color-primary, #7dd3a8);
    }
  }

  .setting-range {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: var(--color-border, #e2e8f0);
    outline: none;
    -webkit-appearance: none;

    &::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--color-primary, #7dd3a8);
      cursor: pointer;
    }
  }

  .setting-divider {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-muted, #aaa);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 4px 0 2px;
    border-bottom: 1px solid var(--color-border, #e2e8f0);
  }

  .size-presets {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .size-preset-btn {
    padding: 8px 12px;
    border: 1px solid var(--color-border, #e2e8f0);
    border-radius: 8px;
    font-size: 12px;
    background: var(--color-background, #f8f9fa);
    color: var(--color-text-secondary, #666);
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      border-color: var(--color-primary, #7dd3a8);
    }

    &.active {
      background: var(--color-primary, #7dd3a8);
      border-color: var(--color-primary, #7dd3a8);
      color: #fff;
    }
  }

  .toggle-switch {
    position: relative;
    width: 44px;
    height: 24px;

    input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .toggle-slider {
      position: absolute;
      cursor: pointer;
      inset: 0;
      background: var(--color-border, #ccc);
      border-radius: 24px;
      transition: 0.3s;

      &::before {
        content: "";
        position: absolute;
        height: 18px;
        width: 18px;
        left: 3px;
        bottom: 3px;
        background: white;
        border-radius: 50%;
        transition: 0.3s;
      }
    }

    input:checked + .toggle-slider {
      background: var(--color-primary, #7dd3a8);
    }

    input:checked + .toggle-slider::before {
      transform: translateX(20px);
    }
  }

  .modal-footer {
    display: flex;
    gap: 12px;
    padding: 16px 20px;
    justify-content: flex-end;
    border-top: 1px solid var(--color-border, #e2e8f0);

    &.nai-footer {
      justify-content: space-between;
      align-items: center;
    }

    .footer-left {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .footer-right {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .btn-icon-text {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      border-radius: 16px;
      border: 1px solid var(--color-border, #e2e8f0);
      background: var(--color-background, #f8f9fa);
      color: var(--color-text-secondary, #666);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;

      svg {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
      }

      &:hover {
        border-color: var(--color-primary, #7dd3a8);
        color: var(--color-primary, #7dd3a8);
      }

      &:active {
        transform: scale(0.96);
      }
    }

    .btn-cancel,
    .btn-confirm {
      padding: 10px 24px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-cancel {
      background: var(--color-background, #f5f5f5);
      border: 1px solid var(--color-border, #e2e8f0);
      color: var(--color-text-secondary, #666);

      &:hover {
        background: #eee;
      }
    }

    .btn-confirm {
      background: var(--color-primary, #7dd3a8);
      border: none;
      color: white;

      &:hover {
        filter: brightness(1.05);
        transform: translateY(-1px);
      }
    }
  }
}

// ===== 平板適配（iPad / Android Tablet） =====
@media (min-width: 768px) {
  // 輸入區在寬螢幕上增加觸控區域和間距
  .input-area {
    padding: 12px 24px;
    padding-bottom: calc(12px + var(--safe-bottom));
    padding-left: calc(24px + var(--safe-left));
    padding-right: calc(24px + var(--safe-right));
  }

  .input-container {
    gap: 12px;
  }

  // 發送按鈕在平板上加大觸控區域
  .send-btn {
    width: 44px;
    height: 44px;
    min-width: 44px;
    min-height: 44px;

    svg {
      width: 24px;
      height: 24px;
    }
  }

  // 所有輸入區按鈕加大觸控區域（符合 Apple HIG 44pt 最小觸控目標）
  .input-btn {
    width: 44px;
    height: 44px;
    min-width: 44px;
    min-height: 44px;

    svg {
      width: 24px;
      height: 24px;
    }
  }

  // 輸入框加大
  .message-input {
    min-height: 44px;
    font-size: 16px; // 防止 iOS Safari 自動縮放
    padding: 11px 68px 11px 18px;
  }

  // 表情按鈕位置微調
  .emoji-btn-inner {
    width: 32px;
    height: 32px;
    right: 10px;
  }

  .expand-btn-inner {
    right: 42px;
    width: 32px;
    height: 32px;
  }

  // 更多功能面板在平板上可以顯示更多列
  .features-grid {
    grid-template-columns: repeat(5, 1fr);
  }

}

// ===== 封鎖系統樣式 =====

.friend-request-btn {
  padding: 10px 24px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }
}

.friend-request-dialog {
  background: var(--bg-primary, #fff);
  border-radius: 16px;
  padding: 20px;
  width: 320px;
  max-width: 90vw;
}

.block-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
}

.block-cancel-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: transparent;
  cursor: pointer;
}

.block-submit-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  background: var(--primary-color, #4a90e2);
  color: white;
  cursor: pointer;
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
