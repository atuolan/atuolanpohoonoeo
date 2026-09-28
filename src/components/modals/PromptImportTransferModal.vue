<script setup lang="ts">
/**
 * 導入條目（預設轉移）
 * 左邊是酒館預設檔裡的條目，右邊是目前模式的條目順序。
 * 條目只能從檔案移入小手機（單向），可以設定插入點、拖曳到指定位置，確認後一次套用。
 */
import {
  buildInsertPlan,
  insertRowsAt,
  movePendingRows,
  removeRows,
  type ImportTargetEntry,
  type ImportedPromptItem,
  type TransferRow,
} from "@/utils/promptImportTransfer";
import {
  ArrowRight,
  Check,
  ChevronDown,
  FolderOpen,
  GripVertical,
  ListEnd,
  ListStart,
  Search,
  Undo2,
  X,
} from "lucide-vue-next";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

type SourceItem = ImportedPromptItem & { key: string };

const props = defineProps<{
  items: ImportedPromptItem[];
  sourceFileName: string;
  targetLabel: string;
  targetEntries: ImportTargetEntry[];
  /** 插入單一條目，回傳新條目的 identifier */
  insertPrompt: (item: ImportedPromptItem, insertIndex: number) => Promise<string>;
}>();

const emit = defineEmits<{
  close: [];
  repick: [];
}>();

const CORE_IDENTIFIERS = new Set([
  "main",
  "nsfw",
  "jailbreak",
  "enhanceDefinitions",
  "charDescription",
  "charPersonality",
  "scenario",
  "personaDescription",
  "worldInfoBefore",
  "worldInfoAfter",
  "dialogueExamples",
  "chatHistory",
  "authorsNote",
]);

// ===== 來源（檔案） =====
let batchSeq = 0;
let rowSeq = 0;
const batchId = ref(0);
const search = ref("");
const showMarkers = ref(false);
const selectedKeys = ref(new Set<string>());
const appliedKeys = ref(new Set<string>());
const expandedKey = ref<string | null>(null);

watch(
  () => props.items,
  () => {
    batchId.value = ++batchSeq;
    selectedKeys.value = new Set();
    expandedKey.value = null;
    search.value = "";
  },
  { immediate: true },
);

const sourceItems = computed<SourceItem[]>(() =>
  props.items.map((item, index) => ({ ...item, key: `${batchId.value}:${index}` })),
);

const markerCount = computed(() => sourceItems.value.filter((item) => item.marker).length);

const visibleSourceItems = computed(() => {
  const query = search.value.trim().toLowerCase();
  return sourceItems.value.filter((item) => {
    if (item.marker && !showMarkers.value) return false;
    if (!query) return true;
    return (
      item.name.toLowerCase().includes(query) ||
      item.sourceIdentifier.toLowerCase().includes(query) ||
      item.content.toLowerCase().includes(query)
    );
  });
});

const pendingSourceKeys = computed(
  () =>
    new Set(
      rows.value.flatMap((row) => (row.kind === "pending" ? [row.sourceKey] : [])),
    ),
);

function getSourceState(item: SourceItem): "available" | "pending" | "applied" {
  if (pendingSourceKeys.value.has(item.key)) return "pending";
  if (appliedKeys.value.has(item.key)) return "applied";
  return "available";
}

const selectedSourceItems = computed(() =>
  sourceItems.value.filter(
    (item) => selectedKeys.value.has(item.key) && getSourceState(item) === "available",
  ),
);

const visibleAvailableItems = computed(() =>
  visibleSourceItems.value.filter((item) => getSourceState(item) === "available"),
);

function toggleSelect(item: SourceItem) {
  if (consumeSuppressedClick()) return;
  if (getSourceState(item) !== "available") return;
  const next = new Set(selectedKeys.value);
  if (next.has(item.key)) next.delete(item.key);
  else next.add(item.key);
  selectedKeys.value = next;
}

function selectAllVisible() {
  const next = new Set(selectedKeys.value);
  visibleAvailableItems.value.forEach((item) => next.add(item.key));
  selectedKeys.value = next;
}

function clearSelection() {
  selectedKeys.value = new Set();
}

function toggleExpand(key: string) {
  expandedKey.value = expandedKey.value === key ? null : key;
}

