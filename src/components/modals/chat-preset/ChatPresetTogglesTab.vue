<!-- src/components/modals/chat-preset/ChatPresetTogglesTab.vue -->
<script setup lang="ts">
/**
 * 專屬預設 第一頁：把全域提示詞在這個聊天強制開 / 強制關，或跟隨全域設定
 */
import { computed, ref } from "vue";
import { useChatPresetToggles, type PresetToggleMode } from "@/composables/useChatPreset";
import { useF2FPanel } from "@/composables/useF2FPanel";
import { useAdminStore } from "@/stores/admin";
import { useChatVariablesStore } from "@/stores/chatVariables";
import { CHAT_PROMPT_MODE_LABELS, type PresetToggleRow } from "@/utils/chatPromptPreset";

const props = defineProps<{
  characterId: string;
  isGroupChat: boolean;
  faceToFaceMode: boolean;
}>();

const adminStore = useAdminStore();
const chatVariablesStore = useChatVariablesStore();
void adminStore.loadAdminState();

const { modes, rowsByMode, adjustedCount, staleIds } = useChatPresetToggles({
  characterId: () => props.characterId,
  isGroupChat: () => props.isGroupChat,
});
const { layout: f2fLayout, owners: f2fOwners } = useF2FPanel();

/** 這個聊天現在實際在用的模式 */
const currentMode = computed<PresetToggleMode>(() =>
  props.isGroupChat ? "gc" : props.faceToFaceMode ? "f2f" : "online",
);
const mode = ref<PresetToggleMode>(currentMode.value);
const query = ref("");
// 已經有調整時先只列出調整過的，一眼看出這個聊天和全域設定差在哪
const onlyAdjusted = ref(adjustedCount(mode.value) > 0);
/** 「只看已調整」時，這次剛動過的條目即使改回跟隨也先留在畫面上，避免一點就消失 */
const touchedIds = ref(new Set<string>());
const expandedId = ref<string | null>(null);

const rows = computed(() => rowsByMode.value[mode.value] ?? []);
const modeAdjustedCount = computed(() => adjustedCount(mode.value));

const visibleRows = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  // 有輸入關鍵字時找的是全部條目：要調整新條目的人不該被「只看已調整」擋住
  if (keyword) return rows.value.filter((row) => row.name.toLowerCase().includes(keyword));
  if (!onlyAdjusted.value) return rows.value;
  return rows.value.filter((row) => row.override !== null || touchedIds.value.has(row.identifier));
});

const f2fModuleTitles = computed(
  () => new Map(f2fLayout.value.modules.map((module) => [module.id, module.title])),
);

function moduleTitle(row: PresetToggleRow): string | null {
  if (mode.value !== "f2f") return null;
  const owner = f2fOwners.value.get(row.identifier);
  return owner ? (f2fModuleTitles.value.get(owner) ?? null) : null;
}

function switchMode(next: PresetToggleMode) {
  mode.value = next;
  expandedId.value = null;
  touchedIds.value = new Set();
}

function setOnlyAdjusted(value: boolean) {
  onlyAdjusted.value = value;
  touchedIds.value = new Set();
}

function setOverride(row: PresetToggleRow, value: boolean | null) {
  touchedIds.value = new Set(touchedIds.value).add(row.identifier);
  chatVariablesStore.setPromptOverride(row.identifier, value);
}

function resetMode() {
  const ids = rows.value.filter((row) => row.override !== null).map((row) => row.identifier);
  if (ids.length === 0) return;
  const label = CHAT_PROMPT_MODE_LABELS[mode.value];
  if (!confirm(`把「${label}」的 ${ids.length} 項調整全部改回跟隨全域設定？`)) return;
  chatVariablesStore.resetPromptOverrides(ids);
  touchedIds.value = new Set();
}

function clearStale() {
  chatVariablesStore.resetPromptOverrides(staleIds.value);
}

function isContentLocked(row: PresetToggleRow): boolean {
  return !!row.prompt.adminOnly && !adminStore.isAdmin;
}

function toggleExpanded(row: PresetToggleRow) {
  expandedId.value = expandedId.value === row.identifier ? null : row.identifier;
}
</script>

