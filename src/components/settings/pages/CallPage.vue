<script setup lang="ts">
/** 通話：通話語音輸入（含測試收音）、來電鈴聲。改了就保存。 */
import { useCallVoiceTest } from "@/composables/useCallVoiceTest";
import { useSettingsStore } from "@/stores";
import { Play, Square } from "lucide-vue-next";
import { computed, onDeactivated, onUnmounted, ref } from "vue";
import { RINGTONE_OPTIONS } from "../settingsOptions";
import SettingsGroup from "../ui/SettingsGroup.vue";
import SettingsParam from "../ui/SettingsParam.vue";
import SettingsRow from "../ui/SettingsRow.vue";
import SettingsSelectRow from "../ui/SettingsSelectRow.vue";
import SettingsSwitchRow from "../ui/SettingsSwitchRow.vue";

const settingsStore = useSettingsStore();
const ringtone = settingsStore.incomingCallRingtone;

function save() {
  void settingsStore.saveSettings();
}

// ===== 測試收音 =====
const {
  statusText: voiceTestStatusText,
  level: voiceTestLevel,
  resultText: voiceTestResult,
  resultTone: voiceTestTone,
  running: voiceTestRunning,
  disabled: voiceTestDisabled,
  toggle: toggleVoiceTest,
} = useCallVoiceTest();

// ===== 來電鈴聲 =====
const ringtoneOptions = computed(() =>
  RINGTONE_OPTIONS.map((o) => ({
    value: o.id,
    label: `${o.name}（${o.description}）`,
    disabled: o.id === "custom" && !ringtone.customAudioDataUrl,
  })),
);
const ringtoneName = computed(
  () => RINGTONE_OPTIONS.find((o) => o.id === ringtone.selectedRingtoneId)?.name ?? "",
);

const ringtoneInput = ref<HTMLInputElement | null>(null);
const ringtoneTestPlaying = ref(false);
let ringtoneTestContext: AudioContext | null = null;
let ringtoneTestTimer: ReturnType<typeof setInterval> | null = null;
let ringtoneTestAudio: HTMLAudioElement | null = null;

function playRingtonePatternChunk(context: AudioContext, ringtoneId: string, volume: number): void {
  const now = context.currentTime;
  const gain = context.createGain();
  gain.connect(context.destination);

  const safeVolume = Math.min(1, Math.max(0, volume));
  const baseGain = 0.1 * safeVolume;

  const scheduleTone = (freq: number, start: number, duration: number) => {
    const osc = context.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, start);
    osc.connect(gain);
    osc.start(start);
    osc.stop(start + duration);
  };

  if (ringtoneId === "digital") {
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(baseGain, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.52);
    scheduleTone(988, now, 0.14);
    scheduleTone(1318, now + 0.16, 0.14);
    scheduleTone(988, now + 0.34, 0.14);
  } else if (ringtoneId === "soft") {
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(baseGain * 0.8, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    scheduleTone(523.25, now, 0.28);
    scheduleTone(659.25, now + 0.3, 0.28);
  } else {
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(baseGain, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now + 0.22);
    gain.gain.exponentialRampToValueAtTime(baseGain, now + 0.24);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    scheduleTone(880, now, 0.2);
    scheduleTone(660, now + 0.22, 0.2);
  }
}

function stopRingtoneTest(): void {
  if (ringtoneTestTimer) {
    clearInterval(ringtoneTestTimer);
    ringtoneTestTimer = null;
  }
  if (ringtoneTestAudio) {
    ringtoneTestAudio.pause();
    ringtoneTestAudio.currentTime = 0;
    ringtoneTestAudio = null;
  }
  if (ringtoneTestContext && ringtoneTestContext.state !== "closed") {
    void ringtoneTestContext.close();
  }
  ringtoneTestContext = null;
  ringtoneTestPlaying.value = false;
}

async function toggleRingtoneTest(): Promise<void> {
  if (ringtoneTestPlaying.value) {
    stopRingtoneTest();
    return;
  }
  const volume = ringtone.volume;
  const selected = ringtone.selectedRingtoneId;
  ringtoneTestPlaying.value = true;

  if (selected === "custom" && ringtone.customAudioDataUrl) {
    try {
      ringtoneTestAudio = new Audio(ringtone.customAudioDataUrl);
      ringtoneTestAudio.volume = volume;
      ringtoneTestAudio.loop = true;
      await ringtoneTestAudio.play();
      setTimeout(() => stopRingtoneTest(), 5000);
      return;
    } catch (e) {
      console.warn("[CallPage] 自訂鈴聲測試播放失敗，改用內建", e);
    }
  }

  try {
    ringtoneTestContext = new AudioContext();
    if (ringtoneTestContext.state === "suspended") await ringtoneTestContext.resume();
    playRingtonePatternChunk(ringtoneTestContext, selected, volume);
    ringtoneTestTimer = setInterval(() => {
      if (!ringtoneTestContext) return;
      playRingtonePatternChunk(ringtoneTestContext, selected, volume);
    }, 1800);
    setTimeout(() => stopRingtoneTest(), 5000);
  } catch (e) {
    console.warn("[CallPage] 內建鈴聲測試失敗", e);
    stopRingtoneTest();
  }
}

const MIN_CUSTOM_RINGTONE_DURATION_SECONDS = 1;

function getAudioDurationFromFile(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const audio = new Audio();
    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      audio.removeAttribute("src");
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      cleanup();
      resolve(duration);
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error("無法讀取音訊長度"));
    };
    audio.src = objectUrl;
  });
}

