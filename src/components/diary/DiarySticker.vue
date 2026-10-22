<script setup lang="ts">
import { computed, useId } from "vue";
import type { DiaryStickerId } from "@/utils/diaryStyle";
import { DIARY_STICKER_ART } from "./diaryStickerArt";

const DIE_CUT_FILTER =
  "drop-shadow(2px 0 0 #fff) drop-shadow(-2px 0 0 #fff) drop-shadow(0 2px 0 #fff) drop-shadow(0 -2px 0 #fff) drop-shadow(0 3px 3px rgba(70,45,30,0.3))";
const SOFT_SHADOW_FILTER = "drop-shadow(0 2px 2px rgba(40,40,50,0.35))";

const props = withDefaults(
  defineProps<{
    id: DiaryStickerId;
    size?: number;
  }>(),
  { size: 56 },
);

// 每個實例的漸層 id 不能重複，同一頁兩張貼紙才不會互相蓋掉
const prefix = `ds-${useId()}`;

const art = computed(() => DIARY_STICKER_ART[props.id]);

const inner = computed(() => {
  const body = art.value?.body;
  return body ? body.split("__ID__").join(prefix) : "";
});

const stickerStyle = computed(() => {
  const isPaperclip = props.id === "paperclip";
  const width = isPaperclip ? props.size / 2 : props.size;
  return {
    width: `${width}px`,
    height: `${props.size}px`,
    filter: art.value?.dieCut ? DIE_CUT_FILTER : SOFT_SHADOW_FILTER,
  };
});
</script>

<template>
  <svg
    v-if="art"
    :viewBox="art.viewBox"
    :style="stickerStyle"
    aria-hidden="true"
    v-html="inner"
  ></svg>
</template>
