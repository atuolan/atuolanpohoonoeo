<script setup lang="ts">
/**
 * 「小屋 › 常用 App」：換下面那一排放哪幾個 App、排順序。
 * 改了馬上存（不用按完成），最多 HOUSE_DOCK_MAX 個、至少留一個。
 */
import { ChevronDown, ChevronUp, Minus } from "lucide-vue-next";
import { computed } from "vue";
import HouseAppTile from "./HouseAppTile.vue";
import { HOUSE_APP_ICONS, houseAppIcons } from "./houseApps";
import { DEFAULT_HOUSE_DOCK, HOUSE_DOCK_MAX } from "./houseData";

const props = defineProps<{ open: boolean; apps: string[] }>();
const emit = defineEmits<{ close: []; change: [apps: string[]] }>();

const picked = computed(() => houseAppIcons(props.apps));
const others = computed(() => HOUSE_APP_ICONS.filter((a) => !props.apps.includes(a.app)));
const full = computed(() => props.apps.length >= HOUSE_DOCK_MAX);
const isDefault = computed(() => props.apps.join() === DEFAULT_HOUSE_DOCK.join());

function move(i: number, delta: number) {
  const j = i + delta;
  if (j < 0 || j >= props.apps.length) return;
  const next = [...props.apps];
  [next[i], next[j]] = [next[j], next[i]];
  emit("change", next);
}

function remove(app: string) {
  if (props.apps.length <= 1) return;
  emit("change", props.apps.filter((a) => a !== app));
}

function add(app: string) {
  if (full.value) return;
  emit("change", [...props.apps, app]);
}
</script>

<template>
  <Transition name="ph-sheet">
    <div v-if="open" class="ph-sheet-wrap" @click.self="emit('close')">
      <section class="ph-sheet" role="dialog" aria-label="常用 App">
        <header class="ph-sheet-head">
          <h2>常用 App</h2>
          <button class="ph-sheet-close" aria-label="關閉" @click="emit('close')">×</button>
        </header>

        <div class="ph-sheet-body">
          <div class="ph-sub-row">
            <h3 class="ph-sheet-sub">放在下面那一排（{{ picked.length }}/{{ HOUSE_DOCK_MAX }}）</h3>
            <button v-if="!isDefault" class="ph-reset" @click="emit('change', [...DEFAULT_HOUSE_DOCK])">恢復預設</button>
          </div>
          <ol class="ph-picked">
            <li v-for="(a, i) in picked" :key="a.app" class="ph-picked-row">
              <HouseAppTile :icon="a.icon" :color="a.color" size="sm" />
              <span class="ph-picked-name">{{ a.name }}</span>
              <button class="ph-mini" :disabled="i === 0" :aria-label="`${a.name}往前`" @click="move(i, -1)">
                <ChevronUp :size="18" :stroke-width="2.4" />
              </button>
              <button class="ph-mini" :disabled="i === picked.length - 1" :aria-label="`${a.name}往後`" @click="move(i, 1)">
                <ChevronDown :size="18" :stroke-width="2.4" />
              </button>
              <button class="ph-mini is-remove" :disabled="picked.length <= 1" :aria-label="`拿掉${a.name}`" @click="remove(a.app)">
                <Minus :size="18" :stroke-width="2.6" />
              </button>
            </li>
          </ol>

          <h3 class="ph-sheet-sub">可以放的 App</h3>
          <p class="ph-note">{{ full ? `放滿 ${HOUSE_DOCK_MAX} 個了，先從上面拿掉一個再換。` : "點一下加到最後面。" }}</p>
          <div class="ph-app-grid">
            <button v-for="a in others" :key="a.app" class="ph-app" :disabled="full" :aria-label="`加入${a.name}`" @click="add(a.app)">
              <HouseAppTile class="ph-icon" :icon="a.icon" :color="a.color" />
              <span class="ph-app-name">{{ a.name }}</span>
            </button>
          </div>
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
  padding: 0 16px 20px;
  -webkit-overflow-scrolling: touch;
}

.ph-sub-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ph-sheet-sub {
  margin: 16px 4px 8px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  opacity: 0.55;
}

.ph-reset {
  margin-top: 8px;
  padding: 4px 10px;
  border: 0;
  border-radius: 999px;
  background: rgba(59, 42, 38, 0.08);
  color: #3b2a26;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.ph-note {
  margin: -4px 4px 12px;
  font-size: 12px;
  opacity: 0.5;
}

/* 已經放的：一行一個，可以往前往後、拿掉 */
.ph-picked {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(59, 42, 38, 0.1);
}

.ph-picked-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 54px;
  padding: 0 10px 0 12px;
  border-bottom: 1px solid rgba(59, 42, 38, 0.08);
}

.ph-picked-row:last-child {
  border-bottom: 0;
}

.ph-picked-name {
  flex: 1;
  min-width: 0;
  margin-left: 6px;
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ph-mini {
  flex: none;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(59, 42, 38, 0.06);
  color: #3b2a26;
  cursor: pointer;
}

.ph-mini.is-remove {
  background: rgba(224, 83, 63, 0.12);
  color: #c4402e;
}

.ph-mini:disabled {
  opacity: 0.3;
  cursor: default;
}

.ph-app-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px 8px;
}

.ph-app {
  min-width: 0;
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

.ph-app:active:not(:disabled) .ph-icon {
  transform: scale(0.92);
}

.ph-app:disabled {
  opacity: 0.4;
  cursor: default;
}

.ph-app-name {
  max-width: 100%;
  color: #7a5c4e;
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

@media (prefers-reduced-motion: reduce) {
  .ph-sheet-enter-active,
  .ph-sheet-leave-active,
  .ph-sheet-enter-active .ph-sheet,
  .ph-sheet-leave-active .ph-sheet {
    transition: none;
  }
}
</style>
