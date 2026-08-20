<script setup lang="ts">
/**
 * 備用 API 設定面板
 * 從 SettingsScreen 抽取，管理備用 API 配置文件、任務路由綁定、模型拉取與連接測試。
 */
import { OpenAICompatibleClient } from "@/api/OpenAICompatible";
import {
  AUXILIARY_TASKS,
  useSettingsStore,
} from "@/stores";
import type { RoutableTaskType } from "@/stores/settings";
import { computed, ref } from "vue";

// ===== Store =====
const settingsStore = useSettingsStore();

// ===== 配置文件 Modal =====
const showProfileModal = ref(false);
const showNewProfileConfirm = ref(false);
const newProfileName = ref("");

// 切換配置時若未保存 dirty 提示
const pendingSwitchProfileId = ref<string | null>(null);
const showSwitchConfirm = ref(false);

// 複製選單
const copyMenuProfileId = ref<string | null>(null);
const copiedProfileId = ref<string | null>(null);

// 剪貼簿匯入提示
const clipboardImportHint = ref<{ type: "success" | "error"; text: string } | null>(
  null,
);
let clipboardImportHintTimer: ReturnType<typeof setTimeout> | null = null;
function showClipboardImportHint(type: "success" | "error", text: string) {
  clipboardImportHint.value = { type, text };
  if (clipboardImportHintTimer) clearTimeout(clipboardImportHintTimer);
  clipboardImportHintTimer = setTimeout(() => {
    clipboardImportHint.value = null;
  }, 2500);
}

// ===== API Key 顯示 =====
const showApiKey = ref(false);

// ===== 模型拉取 =====
const isFetchingModels = ref(false);
const fetchedModels = ref<string[]>([]);
const modelFetchError = ref("");
const lastFetchedEndpoint = ref("");

// ===== 連接測試 =====
const isTestingConnection = ref(false);
const connectionStatus = ref<"none" | "success" | "error">("none");
const connectionMessage = ref("");

// ===== 各任務快速測試 =====
const taskTestStatus = ref<Record<string, "none" | "testing" | "success" | "error">>({});
const taskTestMessage = ref<Record<string, string>>({});

// ===== 代理 URL 轉換 =====
function toProxyUrl(url: string): string {
  if (settingsStore.auxiliary.api.directConnect) return url;
  if (typeof window === "undefined") return url;
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === window.location.origin) return url;
    const prefix =
      parsed.protocol === "http:" ? "/ai-proxy-http/" : "/ai-proxy/";
    return `https://tight-sun-f7fa.a23971123.workers.dev${prefix}${parsed.host}${parsed.pathname}`;
  } catch {
    return url;
  }
}

// ===== 可用模型列表 =====
const availableModels = computed(() => {
  if (fetchedModels.value.length > 0) return [...fetchedModels.value];
  const preset = ["gpt-3.5-turbo", "gpt-4o-mini", "claude-3-haiku-20240307"];
  const current = settingsStore.auxiliary.api.model;
  const all = [...preset];
  if (current && !all.includes(current)) all.unshift(current);
  return all.filter((m) => m);
});

// ===== 持久化 =====
async function persist() {
  try {
    await settingsStore.saveSettings();
  } catch (e) {
    console.error("[AuxiliaryApiPanel] 保存備用 API 設定失敗:", e);
  }
}

// ===== 任務路由綁定 =====
function getProfileLabel(profileId: string | null): string {
  if (!profileId) return "主 API";
  const profile = settingsStore.auxiliary.profiles?.find((p) => p.id === profileId);
  if (!profile) return "主 API（原綁定已失效）";
  const endpoint = profile.api.endpoint || "";
  let host = "未設置端點";
  if (endpoint) {
    try { host = new URL(endpoint).host; } catch { host = endpoint; }
  }
  return `${profile.name} · ${profile.api.model || "未設置模型"} · ${host}`;
}

async function updateTaskBinding(taskId: string, profileId: string) {
  const normalized = profileId || null;
  if (!(taskId in settingsStore.auxiliary.taskBindings)) return;
  settingsStore.auxiliary.taskBindings[taskId as RoutableTaskType] = normalized;
  await persist();
}

async function updateTaskDirectConnect(taskId: string, value: string) {
  if (!(taskId in settingsStore.auxiliary.taskBindings)) return;
  // "inherit" → null（跟隨綁定配置）, "true" → 直連, "false" → 走代理
  const parsed = value === "true" ? true : value === "false" ? false : null;
  settingsStore.auxiliary.taskDirectConnect[taskId as RoutableTaskType] = parsed;
  await persist();
}

function getTaskDirectConnectValue(taskId: string): string {
  const val = settingsStore.auxiliary.taskDirectConnect?.[taskId as RoutableTaskType];
  if (val === true) return "true";
  if (val === false) return "false";
  return "inherit";
}

// ===== 配置文件重命名 =====
const editingAuxProfileId = ref<string | null>(null);
const editingAuxProfileName = ref("");

function startRenameAuxProfile(profileId: string) {
  const profile = settingsStore.auxiliary.profiles?.find((p) => p.id === profileId);
  if (!profile) return;
  editingAuxProfileId.value = profileId;
  editingAuxProfileName.value = profile.name;
}

