<script setup lang="ts">
/** 轉盤裡的「全部 App」：所有 App、小屋的設定、還沒開放的家具功能 */
import { DOCK_APP_CATALOG } from "@/components/dock/dockApps";
import { COMING_SOON } from "./houseData";

defineProps<{
  open: boolean;
  badges: Record<string, number>;
}>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "pick", app: string): void;
  (e: "edit-layout"): void;
  (e: "wardrobe"): void;
  (e: "global-theme"): void;
  (e: "back-to-canvas"): void;
}>();

function badgeText(n: number): string {
  return n > 99 ? "99+" : String(n);
}
</script>

<template>
  <Transition name="ph-sheet">
    <div v-if="open" class="ph-sheet-wrap" @click.self="emit('close')">
      <section class="ph-sheet" role="dialog" aria-label="全部 App">
        <header class="ph-sheet-head">
          <h2>全部 App</h2>
          <button class="ph-sheet-close" aria-label="關閉" @click="emit('close')">×</button>
        </header>

        <div class="ph-sheet-body">
          <div class="ph-app-grid">
            <button
              v-for="app in DOCK_APP_CATALOG"
              :key="app.id"
              class="ph-app"
              :aria-label="app.label + (badges[app.id] ? `，${badges[app.id]} 則未讀` : '')"
              @click="emit('pick', app.id)"
            >
              <span class="ph-app-icon">
                <component :is="app.icon" :size="22" :stroke-width="2.4" />
                <span v-if="badges[app.id]" class="ph-app-badge" aria-hidden="true">{{ badgeText(badges[app.id]) }}</span>
              </span>
              <span class="ph-app-name">{{ app.label }}</span>
            </button>
          </div>

          <h3 class="ph-sheet-sub">小屋</h3>
          <div class="ph-row-list">
            <button class="ph-row" @click="emit('wardrobe')">
              <span>換外觀</span><span class="ph-row-note">也可以點浴室的鏡子</span>
            </button>
            <button class="ph-row" @click="emit('edit-layout')">
              <span>移動家具</span><span class="ph-row-note">也可以長按房間</span>
            </button>
            <button class="ph-row" @click="emit('global-theme')">
              <span>全局美化</span>
            </button>
            <button class="ph-row" @click="emit('back-to-canvas')">
              <span>切回畫布主頁</span><span class="ph-row-note">設定 › 主頁 可以再換回來</span>
            </button>
          </div>

          <h3 class="ph-sheet-sub">還沒開放</h3>
          <ul class="ph-soon">
            <li v-for="s in COMING_SOON" :key="s.label">
              <span>{{ s.label }}</span><span class="ph-row-note">{{ s.where }}</span>
            </li>
          </ul>
        </div>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.ph-sheet-wrap {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(43, 30, 27, 0.45);
}

.ph-sheet {
  width: min(100%, 460px);
  max-height: 78%;
  display: flex;
  flex-direction: column;
  background: #fbf7ee;
  border: 3px solid #3b2a26;
  border-bottom: 0;
  box-shadow: 0 -3px 0 rgba(43, 30, 27, 0.25);
  color: #3b2a26;
  padding-bottom: env(safe-area-inset-bottom);
}

.ph-sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 8px 16px;
  border-bottom: 3px solid #3b2a26;
}

.ph-sheet-head h2 {
  margin: 0;
  font-size: 18px;
  font-weight: normal;
}

.ph-sheet-close {
  width: 36px;
  height: 36px;
  border: 3px solid #3b2a26;
  background: #fbf7ee;
  color: #3b2a26;
  font-family: inherit;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.ph-sheet-body {
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
  padding: 12px 14px 18px;
  -webkit-overflow-scrolling: touch;
}

.ph-app-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px 8px;
}

.ph-app {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #3b2a26;
  font-family: inherit;
  cursor: pointer;
}

.ph-app-icon {
  position: relative;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: 3px solid #3b2a26;
  background: #f3d98b;
  box-shadow:
    inset 3px 3px 0 rgba(255, 255, 255, 0.5),
    inset -3px -3px 0 rgba(59, 42, 38, 0.18),
    3px 3px 0 rgba(43, 30, 27, 0.3);
}

.ph-app:nth-child(5n + 2) .ph-app-icon { background: #9ed3a5; }
.ph-app:nth-child(5n + 3) .ph-app-icon { background: #9cc7e6; }
.ph-app:nth-child(5n + 4) .ph-app-icon { background: #f4a9b8; }
.ph-app:nth-child(5n + 5) .ph-app-icon { background: #c9a7e0; }

.ph-app-badge {
  position: absolute;
  right: -10px;
  top: -10px;
  min-width: 20px;
  height: 20px;
  box-sizing: border-box;
  padding: 0 3px;
  background: #d9453a;
  border: 3px solid #3b2a26;
  color: #fbf7ee;
  font-size: 11px;
  line-height: 14px;
  text-align: center;
}

.ph-app-name {
  font-size: 13px;
  line-height: 16px;
  white-space: nowrap;
}

.ph-sheet-sub {
  margin: 20px 0 8px;
  font-size: 14px;
  font-weight: normal;
  opacity: 0.7;
}

.ph-row-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ph-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 44px;
  padding: 0 12px;
  border: 3px solid #3b2a26;
  background: #fff;
  color: #3b2a26;
  font-family: inherit;
  font-size: 15px;
  text-align: left;
  cursor: pointer;
  box-shadow: 3px 3px 0 rgba(59, 42, 38, 0.25);
}

.ph-row-note {
  font-size: 12px;
  opacity: 0.6;
}

.ph-soon {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ph-soon li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border: 2px dashed rgba(59, 42, 38, 0.4);
  font-size: 14px;
  opacity: 0.75;
}

.ph-sheet-enter-active,
.ph-sheet-leave-active {
  transition: opacity 220ms ease;
}

.ph-sheet-enter-active .ph-sheet,
.ph-sheet-leave-active .ph-sheet {
  transition: transform 260ms cubic-bezier(0.3, 0.9, 0.3, 1);
}

.ph-sheet-enter-from,
.ph-sheet-leave-to {
  opacity: 0;
}

.ph-sheet-enter-from .ph-sheet,
.ph-sheet-leave-to .ph-sheet {
  transform: translateY(40px);
}
</style>
