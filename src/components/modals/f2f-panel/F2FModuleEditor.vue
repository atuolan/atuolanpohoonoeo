<!-- src/components/modals/f2f-panel/F2FModuleEditor.vue -->
<script setup lang="ts">
/**
 * 單一模塊編輯器：名稱、單選/複選、選項與連動條目
 */
import { computed, ref } from "vue";
import { ChevronLeft } from "lucide-vue-next";
import { useF2FPanel } from "@/composables/useF2FPanel";
import type { F2FPanelModule } from "@/types/f2fPanel";
import { clonePlain, createPanelId } from "@/utils/f2fPanelEngine";

const props = defineProps<{ module: F2FPanelModule | null }>();
const emit = defineEmits<{ save: [module: F2FPanelModule]; cancel: [] }>();

const { entries, owners, layout, entryName } = useF2FPanel();

const draft = ref<F2FPanelModule>(
  props.module
    ? clonePlain(props.module)
    : { id: createPanelId("mod"), title: "", mode: "single", allowNone: false, options: [] },
);

type PickerMode = { kind: "new" } | { kind: "link"; optionId: string };
const picker = ref<PickerMode | null>(null);
const picked = ref<string[]>([]);

const moduleTitles = computed(() => new Map(layout.value.modules.map((m) => [m.id, m.title])));
const draftEntryIds = computed(() => new Set(draft.value.options.flatMap((o) => o.entries)));
const pickableEntries = computed(() => entries.value.filter((entry) => !entry.structural));

function otherOwnerTitle(identifier: string): string | null {
  const owner = owners.value.get(identifier);
  return owner && owner !== draft.value.id ? (moduleTitles.value.get(owner) ?? null) : null;
}

function isPickDisabled(identifier: string): boolean {
  if (otherOwnerTitle(identifier)) return true;
  const mode = picker.value;
  if (!mode) return true;
  if (mode.kind === "new") return draftEntryIds.value.has(identifier);
  const option = draft.value.options.find((o) => o.id === mode.optionId);
  return option?.entries.includes(identifier) ?? true;
}

function openPicker(mode: PickerMode) {
  picker.value = mode;
  picked.value = [];
}

function confirmPicker() {
  const mode = picker.value;
  if (!mode) return;
  if (mode.kind === "new") {
    for (const identifier of picked.value) {
      draft.value.options.push({ id: createPanelId("opt"), label: entryName(identifier), entries: [identifier] });
    }
  } else {
    const option = draft.value.options.find((o) => o.id === mode.optionId);
    if (option) option.entries.push(...picked.value.filter((id) => !option.entries.includes(id)));
  }
  picker.value = null;
}

function moveOption(index: number, delta: number) {
  const target = index + delta;
  const options = draft.value.options;
  if (target < 0 || target >= options.length) return;
  [options[index], options[target]] = [options[target], options[index]];
}

function removeOption(index: number) {
  draft.value.options.splice(index, 1);
}

function removeLinkedEntry(optionIndex: number, identifier: string) {
  const option = draft.value.options[optionIndex];
  if (option.entries.length > 1) option.entries = option.entries.filter((id) => id !== identifier);
}

const editorTitle = computed(() => (props.module ? "編輯模塊" : "新增模塊"));
const pickerTitle = computed(() => {
  const mode = picker.value;
  if (!mode) return "";
  if (mode.kind === "new") return "選擇要新增為選項的條目";
  const option = draft.value.options.find((o) => o.id === mode.optionId);
  return `為「${option?.label ?? ""}」選擇連動條目`;
});

const canSave = computed(() => draft.value.title.trim() !== "" && draft.value.options.length > 0);

function save() {
  if (!canSave.value) return;
  const result = clonePlain(draft.value);
  result.title = result.title.trim();
  if (result.mode === "multi") result.allowNone = false;
  for (const option of result.options) {
    if (option.label.trim() === "") option.label = entryName(option.entries[0]);
  }
  emit("save", result);
}
</script>