async function confirmRenameAuxProfile() {
  if (editingAuxProfileId.value && editingAuxProfileName.value.trim()) {
    settingsStore.renameAuxiliaryProfile(editingAuxProfileId.value, editingAuxProfileName.value.trim());
    await persist();
  }
  editingAuxProfileId.value = null;
  editingAuxProfileName.value = "";
}

// ===== 配置文件管理 =====
function profileNameSuggestion(): string {
  const endpoint = settingsStore.auxiliary.api.endpoint || "";
  if (endpoint.includes("openai.com")) return "OpenAI 備用";
  if (endpoint.includes("anthropic.com")) return "Claude 備用";
  if (endpoint.includes("googleapis.com")) return "Gemini 備用";
  if (endpoint.includes("openrouter.ai")) return "OpenRouter 備用";
  return `備用配置 ${(settingsStore.auxiliary.profiles?.length || 0) + 1}`;
}

function openNewProfileModal() {
  newProfileName.value = profileNameSuggestion();
  showProfileModal.value = true;
}

// 新建空白備用配置
async function createProfileEmpty() {
  const name =
    newProfileName.value.trim() ||
    `備用配置 ${(settingsStore.auxiliary.profiles?.length || 0) + 1}`;

  Object.assign(settingsStore.auxiliary.api, {
    provider: "custom",
    endpoint: "",
    apiKey: "",
    model: "",
  });

  settingsStore.createAuxiliaryProfile(name);
  await persist();
  newProfileName.value = "";
  showProfileModal.value = false;
  clearFetchedModels();
  connectionStatus.value = "none";
}

// 以當前備用表單內容新建
async function createProfileFromCurrent() {
  const name = newProfileName.value.trim() || profileNameSuggestion();
  settingsStore.createAuxiliaryProfile(name);
  await persist();
  newProfileName.value = "";
  showProfileModal.value = false;
}

// dirty check
function isCurrentFormDirty(): boolean {
  const cur = settingsStore.auxiliary.currentProfileId;
  if (!cur) return false;
  const profile = settingsStore.auxiliary.profiles?.find((p) => p.id === cur);
  if (!profile) return false;
  return (
    profile.api.endpoint !== settingsStore.auxiliary.api.endpoint ||
    profile.api.apiKey !== settingsStore.auxiliary.api.apiKey ||
    profile.api.model !== settingsStore.auxiliary.api.model ||
    profile.api.provider !== settingsStore.auxiliary.api.provider
  );
}

