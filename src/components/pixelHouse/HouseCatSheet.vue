<script setup lang="ts">
/**
 * 貓的面板：還沒養 → 領養（選花色、取名字）；養了 → 看三個數值，摸、逗、餵、洗、改名。
 * 數值是打開面板、照顧完才重算的（不是每秒更新）。
 */
import { computed, ref, watch } from "vue";
import {
  CAT_ART,
  CAT_COLORS,
  CAT_COLOR_IDS,
  CAT_FEED_COINS,
  CAT_NAME_MAX,
  CAT_STAT_NAMES,
  type CatCare,
  type CatColor,
  type CatState,
  type CatStatKey,
} from "./houseCat";
import { pixelSvg } from "./pixelArt";

const props = defineProps<{
  open: boolean;
  cat: CatState | null;
  levels: Record<CatStatKey, number>;
  listless: boolean;
  /** 照顧沒做成的原因（很飽、很乾淨、金幣不夠） */
  message: string;
}>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "adopt", name: string, color: CatColor): void;
  (e: "care", kind: CatCare): void;
  (e: "rename", name: string): void;
}>();

const color = ref<CatColor>("orange");
const name = ref("");
const renaming = ref(false);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    renaming.value = false;
    name.value = props.cat?.name ?? "";
  },
);

const previews = CAT_COLOR_IDS.map((id) => ({ id, name: CAT_COLORS[id].name, src: pixelSvg(CAT_ART.sit, CAT_COLORS[id].palette) }));
const portrait = computed(() => (props.cat ? pixelSvg(CAT_ART[props.listless ? "sleep" : "sit"], CAT_COLORS[props.cat.color].palette) : ""));
const stats = computed(() => (Object.keys(CAT_STAT_NAMES) as CatStatKey[]).map((k) => ({ key: k, name: CAT_STAT_NAMES[k], value: props.levels[k] })));

function saveName() {
  const next = name.value.trim();
  if (next) emit("rename", next);
  renaming.value = false;
}
</script>

<template>
  <div v-if="open" class="cs-wrap" @click.self="emit('close')">
    <!-- 領養 -->
    <section v-if="!cat" class="cs-card" role="dialog" aria-label="領養一隻貓">
      <h2 class="cs-title">領養一隻貓</h2>
      <p class="cs-note">第一隻免費。牠會在屋裡走來走去、找地方睡覺，偶爾去蹭人。</p>
      <div class="cs-colors" role="radiogroup" aria-label="花色">
        <button
          v-for="p in previews"
          :key="p.id"
          class="cs-color"
          :class="{ 'is-on': color === p.id }"
          role="radio"
          :aria-checked="color === p.id"
          @click="color = p.id"
        >
          <img :src="p.src" alt="" draggable="false" />
          <span>{{ p.name }}</span>
        </button>
      </div>
      <label class="cs-field">
        <span>名字</span>
        <input v-model="name" type="text" :maxlength="CAT_NAME_MAX" :placeholder="CAT_COLORS[color].name" />
      </label>
      <button class="cs-btn is-main" @click="emit('adopt', name, color)">帶牠回家</button>
      <button class="cs-btn is-cancel" @click="emit('close')">再想想</button>
    </section>

    <!-- 照顧 -->
    <section v-else class="cs-card" role="dialog" :aria-label="cat.name">
      <div class="cs-head">
        <img class="cs-portrait" :src="portrait" alt="" draggable="false" />
        <div class="cs-name">
          <template v-if="renaming">
            <input v-model="name" type="text" :maxlength="CAT_NAME_MAX" aria-label="名字" @keyup.enter="saveName" />
            <button class="cs-mini" @click="saveName">好</button>
          </template>
          <template v-else>
            <strong>{{ cat.name }}</strong>
            <button class="cs-mini" @click="renaming = true">改名</button>
          </template>
        </div>
      </div>

      <div v-for="s in stats" :key="s.key" class="cs-stat">
        <span class="cs-stat-name">{{ s.name }}</span>
        <div class="cs-bar" role="progressbar" :aria-label="s.name" :aria-valuenow="s.value" aria-valuemin="0" aria-valuemax="100">
          <i :class="{ 'is-low': s.value < 20 }" :style="{ width: `${s.value}%` }"></i>
        </div>
        <span class="cs-stat-num">{{ s.value }}</span>
      </div>

      <p class="cs-note" role="status">
        {{ message || (listless ? `${cat.name}沒精神，餵牠、陪牠玩一下就好了。` : "不照顧牠也不會跑掉，只是會沒精神。") }}
      </p>

      <div class="cs-actions">
        <button class="cs-btn" @click="emit('care', 'pet')">摸摸</button>
        <button class="cs-btn" @click="emit('care', 'play')">逗牠玩</button>
        <button class="cs-btn" @click="emit('care', 'feed')">餵飼料<small>{{ CAT_FEED_COINS }} 金幣</small></button>
        <button class="cs-btn" @click="emit('care', 'wash')">洗澡</button>
      </div>
      <button class="cs-btn is-cancel" @click="emit('close')">關閉</button>
    </section>
  </div>
