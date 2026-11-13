<script setup lang="ts">
/**
 * 下面那一排：常用 App（「小屋 › 常用 App」可以換）、「小屋」、「全部 App」。
 * 平常收成右下角一顆小按鈕（不擋房間），點了才展開；展開後最右邊的箭頭收回去。開著還是收著會記住。
 * 不用記哪件家具是哪個 App；小屋的功能（換外觀、擺件商店、移動家具、怎麼玩）都從「小屋」進去。
 */
import { computed } from "vue";
import { Home, LayoutGrid } from "lucide-vue-next";
import HouseAppTile from "./HouseAppTile.vue";
import { houseAppIcons, tileColors } from "./houseApps";
import { ALL_BUTTON_COLOR, HOUSE_BUTTON_COLOR } from "./houseData";

/** apps：放哪幾個常用 App（App.vue handleNavigate 的 id），照順序 */
const props = defineProps<{ open: boolean; apps: string[]; badges: Record<string, number> }>();
const emit = defineEmits<{
  (e: "pick", app: string): void;
  (e: "house"): void;
  (e: "all"): void;
  (e: "toggle"): void;
}>();

/** 收起來的小按鈕上那個圖示的顏色 */
const fabInk = tileColors(ALL_BUTTON_COLOR).ink;

const apps = computed(() => houseAppIcons(props.apps).map((a) => ({ ...a, badge: props.badges[a.app] || 0 })));

/** 收起來時小按鈕上的未讀數：那一排 App 的加起來 */
const total = computed(() => apps.value.reduce((n, a) => n + a.badge, 0));

function badgeText(n: number): string {
  return n > 99 ? "99+" : String(n);
}
</script>

<template>
  <button v-if="!open" class="ph-dock-fab" :aria-label="'打開常用 App' + (total ? `，${total} 則未讀` : '')" aria-expanded="false" @click="emit('toggle')">
    <LayoutGrid :size="22" :stroke-width="2.3" :color="fabInk" fill="currentColor" fill-opacity="0.25" aria-hidden="true" />
    <span v-if="total" class="ph-dock-badge" aria-hidden="true">{{ badgeText(total) }}</span>
  </button>
  <nav v-else class="ph-dock" aria-label="常用 App">
    <button
      v-for="a in apps"
      :key="a.app"
      class="ph-dock-btn"
      :aria-label="a.name + (a.badge ? `，${a.badge} 則未讀` : '')"
      @click="emit('pick', a.app)"
    >
      <HouseAppTile class="ph-dock-icon" :icon="a.icon" :color="a.color" size="md">
        <span v-if="a.badge" class="ph-dock-badge" aria-hidden="true">{{ badgeText(a.badge) }}</span>
      </HouseAppTile>
      <span class="ph-dock-name">{{ a.name }}</span>
    </button>
    <span class="ph-dock-sep" aria-hidden="true"></span>
    <button class="ph-dock-btn" aria-label="小屋：換外觀、擺件商店、移動家具、怎麼玩" @click="emit('house')">
      <HouseAppTile class="ph-dock-icon" :icon="Home" :color="HOUSE_BUTTON_COLOR" size="md" />
      <span class="ph-dock-name">小屋</span>
    </button>
    <button class="ph-dock-btn" aria-label="全部 App" @click="emit('all')">
      <HouseAppTile class="ph-dock-icon" :icon="LayoutGrid" :color="ALL_BUTTON_COLOR" size="md" />
      <span class="ph-dock-name">全部</span>
    </button>
    <button class="ph-dock-hide" aria-label="收起常用 App" aria-expanded="true" @click="emit('toggle')">
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
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
  padding: 8px 4px 6px 8px;
  border-radius: 24px;
  background: var(--ui-glass);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  box-shadow: var(--ui-shadow);
}

/* 收起來：右下角一顆小按鈕 */
.ph-dock-fab {
  position: absolute;
  right: 12px;
  bottom: var(--ph-bottom);
  width: 46px;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--ui-glass);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  box-shadow: var(--ui-shadow);
  cursor: pointer;
}

.ph-dock-fab .ph-dock-badge {
  right: -3px;
  top: -3px;
}

.ph-dock-hide {
  flex: none;
  align-self: stretch;
  width: 30px;
  margin-left: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-left: 1px solid rgba(59, 42, 38, 0.16);
  background: transparent;
  color: rgba(59, 42, 38, 0.6);
  cursor: pointer;
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

.ph-dock-name {
  max-width: 100%;
  color: #7a5c4e;
  font-size: 11px;
  font-weight: 500;
  line-height: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ph-dock-sep {
  flex: none;
  width: 0;
  height: 34px;
  margin: 0 2px;
  border-left: 2px dotted rgba(122, 92, 78, 0.28);
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
</style>
