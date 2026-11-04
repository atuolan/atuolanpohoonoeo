<script setup lang="ts">
/**
 * 角色的像素房間（全螢幕）：看他在做什麼、佈置家具、換造型、去他房間
 */
import {
  BODY_TYPES,
  EYE_COLORS,
  HAIR_COLORS,
  HAIR_STYLES,
  OUTFIT_COLORS,
  OUTFIT_STYLES,
  PANTS_COLORS,
  SKIN_COLORS,
  type CharBody,
  type CharHair,
  type CharOutfit,
} from "@/data/pixelArt/character";
import { FURNITURE_ART } from "@/data/pixelArt/furniture";
import {
  FURNITURE,
  ROOM_SLOTS,
  furnitureIdFromShopId,
  furnitureShopId,
  getFurniture,
  slotAccepts,
  type RoomSlotId,
} from "@/data/roomFurniture";
import {
  adultContentEnabled,
  loadAdultContentSetting,
  loadCharRoom,
  loadShelfGifts,
  saveCharRoom,
  setAdultContentEnabled,
  syncRoomImportantEvent,
  type ShelfGift,
} from "@/services/charRoom";
import { useGameEconomyStore } from "@/stores/gameEconomy";
import type { CharRoom, RoomPose } from "@/types/room";
import { clearSlot, placeFurniture } from "@/utils/roomLogic";
import { computed, ref, watch } from "vue";
import PixelArtCanvas from "./PixelArtCanvas.vue";
import RoomScene from "./RoomScene.vue";

const GLOBAL_WALLET_ID = "global";

const props = defineProps<{
  visible: boolean;
  characterId: string;
  chatId?: string;
  charName: string;
  userName: string;
  pose: RoomPose;
  statusText: string;
  /** 能不能去他房間（不在、約會中不行）；不能時的理由 */
  visitBlockedReason?: string;
  visitLabel: string;
}>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "visit"): void;
  (e: "open-shop"): void;
}>();

const gameEconomyStore = useGameEconomyStore();
const room = ref<CharRoom | null>(null);
const gifts = ref<ShelfGift[]>([]);
const tab = ref<"arrange" | "look" | "settings">("arrange");
const openSlot = ref<RoomSlotId | null>(null);

async function load() {
  if (!props.characterId) return;
  room.value = await loadCharRoom(props.characterId);
  gifts.value = await loadShelfGifts(props.characterId);
  await gameEconomyStore.loadState(GLOBAL_WALLET_ID).catch(() => undefined);
  await loadAdultContentSetting();
}

watch(
  () => [props.visible, props.characterId],
  () => {
    if (props.visible) void load();
  },
  { immediate: true },
);

async function persist(next: CharRoom, by: "user" | "char" = "user") {
  room.value = { ...next, lastArrangedBy: by };
  await saveCharRoom(room.value);
  void syncRoomImportantEvent(
    room.value,
    { userName: props.userName, charName: props.charName },
    gifts.value.map((g) => g.name),
    props.chatId,
  );
}

// ===== 佈置 =====

/** 背包裡的家具（家具 id → 數量） */
const ownedFurniture = computed(() => {
  const map = new Map<string, number>();
  for (const item of gameEconomyStore.getInventory(GLOBAL_WALLET_ID)) {
    const id = furnitureIdFromShopId(item.itemId);
    if (id && item.quantity > 0) map.set(id, (map.get(id) ?? 0) + item.quantity);
  }
  return map;
});

interface SlotOption {
  id: string;
  name: string;
  source: "storage" | "bag";
  count?: number;
}

function optionsFor(slot: RoomSlotId): SlotOption[] {
  const r = room.value;
  if (!r) return [];
  const current = r.placements[slot];
  const options: SlotOption[] = [];
  const seen = new Set<string>();
  for (const id of r.storage) {
    const f = getFurniture(id);
    if (!f || !slotAccepts(slot, f) || id === current || seen.has(id)) continue;
    seen.add(id);
    options.push({ id, name: f.name, source: "storage" });
  }
  for (const f of FURNITURE) {
    const count = ownedFurniture.value.get(f.id) ?? 0;
    if (count > 0 && slotAccepts(slot, f)) options.push({ id: f.id, name: f.name, source: "bag", count });
  }
  return options;
}

async function choose(slot: RoomSlotId, option: SlotOption) {
  const r = room.value;
  if (!r) return;
  if (option.source === "bag") {
    if (!gameEconomyStore.consumeInventoryItem(GLOBAL_WALLET_ID, furnitureShopId(option.id))) return;
    await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
  }
  await persist(placeFurniture(r, slot, option.id));
  openSlot.value = null;
}

async function putAway(slot: RoomSlotId) {
  if (!room.value) return;
  await persist(clearSlot(room.value, slot));
  openSlot.value = null;
}

const OPTIONAL_SLOTS: RoomSlotId[] = ["wallA", "wallB", "rug", "corner"];

// ===== 造型 =====

async function setSprite(patch: { body?: CharBody; hair?: CharHair; outfit?: CharOutfit }) {
  if (!room.value) return;
  await persist({ ...room.value, sprite: { ...room.value.sprite, ...patch }, updatedAt: Date.now() });
}

