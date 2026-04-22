<script setup lang="ts">
import WhiteboardCanvas from "@/components/canvas/WhiteboardCanvas.vue";
import GlobalGenerationIndicator from "@/components/common/GlobalGenerationIndicator.vue";
import GlobalPhoneCallBar from "@/components/common/GlobalPhoneCallBar.vue";
import MinimizedIndicator from "@/components/common/MinimizedIndicator.vue";
import NotificationToast from "@/components/common/NotificationToast.vue";
import StreamingOutputWindow from "@/components/common/StreamingOutputWindow.vue";
import NeonWheelDock from "@/components/dock/NeonWheelDock.vue";
import IncomingCallModal from "@/components/modals/IncomingCallModal.vue";
import PhoneCallModal from "@/components/modals/PhoneCallModal.vue";
import VideoCallModal from "@/components/modals/VideoCallModal.vue";
import AuthScreen from "@/components/screens/AuthScreen.vue";
import { useStreamingWindow } from "@/composables/useStreamingWindow";
import { useSwipeBack } from "@/composables/useSwipeBack";
import { useTimeTheme } from "@/composables/useTimeTheme";
import { proactiveMessageService } from "@/services/ProactiveMessageService";
import {
  useCanvasStore,
  useCharactersStore,
  useChatStore,
  useLorebooksStore,
  useMusicStore,
  useNotificationStore,
  useSettingsStore,
  useStickerStore,
  useThemeStore,
} from "@/stores";
import { useAIGenerationStore } from "@/stores/aiGeneration";
import { useAuthStore } from "@/stores/auth";
import { useGitHubBackupStore } from "@/stores/githubBackup";
import { useSelfHostedSyncStore } from "@/stores/selfHostedSync";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
// 頁面組件
import {
  AICharacterModal,
  ImportModal,
  ThemeSettingsModal,
} from "@/components/modals";
import GlobalThemeModal from "@/components/modals/GlobalThemeModal.vue";
import FoodLogManager from "@/components/modals/FoodLogManager.vue";
import MediaLogManager from "@/components/modals/MediaLogManager.vue";
import MultiCharSetupModal from "@/components/modals/MultiCharSetupModal.vue";
import PhoneContactPickerModal from "@/components/modals/PhoneContactPickerModal.vue";
import PomodoroCertModal from "@/components/modals/PomodoroCertModal.vue";
import BookReaderScreen from "@/components/screens/BookReaderScreen.vue";
import BookShelfScreen from "@/components/screens/BookShelfScreen.vue";
import CalendarScreen from "@/components/screens/CalendarScreen.vue";
import CharacterEditScreen from "@/components/screens/CharacterEditScreen.vue";
import CharacterListScreen from "@/components/screens/CharacterListScreen.vue";
import ChatListScreen from "@/components/screens/ChatListScreen.vue";
import ChatScreen from "@/components/screens/ChatScreen.vue";
import DeliveryMallScreen from "@/components/screens/DeliveryMallScreen.vue";
import FateScreen from "@/components/screens/FateScreen.vue";
import FitnessScreen from "@/components/screens/FitnessScreen.vue";
import GameCenterScreen from "@/components/screens/GameCenterScreen.vue";
import LorebookEditScreen from "@/components/screens/LorebookEditScreen.vue";
import LorebookListScreen from "@/components/screens/LorebookListScreen.vue";
import MusicAppScreen from "@/components/screens/MusicAppScreen.vue";
import PeekPhoneScreen from "@/components/screens/PeekPhoneScreen.vue";
import PeekPhoneSelectScreen from "@/components/screens/PeekPhoneSelectScreen.vue";
import PomodoroFocusScreen from "@/components/screens/PomodoroFocusScreen.vue";
import PomodoroScreen from "@/components/screens/PomodoroScreen.vue";
import PromptManagerScreen from "@/components/screens/PromptManagerScreen.vue";
import QZoneScreen from "@/components/screens/QZoneScreen.vue";
import RegexScriptsScreen from "@/components/screens/RegexScriptsScreen.vue";
import SettingsScreen from "@/components/screens/SettingsScreen.vue";
import ShopScreen from "@/components/screens/ShopScreen.vue";
import TheaterScreen from "@/components/screens/TheaterScreen.vue";
import UserProfileScreen from "@/components/screens/UserProfileScreen.vue";
import WeatherScreen from "@/components/screens/WeatherScreen.vue";
import { useBackgroundAudio } from "@/composables/useBackgroundAudio";
import { db, DB_STORES } from "@/db/database";
import {
  createChatRecord,
  loadAllChats,
  loadChatById,
  loadChatsByCharacter,
  resolvePreferredDirectChat,
  setLastActiveChatId,
} from "@/storage/chatStorage";
import { useUserStore } from "@/stores";
import { usePhoneCallStore } from "@/stores/phoneCall";
import type { CharacterImportResult } from "@/types/character";
import type { Chat, MultiCharMember, WaimaiOrderSnapshot } from "@/types/chat";
import {
  consumePendingRuntimeDiagnostics,
  recordRuntimeDiagnostic,
  recordRuntimeError,
  updateRuntimeSessionStage,
} from "@/utils/runtimeDiagnostics";
import { applyServiceWorkerUpdate } from "@/utils/storagePersistence";
import { getIncomingCallScheduler } from "./services/IncomingCallScheduler";
import { PendingCall } from "./types";

// 時間動態主題
const { backgroundColor, textColor, isDark } = useTimeTheme();

type ServiceWorkerMessageData = {
  type?: string;
  navigateTo?: string;
  chatId?: string;
  characterId?: string;
};

// 背景無聲音樂（防止後台暫停）
useBackgroundAudio();

// 畫布 store（用於獲取動態 gridSize）
const canvasStore = useCanvasStore();

// 主題 store
const themeStore = useThemeStore();

// 角色和世界書 stores
const charactersStore = useCharactersStore();
const lorebooksStore = useLorebooksStore();

// 聊天 store
const chatStore = useChatStore();

// 設定 store（API 配置）
const settingsStore = useSettingsStore();

// 使用者 store
const userStore = useUserStore();

// 表情包 store
const stickerStore = useStickerStore();

// 通知 store
const notificationStore = useNotificationStore();

// 驗證 store
const authStore = useAuthStore();
const selfHostedSyncStore = useSelfHostedSyncStore();

// GitHub 雲端備份全局狀態
const _ghBackupStore = useGitHubBackupStore();
const ghBackupBusy = computed(() => _ghBackupStore.busy);
const ghBackupPercent = computed(() => _ghBackupStore.percent);
const ghBackupDisplayText = computed(() => _ghBackupStore.displayText);

const SELF_HOSTED_FOREGROUND_PULL_COOLDOWN_MS = 15000;
let lastSelfHostedForegroundPullAt = 0;
const SELF_HOSTED_WS_RECONNECT_BASE_MS = 3000;
const SELF_HOSTED_WS_RECONNECT_MAX_MS = 30000;
let selfHostedSyncSocket: WebSocket | null = null;
let selfHostedSyncSocketToken: string | null = null;
let selfHostedSyncSocketReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let selfHostedSyncSocketReconnectAttempt = 0;
let selfHostedSyncRemotePullInFlight: Promise<void> | null = null;
let selfHostedSyncMetaCheckInFlight: Promise<boolean> | null = null;

type SelfHostedSyncSocketMessage = {
  type?: string;
  userId?: string;
  deviceId?: string;
  sourceDeviceId?: string;
  serverTime?: number;
  latestUpdateAt?: number | null;
  accepted?: number;
  message?: string;
};

function recordSelfHostedSyncDiagnostic(message: string, details?: unknown) {
  recordRuntimeDiagnostic("event", "selfHostedSync", message, details);
  updateRuntimeSessionStage(`selfHostedSync:${message}`, details);
}

function recordSelfHostedSyncFailure(message: string, error: unknown, details?: unknown) {
  updateRuntimeSessionStage(`selfHostedSync failure:${message}`, details);
  recordRuntimeError("selfHostedSync", error, {
    message,
    details,
  });
}

function notifyPendingRuntimeDiagnostics() {
  const pendingEntries = consumePendingRuntimeDiagnostics();
  pendingEntries.forEach((entry) => {
    notificationStore.notifySystem(`上次${entry.kind === "reload" ? "重整" : "錯誤"}來源：${entry.source}`, entry.message);
  });
}

function clearSelfHostedSyncSocketReconnectTimer() {
  if (selfHostedSyncSocketReconnectTimer) {
    clearTimeout(selfHostedSyncSocketReconnectTimer);
    selfHostedSyncSocketReconnectTimer = null;
  }
}

function closeSelfHostedSyncSocket() {
  clearSelfHostedSyncSocketReconnectTimer();
  if (selfHostedSyncSocket) {
    selfHostedSyncSocket.onopen = null;
    selfHostedSyncSocket.onmessage = null;
    selfHostedSyncSocket.onerror = null;
    selfHostedSyncSocket.onclose = null;
    selfHostedSyncSocket.close();
    selfHostedSyncSocket = null;
  }
  selfHostedSyncSocketToken = null;
}

function buildSelfHostedSyncWebSocketUrl(serverUrl: string, accessToken: string): string {
  const normalized = serverUrl.trim().replace(/\/+$/, "");
  const wsBase = normalized.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
  const url = new URL(`${wsBase}/sync/ws`);
  url.searchParams.set("token", accessToken);
  return url.toString();
}

async function shouldPullSelfHostedRemoteUpdates(latestUpdateAtHint?: number | null): Promise<boolean> {
  if (selfHostedSyncMetaCheckInFlight) {
    return selfHostedSyncMetaCheckInFlight;
  }

  selfHostedSyncMetaCheckInFlight = (async () => {
    updateRuntimeSessionStage("selfHostedSync:metadata check start", {
      latestUpdateAtHint: latestUpdateAtHint ?? null,
    });
    await selfHostedSyncStore.loadSettings();
    if (!selfHostedSyncStore.enabled || !selfHostedSyncStore.isAuthenticated) {
      return false;
    }

    const localLastSyncAt = selfHostedSyncStore.lastSyncAt ?? 0;
    if (typeof latestUpdateAtHint === "number") {
      recordSelfHostedSyncDiagnostic("Received remote latestUpdateAt hint", {
        latestUpdateAtHint,
        localLastSyncAt,
      });
      return latestUpdateAtHint > localLastSyncAt;
    }

    const meta = await selfHostedSyncStore.refreshMeta();
    const remoteLastUpdateAt = meta.latestUpdateAt ?? 0;
    recordSelfHostedSyncDiagnostic("Fetched self-hosted sync metadata", {
      localLastSyncAt,
      remoteLastUpdateAt,
    });
    return remoteLastUpdateAt > localLastSyncAt;
  })();

  try {
    return await selfHostedSyncMetaCheckInFlight;
  } finally {
    selfHostedSyncMetaCheckInFlight = null;
  }
}

async function pullSelfHostedRemoteUpdates(latestUpdateAtHint?: number | null) {
  if (selfHostedSyncRemotePullInFlight) {
    return selfHostedSyncRemotePullInFlight;
  }

  selfHostedSyncRemotePullInFlight = (async () => {
    try {
      const shouldPull = await shouldPullSelfHostedRemoteUpdates(latestUpdateAtHint);
      if (!shouldPull) {
        updateRuntimeSessionStage("selfHostedSync:remote pull skipped", {
          latestUpdateAtHint: latestUpdateAtHint ?? null,
        });
        return;
      }
      recordSelfHostedSyncDiagnostic("Starting remote pull", {
        latestUpdateAtHint: latestUpdateAtHint ?? null,
        lastSyncAt: selfHostedSyncStore.lastSyncAt ?? null,
      });
      await selfHostedSyncStore.pullNow(selfHostedSyncStore.lastSyncAt ?? undefined);
      updateRuntimeSessionStage("selfHostedSync:remote pull completed", {
        latestUpdateAtHint: latestUpdateAtHint ?? null,
        lastSyncAt: selfHostedSyncStore.lastSyncAt ?? null,
      });
    } catch (error) {
      recordSelfHostedSyncFailure("Metadata check or remote pull failed", error, {
        latestUpdateAtHint: latestUpdateAtHint ?? null,
      });
      console.warn("[App] 自架同步 metadata 檢查或拉取失敗:", error);
    } finally {
      selfHostedSyncRemotePullInFlight = null;
    }
  })();

  return selfHostedSyncRemotePullInFlight;
}

function scheduleSelfHostedSyncSocketReconnect() {
  if (selfHostedSyncSocketReconnectTimer || !authStore.isAuthenticated) {
    return;
  }

  const delay = Math.min(
    SELF_HOSTED_WS_RECONNECT_BASE_MS * Math.max(1, 2 ** selfHostedSyncSocketReconnectAttempt),
    SELF_HOSTED_WS_RECONNECT_MAX_MS,
  );
  selfHostedSyncSocketReconnectAttempt += 1;
  selfHostedSyncSocketReconnectTimer = setTimeout(() => {
    selfHostedSyncSocketReconnectTimer = null;
    void ensureSelfHostedSyncSocketConnected();
  }, delay);
}

