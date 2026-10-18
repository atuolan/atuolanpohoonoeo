<script setup lang="ts">
/** 設定首頁：目前配置卡片 + 分組清單，每列右邊顯示目前狀態。 */
import { loadBackupSettings } from "@/services/AutoBackupService";
import {
  detectPlatform,
  loadPhoneCalendarSettings,
  PHONE_CALENDAR_METHOD_LABELS,
  resolvePhoneCalendarMethod,
} from "@/services/phoneCalendar";
import { AUXILIARY_TASKS, useNotificationStore, useSettingsStore } from "@/stores";
import type { RoutableTaskType } from "@/stores/settings";
import { useAnnouncementStore } from "@/stores/announcements";
import { useCloudPushStore } from "@/stores/cloudPush";
import { useSelfHostedSyncStore } from "@/stores/selfHostedSync";
import {
  Archive,
  AudioLines,
  Bell,
  Brain,
  ChevronRight,
  CupSoda,
  FileText,
  HardDrive,
  Mailbox,
  MapPin,
  Mic,
  MonitorSmartphone,
  Moon,
  Phone,
  Plug,
  Regex,
  Sparkles,
  Split,
  SquareTerminal,
} from "lucide-vue-next";
import { computed, onActivated, onMounted, ref, type Component } from "vue";
import { useApiProfiles } from "./composables/useApiProfiles";
import { formatRelativeTime, getEndpointHost, getProviderLabel } from "./settingsHelpers";
import { RINGTONE_OPTIONS, type SettingsPageId } from "./settingsOptions";

const emit = defineEmits<{
  (e: "open", page: SettingsPageId): void;
  (e: "open-prompt-manager"): void;
  (e: "open-regex-scripts"): void;
  (e: "open-mcp"): void;
  (e: "switch-profile"): void;
}>();

const settingsStore = useSettingsStore();
const notificationStore = useNotificationStore();
const cloudPushStore = useCloudPushStore();
const syncStore = useSelfHostedSyncStore();
const announcementStore = useAnnouncementStore();
const { isFormDirty, currentProfile } = useApiProfiles();

// ===== 需要另外讀的摘要 =====
const lastBackupAt = ref<number | null>(null);
const storagePercent = ref<number | null>(null);

async function refreshSummaries() {
  try {
    const backup = await loadBackupSettings();
    lastBackupAt.value = backup.lastBackupAt ?? null;
  } catch {
    lastBackupAt.value = null;
  }
  try {
    if ("storage" in navigator && "estimate" in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      if (estimate.quota) {
        storagePercent.value = Math.round(((estimate.usage || 0) / estimate.quota) * 100);
      }
    }
  } catch {
    storagePercent.value = null;
  }
}

// 加到手機日曆的方式存在這台裝置，回到首頁時重讀
const phoneCalendarMethodLabel = ref("");
function refreshPhoneCalendarMethod() {
  const method = resolvePhoneCalendarMethod(loadPhoneCalendarSettings().method, detectPlatform());
  phoneCalendarMethodLabel.value = PHONE_CALENDAR_METHOD_LABELS[method];
}

onMounted(refreshSummaries);
onActivated(refreshSummaries);
onMounted(refreshPhoneCalendarMethod);
onActivated(refreshPhoneCalendarMethod);

// ===== 清單 =====
type Hue = "mint" | "sky" | "lavender" | "butter" | "peach" | "slate" | "pink" | "grey";
interface HomeItem {
  key: string;
  label: string;
  icon: Component;
  hue: Hue;
  value?: string;
  warn?: boolean;
  onClick: () => void;
}

const routedCount = computed(
  () =>
    AUXILIARY_TASKS.filter(
      (task) => !!settingsStore.auxiliary.taskBindings[task.id as RoutableTaskType],
    ).length,
);

