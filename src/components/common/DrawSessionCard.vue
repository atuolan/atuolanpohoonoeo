<template>
  <section class="draw-session-card" :class="{ live }" aria-label="調畫風工作紀錄">
    <header class="dsc-header">
      <span class="dsc-title">{{ actorName || "角色" }}在調畫風</span>
      <span class="dsc-count">{{ headerStatus }}</span>
    </header>

    <!-- 試畫並排：一眼比較每一張 -->
    <div v-if="drafts.length" class="dsc-strip" role="list">
      <button
        v-for="draft in drafts"
        :key="draft.id"
        type="button"
        role="listitem"
        class="dsc-thumb"
        :class="{ selected: draft.attempt === selected?.attempt, chosen: draft.attempt === session.chosenAttempt }"
        :aria-label="`試畫 #${draft.attempt}${draft.attempt === session.chosenAttempt ? '（聊天裡用的是這張）' : ''}`"
        :aria-pressed="draft.attempt === selected?.attempt"
        @click="selectedAttempt = draft.attempt ?? null"
      >
        <img v-if="imageUrls[draft.imageRef!]" :src="imageUrls[draft.imageRef!]" alt="" loading="lazy" />
        <span v-else class="dsc-thumb-placeholder" />
        <span class="dsc-thumb-num">#{{ draft.attempt }}</span>
        <span v-if="draft.attempt === session.chosenAttempt" class="dsc-thumb-badge">✓</span>
      </button>
      <div v-if="drawing" class="dsc-thumb drawing" aria-label="正在試畫">
        <span class="dsc-thumb-num">#{{ drawing.attempt ?? "…" }}</span>
        <span class="dsc-thumb-spinner">畫圖中</span>
      </div>
    </div>

    <!-- 選中那張：大圖、說明、提示詞、操作 -->
    <div v-if="selected" class="dsc-detail">
      <img
        v-if="imageUrls[selected.imageRef!]"
        class="dsc-detail-image"
        :src="imageUrls[selected.imageRef!]"
        :alt="`試畫 #${selected.attempt}`"
      />
      <p v-if="selected.note" class="dsc-note">「{{ selected.note }}」</p>
      <button type="button" class="dsc-link" :aria-expanded="showPrompt" @click="showPrompt = !showPrompt">
        {{ showPrompt ? "收起提示詞" : "看提示詞" }}
      </button>
      <dl v-if="showPrompt" class="dsc-prompt">
        <dt>正面</dt>
        <dd>{{ selected.prompt || "（沒有）" }}</dd>
        <template v-if="selected.negativePrompt">
          <dt>負面</dt>
          <dd>{{ selected.negativePrompt }}</dd>
        </template>
        <template v-if="selected.autoTags">
          <dt>自動加上</dt>
          <dd>{{ selected.autoTags }}</dd>
        </template>
      </dl>
      <div class="dsc-actions">
        <button
          type="button"
          class="dsc-btn primary"
          :disabled="live || selected.attempt === session.chosenAttempt"
          @click="emit('pick', selected.attempt!)"
        >
          {{ selected.attempt === session.chosenAttempt ? "聊天裡用的是這張" : "用這張" }}
        </button>
        <button type="button" class="dsc-btn" :disabled="live" @click="emit('steer', selected.attempt!)">往這張調</button>
      </div>
    </div>

    <!-- 每一步做了什麼 -->
    <button
      v-if="!live && session.steps.length"
      type="button"
      class="dsc-link dsc-steps-toggle"
      :aria-expanded="stepsOpen"
      @click="stepsOpen = !stepsOpen"
    >
      {{ stepsOpen ? "收起過程" : `看過程（${session.steps.length} 步）` }}
    </button>
    <ol v-if="live || stepsOpen" class="dsc-steps">
      <li v-for="step in session.steps" :key="step.id" class="dsc-step" :data-status="step.status">
        <span class="dsc-step-dot" aria-hidden="true" />
        <div class="dsc-step-body">
          <div class="dsc-step-title">
            {{ stepTitle(step) }}
            <span class="dsc-step-status">{{ STATUS_TEXT[step.status] }}</span>
          </div>
          <p v-if="step.kind === 'draw' && step.note" class="dsc-step-note">「{{ step.note }}」</p>
          <p v-if="step.detail" class="dsc-step-detail">{{ step.detail }}</p>
        </div>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import type { DrawSession, DrawStep, DrawStepStatus } from "@/types/drawSession";
