<script setup lang="ts">
/**
 * 共感娃娃換裝：分類 → 樣式（小預覽）＋顏色；微調滑桿
 */
import { computed, ref } from "vue";
import CottonDoll from "@/components/gift/CottonDoll.vue";
import {
  ACCESSORY_STYLES,
  BOTTOM_STYLES,
  CLOTH_COLORS,
  DEFAULT_DOLL_LOOK,
  EYE_STYLES,
  HAIR_COLORS,
  HAIR_STYLES,
  MOUTH_STYLES,
  SHOE_STYLES,
  SKIN_TONES,
  TOP_STYLES,
  type DollLook,
  type DollTune,
  type WardrobeOption,
} from "@/data/dollWardrobe";

const props = defineProps<{ look: DollLook }>();
const emit = defineEmits<{ "update:look": [DollLook] }>();

type CategoryId = "face" | "hair" | "top" | "bottom" | "shoes" | "accessory" | "tune";
const CATEGORIES: Array<{ id: CategoryId; label: string }> = [
  { id: "face", label: "臉" },
  { id: "hair", label: "頭髮" },
  { id: "top", label: "上衣" },
  { id: "bottom", label: "下身" },
  { id: "shoes", label: "鞋子" },
  { id: "accessory", label: "頭飾" },
  { id: "tune", label: "微調" },
];
const category = ref<CategoryId>("face");

function set(patch: Partial<DollLook>) {
  const next = { ...props.look, ...patch };
  // 女僕裝有白圍裙，衣服是白的會糊在一起，換成深色
  if (patch.top === "maid" && ["#ffffff", "#f6e7c8"].includes(next.topColor)) next.topColor = "#4a4a5a";
  emit("update:look", next);
}
function setTune(key: keyof DollTune, event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  emit("update:look", { ...props.look, tune: { ...props.look.tune, [key]: value } });
}
function reset() {
  emit("update:look", { ...DEFAULT_DOLL_LOOK, tune: { ...DEFAULT_DOLL_LOOK.tune } });
}

const topIsFullBody = computed(() => !!TOP_STYLES.find((t) => t.id === props.look.top)?.fullBody);

interface Section {
  title: string;
  options: WardrobeOption[];
  key: keyof DollLook;
  /** 預覽要不要放大到頭 */
  focus: "head" | "body";
  colors?: string[];
  colorKey?: keyof DollLook;
}

const sections = computed<Section[]>(() => {
  switch (category.value) {
    case "face":
      return [
        { title: "眼睛", options: EYE_STYLES, key: "eyes", focus: "head" },
        { title: "嘴巴", options: MOUTH_STYLES, key: "mouth", focus: "head" },
      ];
    case "hair":
      return [{ title: "髮型", options: HAIR_STYLES, key: "hair", focus: "head", colors: HAIR_COLORS, colorKey: "hairColor" }];
    case "top":
      return [{ title: "上衣", options: TOP_STYLES, key: "top", focus: "body", colors: CLOTH_COLORS, colorKey: "topColor" }];
    case "bottom":
      return [{ title: "下身", options: BOTTOM_STYLES, key: "bottom", focus: "body", colors: CLOTH_COLORS, colorKey: "bottomColor" }];
    case "shoes":
      return [{ title: "鞋子", options: SHOE_STYLES, key: "shoes", focus: "body", colors: CLOTH_COLORS, colorKey: "shoesColor" }];
    case "accessory":
      return [{ title: "頭飾", options: ACCESSORY_STYLES, key: "accessory", focus: "head", colors: CLOTH_COLORS, colorKey: "accessoryColor" }];
    default:
      return [];
  }
});

function previewOf(key: keyof DollLook, id: string): DollLook {
  const look = { ...props.look, [key]: id } as DollLook;
  // 看下身時先把洋裝換掉，不然看不到
  if (key === "bottom" && topIsFullBody.value) look.top = "tee";
  return look;
}

const TUNES: Array<{ key: keyof DollTune; label: string; min: number; max: number; step: number }> = [
  { key: "hairY", label: "瀏海高低", min: -8, max: 8, step: 1 },
  { key: "eyeGap", label: "眼睛間距", min: -8, max: 8, step: 1 },
  { key: "accY", label: "頭飾高低", min: -12, max: 12, step: 1 },
  { key: "accScale", label: "頭飾大小", min: 0.8, max: 1.25, step: 0.05 },
];
</script>