async function ensureSelfHostedSyncSocketConnected() {
  updateRuntimeSessionStage("selfHostedSync:websocket ensure start");
  await selfHostedSyncStore.loadSettings();

  if (!authStore.isAuthenticated || !selfHostedSyncStore.enabled || !selfHostedSyncStore.accessToken) {
    closeSelfHostedSyncSocket();
    return;
  }

  if (
    selfHostedSyncSocket &&
    selfHostedSyncSocket.readyState !== WebSocket.CLOSED &&
    selfHostedSyncSocketToken === selfHostedSyncStore.accessToken
  ) {
    return;
  }

  if (selfHostedSyncSocket && selfHostedSyncSocket.readyState !== WebSocket.CLOSED) {
    closeSelfHostedSyncSocket();
  }

  closeSelfHostedSyncSocket();

  try {
    const socketUrl = buildSelfHostedSyncWebSocketUrl(
      selfHostedSyncStore.serverUrl,
      selfHostedSyncStore.accessToken,
    );
    recordSelfHostedSyncDiagnostic("Opening self-hosted sync WebSocket", {
      serverUrl: selfHostedSyncStore.serverUrl,
    });
    const socket = new WebSocket(socketUrl);
    selfHostedSyncSocket = socket;
    selfHostedSyncSocketToken = selfHostedSyncStore.accessToken;

    socket.onopen = () => {
      selfHostedSyncSocketReconnectAttempt = 0;
      clearSelfHostedSyncSocketReconnectTimer();
      recordSelfHostedSyncDiagnostic("Self-hosted sync WebSocket opened", {
        reconnectAttempt: selfHostedSyncSocketReconnectAttempt,
      });
      updateRuntimeSessionStage("selfHostedSync:websocket opened awaiting first message", {
        reconnectAttempt: selfHostedSyncSocketReconnectAttempt,
      });
    };

    socket.onmessage = (event) => {
      try {
        recordSelfHostedSyncDiagnostic("Self-hosted sync WebSocket message received", {
          rawLength: String(event.data).length,
        });
        updateRuntimeSessionStage("selfHostedSync:websocket message received", {
          rawLength: String(event.data).length,
        });
        const payload = JSON.parse(String(event.data)) as SelfHostedSyncSocketMessage;
        recordSelfHostedSyncDiagnostic("Self-hosted sync WebSocket message parsed", {
          type: payload.type ?? "unknown",
          latestUpdateAt: payload.latestUpdateAt ?? null,
        });
        updateRuntimeSessionStage("selfHostedSync:websocket message parsed", {
          type: payload.type ?? "unknown",
          latestUpdateAt: payload.latestUpdateAt ?? null,
        });
        if (payload.type === "sync:ready") {
          recordSelfHostedSyncDiagnostic("Self-hosted sync WebSocket ready", {
            serverTime: payload.serverTime ?? null,
            deviceId: payload.deviceId ?? null,
          });
          updateRuntimeSessionStage("selfHostedSync:websocket ready received", {
            serverTime: payload.serverTime ?? null,
            deviceId: payload.deviceId ?? null,
          });
          return;
        }
        if (payload.type === "sync:update") {
          recordSelfHostedSyncDiagnostic("Self-hosted sync WebSocket update received", {
            latestUpdateAt: payload.latestUpdateAt ?? null,
            sourceDeviceId: payload.sourceDeviceId ?? payload.deviceId ?? null,
          });
          updateRuntimeSessionStage("selfHostedSync:websocket update received", {
            latestUpdateAt: payload.latestUpdateAt ?? null,
            sourceDeviceId: payload.sourceDeviceId ?? payload.deviceId ?? null,
          });
          // 忽略來自自己裝置的同步廣播，避免 push → 自回拉 → 大量寫入的回環
          // 後端理論上已過濾，此處為 defense-in-depth（多 tab / 重連 / deviceId 漂移）
          const localDeviceId = selfHostedSyncStore.deviceId;
          const eventSourceDeviceId = payload.sourceDeviceId ?? payload.deviceId ?? null;
          if (
            localDeviceId &&
            eventSourceDeviceId &&
            eventSourceDeviceId === localDeviceId
          ) {
            recordSelfHostedSyncDiagnostic(
              "Skipped self-originated sync:update",
              {
                sourceDeviceId: eventSourceDeviceId,
                localDeviceId,
                latestUpdateAt: payload.latestUpdateAt ?? null,
              },
            );
            return;
          }
          updateRuntimeSessionStage("selfHostedSync:websocket update triggering pull", {
            latestUpdateAt: payload.latestUpdateAt ?? null,
            sourceDeviceId: eventSourceDeviceId,
          });
          void pullSelfHostedRemoteUpdates(payload.latestUpdateAt ?? null);
        }
      } catch (error) {
        recordSelfHostedSyncFailure("WebSocket message parse failed", error, {
          rawData: String(event.data),
        });
        console.warn("[App] WebSocket 自架同步訊息解析失敗:", error);
      }
    };

    socket.onerror = () => {
      recordSelfHostedSyncDiagnostic("Self-hosted sync WebSocket error event", {
        readyState: socket.readyState,
      });
      if (selfHostedSyncSocket === socket) {
        scheduleSelfHostedSyncSocketReconnect();
      }
    };

    socket.onclose = () => {
      recordSelfHostedSyncDiagnostic("Self-hosted sync WebSocket closed", {
        readyState: socket.readyState,
      });
      if (selfHostedSyncSocket === socket) {
        selfHostedSyncSocket = null;
        scheduleSelfHostedSyncSocketReconnect();
      }
    };
  } catch (error) {
    recordSelfHostedSyncFailure("Unable to create self-hosted sync WebSocket", error, {
      serverUrl: selfHostedSyncStore.serverUrl,
    });
    console.warn("[App] 無法建立自架同步 WebSocket:", error);
    scheduleSelfHostedSyncSocketReconnect();
  }
}

async function tryForegroundPullSelfHostedSync() {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    return;
  }

  const now = Date.now();
  if (
    now - lastSelfHostedForegroundPullAt < SELF_HOSTED_FOREGROUND_PULL_COOLDOWN_MS
  ) {
    return;
  }

  try {
    await selfHostedSyncStore.loadSettings();
    if (!selfHostedSyncStore.enabled || !selfHostedSyncStore.isAuthenticated) {
      return;
    }

    lastSelfHostedForegroundPullAt = now;
    await pullSelfHostedRemoteUpdates();
  } catch (error) {
    recordSelfHostedSyncFailure("Foreground self-hosted sync pull failed", error);
    console.warn("[App] 前景自架同步拉取失敗:", error);
  }
}

function handleSelfHostedSyncForegroundResume() {
  void tryForegroundPullSelfHostedSync();
}

// ===== 全局電話通話 =====
const phoneCallStore = usePhoneCallStore();

// ===== 通話恢復彈窗 =====
const showResumeCallDialog = ref(false);
const resumeCallSnapshot =
  ref<ReturnType<typeof phoneCallStore.loadCallSnapshot>>(null);

// ===== SW 更新提示 =====
const showSwUpdateToast = ref(false);

// ===== 向量記憶模型下載提示 =====
const showEmbeddingModelPrompt = ref(false);
const embeddingModelDownloading = ref(false);
const embeddingModelProgress = ref(0);
const embeddingModelFile = ref("");

function handleSwUpdate() {
  showSwUpdateToast.value = true;
}

async function applySwUpdate() {
  showSwUpdateToast.value = false;
  await applyServiceWorkerUpdate();
}

function dismissSwUpdate() {
  showSwUpdateToast.value = false;
}

// ===== 全局流式輸出窗口 =====
const streamingWindow = useStreamingWindow();
const isMinimizing = ref(false);

function handleGlobalStreamingClose() {
  streamingWindow.emit("close");
  // 無論是否有監聽者（ChatScreen 可能已卸載），都直接隱藏窗口
  // 當用戶離開聊天頁面（如進入設定），ChatScreen 的事件監聽已被移除，
  // 如果不直接 hide()，關閉按鈕將失效，窗口無法關閉
  streamingWindow.hide();
}

function handleGlobalStreamingStop() {
  // 中止所有正在進行的 AI 生成任務
  const aiGenerationStore = useAIGenerationStore();
  for (const task of aiGenerationStore.activeTasks) {
    aiGenerationStore.abortGeneration(task.chatId, task.taskType);
  }
  streamingWindow.emit("stop");
}

function handleGlobalStreamingMinimize() {
  isMinimizing.value = true;
  streamingWindow.minimize();
  streamingWindow.emit("minimize");
  setTimeout(() => {
    isMinimizing.value = false;
  }, 350);
}

function handleGlobalStreamingRestore() {
  streamingWindow.restore();
  streamingWindow.emit("restore");
}

// 節日系統
import { holidayService } from "@/services/HolidayService";
import { useHolidayStore } from "@/stores/holiday";

// 當前頁面
type PageType =
  | "home"
  | "character"
  | "character-edit"
  | "worldbook"
  | "worldbook-edit"
  | "chat"
  | "chat-list"
  | "settings"
  | "prompt-manager"
  | "regex-scripts"
  | "music"
  | "qzone"
  | "user"
  | "weather"
  | "shop"
  | "game-center"
  | "delivery-mall"
  | "theater"
  | "calendar"
  | "fitness"
  | "bookshelf"
  | "peek-phone-select"
  | "peek-phone"
  | "fate"
  | "pomodoro"
  | "pomodoro-focus";
const currentPage = ref<PageType>("home");

type AppHistoryState = {
  __aguaphone: true;
  page: PageType;
  navigationHistory: PageType[];
  selectedCharacterId: string | null;
  selectedLorebookId: string | null;
  isCreatingNew: boolean;
  currentChatId: string | null;
  currentChatCharacterId: string | null;
  pendingTheaterPostId?: string;
};

// 導航歷史堆疊（用於快捷導航返回）
const navigationHistory = ref<PageType[]>([]);

// 選中項目的 ID
const selectedCharacterId = ref<string | null>(null);
const selectedLorebookId = ref<string | null>(null);
const isCreatingNew = ref(false);

// 聊天相關
const chatCharacterName = ref("示範角色");
const chatCharacterAvatar = ref(
  "https://api.dicebear.com/7.x/adventurer/svg?seed=demo1",
);
const currentChatId = ref<string | null>(null);
const currentChatCharacterId = ref<string | null>(null);

// 主題設定彈窗
const showThemeSettings = ref(false);

// 全局美化配置彈窗
const showGlobalTheme = ref(false);

// 聊天專屬外觀（當在聊天頁面時傳遞給 ThemeSettingsModal）
import type { ChatAppearance } from "@/types/chat";
const currentChatAppearance = ref<ChatAppearance | undefined>(undefined);

// 待更新的聊天外觀（用於傳遞給 ChatScreen）
const pendingChatAppearance = ref<ChatAppearance | undefined>(undefined);

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
  isMusicShare?: boolean;
  musicShareData?: {
    name: string;
    artist: string;
    album?: string;
    cover?: string;
    lyrics?: string;
  };
}

// 待注入的聊天訊息（用於遊戲分享成績、外賣分享等場景）
const pendingChatMessage = ref<string | PendingInjectedMessage>("");

// 導入彈窗
const showImportModal = ref(false);
const importType = ref<"character" | "lorebook">("character");

// AI 角色生成彈窗
const showAICharacterModal = ref(false);

// 書影記錄管理彈窗
const showMediaLogManager = ref(false);

// 食記管理彈窗
const showFoodLogManager = ref(false);

// 電話聯絡人選擇彈窗
const showPhoneContactPicker = ref(false);
const startPhoneCallFlag = ref(false);
const pendingIncomingCallReason = ref("");

// 多人卡模式設定彈窗
const showMultiCharSetup = ref(false);
const multiCharSetupCharacterId = ref("");

// ===== 角色庫開聊天選擇彈窗 =====
const showChatPickerModal = ref(false);
const chatPickerCharacterId = ref("");
const chatPickerChats = ref<Chat[]>([]);
const chatPickerGreetingIndex = ref(0);
/** 角色庫聊天選擇：取得該角色所有開場白 */
const chatPickerGreetings = computed(() => {
  const char = charactersStore.characters.find(
    (c) => c.id === chatPickerCharacterId.value,
  );
  if (!char?.data) return [];
  const list: { label: string; content: string }[] = [];
  if (char.data.first_mes) {
    list.push({ label: "開場白 1（預設）", content: char.data.first_mes });
  }
  if (char.data.alternate_greetings?.length) {
    char.data.alternate_greetings.forEach((g, i) => {
      if (g) list.push({ label: `開場白 ${i + 2}`, content: g });
    });
  }
  return list;
});

// 書架 / 閱讀器
import type { StoredBook } from "@/types/book";
const currentBook = ref<StoredBook | null>(null);

// ===== 頭盔TA手機 =====
const peekPhoneCharacterId = ref<string | null>(null);
const peekPhoneChatId = ref<string | null>(null);

let isApplyingPopState = false;

