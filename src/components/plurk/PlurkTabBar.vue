<script setup lang="ts">
/** 噗浪底部分頁列：河道／廣場／通知／我 */
import { Bell, Compass } from "lucide-vue-next";
import PlurkAvatar from "@/components/plurk/PlurkAvatar.vue";
import type { PlurkTabId } from "@/components/plurk/types";

const props = withDefaults(
  defineProps<{
    tabs: Array<{ id: PlurkTabId; label: string }>;
    active: PlurkTabId;
    noticeCount: number;
    meAvatar?: string;
    meName: string;
  }>(),
  {
    noticeCount: 0,
    meAvatar: undefined,
    meName: "我",
  },
);

const emit = defineEmits<{
  select: [id: PlurkTabId];
}>();

function badgeText(count: number): string {
  return count > 99 ? "99+" : String(count);
}
</script>

<template>
  <nav
    class="plurk-tabbar"
    aria-label="主選單"
    :style="{ gridTemplateColumns: `repeat(${props.tabs.length}, minmax(0, 1fr))` }"
  >
    <button
      v-for="tab in props.tabs"
      :key="tab.id"
      type="button"
      class="tab"
      :class="{ 'tab--on': tab.id === props.active }"
      :aria-current="tab.id === props.active ? 'page' : undefined"
      :aria-label="
        tab.id === 'notice' && props.noticeCount > 0
          ? `通知，${props.noticeCount} 則未讀`
          : undefined
      "
      @click="emit('select', tab.id)"
    >
      <span class="tab-mark" aria-hidden="true"></span>

      <svg
        v-if="tab.id === 'river'"
        class="tab-icon"
        width="23"
        height="23"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        :stroke-width="tab.id === props.active ? 2 : 1.8"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M2 9q2.5-3 5 0t5 0 5 0 5 0"></path>
        <path d="M2 15q2.5-3 5 0t5 0 5 0 5 0"></path>
      </svg>

      <Compass
        v-else-if="tab.id === 'square'"
        class="tab-icon"
        :size="23"
        :stroke-width="tab.id === props.active ? 2 : 1.8"
        aria-hidden="true"
      />

      <Bell
        v-else-if="tab.id === 'notice'"
        class="tab-icon"
        :size="23"
        :stroke-width="tab.id === props.active ? 2 : 1.8"
        aria-hidden="true"
      />

      <PlurkAvatar
        v-else
        class="tab-me"
        :src="props.meAvatar"
        :name="props.meName"
        :size="23"
      />

      <span class="tab-label">{{ tab.label }}</span>

      <span
        v-if="tab.id === 'notice' && props.noticeCount > 0"
        class="tab-badge"
        aria-hidden="true"
      >
        {{ badgeText(props.noticeCount) }}
      </span>
    </button>
  </nav>
</template>

<style scoped lang="scss">
@use "@/components/plurk/plurk-theme.scss" as *;

.plurk-tabbar {
  flex: 0 0 auto;
  width: 100%;
  height: calc(84px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
  box-sizing: border-box;
  padding-bottom: calc(24px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.tab {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-width: 0;
  min-height: $plurk-touch;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: 11px;
  font-weight: 400;
  line-height: 1.2;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.tab--on {
  color: var(--color-text);
  font-weight: 700;
}

.tab-mark {
  position: absolute;
  top: 0;
  width: 24px;
  height: 3px;
  border-radius: 0 0 3px 3px;
  background: transparent;
}

.tab--on .tab-mark {
  background: var(--color-primary);
}

.tab-icon {
  flex: 0 0 auto;
  color: currentColor;
}

.tab-me {
  flex: 0 0 auto;
}

.tab-label {
  overflow: hidden;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-badge {
  position: absolute;
  top: 8px;
  left: 50%;
  margin-left: 4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  box-sizing: border-box;
  border-radius: 9px;
  background: var(--color-primary);
  color: var(--color-on-primary-contrast);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
</style>
