<script setup lang="ts">
/** 語音訊息：錄音品質、時長、轉文字、傳給模型的格式。改了就保存。 */
import { useSettingsStore } from "@/stores";
import SettingsGroup from "../ui/SettingsGroup.vue";
import SettingsSelectRow from "../ui/SettingsSelectRow.vue";
import SettingsSwitchRow from "../ui/SettingsSwitchRow.vue";

const settingsStore = useSettingsStore();

function save() {
  void settingsStore.saveSettings();
}
</script>

<template>
  <div class="st-page">
    <SettingsGroup title="錄音">
      <SettingsSelectRow
        v-model="settingsStore.audio.quality"
        label="錄音品質"
        :options="[
          { value: 'low', label: '低（32kbps）' },
          { value: 'medium', label: '中（64kbps）' },
          { value: 'high', label: '高（128kbps）' },
        ]"
        @change="save"
      />
      <SettingsSelectRow
        v-model="settingsStore.audio.maxDuration"
        label="最大錄音時長"
        :options="[
          { value: 30, label: '30 秒' },
          { value: 60, label: '60 秒' },
          { value: 120, label: '2 分鐘' },
          { value: 300, label: '5 分鐘' },
        ]"
        @change="save"
      />
      <SettingsSwitchRow
        v-model="settingsStore.audio.sttEnabled"
        label="語音轉文字"
        description="錄完自動轉成文字，咳嗽、笑聲等聲音也會標出來"
        @change="save"
      />
    </SettingsGroup>

    <SettingsGroup
      title="傳給模型"
      footer="image_url 相容模式適用 Gemini、OpenRouter 等（推薦）；input_audio 原生模式只給 OpenAI GPT-4o-audio。"
    >
      <SettingsSelectRow
        v-model="settingsStore.audio.transmissionFormat"
        label="音頻傳輸格式"
        :options="[
          { value: 'image_url', label: 'image_url 相容' },
          { value: 'input_audio', label: 'input_audio 原生' },
        ]"
        @change="save"
      />
    </SettingsGroup>
  </div>
</template>
