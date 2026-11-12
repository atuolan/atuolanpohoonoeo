<script setup lang="ts">
/**
 * 一間房：牆、護牆板、地板、每件家具。
 * 用原本的像素大小（1 格 = 1px）排好，再整間一起放大，所有圖層的格子才會對齊。
 */
import { MAIL_ITEMS, NIGHT_ITEMS, SLEEP_ITEMS, type FurnitureAction, type ItemZone, type RoomId } from "./houseData";

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
  /** 圖不在這間的 items/ 裡（商店買的擺件）：直接給網址 */
  src?: string;
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
  /** 他睡在這間的床上：床換成被子鼓起來的那張 */
  sleeping?: boolean;
  /** 這間的家具換了哪個款式：家具 id → 款式 id */
  skins?: Record<string, string>;
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

/** 現在這件家具是哪個狀態：睡覺、有信、晚上（沒有就是平常） */
function stateSuffix(id: string): string {
  if (props.sleeping && SLEEP_ITEMS[props.room].includes(id)) return "-sleep";
  if (props.hasMail && MAIL_ITEMS[props.room].includes(id)) return "-full";
  if (props.night && NIGHT_ITEMS[props.room].includes(id)) return "-night";
  return "";
}

function itemSrc(it: RoomItem): string {
  const skin = props.skins?.[it.id];
  if (skin) return `${props.asset}skins/${props.room}/${it.id}/${skin}${stateSuffix(it.id)}.png`;
  if (it.src) return it.src;
  const id = it.id;
  if (props.sleeping && SLEEP_ITEMS[props.room].includes(id)) return `${props.asset}${props.room}/items/${id}-sleep.png`;
  if (props.hasMail && MAIL_ITEMS[props.room].includes(id)) return `${props.asset}${props.room}/items/${id}-full.png`;
  const night = props.night && NIGHT_ITEMS[props.room].includes(id);
  return `${props.asset}${props.room}/items/${id}${night ? "-night" : ""}.png`;
}

/** 手指好點的最小範圍（畫面上的 px） */
const MIN_TAP = 44;

/**
 * 可以點的小家具（手機、小箱子、啞鈴…）：圖不變，點得到的範圍往外加到 44px。
 * 用 padding 加大、負的 margin 拉回來，圖還是在原本的位置。
 */
function itemStyle(it: RoomItem) {
  const style: Record<string, string | undefined> = {
    left: `${it.px}px`,
    top: `${it.py}px`,
    width: `${it.w}px`,
    height: `${it.h}px`,
    visibility: hidden(it.id) ? "hidden" : undefined,
  };
  if (it.action && !props.editMode && props.scale > 0) {
    const min = MIN_TAP / props.scale;
    const padX = Math.max(0, (min - it.w) / 2);
    const padY = Math.max(0, (min - it.h) / 2);
    if (padX || padY) {
      // 全站的 box-sizing 是 border-box，這裡要往外加
      style.boxSizing = "content-box";
      style.padding = `${padY}px ${padX}px`;
      style.margin = `${-padY}px ${-padX}px`;
    }
  }
  return style;
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
      :src="itemSrc(it)"
      :alt="it.action && !editMode ? `${it.name}，${it.action.to}` : ''"
      :role="it.action && !editMode ? 'button' : undefined"
      draggable="false"
      :style="itemStyle(it)"
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