<template>
  <div class="f2f-tab">
    <!-- 條目挑選器 -->
    <template v-if="picker">
      <div class="f2f-editor-head">
        <button type="button" class="f2f-icon-btn" aria-label="返回" @click="picker = null">
          <ChevronLeft :size="20" />
        </button>
        <span>{{ pickerTitle }}</span>
      </div>
      <p class="f2f-field-label">已選 {{ picked.length }}</p>
      <ul class="f2f-entry-list">
        <li v-for="entry in pickableEntries" :key="entry.identifier" class="f2f-entry">
          <label class="f2f-check f2f-entry-main">
            <input
              v-model="picked"
              type="checkbox"
              :value="entry.identifier"
              :disabled="isPickDisabled(entry.identifier)"
            />
            <span class="f2f-entry-name">{{ entry.name }}</span>
            <span v-if="otherOwnerTitle(entry.identifier)" class="f2f-badge muted">
              已在「{{ otherOwnerTitle(entry.identifier) }}」
            </span>
          </label>
        </li>
      </ul>
      <div class="f2f-editor-footer">
        <button type="button" class="f2f-btn" @click="picker = null">取消</button>
        <button type="button" class="f2f-btn primary" :disabled="picked.length === 0" @click="confirmPicker">
          確定
        </button>
      </div>
    </template>

    <!-- 模塊表單 -->
    <template v-else>
      <div class="f2f-editor-head">
        <button type="button" class="f2f-icon-btn" aria-label="返回" @click="emit('cancel')">
          <ChevronLeft :size="20" />
        </button>
        <span>{{ editorTitle }}</span>
      </div>
      <label class="f2f-field-label" for="f2f-module-title">模塊名稱</label>
      <input id="f2f-module-title" v-model="draft.title" class="f2f-input" placeholder="例如：文學風格" />

      <div class="f2f-row">
        <button
          type="button"
          :class="['f2f-chip', { active: draft.mode === 'single' }]"
          @click="draft.mode = 'single'"
        >
          單選
        </button>
        <button
          type="button"
          :class="['f2f-chip', { active: draft.mode === 'multi' }]"
          @click="draft.mode = 'multi'"
        >
          複選
        </button>
        <label v-if="draft.mode === 'single'" class="f2f-check">
          <input v-model="draft.allowNone" type="checkbox" />
          允許不選
        </label>
      </div>

      <div class="f2f-row spread">
        <span class="f2f-field-label">選項（第一個條目是主條目）</span>
        <button type="button" class="f2f-btn" @click="openPicker({ kind: 'new' })">＋新增選項</button>
      </div>
      <p v-if="draft.options.length === 0" class="f2f-empty">還沒有選項，點「新增選項」挑選條目</p>
      <div v-for="(option, index) in draft.options" :key="option.id" class="f2f-card">
        <div class="f2f-row">
          <input v-model="option.label" class="f2f-input" :aria-label="`選項 ${index + 1} 顯示名稱`" />
          <button type="button" class="f2f-btn" :disabled="index === 0" @click="moveOption(index, -1)">↑</button>
          <button
            type="button"
            class="f2f-btn"
            :disabled="index === draft.options.length - 1"
            @click="moveOption(index, 1)"
          >
            ↓
          </button>
          <button type="button" class="f2f-btn danger" @click="removeOption(index)">移除</button>
        </div>
        <div class="f2f-chips">
          <span
            v-for="(identifier, entryIndex) in option.entries"
            :key="identifier"
            :class="['f2f-badge', { muted: entryIndex > 0 }]"
          >
            {{ entryIndex > 0 ? `連動・${entryName(identifier)}` : entryName(identifier) }}
            <button
              v-if="option.entries.length > 1"
              type="button"
              class="f2f-icon-btn"
              :aria-label="`取消連動 ${entryName(identifier)}`"
              @click="removeLinkedEntry(index, identifier)"
            >
              ×
            </button>
          </span>
          <button type="button" class="f2f-chip" @click="openPicker({ kind: 'link', optionId: option.id })">
            ＋連動
          </button>
        </div>
      </div>

      <div class="f2f-editor-footer">
        <button type="button" class="f2f-btn" @click="emit('cancel')">取消</button>
        <button type="button" class="f2f-btn primary" :disabled="!canSave" @click="save">儲存模塊</button>
      </div>
    </template>
  </div>
</template>
