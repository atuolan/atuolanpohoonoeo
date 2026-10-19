<script setup lang="ts">
/**
 * 語音合成（MiniMax）：帳號、基本設定 / 音色混合 / 音色複刻。
 * API Key 先存在草稿，離開欄位或離開這頁才寫回，避免打字到一半被別處的保存覆蓋。
 */
import {
  cloneVoice,
  getVoiceDisplayName,
  MAX_TIMBRE_WEIGHTS,
  MINIMAX_LANGUAGES,
  synthesizeSpeech,
  validateCloneVoiceId,
  VOICE_CLONE_LIMITS,
  type MiniMaxVoice,
} from "@/api/MiniMaxTTSApi";
import { useSettingsStore } from "@/stores";
import { convertTTSContentToSimplified } from "@/utils/ttsTextSelector";
import { Check, ChevronRight, Music, Plus, Upload, X } from "lucide-vue-next";
import { computed, onDeactivated, onMounted, onUnmounted, ref, watch } from "vue";
import { MINIMAX_MODEL_OPTIONS } from "../settingsOptions";
import SettingsGroup from "../ui/SettingsGroup.vue";
import SettingsRow from "../ui/SettingsRow.vue";
import SettingsSegmented from "../ui/SettingsSegmented.vue";
import SettingsSelectRow from "../ui/SettingsSelectRow.vue";
import SettingsSheet from "../ui/SettingsSheet.vue";
import SettingsSwitchRow from "../ui/SettingsSwitchRow.vue";

const settingsStore = useSettingsStore();
const tts = settingsStore.minimaxTTS;

function save() {
  void settingsStore.saveSettings();
}

const tab = ref<"basic" | "timberMix" | "voiceClone">("basic");

// ===== API Key 草稿 =====
const apiKeyDraft = ref("");
const apiKeyFocused = ref(false);
const apiKeyTouched = ref(false);

function syncApiKeyDraft() {
  apiKeyDraft.value = tts.apiKey || "";
  apiKeyTouched.value = false;
}

function markApiKeyTouched() {
  if (apiKeyFocused.value) apiKeyTouched.value = true;
}

function commitApiKeyDraft(): boolean {
  if (!apiKeyTouched.value) return false;
  if (tts.apiKey !== apiKeyDraft.value) tts.apiKey = apiKeyDraft.value;
  apiKeyTouched.value = false;
  return true;
}

function saveApiKeyDraft() {
  if (commitApiKeyDraft()) save();
}

watch(
  () => tts.apiKey,
  () => {
    if (!apiKeyFocused.value && !apiKeyTouched.value) syncApiKeyDraft();
  },
);

function requestSettings() {
  return { ...tts, apiKey: apiKeyDraft.value };
}

// ===== 測試與音色清單 =====
const testing = ref(false);
const testResult = ref<boolean | null>(null);
const fetchingVoices = ref(false);
const voiceList = ref<MiniMaxVoice[]>([]);
const voiceError = ref("");

async function testConnection() {
  testing.value = true;
  testResult.value = null;
  try {
    const { testConnection } = await import("@/api/MiniMaxTTSApi");
    testResult.value = await testConnection(requestSettings());
  } catch {
    testResult.value = false;
  } finally {
    testing.value = false;
  }
}

async function fetchVoices() {
  fetchingVoices.value = true;
  voiceError.value = "";
  try {
    const { fetchVoiceList } = await import("@/api/MiniMaxTTSApi");
    const result = await fetchVoiceList(requestSettings());
    if (result.success) {
      voiceList.value = result.voices;
    } else {
      voiceError.value = result.error || "取得失敗";
      voiceList.value = [];
    }
  } catch (e) {
    voiceError.value = e instanceof Error ? e.message : "未知錯誤";
  } finally {
    fetchingVoices.value = false;
  }
}