function getItemTag(item: ImportedPromptItem): string | null {
  if (item.marker) return "插槽";
  if (CORE_IDENTIFIERS.has(item.sourceIdentifier)) return "核心";
  return null;
}

// ===== 目標（目前模式） =====
const rows = ref<TransferRow[]>([]);
const cursor = ref(0);
const flashKeys = ref(new Set<string>());
const targetListRef = ref<HTMLElement | null>(null);
const applying = ref(false);
const statusMessage = ref("");
const errorMessage = ref("");

const entryById = computed(
  () => new Map(props.targetEntries.map((entry) => [entry.identifier, entry])),
);

const pendingCount = computed(
  () => rows.value.filter((row) => row.kind === "pending").length,
);

function buildExistingRows(): TransferRow[] {
  return props.targetEntries.map((entry, index): TransferRow => ({
    kind: "existing",
    key: `e:${index}:${entry.identifier}`,
    identifier: entry.identifier,
  }));
}

let cursorInitialized = false;
watch(
  () => props.targetEntries,
  () => {
    // 有待加入條目時不重建，避免打亂使用者排好的位置
    if (pendingCount.value > 0) return;
    rows.value = buildExistingRows();
    cursor.value = cursorInitialized
      ? Math.min(cursor.value, rows.value.length)
      : rows.value.length;
    cursorInitialized = true;
  },
  { immediate: true },
);

function getRowName(row: TransferRow): string {
  if (row.kind === "pending") return row.item.name;
  return entryById.value.get(row.identifier)?.name || row.identifier;
}

function getRowRole(row: TransferRow): string {
  if (row.kind === "pending") return row.item.role;
  return entryById.value.get(row.identifier)?.role || "system";
}

function isRowDisabled(row: TransferRow): boolean {
  if (row.kind === "pending") return !row.item.enabled;
  return entryById.value.get(row.identifier)?.enabled === false;
}

function isRowMarker(row: TransferRow): boolean {
  return row.kind === "existing" && !!entryById.value.get(row.identifier)?.marker;
}

function setCursor(index: number) {
  if (consumeSuppressedClick()) return;
  cursor.value = Math.max(0, Math.min(index, rows.value.length));
}

