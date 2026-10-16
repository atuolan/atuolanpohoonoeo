<script setup lang="ts">
/**
 * 主要模型：配置檔、連線、生成參數、進階。
 * 這頁的內容都存在配置檔裡（上下文長度除外），改了要按底部「更新配置」才會寫回。
 */
import { OpenAICompatibleClient } from "@/api/OpenAICompatible";
import { useSettingsStore } from "@/stores";
import type { APIProvider } from "@/types/settings";
import { fetchModelIds } from "@/utils/modelListFetcher";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Eye,
  EyeOff,
  Layers,
  MoreHorizontal,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Zap,
} from "lucide-vue-next";
import { computed, nextTick, onDeactivated, onMounted, ref } from "vue";
import { useApiProfiles } from "../composables/useApiProfiles";
import {
  copyTextWithFallback,
  getEndpointHost,
  getProviderLabel,
  parseEndpointAndKey,
  toWorkerProxyUrl,
} from "../settingsHelpers";
import {
  API_PROVIDERS,
  LAST_PROMPT_ROLE_OPTIONS,
  POPULAR_MODELS,
  PROMPT_POST_PROCESSING_ALL,
  PROMPT_POST_PROCESSING_NO_TOOL,
  PROMPT_POST_PROCESSING_PLAIN,
  PROMPT_POST_PROCESSING_TOOL,
  TOOL_PROTOCOL_OPTIONS,
} from "../settingsOptions";
import ProfileSwitchConfirm from "../ui/ProfileSwitchConfirm.vue";
import SettingsDialog from "../ui/SettingsDialog.vue";
import SettingsGroup from "../ui/SettingsGroup.vue";
import SettingsParam from "../ui/SettingsParam.vue";
import SettingsRow from "../ui/SettingsRow.vue";
import SettingsSelectRow from "../ui/SettingsSelectRow.vue";
import SettingsSheet from "../ui/SettingsSheet.vue";
import SettingsSwitchRow from "../ui/SettingsSwitchRow.vue";

const settingsStore = useSettingsStore();
const pageRef = ref<HTMLElement | null>(null);

// ===== 提示泡泡 =====
const toast = ref<{
  text: string;
  type: "success" | "error";
  action?: { label: string; run: () => void };
} | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | null = null;
function showToast(
  text: string,
  options: { type?: "success" | "error"; action?: { label: string; run: () => void }; duration?: number } = {},
) {
  toast.value = { text, type: options.type ?? "success", action: options.action };
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = null;
  }, options.duration ?? 2000);
}
function runToastAction() {
  const action = toast.value?.action;
  toast.value = null;
  if (toastTimer) clearTimeout(toastTimer);
  action?.run();
}

const {
  isSaving,
  isFormDirty,
  currentProfile,
  persistProfileList,
  doSave,
  saveToCurrentProfile,
  makeUniqueProfileName,
  getProfileNameSuggestion,
  showSwitchConfirm,
  requestSwitchProfile,
  switchConfirmSaveAndGo,
  switchConfirmDiscardAndGo,
  switchConfirmCancel,
} = useApiProfiles({
  onSwitched: (endpointChanged) => {
    if (endpointChanged) clearFetchedModels();
    connectionStatus.value = "none";
  },
  onError: (message) => showToast(message, { type: "error", duration: 4000 }),
});

// ===== 配置檔／進階面板 =====
const showProfilesPanel = ref(false);
const showAdvancedPanel = ref(false);

// ===== 連線測試 =====
const isTestingConnection = ref(false);
const connectionStatus = ref<"none" | "success" | "error">("none");
const connectionMessage = ref("");
const showApiKey = ref(false);

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
      connectionMessage.value = result.response
        ? `連線成功，模型回覆：「${result.response}」`
        : "連線成功";
    } else {
      connectionStatus.value = "error";
      connectionMessage.value = result.message || "連線失敗，請檢查設定";
    }
  } catch (e) {
    connectionStatus.value = "error";
    connectionMessage.value = `錯誤：${e instanceof Error ? e.message : String(e)}`;
  } finally {
    isTestingConnection.value = false;
  }
}

// ===== 提供者與模型 =====
const providerOptions = API_PROVIDERS.map((p) => ({ value: p.id, label: p.name }));

function selectProvider(providerId: APIProvider) {
  settingsStore.api.provider = providerId;
  const provider = API_PROVIDERS.find((p) => p.id === providerId);
  if (provider && provider.endpoint) {
    settingsStore.api.endpoint = provider.endpoint;
  }
  const models = POPULAR_MODELS[providerId];
  if (models && models.length > 0 && models[0]) {
    settingsStore.api.model = models[0];
  }
  // 端點改了，已拉取的模型不能再用
  clearFetchedModels();
  connectionStatus.value = "none";
}

const isFetchingModels = ref(false);
const fetchedModels = ref<string[]>([]);
const modelFetchError = ref("");
const customModelName = ref("");
const lastFetchedEndpoint = ref("");

