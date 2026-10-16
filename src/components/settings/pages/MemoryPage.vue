<script setup lang="ts">
/** 向量記憶：開關、嵌入引擎（本地 / 遠端）、Embedding 連線。改了就保存。 */
import { useSettingsStore } from "@/stores";
import { fetchModelIds } from "@/utils/modelListFetcher";
import { ChevronDown, RefreshCw } from "lucide-vue-next";
import { computed, ref } from "vue";
import { toAiProxyUrl } from "../settingsHelpers";
import SettingsGroup from "../ui/SettingsGroup.vue";
import SettingsSegmented from "../ui/SettingsSegmented.vue";
import SettingsSwitchRow from "../ui/SettingsSwitchRow.vue";

const settingsStore = useSettingsStore();

function save() {
  void settingsStore.saveSettings();
}

const engine = computed({
  get: () => settingsStore.embeddingMode ?? "local",
  set: (value: string) => {
    settingsStore.embeddingMode = value as "local" | "api";
    save();
  },
});

// ===== 本地模型測試 =====
const localModelStatus = ref<"idle" | "loading" | "ready" | "error">("idle");
const localModelProgress = ref(0);
const localModelFile = ref("");
const localModelError = ref("");

async function testLocalModel() {
  localModelStatus.value = "loading";
  localModelProgress.value = 0;
  localModelFile.value = "";
  localModelError.value = "";
  try {
    const { embeddingEngine } = await import("@/services/embeddingEngine");
    embeddingEngine.setProgressCallback((info) => {
      // Transformers.js 的 progress：status 為 initiate/download/progress/done/warmup
      if (info.progress != null) localModelProgress.value = info.progress / 100;
      if (info.file) localModelFile.value = info.file;
      if (info.status === "warmup") {
        localModelFile.value = "WASM 首次編譯中（可能需要 10~30 秒）…";
        localModelProgress.value = 1;
      }
    });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("模型載入超時（2 分鐘），請檢查瀏覽器是否支援 WebAssembly")),
        120_000,
      ),
    );
    // 觸發模型載入 + 實際推理測試
    await Promise.race([embeddingEngine.embed("測試嵌入"), timeout]);
    embeddingEngine.setProgressCallback(null);
    localModelStatus.value = "ready";
  } catch (e: unknown) {
    console.error("[本地嵌入模型] 測試失敗:", e);
    localModelError.value = e instanceof Error ? e.message : "未知錯誤";
    localModelStatus.value = "error";
  }
}

// ===== 遠端 Embedding =====
const isFetchingModels = ref(false);
const fetchedModels = ref<string[]>([]);
const modelFetchError = ref("");
const customModelName = ref("");
const lastFetchedEndpoint = ref("");

