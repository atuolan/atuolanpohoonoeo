<script setup lang="ts">
import { computed } from "vue";
import { HEXAGRAMS } from "@/data/liuyao/hexagrams";
import type { ZhouyiText } from "@/data/liuyao/zhouyi";
import type { ChartFacts, LiuyaoChart } from "@/types/liuyao";

const props = defineProps<{
  chart: LiuyaoChart;
  facts?: ChartFacts | null;
  originalText?: ZhouyiText | null;
  changedText?: ZhouyiText | null;
}>();

const formatTime = computed(() => {
  const d = new Date(props.chart.time.timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
});

const originalSummary = computed(() => {
  return HEXAGRAMS.find((h) => h.index === props.chart.original.index)?.summary ?? "";
});

const changedSummary = computed(() => {
  if (!props.chart.changed) return "";
  return HEXAGRAMS.find((h) => h.index === props.chart.changed?.index)?.summary ?? "";
});

// 上爻排到初爻（反轉）
const reversedLines = computed(() => [...props.chart.lines].reverse());

function isXunKong(zhi: string): boolean {
  return props.chart.time.xunKong.includes(zhi as any);
}

const wholeTags = computed(() => {
  const f = props.facts;
  if (!f) return [];
  const tags: string[] = [];

  if (f.liuchong.original) tags.push("六沖卦");
  if (f.liuhe.original) tags.push("六合卦");
  if (f.liuchong.changed) tags.push("變卦六沖");
  if (f.liuhe.changed) tags.push("變卦六合");

  if (f.fanyin.includes("內卦")) tags.push("內卦反吟");
  if (f.fanyin.includes("外卦")) tags.push("外卦反吟");
  if (f.fuyin.includes("內卦")) tags.push("內卦伏吟");
  if (f.fuyin.includes("外卦")) tags.push("外卦伏吟");

  if (f.movingPattern === "獨發") tags.push("獨發");
  else if (f.movingPattern === "獨靜") tags.push("獨靜");
  else if (f.movingPattern === "亂動") tags.push("亂動");

  const gen = props.chart.original.generation;
  if (gen === "遊魂") tags.push("遊魂卦");
  else if (gen === "歸魂") tags.push("歸魂卦");

  for (const s of f.sanhe) {
    tags.push(`${s.zhi.join("")}${s.ju}`);
  }

  return tags;
});

const movingLinesWithZhouyi = computed(() => {
  if (!props.originalText) return [];
  const moving = props.chart.lines.filter((l) => l.moving);
  if (moving.length === 0) return [];
  return moving.map((l) => ({
    line: l,
    text: props.originalText?.lines[l.position - 1],
  })).filter((item) => Boolean(item.text));
});

const isAllMoving = computed(() => {
  return props.chart.lines.length > 0 && props.chart.lines.every((l) => l.moving);
});
</script>

<template>
  <div class="liuyao-board">
    <!-- 1. 時間區 -->
    <div class="time-section">
      <div class="time-row">{{ formatTime }}　{{ chart.time.lunarText }}</div>
      <div class="time-row">
        {{ chart.time.year }}年 {{ chart.time.month }}月 {{ chart.time.day }}日 {{ chart.time.hour }}時　旬空 {{ chart.time.xunKong.join("") }}
      </div>
    </div>

    <!-- 2. 卦名區 -->
    <div class="hexagram-names" :class="{ 'is-single': !chart.changed }">
      <div class="name-col">
        <div class="name-title">{{ chart.original.fullName }}</div>
        <div class="name-sub">{{ chart.original.palace }}宮・{{ chart.original.generation }}</div>
        <div v-if="originalSummary" class="name-summary">{{ originalSummary }}</div>
      </div>
      <div v-if="chart.changed" class="name-col">
        <div class="name-title">{{ chart.changed.fullName }}</div>
        <div class="name-sub">{{ chart.changed.palace }}宮・{{ chart.changed.generation }}</div>
        <div v-if="changedSummary" class="name-summary">{{ changedSummary }}</div>
      </div>
    </div>

    <!-- 3. 爻表 -->
    <div class="lines-table" :class="{ 'has-changed': !!chart.changed }">
      <!-- 表頭 -->
      <div class="line-row line-header">
        <span class="col-liushen">六神</span>
        <span class="col-fushen">伏神</span>
        <span class="col-original">本卦</span>
        <span class="col-line-orig"></span>
        <span class="col-moving"></span>
        <span class="col-shiying"></span>
        <span v-if="chart.changed" class="col-changed">變卦</span>
      </div>

      <!-- 爻列 -->
      <div
        v-for="line in reversedLines"
        :key="line.position"
        class="line-row"
        :class="{ 'is-moving': line.moving }"
      >
        <!-- 六神 -->
        <span class="col-liushen">{{ line.liushen }}</span>

        <!-- 伏神 -->
        <span class="col-fushen">
          <template v-if="line.fushen">伏 {{ line.fushen.liuqin }}{{ line.fushen.zhi }}{{ line.fushen.wuxing }}</template>
        </span>

        <!-- 本卦六親地支五行＋標記 -->
        <span class="col-original">
          <span class="najia-text">{{ line.liuqin }}{{ line.zhi }}{{ line.wuxing }}</span>
          <span v-if="isXunKong(line.zhi)" class="badge">空</span>
          <span v-if="facts?.lines[line.position - 1]?.monthBreak" class="badge">破</span>
          <span v-if="facts?.lines[line.position - 1]?.staticDayClash === '暗動'" class="badge">暗動</span>
          <span v-if="facts?.lines[line.position - 1]?.staticDayClash === '日破'" class="badge">日破</span>
        </span>

        <!-- 本卦爻畫 -->
        <span class="col-line-orig">
          <span
            class="yao-drawing"
            :class="[line.yang ? 'is-yang' : 'is-yin', { 'is-moving': line.moving }]"
          >
            <span class="bar bar-left"></span>
            <span v-if="!line.yang" class="bar-gap"></span>
            <span class="bar bar-right"></span>
          </span>
        </span>

        <!-- 動標記 -->
        <span class="col-moving">
          <span v-if="line.moving" class="moving-mark">{{ line.value === 9 ? '○' : '×' }}</span>
        </span>

        <!-- 世應 -->
        <span class="col-shiying">
          <span v-if="line.isShi" class="shiying-tag is-shi">世</span>
          <span v-else-if="line.isYing" class="shiying-tag">應</span>
        </span>

        <!-- 變卦六親地支五行＋爻畫 -->
        <span v-if="chart.changed && line.changed" class="col-changed" :class="{ 'is-active': line.moving }">
          <span class="najia-text">{{ line.changed.liuqin }}{{ line.changed.zhi }}{{ line.changed.wuxing }}</span>
          <span class="yao-drawing changed-drawing" :class="[line.changed.yang ? 'is-yang' : 'is-yin', { 'is-active': line.moving }]">
            <span class="bar bar-left"></span>
            <span v-if="!line.changed.yang" class="bar-gap"></span>
            <span class="bar bar-right"></span>
          </span>
        </span>
      </div>
    </div>

    <!-- 4. 全卦小標籤列 -->
    <div v-if="wholeTags.length > 0" class="tags-row">
      <span v-for="tag in wholeTags" :key="tag" class="whole-tag">{{ tag }}</span>
    </div>

    <!-- 5. 周易原文 -->
    <div v-if="originalText" class="zhouyi-section">
      <!-- 本卦 -->
      <details open class="zhouyi-details">
        <summary class="zhouyi-summary">本卦《{{ chart.original.fullName }}》</summary>
        <div class="zhouyi-content">
          <p class="text-head">卦辭：</p>
          <p class="text-orig">{{ originalText.guaci }}</p>
          <p v-if="originalText.guaciPlain" class="text-plain">{{ originalText.guaciPlain }}</p>
          <p class="text-head">彖傳：</p>
          <p class="text-orig">{{ originalText.tuan }}</p>
          <p class="text-head">象傳：</p>
          <p class="text-orig">{{ originalText.xiang }}</p>
        </div>
      </details>

      <!-- 動爻爻辭 -->
      <details v-if="movingLinesWithZhouyi.length > 0" open class="zhouyi-details">
        <summary class="zhouyi-summary">動爻爻辭</summary>
        <div class="zhouyi-content">
          <div v-for="{ line, text } in movingLinesWithZhouyi" :key="line.position" class="moving-line-block">
            <p class="text-orig">{{ text?.text }}</p>
            <p class="text-orig">{{ text?.xiang }}</p>
            <p v-if="text?.plain" class="text-plain">{{ text.plain }}</p>
          </div>
          <div v-if="isAllMoving && originalText.yong" class="moving-line-block yong-block">
            <p class="text-orig">{{ originalText.yong.text }}</p>
            <p class="text-orig">{{ originalText.yong.xiang }}</p>
            <p v-if="originalText.yong.plain" class="text-plain">{{ originalText.yong.plain }}</p>
          </div>
        </div>
      </details>

      <!-- 變卦 -->
      <details v-if="chart.changed && changedText" class="zhouyi-details">
        <summary class="zhouyi-summary">變卦《{{ chart.changed.fullName }}》</summary>
        <div class="zhouyi-content">
          <p class="text-head">卦辭：</p>
          <p class="text-orig">{{ changedText.guaci }}</p>
          <p v-if="changedText.guaciPlain" class="text-plain">{{ changedText.guaciPlain }}</p>
        </div>
      </details>
    </div>
  </div>
</template>

<style scoped lang="scss">
.liuyao-board {
  container-type: inline-size;
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--f-line);
  background: var(--f-panel);
  padding: 14px;
  border-radius: var(--f-radius);
  color: var(--f-ink);
  font-family: var(--f-font-body);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.time-section {
  font-size: 12px;
  color: var(--f-ink-2);
  line-height: 1.6;
  text-align: center;
}

.hexagram-names {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  text-align: center;

  &.is-single {
    grid-template-columns: 1fr;
  }
}

.name-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.name-title {
  font-family: var(--f-font-head);
  font-size: 18px;
  color: var(--f-ink);
  font-weight: bold;
}

.name-sub {
  font-size: 12px;
  color: var(--f-ink-2);
}

.name-summary {
  font-size: 12px;
  color: var(--f-ink-2);
  margin-top: 2px;
  line-height: 1.4;
}

.lines-table {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.line-row {
  display: grid;
  grid-template-columns: 2.6em auto 1fr 52px 1.2em 1.2em 1fr;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  min-height: 24px;

  .lines-table:not(.has-changed) & {
    grid-template-columns: 2.6em auto 1fr 52px 1.2em 1.2em;
  }
}

.line-header {
  font-size: 11px;
  color: var(--f-ink-2);
  border-bottom: 1px solid var(--f-line);
  padding-bottom: 4px;
  margin-bottom: 2px;
}

.col-liushen {
  color: var(--f-ink-2);
  white-space: nowrap;
}

.col-fushen {
  font-size: 10px;
  color: var(--f-ink-2);
  white-space: nowrap;
  min-width: 3.6em;
}

.col-original {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  white-space: nowrap;
}

.najia-text {
  font-size: 13px;
}

.badge {
  display: inline-block;
  font-size: 10px;
  line-height: 1;
  padding: 1px 2px;
  border: 1px solid var(--f-line);
  border-radius: 1px;
  color: var(--f-ink-2);
}

.col-line-orig {
  display: flex;
  justify-content: center;
  align-items: center;
}

.yao-drawing {
  display: flex;
  width: 52px;
  height: 7px;
  align-items: center;
  justify-content: space-between;

  &.changed-drawing {
    width: 40px;
  }

  .bar {
    height: 100%;
    background-color: var(--f-ink);
    border-radius: 1px;
  }

  &.is-yang {
    .bar-left {
      width: 100%;
    }
    .bar-right {
      display: none;
    }
  }

  &.is-yin {
    .bar-left,
    .bar-right {
      width: 44%;
    }
    .bar-gap {
      width: 12%;
    }
  }

  &.is-moving .bar {
    background-color: var(--f-accent);
  }

  &.changed-drawing {
    .bar {
      background-color: var(--f-ink-2);
    }
    &.is-active .bar {
      background-color: var(--f-ink);
    }
  }
}

.col-moving {
  text-align: center;
}

.moving-mark {
  color: var(--f-accent);
  font-weight: bold;
}

.col-shiying {
  text-align: center;
}

.shiying-tag {
  font-size: 12px;
  color: var(--f-ink-2);

  &.is-shi {
    color: var(--f-accent);
    font-weight: bold;
  }
}

.col-changed {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  align-self: stretch;
  padding-left: 6px;
  margin-left: 2px;
  color: var(--f-ink-2);
  white-space: nowrap;
  // 跟本卦隔開，世應才不會看起來像是變卦的
  border-left: 1px solid var(--f-line);

  &.is-active {
    color: var(--f-ink);
  }
}

@container (max-width: 380px) {
  .najia-text {
    font-size: 12px;
  }
  .col-fushen {
    width: 3.2em;
    min-width: 3.2em;
    white-space: normal;
    line-height: 1.1;
  }
}

@media (max-width: 380px) {
  .najia-text {
    font-size: 12px;
  }
  .col-fushen {
    width: 3.2em;
    min-width: 3.2em;
    white-space: normal;
    line-height: 1.1;
  }
}

.tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 4px;
}

.whole-tag {
  font-size: 11px;
  border: 1px solid var(--f-line);
  padding: 2px 6px;
  border-radius: var(--f-radius);
  color: var(--f-ink-2);
}

.zhouyi-section {
  border-top: 1px solid var(--f-line);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.zhouyi-details {
  border: 1px solid var(--f-line);
  border-radius: var(--f-radius);
  padding: 6px 10px;
  background: var(--f-panel);
}

.zhouyi-summary {
  font-family: var(--f-font-head);
  cursor: pointer;
  font-weight: bold;
  color: var(--f-ink);
  outline: none;
}

.zhouyi-content {
  margin-top: 8px;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.text-head {
  font-family: var(--f-font-head);
  font-size: 14px;
  font-weight: bold;
  color: var(--f-ink);
  margin-top: 4px;
}

.text-orig {
  font-family: var(--f-font-head);
  font-size: 15px;
  line-height: 1.8;
  color: var(--f-ink);
}

.text-plain {
  font-size: 13px;
  color: var(--f-ink-2);
  line-height: 1.6;
  margin-bottom: 6px;
}

.moving-line-block {
  border-bottom: 1px dashed var(--f-line);
  padding-bottom: 6px;
  margin-bottom: 6px;

  &:last-child {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
  }
}
</style>

