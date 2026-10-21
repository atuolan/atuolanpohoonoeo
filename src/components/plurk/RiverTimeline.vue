<script setup lang="ts">
/** 河道橫向時間軸：越左越新，上下交錯的噗泡泡，跨日插虛線分隔 */
import { computed } from "vue";
import type { RiverBubbleData } from "@/components/plurk/types";
import type { TimelineLayout } from "@/utils/plurkRiver";
import { getQualifierColor } from "@/utils/plurkQualifiers";
import QualifierChip from "@/components/plurk/QualifierChip.vue";
import PlurkAvatar from "@/components/plurk/PlurkAvatar.vue";

const props = withDefaults(
  defineProps<{
    layout: TimelineLayout;
    bubbles: Record<string, RiverBubbleData>;
  }>(),
  {},
);

const emit = defineEmits<{
  open: [postId: string];
}>();

interface BubbleView {
  postId: string;
  data: RiverBubbleData;
  x: number;
  timeLabel: string;
  top: number;
  stemTop: number;
  stemHeight: number;
  dotColor: string;
}

const width = computed(() => Math.max(props.layout.width, 0));

const rows = computed<BubbleView[]>(() =>
  props.layout.bubbles.flatMap((bubble) => {
    const data = props.bubbles[bubble.postId];
    if (!data) return [];
    const top = bubble.lane === 0 ? 14 : 66;
    return [
      {
        postId: bubble.postId,
        data,
        x: bubble.x,
        timeLabel: bubble.timeLabel,
        top,
        stemTop: top + 40,
        stemHeight: 124 - (top + 40),
        dotColor: getQualifierColor(data.qualifier) ?? "var(--color-text-muted)",
      },
    ];
  }),
);
</script>

<template>
  <div class="river-timeline" :style="{ width: '100%' }">
    <div class="river-timeline__scroll">
      <div class="river-timeline__canvas" :style="{ width: `${width}px` }">
        <div class="river-timeline__axis" />
        <div class="river-timeline__now-line" />
        <span class="river-timeline__now">現在</span>

        <template v-for="divider in props.layout.dividers" :key="`d-${divider.x}-${divider.label}`">
          <div
            class="river-timeline__divider"
            :style="{ left: `${divider.x}px`, top: '10px', height: '114px' }"
          />
          <span
            class="river-timeline__divider-label"
            :style="{ left: `${divider.x + 6}px`, top: '8px' }"
            >{{ divider.label }}</span
          >
        </template>

        <template v-for="row in rows" :key="row.postId">
          <div
            class="river-timeline__stem"
            :style="{ left: `${row.x + 20}px`, top: `${row.stemTop}px`, height: `${row.stemHeight}px` }"
          />
          <div class="river-timeline__dot" :style="{ left: `${row.x + 15}px`, top: '120px', background: row.dotColor }" />
          <span class="river-timeline__time" :style="{ left: `${row.x}px`, top: '138px' }">{{ row.timeLabel }}</span>
          <button
            type="button"
            class="river-timeline__bubble"
            :class="{ 'river-timeline__bubble--unread': row.data.unread }"
            :style="{ left: `${row.x}px`, top: `${row.top}px` }"
            :aria-label="`${row.data.authorName}：${row.data.text}`"
            @click="emit('open', row.postId)"
          >
            <PlurkAvatar :src="row.data.authorAvatar" :name="row.data.authorName" :size="28" />
            <QualifierChip :qualifier="row.data.qualifier" size="sm" />
            <span class="river-timeline__text">{{ row.data.text }}</span>
          </button>
        </template>
      </div>
    </div>
    <div class="river-timeline__fade" />
  </div>
</template>

<style scoped lang="scss">
@use "@/components/plurk/plurk-theme.scss" as *;

.river-timeline {
  position: relative;
  height: 168px;
  background: var(--color-surface-hover);
  overflow: hidden;
}

.river-timeline__scroll {
  height: 168px;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.river-timeline__canvas {
  position: relative;
  height: 168px;
}

.river-timeline__axis {
  position: absolute;
  left: 0;
  right: 0;
  top: 124px;
  height: 2px;
  background: var(--color-border);
}

.river-timeline__now-line {
  position: absolute;
  left: 20px;
  top: 10px;
  height: 114px;
  border-left: 1.5px dashed var(--color-primary);
}

.river-timeline__now {
  position: absolute;
  left: 4px;
  top: 136px;
  display: flex;
  align-items: center;
  height: 20px;
  padding: 0 7px;
  border-radius: 10px;
  background: var(--color-primary);
  color: var(--color-on-primary-contrast);
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}

.river-timeline__divider {
  position: absolute;
  border-left: 1.5px dashed var(--color-border);
}

.river-timeline__divider-label {
  position: absolute;
  font-size: 11px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.river-timeline__stem {
  position: absolute;
  width: 1px;
  background: var(--color-border);
}

.river-timeline__dot {
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 5px;
  box-shadow: 0 0 0 2px var(--color-surface-hover);
}

.river-timeline__time {
  position: absolute;
  width: 40px;
  text-align: center;
  font-size: 11px;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.river-timeline__bubble {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  max-width: 224px;
  height: 40px;
  padding: 0 12px 0 6px;
  border: none;
  border-radius: 20px;
  background: var(--color-surface);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  color: var(--color-text);
  font-family: inherit;
  white-space: nowrap;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.river-timeline__bubble--unread {
  border: 2px solid var(--color-primary);
  padding: 0 10px 0 4px;
}

.river-timeline__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
}

.river-timeline__fade {
  position: absolute;
  right: 0;
  top: 0;
  width: 36px;
  height: 168px;
  background: linear-gradient(90deg, transparent 0%, var(--color-surface-hover) 100%);
  pointer-events: none;
}

body.is-night-mode .river-timeline__bubble {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.32);
}
</style>
