<script setup lang="ts">
/** 右上的像素轉盤：點了 App 像波浪一樣彈出、排成一直排 */
import { computed } from "vue";
import { DIAL_APPS, INK } from "./houseData";
import { dialSvg, glyphSvg } from "./pixelArt";

const props = defineProps<{
  open: boolean;
  badges: Record<string, number>;
}>();
const emit = defineEmits<{
  (e: "toggle"): void;
  (e: "close"): void;
  (e: "pick", app: string): void;
}>();

const dialImg = dialSvg();
const icons = DIAL_APPS.map((a) => glyphSvg(a.glyph, INK));

function badgeText(n: number): string {
  return n > 99 ? "99+" : String(n);
}

const items = computed(() => {
  const n = DIAL_APPS.length;
  return DIAL_APPS.map((a, i) => {
    const badge = props.badges[a.app] || 0;
    // 打開時從上往下一顆顆彈出；收起時從下往上一顆顆收回
    const delay = props.open ? i * 70 : (n - 1 - i) * 22;
    // 收起時縮回轉盤中心（轉盤中心在這一排正上方）
    const dy = -(i * 58 + 58);
    return {
      ...a,
      icon: icons[i],
      badge,
      style: {
        top: `${i * 58}px`,
        opacity: props.open ? 1 : 0,
        transform: props.open ? "translate(0, 0) scale(1)" : `translate(0, ${dy}px) scale(0.2)`,
        transition: props.open
          ? `transform 460ms cubic-bezier(.34,1.4,.64,1) ${delay}ms, opacity 160ms linear ${delay}ms`
          : `transform 240ms cubic-bezier(.5,0,.9,.4) ${delay}ms, opacity 200ms linear ${delay}ms`,
      },
      swayStyle: {
        // 彈出時左右甩、一次比一次小；每顆晚一點開始，整排像一道波浪慢慢拉直
        animation: props.open
          ? `ph-wave-in 900ms ease-out ${delay + 40}ms both`
          : `ph-wave-out 260ms ease-in ${delay}ms both`,
      },
    };
  });
});

const total = computed(() => DIAL_APPS.reduce((s, a) => s + (props.badges[a.app] || 0), 0));
</script>

<template>
  <div class="ph-dial-root">
    <!-- 暗幕 -->
    <div
      class="ph-dial-dim"
      :class="{ 'is-open': open }"
      aria-hidden="true"
      @click="emit('close')"
    ></div>

    <div class="ph-dial-list" :class="{ 'is-open': open }">
      <div v-for="it in items" :key="it.key" class="ph-dial-item" :style="it.style">
        <div class="ph-dial-sway" :style="it.swayStyle">
          <button
            class="ph-dial-app"
            :style="{ background: it.bg }"
            :tabindex="open ? 0 : -1"
            :aria-label="it.name + (it.badge ? `，${it.badge} 則未讀` : '')"
            @click="emit('pick', it.app)"
          >
            <img :src="it.icon" alt="" width="36" height="36" />
          </button>
          <div class="ph-dial-label" aria-hidden="true">{{ it.name }}</div>
          <div v-if="it.badge" class="ph-badge ph-dial-badge" aria-hidden="true">{{ badgeText(it.badge) }}</div>
        </div>
      </div>
    </div>

    <button
      class="ph-dial-btn"
      :aria-label="open ? '收起 App 選單' : '打開 App 選單' + (total ? `，${total} 則未讀` : '')"
      :aria-expanded="open ? 'true' : 'false'"
      @click="emit('toggle')"
    >
      <img :src="dialImg" alt="" width="52" height="52" :style="{ transform: `rotate(${open ? 90 : 0}deg)` }" />
      <span v-if="!open && total" class="ph-badge ph-dial-btn-badge" aria-hidden="true">{{ badgeText(total) }}</span>
    </button>
  </div>
</template>

<style scoped>
.ph-dial-root {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.ph-dial-dim {
  position: absolute;
  inset: 0;
  background: rgba(30, 20, 18, 0.38);
  opacity: 0;
  transition: opacity 260ms ease;
  pointer-events: none;
}

.ph-dial-dim.is-open {
  opacity: 1;
  pointer-events: auto;
}

.ph-dial-list {
  position: absolute;
  right: 12px;
  top: calc(var(--ph-top) + 64px);
  width: 52px;
}

.ph-dial-item {
  position: absolute;
  left: 0;
  width: 52px;
  height: 52px;
}

.ph-dial-sway {
  position: relative;
  width: 52px;
  height: 52px;
}

.ph-dial-app {
  position: absolute;
  inset: 0;
  padding: 0;
  box-sizing: border-box;
  border: 0;
  border-radius: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.55),
    0 6px 16px rgba(30, 20, 18, 0.22),
    0 1px 3px rgba(30, 20, 18, 0.18);
}

.ph-dial-list.is-open .ph-dial-app {
  pointer-events: auto;
}

.ph-dial-app img {
  display: block;
  width: 36px;
  height: 36px;
  image-rendering: pixelated;
}

.ph-dial-label {
  position: absolute;
  right: 62px;
  top: 14px;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(255, 251, 245, 0.95);
  color: #3b2a26;
  font-size: 14px;
  font-weight: 500;
  line-height: 18px;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(30, 20, 18, 0.2);
}

.ph-dial-badge {
  left: 38px;
  top: -8px;
}

.ph-dial-btn {
  position: absolute;
  right: 10px;
  top: calc(var(--ph-top) - 4px);
  width: 56px;
  height: 56px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
}

.ph-dial-btn img {
  position: absolute;
  left: 2px;
  top: 2px;
  width: 52px;
  height: 52px;
  image-rendering: pixelated;
  transition: transform 520ms cubic-bezier(0.34, 1.56, 0.64, 1);
  filter: drop-shadow(0 4px 8px rgba(30, 20, 18, 0.3));
}

.ph-dial-btn-badge {
  left: 38px;
  top: -4px;
}

.ph-badge {
  position: absolute;
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
  pointer-events: none;
  box-shadow: 0 0 0 2px #fff;
}
</style>

<style>
@keyframes ph-wave-in {
  0% { transform: translateX(-34px); }
  22% { transform: translateX(9px); }
  44% { transform: translateX(-16px); }
  66% { transform: translateX(5px); }
  84% { transform: translateX(-3px); }
  100% { transform: translateX(0); }
}

@keyframes ph-wave-out {
  0% { transform: translateX(0); }
  45% { transform: translateX(8px); }
  100% { transform: translateX(-18px); }
}
</style>