const accountStatus = computed(() => {
  if (testing.value) return { tone: "", text: "測試中…" };
  if (fetchingVoices.value) return { tone: "", text: "取得音色中…" };
  if (voiceError.value) return { tone: "error", text: voiceError.value };
  if (testResult.value === false) return { tone: "error", text: "連線失敗，請檢查 API Key 和平台" };
  if (testResult.value === true && voiceList.value.length)
    return { tone: "ok", text: `連線成功 · 已取得 ${voiceList.value.length} 個音色` };
  if (testResult.value === true) return { tone: "ok", text: "連線成功" };
  if (voiceList.value.length) return { tone: "ok", text: `已取得 ${voiceList.value.length} 個音色` };
  return null;
});

// ===== 預設音色 =====
const showVoicePicker = ref(false);

function selectVoice(voiceId: string) {
  tts.voiceId = voiceId;
  save();
  showVoicePicker.value = false;
}

// ===== 音色混合 =====
const mixFull = computed(() => tts.timberWeights.length >= MAX_TIMBRE_WEIGHTS);

function addTimberWeight() {
  if (mixFull.value) return;
  tts.timberWeights.push({ voiceId: "", weight: 50 });
  save();
}

function removeTimberWeight(index: number) {
  tts.timberWeights.splice(index, 1);
  save();
}

function isInMix(voiceId: string) {
  return tts.timberWeights.some((tw) => tw.voiceId === voiceId);
}

function addVoiceToMix(voiceId: string) {
  if (isInMix(voiceId) || mixFull.value) return;
  tts.timberWeights.push({ voiceId, weight: 50 });
  save();
}

// ===== 音色複刻 =====
const cloneInput = ref<HTMLInputElement | null>(null);
const cloneFile = ref<File | null>(null);
const cloneFileSeconds = ref<number | null>(null);
const cloneFileError = ref("");
const cloneName = ref("");
const cloning = ref(false);
const cloneResult = ref<{ success: boolean; voiceId?: string; error?: string } | null>(null);
const clonedVoices = computed(() => voiceList.value.filter((v) => v.voice_type === "cloning"));
const cloneNameError = computed(() => (cloneName.value.trim() ? validateCloneVoiceId(cloneName.value) : null));

/** 讀音頻長度；瀏覽器讀不出來時回傳 null，交給 MiniMax 判斷 */
function readAudioSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const finish = (seconds: number | null) => {
      URL.revokeObjectURL(url);
      resolve(seconds);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => finish(null);
    audio.src = url;
  });
}

async function onCloneFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  // 清掉 value，重選同一個檔案時也會觸發 change
  input.value = "";
  cloneFile.value = file;
  cloneFileSeconds.value = null;
  cloneFileError.value = "";
  if (!file) return;

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!(VOICE_CLONE_LIMITS.extensions as readonly string[]).includes(ext)) {
    cloneFileError.value = "只支援 MP3、M4A、WAV";
    return;
  }
  if (file.size > VOICE_CLONE_LIMITS.maxBytes) {
    cloneFileError.value = "檔案超過 20 MB";
    return;
  }
  const seconds = await readAudioSeconds(file);
  if (cloneFile.value !== file) return;
  cloneFileSeconds.value = seconds;
  if (seconds !== null && seconds < VOICE_CLONE_LIMITS.minSeconds) {
    cloneFileError.value = `音頻只有 ${seconds.toFixed(1)} 秒，至少要 ${VOICE_CLONE_LIMITS.minSeconds} 秒`;
  } else if (seconds !== null && seconds > VOICE_CLONE_LIMITS.maxSeconds) {
    cloneFileError.value = "音頻超過 5 分鐘";
  }
}

const cloneFileHint = computed(() => {
  if (!cloneFile.value) return "MP3／M4A／WAV，10 秒～5 分鐘，20 MB 以內";
  const parts = [`${(cloneFile.value.size / 1024).toFixed(1)} KB`];
  if (cloneFileSeconds.value !== null) parts.push(`${cloneFileSeconds.value.toFixed(1)} 秒`);
  return parts.join(" · ");
});

