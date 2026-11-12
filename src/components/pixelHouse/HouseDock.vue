<script setup lang="ts">
/**
 * 下面那一排：固定的常用 App、「小屋」、「全部 App」。
 * 不用記哪件家具是哪個 App；小屋的功能（換外觀、擺件商店、移動家具、怎麼玩）都從「小屋」進去。
 */
import { computed } from "vue";
import { DIAL_APPS, DOCK_APP_KEYS, HOUSE_GLYPH, INK } from "./houseData";
import { glyphSvg } from "./pixelArt";

const props = defineProps<{ badges: Record<string, number> }>();
const emit = defineEmits<{
  (e: "pick", app: string): void;
  (e: "house"): void;
  (e: "all"): void;
}>();

const ALL = DIAL_APPS.find((a) => a.app === "__all__");
const appDefs = DOCK_APP_KEYS.map((k) => DIAL_APPS.find((a) => a.key === k)).filter((a): a is (typeof DIAL_APPS)[number] => !!a);
const appIcons = appDefs.map((a) => glyphSvg(a.glyph, INK));
const houseIcon = glyphSvg(HOUSE_GLYPH, INK);
const allIcon = ALL ? glyphSvg(ALL.glyph, INK) : "";

const apps = computed(() => appDefs.map((a, i) => ({ ...a, icon: appIcons[i], badge: props.badges[a.app] || 0 })));

function badgeText(n: number): string {
  return n > 99 ? "99+" : String(n);
}
</script>

<template>
  <nav class="ph-dock" aria-label="常用 App">
    <button
      v-for="a in apps"
      :key="a.key"
      class="ph-dock-btn"
      :aria-label="a.name + (a.badge ? `，${a.badge} 則未讀` : '')"
      @click="emit('pick', a.app)"
    >
      <span class="ph-dock-icon" :style="{ background: a.bg }">
        <img :src="a.icon" alt="" />
        <span v-if="a.badge" class="ph-dock-badge" aria-hidden="true">{{ badgeText(a.badge) }}</span>
      </span>
      <span class="ph-dock-name">{{ a.name }}</span>
    </button>
    <span class="ph-dock-sep" aria-hidden="true"></span>
    <button class="ph-dock-btn" aria-label="小屋：換外觀、擺件商店、移動家具、怎麼玩" @click="emit('house')">
      <span class="ph-dock-icon" style="background: #f6c98a"><img :src="houseIcon" alt="" /></span>
      <span class="ph-dock-name">小屋</span>
    </button>
    <button class="ph-dock-btn" aria-label="全部 App" @click="emit('all')">
      <span class="ph-dock-icon" style="background: #d8cfc0"><img :src="allIcon" alt="" /></span>
      <span class="ph-dock-name">全部</span>
    </button>
  </nav>
</template>

<style scoped>
.ph-dock {
  position: absolute;
  left: 50%;
  bottom: var(--ph-bottom);
  transform: translateX(-50%);
  width: min(400px, calc(100% - 16px));
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px 6px;
  border-radius: 24px;
  background: var(--ui-glass);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  box-shadow: var(--ui-shadow);
}

.ph-dock-btn {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-ink);
  font-family: inherit;
  cursor: pointer;
}

.ph-dock-btn:active .ph-dock-icon {
  transform: scale(0.92);
}

.ph-dock-icon {
  position: relative;
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 13px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.55),
    0 3px 8px rgba(30, 20, 18, 0.16);
  transition: transform 120ms ease;
}

.ph-dock-icon img {
  display: block;
  width: 27px;
  height: 27px;
  image-rendering: pixelated;
}

.ph-dock-name {
  max-width: 100%;
  font-size: 11px;
  font-weight: 600;
  line-height: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ph-dock-sep {
  flex: none;
  width: 1px;
  height: 34px;
  margin: 0 2px;
  background: rgba(59, 42, 38, 0.16);
}

.ph-dock-badge {
  position: absolute;
  right: -6px;
  top: -6px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  box-sizing: border-box;
  border-radius: 999px;
  background: #e0533f;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .ph-dock-icon {
    transition: none;
  }
}
</style>