async function onRingtoneFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const duration = await getAudioDurationFromFile(file);
    if (duration < MIN_CUSTOM_RINGTONE_DURATION_SECONDS) {
      alert(`自訂鈴聲最短需要 ${MIN_CUSTOM_RINGTONE_DURATION_SECONDS} 秒，目前為 ${duration.toFixed(1)} 秒`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      ringtone.customAudioDataUrl = dataUrl;
      ringtone.customAudioName = file.name;
      ringtone.selectedRingtoneId = "custom";
      save();
    };
    reader.readAsDataURL(file);
  } catch (error) {
    console.warn("[CallPage] 無法解析自訂鈴聲時長", error);
    alert("無法讀取音訊時長，請更換檔案後再試");
  } finally {
    input.value = "";
  }
}

function clearCustomRingtone(): void {
  ringtone.customAudioDataUrl = "";
  ringtone.customAudioName = "";
  if (ringtone.selectedRingtoneId === "custom") ringtone.selectedRingtoneId = "classic";
  save();
}

onDeactivated(() => {
  stopRingtoneTest();
  if (voiceTestRunning.value) toggleVoiceTest();
});
onUnmounted(stopRingtoneTest);
</script>

<template>
  <div class="st-page">
    <SettingsGroup
      title="通話語音輸入"
      footer="電話和視訊時直接開口，講完停一下就送出；角色說話時會暫停收音。語音會上傳到阿里 ModelScope 的公開辨識服務（伺服器在中國大陸），聊天室的「轉文字」也用它；這是公開試用服務，偶爾可能連不上。"
    >
      <SettingsSelectRow
        v-model="settingsStore.callVoiceInput.endSilenceMs"
        label="停頓多久算講完"
        :options="[
          { value: 800, label: '0.8 秒' },
          { value: 1200, label: '1.2 秒（預設）' },
          { value: 1600, label: '1.6 秒' },
          { value: 2000, label: '2 秒' },
          { value: 3000, label: '3 秒' },
        ]"
        @change="save"
      />
      <SettingsSelectRow
        v-model="settingsStore.callVoiceInput.sensitivity"
        label="收音靈敏度"
        :options="[
          { value: 'low', label: '低（吵雜環境）' },
          { value: 'medium', label: '中（預設）' },
          { value: 'high', label: '高（小聲說話）' },
        ]"
        @change="save"
      />
      <SettingsSwitchRow
        v-model="settingsStore.callVoiceInput.autoTone"
        label="自動判斷語氣"
        description="依說話情緒自動填入語氣（可能不準），聊天室的錄音轉文字也適用；咳嗽、笑聲照樣會辨識"
        @change="save"
      />
      <div class="st-pad">
        <span class="st-row__label">測試收音</span>
        <div class="call-meter" role="img" :aria-label="`目前音量 ${Math.round(voiceTestLevel * 100)}%`">
          <div class="call-meter__bar" :style="{ width: `${Math.round(voiceTestLevel * 100)}%` }" />
        </div>
        <p class="st-hint" role="status">{{ voiceTestStatusText }}</p>
        <p v-if="voiceTestResult" class="call-result">
          <span v-if="voiceTestTone" class="call-result__tone">（{{ voiceTestTone }}）</span>{{ voiceTestResult }}
        </p>
        <button
          type="button"
          class="st-btn st-btn--soft st-btn--block"
          :disabled="voiceTestDisabled && !voiceTestRunning"
          @click="toggleVoiceTest"
        >
          {{ voiceTestRunning ? "停止測試" : "開始測試" }}
        </button>
      </div>
    </SettingsGroup>

    <SettingsGroup title="來電鈴聲">
      <SettingsSelectRow
        v-model="ringtone.selectedRingtoneId"
        label="鈴聲"
        :display="ringtoneName"
        :options="ringtoneOptions"
        @change="save"
      />
      <SettingsParam
        v-model="ringtone.volume"
        label="音量"
        :min="0"
        :max="1"
        :step="0.05"
        :format="(v) => `${Math.round(v * 100)}%`"
        @change="save"
      />
      <SettingsRow
        clickable
        label="上傳自訂鈴聲"
        description="MP3、WAV、FLAC，最短 1 秒"
        :value="ringtone.customAudioName ? undefined : '未上傳'"
        chevron="right"
        @click="ringtoneInput?.click()"
      />
      <SettingsRow v-if="ringtone.customAudioName" :label="ringtone.customAudioName" indent>
        <template #control>
          <button type="button" class="st-btn st-btn--sm" @click="clearCustomRingtone">移除</button>
        </template>
      </SettingsRow>
      <SettingsRow clickable tone="accent" :label="ringtoneTestPlaying ? '停止試聽' : '試聽'" @click="toggleRingtoneTest">
        <template #icon>
          <Square v-if="ringtoneTestPlaying" class="call-play" aria-hidden="true" />
          <Play v-else class="call-play" aria-hidden="true" />
        </template>
      </SettingsRow>
    </SettingsGroup>
    <p v-if="ringtone.selectedRingtoneId === 'custom' && !ringtone.customAudioDataUrl" class="st-group__footer">
      還沒上傳自訂音檔，會先用「經典來電」。
    </p>
    <input
      ref="ringtoneInput"
      type="file"
      accept="audio/mp3,audio/wav,audio/flac,audio/mpeg,.mp3,.wav,.flac"
      hidden
      @change="onRingtoneFileChange"
    />
  </div>
</template>

<style scoped lang="scss">
.call-meter {
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--st-text) 10%, var(--st-card));
}

.call-meter__bar {
  height: 100%;
  border-radius: 999px;
  background: var(--st-accent-strong);
  transition: width 0.08s linear;
}

.call-result {
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--st-field);
  font-size: 14px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.call-result__tone {
  color: var(--st-sub);
}

.call-play {
  flex: none;
  width: 20px;
  height: 20px;
  color: var(--st-accent-ink);
}
</style>