function scrollTargetTo(selector: string) {
  nextTick(() => {
    targetListRef.value
      ?.querySelector(selector)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
}

function flash(keys: string[]) {
  flashKeys.value = new Set(keys);
  setTimeout(() => {
    flashKeys.value = new Set();
  }, 900);
}

function stripKey(item: SourceItem): ImportedPromptItem {
  const { key: _key, ...rest } = item;
  return rest;
}

function transferAt(items: SourceItem[], index: number) {
  const movable = items.filter((item) => getSourceState(item) === "available");
  if (movable.length === 0) return;

  const newRows: TransferRow[] = movable.map((item) => ({
    kind: "pending",
    key: `p:${++rowSeq}`,
    sourceKey: item.key,
    item: stripKey(item),
  }));
  const safeIndex = Math.max(0, Math.min(index, rows.value.length));
  rows.value = insertRowsAt(rows.value, newRows, safeIndex);
  cursor.value = safeIndex + newRows.length;

  const next = new Set(selectedKeys.value);
  movable.forEach((item) => next.delete(item.key));
  selectedKeys.value = next;

  statusMessage.value = "";
  errorMessage.value = "";
  flash(newRows.map((row) => row.key));
  scrollTargetTo(".tr-cursor");
}

function transferSelected() {
  transferAt(selectedSourceItems.value, cursor.value);
}

function transferOne(item: SourceItem) {
  transferAt([item], cursor.value);
}

function removePending(key: string) {
  const index = rows.value.findIndex((row) => row.key === key);
  if (index === -1) return;
  rows.value = removeRows(rows.value, [key]);
  if (index < cursor.value) cursor.value -= 1;
}

function clearPending() {
  if (pendingCount.value === 0) return;
  rows.value = rows.value.filter((row) => row.kind === "existing");
  cursor.value = Math.min(cursor.value, rows.value.length);
}

async function applyPending() {
  if (applying.value) return;
  const snapshot = rows.value;
  const plan = buildInsertPlan(snapshot);
  if (plan.length === 0) return;

  applying.value = true;
  statusMessage.value = "";
  errorMessage.value = "";

  // 逐一插入；成功的列轉為既有條目，失敗時保留剩下的待加入條目
  const insertedIds = new Map<string, string>();
  const pendingRows = snapshot.filter(
    (row): row is Extract<TransferRow, { kind: "pending" }> => row.kind === "pending",
  );
  try {
    for (let i = 0; i < plan.length; i++) {
      const identifier = await props.insertPrompt(plan[i].item, plan[i].insertIndex);
      insertedIds.set(pendingRows[i].key, identifier);
      appliedKeys.value.add(pendingRows[i].sourceKey);
    }
    statusMessage.value = `已加入 ${plan.length} 個條目到「${props.targetLabel}」。`;
  } catch (error) {
    console.error("[PromptImportTransfer] 加入失敗:", error);
    errorMessage.value = `加入到第 ${insertedIds.size + 1} 個條目時失敗，已加入 ${insertedIds.size} 個，其餘仍保留在清單中。`;
  } finally {
    rows.value = snapshot.map((row, index): TransferRow => {
      const identifier = insertedIds.get(row.key);
      return identifier
        ? { kind: "existing", key: `e:new:${index}:${identifier}`, identifier }
        : row;
    });
    applying.value = false;
  }

  // 全部成功後，依目前模式的最新順序重建（保留插入點）
  await nextTick();
  if (pendingCount.value === 0) {
    rows.value = buildExistingRows();
    cursor.value = Math.min(cursor.value, rows.value.length);
  }
}

function requestClose() {
  if (applying.value) return;
  if (
    pendingCount.value > 0 &&
    !confirm(`還有 ${pendingCount.value} 個條目尚未套用，確定要關閉嗎？`)
  ) {
    return;
  }
  emit("close");
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    if (drag.value) cancelDrag();
    else requestClose();
  }
}

// ===== 拖曳（Pointer Events，滑鼠與觸控共用） =====
interface DragState {
  source: "left" | "right";
  keys: string[];
  label: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  dropIndex: number | null;
}

const DRAG_THRESHOLD = 5;
const AUTO_SCROLL_EDGE = 48;
const drag = ref<DragState | null>(null);
let autoScrollFrame = 0;
let suppressClick = false;

function consumeSuppressedClick(): boolean {
  if (!suppressClick) return false;
  suppressClick = false;
  return true;
}

function startDrag(
  event: PointerEvent,
  source: "left" | "right",
  key: string,
  fromHandle: boolean,
) {
  if (applying.value) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  // 觸控只能從把手拖曳，其他地方保留捲動
  if (!fromHandle && event.pointerType !== "mouse") return;
  if (fromHandle) event.preventDefault();

  let keys: string[];
  let label: string;
  if (source === "left") {
    const item = sourceItems.value.find((it) => it.key === key);
    if (!item || getSourceState(item) !== "available") return;
    const useSelection = selectedKeys.value.has(key) && selectedSourceItems.value.length > 1;
    keys = useSelection ? selectedSourceItems.value.map((it) => it.key) : [key];
    label = useSelection ? `${keys.length} 個條目` : item.name;
  } else {
    const row = rows.value.find((r) => r.key === key);
    if (!row || row.kind !== "pending") return;
    keys = [key];
    label = row.item.name;
  }

  drag.value = {
    source,
    keys,
    label,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    y: event.clientY,
    active: false,
    dropIndex: null,
  };
  window.addEventListener("pointermove", onDragMove, { passive: false });
  window.addEventListener("pointerup", onDragEnd);
  window.addEventListener("pointercancel", cancelDrag);
}

function computeDropIndex(x: number, y: number): number | null {
  const list = targetListRef.value;
  if (!list) return null;
  const rect = list.getBoundingClientRect();
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
    return null;
  }
  const rowEls = list.querySelectorAll<HTMLElement>("[data-row-index]");
  for (const el of rowEls) {
    const r = el.getBoundingClientRect();
    if (y < r.top + r.height / 2) return Number(el.dataset.rowIndex);
  }
  return rows.value.length;
}