function buildHistoryState(page: PageType = currentPage.value): AppHistoryState {
  return {
    __aguaphone: true,
    page,
    navigationHistory: [...navigationHistory.value],
    selectedCharacterId: selectedCharacterId.value,
    selectedLorebookId: selectedLorebookId.value,
    isCreatingNew: isCreatingNew.value,
    currentChatId: currentChatId.value,
    currentChatCharacterId: currentChatCharacterId.value,
    pendingTheaterPostId: pendingTheaterPostId.value,
  };
}

function applyHistoryState(state: AppHistoryState) {
  navigationHistory.value = [...state.navigationHistory];
  currentPage.value = state.page;
  selectedCharacterId.value = state.selectedCharacterId;
  selectedLorebookId.value = state.selectedLorebookId;
  isCreatingNew.value = state.isCreatingNew;
  currentChatId.value = state.currentChatId;
  currentChatCharacterId.value = state.currentChatCharacterId;
  pendingTheaterPostId.value = state.pendingTheaterPostId;

  if (state.page !== "bookshelf") {
    currentBook.value = null;
  }
}

function syncBrowserHistory(mode: "push" | "replace" = "push", page: PageType = currentPage.value) {
  if (isApplyingPopState || !authStore.isAuthenticated || typeof window === "undefined") {
    return;
  }

  const state = buildHistoryState(page);
  if (mode === "replace") {
    window.history.replaceState(state, "");
  } else {
    window.history.pushState(state, "");
  }
}

function navigateToPage(
  page: PageType,
  options: {
    mode?: "push" | "replace";
    historyStack?: PageType[];
  } = {},
) {
  if (options.historyStack) {
    navigationHistory.value = [...options.historyStack];
  }
  currentPage.value = page;
  syncBrowserHistory(options.mode ?? "push", page);
}

function resetToPage(page: PageType) {
  navigationHistory.value = [];
  navigateToPage(page, { mode: "replace" });
}

function navigateBackWithFallback(fallback: () => void) {
  if (typeof window !== "undefined" && window.history.state?.__aguaphone) {
    window.history.back();
    return;
  }
  fallback();
}

function handleBrowserPopState(event: PopStateEvent) {
  const state = event.state as AppHistoryState | null;
  if (!state?.__aguaphone) {
    return;
  }

  isApplyingPopState = true;
  applyHistoryState(state);
  isApplyingPopState = false;
}

function initializeBrowserHistory() {
  if (!authStore.isAuthenticated || typeof window === "undefined") {
    return;
  }

  const initialState = buildHistoryState("home");
  window.history.replaceState(initialState, "");
}

// ===== 來電功能 =====
const showIncomingCallModal = ref(false);
const currentPendingCall = ref<PendingCall | null>(null);
const incomingCallScheduler = getIncomingCallScheduler();
let pendingCallCheckTimer: ReturnType<typeof setInterval> | null = null;

// 檢查待處理來電（App 級別）
async function checkPendingCallsAtAppLevel() {
  // 如果已經在聊天頁面，讓 ChatScreen 處理
  if (currentPage.value === "chat") {
    return;
  }

  // 獲取所有聊天的勿擾設定
  const chatDoNotDisturbMap = new Map<string, boolean>();
  try {
    const allChats = await loadAllChats();
    for (const chat of allChats) {
      if (chat.doNotDisturb) {
        chatDoNotDisturbMap.set(chat.id, true);
      }
    }
  } catch (e) {
    console.error("[App] 獲取聊天勿擾設定失敗:", e);
  }

  // 傳入全域勿擾模式和聊天勿擾設定
  const pendingCall = await incomingCallScheduler.checkPendingCalls(
    settingsStore.doNotDisturb,
    chatDoNotDisturbMap,
  );
  if (pendingCall) {
    console.log("[App] 發現待處理來電:", pendingCall);
    const isSamePendingCall = currentPendingCall.value?.id === pendingCall.id;

    currentPendingCall.value = pendingCall;
    showIncomingCallModal.value = true;

    if (!isSamePendingCall) {
      notificationStore.notifyIncomingCall(
        pendingCall.characterName,
        pendingCall.reason,
        pendingCall.chatId,
        pendingCall.characterId,
        pendingCall.characterAvatar,
      );
    }
  }
}

// 處理接聽來電（App 級別）
async function handleIncomingCallAccept() {
  if (!currentPendingCall.value) return;

  const pendingCall = currentPendingCall.value;

  // 記錄通話歷史
  await incomingCallScheduler.recordCallHistory(
    pendingCall.characterId,
    pendingCall.chatId,
    "incoming",
    "answered",
    0,
    pendingCall.reason,
  );

  // 移除待處理來電記錄
  await incomingCallScheduler.cancelPendingCall(pendingCall.id);

  // 關閉來電模態框
  showIncomingCallModal.value = false;

  // 導航到聊天頁面並開始通話
  const character = charactersStore.characters.find(
    (c) => c.id === pendingCall.characterId,
  );
  if (character) {
    chatCharacterName.value =
      character.nickname || character.data?.name || "角色";
    chatCharacterAvatar.value = character.avatar || "";
    currentChatCharacterId.value = pendingCall.characterId;
    currentChatId.value = pendingCall.chatId || null;
    pendingIncomingCallReason.value = pendingCall.reason;
    navigateToPage("chat");
  }

  currentPendingCall.value = null;
}

// 處理拒接來電（App 級別）
async function handleIncomingCallDecline() {
  if (!currentPendingCall.value) return;

  const pendingCall = currentPendingCall.value;

  // 記錄通話歷史
  await incomingCallScheduler.recordCallHistory(
    pendingCall.characterId,
    pendingCall.chatId,
    "incoming",
    "declined",
    0,
    pendingCall.reason,
  );

  // 移除待處理來電記錄
  await incomingCallScheduler.cancelPendingCall(pendingCall.id);

  // 關閉來電模態框
  showIncomingCallModal.value = false;
  currentPendingCall.value = null;

  console.log("[App] 來電已拒接");
}

// 處理未接來電（App 級別）
async function handleIncomingCallMissed() {
  if (!currentPendingCall.value) return;

  const pendingCall = currentPendingCall.value;

  // 記錄通話歷史
  await incomingCallScheduler.recordCallHistory(
    pendingCall.characterId,
    pendingCall.chatId,
    "incoming",
    "missed",
    0,
    pendingCall.reason,
  );

  // 移除待處理來電記錄
  await incomingCallScheduler.cancelPendingCall(pendingCall.id);

  // 關閉來電模態框
  showIncomingCallModal.value = false;
  currentPendingCall.value = null;

  console.log("[App] 來電未接");
}

// 啟動待處理來電檢查定時器
function startPendingCallChecker() {
  // 每 5 秒檢查一次
  pendingCallCheckTimer = setInterval(() => {
    checkPendingCallsAtAppLevel();
  }, 5000);

  // 立即檢查一次（App 啟動時）
  checkPendingCallsAtAppLevel();
}

// 停止待處理來電檢查定時器
function stopPendingCallChecker() {
  if (pendingCallCheckTimer) {
    clearInterval(pendingCallCheckTimer);
    pendingCallCheckTimer = null;
  }
}

// 全局繁簡轉換（動態 import 避免被格式化器移除）
let globalLanguageDestroy: (() => void) | null = null;

// 節日檢測事件處理
function handleHolidayDetected(event: Event) {
  const detail = (event as CustomEvent).detail;
  if (detail?.holiday) {
    const holidayStore = useHolidayStore();
    holidayStore.refreshTodayHoliday();
    console.log(`🎉 [App] 節日檢測事件: ${detail.holiday.name}`);
  }
}

// ===== 釣魚掛機檢測 =====
import { useGameEconomyStore } from "@/stores/gameEconomy";

// 檢測釣魚掛機狀態（切回 app 時觸發）
async function checkFishingIdleStatus() {
  const gameEconomyStore = useGameEconomyStore();
  const GLOBAL_WALLET_ID = "global";

  // 檢查是否正在掛機
  if (!gameEconomyStore.isIdle(GLOBAL_WALLET_ID)) {
    return;
  }

  // 計算掛機收益
  const rewards = gameEconomyStore.calculateIdleRewards(GLOBAL_WALLET_ID);

  if (!rewards.hasSession) {
    return;
  }

  // 計算掛機時長（分鐘）
  const idleMinutes = Math.floor(rewards.duration / 60000);
  const idleHours = Math.floor(idleMinutes / 60);

  // 檢查是否達到 24 小時上限
  const reachedTimeLimit =
    rewards.duration >= rewards.effectiveDuration &&
    rewards.effectiveDuration >= 24 * 60 * 60 * 1000;

  // 檢查魚竿耐力是否即將耗盡或已耗盡
  const rodAlmostBroken =
    rewards.remainingDurability <= 5 && rewards.remainingDurability > 0;
  const rodBroken = rewards.rodWillBreak;

  // 發送通知
  if (reachedTimeLimit) {
    // 達到 24 小時上限
    notificationStore.addNotification({
      type: "fishing_daily",
      title: "釣魚掛機已達上限",
      message: `已掛機 24 小時，釣到 ${rewards.fishCount} 條魚，快去收魚吧！`,
      priority: "high",
      navigateTo: "open_fishing",
      data: { fishCount: rewards.fishCount },
    });
    console.log(`🎣 [App] 釣魚掛機達到 24h 上限: ${rewards.fishCount} 條魚`);
  } else if (rodBroken) {
    // 魚竿耐力已耗盡
    notificationStore.addNotification({
      type: "fishing_stamina",
      title: "魚竿耐力已耗盡",
      message: `已掛機 ${idleHours > 0 ? `${idleHours}小時` : `${idleMinutes}分鐘`}，釣到 ${rewards.fishCount} 條魚，魚竿已損壞！`,
      priority: "high",
      navigateTo: "open_fishing",
      data: { fishCount: rewards.fishCount, rodBroken: true },
    });
    console.log(`🎣 [App] 魚竿耐力耗盡: ${rewards.fishCount} 條魚`);
  } else if (rodAlmostBroken) {
    // 魚竿耐力即將耗盡（剩餘 5 點以下）
    notificationStore.addNotification({
      type: "fishing_stamina",
      title: "魚竿耐力即將耗盡",
      message: `已掛機 ${idleHours > 0 ? `${idleHours}小時` : `${idleMinutes}分鐘`}，釣到 ${rewards.fishCount} 條魚，魚竿剩餘耐力 ${rewards.remainingDurability}`,
      priority: "normal",
      navigateTo: "open_fishing",
      data: {
        fishCount: rewards.fishCount,
        remainingDurability: rewards.remainingDurability,
      },
    });
    console.log(
      `🎣 [App] 魚竿耐力即將耗盡: 剩餘 ${rewards.remainingDurability}`,
    );
  } else if (idleHours >= 1) {
    // 掛機超過 1 小時，提醒一下
    notificationStore.notifySystem(
      "釣魚掛機中",
      `已掛機 ${idleHours}小時，預計釣到 ${rewards.fishCount} 條魚`,
    );
    console.log(
      `🎣 [App] 釣魚掛機檢測: ${idleHours}h, ${rewards.fishCount} 條魚`,
    );
  }
}

// 頁面可見性變化處理（切回 app 時檢測）
function handleVisibilityChange() {
  if (document.visibilityState === "visible") {
    console.log("[App] 頁面重新可見，檢測釣魚掛機狀態");
    checkFishingIdleStatus();
  }
}

// 監聽夜晚模式變化，同步到 theme store 並自動應用主題
watch(
  () => settingsStore.nightMode,
  (newValue) => {
    themeStore.setNightMode(newValue);
  },
);

