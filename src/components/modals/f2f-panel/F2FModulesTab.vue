<!-- src/components/modals/f2f-panel/F2FModulesTab.vue -->
<script setup lang="ts">
/**
 * 面對面設定面板 第二頁：模塊
 * 平常為使用模式（點選項切換條目），按「編輯」才能新增/修改模塊
 */
import { onBeforeUnmount, ref, watch } from "vue";
import { useF2FPanel } from "@/composables/useF2FPanel";
import type { F2FPanelModule } from "@/types/f2fPanel";
import { clonePlain, describeStyleImpact, pruneStyles } from "@/utils/f2fPanelEngine";
import F2FModuleEditor from "./F2FModuleEditor.vue";

const emit = defineEmits<{ editing: [value: boolean] }>();

const { layout, selections, currentOptionIds, selectOption, selectNone, saveLayout } = useF2FPanel();

const editing = ref(false);
/** undefined：未開啟編輯器；null：新增模塊 */
const editorTarget = ref<F2FPanelModule | null | undefined>(undefined);

watch(editorTarget, (value) => emit("editing", value !== undefined));
onBeforeUnmount(() => emit("editing", false));

function isManual(module: F2FPanelModule): boolean {
  return selections.value.get(module.id)?.status === "manual";
}

/** 列出風格會受什麼影響；沒有影響時回傳空字串 */
function styleImpactText(impact: { changed: string[]; removed: string[] }): string {
  const lines: string[] = [];
  if (impact.changed.length > 0) lines.push(`這些風格會刪去對應的選擇：${impact.changed.join("、")}`);
  if (impact.removed.length > 0) lines.push(`這些風格會因此沒有任何選擇而被刪除：${impact.removed.join("、")}`);
  return lines.join("\n");
}

async function saveModule(module: F2FPanelModule) {
  const next = clonePlain(layout.value);
  const index = next.modules.findIndex((m) => m.id === module.id);
  if (index >= 0) next.modules[index] = module;
  else next.modules.push(module);

  const styles = pruneStyles(next.modules, next.styles);
  const impact = styleImpactText(describeStyleImpact(next.styles, styles));
  if (impact && !confirm(`你移除的選項還有風格在使用。\n\n${impact}\n\n確定儲存？`)) return;
  next.styles = styles;

  await saveLayout(next);
  editorTarget.value = undefined;
}

async function removeModule(module: F2FPanelModule) {
  const next = clonePlain(layout.value);
  next.modules = next.modules.filter((m) => m.id !== module.id);
  const styles = pruneStyles(next.modules, next.styles);
  const impact = styleImpactText(describeStyleImpact(next.styles, styles));
  const message = `確定刪除模塊「${module.title}」？\n條目本身不會被刪除。${impact ? `\n\n${impact}` : ""}`;
  if (!confirm(message)) return;
  next.styles = styles;
  await saveLayout(next);
}

async function moveModule(index: number, delta: number) {
  const target = index + delta;
  const next = clonePlain(layout.value);
  if (target < 0 || target >= next.modules.length) return;
  [next.modules[index], next.modules[target]] = [next.modules[target], next.modules[index]];
  await saveLayout(next);
}
</script>

<template>
  <F2FModuleEditor
    v-if="editorTarget !== undefined"
    :module="editorTarget"
    @save="saveModule"
    @cancel="editorTarget = undefined"
  />

  <div v-else class="f2f-tab">
    <div class="f2f-row spread">
      <span class="f2f-field-label">{{ editing ? "調整模塊結構" : "點選項即可切換條目" }}</span>
      <div class="f2f-row">
        <button v-if="editing" type="button" class="f2f-btn" @click="editorTarget = null">＋新增模塊</button>
        <button type="button" :class="['f2f-btn', { primary: editing }]" @click="editing = !editing">
          {{ editing ? "完成" : "編輯" }}
        </button>
      </div>
    </div>

    <p v-if="layout.modules.length === 0" class="f2f-empty">還沒有模塊，按「編輯」→「新增模塊」開始</p>

    <div v-for="(module, index) in layout.modules" :key="module.id" class="f2f-card">
      <div class="f2f-row spread">
        <div class="f2f-row">
          <span class="f2f-card-title">{{ module.title }}</span>
          <span class="f2f-badge muted">{{ module.mode === "single" ? "單選" : "複選" }}</span>
          <span v-if="isManual(module)" class="f2f-badge warn">已手動調整</span>
        </div>
        <div v-if="editing" class="f2f-row">
          <button type="button" class="f2f-btn" :disabled="index === 0" @click="moveModule(index, -1)">↑</button>
          <button
            type="button"
            class="f2f-btn"
            :disabled="index === layout.modules.length - 1"
            @click="moveModule(index, 1)"
          >
            ↓
          </button>
          <button type="button" class="f2f-btn" @click="editorTarget = module">編輯</button>
          <button type="button" class="f2f-btn danger" @click="removeModule(module)">刪除</button>
        </div>
      </div>

      <div v-if="!editing" class="f2f-chips">
        <button
          v-if="module.mode === 'single' && module.allowNone"
          type="button"
          :class="['f2f-chip', { active: !isManual(module) && currentOptionIds(module).length === 0 }]"
          @click="selectNone(module)"
        >
          不選
        </button>
        <button
          v-for="option in module.options"
          :key="option.id"
          type="button"
          :class="['f2f-chip', { active: currentOptionIds(module).includes(option.id) }]"
          @click="selectOption(module, option.id)"
        >
          {{ option.label }}
        </button>
        <span v-if="module.options.length === 0" class="f2f-field-label">此模塊沒有可用選項</span>
      </div>
    </div>
  </div>
</template>
