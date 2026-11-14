<script setup lang="ts">
/**
 * 關係階段的「梯子」：最高的在上面，每格只有名稱和「這時候角色會怎樣」。
 * 門檻數字預設不顯示（app 自己算）；「從這裡開始」點一下就換起點；
 * 格子之間的「＋」插一階，門檻取上下兩格的中間值。
 *
 * 直接改傳進來的 metric（跟設定畫面其他欄位一樣），改完 emit change。
 */
import { computed } from "vue";
import type { AffinityMetricConfig } from "@/schemas/affinity";
import {
  insertStageAbove,
  reverseStages,
  sortedStages,
  startStageIndex,
  startValueForStage,
} from "@/services/affinityLadder";

const props = defineProps<{
  metric: AffinityMetricConfig;
  /** 顯示每一階從幾分開始（細部調整用） */
  showNumbers?: boolean;
}>();

const emit = defineEmits<{ change: [] }>();

/** 由高到低顯示；ascIndex 是由低到高的位置 */
const rows = computed(() =>
  sortedStages(props.metric.stages)
    .map((stage, ascIndex) => ({ stage, ascIndex }))
    .reverse(),
);

const startIndex = computed(() => startStageIndex(props.metric));

function setStart(ascIndex: number) {
  props.metric.initial = startValueForStage(props.metric, ascIndex);
  emit("change");
}

function insertAbove(ascIndex: number) {
  const next = insertStageAbove(props.metric, ascIndex, { name: "", description: "" });
  if (!next) {
    alert("這兩階之間已經沒有空間了。可以到「細部調整」把範圍調大。");
    return;
  }
  // 起點維持在原本那一階
  const keep = sortedStages(props.metric.stages)[startIndex.value];
  props.metric.stages = next;
  if (keep) {
    const idx = next.indexOf(keep);
    if (idx >= 0) props.metric.initial = startValueForStage(props.metric, idx);
  }
  emit("change");
}

function addFirst() {
  props.metric.stages = [{ name: "", minValue: props.metric.min, description: "" }];
  emit("change");
}

function remove(stage: AffinityMetricConfig["stages"][number]) {
  props.metric.stages = props.metric.stages.filter((s) => s !== stage);
  emit("change");
}

function reverse() {
  const { stages, initial } = reverseStages(props.metric);
  props.metric.stages = stages;
  props.metric.initial = initial;
  emit("change");
}
</script>

<template>
  <div class="ladder">
    <template v-if="rows.length">
      <span class="ladder-edge">分數高</span>
      <button type="button" class="ladder-insert" @click="insertAbove(rows[0].ascIndex)">＋ 在最上面加一階</button>
      <template v-for="(row, i) in rows" :key="i">
        <div class="ladder-step" :class="{ 'is-start': row.ascIndex === startIndex }">
          <span class="ladder-dot" aria-hidden="true"></span>
          <div class="ladder-fields">
            <div class="ladder-top">
              <input
                v-model="row.stage.name"
                class="ladder-input ladder-name"
                placeholder="階段名（如 曖昧）"
                @change="emit('change')"
              />
              <label v-if="showNumbers" class="ladder-threshold">
                從
                <input
                  v-model.number="row.stage.minValue"
                  type="number"
                  class="ladder-input"
                  @change="emit('change')"
                />
              </label>
              <span v-if="row.ascIndex === startIndex" class="ladder-start is-active">從這裡開始</span>
              <button v-else type="button" class="ladder-start" @click="setStart(row.ascIndex)">
                設為起點
              </button>
              <button
                type="button"
                class="ladder-remove"
                title="刪除這一階"
                aria-label="刪除這一階"
                @click="remove(row.stage)"
              >
                ✕
              </button>
            </div>
            <input
              v-model="row.stage.description"
              class="ladder-input ladder-behavior"
              placeholder="這時候角色會怎樣？例如：會主動找話題、偶爾吃醋"
              @change="emit('change')"
            />
          </div>
        </div>
        <button
          v-if="i < rows.length - 1"
          type="button"
          class="ladder-insert"
          @click="insertAbove(rows[i + 1].ascIndex)"
        >
          ＋ 插一階
        </button>
      </template>
      <span class="ladder-edge">分數低</span>
      <button v-if="rows.length > 1" type="button" class="ladder-flip" @click="reverse">
        上下顛倒
      </button>
    </template>
    <button v-else type="button" class="ladder-insert is-first" @click="addFirst">
      ＋ 加第一個階段
    </button>
  </div>
</template>

<style scoped lang="scss">
.ladder-input {
  box-sizing: border-box;
  border: 1px solid var(--color-border, #e0e0e0);
  border-radius: 8px;
  background: var(--color-surface, #fff);
  color: inherit;
  font: inherit;

  &:focus {
    outline: none;
    border-color: #f093fb;
  }

  &::placeholder {
    color: #9ca3af;
  }
}

.ladder {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ladder-edge {
  font-size: 11px;
  color: #9ca3af;
  padding-left: 4px;
}

.ladder-step {
  position: relative;
  display: flex;
  gap: 8px;
  padding: 8px 8px 8px 6px;
  border-radius: 10px;
  border: 1px solid transparent;

  &.is-start {
    background: rgba(255, 107, 157, 0.07);
    border-color: rgba(255, 107, 157, 0.35);
  }
}

.ladder-dot {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  margin-top: 12px;
  border-radius: 50%;
  background: #f9a8c5;

  .is-start & {
    background: #ff6b9d;
    box-shadow: 0 0 0 3px rgba(255, 107, 157, 0.2);
  }
}

.ladder-fields {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ladder-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ladder-name {
  flex: 1;
  min-width: 0;
  padding: 6px 8px !important;
  font-size: 14px;
  font-weight: 600;
}

.ladder-threshold {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #6b7280;

  input {
    width: 58px;
    padding: 4px 6px !important;
    font-size: 12px;
  }
}

.ladder-behavior {
  width: 100%;
  padding: 6px 8px !important;
  font-size: 13px;
}

.ladder-start {
  flex-shrink: 0;
  padding: 3px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  background: transparent;
  font-size: 11px;
  color: #6b7280;
  cursor: pointer;
  white-space: nowrap;

  &.is-active {
    border-color: #ff6b9d;
    color: #e0457b;
    font-weight: 600;
    cursor: default;
  }
}

.ladder-remove {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #c0c4cc;
  font-size: 12px;
  cursor: pointer;

  &:hover {
    background: #fee2e2;
    color: #ef4444;
  }
}

.ladder-insert {
  align-self: flex-start;
  margin-left: 18px;
  padding: 2px 8px;
  border: none;
  background: none;
  font-size: 11px;
  color: #9ca3af;
  cursor: pointer;

  &:hover {
    color: #e0457b;
  }

  &.is-first {
    margin-left: 0;
    padding: 6px 12px;
    border: 1px dashed #d1d5db;
    border-radius: 8px;
    font-size: 12px;
  }
}

.ladder-flip {
  align-self: flex-end;
  padding: 2px 8px;
  border: none;
  background: none;
  font-size: 12px;
  color: #6b7280;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
</style>
