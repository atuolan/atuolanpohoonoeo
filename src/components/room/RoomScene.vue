<script setup lang="ts">
/**
 * 畫整間像素房間：家具、展示櫃上的禮物、角色（站著、坐在書桌前、睡在床上，不在就不畫）
 */
import { composeCharacter } from "@/data/pixelArt/character";
import { BED_FRONT_ART, FURNITURE_ART, GIFT_ART, ROOM_BACKGROUND, SHELF_ART } from "@/data/pixelArt/furniture";
import { ROOM_LAYOUT, ROOM_SIZE } from "@/data/pixelArt/roomLayout";
import { paint } from "@/data/pixelArt/types";
import { getFurniture, type RoomSlotId } from "@/data/roomFurniture";
import type { ShelfGift } from "@/services/charRoom";
import type { CharRoom, RoomPose } from "@/types/room";
import { drawPixelArt } from "@/utils/pixelCanvas";
import { onMounted, onUnmounted, ref, watch } from "vue";

const props = defineProps<{ room: CharRoom; pose: RoomPose; gifts?: ShelfGift[] }>();

const canvas = ref<HTMLCanvasElement | null>(null);
/** 站著時輕輕上下晃 */
const bob = ref(0);
let bobTimer: ReturnType<typeof setInterval> | null = null;

const Z_ART = paint(3, 3, { z: "#5b7bd5" }, [
  ["z", 0, 0, 3, 1],
  ["z", 1, 1, 1, 1],
  ["z", 0, 2, 3, 1],
]);

function furnitureOf(slot: RoomSlotId) {
  const id = props.room.placements[slot];
  const art = id ? FURNITURE_ART[id] : undefined;
  return id && art ? { id, art, def: getFurniture(id) } : null;
}

function draw() {
  const el = canvas.value;
  const ctx = el?.getContext("2d");
  if (!el || !ctx) return;
  el.width = ROOM_SIZE.w;
  el.height = ROOM_SIZE.h;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, el.width, el.height);
  const redraw = () => draw();
  const put = (art: Parameters<typeof drawPixelArt>[1], x: number, y: number, artId?: string, colors?: Record<string, string>) =>
    drawPixelArt(ctx, art, Math.round(x), Math.round(y), { artId, colors, onImageLoad: redraw });

  put(ROOM_BACKGROUND, 0, 0, "room:background");

  // 牆上：窗簾、左右牆
  const win = furnitureOf("window");
  if (win) put(win.art, ROOM_LAYOUT.window.x, ROOM_LAYOUT.window.y, `furniture:${win.id}`);
  for (const slot of ["wallA", "wallB"] as const) {
    const item = furnitureOf(slot);
    if (item) put(item.art, ROOM_LAYOUT[slot].cx - item.art.w / 2, ROOM_LAYOUT[slot].y, `furniture:${item.id}`);
  }

  // 展示櫃與禮物
  put(SHELF_ART, ROOM_LAYOUT.shelf.x, ROOM_LAYOUT.shelf.y, "furniture:shelf");
  (props.gifts ?? []).slice(0, 6).forEach((gift, i) => {
    const art = GIFT_ART[gift.kind];
    put(art, ROOM_LAYOUT.shelf.x + 1 + i * 4, ROOM_LAYOUT.shelf.y - art.h, `gift:${gift.kind}`);
  });

  const wardrobe = furnitureOf("wardrobe");
  if (wardrobe) put(wardrobe.art, ROOM_LAYOUT.wardrobe.x, ROOM_LAYOUT.wardrobe.bottom - wardrobe.art.h, `furniture:${wardrobe.id}`);
  const corner = furnitureOf("corner");
  if (corner) put(corner.art, ROOM_LAYOUT.corner.cx - corner.art.w / 2, ROOM_LAYOUT.corner.bottom - corner.art.h, `furniture:${corner.id}`);
  const rug = furnitureOf("rug");
  if (rug) put(rug.art, ROOM_LAYOUT.rug.x, ROOM_LAYOUT.rug.bottom - rug.art.h, `furniture:${rug.id}`);

  const sprite = props.room.sprite;

  // 床（睡覺時人在床上、蓋被子）
  const bed = furnitureOf("bed");
  if (bed) {
    const bedY = ROOM_LAYOUT.bed.bottom - bed.art.h;
    put(bed.art, ROOM_LAYOUT.bed.x, bedY, `furniture:${bed.id}`);
    if (props.pose === "sleep") {
      const lying = composeCharacter(sprite, "sleep");
      const surfaceY = bedY + (bed.def?.surface ?? bed.art.h - 8);
      const x = ROOM_LAYOUT.bed.x + 3;
      const y = surfaceY - lying.art.h + 4;
      put(lying.art, x, y, lying.artId, lying.colors);
      const front = BED_FRONT_ART[bed.id];
      if (front) put(front, ROOM_LAYOUT.bed.x, bedY, `furniture:${bed.id}:front`);
      put(Z_ART, x + 2, y - 5 - bob.value);
      put(Z_ART, x + 6, y - 9 + bob.value);
    }
  }

  // 書桌（忙的時候坐在書桌左前方，螢幕、鏡子擋不到人）
  const desk = furnitureOf("desk");
  if (desk) {
    put(desk.art, ROOM_LAYOUT.desk.x, ROOM_LAYOUT.desk.bottom - desk.art.h, `furniture:${desk.id}`);
    if (props.pose === "sit") {
      const sitting = composeCharacter(sprite, "sit");
      put(sitting.art, ROOM_LAYOUT.desk.x - 5, ROOM_LAYOUT.desk.bottom + 2 - sitting.art.h, sitting.artId, sitting.colors);
    }
  }

  if (props.pose === "stand") {
    const standing = composeCharacter(sprite, "stand");
    put(standing.art, ROOM_LAYOUT.stand.x, ROOM_LAYOUT.stand.bottom - standing.art.h - bob.value, standing.artId, standing.colors);
  }
}

function syncBob() {
  if (bobTimer) clearInterval(bobTimer);
  bobTimer = null;
  bob.value = 0;
  if (props.pose === "stand" || props.pose === "sleep") {
    bobTimer = setInterval(() => {
      bob.value = bob.value ? 0 : 1;
    }, 700);
  }
}

onMounted(() => {
  draw();
  syncBob();
});
onUnmounted(() => {
  if (bobTimer) clearInterval(bobTimer);
});
watch(() => props.pose, syncBob);
watch(() => [props.room, props.pose, props.gifts, bob.value], draw, { deep: true });
</script>

<template>
  <canvas ref="canvas" class="room-scene" role="img" :aria-label="`像素房間`" />
</template>

<style scoped>
.room-scene {
  display: block;
  width: 100%;
  aspect-ratio: 96 / 64;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  border-radius: 12px;
}
</style>
