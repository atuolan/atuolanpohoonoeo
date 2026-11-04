<script setup lang="ts">
/**
 * 一間房：牆、護牆板、地板、每件家具。
 * 用原本的像素大小（1 格 = 1px）排好，再整間一起放大，所有圖層的格子才會對齊。
 */
import type { FurnitureAction, ItemZone, RoomId } from "./houseData";

export interface RoomLayer {
  name: string;
  box: { x: number; y: number; w: number; h: number };
}

export interface RoomItem {
  id: string;
  name: string;
  room: RoomId;
  px: number;
  py: number;
  w: number;
  h: number;
  zone: ItemZone;
  action?: FurnitureAction;
}

defineProps<{
  room: RoomId;
  asset: string;
  scale: number;
  layers: RoomLayer[];
  items: RoomItem[];
  editMode: boolean;
  dragging: string | null;
  flashKey: string | null;
}>();

const emit = defineEmits<{ (e: "item-click", it: RoomItem): void }>();
</script>

<template>
  <div class="ph-room-px" :style="{ transform: `scale(${scale})` }">
    <img
      v-for="layer in layers"
      :key="layer.name"
      class="ph-px"
      :src="`${asset}${room}/${layer.name}.png`"
      alt=""
      draggable="false"
      :style="{ left: `${layer.box.x}px`, top: `${layer.box.y}px`, width: `${layer.box.w}px`, height: `${layer.box.h}px` }"
    />
    <img
      v-for="it in items"
      :key="it.id"
      class="ph-px ph-item"
      :class="{
        'is-clickable': !!it.action && !editMode,
        'is-movable': editMode && it.zone !== 'fixed',
        'is-dragging': dragging === `${room}:${it.id}`,
        'is-flash': flashKey === `${room}:${it.id}`,
      }"
      :data-room="room"
      :data-item="it.id"
      :src="`${asset}${room}/items/${it.id}.png`"
      :alt="it.action && !editMode ? `${it.name}，${it.action.to}` : ''"
      :role="it.action && !editMode ? 'button' : undefined"
      draggable="false"
      :style="{ left: `${it.px}px`, top: `${it.py}px`, width: `${it.w}px`, height: `${it.h}px` }"
      @click="emit('item-click', it)"
    />
  </div>
</template>

<style scoped>
.ph-room-px {
  position: absolute;
  left: 0;
  top: 0;
  width: 130px;
  height: 282px;
  transform-origin: 0 0;
}

.ph-px {
  position: absolute;
  display: block;
  image-rendering: crisp-edges;
  image-rendering: pixelated;
  pointer-events: none;
  -webkit-user-drag: none;
}

.ph-item.is-clickable,
.ph-item.is-movable {
  pointer-events: auto;
  cursor: pointer;
}

.ph-item.is-movable {
  cursor: grab;
  outline: 0.7px dashed rgba(255, 243, 196, 0.95);
  outline-offset: -0.35px;
}

.ph-item.is-dragging {
  cursor: grabbing;
  filter: drop-shadow(1px 1.4px 0 rgba(43, 30, 27, 0.4));
  z-index: 5;
}

.ph-item.is-flash {
  outline: 1px solid #fbf7ee;
  box-shadow: 0 0 0 1px #3b2a26;
}
</style>
