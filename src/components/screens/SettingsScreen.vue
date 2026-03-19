<script setup lang="ts">
import { getVoiceDisplayName, MINIMAX_LANGUAGES } from "@/api/MiniMaxTTSApi";
import { OpenAICompatibleClient } from "@/api/OpenAICompatible";
import AuxiliaryApiPanel from "@/components/screens/AuxiliaryApiPanel.vue";
import { clearAllData, db } from "@/db/database";
import {
  extractImagesFromMessages,
  restoreImagesToMessages,
} from "@/db/operations";
import {
  checkPermission as checkBackupPermission,
  clearBackupDirectory,
  DEFAULT_BACKUP_SETTINGS,
  getSelectedFolderName,
  initAutoBackup,
  isFileSystemAccessSupported,
  loadBackupSettings,
  performBackup,
  pickBackupDirectory,
  requestPermission as requestBackupPermission,
  saveBackupSettings,
  startAutoBackup,
  stopAutoBackup,
  type AutoBackupSettings,
  type BackupProgressCallback,
} from "@/services/AutoBackupService";
import { getLegacyBackupService } from "@/services/LegacyBackupService";
import {
  useCharactersStore,
  useLorebooksStore,
  useNotificationStore,
  useSettingsStore,
  useUserStore,
} from "@/stores";
import { useCloudPushStore } from "@/stores/cloudPush";
import { useThemeStore } from "@/stores/theme";
import type { APIProvider } from "@/types/settings";
import {
  destroyDebugOverlay,
  initDebugOverlay,
  isDebugOverlayActive,
} from "@/utils/debugOverlay";
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";

interface RingtoneOption {
  id: string;
  name: string;
  description: string;
}

// Emits
const emit = defineEmits<{
  (e: "back"): void;
  (e: "open-prompt-manager"): void;
  (e: "open-regex-scripts"): void;
}>();

// Stores
const settingsStore = useSettingsStore();
const charactersStore = useCharactersStore();
const lorebooksStore = useLorebooksStore();
const userStore = useUserStore();
const themeStore = useThemeStore();
const notificationStore = useNotificationStore();
const cloudPushStore = useCloudPushStore();

// Debug Overlay 狀態
const debugOverlayActive = ref(isDebugOverlayActive());

function toggleDebugOverlay() {
  if (debugOverlayActive.value) {
    destroyDebugOverlay();
  } else {
    initDebugOverlay();
  }
  debugOverlayActive.value = isDebugOverlayActive();
}

// 系統通知權限狀態
const pushPermissionStatus = ref<NotificationPermission>("default");

const ringtoneOptions: RingtoneOption[] = [
  { id: "classic", name: "經典來電", description: "傳統雙音電話鈴聲" },
  { id: "digital", name: "數位節奏", description: "較明亮、節奏感強" },
  { id: "soft", name: "柔和提醒", description: "較柔和不刺耳" },
  { id: "custom", name: "自訂音檔", description: "使用你上傳的音檔" },
];

const ringtoneTestPlaying = ref(false);
let ringtoneTestContext: AudioContext | null = null;
let ringtoneTestTimer: ReturnType<typeof setInterval> | null = null;
let ringtoneTestAudio: HTMLAudioElement | null = null;

/** 請求系統通知權限 */
async function handleRequestPushPermission() {
  if (!("Notification" in window)) {
    alert(
      "此瀏覽器不支援系統通知。\niOS 需「加入主畫面」作為 PWA 運行才支援。",
    );
    return;
  }
  const result = await notificationStore.requestPushPermission();
  pushPermissionStatus.value = result;
  if (result === "granted") {
    // 發送一條測試通知確認成功
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.showNotification("Aguaphone", { body: "通知權限已開啟 ✓" });
        } else {
          new Notification("Aguaphone", { body: "通知權限已開啟 ✓" });
        }
      } else {
        new Notification("Aguaphone", { body: "通知權限已開啟 ✓" });
      }
    } catch {
      /* ignore */
    }
  }
}

/** 測試系統通知 */
async function handleTestNotification() {
  try {
    const title = "Aguaphone 測試";
    const options = {
      body: "如果你看到這條通知，代表系統推播正常運作！",
      silent: false,
    };
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, options);
      } else {
        new Notification(title, options);
      }
    } else {
      new Notification(title, options);
    }
  } catch (e: any) {
    alert(`通知發送失敗：${e.message}`);
  }
}

/** 顯示權限引導 */
function handleShowPermissionGuide() {
  // 不做 alert，直接展開下方的提示區塊（已在 template 中用 v-if 顯示）
  // 這裡嘗試再次請求，萬一瀏覽器允許重新詢問
  if ("Notification" in window && Notification.permission !== "denied") {
    handleRequestPushPermission();
  }
}

// ===== 雲端推送鬧鐘 =====
const cloudPushEnabled = ref(cloudPushStore.enabled);
const cloudPushChannels = ref<("discord" | "webpush")[]>([
  ...cloudPushStore.enabledChannels,
]);
const cloudPushDiscordUserId = ref(cloudPushStore.discordUserId);
const cloudPushInterval = ref(cloudPushStore.intervalMinutes);
const cloudPushDND = ref(cloudPushStore.doNotDisturbEnabled);
const cloudPushDNDStart = ref(cloudPushStore.doNotDisturbStart);
const cloudPushDNDEnd = ref(cloudPushStore.doNotDisturbEnd);
const cloudPushSyncStatus = ref(cloudPushStore.syncStatus);
const cloudPushSyncError = ref(cloudPushStore.syncError);
const cloudPushNextAlarm = ref(cloudPushStore.nextAlarm);
const cloudPushPendingCount = ref(cloudPushStore.pendingMessageCount);

function handleCloudPushToggle() {
  if (!cloudPushEnabled.value) {
    cloudPushStore.disableCloudPush();
  }
}

function toggleCloudPushChannel(channel: "discord" | "webpush", event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  if (checked) {
    if (!cloudPushChannels.value.includes(channel)) {
      cloudPushChannels.value.push(channel);
    }
  } else {
    cloudPushChannels.value = cloudPushChannels.value.filter(
      (c) => c !== channel,
    );
  }
  handleCloudPushSettingsChange();
}

function handleCloudPushSettingsChange() {
  cloudPushStore.enabledChannels = [...cloudPushChannels.value];
  cloudPushStore.discordUserId = cloudPushDiscordUserId.value;
  cloudPushStore.intervalMinutes = cloudPushInterval.value;
  cloudPushStore.doNotDisturbEnabled = cloudPushDND.value;
  cloudPushStore.doNotDisturbStart = cloudPushDNDStart.value;
  cloudPushStore.doNotDisturbEnd = cloudPushDNDEnd.value;
  cloudPushStore.saveSettings();
}

async function handleCloudPushSync() {
  cloudPushSyncStatus.value = "syncing";
  cloudPushSyncError.value = null;
  handleCloudPushSettingsChange();
  await cloudPushStore.syncToCloud();
  cloudPushSyncStatus.value = cloudPushStore.syncStatus;
  cloudPushSyncError.value = cloudPushStore.syncError;
  cloudPushNextAlarm.value = cloudPushStore.nextAlarm;
  cloudPushEnabled.value = cloudPushStore.enabled;
}

async function handleCloudPushTest() {
  try {
    await cloudPushStore.testPushNotification();
    alert("測試推送已發送！請檢查 Discord DM。");
  } catch (e: any) {
    alert(`測試推送失敗：${e.message}`);
  }
}

async function handleUnlinkDiscord() {
  if (confirm("確定要解除 Discord 連結嗎？")) {
    await cloudPushStore.unlinkDiscord();
    cloudPushDiscordUserId.value = "";
  }
}

function formatNextAlarm(ts: number | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function playRingtonePatternChunk(
  context: AudioContext,
  ringtoneId: string,
  volume: number,
): void {
  const now = context.currentTime;
  const gain = context.createGain();
  gain.connect(context.destination);

  const safeVolume = Math.min(1, Math.max(0, volume));
  const baseGain = 0.1 * safeVolume;

  const scheduleTone = (freq: number, start: number, duration: number) => {
    const osc = context.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, start);
    osc.connect(gain);
    osc.start(start);
    osc.stop(start + duration);
  };

  if (ringtoneId === "digital") {
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(baseGain, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.52);

    scheduleTone(988, now, 0.14);
    scheduleTone(1318, now + 0.16, 0.14);
    scheduleTone(988, now + 0.34, 0.14);
  } else if (ringtoneId === "soft") {
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(baseGain * 0.8, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);

    scheduleTone(523.25, now, 0.28);
    scheduleTone(659.25, now + 0.3, 0.28);
  } else {
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(baseGain, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now + 0.22);
    gain.gain.exponentialRampToValueAtTime(baseGain, now + 0.24);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

    scheduleTone(880, now, 0.2);
    scheduleTone(660, now + 0.22, 0.2);
  }
}

function stopRingtoneTest(): void {
  if (ringtoneTestTimer) {
    clearInterval(ringtoneTestTimer);
    ringtoneTestTimer = null;
  }

  if (ringtoneTestAudio) {
    ringtoneTestAudio.pause();
    ringtoneTestAudio.currentTime = 0;
    ringtoneTestAudio = null;
  }

  if (ringtoneTestContext && ringtoneTestContext.state !== "closed") {
    void ringtoneTestContext.close();
  }
  ringtoneTestContext = null;
  ringtoneTestPlaying.value = false;
}

async function handleTestIncomingRingtone(): Promise<void> {
  if (ringtoneTestPlaying.value) {
    stopRingtoneTest();
    return;
  }

  const volume = settingsStore.incomingCallRingtone.volume;
  const selected = settingsStore.incomingCallRingtone.selectedRingtoneId;

  ringtoneTestPlaying.value = true;

  if (
    selected === "custom" &&
    settingsStore.incomingCallRingtone.customAudioDataUrl
  ) {
    try {
      ringtoneTestAudio = new Audio(
        settingsStore.incomingCallRingtone.customAudioDataUrl,
      );
      ringtoneTestAudio.volume = volume;
      ringtoneTestAudio.loop = true;
      await ringtoneTestAudio.play();
      setTimeout(() => stopRingtoneTest(), 5000);
      return;
    } catch (e) {
      console.warn("[SettingsScreen] 自訂鈴聲測試播放失敗，改用內建", e);
    }
  }

  try {
    ringtoneTestContext = new AudioContext();
    if (ringtoneTestContext.state === "suspended") {
      await ringtoneTestContext.resume();
    }

    playRingtonePatternChunk(ringtoneTestContext, selected, volume);
    ringtoneTestTimer = setInterval(() => {
      if (!ringtoneTestContext) return;
      playRingtonePatternChunk(ringtoneTestContext, selected, volume);
    }, 1800);

    setTimeout(() => stopRingtoneTest(), 5000);
  } catch (e) {
    console.warn("[SettingsScreen] 內建鈴聲測試失敗", e);
    stopRingtoneTest();
  }
}

const MIN_CUSTOM_RINGTONE_DURATION_SECONDS = 1;

function getAudioDurationFromFile(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const audio = new Audio();

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      audio.removeAttribute("src");
    };

    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      cleanup();
      resolve(duration);
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error("無法讀取音訊長度"));
    };

    audio.src = objectUrl;
  });
}

async function handleIncomingRingtoneFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const duration = await getAudioDurationFromFile(file);
    if (duration < MIN_CUSTOM_RINGTONE_DURATION_SECONDS) {
      alert(
        `自訂鈴聲最短需要 ${MIN_CUSTOM_RINGTONE_DURATION_SECONDS} 秒，目前為 ${duration.toFixed(1)} 秒`,
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      settingsStore.incomingCallRingtone.customAudioDataUrl = dataUrl;
      settingsStore.incomingCallRingtone.customAudioName = file.name;
      settingsStore.incomingCallRingtone.selectedRingtoneId = "custom";
      await saveSettings();
    };
    reader.readAsDataURL(file);
  } catch (error) {
    console.warn("[SettingsScreen] 無法解析自訂鈴聲時長", error);
    alert("無法讀取音訊時長，請更換檔案後再試");
  } finally {
    input.value = "";
  }
}

async function handleClearIncomingCustomRingtone(): Promise<void> {
  settingsStore.incomingCallRingtone.customAudioDataUrl = "";
  settingsStore.incomingCallRingtone.customAudioName = "";
  if (settingsStore.incomingCallRingtone.selectedRingtoneId === "custom") {
    settingsStore.incomingCallRingtone.selectedRingtoneId = "classic";
  }
  await saveSettings();
}

// API 提供者選項 (icon 為 SVG path)
const providers: {
  id: APIProvider;
  name: string;
  endpoint: string;
  icon: string;
}[] = [
  {
    id: "openai",
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1",
    icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z",
  },
  {
    id: "claude",
    name: "Claude",
    endpoint: "https://api.anthropic.com/v1",
    icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z",
  },
  {
    id: "gemini",
    name: "Gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai",
    icon: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1",
    icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z",
  },
  {
    id: "custom",
    name: "自定義",
    endpoint: "",
    icon: "M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
  },
];

// 常用模型
const popularModels: Record<string, string[]> = {
  openai: [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "gpt-3.5-turbo",
    "o1-mini",
    "o1-preview",
  ],
  claude: [
    "claude-sonnet-4-20250514",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
  ],
  gemini: [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
  ],
  openrouter: [
    "openai/gpt-4o",
    "anthropic/claude-3.5-sonnet",
    "google/gemini-2.0-flash-exp",
    "meta-llama/llama-3.3-70b-instruct",
  ],
  custom: [],
};

// 狀態
const currentTab = ref<"api" | "auxiliary" | "storage" | "data" | "audio">(
  "api",
);
const isTestingConnection = ref(false);
const connectionStatus = ref<"none" | "success" | "error">("none");
const connectionMessage = ref("");
const showApiKey = ref(false);
const isSaving = ref(false);
// 配置文件相關
const showProfileModal = ref(false);
const showNewProfileConfirm = ref(false);
const newProfileName = ref("");
const editingProfileId = ref<string | null>(null);
const editingProfileName = ref("");

function startRenameProfile(profileId: string) {
  const profile = settingsStore.profiles.find((p) => p.id === profileId);
  if (!profile) return;
  editingProfileId.value = profileId;
  editingProfileName.value = profile.name;
}

async function confirmRenameProfile() {
  if (editingProfileId.value && editingProfileName.value.trim()) {
    settingsStore.renameProfile(
      editingProfileId.value,
      editingProfileName.value.trim(),
    );
    await doSave();
  }
  editingProfileId.value = null;
  editingProfileName.value = "";
}

// 存儲狀態
const storageStatus = reactive({
  used: 0,
  limit: 50 * 1024 * 1024, // 50MB 估計
  percentage: 0,
  status: "safe" as "safe" | "warning" | "critical",
  usedFormatted: "0 KB",
  limitFormatted: "50 MB",
  breakdown: [] as { key: string; size: number; sizeFormatted: string }[],
});

// 導入/導出狀態
const isExporting = ref(false);
const isImporting = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

// 模型拉取狀態
const isFetchingModels = ref(false);
const fetchedModels = ref<string[]>([]);
const modelFetchError = ref("");
const customModelName = ref("");
const lastFetchedEndpoint = ref(""); // 追蹤上次拉取的端點

// 將外部 URL 轉為代理路徑（解決 CORS 和 mixed content 問題）
function toProxyUrl(url: string): string {
  // 直連模式：不走代理，直接請求外部 API
  if (settingsStore.api.directConnect) return url;
  if (typeof window === "undefined") return url;
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === window.location.origin) return url;
    // 走灰雲子域名，繞過 Cloudflare timeout
    const prefix =
      parsed.protocol === "http:" ? "/ai-proxy-http/" : "/ai-proxy/";
    return `https://api-203.aguacloud.uk${prefix}${parsed.host}${parsed.pathname}`;
  } catch {
    return url;
  }
}

// 可用模型（合併預設、拉取的、和當前選擇的）
const availableModels = computed(() => {
  // 如果有拉取的模型，只顯示拉取的模型（不添加不存在的舊模型）
  if (fetchedModels.value.length > 0) {
    return [...fetchedModels.value];
  }

  // 沒有拉取的模型時，使用預設模型
  const preset = popularModels[settingsStore.api.provider] || [];
  const current = settingsStore.api.model;
  const all = [...preset];
  // 只有在沒拉取模型時，才添加當前選擇的模型到列表
  if (current && current !== "__custom__" && !all.includes(current)) {
    all.unshift(current);
  }
  return all.filter((m) => m); // 過濾空字串
});

// ===== 自動備份 =====
const autoBackupSettings = reactive<AutoBackupSettings>({
  ...DEFAULT_BACKUP_SETTINGS,
});
const autoBackupFolderName = ref<string | null>(null);
const autoBackupPermission = ref<string>("no-handle");
const isBackingUp = ref(false);
const backupProgress = ref("");
const fsaaSupported = isFileSystemAccessSupported();

async function refreshAutoBackupState() {
  const saved = await loadBackupSettings();
  Object.assign(autoBackupSettings, saved);
  autoBackupFolderName.value = await getSelectedFolderName();
  autoBackupPermission.value = await checkBackupPermission();
}

async function handlePickBackupFolder() {
  const ok = await pickBackupDirectory();
  if (ok) {
    autoBackupFolderName.value = await getSelectedFolderName();
    autoBackupPermission.value = await checkBackupPermission();
  }
}

async function handleClearBackupFolder() {
  await clearBackupDirectory();
  autoBackupFolderName.value = null;
  autoBackupPermission.value = "no-handle";
}

async function handleRequestBackupPermission() {
  const ok = await requestBackupPermission();
  autoBackupPermission.value = ok ? "granted" : "denied";
}

async function handleToggleAutoBackup() {
  autoBackupSettings.enabled = !autoBackupSettings.enabled;
  await saveBackupSettings({ ...autoBackupSettings });
  if (autoBackupSettings.enabled) {
    await startAutoBackup();
  } else {
    stopAutoBackup();
  }
}

async function handleSaveBackupInterval() {
  await saveBackupSettings({ ...autoBackupSettings });
  if (autoBackupSettings.enabled) {
    await startAutoBackup(); // 重啟定時器
  }
}

const onBackupProgress: BackupProgressCallback = (info) => {
  if (info.current && info.total) {
    backupProgress.value = `${info.phase} (${info.current}/${info.total})`;
  } else {
    backupProgress.value = info.phase;
  }
};

async function handleBackupNow() {
  isBackingUp.value = true;
  backupProgress.value = "準備中...";
  try {
    const result = await performBackup(false, onBackupProgress);
    autoBackupSettings.lastBackupAt = Date.now();
    autoBackupSettings.lastBackupMessage = result.message;
    if (result.success) {
      alert(`✓ ${result.message}`);
    } else {
      alert(`✗ ${result.message}`);
    }
  } finally {
    isBackingUp.value = false;
    backupProgress.value = "";
  }
}