function onDragMove(event: PointerEvent) {
  const state = drag.value;
  if (!state || event.pointerId !== state.pointerId) return;
  state.x = event.clientX;
  state.y = event.clientY;
  if (!state.active) {
    const dist = Math.hypot(state.x - state.startX, state.y - state.startY);
    if (dist < DRAG_THRESHOLD) return;
    state.active = true;
    autoScrollFrame = requestAnimationFrame(autoScrollTick);
  }
  event.preventDefault();
  state.dropIndex = computeDropIndex(state.x, state.y);
}

function autoScrollTick() {
  const state = drag.value;
  const list = targetListRef.value;
  if (!state?.active || !list) return;
  const rect = list.getBoundingClientRect();
  if (state.x >= rect.left && state.x <= rect.right) {
    let speed = 0;
    if (state.y < rect.top + AUTO_SCROLL_EDGE) {
      speed = -Math.ceil((rect.top + AUTO_SCROLL_EDGE - state.y) / 4);
    } else if (state.y > rect.bottom - AUTO_SCROLL_EDGE) {
      speed = Math.ceil((state.y - (rect.bottom - AUTO_SCROLL_EDGE)) / 4);
    }
    if (speed !== 0) {
      list.scrollTop += Math.max(-24, Math.min(24, speed));
      state.dropIndex = computeDropIndex(state.x, state.y);
    }
  }
  autoScrollFrame = requestAnimationFrame(autoScrollTick);
}

function finishDrag() {
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", onDragEnd);
  window.removeEventListener("pointercancel", cancelDrag);
  cancelAnimationFrame(autoScrollFrame);
  drag.value = null;
}

function cancelDrag() {
  if (drag.value?.active) suppressClick = true;
  finishDrag();
}

function onDragEnd(event: PointerEvent) {
  const state = drag.value;
  if (!state || event.pointerId !== state.pointerId) return;
  if (state.active) {
    suppressClick = true;
    // 部分瀏覽器在拖曳結束後不會觸發 click，稍後自動解除
    setTimeout(() => {
      suppressClick = false;
    }, 0);
    if (state.dropIndex !== null) {
      if (state.source === "left") {
        const keySet = new Set(state.keys);
        transferAt(
          sourceItems.value.filter((item) => keySet.has(item.key)),
          state.dropIndex,
        );
      } else {
        const result = movePendingRows(rows.value, state.keys, state.dropIndex);
        rows.value = result.rows;
        cursor.value = result.index + state.keys.length;
        flash(state.keys);
      }
    }
  }
  finishDrag();
}

const dragActive = computed(() => !!drag.value?.active);
const draggingKeys = computed(() =>
  drag.value?.active ? new Set(drag.value.keys) : new Set<string>(),
);
const dropIndex = computed(() => (drag.value?.active ? drag.value.dropIndex : null));

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  finishDrag();
});
</script>

