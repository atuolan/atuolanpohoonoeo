<script setup lang="ts">
/** 噗浪頭像：有圖用圖，沒圖（或載入失敗）用名字首字 + 固定底色 */
import { computed, ref, watch } from "vue";
import { avatarColor, initialOf } from "@/components/peek-phone/peekPhoneView";

const props = defineProps<{
  src?: string;
  name: string;
  size?: number;
}>();

const failed = ref(false);

watch(
  () => props.src,
  () => {
    failed.value = false;
  },
);

const px = computed(() => props.size ?? 40);
const showImage = computed(() => !!props.src && !failed.value);
const initial = computed(() => initialOf(props.name));
const bg = computed(() => avatarColor(props.name));
const fontSize = computed(() => `${Math.round(px.value * 0.38)}px`);
</script>

<template>
  <span
    class="plurk-avatar"
    :style="{ width: `${px}px`, height: `${px}px`, background: showImage ? undefined : bg }"
    :title="props.name"
  >
    <img v-if="showImage" :src="props.src" :alt="props.name" @error="failed = true" />
    <span v-else class="plurk-avatar-initial" :style="{ fontSize }">{{ initial }}</span>
  </span>
</template>

<style scoped lang="scss">
@use "@/components/plurk/plurk-theme.scss" as *;

.plurk-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border-radius: 50%;
  overflow: hidden;
  user-select: none;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

.plurk-avatar-initial {
  color: #ffffff;
  font-weight: 700;
  line-height: 1;
}
</style>