const groups = computed<Array<{ title: string; items: HomeItem[] }>>(() => [
  {
    title: "AI 與對話",
    items: [
      {
        key: "model",
        label: "主要模型",
        icon: Sparkles,
        hue: "mint",
        value: isFormDirty.value ? "未保存" : `${settingsStore.profiles.length} 個配置`,
        warn: isFormDirty.value,
        onClick: () => emit("open", "model"),
      },
      {
        key: "auxiliary",
        label: "備用模型與分流",
        icon: Split,
        hue: "sky",
        value: settingsStore.auxiliary.enabled
          ? routedCount.value
            ? `${routedCount.value} 項分流`
            : "已開啟"
          : "關閉",
        onClick: () => emit("open", "auxiliary"),
      },
      {
        key: "memory",
        label: "向量記憶",
        icon: Brain,
        hue: "lavender",
        value: settingsStore.vectorMemoryEnabled
          ? settingsStore.embeddingMode === "api"
            ? "遠端 API"
            : "本地推理"
          : "關閉",
        onClick: () => emit("open", "memory"),
      },
      {
        key: "prompts",
        label: "提示詞管理",
        icon: FileText,
        hue: "butter",
        onClick: () => emit("open-prompt-manager"),
      },
      {
        key: "regex",
        label: "正則腳本",
        icon: Regex,
        hue: "peach",
        onClick: () => emit("open-regex-scripts"),
      },
      {
        key: "mcp",
        label: "MCP 伺服器",
        icon: Plug,
        hue: "slate",
        value: settingsStore.mcp.servers.length ? `${settingsStore.mcp.servers.length} 台` : "未設定",
        onClick: () => emit("open-mcp"),
      },
    ],
  },
  {
    title: "聲音與通話",
    items: [
      {
        key: "voiceMessage",
        label: "語音訊息",
        icon: Mic,
        hue: "pink",
        value: settingsStore.audio.sttEnabled ? "轉文字 開" : "轉文字 關",
        onClick: () => emit("open", "voiceMessage"),
      },
      {
        key: "tts",
        label: "語音合成（MiniMax）",
        icon: AudioLines,
        hue: "lavender",
        value: settingsStore.minimaxTTS.apiKey ? "已設定" : "未設定",
        onClick: () => emit("open", "tts"),
      },
      {
        key: "call",
        label: "通話",
        icon: Phone,
        hue: "mint",
        value:
          RINGTONE_OPTIONS.find((o) => o.id === settingsStore.incomingCallRingtone.selectedRingtoneId)
            ?.name ?? "",
        onClick: () => emit("open", "call"),
      },
    ],
  },
  {
    title: "手機功能",
    items: [
      {
        key: "notification",
        label: "通知",
        icon: Bell,
        hue: "peach",
        value:
          notificationStore.settings.pushEnabled || cloudPushStore.enabled ? "已開啟" : "關閉",
        onClick: () => emit("open", "notification"),
      },
      {
        key: "background",
        label: "背景執行",
        icon: Moon,
        hue: "butter",
        value:
          settingsStore.backgroundAudioEnabled || settingsStore.backgroundGenerationEnabled
            ? "開啟"
            : "關閉",
        onClick: () => emit("open", "background"),
      },
      {
        key: "phone",
        label: "日曆與定位",
        icon: MapPin,
        hue: "mint",
        value: phoneCalendarMethodLabel.value,
        onClick: () => emit("open", "phone"),
      },
    ],
  },
  {
    title: "資料",
    items: [
      {
        key: "backup",
        label: "備份與還原",
        icon: Archive,
        hue: "sky",
        value: lastBackupAt.value ? formatRelativeTime(lastBackupAt.value) : "從未備份",
        onClick: () => emit("open", "backup"),
      },
      {
        key: "sync",
        label: "跨裝置同步",
        icon: MonitorSmartphone,
        hue: "slate",
        value: syncStore.isAuthenticated ? `${syncStore.onlineCount} 台在線` : "未登入",
        onClick: () => emit("open", "sync"),
      },
      {
        key: "storage",
        label: "儲存空間",
        icon: HardDrive,
        hue: "grey",
        value: storagePercent.value != null ? `已用 ${storagePercent.value}%` : undefined,
        onClick: () => emit("open", "storage"),
      },
    ],
  },
  {
    title: "其他",
    items: [
      {
        key: "mailbox",
        label: "信箱",
        icon: Mailbox,
        hue: "peach",
        value: announcementStore.unreadCount > 0 ? `${announcementStore.unreadCount} 張沒拆` : undefined,
        onClick: () => announcementStore.openMailbox(),
      },
      {
        key: "support",
        label: "支持作者",
        icon: CupSoda,
        hue: "pink",
        onClick: () => emit("open", "support"),
      },
      {
        key: "developer",
        label: "開發者選項",
        icon: SquareTerminal,
        hue: "grey",
        onClick: () => emit("open", "developer"),
      },
    ],
  },
]);
</script>