<template>
  <div class="pit-overlay" @click.self="requestClose">
    <div
      class="pit-modal"
      :class="{ dragging: dragActive }"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pit-title"
    >
      <header class="pit-header">
        <h3 id="pit-title">導入條目</h3>
        <button class="pit-close" aria-label="關閉" @click="requestClose">
          <X :size="20" />
        </button>
      </header>

      <div class="pit-body">
        <!-- 來源：檔案條目 -->
        <section class="pit-panel source">
          <div class="pit-panel-head">
            <div class="pit-panel-title">
              <span class="pit-panel-kicker">來源檔案</span>
              <span class="pit-panel-name" :title="sourceFileName">
                {{ sourceFileName || "尚未選擇檔案" }}
              </span>
            </div>
            <button class="pit-text-btn" @click="emit('repick')">
              <FolderOpen :size="15" />
              換檔案
            </button>
          </div>

          <div class="pit-search">
            <Search :size="15" class="pit-search-icon" />
            <input
              v-model="search"
              type="search"
              placeholder="搜尋名稱或內容"
              class="pit-search-input"
            />
          </div>

          <div class="pit-toolbar">
            <span class="pit-count">
              已選 <strong>{{ selectedSourceItems.length }}</strong> /
              {{ visibleSourceItems.length }}
            </span>
            <div class="pit-toolbar-actions">
              <button
                v-if="markerCount > 0"
                class="pit-chip"
                :class="{ on: showMarkers }"
                @click="showMarkers = !showMarkers"
              >
                顯示插槽 {{ markerCount }}
              </button>
              <button class="pit-text-btn" @click="selectAllVisible">全選</button>
              <button
                class="pit-text-btn"
                :disabled="selectedKeys.size === 0"
                @click="clearSelection"
              >
                清除
              </button>
            </div>
          </div>

          <div class="pit-list">
            <div v-if="visibleSourceItems.length === 0" class="pit-empty">
              {{ search ? "找不到符合的條目" : "這個檔案沒有可導入的條目" }}
            </div>
            <div
              v-for="item in visibleSourceItems"
              :key="item.key"
              class="pit-row source-row"
              :class="{
                selected: selectedKeys.has(item.key) && getSourceState(item) === 'available',
                moved: getSourceState(item) !== 'available',
                dragging: drag?.active && drag.source === 'left' && drag.keys.includes(item.key),
                expanded: expandedKey === item.key,
              }"
            >
              <div
                class="pit-row-main"
                role="checkbox"
                :aria-checked="selectedKeys.has(item.key)"
                :aria-disabled="getSourceState(item) !== 'available'"
                @click="toggleSelect(item)"
                @pointerdown="startDrag($event, 'left', item.key, false)"
              >
                <span
                  v-if="getSourceState(item) === 'available'"
                  class="pit-handle"
                  aria-label="拖曳到右側"
                  @pointerdown.stop="startDrag($event, 'left', item.key, true)"
                  @click.stop
                >
                  <GripVertical :size="16" />
                </span>
                <span v-else class="pit-handle placeholder"></span>
                <span class="pit-check">
                  <Check v-if="selectedKeys.has(item.key)" :size="13" />
                </span>
                <span class="pit-name" :title="item.name">{{ item.name }}</span>
                <span v-if="getItemTag(item)" class="pit-tag kind">{{ getItemTag(item) }}</span>
                <span v-if="item.role !== 'system'" class="pit-tag" :class="`role-${item.role}`">{{ item.role }}</span>
                <span v-if="!item.enabled" class="pit-tag off">未啟用</span>
                <span v-if="getSourceState(item) === 'pending'" class="pit-tag pending">待加入</span>
                <span v-else-if="getSourceState(item) === 'applied'" class="pit-tag applied">已加入</span>
              </div>
              <div class="pit-row-actions">
                <button
                  class="pit-icon-btn"
                  :class="{ open: expandedKey === item.key }"
                  :aria-label="expandedKey === item.key ? '收合內容' : '預覽內容'"
                  @click="toggleExpand(item.key)"
                >
                  <ChevronDown :size="16" />
                </button>
                <button
                  class="pit-icon-btn move"
                  aria-label="移到插入點"
                  :disabled="getSourceState(item) !== 'available'"
                  @click="transferOne(item)"
                >
                  <ArrowRight :size="16" class="pit-dir-icon" />
                </button>
              </div>
              <div v-if="expandedKey === item.key" class="pit-preview">
                <div class="pit-preview-meta">
                  {{ item.sourceIdentifier }}
                  <template v-if="item.injection_position === 1">
                    · 深度 {{ item.injection_depth }} · 順序 {{ item.injection_order }}
                  </template>
                </div>
                <pre class="pit-preview-content">{{ item.content || "此條目沒有固定內容。" }}</pre>
              </div>
            </div>
          </div>
        </section>

        <!-- 中間：移入 -->
        <div class="pit-transfer">
          <button
            class="pit-transfer-btn"
            :disabled="selectedSourceItems.length === 0"
            @click="transferSelected"
          >
            <ArrowRight :size="20" class="pit-dir-icon" />
            <span>移入<template v-if="selectedSourceItems.length"> {{ selectedSourceItems.length }}</template></span>
          </button>
          <span class="pit-transfer-hint">放到插入點，或直接拖曳</span>
        </div>

        <!-- 目標：目前模式 -->
        <section class="pit-panel target">
          <div class="pit-panel-head">
            <div class="pit-panel-title">
              <span class="pit-panel-kicker">加入到</span>
              <span class="pit-panel-name">
                {{ targetLabel }}
                <span class="pit-panel-sub">{{ rows.length }} 條</span>
              </span>
            </div>
            <div class="pit-toolbar-actions">
              <button class="pit-icon-btn labeled" title="插入點移到最前面" @click="setCursor(0)">
                <ListStart :size="16" />
                最前
              </button>
              <button
                class="pit-icon-btn labeled"
                title="插入點移到最後面"
                @click="setCursor(rows.length)"
              >
                <ListEnd :size="16" />
                最後
              </button>
            </div>
          </div>
          <div class="pit-target-hint">點任一條目，插入點就會移到它的下方</div>

          <div
            ref="targetListRef"
            class="pit-list target-list"
            :class="{ 'drop-active': dropIndex !== null }"
          >
            <template v-for="(row, index) in rows" :key="row.key">
              <div v-if="!dragActive && cursor === index" class="tr-cursor">
                <span>插入點</span>
              </div>
              <div
                class="pit-row target-row"
                :class="{
                  pending: row.kind === 'pending',
                  off: isRowDisabled(row),
                  flash: flashKeys.has(row.key),
                  dragging: draggingKeys.has(row.key),
                  'drop-before': dropIndex === index,
                  'drop-after': dropIndex === rows.length && index === rows.length - 1,
                }"
                :data-row-index="index"
              >
                <div
                  class="pit-row-main"
                  @click="setCursor(index + 1)"
                  @pointerdown="row.kind === 'pending' && startDrag($event, 'right', row.key, false)"
                >
                  <span
                    v-if="row.kind === 'pending'"
                    class="pit-handle"
                    aria-label="拖曳調整位置"
                    @pointerdown.stop="startDrag($event, 'right', row.key, true)"
                    @click.stop
                  >
                    <GripVertical :size="16" />
                  </span>
                  <span v-else class="pit-index">{{ index + 1 }}</span>
                  <span class="pit-name" :title="getRowName(row)">{{ getRowName(row) }}</span>
                  <span v-if="row.kind === 'pending'" class="pit-tag pending">新</span>
                  <span v-if="isRowMarker(row)" class="pit-tag kind">插槽</span>
                  <span v-if="getRowRole(row) !== 'system'" class="pit-tag" :class="`role-${getRowRole(row)}`">{{ getRowRole(row) }}</span>
                  <span v-if="isRowDisabled(row)" class="pit-tag off">關</span>
                </div>
                <div v-if="row.kind === 'pending'" class="pit-row-actions">
                  <button
                    class="pit-icon-btn"
                    aria-label="移回來源"
                    title="移回來源"
                    @click="removePending(row.key)"
                  >
                    <X :size="16" />
                  </button>
                </div>
              </div>
            </template>
            <div v-if="!dragActive && cursor === rows.length" class="tr-cursor">
              <span>插入點</span>
            </div>
            <div v-if="rows.length === 0" class="pit-empty" :class="{ 'drop-before': dropIndex === 0 }">
              目前模式沒有條目，移入的條目會成為第一條
            </div>
          </div>
        </section>
      </div>

      <footer class="pit-footer">
        <div class="pit-status">
          <span v-if="errorMessage" class="error">{{ errorMessage }}</span>
          <span v-else-if="statusMessage" class="success">{{ statusMessage }}</span>
          <span v-else-if="pendingCount > 0">
            有 <strong>{{ pendingCount }}</strong> 個條目待加入，確認位置後按「套用」
          </span>
          <span v-else class="muted">勾選左邊的條目後移入，或按住把手拖到右邊</span>
        </div>
        <div class="pit-footer-actions">
          <button class="pit-btn secondary" :disabled="applying" @click="requestClose">關閉</button>
          <button
            class="pit-btn secondary"
            :disabled="pendingCount === 0 || applying"
            @click="clearPending"
          >
            <Undo2 :size="15" />
            全部移回
          </button>
          <button
            class="pit-btn primary"
            :disabled="pendingCount === 0 || applying"
            @click="applyPending"
          >
            {{ applying ? "加入中…" : `套用${pendingCount ? ` ${pendingCount} 個` : ""}` }}
          </button>
        </div>
      </footer>
    </div>

    <div
      v-if="drag?.active"
      class="pit-ghost"
      :class="{ invalid: drag.dropIndex === null }"
      :style="{ transform: `translate(${drag.x + 14}px, ${drag.y + 14}px)` }"
    >
      <GripVertical :size="14" />
      {{ drag.label }}
    </div>
  </div>