function clearFetchedModels() {
  fetchedModels.value = [];
  lastFetchedEndpoint.value = "";
  modelFetchError.value = "";
}

// 可用模型：有拉取的就只用拉取的，否則用常用清單＋目前選的
const availableModels = computed(() => {
  if (fetchedModels.value.length > 0) return [...fetchedModels.value];
  const preset = POPULAR_MODELS[settingsStore.api.provider] || [];
  const current = settingsStore.api.model;
  const all = [...preset];
  if (current && current !== "__custom__" && !all.includes(current)) {
    all.unshift(current);
  }
  return all.filter((m) => m);
});

function applyCustomModel() {
  if (customModelName.value.trim()) {
    settingsStore.api.model = customModelName.value.trim();
    customModelName.value = "";
  }
}

async function fetchModels() {
  if (!settingsStore.api.endpoint || !settingsStore.api.apiKey) {
    modelFetchError.value = "請先填寫 API 端點和密鑰";
    return;
  }
  const currentEndpoint = settingsStore.api.endpoint;
  if (lastFetchedEndpoint.value && lastFetchedEndpoint.value !== currentEndpoint) {
    fetchedModels.value = [];
  }

  isFetchingModels.value = true;
  modelFetchError.value = "";
  try {
    // 支援 OpenAI 格式，404 時改試 Gemini 原生格式
    const models = await fetchModelIds(currentEndpoint, settingsStore.api.apiKey, (url) =>
      toWorkerProxyUrl(url, settingsStore.api.directConnect),
    );
    fetchedModels.value = models.sort((a, b) => a.localeCompare(b));
    if (fetchedModels.value.length > 0) {
      lastFetchedEndpoint.value = currentEndpoint;
      if (!fetchedModels.value.includes(settingsStore.api.model)) {
        settingsStore.api.model = fetchedModels.value[0];
      }
    } else {
      modelFetchError.value = "未找到可用模型";
    }
  } catch (e) {
    console.error("拉取模型失敗:", e);
    modelFetchError.value =
      e instanceof TypeError && e.message.includes("fetch")
        ? "CORS 限制，請手動輸入模型名稱"
        : `拉取失敗：${e instanceof Error ? e.message : String(e)}`;
    fetchedModels.value = [];
    lastFetchedEndpoint.value = "";
  } finally {
    isFetchingModels.value = false;
  }
}

// ===== 從剪貼簿填入端點 + 密鑰 =====
const clipboardHint = ref<{ type: "success" | "error"; text: string } | null>(null);
let clipboardHintTimer: ReturnType<typeof setTimeout> | null = null;
function showClipboardHint(type: "success" | "error", text: string) {
  clipboardHint.value = { type, text };
  if (clipboardHintTimer) clearTimeout(clipboardHintTimer);
  clipboardHintTimer = setTimeout(() => {
    clipboardHint.value = null;
  }, 2500);
}

async function pasteCredentialsFromClipboard() {
  let text = "";
  try {
    text = await navigator.clipboard.readText();
  } catch {
    showClipboardHint("error", "無法讀取剪貼簿，請手動貼上到欄位中");
    return;
  }
  if (!text) {
    showClipboardHint("error", "剪貼簿是空的");
    return;
  }
  const parsed = parseEndpointAndKey(text);
  if (!parsed.endpoint && !parsed.apiKey) {
    showClipboardHint("error", "未在剪貼簿中辨識到端點或密鑰");
    return;
  }
  if (parsed.endpoint) settingsStore.api.endpoint = parsed.endpoint;
  if (parsed.apiKey) settingsStore.api.apiKey = parsed.apiKey;
  const filled: string[] = [];
  if (parsed.endpoint) filled.push("端點");
  if (parsed.apiKey) filled.push("密鑰");
  showClipboardHint("success", `已填入${filled.join("、")}`);
}

// ===== 配置檔 =====
const editingProfileId = ref<string | null>(null);
const editingProfileName = ref("");

// 切換成功就收起配置面板；要先確認的話，等確認完再收
function pickProfile(profileId: string) {
  if (editingProfileId.value) return;
  if (requestSwitchProfile(profileId)) showProfilesPanel.value = false;
}

async function confirmSwitchSave() {
  await switchConfirmSaveAndGo();
  showProfilesPanel.value = false;
}

async function confirmSwitchDiscard() {
  await switchConfirmDiscardAndGo();
  showProfilesPanel.value = false;
}

async function startRenameProfile(profileId: string) {
  const profile = settingsStore.profiles.find((p) => p.id === profileId);
  if (!profile) return;
  actionProfileId.value = null;
  editingProfileId.value = profileId;
  editingProfileName.value = profile.name;
  await nextTick();
  const input = pageRef.value?.querySelector<HTMLInputElement>(
    `[data-profile-rename="${profileId}"]`,
  );
  input?.focus();
  input?.select();
}

