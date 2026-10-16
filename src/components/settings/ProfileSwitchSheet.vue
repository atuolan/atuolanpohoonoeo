<script setup lang="ts">
/** 首頁「切換」：從下方升起的配置清單，點一下就切換 */
import { useSettingsStore } from "@/stores";
import { Check, ChevronRight } from "lucide-vue-next";
import { useApiProfiles } from "./composables/useApiProfiles";
import { getEndpointHost, getProviderLabel } from "./settingsHelpers";
import ProfileSwitchConfirm from "./ui/ProfileSwitchConfirm.vue";
import SettingsGroup from "./ui/SettingsGroup.vue";
import SettingsSheet from "./ui/SettingsSheet.vue";

defineProps<{ open: boolean }>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "manage"): void;
}>();

const settingsStore = useSettingsStore();
const {
  isSaving,
  showSwitchConfirm,
  requestSwitchProfile,
  switchConfirmSaveAndGo,
  switchConfirmDiscardAndGo,
  switchConfirmCancel,
} = useApiProfiles();

function pick(profileId: string) {
  if (requestSwitchProfile(profileId)) emit("close");
}

async function saveAndGo() {
  await switchConfirmSaveAndGo();
  emit("close");
}

async function discardAndGo() {
  await switchConfirmDiscardAndGo();
  emit("close");
}
</script>

<template>
  <SettingsSheet :open="open && !showSwitchConfirm" title="切換配置" done-label="完成" @close="emit('close')">
    <SettingsGroup footer="點一下就切換。目前配置有未保存的改動時，會先問你要不要更新。">
      <button
        v-for="profile in settingsStore.profiles"
        :key="profile.id"
        type="button"
        class="switch-row"
        style="--st-inset: 48px"
        :aria-pressed="settingsStore.currentProfileId === profile.id ? 'true' : 'false'"
        @click="pick(profile.id)"
      >
        <span
          class="st-radio"
          :class="{ 'st-radio--on': settingsStore.currentProfileId === profile.id }"
          aria-hidden="true"
        >
          <Check v-if="settingsStore.currentProfileId === profile.id" :stroke-width="3" />
        </span>
        <span class="switch-row__info">
          <span class="switch-row__name">
            <span class="switch-row__name-text">{{ profile.name }}</span>
            <span class="st-chip">{{ getProviderLabel(profile.api.provider) }}</span>
          </span>
          <span class="switch-row__meta">
            {{ profile.api.model || "未設置模型" }} · {{ getEndpointHost(profile.api.endpoint) || "未設定端點" }}
          </span>
        </span>
      </button>
    </SettingsGroup>
    <SettingsGroup>
      <button type="button" class="st-row" @click="emit('manage')">
        <span class="st-row__main"><span class="st-row__label">管理配置</span></span>
        <ChevronRight class="st-row__chevron" aria-hidden="true" />
      </button>
    </SettingsGroup>
  </SettingsSheet>

  <ProfileSwitchConfirm
    :open="open && showSwitchConfirm"
    :busy="isSaving"
    @save="saveAndGo"
    @discard="discardAndGo"
    @cancel="switchConfirmCancel"
  />
</template>

<style scoped lang="scss">
.switch-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 66px;
  padding: 10px 16px 10px 14px;
  box-sizing: border-box;
  border: 0;
  background: transparent;
  font: inherit;
  color: var(--st-text);
  text-align: left;
  cursor: pointer;
}

.switch-row__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.switch-row__name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 16px;
  font-weight: 500;
}

.switch-row__name-text {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.switch-row__meta {
  font-size: 13px;
  color: var(--st-sub);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