</template>

<style lang="scss" scoped>
.pit-overlay {
  position: fixed;
  inset: 0;
  height: 100dvh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.pit-modal {
  width: min(1100px, 100%);
  height: min(86vh, 820px);
  background: var(--color-surface);
  border-radius: 16px;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;

  &.dragging {
    user-select: none;
    -webkit-user-select: none;
    cursor: grabbing;
  }
}

.pit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;

  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text);
  }
}

.pit-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  color: var(--color-text-muted);

  &:hover {
    background: var(--color-background);
  }
}

.pit-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 92px minmax(0, 1fr);
  gap: 12px;
  padding: 16px 20px;
}

.pit-panel {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-background);
}

.pit-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.pit-panel-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.pit-panel-kicker {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  letter-spacing: 0.5px;
}

.pit-panel-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pit-panel-sub {
  font-size: 12px;
  font-weight: 400;
  color: var(--color-text-muted);
  margin-left: 4px;
}

.pit-search {
  position: relative;
  display: flex;
  align-items: center;
}

.pit-search-icon {
  position: absolute;
  left: 10px;
  color: var(--color-text-muted);
  pointer-events: none;
}

.pit-search-input {
  width: 100%;
  padding: 8px 12px 8px 32px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 14px;
  background: var(--color-surface);
  color: var(--color-text);

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
}

