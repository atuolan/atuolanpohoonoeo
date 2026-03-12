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
    return `https://api-203.aguacloud.uk${prefix}${parsed.host}${parsed.pathname}`;
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

async function createProfile() {
  if (!newProfileName.value.trim()) {
    newProfileName.value = `備用配置 ${(settingsStore.auxiliary.profiles?.length || 0) + 1}`;
  }
  settingsStore.createAuxiliaryProfile(newProfileName.value.trim());
  await persist();
  newProfileName.value = "";
  showProfileModal.value = false;
}

async function switchProfile(profileId: string) {
  settingsStore.switchAuxiliaryProfile(profileId);
  // 端點改變時清空拉取的模型
  clearFetchedModels();
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

// ===== 保存（含自動建立配置文件） =====
async function save() {
  const ep = settingsStore.auxiliary.api.endpoint?.trim();
  const key = settingsStore.auxiliary.api.apiKey?.trim();
  if (!ep || !key) { await persist(); return; }

  if (settingsStore.auxiliary.currentProfileId) {
    const cur = settingsStore.auxiliary.profiles?.find(
      (p) => p.id === settingsStore.auxiliary.currentProfileId,
    );
    if (cur) {
      if (cur.api.endpoint?.trim() === ep) { await persist(); return; }
      const match = settingsStore.auxiliary.profiles?.find(
        (p) => p.id !== settingsStore.auxiliary.currentProfileId && p.api.endpoint?.trim() === ep,
      );
      if (match) { settingsStore.auxiliary.currentProfileId = match.id; await persist(); return; }
      newProfileName.value = profileNameSuggestion();
      showNewProfileConfirm.value = true;
      return;
    }
  }

  const existing = settingsStore.auxiliary.profiles?.find((p) => p.api.endpoint?.trim() === ep);
  if (existing) {
    settingsStore.auxiliary.currentProfileId = existing.id;
    await persist();
  } else if (settingsStore.auxiliary.profiles?.length > 0) {
    newProfileName.value = profileNameSuggestion();
    showNewProfileConfirm.value = true;
  } else {
    settingsStore.createAuxiliaryProfile(profileNameSuggestion());
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
      <div class="profiles-section">
        <div class="profiles-header">
          <span class="profiles-title">備用 API 配置</span>
          <button class="add-profile-btn" @click="showProfileModal = true">
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
            @click="switchProfile(profile.id)"
          >
            <!-- 選中指示器 -->
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
                <span class="profile-name">{{ profile.name }}</span>
                <span class="profile-meta">
                  <span class="profile-model-tag">{{ profile.api.model || '未設置模型' }}</span>
                </span>
              </template>
            </div>
            <div class="profile-actions">
              <button class="profile-action-btn rename" title="重命名" @click.stop="startRenameAuxProfile(profile.id)">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>
              </button>
              <button class="profile-action-btn delete" title="刪除" @click.stop="confirmDeleteProfile(profile.id)">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
              </button>
            </div>
          </div>
        </div>
        <div v-else class="profiles-empty"><p>尚無配置，點擊「新建」創建</p></div>
      </div>

      <div class="section-divider"></div>

      <!-- API 端點 -->
      <div class="setting-group">
        <label class="setting-label">API 端點</label>
        <input v-model="settingsStore.auxiliary.api.endpoint" type="url" class="soft-input" placeholder="https://api.openai.com/v1" @change="persist" />
      </div>

      <!-- API 密鑰 -->
      <div class="setting-group">
        <label class="setting-label">API 密鑰</label>
        <div class="api-key-input">
          <input
            v-model="settingsStore.auxiliary.api.apiKey"
            type="text"
            class="soft-input api-key-field"
            :class="{ masked: !showApiKey }"
            placeholder="sk-..."
            autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
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
      <div class="setting-group">
        <label class="setting-label">
          溫度 <span class="value-badge">{{ settingsStore.auxiliary.generation.temperature }}</span>
        </label>
        <input v-model.number="settingsStore.auxiliary.generation.temperature" type="range" min="0" max="1" step="0.1" class="soft-slider" @change="persist" />
        <p class="setting-hint">備用 API 建議使用較低溫度（0.3-0.5）以確保輸出穩定</p>
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
        <input v-model="newProfileName" type="text" class="soft-input" placeholder="配置名稱（如：GPT-3.5 總結用）" @keyup.enter="createProfile" />
        <div class="modal-actions">
          <button class="modal-btn cancel" @click="showProfileModal = false">取消</button>
          <button class="modal-btn confirm" @click="createProfile">創建</button>
        </div>
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

// 任務路由綁定列表（AuxiliaryApiPanel 專用）

// 配置文件操作按鈕組（橫排）
.profile-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
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