async function fetchEmbeddingModels() {
  const endpoint = settingsStore.embeddingAPI.endpoint || settingsStore.api.endpoint;
  const apiKey = settingsStore.embeddingAPI.apiKey || settingsStore.api.apiKey;
  if (!endpoint || !apiKey) {
    modelFetchError.value = "請先填寫 Embedding 端點和密鑰（或主要模型的設定）";
    return;
  }
  if (lastFetchedEndpoint.value && lastFetchedEndpoint.value !== endpoint) {
    fetchedModels.value = [];
  }
  isFetchingModels.value = true;
  modelFetchError.value = "";
  try {
    const allModels = await fetchModelIds(endpoint, apiKey, (url) =>
      toAiProxyUrl(url, settingsStore.embeddingAPI.directConnect),
    );
    // 過濾出 embedding 相關模型；過濾後沒有就全部列出，讓使用者自己選
    const keywords = ["embed", "bge", "e5", "text2vec", "gte", "jina", "voyage", "nomic"];
    const embeddingModels = allModels.filter((id: string) =>
      keywords.some((kw) => id.toLowerCase().includes(kw)),
    );
    fetchedModels.value = (embeddingModels.length > 0 ? embeddingModels : allModels).sort(
      (a: string, b: string) => a.localeCompare(b),
    );
    if (fetchedModels.value.length > 0) {
      lastFetchedEndpoint.value = endpoint;
      if (!fetchedModels.value.includes(settingsStore.embeddingAPI.model)) {
        settingsStore.embeddingAPI.model = fetchedModels.value[0];
        save();
      }
    } else {
      modelFetchError.value = "未找到可用模型";
    }
  } catch (e) {
    console.error("[Embedding] 拉取模型失敗:", e);
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

const modelOptions = computed(() => {
  const list = [...fetchedModels.value];
  const current = settingsStore.embeddingAPI.model;
  if (current && current !== "__custom__" && !list.includes(current)) list.unshift(current);
  return list;
});

function onModelChange() {
  // 選「手動輸入」時先不保存，等輸入完
  if (settingsStore.embeddingAPI.model === "__custom__") return;
  save();
}

function applyCustomModel() {
  if (customModelName.value.trim()) {
    settingsStore.embeddingAPI.model = customModelName.value.trim();
    customModelName.value = "";
    save();
  }
}
</script>

<template>
  <div class="st-page">
    <SettingsGroup
      footer="讓 AI 依語意找回相關的舊總結，不只看時間先後。每次你發訊息，會挑出最相關的幾條總結放進提示詞。總結讀取模式為「全部」時用不到。"
    >
      <SettingsSwitchRow
        :model-value="!!settingsStore.vectorMemoryEnabled"
        label="啟用向量記憶"
        @update:model-value="settingsStore.vectorMemoryEnabled = $event"
        @change="save"
      />
    </SettingsGroup>

    <SettingsGroup title="嵌入引擎">
      <div>
        <SettingsSegmented
          v-model="engine"
          class="st-seg--inset"
          label="嵌入引擎"
          :options="[
            { value: 'local', label: '本地推理' },
            { value: 'api', label: '遠端 API' },
          ]"
        />
        <p v-if="engine === 'local'" class="st-hint memory-intro">
          用 bge-small-zh-v1.5 在瀏覽器內計算，免費、可離線。第一次使用要下載約 30MB 的模型檔。
        </p>
        <p v-else class="st-hint memory-intro">
          使用遠端 OpenAI 相容的 Embedding API。端點和金鑰留空，就沿用主要模型的設定。
        </p>
      </div>

      <template v-if="engine === 'local'">
        <div class="st-pad">
          <div v-if="localModelStatus === 'loading'" class="memory-progress">
            <div class="memory-progress__track">
              <div class="memory-progress__bar" :style="{ width: localModelProgress * 100 + '%' }" />
            </div>
            <span class="st-hint">
              {{ localModelFile || "載入模型中…" }}
              {{ localModelProgress < 1 ? Math.round(localModelProgress * 100) + "%" : "" }}
            </span>
          </div>
          <span v-else-if="localModelStatus === 'ready'" class="st-status st-status--ok">模型已就緒，可以正常使用</span>
          <span v-else-if="localModelStatus === 'error'" class="st-status st-status--error">
            {{ localModelError || "模型載入失敗" }}
          </span>
          <button
            type="button"
            class="st-btn st-btn--soft st-btn--block"
            :disabled="localModelStatus === 'loading'"
            @click="testLocalModel"
          >
            {{
              localModelStatus === "loading"
                ? "載入中…"
                : localModelStatus === "ready"
                  ? "重新測試"
                  : "測試本地模型"
            }}
          </button>
        </div>
      </template>

      <template v-else>
        <div class="st-fields">
          <div class="st-field">
            <label for="memory-endpoint" class="st-field__label">Embedding 端點</label>
            <input
              id="memory-endpoint"
              v-model="settingsStore.embeddingAPI.endpoint"
              type="url"
              class="st-input"
              name="url"
              placeholder="留空使用主要模型的端點"
              autocomplete="url"
              inputmode="url"
              autocorrect="off"
              autocapitalize="none"
              spellcheck="false"
              @change="save"
            />
          </div>
          <div class="st-field">
            <label for="memory-key" class="st-field__label">Embedding API Key</label>
            <input
              id="memory-key"
              v-model="settingsStore.embeddingAPI.apiKey"
              type="password"
              class="st-input"
              name="password"
              placeholder="留空使用主要模型的密鑰"
              autocomplete="current-password"
              autocorrect="off"
              autocapitalize="none"
              spellcheck="false"
              @change="save"
            />
          </div>
          <div class="st-field">
            <div class="st-field__head">
              <label for="memory-model" class="st-field__label">Embedding 模型</label>
              <button type="button" class="st-link-btn" :disabled="isFetchingModels" @click="fetchEmbeddingModels">
                <RefreshCw aria-hidden="true" />{{ isFetchingModels ? "拉取中…" : "拉取模型" }}
              </button>
            </div>
            <div class="st-select-wrap">
              <select
                id="memory-model"
                v-model="settingsStore.embeddingAPI.model"
                class="st-input"
                @change="onModelChange"
              >
                <option value="" disabled>{{ isFetchingModels ? "拉取模型中…" : "選擇模型…" }}</option>
                <option v-for="model in modelOptions" :key="model" :value="model">{{ model }}</option>
                <option value="__custom__">手動輸入…</option>
              </select>
              <ChevronDown aria-hidden="true" />
            </div>
            <template v-if="settingsStore.embeddingAPI.model === '__custom__'">
              <input
                v-model="customModelName"
                type="text"
                class="st-input"
                aria-label="Embedding 模型名稱"
                placeholder="輸入模型名稱，例如：BAAI/bge-large-zh-v1.5"
                @blur="applyCustomModel"
                @keyup.enter="applyCustomModel"
              />
              <p class="st-hint">輸入完成後按 Enter 或點其他地方確認</p>
            </template>
            <p v-if="modelFetchError" class="st-hint st-hint--error">{{ modelFetchError }}</p>
            <p v-else-if="fetchedModels.length > 0" class="st-hint st-hint--ok">
              已拉取 {{ fetchedModels.length }} 個 Embedding 模型
            </p>
          </div>
        </div>
        <SettingsSwitchRow
          :model-value="!!settingsStore.embeddingAPI.directConnect"
          label="直連"
          description="不經過伺服器代理"
          @update:model-value="settingsStore.embeddingAPI.directConnect = $event"
          @change="save"
        />
      </template>
    </SettingsGroup>
  </div>
</template>

<style scoped lang="scss">
.memory-intro {
  margin: 0 16px 14px;
  font-size: 13px;
  line-height: 1.6;
}

.memory-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.memory-progress__track {
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--st-text) 10%, var(--st-card));
}

.memory-progress__bar {
  height: 100%;
  border-radius: 999px;
  background: var(--st-accent-strong);
  transition: width 0.3s ease;
}
</style>
