<script setup lang="ts">
/**
 * 備用模型與分流：備用 API 配置檔、連線、參數，以及每個功能要走哪個 API。
 * 這頁改了就自動保存；配置檔要按「更新目前配置」才會寫回。
 */
import { OpenAICompatibleClient } from "@/api/OpenAICompatible";
import { AUXILIARY_TASKS, useSettingsStore } from "@/stores";
import type { RoutableTaskType } from "@/stores/settings";
import { fetchModelIds } from "@/utils/modelListFetcher";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Eye,
  EyeOff,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Zap,
} from "lucide-vue-next";
import { computed, nextTick, onDeactivated, ref } from "vue";
import {
  copyTextWithFallback,
  getEndpointHost,
  getProviderLabel,
  parseEndpointAndKey,
  toAiProxyUrl,
} from "../settingsHelpers";
import ProfileSwitchConfirm from "../ui/ProfileSwitchConfirm.vue";
import SettingsDialog from "../ui/SettingsDialog.vue";
import SettingsGroup from "../ui/SettingsGroup.vue";
import SettingsParam from "../ui/SettingsParam.vue";
import SettingsRow from "../ui/SettingsRow.vue";
import SettingsSheet from "../ui/SettingsSheet.vue";
import SettingsSwitchRow from "../ui/SettingsSwitchRow.vue";

const settingsStore = useSettingsStore();
const aux = settingsStore.auxiliary;
const pageRef = ref<HTMLElement | null>(null);

async function persist() {
  try {
    await settingsStore.saveSettings();
  } catch (e) {
    console.error("[AuxiliaryPage] 保存備用 API 設定失敗:", e);
  }
}

// ===== 提示泡泡 =====
const toast = ref<string | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | null = null;
function showToast(text: string) {
  toast.value = text;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = null), 2000);
}

// ===== 連線 =====
const showApiKey = ref(false);
const isFetchingModels = ref(false);
const fetchedModels = ref<string[]>([]);
const modelFetchError = ref("");
const lastFetchedEndpoint = ref("");
const isTestingConnection = ref(false);
const connectionStatus = ref<"none" | "success" | "error">("none");
const connectionMessage = ref("");

const availableModels = computed(() => {
  if (fetchedModels.value.length > 0) return [...fetchedModels.value];
  const preset = ["gpt-3.5-turbo", "gpt-4o-mini", "claude-3-haiku-20240307"];
  const current = aux.api.model;
  const all = [...preset];
  if (current && !all.includes(current)) all.unshift(current);
  return all.filter((m) => m);
});

function clearFetchedModels() {
  fetchedModels.value = [];
  lastFetchedEndpoint.value = "";
  modelFetchError.value = "";
}

