<script setup lang="ts">
/** 備份與還原：手動導出／導入、自動備份到本地、GitHub 雲端備份。 */
import {
  BackupCancelledError,
  checkPermission as checkBackupPermission,
  clearBackupDirectory,
  DEFAULT_BACKUP_SETTINGS,
  getSelectedFolderName,
  isFileSystemAccessSupported,
  loadBackupSettings,
  performBackup,
  pickBackupDirectory,
  requestPermission as requestBackupPermission,
  saveBackupSettings,
  startAutoBackup,
  stopAutoBackup,
  type AutoBackupSettings,
  type BackupBatchReady,
  type BackupBatchReadyHandler,
  type BackupProgressCallback,
} from "@/services/AutoBackupService";
import {
  DEFAULT_GITHUB_SETTINGS,
  DEFAULT_UPSTREAM_REPO,
  deleteRemoteBackup,
  downloadFromGitHub,
  listRemoteBackups,
  loadGitHubSettings,
  saveGitHubSettings,
  validateConnection,
  type GitHubBackupProgress,
  type GitHubBackupSettings,
} from "@/services/GitHubBackupService";
import { isIosApp, isNativeApp, nativeBackupLocation } from "@/native/platform";
import { useGitHubBackupStore } from "@/stores/githubBackup";
import { Download, Eye, EyeOff, Upload } from "lucide-vue-next";
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { useBackupImport } from "../composables/useBackupImport";
import { formatBackupTime, formatSize } from "../settingsHelpers";
import SettingsDialog from "../ui/SettingsDialog.vue";
import SettingsGroup from "../ui/SettingsGroup.vue";
import SettingsRow from "../ui/SettingsRow.vue";
import SettingsSelectRow from "../ui/SettingsSelectRow.vue";
import SettingsSwitchRow from "../ui/SettingsSwitchRow.vue";

// 手動和自動備份共用：資料量大時可以先砍掉最大的一塊
const excludeChatImages = ref(false);

// ===== 導入 =====
const fileInput = ref<HTMLInputElement | null>(null);
const { isImporting, importProgress, handleFileImport, clearImportWatchdog } = useBackupImport();

// ===== 自動備份狀態 =====
const autoBackupSettings = reactive<AutoBackupSettings>({ ...DEFAULT_BACKUP_SETTINGS });
const folderName = ref<string | null>(null);
const folderPermission = ref<string>("no-handle");
const isBackingUp = ref(false);
const isExporting = ref(false);
const backupProgress = ref("");
const fsaaSupported = isFileSystemAccessSupported();
/** App 裡備份直接寫進手機資料夾，不用選資料夾也不用下載 */
const nativeApp = isNativeApp();
const nativeBackupWhere = nativeBackupLocation();
// iOS 的備份放在 App 自己的資料夾，解除安裝會一起刪掉
const nativeUninstallNote = isIosApp()
  ? "解除安裝 App 會一起刪掉，重要的備份請另外存到 iCloud 雲碟或電腦。"
  : "解除安裝 App 也不會刪掉。";

async function refreshAutoBackupState() {
  const saved = await loadBackupSettings();
  Object.assign(autoBackupSettings, saved);
  folderName.value = await getSelectedFolderName();
  folderPermission.value = await checkBackupPermission();
}

// ===== 備份交付 =====
// 打包動輒數分鐘，點「導出」時的使用者手勢早就過期，share／存檔面板會被瀏覽器拒絕。
// 所以打包完先停下來，等使用者再點一次「儲存」，在那次點擊裡交付。
const pendingBatch = ref<BackupBatchReady | null>(null);
const batchDelivering = ref(false);
const batchMessage = ref("");
/** 一次交付整批不支援或失敗時，改成逐個儲存 */
const batchOneByOne = ref(false);
const batchSaved = ref<boolean[]>([]);
let batchSettle: { resolve: () => void; reject: (err: Error) => void } | null = null;

/** 整份備份只有一個檔案 */
function isSingleFileBackup(batch: BackupBatchReady): boolean {
  return batch.isLast && batch.parts.length === 1 && batch.parts[0].index === 0;
}

/** 這一批就是整份備份（全部分包一次交付） */
function isWholeBackupBatch(batch: BackupBatchReady): boolean {
  return batch.isLast && batch.parts[0].index === 0;
}