async function confirmRenameProfile() {
  // Enter 之後輸入框消失還會觸發 blur，先清掉狀態避免重複執行
  const profileId = editingProfileId.value;
  const name = editingProfileName.value.trim();
  editingProfileId.value = null;
  editingProfileName.value = "";
  if (!profileId || !name) return;
  const profile = settingsStore.profiles.find((p) => p.id === profileId);
  if (!profile || profile.name === name) return;
  settingsStore.renameProfile(profileId, name);
  await persistProfileList();
}

function cancelRenameProfile() {
  editingProfileId.value = null;
  editingProfileName.value = "";
}

// 配置的「⋯」選單
const actionProfileId = ref<string | null>(null);
const actionProfile = computed(
  () => settingsStore.profiles.find((p) => p.id === actionProfileId.value) ?? null,
);

async function copyProfileField(field: "endpoint" | "apiKey" | "both") {
  const profile = actionProfile.value;
  actionProfileId.value = null;
  if (!profile) return;
  const endpoint = profile.api.endpoint?.trim() || "";
  const apiKey = profile.api.apiKey?.trim() || "";

  let text = "";
  let label = "";
  if (field === "endpoint") {
    if (!endpoint) return showToast("此配置沒有端點", { type: "error" });
    text = endpoint;
    label = "端點";
  } else if (field === "apiKey") {
    if (!apiKey) return showToast("此配置沒有密鑰", { type: "error" });
    text = apiKey;
    label = "密鑰";
  } else {
    if (!endpoint && !apiKey) return showToast("此配置沒有端點和密鑰", { type: "error" });
    text = `端點：${endpoint}\n密鑰：${apiKey}`;
    label = "端點 + 密鑰";
  }
  if (!(await copyTextWithFallback(text))) {
    showToast("複製失敗，請手動複製", { type: "error" });
    return;
  }
  showToast(`已複製${label}`);
}

// 複製一份配置：放在原配置下方，並直接進入改名
async function duplicateProfile() {
  const source = actionProfile.value;
  actionProfileId.value = null;
  if (!source) return;
  const created = settingsStore.duplicateProfile(
    source.id,
    makeUniqueProfileName(`${source.name} 副本`),
  );
  if (!created) return;
  await persistProfileList();
  await startRenameProfile(created.id);
}

// 刪除配置（不跳確認框，改為底部提示可復原）
async function deleteProfileWithUndo() {
  const profile = actionProfile.value;
  actionProfileId.value = null;
  if (!profile) return;
  const prevEndpoint = settingsStore.api.endpoint;
  const deleted = settingsStore.deleteProfile(profile.id);
  if (!deleted) return;
  if (deleted.wasCurrent) {
    if (prevEndpoint !== settingsStore.api.endpoint) clearFetchedModels();
    connectionStatus.value = "none";
  }
  await persistProfileList();
  showToast(`已刪除「${deleted.profile.name}」`, {
    duration: 5000,
    action: {
      label: "復原",
      run: async () => {
        settingsStore.restoreProfile(deleted);
        if (deleted.wasCurrent) {
          clearFetchedModels();
          connectionStatus.value = "none";
        }
        await persistProfileList();
      },
    },
  });
}

// 新建配置：可以建空白的，或複製目前表單
const showNewProfileDialog = ref(false);
const newProfileName = ref("");

function openNewProfileDialog() {
  newProfileName.value = getProfileNameSuggestion();
  showNewProfileDialog.value = true;
}

async function createProfileEmpty() {
  const name = makeUniqueProfileName(
    newProfileName.value.trim() || `配置 ${settingsStore.profiles.length + 1}`,
  );
  // 先把主表單清回空白
  delete settingsStore.api.customHeaders;
  delete settingsStore.api.proxy;
  Object.assign(settingsStore.api, {
    provider: "custom",
    endpoint: "",
    apiKey: "",
    model: "",
    directConnect: false,
    useClaudeNativeCache: false,
    promptPostProcessing: "none",
    toolProtocol: "auto",
    toolsEnabled: false,
    lastPromptRoleOverride: "none",
  });
  settingsStore.createProfile(name);
  newProfileName.value = "";
  showNewProfileDialog.value = false;
  clearFetchedModels();
  connectionStatus.value = "none";
  await persistProfileList();
}

async function createProfileFromCurrent() {
  const name = makeUniqueProfileName(newProfileName.value.trim() || getProfileNameSuggestion());
  settingsStore.createProfile(name);
  newProfileName.value = "";
  showNewProfileDialog.value = false;
  await persistProfileList();
}

// ===== 保存 =====
const showSaveAsDialog = ref(false);

function openSaveAsDialog() {
  newProfileName.value = getProfileNameSuggestion();
  showSaveAsDialog.value = true;
}

