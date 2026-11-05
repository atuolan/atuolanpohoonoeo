<script setup lang="ts">
/**
 * 主頁：主頁用畫布還是像素小屋；像素小屋住的是誰、小人是男生還是女生、家具擺設還原。
 */
import {
  loadPixelHouseState,
  updatePixelHouseState,
  type HomeStyle,
  type ResidentLook,
} from "@/components/pixelHouse/houseState";
import { useCharactersStore } from "@/stores";
import { computed, onMounted, ref } from "vue";
import SettingsGroup from "../ui/SettingsGroup.vue";
import SettingsRow from "../ui/SettingsRow.vue";
import SettingsSegmented from "../ui/SettingsSegmented.vue";
import SettingsSelectRow from "../ui/SettingsSelectRow.vue";
import SettingsSwitchRow from "../ui/SettingsSwitchRow.vue";

const charactersStore = useCharactersStore();
const initial = loadPixelHouseState();
const homeStyle = ref<HomeStyle>(initial.homeStyle);
const residentId = ref<string>(initial.residentCharId ?? "");
const look = ref<ResidentLook>(initial.look);
const timeLight = ref(initial.timeLight);
const hasPlacements = ref(Object.keys(initial.placements).length > 0);
const resetDone = ref(false);

onMounted(() => {
  if (!charactersStore.characters.length) void charactersStore.loadCharacters();
});

const styleOptions = [
  { value: "canvas", label: "畫布" },
  { value: "pixel-house", label: "像素小屋" },
];
const lookOptions = [
  { value: "boy", label: "男生" },
  { value: "girl", label: "女生" },
];

const residentOptions = computed(() => [
  { value: "", label: "最近聊天的那位（第一次打開時決定）" },
  ...charactersStore.characters.map((c) => ({
    value: c.id,
    label: c.nickname || c.data?.name || "未命名角色",
  })),
]);

function setStyle(v: string) {
  homeStyle.value = v === "pixel-house" ? "pixel-house" : "canvas";
  updatePixelHouseState({ homeStyle: homeStyle.value });
}

function setResident(v: string) {
  residentId.value = v;
  updatePixelHouseState({ residentCharId: v || null });
}

function setLook(v: string) {
  look.value = v === "girl" ? "girl" : "boy";
  updatePixelHouseState({ look: look.value });
}

function setTimeLight(v: boolean) {
  timeLight.value = v;
  updatePixelHouseState({ timeLight: v });
}

function resetPlacements() {
  updatePixelHouseState({ placements: {} });
  hasPlacements.value = false;
  resetDone.value = true;
}
</script>

<template>
  <div class="st-page">
    <SettingsGroup
      title="主頁樣式"
      footer="像素小屋：客廳、臥室、廚房排成一條左右滑，點家具打開 App，右上的轉盤有常用的 App 和「全部 App」。原本畫布上的小工具和底部轉盤會先收起來，換回畫布就回來。"
    >
      <div>
        <SettingsSegmented
          class="st-seg--inset"
          label="主頁樣式"
          :model-value="homeStyle"
          :options="styleOptions"
          @update:model-value="setStyle"
        />
      </div>
    </SettingsGroup>

    <SettingsGroup
      title="像素小屋"
      footer="住在小屋的角色決定之後就固定，不會跟著最近聊天換。他會跟聊天裡的狀態連動：在睡就去床上睡、在忙就坐在電腦前、出門或約會就不在家。"
    >
      <SettingsSelectRow
        label="住在小屋的角色"
        :model-value="residentId"
        :options="residentOptions"
        @update:model-value="setResident"
      />
      <SettingsSelectRow label="小人" :model-value="look" :options="lookOptions" @update:model-value="setLook" />
      <SettingsSwitchRow
        label="跟著時間變暗"
        description="黃昏偏橘、晚上偏藍；關掉就一直是白天的亮度"
        :model-value="timeLight"
        @update:model-value="setTimeLight"
      />
      <SettingsRow
        label="還原家具擺設"
        :description="resetDone ? '已經還原成預設的擺法' : '在小屋裡長按房間可以移動家具；這裡把四間都放回原位'"
        :disabled="!hasPlacements"
        clickable
        tone="danger"
        @click="resetPlacements"
      />
    </SettingsGroup>
  </div>
</template>
