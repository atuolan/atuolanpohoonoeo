<script lang="ts">
import type { MiniMaxVoice as CachedVoice } from "@/api/MiniMaxTTSApi";

// 同一個帳號的音色清單在這次開啟 App 期間共用，重開彈窗不用再等
const voiceCache = new Map<string, CachedVoice[]>();
</script>

<script setup lang="ts">
/**
 * 群聊語音設定裡的「成員音色」：每個成員各選一個 MiniMax 音色，沒選的跟著群組。
 * 有 API Key 時自動取音色清單給下拉選單用；取不到就改成手動輸入 voice_id。
 */
import {
  fetchVoiceList,
  MINIMAX_VOICE_NAMES,
  type MiniMaxTTSSettings,
  type MiniMaxVoice,
} from "@/api/MiniMaxTTSApi";
import { computed, onMounted, ref } from "vue";

const props = defineProps<{
  members: Array<{ id: string; name: string; avatar?: string }>;
  modelValue?: Record<string, string>;
  /** 沒設成員音色的人實際會用的聲音，例如「全域的音色混合」 */
  fallbackLabel: string;
  ttsSettings: MiniMaxTTSSettings;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: Record<string, string> | undefined];
}>();

const voices = ref<MiniMaxVoice[]>([]);
const loading = ref(false);
const error = ref("");

const cacheKey = computed(() => `${props.ttsSettings.platform}:${props.ttsSettings.apiKey}`);
const clonedVoices = computed(() => voices.value.filter((v) => v.voice_type !== "system"));
const systemVoices = computed(() => voices.value.filter((v) => v.voice_type === "system"));

function voiceLabel(voice: MiniMaxVoice): string {
  const cn = MINIMAX_VOICE_NAMES[voice.voice_id];
  if (cn) return `${cn}（${voice.voice_id}）`;
  return voice.name && voice.name !== voice.voice_id ? `${voice.name}（${voice.voice_id}）` : voice.voice_id;
}

function isListed(voiceId: string): boolean {
  return voices.value.some((v) => v.voice_id === voiceId);
}

async function loadVoices(force = false) {
  if (!props.ttsSettings.apiKey) return;
  const cached = voiceCache.get(cacheKey.value);
  if (cached && !force) {
    voices.value = cached;
    return;
  }
  loading.value = true;
  error.value = "";
  const result = await fetchVoiceList(props.ttsSettings);
  loading.value = false;
  if (result.success) {
    voiceCache.set(cacheKey.value, result.voices);
    voices.value = result.voices;
  } else {
    error.value = `取不到音色清單：${result.error || "未知錯誤"}，可以直接輸入 voice_id`;
  }
}

function setVoice(memberId: string, raw: string) {
  const next = { ...props.modelValue };
  const voiceId = raw.trim();
  if (voiceId) next[memberId] = voiceId;
  else delete next[memberId];
  emit("update:modelValue", Object.keys(next).length ? next : undefined);
}

onMounted(() => void loadVoices());
</script>

<template>
  <section class="member-voices" aria-labelledby="member-voices-title">
    <div class="member-voices__head">
      <span id="member-voices-title" class="member-voices__title">成員音色</span>
      <button
        v-if="ttsSettings.apiKey"
        type="button"
        class="member-voices__reload"
        :disabled="loading"
        @click="loadVoices(true)"
      >
        {{ loading ? "讀取中…" : "重新取得清單" }}
      </button>
    </div>
    <p class="member-voices__hint">每個成員可以有自己的聲音；沒選的人用{{ fallbackLabel }}。</p>

    <div v-for="member in members" :key="member.id" class="member-voices__row">
      <img v-if="member.avatar" :src="member.avatar" alt="" class="member-voices__avatar" />
      <span v-else class="member-voices__avatar member-voices__avatar--initial" aria-hidden="true">
        {{ member.name.slice(0, 1) }}
      </span>
      <label :for="`member-voice-${member.id}`" class="member-voices__name">{{ member.name }}</label>
      <select
        v-if="voices.length"
        :id="`member-voice-${member.id}`"
        class="member-voices__field"
        :value="modelValue?.[member.id] ?? ''"
        @change="setVoice(member.id, ($event.target as HTMLSelectElement).value)"
      >
        <option value="">跟著群組</option>
        <option
          v-if="modelValue?.[member.id] && !isListed(modelValue[member.id])"
          :value="modelValue[member.id]"
        >
          {{ modelValue[member.id] }}
        </option>
        <optgroup v-if="clonedVoices.length" label="我的音色">
          <option v-for="voice in clonedVoices" :key="voice.voice_id" :value="voice.voice_id">
            {{ voiceLabel(voice) }}
          </option>
        </optgroup>
        <optgroup v-if="systemVoices.length" label="系統音色">
          <option v-for="voice in systemVoices" :key="voice.voice_id" :value="voice.voice_id">
            {{ voiceLabel(voice) }}
          </option>
        </optgroup>
      </select>
      <input
        v-else
        :id="`member-voice-${member.id}`"
        type="text"
        class="member-voices__field"
        :value="modelValue?.[member.id] ?? ''"
        placeholder="voice_id，留空跟著群組"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        @change="setVoice(member.id, ($event.target as HTMLInputElement).value)"
      />
    </div>

    <p v-if="error" class="member-voices__error" role="status">{{ error }}</p>
  </section>
</template>

<style scoped lang="scss">
.member-voices {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.member-voices__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.member-voices__title {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text, #333);
}

.member-voices__reload {
  min-height: 32px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: none;
  font: inherit;
  font-size: 12px;
  color: var(--color-primary, #7dd3a8);
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
}

.member-voices__hint,
.member-voices__error {
  margin: -4px 0 0;
  font-size: 12px;
  color: var(--color-text-secondary, #999);
}

.member-voices__error {
  margin: 0;
  color: var(--color-error, #c2413b);
}

.member-voices__row {
  display: grid;
  grid-template-columns: 28px minmax(0, 5.5em) minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.member-voices__avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;

  &--initial {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-background, #f5f5f5);
    font-size: 13px;
    color: var(--color-text-secondary, #999);
  }
}

.member-voices__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  color: var(--color-text, #333);
}

.member-voices__field {
  width: 100%;
  min-width: 0;
  min-height: 40px;
  padding: 8px 10px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  background: var(--color-background, #f8f9fa);
  font: inherit;
  font-size: 14px;
  color: var(--color-text, #333);
  outline: none;
  box-sizing: border-box;

  &:focus {
    border-color: var(--color-primary, #7dd3a8);
  }
}
</style>