.pit-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.pit-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.pit-count {
  font-size: 12px;
  color: var(--color-text-muted);

  strong {
    color: var(--color-primary);
  }
}

.pit-target-hint {
  font-size: 12px;
  color: var(--color-text-muted);
}

.pit-text-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  font-size: 13px;
  color: var(--color-primary);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;

  &:hover:not(:disabled) {
    background: var(--color-primary-light);
  }

  &:disabled {
    color: var(--color-text-muted);
    cursor: default;
  }
}

.pit-chip {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  cursor: pointer;

  &.on {
    border-color: var(--color-primary);
    background: var(--color-primary-light);
    color: var(--color-primary);
  }
}

.pit-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 5px 2px 8px;
  overscroll-behavior: contain;
}

.pit-empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 13px;
  color: var(--color-text-muted);
  border-radius: var(--radius-md);
  position: relative;
}

.pit-row {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    opacity 0.15s ease;

  &.dragging {
    opacity: 0.4;
  }
}

.pit-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 4px 7px 6px;
  cursor: pointer;
  min-height: 40px;
}

.pit-row-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  padding-right: 4px;
}

.pit-handle {
  flex-shrink: 0;
  width: 22px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  cursor: grab;
  touch-action: none;
  border-radius: 6px;

  &:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  &.placeholder {
    cursor: default;
    &:hover {
      background: none;
    }
  }
}