<template>
  <div class="st-page">
    <h1 class="home-title">設定</h1>

    <div class="st-card home-current">
      <button type="button" class="home-current__main" @click="emit('open', 'model')">
        <span class="st-tile st-tile--lg st-tile--mint" aria-hidden="true"><Sparkles /></span>
        <span class="home-current__text">
          <span class="home-current__caption">目前使用的配置</span>
          <template v-if="currentProfile">
            <span class="home-current__name">
              <span class="home-current__name-text">{{ currentProfile.name }}</span>
              <!-- 兩個標籤會把名稱擠掉，未保存時只留未保存 -->
              <span v-if="isFormDirty" class="st-chip st-chip--warn">未保存</span>
              <span v-else class="st-chip">{{ getProviderLabel(settingsStore.api.provider) }}</span>
            </span>
            <span class="home-current__meta">
              {{ settingsStore.api.model || "未設置模型" }} ·
              {{ getEndpointHost(settingsStore.api.endpoint) || "未設定端點" }}
            </span>
          </template>
          <template v-else>
            <span class="home-current__name">還沒有配置</span>
            <span class="home-current__meta">點這裡設定 API 端點、密鑰和模型</span>
          </template>
        </span>
      </button>
      <button
        v-if="settingsStore.profiles.length > 1"
        type="button"
        class="st-btn st-btn--soft home-current__switch"
        @click="emit('switch-profile')"
      >
        切換
      </button>
    </div>

    <section v-for="group in groups" :key="group.title" class="st-group">
      <h2 class="st-group__title">{{ group.title }}</h2>
      <div class="st-card">
        <button
          v-for="item in group.items"
          :key="item.key"
          type="button"
          class="st-row st-row--tiled"
          :class="{ 'st-row--warn': item.warn }"
          @click="item.onClick"
        >
          <span class="st-tile" :class="`st-tile--${item.hue}`" aria-hidden="true">
            <component :is="item.icon" />
          </span>
          <span class="st-row__main">
            <span class="st-row__label">{{ item.label }}</span>
          </span>
          <span v-if="item.value" class="st-row__value">{{ item.value }}</span>
          <ChevronRight class="st-row__chevron" aria-hidden="true" />
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.home-title {
  margin: 4px 20px 0;
  font-size: 32px;
  line-height: 1.25;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.home-current {
  margin-top: 18px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px 0 0;

  > * + *::before {
    display: none;
  }
}

.home-current__main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 0 14px 16px;
  border: 0;
  background: transparent;
  font: inherit;
  color: var(--st-text);
  text-align: left;
  cursor: pointer;
}

.home-current__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.home-current__caption {
  font-size: 12px;
  line-height: 1.4;
  color: var(--st-sub);
}

.home-current__name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 17px;
  line-height: 1.4;
  font-weight: 700;
}

.home-current__name-text {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.home-current__meta {
  font-size: 13px;
  line-height: 1.4;
  color: var(--st-sub);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.home-current__switch {
  flex: none;
  height: 44px;
  border-radius: 999px;
}
</style>