const canClone = computed(
  () =>
    !cloning.value &&
    !!cloneFile.value &&
    !cloneFileError.value &&
    !!cloneName.value.trim() &&
    !cloneNameError.value &&
    !!apiKeyDraft.value,
);

async function startClone() {
  if (!canClone.value || !cloneFile.value) return;
  if (commitApiKeyDraft()) save();
  cloning.value = true;
  cloneResult.value = null;
  try {
    const result = await cloneVoice(requestSettings(), cloneFile.value, cloneName.value.trim());
    cloneResult.value = result;
    if (result.success && result.voiceId) {
      // 複刻成功，自動填入預設音色並更新音色清單
      tts.voiceId = result.voiceId;
      save();
      void fetchVoices();
    }
  } catch (e) {
    cloneResult.value = { success: false, error: e instanceof Error ? e.message : "未知錯誤" };
  } finally {
    cloning.value = false;
  }
}

function useClonedVoice(voiceId: string) {
  tts.voiceId = voiceId;
  save();
  tab.value = "basic";
}

// ===== 試聽（一般語音合成，同時讓複刻音色被保留下來） =====
const preview = ref<{ voiceId: string; loading: boolean; url?: string; error?: string } | null>(null);

async function previewVoice(voiceId: string) {
  if (preview.value?.loading) return;
  preview.value = { voiceId, loading: true };
  const settings = { ...requestSettings(), voiceId, timberWeightsEnabled: false };
  const text = convertTTSContentToSimplified("你好，這是複刻出來的聲音，聽起來像嗎？", settings.languageBoost);
  const result = await synthesizeSpeech(text, settings);
  if (preview.value?.voiceId !== voiceId) return;
  preview.value = result.success && result.audioUrl
    ? { voiceId, loading: false, url: result.audioUrl }
    : { voiceId, loading: false, error: result.error || "試聽失敗" };
}

onMounted(syncApiKeyDraft);
onDeactivated(() => {
  showVoicePicker.value = false;
  saveApiKeyDraft();
});
onUnmounted(saveApiKeyDraft);
</script>