// 已驗證後載入所有應用資料（可被 onMounted 和 watch 共用）
let appDataLoaded = false;
async function loadAppData() {
  // 防止重複載入
  if (appDataLoaded) return;
  appDataLoaded = true;

  // 執行數據遷移（在載入數據之前）
  try {
    const { getDataMigrationService } =
      await import("@/services/DataMigrationService");
    const migrationService = getDataMigrationService();
    await migrationService.runMigrations();
  } catch (error) {
    console.error("[App] 數據遷移失敗:", error);
  }

  themeStore.loadFromStorage();

  // 自動備份：檢查 IDB 是否有資料遺失，若有則從 localStorage 恢復
  try {
    const { checkAndRestore } = await import("@/services/autoBackup");
    const restored = await checkAndRestore();
    if (restored) {
      console.log("[App] 已從自動備份恢復 IDB 資料");
    }
  } catch (error) {
    console.error("[App] 自動備份恢復檢查失敗:", error);
  }

  // 載入角色、世界書、API 設定、使用者資料和表情包
  await Promise.all([
    charactersStore.loadCharacters(),
    lorebooksStore.loadLorebooks(),
    settingsStore.loadSettings(),
    userStore.loadUserData(),
    stickerStore.init(),
    notificationStore.init(),
  ]);

  // 自動備份：載入成功後備份關鍵資料到 localStorage
  import("@/services/autoBackup")
    .then(({ performBackup }) => {
      // 延遲 5 秒執行，避免影響啟動速度
      setTimeout(() => performBackup().catch(() => {}), 5000);
    })
    .catch(() => {});

  // characters 已載入，立即啟動主動發訊息服務
  proactiveMessageService.start();

  // 啟動封鎖系統輪詢與道歉外賣計時器恢復
  import("@/services/BlockService")
    .then(({ default: BlockService }) => {
      BlockService.getInstance().startBlockPolling();
    })
    .catch((err) => {
      console.error("[App] 封鎖系統輪詢啟動失敗:", err);
    });
  import("@/services/ApologyFoodService")
    .then(({ default: ApologyFoodService }) => {
      ApologyFoodService.getInstance().restoreTimers();
    })
    .catch((err) => {
      console.error("[App] 道歉外賣計時器恢復失敗:", err);
    });

  // 向量記憶：首次啟用時引導用戶設定嵌入引擎
  if (settingsStore.vectorMemoryEnabled) {
    const mode = settingsStore.embeddingMode ?? "api";
    if (mode === "api") {
      // 遠端模式：檢查是否已設定 API（endpoint 或 apiKey 至少有一個，或主 API 有設定）
      const hasEmbeddingConfig =
        settingsStore.embeddingAPI.endpoint ||
        settingsStore.embeddingAPI.apiKey;
      const hasMainApiConfig =
        settingsStore.api.endpoint && settingsStore.api.apiKey;
      if (!hasEmbeddingConfig && !hasMainApiConfig) {
        // 沒有任何 API 設定，提示用戶
        showEmbeddingModelPrompt.value = true;
      }
    } else if (mode === "local") {
      // 本地模式：檢查模型是否已快取
      import("@/utils/embeddingModelCheck")
        .then(async ({ isEmbeddingModelCached }) => {
          const cached = await isEmbeddingModelCached();
          if (!cached) {
            showEmbeddingModelPrompt.value = true;
          } else {
            // 模型已快取，背景預熱
            import("@/services/embeddingEngine")
              .then(({ embeddingEngine }) => {
                embeddingEngine.embed("預熱").catch(() => {});
              })
              .catch(() => {});
          }
        })
        .catch(() => {});
    }
  }

  // 載入全局遊戲經濟狀態（錢包、裝飾品等）
  const gameEconomyStore = useGameEconomyStore();
  await gameEconomyStore.loadState("global");

  // 初始化夜晚模式狀態
  themeStore.setNightMode(settingsStore.nightMode);

  // 初始化全局繁簡轉換（需在 settings 載入後）
  const { useGlobalLanguage } = await import("@/composables/useGlobalLanguage");
  const globalLanguage = useGlobalLanguage();
  globalLanguage.init();
  globalLanguageDestroy = globalLanguage.destroy;

  // 啟動待處理來電檢查（App 啟動時檢查過期來電）
  startPendingCallChecker();

  // 初始化節日系統
  const holidayStore = useHolidayStore();
  await holidayStore.init();
  holidayService.startMonitoring();

  // 如果今天是節日，顯示系統通知
  if (holidayStore.todayHoliday) {
    notificationStore.notifySystem(
      `🎉 ${holidayStore.todayHoliday.name}`,
      holidayStore.todayHoliday.greeting,
    );
  }

  // 監聽節日檢測事件（visibilitychange / 輪詢觸發）
  window.addEventListener("holiday:detected", handleHolidayDetected);

  // 監聽頁面可見性變化（切回 app 時檢測釣魚掛機）
  document.addEventListener("visibilitychange", handleVisibilityChange);

  // 頁面關閉前儲存通話快照
  window.addEventListener("beforeunload", () => {
    phoneCallStore.saveCallSnapshot();
  });

  // 偵測是否有未完成的通話快照
  const snapshot = phoneCallStore.loadCallSnapshot();
  if (snapshot) {
    resumeCallSnapshot.value = snapshot;
    showResumeCallDialog.value = true;
  }

  // 初始化雲端推送鬧鐘（拉取離線訊息）
  try {
    const { useCloudPushStore } = await import("@/stores/cloudPush");
    const cloudPushStore = useCloudPushStore();
    await cloudPushStore.loadSettings();
    if (cloudPushStore.enabled) {
      await cloudPushStore.pullOfflineMessages();
    }
  } catch (e) {
    console.error("[App] 雲端推送初始化失敗:", e);
  }
}

// 雲端推送心跳 interval（後台模式啟用時定期通知 Worker 本地仍存活）
let cloudPushHeartbeatTimer: ReturnType<typeof setInterval> | null = null;

function startCloudPushHeartbeat() {
  if (cloudPushHeartbeatTimer) return;
  // 立即發一次心跳
  void (async () => {
    const { useCloudPushStore } = await import("@/stores/cloudPush");
    await useCloudPushStore().sendAliveHeartbeat();
  })();
  // 每 5 分鐘發一次
  cloudPushHeartbeatTimer = setInterval(
    async () => {
      const { useCloudPushStore } = await import("@/stores/cloudPush");
      await useCloudPushStore().sendAliveHeartbeat();
    },
    5 * 60 * 1000,
  );
  console.log("[App] 雲端推送心跳已啟動");
}

function stopCloudPushHeartbeat() {
  if (cloudPushHeartbeatTimer) {
    clearInterval(cloudPushHeartbeatTimer);
    cloudPushHeartbeatTimer = null;
    console.log("[App] 雲端推送心跳已停止");
  }
}

// 監聽後台模式開關，同步啟停心跳
watch(
  () => settingsStore.backgroundAudioEnabled,
  (enabled) => {
    if (enabled) {
      startCloudPushHeartbeat();
    } else {
      stopCloudPushHeartbeat();
    }
  },
);
// 監聽驗證狀態：若驗證成功（例如在 AuthScreen 輸入碼後不 reload 的情況），自動載入資料
watch(
  () => authStore.isAuthenticated,
  (authenticated) => {
    if (authenticated) {
      void loadAppData();
      initializeBrowserHistory();
      void ensureSelfHostedSyncSocketConnected();
    } else {
      closeSelfHostedSyncSocket();
    }
  },
);

watch(
  () => [
    selfHostedSyncStore.enabled,
    selfHostedSyncStore.serverUrl,
    selfHostedSyncStore.accessToken,
  ],
  ([enabled, serverUrl, accessToken]) => {
    if (enabled && serverUrl && accessToken && authStore.isAuthenticated) {
      void ensureSelfHostedSyncSocketConnected();
    } else {
      closeSelfHostedSyncSocket();
    }
  },
);

// 應用啟動時載入數據
onMounted(async () => {
  // 初始化驗證狀態
  updateRuntimeSessionStage("App:onMounted start");
  await authStore.initialize();
  updateRuntimeSessionStage("App:auth initialized", {
    authenticated: authStore.isAuthenticated,
  });
  await selfHostedSyncStore.loadSettings();
  updateRuntimeSessionStage("App:selfHostedSync settings loaded", {
    enabled: selfHostedSyncStore.enabled,
    authenticated: selfHostedSyncStore.isAuthenticated,
  });
  notifyPendingRuntimeDiagnostics();

  if (typeof document !== "undefined") {
    document.addEventListener(
      "visibilitychange",
      handleSelfHostedSyncForegroundResume,
    );
  }
  if (typeof window !== "undefined") {
    window.addEventListener("focus", handleSelfHostedSyncForegroundResume);
  }

  // 已驗證則立即載入資料；未驗證則等 watch 觸發
  if (authStore.isAuthenticated) {
    await loadAppData();
    initializeBrowserHistory();
    void tryForegroundPullSelfHostedSync();
    void ensureSelfHostedSyncSocketConnected();
  }

  // 監聽 SW 更新事件
  window.addEventListener("sw:update-available", handleSwUpdate);
  window.addEventListener("popstate", handleBrowserPopState);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event: MessageEvent) => {
      const data = event.data as ServiceWorkerMessageData | undefined;
      if (data?.type !== "notification-click") return;

      const navigateTo = data.navigateTo || "";
      if (data.chatId || navigateTo.startsWith("/chat/")) {
        void handleNotificationNavigate("chat", {
          chatId: data.chatId,
          characterId: data.characterId || undefined,
        });
      }
    });
  }
});

onUnmounted(() => {
  if (typeof document !== "undefined") {
    document.removeEventListener(
      "visibilitychange",
      handleSelfHostedSyncForegroundResume,
    );
  }
  if (typeof window !== "undefined") {
    window.removeEventListener("focus", handleSelfHostedSyncForegroundResume);
  }
  closeSelfHostedSyncSocket();
  globalLanguageDestroy?.();
  // 停止待處理來電檢查
  stopPendingCallChecker();
  // 停止節日監控
  holidayService.stopMonitoring();
  window.removeEventListener("holiday:detected", handleHolidayDetected);
  // 移除頁面可見性監聽
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  // 移除 SW 更新監聽
  window.removeEventListener("sw:update-available", handleSwUpdate);
  window.removeEventListener("popstate", handleBrowserPopState);
  // 停止雲端推送心跳
  stopCloudPushHeartbeat();
});

// 動態 CSS 變數
const themeStyle = computed(() => ({
  "--bg-color": backgroundColor.value,
  "--text-color": textColor.value,
  "--grid-size": `${canvasStore.gridSize}px`, // 動態網格大小
}));

// 處理導航（支援 Dock 和 Widget 點擊）
function handleNavigate(page: string) {
  if (page === "character" || page === "worldbook" || page === "settings") {
    navigateToPage(page as PageType);
  } else if (page === "book") {
    // 世界書的 id 是 'book'
    navigateToPage("worldbook");
  } else if (page === "message" || page === "chat") {
    // 訊息進入聊天列表
    navigateToPage("chat-list");
  } else if (page === "music") {
    // 音樂 App
    navigateToPage("music");
  } else if (page === "qzone" || page === "plurk" || page === "space") {
    // 噗浪空間（space 是 Dock 中的 id）
    navigateToPage("qzone");
  } else if (page === "user" || page === "使用者") {
    // 使用者設定
    navigateToPage("user");
  } else if (page === "weather" || page === "天氣") {
    // 天氣設定
    navigateToPage("weather");
  } else if (page === "shop" || page === "購物" || page === "商城") {
    // 商城
    navigateToPage("shop");
  } else if (page === "game-center" || page === "遊戲" || page === "game") {
    // 遊戲中心
    navigateToPage("game-center");
  } else if (page === "delivery" || page === "外賣" || page === "外送") {
    // 外賣商城
    navigateToPage("delivery-mall");
  } else if (page === "theater" || page === "小劇場") {
    // 小劇場（記錄來源頁面）
    navigationHistory.value.push(currentPage.value);
    navigateToPage("theater");
  } else if (page === "media-log") {
    // 書影記錄
    showMediaLogManager.value = true;
  } else if (page === "food-log") {
    // 食記
    showFoodLogManager.value = true;
  } else if (page === "reading") {
    // 閱讀（書影記錄）
    showMediaLogManager.value = true;
  } else if (page === "閱讀" || page === "bookshelf") {
    // 書架
    navigateToPage("bookshelf");
  } else if (page === "calendar" || page === "行事曆") {
    // 行事曆
    navigateToPage("calendar");
  } else if (page === "fitness" || page === "健身" || page === "workout") {
    // 健身 App
    navigateToPage("fitness");
  } else if (page === "phone") {
    // 電話：打開聯絡人選擇
    showPhoneContactPicker.value = true;
  } else if (
    page === "peek-phone" ||
    page === "偷窺" ||
    page === "peek" ||
    page === "頭盔TA"
  ) {
    // 頭盔TA手機
    navigateToPage("peek-phone-select");
  } else if (page === "fate" || page === "占卜" || page === "tarot") {
    // 塔羅占卜
    navigateToPage("fate");
  } else if (page === "pomodoro" || page === "專注" || page === "番茄鐘") {
    // 番茄鐘
    navigateToPage("pomodoro");
  }
}

// 返回主頁
function goHome() {
  resetToPage("home");
  selectedCharacterId.value = null;
  selectedLorebookId.value = null;
  isCreatingNew.value = false;
}

// ===== 番茄鐘 =====
const showPomodoroCert = ref(false);

function handlePomodoroStartFocus(taskId: string) {
  import("@/stores/pomodoro").then(({ usePomodoroStore }) => {
    const pomodoroStore = usePomodoroStore();
    const task = pomodoroStore.tasks.find((t) => t.id === taskId);
    if (task) {
      pomodoroStore.startSession(task);
      navigateToPage("pomodoro-focus");
    }
  });
}

function handlePomodoroCertClose() {
  showPomodoroCert.value = false;
  navigateToPage("pomodoro", { mode: "replace" });
}

function handlePomodoroCertForward(summary: string) {
  showPomodoroCert.value = false;
  // TODO: 轉發到聊天（需要選擇角色）
  console.log("[Pomodoro] 轉發到聊天:", summary);
  navigateToPage("pomodoro", { mode: "replace" });
}

// 返回角色列表
function goToCharacterList() {
  resetToPage("character");
  selectedCharacterId.value = null;
  isCreatingNew.value = false;
}

// 返回世界書列表
function goToLorebookList() {
  resetToPage("worldbook");
  selectedLorebookId.value = null;
  isCreatingNew.value = false;
}