// 「另存新配置」：用目前表單建立新配置並切換過去，原配置不受影響
async function confirmSaveAs() {
  const name = makeUniqueProfileName(newProfileName.value.trim() || getProfileNameSuggestion());
  settingsStore.createProfile(name);
  showSaveAsDialog.value = false;
  newProfileName.value = "";
  if (await doSave({ syncProfile: true })) showToast(`已存成「${name}」`);
}

async function updateCurrentProfile() {
  if (await saveToCurrentProfile()) showToast("已更新配置");
}

// 上下文長度是全域設定，不跟配置走，改了直接存
async function saveGlobalOnly() {
  await doSave();
}

const canSaveFirstProfile = computed(
  () =>
    settingsStore.profiles.length === 0 &&
    !!settingsStore.api.endpoint?.trim() &&
    !!settingsStore.api.apiKey?.trim(),
);

// ===== 進階選項 =====
const toolsOn = computed(() => settingsStore.api.toolsEnabled !== false);
const postProcessingDescription = computed(
  () =>
    PROMPT_POST_PROCESSING_ALL.find((o) => o.value === settingsStore.api.promptPostProcessing)
      ?.description || "保留原始訊息結構",
);
const toolProtocolDescription = computed(
  () =>
    TOOL_PROTOCOL_OPTIONS.find((o) => o.value === settingsStore.api.toolProtocol)?.description ||
    "優先使用原生工具，上游不支援時自動改走文字協議",
);
const postProcessingGroups = [
  { label: "一般", options: PROMPT_POST_PROCESSING_PLAIN.map((o) => ({ value: o.value, label: o.label })) },
  { label: "含工具", options: PROMPT_POST_PROCESSING_TOOL.map((o) => ({ value: o.value, label: o.label })) },
  { label: "不含工具", options: PROMPT_POST_PROCESSING_NO_TOOL.map((o) => ({ value: o.value, label: o.label })) },
];

// 「進階」按鈕下方的摘要：列出有開的項目
const advancedSummary = computed(() => {
  const api = settingsStore.api;
  const on: string[] = [];
  if (api.lastPromptRoleOverride && api.lastPromptRoleOverride !== "none") on.push("改角色");
  if (api.promptPostProcessing && api.promptPostProcessing !== "none") on.push("後處理");
  if (toolsOn.value) on.push("工具");
  if (api.directConnect) on.push("直連");
  if (api.useClaudeNativeCache) on.push("緩存");
  return on.length ? on.join("・") : "都沒開";
});

// 配置面板疊著其他浮層時先藏起來，免得兩層遮罩
const profilesPanelVisible = computed(
  () =>
    showProfilesPanel.value &&
    !actionProfile.value &&
    !showNewProfileDialog.value &&
    !showSwitchConfirm.value,
);

function formatContext(value: number) {
  return value >= 1024 ? `${Math.round(value / 1024)}K` : String(value);
}

onMounted(() => {
  // 有 API 設定就順手拉一次模型清單
  if (settingsStore.api.endpoint && settingsStore.api.apiKey) {
    void fetchModels();
  }
});

onDeactivated(() => {
  // 離開這頁時收起暫時的浮層
  actionProfileId.value = null;
  showProfilesPanel.value = false;
  showAdvancedPanel.value = false;
  if (editingProfileId.value) void confirmRenameProfile();
});
</script>