<template>
  <div class="preset-tab">
    <div v-if="modes.length > 1" class="preset-row-line" role="tablist" aria-label="提示詞模式">
      <button
        v-for="item in modes"
        :key="item"
        type="button"
        role="tab"
        :aria-selected="mode === item"
        :class="['preset-chip', { active: mode === item }]"
        @click="switchMode(item)"
      >
        {{ CHAT_PROMPT_MODE_LABELS[item] }}{{ item === currentMode ? "（目前）" : "" }}
        <span v-if="adjustedCount(item) > 0" class="preset-count">{{ adjustedCount(item) }}</span>
      </button>
    </div>

    <p class="preset-hint">
      「跟隨」會跟著全域設定走。選「開」或「關」則讓這個聊天固定用那個狀態，之後全域怎麼改都不受影響。
    </p>

    <p v-if="staleIds.length > 0" class="preset-notice inline">
      <span>有 {{ staleIds.length }} 項調整對應的條目已經不存在。</span>
      <button type="button" class="preset-link" @click="clearStale">清除</button>
    </p>

    <div class="preset-toolbar">
      <input v-model="query" class="preset-input" type="search" placeholder="搜尋條目" aria-label="搜尋條目" />
      <button
        type="button"
        :class="['preset-chip', { active: onlyAdjusted }]"
        :aria-pressed="onlyAdjusted"
        @click="setOnlyAdjusted(!onlyAdjusted)"
      >
        只看已調整
      </button>
    </div>

    <div v-if="modeAdjustedCount > 0" class="preset-row-line spread">
      <span class="preset-field-label">已調整 {{ modeAdjustedCount }} 項</span>
      <button type="button" class="preset-link" @click="resetMode">全部改回跟隨</button>
    </div>

    <ul class="preset-list">
      <li
        v-for="row in visibleRows"
        :key="row.identifier"
        :class="['preset-entry', { off: !row.enabled, structural: row.structural }]"
      >
        <div class="preset-entry-row">
          <button
            type="button"
            class="preset-entry-main"
            :aria-expanded="expandedId === row.identifier"
            @click="toggleExpanded(row)"
          >
            <span class="preset-entry-name">{{ row.name }}</span>
            <span class="preset-entry-meta">
              <span>全域：{{ row.defaultEnabled ? "開" : "關" }}</span>
              <span v-if="moduleTitle(row)" class="preset-badge">{{ moduleTitle(row) }}</span>
              <span v-if="row.override !== null" class="preset-badge">已調整</span>
            </span>
          </button>
          <div class="preset-tri" role="group" :aria-label="`${row.name} 在這個聊天的狀態`">
            <button type="button" :aria-pressed="row.override === null" @click="setOverride(row, null)">
              跟隨
            </button>
            <button type="button" class="on" :aria-pressed="row.override === true" @click="setOverride(row, true)">
              開
            </button>
            <button type="button" class="off" :aria-pressed="row.override === false" @click="setOverride(row, false)">
              關
            </button>
          </div>
        </div>
        <div v-if="expandedId === row.identifier" class="preset-entry-content">
          <template v-if="isContentLocked(row)">此提示詞內容僅限管理員查看。</template>
          <template v-else-if="row.structural">這是用來分隔段落的標籤條目，沒有內容。</template>
          <template v-else>
            <span v-if="row.description">{{ row.description }}</span>
            <pre>{{ row.prompt.content }}</pre>
          </template>
        </div>
      </li>
    </ul>

    <div v-if="visibleRows.length === 0" class="preset-empty">
      <template v-if="query.trim()">沒有符合的條目</template>
      <template v-else-if="onlyAdjusted">
        「{{ CHAT_PROMPT_MODE_LABELS[mode] }}」還沒有調整任何條目，全部跟隨全域設定。
      </template>
      <template v-else>這個模式沒有可調整的條目</template>
    </div>
    <button
      v-if="onlyAdjusted && !query.trim()"
      type="button"
      class="preset-btn block"
      @click="setOnlyAdjusted(false)"
    >
      顯示全部 {{ rows.length }} 個條目
    </button>
  </div>
</template>