async function handleDownloadBackup() {
  isBackingUp.value = true;
  backupProgress.value = "準備中...";
  try {
    const result = await performBackup(true, onBackupProgress);
    autoBackupSettings.lastBackupAt = Date.now();
    autoBackupSettings.lastBackupMessage = result.message;
  } finally {
    isBackingUp.value = false;
    backupProgress.value = "";
  }
}

function formatBackupTime(ts: number | null): string {
  if (!ts) return "從未備份";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 載入設定
onMounted(async () => {
  await settingsStore.loadSettings();
  await cloudPushStore.loadSettings();
  await refreshStorageStatus();

  // 初始化系統通知權限狀態
  if ("Notification" in window) {
    pushPermissionStatus.value = Notification.permission;
  }

  // 載入自動備份狀態
  await refreshAutoBackupState();

  // 如果有 API 設定，自動拉取模型列表
  if (settingsStore.api.endpoint && settingsStore.api.apiKey) {
    await fetchModels();
  }
});

onUnmounted(() => {
  stopRingtoneTest();
});

// 格式化大小
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// 刷新存儲狀態
async function refreshStorageStatus() {
  try {
    // 估算 IndexedDB 使用量
    if ("storage" in navigator && "estimate" in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      storageStatus.used = estimate.usage || 0;
      storageStatus.limit = estimate.quota || 50 * 1024 * 1024;
    }

    // 計算百分比和狀態
    storageStatus.percentage = Math.round(
      (storageStatus.used / storageStatus.limit) * 100,
    );
    storageStatus.usedFormatted = formatSize(storageStatus.used);
    storageStatus.limitFormatted = formatSize(storageStatus.limit);

    if (storageStatus.percentage >= 90) {
      storageStatus.status = "critical";
    } else if (storageStatus.percentage >= 70) {
      storageStatus.status = "warning";
    } else {
      storageStatus.status = "safe";
    }

    // 獲取詳細數據
    await charactersStore.loadCharacters();
    await lorebooksStore.loadLorebooks();

    storageStatus.breakdown = [
      {
        key: "角色",
        size: charactersStore.characters.length,
        sizeFormatted: `${charactersStore.characters.length} 個`,
      },
      {
        key: "世界書",
        size: lorebooksStore.lorebooks.length,
        sizeFormatted: `${lorebooksStore.lorebooks.length} 個`,
      },
    ];
  } catch (e) {
    console.error("Failed to get storage estimate:", e);
  }
}

// 切換提供者
function selectProvider(providerId: APIProvider) {
  settingsStore.api.provider = providerId;
  const provider = providers.find((p) => p.id === providerId);
  if (provider && provider.endpoint) {
    settingsStore.api.endpoint = provider.endpoint;
  }
  const models = popularModels[providerId];
  if (models && models.length > 0 && models[0]) {
    settingsStore.api.model = models[0];
  }
  // 清空拉取的模型（端點已改變）
  clearFetchedModels();
  connectionStatus.value = "none";
}

// 清空拉取的模型
function clearFetchedModels() {
  fetchedModels.value = [];
  lastFetchedEndpoint.value = "";
  modelFetchError.value = "";
}

// 切換配置文件並清空模型
function handleSwitchProfile(profileId: string) {
  const prevEndpoint = settingsStore.api.endpoint;
  settingsStore.switchProfile(profileId);
  // 如果端點改變了，清空拉取的模型
  if (prevEndpoint !== settingsStore.api.endpoint) {
    clearFetchedModels();
  }
  connectionStatus.value = "none";
}

// 測試連接
async function testConnection() {
  if (!settingsStore.api.endpoint || !settingsStore.api.apiKey) {
    connectionStatus.value = "error";
    connectionMessage.value = "請填寫 API 端點和密鑰";
    return;
  }

  if (!settingsStore.api.model) {
    connectionStatus.value = "error";
    connectionMessage.value = "請選擇模型";
    return;
  }

  isTestingConnection.value = true;
  connectionStatus.value = "none";

  try {
    const client = new OpenAICompatibleClient(settingsStore.api);
    const result = await client.testConnection();

    if (result.success) {
      connectionStatus.value = "success";
      // 顯示模型回覆
      if (result.response) {
        connectionMessage.value = `✓ 模型回覆: "${result.response}"`;
      } else {
        connectionMessage.value = "連接成功！";
      }
    } else {
      connectionStatus.value = "error";
      connectionMessage.value = result.message || "連接失敗，請檢查設定";
    }
  } catch (e) {
    connectionStatus.value = "error";
    connectionMessage.value = `錯誤: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    isTestingConnection.value = false;
  }
}

// 應用自定義模型名稱
function applyCustomModel() {
  if (customModelName.value.trim()) {
    settingsStore.api.model = customModelName.value.trim();
    customModelName.value = "";
  }
}

// 拉取模型列表
async function fetchModels() {
  if (!settingsStore.api.endpoint || !settingsStore.api.apiKey) {
    modelFetchError.value = "請先填寫 API 端點和密鑰";
    return;
  }

  const currentEndpoint = settingsStore.api.endpoint;

  // 如果端點已改變，清空舊的模型列表
  if (
    lastFetchedEndpoint.value &&
    lastFetchedEndpoint.value !== currentEndpoint
  ) {
    fetchedModels.value = [];
  }

  isFetchingModels.value = true;
  modelFetchError.value = "";

  try {
    const modelsUrl = toProxyUrl(`${currentEndpoint}/models`);
    const response = await fetch(modelsUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${settingsStore.api.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // 解析模型列表（OpenAI 格式）
    if (data.data && Array.isArray(data.data)) {
      fetchedModels.value = data.data
        .map((m: { id?: string }) => m.id || "")
        .filter((id: string) => id)
        .sort((a: string, b: string) => a.localeCompare(b));

      if (fetchedModels.value.length > 0) {
        modelFetchError.value = "";
        lastFetchedEndpoint.value = currentEndpoint; // 記錄成功拉取的端點
        // 如果當前模型不在拉取的列表中，自動選擇第一個
        if (!fetchedModels.value.includes(settingsStore.api.model)) {
          settingsStore.api.model = fetchedModels.value[0];
        }
      } else {
        modelFetchError.value = "未找到可用模型";
      }
    } else if (Array.isArray(data)) {
      // 某些 API 直接返回數組
      fetchedModels.value = data
        .map((m: string | { id?: string }) =>
          typeof m === "string" ? m : m.id || "",
        )
        .filter((id: string) => id);
      lastFetchedEndpoint.value = currentEndpoint; // 記錄成功拉取的端點
      // 如果當前模型不在拉取的列表中，自動選擇第一個
      if (
        fetchedModels.value.length > 0 &&
        !fetchedModels.value.includes(settingsStore.api.model)
      ) {
        settingsStore.api.model = fetchedModels.value[0];
      }
    } else {
      modelFetchError.value = "無法解析模型列表";
    }
  } catch (e) {
    console.error("拉取模型失敗:", e);
    modelFetchError.value = `拉取失敗: ${e instanceof Error ? e.message : String(e)}`;
    // 如果拉取失敗，可能是 CORS 問題，提示用戶手動輸入
    if (e instanceof TypeError && e.message.includes("fetch")) {
      modelFetchError.value = "CORS 限制，請手動輸入模型名稱";
    }
    // 拉取失敗時清空舊的模型列表
    fetchedModels.value = [];
    lastFetchedEndpoint.value = "";
  } finally {
    isFetchingModels.value = false;
  }
}

// 保存成功通知
const showSaveSuccess = ref(false);

// 保存設定
async function saveSettings() {
  // 檢查是否需要處理配置文件
  const currentEndpoint = settingsStore.api.endpoint?.trim();
  const currentApiKey = settingsStore.api.apiKey?.trim();

  // 如果沒有填寫 API 資訊，直接保存
  if (!currentEndpoint || !currentApiKey) {
    await doSave();
    return;
  }

  // 如果已經有選中的配置文件，檢查 endpoint 是否有變動
  if (settingsStore.currentProfileId) {
    const currentExists = settingsStore.profiles?.find(
      (p) => p.id === settingsStore.currentProfileId,
    );
    if (currentExists) {
      const savedEndpoint = currentExists.api.endpoint?.trim();
      // endpoint 沒變，直接保存
      if (savedEndpoint === currentEndpoint) {
        await doSave();
        return;
      }
      // endpoint 改變了，檢查是否已有其他配置使用新的 endpoint
      const matchingProfile = settingsStore.profiles?.find(
        (p) =>
          p.id !== settingsStore.currentProfileId &&
          p.api.endpoint?.trim() === currentEndpoint,
      );
      if (matchingProfile) {
        // 切換到已有的配置
        settingsStore.currentProfileId = matchingProfile.id;
        await doSave();
        return;
      }
      // 新的 endpoint 沒有對應配置，詢問是否建立新配置
      newProfileName.value = getProfileNameSuggestion();
      showNewProfileConfirm.value = true;
      return;
    }
  }

  // 沒有選中的配置文件時，嘗試按 endpoint 匹配現有配置
  const existingProfile = settingsStore.profiles?.find(
    (p) => p.api.endpoint?.trim() === currentEndpoint,
  );

  if (existingProfile) {
    // 地址相同，更新到該配置文件（不要用 switchProfile，否則會覆蓋當前設定）
    settingsStore.currentProfileId = existingProfile.id;
    await doSave();
  } else if (settingsStore.profiles?.length > 0) {
    // 地址不同且已有其他配置，詢問是否創建新配置
    newProfileName.value = getProfileNameSuggestion();
    showNewProfileConfirm.value = true;
  } else {
    // 沒有任何配置文件，自動創建第一個
    const name = getProfileNameSuggestion();
    settingsStore.createProfile(name);
    await doSave();
  }
}

// 根據 API 資訊生成配置文件名稱建議
function getProfileNameSuggestion(): string {
  const endpoint = settingsStore.api.endpoint || "";
  const provider = settingsStore.api.provider || "custom";

  // 嘗試從 endpoint 提取名稱
  if (endpoint.includes("openai.com")) return "OpenAI";
  if (endpoint.includes("anthropic.com")) return "Claude";
  if (endpoint.includes("googleapis.com")) return "Gemini";
  if (endpoint.includes("openrouter.ai")) return "OpenRouter";

  // 使用 provider 名稱
  const providerNames: Record<string, string> = {
    openai: "OpenAI",
    claude: "Claude",
    gemini: "Gemini",
    openrouter: "OpenRouter",
    custom: "自定義 API",
  };

  return (
    providerNames[provider] ||
    `配置 ${(settingsStore.profiles?.length || 0) + 1}`
  );
}

// 確認創建新配置文件並保存
async function confirmCreateProfileAndSave() {
  const name = newProfileName.value.trim() || getProfileNameSuggestion();
  settingsStore.createProfile(name);
  showNewProfileConfirm.value = false;
  await doSave();
}

// 不創建新配置，直接保存（覆蓋當前配置）
async function saveWithoutNewProfile() {
  showNewProfileConfirm.value = false;
  await doSave();
}

async function handleSaveButton() {
  await saveSettings();
}

// 實際執行保存
async function doSave() {
  isSaving.value = true;
  try {
    await settingsStore.saveSettings();
    // 顯示成功通知
    showSaveSuccess.value = true;
    setTimeout(() => {
      showSaveSuccess.value = false;
    }, 2000);
  } catch (e) {
    console.error("保存失敗:", e);
    alert("保存失敗: " + (e instanceof Error ? e.message : String(e)));
  } finally {
    isSaving.value = false;
  }
}

// ===== 配置文件管理 =====

// 創建新配置文件
function createNewProfile() {
  if (!newProfileName.value.trim()) {
    newProfileName.value = `配置 ${settingsStore.profiles.length + 1}`;
  }
  settingsStore.createProfile(newProfileName.value.trim());
  newProfileName.value = "";
  showProfileModal.value = false;
}

// 刪除配置文件
function confirmDeleteProfile(profileId: string) {
  const profile = settingsStore.profiles.find((p) => p.id === profileId);
  if (!profile) return;

  if (confirm(`確定要刪除配置「${profile.name}」嗎？`)) {
    settingsStore.deleteProfile(profileId);
  }
}

// 複製 API 端點和密鑰到剪貼板
const copiedProfileId = ref<string | null>(null);
async function copyProfileCredentials(profileId: string) {
  const profile = settingsStore.profiles?.find((p) => p.id === profileId);
  if (!profile) return;
  const text = `端點：${profile.api.endpoint || ""}\n密鑰：${profile.api.apiKey || ""}`;
  try {
    await navigator.clipboard.writeText(text);
    copiedProfileId.value = profileId;
    setTimeout(() => (copiedProfileId.value = null), 2000);
  } catch {
    // fallback
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    copiedProfileId.value = profileId;
    setTimeout(() => (copiedProfileId.value = null), 2000);
  }
}

// ===== API 配置文件導出/導入 =====

// 導出所有 API 配置文件
function exportAPIProfiles() {
  const profiles = settingsStore.profiles;
  if (!profiles || profiles.length === 0) {
    alert("沒有可導出的配置文件");
    return;
  }

  // 移除 apiKey 中的敏感資訊，只保留前4後4字元
  const sanitizedProfiles = profiles.map((p) => {
    const key = p.api.apiKey || "";
    const maskedKey =
      key.length > 8
        ? key.slice(0, 4) + "****" + key.slice(-4)
        : key
          ? "****"
          : "";
    return {
      ...p,
      api: { ...p.api, apiKey: maskedKey },
      generation: { ...p.generation },
    };
  });

  const exportData = {
    type: "aguaphone-api-profiles",
    version: 1,
    exportedAt: new Date().toISOString(),
    profiles: sanitizedProfiles,
    includesApiKey: false,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `aguaphone-api-profiles-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// 導出所有 API 配置文件（含完整 API Key）
function exportAPIProfilesWithKeys() {
  const profiles = settingsStore.profiles;
  if (!profiles || profiles.length === 0) {
    alert("沒有可導出的配置文件");
    return;
  }

  if (
    !confirm(
      "⚠️ 此操作會導出完整的 API Key，請確保檔案安全保管。\n確定要繼續嗎？",
    )
  ) {
    return;
  }

  const exportData = {
    type: "aguaphone-api-profiles",
    version: 1,
    exportedAt: new Date().toISOString(),
    profiles: profiles.map((p) => ({
      ...p,
      api: { ...p.api },
      generation: { ...p.generation },
    })),
    includesApiKey: true,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `aguaphone-api-profiles-full-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// 導入 API 配置文件
const apiProfileFileInput = ref<HTMLInputElement | null>(null);

function triggerImportAPIProfiles() {
  apiProfileFileInput.value?.click();
}

async function handleImportAPIProfiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (
      data.type !== "aguaphone-api-profiles" ||
      !Array.isArray(data.profiles)
    ) {
      alert("無效的 API 配置文件格式");
      return;
    }

    const importedProfiles = data.profiles;
    let added = 0;
    let skipped = 0;

    for (const profile of importedProfiles) {
      // 檢查是否已存在相同端點的配置
      const existing = settingsStore.profiles.find(
        (p) =>
          p.api.endpoint === profile.api.endpoint && p.name === profile.name,
      );

      if (existing) {
        skipped++;
        continue;
      }

      // 如果 apiKey 被遮蔽了，清空它讓用戶自己填
      const apiKey =
        profile.api.apiKey && profile.api.apiKey.includes("****")
          ? ""
          : profile.api.apiKey || "";

      // 創建新配置文件
      const newProfile = settingsStore.createProfile(
        profile.name || `導入配置 ${added + 1}`,
      );
      // 更新配置內容
      Object.assign(newProfile.api, {
        ...profile.api,
        apiKey,
      });
      Object.assign(newProfile.generation, profile.generation || {});
    }

    added = importedProfiles.length - skipped;
    await settingsStore.saveSettings();

    const msg = [`成功導入 ${added} 個配置文件`];
    if (skipped > 0) msg.push(`跳過 ${skipped} 個重複配置`);
    if (!data.includesApiKey) msg.push("API Key 需要手動填入");
    alert(msg.join("\n"));
  } catch (e) {
    console.error("導入 API 配置失敗:", e);
    alert("導入失敗: " + (e instanceof Error ? e.message : String(e)));
  } finally {
    input.value = "";
  }
}

// 強制刷新：清除 SW 快取 + 重新載入
async function hardRefresh() {
  if (!confirm("將清除所有快取並重新載入頁面，確定嗎？")) return;
  try {
    // 清除所有 CacheStorage（但保留 SW 註冊，避免 PWA 無法啟動）
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
    // 讓 SW 更新而非註銷（避免 PWA 離線時打不開）
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.update()));
    }
    // 強制重新載入（加時間戳繞過快取）
    window.location.href =
      window.location.origin + window.location.pathname + "?t=" + Date.now();
  } catch (e) {
    console.error("[HardRefresh]", e);
    window.location.href =
      window.location.origin + window.location.pathname + "?t=" + Date.now();
  }
}

// 導出數據
async function exportData() {
  isExporting.value = true;
  try {
    await db.init();

    // 動態導入 fflate
    const { zip, strToU8 } = await import("fflate");

    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      characters: await db.getAll("characters"),
      lorebooks: await db.getAll("lorebooks"),
      chats: await (async () => {
        // 訊息已在 chat.messages 中，還原圖片引用即可
        const allChats = await db.getAll("chats");
        for (const chat of allChats as any[]) {
          if (chat.messages && chat.messages.length > 0) {
            chat.messages = await restoreImagesToMessages(chat.messages);
          }
        }
        return allChats;
      })(),
      settings: await db.get("appSettings", "main-settings"),
      userData: await db.get("appSettings", "user-data"),
      themes: await db.getAll("themes"),
      layouts: await db.getAll("layouts"),
      characterAffections: await (async () => {
        try {
          return await db.getAll("characterAffections");
        } catch {
          return [];
        }
      })(),
      chatAffinityStates: await (async () => {
        try {
          return await db.getAll("chatAffinityStates");
        } catch {
          return [];
        }
      })(),
      oldSettings: await (async () => {
        // settings store 沒有 keyPath，需要手動取得 key-value 對
        try {
          if (!db._instance) await db.init();
          if (!db._instance) return [];
          const tx = db._instance.transaction("settings", "readonly");
          const store = tx.objectStore("settings");
          const keys = await store.getAllKeys();
          const values = await store.getAll();
          return keys.map((key, i) => ({ key: String(key), value: values[i] }));
        } catch {
          return [];
        }
      })(),
      pendingCalls: await db.getAll("pendingCalls"),
      summaries: await db.getAll("summaries"),
      diaries: await db.getAll("diaries"),
      importantEvents: await db.getAll("importantEvents"),
      qzonePosts: await db.getAll("qzonePosts"),
      stickers: await db.getAll("stickers"),
      callHistory: await db.getAll("callHistory"),
      holidayRecords: await db.getAll("holidayRecords"),
      calendarEvents: await db.getAll("calendarEvents"),
      gameStates: await (async () => {
        // gameStates 沒有 keyPath，需要手動取得 key-value 對
        try {
          if (!db._instance) await db.init();
          if (!db._instance) return [];
          const tx = db._instance.transaction("gameStates", "readonly");
          const store = tx.objectStore("gameStates");
          const keys = await store.getAllKeys();
          const values = await store.getAll();
          return keys.map((key, i) => ({ key: String(key), value: values[i] }));
        } catch {
          return [];
        }
      })(),
      rendererRules: await db.getAll("rendererRules"),
      books: await db.getAll("books"),
      bookProgress: await db.getAll("bookProgress"),
      promptLibrary: await (async () => {
        // promptLibrary 沒有 keyPath，需要手動取得 key-value 對
        try {
          if (!db._instance) await db.init();
          if (!db._instance) return [];
          const tx = db._instance.transaction("promptLibrary", "readonly");
          const store = tx.objectStore("promptLibrary");
          const keys = await store.getAllKeys();
          const values = await store.getAll();
          return keys.map((key, i) => ({ key: String(key), value: values[i] }));
        } catch {
          return [];
        }
      })(),
      // audio-blobs 不備份（語音 Blob 體積過大，base64 後會膨脹 33%）
      // canvas layout（widget 佈局、app 圖標、日曆顏色等）存在獨立的 Aguaphone_V2 IDB
      canvasLayout: await (async () => {
        try {
          return await new Promise<any>((resolve) => {
            // 不指定版本號，讓瀏覽器用現有版本開啟
            const req = indexedDB.open("Aguaphone_V2");
            req.onsuccess = (e) => {
              const idb = (e.target as IDBOpenDBRequest).result;
              if (!idb.objectStoreNames.contains("canvas_layout")) {
                idb.close();
                resolve(null);
                return;
              }
              const tx = idb.transaction(["canvas_layout"], "readonly");
              const store = tx.objectStore("canvas_layout");
              const getReq = store.get("main_layout");
              getReq.onsuccess = () => {
                idb.close();
                resolve(getReq.result || null);
              };
              getReq.onerror = () => {
                idb.close();
                resolve(null);
              };
            };
            req.onerror = () => resolve(null);
          });
        } catch {
          return null;
        }
      })(),
    };

    // 提取所有 base64 媒體檔案並去重（含 oldSettings、canvasLayout 等）
    const { extractAllMediaFromBackupData } =
      await import("@/utils/backupMediaExtractor");
    const mediaResult = extractAllMediaFromBackupData(data);
    const mediaFiles = mediaResult.files;

    // 準備 ZIP 內容（用 setTimeout 讓 UI 先更新，避免卡死主線程）
    const dataJsonStr = await new Promise<string>((resolve) =>
      setTimeout(() => resolve(JSON.stringify(data, null, 2)), 0),
    );
    const dataJsonBytes = strToU8(dataJsonStr);

    // 診斷：計算各部分大小
    const formatSize = (bytes: number) => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    let totalMediaSize = 0;
    for (const [filename, content] of Object.entries(mediaFiles)) {
      totalMediaSize += content.length;
    }

    console.log("📦 匯出資料大小分析:");
    console.log(`  - data.json: ${formatSize(dataJsonBytes.length)}`);
    console.log(`  - 媒體檔案數: ${Object.keys(mediaFiles).length}`);
    console.log(`  - 媒體總大小: ${formatSize(totalMediaSize)}`);
    console.log(
      `  - 提取 base64 數: ${mediaResult.totalExtracted}（去重命中: ${mediaResult.dedupeHits}）`,
    );
    console.log(`  - 角色數: ${data.characters?.length || 0}`);
    console.log(`  - 聊天數: ${data.chats?.length || 0}`);
    console.log(
      `  - 總訊息數: ${data.chats?.reduce((sum: number, c: any) => sum + (c.messages?.length || 0), 0) || 0}`,
    );
    console.log(`  - 貼圖分類數: ${data.stickers?.length || 0}`);

    const zipFiles: Record<string, Uint8Array> = {
      "data.json": dataJsonBytes,
      "metadata.json": strToU8(
        JSON.stringify(
          {
            version: "1.0",
            format: "aguaphone-backup",
            exportedAt: data.exportedAt,
            counts: {
              characters: data.characters?.length || 0,
              lorebooks: data.lorebooks?.length || 0,
              chats: data.chats?.length || 0,
              summaries: data.summaries?.length || 0,
              diaries: data.diaries?.length || 0,
              callHistory: data.callHistory?.length || 0,
              holidayRecords: data.holidayRecords?.length || 0,
              calendarEvents: data.calendarEvents?.length || 0,
              gameStates: data.gameStates?.length || 0,
              themes: data.themes?.length || 0,
              layouts: data.layouts?.length || 0,
              characterAffections: data.characterAffections?.length || 0,
              chatAffinityStates: data.chatAffinityStates?.length || 0,
              pendingCalls: data.pendingCalls?.length || 0,
              rendererRules: data.rendererRules?.length || 0,
              books: data.books?.length || 0,
              bookProgress: data.bookProgress?.length || 0,
              canvasLayout: data.canvasLayout ? 1 : 0,
              userData: data.userData ? 1 : 0,
              media: Object.keys(mediaFiles).length,
            },
            sizes: {
              dataJson: formatSize(dataJsonBytes.length),
              media: formatSize(totalMediaSize),
            },
          },
          null,
          2,
        ),
      ),
      ...mediaFiles,
    };

    // 壓縮為 ZIP
    const zipBlob = await new Promise<Blob>((resolve, reject) => {
      zip(zipFiles, { level: 6 }, (err, data) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(new Blob([data], { type: "application/zip" }));
      });
    });

    const backupFilename = `aguaphone-backup-${new Date().toISOString().split("T")[0]}.zip`;

    // iOS Safari: 使用 Web Share API（<a download> 在 iOS 上不可靠）
    if (navigator.share && /iPad|iPhone|iPod/.test(navigator.userAgent)) {
      try {
        const file = new File([zipBlob], backupFilename, {
          type: "application/zip",
        });
        await navigator.share({ files: [file] });
      } catch (shareErr: any) {
        // 使用者取消分享不算錯誤
        if (shareErr?.name !== "AbortError") {
          console.warn("Web Share 失敗，嘗試 <a> 下載:", shareErr);
          // fallback 到 <a> 下載
          const url = URL.createObjectURL(zipBlob);
          const a = document.createElement("a");
          a.href = url;
          a.download = backupFilename;
          a.style.display = "none";
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 3000);
        }
      }
    } else {
      // 非 iOS：標準 <a> 下載
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = backupFilename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 3000);
    }
  } catch (e) {
    console.error("導出失敗:", e);
    alert("導出失敗: " + (e instanceof Error ? e.message : String(e)));
  } finally {
    isExporting.value = false;
  }
}

// 觸發導入
function triggerImport() {
  fileInput.value?.click();
}

// 從檔名推斷 MIME 類型
function getMimeTypeFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
  };
  return mimeMap[ext || ""] || "image/png";
}

// 將 Uint8Array 轉換為 DataURL
function uint8ArrayToDataUrl(data: Uint8Array, mimeType: string): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

/**
 * 遞迴掃描 obj[key] 中所有字串值，將 media/ 路徑還原為 base64 DataURL。
 * 與 backupMediaExtractor 的 scanAndReplaceBase64InValue 互為逆操作。
 */
function restoreMediaPathsInValue(
  obj: any,
  key: string | number,
  mediaFiles: Record<string, Uint8Array>,
): void {
  const val = obj[key];
  if (val === null || val === undefined) return;

  if (typeof val === "string") {
    if (val.startsWith("media/") && mediaFiles[val]) {
      const mimeType = getMimeTypeFromFilename(val);
      obj[key] = uint8ArrayToDataUrl(mediaFiles[val], mimeType);
    }
    return;
  }

  if (Array.isArray(val)) {
    for (let i = 0; i < val.length; i++) {
      restoreMediaPathsInValue(val, i, mediaFiles);
    }
    return;
  }

  if (typeof val === "object") {
    for (const k of Object.keys(val)) {
      restoreMediaPathsInValue(val, k, mediaFiles);
    }
  }
}

// 處理導入
async function handleFileImport(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  // 前置檔案類型校驗（accept="*/*" 時用戶可能選到非備份檔案）
  const fileName = file.name.toLowerCase();
  if (!fileName.endsWith(".zip") && !fileName.endsWith(".json")) {
    alert("請選擇 .zip 或 .json 格式的備份檔案");
    target.value = "";
    return;
  }

  isImporting.value = true;
  try {
    await db.init();

    let data: any;
    let mediaFiles: Record<string, Uint8Array> = {};

    // 檢查檔案類型
    if (file.name.endsWith(".zip")) {
      // ZIP 格式
      const { unzip, strFromU8 } = await import("fflate");
      const arrayBuffer = await file.arrayBuffer();
      const zipData = new Uint8Array(arrayBuffer);

      // 解壓縮
      const files = await new Promise<Record<string, Uint8Array>>(
        (resolve, reject) => {
          unzip(zipData, (err, data) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(data);
          });
        },
      );

      // 檢查必要檔案（相容 backup.json 和 data.json 兩種命名）
      const jsonFile = files["backup.json"] || files["data.json"];
      if (!jsonFile) {
        throw new Error("ZIP 中找不到 backup.json 或 data.json");
      }

      // 解析資料
      data = JSON.parse(strFromU8(jsonFile));

      // 收集媒體檔案
      for (const [filename, content] of Object.entries(files)) {
        if (filename.startsWith("media/")) {
          mediaFiles[filename] = content;
        }
      }
    } else {
      // JSON 格式
      const text = await file.text();
      data = JSON.parse(text);

      // 檢測是否為舊版備份格式（v1 版本，有 data.chats 結構）
      if (data.version === 1 && data.data && data.data.chats) {
        // 使用舊版備份恢復服務
        const legacyService = getLegacyBackupService();
        const result = await legacyService.restoreFromFile(file);

        if (result.success) {
          const stats = [
            `聊天: ${result.stats.chats}`,
            `角色: ${result.stats.characters}`,
            `世界書: ${result.stats.lorebooks}`,
            `總結: ${result.stats.summaries}`,
            `貼文: ${result.stats.posts}`,
            `貼圖分類: ${result.stats.stickers}`,
            `重要事件: ${result.stats.importantEvents}`,
          ].join("\n");

          let message = `舊版備份恢復成功！\n${stats}`;
          if (result.warnings.length > 0) {
            message += `\n\n警告:\n${result.warnings.slice(0, 5).join("\n")}`;
            if (result.warnings.length > 5) {
              message += `\n...還有 ${result.warnings.length - 5} 個警告`;
            }
          }
          alert(message + "\n\n即將重新整理頁面以套用變更...");

          // 刷新狀態後重新載入頁面
          await refreshStorageStatus();
          await charactersStore.loadCharacters();
          await lorebooksStore.loadLorebooks();
          await settingsStore.loadSettings();
          location.reload();
        } else {
          throw new Error(result.error || "舊版備份恢復失敗");
        }

        isImporting.value = false;
        target.value = "";
        return;
      }
    }

    if (!data.version || !data.exportedAt) {
      throw new Error("無效的備份文件格式");
    }

    // 當備份檔為 aguaphone-backup 開頭，主動清除本機舊資料
    // 清除前先備份 auth 狀態，還原後回寫，避免重新驗證
    if (
      file.name.startsWith("aguaphone-backup-") &&
      file.name.endsWith(".zip")
    ) {
      console.log("偵測到 aguaphone-backup，主動清除本機舊資料...");
      // 備份 auth 狀態
      const { AuthService } = await import("@/services/AuthService");
      const savedAuth = await AuthService.getAuthState().catch(() => null);
      await clearAllData();
      await db.init();
      // 還原 auth 狀態，避免清除後要求重新驗證
      if (
        savedAuth &&
        savedAuth.isAuthenticated &&
        savedAuth.discordUserId &&
        savedAuth.discordUsername
      ) {
        await AuthService.saveAuthState(
          savedAuth.discordUserId,
          savedAuth.discordUsername,
          savedAuth.discordDisplayName || savedAuth.discordUsername,
        ).catch(() => {});
      }
    }

    // 還原角色頭像
    if (data.characters && Array.isArray(data.characters)) {
      for (const char of data.characters) {
        if (
          char.avatar &&
          !char.avatar.startsWith("data:") &&
          mediaFiles[char.avatar]
        ) {
          const mimeType = getMimeTypeFromFilename(char.avatar);
          char.avatar = uint8ArrayToDataUrl(mediaFiles[char.avatar], mimeType);
        }
      }
    }

    // 還原聊天中的圖片
    if (data.chats && Array.isArray(data.chats)) {
      for (const chat of data.chats) {
        // 還原聊天桌布
        if (
          chat.appearance?.wallpaper?.type === "image" &&
          chat.appearance.wallpaper.value &&
          !chat.appearance.wallpaper.value.startsWith("data:") &&
          mediaFiles[chat.appearance.wallpaper.value]
        ) {
          const mimeType = getMimeTypeFromFilename(
            chat.appearance.wallpaper.value,
          );
          chat.appearance.wallpaper.value = uint8ArrayToDataUrl(
            mediaFiles[chat.appearance.wallpaper.value],
            mimeType,
          );
        }
        // 還原訊息圖片
        if (chat.messages && Array.isArray(chat.messages)) {
          for (const msg of chat.messages) {
            if (
              msg.imageUrl &&
              !msg.imageUrl.startsWith("data:") &&
              !msg.imageUrl.startsWith("http") &&
              mediaFiles[msg.imageUrl]
            ) {
              const mimeType = getMimeTypeFromFilename(msg.imageUrl);
              msg.imageUrl = uint8ArrayToDataUrl(
                mediaFiles[msg.imageUrl],
                mimeType,
              );
            }
            if (
              msg.imageData &&
              !msg.imageData.startsWith("data:") &&
              !msg.imageData.startsWith("http") &&
              mediaFiles[msg.imageData]
            ) {
              const mimeType = getMimeTypeFromFilename(msg.imageData);
              msg.imageData = uint8ArrayToDataUrl(
                mediaFiles[msg.imageData],
                mimeType,
              );
            }
          }
        }
      }
    }

    // 導入角色
    if (data.characters && Array.isArray(data.characters)) {
      for (const char of data.characters) {
        await db.put("characters", char);
      }
    }

    // 導入世界書
    if (data.lorebooks && Array.isArray(data.lorebooks)) {
      for (const book of data.lorebooks) {
        await db.put("lorebooks", book);
      }
    }

    // 導入聊天（圖片分離儲存）
    if (data.chats && Array.isArray(data.chats)) {
      for (const chat of data.chats) {
        const messagesToSave = chat.messages || [];
        chat.lastMessagePreview =
          messagesToSave[messagesToSave.length - 1]?.content?.slice(0, 100) ||
          "";
        chat.messageCount = messagesToSave.length;
        // 圖片分離：將 base64 圖片提取到 imageCache
        if (messagesToSave.length > 0) {
          chat.messages = await extractImagesFromMessages(messagesToSave);
        }
        await db.put("chats", chat);
      }
    }

    // 導入設定
    if (data.settings) {
      // 還原自訂鈴聲音檔
      const s = data.settings as any;
      const ringtoneRef = s?.incomingCallRingtone?.customAudioDataUrl;
      if (
        typeof ringtoneRef === "string" &&
        ringtoneRef.startsWith("media/") &&
        mediaFiles[ringtoneRef]
      ) {
        const ext = ringtoneRef.split(".").pop()?.toLowerCase() || "bin";
        const mimeMap: Record<string, string> = {
          mp3: "audio/mpeg",
          wav: "audio/wav",
          ogg: "audio/ogg",
          webm: "audio/webm",
          m4a: "audio/mp4",
          aac: "audio/aac",
        };
        const mimeType = mimeMap[ext] || "audio/mpeg";
        s.incomingCallRingtone.customAudioDataUrl = uint8ArrayToDataUrl(
          mediaFiles[ringtoneRef],
          mimeType,
        );
      }
      await db.put("appSettings", data.settings);
    }

    // 導入使用者角色資料
    if (data.userData) {
      // 還原使用者角色頭像
      if (data.userData.personas && Array.isArray(data.userData.personas)) {
        for (const persona of data.userData.personas) {
          if (
            persona.avatar &&
            !persona.avatar.startsWith("data:") &&
            mediaFiles[persona.avatar]
          ) {
            const mimeType = getMimeTypeFromFilename(persona.avatar);
            persona.avatar = uint8ArrayToDataUrl(
              mediaFiles[persona.avatar],
              mimeType,
            );
          }
        }
      }
      await db.put("appSettings", data.userData);
    }

    // 導入主題（還原桌布圖片）
    if (data.themes && Array.isArray(data.themes)) {
      for (const theme of data.themes) {
        if (
          theme.wallpaperStyle?.type === "image" &&
          theme.wallpaperStyle.value &&
          !theme.wallpaperStyle.value.startsWith("data:") &&
          mediaFiles[theme.wallpaperStyle.value]
        ) {
          const mimeType = getMimeTypeFromFilename(theme.wallpaperStyle.value);
          theme.wallpaperStyle.value = uint8ArrayToDataUrl(
            mediaFiles[theme.wallpaperStyle.value],
            mimeType,
          );
        }
        await db.put("themes", theme);
      }
    }

    // 導入佈局
    if (data.layouts && Array.isArray(data.layouts)) {
      for (const layout of data.layouts) {
        await db.put("layouts", layout);
      }
    }

    // 導入角色好感度配置
    if (data.characterAffections && Array.isArray(data.characterAffections)) {
      for (const affection of data.characterAffections) {
        await db.put("characterAffections", affection);
      }
    }

    // 導入聊天好感度狀態
    if (data.chatAffinityStates && Array.isArray(data.chatAffinityStates)) {
      for (const state of data.chatAffinityStates) {
        await db.put("chatAffinityStates", state);
      }
    }

    // 導入舊版 settings（key-value 格式，還原媒體路徑為 base64）
    if (data.oldSettings && Array.isArray(data.oldSettings)) {
      for (const item of data.oldSettings) {
        if (item.key && item.value !== undefined) {
          restoreMediaPathsInValue(item, "value", mediaFiles);
          await db.put("settings", item.value, item.key);
        }
      }
    }

    // 導入使用者自訂提示詞庫
    if (data.promptLibrary && Array.isArray(data.promptLibrary)) {
      for (const item of data.promptLibrary) {
        if (item.key && item.value !== undefined) {
          await db.put("promptLibrary", item.value, item.key);
        }
      }
    }

    // 導入待處理來電
    if (data.pendingCalls && Array.isArray(data.pendingCalls)) {
      for (const call of data.pendingCalls) {
        await db.put("pendingCalls", call);
      }
    }

    // 導入總結
    if (data.summaries && Array.isArray(data.summaries)) {
      for (const summary of data.summaries) {
        await db.put("summaries", summary);
      }
    }

    // 導入日記
    if (data.diaries && Array.isArray(data.diaries)) {
      for (const diary of data.diaries) {
        await db.put("diaries", diary);
      }
    }

    // 導入重要事件
    if (data.importantEvents && Array.isArray(data.importantEvents)) {
      for (const event of data.importantEvents) {
        await db.put("importantEvents", event);
      }
    }

    // 導入噗浪貼文（還原媒體路徑為 base64）
    if (data.qzonePosts && Array.isArray(data.qzonePosts)) {
      for (const post of data.qzonePosts) {
        // 還原作者頭像
        if (
          post.avatar &&
          !post.avatar.startsWith("data:") &&
          mediaFiles[post.avatar]
        ) {
          post.avatar = uint8ArrayToDataUrl(
            mediaFiles[post.avatar],
            getMimeTypeFromFilename(post.avatar),
          );
        }
        // 還原貼文圖片
        if (Array.isArray(post.images)) {
          for (let j = 0; j < post.images.length; j++) {
            const img = post.images[j];
            if (
              typeof img === "string" &&
              !img.startsWith("data:") &&
              mediaFiles[img]
            ) {
              post.images[j] = uint8ArrayToDataUrl(
                mediaFiles[img],
                getMimeTypeFromFilename(img),
              );
            }
          }
        }
        // 還原留言頭像
        if (Array.isArray(post.comments)) {
          for (const comment of post.comments) {
            if (
              comment.avatar &&
              !comment.avatar.startsWith("data:") &&
              mediaFiles[comment.avatar]
            ) {
              comment.avatar = uint8ArrayToDataUrl(
                mediaFiles[comment.avatar],
                getMimeTypeFromFilename(comment.avatar),
              );
            }
          }
        }
        await db.put("qzonePosts", post);
      }
    }

    // 導入貼圖（還原媒體路徑為 base64）
    if (data.stickers && Array.isArray(data.stickers)) {
      for (const sticker of data.stickers) {
        if (Array.isArray(sticker.stickers)) {
          for (const s of sticker.stickers) {
            if (
              typeof s.url === "string" &&
              !s.url.startsWith("data:") &&
              mediaFiles[s.url]
            ) {
              s.url = uint8ArrayToDataUrl(
                mediaFiles[s.url],
                getMimeTypeFromFilename(s.url),
              );
            }
          }
        }
        await db.put("stickers", sticker);
      }
    }

    // 導入通話記錄
    if (data.callHistory && Array.isArray(data.callHistory)) {
      for (const entry of data.callHistory) {
        await db.put("callHistory", entry);
      }
    }

    // 導入節日觸發記錄
    if (data.holidayRecords && Array.isArray(data.holidayRecords)) {
      for (const record of data.holidayRecords) {
        await db.put("holidayRecords", record);
      }
    }

    // 導入行事曆事件
    if (data.calendarEvents && Array.isArray(data.calendarEvents)) {
      for (const event of data.calendarEvents) {
        await db.put("calendarEvents", event);
      }
    }

    // 導入遊戲狀態（gameStates 沒有 keyPath，需要用 key 寫入，還原媒體路徑）
    if (data.gameStates && Array.isArray(data.gameStates)) {
      for (const item of data.gameStates) {
        if (item.key && item.value) {
          restoreMediaPathsInValue(item, "value", mediaFiles);
          await db.put("gameStates", item.value, item.key);
        }
      }
    }

    // 導入自定義渲染規則
    if (data.rendererRules && Array.isArray(data.rendererRules)) {
      for (const rule of data.rendererRules) {
        await db.put("rendererRules", rule);
      }
    }

    // 導入書籍
    if (data.books && Array.isArray(data.books)) {
      for (const book of data.books) {
        await db.put("books", book);
      }
    }

    // 導入閱讀進度
    if (data.bookProgress && Array.isArray(data.bookProgress)) {
      for (const progress of data.bookProgress) {
        await db.put("bookProgress", progress);
      }
    }

    // 導入 canvas layout（widget 佈局、app 圖標、日曆顏色等）到 Aguaphone_V2 IDB
    if (data.canvasLayout) {
      // 還原媒體路徑為 base64
      restoreMediaPathsInValue(data, "canvasLayout", mediaFiles);
      await new Promise<void>((resolve) => {
        const req = indexedDB.open("Aguaphone_V2", 1);
        req.onupgradeneeded = (e) => {
          const idb = (e.target as IDBOpenDBRequest).result;
          if (!idb.objectStoreNames.contains("canvas_layout")) {
            idb.createObjectStore("canvas_layout", { keyPath: "id" });
          }
        };
        req.onsuccess = (e) => {
          const idb = (e.target as IDBOpenDBRequest).result;
          const tx = idb.transaction(["canvas_layout"], "readwrite");
          const store = tx.objectStore("canvas_layout");
          store.put(data.canvasLayout);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        };
        req.onerror = () => resolve();
      });
    }

    const stats = [
      `角色: ${data.characters?.length || 0}`,
      `世界書: ${data.lorebooks?.length || 0}`,
      `聊天: ${data.chats?.length || 0}`,
      `總結: ${data.summaries?.length || 0}`,
      `日記: ${data.diaries?.length || 0}`,
      `通話記錄: ${data.callHistory?.length || 0}`,
      `遊戲狀態: ${data.gameStates?.length || 0}`,
      `主題: ${data.themes?.length || 0}`,
      `佈局: ${data.layouts?.length || 0}`,
      `好感度配置: ${data.characterAffections?.length || 0}`,
      `好感度狀態: ${data.chatAffinityStates?.length || 0}`,
      `使用者角色: ${data.userData?.personas?.length || 0}`,
      `渲染規則: ${data.rendererRules?.length || 0}`,
      `書籍: ${data.books?.length || 0}`,
      `閱讀進度: ${data.bookProgress?.length || 0}`,
      `自訂提示詞: ${data.promptLibrary?.length || 0}`,
      `媒體: ${Object.keys(mediaFiles).length}`,
    ].join("\n");

    alert(`導入成功！\n${stats}\n\n即將重新整理頁面以套用變更...`);

    // 刷新存儲狀態後重新載入頁面
    await refreshStorageStatus();
    await charactersStore.loadCharacters();
    await lorebooksStore.loadLorebooks();
    await settingsStore.loadSettings();
    await userStore.loadUserData();
    await themeStore.loadFromStorage();
    location.reload();
  } catch (e) {
    console.error("導入失敗:", e);
    alert("導入失敗: " + (e instanceof Error ? e.message : String(e)));
  } finally {
    isImporting.value = false;
    target.value = "";
  }
}

// 清除所有數據
async function deleteAllData() {
  if (!confirm("確定要刪除所有本機數據嗎？\n\n此操作無法撤銷！")) return;
  if (!confirm("再次確認：所有角色、世界書、聊天記錄都會被永久刪除！")) return;

  try {
    await clearAllData();
    alert("所有數據已刪除");
    location.reload();
  } catch (e) {
    console.error("刪除失敗:", e);
    alert("刪除失敗: " + (e instanceof Error ? e.message : String(e)));
  }
}

// 重置設定
function resetSettings() {
  if (!confirm("確定要重置所有設定為默認值嗎？")) return;
  settingsStore.resetToDefaults();
}

// 返回
function handleBack() {
  emit("back");
}

// ===== MiniMax TTS 測試與音色列表 =====
const minimaxTesting = ref(false);
const minimaxTestResult = ref<boolean | null>(null);
const minimaxFetchingVoices = ref(false);
const minimaxVoiceList = ref<
  Array<{ voice_id: string; name: string; voice_type?: string }>
>([]);
const minimaxVoiceError = ref("");

async function testMinimaxConnection() {
  minimaxTesting.value = true;
  minimaxTestResult.value = null;
  try {
    const { testConnection } = await import("@/api/MiniMaxTTSApi");
    minimaxTestResult.value = await testConnection(settingsStore.minimaxTTS);
  } catch {
    minimaxTestResult.value = false;
  } finally {
    minimaxTesting.value = false;
    // 3 秒後重置狀態
    setTimeout(() => {
      minimaxTestResult.value = null;
    }, 3000);
  }
}

async function fetchMinimaxVoices() {
  minimaxFetchingVoices.value = true;
  minimaxVoiceError.value = "";
  try {
    const { fetchVoiceList } = await import("@/api/MiniMaxTTSApi");
    const result = await fetchVoiceList(settingsStore.minimaxTTS);
    if (result.success) {
      minimaxVoiceList.value = result.voices;
    } else {
      minimaxVoiceError.value = result.error || "獲取失敗";
      minimaxVoiceList.value = [];
    }
  } catch (e) {
    minimaxVoiceError.value = e instanceof Error ? e.message : "未知錯誤";
  } finally {
    minimaxFetchingVoices.value = false;
  }
}

function selectMinimaxVoice(voiceId: string) {
  settingsStore.minimaxTTS.voiceId = voiceId;
  saveSettings();
}

// ===== MiniMax TTS 分頁 =====
const audioPage = ref<"recording" | "minimax">("recording");
const minimaxTab = ref<"basic" | "timberMix" | "voiceClone">("basic");

function addTimberWeight() {
  settingsStore.minimaxTTS.timberWeights.push({ voiceId: "", weight: 50 });
  saveSettings();
}

function removeTimberWeight(index: number) {
  settingsStore.minimaxTTS.timberWeights.splice(index, 1);
  saveSettings();
}

/** 將音色列表中的音色加入混合 */
function addVoiceToTimberMix(voiceId: string) {
  const existing = settingsStore.minimaxTTS.timberWeights.find(
    (tw) => tw.voiceId === voiceId,
  );
  if (existing) return;
  settingsStore.minimaxTTS.timberWeights.push({ voiceId, weight: 50 });
  saveSettings();
}

// ===== 音色複刻 =====
const voiceCloneFile = ref<File | null>(null);
const voiceCloneName = ref("");
const voiceCloneText = ref("");
const voiceCloning = ref(false);
const voiceCloneResult = ref<{
  success: boolean;
  voiceId?: string;
  error?: string;
} | null>(null);

function onVoiceCloneFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  voiceCloneFile.value = input.files?.[0] ?? null;
}

async function startVoiceClone() {
  if (!voiceCloneFile.value || !voiceCloneName.value.trim()) return;
  voiceCloning.value = true;
  voiceCloneResult.value = null;
  try {
    const { cloneVoice } = await import("@/api/MiniMaxTTSApi");
    const result = await cloneVoice(
      settingsStore.minimaxTTS,
      voiceCloneFile.value,
      voiceCloneName.value.trim(),
      { text: voiceCloneText.value.trim() || undefined },
    );
    voiceCloneResult.value = result;
    if (result.success && result.voiceId) {
      // 複刻成功，自動填入預設音色
      settingsStore.minimaxTTS.voiceId = result.voiceId;
      saveSettings();
      // 重新拉取音色列表以顯示新音色
      fetchMinimaxVoices();
    }
  } catch (e) {
    voiceCloneResult.value = {
      success: false,
      error: e instanceof Error ? e.message : "未知錯誤",
    };
  } finally {
    voiceCloning.value = false;
  }
}

/** 使用複刻的音色 */
function useClonedVoice(voiceId: string) {
  settingsStore.minimaxTTS.voiceId = voiceId;
  saveSettings();
  minimaxTab.value = "basic";
}
</script>

<template>
  <div class="screen-container settings-screen">
    <!-- 載入中 -->
    <div v-if="settingsStore.isLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <span>載入中...</span>
    </div>

    <!-- 標題欄 -->
    <header class="soft-header gradient">
      <button class="header-back" @click="handleBack">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
          />
        </svg>
      </button>

      <h1 class="header-title">設定</h1>

      <div class="header-actions">
        <button
          class="header-btn save-btn"
          @click="handleSaveButton"
          :disabled="isSaving"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
        </button>
      </div>
    </header>

    <!-- 分頁標籤 -->
    <nav class="tabs">
      <button
        class="tab"
        :class="{ active: currentTab === 'api' }"
        @click="currentTab = 'api'"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"
          />
        </svg>
        API
      </button>
      <button
        class="tab"
        :class="{ active: currentTab === 'auxiliary' }"
        @click="currentTab = 'auxiliary'"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"
          />
        </svg>
        備用
      </button>
      <button
        class="tab"
        :class="{ active: currentTab === 'audio' }"
        @click="currentTab = 'audio'"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"
          />
        </svg>
        語音
      </button>
      <button
        class="tab"
        :class="{ active: currentTab === 'storage' }"
        @click="currentTab = 'storage'"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M2 20h20v-4H2v4zm2-3h2v2H4v-2zM2 4v4h20V4H2zm4 3H4V5h2v2zm-4 7h20v-4H2v4zm2-3h2v2H4v-2z"
          />
        </svg>
        存儲
      </button>
      <button
        class="tab"
        :class="{ active: currentTab === 'data' }"
        @click="currentTab = 'data'"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
        </svg>
        備份
      </button>
    </nav>

    <!-- 內容區域 -->
    <main class="soft-content">
      <!-- API 設定 -->
      <div v-if="currentTab === 'api'" class="settings-section">
        <!-- 提示詞管理入口 -->
        <button class="feature-card" @click="emit('open-prompt-manager')">
          <div class="feature-icon">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"
              />
            </svg>
          </div>
          <div class="feature-content">
            <span class="feature-title">提示詞管理</span>
            <span class="feature-desc"
              >自定義提示詞順序、啟用狀態和角色配置</span
            >
          </div>
          <svg class="feature-arrow" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
          </svg>
        </button>

        <!-- 正則腳本入口 -->
        <button class="feature-card" @click="emit('open-regex-scripts')">
          <div class="feature-icon" style="background: #7dd3a8">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M9.5 6.5v3h-3v-3h3M11 5H5v6h6V5zm-1.5 9.5v3h-3v-3h3M11 13H5v6h6v-6zm6.5-6.5v3h-3v-3h3M19 5h-6v6h6V5zm-6 8h1.5v1.5H13V13zm1.5 1.5H16V16h-1.5v-1.5zM16 13h1.5v1.5H16V13zm-3 3h1.5v1.5H13V16zm1.5 1.5H16V19h-1.5v-1.5zM16 16h1.5v1.5H16V16zm1.5-1.5H19V16h-1.5v-1.5zm0 3H19V19h-1.5v-1.5zM19 13h-1.5v1.5H19V13z"
              />
            </svg>
          </div>
          <div class="feature-content">
            <span class="feature-title">正則腳本</span>
            <span class="feature-desc"
              >全域正則替換腳本，相容酒館 regex JSON 格式</span
            >
          </div>
          <svg class="feature-arrow" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
          </svg>
        </button>

        <!-- 配置文件列表 -->
        <div class="profiles-section">
          <div class="profiles-header">
            <span class="profiles-title">API 配置文件</span>
            <button class="add-profile-btn" @click="showProfileModal = true">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
              </svg>
              新建
            </button>
          </div>

          <div
            v-if="settingsStore.profiles && settingsStore.profiles.length > 0"
            class="profiles-list"
          >
            <div
              v-for="profile in settingsStore.profiles"
              :key="profile.id"
              class="profile-item"
              :class="{ active: settingsStore.currentProfileId === profile.id }"
              @click="handleSwitchProfile(profile.id)"
            >
              <div class="profile-info">
                <template v-if="editingProfileId === profile.id">
                  <input
                    v-model="editingProfileName"
                    type="text"
                    class="profile-rename-input"
                    @click.stop
                    @keyup.enter="confirmRenameProfile"
                    @blur="confirmRenameProfile"
                  />
                </template>
                <template v-else>
                  <span class="profile-name">{{ profile.name }}</span>
                  <span class="profile-model">{{
                    profile.api.model || "未設置"
                  }}</span>
                </template>
              </div>
              <div class="profile-actions">
                <button
                  class="profile-action-btn rename"
                  title="重命名"
                  @click.stop="startRenameProfile(profile.id)"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                    />
                  </svg>
                </button>
                <button
                  class="profile-action-btn"
                  :title="
                    copiedProfileId === profile.id
                      ? '已複製！'
                      : '複製 API 端點和密鑰'
                  "
                  @click.stop="copyProfileCredentials(profile.id)"
                >
                  <svg
                    v-if="copiedProfileId !== profile.id"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path
                      d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
                    />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                    />
                  </svg>
                </button>
                <button
                  class="profile-action-btn delete"
                  title="刪除"
                  @click.stop="confirmDeleteProfile(profile.id)"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div v-else class="profiles-empty">
            <p>尚無配置文件，點擊「新建」創建第一個</p>
          </div>
        </div>

        <!-- 分隔線 -->
        <div class="section-divider"></div>

        <!-- 提供者選擇 -->
        <div class="setting-group">
          <label class="setting-label">API 提供者</label>
          <div class="provider-grid">
            <button
              v-for="provider in providers"
              :key="provider.id"
              class="provider-btn"
              :class="{ active: settingsStore.api.provider === provider.id }"
              @click="selectProvider(provider.id)"
            >
              <svg
                class="provider-icon"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path :d="provider.icon" />
              </svg>
              {{ provider.name }}
            </button>
          </div>
        </div>

        <!-- API 端點 -->
        <div class="setting-group">
          <label class="setting-label">API 端點</label>
          <input
            v-model="settingsStore.api.endpoint"
            type="url"
            class="soft-input"
            placeholder="https://api.openai.com/v1"
          />
          <p class="setting-hint">大多數 API 需要以 /v1 結尾</p>
        </div>

        <!-- API 密鑰 -->
        <div class="setting-group">
          <label class="setting-label">API 密鑰</label>
          <div class="api-key-input">
            <input
              v-model="settingsStore.api.apiKey"
              type="text"
              class="soft-input api-key-field"
              :class="{ masked: !showApiKey }"
              placeholder="sk-..."
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
            />
            <button class="toggle-visibility" @click="showApiKey = !showApiKey">
              <svg v-if="showApiKey" viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
                />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"
                />
              </svg>
            </button>
          </div>
        </div>

        <!-- 直連模式 -->
        <div class="setting-group">
          <label class="toggle-item">
            <span class="toggle-label">瀏覽器直連</span>
            <input
              type="checkbox"
              v-model="settingsStore.api.directConnect"
              class="toggle-input"
            />
            <span class="toggle-switch"></span>
          </label>
          <p class="setting-hint">
            開啟後請求直接從瀏覽器發出，不經過伺服器代理。API
            金鑰不會經過伺服器，但部分站點可能因 CORS 限制而無法使用。
          </p>
        </div>

        <!-- 模型選擇 -->
        <div class="setting-group">
          <div class="setting-label-row">
            <label class="setting-label">模型</label>
            <button
              class="fetch-btn"
              :disabled="
                isFetchingModels ||
                !settingsStore.api.apiKey ||
                !settingsStore.api.endpoint
              "
              @click="fetchModels"
            >
              <span v-if="isFetchingModels" class="spinner-sm"></span>
              <svg v-else viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
                />
              </svg>
              {{ isFetchingModels ? "拉取中..." : "拉取模型" }}
            </button>
          </div>

          <!-- 下拉選單 -->
          <div class="model-select-group">
            <select
              v-model="settingsStore.api.model"
              class="soft-select"
              :class="{ loading: isFetchingModels }"
            >
              <option value="" disabled>
                {{ isFetchingModels ? "拉取模型中..." : "選擇模型..." }}
              </option>
              <option
                v-for="model in availableModels"
                :key="model"
                :value="model"
              >
                {{ model }}
              </option>
              <option value="__custom__">✏️ 手動輸入...</option>
            </select>
            <span v-if="isFetchingModels" class="select-spinner"></span>
          </div>

          <!-- 手動輸入框（當選擇自定義時顯示） -->
          <div
            v-if="settingsStore.api.model === '__custom__'"
            class="custom-model-input"
          >
            <input
              v-model="customModelName"
              type="text"
              class="soft-input"
              placeholder="輸入模型名稱，例如: gpt-4o"
              @blur="applyCustomModel"
              @keyup.enter="applyCustomModel"
            />
            <p class="setting-hint">輸入完成後按 Enter 或點擊其他地方確認</p>
          </div>

          <!-- 狀態提示 -->
          <div v-if="modelFetchError" class="error-hint">
            {{ modelFetchError }}
          </div>
          <div v-else-if="fetchedModels.length > 0" class="success-hint">
            ✓ 已從 API 拉取 {{ fetchedModels.length }} 個模型
          </div>
          <div
            v-else-if="
              settingsStore.api.model &&
              settingsStore.api.model !== '__custom__'
            "
            class="info-hint-inline"
          >
            當前模型: {{ settingsStore.api.model }}
          </div>
        </div>

        <!-- 測試連接 -->
        <div class="setting-group">
          <button
            class="test-btn"
            :disabled="isTestingConnection"
            @click="testConnection"
          >
            <span v-if="isTestingConnection" class="spinner"></span>
            <svg v-else viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
              />
            </svg>
            {{ isTestingConnection ? "測試中..." : "測試連接" }}
          </button>

          <div
            v-if="connectionStatus !== 'none'"
            class="connection-result"
            :class="connectionStatus"
          >
            <svg
              v-if="connectionStatus === 'success'"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
              />
            </svg>
            <span>{{ connectionMessage }}</span>
          </div>
        </div>

        <!-- 分隔線 -->
        <div class="section-divider"></div>

        <!-- 生成參數 -->
        <h3 class="section-title">生成參數</h3>

        <div class="setting-group">
          <label class="setting-label">
            溫度 (Temperature)
            <span class="value-badge">{{
              settingsStore.generation.temperature
            }}</span>
          </label>
          <input
            v-model.number="settingsStore.generation.temperature"
            type="range"
            min="0"
            max="2"
            step="0.1"
            class="soft-slider"
          />
          <div class="range-labels">
            <span>精確</span>
            <span>平衡</span>
            <span>創意</span>
          </div>
        </div>

        <div class="setting-group">
          <label class="setting-label">
            最大回覆長度 (Max Tokens)
            <span class="value-badge">{{
              settingsStore.generation.maxTokens
            }}</span>
          </label>
          <input
            v-model.number="settingsStore.generation.maxTokens"
            type="range"
            min="256"
            max="32768"
            step="256"
            class="soft-slider"
          />
          <div class="range-labels">
            <span>256</span>
            <span>16384</span>
            <span>32768</span>
          </div>
        </div>

        <div class="setting-group">
          <label class="setting-label">
            Top P
            <span class="value-badge">{{ settingsStore.generation.topP }}</span>
          </label>
          <input
            v-model.number="settingsStore.generation.topP"
            type="range"
            min="0"
            max="1"
            step="0.05"
            class="soft-slider"
          />
        </div>

        <label class="toggle-item">
          <span class="toggle-label">串流輸出 (Streaming)</span>
          <input
            type="checkbox"
            v-model="settingsStore.generation.streamingEnabled"
            class="toggle-input"
          />
          <span class="toggle-switch"></span>
        </label>
        <p class="setting-hint">開啟後逐字輸出，關閉後一次性返回完整內容</p>

        <label
          class="toggle-item"
          v-if="settingsStore.generation.streamingEnabled"
        >
          <span class="toggle-label">流式輸出窗口</span>
          <input
            type="checkbox"
            v-model="settingsStore.generation.useStreamingWindow"
            class="toggle-input"
          />
          <span class="toggle-switch"></span>
        </label>
        <p
          class="setting-hint"
          v-if="settingsStore.generation.streamingEnabled"
        >
          開啟後在獨立浮動窗口顯示 AI 回覆，關閉後直接在訊息氣泡中顯示
        </p>
      </div>

      <!-- 備用 API 設定 -->
      <AuxiliaryApiPanel v-if="currentTab === 'auxiliary'" />

      <!-- 語音訊息設定 -->
      <div v-if="currentTab === 'audio'" class="settings-section">
        <!-- ===== 頂層橫向頁面切換：錄音訊息 / MiniMax TTS ===== -->
        <div
          style="
            display: flex;
            gap: 0;
            margin: 0 0 16px;
            background: rgba(0, 0, 0, 0.04);
            border-radius: 10px;
            padding: 3px;
          "
        >
          <button
            style="
              flex: 1;
              padding: 8px 0;
              font-size: 13px;
              border: none;
              cursor: pointer;
              transition: all 0.25s;
              border-radius: 8px;
            "
            :style="{
              background: audioPage === 'recording' ? 'white' : 'transparent',
              color:
                audioPage === 'recording' ? 'var(--primary, #5b7a5e)' : '#999',
              fontWeight: audioPage === 'recording' ? '600' : '400',
              boxShadow:
                audioPage === 'recording'
                  ? '0 1px 4px rgba(0,0,0,0.08)'
                  : 'none',
            }"
            @click="audioPage = 'recording'"
          >
            🎤 錄音訊息
          </button>
          <button
            style="
              flex: 1;
              padding: 8px 0;
              font-size: 13px;
              border: none;
              cursor: pointer;
              transition: all 0.25s;
              border-radius: 8px;
            "
            :style="{
              background: audioPage === 'minimax' ? 'white' : 'transparent',
              color:
                audioPage === 'minimax' ? 'var(--primary, #5b7a5e)' : '#999',
              fontWeight: audioPage === 'minimax' ? '600' : '400',
              boxShadow:
                audioPage === 'minimax' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }"
            @click="audioPage = 'minimax'"
          >
            🔊 MiniMax TTS
          </button>
        </div>

        <!-- ===== 錄音訊息頁面 ===== -->
        <template v-if="audioPage === 'recording'">
          <h3 class="section-title">語音訊息</h3>

          <!-- 錄音品質 -->
          <div class="setting-group">
            <label class="setting-label">錄音品質</label>
            <select
              v-model="settingsStore.audio.quality"
              class="soft-select"
              @change="saveSettings"
            >
              <option value="low">低 (32kbps)</option>
              <option value="medium">中 (64kbps)</option>
              <option value="high">高 (128kbps)</option>
            </select>
          </div>

          <!-- 最大錄音時長 -->
          <div class="setting-group">
            <label class="setting-label">最大錄音時長</label>
            <select
              v-model.number="settingsStore.audio.maxDuration"
              class="soft-select"
              @change="saveSettings"
            >
              <option :value="30">30 秒</option>
              <option :value="60">60 秒</option>
              <option :value="120">2 分鐘</option>
              <option :value="300">5 分鐘</option>
            </select>
          </div>

          <!-- STT 開關 -->
          <label class="toggle-item">
            <div class="toggle-content">
              <span class="toggle-label">語音轉文字 (STT)</span>
              <span class="toggle-desc">錄音後自動將語音轉為文字</span>
            </div>
            <input
              type="checkbox"
              v-model="settingsStore.audio.sttEnabled"
              class="toggle-input"
              @change="saveSettings"
            />
            <span class="toggle-switch"></span>
          </label>

          <!-- 音頻傳輸格式 -->
          <div class="setting-group">
            <label class="setting-label">音頻傳輸格式</label>
            <select
              v-model="settingsStore.audio.transmissionFormat"
              class="soft-select"
              @change="saveSettings"
            >
              <option value="image_url">
                image_url 兼容模式（推薦，適用 Gemini / OpenRouter 等）
              </option>
              <option value="input_audio">
                input_audio 原生模式（僅 OpenAI GPT-4o-audio）
              </option>
            </select>
          </div>
        </template>

        <!-- ===== MiniMax TTS 頁面 ===== -->
        <template v-if="audioPage === 'minimax'">
          <h3 class="section-title">MiniMax 語音合成 (TTS)</h3>
          <p
            class="section-desc"
            style="font-size: 12px; color: #888; margin-bottom: 12px"
          >
            設定 MiniMax TTS API 連接參數。啟用開關在各聊天的設定選單中（AI
            繪圖下方）。
          </p>

          <!-- API Key（始終顯示） -->
          <div class="setting-group">
            <label class="setting-label">MiniMax API Key</label>
            <input
              type="password"
              v-model="settingsStore.minimaxTTS.apiKey"
              class="soft-input"
              placeholder="你的 MiniMax API Key"
              autocomplete="off"
              @change="saveSettings"
            />
          </div>

          <!-- 測試連線 + 獲取音色列表（始終顯示） -->
          <div class="setting-group" style="display: flex; gap: 8px">
            <button
              class="soft-btn"
              :disabled="minimaxTesting || !settingsStore.minimaxTTS.apiKey"
              @click="testMinimaxConnection"
            >
              {{
                minimaxTesting
                  ? "測試中…"
                  : minimaxTestResult === true
                    ? "✓ 連線成功"
                    : minimaxTestResult === false
                      ? "✗ 連線失敗"
                      : "測試連線"
              }}
            </button>
            <button
              class="soft-btn"
              :disabled="
                minimaxFetchingVoices || !settingsStore.minimaxTTS.apiKey
              "
              @click="fetchMinimaxVoices"
            >
              {{ minimaxFetchingVoices ? "載入中…" : "獲取音色列表" }}
            </button>
          </div>

          <!-- 分頁切換 -->
          <div
            style="
              display: flex;
              gap: 0;
              margin: 16px 0 12px;
              border-bottom: 1px solid rgba(0, 0, 0, 0.08);
            "
          >
            <button
              style="
                flex: 1;
                padding: 8px 0;
                font-size: 13px;
                border: none;
                background: none;
                cursor: pointer;
                transition: all 0.2s;
              "
              :style="{
                color:
                  minimaxTab === 'basic' ? 'var(--primary, #5b7a5e)' : '#999',
                borderBottom:
                  minimaxTab === 'basic'
                    ? '2px solid var(--primary, #5b7a5e)'
                    : '2px solid transparent',
                fontWeight: minimaxTab === 'basic' ? '600' : '400',
              }"
              @click="minimaxTab = 'basic'"
            >
              基本設定
            </button>
            <button
              style="
                flex: 1;
                padding: 8px 0;
                font-size: 13px;
                border: none;
                background: none;
                cursor: pointer;
                transition: all 0.2s;
              "
              :style="{
                color:
                  minimaxTab === 'timberMix'
                    ? 'var(--primary, #5b7a5e)'
                    : '#999',
                borderBottom:
                  minimaxTab === 'timberMix'
                    ? '2px solid var(--primary, #5b7a5e)'
                    : '2px solid transparent',
                fontWeight: minimaxTab === 'timberMix' ? '600' : '400',
              }"
              @click="minimaxTab = 'timberMix'"
            >
              🎨 音色混合
            </button>
            <button
              style="
                flex: 1;
                padding: 8px 0;
                font-size: 13px;
                border: none;
                background: none;
                cursor: pointer;
                transition: all 0.2s;
              "
              :style="{
                color:
                  minimaxTab === 'voiceClone'
                    ? 'var(--primary, #5b7a5e)'
                    : '#999',
                borderBottom:
                  minimaxTab === 'voiceClone'
                    ? '2px solid var(--primary, #5b7a5e)'
                    : '2px solid transparent',
                fontWeight: minimaxTab === 'voiceClone' ? '600' : '400',
              }"
              @click="minimaxTab = 'voiceClone'"
            >
              🎙️ 音色複刻
            </button>
          </div>

          <!-- ====== 基本設定分頁 ====== -->
          <template v-if="minimaxTab === 'basic'">
            <!-- 音色列表（展開式） -->
            <div v-if="minimaxVoiceList.length > 0" class="setting-group">
              <label class="setting-label">可用音色（點擊選用）</label>
              <div
                style="
                  max-height: 240px;
                  overflow-y: auto;
                  border: 1px solid rgba(0, 0, 0, 0.1);
                  border-radius: 8px;
                  padding: 4px;
                "
              >
                <div
                  v-for="voice in minimaxVoiceList"
                  :key="voice.voice_id"
                  style="
                    padding: 6px 10px;
                    cursor: pointer;
                    border-radius: 6px;
                    font-size: 13px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                  "
                  :style="{
                    background:
                      settingsStore.minimaxTTS.voiceId === voice.voice_id
                        ? 'rgba(var(--primary-rgb, 100,100,255), 0.12)'
                        : 'transparent',
                  }"
                  @click="selectMinimaxVoice(voice.voice_id)"
                >
                  <span>{{ getVoiceDisplayName(voice.voice_id) }}</span>
                  <span style="font-size: 11px; opacity: 0.5">{{
                    voice.voice_type === "user" ? "自訂" : ""
                  }}</span>
                </div>
              </div>
              <div
                v-if="minimaxVoiceError"
                style="color: #e53e3e; font-size: 12px; margin-top: 4px"
              >
                {{ minimaxVoiceError }}
              </div>
            </div>

            <!-- 平台 + 代理 -->
            <div class="setting-group">
              <label class="setting-label">平台</label>
              <select
                v-model="settingsStore.minimaxTTS.platform"
                class="soft-select"
                @change="saveSettings"
              >
                <option value="io">國際站 (api.minimax.io)</option>
                <option value="cn">中文站 (api.minimaxi.com)</option>
              </select>
            </div>

            <div class="setting-group">
              <label class="setting-label">Worker 代理地址（選填）</label>
              <input
                type="text"
                v-model="settingsStore.minimaxTTS.proxyUrl"
                class="soft-input"
                placeholder="https://your-worker.workers.dev"
                @change="saveSettings"
              />
            </div>

            <!-- 模型 -->
            <div class="setting-group">
              <label class="setting-label">模型</label>
              <select
                v-model="settingsStore.minimaxTTS.model"
                class="soft-select"
                @change="saveSettings"
              >
                <option value="speech-2.8-hd">
                  speech-2.8-hd（最新HD，支持語氣標籤）
                </option>
                <option value="speech-2.8-turbo">
                  speech-2.8-turbo（最新Turbo，支持語氣標籤）
                </option>
                <option value="speech-2.6-hd">speech-2.6-hd</option>
                <option value="speech-2.6-turbo">
                  speech-2.6-turbo（40語種）
                </option>
                <option value="speech-02-hd">speech-02-hd</option>
                <option value="speech-02-turbo">speech-02-turbo</option>
              </select>
            </div>

            <!-- 音色 -->
            <div class="setting-group">
              <label class="setting-label">預設音色 (voice_id)</label>
              <input
                type="text"
                v-model="settingsStore.minimaxTTS.voiceId"
                class="soft-input"
                placeholder="Chinese (Mandarin)_Warm_Bestie"
                @change="saveSettings"
              />
            </div>

            <!-- 語言增強 -->
            <div class="setting-group">
              <label class="setting-label">語言增強</label>
              <select
                v-model="settingsStore.minimaxTTS.languageBoost"
                class="soft-select"
                @change="saveSettings"
              >
                <option
                  v-for="lang in MINIMAX_LANGUAGES"
                  :key="lang.value"
                  :value="lang.value"
                >
                  {{ lang.label }}
                </option>
              </select>
            </div>

            <!-- 輸出格式 + 採樣率 -->
            <div class="setting-group">
              <label class="setting-label">輸出格式</label>
              <select
                v-model="settingsStore.minimaxTTS.format"
                class="soft-select"
                @change="saveSettings"
              >
                <option value="mp3">MP3</option>
                <option value="wav">WAV</option>
                <option value="flac">FLAC</option>
              </select>
            </div>

            <div class="setting-group">
              <label class="setting-label">採樣率</label>
              <select
                v-model.number="settingsStore.minimaxTTS.sampleRate"
                class="soft-select"
                @change="saveSettings"
              >
                <option :value="32000">32000 Hz</option>
                <option :value="44100">44100 Hz</option>
                <option :value="24000">24000 Hz</option>
                <option :value="16000">16000 Hz</option>
              </select>
            </div>
          </template>

          <!-- ====== 音色混合分頁 ====== -->
          <template v-if="minimaxTab === 'timberMix'">
            <!-- 費用提醒 -->
            <div
              style="
                background: rgba(255, 180, 50, 0.1);
                border: 1px solid rgba(255, 180, 50, 0.3);
                border-radius: 10px;
                padding: 10px 14px;
                margin-bottom: 14px;
                font-size: 12px;
                color: #b8860b;
                line-height: 1.6;
              "
            >
              ⚠️ 音色混合會使用 MiniMax 的 timber_weights
              參數，啟用後每次合成的費用會比單音色更高。請留意你的 API 額度。
            </div>

            <!-- 啟用開關 -->
            <label class="toggle-item" style="margin-bottom: 12px">
              <div class="toggle-content">
                <span class="toggle-label">啟用音色混合</span>
                <span class="toggle-desc"
                  >啟用後將覆蓋「基本設定」中的預設音色</span
                >
              </div>
              <input
                type="checkbox"
                v-model="settingsStore.minimaxTTS.timberWeightsEnabled"
                class="toggle-input"
                @change="saveSettings"
              />
              <span class="toggle-switch"></span>
            </label>

            <!-- 音色混合列表 -->
            <div v-if="settingsStore.minimaxTTS.timberWeightsEnabled">
              <div
                v-for="(tw, idx) in settingsStore.minimaxTTS.timberWeights"
                :key="idx"
                style="
                  display: flex;
                  gap: 8px;
                  align-items: center;
                  margin-bottom: 8px;
                "
              >
                <input
                  type="text"
                  v-model="tw.voiceId"
                  class="soft-input"
                  style="flex: 1; font-size: 12px"
                  placeholder="voice_id"
                  @change="saveSettings"
                />
                <div
                  style="
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    min-width: 80px;
                  "
                >
                  <input
                    type="range"
                    v-model.number="tw.weight"
                    min="1"
                    max="100"
                    step="1"
                    style="width: 60px"
                    @input="saveSettings"
                  />
                  <span
                    style="font-size: 11px; min-width: 28px; text-align: right"
                    >{{ tw.weight }}</span
                  >
                </div>
                <button
                  style="
                    background: none;
                    border: none;
                    cursor: pointer;
                    font-size: 16px;
                    color: #e53e3e;
                    padding: 2px 6px;
                  "
                  @click="removeTimberWeight(idx)"
                >
                  ✕
                </button>
              </div>

              <!-- 新增按鈕 -->
              <button
                class="soft-btn"
                style="width: 100%; margin-top: 4px"
                @click="addTimberWeight"
              >
                + 新增音色
              </button>

              <!-- 從音色列表快速加入 -->
              <div v-if="minimaxVoiceList.length > 0" style="margin-top: 12px">
                <label class="setting-label" style="font-size: 12px"
                  >從音色列表快速加入</label
                >
                <div
                  style="
                    max-height: 180px;
                    overflow-y: auto;
                    border: 1px solid rgba(0, 0, 0, 0.1);
                    border-radius: 8px;
                    padding: 4px;
                  "
                >
                  <div
                    v-for="voice in minimaxVoiceList"
                    :key="'mix-' + voice.voice_id"
                    style="
                      padding: 5px 10px;
                      cursor: pointer;
                      border-radius: 6px;
                      font-size: 12px;
                      display: flex;
                      justify-content: space-between;
                      align-items: center;
                    "
                    :style="{
                      background: settingsStore.minimaxTTS.timberWeights.some(
                        (tw) => tw.voiceId === voice.voice_id,
                      )
                        ? 'rgba(var(--primary-rgb, 100,100,255), 0.12)'
                        : 'transparent',
                      opacity: settingsStore.minimaxTTS.timberWeights.some(
                        (tw) => tw.voiceId === voice.voice_id,
                      )
                        ? 0.5
                        : 1,
                    }"
                    @click="addVoiceToTimberMix(voice.voice_id)"
                  >
                    <span>{{ getVoiceDisplayName(voice.voice_id) }}</span>
                    <span
                      v-if="
                        settingsStore.minimaxTTS.timberWeights.some(
                          (tw) => tw.voiceId === voice.voice_id,
                        )
                      "
                      style="font-size: 11px; color: var(--primary, #5b7a5e)"
                      >已加入</span
                    >
                  </div>
                </div>
              </div>

              <!-- 無音色時提示 -->
              <div
                v-if="settingsStore.minimaxTTS.timberWeights.length === 0"
                style="
                  text-align: center;
                  padding: 20px;
                  color: #999;
                  font-size: 13px;
                "
              >
                尚未加入任何音色，點擊上方「+ 新增音色」開始混合
              </div>
            </div>

            <!-- 未啟用時的說明 -->
            <div
              v-else
              style="
                text-align: center;
                padding: 24px 16px;
                color: #999;
                font-size: 13px;
                line-height: 1.8;
              "
            >
              <div style="font-size: 28px; margin-bottom: 8px">🎭</div>
              音色混合可以將多個音色按比例混合，創造獨特的聲音。<br />
              例如：70% 御姐 + 30% 少女 = 溫柔成熟的聲線。<br />
              開啟上方開關即可開始設定。
            </div>
          </template>

          <!-- ====== 音色複刻分頁 ====== -->
          <template v-if="minimaxTab === 'voiceClone'">
            <div
              style="
                background: rgba(100, 180, 255, 0.08);
                border: 1px solid rgba(100, 180, 255, 0.25);
                border-radius: 10px;
                padding: 10px 14px;
                margin-bottom: 14px;
                font-size: 12px;
                color: #4a7fb5;
                line-height: 1.6;
              "
            >
              🎙️ 上傳一段音頻即可複刻音色。複刻只需一次，之後拿到的 voice_id
              可永久使用，合成費用與普通音色相同。
            </div>

            <!-- 音色名稱 -->
            <div class="setting-group">
              <label class="setting-label">音色名稱</label>
              <input
                type="text"
                v-model="voiceCloneName"
                class="soft-input"
                placeholder="英文+數字+底線，如 my_character_01"
                style="font-size: 13px"
              />
              <p style="font-size: 11px; color: #999; margin-top: 4px">
                這會成為你的 voice_id，之後用它來合成語音
              </p>
            </div>

            <!-- 上傳音頻 -->
            <div class="setting-group">
              <label class="setting-label">上傳音頻檔案</label>
              <div
                style="
                  border: 2px dashed rgba(0, 0, 0, 0.12);
                  border-radius: 10px;
                  padding: 16px;
                  text-align: center;
                  cursor: pointer;
                  position: relative;
                  transition: all 0.2s;
                "
                @click="($refs.voiceCloneInput as HTMLInputElement)?.click()"
              >
                <input
                  ref="voiceCloneInput"
                  type="file"
                  accept="audio/mp3,audio/wav,audio/flac,audio/mpeg,.mp3,.wav,.flac"
                  style="display: none"
                  @change="onVoiceCloneFileChange"
                />
                <div v-if="voiceCloneFile" style="font-size: 13px">
                  <span style="font-size: 20px">🎵</span><br />
                  {{ voiceCloneFile.name }}<br />
                  <span style="font-size: 11px; color: #999"
                    >{{ (voiceCloneFile.size / 1024).toFixed(1) }} KB</span
                  >
                </div>
                <div v-else style="color: #999; font-size: 13px">
                  <span style="font-size: 24px">📁</span><br />
                  點擊選擇音頻檔案<br />
                  <span style="font-size: 11px"
                    >支援 MP3 / WAV / FLAC，建議 15~30 秒，最短 1 秒</span
                  >
                </div>
              </div>
            </div>

            <!-- 音頻對應文字（可選） -->
            <div class="setting-group">
              <label class="setting-label">音頻對應文字（選填）</label>
              <textarea
                v-model="voiceCloneText"
                class="soft-input"
                style="min-height: 60px; resize: vertical; font-size: 13px"
                placeholder="輸入音頻中說的文字內容，可提升複刻品質"
              ></textarea>
            </div>

            <!-- 開始複刻按鈕 -->
            <div class="setting-group">
              <button
                class="soft-btn"
                style="width: 100%"
                :disabled="
                  voiceCloning ||
                  !voiceCloneFile ||
                  !voiceCloneName.trim() ||
                  !settingsStore.minimaxTTS.apiKey
                "
                @click="startVoiceClone"
              >
                {{ voiceCloning ? "複刻中，請稍候…" : "🎙️ 開始複刻" }}
              </button>
            </div>

            <!-- 結果 -->
            <div v-if="voiceCloneResult" class="setting-group">
              <div
                v-if="voiceCloneResult.success"
                style="
                  background: rgba(72, 187, 120, 0.1);
                  border: 1px solid rgba(72, 187, 120, 0.3);
                  border-radius: 10px;
                  padding: 12px 14px;
                  font-size: 13px;
                  color: #2f855a;
                "
              >
                ✅ 複刻成功！<br />
                <span style="font-size: 12px">
                  voice_id：<code
                    style="
                      background: rgba(0, 0, 0, 0.06);
                      padding: 2px 6px;
                      border-radius: 4px;
                    "
                    >{{ voiceCloneResult.voiceId }}</code
                  > </span
                ><br />
                <span style="font-size: 11px; color: #999"
                  >已自動填入預設音色，可直接使用。</span
                >
              </div>
              <div
                v-else
                style="
                  background: rgba(229, 62, 62, 0.08);
                  border: 1px solid rgba(229, 62, 62, 0.25);
                  border-radius: 10px;
                  padding: 12px 14px;
                  font-size: 13px;
                  color: #c53030;
                "
              >
                ❌ 複刻失敗：{{ voiceCloneResult.error }}
              </div>
            </div>

            <!-- 已有的自訂音色列表 -->
            <div
              v-if="
                minimaxVoiceList.filter((v) => v.voice_type === 'user').length >
                0
              "
              class="setting-group"
              style="margin-top: 8px"
            >
              <label class="setting-label">已複刻的音色</label>
              <div
                style="
                  border: 1px solid rgba(0, 0, 0, 0.1);
                  border-radius: 8px;
                  padding: 4px;
                "
              >
                <div
                  v-for="voice in minimaxVoiceList.filter(
                    (v) => v.voice_type === 'user',
                  )"
                  :key="'clone-' + voice.voice_id"
                  style="
                    padding: 8px 10px;
                    border-radius: 6px;
                    font-size: 13px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                  "
                  :style="{
                    background:
                      settingsStore.minimaxTTS.voiceId === voice.voice_id
                        ? 'rgba(var(--primary-rgb, 100,100,255), 0.12)'
                        : 'transparent',
                  }"
                >
                  <span>{{ voice.voice_id }}</span>
                  <button
                    style="
                      font-size: 11px;
                      padding: 3px 10px;
                      border: 1px solid rgba(0, 0, 0, 0.15);
                      border-radius: 6px;
                      background: none;
                      cursor: pointer;
                      color: var(--primary, #5b7a5e);
                    "
                    @click="useClonedVoice(voice.voice_id)"
                  >
                    {{
                      settingsStore.minimaxTTS.voiceId === voice.voice_id
                        ? "使用中"
                        : "使用"
                    }}
                  </button>
                </div>
              </div>
            </div>

            <!-- 無自訂音色時的提示 -->
            <div
              v-else-if="minimaxVoiceList.length > 0"
              style="
                text-align: center;
                padding: 16px;
                color: #999;
                font-size: 12px;
              "
            >
              尚未有複刻音色，上傳音頻開始你的第一次複刻吧
            </div>
          </template>
        </template>
      </div>

      <!-- 存儲空間 -->
      <div v-if="currentTab === 'storage'" class="settings-section">
        <!-- 背景運行開關 -->
        <label class="toggle-item highlight">
          <div class="toggle-content">
            <span class="toggle-label">背景運行模式</span>
            <span class="toggle-desc"
              >播放無聲音頻防止瀏覽器在後台暫停網頁</span
            >
          </div>
          <input
            type="checkbox"
            v-model="settingsStore.backgroundAudioEnabled"
            class="toggle-input"
            @change="saveSettings"
          />
          <span class="toggle-switch"></span>
        </label>

        <!-- Debug Overlay 開關 -->
        <label class="toggle-item highlight">
          <div class="toggle-content">
            <span class="toggle-label">Debug Overlay</span>
            <span class="toggle-desc"
              >顯示浮動除錯視窗，查看 console 輸出和視口數據</span
            >
          </div>
          <input
            type="checkbox"
            :checked="debugOverlayActive"
            class="toggle-input"
            @change="toggleDebugOverlay"
          />
          <span class="toggle-switch"></span>
        </label>

        <!-- 系統推播通知 -->
        <div class="push-notification-card">
          <div class="toggle-item highlight">
            <div class="toggle-content">
              <span class="toggle-label">系統推播通知</span>
              <span class="toggle-desc">
                背景時透過系統通知提醒角色訊息、噗浪等
              </span>
            </div>
            <label class="toggle-item" style="padding: 0; border: none">
              <input
                type="checkbox"
                v-model="notificationStore.settings.pushEnabled"
                class="toggle-input"
                @change="notificationStore.saveSettings()"
              />
              <span class="toggle-switch"></span>
            </label>
          </div>
          <div class="push-permission-row">
            <span class="push-permission-label">
              通知權限：
              <span class="push-permission-badge" :class="pushPermissionStatus">
                {{
                  pushPermissionStatus === "granted"
                    ? "已授權"
                    : pushPermissionStatus === "denied"
                      ? "已拒絕"
                      : "未請求"
                }}
              </span>
            </span>
            <div class="push-permission-actions">
              <button
                v-if="pushPermissionStatus === 'granted'"
                class="push-permission-btn test"
                @click="handleTestNotification"
              >
                測試通知
              </button>
              <button
                v-else-if="pushPermissionStatus === 'denied'"
                class="push-permission-btn"
                @click="handleShowPermissionGuide"
              >
                查看解決方法
              </button>
              <button
                v-else
                class="push-permission-btn"
                @click="handleRequestPushPermission"
              >
                請求權限
              </button>
            </div>
          </div>
          <div
            v-if="pushPermissionStatus === 'denied'"
            class="push-denied-hint"
          >
            ⚠️ 通知權限已被拒絕，需手動重置：
            <ul>
              <li>
                iOS Safari：需「加入主畫面」作為 PWA 運行，再到 設定 → 通知 →
                找到本 App 開啟
              </li>
              <li>Android Chrome：點網址列左側鎖頭圖示 → 通知 → 允許</li>
              <li>
                電腦瀏覽器：點網址列左側圖示 → 網站設定 → 通知 → 重置為「詢問」
              </li>
            </ul>
          </div>
        </div>

        <!-- 雲端推送鬧鐘 -->
        <div class="push-notification-card cloud-push-card">
          <div class="toggle-item highlight">
            <div class="toggle-content">
              <span class="toggle-label">雲端推送鬧鐘</span>
              <span class="toggle-desc">
                關閉瀏覽器後，雲端伺服器仍會定時生成角色訊息並推送
              </span>
            </div>
            <label class="toggle-item" style="padding: 0; border: none">
              <input
                type="checkbox"
                v-model="cloudPushEnabled"
                class="toggle-input"
                @change="handleCloudPushToggle"
              />
              <span class="toggle-switch"></span>
            </label>
          </div>

          <div v-if="cloudPushEnabled" class="cloud-push-options">
            <!-- 推送管道 -->
            <div class="setting-group">
              <label class="setting-label">推送管道</label>
              <label class="toggle-item" style="border: none; padding: 6px 0">
                <span class="toggle-label" style="font-size: 13px"
                  >Discord Bot DM</span
                >
                <input
                  type="checkbox"
                  :checked="cloudPushChannels.includes('discord')"
                  class="toggle-input"
                  @change="toggleCloudPushChannel('discord', $event)"
                />
                <span class="toggle-switch"></span>
              </label>
              <div
                v-if="cloudPushChannels.includes('discord')"
                style="padding-left: 4px"
              >
                <!-- 已連結：顯示帳號資訊 -->
                <div v-if="cloudPushStore.isDiscordLinked" class="discord-linked-info">
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px">
                    <span style="font-size: 13px; color: var(--text-secondary)">
                      ✅ 已連結：{{ cloudPushStore.discordDisplayName || cloudPushStore.discordUsername || cloudPushStore.discordUserId }}
                    </span>
                  </div>
                  <div style="display: flex; gap: 8px">
                    <button
                      class="soft-btn"
                      style="font-size: 12px; padding: 4px 10px"
                      @click="cloudPushStore.openDiscordOAuth()"
                    >
                      重新連結
                    </button>
                    <button
                      class="soft-btn"
                      style="font-size: 12px; padding: 4px 10px; opacity: 0.7"
                      @click="handleUnlinkDiscord"
                    >
                      解除連結
                    </button>
                  </div>
                </div>
                <!-- 未連結：顯示授權按鈕 -->
                <div v-else>
                  <button
                    class="soft-btn discord-link-btn"
                    @click="cloudPushStore.openDiscordOAuth()"
                  >
                    <svg width="20" height="15" viewBox="0 0 71 55" fill="currentColor" style="flex-shrink: 0">
                      <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A37.4 37.4 0 0025.4.3a.2.2 0 00-.2-.1A58.4 58.4 0 0010.5 5a.2.2 0 00-.1 0A60 60 0 00.4 45.1a.3.3 0 000 .2 58.7 58.7 0 0017.7 9 .2.2 0 00.3-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.7 38.7 0 01-5.5-2.6.2.2 0 01 0-.4l1.1-.9a.2.2 0 01.2 0 41.9 41.9 0 0035.6 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .3 36.3 36.3 0 01-5.5 2.7.2.2 0 00-.1.3 47.2 47.2 0 003.6 5.9.2.2 0 00.3 0A58.5 58.5 0 0070.3 45.3a.2.2 0 000-.2A59.7 59.7 0 0060.2 5a.2.2 0 00-.1 0zM23.7 37a6.8 6.8 0 01-6.3-7 6.8 6.8 0 016.3-7 6.7 6.7 0 016.3 7 6.8 6.8 0 01-6.3 7zm23.2 0a6.8 6.8 0 01-6.3-7 6.8 6.8 0 016.3-7 6.7 6.7 0 016.3 7 6.8 6.8 0 01-6.3 7z"/>
                    </svg>
                    連結 Discord 帳號
                  </button>
                  <p style="font-size: 11px; color: var(--text-tertiary); margin-top: 4px">
                    點擊後會跳轉到 Discord 授權，自動綁定帳號並加入伺服器
                  </p>
                </div>
              </div>
              <label class="toggle-item" style="border: none; padding: 6px 0">
                <span class="toggle-label" style="font-size: 13px"
                  >瀏覽器推送（Phase 2）</span
                >
                <input
                  type="checkbox"
                  class="toggle-input"
                  :checked="cloudPushChannels.includes('webpush')"
                  @change="toggleCloudPushChannel('webpush', $event)"
                />
                <span class="toggle-switch"></span>
              </label>
            </div>

            <!-- 操作按鈕 -->
            <div class="cloud-push-actions">
              <button
                class="push-permission-btn"
                :disabled="cloudPushSyncStatus === 'syncing'"
                @click="handleCloudPushSync"
              >
                {{
                  cloudPushSyncStatus === "syncing"
                    ? "同步中…"
                    : "同步 API 設定到雲端"
                }}
              </button>
              <button
                class="push-permission-btn test"
                @click="handleCloudPushTest"
              >
                測試推送
              </button>
            </div>

            <!-- 狀態顯示 -->
            <div class="cloud-push-status">
              <span v-if="cloudPushSyncStatus === 'success'">
                已同步
                <template v-if="cloudPushNextAlarm">
                  · 下次推送 {{ formatNextAlarm(cloudPushNextAlarm) }}
                </template>
              </span>
              <span
                v-else-if="cloudPushSyncStatus === 'error'"
                style="color: #ff6b6b"
              >
                同步失敗：{{ cloudPushSyncError }}
              </span>
              <span v-else>尚未同步</span>
              <span v-if="cloudPushPendingCount > 0" style="margin-left: 8px">
                · 離線訊息：{{ cloudPushPendingCount }} 條待拉取
              </span>
            </div>

            <!-- 中國大陸提示 -->
            <div
              class="cloud-push-status"
              style="font-size: 11px; margin-top: 4px"
            >
              <div>
                ⚠ Chrome 瀏覽器推送依賴 Google FCM，中國大陸需開啟全局代理
              </div>
              <div>✓ Safari / Firefox 瀏覽器推送在中國可正常使用</div>
            </div>
          </div>
        </div>

        <div class="incoming-ringtone-card">
          <div class="incoming-ringtone-header">
            <div class="incoming-ringtone-icon">🔔</div>
            <div>
              <div class="incoming-ringtone-title">來電鈴聲</div>
              <div class="incoming-ringtone-desc">
                可選內建鈴聲或上傳自訂音檔，並調整音量
              </div>
            </div>
          </div>

          <div class="setting-group">
            <label class="setting-label">鈴聲選擇</label>
            <select
              v-model="settingsStore.incomingCallRingtone.selectedRingtoneId"
              class="soft-select"
              @change="saveSettings"
            >
              <option
                v-for="option in ringtoneOptions"
                :key="option.id"
                :value="option.id"
                :disabled="
                  option.id === 'custom' &&
                  !settingsStore.incomingCallRingtone.customAudioDataUrl
                "
              >
                {{ option.name }}（{{ option.description }}）
              </option>
            </select>
            <p
              v-if="
                settingsStore.incomingCallRingtone.selectedRingtoneId ===
                  'custom' &&
                !settingsStore.incomingCallRingtone.customAudioDataUrl
              "
              class="setting-hint"
              style="color: #ff9f43"
            >
              尚未上傳自訂音檔，將使用「經典來電」。
            </p>
          </div>

          <div class="setting-group">
            <label class="setting-label">
              鈴聲音量
              <span class="value-badge"
                >{{
                  Math.round(settingsStore.incomingCallRingtone.volume * 100)
                }}%</span
              >
            </label>
            <input
              v-model.number="settingsStore.incomingCallRingtone.volume"
              type="range"
              min="0"
              max="1"
              step="0.05"
              class="soft-slider"
              @change="saveSettings"
            />
          </div>

          <div class="setting-group">
            <label class="setting-label">上傳自訂鈴聲（MP3/WAV/FLAC）</label>
            <div class="ringtone-upload-wrapper">
              <div class="ringtone-upload-btn">
                <span>📁</span> 點擊或拖曳上傳音檔
              </div>
              <input
                type="file"
                accept="audio/mp3,audio/wav,audio/flac,audio/mpeg,.mp3,.wav,.flac"
                @change="handleIncomingRingtoneFileChange"
              />
            </div>

            <div
              v-if="settingsStore.incomingCallRingtone.customAudioName"
              class="incoming-ringtone-file-row"
            >
              <span class="incoming-ringtone-file-name">
                {{ settingsStore.incomingCallRingtone.customAudioName }}
              </span>
              <button
                class="push-permission-btn"
                style="
                  background: rgba(255, 107, 107, 0.15);
                  color: #ff6b6b;
                  padding: 6px 14px;
                  font-weight: 600;
                "
                @click="handleClearIncomingCustomRingtone"
              >
                移除
              </button>
            </div>
          </div>

          <div class="incoming-ringtone-actions">
            <button
              class="push-permission-btn test"
              :class="{ playing: ringtoneTestPlaying }"
              @click="handleTestIncomingRingtone"
            >
              <span style="font-size: 16px; margin-right: 6px">{{
                ringtoneTestPlaying ? "⏹" : "▶"
              }}</span>
              {{ ringtoneTestPlaying ? "停止測試" : "測試播放" }}
            </button>
          </div>
        </div>

        <div class="storage-card">
          <div class="storage-header">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M2 20h20v-4H2v4zm2-3h2v2H4v-2zM2 4v4h20V4H2zm4 3H4V5h2v2zm-4 7h20v-4H2v4zm2-3h2v2H4v-2z"
              />
            </svg>
            <span>存儲空間監控</span>
          </div>

          <div class="storage-usage">
            <div class="usage-header">
              <span>已使用</span>
              <span
                >{{ storageStatus.usedFormatted }} /
                {{ storageStatus.limitFormatted }}</span
              >
            </div>
            <div class="usage-bar-container">
              <div
                class="usage-bar"
                :class="storageStatus.status"
                :style="{ width: storageStatus.percentage + '%' }"
              >
                <span class="usage-percentage"
                  >{{ storageStatus.percentage }}%</span
                >
              </div>
            </div>
          </div>

          <div class="storage-status" :class="storageStatus.status">
            <svg
              v-if="storageStatus.status === 'safe'"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="currentColor">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
            </svg>
            <span v-if="storageStatus.status === 'safe'">存儲空間充足</span>
            <span v-else-if="storageStatus.status === 'warning'"
              >存儲空間即將用完</span
            >
            <span v-else>存儲空間不足！</span>
          </div>

          <!-- 數據明細 -->
          <div class="storage-breakdown">
            <div
              class="breakdown-item"
              v-for="item in storageStatus.breakdown"
              :key="item.key"
            >
              <span class="item-name">{{ item.key }}</span>
              <span class="item-size">{{ item.sizeFormatted }}</span>
            </div>
          </div>

          <button class="refresh-btn" @click="refreshStorageStatus">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
              />
            </svg>
            刷新狀態
          </button>
        </div>
      </div>

      <!-- 數據備份 -->
      <div v-if="currentTab === 'data'" class="settings-section">
        <div class="backup-card">
          <div class="backup-header">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
            </svg>
            <span>數據備份與同步</span>
          </div>

          <div class="backup-buttons">
            <button
              class="backup-btn export"
              @click="exportData"
              :disabled="isExporting"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
              </svg>
              {{ isExporting ? "導出中..." : "導出全部數據" }}
            </button>

            <button
              class="backup-btn import"
              @click="triggerImport"
              :disabled="isImporting"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z" />
              </svg>
              {{ isImporting ? "導入中..." : "導入數據" }}
            </button>

            <input
              ref="fileInput"
              type="file"
              accept="*/*"
              style="display: none"
              @change="handleFileImport"
            />
          </div>

          <p class="backup-hint">
            導出的 ZIP 文件包含所有角色、世界書、聊天記錄和媒體檔案
          </p>

          <!-- 強制刷新 -->
          <div class="backup-buttons" style="margin-top: 12px">
            <button class="backup-btn export" @click="hardRefresh">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
                />
              </svg>
              強制刷新（清除快取）
            </button>
          </div>
        </div>

        <!-- 自動備份 -->
        <div class="backup-card" style="margin-top: 16px">
          <div class="backup-header">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M19 8l-4 4h3c0 3.31-2.69 6-6 6-1.01 0-1.97-.25-2.8-.7l-1.46 1.46C8.97 19.54 10.43 20 12 20c4.42 0 8-3.58 8-8h3l-4-4zM6 12c0-3.31 2.69-6 6-6 1.01 0 1.97.25 2.8.7l1.46-1.46C15.03 4.46 13.57 4 12 4c-4.42 0-8 3.58-8 8H1l4 4 4-4H6z"
              />
            </svg>
            <span>自動備份到本地</span>
          </div>

          <!-- 啟用開關（所有平台都顯示） -->
          <label class="toggle-item" style="border: none; padding: 8px 0">
            <div class="toggle-content">
              <span class="toggle-label">啟用自動備份</span>
              <span class="toggle-desc">{{
                fsaaSupported
                  ? "定時將所有數據備份到選擇的資料夾"
                  : "定時自動下載備份檔案"
              }}</span>
            </div>
            <input
              type="checkbox"
              class="toggle-input"
              :checked="autoBackupSettings.enabled"
              @change="handleToggleAutoBackup"
            />
            <span class="toggle-switch"></span>
          </label>

          <!-- FSAA 支援：資料夾選擇 -->
          <div v-if="fsaaSupported" class="auto-backup-section">
            <!-- 資料夾選擇 -->
            <div class="backup-folder-row">
              <span class="backup-folder-label">備份資料夾：</span>
              <span v-if="autoBackupFolderName" class="backup-folder-name">
                📁 {{ autoBackupFolderName }}
                <button
                  class="backup-folder-clear"
                  @click="handleClearBackupFolder"
                  title="清除"
                >
                  ✕
                </button>
              </span>
              <span v-else class="backup-folder-name" style="opacity: 0.5"
                >未選擇</span
              >
              <button
                class="backup-btn export"
                style="margin-left: auto; min-width: auto; padding: 6px 12px"
                @click="handlePickBackupFolder"
              >
                {{ autoBackupFolderName ? "更換" : "選擇資料夾" }}
              </button>
            </div>

            <!-- 權限提示 -->
            <div
              v-if="autoBackupFolderName && autoBackupPermission !== 'granted'"
              class="backup-permission-hint"
            >
              ⚠️ 需要重新授權寫入權限
              <button
                class="backup-btn export"
                style="min-width: auto; padding: 4px 10px; font-size: 12px"
                @click="handleRequestBackupPermission"
              >
                授權
              </button>
            </div>
          </div>

          <!-- 不支援 FSAA 提示 -->
          <div v-else class="auto-backup-section">
            <p class="backup-hint" style="margin: 0 0 8px">
              此瀏覽器不支援 File System Access API，無法自動寫入本地資料夾。<br />
              開啟自動備份後將定時觸發下載。
            </p>
          </div>

          <!-- 間隔設定（所有平台都顯示） -->
          <div v-if="autoBackupSettings.enabled" class="auto-backup-section">
            <div class="backup-interval-row">
              <span>備份間隔：</span>
              <select
                v-model.number="autoBackupSettings.intervalMinutes"
                class="soft-input"
                style="width: auto; min-width: 100px"
                @change="handleSaveBackupInterval"
              >
                <option :value="10">10 分鐘</option>
                <option :value="30">30 分鐘</option>
                <option :value="60">1 小時</option>
                <option :value="120">2 小時</option>
                <option :value="360">6 小時</option>
                <option :value="720">12 小時</option>
                <option :value="1440">24 小時</option>
              </select>
              <span style="margin-left: 12px">保留：</span>
              <input
                type="number"
                v-model.number="autoBackupSettings.maxBackups"
                class="soft-input"
                style="width: 4.5em; min-width: 4.5em; text-align: center"
                min="0"
                placeholder="0"
                @change="handleSaveBackupInterval"
              />
              <span
                style="
                  font-size: 12px;
                  color: var(--color-text-secondary, #94a3b8);
                "
                >份（0 = 不限）</span
              >
            </div>

            <!-- 上次備份資訊 -->
            <div class="backup-last-info">
              上次備份：{{ formatBackupTime(autoBackupSettings.lastBackupAt) }}
            </div>
          </div>

          <!-- 手動備份按鈕 -->
          <div class="backup-buttons">
            <button
              v-if="fsaaSupported && autoBackupFolderName"
              class="backup-btn export"
              @click="handleBackupNow"
              :disabled="isBackingUp"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"
                />
              </svg>
              {{ isBackingUp ? "備份中..." : "立即備份到資料夾" }}
            </button>
            <button
              class="backup-btn import"
              @click="handleDownloadBackup"
              :disabled="isBackingUp"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
              </svg>
              {{ isBackingUp ? "備份中..." : "下載備份檔案" }}
            </button>
          </div>

          <!-- 備份進度 -->
          <div
            v-if="isBackingUp && backupProgress"
            class="backup-progress-info"
          >
            <span class="backup-progress-spinner" />
            <span>{{ backupProgress }}</span>
          </div>
        </div>

        <!-- 危險操作 -->
        <div class="danger-zone">
          <div class="danger-header">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
              />
            </svg>
            <span>危險操作</span>
          </div>

          <button class="danger-btn" @click="deleteAllData">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
              />
            </svg>
            刪除本機所有數據
          </button>

          <p class="danger-hint">此操作將永久刪除所有數據，無法恢復！</p>
        </div>
      </div>
    </main>

    <!-- 新建配置文件彈窗 -->
    <Teleport to="body">
      <div
        v-if="showProfileModal"
        class="modal-overlay"
        @click="showProfileModal = false"
      >
        <div class="profile-modal" @click.stop>
          <h3>新建 API 配置</h3>
          <input
            v-model="newProfileName"
            type="text"
            class="soft-input"
            placeholder="配置名稱（如：OpenAI 工作用）"
            @keyup.enter="createNewProfile"
          />
          <div class="modal-actions">
            <button class="modal-btn cancel" @click="showProfileModal = false">
              取消
            </button>
            <button class="modal-btn confirm" @click="createNewProfile">
              創建
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 保存時詢問是否創建新配置 -->
    <Teleport to="body">
      <div
        v-if="showNewProfileConfirm"
        class="modal-overlay"
        @click="showNewProfileConfirm = false"
      >
        <div class="profile-modal confirm-modal" @click.stop>
          <div class="confirm-icon">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
          </div>
          <h3>發現新的 API 設定</h3>
          <p class="confirm-desc">
            這個 API 地址與現有配置不同，<br />
            要保存為新的配置文件嗎？
          </p>
          <input
            v-model="newProfileName"
            type="text"
            class="soft-input"
            placeholder="配置名稱"
            @keyup.enter="confirmCreateProfileAndSave"
          />
          <div class="modal-actions">
            <button class="modal-btn cancel" @click="saveWithoutNewProfile">
              不保存配置
            </button>
            <button
              class="modal-btn confirm"
              @click="confirmCreateProfileAndSave"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
              保存為配置
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 保存成功通知 -->
    <Transition name="toast">
      <div v-if="showSaveSuccess" class="save-toast">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
        保存成功
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.settings-screen {
  background: var(--color-background);
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: var(--color-background, #fff);
  z-index: 100;

  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--color-border, #e2e8f0);
    border-top-color: var(--color-primary, #7dd3a8);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  span {
    color: var(--color-text-muted, #999);
    font-size: 14px;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.tabs {
  display: flex;
  padding: 0 8px;
  border-bottom: 1px solid var(--color-border, rgba(0, 0, 0, 0.1));
  background: var(--color-surface, #fff);
}

.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px;
  background: transparent;
  border: none;
  font-size: 11px;
  color: var(--color-text-secondary, #666);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;

  svg {
    width: 20px;
    height: 20px;
  }

  &::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 3px;
    background: linear-gradient(135deg, #a8e6cf, #7dd3a8);
    border-radius: 3px 3px 0 0;
    transition: width 0.2s;
  }

  &.active {
    color: var(--color-primary, #7dd3a8);

    &::after {
      width: 32px;
    }
  }
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  align-items: center;
  justify-content: space-between;
}

.setting-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.fetch-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  font-size: 12px;
  color: var(--color-text-secondary, #666);
  cursor: pointer;
  transition: all 0.2s;

  svg {
    width: 14px;
    height: 14px;
  }

  &:hover:not(:disabled) {
    border-color: var(--color-primary, #7dd3a8);
    color: var(--color-primary, #7dd3a8);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.small {
    padding: 4px 8px;
    font-size: 11px;

    svg {
      width: 12px;
      height: 12px;
    }

    .spinner.small {
      width: 10px;
      height: 10px;
      border-width: 1.5px;
    }
  }

  .spinner-sm {
    width: 12px;
    height: 12px;
    border: 2px solid var(--color-border, #e2e8f0);
    border-top-color: var(--color-primary, #7dd3a8);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
}

.error-hint {
  font-size: 12px;
  color: #e53e3e;
  padding: 8px 12px;
  background: rgba(229, 62, 62, 0.1);
  border-radius: 8px;
}

.value-badge {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-primary, #7dd3a8);
  background: var(--color-primary-light, #c7fcbb);
  padding: 2px 10px;
  border-radius: 20px;
}

.setting-hint {
  font-size: 12px;
  color: var(--color-text-muted, #999);
  margin: 0;
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.provider-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  background: var(--color-surface, #fff);
  border: 2px solid var(--color-border, #e2e8f0);
  border-radius: 12px;
  font-size: 12px;
  color: var(--color-text, #333);
  cursor: pointer;
  transition: all 0.2s;

  .provider-icon {
    width: 20px;
    height: 20px;
  }

  &:hover {
    border-color: var(--color-primary, #7dd3a8);
  }

  &.active {
    border-color: var(--color-primary, #7dd3a8);
    background: var(--color-primary-light, #c7fcbb);
    color: var(--color-primary, #5fbc8a);
    font-weight: 500;
  }
}

.api-key-field.masked {
  -webkit-text-security: disc;
}

.api-key-input {
  display: flex;
  gap: 8px;

  .soft-input {
    flex: 1;
  }

  .toggle-visibility {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-surface, #fff);
    border: 1px solid var(--color-border, #e2e8f0);
    border-radius: 12px;
    cursor: pointer;

    svg {
      width: 22px;
      height: 22px;
      color: var(--color-text-secondary, #666);
    }

    &:hover {
      background: var(--color-primary-light, #c7fcbb);
      border-color: var(--color-primary, #7dd3a8);

      svg {
        color: var(--color-primary, #7dd3a8);
      }
    }
  }
}

.model-select-group {
  position: relative;
}

.soft-select {
  width: 100%;
  padding: 12px 16px;
  padding-right: 40px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 12px;
  font-size: 14px;
  color: var(--color-text, #333);
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='%23666'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: var(--color-primary, #7dd3a8);
    box-shadow: 0 0 0 3px rgba(125, 211, 168, 0.2);
  }

  &:hover {
    border-color: var(--color-primary, #7dd3a8);
  }

  option {
    padding: 8px;
  }
}

.custom-model-input {
  margin-top: 8px;
}

.soft-select.loading {
  color: var(--color-text-muted, #999);
}

.soft-btn {
  padding: 8px 16px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 10px;
  background: var(--color-surface, #fff);
  font-size: 13px;
  color: var(--color-text, #333);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;

  &:hover:not(:disabled) {
    border-color: var(--color-primary, #7dd3a8);
    background: var(--color-primary-light, #c7fcbb);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.select-spinner {
  position: absolute;
  right: 40px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  border: 2px solid var(--color-border, #e2e8f0);
  border-top-color: var(--color-primary, #7dd3a8);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.success-hint {
  font-size: 12px;
  color: #5fbc8a;
  padding: 8px 12px;
  background: rgba(125, 211, 168, 0.1);
  border-radius: 8px;
}

.info-hint-inline {
  font-size: 12px;
  color: var(--color-text-secondary, #666);
  padding: 8px 12px;
  background: var(--color-background, #f5f5f5);
  border-radius: 8px;
}

.test-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #a8e6cf, #7dd3a8);
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 500;
  color: white;
  cursor: pointer;
  transition: all 0.2s;

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(125, 211, 168, 0.4);
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .spinner {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.connection-result {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 14px;

  svg {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  &.success {
    background: rgba(125, 211, 168, 0.15);
    color: #5fbc8a;
  }

  &.error {
    background: rgba(252, 129, 129, 0.15);
    color: #e53e3e;
  }
}

.range-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--color-text-muted, #999);
}

.soft-slider {
  width: 100%;
  height: 8px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--color-border, #e2e8f0);
  border-radius: 4px;
  outline: none;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 22px;
    height: 22px;
    background: linear-gradient(135deg, #a8e6cf, #7dd3a8);
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(125, 211, 168, 0.4);
  }

  &::-moz-range-thumb {
    width: 22px;
    height: 22px;
    background: linear-gradient(135deg, #a8e6cf, #7dd3a8);
    border-radius: 50%;
    border: none;
    cursor: pointer;
  }
}

.toggle-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 12px;
  cursor: pointer;
}

.toggle-label {
  font-size: 15px;
  color: var(--color-text, #333);
}

.toggle-input {
  display: none;

  &:checked + .toggle-switch {
    background: linear-gradient(135deg, #a8e6cf, #7dd3a8);

    &::after {
      transform: translateX(20px);
    }
  }
}

.toggle-switch {
  width: 48px;
  height: 28px;
  background: var(--color-text-muted, #ccc);
  border-radius: 14px;
  position: relative;
  transition: background 0.2s;

  &::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 22px;
    height: 22px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    transition: transform 0.2s;
  }
}

.reset-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 12px;
  font-size: 14px;
  color: var(--color-text-secondary, #666);
  cursor: pointer;
  transition: all 0.2s;

  svg {
    width: 18px;
    height: 18px;
  }

  &:hover {
    border-color: var(--color-primary, #7dd3a8);
    color: var(--color-primary, #7dd3a8);
  }
}

// 存儲卡片
.storage-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 16px;
  padding: 20px;
}

.storage-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, #333);
  margin-bottom: 16px;

  svg {
    width: 24px;
    height: 24px;
    color: var(--color-primary, #7dd3a8);
  }
}

.storage-usage {
  margin-bottom: 16px;
}

.usage-header {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--color-text-secondary, #666);
  margin-bottom: 8px;
}

.usage-bar-container {
  height: 24px;
  background: var(--color-background, #f5f5f5);
  border-radius: 12px;
  overflow: hidden;
}

.usage-bar {
  height: 100%;
  min-width: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  transition: width 0.3s;

  &.safe {
    background: linear-gradient(135deg, #a8e6cf, #7dd3a8);
  }

  &.warning {
    background: linear-gradient(135deg, #fbbf24, #f59e0b);
  }

  &.critical {
    background: linear-gradient(135deg, #f87171, #ef4444);
  }

  .usage-percentage {
    font-size: 12px;
    font-weight: 600;
    color: white;
  }
}

.storage-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-radius: 10px;
  font-size: 14px;
  margin-bottom: 16px;

  svg {
    width: 20px;
    height: 20px;
  }

  &.safe {
    background: rgba(125, 211, 168, 0.15);
    color: #5fbc8a;
  }

  &.warning {
    background: rgba(245, 158, 11, 0.15);
    color: #d97706;
  }

  &.critical {
    background: rgba(239, 68, 68, 0.15);
    color: #dc2626;
  }
}

.storage-breakdown {
  border-top: 1px solid var(--color-border, #e2e8f0);
  padding-top: 12px;
  margin-bottom: 16px;
}

.breakdown-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 14px;

  .item-name {
    color: var(--color-text-secondary, #666);
  }

  .item-size {
    color: var(--color-text, #333);
    font-weight: 500;
  }
}

.refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  background: var(--color-background, #f5f5f5);
  border: none;
  border-radius: 10px;
  font-size: 14px;
  color: var(--color-text-secondary, #666);
  cursor: pointer;
  transition: all 0.2s;

  svg {
    width: 18px;
    height: 18px;
  }

  &:hover {
    background: var(--color-primary-light, #c7fcbb);
    color: var(--color-primary, #7dd3a8);
  }
}

// 備份卡片
.backup-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 16px;
  padding: 20px;
}

.backup-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, #333);
  margin-bottom: 16px;

  svg {
    width: 24px;
    height: 24px;
    color: var(--color-primary, #7dd3a8);
  }
}

.backup-buttons {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.backup-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
  border: none;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  svg {
    width: 24px;
    height: 24px;
  }

  &.export {
    background: linear-gradient(135deg, #a8e6cf, #7dd3a8);
    color: white;

    &:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(125, 211, 168, 0.4);
    }
  }

  &.import {
    background: var(--color-background, #f5f5f5);
    color: var(--color-text, #333);

    &:hover:not(:disabled) {
      background: var(--color-primary-light, #c7fcbb);
      color: var(--color-primary, #7dd3a8);
    }
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.backup-progress-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--color-text-secondary, #888);
  background: var(--color-background, #f5f5f5);
  border-radius: 8px;
  margin-top: 8px;
}

.backup-progress-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--color-border, #ddd);
  border-top-color: var(--color-primary, #7dd3a8);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.backup-hint {
  font-size: 12px;
  color: var(--color-text-muted, #999);
  text-align: center;
  margin: 0;
}

// 危險區域
.danger-zone {
  background: rgba(239, 68, 68, 0.05);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 16px;
  padding: 20px;
}

.danger-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
  color: #dc2626;
  margin-bottom: 16px;

  svg {
    width: 24px;
    height: 24px;
  }
}

.danger-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 14px;
  background: #dc2626;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  color: white;
  cursor: pointer;
  transition: all 0.2s;

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover {
    background: #b91c1c;
  }
}

.danger-hint {
  font-size: 12px;
  color: #dc2626;
  text-align: center;
  margin: 12px 0 0;
}

// ===== 自動備份樣式 =====

.auto-backup-section {
  padding: 8px 0;
}

.backup-folder-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 0;
}

.backup-folder-label {
  font-size: 13px;
  color: var(--color-text-secondary, #64748b);
  white-space: nowrap;
}

.backup-folder-name {
  font-size: 13px;
  color: var(--color-text, #1e293b);
  display: flex;
  align-items: center;
  gap: 4px;
}

.backup-folder-clear {
  background: none;
  border: none;
  color: var(--color-text-secondary, #94a3b8);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  border-radius: 4px;
  &:hover {
    color: #dc2626;
    background: rgba(220, 38, 38, 0.1);
  }
}

.backup-permission-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #d97706;
  padding: 6px 10px;
  background: rgba(217, 119, 6, 0.08);
  border-radius: 8px;
  margin: 4px 0;
}

.backup-interval-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 8px 0;
  font-size: 13px;
  color: var(--color-text-secondary, #64748b);
}

.backup-last-info {
  font-size: 12px;
  color: var(--color-text-secondary, #94a3b8);
  padding: 4px 0;
}

// ===== 配置文件樣式 =====

.profiles-section {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 16px;
  padding: 16px;
}

.profiles-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.profiles-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #333);
}

.add-profile-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: linear-gradient(135deg, #a8e6cf, #7dd3a8);
  border: none;
  border-radius: 8px;
  font-size: 12px;
  color: white;
  cursor: pointer;
  transition: all 0.2s;

  svg {
    width: 16px;
    height: 16px;
  }

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(125, 211, 168, 0.4);
  }
}

.profiles-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.profile-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--color-background, #f5f5f5);
  border: 2px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.25s ease;

  &:hover {
    background: linear-gradient(
      135deg,
      rgba(168, 230, 207, 0.15),
      rgba(125, 211, 168, 0.08)
    );
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(125, 211, 168, 0.15);
  }

  &.active {
    border-color: var(--color-primary, #7dd3a8);
    background: linear-gradient(
      135deg,
      rgba(168, 230, 207, 0.25),
      rgba(125, 211, 168, 0.12)
    );
    box-shadow: 0 2px 10px rgba(125, 211, 168, 0.2);
  }
}

.profile-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.profile-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #333);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-model {
  font-size: 12px;
  color: var(--color-text-muted, #999);
}

.profile-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.profile-action-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface, rgba(255, 255, 255, 0.6));
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;

  svg {
    width: 15px;
    height: 15px;
    color: var(--color-text-muted, #aaa);
  }

  &:hover {
    background: var(--color-surface, #fff);
    border-color: var(--color-primary, #7dd3a8);

    svg {
      color: var(--color-primary, #7dd3a8);
    }
  }

  &.delete:hover {
    border-color: #f44336;

    svg {
      color: #e53e3e;
    }
  }
}

.profile-rename-input {
  width: 100%;
  padding: 6px 10px;
  font-size: 14px;
  font-weight: 500;
  border: 1.5px solid var(--color-primary, #7dd3a8);
  border-radius: 8px;
  background: var(--color-surface, #fff);
  color: var(--color-text, #333);
  outline: none;
  box-shadow: 0 0 0 3px rgba(125, 211, 168, 0.15);

  &:focus {
    box-shadow: 0 0 0 3px rgba(125, 211, 168, 0.3);
  }
}

.profiles-empty {
  text-align: center;
  padding: 20px;
  color: var(--color-text-muted, #999);
  font-size: 13px;
}

.section-divider {
  height: 1px;
  background: var(--color-border, #e2e8f0);
  margin: 16px 0;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text, #333);
  margin: 0 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;

  &::before {
    content: "";
    width: 4px;
    height: 16px;
    background: linear-gradient(135deg, #a8e6cf, #7dd3a8);
    border-radius: 2px;
  }
}

// ===== 備用 API 樣式 =====

.toggle-item.highlight {
  background: linear-gradient(
    135deg,
    rgba(168, 230, 207, 0.2),
    rgba(125, 211, 168, 0.1)
  );
  border: 1px solid var(--color-primary, #7dd3a8);
}

.toggle-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.toggle-desc {
  font-size: 12px;
  color: var(--color-text-muted, #999);
}

.task-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.task-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  background: var(--color-surface, #fff);
  border: 2px solid var(--color-border, #e2e8f0);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;

  input {
    display: none;
  }

  &:hover {
    border-color: var(--color-primary, #7dd3a8);
  }

  &.active {
    border-color: var(--color-primary, #7dd3a8);
    background: var(--color-primary-light, #c7fcbb);
  }
}

.task-icon {
  width: 24px;
  height: 24px;
  color: var(--color-primary, #7dd3a8);
}

.task-name {
  font-size: 11px;
  color: var(--color-text, #333);
  text-align: center;
}

.auxiliary-disabled-hint {
  text-align: center;
  padding: 30px 20px;
  color: var(--color-text-muted, #999);

  svg {
    width: 40px;
    height: 40px;
    margin-bottom: 12px;
    color: var(--color-primary, #7dd3a8);
  }

  p {
    font-size: 13px;
    margin: 6px 0;
  }
}

// ===== 彈窗樣式 =====

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100dvh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 20px;
}

.profile-modal {
  background: white;
  border-radius: 20px;
  padding: 24px;
  width: 100%;
  max-width: 340px;

  h3 {
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text, #333);
    margin: 0 0 16px;
    text-align: center;
  }

  .soft-input {
    margin-bottom: 16px;
  }

  &.confirm-modal {
    text-align: center;

    .confirm-icon {
      width: 56px;
      height: 56px;
      margin: 0 auto 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #a8e6cf, #7dd3a8);
      border-radius: 50%;

      svg {
        width: 28px;
        height: 28px;
        color: white;
      }
    }

    .confirm-desc {
      font-size: 14px;
      color: var(--color-text-secondary, #666);
      margin: 0 0 16px;
      line-height: 1.6;
    }

    .modal-btn.confirm {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;

      svg {
        width: 16px;
        height: 16px;
      }
    }
  }
}

.modal-actions {
  display: flex;
  gap: 12px;
}

.modal-btn {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &.cancel {
    background: var(--color-background, #f5f5f5);
    color: var(--color-text-secondary, #666);

    &:hover {
      background: #e2e8f0;
    }
  }

  &.confirm {
    background: linear-gradient(135deg, #a8e6cf, #7dd3a8);
    color: white;

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(125, 211, 168, 0.4);
    }
  }
}

.save-btn {
  background: linear-gradient(135deg, #a8e6cf, #7dd3a8) !important;
  color: white !important;
}

// 功能入口卡片
.feature-card {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 16px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;

  &:hover {
    border-color: var(--color-primary, #7dd3a8);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(125, 211, 168, 0.2);
  }

  .feature-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #a8e6cf, #7dd3a8);
    border-radius: 12px;
    flex-shrink: 0;

    svg {
      width: 24px;
      height: 24px;
      color: white;
    }
  }

  .feature-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .feature-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text, #333);
  }

  .feature-desc {
    font-size: 13px;
    color: var(--color-text-muted, #999);
  }

  .feature-arrow {
    width: 24px;
    height: 24px;
    color: var(--color-text-muted, #999);
    flex-shrink: 0;
  }
}

// 保存成功通知
.save-toast {
  position: fixed;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: linear-gradient(135deg, #a8e6cf, #7dd3a8);
  color: white;
  border-radius: 30px;
  font-size: 14px;
  font-weight: 500;
  box-shadow: 0 4px 20px rgba(125, 211, 168, 0.4);
  z-index: 1000;

  svg {
    width: 20px;
    height: 20px;
  }
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}

// 系統推播通知卡片
.push-notification-card {
  background: var(--color-surface, rgba(255, 255, 255, 0.06));
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 12px;

  .toggle-item.highlight {
    margin-bottom: 0;
    border-radius: 12px 12px 0 0;
  }
}

.push-permission-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-top: 1px solid var(--color-border, rgba(255, 255, 255, 0.06));
}

.push-permission-label {
  font-size: 12px;
  color: var(--color-text-secondary, #999);
  display: flex;
  align-items: center;
  gap: 6px;
}

.push-permission-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;

  &.granted {
    background: rgba(125, 211, 168, 0.15);
    color: #7dd3a8;
  }

  &.denied {
    background: rgba(255, 107, 107, 0.15);
    color: #ff6b6b;
  }

  &.default {
    background: rgba(255, 179, 71, 0.15);
    color: #ffb347;
  }
}

.push-permission-btn {
  padding: 4px 12px;
  border: none;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  background: var(--color-primary, #7dd3a8);
  color: #fff;
  transition: opacity 0.2s;

  &:hover {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: var(--color-text-secondary, #999);
  }

  &.test {
    background: rgba(137, 207, 240, 0.2);
    color: #89cff0;
  }
}

.push-permission-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.push-denied-hint {
  padding: 10px 16px 12px;
  font-size: 12px;
  color: var(--color-text-secondary, #999);
  line-height: 1.6;
  border-top: 1px solid var(--color-border, rgba(255, 255, 255, 0.06));

  ul {
    margin: 6px 0 0;
    padding-left: 18px;

    li {
      margin-bottom: 4px;
    }
  }
}

// ── 雲端推送鬧鐘 ──────────────────────────────

.cloud-push-card {
  margin-bottom: 12px;
}

.cloud-push-options {
  padding: 12px 16px 16px;
  border-top: 1px solid var(--color-border, rgba(255, 255, 255, 0.06));

  .setting-group {
    margin-bottom: 12px;
  }

  .discord-link-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 14px;
    font-size: 13px;
    background: #5865f2;
    color: #fff;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.2s;

    &:hover {
      background: #4752c4;
    }

    &:active {
      background: #3c45a5;
    }
  }
}

.cloud-push-dnd-times {
  display: flex;
  align-items: center;
  margin-top: 6px;

  .soft-input {
    flex: 1;
  }
}

.cloud-push-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.cloud-push-status {
  font-size: 12px;
  color: var(--color-text-secondary, #999);
  line-height: 1.6;
}

.incoming-ringtone-card {
  background: var(--color-surface, rgba(255, 255, 255, 0.06));
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 16px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  backdrop-filter: blur(10px);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.incoming-ringtone-card:hover {
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06);
}

.incoming-ringtone-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px dashed var(--color-border, rgba(255, 255, 255, 0.1));
}

.incoming-ringtone-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  background: rgba(var(--primary-rgb, 125, 211, 168), 0.15);
  color: var(--primary, #7dd3a8);
}

.incoming-ringtone-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text, #333);
  margin-bottom: 4px;
}

.incoming-ringtone-desc {
  font-size: 12px;
  color: var(--color-text-secondary, #999);
  line-height: 1.4;
}

.incoming-ringtone-file-row {
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: rgba(0, 0, 0, 0.03);
  padding: 12px 14px;
  border-radius: 10px;
}

.incoming-ringtone-file-name {
  font-size: 13px;
  color: var(--color-text, #444);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 6px;
}
.incoming-ringtone-file-name::before {
  content: "🎵";
  font-size: 14px;
}

.incoming-ringtone-actions {
  margin-top: 24px;
  display: flex;
  justify-content: center;
}

.incoming-ringtone-actions .push-permission-btn.test {
  width: 100%;
  padding: 12px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 10px;
  background: transparent;
  color: var(--primary, #7dd3a8);
  border: 2px solid rgba(var(--primary-rgb, 125, 211, 168), 0.3);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.incoming-ringtone-actions .push-permission-btn.test:hover {
  background: rgba(var(--primary-rgb, 125, 211, 168), 0.1);
  transform: translateY(-1px);
}
.incoming-ringtone-actions .push-permission-btn.test:active {
  transform: scale(0.98);
}

.incoming-ringtone-actions .push-permission-btn.test.playing {
  border-color: rgba(255, 107, 107, 0.4);
  color: #ff6b6b;
  background: rgba(255, 107, 107, 0.05);
}

/* Custom file upload look */
.ringtone-upload-wrapper {
  position: relative;
  overflow: hidden;
  display: inline-block;
  width: 100%;
}
.ringtone-upload-wrapper input[type="file"] {
  position: absolute;
  left: 0;
  top: 0;
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}
.ringtone-upload-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 14px;
  background: var(--color-surface, #f8f9fa);
  border: 2px dashed var(--color-border, rgba(255, 255, 255, 0.1));
  border-radius: 12px;
  color: var(--color-text-secondary, #999);
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s ease;
}
.ringtone-upload-wrapper:hover .ringtone-upload-btn {
  background: rgba(var(--primary-rgb, 125, 211, 168), 0.05);
  border-color: var(--primary, #7dd3a8);
  color: var(--primary, #7dd3a8);
}
</style>
