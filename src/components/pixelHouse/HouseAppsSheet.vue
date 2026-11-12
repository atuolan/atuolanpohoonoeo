<script setup lang="ts">
/**
 * 下面那一排打開的面板，兩種：
 * - apps：「全部 App」——所有 App、還沒開放的家具功能
 * - house：「小屋」——換外觀、擺件商店、移動家具、怎麼玩、全局美化、切回畫布，小屋自己的功能都在這一個地方
 */
import { DOCK_APP_CATALOG } from "@/components/dock/dockApps";
import { COMING_SOON } from "./houseData";

defineProps<{
  open: boolean;
  mode: "apps" | "house";
  badges: Record<string, number>;
}>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "pick", app: string): void;
  (e: "edit-layout"): void;
  (e: "wardrobe"): void;
  (e: "decor"): void;
  (e: "global-theme"): void;
  (e: "back-to-canvas"): void;
  (e: "guide"): void;
}>();

function badgeText(n: number): string {
  return n > 99 ? "99+" : String(n);
}
</script>

<template>
  <Transition name="ph-sheet">
    <div v-if="open" class="ph-sheet-wrap" @click.self="emit('close')">
      <section class="ph-sheet" role="dialog" :aria-label="mode === 'house' ? '小屋' : '全部 App'">
        <header class="ph-sheet-head">
          <h2>{{ mode === "house" ? "小屋" : "全部 App" }}</h2>
          <button class="ph-sheet-close" aria-label="關閉" @click="emit('close')">×</button>
        </header>

        <div class="ph-sheet-body">
          <div v-if="mode === 'apps'" class="ph-app-grid">
            <button
              v-for="app in DOCK_APP_CATALOG"
              :key="app.id"
              class="ph-app"
              :aria-label="app.label + (badges[app.id] ? `，${badges[app.id]} 則未讀` : '')"
              @click="emit('pick', app.id)"
            >
              <span class="ph-app-icon">
                <component :is="app.icon" :size="24" :stroke-width="2" />
                <span v-if="badges[app.id]" class="ph-app-badge" aria-hidden="true">{{ badgeText(badges[app.id]) }}</span>
              </span>
              <span class="ph-app-name">{{ app.label }}</span>
            </button>
          </div>

          <div v-if="mode === 'house'" class="ph-row-list">
            <button class="ph-row" @click="emit('wardrobe')">
              <span>換外觀</span><span class="ph-row-note">髮型、衣服；也可以點浴室的鏡子</span>
            </button>
            <button class="ph-row" @click="emit('decor')">
              <span>擺件商店</span><span class="ph-row-note">買新的擺件、幫家具換款式</span>
            </button>
            <button class="ph-row" @click="emit('edit-layout')">
              <span>移動家具</span><span class="ph-row-note">也可以長按房間</span>
            </button>
            <button class="ph-row" @click="emit('guide')">
              <span>小屋怎麼玩</span><span class="ph-row-note">哪裡可以點、怎麼換裝、怎麼佈置</span>
            </button>
            <button class="ph-row" @click="emit('global-theme')">
              <span>全局美化</span>
            </button>
            <button class="ph-row" @click="emit('back-to-canvas')">
              <span>切回畫布主頁</span><span class="ph-row-note">設定 › 主頁 可以再換回來</span>
            </button>
          </div>

          <h3 v-if="mode === 'apps'" class="ph-sheet-sub">還沒開放</h3>
          <ul v-if="mode === 'apps'" class="ph-soon">
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
  background: rgba(30, 20, 18, 0.4);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
}

.ph-sheet {
  position: relative;
  width: min(100%, 480px);
  max-height: 80%;
  display: flex;
  flex-direction: column;
  background: #fffbf5;
  border-radius: 24px 24px 0 0;
  box-shadow: 0 -10px 40px rgba(30, 20, 18, 0.25);
  color: #3b2a26;
  padding-bottom: env(safe-area-inset-bottom);
}

.ph-sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 14px 8px 20px;
}

.ph-sheet-head h2 {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
}

.ph-sheet-close {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  background: rgba(59, 42, 38, 0.08);
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
  padding: 8px 16px 20px;
  -webkit-overflow-scrolling: touch;
}

.ph-app-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px 8px;
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
  width: 54px;
  height: 54px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border-radius: 16px;
  background: linear-gradient(160deg, #f8e3a3, #efc96c);
  color: #3b2a26;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.6),
    0 4px 10px rgba(59, 42, 38, 0.14);
}

.ph-app:nth-child(5n + 2) .ph-app-icon { background: linear-gradient(160deg, #c3e8c8, #93cc9c); }
.ph-app:nth-child(5n + 3) .ph-app-icon { background: linear-gradient(160deg, #c6e1f4, #92bfe2); }
.ph-app:nth-child(5n + 4) .ph-app-icon { background: linear-gradient(160deg, #f9cdd6, #f0a2b2); }
.ph-app:nth-child(5n + 5) .ph-app-icon { background: linear-gradient(160deg, #e2cdf0, #c3a0dc); }

.ph-row:last-child,
.ph-soon li:last-child {
  border-bottom: 0;
}

.ph-row:active {
  background: rgba(59, 42, 38, 0.05);
}

/* 上面的小把手 */
.ph-sheet::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 7px;
  width: 38px;
  height: 5px;
  margin-left: -19px;
  border-radius: 999px;
  background: rgba(59, 42, 38, 0.18);
}

.ph-app-badge {
  position: absolute;
  right: -6px;
  top: -6px;
  min-width: 20px;
  height: 20px;
  box-sizing: border-box;
  padding: 0 5px;
  border-radius: 999px;
  background: #e0533f;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 20px;
  text-align: center;
  box-shadow: 0 0 0 2px #fffbf5;
}

.ph-app-name {
  font-size: 12px;
  line-height: 16px;
  white-space: nowrap;
}

.ph-sheet-sub {
  margin: 24px 4px 8px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  opacity: 0.55;
}

.ph-row-list {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(59, 42, 38, 0.1);
}

.ph-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 50px;
  padding: 0 16px;
  border: 0;
  border-bottom: 1px solid rgba(59, 42, 38, 0.08);
  background: transparent;
  color: #3b2a26;
  font-family: inherit;
  font-size: 15px;
  text-align: left;
  cursor: pointer;
}

.ph-row-note {
  font-size: 12px;
  opacity: 0.5;
}

.ph-soon {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 16px;
  background: rgba(59, 42, 38, 0.04);
}

.ph-soon li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 11px 16px;
  border-bottom: 1px solid rgba(59, 42, 38, 0.06);
  font-size: 14px;
  opacity: 0.7;
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