<template>
  <div class="wardrobe">
    <div class="wardrobe-tabs">
      <button
        v-for="c in CATEGORIES"
        :key="c.id"
        type="button"
        class="wardrobe-tab"
        :class="{ active: category === c.id }"
        @click="category = c.id"
      >
        {{ c.label }}
      </button>
    </div>

    <div class="wardrobe-body">
      <template v-if="category === 'face'">
        <p class="section-title">膚色</p>
        <div class="swatches">
          <button
            v-for="s in SKIN_TONES"
            :key="s.id"
            type="button"
            class="swatch"
            :class="{ active: look.skin === s.id }"
            :style="{ background: s.color }"
            :aria-label="s.label"
            @click="set({ skin: s.id })"
          />
        </div>
      </template>

      <template v-for="section in sections" :key="section.title">
        <p class="section-title">{{ section.title }}</p>
        <p v-if="category === 'bottom' && topIsFullBody" class="section-note">現在穿的上衣是連身的，換了下身也看不到</p>
        <div class="options">
          <button
            v-for="opt in section.options"
            :key="opt.id"
            type="button"
            class="option"
            :class="{ active: look[section.key] === opt.id }"
            @click="set({ [section.key]: opt.id } as Partial<DollLook>)"
          >
            <span class="option-preview" :class="`focus-${section.focus}`">
              <span class="option-doll"><CottonDoll :look="previewOf(section.key, opt.id)" /></span>
            </span>
            <span class="option-label">{{ opt.label }}</span>
          </button>
        </div>
        <template v-if="section.colors && section.colorKey">
          <p class="section-title">顏色</p>
          <div class="swatches">
            <button
              v-for="c in section.colors"
              :key="c"
              type="button"
              class="swatch"
              :class="{ active: look[section.colorKey] === c }"
              :style="{ background: c }"
              :aria-label="c"
              @click="set({ [section.colorKey]: c } as Partial<DollLook>)"
            />
          </div>
        </template>
      </template>

      <template v-if="category === 'face'">
        <label class="toggle-row">
          <span>腮紅</span>
          <input type="checkbox" :checked="look.blush" @change="set({ blush: ($event.target as HTMLInputElement).checked })" />
        </label>
      </template>

      <template v-if="category === 'tune'">
        <label v-for="t in TUNES" :key="t.key" class="slider-row">
          <span class="slider-label">{{ t.label }}</span>
          <input
            type="range"
            :min="t.min"
            :max="t.max"
            :step="t.step"
            :value="look.tune[t.key]"
            @input="setTune(t.key, $event)"
          />
        </label>
        <button type="button" class="reset-btn" @click="reset">恢復預設造型</button>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.wardrobe {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.wardrobe-tabs {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
  padding: 0 16px 10px;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.wardrobe-tab {
  flex: 0 0 auto;
  padding: 6px 14px;
  border: 1px solid var(--color-border, #e6ddd3);
  border-radius: 999px;
  background: var(--color-surface, #fff);
  color: var(--color-text-secondary, #777);
  font-size: 13px;
  cursor: pointer;

  &.active {
    border-color: var(--color-primary, #c98b6b);
    background: var(--color-primary, #c98b6b);
    color: var(--color-on-primary-contrast, #fff);
  }
}

.wardrobe-body {
  padding: 0 16px 16px;
}

.section-title {
  margin: 12px 0 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary, #777);
}

.section-note {
  margin: -4px 0 8px;
  font-size: 11px;
  color: var(--color-text-secondary, #999);
  opacity: 0.85;
}

.options {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 4px;
  border: 2px solid transparent;
  border-radius: 14px;
  background: var(--color-surface, #fff);
  cursor: pointer;

  &.active {
    border-color: var(--color-primary, #c98b6b);
  }
}

.option-preview {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 5;
  overflow: hidden;
  border-radius: 10px;
  background: var(--color-background, #f8f5f0);
}

.option-doll {
  position: absolute;
  inset: 4% 0 0;
  transform-origin: 50% 0;
}

.focus-head .option-doll {
  transform: translateY(-4%) scale(1.7);
}

.option-label {
  font-size: 11px;
  color: var(--color-text, #333);
  white-space: nowrap;
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.swatch {
  width: 30px;
  height: 30px;
  border: 2px solid var(--color-border, #e6ddd3);
  border-radius: 50%;
  cursor: pointer;
  box-shadow: inset 0 -3px 6px rgba(0, 0, 0, 0.08);

  &.active {
    outline: 3px solid var(--color-primary, #c98b6b);
    outline-offset: 2px;
  }
}

.toggle-row,
.slider-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  font-size: 13px;
  color: var(--color-text, #333);
}

.slider-row input {
  flex: 1;
  min-width: 0;
  accent-color: var(--color-primary, #c98b6b);
}

.slider-label {
  flex: 0 0 64px;
}

.toggle-row input {
  width: 18px;
  height: 18px;
  accent-color: var(--color-primary, #c98b6b);
}

.reset-btn {
  display: block;
  margin: 18px auto 0;
  padding: 8px 18px;
  border: 1px solid var(--color-border, #e6ddd3);
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-secondary, #777);
  font-size: 13px;
  cursor: pointer;
}
</style>