function describeBackupBatch(batch: BackupBatchReady): string {
  if (isSingleFileBackup(batch)) return "備份已準備好";
  if (isWholeBackupBatch(batch)) return `備份已準備好（共 ${batch.parts.length} 個檔案）`;
  const first = batch.parts[0].index + 1;
  const last = batch.parts[batch.parts.length - 1].index + 1;
  return first === last ? `第 ${first} 部分已準備好` : `第 ${first}–${last} 部分已準備好`;
}

const batchBytes = computed(() =>
  pendingBatch.value ? pendingBatch.value.parts.reduce((sum, part) => sum + part.bytes, 0) : 0,
);

const onBackupBatchReady: BackupBatchReadyHandler = (batch) => {
  // 只有一個檔案且點擊時效還在（資料量小、幾秒就打包完）：直接交付，不多問一次
  if (isSingleFileBackup(batch) && (navigator as any).userActivation?.isActive) {
    return batch.deliverOne(0).then(() => undefined);
  }
  return new Promise<void>((resolve, reject) => {
    batchMessage.value = "";
    batchOneByOne.value = false;
    batchSaved.value = batch.parts.map(() => false);
    pendingBatch.value = batch;
    batchSettle = { resolve, reject };
  });
};

function settleBatch(err?: Error) {
  pendingBatch.value = null;
  const settle = batchSettle;
  batchSettle = null;
  if (err) settle?.reject(err);
  else settle?.resolve();
}

async function deliverBatch() {
  const batch = pendingBatch.value;
  if (!batch || batchDelivering.value) return;
  batchDelivering.value = true;
  try {
    // 必須是這個 click handler 裡的第一個 await，手勢才有效
    const via = await batch.deliverAll();
    if (via === "cancelled") {
      batchMessage.value = "已取消儲存，可以再按一次重試";
      return;
    }
    if (via === "unsupported") {
      batchOneByOne.value = true;
      batchMessage.value = "這個瀏覽器無法一次儲存多個檔案，請逐一儲存";
      return;
    }
    settleBatch();
  } catch (e) {
    batchMessage.value = `儲存失敗：${e instanceof Error ? e.message : String(e)}，可以再試一次`;
  } finally {
    batchDelivering.value = false;
  }
}

async function deliverBatchFile(i: number) {
  const batch = pendingBatch.value;
  if (!batch || batchDelivering.value) return;
  batchDelivering.value = true;
  try {
    // 必須是這個 click handler 裡的第一個 await，手勢才有效
    const via = await batch.deliverOne(i);
    if (via === "cancelled") {
      batchMessage.value = "已取消儲存，可以再按一次重試";
      return;
    }
    batchMessage.value = "";
    batchSaved.value[i] = true;
    if (batchSaved.value.every(Boolean)) settleBatch();
  } catch (e) {
    batchMessage.value = `儲存失敗：${e instanceof Error ? e.message : String(e)}，可以再試一次`;
  } finally {
    batchDelivering.value = false;
  }
}

function cancelPendingBackup(skipConfirm = false) {
  const batch = pendingBatch.value;
  if (!batch) return;
  if (
    !skipConfirm &&
    !isSingleFileBackup(batch) &&
    !confirm("取消後這份備份會缺少部分檔案，無法完整還原。確定取消？")
  ) {
    return;
  }
  settleBatch(new BackupCancelledError());
}

const onBackupProgress: BackupProgressCallback = (info) => {
  backupProgress.value =
    info.current && info.total ? `${info.phase} (${info.current}/${info.total})` : info.phase;
};

// ===== 手動導出 =====
async function exportData() {
  isExporting.value = true;
  try {
    const result = await performBackup(true, onBackupProgress, {
      excludeChatImages: excludeChatImages.value,
      onBatchReady: onBackupBatchReady,
    });
    if (!result.success && result.message !== "已取消備份") {
      alert("導出失敗：" + result.message);
    } else if (result.success && nativeApp) {
      // App 裡沒有下載提示，告訴使用者檔案放在哪
      alert(`✓ ${result.message}`);
    }
  } catch (e) {
    console.error("導出失敗:", e);
    alert("導出失敗：" + (e instanceof Error ? e.message : String(e)));
  } finally {
    isExporting.value = false;
    backupProgress.value = "";
    // 讓「上次導出」顯示這次的結果（含交付方式與分包數）
    await refreshAutoBackupState().catch(() => {});
  }
}

// ===== 自動備份 =====
async function toggleAutoBackup() {
  autoBackupSettings.enabled = !autoBackupSettings.enabled;
  await saveBackupSettings({ ...autoBackupSettings });
  if (autoBackupSettings.enabled) await startAutoBackup();
  else stopAutoBackup();
}