// 打開角色編輯頁
function openCharacterEdit(id: string) {
  navigationHistory.value.push(currentPage.value);
  selectedCharacterId.value = id;
  isCreatingNew.value = false;
  navigateToPage("character-edit");
}

// 創建新角色
function createNewCharacter() {
  navigationHistory.value.push(currentPage.value);
  selectedCharacterId.value = null;
  isCreatingNew.value = true;
  navigateToPage("character-edit");
}

// 從角色編輯頁返回
function goBackFromCharacterEdit() {
  if (navigationHistory.value.length > 0) {
    navigateBackWithFallback(goToCharacterList);
  } else {
    goToCharacterList();
  }
}

// 打開世界書編輯頁
function openLorebookEdit(id: string) {
  navigationHistory.value.push(currentPage.value);
  selectedLorebookId.value = id;
  isCreatingNew.value = false;
  navigateToPage("worldbook-edit");
}

// 創建新世界書
function createNewLorebook() {
  navigationHistory.value.push(currentPage.value);
  selectedLorebookId.value = null;
  isCreatingNew.value = true;
  navigateToPage("worldbook-edit");
}

// 從世界書編輯頁返回
function goBackFromLorebookEdit() {
  if (navigationHistory.value.length > 0) {
    navigateBackWithFallback(goToLorebookList);
  } else {
    goToLorebookList();
  }
}

// 返回聊天列表
function goToChatList() {
  resetToPage("chat-list");
  currentChatId.value = null;
  currentChatCharacterId.value = null;
}

// 開始聊天（從角色列表）
async function startChat(characterId: string) {
  const character = charactersStore.characters.find(
    (c) => c.id === characterId,
  );
  if (!character) return;

  // 查找該角色的所有聊天記錄
  let existingChats: Chat[] = [];
  try {
    existingChats = await loadChatsByCharacter(characterId, {
      isGroupChat: false,
    });
  } catch (e) {
    console.warn("[App] 查找現有聊天失敗:", e);
  }

  // 如果只有一個聊天且沒有備選開場白，直接進入
  const hasAlternateGreetings =
    (character.data?.alternate_greetings?.length ?? 0) > 0;
  if (existingChats.length === 1 && !hasAlternateGreetings) {
    const preferredChat = await resolvePreferredDirectChat(characterId);
    chatCharacterName.value =
      character.nickname || character.data?.name || "角色";
    chatCharacterAvatar.value = character.avatar || "";
    currentChatCharacterId.value = characterId;
    currentChatId.value = preferredChat?.id || existingChats[0].id;
    navigateToPage("chat");
    return;
  }

  // 如果沒有聊天且沒有備選開場白，直接建立新聊天
  if (existingChats.length === 0 && !hasAlternateGreetings) {
    chatCharacterName.value =
      character.nickname || character.data?.name || "角色";
    chatCharacterAvatar.value = character.avatar || "";
    currentChatCharacterId.value = characterId;
    currentChatId.value = null;
    navigateToPage("chat");
    return;
  }

  // 否則顯示選擇彈窗
  chatPickerCharacterId.value = characterId;
  chatPickerChats.value = existingChats;
  chatPickerGreetingIndex.value = 0;
  showChatPickerModal.value = true;
}

/** 角色庫選擇彈窗：打開現有聊天 */
function chatPickerOpenExisting(chatId: string) {
  showChatPickerModal.value = false;
  const character = charactersStore.characters.find(
    (c) => c.id === chatPickerCharacterId.value,
  );
  if (!character) return;
  chatCharacterName.value =
    character.nickname || character.data?.name || "角色";
  chatCharacterAvatar.value = character.avatar || "";
  currentChatCharacterId.value = chatPickerCharacterId.value;
  currentChatId.value = chatId;
  navigateToPage("chat");
}

