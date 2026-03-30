<script setup lang="ts">
import {
  AVAILABLE_SAMPLERS as novelAISamplers,
  PRESET_SIZES as novelAISizePresets,
} from "@/api/NovelAIImageApi";
import {
  createImageMessage,
  OpenAICompatibleClient,
} from "@/api/OpenAICompatible";
import { MessageBubble } from "@/components/common";
import GiftDrawer from "@/components/common/GiftDrawer.vue";
import MediaSendDrawer from "@/components/common/MediaSendDrawer.vue";
import StickerPanel from "@/components/common/StickerPanel.vue";
import AISummaryPanel from "@/components/modals/AISummaryPanel.vue";
import AffinityPanel from "@/components/modals/AffinityPanel.vue";
import ChatInfoModal from "@/components/modals/ChatInfoModal.vue";
import DiaryViewModal from "@/components/modals/DiaryViewModal.vue";
import DishWashingGame from "@/components/modals/DishWashingGame.vue";
import FishingGame from "@/components/modals/FishingGame.vue";
import GamblingGame from "@/components/modals/GamblingGame.vue";
import GameScorePickerModal from "@/components/modals/GameScorePickerModal.vue";
import GroupCallModal from "@/components/modals/GroupCallModal.vue";
import IncomingCallModal from "@/components/modals/IncomingCallModal.vue";
import MeritHub from "@/components/modals/MeritHub.vue";
import PersonaEditPanel from "@/components/modals/PersonaEditPanel.vue";
import PhoneCallModal from "@/components/modals/PhoneCallModal.vue";
import ProactiveMessageSettingsModal from "@/components/modals/ProactiveMessageSettingsModal.vue";
import ScreenshotPreviewModal from "@/components/modals/ScreenshotPreviewModal.vue";
import VideoCallModal from "@/components/modals/VideoCallModal.vue";
import ImageSearchPanel from "@/components/panels/ImageSearchPanel.vue";
import { useChatAudioRecording } from "@/composables/useChatAudioRecording";
import { useChatAvatarChange } from "@/composables/useChatAvatarChange";
import { useChatEventsExtraction } from "@/composables/useChatEventsExtraction";
import { useChatExport } from "@/composables/useChatExport";
import { useChatFakeTime } from "@/composables/useChatFakeTime";
import { useChatFiles } from "@/composables/useChatFiles";
import { useChatGroupCall } from "@/composables/useChatGroupCall";
import { useChatGroupSettings } from "@/composables/useChatGroupSettings";
import { useChatIncomingCalls } from "@/composables/useChatIncomingCalls";
import { useChatInputHelper } from "@/composables/useChatInputHelper";
import { useChatMedia } from "@/composables/useChatMedia";
import { useChatMiniFeatures } from "@/composables/useChatMiniFeatures";
import { useChatMultiDelete } from "@/composables/useChatMultiDelete";
import { useChatPersona } from "@/composables/useChatPersona";
import { useChatPlusMenuRouter } from "@/composables/useChatPlusMenuRouter";
import { useChatScreenshot } from "@/composables/useChatScreenshot";
import { useChatSearch } from "@/composables/useChatSearch";
import { useChatSummaryDiary } from "@/composables/useChatSummaryDiary";
import { useChatTheater } from "@/composables/useChatTheater";
import { useHolidayTrigger } from "@/composables/useHolidayTrigger";
import { useStreamingWindow } from "@/composables/useStreamingWindow";
import { db, DB_STORES } from "@/db/database";
import {
  extractAudioFromMessages,
  extractImagesFromMessages,
} from "@/db/operations";
import { PromptBuilder } from "@/engine/prompt/PromptBuilder";
import { formatTime as formatAudioTime } from "@/services/AudioRecorder";
import BlockService from "@/services/BlockService";
import { proactiveMessageService } from "@/services/ProactiveMessageService";
import { getRegexedString, regex_placement } from "@/services/RegexEngine";
import {
  needsParsing,
  parseAffinityUpdateTags,
  parseAIResponse,
  parseCalendarEventTags,
  parseGreeting,
  parseGroupChatResponse,
} from "@/services/ResponseParser";
import {
  getNearbyPlaces,
  getWeatherByCity,
  getWeatherByCoords,
  searchCities,
} from "@/services/WeatherService";
import {
  useAIGenerationStore,
  useCharactersStore,
  useChatStore,
  useLorebooksStore,
  usePromptManagerStore,
  useSettingsStore,
  useStickerStore,
  useThemeStore,
} from "@/stores";
import { usePhoneCallStore } from "@/stores/phoneCall";
import { useRegexScriptsStore } from "@/stores/regexScripts";
import { useUserStore } from "@/stores/user";
import type {
  Chat,
  ChatAppearance,
  ChatLocationOverride,
  ChatMessage,
  WaimaiOrderSnapshot,
} from "@/types/chat";
import { createDefaultChat } from "@/types/chat";
import { formatMediaLogsForPrompt } from "@/types/mediaLog";
import type { AuthorsNoteMetadata } from "@/types/prompt";
import type { Lorebook } from "@/types/worldinfo";
import { PromptRole } from "@/types/worldinfo";
import {
  buildPostCallPrompt,
  createCallNotificationCard,
} from "@/utils/postCallReaction";
import {
  cleanTTSTags,
  hasTTSTags,
  parseTTSSegments,
} from "@/utils/ttsTagCleaner";
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  toRaw,
  watch,
} from "vue";

// 媒體發送類型定義
type MediaType =
  | "descriptive-image"
  | "descriptive-video"
  | "real-image"
  | "image-url"
  | "ai-generate";
interface ImageData {
  dataUrl: string;
  base64: string;
  mimeType: string;
  caption?: string;
}

// 類型定義
interface Message {
  id: string;
  role: "user" | "ai" | "system";
  content: string;
  timestamp: number;
  // 輪次標記（user 訊息不帶，AI 回覆和系統 UI 帶同一個 turnId）
  turnId?: string;
  // 滑動支援（單條訊息）
  swipes?: string[];
  swipeId?: number;
  // 整輪滑動支援（存在最後一條 AI 訊息上）
  roundSwipes?: Message[][];
  roundSwipeId?: number;
  // 流式輸出
  isStreaming?: boolean;
  // 解析後的額外資訊
  thought?: string; // ˇ想法ˇ 內容
  isTimetravel?: boolean;
  timetravelContent?: string;
  isRedpacket?: boolean;
  redpacketData?: {
    amount: string;
    blessing: string;
    password?: string;
    voice?: string;
  };
  isLocation?: boolean;
  locationContent?: string;
  replyToContent?: string;
  // 回覆引用
  replyTo?: string; // 被回覆的消息 ID
  // 圖片相關
  messageType?:
    | "text"
    | "image"
    | "descriptive-image"
    | "descriptive-video"
    | "image-url"
    | "audio";
  imageUrl?: string;
  imageData?: string;
  imageMimeType?: string;
  imageCaption?: string;
  imagePrompt?: string;
  // 禮物相關
  isGift?: boolean;
  giftName?: string;
  giftReceived?: boolean;
  // 轉帳相關
  isTransfer?: boolean;
  transferAmount?: number;
  transferReceived?: boolean;
  transferType?: "pay" | "refund";
  transferNote?: string;
  transferStatus?: "sent" | "pending" | "received" | "refunded";
  // 外賣相關
  isWaimaiShare?: boolean;
  isWaimaiPaymentRequest?: boolean;
  isWaimaiPaymentConfirm?: boolean;
  isWaimaiPaymentResult?: boolean;
  isWaimaiProgress?: boolean;
  isWaimaiDelivery?: boolean;
  waimaiOrder?: WaimaiOrderSnapshot;
  // 換頭像相關
  isAvatarChange?: boolean;
  avatarChangeAction?: "accept" | "reject" | "forced" | "mood" | "restore";
  avatarChangeMood?: string;
  avatarChangeDesc?: string;
  // 群聊相關
  senderCharacterId?: string;
  senderCharacterName?: string;
  senderCharacterAvatar?: string;
  isRecall?: boolean;
  recallContent?: string;
  isPrivateMessage?: boolean;
  isGroupAction?: boolean;
  groupActionType?: "rename" | "kick" | "mute" | "unmute";
  groupActionActor?: string;
  groupActionTarget?: string;
  groupActionValue?: string;
  isGroupChatHistory?: boolean;
  groupChatHistoryData?: {
    groupName: string;
    messages: Array<{
      senderName: string;
      content: string;
      timestamp: number;
      isUser: boolean;
    }>;
  };
  // 群通話記錄
  isGroupCallHistory?: boolean;
  groupCallHistoryData?: {
    groupName: string;
    participants: Array<{
      characterId: string;
      name: string;
      avatar?: string;
    }>;
    messages: Array<{
      type: "voice" | "system" | "user";
      senderName?: string;
      content: string;
      timestamp: number;
    }>;
    startedAt: number;
    endedAt: number;
  };
  // 行事曆事件
  isCalendarEvent?: boolean;
  calendarEventData?: {
    type: "user" | "period";
    title: string;
    date: string;
    description?: string;
  };
  // 通話通知相關
  isCallNotification?: boolean;
  callNotificationType?: "declined" | "missed";
  callReason?: string;
  // HTML 區塊（完整 HTML 文件，用 iframe 渲染）
  isHtmlBlock?: boolean;
  htmlContent?: string;
  // 音頻/語音相關
  audioBlobId?: string;
  audioMimeType?: string;
  audioDuration?: number;
  audioWaveform?: number[];
  audioTranscript?: string;
  _audioBlob?: Blob;
  _audioDataUri?: string;
  // 原始好感度更新區塊（<update>...</update>），用於重新掃描
  _rawAffinityBlock?: string;
  // MiniMax TTS 語音合成相關
  ttsRawContent?: string;
  ttsAudioUrl?: string;
  ttsSegments?: Array<{
    emotion: string;
    speed: number;
    text: string;
    clean: string;
    audioUrl?: string;
  }>;
  // 封鎖系統相關
  sentWhileBlocked?: boolean;
  isSystemNotification?: boolean;
  // 角色封鎖用戶的系統通知訊息
  isCharBlockedNotification?: boolean;
  charBlockedReason?: string;
}

interface PendingInjectedMessage {
  content: string;
  isWaimaiShare?: boolean;
  isWaimaiPaymentRequest?: boolean;
  isWaimaiPaymentConfirm?: boolean;
  isWaimaiPaymentResult?: boolean;
  isWaimaiProgress?: boolean;
  isWaimaiDelivery?: boolean;
  waimaiOrder?: WaimaiOrderSnapshot;
  waimaiProgressMessages?: Array<{
    content: string;
    isWaimaiProgress?: boolean;
    isWaimaiDelivery?: boolean;
    waimaiOrder?: WaimaiOrderSnapshot;
    timestamp?: number;
  }>;
}

interface ChatProps {
  chatId?: string;
  characterId?: string;
  characterName?: string;
  characterAvatar?: string;
  pendingAppearance?: ChatAppearance;
  pendingMessage?: string | PendingInjectedMessage;
  startPhoneCall?: boolean;
  /** 從 App 級別接聽來電時傳入的來電原因，非空代表需要立即進入來電通話 */
  incomingCallReason?: string;
}

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
    page: "character" | "worldbook" | "settings" | "shop" | "media-log",
  ): void;
  (e: "appearanceApplied"): void;
  (e: "pendingMessageConsumed"): void;
  (e: "phoneCallStarted"): void;
  (e: "incomingCallConsumed"): void;
  (e: "openChat", chatId: string, characterId: string): void;
  (e: "chatSwitched", chatId: string): void;
}>();

// ===== Regex 腳本套用 helpers =====
// 取得合併腳本：全域腳本（先）+ 角色卡內嵌腳本（後），對應 ST 的 getRegexScripts()
function getActiveRegexScripts() {
  const global = regexScriptsStore.scripts ?? [];
  const charScripts =
    currentCharacter.value?.data?.extensions?.regex_scripts ?? [];
  return [...global, ...charScripts];
}

// 套用 AI_OUTPUT regex（在 finalContent 進入 parser 前呼叫）
function applyAIOutputRegex(content: string): string {
  const scripts = getActiveRegexScripts();
  if (!scripts.length) return content;
  const charName = currentCharacter.value?.data?.name || props.characterName;
  const userName = userStore.currentPersona?.name || "User";
  return getRegexedString(content, regex_placement.AI_OUTPUT, scripts, {
    characterName: charName,
    userName,
  });
}

// 套用 USER_INPUT regex（在用戶訊息 content 建立前呼叫）
function applyUserInputRegex(content: string): string {
  const scripts = getActiveRegexScripts();
  if (!scripts.length) return content;
  const charName = currentCharacter.value?.data?.name || props.characterName;
  const userName = userStore.currentPersona?.name || "User";
  return getRegexedString(content, regex_placement.USER_INPUT, scripts, {
    characterName: charName,
    userName,
  });
}

// 快捷導航
function navigateTo(page: "character" | "worldbook" | "settings") {
  showMoreMenu.value = false;
  showRail.value = false;
  emit("navigate", page);
}

// Stores
const chatStore = useChatStore();
const charactersStore = useCharactersStore();
const settingsStore = useSettingsStore();
const themeStore = useThemeStore();
const lorebooksStore = useLorebooksStore();
const aiGenerationStore = useAIGenerationStore();
const stickerStore = useStickerStore();
const userStore = useUserStore();
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
import type { ScheduleCallData } from "@/services/ResponseParser";
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
      name: char?.nickname || char?.data?.name || "未知角色",
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

// 群聊輔助：根據角色名稱取得角色頭像
function getGroupMemberAvatar(senderName: string): string {
  if (!groupMetadata.value) return "";

  // 多人卡模式：從 multiCharMembers 查找
  if (
    groupMetadata.value.isMultiCharCard &&
    groupMetadata.value.multiCharMembers
  ) {
    const member = groupMetadata.value.multiCharMembers.find(
      (m) => m.name === senderName,
    );
    return member?.avatar || "";
  }

  // 普通群聊模式
  for (const member of groupMetadata.value.members) {
    const char = charactersStore.characters.find(
      (c) => c.id === member.characterId,
    );
    if (
      char &&
      (char.data?.name === senderName || char.nickname === senderName)
    ) {
      return char.avatar || "";
    }
  }
  return "";
}

// 群聊輔助：根據角色名稱取得角色 ID
function getGroupMemberIdByName(senderName: string): string | undefined {
  if (!groupMetadata.value) return undefined;

  // 多人卡模式：從 multiCharMembers 查找
  if (
    groupMetadata.value.isMultiCharCard &&
    groupMetadata.value.multiCharMembers
  ) {
    const member = groupMetadata.value.multiCharMembers.find(
      (m) => m.name === senderName,
    );
    return member?.id;
  }

  // 普通群聊模式
  for (const member of groupMetadata.value.members) {
    const char = charactersStore.characters.find(
      (c) => c.id === member.characterId,
    );
    if (
      char &&
      (char.data?.name === senderName || char.nickname === senderName)
    ) {
      return member.characterId;
    }
  }
  return undefined;
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
  return char?.nickname || char?.data?.name || "未知";
}

// 訊息列表（從 store 或新建）
const messages = ref<Message[]>([]);

// ===== 訊息分頁顯示（性能優化） =====
const MESSAGE_PAGE_SIZE = 100; // 每次載入的訊息數量
const visibleCount = ref(MESSAGE_PAGE_SIZE); // 當前顯示的訊息數量
const isLoadingMore = ref(false); // 是否正在載入更多
const loadMoreSentinelRef = ref<HTMLElement | null>(null); // 頂部哨兵元素

// 可見訊息列表（只渲染最後 N 條）
const visibleMessages = computed(() => {
  const total = messages.value.length;
  if (total <= visibleCount.value) return messages.value;
  return messages.value.slice(total - visibleCount.value);
});

// 是否還有更早的訊息可以載入
const hasMoreMessages = computed(() => {
  return messages.value.length > visibleCount.value;
});

// 載入更多歷史訊息（向上滾動時觸發）
function loadMoreMessages() {
  if (isLoadingMore.value || !hasMoreMessages.value) return;
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

// 是否正在生成（使用全局狀態）
const isGenerating = computed(() => {
  if (!currentChatId.value) return false;
  return aiGenerationStore.isTaskGenerating(currentChatId.value, "chat");
});

// 訊息列表容器
const messagesContainer = ref<HTMLElement | null>(null);

// ChatScreen 根元素（用於聊天專屬外觀）
const chatScreenRef = ref<HTMLElement | null>(null);
// 標題欄元素（用於計算封鎖遮罩的起始位置）
const chatHeaderRef = ref<HTMLElement | null>(null);

// 顯示更多選單
const showMoreMenu = ref(false);

// Rail 收合狀態（手機端頂欄按鈕收合）
const showRail = ref(false);

// 暱稱編輯
const showNicknameEdit = ref(false);
const nicknameEditValue = ref("");
const nicknameInputRef = ref<HTMLInputElement | null>(null);

// 封鎖狀態
const isCharBlocked = ref(false);
const isBlockedByChar = ref(false);
const showFriendRequestInput = ref(false);
const friendRequestMessage = ref("");

// 載入封鎖狀態
async function loadBlockState() {
  if (!currentChatId.value) return;
  try {
    const chat = await db.get<Chat>(DB_STORES.CHATS, currentChatId.value);
    if (chat?.blockState) {
      isCharBlocked.value = chat.blockState.status === "user-blocked-char";
      isBlockedByChar.value = chat.blockState.status === "char-blocked-user";
    } else {
      isCharBlocked.value = false;
      isBlockedByChar.value = false;
    }
  } catch {
    /* ignore */
  }
}

/**
 * 判斷訊息是否應顯示驚嘆號（封鎖期間「發送失敗」指示器）
 * - 用戶封鎖角色：只有封鎖之後的 AI 回覆顯示驚嘆號
 * - 角色封鎖用戶：只有封鎖之後的用戶訊息顯示驚嘆號
 * - sentWhileBlocked 標記的訊息：始終顯示驚嘆號
 */
function shouldShowBlockedIndicator(message: Message): boolean {
  if (message.isSystemNotification) return false;
  // 歷史訊息：被角色封鎖期間用戶發的訊息（已持久化標記）
  if (message.sentWhileBlocked) return true;

  // 取得封鎖時間，只對封鎖之後的訊息顯示驚嘆號
  const blockState = currentChatData.value?.blockState;
  const blockedAt = blockState?.blockedAt ?? 0;

  // 即時狀態：用戶封鎖角色時，封鎖之後的 AI 回覆顯示驚嘆號
  if (
    isCharBlocked.value &&
    message.role === "ai" &&
    message.timestamp >= blockedAt
  )
    return true;
  // 即時狀態：角色封鎖用戶時，封鎖之後的用戶訊息顯示驚嘆號
  if (
    isBlockedByChar.value &&
    message.role === "user" &&
    message.timestamp >= blockedAt
  )
    return true;
  return false;
}

// 封鎖/解封角色
async function toggleBlockCharacter() {
  if (!currentChatId.value) return;
  const blockService = BlockService.getInstance();

  if (isCharBlocked.value) {
    await blockService.unblockCharacter(currentChatId.value);
    isCharBlocked.value = false;
    // 同步更新 currentChatData 的 blockState（防止 saveChatImmediate 覆蓋）
    const updatedChat = await db.get<Chat>(
      DB_STORES.CHATS,
      currentChatId.value,
    );
    if (updatedChat && currentChatData.value) {
      currentChatData.value.blockState = updatedChat.blockState;
    }
    // 插入系統提示訊息：已解除封鎖
    const unblockMsg: Message = {
      id: `msg_notify_${Date.now()}`,
      role: "system",
      content: `已解除對 ${displayCharacterName.value} 的封鎖`,
      timestamp: Date.now(),
      isSystemNotification: true,
    };
    messages.value.push(unblockMsg);
    scrollToBottom();
    await saveChatImmediate();
  } else {
    if (!confirm("確定要封鎖這個角色嗎？封鎖後將停止接收主動訊息和來電。"))
      return;
    await blockService.blockCharacter(currentChatId.value);
    isCharBlocked.value = true;
    // 同步更新 currentChatData 的 blockState（防止 saveChatImmediate 覆蓋）
    const updatedChat2 = await db.get<Chat>(
      DB_STORES.CHATS,
      currentChatId.value,
    );
    if (updatedChat2 && currentChatData.value) {
      currentChatData.value.blockState = updatedChat2.blockState;
    }
    // 插入系統提示訊息：已封鎖
    const blockMsg: Message = {
      id: `msg_notify_${Date.now()}`,
      role: "system",
      content: `你已將 ${displayCharacterName.value} 封鎖`,
      timestamp: Date.now(),
      isSystemNotification: true,
    };
    messages.value.push(blockMsg);
    scrollToBottom();
    await saveChatImmediate();
  }
  showMoreMenu.value = false;
  showRail.value = false;
}

// 提交好友申請
async function submitFriendRequest() {
  if (!currentChatId.value || !friendRequestMessage.value.trim()) return;
  try {
    const requestMsg = friendRequestMessage.value.trim();
    showFriendRequestInput.value = false;
    friendRequestMessage.value = "";

    // 仿照 OVO 的做法：用獨立的輕量 API 呼叫讓角色決定接受/拒絕
    // 不走主聊天流程，避免觸發重複 AI 生成
    const chatTaskConfig = settingsStore.getAPIForTask("chat");
    if (
      !chatTaskConfig.api.endpoint ||
      !chatTaskConfig.api.apiKey ||
      !chatTaskConfig.api.model
    ) {
      alert("請先在設定中配置 API");
      return;
    }

    const charName =
      currentCharacter.value?.data?.name || props.characterName || "角色";
    const charPersona =
      currentCharacter.value?.data?.description ||
      currentCharacter.value?.data?.personality ||
      "";
    const chat = await db.get<Chat>(DB_STORES.CHATS, currentChatId.value);
    const blockState = chat?.blockState;
    const prevRejects =
      blockState?.friendRequests?.filter((r) => r.result === "rejected") ?? [];

    // 取最近 15 條對話歷史作為 API messages（讓 AI 有完整上下文）
    const historyMessages: Array<{
      role: "user" | "assistant" | "system";
      content: string;
    }> = [];
    const recentMsgs = messages.value
      .filter((m) => m.content?.trim() && !m.isSystemNotification)
      .slice(-15);
    for (const m of recentMsgs) {
      if (m.role === "user") {
        let content = (m.content || "").slice(0, 300);
        if (m.sentWhileBlocked) content += "\n（此訊息發送於被封鎖期間）";
        historyMessages.push({ role: "user", content });
      } else if (m.role === "ai") {
        historyMessages.push({
          role: "assistant",
          content: (m.content || "").slice(0, 300),
        });
      } else if (m.role === "system" && m.isCharBlockedNotification) {
        historyMessages.push({
          role: "system",
          content: "（你在此時拉黑了用戶）",
        });
      }
    }

    let prompt = `你是「${charName}」。你的人設：\n${charPersona}\n\n`;
    prompt += `你之前拉黑了用戶。用戶現在發來好友申請，申請理由：「${requestMsg.slice(0, 200)}」。\n`;
    prompt += `這是用戶第 ${prevRejects.length + 1} 次申請。`;
    if (prevRejects.length > 0) {
      prompt += ` 之前你拒絕過 ${prevRejects.length} 次。`;
    }
    prompt += `\n\n請根據你的性格和對話記錄，決定是否接受好友申請。`;
    prompt += `\n只輸出以下 JSON，不要任何其他文字：`;
    prompt += `\n接受：{"accept":true,"reply":"你想對用戶說的話（符合你的性格）"}`;
    prompt += `\n拒絕：{"accept":false,"rejectReason":"拒絕理由(30字內)","hint":"給用戶的小提示(可選)"}`;

    const client = new OpenAICompatibleClient(chatTaskConfig.api);
    const result = await client.generate({
      messages: [
        {
          role: "system",
          content: `你是「${charName}」，一個角色扮演助手。根據對話歷史和你的性格決定是否接受好友申請。只輸出一行 JSON，不要 markdown，不要解釋。`,
        },
        ...historyMessages,
        { role: "user", content: prompt },
      ],
      settings: {
        maxContextLength: 4096,
        maxResponseLength: 8192,
        temperature: 0.9,
        topP: 1,
        topK: 0,
        frequencyPenalty: 0,
        presencePenalty: 0,
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
      // 移除 markdown 代碼塊包裝（Gemini 常見）
      let raw = result.content
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();
      // 提取第一個 JSON 物件
      const jsonStr = raw.replace(/^[\s\S]*?(\{[\s\S]*?\})[\s\S]*$/, "$1");
      const obj = JSON.parse(jsonStr);
      accept = !!obj.accept;
      rejectReason = (obj.rejectReason || "").trim().slice(0, 100);
      hint = (obj.hint || "").trim().slice(0, 100);
      reply = (obj.reply || "").trim();
    } catch {
      // 嘗試從文字中判斷接受/拒絕
      const raw = result.content.toLowerCase();
      if (raw.includes('"accept":true') || raw.includes('"accept": true')) {
        accept = true;
        reply = "";
      } else {
        accept = false;
        rejectReason = "對方暫時無法回應，請稍後再試。";
      }
    }

    const blockService = BlockService.getInstance();

    if (accept) {
      // 直接解封
      await blockService.handleCharacterUnblock(currentChatId.value);
      isBlockedByChar.value = false;
      const updatedChat = await db.get<Chat>(
        DB_STORES.CHATS,
        currentChatId.value,
      );
      if (updatedChat && currentChatData.value) {
        currentChatData.value.blockState = updatedChat.blockState;
      }
      // 插入解封系統訊息
      messages.value.push({
        id: `msg_unblocked_${Date.now()}`,
        role: "system",
        content: `${charName} 已同意你的好友申請，可以繼續聊天`,
        timestamp: Date.now(),
        isSystemNotification: true,
      });
      // 如果 AI 有回覆，直接插入角色訊息（不需要再呼叫 API）
      if (reply) {
        messages.value.push({
          id: `msg_${Date.now()}_reply`,
          role: "ai",
          content: reply,
          timestamp: Date.now(),
        });
      }
      await saveChatImmediate();
    } else {
      // 拒絕：插入系統訊息到聊天記錄，不用系統彈窗
      const rejectText = rejectReason || "對方拒絕了你的好友申請";
      messages.value.push({
        id: `msg_reject_${Date.now()}`,
        role: "system",
        content: rejectText + (hint ? `\n💡 ${hint}` : ""),
        timestamp: Date.now(),
        isSystemNotification: true,
      });
      await saveChatImmediate();
    }
  } catch (err: any) {
    console.error("[submitFriendRequest] 錯誤:", err);
    // 錯誤插入系統訊息，不用系統彈窗
    messages.value.push({
      id: `msg_req_err_${Date.now()}`,
      role: "system",
      content: `好友申請發送失敗：${err.message || "未知錯誤"}`,
      timestamp: Date.now(),
      isSystemNotification: true,
    });
  }
}

// 仿照 OVO 的做法：用獨立的輕量 API 呼叫讓角色決定接受/拒絕
// 不走主聊天流程，避免觸發重複 AI 生成
function startNicknameEdit() {
  const char = currentCharacter.value;
  if (!char) return;
  nicknameEditValue.value = char.nickname || char.data.name || "";
  showNicknameEdit.value = true;
  nextTick(() => {
    nicknameInputRef.value?.focus();
    nicknameInputRef.value?.select();
  });
}

async function saveNickname() {
  const char = currentCharacter.value;
  if (!char) return;
  const newNickname = nicknameEditValue.value.trim();
  await charactersStore.updateCharacter(char.id, { nickname: newNickname });
  showNicknameEdit.value = false;
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

// 編輯中的訊息
const editingMessageId = ref<string | null>(null);
const editingContent = ref("");
const editingThought = ref("");
// 用 DOM ref 直接操作 textarea，避免 v-model 每次輸入都觸發 Vue 響應式更新導致卡頓
const editContentTextareaRef = ref<HTMLTextAreaElement | null>(null);
const editThoughtTextareaRef = ref<HTMLTextAreaElement | null>(null);

// ===== 回覆引用功能 =====
const replyingTo = ref<Message | null>(null);

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
  renamingChatId,
  renamingChatName,
  showNewChatConfirm,
  newChatPinToList,
  selectedGreetingIndex,
  availableGreetings,
  openChatFilesPanel,
  refreshChatFilesList,
  switchChatFile,
  createNewChatFile,
  togglePinChatToList,
  startRenameChat,
  confirmRenameChat,
  deleteChatFile,
  formatChatFileTime,
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

// ===== 多訊息刪除 composable =====
const {
  showBranchConfirm,
  branchPendingMessageId,
  branchCopyMemory,
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
  onAffinityRollback: (chatId: string, deletedMessageIds: string[]) => {
    const rolled = affinityStore.rollbackToBeforeMessages(
      chatId,
      deletedMessageIds,
    );
    if (rolled) {
      _affinityState.value = affinityStore.getState(chatId) ?? null;
      console.log(
        "[ChatScreen] 好感度已回滾，刪除的訊息:",
        deletedMessageIds.length,
        "條",
      );
    }
  },
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

// ===== 媒體發送抽屜 =====
const showMediaDrawer = ref(false);

// ===== 禮物面板 =====
const showGiftDrawer = ref(false);

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
  switchChatFile,
  triggerAIResponse,
});

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
} = useChatMiniFeatures({
  messages,
  scrollToBottom,
  saveChat,
  saveChatImmediate,
  triggerAIResponse,
  currentCharacter,
});

// ===== 換頭像 composable =====
const {
  moodAvatarUrl,
  showForceAvatarConfirm,
  handleAvatarChange,
  confirmForceAvatar,
  findLastUserImage,
} = useChatAvatarChange({
  messages,
  currentCharacter,
  characterName: props.characterName,
  saveChatImmediate,
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
  // 從 character store 取最新頭像（accept/forced 後即時更新）
  const char = currentCharacter.value;
  if (char?.avatar) return char.avatar;
  return props.characterAvatar;
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

// 聊天專屬位置覆蓋（null 表示使用全域設定）
const chatLocationOverride = ref<ChatLocationOverride | null>(null);
// 位置搜尋相關狀態
const locationSearchQuery = ref("");
const locationSearchResults = ref<
  Array<{
    id: number;
    name: string;
    region: string;
    country: string;
    lat: number;
    lon: number;
  }>
>([]);
const locationSearchLoading = ref(false);

// ===== 好感度 =====
import type {
  CharacterAffinityConfig,
  ChatAffinityState,
} from "@/schemas/affinity";
const _affinityConfig = ref<CharacterAffinityConfig | null>(null);
const _affinityState = ref<ChatAffinityState | null>(null);
const showAffinityPanel = ref(false);

function handleAvatarClick(_messageId: string) {
  if (_affinityConfig.value?.enabled) {
    showAffinityPanel.value = true;
  }
}

/**
 * 處理 MessageBubble 正則產生 HTML 後的拆分請求：
 * 在原訊息後面插入一個獨立的 isHtmlBlock 氣泡
 */
const _splitRegexHtmlProcessed = new Set<string>();
function handleSplitRegexHtml(messageId: string, htmlContent: string) {
  // 用內容前 200 字做 dedup key（比長度更穩定，不受 heightScript 版本差異影響）
  const newPrefix = htmlContent.substring(0, 200);
  const key = `${messageId}_${newPrefix}`;
  if (_splitRegexHtmlProcessed.has(key)) return;
  _splitRegexHtmlProcessed.add(key);

  const idx = messages.value.findIndex((m) => m.id === messageId);
  if (idx === -1) return;

  // 掃描所有已有的 HTML 拆分氣泡，收集它們的前綴
  let insertIdx = idx + 1;
  while (insertIdx < messages.value.length) {
    const msg = messages.value[insertIdx];
    if (!msg.isHtmlBlock || !msg.id.startsWith(`${messageId}_html`)) break;
    // 比對前 200 字（跳過尾部 heightScript 差異）
    const existingPrefix = msg.htmlContent?.substring(0, 200) ?? "";
    if (existingPrefix === newPrefix) {
      // 已存在相同內容，更新 htmlContent 為最新版本（heightScript 可能更新）
      msg.htmlContent = htmlContent;
      return;
    }
    insertIdx++;
  }

  const htmlMessage: Message = {
    id: `${messageId}_html_${Date.now()}_${insertIdx - idx}`,
    role: "ai",
    content: "",
    timestamp: messages.value[idx].timestamp + (insertIdx - idx),
    isHtmlBlock: true,
    htmlContent: htmlContent,
  };
  messages.value.splice(insertIdx, 0, htmlMessage);
  // 延遲保存，確保 HTML 氣泡持久化
  saveChat();
}

function _handleAffinityUpdates(
  updates: {
    metric: string;
    change: number;
    reason: string;
    stringValue?: string;
    isAbsolute?: boolean;
    absoluteValue?: number;
  }[],
  messageId?: string,
) {
  const chatId = currentChatId.value;
  if (!chatId || !_affinityConfig.value?.enabled) return;

  // 處理前先快照，用於刪除訊息時回滾
  if (messageId) {
    affinityStore.snapshotBeforeMessage(chatId, messageId);
  }

  const config = _affinityConfig.value;
  const resolvedUpdates = updates.map((u) => {
    // 嘗試多種匹配策略：
    // 1. 完全匹配 name 或 id（如 "黎靖青.亲密值" === "黎靖青.亲密值"）
    // 2. 去掉命名空間前綴後匹配 name（如 "亲密值" === "亲密值"）
    // 3. metric 的 name 包含在路徑末段（如 metric.name="亲密值" 匹配 "黎靖青.亲密值"）
    let metricConfig = config.metrics.find(
      (m) => m.name === u.metric || m.id === u.metric,
    );

    if (!metricConfig) {
      // 取路徑最後一段作為指標名（"黎靖青.亲密值" → "亲密值"）
      const lastDotIdx = u.metric.lastIndexOf(".");
      if (lastDotIdx !== -1) {
        const suffix = u.metric.substring(lastDotIdx + 1);
        metricConfig = config.metrics.find(
          (m) => m.name === suffix || m.id === suffix,
        );
      }
    }

    if (!metricConfig) {
      // 反向匹配：metric.name 是否為 u.metric 的尾段
      metricConfig = config.metrics.find((m) =>
        u.metric.endsWith(`.${m.name}`),
      );
    }

    if (!metricConfig) {
      console.warn(
        `[ChatScreen] 好感度指標未匹配: "${u.metric}"，可用指標:`,
        config.metrics.map((m) => `${m.id}(${m.name})`),
      );
    }

    return {
      metricId: metricConfig?.id || u.metric,
      change: u.change,
      reason: u.reason,
      stringValue: u.stringValue,
      isAbsolute: u.isAbsolute,
      absoluteValue: u.absoluteValue,
    };
  });

  affinityStore.batchUpdate(chatId, resolvedUpdates);
  _affinityState.value = affinityStore.getState(chatId) ?? null;
  console.log(
    "[ChatScreen] 好感度更新:",
    resolvedUpdates
      .map((u) => {
        if (u.stringValue !== undefined)
          return `${u.metricId} → "${u.stringValue}"`;
        if (u.isAbsolute && u.absoluteValue !== undefined)
          return `${u.metricId} = ${u.absoluteValue}`;
        return `${u.metricId} ${u.change > 0 ? "+" : ""}${u.change}`;
      })
      .join(", "),
  );
}

/**
 * 從最新的 AI 訊息中重新掃描 <update> 標籤並套用到好感度數值
 * 由 AffinityPanel 的「重新獲取」按鈕觸發
 */
function rescanAffinityFromMessages() {
  // 從後往前找最後一條含 <update> 的 AI 訊息
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const msg = messages.value[i];
    if (msg.role !== "ai" || !msg.content) continue;

    // 優先使用保存的原始 <update> 區塊（因為 msg.content 只包含 <output> 內的內容）
    const searchContent = msg._rawAffinityBlock || msg.content;
    const updates = parseAffinityUpdateTags(searchContent);
    if (updates.length > 0) {
      _handleAffinityUpdates(updates, msg.id);
      console.log(
        "[ChatScreen] 重新掃描好感度：從訊息",
        msg.id,
        "獲取",
        updates.length,
        "筆更新",
        msg._rawAffinityBlock ? "（使用原始 <update> 區塊）" : "",
      );
      return;
    }
  }
  console.log("[ChatScreen] 重新掃描好感度：未找到含 <update> 的 AI 訊息");
}

async function _loadAffinityForChat(chatId: string, characterId: string) {
  try {
    await affinityStore.initialize();
    const config = await affinityStore.loadConfig(characterId);
    _affinityConfig.value = config;
    if (config?.enabled) {
      const state = await affinityStore.loadState(chatId);
      if (state) {
        _affinityState.value = state;
      } else {
        const newState = await affinityStore.initializeFromConfig(
          chatId,
          config,
        );
        _affinityState.value = newState;
      }
      // 進入聊天時自動從最新 AI 訊息重新掃描好感度數值
      // 確保面板顯示的數值與 AI 最後輸出的 <update> 一致
      nextTick(() => {
        if (messages.value.length > 0) {
          rescanAffinityFromMessages();
        }
      });
    } else {
      _affinityState.value = null;
    }
  } catch (e) {
    console.error("[ChatScreen] 載入好感度失敗:", e);
  }
}

// ===== 假時間 composable =====
const fakeTime = useChatFakeTime();

const chatMinimaxTTSOverride = ref<{
  voiceId?: string;
  speed?: number;
  pitch?: number;
  emotion?: string;
}>({});
const showMinimaxTTSSettingsModal = ref(false);

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
  scrollToBottom,
  saveChat,
  openTheater,
  openChatFilesPanel,
  startGroupCall,
  emit: emit as (e: string, ...args: any[]) => void,
});

// ===== 多人卡子角色管理 =====
const showAddMultiCharMember = ref(false);
const newMultiCharName = ref("");
const newMultiCharAvatar = ref("");
const multiCharAvatarInput = ref<HTMLInputElement | null>(null);
const editingMultiCharId = ref<string | null>(null);
const failedMultiCharAvatars = ref(new Set<string>());

// 代理外部圖片 URL（繞過 CORS/CSP）
function getProxiedUrl(url: string): string {
  if (
    !url ||
    url.startsWith("data:") ||
    url.startsWith("blob:") ||
    url.startsWith("/")
  )
    return url;
  // 使用 /ai-proxy/ 路徑（nginx 已配置），同時相容 vite dev server 的 /image-proxy
  try {
    const parsed = new URL(url);
    const hostAndPath = parsed.host + parsed.pathname + parsed.search;
    if (parsed.protocol === "https:") {
      return `/ai-proxy/${hostAndPath}`;
    } else {
      return `/ai-proxy-http/${hostAndPath}`;
    }
  } catch {
    return `/image-proxy?url=${encodeURIComponent(url)}`;
  }
}

function triggerMultiCharAvatarUpload() {
  multiCharAvatarInput.value?.click();
}

function handleMultiCharAvatarChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    newMultiCharAvatar.value = e.target?.result as string;
  };
  reader.readAsDataURL(file);
  // 清空 input 以便重複選擇同一檔案
  (event.target as HTMLInputElement).value = "";
}

