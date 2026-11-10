<script setup lang="ts">
/**
 * 一間房：牆、護牆板、地板、每件家具。
 * 用原本的像素大小（1 格 = 1px）排好，再整間一起放大，所有圖層的格子才會對齊。
 */
import { MAIL_ITEMS, NIGHT_ITEMS, type FurnitureAction, type ItemZone, type RoomId } from "./houseData";

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

const props = defineProps<{
  room: RoomId;
  asset: string;
  scale: number;
  layers: RoomLayer[];
  items: RoomItem[];
  editMode: boolean;
  dragging: string | null;
  flashKey: string | null;
  /** 晚上：窗戶換成夜空 */
  night?: boolean;
  /** 有未讀訊息：信箱露出一封信 */
  hasMail?: boolean;
  /**
   * 一間房分兩次畫：back 畫牆、地板和在他後面的家具，front 只畫在他前面的家具（疊在他上面）。
   * 兩次都放全部的家具，不是這一層的藏起來，換層時不會閃。
   */
  pass?: "back" | "front";
  /** 在他前面的家具 */
  frontIds?: string[];
}>();

function hidden(id: string): boolean {
  if (!props.pass) return false;
  const front = !!props.frontIds?.includes(id);
  return props.pass === "front" ? !front : front;
}

function itemSrc(id: string): string {
  if (props.hasMail && MAIL_ITEMS[props.room].includes(id)) return `${props.asset}${props.room}/items/${id}-full.png`;
  const night = props.night && NIGHT_ITEMS[props.room].includes(id);
  return `${props.asset}${props.room}/items/${id}${night ? "-night" : ""}.png`;
}

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
      :src="itemSrc(it.id)"
      :alt="it.action && !editMode ? `${it.name}，${it.action.to}` : ''"
      :role="it.action && !editMode ? 'button' : undefined"
      draggable="false"
      :style="{ left: `${it.px}px`, top: `${it.py}px`, width: `${it.w}px`, height: `${it.h}px`, visibility: hidden(it.id) ? 'hidden' : undefined }"
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