.pit-check {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  border: 1.5px solid var(--color-border);
  background: var(--color-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.pit-index {
  flex-shrink: 0;
  min-width: 22px;
  text-align: center;
  font-size: 11px;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.pit-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pit-tag {
  flex-shrink: 0;
  font-size: 11px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 999px;
  background: var(--color-surface-hover);
  color: var(--color-text-secondary);

  &.role-system {
    background: rgba(59, 130, 246, 0.12);
    color: #2563eb;
  }
  &.role-user {
    background: rgba(236, 72, 153, 0.12);
    color: #db2777;
  }
  &.role-assistant {
    background: rgba(34, 197, 94, 0.12);
    color: #15803d;
  }
  &.kind {
    background: rgba(139, 92, 246, 0.12);
    color: #7c3aed;
  }
  &.off {
    background: rgba(148, 163, 184, 0.18);
    color: var(--color-text-muted);
  }
  &.pending {
    background: rgba(249, 115, 22, 0.14);
    color: #c2410c;
  }
  &.applied {
    background: rgba(34, 197, 94, 0.14);
    color: #15803d;
  }
}

.pit-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-width: 30px;
  height: 30px;
  border: none;
  background: none;
  border-radius: 8px;
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    transform 0.15s ease;

  &:hover:not(:disabled) {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  &:disabled {
    opacity: 0.35;
    cursor: default;
  }

  &.open svg {
    transform: rotate(180deg);
  }

  &.move:not(:disabled) {
    color: var(--color-primary);
  }

  &.labeled {
    font-size: 12px;
    padding: 0 8px;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
  }
}

// 來源列狀態
.source-row {
  &.selected {
    border-color: var(--color-primary);
    background: var(--color-primary-light);

    .pit-check {
      background: var(--color-primary);
      border-color: var(--color-primary);
    }
  }

  &.moved {
    opacity: 0.55;

    .pit-row-main {
      cursor: default;
    }
    .pit-check {
      visibility: hidden;
    }
  }
}

.pit-preview {
  flex-basis: 100%;
  border-top: 1px dashed var(--color-border);
  padding: 8px 10px 10px 36px;
}

.pit-preview-meta {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-bottom: 6px;
  word-break: break-all;
}

.pit-preview-content {
  margin: 0;
  max-height: 220px;
  overflow-y: auto;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

// 目標列
.target-row {
  &.pending {
    border-color: rgba(249, 115, 22, 0.45);
    background: rgba(249, 115, 22, 0.07);
  }

  &.off .pit-name {
    color: var(--color-text-muted);
  }

  &.flash {
    animation: pit-flash 0.9s ease;
  }

  &.drop-before::before,
  &.drop-after::after {
    content: "";
    position: absolute;
    left: 4px;
    right: 4px;
    height: 3px;
    border-radius: 3px;
    background: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-light);
    pointer-events: none;
  }

  &.drop-before::before {
    top: -4px;
  }

  &.drop-after::after {
    bottom: -4px;
  }
}

.pit-empty.drop-before {
  outline: 2px dashed var(--color-primary);
}

.target-list.drop-active {
  background: var(--color-primary-light);
  border-radius: var(--radius-md);
}

.tr-cursor {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-primary);
  padding: 2px 4px;

  &::before,
  &::after {
    content: "";
    flex: 1;
    height: 2px;
    background: repeating-linear-gradient(
      90deg,
      var(--color-primary) 0 6px,
      transparent 6px 10px
    );
  }
}

@keyframes pit-flash {
  0% {
    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.45);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(249, 115, 22, 0);
  }
}

// 中間移入按鈕
.pit-transfer {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.pit-transfer-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 76px;
  padding: 12px 6px;
  border: none;
  border-radius: 16px;
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    filter 0.15s ease,
    opacity 0.15s ease;

  &:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.pit-transfer-hint {
  font-size: 11px;
  line-height: 1.4;
  text-align: center;
  color: var(--color-text-muted);
}

// 底部
.pit-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.pit-status {
  flex: 1;
  min-width: 180px;
  font-size: 13px;
  color: var(--color-text-secondary);

  strong {
    color: #c2410c;
  }
  .success {
    color: #15803d;
  }
  .error {
    color: #b91c1c;
  }
  .muted {
    color: var(--color-text-muted);
  }
}

.pit-footer-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.pit-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.primary {
    background: var(--color-primary);
    border: none;
    color: #fff;

    &:hover:not(:disabled) {
      filter: brightness(1.08);
    }
  }

  &.secondary {
    background: var(--color-background);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);

    &:hover:not(:disabled) {
      background: var(--color-surface-hover);
    }
  }
}

.pit-ghost {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 1001;
  pointer-events: none;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 240px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 2px solid var(--color-primary);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 13px;
  font-weight: 500;
  box-shadow: var(--shadow-lg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &.invalid {
    border-color: var(--color-border);
    opacity: 0.85;
  }
}

// 窄螢幕：上下排列
@media (max-width: 720px) {
  .pit-overlay {
    padding: 8px;
  }

  .pit-modal {
    height: calc(100dvh - 16px);
  }

  .pit-header {
    padding: 10px 16px;
  }

  .pit-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
  }

  .pit-panel {
    flex: 1 1 0;
    padding: 10px;
  }

  .pit-transfer {
    flex-direction: row;
    gap: 10px;
  }

  .pit-transfer-btn {
    flex-direction: row;
    width: auto;
    padding: 8px 18px;
    border-radius: 999px;
  }

  .pit-dir-icon {
    transform: rotate(90deg);
  }

  .pit-target-hint {
    display: none;
  }

  .pit-footer {
    padding: 10px 12px;
  }

  .pit-status {
    flex-basis: 100%;
    font-size: 12px;
  }

  .pit-btn {
    padding: 8px 14px;
  }
}
</style>
