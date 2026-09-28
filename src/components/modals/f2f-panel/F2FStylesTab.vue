<!-- src/components/modals/f2f-panel/F2FStylesTab.vue -->
<script setup lang="ts">
/**
 * 面對面設定面板 第一頁：風格
 * 風格只改它包含的模塊；其他模塊（例如視角、語言）保持不動
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useF2FPanel } from "@/composables/useF2FPanel";
import type { F2FPanelStyle } from "@/types/f2fPanel";
import { clonePlain } from "@/utils/f2fPanelEngine";
import F2FStyleEditor from "./F2FStyleEditor.vue";

const emit = defineEmits<{ editing: [value: boolean] }>();

const { layout, activeStyleId, applyStyleById, saveLayout } = useF2FPanel();

const editing = ref(false);
/** undefined：未開啟編輯器；null：新增風格 */
const editorTarget = ref<F2FPanelStyle | null | undefined>(undefined);

watch(editorTarget, (value) => emit("editing", value !== undefined));
onBeforeUnmount(() => emit("editing", false));

const moduleTitles = computed(() => new Map(layout.value.modules.map((m) => [m.id, m.title])));
const activeStyleName = computed(
  () => layout.value.styles.find((s) => s.id === activeStyleId.value)?.name ?? null,
);

function includedTitles(style: F2FPanelStyle): string {
  return Object.keys(style.selections)
    .map((id) => moduleTitles.value.get(id))
    .filter(Boolean)
    .join("、");
}

async function saveStyle(style: F2FPanelStyle) {
  const next = clonePlain(layout.value);
  const index = next.styles.findIndex((s) => s.id === style.id);
  if (index >= 0) next.styles[index] = style;
  else next.styles.push(style);
  await saveLayout(next);
  editorTarget.value = undefined;
}

async function removeStyle(style: F2FPanelStyle) {
  if (!confirm(`確定刪除風格「${style.name}」？條目開關不會改變。`)) return;
  const next = clonePlain(layout.value);
  next.styles = next.styles.filter((s) => s.id !== style.id);
  await saveLayout(next);
}

function onCardClick(style: F2FPanelStyle) {
  if (!editing.value) applyStyleById(style.id);
}
</script>

<template>
  <F2FStyleEditor
    v-if="editorTarget !== undefined"
    :style-def="editorTarget"
    @save="saveStyle"
    @cancel="editorTarget = undefined"
  />

  <div v-else class="f2f-tab">
    <div class="f2f-row spread">
      <span class="f2f-field-label">
        {{ activeStyleName ? `目前符合：${activeStyleName}` : "目前為自訂組合" }}
      </span>
      <div class="f2f-row">
        <button v-if="editing" type="button" class="f2f-btn" @click="editorTarget = null">＋新增風格</button>
        <button type="button" :class="['f2f-btn', { primary: editing }]" @click="editing = !editing">
          {{ editing ? "完成" : "編輯" }}
        </button>
      </div>
    </div>

    <p v-if="layout.styles.length === 0" class="f2f-empty">還沒有風格，按「編輯」→「新增風格」把目前的組合存起來</p>

    <div
      v-for="style in layout.styles"
      :key="style.id"
      :class="['f2f-card', { active: style.id === activeStyleId }]"
      :role="editing ? undefined : 'button'"
      :tabindex="editing ? undefined : 0"
      @click="onCardClick(style)"
      @keydown.enter="onCardClick(style)"
      @keydown.space.prevent="onCardClick(style)"
    >
      <div class="f2f-row spread">
        <span class="f2f-card-title">{{ style.name }}</span>
        <div v-if="editing" class="f2f-row">
          <button type="button" class="f2f-btn" @click.stop="editorTarget = style">編輯</button>
          <button type="button" class="f2f-btn danger" @click.stop="removeStyle(style)">刪除</button>
        </div>
      </div>
      <p v-if="style.desc" class="f2f-card-desc">{{ style.desc }}</p>
      <p class="f2f-card-desc">控制：{{ includedTitles(style) }}</p>
    </div>
  </div>
</template>