<template>
  <div class="st-page">
    <SettingsGroup title="MiniMax 帳號" footer="每個聊天要不要用語音念出來，在聊天的設定選單裡開關（AI 繪圖下方）。">
      <div class="st-pad">
        <div class="st-field">
          <label for="tts-key" class="st-field__label">API Key</label>
          <input
            id="tts-key"
            v-model="apiKeyDraft"
            type="password"
            class="st-input"
            name="minimax-api-key"
            placeholder="你的 MiniMax API Key"
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
          <button type="button" class="st-btn st-btn--soft st-btn--sm" :disabled="fetchingVoices || !apiKeyDraft" @click="fetchVoices">
            取得音色清單
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

    <SettingsSegmented
      v-model="tab"
      class="st-seg--page"
      label="語音合成設定分頁"
      :options="[
        { value: 'basic', label: '基本設定' },
        { value: 'timberMix', label: '音色混合' },
        { value: 'voiceClone', label: '音色複刻' },
      ]"
    />

    <!-- 基本設定 -->
    <template v-if="tab === 'basic'">
      <SettingsGroup
        title="聲音"
        :footer="voiceList.length ? '點「從音色清單挑選」可以直接選；也能在上面欄位手動輸入 voice_id。' : '先按「取得音色清單」，就能從清單挑選音色。'"
      >
        <div class="st-pad">
          <div class="st-field">
            <label for="tts-voice" class="st-field__label">預設音色（voice_id）</label>
            <input
              id="tts-voice"
              v-model="tts.voiceId"
              type="text"
              class="st-input"
              placeholder="Chinese (Mandarin)_Warm_Bestie"
              @change="save"
            />
          </div>
        </div>
        <SettingsRow
          clickable
          tone="accent"
          label="從音色清單挑選"
          :value="voiceList.length ? `${voiceList.length} 個` : undefined"
          chevron="right"
          :disabled="!voiceList.length"
          @click="showVoicePicker = true"
        />
        <SettingsSelectRow v-model="tts.model" label="模型" :options="MINIMAX_MODEL_OPTIONS" @change="save" />
        <SettingsSelectRow v-model="tts.languageBoost" label="語言增強" :options="MINIMAX_LANGUAGES" @change="save" />
      </SettingsGroup>

      <SettingsGroup title="輸出">
        <SettingsSelectRow
          v-model="tts.format"
          label="輸出格式"
          :options="[
            { value: 'mp3', label: 'MP3' },
            { value: 'wav', label: 'WAV' },
            { value: 'flac', label: 'FLAC' },
          ]"
          @change="save"
        />
        <SettingsSelectRow
          v-model="tts.sampleRate"
          label="採樣率"
          :options="[
            { value: 32000, label: '32000 Hz' },
            { value: 44100, label: '44100 Hz' },
            { value: 24000, label: '24000 Hz' },
            { value: 16000, label: '16000 Hz' },
          ]"
          @change="save"
        />
      </SettingsGroup>

      <SettingsGroup title="連線">
        <SettingsSelectRow
          v-model="tts.platform"
          label="平台"
          :options="[
            { value: 'io', label: '國際站（api.minimax.io）' },
            { value: 'cn', label: '中文站（api.minimaxi.com）' },
          ]"
          @change="save"
        />
        <div class="st-pad">
          <div class="st-field">
            <label for="tts-proxy" class="st-field__label">Worker 代理地址（選填）</label>
            <input
              id="tts-proxy"
              v-model="tts.proxyUrl"
              type="url"
              class="st-input"
              placeholder="https://your-worker.workers.dev"
              @change="save"
            />
          </div>
        </div>
      </SettingsGroup>
    </template>

    <!-- 音色混合 -->
    <template v-else-if="tab === 'timberMix'">
      <SettingsGroup footer="聊天的語音設定裡自己填了音色的話，那個聊天會用它自己的音色，不套用混合。">
        <SettingsSwitchRow
          v-model="tts.timberWeightsEnabled"
          label="啟用音色混合"
          description="開啟後會取代「基本設定」裡的預設音色"
          @change="save"
        />
      </SettingsGroup>

      <template v-if="tts.timberWeightsEnabled">
        <SettingsGroup
          title="混合比重"
          :footer="`最多混合 ${MAX_TIMBRE_WEIGHTS} 種。比重是相對值（1–100），例如 70 御姐＋30 少女，就是比較溫柔成熟的聲線。`"
        >
          <div v-for="(tw, idx) in tts.timberWeights" :key="idx" class="tts-mix">
            <div class="tts-mix__head">
              <input
                v-model="tw.voiceId"
                type="text"
                class="st-input"
                :aria-label="`第 ${idx + 1} 個音色的 voice_id`"
                placeholder="voice_id"
                @change="save"
              />
              <button type="button" class="st-icon-btn" :aria-label="`移除第 ${idx + 1} 個音色`" @click="removeTimberWeight(idx)">
                <X />
              </button>
            </div>
            <div class="tts-mix__weight">
              <input
                v-model.number="tw.weight"
                class="st-range"
                type="range"
                min="1"
                max="100"
                step="1"
                :aria-label="`第 ${idx + 1} 個音色的比重`"
                :style="{ '--st-fill': `${((tw.weight - 1) / 99) * 100}%` }"
                @change="save"
              />
              <span class="st-badge">{{ tw.weight }}</span>
            </div>
          </div>
          <div v-if="tts.timberWeights.length === 0" class="st-row">
            <span class="st-row__desc">還沒加入任何音色。按下面「新增音色」，或從音色清單加入。</span>
          </div>
          <div v-else-if="tts.timberWeights.length > MAX_TIMBRE_WEIGHTS" class="st-row">
            <span class="st-row__desc tts-warn">MiniMax 最多只能混 {{ MAX_TIMBRE_WEIGHTS }} 種，只會用前 {{ MAX_TIMBRE_WEIGHTS }} 個。</span>
          </div>
          <SettingsRow
            clickable
            tone="accent"
            :label="mixFull ? `已達 ${MAX_TIMBRE_WEIGHTS} 種上限` : '新增音色'"
            :disabled="mixFull"
            @click="addTimberWeight"
          >
            <template #icon><Plus class="tts-plus" aria-hidden="true" /></template>
          </SettingsRow>
        </SettingsGroup>

        <section v-if="voiceList.length" class="st-group">
          <h2 class="st-group__title">從音色清單加入</h2>
          <div class="tts-chips">
            <button
              v-for="voice in voiceList"
              :key="voice.voice_id"
              type="button"
              class="tts-chip"
              :class="{ 'tts-chip--on': isInMix(voice.voice_id) }"
              :disabled="isInMix(voice.voice_id) || mixFull"
              @click="addVoiceToMix(voice.voice_id)"
            >
              <Check v-if="isInMix(voice.voice_id)" aria-hidden="true" />
              <Plus v-else aria-hidden="true" />
              {{ getVoiceDisplayName(voice.voice_id) }}
            </button>
          </div>
        </section>
      </template>
    </template>

    <!-- 音色複刻 -->
    <template v-else>
      <SettingsGroup
        title="上傳音頻"
        footer="MiniMax 規定：複刻好的音色要在 7 天內拿來合成過一次語音才會永久保留，不然會被刪掉；複刻費用在第一次合成時才扣。"
      >
        <div class="st-fields">
          <div class="st-field">
            <label for="tts-clone-name" class="st-field__label">音色名稱</label>
            <input
              id="tts-clone-name"
              v-model="cloneName"
              type="text"
              class="st-input"
              placeholder="如 MyCharacter01"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="none"
              spellcheck="false"
              :aria-invalid="!!cloneNameError"
            />
            <p v-if="cloneNameError" class="st-hint tts-warn">{{ cloneNameError }}</p>
            <p v-else class="st-hint">
              這會成為你的 voice_id。至少 8 個字、英文字母開頭，只能用英文、數字、- 和 _，結尾不能是 - 或 _
            </p>
          </div>
          <div class="st-field">
            <span class="st-field__label">音頻檔案</span>
            <button type="button" class="tts-upload" @click="cloneInput?.click()">
              <Music v-if="cloneFile" aria-hidden="true" />
              <Upload v-else aria-hidden="true" />
              <span class="tts-upload__text">
                <span>{{ cloneFile ? cloneFile.name : "選擇音頻檔案" }}</span>
                <span class="st-hint">{{ cloneFileHint }}</span>
              </span>
            </button>
            <p v-if="cloneFileError" class="st-hint tts-warn">{{ cloneFileError }}</p>
            <input
              ref="cloneInput"
              type="file"
              accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/m4a,.mp3,.wav,.m4a"
              hidden
              @change="onCloneFileChange"
            />
          </div>
          <button
            type="button"
            class="st-btn st-btn--primary st-btn--block"
            :disabled="!canClone"
            @click="startClone"
          >
            {{ cloning ? "上傳並複刻中，請稍候…" : "開始複刻" }}
          </button>
          <template v-if="cloneResult?.success && cloneResult.voiceId">
            <span class="st-status st-status--ok" role="status">
              複刻成功：{{ cloneResult.voiceId }}，已設為預設音色{{
                tts.timberWeightsEnabled ? "（音色混合開著，要先關掉混合才會用到它）" : ""
              }}
            </span>
            <button
              type="button"
              class="st-btn st-btn--soft st-btn--block"
              :disabled="preview?.loading"
              @click="previewVoice(cloneResult.voiceId)"
            >
              試聽（同時把這個音色保留下來）
            </button>
          </template>
          <span v-else-if="cloneResult" class="st-status st-status--error" role="status">
            複刻失敗：{{ cloneResult.error }}
          </span>
        </div>
      </SettingsGroup>

      <SettingsGroup v-if="preview" :title="`試聽 ${preview.voiceId}`">
        <div class="st-pad">
          <span v-if="preview.loading" class="st-status" role="status">合成中…</span>
          <span v-else-if="preview.error" class="st-status st-status--error" role="status">
            試聽失敗：{{ preview.error }}
          </span>
          <audio v-else-if="preview.url" :src="preview.url" class="tts-preview" controls autoplay />
        </div>
      </SettingsGroup>

      <SettingsGroup
        v-if="clonedVoices.length"
        title="已複刻的音色"
        footer="按「試聽」會合成一句話，也算用過一次，可以讓剛複刻的音色不被刪掉。"
      >
        <SettingsRow
          v-for="voice in clonedVoices"
          :key="voice.voice_id"
          :label="voice.voice_id"
          :description="voice.created_time ? `建立於 ${voice.created_time}` : undefined"
        >
          <template #control>
            <div class="tts-row-actions">
              <button
                type="button"
                class="st-btn st-btn--soft st-btn--sm"
                :disabled="preview?.loading"
                @click="previewVoice(voice.voice_id)"
              >
                試聽
              </button>
              <span v-if="tts.voiceId === voice.voice_id" class="st-chip st-chip--accent">使用中</span>
              <button v-else type="button" class="st-btn st-btn--soft st-btn--sm" @click="useClonedVoice(voice.voice_id)">
                使用
              </button>
            </div>
          </template>
        </SettingsRow>
      </SettingsGroup>
      <p v-else-if="voiceList.length" class="st-group__footer" style="margin-top: 12px">
        還沒有複刻的音色。
      </p>
    </template>

    <SettingsSheet :open="showVoicePicker" title="選擇預設音色" done-label="完成" @close="showVoicePicker = false">
      <SettingsGroup>
        <SettingsRow
          v-for="voice in voiceList"
          :key="voice.voice_id"
          clickable
          :label="getVoiceDisplayName(voice.voice_id)"
          :description="
            voice.voice_type === 'cloning' ? '複刻音色' : voice.voice_type === 'generation' ? '自訂音色' : undefined
          "
          @click="selectVoice(voice.voice_id)"
        >
          <template #control>
            <Check v-if="tts.voiceId === voice.voice_id" class="tts-check" aria-label="目前使用" />
            <ChevronRight v-else class="st-row__chevron" aria-hidden="true" />
          </template>
        </SettingsRow>
      </SettingsGroup>
    </SettingsSheet>
  </div>