async function fetchModelsFromApi() {
  const ep = aux.api.endpoint;
  const key = aux.api.apiKey;
  if (!ep || !key) {
    modelFetchError.value = "請先填寫備用 API 端點和密鑰";
    return;
  }
  if (lastFetchedEndpoint.value && lastFetchedEndpoint.value !== ep) {
    fetchedModels.value = [];
  }
  isFetchingModels.value = true;
  modelFetchError.value = "";
  fetchedModels.value = [];
  try {
    // 支援 OpenAI 格式，404 時改試 Gemini 原生格式
    const models = (
      await fetchModelIds(ep, key, (url) => toAiProxyUrl(url, aux.api.directConnect))
    ).sort();
    if (models.length > 0) {
      fetchedModels.value = models;
      lastFetchedEndpoint.value = ep;
      if (!models.includes(aux.api.model)) aux.api.model = models[0];
      await persist();
    } else {
      modelFetchError.value = "未找到可用模型";
    }
  } catch (e) {
    console.error("[AuxiliaryPage] 拉取模型失敗:", e);
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

async function testConnection() {
  if (!aux.api.endpoint || !aux.api.apiKey) {
    connectionStatus.value = "error";
    connectionMessage.value = "請填寫備用 API 端點和密鑰";
    return;
  }
  isTestingConnection.value = true;
  connectionStatus.value = "none";
  try {
    const client = new OpenAICompatibleClient(aux.api);
    const result = await client.testConnection();
    if (result.success) {
      connectionStatus.value = "success";
      connectionMessage.value = result.response
        ? `連線成功，模型回覆：「${result.response}」`
        : "備用 API 連線成功";
    } else {
      connectionStatus.value = "error";
      connectionMessage.value = result.message || "備用 API 連線失敗";
    }
  } catch (e) {
    connectionStatus.value = "error";
    connectionMessage.value = `錯誤：${e instanceof Error ? e.message : String(e)}`;
  } finally {
    isTestingConnection.value = false;
  }
}

const clipboardHint = ref<{ type: "success" | "error"; text: string } | null>(null);
let clipboardHintTimer: ReturnType<typeof setTimeout> | null = null;
function showClipboardHint(type: "success" | "error", text: string) {
  clipboardHint.value = { type, text };
  if (clipboardHintTimer) clearTimeout(clipboardHintTimer);
  clipboardHintTimer = setTimeout(() => (clipboardHint.value = null), 2500);
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
  if (parsed.endpoint) aux.api.endpoint = parsed.endpoint;
  if (parsed.apiKey) aux.api.apiKey = parsed.apiKey;
  const filled: string[] = [];
  if (parsed.endpoint) filled.push("端點");
  if (parsed.apiKey) filled.push("密鑰");
  showClipboardHint("success", `已填入${filled.join("、")}`);
  await persist();
}

// ===== 配置檔 =====
const isFormDirty = computed(() => {
  const cur = aux.currentProfileId;
  if (!cur) return false;
  const profile = aux.profiles?.find((p) => p.id === cur);
  if (!profile) return false;
  return (
    profile.api.endpoint !== aux.api.endpoint ||
    profile.api.apiKey !== aux.api.apiKey ||
    profile.api.model !== aux.api.model ||
    profile.api.provider !== aux.api.provider
  );
});

function profileNameSuggestion(): string {
  const endpoint = aux.api.endpoint || "";
  if (endpoint.includes("openai.com")) return "OpenAI 備用";
  if (endpoint.includes("anthropic.com")) return "Claude 備用";
  if (endpoint.includes("googleapis.com")) return "Gemini 備用";
  if (endpoint.includes("openrouter.ai")) return "OpenRouter 備用";
  return `備用配置 ${(aux.profiles?.length || 0) + 1}`;
}

const pendingSwitchProfileId = ref<string | null>(null);
const showSwitchConfirm = ref(false);

function requestSwitchProfile(profileId: string) {
  if (editingProfileId.value) return;
  if (profileId === aux.currentProfileId) return;
  if (isFormDirty.value) {
    pendingSwitchProfileId.value = profileId;
    showSwitchConfirm.value = true;
    return;
  }
  void performSwitchProfile(profileId);
}

async function performSwitchProfile(profileId: string) {
  settingsStore.switchAuxiliaryProfile(profileId);
  clearFetchedModels();
  connectionStatus.value = "none";
  pendingSwitchProfileId.value = null;
  showSwitchConfirm.value = false;
  await persist();
}

async function switchConfirmSaveAndGo() {
  if (aux.currentProfileId) {
    settingsStore.updateAuxiliaryProfile(
      aux.currentProfileId,
      { ...aux.api },
      { ...aux.generation },
    );
    await persist();
  }
  if (pendingSwitchProfileId.value) await performSwitchProfile(pendingSwitchProfileId.value);
}

async function switchConfirmDiscardAndGo() {
  if (pendingSwitchProfileId.value) await performSwitchProfile(pendingSwitchProfileId.value);
}

function switchConfirmCancel() {
  pendingSwitchProfileId.value = null;
  showSwitchConfirm.value = false;
}

async function updateCurrentProfile() {
  if (!aux.currentProfileId) return;
  settingsStore.updateAuxiliaryProfile(aux.currentProfileId, { ...aux.api }, { ...aux.generation });
  await persist();
  showToast("已更新備用配置");
}

// 改名
const editingProfileId = ref<string | null>(null);
const editingProfileName = ref("");

async function startRenameProfile(profileId: string) {
  const profile = aux.profiles?.find((p) => p.id === profileId);
  actionProfileId.value = null;
  if (!profile) return;
  editingProfileId.value = profileId;
  editingProfileName.value = profile.name;
  await nextTick();
  const input = pageRef.value?.querySelector<HTMLInputElement>(
    `[data-aux-rename="${profileId}"]`,
  );
  input?.focus();
  input?.select();
}

async function confirmRenameProfile() {
  const profileId = editingProfileId.value;
  const name = editingProfileName.value.trim();
  editingProfileId.value = null;
  editingProfileName.value = "";
  if (profileId && name) {
    settingsStore.renameAuxiliaryProfile(profileId, name);
    await persist();
  }
}

// 「⋯」選單
const actionProfileId = ref<string | null>(null);
const actionProfile = computed(
  () => aux.profiles?.find((p) => p.id === actionProfileId.value) ?? null,
);

async function copyProfileField(field: "endpoint" | "apiKey" | "both") {
  const profile = actionProfile.value;
  actionProfileId.value = null;
  if (!profile) return;
  const text =
    field === "endpoint"
      ? profile.api.endpoint || ""
      : field === "apiKey"
        ? profile.api.apiKey || ""
        : `端點：${profile.api.endpoint || ""}\n密鑰：${profile.api.apiKey || ""}`;
  if (await copyTextWithFallback(text)) {
    showToast(field === "endpoint" ? "已複製端點" : field === "apiKey" ? "已複製密鑰" : "已複製端點 + 密鑰");
  }
}

async function duplicateProfile() {
  const source = actionProfile.value;
  actionProfileId.value = null;
  if (!source) return;
  const created = settingsStore.duplicateAuxiliaryProfile(source.id);
  if (created) {
    await persist();
    await startRenameProfile(created.id);
  }
}

async function deleteProfile() {
  const profile = actionProfile.value;
  actionProfileId.value = null;
  if (!profile) return;
  if (confirm(`確定要刪除備用配置「${profile.name}」嗎？`)) {
    settingsStore.deleteAuxiliaryProfile(profile.id);
    await persist();
  }
}

// 新建 / 另存
const showNewProfileDialog = ref(false);
const showSaveAsDialog = ref(false);
const newProfileName = ref("");

function openNewProfileDialog() {
  newProfileName.value = profileNameSuggestion();
  showNewProfileDialog.value = true;
}

async function createProfileEmpty() {
  const name = newProfileName.value.trim() || `備用配置 ${(aux.profiles?.length || 0) + 1}`;
  Object.assign(aux.api, { provider: "custom", endpoint: "", apiKey: "", model: "" });
  settingsStore.createAuxiliaryProfile(name);
  await persist();
  newProfileName.value = "";
  showNewProfileDialog.value = false;
  clearFetchedModels();
  connectionStatus.value = "none";
}

async function createProfileFromCurrent() {
  const name = newProfileName.value.trim() || profileNameSuggestion();
  settingsStore.createAuxiliaryProfile(name);
  await persist();
  newProfileName.value = "";
  showNewProfileDialog.value = false;
}

function openSaveAsDialog() {
  newProfileName.value = profileNameSuggestion();
  showSaveAsDialog.value = true;
}

async function confirmSaveAs() {
  const name = newProfileName.value.trim() || profileNameSuggestion();
  settingsStore.createAuxiliaryProfile(name);
  showSaveAsDialog.value = false;
  await persist();
  showToast(`已存成「${name}」`);
}

function resetAuxiliary() {
  if (!confirm("確定要重置備用 API 嗎？備用配置、各功能路由都會回到預設。")) return;
  settingsStore.resetAuxiliary();
  clearFetchedModels();
  connectionStatus.value = "none";
  void persist();
}

// ===== 各功能路由 =====
const openTaskId = ref<string | null>(null);
const taskTestStatus = ref<Record<string, "none" | "testing" | "success" | "error">>({});
const taskTestMessage = ref<Record<string, string>>({});

function bindingName(profileId: string | null | undefined): string {
  if (!profileId) return "主 API";
  const profile = aux.profiles?.find((p) => p.id === profileId);
  return profile ? profile.name : "主 API（原綁定已失效）";
}

function directConnectValue(taskId: string): string {
  const val = aux.taskDirectConnect?.[taskId as RoutableTaskType];
  if (val === true) return "true";
  if (val === false) return "false";
  return "inherit";
}

async function updateTaskBinding(taskId: string, profileId: string) {
  if (!(taskId in aux.taskBindings)) return;
  aux.taskBindings[taskId as RoutableTaskType] = profileId || null;
  await persist();
}

async function updateTaskDirectConnect(taskId: string, value: string) {
  if (!(taskId in aux.taskBindings)) return;
  // "inherit" → null（跟隨綁定配置）, "true" → 直連, "false" → 走代理
  aux.taskDirectConnect[taskId as RoutableTaskType] =
    value === "true" ? true : value === "false" ? false : null;
  await persist();
}

async function testTaskConnection(taskId: string) {
  taskTestStatus.value[taskId] = "testing";
  taskTestMessage.value[taskId] = "";
  try {
    const { api: taskApi } = settingsStore.getAPIForTask(taskId);
    if (!taskApi.endpoint?.trim() || !taskApi.apiKey?.trim()) {
      taskTestStatus.value[taskId] = "error";
      taskTestMessage.value[taskId] = "端點或密鑰未設置";
      return;
    }
    const client = new OpenAICompatibleClient(taskApi);
    const result = await client.testConnection();
    if (result.success) {
      taskTestStatus.value[taskId] = "success";
      taskTestMessage.value[taskId] = result.response
        ? `連線成功：「${result.response.slice(0, 40)}」`
        : "連線成功";
    } else {
      taskTestStatus.value[taskId] = "error";
      taskTestMessage.value[taskId] = result.message || "連線失敗";
    }
  } catch (e) {
    taskTestStatus.value[taskId] = "error";
    taskTestMessage.value[taskId] = `錯誤：${e instanceof Error ? e.message : String(e)}`;
  }
}

onDeactivated(() => {
  actionProfileId.value = null;
  if (editingProfileId.value) void confirmRenameProfile();
});
</script>

<template>
  <div ref="pageRef" class="st-page">
    <SettingsGroup
      :footer="
        aux.enabled
          ? '關閉時，所有功能都走主要模型。'
          : '備用 API 可以給總結、翻譯等輔助功能用，建議選便宜的模型（如 gpt-4o-mini）。沒設定時，所有功能都走主要模型。'
      "
    >
      <SettingsSwitchRow
        v-model="aux.enabled"
        label="啟用備用 API"
        description="給總結、翻譯等輔助功能用，建議選便宜的模型"
        @change="persist"
      />
    </SettingsGroup>

    <template v-if="aux.enabled">
      <SettingsGroup title="備用配置">
        <div
          v-for="profile in aux.profiles ?? []"
          :key="profile.id"
          class="aux-profile"
          style="--st-inset: 48px"
        >
          <div v-if="editingProfileId === profile.id" class="aux-profile__pick">
            <span class="st-radio" :class="{ 'st-radio--on': aux.currentProfileId === profile.id }" aria-hidden="true">
              <Check v-if="aux.currentProfileId === profile.id" :stroke-width="3" />
            </span>
            <input
              v-model="editingProfileName"
              :data-aux-rename="profile.id"
              type="text"
              class="st-input"
              aria-label="備用配置名稱"
              @keyup.enter="confirmRenameProfile"
              @blur="confirmRenameProfile"
            />
          </div>
          <button
            v-else
            type="button"
            class="aux-profile__pick"
            :aria-pressed="aux.currentProfileId === profile.id ? 'true' : 'false'"
            @click="requestSwitchProfile(profile.id)"
          >
            <span class="st-radio" :class="{ 'st-radio--on': aux.currentProfileId === profile.id }" aria-hidden="true">
              <Check v-if="aux.currentProfileId === profile.id" :stroke-width="3" />
            </span>
            <span class="aux-profile__info">
              <span class="aux-profile__name">
                <span class="aux-profile__name-text">{{ profile.name }}</span>
                <span class="st-chip">{{ getProviderLabel(profile.api.provider) }}</span>
                <span v-if="aux.currentProfileId === profile.id && isFormDirty" class="st-chip st-chip--warn">未保存</span>
              </span>
              <span class="aux-profile__meta">
                {{ profile.api.model || "未設置模型" }} · {{ getEndpointHost(profile.api.endpoint) || "未設定端點" }}
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
        <div v-if="!aux.profiles?.length" class="st-row">
          <span class="st-row__desc">還沒有備用配置，點「新建備用配置」建立。</span>
        </div>
        <SettingsRow clickable tone="accent" label="新建備用配置" @click="openNewProfileDialog">
          <template #icon><Plus class="aux-plus" aria-hidden="true" /></template>
        </SettingsRow>
        <template v-if="aux.profiles?.length">
          <SettingsRow
            clickable
            tone="accent"
            label="更新目前配置"
            :description="isFormDirty ? '表單和目前配置不一樣，按這裡寫回' : undefined"
            :disabled="!aux.currentProfileId"
            @click="updateCurrentProfile"
          />
          <SettingsRow clickable tone="accent" label="另存為新配置" @click="openSaveAsDialog" />
        </template>
      </SettingsGroup>

      <SettingsGroup title="連線">
        <div class="st-fields">
          <div class="st-field">
            <div class="st-field__head">
              <label for="aux-endpoint" class="st-field__label">端點</label>
              <button type="button" class="st-link-btn" @click="pasteCredentialsFromClipboard">
                <ClipboardPaste aria-hidden="true" />從剪貼簿填入
              </button>
            </div>
            <input
              id="aux-endpoint"
              v-model="aux.api.endpoint"
              type="url"
              class="st-input"
              name="url"
              placeholder="https://api.openai.com/v1"
              autocomplete="url"
              inputmode="url"
              autocorrect="off"
              autocapitalize="none"
              spellcheck="false"
              @change="persist"
            />
            <p
              v-if="clipboardHint"
              class="st-hint"
              :class="clipboardHint.type === 'success' ? 'st-hint--ok' : 'st-hint--error'"
            >
              {{ clipboardHint.text }}
            </p>
          </div>
          <div class="st-field">
            <label for="aux-key" class="st-field__label">密鑰</label>
            <div class="st-input-wrap">
              <input
                id="aux-key"
                v-model="aux.api.apiKey"
                :type="showApiKey ? 'text' : 'password'"
                name="password"
                placeholder="sk-..."
                autocomplete="new-password"
                autocorrect="off"
                autocapitalize="none"
                spellcheck="false"
                @change="persist"
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
              <label for="aux-model" class="st-field__label">模型</label>
              <button type="button" class="st-link-btn" :disabled="isFetchingModels" @click="fetchModelsFromApi">
                <RefreshCw aria-hidden="true" />{{ isFetchingModels ? "拉取中…" : "拉取模型" }}
              </button>
            </div>
            <div class="st-select-wrap">
              <select id="aux-model" v-model="aux.api.model" class="st-input" @change="persist">
                <option value="" disabled>選擇模型…</option>
                <option v-for="model in availableModels" :key="model" :value="model">{{ model }}</option>
              </select>
              <ChevronDown aria-hidden="true" />
            </div>
            <p v-if="modelFetchError" class="st-hint st-hint--error">{{ modelFetchError }}</p>
            <p v-else-if="fetchedModels.length > 0" class="st-hint st-hint--ok">
              已從 API 拉取 {{ fetchedModels.length }} 個模型
            </p>
            <p v-else class="st-hint">建議用便宜的模型（如 gpt-4o-mini）</p>
          </div>
        </div>
        <SettingsSwitchRow
          :model-value="!!aux.api.directConnect"
          label="瀏覽器直連"
          description="不經過伺服器代理；各功能可以在下方單獨覆寫"
          @update:model-value="aux.api.directConnect = $event"
          @change="persist"
        />
        <div class="st-pad">
          <button
            type="button"
            class="st-btn st-btn--soft st-btn--block"
            :disabled="isTestingConnection"
            @click="testConnection"
          >
            <Zap aria-hidden="true" />{{ isTestingConnection ? "測試中…" : "測試備用 API 連線" }}
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
          v-model="aux.generation.temperature"
          v-model:enabled="aux.generation.enableTemperature"
          label="溫度"
          :min="0"
          :max="1"
          :step="0.1"
          hint="輔助任務建議 0.3–0.5，輸出比較穩定。"
          @change="persist"
        />
        <SettingsParam
          v-model="aux.generation.topP"
          v-model:enabled="aux.generation.enableTopP"
          label="Top P"
          :min="0"
          :max="1"
          :step="0.05"
          @change="persist"
        />
        <SettingsParam
          v-model="aux.generation.topK"
          v-model:enabled="aux.generation.enableTopK"
          label="Top K"
          :min="0"
          :max="200"
          :step="1"
          hint="只有部分模型支援，不支援請關閉。"
          @change="persist"
        />
        <SettingsParam
          v-model="aux.generation.frequencyPenalty"
          v-model:enabled="aux.generation.enableFrequencyPenalty"
          label="頻率懲罰"
          :min="-2"
          :max="2"
          :step="0.1"
          @change="persist"
        />
        <SettingsParam
          v-model="aux.generation.presencePenalty"
          v-model:enabled="aux.generation.enablePresencePenalty"
          label="存在懲罰"
          :min="-2"
          :max="2"
          :step="0.1"
          @change="persist"
        />
      </SettingsGroup>

      <SettingsGroup
        title="各功能走哪個 API"
        footer="沒指定的功能一律走主 API；指定的備用配置失效時，也會自動退回主 API。"
      >
        <template v-for="task in AUXILIARY_TASKS" :key="task.id">
          <div class="aux-task">
            <SettingsRow
              clickable
              :label="task.name"
              :chevron="openTaskId === task.id ? 'up' : 'down'"
              :aria-expanded="openTaskId === task.id ? 'true' : 'false'"
              @click="openTaskId = openTaskId === task.id ? null : task.id"
            >
              <template #value>
                <span class="aux-task__value">
                  <span v-if="directConnectValue(task.id) === 'true'" class="st-chip">強制直連</span>
                  <span v-else-if="directConnectValue(task.id) === 'false'" class="st-chip">強制代理</span>
                  <span :class="{ 'aux-task__routed': !!aux.taskBindings[task.id as RoutableTaskType] }">
                    {{ bindingName(aux.taskBindings[task.id as RoutableTaskType]) }}
                  </span>
                </span>
              </template>
            </SettingsRow>
            <div v-if="openTaskId === task.id" class="st-inset">
              <p class="st-hint">{{ task.description }}</p>
              <div class="aux-task__line">
                <label :for="`aux-task-${task.id}`" class="aux-task__label">使用</label>
                <div class="st-select-wrap aux-task__control">
                  <select
                    :id="`aux-task-${task.id}`"
                    class="st-input"
                    :value="aux.taskBindings[task.id as RoutableTaskType] || ''"
                    @change="updateTaskBinding(task.id, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">主 API</option>
                    <option v-for="profile in aux.profiles ?? []" :key="profile.id" :value="profile.id">
                      {{ profile.name }}（備用）
                    </option>
                  </select>
                  <ChevronDown aria-hidden="true" />
                </div>
              </div>
              <div class="aux-task__line">
                <label :for="`aux-task-dc-${task.id}`" class="aux-task__label">直連</label>
                <div class="st-select-wrap aux-task__control">
                  <select
                    :id="`aux-task-dc-${task.id}`"
                    class="st-input"
                    :value="directConnectValue(task.id)"
                    @change="updateTaskDirectConnect(task.id, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="inherit">跟隨配置</option>
                    <option value="true">強制直連</option>
                    <option value="false">強制代理</option>
                  </select>
                  <ChevronDown aria-hidden="true" />
                </div>
              </div>
              <div class="aux-task__line aux-task__line--test">
                <button
                  type="button"
                  class="st-btn st-btn--soft st-btn--sm"
                  :disabled="taskTestStatus[task.id] === 'testing'"
                  @click="testTaskConnection(task.id)"
                >
                  {{ taskTestStatus[task.id] === "testing" ? "測試中…" : "測試" }}
                </button>
                <span
                  v-if="taskTestMessage[task.id]"
                  class="st-status"
                  :class="taskTestStatus[task.id] === 'success' ? 'st-status--ok' : 'st-status--error'"
                >
                  {{ taskTestMessage[task.id] }}
                </span>
              </div>
            </div>
          </div>
        </template>
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow clickable tone="danger" label="重置備用 API" @click="resetAuxiliary" />
      </SettingsGroup>
    </template>

    <SettingsSheet
      :open="!!actionProfile"
      :title="actionProfile?.name ?? ''"
      done-label="取消"
      @close="actionProfileId = null"
    >
      <SettingsGroup>
        <SettingsRow clickable label="複製端點" @click="copyProfileField('endpoint')" />
        <SettingsRow clickable label="複製密鑰" @click="copyProfileField('apiKey')" />
        <SettingsRow clickable label="複製端點 + 密鑰" @click="copyProfileField('both')" />
      </SettingsGroup>
      <SettingsGroup>
        <SettingsRow clickable label="重命名" @click="actionProfile && startRenameProfile(actionProfile.id)" />
        <SettingsRow clickable label="建立副本" @click="duplicateProfile" />
        <SettingsRow clickable tone="danger" label="刪除" @click="deleteProfile" />
      </SettingsGroup>
    </SettingsSheet>

    <SettingsDialog
      :open="showNewProfileDialog"
      title="新建備用配置"
      text="可以建一個空白配置，或把目前表單的內容複製過去。"
      @close="showNewProfileDialog = false"
    >
      <input
        v-model="newProfileName"
        type="text"
        class="st-input"
        aria-label="備用配置名稱"
        placeholder="備用配置名稱"
        @keyup.enter="createProfileFromCurrent"
      />
      <template #actions>
        <button type="button" class="st-btn st-btn--primary st-btn--block" @click="createProfileFromCurrent">
          複製目前設定
        </button>
        <button type="button" class="st-btn st-btn--block" @click="createProfileEmpty">建空白配置</button>
        <button type="button" class="st-btn st-btn--block" style="border-color: transparent" @click="showNewProfileDialog = false">
          取消
        </button>
      </template>
    </SettingsDialog>

    <SettingsDialog
      :open="showSaveAsDialog"
      title="另存為新的備用配置"
      text="用目前表單的內容建立新的備用配置。"
      @close="showSaveAsDialog = false"
    >
      <input
        v-model="newProfileName"
        type="text"
        class="st-input"
        aria-label="備用配置名稱"
        placeholder="備用配置名稱"
        @keyup.enter="confirmSaveAs"
      />
      <template #actions>
        <button type="button" class="st-btn st-btn--primary st-btn--block" @click="confirmSaveAs">保存</button>
        <button type="button" class="st-btn st-btn--block" style="border-color: transparent" @click="showSaveAsDialog = false">
          取消
        </button>
      </template>
    </SettingsDialog>

    <ProfileSwitchConfirm
      :open="showSwitchConfirm"
      @save="switchConfirmSaveAndGo"
      @discard="switchConfirmDiscardAndGo"
      @cancel="switchConfirmCancel"
    />

    <Transition name="st-toast">
      <div v-if="toast" class="st-toast" role="status">{{ toast }}</div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.aux-profile {
  display: flex;
  align-items: center;
  padding-right: 4px;
}

.aux-profile__pick {
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

.aux-profile__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.aux-profile__name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 16px;
  font-weight: 500;
}

.aux-profile__name-text {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.aux-profile__meta {
  font-size: 13px;
  color: var(--st-sub);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.aux-plus {
  flex: none;
  width: 22px;
  height: 22px;
  color: var(--st-accent-ink);
}

.aux-task__value {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
}

.aux-task__routed {
  color: var(--st-accent-ink);
  font-weight: 500;
}

.aux-task__line {
  display: flex;
  align-items: center;
  gap: 10px;

  &--test {
    padding-left: 50px;
    flex-wrap: wrap;
  }
}

.aux-task__label {
  flex: none;
  width: 40px;
  font-size: 14px;
  color: var(--st-text);
}

.aux-task__control {
  flex: 1;
  min-width: 0;

  .st-input {
    height: 44px;
    background: var(--st-card);
  }
}
</style>