async function setColor(key: keyof CharRoom["sprite"]["colors"], color: string) {
  if (!room.value) return;
  const sprite = { ...room.value.sprite, colors: { ...room.value.sprite.colors, [key]: color } };
  await persist({ ...room.value, sprite, updatedAt: Date.now() });
}

const COLOR_ROWS: Array<{ key: keyof CharRoom["sprite"]["colors"]; label: string; colors: string[] }> = [
  { key: "skin", label: "膚色", colors: SKIN_COLORS },
  { key: "hair", label: "髮色", colors: HAIR_COLORS },
  { key: "eye", label: "眼睛", colors: EYE_COLORS },
  { key: "outfit", label: "衣服", colors: OUTFIT_COLORS },
  { key: "pants", label: "褲子", colors: PANTS_COLORS },
];

// ===== 設定 =====

async function toggleAdult() {
  await setAdultContentEnabled(!adultContentEnabled.value);
}
</script>

<template>
  <Teleport to="body">
    <Transition name="room-fade">
      <div v-if="visible" class="room-screen" role="dialog" :aria-label="`${charName}的房間`">
        <header class="room-header">
          <button type="button" class="room-back" aria-label="返回" @click="emit('close')">‹</button>
          <h2>{{ charName }}的房間</h2>
          <span class="room-header-space" />
        </header>

        <div class="room-body">
          <div class="room-stage">
            <RoomScene v-if="room" :room="room" :pose="pose" :gifts="gifts" />
            <div class="room-status">{{ statusText }}</div>
          </div>

          <button
            type="button"
            class="room-visit"
            :disabled="!!visitBlockedReason"
            @click="emit('visit')"
          >
            {{ visitBlockedReason || visitLabel }}
          </button>

          <div class="room-tabs" role="tablist">
            <button type="button" role="tab" :aria-selected="tab === 'arrange'" :class="{ active: tab === 'arrange' }" @click="tab = 'arrange'">佈置</button>
            <button type="button" role="tab" :aria-selected="tab === 'look'" :class="{ active: tab === 'look' }" @click="tab = 'look'">造型</button>
            <button type="button" role="tab" :aria-selected="tab === 'settings'" :class="{ active: tab === 'settings' }" @click="tab = 'settings'">設定</button>
          </div>

          <!-- 佈置 -->
          <section v-if="tab === 'arrange' && room" class="room-panel">
            <div v-for="slot in ROOM_SLOTS" :key="slot.id" class="slot-row">
              <button type="button" class="slot-head" @click="openSlot = openSlot === slot.id ? null : slot.id">
                <span class="slot-name">{{ slot.name }}</span>
                <span class="slot-current">{{ getFurniture(room.placements[slot.id])?.name ?? "空的" }}</span>
                <span class="slot-chevron" aria-hidden="true">{{ openSlot === slot.id ? "▾" : "▸" }}</span>
              </button>
              <div v-if="openSlot === slot.id" class="slot-options">
                <button
                  v-for="option in optionsFor(slot.id)"
                  :key="`${option.source}-${option.id}`"
                  type="button"
                  class="slot-option"
                  @click="choose(slot.id, option)"
                >
                  <PixelArtCanvas :art="FURNITURE_ART[option.id]" :art-id="`furniture:${option.id}`" :size="40" />
                  <span class="slot-option-name">{{ option.name }}</span>
                  <span class="slot-option-source">{{ option.source === "bag" ? `背包 ×${option.count}` : "收納" }}</span>
                </button>
                <button
                  v-if="OPTIONAL_SLOTS.includes(slot.id) && room.placements[slot.id]"
                  type="button"
                  class="slot-option slot-option--plain"
                  @click="putAway(slot.id)"
                >
                  收起來
                </button>
                <p v-if="optionsFor(slot.id).length === 0" class="slot-empty">
                  沒有可以換的。<button type="button" class="link" @click="emit('open-shop')">去商店買家具</button>
                </p>
              </div>
            </div>
            <button type="button" class="room-shop-link" @click="emit('open-shop')">去商店買更多家具</button>
          </section>

          <!-- 造型 -->
          <section v-if="tab === 'look' && room" class="room-panel">
            <div class="look-group">
              <div class="look-label">體型</div>
              <div class="chip-row">
                <button
                  v-for="(name, id) in BODY_TYPES"
                  :key="id"
                  type="button"
                  class="chip"
                  :class="{ active: room.sprite.body === id }"
                  @click="setSprite({ body: id as CharBody })"
                >{{ name }}</button>
              </div>
            </div>
            <div class="look-group">
              <div class="look-label">髮型</div>
              <div class="chip-row">
                <button
                  v-for="(style, id) in HAIR_STYLES"
                  :key="id"
                  type="button"
                  class="chip"
                  :class="{ active: room.sprite.hair === id }"
                  @click="setSprite({ hair: id as CharHair })"
                >{{ style.name }}</button>
              </div>
            </div>
            <div class="look-group">
              <div class="look-label">衣服</div>
              <div class="chip-row">
                <button
                  v-for="(name, id) in OUTFIT_STYLES"
                  :key="id"
                  type="button"
                  class="chip"
                  :class="{ active: room.sprite.outfit === id }"
                  @click="setSprite({ outfit: id as CharOutfit })"
                >{{ name }}</button>
              </div>
            </div>
            <div v-for="row in COLOR_ROWS" :key="row.key" class="look-group">
              <div class="look-label">{{ row.label }}</div>
              <div class="swatch-row">
                <button
                  v-for="color in row.colors"
                  :key="color"
                  type="button"
                  class="swatch"
                  :class="{ active: room.sprite.colors[row.key] === color }"
                  :style="{ background: color }"
                  :aria-label="`${row.label} ${color}`"
                  @click="setColor(row.key, color)"
                />
              </div>
            </div>
            <p class="look-note">小人是程式畫的佔位圖，之後可以換成自己的像素圖。</p>
          </section>

          <!-- 設定 -->
          <section v-if="tab === 'settings'" class="room-panel">
            <label class="setting-row">
              <span class="setting-text">
                <span class="setting-title">成人內容</span>
                <span class="setting-desc">開啟後，去他房間時會把家具的親密玩法（例如鏡子、遮光窗簾）告訴 AI。平常聊天不受影響。這個開關是全部角色共用的。</span>
              </span>
              <input type="checkbox" :checked="adultContentEnabled" @change="toggleAdult" />
            </label>
          </section>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.room-screen {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  flex-direction: column;
  background: var(--color-background, #f7f4ef);
  color: var(--color-text-primary, #1f2937);
  padding-top: env(safe-area-inset-top);
}

.room-header {
  display: flex;
  align-items: center;
  padding: 10px 12px;

  h2 {
    flex: 1;
    margin: 0;
    text-align: center;
    font-size: 17px;
    font-weight: 600;
  }
}

.room-back,
.room-header-space {
  width: 36px;
  height: 36px;
}

.room-back {
  border: none;
  border-radius: 50%;
  background: var(--color-surface, #fff);
  color: inherit;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.room-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px calc(24px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.room-stage {
  position: relative;
}

.room-status {
  margin-top: 6px;
  text-align: center;
  font-size: 13px;
  color: var(--color-text-secondary, #6b7280);
}

.room-visit {
  padding: 12px;
  border: none;
  border-radius: 14px;
  background: var(--color-primary, #7dd3a8);
  color: var(--color-on-primary-contrast, #fff);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.room-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  background: var(--color-surface-alt, rgba(0, 0, 0, 0.05));

  button {
    flex: 1;
    padding: 8px 0;
    border: none;
    border-radius: 9px;
    background: transparent;
    color: inherit;
    font-size: 14px;
    cursor: pointer;

    &.active {
      background: var(--color-surface, #fff);
      font-weight: 600;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
    }
  }
}

.room-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.slot-row {
  border-radius: 12px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  overflow: hidden;
}

.slot-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 11px 14px;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.slot-name {
  font-weight: 600;
  min-width: 72px;
}

.slot-current {
  flex: 1;
  color: var(--color-text-secondary, #6b7280);
}

.slot-options {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: 8px;
  padding: 0 12px 12px;
}

.slot-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
  background: var(--color-surface, #fff);
  color: inherit;
  cursor: pointer;

  &--plain {
    justify-content: center;
    font-size: 13px;
    color: var(--color-text-secondary, #6b7280);
  }
}

.slot-option-name {
  font-size: 13px;
}

.slot-option-source {
  font-size: 11px;
  color: var(--color-text-tertiary, #9ca3af);
}

.slot-empty {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary, #6b7280);
}

.link,
.room-shop-link {
  border: none;
  background: none;
  padding: 0;
  color: var(--color-primary, #7dd3a8);
  font-size: 13px;
  cursor: pointer;
}

.room-shop-link {
  align-self: center;
  margin-top: 4px;
}

.look-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.look-label {
  font-size: 13px;
  font-weight: 600;
}

.chip-row,
.swatch-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  padding: 6px 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 999px;
  background: var(--color-surface, #fff);
  color: inherit;
  font-size: 13px;
  cursor: pointer;

  &.active {
    border-color: var(--color-primary, #7dd3a8);
    background: var(--color-primary, #7dd3a8);
    color: var(--color-on-primary-contrast, #fff);
  }
}

.swatch {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid var(--color-border, #e5e7eb);
  cursor: pointer;

  &.active {
    border-color: var(--color-text-primary, #1f2937);
    box-shadow: 0 0 0 2px var(--color-surface, #fff) inset;
  }
}

.look-note {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--color-text-tertiary, #9ca3af);
}

.setting-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  border-radius: 12px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  cursor: pointer;

  input {
    margin-top: 3px;
    width: 18px;
    height: 18px;
    accent-color: var(--color-primary, #7dd3a8);
  }
}

.setting-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-title {
  font-size: 15px;
  font-weight: 600;
}

.setting-desc {
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-secondary, #6b7280);
}

.room-fade-enter-active,
.room-fade-leave-active {
  transition: opacity 0.2s ease;
}

.room-fade-enter-from,
.room-fade-leave-to {
  opacity: 0;
}
</style>