import { listDrafts } from "@/utils/drawSession";

const props = defineProps<{ session: DrawSession; live?: boolean; actorName?: string }>();
const emit = defineEmits<{
  /** 使用者要把聊天裡的圖換成這張 */
  (e: "pick", attempt: number): void;
  /** 使用者要角色往這張的方向調 */
  (e: "steer", attempt: number): void;
}>();

const STATUS_TEXT: Record<DrawStepStatus, string> = {
  running: "進行中…",
  success: "✓",
  error: "失敗",
  cancelled: "已取消",
};

const drafts = computed(() => listDrafts(props.session));
const drawing = computed(() => props.session.steps.find((s) => s.kind === "draw" && s.status === "running"));
const selectedAttempt = ref<number | null>(null);
const showPrompt = ref(false);
const stepsOpen = ref(false);

/** 沒點過就看「聊天裡用的那張」，還沒選就看最新一張 */
const selected = computed<DrawStep | undefined>(() => {
  const list = drafts.value;
  if (!list.length) return undefined;
  const want = selectedAttempt.value ?? props.session.chosenAttempt ?? list[list.length - 1].attempt;
  return list.find((d) => d.attempt === want) ?? list[list.length - 1];
});

const headerStatus = computed(() => {
  const count = drafts.value.length;
  if (props.live) return drawing.value ? `試畫 #${drawing.value.attempt ?? "…"} 中` : count ? `試了 ${count} 張` : "準備中";
  if (!count) return "沒有畫成";
  return props.session.chosenAttempt ? `試了 ${count} 張，用 #${props.session.chosenAttempt}` : `試了 ${count} 張`;
});

function stepTitle(step: DrawStep): string {
  if (step.kind === "draw") return step.attempt ? `試畫 #${step.attempt}` : "試畫";
  return step.title;
}

// 生成中畫好新的一張就自動跳過去看
watch(
  () => drafts.value.length,
  (count, previous) => {
    if (props.live && count > (previous ?? 0)) selectedAttempt.value = drafts.value[count - 1].attempt ?? null;
  },
);

// ===== 試畫圖片：存在 imageCache，用到才讀，讀過的記住 =====
const imageUrls = reactive<Record<string, string>>({});
watch(
  drafts,
  (list) => {
    for (const draft of list) {
      const refId = draft.imageRef;
      if (!refId || imageUrls[refId]) continue;
      void loadDraftImageUrl(refId, draft.mimeType).then((url) => {
        if (url) imageUrls[refId] = url;
      });
    }
  },
  { immediate: true },
);
</script>

<script lang="ts">
const draftImageCache = new Map<string, Promise<string | null>>();

/** 讀試畫圖（imageCache），回傳 data URL；同一張只讀一次 */
function loadDraftImageUrl(refId: string, mimeType?: string): Promise<string | null> {
  let pending = draftImageCache.get(refId);
  if (!pending) {
    pending = import("@/db/operations")
      .then(({ getChatImage }) => getChatImage(refId))
      .then((data) => {
        if (!data) return null;
        return data.startsWith("data:") ? data : `data:${mimeType || "image/png"};base64,${data}`;
      })
      .catch(() => null);
    draftImageCache.set(refId, pending);
    void pending.then((url) => {
      if (!url) draftImageCache.delete(refId);
    });
  }
  return pending;
}
</script>