</template>

<style scoped lang="scss">
.tts-warn {
  color: var(--st-warn);
}

.tts-preview {
  display: block;
  width: 100%;
}

.tts-row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tts-plus {
  flex: none;
  width: 22px;
  height: 22px;
  color: var(--st-accent-ink);
}

.tts-check {
  flex: none;
  width: 20px;
  height: 20px;
  color: var(--st-accent-ink);
}

.tts-mix {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 8px 14px 16px;
}

.tts-mix__head {
  display: flex;
  align-items: center;
  gap: 4px;

  .st-input {
    height: 42px;
    font-size: 15px;
  }
}

.tts-mix__weight {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-right: 8px;
}

.tts-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 16px;
}

.tts-chip {
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--st-line);
  border-radius: 999px;
  background: var(--st-card);
  font: inherit;
  font-size: 13px;
  color: var(--st-text);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;

  svg {
    width: 14px;
    height: 14px;
  }

  &--on {
    border-color: transparent;
    background: var(--st-accent-soft);
    color: var(--st-accent-ink);
    cursor: default;
  }

  // 混合已滿時，還沒加入的音色淡掉
  &:disabled:not(.tts-chip--on) {
    opacity: 0.45;
    cursor: default;
  }
}

.tts-upload {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 64px;
  padding: 10px 14px;
  border: 1.5px dashed var(--st-line);
  border-radius: 14px;
  background: var(--st-field);
  font: inherit;
  color: var(--st-text);
  text-align: left;
  cursor: pointer;

  > svg {
    flex: none;
    width: 22px;
    height: 22px;
    color: var(--st-accent-ink);
  }
}

.tts-upload__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: 15px;
  overflow-wrap: anywhere;
}
</style>
