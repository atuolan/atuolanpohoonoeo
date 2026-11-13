<script setup lang="ts">
/**
 * 小屋記事的勾選清單：勾幾件 →「告訴他」送進聊天（只加一張卡片，不叫他馬上回）。
 * 小屋右上的選單、聊天的＋選單都用這個。
 * 說過的灰掉、標「已告訴」，不能再勾。
 */
import { computed, ref, watch } from "vue";
import type { NewsWho } from "./houseNews";
import { NEWS_PICK_MAX } from "./houseNews";

export interface PickerNews {
  id: string;
  /** 「14:20」「昨天 22:10」 */
  time: string;
  /** 已經換成「他／你」的文字 */
  text: string;
  who: NewsWho;
  told: boolean;
}

const props = defineProps<{
  items: PickerNews[];
  /** 他、她 */
  pronoun: string;
  /** 送出中（按鈕先鎖住） */
  busy?: boolean;
  /** 不能送的原因（例如還沒跟他聊過天）；有的話按鈕鎖住、顯示這句 */
  blocked?: string;
}>();
const emit = defineEmits<{ send: [ids: string[]] }>();

const picked = ref<string[]>([]);
// 清單換了（送出後標成已告訴、過期消失）：勾的只留還在、還沒說過的
watch(
  () => props.items,
  (list) => {
    picked.value = picked.value.filter((id) => list.some((n) => n.id === id && !n.told));
  },
);

const full = computed(() => picked.value.length >= NEWS_PICK_MAX);
const untold = computed(() => props.items.filter((n) => !n.told).length);

function toggle(n: PickerNews) {
  if (n.told) return;
  const i = picked.value.indexOf(n.id);
  if (i >= 0) picked.value = picked.value.filter((id) => id !== n.id);
  else if (!full.value) picked.value = [...picked.value, n.id];
}

const WHO_LABEL: Record<NewsWho, string> = { char: "", user: "你", pet: "寵物", house: "家裡" };
const whoLabel = (w: NewsWho) => (w === "char" ? props.pronoun : WHO_LABEL[w]);

function send() {
  if (!picked.value.length || props.busy || props.blocked) return;
  emit("send", [...picked.value]);
}
</script>

<template>
  <div class="hn-root">
    <p class="hn-tip">勾想告訴{{ pronoun }}的事，會變成一張卡片放進聊天。{{ pronoun }}下次回話時就知道了，不會馬上回。</p>

    <ul v-if="items.length" class="hn-list">
      <li v-for="n in items" :key="n.id">
        <button
          type="button"
          class="hn-row"
          :class="{ 'is-on': picked.includes(n.id), 'is-told': n.told }"
          :disabled="n.told || (full && !picked.includes(n.id))"
          :aria-pressed="picked.includes(n.id) ? 'true' : 'false'"
          @click="toggle(n)"
        >
          <span class="hn-check" aria-hidden="true">
            <svg v-if="picked.includes(n.id)" viewBox="0 0 16 16" width="12" height="12"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </span>
          <span class="hn-main">
            <span class="hn-text">{{ n.text }}</span>
            <span class="hn-meta">
              <span>{{ n.time }}</span>
              <span class="hn-who" :class="`is-${n.who}`">{{ whoLabel(n.who) }}</span>
              <span v-if="n.told" class="hn-told">已告訴</span>
            </span>
          </span>
        </button>
      </li>
    </ul>
    <p v-else class="hn-empty">今天家裡還沒發生什麼事</p>

    <div v-if="untold" class="hn-bar">
      <span class="hn-count">{{ blocked || (picked.length ? `選了 ${picked.length} 件${full ? `（最多 ${NEWS_PICK_MAX} 件）` : ""}` : "還沒選") }}</span>
      <button type="button" class="hn-send" :disabled="!picked.length || busy || !!blocked" @click="send">告訴{{ pronoun }}</button>
    </div>
  </div>
</template>

<style scoped>
.hn-root {
  display: flex;
  flex-direction: column;
  min-height: 0;
  color: #3b2a26;
}

.hn-tip {
  margin: 0 8px 8px;
  font-size: 12px;
  line-height: 18px;
  color: rgba(59, 42, 38, 0.6);
}

.hn-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.hn-row {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 8px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.hn-row:active:not(:disabled) {
  background: rgba(59, 42, 38, 0.06);
}

.hn-row.is-on {
  background: #fbefdc;
}

.hn-row:disabled {
  cursor: default;
}

.hn-row.is-told {
  opacity: 0.5;
}

.hn-check {
  flex: none;
  width: 20px;
  height: 20px;
  margin-top: 1px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: 1.5px solid rgba(59, 42, 38, 0.3);
  border-radius: 6px;
  color: #fff;
  background: #fff;
}

.hn-row.is-on .hn-check {
  border-color: #c0703f;
  background: #c0703f;
}

.hn-row.is-told .hn-check {
  border-style: dashed;
}

.hn-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hn-text {
  font-size: 14px;
  line-height: 20px;
  overflow-wrap: anywhere;
}

.hn-meta {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 11px;
  color: rgba(59, 42, 38, 0.55);
  font-variant-numeric: tabular-nums;
}

.hn-who {
  padding: 0 6px;
  border-radius: 999px;
  line-height: 16px;
  background: rgba(59, 42, 38, 0.07);
}

.hn-who.is-char {
  background: #fde3dc;
  color: #a5462f;
}

.hn-who.is-pet {
  background: #e7f0dc;
  color: #4f6b3f;
}

.hn-told {
  color: #a0643a;
}

.hn-empty {
  margin: 4px 8px;
  padding: 14px 12px;
  border-radius: 14px;
  background: #f7efe2;
  font-size: 14px;
  text-align: center;
  color: rgba(59, 42, 38, 0.7);
}

.hn-bar {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding: 10px 8px 4px;
  background: linear-gradient(to bottom, rgba(255, 251, 245, 0), #fffbf5 30%);
}

.hn-count {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: rgba(59, 42, 38, 0.65);
}

.hn-send {
  flex: none;
  min-height: 38px;
  padding: 0 18px;
  border: 0;
  border-radius: 999px;
  background: #3b2a26;
  color: #fff;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.hn-send:disabled {
  background: rgba(59, 42, 38, 0.18);
  color: rgba(59, 42, 38, 0.5);
  cursor: default;
}
</style>