<style scoped>
.draw-session-card {
  width: min(92%, 360px);
  margin: 6px auto;
  padding: 10px 12px;
  box-sizing: border-box;
  font-size: 13px;
  color: var(--color-text, #333);
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 14px;
}
.dsc-header { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.dsc-title { font-weight: 600; }
.dsc-count { font-size: 12px; color: var(--color-text-muted, #999); }
.live .dsc-count { color: var(--color-primary, #4caf50); }

.dsc-strip { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin; }
.dsc-thumb {
  position: relative;
  flex: 0 0 64px;
  height: 64px;
  padding: 0;
  overflow: hidden;
  background: var(--color-background, #f5f5f5);
  border: 2px solid transparent;
  border-radius: 10px;
  cursor: pointer;
}
.dsc-thumb.selected { border-color: var(--color-primary, #4caf50); }
.dsc-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dsc-thumb-placeholder { display: block; width: 100%; height: 100%; }
.dsc-thumb-num {
  position: absolute;
  left: 3px;
  bottom: 3px;
  padding: 0 5px;
  font-size: 11px;
  line-height: 16px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 8px;
}
.dsc-thumb-badge {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 16px;
  height: 16px;
  font-size: 11px;
  line-height: 16px;
  text-align: center;
  color: var(--color-on-primary-contrast, #fff);
  background: var(--color-primary, #4caf50);
  border-radius: 50%;
}
.dsc-thumb.drawing { display: flex; align-items: center; justify-content: center; cursor: default; }
.dsc-thumb-spinner { font-size: 11px; color: var(--color-primary, #4caf50); animation: dsc-pulse 1.4s ease-in-out infinite; }

.dsc-detail { margin-top: 8px; }
.dsc-detail-image { display: block; width: 100%; max-height: 360px; object-fit: contain; background: var(--color-background, #f5f5f5); border-radius: 10px; }
.dsc-note { margin: 6px 0 2px; color: var(--color-text-secondary, #666); overflow-wrap: anywhere; }
.dsc-link { padding: 2px 0; font-size: 12px; color: var(--color-primary, #4caf50); background: none; border: none; cursor: pointer; }
.dsc-prompt { margin: 4px 0 0; padding: 6px 8px; font-size: 12px; background: var(--color-background, #f5f5f5); border-radius: 8px; }
.dsc-prompt dt { color: var(--color-text-muted, #999); }
.dsc-prompt dd { margin: 0 0 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; user-select: text; }
.dsc-actions { display: flex; gap: 8px; margin-top: 8px; }
.dsc-btn {
  flex: 1;
  min-height: 34px;
  padding: 6px 10px;
  font-size: 13px;
  color: var(--color-text, #333);
  background: var(--color-background, #f5f5f5);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 10px;
  cursor: pointer;
}
.dsc-btn.primary { color: var(--color-on-primary-contrast, #fff); background: var(--color-primary, #4caf50); border-color: transparent; }
.dsc-btn:disabled { opacity: 0.5; cursor: default; }

.dsc-steps-toggle { display: block; margin-top: 6px; }
.dsc-steps { list-style: none; margin: 6px 0 0; padding: 0; }
.dsc-step { display: flex; gap: 8px; padding: 3px 0; }
.dsc-step-dot { flex: 0 0 7px; height: 7px; margin-top: 6px; background: var(--color-text-muted, #999); border-radius: 50%; }
.dsc-step[data-status="success"] .dsc-step-dot { background: var(--color-primary, #4caf50); }
.dsc-step[data-status="error"] .dsc-step-dot { background: var(--color-error, #d9534f); }
.dsc-step[data-status="running"] .dsc-step-dot { background: var(--color-primary, #4caf50); animation: dsc-pulse 1.4s ease-in-out infinite; }
.dsc-step-body { min-width: 0; flex: 1; }
.dsc-step-title { overflow-wrap: anywhere; }
.dsc-step-status { margin-left: 4px; font-size: 11px; color: var(--color-text-muted, #999); }
.dsc-step[data-status="error"] .dsc-step-status { color: var(--color-error, #d9534f); }
.dsc-step-note { margin: 2px 0 0; color: var(--color-text-secondary, #666); overflow-wrap: anywhere; }
.dsc-step-detail {
  margin: 2px 0 0;
  max-height: 96px;
  overflow-y: auto;
  font-size: 12px;
  color: var(--color-text-muted, #999);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
@keyframes dsc-pulse { 50% { opacity: 0.45; } }
@media (prefers-reduced-motion: reduce) {
  .dsc-thumb-spinner, .dsc-step[data-status="running"] .dsc-step-dot { animation: none; }
}
</style>
