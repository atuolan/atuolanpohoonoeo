<script setup lang="ts">
/**
 * 「用一句話做一個數值」：描述想要的關係變化（留空就看角色卡想），
 * AI 做好後用梯子確認、微調，按「就用這個」加進角色的數值。
 */
import { computed, ref } from "vue";
import type { AffinityMetricConfig } from "@/schemas/affinity";
import { type AffinityGenerateInput, generateAffinityMetric } from "@/services/affinityGenerator";
import {
  type AffinityPace,
  maxChangeForPace,
  PACE_LABELS,
  paceOf,
} from "@/services/affinityLadder";
import AffinityStageLadder from "./AffinityStageLadder.vue";

const props = defineProps<{
  character: AffinityGenerateInput["character"];
  existingNames: string[];
}>();

const emit = defineEmits<{
  done: [metric: AffinityMetricConfig];
  cancel: [];
  /** 生成失敗時改用範本 */
  usePreset: [key: string];
}>();

const EXAMPLES = [
  "一開始討厭我，慢慢變成喜歡",
  "依賴度，越高越離不開我",
  "墮落度，越高越放縱",
];

const request = ref("");
const status = ref<"idle" | "loading" | "error" | "result">("idle");
const errorText = ref("");
const result = ref<AffinityMetricConfig | null>(null);
/** 使用者改過結果；重新生成前要先問 */
const edited = ref(false);
let controller: AbortController | null = null;

const pace = computed(() => (result.value ? paceOf(result.value) : null));

async function generate() {
  if (status.value === "result" && edited.value && !confirm("重新做會蓋掉你剛剛改的內容，確定嗎？")) {
    return;
  }
  controller?.abort();
  controller = new AbortController();
  status.value = "loading";
  errorText.value = "";
  try {
    const metric = await generateAffinityMetric({
      request: request.value,
      character: props.character,
      existingNames: props.existingNames,
      signal: controller.signal,
    });
    result.value = metric;
    edited.value = false;
    status.value = "result";
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") return;
    const message = error instanceof Error ? error.message : "";
    errorText.value = message.includes("API") ? message : "";
    status.value = "error";
  }
}

function setPace(next: AffinityPace) {
  if (!result.value) return;
  result.value.maxChange = maxChangeForPace(result.value, next);
  edited.value = true;
}

function setStateStart(option: string) {
  if (!result.value) return;
  result.value.initial = option;
  edited.value = true;
}

function confirmResult() {
  if (!result.value) return;
  emit("done", result.value);
}

function cancel() {
  controller?.abort();
  emit("cancel");
}
</script>