<template>
  <div ref="pageRef" class="st-page">
    <SettingsGroup title="連線">
      <div class="st-pad model-shortcuts">
        <button type="button" class="model-shortcut" @click="showProfilesPanel = true">
          <Layers class="model-shortcut__icon" aria-hidden="true" />
          <span class="model-shortcut__text">
            <span class="model-shortcut__label">
              配置檔
              <span v-if="isFormDirty && currentProfile" class="model-shortcut__dot" aria-label="有未保存的改動" />
            </span>
            <span class="model-shortcut__value">{{ currentProfile?.name ?? "還沒有配置" }}</span>
          </span>
          <ChevronRight class="model-shortcut__chevron" aria-hidden="true" />
        </button>
        <button type="button" class="model-shortcut" @click="showAdvancedPanel = true">
          <SlidersHorizontal class="model-shortcut__icon" aria-hidden="true" />
          <span class="model-shortcut__text">
            <span class="model-shortcut__label">進階</span>
            <span class="model-shortcut__value">{{ advancedSummary }}</span>
          </span>
          <ChevronRight class="model-shortcut__chevron" aria-hidden="true" />
        </button>
      </div>
      <SettingsSelectRow
        label="提供者"
        :model-value="settingsStore.api.provider"
        :options="providerOptions"
        @change="selectProvider($event as APIProvider)"
      />
      <div class="st-fields">
        <div class="st-field">
          <div class="st-field__head">
            <label for="model-endpoint" class="st-field__label">端點</label>
            <button type="button" class="st-link-btn" @click="pasteCredentialsFromClipboard">
              <ClipboardPaste aria-hidden="true" />從剪貼簿填入
            </button>
          </div>
          <input
            id="model-endpoint"
            v-model="settingsStore.api.endpoint"
            type="url"
            class="st-input"
            name="url"
            placeholder="https://api.openai.com/v1"
            autocomplete="url"
            inputmode="url"
            autocorrect="off"
            autocapitalize="none"
            spellcheck="false"
          />
          <p
            v-if="clipboardHint"
            class="st-hint"
            :class="clipboardHint.type === 'success' ? 'st-hint--ok' : 'st-hint--error'"
          >
            {{ clipboardHint.text }}
          </p>
          <p v-else class="st-hint">大多數 API 需要以 /v1 結尾</p>
        </div>

        <div class="st-field">
          <label for="model-key" class="st-field__label">密鑰</label>
          <div class="st-input-wrap">
            <input
              id="model-key"
              v-model="settingsStore.api.apiKey"
              :type="showApiKey ? 'text' : 'password'"
              name="main-api-key"
              placeholder="sk-..."
              autocomplete="new-password"
              autocorrect="off"
              autocapitalize="none"
              spellcheck="false"
            />
            <button
              type="button"
              class="st-icon-btn"
              :aria-label="showApiKey ? '隱藏密鑰' : '顯示密鑰'"
              @click="showApiKey = !showApiKey"
            >
              <EyeOff v-if="showApiKey" />
              <Eye v-else />
            </button>
          </div>
        </div>

        <div class="st-field">
          <div class="st-field__head">
            <label for="model-model" class="st-field__label">模型</label>
            <button
              type="button"
              class="st-link-btn"
              :disabled="isFetchingModels || !settingsStore.api.apiKey || !settingsStore.api.endpoint"
              @click="fetchModels"
            >
              <RefreshCw aria-hidden="true" :class="{ 'model-spin': isFetchingModels }" />
              {{ isFetchingModels ? "拉取中…" : "拉取模型" }}
            </button>
          </div>
          <div class="st-select-wrap">
            <select id="model-model" v-model="settingsStore.api.model" class="st-input">
              <option value="" disabled>
                {{ isFetchingModels ? "拉取模型中…" : "選擇模型…" }}
              </option>
              <option v-for="model in availableModels" :key="model" :value="model">
                {{ model }}
              </option>
              <option value="__custom__">手動輸入…</option>
            </select>
            <ChevronDown aria-hidden="true" />
          </div>
          <template v-if="settingsStore.api.model === '__custom__'">
            <input
              v-model="customModelName"
              type="text"
              class="st-input"
              aria-label="模型名稱"
              placeholder="輸入模型名稱，例如：gpt-4o"
              @blur="applyCustomModel"
              @keyup.enter="applyCustomModel"
            />
            <p class="st-hint">輸入完成後按 Enter 或點其他地方確認</p>
          </template>
          <p v-if="modelFetchError" class="st-hint st-hint--error">{{ modelFetchError }}</p>
          <p v-else-if="fetchedModels.length > 0" class="st-hint st-hint--ok">
            已從 API 拉取 {{ fetchedModels.length }} 個模型
          </p>
        </div>
      </div>
      <div class="st-pad">
        <button
          type="button"
          class="st-btn st-btn--soft st-btn--block"
          :disabled="isTestingConnection"
          @click="testConnection"
        >
          <Zap aria-hidden="true" />{{ isTestingConnection ? "測試中…" : "測試連線" }}
        </button>
        <span
          v-if="connectionStatus !== 'none'"
          class="st-status"
          :class="connectionStatus === 'success' ? 'st-status--ok' : 'st-status--error'"
          role="status"
        >
          {{ connectionMessage }}
        </span>
      </div>
    </SettingsGroup>

    <SettingsGroup title="生成參數" footer="開關關閉的參數不會送給 API。">
      <SettingsParam
        v-model="settingsStore.generation.temperature"
        v-model:enabled="settingsStore.generation.enableTemperature"
        label="溫度"
        :min="0"
        :max="2"
        :step="0.1"
        :scale="['精確', '平衡', '創意']"
      />
      <SettingsParam
        v-model="settingsStore.generation.maxTokens"
        label="最大回覆長度"
        :min="256"
        :max="32768"
        :step="256"
        hint="會預留給 AI 輸出；設得越高，留給聊天歷史的空間越少。"
      />
      <SettingsParam
        v-model="settingsStore.generation.maxContextLength"
        label="上下文長度"
        :min="4096"
        :max="200000"
        :step="1024"
        :format="formatContext"
        hint="全域通用：聊天、總結、日記、備用 API 都用這個長度，改了直接保存。"
        @change="saveGlobalOnly"
      />
      <SettingsParam
        v-model="settingsStore.generation.topP"
        v-model:enabled="settingsStore.generation.enableTopP"
        label="Top P"
        :min="0"
        :max="1"
        :step="0.05"
      />
      <SettingsParam
        v-model="settingsStore.generation.topK"
        v-model:enabled="settingsStore.generation.enableTopK"
        label="Top K"
        :min="0"
        :max="200"
        :step="1"
        hint="只有部分模型支援，不支援請關閉。"
      />
      <SettingsParam
        v-model="settingsStore.generation.frequencyPenalty"
        v-model:enabled="settingsStore.generation.enableFrequencyPenalty"
        label="頻率懲罰"
        :min="-2"
        :max="2"
        :step="0.1"
      />
      <SettingsParam
        v-model="settingsStore.generation.presencePenalty"
        v-model:enabled="settingsStore.generation.enablePresencePenalty"
        label="存在懲罰"
        :min="-2"
        :max="2"
        :step="0.1"
      />
      <SettingsSwitchRow
        v-model="settingsStore.generation.streamingEnabled"
        label="串流輸出"
        description="開啟後逐字顯示；關閉則一次回傳完整內容"
      />
      <SettingsSwitchRow
        v-if="settingsStore.generation.streamingEnabled"
        v-model="settingsStore.generation.useStreamingWindow"
        indent
        label="流式輸出窗口"
        description="在浮動窗口顯示回覆，不直接寫進訊息氣泡"
      />
    </SettingsGroup>

    <div v-if="isFormDirty && currentProfile" class="st-savebar">
      <span class="st-savebar__note">「{{ currentProfile.name }}」有未保存的改動</span>
      <div class="st-btn-grid">
        <button type="button" class="st-btn" :disabled="isSaving" @click="openSaveAsDialog">
          另存新配置
        </button>
        <button
          type="button"
          class="st-btn st-btn--primary"
          :disabled="isSaving"
          @click="updateCurrentProfile"
        >
          更新配置
        </button>
      </div>
    </div>
    <div v-else-if="canSaveFirstProfile" class="st-savebar">
      <span class="st-savebar__note">還沒有配置檔</span>
      <button
        type="button"
        class="st-btn st-btn--primary st-btn--block"
        :disabled="isSaving"
        @click="updateCurrentProfile"
      >
        保存為配置
      </button>
    </div>

    <!-- 配置檔面板 -->
    <SettingsSheet
      :open="profilesPanelVisible"
      title="配置檔"
      done-label="完成"
      @close="showProfilesPanel = false"
    >
      <SettingsGroup footer="點一下切換；「⋯」裡可以複製端點或密鑰、重命名、建立副本、刪除。">
        <div
          v-for="profile in settingsStore.profiles"
          :key="profile.id"
          class="model-profile"
          style="--st-inset: 48px"
        >
          <div v-if="editingProfileId === profile.id" class="model-profile__pick">
            <span
              class="st-radio"
              :class="{ 'st-radio--on': settingsStore.currentProfileId === profile.id }"
              aria-hidden="true"
            >
              <Check v-if="settingsStore.currentProfileId === profile.id" :stroke-width="3" />
            </span>
            <input
              v-model="editingProfileName"
              :data-profile-rename="profile.id"
              type="text"
              class="st-input"
              aria-label="配置名稱"
              @keyup.enter="confirmRenameProfile"
              @keyup.esc="cancelRenameProfile"
              @blur="confirmRenameProfile"
            />
          </div>
          <button
            v-else
            type="button"
            class="model-profile__pick"
            :aria-pressed="settingsStore.currentProfileId === profile.id ? 'true' : 'false'"
            @click="pickProfile(profile.id)"
          >
            <span
              class="st-radio"
              :class="{ 'st-radio--on': settingsStore.currentProfileId === profile.id }"
              aria-hidden="true"
            >
              <Check v-if="settingsStore.currentProfileId === profile.id" :stroke-width="3" />
            </span>
            <span class="model-profile__info">
              <span class="model-profile__name">
                <span class="model-profile__name-text">{{ profile.name }}</span>
                <span class="st-chip">{{ getProviderLabel(profile.api.provider) }}</span>
                <span
                  v-if="settingsStore.currentProfileId === profile.id && isFormDirty"
                  class="st-chip st-chip--warn"
                >未保存</span>
              </span>
              <span class="model-profile__meta">
                {{ profile.api.model || "未設置模型" }} ·
                {{ getEndpointHost(profile.api.endpoint) || "未設定端點" }}
              </span>
            </span>
          </button>
          <button
            type="button"
            class="st-icon-btn"
            :aria-label="`${profile.name} 的更多操作`"
            @click="actionProfileId = profile.id"
          >
            <MoreHorizontal />
          </button>
        </div>
        <div v-if="settingsStore.profiles.length === 0" class="st-row">
          <span class="st-row__desc">還沒有配置檔。填好連線後，按頁面底部「保存為配置」。</span>
        </div>
        <SettingsRow clickable tone="accent" label="新建配置" @click="openNewProfileDialog">
          <template #icon><Plus class="model-plus" aria-hidden="true" /></template>
        </SettingsRow>
      </SettingsGroup>
    </SettingsSheet>

    <!-- 進階面板 -->
    <SettingsSheet
      :open="showAdvancedPanel"
      title="進階"
      done-label="完成"
      @close="showAdvancedPanel = false"
    >
      <SettingsGroup footer="這些設定跟著配置檔走，改完要按頁面底部「更新配置」才會存進配置。">
        <SettingsSelectRow
          v-model="settingsStore.api.lastPromptRoleOverride"
          label="最後提示詞角色"
          description="覆蓋最後一個提示詞的發言角色（優先於提示詞管理）"
          :options="LAST_PROMPT_ROLE_OPTIONS"
        />
        <SettingsSelectRow
          v-model="settingsStore.api.promptPostProcessing"
          label="提示詞後處理"
          :description="postProcessingDescription"
          :groups="postProcessingGroups"
        />
        <SettingsSwitchRow
          :model-value="toolsOn"
          label="允許工具呼叫"
          description="這個配置的 API 能不能讓角色在回話前先查資料、幫你做事"
          @update:model-value="settingsStore.api.toolsEnabled = $event"
        />
        <SettingsSelectRow
          v-model="settingsStore.api.toolProtocol"
          indent
          label="工具協議"
          :description="toolProtocolDescription"
          :options="TOOL_PROTOCOL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))"
          :disabled="settingsStore.api.toolsEnabled === false"
        />
        <div class="st-pad model-tools-explain">
          <p class="st-hint">
            <strong>做什麼：</strong>開啟後，角色回覆你之前可以先向 App 要資料，拿到結果再回答。例如你問「明天要帶傘嗎」，角色會先查天氣預報再回你。
          </p>
          <p class="st-hint">
            <strong>能用的工具：</strong>查時間、查天氣（含未來三天預報）、查你現在大概在哪、看你的行事曆、在這個聊天的總結和重要事件裡找記憶、搜尋和播放音樂、換桌布、幫你新增行程、預約來電，加上 MCP 伺服器提供的工具。查位置、新增行程、預約來電、換桌布這類會動到東西或用到隱私的，會先跳出來問你同不同意。
          </p>
          <p class="st-hint">
            <strong>跟提示詞裡的功能標籤不一樣：</strong>轉帳、圖片、語音、撤回、面對面這些，是提示詞教角色在回覆裡寫標籤、App 再畫出來，不靠這個開關，關掉也照常能用。提示詞不用因為開了工具而關掉。預約來電、新增行程兩邊都做得到：角色這一輪用工具做過（或你按了拒絕），回覆裡同類的標籤就不會再執行，不會重複。
          </p>
          <p class="st-hint">
            <strong>跟角色設定的關係：</strong>這裡是整個配置的總開關；每個角色能用哪幾個工具，到「角色編輯 › 角色工具權限」裡勾。兩邊都開，角色才會用工具。
          </p>
          <p class="st-hint">
            <strong>什麼時候要關：</strong>用工具時一則回覆會多打 1～2 次 API、多花 token。中轉站或模型不支援工具呼叫（送出後報錯）、或想省錢時，就關掉。
          </p>
        </div>
        <SettingsSwitchRow
          :model-value="!!settingsStore.api.directConnect"
          label="瀏覽器直連"
          description="請求直接從瀏覽器發出，不經過伺服器代理；部分站點會被 CORS 擋下"
          @update:model-value="settingsStore.api.directConnect = $event"
        />
        <SettingsSwitchRow
          :model-value="!!settingsStore.api.useClaudeNativeCache"
          label="Claude 原生緩存"
          description="只對 Claude 模型有效：改走 /v1/messages 並啟用 Prompt Caching（命中時約 0.1 倍費用）；中轉站不支援就關掉"
          @update:model-value="settingsStore.api.useClaudeNativeCache = $event"
        />
      </SettingsGroup>
    </SettingsSheet>

    <!-- 配置的「⋯」操作 -->
    <SettingsSheet
      :open="!!actionProfile"
      :title="actionProfile?.name ?? ''"
      done-label="取消"
      @close="actionProfileId = null"
    >
      <SettingsGroup>
        <SettingsRow clickable label="複製端點" :disabled="!actionProfile?.api.endpoint" @click="copyProfileField('endpoint')" />
        <SettingsRow clickable label="複製密鑰" :disabled="!actionProfile?.api.apiKey" @click="copyProfileField('apiKey')" />
        <SettingsRow
          clickable
          label="複製端點 + 密鑰"
          :disabled="!actionProfile?.api.endpoint && !actionProfile?.api.apiKey"
          @click="copyProfileField('both')"
        />
      </SettingsGroup>
      <SettingsGroup>
        <SettingsRow clickable label="重命名" @click="actionProfile && startRenameProfile(actionProfile.id)" />
        <SettingsRow clickable label="建立副本" @click="duplicateProfile" />
        <SettingsRow clickable tone="danger" label="刪除" @click="deleteProfileWithUndo" />
      </SettingsGroup>
    </SettingsSheet>

    <!-- 新建配置 -->
    <SettingsDialog
      :open="showNewProfileDialog"
      title="新建配置"
      text="可以建一個空白配置，或把目前表單的內容複製過去。"
      @close="showNewProfileDialog = false"
    >
      <p v-if="isFormDirty" class="st-hint st-hint--warn" style="text-align: center">
        目前表單有未保存的改動：「建空白配置」會丟掉它們，「複製目前設定」會帶進新配置。
      </p>
      <input
        v-model="newProfileName"
        type="text"
        class="st-input"
        aria-label="配置名稱"
        placeholder="配置名稱（如：OpenAI 工作用）"
        @keyup.enter="createProfileFromCurrent"
      />
      <template #actions>
        <button type="button" class="st-btn st-btn--primary st-btn--block" @click="createProfileFromCurrent">
          複製目前設定
        </button>
        <button type="button" class="st-btn st-btn--block" @click="createProfileEmpty">
          建空白配置
        </button>
        <button
          type="button"
          class="st-btn st-btn--block"
          style="border-color: transparent"
          @click="showNewProfileDialog = false"
        >
          取消
        </button>
      </template>
    </SettingsDialog>

    <!-- 另存新配置 -->
    <SettingsDialog
      :open="showSaveAsDialog"
      title="另存新配置"
      text="用目前表單的內容建立新配置並切換過去，原本的配置不會被改動。"
      @close="showSaveAsDialog = false"
    >
      <input
        v-model="newProfileName"
        type="text"
        class="st-input"
        aria-label="配置名稱"
        placeholder="配置名稱"
        @keyup.enter="confirmSaveAs"
      />
      <template #actions>
        <button type="button" class="st-btn st-btn--primary st-btn--block" :disabled="isSaving" @click="confirmSaveAs">
          保存為新配置
        </button>
        <button
          type="button"
          class="st-btn st-btn--block"
          style="border-color: transparent"
          @click="showSaveAsDialog = false"
        >
          取消
        </button>
      </template>
    </SettingsDialog>

    <ProfileSwitchConfirm
      :open="showSwitchConfirm"
      :busy="isSaving"
      @save="confirmSwitchSave"
      @discard="confirmSwitchDiscard"
      @cancel="switchConfirmCancel"
    />

    <Transition name="st-toast">
      <div v-if="toast" class="st-toast" :class="{ 'st-toast--error': toast.type === 'error' }" role="status">
        <span>{{ toast.text }}</span>
        <button v-if="toast.action" type="button" class="st-toast__action" @click="runToastAction">
          {{ toast.action.label }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.model-shortcuts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding-top: 14px;
  padding-bottom: 6px;
}

