<script setup lang="ts">
/**
 * 設定 App 外殼：首頁分組清單 → 點進各子頁。
 * 子頁放在 KeepAlive 裡，回首頁不會中斷進行中的導出、測試等動作；
 * 整個設定畫面關掉時才會真正卸載。
 */
import ProfileSwitchSheet from "@/components/settings/ProfileSwitchSheet.vue";
import SettingsPageLoadError from "@/components/settings/SettingsPageLoadError.vue";
import SettingsHome from "@/components/settings/SettingsHome.vue";
import {
  SETTINGS_PAGE_TITLES,
  type SettingsPageId,
} from "@/components/settings/settingsOptions";
import { useSettingsStore } from "@/stores";
import { useCloudPushStore } from "@/stores/cloudPush";
import { useSelfHostedSyncStore } from "@/stores/selfHostedSync";
import { ChevronLeft } from "lucide-vue-next";
import {
  computed,
  type AsyncComponentLoader,
  defineAsyncComponent,
  nextTick,
  onMounted,
  ref,
  type Component,
} from "vue";

const emit = defineEmits<{
  (e: "back"): void;
  (e: "open-prompt-manager"): void;
  (e: "open-regex-scripts"): void;
}>();

const settingsStore = useSettingsStore();
const cloudPushStore = useCloudPushStore();
const selfHostedSyncStore = useSelfHostedSyncStore();

type SubPageId = Exclude<SettingsPageId, "home">;

// MCP 伺服器面板：用到才載入
const McpServersPanel = defineAsyncComponent(() => import("@/components/panels/McpServersPanel.vue"));

// 各子頁用到才載入；網頁開著時部署了新版，舊分塊檔會不見，載入失敗改顯示重新載入提示
function lazyPage(loader: AsyncComponentLoader): Component {
  return defineAsyncComponent({ loader, errorComponent: SettingsPageLoadError });
}

const pageComponents: Record<SubPageId, Component> = {
  model: lazyPage(() => import("@/components/settings/pages/ModelPage.vue")),
  auxiliary: lazyPage(() => import("@/components/settings/pages/AuxiliaryPage.vue")),
  memory: lazyPage(() => import("@/components/settings/pages/MemoryPage.vue")),
  voiceMessage: lazyPage(() => import("@/components/settings/pages/VoiceMessagePage.vue")),
  tts: lazyPage(() => import("@/components/settings/pages/TtsPage.vue")),
  call: lazyPage(() => import("@/components/settings/pages/CallPage.vue")),
  notification: lazyPage(() => import("@/components/settings/pages/NotificationPage.vue")),
  background: lazyPage(() => import("@/components/settings/pages/BackgroundPage.vue")),
  phone: lazyPage(() => import("@/components/settings/pages/PhonePage.vue")),
  backup: lazyPage(() => import("@/components/settings/pages/BackupPage.vue")),
  sync: lazyPage(() => import("@/components/settings/pages/SyncPage.vue")),
  storage: lazyPage(() => import("@/components/settings/pages/StoragePage.vue")),
  support: lazyPage(() => import("@/components/settings/pages/SupportPage.vue")),
  developer: lazyPage(() => import("@/components/settings/pages/DeveloperPage.vue")),
};

const page = ref<SettingsPageId>("home");
const currentPage = computed(() =>
  page.value === "home" ? null : pageComponents[page.value as SubPageId],
);
const pageTitle = computed(() =>
  page.value === "home" ? "設定" : SETTINGS_PAGE_TITLES[page.value as SubPageId],
);

const scroller = ref<HTMLElement | null>(null);
let homeScrollTop = 0;