</template>

<style scoped>
.cs-wrap {
  position: absolute;
  inset: 0;
  z-index: 25;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(30, 20, 18, 0.4);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
}

.cs-card button {
  -webkit-tap-highlight-color: transparent;
}

.cs-card {
  width: 100%;
  max-width: 300px;
  max-height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 16px 12px;
  border-radius: 20px;
  background: #fffbf5;
  color: #3b2a26;
  box-shadow: 0 16px 40px rgba(30, 20, 18, 0.28);
}

.cs-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  text-align: center;
}

.cs-note {
  margin: 0;
  min-height: 36px;
  font-size: 13px;
  line-height: 18px;
  color: rgba(59, 42, 38, 0.72);
}

.cs-colors {
  display: flex;
  gap: 8px;
}

.cs-color {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px 6px;
  border: 2px solid transparent;
  border-radius: 14px;
  background: #f4ead8;
  color: inherit;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}

.cs-color.is-on {
  border-color: #e8a33d;
  background: #fff1c9;
}

.cs-color img,
.cs-portrait {
  width: 72px;
  height: 48px;
  image-rendering: crisp-edges;
  image-rendering: pixelated;
  -webkit-user-drag: none;
}

.cs-field {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}

.cs-field input,
.cs-name input {
  flex: 1;
  min-width: 0;
  height: 40px;
  padding: 0 12px;
  border: 1px solid rgba(59, 42, 38, 0.22);
  border-radius: 10px;
  background: #fff;
  color: inherit;
  font-family: inherit;
  /* 16px 以上：iOS 點輸入框時畫面不會自己放大 */
  font-size: 16px;
}

.cs-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cs-name {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
}

.cs-name strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.cs-mini {
  flex: none;
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: #f4ead8;
  color: inherit;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}

.cs-stat {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.cs-stat-name {
  width: 36px;
}

.cs-stat-num {
  width: 26px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.cs-bar {
  flex: 1;
  height: 10px;
  border-radius: 999px;
  background: #efe4d0;
  overflow: hidden;
}

.cs-bar i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: #8cc79a;
}

.cs-bar i.is-low {
  background: #e58a7a;
}

.cs-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.cs-btn {
  min-height: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 12px;
  background: #f6e2b5;
  color: #3b2a26;
  font-family: inherit;
  font-size: 15px;
  font-weight: 500;
  line-height: 1.2;
  cursor: pointer;
}

.cs-btn small {
  font-size: 11px;
  font-weight: 400;
  opacity: 0.7;
}

.cs-btn.is-main {
  background: #e8a33d;
  font-weight: 600;
}

.cs-btn.is-cancel {
  background: transparent;
  color: rgba(59, 42, 38, 0.6);
}
</style>