async function saveBackupInterval() {
  await saveBackupSettings({ ...autoBackupSettings });
  if (autoBackupSettings.enabled) await startAutoBackup(); // 重啟定時器
}

async function pickFolder() {
  const ok = await pickBackupDirectory();
  if (ok) {
    folderName.value = await getSelectedFolderName();
    folderPermission.value = await checkBackupPermission();
  }
}

async function clearFolder() {
  await clearBackupDirectory();
  folderName.value = null;
  folderPermission.value = "no-handle";
}

async function requestFolderPermission() {
  const ok = await requestBackupPermission();
  folderPermission.value = ok ? "granted" : "denied";
}

async function backupNow() {
  isBackingUp.value = true;
  backupProgress.value = "準備中…";
  try {
    const result = await performBackup(false, onBackupProgress, {
      excludeChatImages: excludeChatImages.value,
      onBatchReady: onBackupBatchReady,
    });
    autoBackupSettings.lastBackupAt = Date.now();
    autoBackupSettings.lastBackupMessage = result.message;
    if (result.success) alert(`✓ ${result.message}`);
    else if (result.message !== "已取消備份") alert(`✗ ${result.message}`);
  } finally {
    isBackingUp.value = false;
    backupProgress.value = "";
  }
}

async function downloadBackup() {
  isBackingUp.value = true;
  backupProgress.value = "準備中…";
  try {
    const result = await performBackup(true, onBackupProgress, {
      excludeChatImages: excludeChatImages.value,
      onBatchReady: onBackupBatchReady,
    });
    autoBackupSettings.lastBackupAt = Date.now();
    autoBackupSettings.lastBackupMessage = result.message;
  } finally {
    isBackingUp.value = false;
    backupProgress.value = "";
  }
}

const intervalOptions = [
  { value: 10, label: "每 10 分鐘" },
  { value: 30, label: "每 30 分鐘" },
  { value: 60, label: "每 1 小時" },
  { value: 120, label: "每 2 小時" },
  { value: 360, label: "每 6 小時" },
  { value: 720, label: "每 12 小時" },
  { value: 1440, label: "每 24 小時" },
];

// ===== GitHub 雲端備份 =====
const ghSettings = reactive<GitHubBackupSettings>({ ...DEFAULT_GITHUB_SETTINGS });
const ghConnected = ref(false);
const ghUsername = ref("");
const ghBusy = ref(false);
const ghProgress = ref("");
const ghBackupList = ref<Array<{ name: string; path: string; createdAt: string }>>([]);
const ghShowToken = ref(false);
const ghShowRestoreList = ref(false);
const ghBackupStore = useGitHubBackupStore();

async function loadGhState() {
  const saved = await loadGitHubSettings();
  Object.assign(ghSettings, saved);
  if (saved.token && saved.repo) {
    const result = await validateConnection();
    ghConnected.value = result.valid;
    ghUsername.value = result.username || "";
  }
}

async function ghConnect() {
  await saveGitHubSettings({ ...ghSettings });
  const result = await validateConnection();
  ghConnected.value = result.valid;
  ghUsername.value = result.username || "";
  if (result.valid) alert(`✓ 已連接：${result.username}`);
  else alert(`✗ ${result.message}`);
}

async function ghDisconnect() {
  ghSettings.token = "";
  ghSettings.repo = "";
  ghConnected.value = false;
  ghUsername.value = "";
  await saveGitHubSettings({ ...ghSettings });
}

async function ghSaveSettings() {
  await saveGitHubSettings({ ...ghSettings });
}

const onGhProgress = (p: GitHubBackupProgress) => {
  if (p.current && p.total && p.total > 0) ghProgress.value = `${p.phase} (${p.current}/${p.total})`;
  else if (p.current) ghProgress.value = `${p.phase} #${p.current}`;
  else ghProgress.value = p.phase;
};

function ghBackup() {
  if (ghBackupStore.busy) return;
  ghBackupStore.startBackup();
}

async function ghToggleRestoreList() {
  ghShowRestoreList.value = !ghShowRestoreList.value;
  if (!ghShowRestoreList.value) return;
  ghBusy.value = true;
  ghProgress.value = "讀取備份列表…";
  try {
    ghBackupList.value = await listRemoteBackups();
  } catch (e) {
    alert(`✗ 讀取失敗：${e instanceof Error ? e.message : String(e)}`);
  } finally {
    ghBusy.value = false;
    ghProgress.value = "";
  }
}