function animateIn(fromRight: boolean) {
  const el = scroller.value;
  if (!el || typeof el.animate !== "function") return;
  el.animate(
    [
      { opacity: 0, transform: `translateX(${fromRight ? 18 : -18}px)` },
      { opacity: 1, transform: "none" },
    ],
    { duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
  );
}

async function openPage(id: SettingsPageId) {
  if (page.value === "home") homeScrollTop = scroller.value?.scrollTop ?? 0;
  page.value = id;
  showSwitchSheet.value = false;
  await nextTick();
  if (scroller.value) scroller.value.scrollTop = 0;
  animateIn(true);
}

async function goHome() {
  page.value = "home";
  await nextTick();
  if (scroller.value) scroller.value.scrollTop = homeScrollTop;
  animateIn(false);
}

/** 子頁先回首頁，首頁再離開設定（App 的右滑返回也走這裡） */
function handleBack() {
  if (page.value !== "home") {
    void goHome();
    return;
  }
  emit("back");
}

defineExpose({ handleBack });

const showSwitchSheet = ref(false);
const showMcpPanel = ref(false);

onMounted(async () => {
  await settingsStore.loadSettings();
  await cloudPushStore.loadSettings();
  await selfHostedSyncStore.loadSettings();
  if (selfHostedSyncStore.guardAlert) {
    await selfHostedSyncStore.clearGuardAlert();
  }
});
</script>

<template>
  <div class="screen-container settings-screen st-root">
    <div v-if="settingsStore.isLoading" class="st-loading" role="status">
      <span class="st-loading__spinner" />
      <span>載入中…</span>
    </div>

    <header class="st-header">
      <button
        v-if="page === 'home'"
        type="button"
        class="st-header__back"
        aria-label="返回"
        @click="handleBack"
      >
        <ChevronLeft aria-hidden="true" />
      </button>
      <button v-else type="button" class="st-header__back st-header__back--label" @click="handleBack">
        <ChevronLeft aria-hidden="true" />設定
      </button>
      <h1 v-if="page !== 'home'" class="st-header__title">{{ pageTitle }}</h1>
    </header>

    <main ref="scroller" class="st-scroll">
      <SettingsHome
        v-show="page === 'home'"
        @open="openPage"
        @open-prompt-manager="emit('open-prompt-manager')"
        @open-regex-scripts="emit('open-regex-scripts')"
        @open-mcp="showMcpPanel = true"
        @switch-profile="showSwitchSheet = true"
      />
      <KeepAlive>
        <component :is="currentPage" v-if="currentPage" :key="page" />
      </KeepAlive>
    </main>

    <ProfileSwitchSheet
      :open="showSwitchSheet"
      @close="showSwitchSheet = false"
      @manage="openPage('model')"
    />

    <McpServersPanel v-if="showMcpPanel" @close="showMcpPanel = false" />
  </div>
</template>

<style lang="scss">
// 舊的共用設定樣式原本經由 AuxiliaryApiPanel 全域載入，其他畫面還在用它的 class，照舊載入
@use "../../styles/settings-shared";
@use "@/components/settings/settings-ui.scss";
</style>

<style scoped lang="scss">
.settings-screen {
  background: var(--st-bg);
  color: var(--st-text);
}

.st-header {
  position: relative;
  z-index: 10;
  flex: none;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  min-height: 56px;
  // 寬螢幕時跟內容（最寬 720px）對齊
  padding: var(--safe-top, 0px) max(calc(8px + var(--safe-right, 0px)), calc((100% - 720px) / 2 + 8px)) 0
    max(calc(8px + var(--safe-left, 0px)), calc((100% - 720px) / 2 + 8px));
  box-sizing: border-box;
  background: var(--st-bg);
}

.st-header__back {
  justify-self: start;
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 44px;
  height: 44px;
  padding: 0 10px 0 2px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  font: inherit;
  font-size: 16px;
  color: var(--st-text);
  cursor: pointer;

  svg {
    width: 26px;
    height: 26px;
  }

  &--label {
    color: var(--st-accent-ink);
  }
}

.st-header__title {
  grid-column: 2;
  margin: 0;
  font-size: 17px;
  line-height: 1.4;
  font-weight: 700;
  text-align: center;
  white-space: nowrap;
}

.st-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

.st-loading {
  position: absolute;
  inset: 0;
  z-index: 80;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: color-mix(in srgb, var(--st-bg) 85%, transparent);
  font-size: 14px;
  color: var(--st-sub);
}

.st-loading__spinner {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 3px solid color-mix(in srgb, var(--st-accent) 30%, transparent);
  border-top-color: var(--st-accent-strong);
  animation: st-spin 0.9s linear infinite;
}

@keyframes st-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
