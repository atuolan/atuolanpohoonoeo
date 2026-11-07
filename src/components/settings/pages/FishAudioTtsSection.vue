<script setup lang="ts">
/**
 * 語音合成設定頁的 Fish Audio 區塊：帳號、預設音色（自己的音色／搜尋公開音色庫）、模型與連線。
 * API Key 先存在草稿，離開欄位或離開這頁才寫回，避免打字到一半被別處的保存覆蓋。
 */
import {
  createDefaultFishAudioSettings,
  FISH_AUDIO_DEFAULT_BASE_URL,
  FISH_AUDIO_MODELS,
  fetchFishAudioVoices,
  fishModelSupportsMarkers,
  normalizeFishAudioBaseUrl,
  synthesizeFishAudio,
  testFishAudioConnection,
  type FishAudioTTSSettings,
  type FishAudioVoice,
} from "@/api/FishAudioTTSApi";
import { useSettingsStore } from "@/stores";
import { Check, ChevronRight, Search } from "lucide-vue-next";
import { computed, onDeactivated, onMounted, onUnmounted, ref, watch } from "vue";
import SettingsGroup from "../ui/SettingsGroup.vue";
import SettingsRow from "../ui/SettingsRow.vue";
import SettingsSelectRow from "../ui/SettingsSelectRow.vue";
import SettingsSheet from "../ui/SettingsSheet.vue";
import SettingsSwitchRow from "../ui/SettingsSwitchRow.vue";

const settingsStore = useSettingsStore();
const tts = settingsStore.minimaxTTS;
if (!tts.fishAudio) tts.fishAudio = createDefaultFishAudioSettings();
const fish = tts.fishAudio as FishAudioTTSSettings;

function save() {
  void settingsStore.saveSettings();
}

// ===== API Key 草稿 =====
const apiKeyDraft = ref("");
const apiKeyFocused = ref(false);
const apiKeyTouched = ref(false);

function syncApiKeyDraft() {
  apiKeyDraft.value = fish.apiKey || "";
  apiKeyTouched.value = false;
}

function markApiKeyTouched() {
  if (apiKeyFocused.value) apiKeyTouched.value = true;
}

function saveApiKeyDraft() {
  if (!apiKeyTouched.value) return;
  if (fish.apiKey !== apiKeyDraft.value) fish.apiKey = apiKeyDraft.value;
  apiKeyTouched.value = false;
  save();
}

watch(
  () => fish.apiKey,
  () => {
    if (!apiKeyFocused.value && !apiKeyTouched.value) syncApiKeyDraft();
  },
);

function requestSettings(): FishAudioTTSSettings {
  return { ...fish, apiKey: apiKeyDraft.value };
}

// ===== 測試與我的音色 =====
const testing = ref(false);
const testResult = ref<{ success: boolean; credit?: string; error?: string } | null>(null);
const fetchingVoices = ref(false);
const myVoices = ref<FishAudioVoice[]>([]);
const voiceError = ref("");
const showVoicePicker = ref(false);

async function testConnection() {
  testing.value = true;
  testResult.value = null;
  testResult.value = await testFishAudioConnection(requestSettings());
  testing.value = false;
}

async function fetchMyVoices() {
  fetchingVoices.value = true;
  voiceError.value = "";
  const result = await fetchFishAudioVoices(requestSettings());
  fetchingVoices.value = false;
  if (result.success) {
    myVoices.value = result.voices;
    if (result.voices.length) showVoicePicker.value = true;
    else voiceError.value = "你還沒有自己的音色，可以用下面的搜尋從公開音色庫挑";
  } else {
    myVoices.value = [];
    voiceError.value = result.error || "取得失敗";
  }
}

const accountStatus = computed(() => {
  if (testing.value) return { tone: "", text: "測試中…" };
  if (fetchingVoices.value) return { tone: "", text: "取得音色中…" };
  if (voiceError.value) return { tone: "error", text: voiceError.value };
  if (testResult.value && !testResult.value.success)
    return { tone: "error", text: `連線失敗：${testResult.value.error || "請檢查 API Key"}` };
  if (testResult.value?.success)
    return {
      tone: "ok",
      text: testResult.value.credit !== undefined ? `連線成功 · API 餘額 ${testResult.value.credit}` : "連線成功",
    };
  if (myVoices.value.length) return { tone: "ok", text: `已取得 ${myVoices.value.length} 個音色` };
  return null;
});