async function ghRestore(backupPath: string) {
  if (!confirm("確定要從雲端還原嗎？這會覆蓋本機所有數據。")) return;
  ghBusy.value = true;
  ghProgress.value = "下載備份…";
  try {
    const zipData = await downloadFromGitHub(backupPath, onGhProgress);
    ghProgress.value = "還原中…";
    // 包成 File，直接走一般的導入流程
    const blob = new Blob([zipData.buffer as ArrayBuffer], { type: "application/zip" });
    const file = new File([blob], "aguaphone-backup-github.zip", { type: "application/zip" });
    const fakeInput = document.createElement("input");
    fakeInput.type = "file";
    const dt = new DataTransfer();
    dt.items.add(file);
    fakeInput.files = dt.files;
    await handleFileImport({ target: fakeInput } as unknown as Event);
  } catch (e) {
    alert(`✗ 還原失敗：${e instanceof Error ? e.message : String(e)}`);
  } finally {
    ghBusy.value = false;
    ghProgress.value = "";
  }
}

async function ghDelete(backupPath: string, backupName: string) {
  if (!confirm(`確定要刪除雲端備份「${backupName}」嗎？`)) return;
  ghBusy.value = true;
  try {
    const result = await deleteRemoteBackup(backupPath);
    if (result.success) {
      ghBackupList.value = ghBackupList.value.filter((b) => b.path !== backupPath);
    } else {
      alert(`✗ ${result.message}`);
    }
  } finally {
    ghBusy.value = false;
  }
}

const ghKeepOptions = [
  { value: 1, label: "1 份（自動覆蓋）" },
  { value: 2, label: "2 份" },
  { value: 3, label: "3 份" },
  { value: 5, label: "5 份" },
  { value: 0, label: "不限" },
];

onMounted(async () => {
  await refreshAutoBackupState();
  await loadGhState();
});

onUnmounted(() => {
  clearImportWatchdog();
  // 離開設定時還有分包在等儲存：中止備份，不讓它永遠卡住
  cancelPendingBackup(true);
});
</script>

