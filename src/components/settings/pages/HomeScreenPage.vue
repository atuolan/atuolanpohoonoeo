<script setup lang="ts">
/**
 * 主頁：主頁用畫布還是像素小屋；像素小屋住的是誰、光線、家具擺設還原。
 * （小人的外觀在小屋裡的衣櫃換，每個角色各一套）
 */
import {
  loadPixelHouseState,
  updatePixelHouseState,
  type HomeStyle,
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
const timeLight = ref(initial.timeLight);
const calm = ref(initial.calm);
const hasPlacements = ref(Object.keys(initial.placements).length > 0);
const resetDone = ref(false);

onMounted(() => {
  if (!charactersStore.characters.length) void charactersStore.loadCharacters();
});

const styleOptions = [
  { value: "canvas", label: "畫布" },
  { value: "pixel-house", label: "像素小屋" },
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

function setTimeLight(v: boolean) {
  timeLight.value = v;
  updatePixelHouseState({ timeLight: v });
}

function setCalm(v: boolean) {
  calm.value = v;
  updatePixelHouseState({ calm: v });
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
      footer="像素小屋：廚房、客廳、臥室、浴室排成一條左右滑；點右下角的小按鈕，最下面會展開常用的 App、「小屋」和「全部 App」，有小亮點的家具點了也會打開 App。原本畫布上的小工具和底部轉盤會先收起來，換回畫布就回來。"
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
      footer="住在小屋的角色決定之後就固定，不會跟著最近聊天換。他會跟聊天裡的狀態連動：在睡就去床上睡、在忙就坐在電腦前、出門或約會就不在家。換外觀：在小屋點浴室的鏡子，或右下角的小按鈕 ›「小屋 › 換外觀」，每個角色各一套。"
    >
      <SettingsSelectRow
        label="住在小屋的角色"
        :model-value="residentId"
        :options="residentOptions"
        @update:model-value="setResident"
      />
      <SettingsSwitchRow
        label="跟著時間變暗"
        description="黃昏偏橘、晚上偏藍；關掉就一直是白天的亮度"
        :model-value="timeLight"
        @update:model-value="setTimeLight"
      />
      <SettingsSwitchRow
        label="少走動"
        description="一兩分鐘才換一件事，比較省電；關掉是二十到四十秒換一件"
        :model-value="calm"
        @update:model-value="setCalm"
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
