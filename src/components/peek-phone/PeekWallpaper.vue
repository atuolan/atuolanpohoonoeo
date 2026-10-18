<script setup lang="ts">
/** 角色手機桌布：有頭像就拿頭像模糊當底，沒有就用預設漸層 */
defineProps<{ avatar?: string }>();
</script>

<template>
  <!-- 用 span：會放進按鈕裡（選角色頁的手機） -->
  <span class="peek-wallpaper" aria-hidden="true">
    <img v-if="avatar" class="peek-wallpaper-img" :src="avatar" alt="" />
    <span v-if="avatar" class="peek-wallpaper-shade" />
  </span>
</template>

<style scoped lang="scss">
.peek-wallpaper {
  display: block;
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: var(--p-wallpaper);
  pointer-events: none;
}

.peek-wallpaper-img {
  position: absolute;
  inset: -12%;
  width: 124%;
  height: 124%;
  object-fit: cover;
  filter: blur(32px) saturate(1.15);
}

// 讓白字在任何頭像上都讀得清楚
.peek-wallpaper-shade {
  display: block;
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(10, 10, 12, 0.42) 0%, rgba(10, 10, 12, 0.3) 45%, rgba(10, 10, 12, 0.58) 100%);
}
</style>