<template>
  <div class="st-page">
    <SettingsGroup
      title="手動備份"
      footer="ZIP 內含角色、世界書、聊天記錄和媒體檔案。資料量大時會分成多個檔案，導入時請一次選取全部。"
    >
      <div class="st-pad">
        <div class="st-btn-grid">
          <button type="button" class="st-btn st-btn--primary" :disabled="isExporting" @click="exportData">
            <Download aria-hidden="true" />{{ isExporting ? "導出中…" : "導出全部" }}
          </button>
          <button type="button" class="st-btn" :disabled="isImporting" @click="fileInput?.click()">
            <Upload aria-hidden="true" />{{ isImporting ? importProgress || "導入中…" : "導入數據" }}
          </button>
        </div>
        <span v-if="isExporting && backupProgress" class="st-status" role="status">{{ backupProgress }}</span>
        <!-- 沒開自動備份的人也看得到：閃退時這是唯一線索 -->
        <span v-else-if="autoBackupSettings.lastBackupMessage" class="st-hint">
          上次導出：{{ autoBackupSettings.lastBackupMessage }}
        </span>
      </div>
      <SettingsSwitchRow
        v-model="excludeChatImages"
        label="不含聊天圖片"
        description="輕量備份；手動和自動都適用，備份閃退時先開這個"
      />
    </SettingsGroup>
    <input ref="fileInput" type="file" accept="*/*" multiple hidden @change="handleFileImport" />

    <SettingsGroup
      title="自動備份到本地"
      :footer="
        nativeApp
          ? `備份檔存在手機的「${nativeBackupWhere}」，${nativeUninstallNote}App 在背景時不會備份，回到 App 時會補上。`
          : fsaaSupported
            ? undefined
            : '這個瀏覽器不能直接寫入資料夾（例如 iOS），開啟後會改成定時下載備份檔。'
      "
    >
      <SettingsSwitchRow
        :model-value="autoBackupSettings.enabled"
        label="啟用自動備份"
        :description="
          nativeApp
            ? `定時把所有數據備份到手機的「${nativeBackupWhere}」`
            : fsaaSupported
              ? '定時把所有數據備份到選擇的資料夾'
              : '定時自動下載備份檔案'
        "
        @update:model-value="toggleAutoBackup"
      />
      <template v-if="fsaaSupported">
        <SettingsRow label="備份資料夾" :value="folderName || '未選擇'">
          <template #control>
            <button v-if="folderName" type="button" class="st-btn st-btn--sm" @click="clearFolder">清除</button>
            <button type="button" class="st-btn st-btn--soft st-btn--sm" @click="pickFolder">
              {{ folderName ? "更換" : "選擇" }}
            </button>
          </template>
        </SettingsRow>
        <SettingsRow
          v-if="folderName && folderPermission !== 'granted'"
          label="需要重新授權寫入權限"
          tone="danger"
        >
          <template #control>
            <button type="button" class="st-btn st-btn--soft st-btn--sm" @click="requestFolderPermission">授權</button>
          </template>
        </SettingsRow>
      </template>
      <template v-if="autoBackupSettings.enabled">
        <SettingsSelectRow
          v-model="autoBackupSettings.intervalMinutes"
          label="備份間隔"
          :options="intervalOptions"
          @change="saveBackupInterval"
        />
        <SettingsRow label="保留份數" description="0 表示不限">
          <template #control>
            <input
              v-model.number="autoBackupSettings.maxBackups"
              type="number"
              min="0"
              class="st-input st-input--number"
              aria-label="保留份數"
              @change="saveBackupInterval"
            />
          </template>
        </SettingsRow>
        <SettingsRow label="上次備份" :value="formatBackupTime(autoBackupSettings.lastBackupAt)" />
      </template>
      <SettingsRow
        v-if="nativeApp || (fsaaSupported && folderName)"
        clickable
        tone="accent"
        :label="nativeApp ? '立即備份到手機' : '立即備份到資料夾'"
        :disabled="isBackingUp"
        @click="backupNow"
      />
      <SettingsRow
        v-if="!nativeApp"
        clickable
        tone="accent"
        label="下載備份檔案"
        :disabled="isBackingUp"
        @click="downloadBackup"
      />
      <div v-if="isBackingUp && backupProgress" class="st-pad">
        <span class="st-status" role="status">{{ backupProgress }}</span>
      </div>
    </SettingsGroup>

    <SettingsGroup title="GitHub 雲端備份">
      <template v-if="!ghConnected">
        <div class="st-fields">
          <p class="st-hint">
            把備份上傳到你的 GitHub 私人倉庫。
            <a :href="`https://github.com/${DEFAULT_UPSTREAM_REPO}/fork`" target="_blank" rel="noopener">先 Fork 這個倉庫</a>，再填入 Token。
          </p>
          <div class="st-field">
            <label for="gh-repo" class="st-field__label">倉庫名稱</label>
            <input
              id="gh-repo"
              v-model="ghSettings.repo"
              class="st-input"
              placeholder="atuolan/aguaphone-cloud-backup"
              autocorrect="off"
              autocapitalize="none"
              spellcheck="false"
            />
          </div>
          <div class="st-field">
            <label for="gh-token" class="st-field__label">Personal Access Token</label>
            <div class="st-input-wrap">
              <input
                id="gh-token"
                v-model="ghSettings.token"
                :type="ghShowToken ? 'text' : 'password'"
                placeholder="ghp_xxxxxxxxxxxx"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="none"
                spellcheck="false"
              />
              <button
                type="button"
                class="st-icon-btn"
                :aria-label="ghShowToken ? '隱藏 Token' : '顯示 Token'"
                @click="ghShowToken = !ghShowToken"
              >
                <EyeOff v-if="ghShowToken" />
                <Eye v-else />
              </button>
            </div>
            <p class="st-hint">
              需要 fine-grained token，該倉庫的 Contents 權限設為「Read and write」。
              <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener">前往建立 Token</a>
            </p>
          </div>
          <button type="button" class="st-btn st-btn--primary st-btn--block" @click="ghConnect">連接</button>
        </div>
      </template>
      <template v-else>
        <SettingsRow :label="`${ghUsername} / ${ghSettings.repo.split('/')[1] || ghSettings.repo}`">
          <template #description><span class="st-status st-status--ok">已連接</span></template>
          <template #control>
            <button type="button" class="st-btn st-btn--sm" style="color: var(--st-danger)" @click="ghDisconnect">斷開</button>
          </template>
        </SettingsRow>
        <SettingsSelectRow
          v-model="ghSettings.maxRemoteBackups"
          label="保留份數"
          :options="ghKeepOptions"
          @change="ghSaveSettings"
        />
        <SettingsRow
          v-if="ghSettings.lastBackupAt"
          label="上次雲端備份"
          :value="formatBackupTime(ghSettings.lastBackupAt)"
        />
        <SettingsRow
          clickable
          tone="accent"
          :label="ghBackupStore.busy ? '備份中…' : '上傳備份到 GitHub'"
          :disabled="ghBusy || ghBackupStore.busy"
          @click="ghBackup"
        />
        <SettingsRow
          clickable
          tone="accent"
          label="從 GitHub 還原"
          :chevron="ghShowRestoreList ? 'up' : 'down'"
          :aria-expanded="ghShowRestoreList ? 'true' : 'false'"
          :disabled="ghBusy && !ghShowRestoreList"
          @click="ghToggleRestoreList"
        />
        <div v-if="ghShowRestoreList && (ghBackupList.length > 0 || !ghBusy)" class="st-inset backup-list">
          <div v-for="item in ghBackupList" :key="item.path" class="backup-list__item">
            <span class="backup-list__name">{{ item.name }}</span>
            <button type="button" class="st-link-btn" :disabled="ghBusy" @click="ghRestore(item.path)">還原</button>
            <button
              type="button"
              class="st-link-btn"
              style="color: var(--st-danger)"
              :disabled="ghBusy"
              @click="ghDelete(item.path, item.name)"
            >
              刪除
            </button>
          </div>
          <p v-if="ghBackupList.length === 0" class="st-hint">沒有找到雲端備份。</p>
        </div>
        <div v-if="ghBusy && ghProgress" class="st-pad">
          <span class="st-status" role="status">{{ ghProgress }}</span>
        </div>
      </template>
    </SettingsGroup>

    <!-- 備份交付：share／存檔面板必須由這一下點擊觸發 -->
    <SettingsDialog
      :open="!!pendingBatch"
      :title="pendingBatch ? describeBackupBatch(pendingBatch) : ''"
      :dismissible="false"
    >
      <template v-if="pendingBatch">
        <p class="st-dialog__text">
          <template v-if="isSingleFileBackup(pendingBatch)">{{ pendingBatch.parts[0].filename }}<br /></template>
          {{ formatSize(batchBytes) }}
        </p>
        <p v-if="!isSingleFileBackup(pendingBatch)" class="st-dialog__text">
          資料量較大，備份分成多個檔案。
          <template v-if="!pendingBatch.isLast">
            手機空間不夠一次暫存全部，請先儲存這些檔案，之後會繼續打包剩下的部分。
          </template>
          導入時請一次選取所有部分。
        </p>
        <p v-if="batchMessage" class="st-dialog__text" style="color: var(--st-danger)">{{ batchMessage }}</p>
      </template>
      <template v-if="pendingBatch" #actions>
        <button
          v-if="!batchOneByOne"
          type="button"
          class="st-btn st-btn--primary st-btn--block"
          :disabled="batchDelivering"
          @click="deliverBatch"
        >
          {{ pendingBatch.parts.length === 1 ? "儲存備份" : `儲存全部（${pendingBatch.parts.length} 個檔案）` }}
        </button>
        <template v-else>
          <button
            v-for="(part, i) in pendingBatch.parts"
            :key="part.index"
            type="button"
            class="st-btn st-btn--block"
            :class="batchSaved[i] ? '' : 'st-btn--primary'"
            :disabled="batchDelivering || batchSaved[i]"
            @click="deliverBatchFile(i)"
          >
            {{ batchSaved[i] ? "✓ 已儲存" : "儲存" }}第 {{ part.index + 1 }} 部分（{{ formatSize(part.bytes) }}）
          </button>
        </template>
        <button
          v-if="!batchOneByOne && pendingBatch.parts.length > 1"
          type="button"
          class="st-btn st-btn--block"
          :disabled="batchDelivering"
          @click="batchOneByOne = true"
        >
          一次儲存失敗？改成逐一儲存
        </button>
        <button
          type="button"
          class="st-btn st-btn--block"
          style="border-color: transparent; color: var(--st-danger)"
          :disabled="batchDelivering"
          @click="cancelPendingBackup()"
        >
          取消備份
        </button>
      </template>
    </SettingsDialog>
  </div>
</template>

<style scoped lang="scss">
.backup-list {
  gap: 0;
  padding: 4px 4px 4px 12px;
}

.backup-list__item {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 48px;

  & + & {
    border-top: 1px solid var(--st-line);
  }
}

.backup-list__name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.st-hint a {
  color: var(--st-accent-ink);
}
</style>