// ===== 預設音色 =====
/** 記住挑過的音色名字，欄位下方顯示用 */
const knownTitles = ref<Record<string, string>>({});

function selectVoice(voice: FishAudioVoice) {
  knownTitles.value[voice.id] = voice.title;
  fish.referenceId = voice.id;
  save();
  showVoicePicker.value = false;
}

const currentVoiceTitle = computed(() => knownTitles.value[fish.referenceId?.trim()] ?? "");

// ===== 搜尋公開音色 =====
const searchQuery = ref("");
const searching = ref(false);
const searchResults = ref<FishAudioVoice[]>([]);
const searchError = ref("");
const searched = ref(false);

async function searchVoices() {
  const query = searchQuery.value.trim();
  if (!query || searching.value) return;
  searching.value = true;
  searchError.value = "";
  const result = await fetchFishAudioVoices(requestSettings(), { query });
  searching.value = false;
  searched.value = true;
  searchResults.value = result.voices;
  if (!result.success) searchError.value = result.error || "搜尋失敗";
  for (const v of result.voices) knownTitles.value[v.id] = v.title;
}

// ===== 試聽 =====
const preview = ref<{ id: string; loading: boolean; url?: string; error?: string } | null>(null);

async function previewVoice(id: string) {
  if (preview.value?.loading) return;
  preview.value = { id, loading: true };
  const result = await synthesizeFishAudio("你好，很高興認識你，今天過得怎麼樣？", requestSettings(), {
    referenceId: id,
    speed: tts.speed,
  });
  if (preview.value?.id !== id) return;
  preview.value =
    result.success && result.audioUrl
      ? { id, loading: false, url: result.audioUrl }
      : { id, loading: false, error: result.error || "試聽失敗" };
}

// ===== 模型 =====
const markersSupported = computed(() => fishModelSupportsMarkers(fish.model || "s1"));

// 模型：從清單選，清單沒有的選「自訂」再自己輸入（不用 datalist，Android 上會浮在畫面上）
const CUSTOM_MODEL = "__custom__";
const customModel = ref(!FISH_AUDIO_MODELS.some((m) => m.value === fish.model));
const modelOptions = [...FISH_AUDIO_MODELS, { value: CUSTOM_MODEL, label: "自訂模型名稱…" }];
const modelChoice = computed({
  get: () => (customModel.value ? CUSTOM_MODEL : fish.model),
  set: (value: string) => {
    customModel.value = value === CUSTOM_MODEL;
    if (!customModel.value) {
      fish.model = value;
      save();
    }
  },
});

function onModelChange() {
  fish.model = fish.model.trim() || "s1";
  save();
}

function onBaseUrlChange() {
  // 貼了完整的 https://api.fish.audio/v1/tts 也整理成根位址
  fish.baseUrl = normalizeFishAudioBaseUrl(fish.baseUrl);
  save();
}

function onProxyChange() {
  testResult.value = null;
  voiceError.value = "";
  save();
}

onMounted(syncApiKeyDraft);
onDeactivated(() => {
  showVoicePicker.value = false;
  saveApiKeyDraft();
});
onUnmounted(saveApiKeyDraft);
</script>

