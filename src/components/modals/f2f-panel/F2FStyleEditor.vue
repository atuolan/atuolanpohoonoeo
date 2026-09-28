<!-- src/components/modals/f2f-panel/F2FStyleEditor.vue -->
<script setup lang="ts">
/**
 * 單一風格編輯器：選擇要納入哪些模塊，以及各模塊的選項
 * 只編輯草稿，不會改動目前的條目開關
 */
import { computed, ref } from "vue";
import { ChevronLeft } from "lucide-vue-next";
import { useF2FPanel } from "@/composables/useF2FPanel";
import type { F2FPanelModule, F2FPanelStyle } from "@/types/f2fPanel";
import { clonePlain, createPanelId, nextSelection } from "@/utils/f2fPanelEngine";

// 不用 `style` 當 prop 名稱，避免和 Vue 的 style fallthrough attribute 混淆
const props = defineProps<{ styleDef: F2FPanelStyle | null }>();
const emit = defineEmits<{ save: [style: F2FPanelStyle]; cancel: [] }>();

const { layout, selections } = useF2FPanel();

function initialSelections(): Record<string, string[]> {
  if (props.styleDef) return clonePlain(props.styleDef.selections);
  return {};
}

const name = ref(props.styleDef?.name ?? "");
const desc = ref(props.styleDef?.desc ?? "");
const draftSelections = ref<Record<string, string[]>>(initialSelections());

function isIncluded(module: F2FPanelModule): boolean {
  return Object.prototype.hasOwnProperty.call(draftSelections.value, module.id);
}

function toggleIncluded(module: F2FPanelModule, event: Event) {
  if ((event.target as HTMLInputElement).checked) {
    const selection = selections.value.get(module.id);
    draftSelections.value[module.id] = selection?.status === "matched" ? [...selection.optionIds] : [];
  } else {
    delete draftSelections.value[module.id];
  }
}

function clickOption(module: F2FPanelModule, optionId: string) {
  draftSelections.value[module.id] = nextSelection(module, draftSelections.value[module.id] ?? [], optionId);
}

const editorTitle = computed(() => (props.styleDef ? "編輯風格" : "新增風格"));

const canSave = computed(() => name.value.trim() !== "" && Object.keys(draftSelections.value).length > 0);

function save() {
  if (!canSave.value) return;
  emit("save", {
    id: props.styleDef?.id ?? createPanelId("style"),
    name: name.value.trim(),
    desc: desc.value.trim(),
    selections: clonePlain(draftSelections.value),
  });
}
</script>

<template>
  <div class="f2f-tab">
    <div class="f2f-editor-head">
      <button type="button" class="f2f-icon-btn" aria-label="返回" @click="emit('cancel')">
        <ChevronLeft :size="20" />
      </button>
      <span>{{ editorTitle }}</span>
    </div>
    <label class="f2f-field-label" for="f2f-style-name">風格名稱</label>
    <input id="f2f-style-name" v-model="name" class="f2f-input" placeholder="例如：溫柔日常" />
    <label class="f2f-field-label" for="f2f-style-desc">說明（選填）</label>
    <input id="f2f-style-desc" v-model="desc" class="f2f-input" />

    <p class="f2f-field-label">勾選這個風格要控制的模塊（會帶入目前的選擇）；沒勾的模塊套用時保持不變。</p>
    <div v-for="module in layout.modules" :key="module.id" :class="['f2f-card', { active: isIncluded(module) }]">
      <label class="f2f-check">
        <input type="checkbox" :checked="isIncluded(module)" @change="toggleIncluded(module, $event)" />
        <span class="f2f-card-title">{{ module.title }}</span>
        <span class="f2f-badge muted">{{ module.mode === "single" ? "單選" : "複選" }}</span>
      </label>
      <div v-if="isIncluded(module)" class="f2f-chips">
        <button
          v-for="option in module.options"
          :key="option.id"
          type="button"
          :class="['f2f-chip', { active: draftSelections[module.id].includes(option.id) }]"
          @click="clickOption(module, option.id)"
        >
          {{ option.label }}
        </button>
        <span v-if="draftSelections[module.id].length === 0" class="f2f-field-label">未選任何選項＝套用時全部關閉</span>
      </div>
    </div>

    <div class="f2f-editor-footer">
      <button type="button" class="f2f-btn" @click="emit('cancel')">取消</button>
      <button type="button" class="f2f-btn primary" :disabled="!canSave" @click="save">儲存風格</button>
    </div>
  </div>
</template>