function addMultiCharMember() {
  if (!groupMetadata.value || !newMultiCharName.value.trim()) return;
  if (!groupMetadata.value.multiCharMembers) {
    groupMetadata.value.multiCharMembers = [];
  }
  if (editingMultiCharId.value) {
    // 編輯模式
    const member = groupMetadata.value.multiCharMembers.find(
      (m) => m.id === editingMultiCharId.value,
    );
    if (member) {
      member.name = newMultiCharName.value.trim();
      if (newMultiCharAvatar.value) member.avatar = newMultiCharAvatar.value;
    }
  } else {
    // 新增模式
    groupMetadata.value.multiCharMembers.push({
      id: `multi_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: newMultiCharName.value.trim(),
      avatar: newMultiCharAvatar.value,
    });
  }
  resetMultiCharForm();
}

function editMultiCharMember(member: {
  id: string;
  name: string;
  avatar: string;
}) {
  editingMultiCharId.value = member.id;
  newMultiCharName.value = member.name;
  newMultiCharAvatar.value = member.avatar;
  showAddMultiCharMember.value = true;
}

function removeMultiCharMember(id: string) {
  if (!groupMetadata.value?.multiCharMembers) return;
  groupMetadata.value.multiCharMembers =
    groupMetadata.value.multiCharMembers.filter((m) => m.id !== id);
}

function resetMultiCharForm() {
  showAddMultiCharMember.value = false;
  newMultiCharName.value = "";
  newMultiCharAvatar.value = "";
  editingMultiCharId.value = null;
}

// ===== 聊天設定選單 =====
const showChatSettingsMenu = ref(false);

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

// 快速輸入助手橫向捲動
function handleQuickInputWheel(e: WheelEvent) {
  const container = e.currentTarget as HTMLElement;
  // 觸控板原生橫向滾動（deltaX）優先，否則將垂直滾輪（deltaY）轉換為橫向
  const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
  if (delta === 0) return;
  container.scrollLeft += delta;
}

// ===== 外觀設定 =====
const chatAppearance = ref<ChatAppearance | undefined>(undefined);

// 保存外觀設定
function saveAppearance(appearance: ChatAppearance) {
  console.log(
    "[ChatScreen] saveAppearance 收到:",
    JSON.stringify(appearance.wallpaper, null, 2),
  );
  chatStore.updateAppearance(appearance);
  chatAppearance.value = appearance;
  // 套用外觀到當前聊天（使用 nextTick 確保 DOM 已更新）
  nextTick(() => {
    applyChatAppearance(appearance);
  });
  // 保存到 IndexedDB
  saveChat();
}

// 套用聊天外觀（只影響 ChatScreen 組件內部）
function applyChatAppearance(appearance?: ChatAppearance) {
  const container = chatScreenRef.value;
  if (!container) return;

  // 夜晚模式下不套用聊天專屬外觀，強制使用夜晚配色
  if (settingsStore.nightMode) {
    // 強制設定夜晚氣泡配色
    container.style.setProperty("--bubble-user-bg", "#2a4a3a");
    container.style.setProperty("--bubble-user-text", "#e0f0e8");
    container.style.setProperty("--bubble-ai-bg", "#1e2a40");
    container.style.setProperty("--bubble-ai-text", "#d8d8e8");
    container.style.setProperty("--chat-bubble-user-bg", "#2a4a3a");
    container.style.setProperty("--chat-bubble-user-text", "#e0f0e8");
    container.style.setProperty("--chat-bubble-ai-bg", "#1e2a40");
    container.style.setProperty("--chat-bubble-ai-text", "#d8d8e8");
    // 清除其他聊天專屬覆蓋
    container.style.removeProperty("--bubble-radius");
    container.style.removeProperty("--bubble-max-width");
    container.style.removeProperty("--color-primary");
    container.style.removeProperty("--color-primary-light");
    container.style.removeProperty("--avatar-border-radius");
    container.style.removeProperty("--avatar-size");
    container.style.removeProperty("--avatar-border-width");
    container.style.removeProperty("--avatar-border-color");
    container.style.removeProperty("--avatar-shadow");
    container.style.removeProperty("--chat-wallpaper");
    container.style.removeProperty("--chat-wallpaper-blur");
    container.style.removeProperty("--chat-wallpaper-opacity");
    container.style.removeProperty("--chat-wallpaper-fit");
    container.style.removeProperty("--chat-wallpaper-repeat");
    container.style.removeProperty("--chat-font-size");
    container.style.removeProperty("--chat-font-family");
    container.style.removeProperty("--chat-line-height");
    container.style.removeProperty("--chat-letter-spacing");
    container.style.removeProperty("--chat-md-text");
    container.style.removeProperty("--chat-md-italic");
    container.style.removeProperty("--chat-md-bold");
    container.style.removeProperty("--chat-md-underline");
    container.style.removeProperty("--chat-md-strikethrough");
    container.style.removeProperty("--chat-md-highlight");
    container.style.removeProperty("--chat-md-quote");
    container.style.removeProperty("--chat-md-code");
    container.style.removeProperty("--chat-md-heading");
    return;
  }

  if (!appearance || !appearance.useCustom) {
    // 使用全局設定，移除聊天專屬樣式
    container.style.removeProperty("--bubble-user-bg");
    container.style.removeProperty("--bubble-user-text");
    container.style.removeProperty("--bubble-ai-bg");
    container.style.removeProperty("--bubble-ai-text");
    container.style.removeProperty("--bubble-radius");
    container.style.removeProperty("--bubble-max-width");
    container.style.removeProperty("--color-primary");
    container.style.removeProperty("--color-primary-light");
    // 頭像相關
    container.style.removeProperty("--avatar-border-radius");
    container.style.removeProperty("--avatar-size");
    container.style.removeProperty("--avatar-border-width");
    container.style.removeProperty("--avatar-border-color");
    container.style.removeProperty("--avatar-shadow");
    // 桌布相關
    container.style.removeProperty("--chat-wallpaper");
    container.style.removeProperty("--chat-wallpaper-blur");
    container.style.removeProperty("--chat-wallpaper-opacity");
    container.style.removeProperty("--chat-wallpaper-fit");
    container.style.removeProperty("--chat-wallpaper-repeat");
    // 字體相關
    container.style.removeProperty("--chat-font-size");
    container.style.removeProperty("--chat-font-family");
    container.style.removeProperty("--chat-line-height");
    container.style.removeProperty("--chat-letter-spacing");
    // Markdown 顏色
    container.style.removeProperty("--chat-md-text");
    container.style.removeProperty("--chat-md-italic");
    container.style.removeProperty("--chat-md-bold");
    container.style.removeProperty("--chat-md-underline");
    container.style.removeProperty("--chat-md-strikethrough");
    container.style.removeProperty("--chat-md-highlight");
    container.style.removeProperty("--chat-md-quote");
    container.style.removeProperty("--chat-md-code");
    container.style.removeProperty("--chat-md-heading");
    return;
  }

  // 套用聊天專屬顏色
  if (appearance.colors) {
    container.style.setProperty("--color-primary", appearance.colors.primary);
    container.style.setProperty(
      "--color-primary-light",
      appearance.colors.primaryLight,
    );
  }

  // 套用聊天專屬頭像樣式
  if (appearance.avatar) {
    const avatarRadius =
      appearance.avatar.shape === "circle"
        ? "50%"
        : appearance.avatar.shape === "square"
          ? "8px"
          : "16px";
    const avatarSize =
      appearance.avatar.size === "small"
        ? "36px"
        : appearance.avatar.size === "medium"
          ? "48px"
          : "64px";
    container.style.setProperty("--avatar-border-radius", avatarRadius);
    container.style.setProperty("--avatar-size", avatarSize);
    container.style.setProperty(
      "--avatar-border-width",
      `${appearance.avatar.borderWidth}px`,
    );
    container.style.setProperty(
      "--avatar-border-color",
      appearance.avatar.borderColor,
    );
    container.style.setProperty(
      "--avatar-shadow",
      appearance.avatar.shadowEnabled
        ? "0 4px 12px var(--color-shadow)"
        : "none",
    );
  }

  // 套用聊天專屬氣泡樣式（無論有無設定都要處理，確保舊值不殘留）
  if (appearance.bubble) {
    container.style.setProperty(
      "--bubble-user-bg",
      appearance.bubble.userBgGradient || appearance.bubble.userBgColor,
    );
    container.style.setProperty(
      "--bubble-user-text",
      appearance.bubble.userTextColor,
    );
    container.style.setProperty("--bubble-ai-bg", appearance.bubble.aiBgColor);
    container.style.setProperty(
      "--bubble-ai-text",
      appearance.bubble.aiTextColor,
    );
    container.style.setProperty(
      "--bubble-radius",
      `${appearance.bubble.borderRadius}px`,
    );
    container.style.setProperty(
      "--bubble-max-width",
      `${appearance.bubble.maxWidth}%`,
    );
  } else {
    // 沒有自訂氣泡：清除容器層級的覆蓋，讓全局主題值生效
    container.style.removeProperty("--bubble-user-bg");
    container.style.removeProperty("--bubble-user-text");
    container.style.removeProperty("--bubble-ai-bg");
    container.style.removeProperty("--bubble-ai-text");
    container.style.removeProperty("--bubble-radius");
    container.style.removeProperty("--bubble-max-width");
  }

  // 套用聊天專屬桌布樣式（無論有無桌布都要處理，確保舊值不殘留）
  if (appearance.wallpaper) {
    let wallpaperValue: string;
    if (appearance.wallpaper.type === "image") {
      // 圖片類型：檢查 URL 是否有效
      const imageUrl = appearance.wallpaper.value;
      if (
        imageUrl &&
        (imageUrl.startsWith("data:") ||
          imageUrl.startsWith("blob:") ||
          imageUrl.startsWith("http"))
      ) {
        wallpaperValue = `url("${imageUrl}")`;
      } else {
        // 無效的圖片 URL，fallback 到全局桌布
        console.warn("[ChatScreen] 無效的桌布圖片 URL，使用全局桌布");
        wallpaperValue = "var(--wallpaper-value, var(--color-background))";
      }
    } else if (appearance.wallpaper.type === "time-theme") {
      // 跟隨時間：使用全局 time-theme 變數（由 theme store 動態更新）
      wallpaperValue =
        "var(--time-theme-bg, var(--wallpaper-value, var(--color-background)))";
    } else if (
      appearance.wallpaper.type === "gradient" ||
      appearance.wallpaper.type === "color"
    ) {
      // 漸層或純色：直接使用 value
      wallpaperValue =
        appearance.wallpaper.value ||
        "var(--wallpaper-value, var(--color-background))";
    } else {
      // 其他類型（pattern 等）
      wallpaperValue =
        appearance.wallpaper.value ||
        "var(--wallpaper-value, var(--color-background))";
    }
    console.log("[ChatScreen] 套用桌布:", {
      type: appearance.wallpaper.type,
      value: wallpaperValue,
      blur: appearance.wallpaper.blur,
      opacity: appearance.wallpaper.opacity,
    });
    container.style.setProperty("--chat-wallpaper", wallpaperValue);
    container.style.setProperty(
      "--chat-wallpaper-blur",
      `${appearance.wallpaper.blur ?? 0}px`,
    );
    container.style.setProperty(
      "--chat-wallpaper-opacity",
      `${(appearance.wallpaper.opacity ?? 100) / 100}`,
    );
    // 顯示模式
    const fit = appearance.wallpaper.fit || "cover";
    const bgSize =
      fit === "repeat" ? "auto" : fit === "fill" ? "100% 100%" : fit;
    container.style.setProperty("--chat-wallpaper-fit", bgSize);
    container.style.setProperty(
      "--chat-wallpaper-repeat",
      fit === "repeat" ? "repeat" : "no-repeat",
    );
  } else {
    // 沒有自訂桌布：清除所有聊天專屬桌布變數，讓全局桌布生效
    container.style.removeProperty("--chat-wallpaper");
    container.style.removeProperty("--chat-wallpaper-blur");
    container.style.removeProperty("--chat-wallpaper-opacity");
    container.style.removeProperty("--chat-wallpaper-fit");
    container.style.removeProperty("--chat-wallpaper-repeat");
  }

  // 套用聊天專屬字體樣式
  if (appearance.font) {
    // 支持新的 px 值格式（如 "16px"）或舊的名稱格式（"small"、"medium"、"large"）
    let fontSize: string;
    if (
      typeof appearance.font.size === "string" &&
      appearance.font.size.endsWith("px")
    ) {
      // 新格式：直接使用 px 值
      fontSize = appearance.font.size;
    } else {
      // 舊格式：轉換名稱為 px 值
      fontSize =
        appearance.font.size === "small"
          ? "14px"
          : appearance.font.size === "medium"
            ? "15px"
            : "17px";
    }

    const fontFamily =
      appearance.font.family === "system"
        ? '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        : appearance.font.family === "rounded"
          ? '"Nunito", "Noto Sans TC", -apple-system, sans-serif'
          : appearance.font.family === "serif"
            ? '"Noto Serif TC", "Georgia", serif'
            : '"Fira Code", "Source Code Pro", monospace';
    container.style.setProperty("--chat-font-size", fontSize);
    container.style.setProperty("--chat-font-family", fontFamily);

    // 行高和字間距
    container.style.setProperty(
      "--chat-line-height",
      `${appearance.font.lineHeight ?? 1.6}`,
    );
    container.style.setProperty(
      "--chat-letter-spacing",
      `${appearance.font.letterSpacing ?? 0}px`,
    );

    // Markdown 樣式顏色
    if (appearance.font.markdownColors) {
      const mc = appearance.font.markdownColors;
      container.style.setProperty("--chat-md-text", mc.text || "#4a4a6a");
      container.style.setProperty("--chat-md-italic", mc.italic || "#8b7355");
      container.style.setProperty("--chat-md-bold", mc.bold || "#4a4a6a");
      container.style.setProperty(
        "--chat-md-underline",
        mc.underline || "#8b2942",
      );
      container.style.setProperty(
        "--chat-md-strikethrough",
        mc.strikethrough || "#999999",
      );
      container.style.setProperty(
        "--chat-md-highlight",
        mc.highlight || "#fff3cd",
      );
      container.style.setProperty("--chat-md-quote", mc.quote || "#8b5a2b");
      container.style.setProperty("--chat-md-code", mc.code || "#e83e8c");
      container.style.setProperty("--chat-md-heading", mc.heading || "#4a4a6a");
    }
  }
}

// ===== 流式輸出窗口 =====
const streamingWindow = useStreamingWindow();
// 是否正在最小化（用於動畫）— 現在由 App.vue 管理動畫
// 保留 ref 以防其他地方引用
const isMinimizing = ref(false);

// 事件監聽取消函數
let _unregisterStreamingClose: (() => void) | null = null;
let _unregisterStreamingStop: (() => void) | null = null;
let _unregisterStreamingMinimize: (() => void) | null = null;
let _unregisterStreamingRestore: (() => void) | null = null;

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
} = useChatSummaryDiary({
  messages,
  currentChatId,
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

// 獲取最後一條 AI 訊息
const lastAIMessage = computed(() => {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    if (messages.value[i].role === "ai") {
      return messages.value[i];
    }
  }
  return null;
});

// 滾動到底部
function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
}

// 輸入框聚焦 + 鍵盤彈出後自動滾到底部
function handleInputFocusWithScroll() {
  onInputFocus();
  setTimeout(scrollToBottom, 350);
}

// ===== 搜索功能（composable） =====
const {
  showSearchBar,
  searchQuery,
  searchResults,
  currentSearchIndex,
  openSearchBar: _openSearchBar,
  closeSearchBar,
  performSearch,
  goToPrevSearchResult,
  goToNextSearchResult,
  scrollToMessage,
  ensureMessageVisible,
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

// 發送訊息（只添加用戶訊息，不觸發 AI）
function addUserMessage() {
  const text = inputText.value.trim();
  if (!text || isGenerating.value) return;

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
    replyTo: replyingTo.value?.id, // 添加回覆引用
    // 被角色封鎖時，用戶發的訊息標記為「發送失敗」（角色暫時看不到，解封後可見）
    ...(isBlockedByChar.value ? { sentWhileBlocked: true } : {}),
  };
  messages.value.push(userMessage);
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

// 處理訊息點擊
function handleMessageClick(id: string) {
  console.log("Message clicked:", id);
}

// 處理訊息編輯
function handleMessageEdit(id: string) {
  const message = messages.value.find((m) => m.id === id);
  if (message) {
    editingMessageId.value = id;
    editingContent.value = message.content;
    editingThought.value = message.thought || "";
    // 等 DOM 渲染後，將值寫入 textarea（繞過 v-model 響應式）
    nextTick(() => {
      if (editContentTextareaRef.value) {
        editContentTextareaRef.value.value = message.content;
      }
      if (editThoughtTextareaRef.value) {
        editThoughtTextareaRef.value.value = message.thought || "";
      }
    });
  }
}

// 保存編輯
async function saveEdit() {
  if (!editingMessageId.value) return;
  const message = messages.value.find((m) => m.id === editingMessageId.value);
  if (message) {
    // 從 DOM textarea 讀取最新值（不依賴 v-model 響應式）
    const content = editContentTextareaRef.value?.value ?? editingContent.value;
    const thought = editThoughtTextareaRef.value?.value ?? editingThought.value;
    message.content = content;
    message.thought = thought || undefined;
    // 同步更新跳轉魔法內容
    if (message.isTimetravel) {
      message.timetravelContent = content;
    }
    await saveChatImmediate();
  }
  cancelEdit();
}

// 取消編輯
function cancelEdit() {
  editingMessageId.value = null;
  editingContent.value = "";
  editingThought.value = "";
}

// 處理訊息刪除
async function handleMessageDelete(id: string) {
  if (confirm("確定要刪除這條訊息嗎？")) {
    messages.value = messages.value.filter((m) => m.id !== id);
    await saveChatImmediate();
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

// 處理訊息複製
function handleMessageCopy(id: string) {
  // 已在組件內處理
  console.log("Message copied:", id);
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
      `收到 ${props.characterName} 的轉帳`,
    );
    await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
  }

  saveChat();
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

// 處理滑動切換
function handleMessageSwipe(id: string, direction: "prev" | "next") {
  const msgIndex = messages.value.findIndex((m) => m.id === id);
  if (msgIndex === -1) return;

  const msg = messages.value[msgIndex];
  if (!msg.swipes || msg.swipes.length <= 1) return;

  const currentIndex = msg.swipeId ?? 0;
  let newIndex: number;

  if (direction === "next") {
    newIndex = (currentIndex + 1) % msg.swipes.length;
  } else {
    newIndex = currentIndex === 0 ? msg.swipes.length - 1 : currentIndex - 1;
  }

  // 更新訊息
  messages.value[msgIndex] = {
    ...msg,
    content: msg.swipes[newIndex],
    swipeId: newIndex,
  };

  // 保存
  saveChat();
}

// 處理重新生成（菜單版，統一使用按鈕版的 round 邏輯）
async function handleRegenerate(id: string) {
  if (isGenerating.value) return;

  const msg = messages.value.find((m) => m.id === id);
  if (!msg) return;

  if (msg.turnId) {
    await doRegenerateByTurnId(msg.turnId);
  } else {
    // fallback：舊資料沒有 turnId，找到這條訊息所在輪次的第一條 AI 訊息
    const msgIndex = messages.value.findIndex((m) => m.id === id);
    const currentRoundMessages = collectCurrentRoundMessages(msgIndex);
    const firstAI = currentRoundMessages[0];
    if (firstAI) {
      await doRegenerateFromMessage(firstAI);
    }
  }
}

// 重新生成本輪所有 AI 回覆
async function regenerateLastAIResponse() {
  if (isGenerating.value) return;

  const lastMessage = messages.value[messages.value.length - 1];
  if (!lastMessage) return;

  // 找最後一個有 turnId 的訊息，取得該輪 ID
  let lastTurnId: string | undefined;
  for (let i = messages.value.length - 1; i >= 0; i--) {
    if (messages.value[i].turnId) {
      lastTurnId = messages.value[i].turnId;
      break;
    }
  }

  if (lastMessage.role === "user") {
    // 最後一條是用戶訊息
    if (lastTurnId) {
      // 上一輪有 turnId，詢問是否重新生成上一輪
      const userChoice = confirm(
        "當前輪次尚未有 AI 回復。\n\n" +
          "點擊「確定」：重新生成上一輪 AI 回復\n" +
          "點擊「取消」：生成本輪 AI 回復",
      );
      if (userChoice) {
        // 先刪掉本輪所有 user 訊息（lastTurnId 之後到結尾的 user 訊息）
        const lastTurnLastIdx = messages.value.reduce(
          (acc, m, i) => (m.turnId === lastTurnId ? i : acc),
          -1,
        );
        if (lastTurnLastIdx !== -1) {
          messages.value = messages.value.slice(0, lastTurnLastIdx + 1);
        }
        await doRegenerateByTurnId(lastTurnId);
      } else {
        currentTurnId.value = crypto.randomUUID();
        await triggerAIResponse({ skipAutoTrigger: true });
      }
    } else {
      // 沒有任何 turnId（舊資料），也要詢問
      const firstAIOfLastRound = findFirstAIMessageOfLastRound();
      if (firstAIOfLastRound) {
        const userChoice = confirm(
          "當前輪次尚未有 AI 回復。\n\n" +
            "點擊「確定」：重新生成上一輪 AI 回復\n" +
            "點擊「取消」：生成本輪 AI 回復",
        );
        if (userChoice) {
          // 先刪掉本輪 user 訊息（最後一個 AI 訊息之後的所有訊息）
          const lastAIIdx = messages.value.reduce(
            (acc, m, i) => (m.role === "ai" || m.role === "system" ? i : acc),
            -1,
          );
          if (lastAIIdx !== -1) {
            messages.value = messages.value.slice(0, lastAIIdx + 1);
          }
          await doRegenerateFromMessage(firstAIOfLastRound);
        } else {
          currentTurnId.value = crypto.randomUUID();
          await triggerAIResponse({ skipAutoTrigger: true });
        }
      } else {
        // 完全沒有 AI 訊息，直接生成
        currentTurnId.value = crypto.randomUUID();
        await triggerAIResponse({ skipAutoTrigger: true });
      }
    }
    return;
  }

  // 最後一條是 AI 訊息，重新生成最後一輪
  if (lastTurnId) {
    await doRegenerateByTurnId(lastTurnId);
  } else {
    // 舊資料沒有 turnId，fallback 到舊邏輯
    const firstAIOfCurrentRound = findFirstAIMessageOfCurrentRound();
    if (firstAIOfCurrentRound) {
      await doRegenerateFromMessage(firstAIOfCurrentRound);
    }
  }
}

// 找到當前輪次的第一條 AI 訊息（最後一條用戶訊息之後的第一條 AI 或 AI 產生的系統訊息）
function findFirstAIMessageOfCurrentRound(): Message | null {
  // 從後往前找最後一條用戶訊息
  let lastUserIndex = -1;
  for (let i = messages.value.length - 1; i >= 0; i--) {
    if (messages.value[i].role === "user") {
      lastUserIndex = i;
      break;
    }
  }

  // 找到該用戶訊息之後的第一條 AI 訊息或 AI 產生的系統訊息（如 timetravel）
  if (lastUserIndex >= 0) {
    for (let i = lastUserIndex + 1; i < messages.value.length; i++) {
      const msg = messages.value[i];
      if (msg.role === "ai" || (msg.role === "system" && msg.isTimetravel)) {
        return msg;
      }
    }
  }

  // 如果沒有用戶訊息，返回第一條 AI 訊息
  return messages.value.find((m) => m.role === "ai") || null;
}

// 找到上一輪的第一條 AI 訊息（最後一條用戶訊息之前的那一輪）
function findFirstAIMessageOfLastRound(): Message | null {
  // 從後往前找，跳過最後的用戶訊息序列，找到 AI 訊息序列的開頭
  let foundLastUser = false;
  let lastAIIndex = -1;

  for (let i = messages.value.length - 1; i >= 0; i--) {
    const msg = messages.value[i];
    if (msg.role === "user") {
      if (!foundLastUser) {
        foundLastUser = true;
      } else if (lastAIIndex !== -1) {
        // 找到了上一輪用戶訊息，返回其後的第一條 AI 訊息
        for (let j = i + 1; j < messages.value.length; j++) {
          if (messages.value[j].role === "ai") {
            return messages.value[j];
          }
        }
      }
    } else if (msg.role === "ai" && foundLastUser) {
      lastAIIndex = i;
    }
  }

  // 如果只有一輪，返回第一條 AI 訊息
  if (lastAIIndex !== -1) {
    // 找到這一輪 AI 訊息的開頭
    for (let i = 0; i <= lastAIIndex; i++) {
      if (messages.value[i].role === "ai") {
        // 檢查前面是否有用戶訊息
        let hasUserBefore = false;
        for (let j = i - 1; j >= 0; j--) {
          if (messages.value[j].role === "user") {
            hasUserBefore = true;
            break;
          }
        }
        if (hasUserBefore || i === 0) {
          // 找到用戶訊息後的第一條 AI
          for (let j = 0; j < messages.value.length; j++) {
            if (messages.value[j].role === "user") {
              for (let k = j + 1; k < messages.value.length; k++) {
                if (messages.value[k].role === "ai") {
                  return messages.value[k];
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

// 找到最後一條用戶訊息之前的最後一條 AI 訊息（已棄用，保留兼容）
function findLastAIMessageBeforeUser(): Message | null {
  // 從後往前找，跳過最後的用戶訊息，找到 AI 訊息
  let foundUser = false;
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const msg = messages.value[i];
    if (msg.role === "user") {
      foundUser = true;
      continue;
    }
    if (foundUser && msg.role === "ai") {
      return msg;
    }
  }
  return null;
}

// 收集當前輪次的 AI 訊息（從 targetIndex 開始到下一條用戶訊息之前）
function collectCurrentRoundMessages(targetIndex: number): Message[] {
  const roundMessages: Message[] = [];
  for (let i = targetIndex; i < messages.value.length; i++) {
    const msg = messages.value[i];
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

// 找到當前輪次中攜帶 roundSwipes 的訊息（通常是最後一條 AI 訊息）
function findRoundSwipeCarrier(roundMessages: Message[]): Message | null {
  for (let i = roundMessages.length - 1; i >= 0; i--) {
    if (roundMessages[i].roundSwipes) return roundMessages[i];
  }
  return null;
}

// 用 turnId 執行重新生成（新邏輯）
async function doRegenerateByTurnId(turnId: string) {
  const currentRoundMessages = messages.value.filter(
    (m) => m.turnId === turnId,
  );
  if (currentRoundMessages.length === 0) return;

  // 取得已有的 roundSwipes
  const carrier = findRoundSwipeCarrier(currentRoundMessages);
  const existingSwipes: Message[][] = carrier?.roundSwipes
    ? [...carrier.roundSwipes]
    : [];
  const existingSwipeId = carrier?.roundSwipeId ?? -1;

  // 深拷貝當前輪次（清除 roundSwipes 避免嵌套）
  const savedRound: Message[] = currentRoundMessages.map((m) => {
    const clone = { ...m };
    delete clone.roundSwipes;
    delete clone.roundSwipeId;
    return clone;
  });

  if (existingSwipes.length === 0) {
    existingSwipes.push(savedRound);
  } else {
    if (existingSwipeId >= 0 && existingSwipeId < existingSwipes.length) {
      existingSwipes[existingSwipeId] = savedRound;
    } else {
      existingSwipes.push(savedRound);
    }
  }

  pendingRoundSwipes.value = existingSwipes;

  // 刪除這輪所有訊息
  messages.value = messages.value.filter((m) => m.turnId !== turnId);

  // 生成新的 turnId 並重新生成
  currentTurnId.value = crypto.randomUUID();
  await triggerAIResponse({ skipAutoTrigger: true });
}

// 執行重新生成：保存當前輪次到 roundSwipes，刪除後重新生成（舊邏輯，作為 fallback）
async function doRegenerateFromMessage(targetAIMessage: Message) {
  const targetIndex = messages.value.findIndex(
    (m) => m.id === targetAIMessage.id,
  );
  if (targetIndex === -1) return;

  // 收集當前輪次的 AI 訊息
  const currentRoundMessages = collectCurrentRoundMessages(targetIndex);
  if (currentRoundMessages.length === 0) {
    console.warn("[ChatScreen] 沒有 AI 訊息需要重新生成");
    return;
  }

  // 取得已有的 roundSwipes（可能之前已經重新生成過）
  const carrier = findRoundSwipeCarrier(currentRoundMessages);
  const existingSwipes: Message[][] = carrier?.roundSwipes
    ? [...carrier.roundSwipes]
    : [];
  const existingSwipeId = carrier?.roundSwipeId ?? -1;

  // 深拷貝當前輪次訊息（清除 roundSwipes 避免嵌套）
  const savedRound: Message[] = currentRoundMessages.map((m) => {
    const clone = { ...m };
    delete clone.roundSwipes;
    delete clone.roundSwipeId;
    return clone;
  });

  // 如果 existingSwipes 為空，這是第一次重新生成，把當前輪次作為第一個候選
  if (existingSwipes.length === 0) {
    existingSwipes.push(savedRound);
  } else {
    // 如果當前顯示的不是最新生成的（用戶切換過），替換當前位置
    if (existingSwipeId >= 0 && existingSwipeId < existingSwipes.length) {
      existingSwipes[existingSwipeId] = savedRound;
    } else {
      existingSwipes.push(savedRound);
    }
  }

  console.log(
    `[ChatScreen] 重新生成：保存輪次（共 ${existingSwipes.length} 個候選），刪除 ${currentRoundMessages.length} 條 AI 訊息`,
  );

  // 暫存 roundSwipes 資料，等新訊息生成後附加上去
  pendingRoundSwipes.value = existingSwipes;

  // 刪除當前輪次的訊息
  const idsToDelete = new Set(currentRoundMessages.map((m) => m.id));
  messages.value = messages.value.filter((m) => !idsToDelete.has(m.id));

  // 生成新的 turnId 並重新觸發 AI 生成
  currentTurnId.value = crypto.randomUUID();
  await triggerAIResponse({ skipAutoTrigger: true });
}

// 暫存的 roundSwipes（等待新生成完成後附加到最後一條 AI 訊息）
const pendingRoundSwipes = ref<Message[][] | null>(null);

// 當前輪次 ID（user 送出訊息時生成，本輪所有 AI 生成內容都帶此 ID）
const currentTurnId = ref<string>("");

// 將 roundSwipes 附加到最後一條 AI 訊息上（在 triggerAIResponse 完成後調用）
function attachPendingRoundSwipes() {
  if (!pendingRoundSwipes.value) return;

  // 找到當前輪次的最後一條 AI 訊息
  let lastAI: Message | null = null;
  for (let i = messages.value.length - 1; i >= 0; i--) {
    if (messages.value[i].role === "ai") {
      lastAI = messages.value[i];
      break;
    }
  }

  if (lastAI) {
    // 用 currentTurnId 收集新生成的這一輪訊息（比舊的 findFirstAIMessageOfCurrentRound 更精確）
    const newRound = (
      currentTurnId.value
        ? messages.value.filter((m) => m.turnId === currentTurnId.value)
        : (() => {
            const firstAI = findFirstAIMessageOfCurrentRound();
            if (!firstAI) return [];
            const idx = messages.value.findIndex((m) => m.id === firstAI.id);
            return collectCurrentRoundMessages(idx);
          })()
    ).map((m) => {
      const clone = { ...m };
      delete clone.roundSwipes;
      delete clone.roundSwipeId;
      return clone;
    });

    if (newRound.length > 0) {
      pendingRoundSwipes.value.push(newRound);
    }

    lastAI.roundSwipes = pendingRoundSwipes.value;
    lastAI.roundSwipeId = pendingRoundSwipes.value.length - 1;
    console.log(
      `[ChatScreen] 附加 roundSwipes：${pendingRoundSwipes.value.length} 個候選，當前索引 ${lastAI.roundSwipeId}`,
    );
  }

  pendingRoundSwipes.value = null;
}

// 切換整輪 AI 回覆
function handleRoundSwipe(lastAIMessageId: string, direction: "prev" | "next") {
  // 找到攜帶 roundSwipes 的訊息
  const carrierIndex = messages.value.findIndex(
    (m) => m.id === lastAIMessageId,
  );
  if (carrierIndex === -1) return;

  const carrier = messages.value[carrierIndex];
  if (!carrier.roundSwipes || carrier.roundSwipes.length <= 1) return;

  const currentIdx = carrier.roundSwipeId ?? 0;
  let newIdx: number;
  if (direction === "next") {
    newIdx = (currentIdx + 1) % carrier.roundSwipes.length;
  } else {
    newIdx = currentIdx === 0 ? carrier.roundSwipes.length - 1 : currentIdx - 1;
  }

  // 取得目標輪次的訊息
  const targetRound = carrier.roundSwipes[newIdx];
  if (!targetRound || targetRound.length === 0) return;

  // 先保存當前輪次到 roundSwipes（更新當前位置的快照）
  const firstAI = findFirstAIMessageOfCurrentRound();
  if (firstAI) {
    const firstAIIndex = messages.value.findIndex((m) => m.id === firstAI.id);
    const currentRound = (
      currentTurnId.value
        ? messages.value.filter((m) => m.turnId === currentTurnId.value)
        : collectCurrentRoundMessages(firstAIIndex)
    ).map((m) => {
      const clone = { ...m };
      delete clone.roundSwipes;
      delete clone.roundSwipeId;
      return clone;
    });
    carrier.roundSwipes[currentIdx] = currentRound;
  }

  // 找到當前輪次的範圍
  let startIdx: number = -1;
  let endIdx = messages.value.length;

  if (currentTurnId.value) {
    // 用 turnId 找範圍
    startIdx = messages.value.findIndex(
      (m) => m.turnId === currentTurnId.value,
    );
    if (startIdx !== -1) {
      // endIdx 就是最後一個同 turnId 訊息的下一位
      for (let i = messages.value.length - 1; i >= 0; i--) {
        if (messages.value[i].turnId === currentTurnId.value) {
          endIdx = i + 1;
          break;
        }
      }
    }
  }

  // fallback：turnId 找不到時用舊邏輯（相容舊資料或切換到無 turnId 的輪次後）
  if (startIdx === -1) {
    const firstAICurrent = findFirstAIMessageOfCurrentRound();
    if (!firstAICurrent) return;
    startIdx = messages.value.findIndex((m) => m.id === firstAICurrent.id);
    if (startIdx === -1) return;
    endIdx = messages.value.length;
    for (let i = startIdx + 1; i < messages.value.length; i++) {
      if (messages.value[i].role === "user") {
        endIdx = i;
        break;
      }
    }
  }

  // 替換訊息：在目標輪次的最後一條 AI 訊息上附加 roundSwipes
  const newMessages = targetRound.map((m, i) => {
    const clone = { ...m };
    // 在最後一條訊息上附加 roundSwipes
    if (i === targetRound.length - 1) {
      clone.roundSwipes = carrier.roundSwipes;
      clone.roundSwipeId = newIdx;
    }
    return clone;
  });

  // 替換訊息列表中的對應範圍
  messages.value.splice(startIdx, endIdx - startIdx, ...newMessages);

  // 同步 currentTurnId 為切換後輪次的 turnId（若無則清空，讓下次走 fallback）
  const restoredTurnId = newMessages.find((m) => m.turnId)?.turnId;
  currentTurnId.value = restoredTurnId || "";

  saveChat();
}

// 清除所有 roundSwipes（用戶發送新訊息時調用）
function clearRoundSwipes() {
  for (const msg of messages.value) {
    if (msg.roundSwipes) {
      delete msg.roundSwipes;
      delete msg.roundSwipeId;
    }
  }
}

// 繼續生成（讓 AI 繼續未完成的回覆）
async function continueGeneration() {
  if (!lastAIMessage.value || isGenerating.value) return;

  // 清理最後一條 AI 訊息的滑動選項（只保留當前選中的內容）
  clearSwipesOnLastAIMessage();

  // 添加一個提示讓 AI 繼續
  const continuePrompt: Message = {
    id: `msg_continue_${Date.now()}`,
    role: "user",
    content: "[繼續]",
    timestamp: Date.now(),
  };
  messages.value.push(continuePrompt);

  await triggerAIResponse();
}

// 清理最後一條 AI 訊息的滑動選項（只保留當前選中的內容）
function clearSwipesOnLastAIMessage() {
  const lastAI = lastAIMessage.value;
  if (!lastAI) return;

  const msgIndex = messages.value.findIndex((m) => m.id === lastAI.id);
  if (msgIndex !== -1) {
    const msg = messages.value[msgIndex];
    // 清除滑動數據，只保留當前內容
    messages.value[msgIndex] = {
      ...msg,
      swipes: undefined,
      swipeId: undefined,
    };
  }
}

// 觸發 AI 回覆（不發送用戶訊息，只生成 AI 回覆）
// skipAutoTrigger: 跳過自動觸發總結/日記（用於重新生成場景）
async function triggerAIResponse(options?: {
  skipAutoTrigger?: boolean;
  holidayTriggerPrompt?: string;
  postCallPrompt?: string;
  audioApiMessage?: { role: string; content: any };
  theaterNudge?: boolean;
  bypassBlockCheck?: boolean; // 好友申請等特殊場景需要繞過封鎖檢查
}) {
  if (!currentChatId.value) return;
  if (isGenerating.value) return;
  // 被角色封鎖期間，除非明確繞過（如好友申請），否則不觸發 AI 生成
  if (isBlockedByChar.value && !options?.bypassBlockCheck) return;

  // 使用全局狀態管理開始生成
  const startResult = aiGenerationStore.startGeneration(
    currentChatId.value,
    "chat",
    {
      characterName: currentCharacter.value?.data?.name || props.characterName,
      characterAvatar: props.characterAvatar,
    },
  );

  if (!startResult.success) {
    console.warn("[ChatScreen] 無法開始生成:", startResult.error);
    return;
  }

  const controller = startResult.controller!;

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

    let messagesToUse: typeof messages.value;
    if (actualMode === "turn") {
      // 按輪次讀取：每輪 = 用戶發言 + AI 回覆
      let turnCount = 0;
      let startIndex = messages.value.length;
      for (let i = messages.value.length - 1; i >= 0; i--) {
        if (messages.value[i].role === "ai") {
          turnCount++;
          if (turnCount >= actualCount) {
            // 往前找到這輪的 user 消息
            for (let j = i - 1; j >= 0; j--) {
              if (messages.value[j].role === "user") {
                startIndex = j;
                break;
              }
            }
            if (startIndex === messages.value.length) {
              startIndex = i;
            }
            break;
          }
        }
        startIndex = i;
      }
      messagesToUse = messages.value.slice(startIndex);
    } else {
      // 按消息數讀取
      messagesToUse = messages.value.slice(-actualCount);
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
            : char.data.name,
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
            location: overrideWeather.location.name,
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
        location: weatherStore.locationName,
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

    // 準備角色世界設定（若有位置且無手動天氣，自動查詢即時天氣）
    let charWorldSettings = char.worldSettings
      ? { ...char.worldSettings }
      : undefined;
    if (charWorldSettings?.location && !charWorldSettings.weatherOverride) {
      try {
        const charWeather = await getWeatherByCity(charWorldSettings.location);
        charWorldSettings = {
          ...charWorldSettings,
          weatherOverride: `${charWeather.current.condition.text}，${Math.round(charWeather.current.temp_c)}°C（體感 ${Math.round(charWeather.current.feelslike_c)}°C，濕度 ${charWeather.current.humidity}%）`,
        };
      } catch {
        // 查詢失敗時保留原設定，不影響其他功能
        console.warn("[ChatScreen] 角色世界設定天氣查詢失敗");
      }
    }

    // 準備表情包列表（只取自定義表情的名稱）
    const stickerNames = stickerStore.customCategories
      .flatMap((cat) => cat.stickers)
      .map((s) => s.name)
      .filter((name) => name && name.trim());

    const waimaiAuthorsNote = buildWaimaiAuthorsNote(messagesToUse);

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
      authorsNote: waimaiAuthorsNote,
      // 傳入提示詞管理器配置，使用用戶自定義的角色和位置設定
      promptManagerConfig: promptManagerStore.config,
      // 傳入總結和重要事件
      summaries: summariesToSend,
      importantEvents: eventsToSend,
      // 向量記憶檢索結果（啟用時優先使用語義檢索）
      vectorMemories,
      // 傳入天氣數據
      weatherInfo: weatherInfoToSend,
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
                name: char?.data?.name || char?.nickname || m.characterId,
                nickname: m.nickname,
                personality: char?.data?.personality || "",
                description: char?.data?.description || "",
                avatar: char?.avatar || "",
                isAdmin: m.isAdmin,
                isMuted: m.isMuted,
              };
            })
          : undefined,
      groupName: isGroupChat.value ? groupMetadata.value?.groupName : undefined,
      // 傳入書影記錄
      mediaLogs: userStore.mediaLogSettings.showInPrompt
        ? formatMediaLogsForPrompt(
            userStore.mediaLogs,
            userStore.mediaLogSettings.maxLogsInPrompt,
          )
        : undefined,
      // 傳入好感度配置和狀態
      affinityConfig: _affinityConfig.value ?? undefined,
      affinityState: _affinityState.value ?? undefined,
    });

    const promptResult = await builder.build();

    // 將消息轉換為 API 格式（處理圖片訊息）
    // 只保留最後一條帶圖片的用戶訊息的 base64 數據，歷史圖片用文字描述替代
    // 避免大量 base64 數據導致請求 body 過大（nginx 413 錯誤）
    const reversedIndices = promptResult.messages.map((_, i) => i).reverse();
    const lastImageMsgIndex = reversedIndices.find((i) => {
      const msg = promptResult.messages[i] as any;
      return msg.role === "user" && msg.imageData && msg.imageMimeType;
    });

    const apiMessages = promptResult.messages.map((m, index) => {
      const msgWithImage = m as any;
      if (msgWithImage.imageData && msgWithImage.imageMimeType) {
        if (index === lastImageMsgIndex) {
          // 最後一條帶圖片的用戶訊息：保留 base64 給 Vision API
          return createImageMessage(
            m.content,
            msgWithImage.imageData,
            msgWithImage.imageMimeType,
            "auto",
          );
        }
        // 歷史圖片訊息：去掉 base64，用文字描述替代
        const caption = msgWithImage.imageCaption || "";
        const prompt = msgWithImage.imagePrompt || "";
        const desc = caption || prompt || "圖片";
        return {
          role: m.role,
          content: m.content
            ? `${m.content}\n[圖片：${desc}]`
            : `[圖片：${desc}]`,
        };
      }
      // 普通文字訊息
      return {
        role: m.role,
        content: m.content,
      };
    });

    const client = new OpenAICompatibleClient(chatTaskConfig.api);

    // 🎉 如果是節日觸發，附加節日提示詞到 API 訊息末尾（不存入聊天記錄）
    if (options?.holidayTriggerPrompt) {
      apiMessages.push({
        role: "user",
        content: options.holidayTriggerPrompt,
      });
    }

    // 📞 如果是來電後反應，附加 postCallPrompt 到 API 訊息末尾（不存入聊天記錄）
    if (options?.postCallPrompt) {
      apiMessages.push({
        role: "user",
        content: options.postCallPrompt,
      });
    }

    // 🎤 如果是語音訊息，替換最後一條用戶訊息為帶音頻的 API 訊息
    if (options?.audioApiMessage) {
      // 找到最後一條 user 訊息並替換為帶音頻的版本
      for (let i = apiMessages.length - 1; i >= 0; i--) {
        if (apiMessages[i].role === "user") {
          apiMessages[i] = options.audioApiMessage as any;
          break;
        }
      }
    }

    // 🎭 確保 API 最後一條消息是 user role（部分 API 要求）
    // 當小劇場指令是最後一條時，補一條隱藏催促消息
    if (options?.theaterNudge) {
      apiMessages.push({
        role: "user",
        content: "[請根據上述場景指令，以角色身份繼續扮演]",
      });
    }

    // 創建 AI 訊息佔位符（用於流式輸出）
    const aiMessage: Message = {
      id: `msg_${Date.now()}`,
      role: "ai",
      content: "",
      timestamp: Date.now(),
      isStreaming: true,
      turnId: currentTurnId.value || undefined,
    };
    messages.value.push(aiMessage);
    scrollToBottom();

    // 根據設定決定是否使用串流
    const isStreamingEnabled = chatTaskConfig.generation.streamingEnabled;
    // 只有在串流開啟時才可能使用流式輸出窗口
    const useWindow = isStreamingEnabled && useStreamingWindowEnabled.value;

    if (useWindow) {
      // 顯示流式輸出窗口
      streamingWindow.show(chatTaskConfig.api.model);
      // 傳入提示詞內容（用於調試面板查看/隱藏）
      streamingWindow.setPromptContent(
        apiMessages.map((m) => ({
          role: String(m.role),
          content:
            typeof m.content === "string"
              ? m.content
              : JSON.stringify(m.content),
        })),
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

    let fullContent = "";

    if (!isStreamingEnabled) {
      // ===== 非流式模式：一次性取得完整回覆 =====
      const result = await client.generate({
        messages: apiMessages,
        settings: chatSettings,
        apiSettings: chatTaskConfig.api,
        signal: controller.signal,
        adjustLastMessageRole: true,
      });
      fullContent = result.content;

      // 傳入 token 使用量到流式窗口（非流式模式也支援）
      if (useWindow && result.tokenCount) {
        streamingWindow.setUsage({
          prompt_tokens: result.tokenCount.prompt,
          completion_tokens: result.tokenCount.completion,
          total_tokens: result.tokenCount.total,
        });
      }

      // 直接處理完整回覆（套用角色 regex_scripts AI_OUTPUT）
      const finalContent = applyAIOutputRegex(fullContent);
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

        if (msgIndex !== -1) {
          messages.value[msgIndex].content =
            "[空回應] API 返回了空內容，可能是網路不穩或連線中斷，請重試";
          messages.value[msgIndex].isStreaming = false;
        }
      } else {
        // 群聊/多人卡模式：使用群聊解析器
        if (useGroupChatParser.value) {
          const parsed = parseGroupChatResponse(finalContent);

          // 移除原始的佔位訊息
          if (msgIndex !== -1) {
            messages.value.splice(msgIndex, 1);
          }

          for (let i = 0; i < parsed.messages.length; i++) {
            const parsedMsg = parsed.messages[i];
            const senderName = parsedMsg.senderName || "";
            const senderCharId = getGroupMemberIdByName(senderName);
            const senderAvatar = getGroupMemberAvatar(senderName);

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
                turnId: currentTurnId.value || undefined,
                isPrivateMessage: true,
                senderCharacterId: senderCharId,
                senderCharacterName: senderName,
                senderCharacterAvatar: senderAvatar,
              };
              messages.value.push(dmNotice);

              // 嘗試找到對應角色的 1v1 聊天並插入訊息，找不到則自動建立
              if (senderCharId) {
                try {
                  const allChats = await db.getAll<Chat>(DB_STORES.CHATS);
                  const existingChat = allChats.find(
                    (c) => c.characterId === senderCharId && !c.isGroupChat,
                  );

                  // 如果沒有 1v1 聊天，自動建立一個
                  const targetChat: Chat =
                    existingChat || createDefaultChat(senderCharId, senderName);
                  if (!existingChat) {
                  }

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

                  // 直接把訊息加到 chat.messages
                  if (!targetChat.messages) targetChat.messages = [];
                  targetChat.messages.push(...newDmMessages);
                  targetChat.lastMessagePreview =
                    dmMessage.content?.slice(0, 100) || "";
                  targetChat.messageCount = targetChat.messages.length;
                  targetChat.updatedAt = Date.now();
                  await db.put(
                    DB_STORES.CHATS,
                    JSON.parse(JSON.stringify(targetChat)),
                  );
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

            // 普通群聊訊息（非通話狀態）
            if (
              !parsedMsg.content &&
              !parsedMsg.isStickerMsg &&
              !parsedMsg.isVoice &&
              !parsedMsg.isAiImage
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
              turnId: currentTurnId.value || undefined,
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
            if (parsedMsg.isWaimaiPaymentResult || parsedMsg.isWaimaiDelivery) {
              const recentOrder = findLatestWaimaiOrder(messages.value);
              if (recentOrder) {
                const clonedOrder = JSON.parse(JSON.stringify(recentOrder));
                if (
                  parsedMsg.isWaimaiPaymentResult &&
                  parsedMsg.waimaiPaymentStatus
                ) {
                  clonedOrder.status = parsedMsg.waimaiPaymentStatus;
                  if (parsedMsg.waimaiPaymentStatus === "paid")
                    clonedOrder.paidAt = Date.now();
                  newMessage.isWaimaiPaymentResult = true;
                }
                if (parsedMsg.isWaimaiDelivery) {
                  clonedOrder.status = "delivered";
                  clonedOrder.deliveredAt = Date.now();
                  newMessage.isWaimaiDelivery = true;
                }
                newMessage.waimaiOrder = clonedOrder;
              }
            }

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
            processMessageTTS(newMessage.id, newMessage.content);
          }

          // Fallback
          if (parsed.messages.length === 0 && finalContent) {
            messages.value.push({
              id: `msg_${Date.now()}_fallback`,
              role: "ai",
              content: parsed.rawOutput || finalContent,
              timestamp: Date.now(),
              turnId: currentTurnId.value || undefined,
            });
          }

          // 群聊也支援行事曆事件標籤
          const gcCalendarEvents = parseCalendarEventTags(finalContent);
          if (gcCalendarEvents.length > 0) {
            for (const calEvent of gcCalendarEvents) {
              await handleCalendarEvent(calEvent);
            }
          }
        }
        // 非群聊模式：檢查是否需要解析（包含導演系統標籤）
        else if (needsParsing(finalContent)) {
          let parsed;
          try {
            parsed = parseAIResponse(finalContent);
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
              await handleScheduleCall(parsed.scheduleCallData);
            }

            // 處理行事曆事件標籤
            if (parsed.hasCalendarEvent && parsed.calendarEvents) {
              for (const calEvent of parsed.calendarEvents) {
                await handleCalendarEvent(calEvent);
              }
            }

            // 處理時間跳轉標籤（偏移時間模式）
            if (
              parsed.hasTimeJump &&
              parsed.timeJumpTarget &&
              fakeTime.fakeTimeMode.value === "offset"
            ) {
              fakeTime.jumpToTime(parsed.timeJumpTarget);
              await saveChat();
            }

            // 處理噗浪發文
            if (parsed.hasPlurkPost && parsed.plurkContent) {
              await handlePlurkPost(parsed.plurkContent);
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
                  await blockSvc.handleCharacterBlock(
                    currentChatId.value,
                    action.reason || "",
                  );
                  // 即時更新 UI 封鎖狀態
                  isBlockedByChar.value = true;
                  const updatedChat = await db.get<Chat>(
                    DB_STORES.CHATS,
                    currentChatId.value,
                  );
                  if (updatedChat && currentChatData.value) {
                    currentChatData.value.blockState = updatedChat.blockState;
                  }
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
                  isBlockedByChar.value = false;
                  const updatedChat = await db.get<Chat>(
                    DB_STORES.CHATS,
                    currentChatId.value,
                  );
                  if (updatedChat && currentChatData.value) {
                    currentChatData.value.blockState = updatedChat.blockState;
                  }
                }
              }
            }

            // 處理好感度更新（移至訊息建立後，以便綁定快照到第一條新 AI 訊息）
            let _pendingAffinityUpdates = parsed.hasAffinityUpdate
              ? parsed.affinityUpdates
              : null;

            // 移除原始的佔位訊息
            if (msgIndex !== -1) {
              messages.value.splice(msgIndex, 1);
            }

            // 為每個解析後的訊息創建獨立的聊天訊息
            let _firstNewAiMsgId: string | undefined;
            for (let i = 0; i < parsed.messages.length; i++) {
              const parsedMsg = parsed.messages[i];

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
                !parsedMsg.isWaimaiDelivery
              ) {
                continue;
              }

              // 時空跳轉訊息使用 system role，這樣會渲染成特殊的系統訊息樣式
              const messageRole: "user" | "ai" | "system" =
                parsedMsg.isTimetravel ? "system" : "ai";
              const newMessage: Message = {
                id: `msg_${Date.now()}_${i}`,
                role: messageRole,
                content:
                  parsedMsg.isAiImage && parsedMsg.imageDescription
                    ? `<pic>${parsedMsg.imageDescription}</pic>`
                    : parsedMsg.isHtmlBlock
                      ? ""
                      : parsedMsg.isVoice
                        ? `[語音訊息] ${parsedMsg.voiceContent || ""}`
                        : parsedMsg.content,
                timestamp: Date.now() + i, // 確保時間戳遞增
                turnId: currentTurnId.value || undefined,
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
                // AI 發送的轉帳為 pending 狀態，AI 發送的退回直接處理
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
              };

              // 外賣付款結果/送達：從最近訊息中找到訂單快照並附加
              if (
                parsedMsg.isWaimaiPaymentResult ||
                parsedMsg.isWaimaiDelivery
              ) {
                const recentOrder = findLatestWaimaiOrder(messages.value);
                if (recentOrder) {
                  const clonedOrder = JSON.parse(JSON.stringify(recentOrder));
                  if (
                    parsedMsg.isWaimaiPaymentResult &&
                    parsedMsg.waimaiPaymentStatus
                  ) {
                    clonedOrder.status = parsedMsg.waimaiPaymentStatus;
                    if (parsedMsg.waimaiPaymentStatus === "paid")
                      clonedOrder.paidAt = Date.now();
                    newMessage.isWaimaiPaymentResult = true;
                  }
                  if (parsedMsg.isWaimaiDelivery) {
                    clonedOrder.status = "delivered";
                    clonedOrder.deliveredAt = Date.now();
                    newMessage.isWaimaiDelivery = true;
                  }
                  newMessage.waimaiOrder = clonedOrder;
                }
              }

              messages.value.push(newMessage);

              // 記錄第一條新 AI 訊息的 ID，用於好感度快照綁定
              if (!_firstNewAiMsgId && newMessage.role === "ai") {
                _firstNewAiMsgId = newMessage.id;
              }

              // 處理換頭像動作
              if (parsedMsg.isAvatarChange && parsedMsg.avatarChangeAction) {
                await handleAvatarChange(
                  parsedMsg.avatarChangeAction,
                  parsedMsg.avatarChangeMood,
                  parsedMsg.avatarChangeDesc,
                );
              }

              // 處理 AI 的退回標籤（退回用戶之前的轉帳）
              if (
                parsedMsg.isTransfer &&
                parsedMsg.transferType === "refund" &&
                parsedMsg.transferAmount
              ) {
                await processAIRefund(parsedMsg.transferAmount);
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
              processMessageTTS(newMessage.id, newMessage.content);
            }

            // 處理好感度更新（在訊息建立後呼叫，綁定快照到第一條新 AI 訊息）
            if (_pendingAffinityUpdates && _pendingAffinityUpdates.length > 0) {
              _handleAffinityUpdates(_pendingAffinityUpdates, _firstNewAiMsgId);
            }

            // 將原始 <update> 區塊附加到最後一條 AI 訊息，供重新掃描使用
            if (parsed.rawUpdateBlock) {
              const lastAiMsg = [...messages.value]
                .reverse()
                .find(
                  (m) => m.role === "ai" && m.turnId === currentTurnId.value,
                );
              if (lastAiMsg) {
                lastAiMsg._rawAffinityBlock = parsed.rawUpdateBlock;
              }
            }

            // 如果沒有解析出任何訊息，保留原始內容
            if (parsed.messages.length === 0) {
              const fallbackMessage: Message = {
                id: aiMessage.id,
                role: "ai",
                content: parsed.rawOutput || finalContent,
                timestamp: Date.now(),
                turnId: currentTurnId.value || undefined,
              };
              messages.value.push(fallbackMessage);
            }
          }
        } else {
          // 不需要解析，直接使用原始內容
          // 但仍需抽取心聲標記（ˇ想法ˇ 或 ~(想法)~），否則心聲氣泡無法點擊 / 編輯
          if (msgIndex !== -1) {
            let cleanedFinal = finalContent;
            let extractedThought: string | undefined;
            const _tnNew = finalContent.match(/ˇ([^ˇ]+)ˇ/g);
            if (_tnNew && _tnNew.length > 0) {
              const _im = _tnNew[_tnNew.length - 1].match(/ˇ([^ˇ]+)ˇ/);
              if (_im) extractedThought = _im[1];
              cleanedFinal = finalContent.replace(/\s*ˇ[^ˇ]+ˇ/g, "").trim();
            } else {
              const _tnOld = finalContent.match(/~\(([^)]+)\)~/g);
              if (_tnOld && _tnOld.length > 0) {
                const _im = _tnOld[_tnOld.length - 1].match(/~\(([^)]+)\)~/);
                if (_im) extractedThought = _im[1];
                cleanedFinal = finalContent
                  .replace(/\s*~\([^)]+\)~/g, "")
                  .trim();
              }
            }
            messages.value[msgIndex].content = cleanedFinal;
            messages.value[msgIndex].thought = extractedThought;
            messages.value[msgIndex].isStreaming = false;
          }
        }
      } // 結束空回應 else 塊
    } else {
      // ===== 流式模式：逐 token 接收 =====
      const streamGenerator = client.generateStream({
        messages: apiMessages,
        settings: chatSettings,
        apiSettings: chatTaskConfig.api,
        signal: controller.signal,
        adjustLastMessageRole: true,
      });

      for await (const event of streamGenerator) {
        if (event.type === "token" && event.token) {
          fullContent += event.token;

          // 同步流式內容到全局 store（離開頁面後可恢復）
          if (currentChatId.value) {
            aiGenerationStore.updateContent(
              currentChatId.value,
              fullContent,
              "chat",
            );
          }

          if (useWindow) {
            streamingWindow.appendToken(event.token);
          } else {
            const msgIndex = messages.value.findIndex(
              (m) => m.id === aiMessage.id,
            );
            if (msgIndex !== -1) {
              messages.value[msgIndex].content = fullContent;
            }
            scrollToBottom();
          }
        } else if (event.type === "done") {
          const finalContent = applyAIOutputRegex(event.content || fullContent);
          const msgIndex = messages.value.findIndex(
            (m) => m.id === aiMessage.id,
          );

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

            if (msgIndex !== -1) {
              messages.value[msgIndex].content =
                "[空回應] API 返回了空內容，可能是網路不穩或連線中斷，請重試";
              messages.value[msgIndex].isStreaming = false;
            }
            if (useWindow) {
              streamingWindow.setError("API 返回空內容");
            }
            continue;
          }

          // 群聊/多人卡模式：使用群聊解析器
          if (useGroupChatParser.value) {
            const parsed = parseGroupChatResponse(finalContent);

            if (msgIndex !== -1) {
              messages.value.splice(msgIndex, 1);
            }

            for (let i = 0; i < parsed.messages.length; i++) {
              const parsedMsg = parsed.messages[i];
              const senderName = parsedMsg.senderName || "";
              const senderCharId = getGroupMemberIdByName(senderName);
              const senderAvatar = getGroupMemberAvatar(senderName);

              if (parsedMsg.isGroupAction && parsedMsg.groupActionType) {
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
                messages.value.push(actionMsg);
                continue;
              }

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
                messages.value.push(recallMsg);
                continue;
              }

              if (parsedMsg.isPrivateMessage) {
                const dmNotice: Message = {
                  id: `msg_${Date.now()}_${i}`,
                  role: "ai",
                  content: parsedMsg.content,
                  timestamp: Date.now() + i,
                  turnId: currentTurnId.value || undefined,
                  isPrivateMessage: true,
                  senderCharacterId: senderCharId,
                  senderCharacterName: senderName,
                  senderCharacterAvatar: senderAvatar,
                };
                messages.value.push(dmNotice);

                if (senderCharId) {
                  try {
                    const allChats = await db.getAll<Chat>(DB_STORES.CHATS);
                    const existingChat = allChats.find(
                      (c) => c.characterId === senderCharId && !c.isGroupChat,
                    );

                    const targetChat: Chat =
                      existingChat ||
                      createDefaultChat(senderCharId, senderName);
                    if (!existingChat) {
                    }

                    const groupChatHistoryData = buildGroupChatHistoryData(
                      messages.value,
                      15,
                    );

                    const newDmMessages: ChatMessage[] = [];

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

                    if (!targetChat.messages) targetChat.messages = [];
                    targetChat.messages.push(...newDmMessages);
                    targetChat.lastMessagePreview =
                      dmMessage.content?.slice(0, 100) || "";
                    targetChat.messageCount = targetChat.messages.length;
                    targetChat.updatedAt = Date.now();
                    await db.put(
                      DB_STORES.CHATS,
                      JSON.parse(JSON.stringify(targetChat)),
                    );
                  } catch (e) {
                    console.warn("[ChatScreen] 無法插入私信到 1v1 聊天:", e);
                  }
                }
                continue;
              }

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

              if (parsedMsg.isJoinCall) {
                if (senderCharId && showGroupCallModal.value) {
                  handleGroupCallJoin(senderCharId, senderName);
                }
                if (parsedMsg.content && showGroupCallModal.value) {
                  addGroupCallVoiceMessage(senderName, parsedMsg.content);
                }
                continue;
              }

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

              let msgContent = parsedMsg.content;
              if (parsedMsg.isStickerMsg && parsedMsg.stickerMeaning) {
                msgContent = `[sticker:${parsedMsg.stickerMeaning}]`;
              }
              if (parsedMsg.isAiImage && parsedMsg.imageDescription) {
                msgContent = `<pic>${parsedMsg.imageDescription}</pic>`;
              }
              if (parsedMsg.isVoice && parsedMsg.voiceContent) {
                msgContent = `[語音訊息] ${parsedMsg.voiceContent}`;
              }

              const newMessage: Message = {
                id: `msg_${Date.now()}_${i}`,
                role: "ai",
                content: msgContent,
                timestamp: Date.now() + i,
                turnId: currentTurnId.value || undefined,
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

              // 外賣付款結果/送達（群聊 fallback）
              if (
                parsedMsg.isWaimaiPaymentResult ||
                parsedMsg.isWaimaiDelivery
              ) {
                const recentOrder = findLatestWaimaiOrder(messages.value);
                if (recentOrder) {
                  const clonedOrder = JSON.parse(JSON.stringify(recentOrder));
                  if (
                    parsedMsg.isWaimaiPaymentResult &&
                    parsedMsg.waimaiPaymentStatus
                  ) {
                    clonedOrder.status = parsedMsg.waimaiPaymentStatus;
                    if (parsedMsg.waimaiPaymentStatus === "paid")
                      clonedOrder.paidAt = Date.now();
                    newMessage.isWaimaiPaymentResult = true;
                  }
                  if (parsedMsg.isWaimaiDelivery) {
                    clonedOrder.status = "delivered";
                    clonedOrder.deliveredAt = Date.now();
                    newMessage.isWaimaiDelivery = true;
                  }
                  newMessage.waimaiOrder = clonedOrder;
                }
              }

              messages.value.push(newMessage);

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
              processMessageTTS(newMessage.id, newMessage.content);
            }

            if (parsed.messages.length === 0 && finalContent) {
              messages.value.push({
                id: `msg_${Date.now()}_fallback`,
                role: "ai",
                content: parsed.rawOutput || finalContent,
                timestamp: Date.now(),
                turnId: currentTurnId.value || undefined,
              });
            }

            const gcCalendarEvents = parseCalendarEventTags(finalContent);
            if (gcCalendarEvents.length > 0) {
              for (const calEvent of gcCalendarEvents) {
                await handleCalendarEvent(calEvent);
              }
            }
          } else if (needsParsing(finalContent)) {
            let parsed;
            try {
              parsed = parseAIResponse(finalContent);
            } catch (parseError) {
              console.warn(
                "[ChatScreen] AI 回覆解析失敗，使用原始內容:",
                parseError,
              );
              if (msgIndex !== -1) {
                messages.value[msgIndex].content = finalContent;
                messages.value[msgIndex].isStreaming = false;
              } else if (finalContent) {
                messages.value.push({
                  id: `msg_${Date.now()}`,
                  role: "ai",
                  content: finalContent,
                  timestamp: Date.now(),
                  turnId: currentTurnId.value || undefined,
                });
              }
              parsed = null;
            }

            if (parsed) {
              if (parsed.hasScheduleCall && parsed.scheduleCallData) {
                await handleScheduleCall(parsed.scheduleCallData);
              }

              if (parsed.hasCalendarEvent && parsed.calendarEvents) {
                for (const calEvent of parsed.calendarEvents) {
                  await handleCalendarEvent(calEvent);
                }
              }

              // 處理時間跳轉標籤（偏移時間模式）
              if (
                parsed.hasTimeJump &&
                parsed.timeJumpTarget &&
                fakeTime.fakeTimeMode.value === "offset"
              ) {
                fakeTime.jumpToTime(parsed.timeJumpTarget);
                await saveChat();
              }

              if (parsed.hasPlurkPost && parsed.plurkContent) {
                await handlePlurkPost(parsed.plurkContent);
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
                    await blockSvc.handleCharacterBlock(
                      currentChatId.value,
                      action.reason || "",
                    );
                    // 即時更新 UI 封鎖狀態
                    isBlockedByChar.value = true;
                    const updatedChat = await db.get<Chat>(
                      DB_STORES.CHATS,
                      currentChatId.value,
                    );
                    if (updatedChat && currentChatData.value) {
                      currentChatData.value.blockState = updatedChat.blockState;
                    }
                    // 插入封鎖系統通知訊息（冪等：避免重複插入）
                    const alreadyHasBlockNotif2 = messages.value.some(
                      (m) => m.isCharBlockedNotification,
                    );
                    if (!alreadyHasBlockNotif2) {
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
                    isBlockedByChar.value = false;
                    const updatedChat = await db.get<Chat>(
                      DB_STORES.CHATS,
                      currentChatId.value,
                    );
                    if (updatedChat && currentChatData.value) {
                      currentChatData.value.blockState = updatedChat.blockState;
                    }
                  }
                }
              }

              // 處理好感度更新（移至訊息建立後，以便綁定快照到第一條新 AI 訊息）
              let _pendingAffinityUpdates2 = parsed.hasAffinityUpdate
                ? parsed.affinityUpdates
                : null;

              if (msgIndex !== -1) {
                messages.value.splice(msgIndex, 1);
              }

              let _firstNewAiMsgId2: string | undefined;
              for (let i = 0; i < parsed.messages.length; i++) {
                const parsedMsg = parsed.messages[i];

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
                  !parsedMsg.isWaimaiDelivery
                ) {
                  continue;
                }

                const messageRole: "user" | "ai" | "system" =
                  parsedMsg.isTimetravel ? "system" : "ai";
                const newMessage: Message = {
                  id: `msg_${Date.now()}_${i}`,
                  role: messageRole,
                  content:
                    parsedMsg.isAiImage && parsedMsg.imageDescription
                      ? `<pic>${parsedMsg.imageDescription}</pic>`
                      : parsedMsg.isHtmlBlock
                        ? ""
                        : parsedMsg.isVoice
                          ? `[語音訊息] ${parsedMsg.voiceContent || ""}`
                          : parsedMsg.content,
                  timestamp: Date.now() + i,
                  turnId: currentTurnId.value || undefined,
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
                  // HTML 區塊相關
                  isHtmlBlock: parsedMsg.isHtmlBlock,
                  htmlContent: parsedMsg.isHtmlBlock
                    ? parsedMsg.content
                    : undefined,
                  // 語音訊息相關
                  audioTranscript: parsedMsg.isVoice
                    ? parsedMsg.voiceContent
                    : undefined,
                };

                // 外賣付款結果/送達
                if (
                  parsedMsg.isWaimaiPaymentResult ||
                  parsedMsg.isWaimaiDelivery
                ) {
                  const recentOrder = findLatestWaimaiOrder(messages.value);
                  if (recentOrder) {
                    const clonedOrder = JSON.parse(JSON.stringify(recentOrder));
                    if (
                      parsedMsg.isWaimaiPaymentResult &&
                      parsedMsg.waimaiPaymentStatus
                    ) {
                      clonedOrder.status = parsedMsg.waimaiPaymentStatus;
                      if (parsedMsg.waimaiPaymentStatus === "paid")
                        clonedOrder.paidAt = Date.now();
                      newMessage.isWaimaiPaymentResult = true;
                    }
                    if (parsedMsg.isWaimaiDelivery) {
                      clonedOrder.status = "delivered";
                      clonedOrder.deliveredAt = Date.now();
                      newMessage.isWaimaiDelivery = true;
                    }
                    newMessage.waimaiOrder = clonedOrder;
                  }
                }

                messages.value.push(newMessage);

                // 記錄第一條新 AI 訊息的 ID，用於好感度快照綁定
                if (!_firstNewAiMsgId2 && newMessage.role === "ai") {
                  _firstNewAiMsgId2 = newMessage.id;
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
                  await processAIRefund(parsedMsg.transferAmount);
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
                // MiniMax TTS 語音合成
                processMessageTTS(newMessage.id, newMessage.content);
              }

              // 處理好感度更新（在訊息建立後呼叫，綁定快照到第一條新 AI 訊息）
              if (
                _pendingAffinityUpdates2 &&
                _pendingAffinityUpdates2.length > 0
              ) {
                _handleAffinityUpdates(
                  _pendingAffinityUpdates2,
                  _firstNewAiMsgId2,
                );
              }

              // 將原始 <update> 區塊附加到最後一條 AI 訊息，供重新掃描使用
              if (parsed.rawUpdateBlock) {
                const lastAiMsg = [...messages.value]
                  .reverse()
                  .find(
                    (m) => m.role === "ai" && m.turnId === currentTurnId.value,
                  );
                if (lastAiMsg) {
                  lastAiMsg._rawAffinityBlock = parsed.rawUpdateBlock;
                }
              }

              if (parsed.messages.length === 0) {
                const fallbackMessage: Message = {
                  id: aiMessage.id,
                  role: "ai",
                  content: parsed.rawOutput || finalContent,
                  timestamp: Date.now(),
                  turnId: currentTurnId.value || undefined,
                };
                messages.value.push(fallbackMessage);
              }
            }
          } else {
            if (msgIndex !== -1) {
              messages.value[msgIndex].content = finalContent;
              messages.value[msgIndex].isStreaming = false;
            } else if (finalContent) {
              // 安全網：佔位符被移除但內容未丟失
              console.warn("[ChatScreen] 流式完成但找不到佔位訊息，重新建立");
              messages.value.push({
                id: `msg_${Date.now()}`,
                role: "ai",
                content: finalContent,
                timestamp: Date.now(),
                turnId: currentTurnId.value || undefined,
              });
            }
          }

          if (useWindow) {
            // 傳入 API 返回的 token 使用量
            if (event.usage) {
              streamingWindow.setUsage(event.usage);
            }
            streamingWindow.setComplete();
          }
        } else if (event.type === "error") {
          const msgIndex = messages.value.findIndex(
            (m) => m.id === aiMessage.id,
          );
          if (msgIndex !== -1) {
            messages.value[msgIndex].content =
              fullContent || `[錯誤] ${event.error}`;
            messages.value[msgIndex].isStreaming = false;
          }

          if (useWindow) {
            streamingWindow.setError(event.error || "生成過程中發生錯誤");
          }
        }
      }
    }
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      // 用戶取消生成：保留已有內容，沒有內容就直接移除佔位氣泡
      const lastMsg = messages.value[messages.value.length - 1];
      if (lastMsg && lastMsg.isStreaming) {
        lastMsg.isStreaming = false;
        if (useStreamingWindowEnabled.value && streamingWindow.content.value) {
          lastMsg.content = streamingWindow.content.value;
        }

        if (!lastMsg.content || !lastMsg.content.trim()) {
          messages.value.pop();
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
    const lastMsg = messages.value[messages.value.length - 1];
    if (lastMsg && lastMsg.role === "ai" && lastMsg.isStreaming) {
      lastMsg.content = `[錯誤] ${errorMsg}`;
      lastMsg.isStreaming = false;
    } else {
      const aiMessage: Message = {
        id: `msg_${Date.now()}`,
        role: "ai",
        content: `[錯誤] ${errorMsg}`,
        timestamp: Date.now(),
        turnId: currentTurnId.value || undefined,
      };
      messages.value.push(aiMessage);
    }

    // 設置流式窗口錯誤狀態
    if (useStreamingWindowEnabled.value) {
      streamingWindow.setError(errorMsg);
    }

    // 設置全局狀態錯誤
    if (currentChatId.value) {
      aiGenerationStore.setError(currentChatId.value, errorMsg, "chat");
    }
  } finally {
    // 完成全局生成狀態
    if (currentChatId.value) {
      aiGenerationStore.completeGeneration(currentChatId.value, "chat");
    }

    // 安全網：非主動中止時，如果流式窗口已有內容，確保最後一條 AI 訊息也有內容
    if (
      useStreamingWindowEnabled.value &&
      streamingWindow.content.value &&
      !controller.signal.aborted
    ) {
      const lastAI = [...messages.value].reverse().find((m) => m.role === "ai");
      if (lastAI && lastAI.isStreaming && !lastAI.content) {
        const windowContent = applyAIOutputRegex(streamingWindow.content.value);
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
    attachPendingRoundSwipes();

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
});

// 停止 AI 生成
function stopAIGeneration() {
  if (currentChatId.value) {
    aiGenerationStore.abortGeneration(currentChatId.value, "chat");
  }
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

  // 檢查最後一條訊息是否還是流式狀態（未完成）
  const lastMsg = messages.value[messages.value.length - 1];
  const windowContent = applyAIOutputRegex(streamingWindow.content.value);

  // 只有當最後一條訊息還在流式狀態時，才需要處理
  if (
    lastMsg &&
    lastMsg.role === "ai" &&
    lastMsg.isStreaming &&
    windowContent
  ) {
    // 關閉窗口時如果還在生成中，先停止生成以避免 done 事件重複處理
    stopAIGeneration();

    // 檢查是否需要解析（包含導演系統標籤）
    if (needsParsing(windowContent)) {
      // 群聊/多人卡模式使用群聊解析器
      if (useGroupChatParser.value) {
        const parsed = parseGroupChatResponse(windowContent);
        messages.value.pop();

        for (let i = 0; i < parsed.messages.length; i++) {
          const parsedMsg = parsed.messages[i];
          const senderName = parsedMsg.senderName || "";
          const senderCharId = getGroupMemberIdByName(senderName);
          const senderAvatar = getGroupMemberAvatar(senderName);

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
              turnId: currentTurnId.value || undefined,
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
            turnId: currentTurnId.value || undefined,
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
          if (parsedMsg.isWaimaiPaymentResult || parsedMsg.isWaimaiDelivery) {
            const recentOrder = findLatestWaimaiOrder(messages.value);
            if (recentOrder) {
              const clonedOrder = JSON.parse(JSON.stringify(recentOrder));
              if (
                parsedMsg.isWaimaiPaymentResult &&
                parsedMsg.waimaiPaymentStatus
              ) {
                clonedOrder.status = parsedMsg.waimaiPaymentStatus;
                if (parsedMsg.waimaiPaymentStatus === "paid")
                  clonedOrder.paidAt = Date.now();
                windowGcMsg.isWaimaiPaymentResult = true;
              }
              if (parsedMsg.isWaimaiDelivery) {
                clonedOrder.status = "delivered";
                clonedOrder.deliveredAt = Date.now();
                windowGcMsg.isWaimaiDelivery = true;
              }
              windowGcMsg.waimaiOrder = clonedOrder;
            }
          }

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
          processMessageTTS(windowGcMsg.id, windowGcMsg.content);
        }

        if (parsed.messages.length === 0 && windowContent) {
          messages.value.push({
            id: `msg_${Date.now()}_fallback`,
            role: "ai",
            content: parsed.rawOutput || windowContent,
            timestamp: Date.now(),
            turnId: currentTurnId.value || undefined,
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
          messages.value.pop();
          messages.value.push({
            id: `msg_${Date.now()}`,
            role: "ai",
            content: windowContent,
            timestamp: Date.now(),
            turnId: currentTurnId.value || undefined,
          });
          parsed = null;
        }

        if (parsed) {
          console.log("[ChatScreen] 關閉窗口時解析 AI 回覆:", {
            thinking: parsed.thinking ? "有" : "無",
            messageCount: parsed.messages.length,
          });

          // 移除原始的佔位訊息
          messages.value.pop();

          // 為每個解析後的訊息創建獨立的聊天訊息
          let _firstNewAiMsgId3: string | undefined;
          for (let i = 0; i < parsed.messages.length; i++) {
            const parsedMsg = parsed.messages[i];
            const newMessage: Message = {
              id: `msg_${Date.now()}_${i}`,
              role: "ai",
              content:
                parsedMsg.isAiImage && parsedMsg.imageDescription
                  ? `<pic>${parsedMsg.imageDescription}</pic>`
                  : parsedMsg.isHtmlBlock
                    ? ""
                    : parsedMsg.isVoice
                      ? `[語音訊息] ${parsedMsg.voiceContent || ""}`
                      : parsedMsg.content,
              timestamp: Date.now() + i,
              turnId: currentTurnId.value || undefined,
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
            };

            // 外賣付款結果/送達（窗口關閉時解析）
            if (parsedMsg.isWaimaiPaymentResult || parsedMsg.isWaimaiDelivery) {
              const recentOrder = findLatestWaimaiOrder(messages.value);
              if (recentOrder) {
                const clonedOrder = JSON.parse(JSON.stringify(recentOrder));
                if (
                  parsedMsg.isWaimaiPaymentResult &&
                  parsedMsg.waimaiPaymentStatus
                ) {
                  clonedOrder.status = parsedMsg.waimaiPaymentStatus;
                  if (parsedMsg.waimaiPaymentStatus === "paid")
                    clonedOrder.paidAt = Date.now();
                  newMessage.isWaimaiPaymentResult = true;
                }
                if (parsedMsg.isWaimaiDelivery) {
                  clonedOrder.status = "delivered";
                  clonedOrder.deliveredAt = Date.now();
                  newMessage.isWaimaiDelivery = true;
                }
                newMessage.waimaiOrder = clonedOrder;
              }
            }

            messages.value.push(newMessage);

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
            processMessageTTS(newMessage.id, newMessage.content);
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

          // 如果沒有解析出任何訊息，保留原始內容
          if (parsed.messages.length === 0) {
            const fallbackMessage: Message = {
              id: `msg_${Date.now()}`,
              role: "ai",
              content: parsed.rawOutput || windowContent,
              timestamp: Date.now(),
              turnId: currentTurnId.value || undefined,
            };
            messages.value.push(fallbackMessage);
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

  // 保存當前聊天狀態
  await saveChatImmediate();

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

// 切換小遊戲選單
function toggleGameMenu() {
  showGameMenu.value = !showGameMenu.value;
  // 關閉其他選單
  showMoreMenu.value = false;
  showChatSettingsMenu.value = false;
  showPersonaSelector.value = false;
}

// 打開小遊戲
function openGame(game: "dishwashing" | "fishing" | "gambling" | "merit") {
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

// 監聽夜晚模式變化：強制覆蓋聊天專屬外觀
watch(
  () => settingsStore.nightMode,
  (isNight) => {
    nextTick(() => {
      const container = chatScreenRef.value;
      if (!container) return;
      if (isNight) {
        // 夜晚模式：強制設定夜晚氣泡配色到容器上，覆蓋所有自定義
        container.style.setProperty("--bubble-user-bg", "#2a4a3a");
        container.style.setProperty("--bubble-user-text", "#e0f0e8");
        container.style.setProperty("--bubble-ai-bg", "#1e2a40");
        container.style.setProperty("--bubble-ai-text", "#d8d8e8");
        container.style.setProperty("--chat-bubble-user-bg", "#2a4a3a");
        container.style.setProperty("--chat-bubble-user-text", "#e0f0e8");
        container.style.setProperty("--chat-bubble-ai-bg", "#1e2a40");
        container.style.setProperty("--chat-bubble-ai-text", "#d8d8e8");
        // 清除桌布覆蓋，讓全局夜晚背景生效
        container.style.removeProperty("--chat-wallpaper");
        container.style.removeProperty("--chat-wallpaper-blur");
        container.style.removeProperty("--chat-wallpaper-opacity");
        container.style.removeProperty("--chat-wallpaper-fit");
        container.style.removeProperty("--chat-wallpaper-repeat");
        container.style.removeProperty("--color-primary");
        container.style.removeProperty("--color-primary-light");
      } else {
        // 關閉夜晚模式：清除所有夜晚強制覆蓋（包含 --bubble-* 和 --chat-bubble-*），重新套用聊天專屬外觀
        container.style.removeProperty("--bubble-user-bg");
        container.style.removeProperty("--bubble-user-text");
        container.style.removeProperty("--bubble-ai-bg");
        container.style.removeProperty("--bubble-ai-text");
        container.style.removeProperty("--chat-bubble-user-bg");
        container.style.removeProperty("--chat-bubble-user-text");
        container.style.removeProperty("--chat-bubble-ai-bg");
        container.style.removeProperty("--chat-bubble-ai-text");
        applyChatAppearance(chatAppearance.value);
      }
    });
  },
);

// 切換聊天勿擾模式（從選單）
async function toggleChatDoNotDisturb() {
  chatDoNotDisturb.value = !chatDoNotDisturb.value;
  await saveChatImmediate();
}

// ===== 聊天專屬位置覆蓋 =====
async function searchLocationCities() {
  const q = locationSearchQuery.value.trim();
  if (!q) return;
  locationSearchLoading.value = true;
  try {
    locationSearchResults.value = await searchCities(q);
  } catch {
    locationSearchResults.value = [];
  } finally {
    locationSearchLoading.value = false;
  }
}

async function selectLocationCity(city: {
  id: number;
  name: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
}) {
  chatLocationOverride.value = {
    mode: "manual",
    city: city.name,
    lat: city.lat,
    lon: city.lon,
  };
  locationSearchQuery.value = "";
  locationSearchResults.value = [];
  await saveChatImmediate();
}

async function clearLocationOverride() {
  chatLocationOverride.value = null;
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

// ===== MiniMax TTS 語音合成（單聊天開關） =====
async function toggleMinimaxTTS() {
  chatMinimaxTTSEnabled.value = !chatMinimaxTTSEnabled.value;
  await saveChat();
}

function openMinimaxTTSSettings() {
  showChatSettingsMenu.value = false;
  showMinimaxTTSSettingsModal.value = true;
}

async function closeMinimaxTTSSettings() {
  showMinimaxTTSSettingsModal.value = false;
  await saveChat();
}

async function saveMinimaxTTSSettings() {
  await saveChat();
  showMinimaxTTSSettingsModal.value = false;
}

/**
 * 處理 AI 回覆的 TTS 語音合成
 * 1. 如果 TTS 啟用且內容含 TTS 標記，保存原始文字到 ttsRawContent
 * 2. 清除顯示文字中的 TTS 標記
 * 3. 逐句解析對話段落，各自獨立呼叫 MiniMax API 合成語音
 */
async function processMessageTTS(messageId: string, content: string) {
  if (!chatMinimaxTTSEnabled.value) return;
  if (!settingsStore.minimaxTTS.apiKey) return;
  if (!hasTTSTags(content)) return;

  // 找到訊息並保存原始文字
  const idx = messages.value.findIndex((m) => m.id === messageId);
  if (idx === -1) return;

  // 保存帶 TTS 標記的原始文字（renderedContent 會用來注入 🔊 按鈕）
  messages.value[idx].ttsRawContent = content;
  // 注意：不再預先清除 content 中的 TTS 標記！
  // renderedContent computed 會用 ttsSegments 偵測到有分段時，
  // 自動把 [emotion=...] 替換成行內播放按鈕，最後 cleanTTSTags 兜底。

  // 逐句解析對話段落
  const segments = parseTTSSegments(content);
  if (segments.length === 0) return;

  // 寫入段落（先不帶 audioUrl）
  messages.value[idx].ttsSegments = segments.map((s) => ({
    emotion: s.emotion,
    speed: s.speed,
    text: s.text,
    clean: s.clean,
  }));

  // 異步逐句合成語音
  try {
    const { synthesizeSpeech } = await import("@/api/MiniMaxTTSApi");
    const override = chatMinimaxTTSOverride.value;
    const baseSettings = {
      ...settingsStore.minimaxTTS,
      ...(override.voiceId && { voiceId: override.voiceId }),
      ...(override.pitch !== undefined && { pitch: override.pitch }),
    };

    let anySuccess = false;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      // 每段用自己的 speed 和 emotion
      const mergedSettings = {
        ...baseSettings,
        speed: seg.speed,
      };

      const result = await synthesizeSpeech(seg.text, mergedSettings, {
        emotion: seg.emotion !== "neutral" ? seg.emotion : override.emotion,
      });

      const msgIdx = messages.value.findIndex((m) => m.id === messageId);
      if (msgIdx !== -1 && result.success && result.audioUrl) {
        if (messages.value[msgIdx].ttsSegments?.[i]) {
          messages.value[msgIdx].ttsSegments[i].audioUrl = result.audioUrl;
        }
        // 向下相容：第一段也寫入 ttsAudioUrl
        if (i === 0) {
          messages.value[msgIdx].ttsAudioUrl = result.audioUrl;
        }
        anySuccess = true;
      } else if (!result.success) {
        console.warn(`[MiniMax TTS] 段落 ${i} 合成失敗:`, result.error);
      }
    }

    if (anySuccess) {
      saveChat();
    }
  } catch (error) {
    console.error("[MiniMax TTS] 錯誤:", error);
  }
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
}

// ===== AI 記憶管理 =====
// 函數定義在 saveChat 之後

// ===== 回覆引用功能 =====

// 處理回覆消息
function handleReply(message: Message) {
  console.log("回覆消息:", message);
  replyingTo.value = message;
}

// 通過 ID 處理回覆（從 MessageBubble emit）
function handleReplyById(messageId: string) {
  const message = messages.value.find((m) => m.id === messageId);
  if (message) {
    handleReply(message);
  }
}

// 取消回覆
function cancelReply() {
  replyingTo.value = null;
}

// 獲取預覽文本（截斷過長的內容）
function getPreviewText(content: string): string {
  const text = content
    .replace(/\[img:.*?\]/g, "[圖片]")
    .replace(/\[sticker:.*?\]/g, "[表情包]");
  return text.length > 50 ? text.substring(0, 50) + "..." : text;
}

// 獲取被回覆消息的內容
function getReplyToContent(messageId: string): string {
  const msg = messages.value.find((m) => m.id === messageId);
  return msg ? getPreviewText(msg.content) : "";
}

// 從遺留的 messageChunks 表恢復訊息（v13 遷移補救）
async function recoverFromMessageChunks(
  chatId: string,
): Promise<ChatMessage[]> {
  const rawDb = (db as any)._instance;
  if (!rawDb) return [];

  // 檢查 messageChunks 表是否存在
  if (!rawDb.objectStoreNames.contains("messageChunks")) {
    return [];
  }

  try {
    const tx = rawDb.transaction("messageChunks", "readonly");
    const store = tx.objectStore("messageChunks");
    const allKeys: string[] = await store.getAllKeys();
    // 篩選屬於此聊天的 chunk keys
    const chunkKeys = allKeys
      .filter((k: string) => k.startsWith(`${chatId}_chunk_`))
      .sort((a: string, b: string) => {
        const idxA = parseInt(a.split("_chunk_")[1], 10);
        const idxB = parseInt(b.split("_chunk_")[1], 10);
        return idxA - idxB;
      });

    if (chunkKeys.length === 0) return [];

    const allMessages: ChatMessage[] = [];
    for (const key of chunkKeys) {
      const chunk = await store.get(key);
      if (chunk?.messages && Array.isArray(chunk.messages)) {
        allMessages.push(...chunk.messages);
      }
    }
    await tx.done;
    return allMessages;
  } catch (e) {
    console.warn("[recoverFromMessageChunks] 讀取失敗:", e);
    return [];
  }
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
      const chat = await db.get<Chat>(DB_STORES.CHATS, targetChatId);
      if (chat) {
        currentChatId.value = chat.id;
        currentChatData.value = chat;

        // 載入封鎖狀態
        await loadBlockState();

        // 初始化聊天變量（{{getvar}} / {{setvar}} 宏系統）
        chatVariablesStore.initForChat(chat.id);
        getMacroEngine().registerVarMacros(chatVariablesStore);

        // 清除未讀計數
        if (chat.unreadCount) {
          chat.unreadCount = 0;
          await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)));
        }

        // 直接從 chat.messages 讀取訊息
        let rawMessages: ChatMessage[] =
          chat.messages && chat.messages.length > 0 ? chat.messages : [];

        // 如果 chat.messages 為空但 messageCount > 0，嘗試從遺留的 messageChunks 表恢復
        if (rawMessages.length === 0 && (chat.messageCount ?? 0) > 0) {
          console.warn(
            "[ChatScreen] chat.messages 為空但 messageCount =",
            chat.messageCount,
            "，嘗試從 messageChunks 恢復...",
          );
          try {
            const recovered = await recoverFromMessageChunks(chat.id);
            if (recovered.length > 0) {
              rawMessages = recovered;
              console.log(
                "[ChatScreen] 從 messageChunks 恢復了",
                recovered.length,
                "條訊息，將回寫到 chat.messages",
              );
              // 回寫到 chat.messages 以完成遷移
              chat.messages = JSON.parse(JSON.stringify(recovered));
              await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)));
            }
          } catch (recoverErr) {
            console.warn("[ChatScreen] messageChunks 恢復失敗:", recoverErr);
          }
        }

        // 載入驗證：記錄從 IDB 讀取的訊息數量
        const loadAI = rawMessages.filter((m) => m.sender === "assistant");
        console.log(
          "[ChatScreen] 載入驗證:",
          `總共 ${rawMessages.length} 條, AI ${loadAI.length} 條`,
          loadAI.map((m) => `[${m.id}] ${(m.content || "").substring(0, 30)}`),
        );

        // 防禦性檢查：偵測訊息順序是否被破壞（所有 user 在前、AI 在後 = 異常合併）
        // 正常對話應該是交錯的（user, ai, user, ai...），如果偵測到大段連續同類型訊息
        // 且 createdAt 時間戳顯示它們本應交錯，則按 createdAt 重新排序修復
        if (rawMessages.length >= 4) {
          let isOutOfOrder = false;
          // 檢查：如果前半段全是 user、後半段全是 assistant，很可能是亂序
          const midpoint = Math.floor(rawMessages.length / 2);
          const firstHalfUsers = rawMessages
            .slice(0, midpoint)
            .filter((m) => m.sender === "user").length;
          const secondHalfAIs = rawMessages
            .slice(midpoint)
            .filter((m) => m.sender === "assistant").length;
          if (
            firstHalfUsers === midpoint &&
            secondHalfAIs === rawMessages.length - midpoint
          ) {
            isOutOfOrder = true;
          }

          // 更精確的檢查：比較相鄰訊息的 createdAt，如果後面的 createdAt 比前面小，說明亂序
          if (!isOutOfOrder) {
            let outOfOrderCount = 0;
            for (let i = 1; i < rawMessages.length; i++) {
              if (
                rawMessages[i].createdAt <
                rawMessages[i - 1].createdAt - 1000
              ) {
                outOfOrderCount++;
              }
            }
            // 如果超過 30% 的相鄰對是亂序的，認為整體被打亂了
            if (outOfOrderCount > rawMessages.length * 0.3) {
              isOutOfOrder = true;
            }
          }

          if (isOutOfOrder) {
            console.warn(
              "[ChatScreen] ⚠️ 偵測到訊息順序異常！按 createdAt 時間戳重新排序修復",
              `亂序前: ${rawMessages.map((m) => m.sender[0]).join("")}`,
            );
            rawMessages.sort((a, b) => a.createdAt - b.createdAt);
            console.log(
              "[ChatScreen] 修復後:",
              rawMessages.map((m) => m.sender[0]).join(""),
            );
            // 回寫修復後的順序到 IDB
            chat.messages = JSON.parse(JSON.stringify(rawMessages));
            await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)));
            console.log("[ChatScreen] ✅ 已將修復後的訊息順序回寫到 IndexedDB");
          }
        }

        // 圖片：不再一次性還原所有 base64 到記憶體，改為 MessageBubble 按需從 IndexedDB 讀取
        // 保持引用 ID（chatimg_xxx）在訊息中，大幅降低記憶體佔用（P1 修復）

        // 音頻：不再一次性載入所有 Blob，改為按需載入（P1 修復：減少記憶體佔用）
        // audioBlobId 保留在訊息中，播放時再從 IndexedDB 讀取

        messages.value = rawMessages.map((m) => {
          // 兼容處理：檢查舊訊息是否包含 <送禮物> 標籤但沒有 isGift 屬性
          let isGift = m.isGift;
          let giftName = m.giftName;
          if (!isGift && m.content) {
            const giftMatch = m.content.match(/<送禮物>([\s\S]*?)<\/送禮物>/i);
            if (giftMatch) {
              isGift = true;
              giftName = giftMatch[1].trim();
            }
          }

          // 兼容處理：檢查舊訊息是否包含 <轉帳> 標籤但沒有 isTransfer 屬性
          let isTransfer = m.isTransfer;
          let transferAmount = m.transferAmount;
          let transferType = m.transferType;
          let transferNote = m.transferNote;
          let transferStatus = m.transferStatus;
          if (!isTransfer && m.content) {
            // 兼容舊格式 <轉帳>金額 金幣</轉帳>
            const oldTransferMatch =
              m.content.match(/<轉帳>(\d+)\s*金幣<\/轉帳>/i);
            if (oldTransferMatch) {
              isTransfer = true;
              transferAmount = parseInt(oldTransferMatch[1], 10);
              transferType = "pay";
              transferStatus = "sent";
            }
            // 兼容新格式 <pay>金額:備註</pay>
            const payMatch = m.content.match(
              /<pay>(\d+)(?::([^<]*?))?<\/pay>/i,
            );
            if (payMatch) {
              isTransfer = true;
              transferAmount = parseInt(payMatch[1], 10);
              transferType = "pay";
              transferNote = payMatch[2]?.trim() || undefined;
              // 根據發送者決定狀態
              transferStatus =
                m.sender === "user" ? "sent" : transferStatus || "pending";
            }
            // 兼容 <refund>金額</refund>
            const refundMatch = m.content.match(/<refund>(\d+)<\/refund>/i);
            if (refundMatch) {
              isTransfer = true;
              transferAmount = parseInt(refundMatch[1], 10);
              transferType = "refund";
              transferStatus = "refunded";
            }
          }

          return {
            id: m.id,
            role:
              m.sender === "user"
                ? "user"
                : m.sender === "assistant"
                  ? "ai"
                  : "system",
            content: m.content,
            timestamp: m.createdAt,
            // 載入滑動數據
            swipes: m.swipes,
            swipeId: m.swipeId,
            // 載入整輪滑動數據
            roundSwipes: (m as any).roundSwipes,
            roundSwipeId: (m as any).roundSwipeId,
            // 載入解析後的額外資訊
            thought: m.thought,
            isTimetravel: m.isTimetravel,
            timetravelContent: m.timetravelContent,
            isRedpacket: m.isRedpacket,
            redpacketData: m.redpacketData,
            isLocation: m.isLocation,
            locationContent: m.locationContent,
            replyToContent: m.replyToContent,
            replyTo: m.replyTo,
            // 載入圖片相關數據
            messageType: m.messageType,
            imageUrl: m.imageUrl,
            imageData: m.imageData,
            imageMimeType: m.imageMimeType,
            imageCaption: m.imageCaption,
            // imageUrl/imageData 保持引用 ID（chatimg_xxx），MessageBubble 按需載入
            // 新發送的圖片仍為 base64，儲存時由 extractImagesFromMessages 自動提取
            // 載入禮物相關數據（包含兼容處理）
            isGift,
            giftName,
            giftReceived: m.giftReceived,
            // 載入轉帳相關數據（包含兼容處理）
            isTransfer,
            transferAmount,
            transferReceived: m.transferReceived,
            transferType,
            transferNote,
            transferStatus,
            // 載入外賣相關數據
            isWaimaiShare: (m as any).isWaimaiShare,
            isWaimaiPaymentRequest: (m as any).isWaimaiPaymentRequest,
            isWaimaiPaymentConfirm: (m as any).isWaimaiPaymentConfirm,
            isWaimaiPaymentResult: (m as any).isWaimaiPaymentResult,
            isWaimaiProgress: (m as any).isWaimaiProgress,
            isWaimaiDelivery: (m as any).isWaimaiDelivery,
            waimaiOrder: (m as any).waimaiOrder,
            // 載入換頭像相關數據
            isAvatarChange: (m as any).isAvatarChange,
            avatarChangeAction: (m as any).avatarChangeAction,
            avatarChangeMood: (m as any).avatarChangeMood,
            avatarChangeDesc: (m as any).avatarChangeDesc,
            // 載入群聊相關數據（從 senderCharacterId 動態查找頭像和名稱）
            senderCharacterId: m.senderCharacterId,
            senderCharacterName: m.senderCharacterId
              ? (() => {
                  // 多人卡模式：從 multiCharMembers 查找
                  if (chat.groupMetadata?.isMultiCharCard) {
                    const mc = chat.groupMetadata.multiCharMembers?.find(
                      (member) => member.id === m.senderCharacterId,
                    );
                    if (mc) return mc.name;
                  }
                  // 普通群聊：從 charactersStore 查找
                  const c = charactersStore.characters.find(
                    (ch) => ch.id === m.senderCharacterId,
                  );
                  return c?.nickname || c?.data?.name || "";
                })()
              : "",
            senderCharacterAvatar: m.senderCharacterId
              ? (() => {
                  // 多人卡模式：從 multiCharMembers 查找
                  if (chat.groupMetadata?.isMultiCharCard) {
                    const mc = chat.groupMetadata.multiCharMembers?.find(
                      (member) => member.id === m.senderCharacterId,
                    );
                    if (mc) return mc.avatar;
                  }
                  // 普通群聊：從 charactersStore 查找
                  return (
                    charactersStore.characters.find(
                      (ch) => ch.id === m.senderCharacterId,
                    )?.avatar ?? ""
                  );
                })()
              : "",
            isRecall: m.isRecall,
            recallContent: m.recallContent,
            isPrivateMessage: m.isPrivateMessage,
            isGroupAction: m.isGroupAction,
            groupActionType: m.groupActionType,
            groupActionActor: m.groupActionActor,
            groupActionTarget: m.groupActionTarget,
            groupActionValue: m.groupActionValue,
            // 群聊記錄卡片
            isGroupChatHistory: m.isGroupChatHistory,
            groupChatHistoryData: m.groupChatHistoryData,
            // 群通話記錄卡片
            isGroupCallHistory: m.isGroupCallHistory,
            groupCallHistoryData: m.groupCallHistoryData,
            // 行事曆事件
            isCalendarEvent: (m as any).isCalendarEvent,
            calendarEventData: (m as any).calendarEventData,
            // 音頻/語音相關
            audioBlobId: (m as any).audioBlobId,
            audioMimeType: (m as any).audioMimeType,
            audioDuration: (m as any).audioDuration,
            audioWaveform: (m as any).audioWaveform,
            audioTranscript: (m as any).audioTranscript,
            // 音頻 Blob 改為按需載入，不在載入時一次性讀取
            _audioBlob: undefined,
            // HTML 區塊
            isHtmlBlock: (m as any).isHtmlBlock,
            htmlContent: (m as any).htmlContent,
            // MiniMax TTS 語音合成相關
            ttsRawContent: (m as any).ttsRawContent,
            ttsAudioUrl: (m as any).ttsAudioUrl,
            ttsSegments: (m as any).ttsSegments,
            // 封鎖系統相關
            sentWhileBlocked: (m as any).sentWhileBlocked,
            isSystemNotification: (m as any).isSystemNotification,
          };
        });

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
        // 載入 MiniMax TTS 音色覆蓋
        chatMinimaxTTSOverride.value = chat.minimaxTTSOverride
          ? { ...chat.minimaxTTSOverride }
          : {};

        // 載入聊天專屬位置覆蓋
        chatLocationOverride.value = chat.locationOverride ?? null;

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
  }

  // 如果沒有訊息，添加開場白（群聊模式不添加角色開場白）
  // 檢查 metadata.skipGreeting 標記，如果用戶明確選擇不帶開場白則跳過
  const skipGreeting =
    (currentChatData.value?.metadata as any)?.skipGreeting === true;
  if (
    messages.value.length === 0 &&
    !currentChatData.value?.isGroupChat &&
    !skipGreeting
  ) {
    // 尋找角色的 first_mes
    const character = charactersStore.characters.find(
      (c) =>
        c.nickname === props.characterName ||
        c.data.name === props.characterName,
    );
    const firstMessage = character?.data.first_mes;

    if (firstMessage) {
      // 如果開場白包含 HTML 或特殊標籤，透過 parseGreeting 拆分成多個氣泡
      if (needsParsing(firstMessage)) {
        try {
          const parsedMessages = parseGreeting(firstMessage);
          if (parsedMessages.length > 0) {
            const baseTime = Date.now();
            for (let i = 0; i < parsedMessages.length; i++) {
              const parsedMsg = parsedMessages[i];
              // 跳過空內容
              if (
                !parsedMsg.content &&
                !parsedMsg.isHtmlBlock &&
                !parsedMsg.isTimetravel &&
                !parsedMsg.isRedpacket &&
                !parsedMsg.isLocation &&
                !parsedMsg.isTransfer &&
                !parsedMsg.isGift &&
                !parsedMsg.isAiImage &&
                !parsedMsg.isVoice
              )
                continue;

              const messageRole: "user" | "ai" | "system" =
                parsedMsg.isTimetravel ? "system" : "ai";
              messages.value.push({
                id: `msg_${baseTime}_${i}`,
                role: messageRole,
                content:
                  parsedMsg.isAiImage && parsedMsg.imageDescription
                    ? `<pic>${parsedMsg.imageDescription}</pic>`
                    : parsedMsg.isHtmlBlock
                      ? ""
                      : parsedMsg.isVoice
                        ? `[語音訊息] ${parsedMsg.voiceContent || ""}`
                        : parsedMsg.content,
                timestamp: baseTime + i,
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
              });
            }
          } else {
            messages.value.push({
              id: `msg_${Date.now()}`,
              role: "ai",
              content: firstMessage,
              timestamp: Date.now(),
            });
          }
        } catch (e) {
          console.warn("[ChatScreen] 開場白解析失敗，使用原始內容:", e);
          messages.value.push({
            id: `msg_${Date.now()}`,
            role: "ai",
            content: firstMessage,
            timestamp: Date.now(),
          });
        }
      } else {
        // 不需要解析，直接作為單條訊息
        messages.value.push({
          id: `msg_${Date.now()}`,
          role: "ai",
          content: firstMessage,
          timestamp: Date.now(),
        });
      }

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
  if (!currentChatData.value?.isGroupChat) {
    await loadSummariesAndDiaries();
  }

  // 恢復輸入框草稿
  if (currentChatId.value) {
    const draft = chatStore.getDraft(currentChatId.value);
    if (draft) {
      inputText.value = draft;
    }
  }

  scrollToBottom();

  // 重新設置載入更多觀察器（哨兵元素可能已重建）
  nextTick(() => {
    setupLoadMoreObserver();
  });

  // 初始化增量寫入追蹤狀態（讓後續 saveChat 能正確判斷是否為純追加）
  _lastSavedMessageCount = messages.value.length;
  _lastSavedLastMessageId =
    messages.value.length > 0
      ? messages.value[messages.value.length - 1].id
      : "";
  _lastSavedMessageIds = messages.value.map((m) => m.id);
}

// 載入總結和日記
async function loadSummariesAndDiaries() {
  const chatId = currentChatId.value || props.chatId;
  const charId = props.characterId || currentCharacter.value?.id;

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
        (s) => s.chatId === chatId && (!charId || s.characterId === charId),
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
        (d) => d.chatId === chatId && (!charId || d.characterId === charId),
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
  // imageUrl/imageData 已經是引用 ID（chatimg_xxx）或新圖片的 base64
  // extractImagesFromMessages 會在儲存時處理 base64 → 引用 ID 的轉換
  return {
    id: m.id,
    sender:
      m.role === "user"
        ? ("user" as const)
        : m.role === "ai"
          ? ("assistant" as const)
          : ("system" as const),
    name: m.role === "user" ? "User" : m.senderCharacterName || charName,
    content: m.content,
    is_user: m.role === "user",
    status: "sent" as const,
    createdAt: m.timestamp,
    updatedAt: m.timestamp,
    swipes: m.swipes ? [...m.swipes] : undefined,
    swipeId: m.swipeId,
    roundSwipes: m.roundSwipes
      ? JSON.parse(JSON.stringify(m.roundSwipes))
      : undefined,
    roundSwipeId: m.roundSwipeId,
    thought: m.thought,
    isTimetravel: m.isTimetravel,
    timetravelContent: m.timetravelContent,
    isRedpacket: m.isRedpacket,
    redpacketData: m.redpacketData ? { ...m.redpacketData } : undefined,
    isLocation: m.isLocation,
    locationContent: m.locationContent,
    replyToContent: m.replyToContent,
    replyTo: m.replyTo,
    messageType: m.messageType,
    imageUrl: m.imageUrl,
    imageData: m.imageData,
    imageMimeType: m.imageMimeType,
    imageCaption: m.imageCaption,
    isGift: m.isGift,
    giftName: m.giftName,
    giftReceived: m.giftReceived,
    isTransfer: m.isTransfer,
    transferAmount: m.transferAmount,
    transferReceived: m.transferReceived,
    transferType: m.transferType,
    transferNote: m.transferNote,
    transferStatus: m.transferStatus,
    isWaimaiShare: m.isWaimaiShare,
    isWaimaiPaymentRequest: m.isWaimaiPaymentRequest,
    isWaimaiPaymentConfirm: m.isWaimaiPaymentConfirm,
    isWaimaiPaymentResult: m.isWaimaiPaymentResult,
    isWaimaiProgress: m.isWaimaiProgress,
    isWaimaiDelivery: m.isWaimaiDelivery,
    waimaiOrder: m.waimaiOrder
      ? JSON.parse(JSON.stringify(m.waimaiOrder))
      : undefined,
    isAvatarChange: m.isAvatarChange,
    avatarChangeAction: m.avatarChangeAction,
    avatarChangeMood: m.avatarChangeMood,
    avatarChangeDesc: m.avatarChangeDesc,
    senderCharacterId: m.senderCharacterId,
    isRecall: m.isRecall,
    recallContent: m.recallContent,
    isPrivateMessage: m.isPrivateMessage,
    isGroupAction: m.isGroupAction,
    groupActionType: m.groupActionType,
    groupActionActor: m.groupActionActor,
    groupActionTarget: m.groupActionTarget,
    groupActionValue: m.groupActionValue,
    isGroupChatHistory: m.isGroupChatHistory,
    groupChatHistoryData: m.groupChatHistoryData
      ? JSON.parse(JSON.stringify(m.groupChatHistoryData))
      : undefined,
    isGroupCallHistory: m.isGroupCallHistory,
    groupCallHistoryData: m.groupCallHistoryData
      ? JSON.parse(JSON.stringify(m.groupCallHistoryData))
      : undefined,
    isCalendarEvent: m.isCalendarEvent,
    calendarEventData: m.calendarEventData
      ? JSON.parse(JSON.stringify(m.calendarEventData))
      : undefined,
    // 音頻/語音相關
    audioBlobId: m.audioBlobId,
    audioMimeType: m.audioMimeType,
    audioDuration: m.audioDuration,
    audioWaveform: m.audioWaveform ? [...m.audioWaveform] : undefined,
    audioTranscript: m.audioTranscript,
    _audioBlob: m._audioBlob,
    // MiniMax TTS 語音合成相關
    ttsRawContent: m.ttsRawContent,
    ttsAudioUrl: m.ttsAudioUrl,
    ttsSegments: m.ttsSegments,
    // HTML 區塊
    isHtmlBlock: m.isHtmlBlock,
    htmlContent: m.htmlContent,
  } as ChatMessage;
}

// ===== 聊天儲存系統（debounce + 增量寫入） =====

/** 上次成功儲存時的訊息數量（用於判斷是否為純追加） */
let _lastSavedMessageCount = 0;
/** 上次成功儲存時的最後一條訊息 ID（用於驗證追加一致性） */
let _lastSavedLastMessageId = "";
/** 上次成功儲存時的所有訊息 ID 快照（用於 dirty chunk 比對） */
let _lastSavedMessageIds: string[] = [];
/** debounce 計時器 */
let _saveChatTimer: ReturnType<typeof setTimeout> | null = null;
/** 是否有待處理的儲存 */
let _saveChatPending = false;
/** 儲存鎖：防止並發寫入導致資料遺失 */
let _saveChatLock: Promise<void> | null = null;

/**
 * 構建聊天元數據物件（不含訊息）
 */
function buildChatMetadata(
  storableMessages: ChatMessage[],
  charName: string,
): Chat {
  const lastMsg = storableMessages[storableMessages.length - 1];
  // 保留現有 metadata 欄位（authorsNote、timedWorldInfo、variables 等），只覆蓋 personaOverride
  const existingMetadata = currentChatData.value?.metadata ?? {};
  return {
    id: currentChatId.value!,
    name: currentChatData.value?.name || `與 ${charName} 的對話`,
    characterId: props.characterId || currentCharacter.value?.id || "",
    messages: storableMessages,
    metadata: {
      ...JSON.parse(JSON.stringify(toRaw(existingMetadata))),
      personaOverride: {
        personaId: chatBoundPersonaId.value || userStore.currentPersonaId || "",
        secrets: chatPersonaOverride.value.secrets,
        powerDynamic: chatPersonaOverride.value.powerDynamic,
      },
    },
    createdAt: currentChatData.value?.createdAt || Date.now(),
    updatedAt: Date.now(),
    enablePhoneDecision: enablePhoneDecision.value,
    doNotDisturb: chatDoNotDisturb.value,
    faceToFaceMode: chatFaceToFaceMode.value,
    thirdPersonMode: chatThirdPersonMode.value,
    enableRealTimeAwareness: chatEnableRealTimeAwareness.value,
    ...fakeTime.toChatFields(),
    minimaxTTSEnabled: chatMinimaxTTSEnabled.value,
    minimaxTTSOverride:
      Object.keys(chatMinimaxTTSOverride.value).length > 0
        ? { ...chatMinimaxTTSOverride.value }
        : undefined,
    appearance: chatAppearance.value
      ? JSON.parse(JSON.stringify(chatAppearance.value))
      : undefined,
    summarySettings: JSON.parse(
      JSON.stringify(toRaw(chatSummarySettings.value)),
    ),
    isGroupChat: currentChatData.value?.isGroupChat,
    groupMetadata: currentChatData.value?.groupMetadata
      ? JSON.parse(JSON.stringify(currentChatData.value.groupMetadata))
      : undefined,
    lastMessagePreview: lastMsg?.content?.slice(0, 100) || "",
    messageCount: storableMessages.length,
    isBranch: currentChatData.value?.isBranch,
    pinnedToList: currentChatData.value?.pinnedToList,
    // 封鎖狀態（從 DB 中的現有資料保留，不由 ChatScreen 管理）
    blockState: currentChatData.value?.blockState,
    // 聊天專屬位置覆蓋
    locationOverride: chatLocationOverride.value ?? undefined,
  };
}

/**
 * 實際執行儲存的核心函數（內部實作，不應直接呼叫）
 */
async function _saveChatImplInner() {
  if (!currentChatId.value) {
    currentChatId.value = `chat_${Date.now()}`;
    chatVariablesStore.initForChat(currentChatId.value);
    getMacroEngine().registerVarMacros(chatVariablesStore);
  }

  const charName = currentCharacter.value?.data?.name || props.characterName;
  // 原子快照：先複製一份當前訊息陣列的引用，避免在 map 過程中
  // 被流式回覆的 splice/push 操作修改（競態條件防護）
  const messagesSnapshot = [...messages.value];
  const storableMessages = messagesSnapshot.map((m) =>
    convertToStorableMessage(m, charName),
  );

  try {
    // 圖片分離：將 base64 圖片提取到 imageCache 表，訊息中只存引用 ID
    const afterImageExtract = await extractImagesFromMessages(storableMessages);

    // 音頻分離：將音頻 Blob 提取到 audio-blobs 表，訊息中只存引用 ID
    const messagesForStorage =
      await extractAudioFromMessages(afterImageExtract);

    const chat = buildChatMetadata(messagesForStorage, charName);

    // Debug: 檢查外觀是否正確包含在 chat 中
    console.log(
      "[ChatScreen] 保存聊天，外觀:",
      chat.appearance
        ? {
            useCustom: chat.appearance.useCustom,
            wallpaperType: chat.appearance.wallpaper?.type,
            wallpaperValueLength: chat.appearance.wallpaper?.value?.length,
          }
        : "undefined",
    );

    const currentCount = messagesForStorage.length;
    const currentLastId =
      messagesForStorage.length > 0
        ? messagesForStorage[messagesForStorage.length - 1].id
        : "";

    // 轉換為純物件避免 Vue reactive proxy 導致的 DataCloneError
    // structuredClone 比 JSON.parse(JSON.stringify()) 更省記憶體（不產生中間 JSON 字串）
    let plainChat: any;
    try {
      plainChat = structuredClone(toRaw(chat));
    } catch {
      // fallback：如果仍有嵌套 proxy 導致 DataCloneError，退回 JSON 方式
      plainChat = JSON.parse(JSON.stringify(toRaw(chat)));
    }

    // 驗證：確認 plainChat.messages 包含所有訊息
    const aiMsgs = plainChat.messages.filter(
      (m: any) => m.sender === "assistant",
    );

    // 封鎖狀態保護：從 DB 讀取最新的 blockState，避免被覆蓋
    // （BlockService 直接寫入 DB，ChatScreen 的 currentChatData 可能還沒同步）
    try {
      const latestFromDb = await db.get<any>(DB_STORES.CHATS, plainChat.id);
      if (latestFromDb?.blockState) {
        plainChat.blockState = latestFromDb.blockState;
      }
    } catch {
      /* 讀取失敗時保留 buildChatMetadata 的值 */
    }

    await db.put(DB_STORES.CHATS, plainChat);
    // 保存後立即回讀驗證（僅開發環境，避免生產環境額外記憶體開銷）
    if (import.meta.env.DEV) {
      try {
        const verify = await db.get<any>(DB_STORES.CHATS, currentChatId.value!);
        if (verify) {
          if (verify.messages?.length !== plainChat.messages.length) {
            console.error(
              "[ChatScreen] ⚠️ 保存後回讀數量不一致！寫入:",
              plainChat.messages.length,
              "讀回:",
              verify.messages?.length,
            );
          }
        }
      } catch (verifyErr) {
        console.warn("[ChatScreen] 回讀驗證失敗:", verifyErr);
      }
    }

    // 更新追蹤狀態
    _lastSavedMessageCount = currentCount;
    _lastSavedLastMessageId = currentLastId;
    _lastSavedMessageIds = messagesForStorage.map((m) => m.id);
    _saveChatPending = false;
  } catch (e) {
    console.error("保存聊天失敗:", e);
  }
}

/**
 * 帶鎖的儲存：確保同一時間只有一個儲存在執行
 * 如果前一個儲存還在進行中，等它完成後再執行新的儲存
 * 這樣可以避免並發寫入導致舊資料覆蓋新資料
 */
async function _saveChatImpl() {
  // 等待前一個儲存完成（即使它失敗了也要等）
  if (_saveChatLock) {
    try {
      await _saveChatLock;
    } catch {
      // 前一個儲存失敗不影響本次儲存
    }
  }
  // 建立新的鎖
  _saveChatLock = _saveChatImplInner();
  try {
    await _saveChatLock;
  } finally {
    _saveChatLock = null;
  }
}

/**
 * 防抖儲存（預設 400ms）— 用於大多數非關鍵場景
 * 連續呼叫只會觸發一次實際寫入
 */
function saveChat() {
  _saveChatPending = true;
  if (_saveChatTimer) {
    clearTimeout(_saveChatTimer);
  }
  _saveChatTimer = setTimeout(() => {
    _saveChatTimer = null;
    _saveChatImpl();
  }, 400);
}

/**
 * 立即儲存 — 用於關鍵場景（離開頁面、用戶發送訊息、刪除等）
 * 會取消待處理的 debounce 並立即執行
 */
async function saveChatImmediate() {
  if (_saveChatTimer) {
    clearTimeout(_saveChatTimer);
    _saveChatTimer = null;
  }
  await _saveChatImpl();
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

  // 格式化通話時長
  const mins = Math.floor(duration / 60);
  const secs = duration % 60;
  const durationText = mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`;

  // 創建通話記錄訊息
  const callRecordMessage: Message = {
    id: `msg_call_${Date.now()}`,
    role: "system",
    content: `📞 通話結束\n時長：${durationText}\n\n--- 通話內容 ---\n${callMessages.map((m) => `${m.role === "user" ? "你" : props.characterName}: ${m.content}`).join("\n")}`,
    timestamp: Date.now(),
  };

  messages.value.push(callRecordMessage);
  scrollToBottom();
  await saveChatImmediate();

  console.log("[ChatScreen] 電話通話記錄已保存", {
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

const isInitialChatLoadDone = ref(false);
let deferredPendingMessage: string | PendingInjectedMessage | null = null;
/**
 * 從最近訊息中找到最新的外賣訂單快照
 */
function findLatestWaimaiOrder(
  msgs: Message[],
): WaimaiOrderSnapshot | undefined {
  return [...msgs]
    .slice(-30)
    .reverse()
    .find((m) => m.waimaiOrder)?.waimaiOrder;
}

function buildWaimaiAuthorsNote(
  sourceMessages: Message[],
): AuthorsNoteMetadata | undefined {
  const recent = sourceMessages.slice(-20);
  const hasWaimaiContext = recent.some(
    (m) =>
      m.isWaimaiShare ||
      m.isWaimaiPaymentRequest ||
      m.isWaimaiPaymentConfirm ||
      m.isWaimaiPaymentResult ||
      m.isWaimaiDelivery,
  );

  if (!hasWaimaiContext) return undefined;

  const order = findLatestWaimaiOrder(recent);
  const amountLine = order
    ? `目前可見訂單：${order.item.name}，小計🪙 ${order.subtotal}、運費🪙 ${order.shippingFee}、總計🪙 ${order.totalPrice}，收件人：${order.recipientName}。`
    : "";

  const latestWaimaiMsg = [...recent]
    .reverse()
    .find(
      (m) =>
        m.isWaimaiShare ||
        m.isWaimaiPaymentRequest ||
        m.isWaimaiPaymentConfirm ||
        m.isWaimaiPaymentResult ||
        m.isWaimaiDelivery,
    );
  const alreadyPaid = recent.some((m) => m.isWaimaiPaymentResult);
  const alreadyDelivered = recent.some((m) => m.isWaimaiDelivery);

  const lines: string[] = [
    "[外賣互動規則]",
    amountLine,
    "",
    "你可以使用以下標籤觸發外賣卡片 UI（標籤會自動渲染成卡片，不需重複寫商品名或金額）：",
    '- 同意付款：<waimai-pay status="paid"/>',
    '- 拒絕付款：<waimai-pay status="rejected"/>',
    '- 付款失敗：<waimai-pay status="failed"/>',
    "- 送達通知：<waimai-delivery/>",
    "",
  ];

  if (latestWaimaiMsg?.isWaimaiPaymentRequest && !alreadyPaid) {
    lines.push(
      "【當前狀態】{{user}} 請你代付。",
      "根據角色性格決定是否願意付款：",
      '- 願意：先用文字表達同意，再附上 <waimai-pay status="paid"/>',
      '- 拒絕：先說明原因，再附上 <waimai-pay status="rejected"/>',
      "不要在沒有表態的情況下直接發標籤。",
    );
  } else if (latestWaimaiMsg?.isWaimaiShare && !alreadyPaid) {
    lines.push(
      "【當前狀態】{{user}} 分享了商品，尚未發起付款。",
      "可以評論商品、討論需求，但不可自行宣稱已付款或發送付款標籤。",
      "只有在 {{user}} 明確請你代付時，才能使用 <waimai-pay> 標籤。",
    );
  } else if (
    latestWaimaiMsg?.isWaimaiPaymentConfirm ||
    (alreadyPaid && !alreadyDelivered)
  ) {
    lines.push(
      "【當前狀態】已付款，等待送達。",
      "關心配送進度，在合適時機用 <waimai-delivery/> 表示送達。",
    );
  }

  lines.push(
    "",
    "⚠️ 不要捏造不存在的訂單細節。不要無中生有地使用外賣標籤——只在有對應訂單時才使用。",
  );

  return {
    prompt: lines.join("\n"),
    interval: 1,
    depth: 4,
    position: 0,
    role: PromptRole.SYSTEM,
  };
}
function injectPendingMessage(msg: string | PendingInjectedMessage) {
  const baseMessage: Message = {
    id: `msg_${Date.now()}`,
    role: "user",
    content: typeof msg === "string" ? msg : msg.content,
    timestamp: Date.now(),
  };

  if (typeof msg !== "string") {
    baseMessage.isWaimaiShare = msg.isWaimaiShare;
    baseMessage.isWaimaiPaymentRequest = msg.isWaimaiPaymentRequest;
    baseMessage.isWaimaiPaymentConfirm = msg.isWaimaiPaymentConfirm;
    baseMessage.isWaimaiPaymentResult = msg.isWaimaiPaymentResult;
    baseMessage.isWaimaiProgress = msg.isWaimaiProgress;
    baseMessage.isWaimaiDelivery = msg.isWaimaiDelivery;
    baseMessage.waimaiOrder = msg.waimaiOrder;
  }

  messages.value.push(baseMessage);

  if (typeof msg !== "string" && msg.waimaiProgressMessages?.length) {
    const progressEntries = msg.waimaiProgressMessages
      .map((entry, idx) => ({
        id: `msg_${Date.now()}_waimai_progress_${idx}`,
        role: "system" as const,
        content: entry.content,
        timestamp: entry.timestamp ?? Date.now(),
        isWaimaiProgress: entry.isWaimaiProgress ?? true,
        isWaimaiDelivery: entry.isWaimaiDelivery,
        waimaiOrder: entry.waimaiOrder,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    messages.value.push(...progressEntries);
  }
  scrollToBottom();
  saveChatImmediate();
  emit("pendingMessageConsumed");
}

function flushDeferredPendingMessage() {
  if (!deferredPendingMessage) return;
  const msg = deferredPendingMessage;
  deferredPendingMessage = null;
  nextTick(() => injectPendingMessage(msg));
}

// 檢查待處理來電
onMounted(async () => {
  // 通知主動發訊服務：用戶進入此角色的聊天頁面
  if (props.characterId) {
    proactiveMessageService.enterChat(props.characterId);
  }

  // 初始化全域 regex 腳本
  regexScriptsStore.init();

  // 載入音頻設定
  loadAudioSettings();

  // 註冊流式窗口全局事件監聯
  _unregisterStreamingClose = streamingWindow.on("close", handleStreamingClose);
  _unregisterStreamingStop = streamingWindow.on("stop", handleStreamingStop);
  _unregisterStreamingMinimize = streamingWindow.on(
    "minimize",
    handleStreamingMinimize,
  );
  _unregisterStreamingRestore = streamingWindow.on(
    "restore",
    handleStreamingRestore,
  );

  // 載入使用者資料
  if (!userStore.isLoaded) {
    await userStore.loadUserData();
  }
  // 載入表情包資料
  if (!stickerStore.initialized) {
    await stickerStore.init();
  }
  // 載入天氣數據（如果還沒有）
  if (!weatherStore.hasWeatherData) {
    weatherStore.refreshWeather().catch((e) => {
      console.warn("[ChatScreen] 載入天氣失敗:", e);
    });
  }
  loadOrCreateChat().then(() => {
    isInitialChatLoadDone.value = true;
    flushDeferredPendingMessage();

    // 如果後台仍有生成任務在跑，標記最後一條 AI 訊息為 streaming
    // 這樣用戶回到聊天時能看到打字動畫而非空氣泡
    if (
      currentChatId.value &&
      aiGenerationStore.isTaskGenerating(currentChatId.value, "chat")
    ) {
      const lastAI = [...messages.value].reverse().find((m) => m.role === "ai");
      if (lastAI) {
        lastAI.isStreaming = true;
        // 如果全局 store 有累積內容，同步到訊息中
        const task = aiGenerationStore.getTask(currentChatId.value, "chat");
        if (task?.content && task.content.trim()) {
          lastAI.content = task.content;
        }
      }
    }
  });

  // 啟動待處理來電檢查
  startPendingCallChecker();

  // 設置當前活躍聊天 ID（用於通知判斷）
  notificationStore.setActiveChatId(currentChatId.value);

  // 設置「載入更多」哨兵的 IntersectionObserver
  nextTick(() => {
    setupLoadMoreObserver();
  });
});

// 監聽後台生成完成：如果重新進入聊天時有舊的生成任務還在跑，
// 等它完成後重新從 IDB 載入訊息（避免切頁面後訊息丟失）
watch(
  () => {
    if (!currentChatId.value) return false;
    return aiGenerationStore.isTaskGenerating(currentChatId.value, "chat");
  },
  async (isGenerating, wasGenerating) => {
    // 生成剛完成（從 true 變 false），重新載入聊天記錄
    if (wasGenerating && !isGenerating && currentChatId.value) {
      // 等一小段時間確保 saveChat 已寫入 IDB
      await new Promise((r) => setTimeout(r, 300));
      try {
        // 從 IDB 讀取最新聊天記錄
        const chat = await db.get<Chat>(DB_STORES.CHATS, currentChatId.value);
        if (!chat) return;

        const dbMessageCount = chat.messages?.length || 0;
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
            chat.messages[chat.messages.length - 1]?.content !==
              messages.value[messages.value.length - 1]?.content);

        if (shouldReload) {
          const prevRealTimeAwareness = chatEnableRealTimeAwareness.value;
          const prevDoNotDisturb = chatDoNotDisturb.value;
          const prevPhoneDecision = enablePhoneDecision.value;
          const prevFaceToFaceMode = chatFaceToFaceMode.value;
          const prevThirdPersonMode = chatThirdPersonMode.value;

          await loadOrCreateChat();

          chatEnableRealTimeAwareness.value = prevRealTimeAwareness;
          chatDoNotDisturb.value = prevDoNotDisturb;
          enablePhoneDecision.value = prevPhoneDecision;
          chatFaceToFaceMode.value = prevFaceToFaceMode;
          chatThirdPersonMode.value = prevThirdPersonMode;

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

// 監聽 pendingAppearance prop 的變化（當從 App.vue 傳入新外觀時套用）
watch(
  () => props.pendingAppearance,
  (newAppearance: ChatAppearance | undefined) => {
    console.log("[ChatScreen] pendingAppearance changed:", newAppearance);
    if (newAppearance) {
      chatAppearance.value = newAppearance;
      // 同步到 chatStore 緩存
      chatStore.setAppearanceCache(newAppearance);
      nextTick(() => {
        console.log("[ChatScreen] Applying appearance and saving...");
        applyChatAppearance(newAppearance);
        // 保存到 IndexedDB
        saveChat();
        // 通知 App.vue 已套用
        emit("appearanceApplied");
      });
    }
  },
  { deep: true },
);

// 監聽 pendingMessage prop（從遊戲分享成績、外賣分享等場景注入用戶訊息）
watch(
  () => props.pendingMessage,
  (msg: string | PendingInjectedMessage) => {
    if (!msg) return;

    if (!isInitialChatLoadDone.value) {
      deferredPendingMessage = msg;
      return;
    }
    injectPendingMessage(msg);
  },
  { immediate: true },
);

onUnmounted(() => {
  // 通知主動發訊服務：用戶離開此角色的聊天頁面，從現在起開始計算間隔
  if (props.characterId) {
    proactiveMessageService.leaveChat(props.characterId);
  }

  // 取消流式窗口事件監聽
  _unregisterStreamingClose?.();
  _unregisterStreamingStop?.();
  _unregisterStreamingMinimize?.();
  _unregisterStreamingRestore?.();

  // 清理錄音資源
  if (isRecording.value) {
    isRecording.value = false;
  }

  // 如果有待處理的 debounce 儲存，立即執行（避免切換聊天時丟失數據）
  if (_saveChatTimer) {
    clearTimeout(_saveChatTimer);
    _saveChatTimer = null;
  }

  // 如果正在流式生成中，將已累積的內容寫入佔位符再保存
  // 避免空氣泡被寫入 IDB；後台生成完成後 finally 會再次保存最終結果
  const isCurrentlyStreaming =
    currentChatId.value &&
    aiGenerationStore.isTaskGenerating(currentChatId.value, "chat");
  if (isCurrentlyStreaming) {
    const streamingIdx = messages.value.findIndex(
      (m) => m.isStreaming && m.role === "ai",
    );
    if (streamingIdx !== -1) {
      const task = aiGenerationStore.getTask(currentChatId.value!, "chat");
      const accumulatedContent = task?.content || "";
      if (accumulatedContent.trim()) {
        // 已有部分內容，寫入佔位符（保留 isStreaming 標記）
        messages.value[streamingIdx].content = accumulatedContent;
      }
      // 注意：不移除佔位符！後台 triggerAIResponse 閉包仍需透過 findIndex 找到它
      // 來寫入最終完成的內容
    }
    // 立即保存
    _saveChatImpl();
  } else if (_saveChatPending) {
    _saveChatImpl();
  }
  // 暫存輸入框草稿
  if (currentChatId.value) {
    chatStore.saveDraft(currentChatId.value, inputText.value);
  }
  // 停止待處理來電檢查
  stopPendingCallChecker();
  // 清除載入更多觀察器
  cleanupLoadMoreObserver();
  // 清除聊天專屬外觀樣式
  applyChatAppearance(undefined);
  // 清除 chatStore 中的外觀緩存
  chatStore.setAppearanceCache(undefined);
  // 清除當前活躍聊天 ID
  notificationStore.setActiveChatId(null);
  // 停止假時間顯示定時器
  fakeTime.stopDisplayTimer();
  // 注意：不在 onUnmounted 呼叫 _restoreGlobalPersona()
  // 因為它是 async fire-and-forget，會跟新聊天的 loadOrCreateChat 產生 race condition
  // 導致新聊天載入的 persona 被覆蓋回全局設定
  // persona 恢復已由 loadOrCreateChat 內部處理（讀取 personaOverride 或呼叫 _restoreGlobalPersona）
});
</script>

<template>
  <div
    ref="chatScreenRef"
    class="screen-container chat-screen"
    @click="closeMenus"
  >
    <!-- 標題欄 -->
    <header class="chat-header" ref="chatHeaderRef">
      <button class="header-back" @click="handleBack">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
          />
        </svg>
      </button>

      <!-- 角色頭像 - 點擊打開 AI 總結設置 -->
      <div
        class="char-avatar"
        @click.stop="showAISummaryPanel = true"
        title="AI 記憶管理"
      >
        <img v-if="displayAvatar" :src="displayAvatar" :alt="characterName" />
        <div v-else-if="isGroupChat" class="avatar-placeholder group-avatar">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
            />
          </svg>
        </div>
        <div v-else class="avatar-placeholder">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"
            />
          </svg>
        </div>
      </div>

      <div class="chat-info">
        <div class="chat-name-row">
          <h1 class="chat-name">
            {{ isGroupChat ? groupDisplayName : displayCharacterName }}
          </h1>
          <button
            v-if="!isGroupChat && currentCharacter"
            class="nickname-edit-btn"
            title="編輯暱稱"
            @click.stop="startNicknameEdit"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
              <path
                d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
              />
            </svg>
          </button>
        </div>
        <!-- 暱稱編輯彈出框 -->
        <div v-if="showNicknameEdit" class="nickname-edit-popup" @click.stop>
          <input
            ref="nicknameInputRef"
            v-model="nicknameEditValue"
            class="nickname-edit-input"
            placeholder="輸入暱稱..."
            maxlength="30"
            @keydown.enter="saveNickname"
            @keydown.escape="showNicknameEdit = false"
          />
          <button class="nickname-save-btn" @click="saveNickname">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          </button>
        </div>
        <p v-if="isGroupChat && !isGenerating" class="chat-status">
          {{ groupMemberCount }} 位成員
        </p>
        <p v-else-if="isGenerating" class="chat-status">正在輸入...</p>
      </div>

      <!-- Rail 展開按鈕（僅手機端顯示） -->
      <button
        class="rail-toggle-btn"
        :class="{ active: showRail }"
        @click.stop="toggleRail"
      >
        <svg v-if="!showRail" viewBox="0 0 24 24" fill="currentColor">
          <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="currentColor">
          <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
        </svg>
      </button>

      <div class="header-actions" :class="{ 'rail-open': showRail }">
        <!-- 使用者切換按鈕 -->
        <div class="persona-dropdown" @click.stop>
          <button
            class="header-btn persona-btn"
            title="切換使用者"
            @click.stop="togglePersonaSelector"
          >
            <div v-if="userStore.currentAvatar" class="persona-avatar-mini">
              <img
                :src="userStore.currentAvatar"
                :alt="userStore.currentName"
              />
            </div>
            <svg v-else viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
              />
            </svg>
          </button>

          <!-- Persona 選擇器下拉選單 -->
          <Transition name="dropdown">
            <div v-if="showPersonaSelector" class="persona-selector">
              <div class="persona-selector-header">
                <span>選擇使用者</span>
              </div>
              <div class="persona-list">
                <button
                  v-for="persona in userStore.personas"
                  :key="persona.id"
                  class="persona-item"
                  :class="{ active: persona.id === userStore.currentPersonaId }"
                  @click="selectPersona(persona.id)"
                >
                  <div class="persona-item-avatar">
                    <img
                      v-if="persona.avatar"
                      :src="persona.avatar"
                      :alt="persona.name"
                    />
                    <svg v-else viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                      />
                    </svg>
                  </div>
                  <div class="persona-item-info">
                    <span class="persona-item-name">{{ persona.name }}</span>
                    <span v-if="persona.description" class="persona-item-desc">
                      {{ persona.description.substring(0, 30)
                      }}{{ persona.description.length > 30 ? "..." : "" }}
                    </span>
                  </div>
                  <svg
                    v-if="persona.id === userStore.currentPersonaId"
                    class="check-icon"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path
                      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                    />
                  </svg>
                </button>
              </div>
              <!-- 編輯按鈕 -->
              <div class="persona-selector-footer">
                <button class="edit-persona-btn" @click="openPersonaEditPanel">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                    />
                  </svg>
                  <span>編輯設定</span>
                </button>
              </div>
            </div>
          </Transition>
        </div>

        <!-- 小遊戲按鈕 -->
        <div class="game-dropdown" @click.stop>
          <button
            class="header-btn"
            :class="{ active: showGameMenu }"
            title="小遊戲"
            @click.stop="toggleGameMenu"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
              />
            </svg>
          </button>

          <!-- 小遊戲選單 -->
          <Transition name="dropdown">
            <div v-if="showGameMenu" class="dropdown-menu game-menu">
              <div class="dropdown-section-title">小遊戲</div>
              <button class="dropdown-item" @click="openGame('dishwashing')">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                  <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
                  <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
                </svg>
                <span>刷盤子</span>
              </button>
              <button class="dropdown-item" @click="openGame('fishing')">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    d="M18 4a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3z"
                  />
                  <path d="M18 11v9" />
                  <path d="M18 20l-3-3" />
                  <path d="M18 20l3-3" />
                  <circle cx="6" cy="12" r="4" />
                  <path d="M10 12h4" />
                </svg>
                <span>釣魚</span>
              </button>
              <button class="dropdown-item" @click="openGame('gambling')">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <rect x="2" y="2" width="20" height="20" rx="2" />
                  <circle cx="8" cy="8" r="1.5" fill="currentColor" />
                  <circle cx="16" cy="8" r="1.5" fill="currentColor" />
                  <circle cx="8" cy="16" r="1.5" fill="currentColor" />
                  <circle cx="16" cy="16" r="1.5" fill="currentColor" />
                  <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                </svg>
                <span>猜大小</span>
              </button>
              <button class="dropdown-item" @click="openGame('merit')">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <ellipse cx="12" cy="14" rx="9" ry="7" />
                  <ellipse cx="12" cy="8" rx="3" ry="2" />
                  <circle cx="12" cy="6" r="1.5" />
                </svg>
                <span>修行</span>
              </button>
            </div>
          </Transition>
        </div>

        <!-- 設定按鈕 -->
        <button
          class="header-btn"
          title="外觀設定"
          @click.stop="handleSettings"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
            />
          </svg>
        </button>

        <!-- 主動發訊息設置按鈕（僅單人聊天顯示） -->
        <button
          v-if="!isGroupChat && currentCharacter"
          class="header-btn"
          title="主動發訊息設置"
          @click.stop="showProactiveMessageSettings = true"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"
            />
          </svg>
        </button>

        <!-- 聊天設定按鈕 -->
        <div class="chat-settings-dropdown" @click.stop>
          <button
            class="header-btn"
            :class="{ active: showChatSettingsMenu }"
            title="聊天設定"
            @click.stop="toggleChatSettingsMenu"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"
              />
            </svg>
          </button>

          <!-- 聊天設定選單 -->
          <Transition name="dropdown">
            <div
              v-if="showChatSettingsMenu"
              class="dropdown-menu chat-settings-menu"
            >
              <div class="dropdown-section-title">顯示模式</div>
              <!-- 面對面模式 -->
              <div class="dropdown-toggle-item">
                <div class="toggle-item-info">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
                    />
                  </svg>
                  <span>面對面模式</span>
                </div>
                <label class="toggle-switch-mini">
                  <input
                    type="checkbox"
                    :checked="chatFaceToFaceMode"
                    @change="toggleFaceToFaceMode"
                  />
                  <span class="toggle-slider-mini"></span>
                </label>
              </div>
              <!-- 第三人稱模式（僅面對面模式下顯示） -->
              <div v-if="chatFaceToFaceMode" class="dropdown-toggle-item">
                <div class="toggle-item-info">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                    />
                  </svg>
                  <span>第三人稱</span>
                </div>
                <label class="toggle-switch-mini">
                  <input
                    type="checkbox"
                    :checked="chatThirdPersonMode"
                    @change="toggleThirdPersonMode"
                  />
                  <span class="toggle-slider-mini"></span>
                </label>
              </div>
              <!-- 夜晚模式 -->
              <div class="dropdown-toggle-item">
                <div class="toggle-item-info">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M9 2c-1.05 0-2.05.16-3 .46 4.06 1.27 7 5.06 7 9.54 0 4.48-2.94 8.27-7 9.54.95.3 1.95.46 3 .46 5.52 0 10-4.48 10-10S14.52 2 9 2z"
                    />
                  </svg>
                  <span>夜晚模式</span>
                </div>
                <label class="toggle-switch-mini">
                  <input
                    type="checkbox"
                    :checked="settingsStore.nightMode"
                    @change="toggleNightMode"
                  />
                  <span class="toggle-slider-mini"></span>
                </label>
              </div>
              <!-- 感知現實時間 -->
              <div class="dropdown-toggle-item">
                <div class="toggle-item-info">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"
                    />
                  </svg>
                  <span>感知現實時間</span>
                </div>
                <label class="toggle-switch-mini">
                  <input
                    type="checkbox"
                    :checked="chatEnableRealTimeAwareness"
                    @change="toggleRealTimeAwareness"
                  />
                  <span class="toggle-slider-mini"></span>
                </label>
              </div>
              <!-- 假時間設定 -->
              <div
                v-if="chatEnableRealTimeAwareness"
                class="dropdown-toggle-item"
                style="cursor: pointer"
                @click="showFakeTimePanel = !showFakeTimePanel"
              >
                <div class="toggle-item-info">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"
                    />
                  </svg>
                  <span>時間模式</span>
                </div>
                <span style="font-size: 11px; opacity: 0.7">
                  {{
                    fakeTime.fakeTimeMode.value === "real"
                      ? "真實"
                      : fakeTime.fakeTimeMode.value === "loop"
                        ? "輪迴"
                        : "偏移"
                  }}
                </span>
              </div>
              <div
                v-if="showFakeTimePanel && chatEnableRealTimeAwareness"
                class="fake-time-panel"
              >
                <div class="fake-time-mode-selector">
                  <button
                    v-for="m in ['real', 'loop', 'offset'] as const"
                    :key="m"
                    :class="[
                      'fake-time-mode-btn',
                      { active: fakeTime.fakeTimeMode.value === m },
                    ]"
                    @click="
                      fakeTime.setMode(m);
                      saveChat();
                    "
                  >
                    {{
                      m === "real"
                        ? "真實時間"
                        : m === "loop"
                          ? "輪迴時間"
                          : "偏移時間"
                    }}
                  </button>
                </div>
                <!-- 輪迴設定 -->
                <div
                  v-if="fakeTime.fakeTimeMode.value === 'loop'"
                  class="fake-time-config"
                >
                  <label class="fake-time-label">
                    起始
                    <input
                      type="datetime-local"
                      :value="fakeTime.fakeTimeLoop.value.startDateTime"
                      class="fake-time-input"
                      @change="
                        (e: Event) => {
                          fakeTime.setLoopRange(
                            (e.target as HTMLInputElement).value,
                            fakeTime.fakeTimeLoop.value.endDateTime,
                          );
                          saveChat();
                        }
                      "
                    />
                  </label>
                  <label class="fake-time-label">
                    結束
                    <input
                      type="datetime-local"
                      :value="fakeTime.fakeTimeLoop.value.endDateTime"
                      class="fake-time-input"
                      @change="
                        (e: Event) => {
                          fakeTime.setLoopRange(
                            fakeTime.fakeTimeLoop.value.startDateTime,
                            (e.target as HTMLInputElement).value,
                          );
                          saveChat();
                        }
                      "
                    />
                  </label>
                </div>
                <!-- 偏移設定 -->
                <div
                  v-if="fakeTime.fakeTimeMode.value === 'offset'"
                  class="fake-time-config"
                >
                  <label class="fake-time-label">
                    設定現在時間
                    <input
                      type="datetime-local"
                      :value="fakeTime.offsetStartDateTime.value"
                      class="fake-time-input"
                      @change="
                        (e: Event) => {
                          fakeTime.setOffsetFromDateTime(
                            (e.target as HTMLInputElement).value,
                          );
                          saveChat();
                        }
                      "
                    />
                  </label>
                </div>
                <!-- 當前假時間預覽 -->
                <div
                  v-if="fakeTime.fakeTimeMode.value !== 'real'"
                  class="fake-time-preview"
                >
                  AI 感知時間：{{ fakeTime.formattedFakeTime.value }}
                </div>
                <!-- 跳轉時間（偏移和輪迴模式可用） -->
                <div
                  v-if="fakeTime.fakeTimeMode.value !== 'real'"
                  class="fake-time-jump"
                >
                  <span
                    style="
                      font-size: 12px;
                      color: var(--color-text-secondary);
                      flex-shrink: 0;
                    "
                    >跳轉到</span
                  >
                  <input
                    v-model="timeJumpInput"
                    type="datetime-local"
                    class="fake-time-input"
                    style="max-width: none; flex: 1"
                  />
                  <button class="fake-time-jump-btn" @click="handleTimeJump">
                    跳轉
                  </button>
                </div>
              </div>
              <div class="dropdown-divider"></div>
              <div class="dropdown-section-title">電話設定</div>
              <!-- 勿擾模式 -->
              <div class="dropdown-toggle-item">
                <div class="toggle-item-info">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"
                    />
                  </svg>
                  <span>勿擾模式</span>
                </div>
                <label class="toggle-switch-mini">
                  <input
                    type="checkbox"
                    :checked="chatDoNotDisturb"
                    @change="toggleChatDoNotDisturb"
                  />
                  <span class="toggle-slider-mini"></span>
                </label>
              </div>
              <!-- 角色決定接電話 -->
              <div class="dropdown-toggle-item">
                <div class="toggle-item-info">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"
                    />
                  </svg>
                  <span>角色決定接電話</span>
                </div>
                <label class="toggle-switch-mini">
                  <input
                    type="checkbox"
                    :checked="enablePhoneDecision"
                    @change="togglePhoneDecisionFromMenu"
                  />
                  <span class="toggle-slider-mini"></span>
                </label>
              </div>
              <div class="dropdown-divider"></div>
              <div class="dropdown-section-title">AI 繪圖</div>
              <!-- 文生圖開關 -->
              <div class="dropdown-toggle-item">
                <div class="toggle-item-info">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
                    />
                  </svg>
                  <span>啟用文生圖</span>
                </div>
                <label class="toggle-switch-mini">
                  <input
                    type="checkbox"
                    :checked="settingsStore.novelAIImage.enabled"
                    @change="toggleNovelAIImage"
                  />
                  <span class="toggle-slider-mini"></span>
                </label>
              </div>
              <!-- User Tag 開關 -->
              <div class="dropdown-toggle-item">
                <div class="toggle-item-info">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                    />
                  </svg>
                  <span>使用 User Tag</span>
                </div>
                <label class="toggle-switch-mini">
                  <input
                    type="checkbox"
                    :checked="settingsStore.novelAIImage.useUserTag"
                    @change="toggleNovelAIUseUserTag"
                  />
                  <span class="toggle-slider-mini"></span>
                </label>
              </div>
              <!-- 文生圖設定按鈕 -->
              <button class="dropdown-item" @click="openNovelAISettings">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
                  />
                </svg>
                <span>文生圖設定</span>
              </button>
              <!-- MiniMax TTS 語音合成開關 -->
              <div class="dropdown-divider"></div>
              <div class="dropdown-section-title">AI 語音</div>
              <div class="dropdown-toggle-item">
                <div class="toggle-item-info">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"
                    />
                  </svg>
                  <span>MiniMax 語音合成</span>
                </div>
                <label class="toggle-switch-mini">
                  <input
                    type="checkbox"
                    :checked="chatMinimaxTTSEnabled"
                    @change="toggleMinimaxTTS"
                  />
                  <span class="toggle-slider-mini"></span>
                </label>
              </div>
              <!-- MiniMax TTS 設定按鈕 -->
              <button class="dropdown-item" @click="openMinimaxTTSSettings">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
                  />
                </svg>
                <span>語音設定</span>
              </button>
              <!-- 位置覆蓋 -->
              <div class="dropdown-divider"></div>
              <div class="dropdown-section-title">位置覆蓋</div>
              <!-- 目前覆蓋位置 -->
              <div v-if="chatLocationOverride" class="dropdown-toggle-item">
                <div class="toggle-item-info">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                    />
                  </svg>
                  <span
                    style="
                      font-size: 12px;
                      max-width: 120px;
                      overflow: hidden;
                      text-overflow: ellipsis;
                      white-space: nowrap;
                    "
                  >
                    {{
                      chatLocationOverride.city ||
                      `${chatLocationOverride.lat?.toFixed(2)},${chatLocationOverride.lon?.toFixed(2)}`
                    }}
                  </span>
                </div>
                <button
                  class="dropdown-clear-btn"
                  @click="clearLocationOverride"
                >
                  清除
                </button>
              </div>
              <!-- 城市搜尋 -->
              <div class="location-search-box">
                <input
                  v-model="locationSearchQuery"
                  class="location-search-input"
                  placeholder="搜尋城市..."
                  @keydown.enter="searchLocationCities"
                />
                <button
                  class="location-search-btn"
                  :disabled="locationSearchLoading"
                  @click="searchLocationCities"
                >
                  {{ locationSearchLoading ? "…" : "搜尋" }}
                </button>
              </div>
              <div
                v-if="locationSearchResults.length > 0"
                class="location-results"
              >
                <button
                  v-for="city in locationSearchResults"
                  :key="city.id"
                  class="location-result-item"
                  @click="selectLocationCity(city)"
                >
                  <span class="location-result-name">{{ city.name }}</span>
                  <span class="location-result-sub"
                    >{{ city.region
                    }}{{ city.region && city.country ? "，" : ""
                    }}{{ city.country }}</span
                  >
                </button>
              </div>
            </div>
          </Transition>
        </div>

        <!-- 更多按鈕 -->
        <div class="more-dropdown" @click.stop>
          <button
            class="header-btn"
            title="更多選項"
            @click.stop="toggleMoreMenu"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"
              />
            </svg>
          </button>

          <!-- 更多選單 -->
          <Transition name="dropdown">
            <div v-if="showMoreMenu" class="dropdown-menu">
              <!-- 快捷導航區 -->
              <div class="dropdown-section-title">快捷導航</div>
              <button class="dropdown-item" @click="navigateTo('character')">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                  />
                </svg>
                <span>角色卡</span>
              </button>
              <button class="dropdown-item" @click="navigateTo('worldbook')">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"
                  />
                </svg>
                <span>世界書</span>
              </button>
              <button class="dropdown-item" @click="navigateTo('settings')">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
                  />
                </svg>
                <span>設置</span>
              </button>
              <div class="dropdown-divider"></div>
              <!-- 聊天操作區 -->
              <button class="dropdown-item" @click.stop="openSearchBar">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
                  />
                </svg>
                <span>搜索訊息</span>
              </button>
              <button class="dropdown-item" @click.stop="openChatInfo">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"
                  />
                </svg>
                <span>聊天資訊</span>
              </button>
              <button class="dropdown-item" @click.stop="openChatFilesPanel">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"
                  />
                </svg>
                <span>聊天檔案</span>
              </button>
              <button class="dropdown-item" @click.stop="exportCurrentChat">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                </svg>
                <span>導出聊天</span>
              </button>
              <button class="dropdown-item" @click.stop="triggerJsonlImport">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM6 20V4h5v7h7v9H6z"
                  />
                </svg>
                <span>匯入 JSONL 對話</span>
              </button>
              <button class="dropdown-item" @click.stop="startNewConversation">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
                  />
                </svg>
                <span>開啟新對話</span>
              </button>
              <!-- 封鎖/解封角色 -->
              <button
                v-if="!isGroupChat"
                class="dropdown-item"
                :class="{ danger: !isCharBlocked }"
                @click.stop="toggleBlockCharacter"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    v-if="isCharBlocked"
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"
                  />
                  <path
                    v-else
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
                  />
                </svg>
                <span>{{ isCharBlocked ? "解除封鎖" : "封鎖角色" }}</span>
              </button>
              <div class="dropdown-divider"></div>
              <button
                class="dropdown-item danger"
                @click.stop="clearChatHistory"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                  />
                </svg>
                <span>清空聊天記錄</span>
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </header>

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
            @keydown.enter="goToNextSearchResult"
            @keydown.escape="closeSearchBar"
          />
          <div v-if="searchResults.length > 0" class="search-results-count">
            {{ currentSearchIndex + 1 }} / {{ searchResults.length }}
          </div>
          <div class="search-nav-buttons">
            <button
              class="search-nav-btn"
              :disabled="searchResults.length === 0"
              @click="goToPrevSearchResult"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
              </svg>
            </button>
            <button
              class="search-nav-btn"
              :disabled="searchResults.length === 0"
              @click="goToNextSearchResult"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
              </svg>
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
            isSelectingForDelete && selectedMessageIds.includes(message.id),
            isSelectingForScreenshot &&
              screenshotSelectedIds.includes(message.id),
            searchResults.includes(message.id),
            searchResults[currentSearchIndex] === message.id,
            isCharBlocked,
            isBlockedByChar,
            message.sentWhileBlocked,
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

          <!-- 系統通知（封鎖/解封等） -->
          <div v-if="message.isSystemNotification" class="system-notification">
            <span class="system-notification-text">{{ message.content }}</span>
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
                    : message.senderCharacterAvatar || ''
                  : displayAvatar
                : ''
            "
            :user-avatar="
              message.role === 'user' ? userStore.currentAvatar : ''
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
            :is-location="message.isLocation"
            :location-content="message.locationContent"
            :reply-to-content="
              message.replyTo
                ? getReplyToContent(message.replyTo)
                : message.replyToContent
            "
            :reply-to="message.replyTo"
            :message-type="message.messageType"
            :image-url="message.imageUrl"
            :image-caption="message.imageCaption"
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
            :is-avatar-change="message.isAvatarChange"
            :avatar-change-action="message.avatarChangeAction"
            :avatar-change-mood="message.avatarChangeMood"
            :is-group-chat="isGroupChat"
            :sender-character-avatar="
              isGroupChat &&
              groupMetadata?.isMultiCharCard &&
              message.senderCharacterName
                ? getGroupMemberAvatar(message.senderCharacterName)
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
            :is-selected="
              (isSelectingForDelete &&
                selectedMessageIds.includes(message.id)) ||
              (isSelectingForScreenshot &&
                screenshotSelectedIds.includes(message.id))
            "
            :is-search-highlight="searchResults.includes(message.id)"
            :is-current-search="
              searchResults[currentSearchIndex] === message.id
            "
            @click="
              isSelectingForScreenshot
                ? toggleScreenshotSelection(message.id)
                : isSelectingForDelete
                  ? toggleMessageSelection(message.id)
                  : handleMessageClick(message.id)
            "
            @edit="handleMessageEdit"
            @delete="handleMessageDelete"
            @copy="handleMessageCopy"
            @regenerate="handleRegenerate"
            @swipe="handleMessageSwipe"
            @round-swipe="handleRoundSwipe"
            @reply="handleReplyById"
            @scroll-to-reply="scrollToMessage"
            @multi-delete="handleMultiDeleteFromMessage"
            @branch="handleBranchFromMessage"
            @accept-transfer="handleAcceptTransfer"
            @refund-transfer="handleRefundTransfer"
            @update-transcript="handleUpdateTranscript"
            @screenshot="handleMessageScreenshot"
            @batch-screenshot="startScreenshotSelectMode"
            @avatar-click="handleAvatarClick"
            @split-regex-html="handleSplitRegexHtml"
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

    <!-- 輸入區 -->
    <footer class="input-area">
      <!-- 被角色封鎖提示列 -->
      <div v-if="isBlockedByChar" class="blocked-by-char-bar">
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          width="14"
          height="14"
          style="flex-shrink: 0; opacity: 0.7"
        >
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"
          />
        </svg>
        <span>你已被對方封鎖，訊息可能無法送達</span>
        <button
          class="blocked-friend-request-btn"
          @click="showFriendRequestInput = true"
        >
          發送好友申請
        </button>
      </div>

      <!-- 回覆預覽欄 -->
      <Transition name="slide-up">
        <div v-if="replyingTo" class="reply-preview-bar">
          <div class="reply-preview-content">
            <div class="reply-preview-header">
              <svg class="reply-icon" viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"
                />
              </svg>
              <span class="reply-to-name"
                >回覆
                {{ replyingTo.role === "user" ? "自己" : characterName }}</span
              >
            </div>
            <div class="reply-preview-text">
              {{ getPreviewText(replyingTo.content) }}
            </div>
          </div>
          <button class="cancel-reply-btn" @click="cancelReply">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
              />
            </svg>
          </button>
        </div>
      </Transition>

      <!-- 快速輸入助手（僅面對面模式且輸入框獲得焦點時顯示） -->
      <Transition name="slide-up">
        <div
          v-if="chatFaceToFaceMode && isInputFocused"
          class="quick-input-bar"
        >
          <div
            class="quick-input-scroll"
            @wheel.prevent="handleQuickInputWheel"
          >
            <button
              v-for="action in quickActions"
              :key="action.text"
              class="quick-input-btn"
              :title="action.hint"
              @mousedown.prevent="insertQuickAction(action.text)"
            >
              {{ action.label }}
            </button>
          </div>
          <!-- 自定義按鈕 -->
          <button
            class="quick-input-edit-btn"
            title="自定義快捷"
            @mousedown.prevent="openQuickActionEditor"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
          </button>
        </div>
      </Transition>

      <div class="input-container">
        <!-- 左側按鈕組 -->
        <div class="left-buttons" @click.stop>
          <!-- 更多功能按鈕 -->
          <button
            class="input-btn plus-btn"
            :class="{ active: showMoreFeatures }"
            @click="toggleMoreFeatures"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
          </button>

          <!-- 圖片按鈕（未聚焦時顯示） -->
          <button
            v-if="!isInputFocused"
            class="input-btn image-btn"
            @click="showMediaDrawer = true"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
              />
            </svg>
          </button>
        </div>

        <!-- 輸入框容器（包含表情按鈕） -->
        <div class="input-wrapper" @click.stop>
          <textarea
            ref="messageInputRef"
            v-model="inputText"
            class="message-input"
            placeholder="輸入消息..."
            rows="1"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            @keydown="handleKeydown"
            @input="autoResizeInput"
            @focus="handleInputFocusWithScroll"
            @blur="onInputBlur"
          ></textarea>

          <!-- 表情按鈕（在輸入框內右側） -->
          <button
            class="emoji-btn-inner"
            :class="{ active: showStickerPanel }"
            @click.stop="toggleStickerPanel"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"
              />
            </svg>
          </button>

          <!-- 展開輸入框按鈕 -->
          <button
            v-if="inputText.length > 50"
            class="expand-btn-inner"
            title="展開編輯"
            @click.stop="toggleInputExpand"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
            </svg>
          </button>
        </div>

        <!-- 右側按鈕組 -->
        <div class="right-buttons" @click.stop>
          <!-- 繼續生成按鈕（有 AI 訊息且未生成中） -->
          <button
            v-if="
              hasAIMessages &&
              !isGenerating &&
              !inputText.trim() &&
              !isInputFocused
            "
            class="input-btn continue-btn"
            title="繼續生成"
            @click="continueGeneration"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>

          <!-- 重新生成按鈕（有 AI 訊息且未生成中） -->
          <button
            v-if="
              hasAIMessages &&
              !isGenerating &&
              !inputText.trim() &&
              !isInputFocused
            "
            class="input-btn regenerate-btn"
            title="重新生成最後一條回覆（滑動）"
            @click="regenerateLastAIResponse"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
              />
            </svg>
          </button>

          <!-- 停止生成按鈕 -->
          <button
            v-if="isGenerating"
            class="input-btn stop-btn"
            title="停止生成"
            @click="stopAIGeneration"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4 14H8V8h8v8z"
              />
            </svg>
          </button>

          <!-- 錄音按鈕（聚焦時顯示，在發送按鈕左邊） -->
          <Transition name="fade-slide">
            <button
              v-if="!isGenerating && isInputFocused && canRecord"
              class="input-btn mic-inline-btn"
              title="按住錄音 / 點擊輸入文字語音"
              @mousedown.prevent="onMicDown"
              @touchstart.prevent="onMicDown"
              @mouseup="onMicUp"
              @touchend="onMicUp"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"
                />
                <path
                  d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"
                />
              </svg>
            </button>
          </Transition>

          <!-- 發送按鈕（有文字時顯示） -->
          <button
            v-if="!isGenerating && inputText.trim()"
            class="send-btn active"
            @click="sendAndTriggerAI"
            title="發送訊息並觸發 AI 回覆"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>

          <!-- 發送按鈕（無文字且未聚焦時顯示小飛機） -->
          <button
            v-if="
              !isGenerating && !inputText.trim() && canRecord && !isInputFocused
            "
            class="send-btn"
            @click="sendAndTriggerAI"
            title="發送訊息並觸發 AI 回覆"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>

          <!-- 發送按鈕（無文字且聚焦時，或不支援錄音時顯示） -->
          <button
            v-if="
              !isGenerating &&
              !inputText.trim() &&
              (!canRecord || isInputFocused)
            "
            class="send-btn"
            @click="sendAndTriggerAI"
            title="發送訊息並觸發 AI 回覆"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>

      <!-- 文字輸入語音 Modal -->
      <Transition name="fade">
        <div
          v-if="showTextVoiceModal"
          class="text-voice-overlay"
          @click.self="showTextVoiceModal = false"
        >
          <div class="text-voice-modal">
            <div class="text-voice-title">輸入語音內容</div>
            <textarea
              v-model="textVoiceInput"
              class="text-voice-input"
              placeholder="輸入你想說的話..."
              rows="3"
              autofocus
              @keydown.enter.ctrl="sendTextAsVoice"
            ></textarea>
            <div class="text-voice-hint">Ctrl+Enter 發送</div>
            <div class="text-voice-actions">
              <button
                class="text-voice-cancel"
                @click="showTextVoiceModal = false"
              >
                取消
              </button>
              <button class="text-voice-send" @click="sendTextAsVoice">
                發送語音
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- 錄音覆蓋層 -->
      <Transition name="fade">
        <div v-if="isRecording" class="recording-overlay" @click.stop>
          <div class="recording-content">
            <div class="recording-indicator">
              <span class="recording-dot"></span>
              <span class="recording-time">{{
                formatAudioTime(recordingDuration)
              }}</span>
            </div>
            <div class="recording-volume-bars">
              <span
                v-for="i in 6"
                :key="i"
                class="volume-bar"
                :style="{
                  height: `${Math.max(4, recordingVolumeLevel * 28 * (0.5 + Math.random() * 0.5))}px`,
                }"
              ></span>
            </div>
            <div class="recording-hint" :class="{ cancel: isCancelMode }">
              {{ isCancelMode ? "鬆開取消" : "鬆開發送，上滑取消" }}
            </div>
          </div>
        </div>
      </Transition>

      <!-- 表情包面板 -->
      <Transition name="slide-up">
        <StickerPanel
          v-if="showStickerPanel"
          @select="handleStickerSelect"
          @close="showStickerPanel = false"
        />
      </Transition>

      <!-- 更多功能面板 -->
      <Transition name="slide-up">
        <div v-if="showMoreFeatures" class="more-features-panel" @click.stop>
          <div class="features-grid">
            <button
              class="feature-item"
              @click="
                showGiftDrawer = true;
                showMoreFeatures = false;
              "
            >
              <div class="feature-icon gift-feature-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 11 8.76l1-1.36 1 1.36L15.38 12 17 10.83 14.92 8H20v6z"
                  />
                </svg>
              </div>
              <span class="feature-label">禮物</span>
            </button>
            <button class="feature-item" @click="handleFeatureClick('phone')">
              <div class="feature-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"
                  />
                </svg>
              </div>
              <span class="feature-label">電話</span>
            </button>
            <button class="feature-item" @click="handleFeatureClick('video')">
              <div class="feature-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"
                  />
                </svg>
              </div>
              <span class="feature-label">視訊</span>
            </button>
            <button
              class="feature-item"
              @click="handleFeatureClick('location')"
            >
              <div class="feature-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                  />
                </svg>
              </div>
              <span class="feature-label">位置</span>
            </button>
            <button class="feature-item" @click="handleFeatureClick('weather')">
              <div class="feature-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M12.74 5.47C15.1 6.5 16.35 9.03 15.92 11.46c-.17.99-.6 1.94-1.25 2.75-.52.64-1.16 1.19-1.89 1.61-.73.42-1.54.71-2.38.85-.84.14-1.7.13-2.53-.04-.83-.17-1.62-.49-2.33-.94-.71-.45-1.33-1.02-1.82-1.69-.49-.67-.85-1.43-1.05-2.24-.2-.81-.24-1.65-.12-2.48.12-.83.4-1.63.82-2.36.42-.73.97-1.38 1.62-1.91.65-.53 1.39-.94 2.18-1.2.79-.26 1.62-.38 2.45-.34.83.04 1.64.24 2.39.58zM19 13h2v2h-2v-2zm-4-8h2v2h-2V5zm4 4h2v2h-2V9zm-4 8h2v2h-2v-2zm4 0h2v2h-2v-2z"
                  />
                </svg>
              </div>
              <span class="feature-label">天氣</span>
            </button>
            <button class="feature-item" @click="handleFeatureClick('file')">
              <div class="feature-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"
                  />
                </svg>
              </div>
              <span class="feature-label">文件</span>
            </button>
            <button class="feature-item" @click="handleFeatureClick('magic')">
              <div class="feature-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5zm-7.63 5.29c-.39-.39-1.02-.39-1.41 0L1.29 18.96c-.39.39-.39 1.02 0 1.41l2.34 2.34c.39.39 1.02.39 1.41 0L16.7 11.05c.39-.39.39-1.02 0-1.41l-2.33-2.35zm-1.03 5.49l-2.12-2.12 2.44-2.44 2.12 2.12-2.44 2.44z"
                  />
                </svg>
              </div>
              <span class="feature-label">跳轉魔法</span>
            </button>
            <button
              class="feature-item"
              @click="handleFeatureClick('small-theater')"
            >
              <div class="feature-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM8.5 8c.83 0 1.5.67 1.5 1.5S9.33 11 8.5 11 7 10.33 7 9.5 7.67 8 8.5 8zm3.5 9c-2.33 0-4.31-1.46-5.11-3.5h10.22c-.8 2.04-2.78 3.5-5.11 3.5zm3.5-6c-.83 0-1.5-.67-1.5-1.5S14.67 8 15.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
                  />
                </svg>
              </div>
              <span class="feature-label">小劇場</span>
            </button>
            <button
              class="feature-item"
              @click="handleFeatureClick('topic-prompt')"
            >
              <div class="feature-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6C7.8 12.16 7 10.63 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z"
                  />
                </svg>
              </div>
              <span class="feature-label">話題引導</span>
            </button>
            <button
              class="feature-item"
              @click="handleFeatureClick('game-score')"
            >
              <div class="feature-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
                  />
                </svg>
              </div>
              <span class="feature-label">遊戲成績</span>
            </button>
            <button
              class="feature-item"
              @click="handleFeatureClick('media-log')"
            >
              <div class="feature-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"
                  />
                </svg>
              </div>
              <span class="feature-label">書影</span>
            </button>
            <button
              class="feature-item"
              @click="handleFeatureClick('image-search')"
            >
              <div class="feature-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
                  />
                </svg>
              </div>
              <span class="feature-label">搜圖分享</span>
            </button>
          </div>
        </div>
      </Transition>
    </footer>

    <!-- 展開輸入框覆蓋層 -->
    <Transition name="expand-input">
      <div v-if="isInputExpanded" class="expanded-input-overlay" @click.stop>
        <div class="expanded-input-header">
          <button
            class="expanded-close-btn"
            @click="closeExpandedInput"
            title="收合"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
            </svg>
          </button>
          <span class="expanded-char-count">{{ inputText.length }}</span>
          <button
            class="expanded-send-btn"
            :class="{ active: inputText.trim() }"
            @click="sendFromExpanded"
            :disabled="!inputText.trim() || isGenerating"
          >
            發送
          </button>
        </div>
        <textarea
          ref="expandedInputRef"
          v-model="inputText"
          class="expanded-textarea"
          placeholder="輸入消息..."
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          @keydown.ctrl.enter.prevent="sendFromExpanded"
        ></textarea>
        <!-- 展開模式快速輸入助手 -->
        <div v-if="chatFaceToFaceMode" class="expanded-quick-input-bar">
          <div
            class="quick-input-scroll"
            @wheel.prevent="handleQuickInputWheel"
          >
            <button
              v-for="action in quickActions"
              :key="action.text"
              class="quick-input-btn"
              :title="action.hint"
              @mousedown.prevent="insertQuickAction(action.text)"
            >
              {{ action.label }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

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
        @trigger-manual-diary="handleTriggerManualDiary"
        @trigger-manual-events="handleTriggerManualEvents"
        @delete-selected="handleDeleteSelected"
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
      <DishWashingGame
        :visible="showDishWashingGame"
        :chat-id="currentChatId || ''"
        @close="showDishWashingGame = false"
      />

      <FishingGame
        :visible="showFishingGame"
        :chat-id="currentChatId || ''"
        @close="showFishingGame = false"
      />

      <GamblingGame
        :visible="showGamblingGame"
        :chat-id="currentChatId || ''"
        @close="showGamblingGame = false"
      />

      <MeritHub :visible="showMeritHub" @close="showMeritHub = false" />

      <!-- 聊天資訊面板 -->
      <!-- 好感度面板 -->
      <AffinityPanel
        :visible="showAffinityPanel"
        :chat-id="currentChatId || ''"
        :character-id="props.characterId || currentCharacter?.id || ''"
        @close="showAffinityPanel = false"
        @rescan="rescanAffinityFromMessages"
      />

      <ChatInfoModal
        :visible="showChatInfoModal"
        :character-name="characterName"
        :character-avatar="characterAvatar"
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
        @close="showPersonaEditPanel = false"
        @save="savePersonaEdit"
      />

      <!-- 遊戲成績選擇器 -->
      <GameScorePickerModal
        :visible="showGameScorePicker"
        @close="showGameScorePicker = false"
        @select="handleGameScoreSelect"
      />

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

      <!-- 天氣分享模態框（重新設計：可編輯用戶/角色所在地） -->
      <Transition name="fade">
        <div
          v-if="showWeatherModal"
          class="feature-modal-overlay"
          @click="cancelWeather"
        >
          <div class="wm-panel" @click.stop>
            <!-- 標題列 -->
            <div class="wm-header">
              <span class="wm-title">🌤 天氣與位置</span>
              <button class="wm-close" @click="cancelWeather">✕</button>
            </div>

            <!-- 雙卡片區 -->
            <div class="wm-cards">
              <!-- 用戶卡片 -->
              <div
                class="wm-card wm-card--user"
                :class="{ 'wm-card--editing': weatherEditTarget === 'user' }"
              >
                <div class="wm-card__header">
                  <span class="wm-card__icon">👤</span>
                  <span class="wm-card__who">我</span>
                  <button
                    class="wm-card__edit-btn"
                    @click="startWeatherEdit('user')"
                    title="變更所在地"
                  >
                    ✎
                  </button>
                </div>
                <template
                  v-if="
                    weatherStore.isLoading &&
                    !weatherStore.hasWeatherData &&
                    !customWeatherData
                  "
                >
                  <div class="wm-card__loading">載入中…</div>
                </template>
                <template v-else-if="customWeatherData">
                  <div class="wm-card__location">
                    {{ customWeatherData.location.name }}
                    <button class="wm-card__clear" @click="clearCustomWeather">
                      ✕
                    </button>
                  </div>
                  <div class="wm-card__temp">
                    {{ Math.round(customWeatherData.current.temp_c) }}°
                  </div>
                  <div class="wm-card__cond">
                    {{ customWeatherData.current.condition.text }}
                  </div>
                  <div class="wm-card__meta">
                    體感
                    {{ Math.round(customWeatherData.current.feelslike_c) }}° ·
                    濕度 {{ customWeatherData.current.humidity }}%
                  </div>
                </template>
                <template v-else-if="weatherStore.hasWeatherData">
                  <div class="wm-card__location">
                    {{ weatherStore.locationName }}
                  </div>
                  <div class="wm-card__temp">
                    {{ Math.round(weatherStore.currentTemp || 0) }}°
                  </div>
                  <div class="wm-card__cond">
                    {{ weatherStore.weatherCondition }}
                  </div>
                  <div class="wm-card__meta">
                    體感
                    {{
                      Math.round(
                        weatherStore.weatherData?.current.feelslike_c || 0,
                      )
                    }}° · 濕度 {{ weatherStore.weatherData?.current.humidity }}%
                  </div>
                </template>
                <template v-else>
                  <div class="wm-card__empty">點擊 ✎ 設定位置</div>
                </template>
              </div>

              <!-- 角色卡片 -->
              <div
                class="wm-card wm-card--char"
                :class="{ 'wm-card--editing': weatherEditTarget === 'char' }"
              >
                <div class="wm-card__header">
                  <span class="wm-card__icon">{{
                    currentCharacter?.avatar ? "" : "🤖"
                  }}</span>
                  <img
                    v-if="currentCharacter?.avatar"
                    :src="currentCharacter.avatar"
                    class="wm-card__avatar"
                    alt=""
                  />
                  <span class="wm-card__who">{{
                    currentCharacter?.data?.name || "角色"
                  }}</span>
                  <button
                    class="wm-card__edit-btn"
                    @click="startWeatherEdit('char')"
                    title="變更角色所在地"
                  >
                    ✎
                  </button>
                </div>
                <template v-if="charWeatherLoading">
                  <div class="wm-card__loading">載入中…</div>
                </template>
                <template v-else-if="charWeatherData">
                  <div class="wm-card__location">
                    {{ charWeatherData.location.name }}
                  </div>
                  <div class="wm-card__temp">
                    {{ Math.round(charWeatherData.current.temp_c) }}°
                  </div>
                  <div class="wm-card__cond">
                    {{ charWeatherData.current.condition.text }}
                  </div>
                  <div class="wm-card__meta">
                    體感 {{ Math.round(charWeatherData.current.feelslike_c) }}°
                    · 濕度 {{ charWeatherData.current.humidity }}%
                  </div>
                </template>
                <template v-else>
                  <div class="wm-card__empty">點擊 ✎ 設定位置</div>
                  <div class="wm-card__hint">將自動儲存到角色世界設定</div>
                </template>
              </div>
            </div>

            <!-- 搜尋區（僅在編輯模式顯示） -->
            <Transition name="fade">
              <div v-if="weatherEditTarget" class="wm-search">
                <div class="wm-search__label">
                  🔍 搜尋城市（套用到{{
                    weatherEditTarget === "user"
                      ? "我"
                      : currentCharacter?.data?.name || "角色"
                  }}）
                </div>
                <div class="wm-search__row">
                  <input
                    v-model="weatherSearchQuery"
                    class="wm-search__input"
                    :placeholder="
                      weatherEditTarget === 'user'
                        ? '輸入你的城市…'
                        : '輸入角色所在城市…'
                    "
                    @keydown.enter="searchWeatherCities"
                  />
                  <button
                    class="wm-search__btn"
                    :disabled="
                      weatherSearchLoading || !weatherSearchQuery.trim()
                    "
                    @click="searchWeatherCities"
                  >
                    {{ weatherSearchLoading ? "…" : "搜尋" }}
                  </button>
                </div>
                <!-- 搜尋結果 -->
                <div
                  v-if="weatherSearchResults.length > 0"
                  class="wm-search__results"
                >
                  <button
                    v-for="city in weatherSearchResults"
                    :key="city.id"
                    class="wm-search__result"
                    @click="selectWeatherCity(city)"
                  >
                    <span class="wm-search__result-name"
                      >📍 {{ city.name }}</span
                    >
                    <span class="wm-search__result-sub">{{
                      [city.region, city.country].filter(Boolean).join("，")
                    }}</span>
                  </button>
                </div>
                <button class="wm-search__cancel" @click="cancelWeatherEdit">
                  取消搜尋
                </button>
              </div>
            </Transition>

            <!-- 底部操作 -->
            <div class="wm-footer">
              <button class="wm-btn wm-btn--cancel" @click="cancelWeather">
                取消
              </button>
              <button
                class="wm-btn wm-btn--send"
                @click="sendWeatherMessage"
                :disabled="
                  !customWeatherData &&
                  (!weatherStore.hasWeatherData || weatherStore.isLoading)
                "
              >
                發送天氣
              </button>
            </div>
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
            <button
              class="chat-files-new-btn"
              @click="
                selectedGreetingIndex = 0;
                showNewChatConfirm = true;
              "
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="18"
                height="18"
              >
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
              </svg>
              新建
            </button>
          </div>
          <div class="chat-files-list">
            <div
              v-for="chat in chatFilesList"
              :key="chat.id"
              class="chat-file-item"
              :class="{ active: chat.id === currentChatId }"
              @click="switchChatFile(chat.id)"
            >
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
                  <span class="chat-file-name">{{
                    chat.name || "未命名對話"
                  }}</span>
                  <span class="chat-file-meta">
                    {{ chat.messageCount ?? chat.messages?.length ?? 0 }} 則訊息
                    · {{ formatChatFileTime(chat.updatedAt) }}
                  </span>
                </template>
              </div>
              <div class="chat-file-actions" @click.stop>
                <button
                  class="chat-file-btn"
                  :class="{ pinned: chat.pinnedToList }"
                  :title="chat.pinnedToList ? '從聊天列表移除' : '加入聊天列表'"
                  @click="togglePinChatToList(chat.id, $event)"
                >
                  <!-- 已加入：列表打勾；未加入：列表加號 -->
                  <svg
                    v-if="chat.pinnedToList"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    width="15"
                    height="15"
                  >
                    <path
                      d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"
                    />
                  </svg>
                  <svg
                    v-else
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    width="15"
                    height="15"
                  >
                    <path
                      d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h8v-2H7v2zm0 4h8v-2H7v2zM7 7v2h8V7H7zm9 8v-3h-2v3h-3v2h3v3h2v-3h3v-2h-3z"
                    />
                  </svg>
                </button>
                <button
                  class="chat-file-btn"
                  title="重命名"
                  @click="startRenameChat(chat, $event)"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    width="15"
                    height="15"
                  >
                    <path
                      d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                    />
                  </svg>
                </button>
                <button
                  class="chat-file-btn danger"
                  title="刪除"
                  @click="deleteChatFile(chat.id, $event)"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    width="15"
                    height="15"
                  >
                    <path
                      d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                    />
                  </svg>
                </button>
              </div>
            </div>
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
              <span>加入聊天列表（可同時與同一角色開多個聊天）</span>
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

  // 聊天專屬外觀：覆蓋 MessageBubble 的樣式
  :deep(.bubble) {
    // 字體樣式
    font-size: var(--chat-font-size, 15px);
    font-family: var(--chat-font-family, inherit);
    line-height: var(--chat-line-height, 1.6);
    letter-spacing: var(--chat-letter-spacing, 0px);
    color: var(--chat-md-text, inherit);

    &.user {
      background: var(
        --chat-bubble-user-bg,
        var(--bubble-user-bg, linear-gradient(135deg, #ff85a2, #ffb6c8))
      );

      .message-time {
        color: var(--chat-bubble-user-text, var(--bubble-user-text, white));
      }
    }

    &.ai {
      background: var(--chat-bubble-ai-bg, var(--bubble-ai-bg, white));

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

  // 聊天專屬頭像樣式
  :deep(.soft-avatar) {
    border-radius: var(--avatar-border-radius, 50%);
    border: var(--avatar-border-width, 2px) solid
      var(--avatar-border-color, white);
    box-shadow: var(--avatar-shadow, 0 4px 12px var(--color-shadow));
  }
}

// 標題欄
.chat-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  padding-left: calc(16px + var(--safe-left));
  padding-right: calc(16px + var(--safe-right));
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  gap: 12px;
  flex-shrink: 0;
  overflow: visible;
  position: relative;
  z-index: 10;
}

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

.char-avatar {
  width: 44px;
  height: 44px;
  border-radius: var(--avatar-border-radius, 50%);
  overflow: hidden;
  background: var(--color-background);
  flex-shrink: 0;
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

.location-search-box {
  display: flex;
  gap: 4px;
  padding: 4px 12px;
}

.location-search-input {
  flex: 1;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.2));
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  outline: none;
  &::placeholder {
    opacity: 0.5;
  }
}

.location-search-btn {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.2));
  background: rgba(255, 255, 255, 0.1);
  color: inherit;
  cursor: pointer;
  white-space: nowrap;
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.18);
  }
}

.location-results {
  max-height: 160px;
  overflow-y: auto;
  padding: 0 4px 4px;
}

.location-result-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: 5px 10px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  border-radius: 6px;
  text-align: left;
  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
}

.location-result-name {
  font-size: 13px;
  font-weight: 500;
}

.location-result-sub {
  font-size: 11px;
  opacity: 0.6;
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
  flex: 1;
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

// 輸入區
.input-area {
  padding: 10px 12px;
  padding-bottom: calc(10px + var(--safe-bottom, 0px));

  // 被角色封鎖提示列
  .blocked-by-char-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    font-size: 12px;
    color: rgba(180, 50, 50, 0.85);
    background: rgba(255, 80, 80, 0.06);
    border-bottom: 1px solid rgba(255, 80, 80, 0.12);
  }

  .blocked-friend-request-btn {
    margin-left: auto;
    flex-shrink: 0;
    font-size: 12px;
    color: var(--color-primary, #6c8ebf);
    background: none;
    border: 1px solid currentColor;
    border-radius: 12px;
    padding: 2px 10px;
    cursor: pointer;
    &:hover {
      opacity: 0.75;
    }
  }
  padding-left: calc(12px + var(--safe-left, 0px));
  padding-right: calc(12px + var(--safe-right, 0px));
  background: var(--color-surface, #fff);
  border-top: 1px solid var(--color-border, #e2e8f0);
  flex-shrink: 0;
}

// 快速輸入助手欄（面對面模式）
.quick-input-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding: 0 4px;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
}

.quick-input-scroll {
  flex: 1;
  display: flex;
  justify-content: center;
  gap: 6px;
  overflow-x: auto;
  padding: 4px 0;
  -webkit-overflow-scrolling: touch;

  // 隱藏滾動條
  &::-webkit-scrollbar {
    display: none;
  }
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.quick-input-btn {
  flex-shrink: 0;
  padding: 6px 12px;
  background: var(--color-background, #f5f5f5);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 16px;
  font-size: 13px;
  color: var(--color-text-secondary, #666);
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;

  &:hover {
    background: var(--color-primary-light, rgba(125, 211, 168, 0.15));
    border-color: var(--color-primary, #7dd3a8);
    color: var(--color-primary, #7dd3a8);
  }

  &:active {
    transform: scale(0.95);
  }
}

.quick-input-edit-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-background, #f5f5f5);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 50%;
  color: var(--color-text-muted, #999);
  cursor: pointer;
  transition: all 0.15s ease;

  svg {
    width: 16px;
    height: 16px;
  }

  &:hover {
    background: var(--color-primary-light, rgba(125, 211, 168, 0.15));
    border-color: var(--color-primary, #7dd3a8);
    color: var(--color-primary, #7dd3a8);
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

.input-container {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
  box-sizing: border-box;
}

.left-buttons,
.right-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.input-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;

  svg {
    width: 22px;
    height: 22px;
  }

  &:hover {
    transform: scale(1.1);
  }
}

// 左側按鈕顏色
.plus-btn {
  color: #666;

  &:hover {
    color: #333;
  }
}

.image-btn {
  color: var(--color-primary, #7dd3a8);

  &:hover {
    color: #5cb88a;
  }
}

.gift-feature-icon {
  svg {
    color: #e53935 !important;
  }
}

.gift-btn {
  color: #e53935;

  &:hover {
    color: #c62828;
  }
}

.input-wrapper {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.message-input {
  width: 100%;
  min-height: 40px;
  max-height: 84px;
  padding: 10px 64px 10px 16px;
  border: 2px solid var(--color-primary, #7dd3a8);
  border-radius: 20px;
  background: var(--color-background, #fff);
  color: var(--color-text);
  font-size: 15px;
  line-height: 1.4;
  resize: none;
  outline: none;
  transition: all var(--transition-fast);

  &::placeholder {
    color: var(--color-text-muted);
  }

  &:focus {
    border-color: var(--color-primary, #7dd3a8);
    box-shadow: 0 0 0 3px rgba(125, 211, 168, 0.15);
  }
}

.emoji-btn-inner {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 50%;
  color: #888;
  cursor: pointer;
  transition: all var(--transition-fast);

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover {
    color: #666;
    transform: translateY(-50%) scale(1.1);
  }

  &.active {
    color: var(--color-primary, #7dd3a8);
    background: var(--color-primary-light, rgba(125, 211, 168, 0.15));
  }
}

// 展開輸入框按鈕（在輸入框右側）
.expand-btn-inner {
  position: absolute;
  right: 36px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 50%;
  color: #888;
  cursor: pointer;
  transition: all var(--transition-fast);

  svg {
    width: 18px;
    height: 18px;
  }

  &:hover {
    color: var(--color-primary, #7dd3a8);
    background: var(--color-primary-light, rgba(125, 211, 168, 0.15));
  }
}

// 展開輸入框覆蓋層
.expanded-input-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  top: auto;
  height: 60%;
  min-height: 250px;
  max-height: 80%;
  background: var(--color-surface, #fff);
  display: flex;
  flex-direction: column;
  z-index: 50;
  padding: 0 12px;
  padding-bottom: calc(10px + var(--safe-bottom));
  padding-left: calc(12px + var(--safe-left));
  padding-right: calc(12px + var(--safe-right));
  will-change: transform;
  backface-visibility: hidden;
  border-top: 1px solid var(--color-border, #e2e8f0);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.1);
  border-radius: 16px 16px 0 0;
}

.expanded-input-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  flex-shrink: 0;
}

.expanded-close-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 50%;
  color: var(--color-text-secondary, #666);
  cursor: pointer;
  transition: all 0.15s ease;

  svg {
    width: 24px;
    height: 24px;
  }

  &:hover {
    background: var(--color-background, #f5f5f5);
    color: var(--color-text, #333);
  }
}

.expanded-char-count {
  font-size: 13px;
  color: var(--color-text-muted, #999);
}

.expanded-send-btn {
  padding: 6px 20px;
  background: var(--color-primary, #7dd3a8);
  border: none;
  border-radius: 16px;
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  opacity: 0.5;
  transition: all 0.15s ease;

  &.active {
    opacity: 1;
  }

  &:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  &:disabled {
    cursor: not-allowed;
  }
}

.expanded-textarea {
  flex: 1;
  width: 100%;
  padding: 12px 16px;
  border: 2px solid var(--color-primary, #7dd3a8);
  border-radius: 16px;
  background: var(--color-background, #fff);
  color: var(--color-text);
  font-size: 15px;
  line-height: 1.6;
  resize: none;
  outline: none;
  overflow-y: auto;

  &::placeholder {
    color: var(--color-text-muted);
  }

  &:focus {
    border-color: var(--color-primary, #7dd3a8);
    box-shadow: 0 0 0 3px rgba(125, 211, 168, 0.15);
  }
}

// 展開模式快速輸入助手
.expanded-quick-input-bar {
  flex-shrink: 0;
  padding: 8px 0 4px;

  .quick-input-scroll {
    display: flex;
    justify-content: center;
    gap: 6px;
    overflow-x: auto;
    padding: 4px 0;
    -webkit-overflow-scrolling: touch;

    &::-webkit-scrollbar {
      display: none;
    }
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
}

// 展開動畫
.expand-input-enter-active,
.expand-input-leave-active {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.expand-input-enter-from {
  transform: translateY(100%);
}

.expand-input-leave-to {
  transform: translateY(100%);
}

.send-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 50%;
  color: var(--color-primary, #7dd3a8);
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;

  svg {
    width: 22px;
    height: 22px;
  }

  &:hover {
    transform: scale(1.1);
  }

  &:active {
    transform: scale(0.95);
  }

  &.active {
    // 有輸入文字時更亮
    color: var(--color-primary, #7dd3a8);
    filter: brightness(1.1);
  }
}

// 重新生成按鈕
.regenerate-btn {
  color: var(--color-primary);

  &:hover {
    background: var(--color-primary-light);
  }
}

// 停止按鈕
.stop-btn {
  color: var(--color-error, #e53e3e);

  &:hover {
    background: rgba(229, 62, 62, 0.1);
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
}

.system-notification-text {
  font-size: 12px;
  color: var(--color-text-muted, #999);
  padding: 4px 16px;
  background: rgba(128, 128, 128, 0.1);
  border-radius: 12px;
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
    background: #fff;
  }
}

.edit-textarea-thought {
  background: #f5f0ff;
  font-style: italic;
  color: #6b5b95;

  &:focus {
    background: #ede8ff;
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

// 回覆預覽欄
.reply-preview-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: var(--color-background);
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 8px;
  border-radius: 12px 12px 0 0;

  .reply-preview-content {
    flex: 1;
    min-width: 0;
  }

  .reply-preview-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;

    .reply-icon {
      width: 16px;
      height: 16px;
      color: var(--color-primary);
    }

    .reply-to-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--color-primary);
    }
  }

  .reply-preview-text {
    font-size: 13px;
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cancel-reply-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface);
    border: none;
    border-radius: 50%;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;

    svg {
      width: 16px;
      height: 16px;
    }

    &:hover {
      background: var(--color-surface-hover);
      color: var(--color-text);
    }
  }
}

// 更多功能面板
.more-features-panel {
  padding: 16px;
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  border-radius: 16px 16px 0 0;
  margin-top: 8px;
  max-height: 280px;
  overflow-y: auto;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.feature-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 8px;
  background: transparent;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: var(--color-background);
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }
}

.feature-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: var(--color-background);

  svg {
    width: 24px;
    height: 24px;
    color: var(--color-text-secondary);
  }
}

.feature-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  text-align: center;
}

// 加號按鈕激活狀態
.plus-btn.active {
  color: var(--color-primary);
  transform: rotate(45deg);
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
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
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
        background: rgba(255, 255, 255, 0.15);
        position: relative;
        flex-shrink: 0;
        transition: background 0.2s;

        .toggle-thumb {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #fff;
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

// ===== 天氣與位置面板樣式 =====
.wm-panel {
  background: var(--color-surface, #fff);
  border-radius: 24px;
  padding: 0;
  width: 92%;
  max-width: 380px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.wm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  .wm-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--color-text, #1a1a1a);
  }
  .wm-close {
    background: none;
    border: none;
    font-size: 18px;
    color: var(--color-text-secondary, #999);
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 8px;
    &:hover {
      background: var(--color-hover, rgba(0, 0, 0, 0.05));
    }
  }
}

.wm-cards {
  display: flex;
  gap: 12px;
  padding: 0 16px 16px;
}

.wm-card {
  flex: 1;
  min-width: 0;
  border-radius: 18px;
  padding: 14px 12px 12px;
  text-align: center;
  position: relative;
  transition:
    box-shadow 0.25s,
    transform 0.2s;

  &--user {
    background: linear-gradient(145deg, #dbeafe, #bfdbfe);
    color: #1e3a5f;
  }
  &--char {
    background: linear-gradient(145deg, #fce7f3, #fbcfe8);
    color: #831843;
  }
  &--editing {
    box-shadow: 0 0 0 2.5px var(--color-primary, #7dd3a8);
    transform: scale(1.02);
  }
}

.wm-card__header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-bottom: 8px;
}

.wm-card__icon {
  font-size: 14px;
}

.wm-card__avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
}

.wm-card__who {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 80px;
}

.wm-card__edit-btn {
  background: rgba(255, 255, 255, 0.5);
  border: none;
  font-size: 14px;
  cursor: pointer;
  padding: 2px 7px;
  border-radius: 8px;
  margin-left: auto;
  transition: background 0.15s;
  &:hover {
    background: rgba(255, 255, 255, 0.8);
  }
}

.wm-card__location {
  font-size: 12px;
  opacity: 0.75;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.wm-card__clear {
  background: none;
  border: none;
  font-size: 11px;
  opacity: 0.5;
  cursor: pointer;
  padding: 0 3px;
  &:hover {
    opacity: 1;
  }
}

.wm-card__temp {
  font-size: 36px;
  font-weight: 300;
  line-height: 1.1;
  letter-spacing: -1px;
}

.wm-card__cond {
  font-size: 13px;
  margin: 4px 0 2px;
  font-weight: 500;
}

.wm-card__meta {
  font-size: 11px;
  opacity: 0.6;
}

.wm-card__loading {
  font-size: 12px;
  opacity: 0.5;
  padding: 24px 0;
}

.wm-card__empty {
  font-size: 13px;
  opacity: 0.5;
  padding: 18px 0 4px;
}

.wm-card__hint {
  font-size: 11px;
  opacity: 0.4;
  padding-bottom: 6px;
}

// 搜尋區
.wm-search {
  padding: 0 16px 12px;
}

.wm-search__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary, #666);
  margin-bottom: 8px;
}

.wm-search__row {
  display: flex;
  gap: 8px;
}

.wm-search__input {
  flex: 1;
  padding: 10px 14px;
  border: 1.5px solid var(--color-border, #ddd);
  border-radius: 12px;
  font-size: 14px;
  outline: none;
  background: var(--color-background, #f8f8f8);
  color: var(--color-text, #333);
  transition: border-color 0.15s;
  &:focus {
    border-color: var(--color-primary, #7dd3a8);
  }
  &::placeholder {
    opacity: 0.45;
  }
}

.wm-search__btn {
  padding: 10px 16px;
  border-radius: 12px;
  border: none;
  background: var(--color-primary, #7dd3a8);
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.15s;
  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
  &:not(:disabled):hover {
    opacity: 0.85;
  }
}

.wm-search__results {
  max-height: 160px;
  overflow-y: auto;
  margin-top: 8px;
  border-radius: 12px;
  border: 1px solid var(--color-border, #eee);
  background: var(--color-surface, #fff);
}

.wm-search__result {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
  &:hover {
    background: var(--color-hover, rgba(0, 0, 0, 0.04));
  }
  & + & {
    border-top: 1px solid var(--color-border, #eee);
  }
}

.wm-search__result-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text, #333);
}

.wm-search__result-sub {
  font-size: 12px;
  opacity: 0.55;
  color: var(--color-text, #333);
  margin-left: auto;
  white-space: nowrap;
}

.wm-search__cancel {
  display: block;
  margin: 8px auto 0;
  background: none;
  border: none;
  font-size: 13px;
  color: var(--color-text-secondary, #888);
  cursor: pointer;
  padding: 4px 12px;
  border-radius: 8px;
  &:hover {
    background: var(--color-hover, rgba(0, 0, 0, 0.04));
  }
}

// 底部按鈕
.wm-footer {
  display: flex;
  gap: 12px;
  padding: 0 16px 16px;
}

.wm-btn {
  flex: 1;
  padding: 12px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition:
    opacity 0.15s,
    transform 0.1s;
  &:active {
    transform: scale(0.97);
  }

  &--cancel {
    background: var(--color-hover, #f0f0f0);
    color: var(--color-text, #333);
  }
  &--send {
    background: var(--color-primary, #7dd3a8);
    color: white;
    &:disabled {
      opacity: 0.4;
      cursor: default;
    }
    &:not(:disabled):hover {
      opacity: 0.9;
    }
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
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

// ===== 錄音覆蓋層 =====
.recording-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  top: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.recording-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.recording-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
}

.recording-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #e53e3e;
  animation: pulse-dot 1s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.3);
  }
}

.recording-time {
  font-size: 24px;
  color: white;
  font-variant-numeric: tabular-nums;
}

.recording-volume-bars {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 32px;
}

.volume-bar {
  width: 4px;
  min-height: 4px;
  background: var(--color-primary, #7dd3a8);
  border-radius: 2px;
  transition: height 0.1s ease;
}

.recording-hint {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  transition: color 0.2s;

  &.cancel {
    color: #e53e3e;
  }
}

// 麥克風按鈕樣式
.mic-btn {
  &:active {
    color: #e53e3e;
  }
}

// 聚焦時出現的行內錄音按鈕
.mic-inline-btn {
  color: var(--color-text-muted, #999);

  &:hover {
    color: var(--color-primary, #7dd3a8);
  }

  &:active {
    color: #e53e3e;
  }
}

// 淡入滑動動畫
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(8px);
}

// 文字輸入語音 Modal
.text-voice-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 200;
  padding-bottom: 80px;
}

.text-voice-modal {
  background: var(--color-surface, #fff);
  border-radius: 16px;
  padding: 16px;
  width: calc(100% - 32px);
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.text-voice-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #333);
}

.text-voice-input {
  width: 100%;
  border: 1px solid var(--color-border, #e0e0e0);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  resize: none;
  background: var(--color-bg, #f5f5f5);
  color: var(--color-text, #333);
  outline: none;
  box-sizing: border-box;
  &:focus {
    border-color: var(--color-primary, #7dd3a8);
  }
}

.text-voice-hint {
  font-size: 11px;
  color: var(--color-text-secondary, #999);
  text-align: right;
}

.text-voice-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.text-voice-cancel {
  padding: 7px 16px;
  border-radius: 8px;
  border: 1px solid var(--color-border, #e0e0e0);
  background: transparent;
  color: var(--color-text, #333);
  font-size: 13px;
  cursor: pointer;
}

.text-voice-send {
  padding: 7px 16px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary, #7dd3a8);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  &:active {
    opacity: 0.85;
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

  // 頂欄在平板上增加間距
  .chat-header {
    padding: 14px 24px;
    padding-left: calc(24px + var(--safe-left));
    padding-right: calc(24px + var(--safe-right));
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