.model-shortcut {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 60px;
  padding: 10px 8px 10px 12px;
  box-sizing: border-box;
  border: 1px solid var(--st-line);
  border-radius: 16px;
  background: color-mix(in srgb, var(--st-accent) 10%, var(--st-card));
  font: inherit;
  color: var(--st-text);
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;

  &:active {
    background: color-mix(in srgb, var(--st-accent) 20%, var(--st-card));
  }

  &:focus-visible {
    outline: 2px solid var(--st-accent-strong);
    outline-offset: 2px;
  }
}

.model-shortcut__icon {
  flex: none;
  width: 20px;
  height: 20px;
  color: var(--st-accent-ink);
}

.model-shortcut__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.model-shortcut__label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  line-height: 1.4;
  font-weight: 600;
}

.model-shortcut__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-warning, #d69e2e);
}

.model-shortcut__value {
  font-size: 12px;
  line-height: 1.4;
  color: var(--st-sub);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-shortcut__chevron {
  flex: none;
  width: 16px;
  height: 16px;
  color: var(--st-sub);
}

.model-tools-explain {
  gap: 8px;
  padding-top: 0;

  strong {
    font-weight: 600;
    color: var(--st-text);
  }
}

.model-profile {
  display: flex;
  align-items: center;
  padding-right: 4px;
}

.model-profile__pick {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 66px;
  padding: 10px 4px 10px 14px;
  box-sizing: border-box;
  border: 0;
  background: transparent;
  font: inherit;
  color: var(--st-text);
  text-align: left;
  cursor: pointer;
}

.model-profile__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.model-profile__name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 16px;
  font-weight: 500;
}

.model-profile__name-text {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.model-profile__meta {
  font-size: 13px;
  color: var(--st-sub);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-plus {
  flex: none;
  width: 22px;
  height: 22px;
  color: var(--st-accent-ink);
}

.model-spin {
  animation: model-spin 0.9s linear infinite;
}

@keyframes model-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