function requestSwitchProfile(profileId: string) {
  if (profileId === settingsStore.auxiliary.currentProfileId) return;
  if (isCurrentFormDirty()) {
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
  if (settingsStore.auxiliary.currentProfileId) {
    settingsStore.updateAuxiliaryProfile(
      settingsStore.auxiliary.currentProfileId,
      { ...settingsStore.auxiliary.api },
      { ...settingsStore.auxiliary.generation },
    );
    await persist();
  }
  if (pendingSwitchProfileId.value) {
    await performSwitchProfile(pendingSwitchProfileId.value);
  }
}

async function switchConfirmDiscardAndGo() {
  if (pendingSwitchProfileId.value) {
    await performSwitchProfile(pendingSwitchProfileId.value);
  }
}

function switchConfirmCancel() {
  pendingSwitchProfileId.value = null;
  showSwitchConfirm.value = false;
}

// 雙鍵保存動作
async function updateCurrentProfileAndSave() {
  if (!settingsStore.auxiliary.currentProfileId) return;
  settingsStore.updateAuxiliaryProfile(
    settingsStore.auxiliary.currentProfileId,
    { ...settingsStore.auxiliary.api },
    { ...settingsStore.auxiliary.generation },
  );
  await persist();
}

function openSaveAsNewProfile() {
  newProfileName.value = profileNameSuggestion();
  showNewProfileConfirm.value = true;
}

// 複製一份
function duplicateProfileHandler(profileId: string) {
  const created = settingsStore.duplicateAuxiliaryProfile(profileId);
  if (created) {
    editingAuxProfileId.value = created.id;
    editingAuxProfileName.value = created.name;
    void persist();
  }
}

// ===== Provider / endpoint / 密鑰 顯示輔助 =====
function getProviderLabel(provider: string | undefined): string {
  switch (provider) {
    case "openai":
      return "OpenAI";
    case "claude":
      return "Claude";
    case "gemini":
      return "Gemini";
    case "openrouter":
      return "OpenRouter";
    case "custom":
      return "自定義";
    default:
      return provider || "";
  }
}

function getEndpointHost(endpoint: string | undefined): string {
  if (!endpoint) return "";
  try {
    return new URL(endpoint).host || endpoint;
  } catch {
    return endpoint.length > 32 ? endpoint.slice(0, 32) + "…" : endpoint;
  }
}

function getMaskedApiKey(key: string | undefined): string {
  if (!key) return "未設定密鑰";
  if (key.length <= 8) return "sk-…" + key.slice(-2);
  return key.slice(0, 4) + "…" + key.slice(-4);
}

// ===== 分項複製 =====
async function copyTextWithFallback(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}

function toggleCopyMenu(profileId: string) {
  copyMenuProfileId.value =
    copyMenuProfileId.value === profileId ? null : profileId;
}

function closeCopyMenu() {
  copyMenuProfileId.value = null;
}

async function copyProfileEndpoint(profileId: string) {
  const profile = settingsStore.auxiliary.profiles?.find(
    (p) => p.id === profileId,
  );
  if (!profile) return;
  await copyTextWithFallback(profile.api.endpoint || "");
  copiedProfileId.value = profileId;
  setTimeout(() => (copiedProfileId.value = null), 1500);
  closeCopyMenu();
}

async function copyProfileApiKey(profileId: string) {
  const profile = settingsStore.auxiliary.profiles?.find(
    (p) => p.id === profileId,
  );
  if (!profile) return;
  await copyTextWithFallback(profile.api.apiKey || "");
  copiedProfileId.value = profileId;
  setTimeout(() => (copiedProfileId.value = null), 1500);
  closeCopyMenu();
}

async function copyProfileBoth(profileId: string) {
  const profile = settingsStore.auxiliary.profiles?.find(
    (p) => p.id === profileId,
  );
  if (!profile) return;
  const text = `端點：${profile.api.endpoint || ""}\n密鑰：${profile.api.apiKey || ""}`;
  await copyTextWithFallback(text);
  copiedProfileId.value = profileId;
  setTimeout(() => (copiedProfileId.value = null), 1500);
  closeCopyMenu();
}

// ===== 從剪貼簿匯入端點 + 金鑰 =====
function parseEndpointAndKey(
  raw: string,
): { endpoint?: string; apiKey?: string } {
  const result: { endpoint?: string; apiKey?: string } = {};
  if (!raw) return result;
  const lines = raw.split(/\r?\n+/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const m =
      /^(?:端點|endpoint|url|api[_\s-]*url)\s*[:：=]\s*(.+)$/i.exec(line);
    if (m && !result.endpoint) {
      result.endpoint = m[1].trim();
      continue;
    }
    const k =
      /^(?:密鑰|金鑰|key|api[_\s-]*key|token)\s*[:：=]\s*(.+)$/i.exec(line);
    if (k && !result.apiKey) {
      result.apiKey = k[1].trim();
      continue;
    }
  }
  if (!result.endpoint) {
    const urlMatch = raw.match(/https?:\/\/[^\s"'<>]+/i);
    if (urlMatch) result.endpoint = urlMatch[0].trim();
  }
  if (!result.apiKey) {
    const keyMatch = raw.match(
      /(?:Bearer\s+)?(sk-[A-Za-z0-9_\-]{16,}|pst-[A-Za-z0-9_\-]{16,}|[A-Za-z0-9_\-]{32,})/,
    );
    if (keyMatch) result.apiKey = keyMatch[1].trim();
  }
  return result;
}

async function pasteCredentialsFromClipboard() {
  let text = "";
  try {
    text = await navigator.clipboard.readText();
  } catch {
    showClipboardImportHint(
      "error",
      "無法讀取剪貼簿，請手動貼上到欄位中",
    );
    return;
  }
  if (!text) {
    showClipboardImportHint("error", "剪貼簿是空的");
    return;
  }
  const parsed = parseEndpointAndKey(text);
  if (!parsed.endpoint && !parsed.apiKey) {
    showClipboardImportHint("error", "未在剪貼簿中辨識到端點或密鑰");
    return;
  }
  if (parsed.endpoint) settingsStore.auxiliary.api.endpoint = parsed.endpoint;
  if (parsed.apiKey) settingsStore.auxiliary.api.apiKey = parsed.apiKey;
  const filled: string[] = [];
  if (parsed.endpoint) filled.push("端點");
  if (parsed.apiKey) filled.push("密鑰");
  showClipboardImportHint("success", `已填入${filled.join("、")}`);
  await persist();
}

async function confirmDeleteProfile(profileId: string) {
  const profile = settingsStore.auxiliary.profiles?.find((p) => p.id === profileId);
  if (!profile) return;
  if (confirm(`確定要刪除備用配置「${profile.name}」嗎？`)) {
    settingsStore.deleteAuxiliaryProfile(profileId);
    await persist();
  }
}

async function confirmCreateAndSave() {
  const name = newProfileName.value.trim() || profileNameSuggestion();
  settingsStore.createAuxiliaryProfile(name);
  showNewProfileConfirm.value = false;
  await persist();
}

function cancelNewProfile() {
  showNewProfileConfirm.value = false;
  persist();
}

// ===== 模型拉取 =====
function clearFetchedModels() {
  fetchedModels.value = [];
  lastFetchedEndpoint.value = "";
  modelFetchError.value = "";
}

async function fetchModelsFromApi() {
  const ep = settingsStore.auxiliary.api.endpoint;
  const key = settingsStore.auxiliary.api.apiKey;
  if (!ep || !key) { modelFetchError.value = "請先填寫備用 API 端點和密鑰"; return; }

  if (lastFetchedEndpoint.value && lastFetchedEndpoint.value !== ep) {
    fetchedModels.value = [];
  }

  isFetchingModels.value = true;
  modelFetchError.value = "";
  fetchedModels.value = [];

  try {
    const url = toProxyUrl(`${ep}/models`);
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    const data = await res.json();
    let models: string[] = [];

    if (data.data && Array.isArray(data.data)) {
      models = data.data.map((m: { id?: string }) => m.id || "").filter(Boolean).sort();
    } else if (Array.isArray(data)) {
      models = data.map((m: string | { id?: string }) => typeof m === "string" ? m : m.id || "").filter(Boolean);
    }

    if (models.length > 0) {
      fetchedModels.value = models;
      lastFetchedEndpoint.value = ep;
      if (!models.includes(settingsStore.auxiliary.api.model)) {
        settingsStore.auxiliary.api.model = models[0];
      }
      await persist();
    } else {
      modelFetchError.value = "未找到可用模型";
    }
  } catch (e) {
    console.error("[AuxiliaryApiPanel] 拉取模型失敗:", e);
    modelFetchError.value = e instanceof TypeError && e.message.includes("fetch")
      ? "CORS 限制，請手動輸入模型名稱"
      : `拉取失敗: ${e instanceof Error ? e.message : String(e)}`;
    fetchedModels.value = [];
    lastFetchedEndpoint.value = "";
  } finally {
    isFetchingModels.value = false;
  }
}

// ===== 連接測試 =====
async function testConnection() {
  if (!settingsStore.auxiliary.api.endpoint || !settingsStore.auxiliary.api.apiKey) {
    connectionStatus.value = "error";
    connectionMessage.value = "請填寫備用 API 端點和密鑰";
    return;
  }
  isTestingConnection.value = true;
  connectionStatus.value = "none";
  try {
    const client = new OpenAICompatibleClient(settingsStore.auxiliary.api);
    const result = await client.testConnection();
    if (result.success) {
      connectionStatus.value = "success";
      connectionMessage.value = result.response ? `✓ 模型回覆: "${result.response}"` : "備用 API 連接成功！";
    } else {
      connectionStatus.value = "error";
      connectionMessage.value = result.message || "備用 API 連接失敗";
    }
  } catch (e) {
    connectionStatus.value = "error";
    connectionMessage.value = `錯誤: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    isTestingConnection.value = false;
  }
}

// ===== 各任務快速連接測試 =====
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
        ? `✓ "${result.response.slice(0, 40)}"`
        : "✓ 連接成功";
    } else {
      taskTestStatus.value[taskId] = "error";
      taskTestMessage.value[taskId] = result.message || "連接失敗";
    }
  } catch (e) {
    taskTestStatus.value[taskId] = "error";
    taskTestMessage.value[taskId] = `錯誤: ${e instanceof Error ? e.message : String(e)}`;
  }
}
</script>

<template>
  <div class="settings-section">
    <!-- 啟用開關 -->
    <label class="toggle-item highlight">
      <div class="toggle-content">
        <span class="toggle-label">啟用備用 API</span>
        <span class="toggle-desc">用於總結、翻譯等輔助功能，建議使用便宜的模型</span>
      </div>
      <input type="checkbox" v-model="settingsStore.auxiliary.enabled" class="toggle-input" @change="persist" />
      <span class="toggle-switch"></span>
    </label>

    <template v-if="settingsStore.auxiliary.enabled">
      <!-- 配置文件列表 -->
      <div class="profiles-section" @click="closeCopyMenu">
        <div class="profiles-header">
          <span class="profiles-title">備用 API 配置</span>
          <button class="add-profile-btn" @click.stop="openNewProfileModal">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
            新建
          </button>
        </div>
        <div v-if="settingsStore.auxiliary.profiles?.length" class="profiles-list">
          <div
            v-for="profile in settingsStore.auxiliary.profiles"
            :key="profile.id"
            class="profile-item"
            :class="{ active: settingsStore.auxiliary.currentProfileId === profile.id }"
            :style="{ zIndex: copyMenuProfileId === profile.id ? 20 : 1, position: 'relative' }"
            @click="requestSwitchProfile(profile.id)"
          >
            <div class="profile-active-dot" v-if="settingsStore.auxiliary.currentProfileId === profile.id"></div>
            <div class="profile-info">
              <template v-if="editingAuxProfileId === profile.id">
                <input
                  v-model="editingAuxProfileName"
                  type="text"
                  class="profile-rename-input"
                  @click.stop
                  @keyup.enter="confirmRenameAuxProfile"
                  @blur="confirmRenameAuxProfile"
                />
              </template>
              <template v-else>
                <div class="profile-name-row">
                  <span class="profile-name">{{ profile.name }}</span>
                  <span
                    v-if="settingsStore.auxiliary.currentProfileId === profile.id"
                    class="profile-active-badge"
                  >使用中</span>
                  <span class="profile-provider-tag">{{ getProviderLabel(profile.api.provider) }}</span>
                </div>
                <span class="profile-model">{{ profile.api.model || '未設置模型' }}</span>
                <span class="profile-meta">
                  <span v-if="profile.api.endpoint" class="profile-host">{{ getEndpointHost(profile.api.endpoint) }}</span>
                  <span v-else class="profile-host empty">未設定端點</span>
                  <span class="profile-key">{{ getMaskedApiKey(profile.api.apiKey) }}</span>
                </span>
              </template>
            </div>
            <div class="profile-actions" @click.stop>
              <button class="profile-action-btn rename" title="重命名" @click.stop="startRenameAuxProfile(profile.id)">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>
              </button>
              <button class="profile-action-btn" title="複製一份配置" @click.stop="duplicateProfileHandler(profile.id)">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z" /></svg>
              </button>
              <div class="profile-copy-wrapper">
                <button
                  class="profile-action-btn"
                  :title="copiedProfileId === profile.id ? '已複製！' : '複製端點 / 密鑰'"
                  @click.stop="toggleCopyMenu(profile.id)"
                >
                  <svg v-if="copiedProfileId !== profile.id" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" /></svg>
                  <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                </button>
                <div v-if="copyMenuProfileId === profile.id" class="copy-menu" @click.stop>
                  <button class="copy-menu-item" @click="copyProfileEndpoint(profile.id)">複製端點</button>
                  <button class="copy-menu-item" @click="copyProfileApiKey(profile.id)">複製密鑰</button>
                  <button class="copy-menu-item" @click="copyProfileBoth(profile.id)">端點 + 密鑰</button>
                </div>
              </div>
              <button class="profile-action-btn delete" title="刪除" @click.stop="confirmDeleteProfile(profile.id)">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
              </button>
            </div>
          </div>
        </div>
        <div v-else class="profiles-empty"><p>尚無配置，點擊「新建」創建</p></div>

        <!-- 主表單保存動作 -->
        <div v-if="settingsStore.auxiliary.profiles?.length" class="profile-save-actions">
          <button
            class="profile-save-btn primary"
            :disabled="!settingsStore.auxiliary.currentProfileId"
            @click.stop="updateCurrentProfileAndSave"
          >
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z" /></svg>
            更新當前配置
          </button>
          <button class="profile-save-btn secondary" @click.stop="openSaveAsNewProfile">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
            另存為新配置
          </button>
        </div>
      </div>

      <div class="section-divider"></div>

      <!-- API 端點 -->
      <div class="setting-group">
        <div class="setting-label-row">
          <label class="setting-label" for="auxiliary-api-endpoint">API 端點</label>
          <button type="button" class="fetch-btn small" @click="pasteCredentialsFromClipboard" title="從剪貼簿讀取端點 + 密鑰並填入">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V6h10v2z" /></svg>
            從剪貼簿填入
          </button>
        </div>
        <input
          v-model="settingsStore.auxiliary.api.endpoint"
          type="url"
          class="soft-input"
          id="auxiliary-api-endpoint"
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
          v-if="clipboardImportHint"
          :class="['setting-hint', clipboardImportHint.type === 'success' ? 'success' : 'error']"
        >
          {{ clipboardImportHint.text }}
        </p>
      </div>

      <!-- API 密鑰 -->
      <div class="setting-group">
        <label class="setting-label">API 密鑰</label>
        <div class="api-key-input">
          <input
            v-model="settingsStore.auxiliary.api.apiKey"
            :type="showApiKey ? 'text' : 'password'"
            class="soft-input api-key-field"
            id="auxiliary-api-key"
            name="password"
            placeholder="sk-..."
            autocomplete="current-password"
            autocorrect="off"
            autocapitalize="none"
            spellcheck="false"
            @change="persist"
          />
          <button class="toggle-visibility" @click="showApiKey = !showApiKey">
            <svg v-if="showApiKey" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" /></svg>
            <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27z" /></svg>
          </button>
        </div>
      </div>

      <!-- 模型 -->
      <div class="setting-group">
        <div class="setting-label-row">
          <label class="setting-label">模型</label>
          <button class="fetch-btn small" :disabled="isFetchingModels" @click="fetchModelsFromApi">
            <span v-if="isFetchingModels" class="spinner small"></span>
            <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" /></svg>
            拉取模型
          </button>
        </div>
        <select v-model="settingsStore.auxiliary.api.model" class="soft-select" @change="persist">
          <option value="" disabled>選擇模型...</option>
          <option v-for="model in availableModels" :key="model" :value="model">{{ model }}</option>
        </select>
        <p v-if="fetchedModels.length > 0" class="setting-hint success">已從 API 拉取 {{ fetchedModels.length }} 個模型</p>
        <p v-else-if="modelFetchError" class="setting-hint error">{{ modelFetchError }}</p>
        <p v-else class="setting-hint">建議使用便宜模型（如 gpt-3.5-turbo）</p>
      </div>

      <!-- 溫度 -->
      <div class="setting-group param-card">
        <div class="param-header">
          <div class="param-meta">
            <span class="param-name">溫度</span>
            <span class="param-hint-text">關閉則不發送給 API</span>
          </div>
          <span class="value-badge">{{ settingsStore.auxiliary.generation.temperature }}</span>
          <label class="toggle-item param-toggle">
            <input type="checkbox" v-model="settingsStore.auxiliary.generation.enableTemperature" class="toggle-input" @change="persist" />
            <span class="toggle-switch"></span>
          </label>
        </div>
        <input v-model.number="settingsStore.auxiliary.generation.temperature" type="range" min="0" max="1" step="0.1" class="soft-slider" :disabled="!settingsStore.auxiliary.generation.enableTemperature" @change="persist" />
        <p class="setting-hint">備用 API 建議使用較低溫度（0.3-0.5）以確保輸出穩定</p>
      </div>

      <!-- Top P -->
      <div class="setting-group param-card">
        <div class="param-header">
          <div class="param-meta">
            <span class="param-name">Top P</span>
            <span class="param-hint-text">關閉則不發送給 API</span>
          </div>
          <span class="value-badge">{{ settingsStore.auxiliary.generation.topP }}</span>
          <label class="toggle-item param-toggle">
            <input type="checkbox" v-model="settingsStore.auxiliary.generation.enableTopP" class="toggle-input" @change="persist" />
            <span class="toggle-switch"></span>
          </label>
        </div>
        <input v-model.number="settingsStore.auxiliary.generation.topP" type="range" min="0" max="1" step="0.05" class="soft-slider" :disabled="!settingsStore.auxiliary.generation.enableTopP" @change="persist" />
      </div>

      <!-- Top K -->
      <div class="setting-group param-card">
        <div class="param-header">
          <div class="param-meta">
            <span class="param-name">Top K</span>
            <span class="param-hint-text">僅部分模型支援，不支援請關閉</span>
          </div>
          <span class="value-badge">{{ settingsStore.auxiliary.generation.topK }}</span>
          <label class="toggle-item param-toggle">
            <input type="checkbox" v-model="settingsStore.auxiliary.generation.enableTopK" class="toggle-input" @change="persist" />
            <span class="toggle-switch"></span>
          </label>
        </div>
        <input v-model.number="settingsStore.auxiliary.generation.topK" type="range" min="0" max="200" step="1" class="soft-slider" :disabled="!settingsStore.auxiliary.generation.enableTopK" @change="persist" />
      </div>

      <!-- 頻率懲罰 -->
      <div class="setting-group param-card">
        <div class="param-header">
          <div class="param-meta">
            <span class="param-name">頻率懲罰</span>
            <span class="param-hint-text">關閉則不發送給 API</span>
          </div>
          <span class="value-badge">{{ settingsStore.auxiliary.generation.frequencyPenalty }}</span>
          <label class="toggle-item param-toggle">
            <input type="checkbox" v-model="settingsStore.auxiliary.generation.enableFrequencyPenalty" class="toggle-input" @change="persist" />
            <span class="toggle-switch"></span>
          </label>
        </div>
        <input v-model.number="settingsStore.auxiliary.generation.frequencyPenalty" type="range" min="-2" max="2" step="0.1" class="soft-slider" :disabled="!settingsStore.auxiliary.generation.enableFrequencyPenalty" @change="persist" />
      </div>

      <!-- 存在懲罰 -->
      <div class="setting-group param-card">
        <div class="param-header">
          <div class="param-meta">
            <span class="param-name">存在懲罰</span>
            <span class="param-hint-text">關閉則不發送給 API</span>
          </div>
          <span class="value-badge">{{ settingsStore.auxiliary.generation.presencePenalty }}</span>
          <label class="toggle-item param-toggle">
            <input type="checkbox" v-model="settingsStore.auxiliary.generation.enablePresencePenalty" class="toggle-input" @change="persist" />
            <span class="toggle-switch"></span>
          </label>
        </div>
        <input v-model.number="settingsStore.auxiliary.generation.presencePenalty" type="range" min="-2" max="2" step="0.1" class="soft-slider" :disabled="!settingsStore.auxiliary.generation.enablePresencePenalty" @change="persist" />
      </div>

      <!-- 直連模式 -->
      <div class="setting-group">
        <label class="toggle-item">
          <span class="toggle-label">瀏覽器直連</span>
          <input
            type="checkbox"
            v-model="settingsStore.auxiliary.api.directConnect"
            class="toggle-input"
            @change="persist"
          />
          <span class="toggle-switch"></span>
        </label>
        <p class="setting-hint">
          開啟後備用 API 請求直接從瀏覽器發出，不經過伺服器代理。各任務可單獨覆寫此設定。
        </p>
      </div>

      <!-- 測試連接 -->
      <button class="test-btn" :disabled="isTestingConnection" @click="testConnection">
        <span v-if="isTestingConnection" class="spinner"></span>
        <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg>
        測試備用 API 連接
      </button>

      <div v-if="connectionStatus !== 'none'" class="connection-result" :class="connectionStatus">
        <svg v-if="connectionStatus === 'success'" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
        <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" /></svg>
        <span>{{ connectionMessage }}</span>
      </div>

      <!-- 重置 -->
      <button class="reset-btn" @click="settingsStore.resetAuxiliary()">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" /></svg>
        重置備用 API
      </button>

      <!-- 各功能 API 路由 -->
      <div class="setting-group">
        <label class="setting-label">各功能 API 路由</label>
        <div class="task-binding-list">
          <div v-for="task in AUXILIARY_TASKS" :key="task.id" class="task-binding-item">
            <div class="task-binding-meta">
              <div class="task-binding-title-row">
                <span class="task-binding-icon">{{ task.icon }}</span>
                <span class="task-binding-name">{{ task.name }}</span>
              </div>
              <p class="task-binding-desc">{{ task.description }}</p>
              <p class="task-binding-current">目前路由： {{ getProfileLabel(settingsStore.auxiliary.taskBindings[task.id]) }}</p>
            </div>
            <select
              class="soft-select task-binding-select"
              :value="settingsStore.auxiliary.taskBindings[task.id] || ''"
              @change="updateTaskBinding(task.id, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">主 API</option>
              <option v-for="profile in settingsStore.auxiliary.profiles" :key="profile.id" :value="profile.id">
                {{ getProfileLabel(profile.id) }}
              </option>
            </select>
            <div class="task-direct-connect-row">
              <span class="task-dc-label">直連</span>
              <select
                class="soft-select task-dc-select"
                :value="getTaskDirectConnectValue(task.id)"
                @change="updateTaskDirectConnect(task.id, ($event.target as HTMLSelectElement).value)"
              >
                <option value="inherit">跟隨配置</option>
                <option value="true">強制直連</option>
                <option value="false">強制代理</option>
              </select>
              <button
                class="task-test-btn"
                :class="taskTestStatus[task.id]"
                :disabled="taskTestStatus[task.id] === 'testing'"
                @click="testTaskConnection(task.id)"
              >
                <span v-if="taskTestStatus[task.id] === 'testing'" class="spinner small"></span>
                <svg v-else viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg>
                測試
              </button>
            </div>
            <span v-if="taskTestMessage[task.id]" class="task-test-msg" :class="taskTestStatus[task.id]">
              {{ taskTestMessage[task.id] }}
            </span>
          </div>
        </div>
        <p class="setting-hint">未手動指定的功能一律走主 API；若綁定的備用配置失效，也會自動回退主 API。</p>
      </div>
    </template>

    <!-- 未啟用提示 -->
    <div v-else class="auxiliary-disabled-hint">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" /></svg>
      <p>備用 API 可以用於總結、翻譯等輔助功能</p>
      <p>建議使用較便宜的模型（如 gpt-3.5-turbo）以節省費用</p>
      <p>未設定時，所有功能都會使用主 API</p>
    </div>
  </div>

  <!-- 新建配置 Modal -->
  <Teleport to="body">
    <div v-if="showProfileModal" class="modal-overlay" @click="showProfileModal = false">
      <div class="profile-modal" @click.stop>
        <h3>新建備用 API 配置</h3>
        <p class="confirm-desc">
          請輸入配置名稱，並選擇要建空白、還是複製現在備用表單的內容。
        </p>
        <input v-model="newProfileName" type="text" class="soft-input" placeholder="配置名稱（如：GPT-3.5 總結用）" @keyup.enter="createProfileFromCurrent" />
        <div class="modal-actions modal-actions-stack">
          <button class="modal-btn cancel" @click="createProfileEmpty">建空白配置</button>
          <button class="modal-btn confirm" @click="createProfileFromCurrent">複製當前設定</button>
        </div>
        <button class="modal-btn-text" @click="showProfileModal = false">取消</button>
      </div>
    </div>
  </Teleport>

  <!-- 切換配置時未保存提示 -->
  <Teleport to="body">
    <div v-if="showSwitchConfirm" class="modal-overlay" @click="switchConfirmCancel">
      <div class="profile-modal confirm-modal" @click.stop>
        <div class="confirm-icon">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" /></svg>
        </div>
        <h3>當前配置有未保存改動</h3>
        <p class="confirm-desc">當前表單與選中配置不一致，直接切換會丟掉這些改動。</p>
        <div class="modal-actions modal-actions-stack">
          <button class="modal-btn confirm" @click="switchConfirmSaveAndGo">先保存到當前配置再切換</button>
          <button class="modal-btn cancel" @click="switchConfirmDiscardAndGo">丟掉改動並切換</button>
        </div>
        <button class="modal-btn-text" @click="switchConfirmCancel">取消</button>
      </div>
    </div>
  </Teleport>

  <!-- 保存時詢問是否創建新配置 -->
  <Teleport to="body">
    <div v-if="showNewProfileConfirm" class="modal-overlay" @click="showNewProfileConfirm = false">
      <div class="profile-modal confirm-modal" @click.stop>
        <div class="confirm-icon">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
        </div>
        <h3>發現新的備用 API 設定</h3>
        <p class="confirm-desc">這個備用 API 地址與現有配置不同，<br />要保存為新的備用配置文件嗎？</p>
        <input v-model="newProfileName" type="text" class="soft-input" placeholder="備用配置名稱" @keyup.enter="confirmCreateAndSave" />
        <div class="modal-actions">
          <button class="modal-btn cancel" @click="cancelNewProfile">不保存配置</button>
          <button class="modal-btn confirm" @click="confirmCreateAndSave">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
            保存為備用配置
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss">
// 匯入設定頁面共用樣式
@use "../../styles/settings-shared";

// iOS 風格參數卡片（內嵌開關）
.param-card {
  background: var(--color-surface, #fff);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 12px;
}

.param-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.param-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.param-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text, #333);
  line-height: 1.3;
}

.param-hint-text {
  font-size: 12px;
  color: var(--color-text-secondary, #8e8e93);
  line-height: 1.3;
}

.param-toggle {
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

// 任務路由綁定列表（AuxiliaryApiPanel 專用）

// 配置文件操作按鈕組（橫排）
.profile-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.profile-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}

.profile-active-badge {
  font-size: 10px;
  font-weight: 700;
  color: white;
  background: linear-gradient(135deg, #a8e6cf, #7dd3a8);
  padding: 2px 8px;
  border-radius: 999px;
  letter-spacing: 0.5px;
}

.profile-provider-tag {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-primary, #5fbc8a);
  background: rgba(125, 211, 168, 0.12);
  padding: 2px 8px;
  border-radius: 6px;
  letter-spacing: 0.3px;
}

.profile-meta {
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--color-text-muted, #999);

  .profile-host {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    color: var(--color-text-secondary, #666);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 60%;

    &.empty {
      color: var(--color-text-muted, #aaa);
      font-style: italic;
      font-family: inherit;
    }
  }

  .profile-key {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    color: var(--color-text-muted, #aaa);
  }
}

.profile-copy-wrapper {
  position: relative;
}

.copy-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  display: flex;
  flex-direction: column;
  min-width: 130px;
  padding: 4px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 10px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  z-index: 10;
}

.copy-menu-item {
  padding: 8px 10px;
  background: transparent;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  text-align: left;
  color: var(--color-text, #333);
  cursor: pointer;

  &:hover {
    background: rgba(125, 211, 168, 0.12);
    color: var(--color-primary, #5fbc8a);
  }
}

.profile-save-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.profile-save-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  svg {
    width: 16px;
    height: 16px;
  }

  &.primary {
    background: linear-gradient(135deg, #a8e6cf, #7dd3a8);
    color: white;

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 10px rgba(125, 211, 168, 0.35);
    }
  }

  &.secondary {
    background: var(--color-surface, #fff);
    border-color: var(--color-border, #e2e8f0);
    color: var(--color-text, #333);

    &:hover:not(:disabled) {
      border-color: var(--color-primary, #7dd3a8);
      color: var(--color-primary, #5fbc8a);
    }
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.modal-actions.modal-actions-stack {
  flex-direction: column;
  gap: 8px;
}

.modal-btn-text {
  display: block;
  width: 100%;
  margin-top: 8px;
  padding: 8px;
  background: transparent;
  border: none;
  font-size: 13px;
  color: var(--color-text-muted, #999);
  cursor: pointer;

  &:hover {
    color: var(--color-text-secondary, #666);
  }
}

.profile-action-btn.rename {
  svg {
    width: 16px;
    height: 16px;
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
  transition: box-shadow 0.2s;

  &:focus {
    box-shadow: 0 0 0 3px rgba(125, 211, 168, 0.3);
  }
}

.task-binding-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
}

.task-binding-item {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 12px;
  padding: 12px;
}

.task-binding-meta {
  margin-bottom: 8px;
}

.task-binding-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.task-binding-icon {
  font-size: 18px;
}

.task-binding-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text, #333);
}

.task-binding-desc {
  font-size: 12px;
  color: var(--color-text-muted, #999);
  margin: 2px 0;
}

.task-binding-current {
  font-size: 12px;
  color: var(--color-text-muted, #888);
  margin: 4px 0 0;
}

.task-binding-select {
  width: 100%;
}

// 各任務直連覆寫 + 測試（同一行）
.task-direct-connect-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}

.task-dc-label {
  font-size: 12px;
  color: var(--color-text-muted, #888);
  white-space: nowrap;
}

.task-dc-select {
  flex: 1;
  // 覆寫 soft-select 的預設大小，讓它更緊湊
  padding: 6px 28px 6px 10px !important;
  font-size: 12px !important;
  border-radius: 8px !important;
  background-position: right 6px center !important;
}

// 各任務快速測試
.task-test-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.task-test-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  background: var(--color-surface, #fff);
  color: var(--color-text-muted, #888);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;

  svg {
    width: 14px;
    height: 14px;
  }

  &:hover:not(:disabled) {
    border-color: var(--color-primary, #4caf50);
    color: var(--color-primary, #4caf50);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &.success {
    border-color: #4caf50;
    color: #4caf50;
  }

  &.error {
    border-color: #f44336;
    color: #f44336;
  }
}

.task-test-msg {
  display: block;
  font-size: 11px;
  line-height: 1.3;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &.success {
    color: #4caf50;
  }

  &.error {
    color: #f44336;
  }

  &.testing {
    color: var(--color-text-muted, #888);
  }
}
</style>