/** 角色庫選擇彈窗：建立新聊天（帶開場白選擇） */
async function chatPickerCreateNew(withGreeting: boolean) {
  showChatPickerModal.value = false;
  const characterId = chatPickerCharacterId.value;
  const character = charactersStore.characters.find(
    (c) => c.id === characterId,
  );
  if (!character) return;

  const charName = character.nickname || character.data?.name || "角色";
  chatCharacterName.value = charName;
  chatCharacterAvatar.value = character.avatar || "";
  currentChatCharacterId.value = characterId;

  const newMessages: Chat["messages"] = [];
  if (withGreeting && chatPickerGreetings.value.length > 0) {
    const greeting =
      chatPickerGreetings.value[chatPickerGreetingIndex.value] ??
      chatPickerGreetings.value[0];
    if (greeting) {
      newMessages.push({
        id: crypto.randomUUID(),
        sender: "assistant",
        name: character.data?.name || charName,
        content: greeting.content,
        is_user: false,
        status: "sent",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }

  const newChat: Chat = {
    id: `chat_${Date.now()}`,
    name: `與 ${charName} 的對話`,
    characterId,
    messages: [],
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messageCount: newMessages.length,
    lastMessagePreview:
      newMessages[newMessages.length - 1]?.content?.slice(0, 100) || "",
  };
  await createChatRecord(newChat, newMessages);

  currentChatId.value = newChat.id;
  navigateToPage("chat");
}

// 開始多人卡模式聊天（從角色列表長按或選單觸發）
function startMultiCharSetup(characterId: string) {
  multiCharSetupCharacterId.value = characterId;
  showMultiCharSetup.value = true;
}

// 多人卡模式確認：建立多人卡聊天
async function handleMultiCharConfirm(
  members: MultiCharMember[],
  options: { useGreeting: boolean },
) {
  showMultiCharSetup.value = false;
  const characterId = multiCharSetupCharacterId.value;
  const character = charactersStore.characters.find(
    (c) => c.id === characterId,
  );
  if (!character) return;

  const charName = character.nickname || character.data?.name || "角色";

  // 如果選擇使用開場白，把 first_mes 作為第一條消息
  const chatMessages: Chat["messages"] = [];
  if (options.useGreeting && character.data?.first_mes) {
    chatMessages.push({
      id: crypto.randomUUID(),
      sender: "assistant",
      name: charName,
      content: character.data.first_mes,
      is_user: false,
      status: "sent",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  // 建立多人卡聊天
  const chat: Chat = {
    id: crypto.randomUUID(),
    name: charName,
    characterId: character.id,
    messages: [],
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messageCount: chatMessages.length,
    lastMessagePreview:
      chatMessages[chatMessages.length - 1]?.content?.slice(0, 100) || "",
    isGroupChat: true,
    groupMetadata: {
      groupName: charName,
      members: [],
      isMultiCharCard: true,
      multiCharMembers: JSON.parse(JSON.stringify(members)),
    },
  };

  // 存入 IndexedDB
  await createChatRecord(chat, chatMessages);

  // 打開聊天
  chatCharacterName.value = charName;
  chatCharacterAvatar.value = character.avatar || "";
  currentChatCharacterId.value = characterId;
  currentChatId.value = chat.id;
  navigateToPage("chat");
}

// 從電話聯絡人選擇器撥打電話
async function startPhoneCall(characterId: string) {
  showPhoneContactPicker.value = false;
  const character = charactersStore.characters.find(
    (c) => c.id === characterId,
  );
  if (character) {
    chatCharacterName.value =
      character.nickname || character.data?.name || "角色";
    chatCharacterAvatar.value = character.avatar || "";
    currentChatCharacterId.value = characterId;

    // 查找該角色最近的聊天記錄
    try {
      const preferredChat = await resolvePreferredDirectChat(characterId);
      currentChatId.value = preferredChat?.id || null;
    } catch (e) {
      console.warn("[App] 查找現有聊天失敗:", e);
      currentChatId.value = null;
    }

    startPhoneCallFlag.value = true;
    navigateToPage("chat");
  }
}

// ===== 通話恢復處理 =====
function formatSnapshotDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

async function handleResumeCall() {
  showResumeCallDialog.value = false;
  await phoneCallStore.resumeFromSnapshot();
}

async function handleDiscardCall() {
  showResumeCallDialog.value = false;
  await phoneCallStore.discardSnapshot();
  resumeCallSnapshot.value = null;
}

// ===== 向量記憶引導處理 =====
async function handleDownloadEmbeddingModel() {
  embeddingModelDownloading.value = true;
  embeddingModelProgress.value = 0;
  embeddingModelFile.value = "";
  try {
    // 切換到本地模式
    settingsStore.embeddingMode = "local";
    await settingsStore.saveSettings();

    const { embeddingEngine } = await import("@/services/embeddingEngine");
    embeddingEngine.setProgressCallback((info) => {
      if (info.progress != null)
        embeddingModelProgress.value = info.progress / 100;
      if (info.file) embeddingModelFile.value = info.file;
      if (info.status === "warmup") {
        embeddingModelFile.value = "WASM 編譯中...";
        embeddingModelProgress.value = 1;
      }
    });
    await embeddingEngine.embed("初始化測試");
    embeddingEngine.setProgressCallback(null);
    showEmbeddingModelPrompt.value = false;
  } catch (e) {
    console.error("[App] 嵌入模型下載失敗:", e);
    embeddingModelFile.value = "下載失敗，請稍後在設定中重試";
  } finally {
    embeddingModelDownloading.value = false;
  }
}

/** 前往設定頁面配置遠端 API */
function handleGoToEmbeddingSettings() {
  showEmbeddingModelPrompt.value = false;
  navigateToPage("settings");
}

/** 關閉向量記憶 */
function handleDisableVectorMemory() {
  showEmbeddingModelPrompt.value = false;
  settingsStore.vectorMemoryEnabled = false;
  settingsStore.saveSettings();
}

// 打開現有聊天
function openExistingChat(chatId: string, characterId: string) {
  const character = charactersStore.characters.find(
    (c) => c.id === characterId,
  );
  if (character) {
    // 暱稱優先顯示
    chatCharacterName.value =
      character.nickname || character.data?.name || "角色";
    chatCharacterAvatar.value = character.avatar || "";
  }
  currentChatId.value = chatId;
  currentChatCharacterId.value = characterId;
  navigateToPage("chat");
}

// ChatScreen 內部切換聊天檔案時同步 chatId（不重建組件）
async function onChatSwitched(chatId: string) {
  currentChatId.value = chatId;

  const characterId = currentChatCharacterId.value;
  if (characterId) {
    try {
      await setLastActiveChatId(characterId, chatId);
    } catch (e) {
      console.warn("[App] 保存最後活躍聊天失敗:", e);
    }
  }
}

const onOpenExistingChatEvent = (...args: any[]) =>
  openExistingChat(args[0] as string, args[1] as string);
const onChatSwitchedEvent = (...args: any[]) =>
  void onChatSwitched(args[0] as string);
const onChatNavigateEvent = (...args: any[]) =>
  handleChatNavigate(
    args[0] as
      | "character"
      | "worldbook"
      | "settings"
      | "shop"
      | "media-log"
      | "food-log"
      | "peek-phone",
  );
const onEditCharacterEvent = (...args: any[]) =>
  openCharacterEdit(args[0] as string);
const onEditLorebookEvent = (...args: any[]) =>
  openLorebookEdit(args[0] as string);

// 開始新聯天（從聯繫人列表）
async function startNewChat(characterId: string) {
  // 複用角色庫的聊天選擇邏輯
  await startChat(characterId);
}

async function resolveLatestDirectChatId(
  characterId: string,
): Promise<string | null> {
  try {
    const preferredChat = await resolvePreferredDirectChat(characterId);
    return preferredChat?.id ?? null;
  } catch (e) {
    console.warn("[App] 查找現有聊天失敗:", e);
    return null;
  }
}

async function resolvePreferredChatId(
  characterId: string,
): Promise<string | null> {
  // 若目前就有該角色的聊天上下文，優先回到「當前對話」而不是最新對話
  if (
    currentChatId.value &&
    currentChatCharacterId.value &&
    currentChatCharacterId.value === characterId
  ) {
    return currentChatId.value;
  }

  // 否則退回到該角色最近一個私聊
  return resolveLatestDirectChatId(characterId);
}

// 遊戲分享成績到聊天
async function handleGameShareToChat(characterId: string, message: string) {
  const character = charactersStore.characters.find(
    (c) => c.id === characterId,
  );
  if (character) {
    chatCharacterName.value =
      character.nickname || character.data?.name || "角色";
    chatCharacterAvatar.value = character.avatar || "";
    currentChatCharacterId.value = characterId;
    currentChatId.value = await resolvePreferredChatId(characterId);
    pendingChatMessage.value = message;
    navigateToPage("chat");
  }
}

// 音樂 App 分享歌曲到聊天（用戶已選擇聊天）
async function handleMusicShareToChat(payload: {
  chatId: string;
  characterId: string;
}) {
  const musicStore = useMusicStore();
  const track = musicStore.currentTrack;
  if (!track) return;

  const character = charactersStore.characters.find(
    (c) => c.id === payload.characterId,
  );
  if (!character) return;

  const lyrics = await musicStore.ensureLyrics();

  chatCharacterName.value =
    character.nickname || character.data?.name || "角色";
  chatCharacterAvatar.value = character.avatar || "";
  currentChatCharacterId.value = payload.characterId;
  currentChatId.value = payload.chatId;
  pendingChatMessage.value = {
    content: `<分享歌曲>${track.name} - ${track.artist}</分享歌曲>${lyrics ? `\n[歌詞]\n${lyrics}` : ""}`,
    isMusicShare: true,
    musicShareData: {
      name: track.name,
      artist: track.artist,
      album: track.album || "",
      cover: track.cover || "",
      lyrics,
    },
  };
  navigateToPage("chat");
}

// 外賣商城分享/下單注入聊天
async function handleDeliveryMallSendToChat(payload: {
  characterId: string;
  message: PendingInjectedMessage;
}) {
  const character = charactersStore.characters.find(
    (c) => c.id === payload.characterId,
  );
  if (character) {
    chatCharacterName.value =
      character.nickname || character.data?.name || "角色";
    chatCharacterAvatar.value = character.avatar || "";
    currentChatCharacterId.value = payload.characterId;
    currentChatId.value = await resolvePreferredChatId(payload.characterId);
    pendingChatMessage.value = payload.message;
    navigateToPage("chat");
  }
}

// 處理角色儲存
async function handleCharacterSave(character: any) {
  console.log("儲存角色:", character);

  // 取得現有角色的 extensions，避免覆蓋 regex_scripts、depth_prompt 等已存在的資料
  const existingChar = charactersStore.getCharacterById(character.id);
  const existingExt = existingChar?.data?.extensions;

  // 構建 StoredCharacter 格式
  const characterData = {
    id: character.id,
    nickname: character.nickname || "",
    avatar: character.avatar || "",
    data: {
      name: character.data.name || "",
      description: character.data.description || "",
      character_version: existingChar?.data?.character_version || "1.0",
      personality: character.data.personality || "",
      scenario: character.data.scenario || "",
      first_mes: character.data.first_mes || "",
      mes_example: character.data.mes_example || "",
      creator_notes: character.data.creator_notes || "",
      tags: character.data.tags || [],
      system_prompt: character.data.system_prompt || "",
      post_history_instructions: character.data.post_history_instructions || "",
      creator: character.data.creator || "",
      alternate_greetings: existingChar?.data?.alternate_greetings || [],
      extensions: {
        ...existingExt,
        talkativeness: existingExt?.talkativeness ?? 0.5,
        fav: existingExt?.fav ?? false,
        world: existingExt?.world ?? "",
        depth_prompt: existingExt?.depth_prompt ?? {
          depth: 4,
          prompt: "",
          role: "system" as const,
        },
        regex_scripts: existingExt?.regex_scripts ?? [],
        character_atmosphere: character.data.character_atmosphere || "",
        naiCharacterPrompt: character.data.nai_character_prompt || "",
      },
    },
    lorebookIds: character.lorebookIds || [],
    source: character.source || "manual",
    createdAt: character.createdAt || Date.now(),
    updatedAt: Date.now(),
    // 世界設定（保留有值的欄位）
    worldSettings: character.worldSettings ?? existingChar?.worldSettings,
  };

  try {
    if (isCreatingNew.value) {
      // 創建新角色：存完後留在頁面，切換成「編輯現有」模式
      await charactersStore.createCharacter(characterData);
      selectedCharacterId.value = character.id;
      isCreatingNew.value = false;
    } else {
      // 更新現有角色
      await charactersStore.updateCharacter(character.id, characterData);
    }
    console.log("角色儲存成功");
  } catch (e) {
    console.error("角色儲存失敗:", e);
  }
}

// 處理角色刪除
async function handleCharacterDelete(id: string) {
  console.log("刪除角色:", id);
  await charactersStore.deleteCharacter(id);
  goToCharacterList();
}

// 處理世界書儲存
async function handleLorebookSave(lorebook: any) {
  console.log("儲存世界書:", lorebook);

  // 將 UI 格式的條目轉換為 WorldInfoEntry 格式
  const convertedEntries = (lorebook.entries || []).map(
    (entry: any, index: number) => ({
      uid: parseInt(entry.id?.replace("entry_", "")) || index,
      key: entry.keys || [],
      keysecondary: entry.secondary_keys || [],
      comment: entry.comment || entry.name || "",
      content: entry.content || "",
      constant: entry.constant || false,
      disable: !entry.enabled,
      selective: true,
      selectiveLogic: 0,
      order: entry.insertion_order ?? index,
      position: typeof entry.position === "number" ? entry.position : 1, // 確保是數字
      depth: entry.depth ?? 4,
      role: null,
      ignoreBudget: false,
      excludeRecursion: false,
      preventRecursion: false,
      delayUntilRecursion: 0,
      probability: entry.probability ?? 100,
      useProbability: true,
      sticky: null,
      cooldown: null,
      delay: null,
      scanDepth: null,
      caseSensitive: entry.case_sensitive ?? null,
      matchWholeWords: null,
      useGroupScoring: null,
      matchPersonaDescription: false,
      matchCharacterDescription: false,
      matchCharacterPersonality: false,
      matchCharacterDepthPrompt: false,
      matchScenario: false,
      matchCreatorNotes: false,
      group: "",
      groupOverride: false,
      groupWeight: 100,
      outletName: "",
      automationId: "",
      vectorized: false,
      triggers: [],
      addMemo: false,
    }),
  );

  const lorebookData = {
    id: lorebook.id,
    name: lorebook.name,
    description: lorebook.description || "",
    entries: convertedEntries,
    recursiveScanning: lorebook.recursive_scanning ?? false,
    maxRecursionSteps: lorebook.max_recursion_steps ?? 10,
  };

  if (isCreatingNew.value) {
    await lorebooksStore.createLorebook(lorebookData);
    // 新建後切換為編輯模式，留在當前頁面
    selectedLorebookId.value = lorebook.id;
    isCreatingNew.value = false;
  } else {
    await lorebooksStore.updateLorebook(lorebook.id, lorebookData);
  }
  // 保存後不跳轉，留在編輯頁面
}

// 處理世界書刪除
async function handleLorebookDelete(id: string) {
  console.log("刪除世界書:", id);
  await lorebooksStore.deleteLorebook(id);
  goToLorebookList();
}

// 打開主題設定
function openThemeSettings() {
  // 如果在聊天頁面，傳遞聊天專屬外觀
  // 即使該聊天還沒有專屬外觀，也傳遞一個空對象來表示「聊天模式」
  if (currentPage.value === "chat") {
    currentChatAppearance.value = chatStore.getAppearance() ?? {
      useCustom: false,
    };
  } else {
    currentChatAppearance.value = undefined;
  }
  showThemeSettings.value = true;
}

// 保存聊天專屬外觀
function handleSaveChatAppearance(appearance: ChatAppearance) {
  console.log("[App] handleSaveChatAppearance called:", appearance);
  if (currentPage.value === "chat") {
    console.log("[App] Setting pendingChatAppearance...");
    pendingChatAppearance.value = appearance;
  }
}

// 打開提示詞管理
function openPromptManager() {
  navigateToPage("prompt-manager");
}

// 打開正則腳本管理
function openRegexScripts() {
  navigateToPage("regex-scripts");
}

// 返回設定頁
function goToSettings() {
  navigateToPage("settings", { mode: "replace" });
}

function goBackToSettingsSubpage() {
  if (navigationHistory.value.length > 0) {
    navigateBackWithFallback(goToSettings);
  } else {
    goToSettings();
  }
}

// 打開角色導入
function openCharacterImport() {
  importType.value = "character";
  showImportModal.value = true;
}

// 打開 AI 角色生成彈窗
function openAICharacterModal() {
  showAICharacterModal.value = true;
}

// 處理 AI 生成的角色
async function handleAICharacterCreated(character: any) {
  try {
    await charactersStore.createCharacter(character);
    console.log("AI 角色創建成功:", character.data.name);
  } catch (e) {
    console.error("AI 角色創建失敗:", e);
  }
}

// 打開世界書導入
function openLorebookImport() {
  importType.value = "lorebook";
  showImportModal.value = true;
}

// 處理角色導入完成
function handleCharacterImported(result: CharacterImportResult) {
  if (result.success && result.character) {
    console.log(
      "角色導入成功:",
      result.character.nickname || result.character.data.name,
    );
    // 重新載入角色列表
    charactersStore.loadCharacters();
    // 如果有內嵌世界書，刷新世界書列表
    if (result.lorebook) {
      lorebooksStore.loadLorebooks();
    }
  }
}

// 處理世界書導入完成
async function handleLorebookImported(data: any) {
  console.log("世界書導入:", data);

  // SillyTavern 格式的 entries 是物件 { "0": {...}, "1": {...} }，需轉為陣列
  let entries: any[] = [];
  if (data.entries) {
    if (Array.isArray(data.entries)) {
      entries = data.entries;
    } else if (typeof data.entries === "object") {
      entries = Object.values(data.entries);
    }
  }

  const lorebook = await lorebooksStore.createLorebook({
    name: data.name || data.originalData?.name || "導入的世界書",
    description: data.description || data.originalData?.description,
    entries,
    scanDepth: data.scan_depth ?? data.originalData?.scan_depth,
    tokenBudget: data.token_budget ?? data.originalData?.token_budget,
    recursiveScanning:
      data.recursive_scanning ?? data.originalData?.recursive_scanning,
  });
  if (lorebook) {
    console.log("世界書導入成功:", lorebook.name);
  }
}

// 關閉導入彈窗
function closeImportModal() {
  showImportModal.value = false;
}

  // 處理聊天頁面的快捷導航
function handleChatNavigate(
  page: "character" | "worldbook" | "settings" | "shop" | "media-log" | "food-log" | "peek-phone",
) {
  // 書影記錄使用彈窗，不需要頁面導航
  if (page === "media-log") {
    showMediaLogManager.value = true;
    return;
  }
  // 食記
  if (page === "food-log") {
    showFoodLogManager.value = true;
    return;
  }
  // 頭盔TA手機導航到角色選擇頁
  if (page === "peek-phone") {
    navigationHistory.value.push(currentPage.value);
    navigateToPage("peek-phone-select");
    return;
  }
  // 記錄當前頁面到歷史堆疊
  navigationHistory.value.push(currentPage.value);
  navigateToPage(page);
}

// 從快捷導航返回（優先返回歷史頁面）
function goBackFromQuickNav() {
  if (navigationHistory.value.length > 0) {
    navigateBackWithFallback(goHome);
  } else {
    goHome();
  }
}

// 從小劇場返回（優先返回噗浪）
function goBackFromTheater() {
  if (navigationHistory.value.length > 0) {
    navigateBackWithFallback(() => navigateToPage("qzone", { mode: "replace", historyStack: [] }));
  } else {
    navigateToPage("qzone", { mode: "replace", historyStack: [] });
  }
}

// 從噗浪導航到小劇場（記錄歷史，可帶指定 postId 直接打開內文）
const pendingTheaterPostId = ref<string | undefined>(undefined);

function navigateToTheaterFromQzone(theaterPostId?: string) {
  navigationHistory.value.push("qzone");
  pendingTheaterPostId.value = theaterPostId;
  navigateToPage("theater");
}

async function restoreChatContextFromNotification(data?: Record<string, any>) {
  if (!data?.chatId) return false;

  let resolvedChat: Chat | undefined;
  try {
    resolvedChat = await loadChatById(data.chatId);
  } catch (error) {
    console.warn("[App] 通知點擊後讀取聊天失敗:", error);
  }

  const resolvedCharacterId =
    resolvedChat?.characterId || data.characterId || null;
  if (!resolvedCharacterId) {
    console.warn("[App] 通知點擊缺少 characterId，且無法從 chatId 反查");
    return false;
  }

  const character = charactersStore.characters.find(
    (c) => c.id === resolvedCharacterId,
  );
  if (!character) {
    console.warn("[App] 通知點擊對應角色不存在:", resolvedCharacterId);
    return false;
  }

  chatCharacterName.value =
    character.nickname || character.data?.name || "角色";
  chatCharacterAvatar.value = character.avatar || "";
  currentChatCharacterId.value = resolvedCharacterId;
  currentChatId.value = resolvedChat?.id || data.chatId;
  navigateToPage("chat");
  return true;
}

// 處理通知點擊導航
async function handleNotificationNavigate(page: string, data?: Record<string, any>) {
  if (page === "chat" && data?.chatId) {
    const restored = await restoreChatContextFromNotification(data);
    if (!restored) {
      console.warn("[App] 無法恢復通知對應聊天，已忽略此次跳轉", data);
    }
  } else if (page === "open_fishing") {
    // 打開釣魚遊戲（通過遊戲中心）
    navigateToPage("game-center");
    // 可以在這裡添加額外邏輯，例如自動打開釣魚遊戲彈窗
    console.log("[App] 導航到釣魚遊戲:", data);
  } else {
    // 一般頁面導航
    handleNavigate(page);
  }
}

// ===== 全域右滑返回 =====
const swipeBackEnabled = computed(() => currentPage.value !== "home");

function handleGlobalSwipeBack() {
  if (showFoodLogManager.value) {
    showFoodLogManager.value = false;
    return;
  }

  if (showMediaLogManager.value) {
    showMediaLogManager.value = false;
    return;
  }

  if (currentPage.value === "home") return;
  // 驗證頁面不處理
  if (!authStore.isAuthenticated) return;

  // 根據當前頁面對應返回邏輯（與 template 中 @back 一致）
  const backMap: Record<string, () => void> = {
    character: goBackFromQuickNav,
    "character-edit": goToCharacterList,
    worldbook: goBackFromQuickNav,
    "worldbook-edit": goToLorebookList,
    "chat-list": goHome,
    chat: goToChatList,
    settings: goBackFromQuickNav,
    "prompt-manager": goBackToSettingsSubpage,
    "regex-scripts": goBackToSettingsSubpage,
    bookshelf: () => {
      if (currentBook.value) {
        currentBook.value = null;
      } else {
        goHome();
      }
    },
    music: goHome,
    qzone: goHome,
    user: goHome,
    weather: goHome,
    shop: goBackFromQuickNav,
    "game-center": goHome,
    "delivery-mall": goHome,
    calendar: goHome,
    fitness: goHome,
    fate: goHome,
    "peek-phone-select": goHome,
    "peek-phone": () => {
      navigateToPage("peek-phone-select", { mode: "replace" });
      peekPhoneCharacterId.value = null;
      peekPhoneChatId.value = null;
    },
    theater: goBackFromTheater,
  };

  const handler = backMap[currentPage.value];
  if (handler) handler();
}

useSwipeBack(handleGlobalSwipeBack, swipeBackEnabled);
</script>

<template>
  <div class="app-container" :class="{ 'is-dark': isDark }" :style="themeStyle">
    <Transition name="page">
      <!-- 驗證頁面 -->
      <AuthScreen v-if="!authStore.isAuthenticated" />

      <!-- 主頁：橫向白板畫布 -->
      <div v-else-if="currentPage === 'home'" class="home-screen-wrapper screen-container">
        <WhiteboardCanvas @navigate="handleNavigate" />
        <NeonWheelDock
          @navigate="handleNavigate"
          @open-global-theme="showGlobalTheme = true"
        />
      </div>

      <!-- 角色列表頁 -->
    <CharacterListScreen
      v-else-if="currentPage === 'character'"
      @back="goBackFromQuickNav"
      @select="openCharacterEdit"
      @chat="startChat"
      @multi-char="startMultiCharSetup"
      @create="createNewCharacter"
      @import="openCharacterImport"
      @ai-create="openAICharacterModal"
    />

    <!-- 角色編輯頁 -->
    <CharacterEditScreen
      v-else-if="currentPage === 'character-edit'"
      :character-id="selectedCharacterId || undefined"
      :is-new="isCreatingNew"
      @back="goBackFromCharacterEdit"
      @save="handleCharacterSave"
      @delete="handleCharacterDelete"
      @open-lorebook="openLorebookEdit"
    />

    <!-- 世界書列表頁 -->
    <!-- 世界書列表頁 -->
    <LorebookListScreen
      v-else-if="currentPage === 'worldbook'"
      @back="goBackFromQuickNav"
      @select="openLorebookEdit"
      @create="createNewLorebook"
      @import="openLorebookImport"
    />

    <!-- 世界書編輯頁 -->
    <LorebookEditScreen
      v-else-if="currentPage === 'worldbook-edit'"
      :lorebook-id="selectedLorebookId || undefined"
      :is-new="isCreatingNew"
      @back="goBackFromLorebookEdit"
      @save="handleLorebookSave"
      @delete="handleLorebookDelete"
    />

    <!-- 聊天列表頁 -->
    <ChatListScreen
      v-else-if="currentPage === 'chat-list'"
      @back="goHome"
      @openChat="openExistingChat"
      @newChat="startNewChat"
    />

    <!-- 聊天頁 -->
    <ChatScreen
      v-else-if="currentPage === 'chat'"
      :key="`${currentChatCharacterId || ''}:${currentChatId || ''}`"
      @back="goToChatList"
      @settings="openThemeSettings"
      @navigate="onChatNavigateEvent"
      @edit-character="onEditCharacterEvent"
      @edit-lorebook="onEditLorebookEvent"
      :character-id="currentChatCharacterId || undefined"
      :character-name="chatCharacterName"
      :character-avatar="chatCharacterAvatar"
      :chat-id="currentChatId || undefined"
      :pending-appearance="pendingChatAppearance"
      :pending-message="pendingChatMessage"
      :start-phone-call="startPhoneCallFlag"
      :incoming-call-reason="pendingIncomingCallReason"
      @appearance-applied="pendingChatAppearance = undefined"
      @pending-message-consumed="pendingChatMessage = ''"
      @phone-call-started="startPhoneCallFlag = false"
      @incoming-call-consumed="pendingIncomingCallReason = ''"
      @open-chat="onOpenExistingChatEvent"
      @chat-switched="onChatSwitchedEvent"
    />

    <!-- 設定頁 -->
    <SettingsScreen
      v-else-if="currentPage === 'settings'"
      @back="goBackFromQuickNav"
      @open-prompt-manager="openPromptManager"
      @open-regex-scripts="openRegexScripts"
    />

    <!-- 提示詞管理頁 -->
    <PromptManagerScreen
      v-else-if="currentPage === 'prompt-manager'"
      @back="goBackToSettingsSubpage"
    />

    <!-- 正則腳本管理頁 -->
    <RegexScriptsScreen
      v-else-if="currentPage === 'regex-scripts'"
      @back="goBackToSettingsSubpage"
    />

    <!-- 書架 -->
    <BookShelfScreen
      v-else-if="currentPage === 'bookshelf' && !currentBook"
      @back="goHome"
      @open-book="
        (book) => {
          currentBook = book;
        }
      "
    />

    <!-- 閱讀器 -->
    <BookReaderScreen
      v-else-if="currentPage === 'bookshelf' && currentBook"
      :book="currentBook"
      @back="currentBook = null"
    />

    <!-- 音樂 App -->
    <MusicAppScreen v-else-if="currentPage === 'music'" @back="goHome" @share-to-chat="handleMusicShareToChat" />

    <!-- 噗浪空間 -->
    <QZoneScreen
      v-else-if="currentPage === 'qzone'"
      @back="goHome"
      @navigate-theater="navigateToTheaterFromQzone"
    />

    <!-- 使用者設定 -->
    <UserProfileScreen v-else-if="currentPage === 'user'" @back="goHome" />

    <!-- 天氣設定 -->
    <WeatherScreen v-else-if="currentPage === 'weather'" @back="goHome" />

    <!-- 商城 -->
    <ShopScreen v-else-if="currentPage === 'shop'" @back="goBackFromQuickNav" />

    <!-- 遊戲中心 -->
    <GameCenterScreen
      v-else-if="currentPage === 'game-center'"
      @back="goHome"
      @share-to-chat="handleGameShareToChat"
    />

    <!-- 外賣商城 -->
    <DeliveryMallScreen
      v-else-if="currentPage === 'delivery-mall'"
      @back="goHome"
      @send-to-chat="handleDeliveryMallSendToChat"
    />

    <!-- 行事曆 -->
    <CalendarScreen v-else-if="currentPage === 'calendar'" @back="goHome" />

    <!-- 健身 App -->
    <FitnessScreen v-else-if="currentPage === 'fitness'" @back="goHome" />

    <!-- 塔羅占卜 -->
    <FateScreen v-else-if="currentPage === 'fate'" @back="goHome" />

    <!-- 番茄鐘 - 任務列表 -->
    <PomodoroScreen
      v-else-if="currentPage === 'pomodoro'"
      @back="goHome"
      @start-focus="handlePomodoroStartFocus"
    />

    <!-- 番茄鐘 - 專注頁面 -->
    <PomodoroFocusScreen
      v-else-if="currentPage === 'pomodoro-focus'"
      @back="currentPage = 'pomodoro'"
      @complete="showPomodoroCert = true"
    />

    <!-- 頭盔TA手機 - 角色選擇 -->
    <PeekPhoneSelectScreen
      v-else-if="currentPage === 'peek-phone-select'"
      @back="goHome"
      @select="
        (id: string, cId: string) => {
          peekPhoneCharacterId = id;
          peekPhoneChatId = cId;
          currentPage = 'peek-phone';
        }
      "
    />

    <!-- 頭盔TA手機 - 手機內容 -->
    <PeekPhoneScreen
      v-else-if="
        currentPage === 'peek-phone' && peekPhoneCharacterId && peekPhoneChatId
      "
      :character-id="peekPhoneCharacterId"
      :chat-id="peekPhoneChatId"
      @back="
        currentPage = 'peek-phone-select';
        peekPhoneCharacterId = null;
        peekPhoneChatId = null;
      "
    />

    <!-- 小劇場 -->
    <TheaterScreen
      v-else-if="currentPage === 'theater'"
      :initial-post-id="pendingTheaterPostId"
      @back="goBackFromTheater"
      @post-opened="pendingTheaterPostId = undefined"
    />
    </Transition>

    <!-- 主題設定彈窗 -->
    <ThemeSettingsModal
      :visible="showThemeSettings"
      :chat-appearance="currentChatAppearance"
      :chat-id="currentChatId || undefined"
      @close="showThemeSettings = false"
      @save-chat-appearance="handleSaveChatAppearance"
    />

    <!-- 全局美化配置彈窗 -->
    <GlobalThemeModal
      :visible="showGlobalTheme"
      @close="showGlobalTheme = false"
    />

    <!-- 導入彈窗 -->
    <ImportModal
      :show="showImportModal"
      :type="importType"
      @close="closeImportModal"
      @imported="handleCharacterImported"
      @lorebook-imported="handleLorebookImported"
    />

    <!-- AI 角色生成彈窗 -->
    <AICharacterModal
      :show="showAICharacterModal"
      @close="showAICharacterModal = false"
      @created="handleAICharacterCreated"
    />

    <!-- 書影記錄管理彈窗 -->
    <Teleport to="body">
      <MediaLogManager
        v-if="showMediaLogManager"
        @close="showMediaLogManager = false"
      />
    </Teleport>

      <!-- 食記管理彈窗 -->
    <Teleport to="body">
      <FoodLogManager
        v-if="showFoodLogManager"
        @close="showFoodLogManager = false"
      />
    </Teleport>

    <!-- 來電模態框（App 級別） -->
    <IncomingCallModal
      v-if="showIncomingCallModal && currentPendingCall"
      :pending-call="currentPendingCall"
      @accept="handleIncomingCallAccept"
      @decline="handleIncomingCallDecline"
      @missed="handleIncomingCallMissed"
    />

    <!-- 電話聯絡人選擇彈窗 -->
    <PhoneContactPickerModal
      v-if="showPhoneContactPicker"
      @close="showPhoneContactPicker = false"
      @call="startPhoneCall"
    />

    <!-- 番茄鐘完成證書 -->
    <PomodoroCertModal
      v-if="showPomodoroCert"
      @close="handlePomodoroCertClose"
      @forward-to-chat="handlePomodoroCertForward"
    />

    <!-- 多人卡模式設定彈窗 -->
    <MultiCharSetupModal
      v-if="showMultiCharSetup"
      :character-name="
        charactersStore.characters.find(
          (c) => c.id === multiCharSetupCharacterId,
        )?.nickname ||
        charactersStore.characters.find(
          (c) => c.id === multiCharSetupCharacterId,
        )?.data?.name ||
        '角色'
      "
      :character-description="
        charactersStore.characters.find(
          (c) => c.id === multiCharSetupCharacterId,
        )?.data?.description || ''
      "
      @confirm="handleMultiCharConfirm"
      @cancel="showMultiCharSetup = false"
    />

    <!-- 角色庫聊天選擇彈窗 -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showChatPickerModal"
          class="chat-picker-overlay"
          @click.self="showChatPickerModal = false"
        >
          <div class="chat-picker-modal">
            <h3>選擇聊天</h3>

            <!-- 現有聊天列表 -->
            <div v-if="chatPickerChats.length > 0" class="chat-picker-section">
              <label class="chat-picker-label">現有聊天檔案：</label>
              <div class="chat-picker-list">
                <div
                  v-for="chat in chatPickerChats"
                  :key="chat.id"
                  class="chat-picker-item"
                  @click="chatPickerOpenExisting(chat.id)"
                >
                  <div class="chat-picker-item-info">
                    <span class="chat-picker-item-name">{{ chat.name }}</span>
                    <span class="chat-picker-item-meta">
                      {{ chat.messageCount ?? chat.messages?.length ?? 0 }}
                      條訊息
                    </span>
                  </div>
                  <svg
                    class="chat-picker-arrow"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                  </svg>
                </div>
              </div>
            </div>

            <!-- 分隔線 -->
            <div v-if="chatPickerChats.length > 0" class="chat-picker-divider">
              <span>或</span>
            </div>

            <!-- 新建聊天區域 -->
            <div class="chat-picker-section">
              <label class="chat-picker-label">建立新聊天：</label>

              <!-- 開場白選擇 -->
              <div
                v-if="chatPickerGreetings.length > 1"
                class="greeting-select-list"
              >
                <div
                  v-for="(g, idx) in chatPickerGreetings"
                  :key="idx"
                  class="greeting-option"
                  :class="{ selected: chatPickerGreetingIndex === idx }"
                  @click="chatPickerGreetingIndex = idx"
                >
                  <div class="greeting-radio">
                    <div
                      v-if="chatPickerGreetingIndex === idx"
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

              <div class="chat-picker-new-actions">
                <button
                  class="btn-secondary"
                  @click="chatPickerCreateNew(false)"
                >
                  不帶開場白
                </button>
                <button class="btn-confirm" @click="chatPickerCreateNew(true)">
                  帶開場白
                </button>
              </div>
            </div>

            <button
              class="chat-picker-cancel"
              @click="showChatPickerModal = false"
            >
              取消
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 全局 AI 生成狀態指示器 -->
    <GlobalGenerationIndicator />

    <!-- 全局流式輸出窗口 -->
    <StreamingOutputWindow
      :visible="streamingWindow.isVisible.value"
      :is-minimizing="isMinimizing"
      @close="handleGlobalStreamingClose"
      @stop="handleGlobalStreamingStop"
      @minimize="handleGlobalStreamingMinimize"
    />

    <!-- 全局最小化指示器 -->
    <MinimizedIndicator
      :visible="streamingWindow.isMinimized.value"
      :token-count="streamingWindow.tokenCount.value"
      :is-streaming="streamingWindow.isStreaming.value"
      @restore="handleGlobalStreamingRestore"
    />

    <!-- 全局電話通話浮動條（縮小時顯示） -->
    <GlobalPhoneCallBar />

    <!-- 全局電話通話全屏（從其他頁面展開時顯示） -->
    <PhoneCallModal
      v-if="
        phoneCallStore.isActive &&
        phoneCallStore.isExpanded &&
        !phoneCallStore.isVideoCallActive &&
        currentPage !== 'chat'
      "
    />

    <!-- 全局視訊通話全屏（從其他頁面展開時顯示） -->
    <VideoCallModal
      v-if="
        phoneCallStore.isActive &&
        phoneCallStore.isExpanded &&
        phoneCallStore.isVideoCallActive &&
        currentPage !== 'chat'
      "
    />

    <!-- 通話恢復彈窗 -->
    <Teleport to="body">
      <div v-if="showResumeCallDialog" class="resume-call-overlay">
        <div class="resume-call-dialog">
          <div class="resume-call-avatar">
            <img
              v-if="resumeCallSnapshot?.activeCall?.characterAvatar"
              :src="resumeCallSnapshot.activeCall.characterAvatar"
              alt="avatar"
            />
            <div v-else class="resume-call-avatar-placeholder">
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                width="32"
                height="32"
              >
                <path
                  d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"
                />
              </svg>
            </div>
          </div>
          <div class="resume-call-info">
            <div class="resume-call-title">通話未結束</div>
            <div class="resume-call-name">
              你還在和
              {{ resumeCallSnapshot?.activeCall?.characterName }} 通話中
            </div>
            <div class="resume-call-duration">
              已通話
              {{
                formatSnapshotDuration(resumeCallSnapshot?.callDuration ?? 0)
              }}
            </div>
          </div>
          <div class="resume-call-actions">
            <button class="resume-btn continue" @click="handleResumeCall">
              繼續通話
            </button>
            <button class="resume-btn hangup" @click="handleDiscardCall">
              掛掉
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 系統通知 Toast -->
    <NotificationToast @navigate="handleNotificationNavigate" />

    <!-- 向量記憶模型下載提示 -->
    <!-- 向量記憶設定引導彈窗 -->
    <Teleport to="body">
      <div v-if="showEmbeddingModelPrompt" class="embedding-prompt-overlay">
        <div class="embedding-prompt-dialog">
          <div class="embedding-prompt-icon">🧠</div>
          <div class="embedding-prompt-title">向量記憶已啟用</div>
          <div class="embedding-prompt-desc">
            向量記憶讓 AI 根據語義相關性回憶過去的對話，而非只按時間順序。<br />
            需要設定嵌入引擎才能使用。
          </div>

          <div
            style="
              background: rgba(125, 211, 168, 0.08);
              border: 1px solid rgba(125, 211, 168, 0.2);
              border-radius: 10px;
              padding: 10px 12px;
              margin: 10px 0;
              font-size: 12px;
              line-height: 1.7;
              color: var(--color-text-secondary, #9ca3af);
            "
          >
            <div
              style="
                font-weight: 600;
                color: var(--color-primary, #7dd3a8);
                margin-bottom: 4px;
              "
            >
              ☁️ 推薦：使用硅基流動免費 API
            </div>
            前往
            <span style="color: var(--color-primary, #7dd3a8)"
              >cloud.siliconflow.cn</span
            >
            註冊帳號，取得免費 API Key。<br />
            端點填入
            <code
              style="
                background: rgba(255, 255, 255, 0.06);
                padding: 1px 4px;
                border-radius: 3px;
              "
              >https://api.siliconflow.cn/v1</code
            ><br />
            模型選擇
            <code
              style="
                background: rgba(255, 255, 255, 0.06);
                padding: 1px 4px;
                border-radius: 3px;
              "
              >BAAI/bge-large-zh-v1.5</code
            >（免費、中文品質好）
          </div>

          <!-- 下載進度（僅在下載本地模型時顯示） -->
          <div
            v-if="embeddingModelDownloading"
            class="embedding-prompt-progress"
          >
            <div class="embedding-progress-bar">
              <div
                class="embedding-progress-fill"
                :style="{ width: embeddingModelProgress * 100 + '%' }"
              />
            </div>
            <div class="embedding-progress-text">
              {{ embeddingModelFile || "準備中..." }}
              <span
                v-if="embeddingModelProgress > 0 && embeddingModelProgress < 1"
              >
                {{ Math.round(embeddingModelProgress * 100) }}%
              </span>
            </div>
          </div>

          <div
            class="embedding-prompt-actions"
            style="flex-direction: column; gap: 8px"
          >
            <button
              class="embedding-btn download"
              :disabled="embeddingModelDownloading"
              @click="handleGoToEmbeddingSettings"
              style="width: 100%"
            >
              ☁️ 前往設定遠端 API
            </button>
            <button
              class="embedding-btn"
              :disabled="embeddingModelDownloading"
              @click="handleDownloadEmbeddingModel"
              style="
                width: 100%;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
                color: var(--color-text-secondary, #9ca3af);
              "
            >
              {{
                embeddingModelDownloading
                  ? "下載中..."
                  : "🖥️ 下載本地模型（約 30MB）"
              }}
            </button>
            <div
              style="
                font-size: 11px;
                color: var(--color-text-muted, #6b7280);
                text-align: center;
                line-height: 1.5;
              "
            >
              ⚠️ 本地模型在手機瀏覽器上可能因記憶體不足導致閃退，建議使用遠端
              API
            </div>
            <button
              class="embedding-btn disable"
              :disabled="embeddingModelDownloading"
              @click="handleDisableVectorMemory"
              style="width: 100%"
            >
              暫不使用，關閉向量記憶
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- SW 更新提示 Toast -->
    <Teleport to="body">
      <div v-if="showSwUpdateToast" class="sw-update-toast">
        <span>有新版本可用</span>
        <button class="sw-update-btn apply" @click="applySwUpdate">
          立即更新
        </button>
        <button class="sw-update-btn dismiss" @click="dismissSwUpdate">
          稍後
        </button>
      </div>
    </Teleport>

    <!-- GitHub 雲端備份全局進度條 -->
    <Teleport to="body">
      <div v-if="ghBackupBusy" class="gh-global-progress">
        <div class="gh-global-progress-bar">
          <div
            class="gh-global-progress-fill"
            :style="{ width: ghBackupPercent + '%' }"
          />
        </div>
        <span class="gh-global-progress-text">{{ ghBackupDisplayText }}</span>
      </div>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.app-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: var(--bg-color);
  color: var(--text-color);
  overflow: hidden;
  transition:
    background-color 1s ease,
    color 0.5s ease;

  // 移除統一頂部安全區域，改由各子頁面的 header 自行處理，避免背景色無法延伸至頂部
  // padding-top: var(--safe-top, 0px);
}

.home-screen-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.resume-call-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.resume-call-dialog {
  background: #1a1a2e;
  border-radius: 20px;
  padding: 28px 24px;
  width: min(340px, 90vw);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.resume-call-avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid #7dd3a8;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.resume-call-avatar-placeholder {
  width: 100%;
  height: 100%;
  background: #2a2a4a;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #7dd3a8;
}

.resume-call-info {
  text-align: center;

  .resume-call-title {
    font-size: 12px;
    color: #7dd3a8;
    margin-bottom: 4px;
    letter-spacing: 0.05em;
  }

  .resume-call-name {
    font-size: 18px;
    font-weight: 600;
    color: #fff;
    margin-bottom: 4px;
  }

  .resume-call-duration {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
  }
}

.resume-call-actions {
  display: flex;
  gap: 12px;
  width: 100%;
  margin-top: 8px;
}

.resume-btn {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;

  &:active {
    opacity: 0.8;
  }

  &.continue {
    background: #7dd3a8;
    color: #1a1a2e;
  }

  &.hangup {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }
}

// ===== 角色庫聊天選擇彈窗 =====
.chat-picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1010;
  padding: 20px;
}

.chat-picker-modal {
  background: var(--color-surface, #fff);
  border-radius: 16px;
  padding: 20px;
  width: min(380px, 90vw);
  max-height: 80vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;

  h3 {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text, #333);
    margin: 0;
  }
}

.chat-picker-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-picker-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary, #666);
}

.chat-picker-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 180px;
  overflow-y: auto;
}

.chat-picker-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.1));
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: var(--color-surface-hover, rgba(0, 0, 0, 0.03));
    border-color: var(--color-primary, #7dd3a8);
  }
}

.chat-picker-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.chat-picker-item-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text, #333);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-picker-item-meta {
  font-size: 11px;
  color: var(--color-text-secondary, #999);
}

.chat-picker-arrow {
  width: 18px;
  height: 18px;
  color: var(--color-text-secondary, #999);
  flex-shrink: 0;
}

.chat-picker-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--color-text-secondary, #999);
  font-size: 12px;

  &::before,
  &::after {
    content: "";
    flex: 1;
    height: 1px;
    background: var(--color-border, rgba(0, 0, 0, 0.1));
  }
}

.chat-picker-new-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;

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
    color: white;
    font-size: 13px;
    cursor: pointer;
  }
}

.chat-picker-cancel {
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.12));
  background: transparent;
  color: var(--color-text-secondary, #666);
  font-size: 13px;
  cursor: pointer;
  text-align: center;
}

// 開場白選擇（共用樣式）
.greeting-select-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
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

// fade 過渡
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.sw-update-toast {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: rgba(30, 30, 40, 0.92);
  color: #fff;
  border-radius: 24px;
  font-size: 13px;
  backdrop-filter: blur(12px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  white-space: nowrap;

  .sw-update-btn {
    border: none;
    border-radius: 12px;
    padding: 4px 12px;
    font-size: 12px;
    cursor: pointer;
    font-weight: 500;

    &.apply {
      background: #4f8ef7;
      color: #fff;
    }

    &.dismiss {
      background: rgba(255, 255, 255, 0.15);
      color: #ccc;
    }
  }
}

// ===== 向量記憶模型下載提示 =====
.embedding-prompt-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.embedding-prompt-dialog {
  background: #1a1a2e;
  border-radius: 20px;
  padding: 28px 24px;
  width: min(340px, 90vw);
  max-height: min(90vh, 90dvh);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.embedding-prompt-icon {
  font-size: 36px;
  margin-bottom: 4px;
}

.embedding-prompt-title {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
}

.embedding-prompt-desc {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  text-align: center;
  line-height: 1.6;
}

.embedding-prompt-progress {
  width: 100%;
  margin-top: 4px;
}

.embedding-progress-bar {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
}

.embedding-progress-fill {
  height: 100%;
  background: #7dd3a8;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.embedding-progress-text {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 6px;
  text-align: center;
  word-break: break-all;
}

.embedding-prompt-actions {
  display: flex;
  gap: 12px;
  width: 100%;
  margin-top: 8px;
}

.embedding-btn {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;

  &:active {
    opacity: 0.8;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.download {
    background: #7dd3a8;
    color: #1a1a2e;
  }

  &.disable {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
}

// GitHub 雲端備份全局進度條
.gh-global-progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 99999;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}

.gh-global-progress-bar {
  width: 100%;
  height: 3px;
  background: rgba(0, 0, 0, 0.08);
}

.gh-global-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #22c55e, #4ade80);
  transition: width 0.3s ease;
  border-radius: 0 2px 2px 0;
}

.gh-global-progress-text {
  margin-top: 4px;
  padding: 4px 12px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 11px;
  border-radius: 10px;
  pointer-events: auto;
}
</style>