<template>
  <div class="gen">
    <template v-if="status !== 'result'">
      <label class="gen-title" for="affinity-gen-input">你想讓角色記住什麼？</label>
      <textarea
        id="affinity-gen-input"
        v-model="request"
        class="gen-input"
        rows="2"
        placeholder="例如：傲嬌，一開始討厭我，慢慢喜歡上我（留空就照角色卡幫你想）"
        :disabled="status === 'loading'"
      ></textarea>
      <div class="gen-examples">
        <button
          v-for="example in EXAMPLES"
          :key="example"
          type="button"
          class="gen-example"
          :disabled="status === 'loading'"
          @click="request = example"
        >
          {{ example }}
        </button>
      </div>

      <p v-if="status === 'loading'" class="gen-status">正在想角色會怎麼變…</p>
      <div v-else-if="status === 'error'" class="gen-error">
        <p>{{ errorText || "這次沒做出來。再試一次，或先用好感度範本。" }}</p>
        <div class="gen-actions">
          <button type="button" class="gen-btn" @click="emit('usePreset', 'affection')">用好感度範本</button>
          <button type="button" class="gen-btn is-primary" @click="generate">再試一次</button>
        </div>
      </div>

      <div v-if="status !== 'error'" class="gen-actions">
        <button type="button" class="gen-btn" @click="cancel">取消</button>
        <button
          type="button"
          class="gen-btn is-primary"
          :disabled="status === 'loading'"
          @click="generate"
        >
          {{ status === "loading" ? "做好之前請稍等…" : "幫我做好" }}
        </button>
      </div>
    </template>

    <template v-else-if="result">
      <div class="gen-result-head">
        <input
          v-model="result.name"
          class="gen-input gen-name"
          aria-label="數值名稱"
          @change="edited = true"
        />
        <span class="gen-kind">{{ result.type === "string" ? "幾種狀態切換" : "會慢慢累積的分數" }}</span>
      </div>

      <label class="gen-label">什麼時候會變？</label>
      <textarea v-model="result.description" class="gen-input" rows="2" @change="edited = true"></textarea>

      <template v-if="result.type !== 'string'">
        <label class="gen-label">關係階段（點「設為起點」換一開始的位置）</label>
        <AffinityStageLadder :metric="result" @change="edited = true" />

        <label class="gen-label">節奏</label>
        <div class="gen-pace" role="radiogroup" aria-label="節奏">
          <button
            v-for="p in (['slow', 'normal', 'fast'] as AffinityPace[])"
            :key="p"
            type="button"
            role="radio"
            :aria-checked="pace === p"
            class="gen-pace-btn"
            :class="{ 'is-active': pace === p }"
            @click="setPace(p)"
          >
            {{ PACE_LABELS[p] }}
          </button>
        </div>
      </template>

      <template v-else>
        <label class="gen-label">狀態（點一個當作一開始）</label>
        <div class="gen-states">
          <button
            v-for="option in result.options"
            :key="option"
            type="button"
            class="gen-state"
            :class="{ 'is-active': result.initial === option }"
            @click="setStateStart(option)"
          >
            {{ option }}
          </button>
        </div>
      </template>

      <div class="gen-actions">
        <button type="button" class="gen-btn" @click="cancel">取消</button>
        <button type="button" class="gen-btn" @click="generate">重新做一個</button>
        <button type="button" class="gen-btn is-primary" @click="confirmResult">就用這個</button>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.gen {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid rgba(255, 107, 157, 0.35);
  border-radius: 12px;
  background: rgba(255, 107, 157, 0.04);
}

.gen-title {
  font-size: 14px;
  font-weight: 600;
}

.gen-label {
  margin-top: 4px;
  font-size: 12px;
  color: #6b7280;
}

.gen-input {
  box-sizing: border-box;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--color-border, #e0e0e0);
  border-radius: 8px;
  background: var(--color-surface, #fff);
  color: inherit;
  font: inherit;
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;

  &:focus {
    outline: none;
    border-color: #f093fb;
  }

  &::placeholder {
    color: #9ca3af;
  }
}

.gen-examples,
.gen-states,
.gen-pace {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.gen-example,
.gen-state,
.gen-pace-btn {
  padding: 4px 10px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 999px;
  background: var(--color-surface, #fff);
  color: inherit;
  font-size: 12px;
  cursor: pointer;

  &.is-active {
    border-color: #ff6b9d;
    background: rgba(255, 107, 157, 0.1);
    color: #e0457b;
    font-weight: 600;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.gen-status {
  margin: 0;
  font-size: 13px;
  color: #e0457b;
}

.gen-error p {
  margin: 0 0 6px;
  font-size: 13px;
  color: #b7791f;
}

.gen-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.gen-btn {
  padding: 6px 14px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 999px;
  background: var(--color-surface, #fff);
  color: inherit;
  font-size: 13px;
  cursor: pointer;

  &.is-primary {
    border-color: #ff6b9d;
    background: #ff6b9d;
    color: #fff;
    font-weight: 600;
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
}

.gen-result-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.gen-name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
}

.gen-kind {
  flex-shrink: 0;
  font-size: 11px;
  color: #9ca3af;
}
</style>
