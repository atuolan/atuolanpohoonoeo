<script setup lang="ts">
/**
 * 畫一張像素圖（商店縮圖、選家具用）；有對應圖檔就畫圖檔
 */
import type { PixelArt } from "@/data/pixelArt/types";
import { drawPixelArt } from "@/utils/pixelCanvas";
import { onMounted, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{ art: PixelArt; artId?: string; colors?: Record<string, string>; size?: number }>(),
  { size: 48 },
);

const canvas = ref<HTMLCanvasElement | null>(null);

function draw() {
  const el = canvas.value;
  const ctx = el?.getContext("2d");
  if (!el || !ctx) return;
  el.width = props.art.w;
  el.height = props.art.h;
  ctx.clearRect(0, 0, el.width, el.height);
  drawPixelArt(ctx, props.art, 0, 0, { colors: props.colors, artId: props.artId, onImageLoad: draw });
}

onMounted(draw);
watch(() => [props.art, props.colors, props.artId], draw, { deep: true });
</script>

<template>
  <canvas
    ref="canvas"
    class="pixel-art-canvas"
    :style="{
      width: `${art.w >= art.h ? size : Math.round((size * art.w) / art.h)}px`,
      height: `${art.h >= art.w ? size : Math.round((size * art.h) / art.w)}px`,
    }"
    aria-hidden="true"
  />
</template>

<style scoped>
.pixel-art-canvas {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  display: block;
}
</style>