<template>
  <SettingsGroup
    title="Fish Audio 帳號"
    footer="API Key 在 fish.audio 登入後的 API Keys 頁面建立。每個聊天要不要用語音念出來，在聊天的設定選單裡開關。"
  >
    <div class="st-pad">
      <div class="st-field">
        <label for="fish-key" class="st-field__label">API Key</label>
        <input
          id="fish-key"
          v-model="apiKeyDraft"
          type="password"
          class="st-input"
          name="fish-audio-api-key"
          placeholder="你的 Fish Audio API Key"
          autocomplete="new-password"
          autocorrect="off"
          autocapitalize="none"
          spellcheck="false"
          @focus="apiKeyFocused = true"
          @blur="apiKeyFocused = false"
          @input="markApiKeyTouched"
          @change="saveApiKeyDraft"
        />
      </div>
      <div class="st-btn-grid">
        <button type="button" class="st-btn st-btn--soft st-btn--sm" :disabled="testing || !apiKeyDraft" @click="testConnection">
          測試連線
        </button>
        <button type="button" class="st-btn st-btn--soft st-btn--sm" :disabled="fetchingVoices || !apiKeyDraft" @click="fetchMyVoices">
          取得我的音色
        </button>
      </div>
      <span
        v-if="accountStatus"
        class="st-status"
        :class="{ 'st-status--ok': accountStatus.tone === 'ok', 'st-status--error': accountStatus.tone === 'error' }"
        role="status"
      >
        {{ accountStatus.text }}
      </span>
    </div>
  </SettingsGroup>

  <SettingsGroup
    title="連線"
    :footer="
      fish.useProxy
        ? '走 App 自己的代理 Worker 轉發到 Fish Audio，可以避開瀏覽器跨域限制，大陸網路也比較連得上。'
        : '一直顯示「測試中」或出現連不上、逾時，就打開「透過代理連線」。API 位址填到 https://api.fish.audio 就好，不用加 /v1/tts。'
    "
  >
    <SettingsSwitchRow v-model="fish.useProxy" label="透過代理連線" @change="onProxyChange" />
    <div v-if="!fish.useProxy" class="st-pad">
      <div class="st-field">
        <label for="fish-base" class="st-field__label">API 位址</label>
        <input
          id="fish-base"
          v-model="fish.baseUrl"
          type="url"
          class="st-input"
          :placeholder="FISH_AUDIO_DEFAULT_BASE_URL"
          autocomplete="off"
          @change="onBaseUrlChange"
        />
      </div>
    </div>
  </SettingsGroup>

  <SettingsGroup
    title="聲音"
    footer="reference_id 就是 Fish Audio 網站上音色頁網址最後那串英數字，可以直接貼上；留空由 Fish Audio 決定。"
  >
    <div class="st-pad">
      <div class="st-field">
        <label for="fish-voice" class="st-field__label">預設音色（reference_id）</label>
        <input
          id="fish-voice"
          v-model="fish.referenceId"
          type="text"
          class="st-input"
          placeholder="例如 7f92f8afb8ec43bf81429cc1c9199cb1"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="none"
          spellcheck="false"
          @change="save"
        />
        <p v-if="currentVoiceTitle" class="st-hint">目前：{{ currentVoiceTitle }}</p>
      </div>
    </div>
    <SettingsRow
      clickable
      tone="accent"
      label="從我的音色挑選"
      :value="myVoices.length ? `${myVoices.length} 個` : undefined"
      chevron="right"
      :disabled="!myVoices.length"
      @click="showVoicePicker = true"
    />
    <SettingsRow
      v-if="fish.referenceId"
      clickable
      label="試聽目前的音色"
      :disabled="!apiKeyDraft || preview?.loading"
      @click="previewVoice(fish.referenceId.trim())"
    />
  </SettingsGroup>

  <SettingsGroup title="搜尋公開音色" footer="用名字搜尋 Fish Audio 的公開音色庫，按「試聽」聽聽看，喜歡就按「使用」設成預設音色。">
    <div class="st-pad">
      <form class="fish-search" role="search" @submit.prevent="searchVoices">
        <input
          v-model="searchQuery"
          type="search"
          class="st-input"
          aria-label="搜尋公開音色"
          placeholder="例如 溫柔、少年、旁白"
          autocomplete="off"
        />
        <button
          type="submit"
          class="st-btn st-btn--soft st-btn--sm"
          :disabled="searching || !apiKeyDraft || !searchQuery.trim()"
          aria-label="搜尋"
        >
          <Search class="fish-search__icon" aria-hidden="true" />
        </button>
      </form>
      <span v-if="searching" class="st-status" role="status">搜尋中…</span>
      <span v-else-if="searchError" class="st-status st-status--error" role="status">{{ searchError }}</span>
      <span v-else-if="searched && !searchResults.length" class="st-status" role="status">找不到符合的音色</span>
    </div>
    <SettingsRow
      v-for="voice in searchResults"
      :key="voice.id"
      :label="voice.title"
      :description="[voice.author, voice.languages?.join('、')].filter(Boolean).join(' · ') || voice.id"
    >
      <template #control>
        <div class="fish-row-actions">
          <button
            type="button"
            class="st-btn st-btn--soft st-btn--sm"
            :disabled="preview?.loading"
            @click="previewVoice(voice.id)"
          >
            試聽
          </button>
          <span v-if="fish.referenceId === voice.id" class="st-chip st-chip--accent">使用中</span>
          <button v-else type="button" class="st-btn st-btn--soft st-btn--sm" @click="selectVoice(voice)">使用</button>
        </div>
      </template>
    </SettingsRow>
  </SettingsGroup>

  <SettingsGroup v-if="preview" :title="`試聽 ${knownTitles[preview.id] || preview.id}`">
    <div class="st-pad">
      <span v-if="preview.loading" class="st-status" role="status">合成中…</span>
      <span v-else-if="preview.error" class="st-status st-status--error" role="status">試聽失敗：{{ preview.error }}</span>
      <audio v-else-if="preview.url" :src="preview.url" class="fish-preview" controls autoplay />
    </div>
  </SettingsGroup>

  <SettingsGroup
    title="模型"
    :footer="
      markersSupported
        ? '情緒標記會把 AI 標的情緒、笑聲、停頓換成 Fish Audio 的 (happy)、(laughing)、(break) 等標記。如果聽到標記被念出來，就把它關掉。'
        : 'speech-1.x 模型不支援情緒標記，只會念純文字。'
    "
  >
    <SettingsSelectRow v-model="modelChoice" label="模型" :options="modelOptions" />
    <div v-if="customModel" class="st-pad">
      <div class="st-field">
        <label for="fish-model" class="st-field__label">模型名稱</label>
        <input
          id="fish-model"
          v-model="fish.model"
          type="text"
          class="st-input"
          placeholder="例如 s1"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="none"
          spellcheck="false"
          @change="onModelChange"
        />
        <p class="st-hint">填 Fish Audio 文件上的模型名稱，會放在請求的 model 標頭</p>
      </div>
    </div>
    <SettingsSwitchRow
      v-model="fish.emotionTags"
      label="情緒與語氣標記"
      :disabled="!markersSupported"
      @change="save"
    />
    <SettingsSelectRow
      v-model="fish.latency"
      label="延遲模式"
      :options="[
        { value: 'normal', label: '品質優先' },
        { value: 'balanced', label: '速度優先' },
      ]"
      @change="save"
    />
  </SettingsGroup>

  <SettingsGroup
    title="生成時機"
    footer="關掉時，聊天訊息只會在你點播放按鈕的那一句才生成語音，沒聽的句子不花錢；已生成的會存起來，重聽不再扣費。通話一律即時生成，不受影響。"
  >
    <SettingsSwitchRow
      :model-value="!!tts.autoGenerate"
      @update:model-value="tts.autoGenerate = $event"
      label="回覆後自動生成全部語音"
      description="開啟後每則回覆一到就把所有句子都生成好，點了馬上播，但會比較花錢"
      @change="save"
    />
  </SettingsGroup>

  <SettingsGroup title="輸出">
    <SettingsSelectRow
      v-model="fish.format"
      label="輸出格式"
      :options="[
        { value: 'mp3', label: 'MP3' },
        { value: 'wav', label: 'WAV' },
        { value: 'opus', label: 'Opus' },
      ]"
      @change="save"
    />
  </SettingsGroup>

  <SettingsSheet :open="showVoicePicker" title="選擇預設音色" done-label="完成" @close="showVoicePicker = false">
    <SettingsGroup>
      <SettingsRow
        v-for="voice in myVoices"
        :key="voice.id"
        clickable
        :label="voice.title"
        :description="voice.createdAt ? `建立於 ${voice.createdAt}` : voice.id"
        @click="selectVoice(voice)"
      >
        <template #control>
          <Check v-if="fish.referenceId === voice.id" class="fish-check" aria-label="目前使用" />
          <ChevronRight v-else class="st-row__chevron" aria-hidden="true" />
        </template>
      </SettingsRow>
    </SettingsGroup>
  </SettingsSheet>
</template>

<style scoped lang="scss">
.fish-search {
  display: flex;
  gap: 8px;

  .st-input {
    flex: 1;
    min-width: 0;
  }

  .st-btn {
    flex: none;
  }
}

.fish-search__icon {
  width: 18px;
  height: 18px;
}

.fish-row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fish-preview {
  display: block;
  width: 100%;
}

.fish-check {
  flex: none;
  width: 20px;
  height: 20px;
  color: var(--st-accent-ink);
}
</style>
