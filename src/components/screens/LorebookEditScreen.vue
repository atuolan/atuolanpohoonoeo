<script setup lang="ts">
import { useLorebooksStore } from "@/stores";
import { useAffinityStore } from "@/stores/affinity";
import { useCharactersStore } from "@/stores/characters";
import { WorldInfoPosition } from "@/types/worldinfo";
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
} from "vue";

// 類型定義
interface LorebookEntry {
  id: string;
  name: string;
  comment?: string;
  keys: string[];
  secondary_keys?: string[];
  content: string;
  enabled: boolean;
  constant?: boolean;
  case_sensitive?: boolean;
  use_regex?: boolean;
  insertion_order: number;
  position: WorldInfoPosition; // 使用數字枚舉而非字串
  depth?: number;
  probability?: number;
  priority?: number;
  color?: string;
  expanded?: boolean;
}

// 插入位置選項配置
const POSITION_OPTIONS = [
  {
    value: WorldInfoPosition.BEFORE_CHAR,
    label: "↑Char - 角色定義之前",
    desc: "在角色描述和人格之前插入",
  },
  {
    value: WorldInfoPosition.AFTER_CHAR,
    label: "↓Char - 角色定義之後（推薦）",
    desc: "在角色描述和人格之後插入",
  },
  {
    value: WorldInfoPosition.AN_TOP,
    label: "↑AN - 作者筆記之前",
    desc: "在作者筆記區塊之前",
  },
  {
    value: WorldInfoPosition.AN_BOTTOM,
    label: "↓AN - 作者筆記之後",
    desc: "在作者筆記區塊之後",
  },
  {
    value: WorldInfoPosition.AT_DEPTH,
    label: "@D - 指定深度插入",
    desc: "在聊天歷史的特定深度位置插入",
  },
  {
    value: WorldInfoPosition.EM_TOP,
    label: "↑EM - 對話示例之前",
    desc: "在對話示例區塊之前",
  },
  {
    value: WorldInfoPosition.EM_BOTTOM,
    label: "↓EM - 對話示例之後",
    desc: "在對話示例區塊之後",
  },
  {
    value: WorldInfoPosition.OUTLET,
    label: "Outlet - 擴展輸出口",
    desc: "自定義輸出位置（需設定名稱）",
  },
];

interface Lorebook {
  id: string;
  name: string;
  description?: string;
  entries: LorebookEntry[];
  recursive_scanning: boolean;
  max_recursion_steps: number;
}

// Props
const props = defineProps<{
  lorebookId?: string;
  isNew?: boolean;
}>();

// Emits
const emit = defineEmits<{
  (e: "back"): void;
  (e: "save", lorebook: Lorebook): void;
  (e: "delete", id: string): void;
}>();

// 表單數據
const formData = ref<Lorebook>({
  id: "",
  name: "",
  description: "",
  entries: [],
  recursive_scanning: false,
  max_recursion_steps: 10,
});

// 搜尋條目
const searchQuery = ref("");

// 顯示設定區域
const showSettings = ref(true);

// 是否為新建模式
const isCreateMode = computed(() => props.isNew || !props.lorebookId);

// 頁面標題
const pageTitle = computed(() =>
  isCreateMode.value ? "創建世界書" : formData.value.name || "編輯世界書",
);

// 過濾後的條目
const filteredEntries = computed(() => {
  if (!searchQuery.value) return formData.value.entries;

  const query = searchQuery.value.toLowerCase();
  return formData.value.entries.filter(
    (entry) =>
      entry.name.toLowerCase().includes(query) ||
      entry.keys.some((key) => key.toLowerCase().includes(query)) ||
      entry.content.toLowerCase().includes(query),
  );
});

// 漸進式渲染：初始只渲染少量條目，滾動到底部時載入更多
const visibleCount = ref(20);
const loadMoreSentinel = ref<HTMLElement | null>(null);
let loadMoreObserver: IntersectionObserver | null = null;

const visibleEntries = computed(() => {
  return filteredEntries.value.slice(0, visibleCount.value);
});

const hasMoreEntries = computed(() => {
  return visibleCount.value < filteredEntries.value.length;
});

// 搜尋或資料變更時重置可見數量
watch([searchQuery, () => formData.value.entries.length], () => {
  visibleCount.value = 20;
});

onMounted(() => {
  // 延遲設置 IntersectionObserver（等待 DOM 渲染）
  setupLoadMoreObserver();
});

function setupLoadMoreObserver() {
  if (loadMoreObserver) loadMoreObserver.disconnect();
  loadMoreObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && hasMoreEntries.value) {
        visibleCount.value += 20;
      }
    },
    { rootMargin: "200px" },
  );
  // 使用 nextTick 確保 sentinel 已渲染
  nextTick(() => {
    if (loadMoreSentinel.value) {
      loadMoreObserver!.observe(loadMoreSentinel.value);
    }
  });
}

// 監聽 sentinel ref 變化（條件渲染時可能出現/消失）
watch(loadMoreSentinel, (el) => {
  if (loadMoreObserver) loadMoreObserver.disconnect();
  if (el && hasMoreEntries.value) {
    loadMoreObserver!.observe(el);
  }
});

// Store
const lorebooksStore = useLorebooksStore();

// 初始化數據
onMounted(async () => {
  // 確保角色列表已載入（用於反查世界書連結關係）
  if (charactersStore.characters.length === 0) {
    await charactersStore.loadCharacters();
  }

  if (props.lorebookId && !props.isNew) {
    // 從 store 載入現有世界書數據
    const lorebook = lorebooksStore.lorebooks.find(
      (lb) => lb.id === props.lorebookId,
    );
    if (lorebook) {
      formData.value = {
        id: lorebook.id,
        name: lorebook.name || "",
        description: lorebook.description || "",
        entries: (lorebook.entries || []).map((entry, index) => ({
          id: entry.id || `e_${index}`,
          name: entry.comment || entry.keys?.[0] || `條目 ${index + 1}`,
          comment: entry.comment || "",
          keys: entry.key || [],
          secondary_keys: entry.keysecondary || [],
          content: entry.content || "",
          enabled: entry.disable === true ? false : true,
          constant: entry.constant || false,
          case_sensitive: entry.caseSensitive || false,
          use_regex: entry.useRegex || false,
          insertion_order: entry.order ?? index,
          position: entry.position ?? WorldInfoPosition.AFTER_CHAR,
          depth: entry.depth ?? 4,
          probability: entry.probability ?? 100,
          priority: entry.priority ?? 100,
          color: entry.color,
          expanded: false,
        })),
        recursive_scanning: lorebook.recursiveScanning !== false,
        max_recursion_steps: lorebook.maxRecursionSteps ?? 5,
      };
    } else {
      console.error("找不到世界書:", props.lorebookId);
      emit("back");
    }
  } else {
    // 新建模式
    formData.value.id = `lb_${Date.now()}`;
  }
});

onUnmounted(() => {
  if (loadMoreObserver) {
    loadMoreObserver.disconnect();
    loadMoreObserver = null;
  }
});

// 處理返回
function handleBack() {
  emit("back");
}

// 處理儲存
function handleSave() {
  if (!formData.value.name.trim()) {
    alert("請輸入世界書名稱");
    return;
  }
  emit("save", { ...formData.value });
}

// 處理刪除
function handleDelete() {
  if (confirm("確定要刪除這個世界書嗎？所有條目將一併刪除！")) {
    emit("delete", formData.value.id);
  }
}

// 切換設定區域
function toggleSettings() {
  showSettings.value = !showSettings.value;
}

// 新增條目
function addEntry() {
  const newEntry: LorebookEntry = {
    id: `entry_${Date.now()}`,
    name: "",
    comment: "",
    keys: [],
    secondary_keys: [],
    content: "",
    enabled: true,
    constant: false,
    case_sensitive: false,
    use_regex: false,
    insertion_order: formData.value.entries.length,
    position: WorldInfoPosition.AFTER_CHAR,
    depth: 4,
    probability: 100,
    priority: 50,
    expanded: true,
  };
  formData.value.entries.unshift(newEntry);
}

// 刪除條目
function deleteEntry(id: string) {
  if (confirm("確定要刪除這個條目嗎？")) {
    formData.value.entries = formData.value.entries.filter((e) => e.id !== id);
  }
}

// 切換條目展開
function toggleEntry(id: string) {
  const entry = formData.value.entries.find((e) => e.id === id);
  if (entry) {
    entry.expanded = !entry.expanded;
  }
}

// 切換條目啟用（立即保存到 DB）
async function toggleEntryEnabled(id: string) {
  const entry = formData.value.entries.find((e) => e.id === id);
  if (entry) {
    entry.enabled = !entry.enabled;
    // 立即自動保存，避免用戶切換後離開卻沒保存
    await autoSave();
  }
}

// 自動保存（靜默保存當前表單到 DB）
async function autoSave() {
  if (!props.lorebookId || props.isNew) return;

  const convertedEntries = formData.value.entries.map((entry, index) => ({
    uid: parseInt(entry.id?.replace("entry_", "")) || index,
    key: entry.keys || [],
    keysecondary: entry.secondary_keys || [],
    comment: entry.comment || entry.name || "",
    content: entry.content || "",
    constant: entry.constant || false,
    disable: !entry.enabled,
    selective: true,
    selectiveLogic: 0,
    order: entry.insertion_order ?? index,
    position: typeof entry.position === "number" ? entry.position : 1,
    depth: entry.depth ?? 4,
    role: null,
    ignoreBudget: false,
    excludeRecursion: false,
    preventRecursion: false,
    delayUntilRecursion: 0,
    probability: entry.probability ?? 100,
    useProbability: true,
    sticky: null,
    cooldown: null,
    delay: null,
    scanDepth: null,
    caseSensitive: entry.case_sensitive ?? null,
    matchWholeWords: null,
    useGroupScoring: null,
    matchPersonaDescription: false,
    matchCharacterDescription: false,
    matchCharacterPersonality: false,
    matchCharacterDepthPrompt: false,
    matchScenario: false,
    matchCreatorNotes: false,
    group: "",
    groupOverride: false,
    groupWeight: 100,
    outletName: "",
    automationId: "",
    vectorized: false,
    triggers: [],
    addMemo: false,
  }));

  await lorebooksStore.updateLorebook(formData.value.id, {
    entries: convertedEntries as any,
  });
}

// 更新條目關鍵詞
function updateEntryKeys(id: string, keysStr: string) {
  const entry = formData.value.entries.find((e) => e.id === id);
  if (entry) {
    entry.keys = keysStr
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k);
  }
}

// 獲取關鍵詞字串
function getKeysString(keys: string[]): string {
  return keys.join(", ");
}

// ===== 條件編輯器（好感度積木式可視化） =====

const affinityStore = useAffinityStore();
const charactersStore = useCharactersStore();

interface RuleCondition {
  metricName: string;
  operator: string;
  value: string | number;
}

// groups[i] 內的條件互為 AND，groups 之間互為 OR
interface PromptRule {
  id: string;
  groups: RuleCondition[][];
  content: string;
}

const entryEditMode = reactive<Record<string, "raw" | "visual">>({});
const entryRules = reactive<Record<string, PromptRule[]>>({});

function getEditMode(entryId: string): "raw" | "visual" {
  return entryEditMode[entryId] ?? "raw";
}

const linkedCharacters = computed(() => {
  if (!props.lorebookId) return [];
  return charactersStore.characters
    .filter((c) => c.lorebookIds.includes(props.lorebookId!))
    .map((c) => ({ id: c.id, name: c.nickname || c.data.name }));
});

const selectedLinkedCharId = ref<string>("");

const selectedLinkedConfig = computed(() => {
  if (!selectedLinkedCharId.value) return null;
  return affinityStore.configCache.get(selectedLinkedCharId.value) ?? null;
});

watch(
  linkedCharacters,
  async (chars) => {
    if (chars.length === 0) { selectedLinkedCharId.value = ""; return; }
    if (!chars.some((c) => c.id === selectedLinkedCharId.value)) {
      selectedLinkedCharId.value = chars[0].id;
    }
    for (const c of chars) {
      if (!affinityStore.configCache.has(c.id)) await affinityStore.loadConfig(c.id);
    }
  },
  { immediate: true },
);

watch(selectedLinkedCharId, async (id) => {
  if (id && !affinityStore.configCache.has(id)) await affinityStore.loadConfig(id);
});

const condEditorCharName = computed(() => {
  const config = selectedLinkedConfig.value;
  if (config?.statKey?.trim()) return config.statKey.trim();
  return linkedCharacters.value.find((c) => c.id === selectedLinkedCharId.value)?.name ?? "";
});

const availableMetrics = computed(() => {
  const config = selectedLinkedConfig.value;
  if (!config?.enabled) return [];
  return config.metrics.map((m) => ({ name: m.name, type: m.type, options: m.options }));
});

function getOperatorsForMetric(metricName: string): string[] {
  const m = availableMetrics.value.find((x) => x.name === metricName);
  return m?.type === "string" ? ["==", "!="] : [">", ">=", "<", "<=", "==", "!="];
}

function isStringMetric(metricName: string): boolean {
  return availableMetrics.value.find((x) => x.name === metricName)?.type === "string";
}

function getMetricOptions(metricName: string): string[] {
  return availableMetrics.value.find((x) => x.name === metricName)?.options ?? [];
}

// 解析單一條件字串片段，失敗則返回空佔位（不報錯）
function _parseOneCond(part: string, metrics: { name: string }[]): RuleCondition {
  const cm = part.trim().match(
    /getvar\(['"]([^'"]+)['"]\)\s*(>=|<=|===|!==|==|!=|>|<)\s*(.+)/,
  );
  if (!cm) return { metricName: "", operator: ">=", value: 0 };
  const path = cm[1];
  let metricName = path;
  const pathParts = path.split(".");
  if (pathParts[0] === "stat_data" && pathParts.length >= 3) {
    const leafName = pathParts.slice(2).join(".");
    const fullName = pathParts.slice(1).join(".");
    metricName = metrics.some((m) => m.name === fullName) ? fullName : leafName;
  }
  const op = cm[2].replace("===", "==").replace("!==", "!=");
  let val: string | number = cm[3].trim();
  const numVal = Number(val);
  if (!Number.isNaN(numVal) && !/^['"]/.test(val)) {
    val = numVal;
  } else {
    val = val.replace(/^['"]|['"]$/g, "");
  }
  return { metricName, operator: op, value: val };
}

// 按 || 分割條件字串，尊重括號層次
function _splitByOr(condStr: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  let i = 0;
  while (i < condStr.length) {
    if (condStr[i] === "(") depth++;
    else if (condStr[i] === ")") depth--;
    if (depth === 0 && condStr.slice(i, i + 4) === " || ") {
      parts.push(current.trim());
      current = "";
      i += 4;
      continue;
    }
    current += condStr[i];
    i++;
  }
  if (current.trim()) parts.push(current.trim());
  return parts.length > 0 ? parts : [condStr];
}

// EJS → 積木規則（支援 OR groups）
function parseEjsToRules(
  ejsContent: string,
  metrics: { name: string }[] = [],
): PromptRule[] | null {
  const rules: PromptRule[] = [];
  const blockRegex =
    /<%_?\s*(?:\}\s*)?(?:else\s+)?if\s*\((.+?)\)\s*\{\s*_%?>\s*\n?([\s\S]*?)(?=<%_?\s*\}|$)/g;
  let match;
  while ((match = blockRegex.exec(ejsContent)) !== null) {
    const condStr = match[1].trim();
    const content = match[2].trim();
    const groupStrings = _splitByOr(condStr);
    const groups: RuleCondition[][] = groupStrings
      .map((gs) => {
        const stripped = gs.trim().replace(/^\((.+)\)$/, "$1").trim();
        return stripped.split(/\s*&&\s*/).map((p) => _parseOneCond(p, metrics));
      })
      .filter((g) => g.length > 0);
    if (groups.length > 0) {
      rules.push({ id: `rule_${Date.now()}_${rules.length}`, groups, content });
    }
  }
  return rules.length > 0 ? rules : null;
}

// 積木規則 → EJS 字串
function rulesToEjs(rules: PromptRule[], charName: string): string {
  if (rules.length === 0) return "";
  const condToStr = (c: RuleCondition): string => {
    if (!c.metricName) return "";
    const path = c.metricName.includes(".")
      ? `stat_data.${c.metricName}`
      : `stat_data.${charName}.${c.metricName}`;
    const op =
      typeof c.value === "string" && c.operator === "=="
        ? "==="
        : typeof c.value === "string" && c.operator === "!="
          ? "!=="
          : c.operator;
    const val = typeof c.value === "string" ? `'${c.value}'` : c.value;
    return `getvar('${path}') ${op} ${val}`;
  };
  return (
    rules
      .map((rule, i) => {
        const kw = i === 0 ? "if" : "} else if";
        const groupStrings = rule.groups
          .map((group) => group.map(condToStr).filter(Boolean).join(" && "))
          .filter(Boolean);
        // 單組不加外層括號；多組每組加括號用 || 連接
        const fullCond =
          groupStrings.length === 1
            ? groupStrings[0]
            : groupStrings.map((s) => `(${s})`).join(" || ");
        return `<%_ ${kw} (${fullCond || "true"}) { _%>\n${rule.content}\n`;
      })
      .join("") + "<%_ } _%>"
  );
}

// 每次積木修改後即時同步到條目內容
function syncRulesToEntry(entryId: string) {
  const rules = entryRules[entryId];
  if (!rules) return;
  const entry = formData.value.entries.find((e) => e.id === entryId);
  if (entry) entry.content = rulesToEjs(rules, condEditorCharName.value);
}

function switchToVisual(entryId: string, content: string) {
  const parsed = parseEjsToRules(content, availableMetrics.value);
  if (parsed && parsed.length > 0) {
    entryRules[entryId] = parsed;
  } else if (!entryRules[entryId]?.length) {
    entryRules[entryId] = [];
  }
  entryEditMode[entryId] = "visual";
}

function switchToRaw(entryId: string) {
  entryEditMode[entryId] = "raw";
}

// 手動確認按鈕（即時同步的明確操作版本）
function applyRulesToEntry(entryId: string, charName: string) {
  const rules = entryRules[entryId];
  if (!rules) return;
  const entry = formData.value.entries.find((e) => e.id === entryId);
  if (entry) entry.content = rulesToEjs(rules, charName);
}

function addRule(entryId: string) {
  if (!entryRules[entryId]) entryRules[entryId] = [];
  const firstMetric = availableMetrics.value[0]?.name ?? "";
  entryRules[entryId].push({
    id: `rule_${Date.now()}`,
    groups: [[{ metricName: firstMetric, operator: ">=", value: 0 }]],
    content: "",
  });
  syncRulesToEntry(entryId);
}

function removeRule(entryId: string, ruleIdx: number) {
  entryRules[entryId]?.splice(ruleIdx, 1);
  syncRulesToEntry(entryId);
}

function moveRuleUp(entryId: string, ruleIdx: number) {
  const rules = entryRules[entryId];
  if (!rules || ruleIdx <= 0) return;
  [rules[ruleIdx - 1], rules[ruleIdx]] = [rules[ruleIdx], rules[ruleIdx - 1]];
  syncRulesToEntry(entryId);
}

function addGroup(entryId: string, ruleIdx: number) {
  const rule = entryRules[entryId]?.[ruleIdx];
  if (!rule) return;
  const firstMetric = availableMetrics.value[0]?.name ?? "";
  rule.groups.push([{ metricName: firstMetric, operator: ">=", value: 0 }]);
  syncRulesToEntry(entryId);
}

function removeGroup(entryId: string, ruleIdx: number, groupIdx: number) {
  const rule = entryRules[entryId]?.[ruleIdx];
  if (!rule || rule.groups.length <= 1) return;
  rule.groups.splice(groupIdx, 1);
  syncRulesToEntry(entryId);
}

function addCondition(entryId: string, ruleIdx: number, groupIdx: number) {
  const group = entryRules[entryId]?.[ruleIdx]?.groups?.[groupIdx];
  if (!group) return;
  const firstMetric = availableMetrics.value[0]?.name ?? "";
  group.push({ metricName: firstMetric, operator: ">=", value: 0 });
  syncRulesToEntry(entryId);
}

function removeCondition(
  entryId: string,
  ruleIdx: number,
  groupIdx: number,
  condIdx: number,
) {
  const group = entryRules[entryId]?.[ruleIdx]?.groups?.[groupIdx];
  if (!group || group.length <= 1) return;
  group.splice(condIdx, 1);
  syncRulesToEntry(entryId);
}
</script>

<template>
  <div class="screen-container lorebook-edit-screen">
    <!-- 標題欄 -->
    <header class="soft-header gradient">
      <button class="header-back" @click="handleBack">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
          />
        </svg>
      </button>

      <h1 class="header-title">{{ pageTitle }}</h1>

      <div class="header-actions">
        <!-- 刪除按鈕 -->
        <button
          v-if="!isCreateMode"
          class="header-btn danger"
          title="刪除世界書"
          @click="handleDelete"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
            />
          </svg>
        </button>

        <!-- 儲存按鈕 -->
        <button class="header-btn primary" title="儲存" @click="handleSave">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
        </button>
      </div>
    </header>

    <!-- 編輯內容 -->
    <main class="soft-content edit-content">
      <!-- 基本資訊 -->
      <section class="info-section">
        <div class="form-group">
          <label class="form-label">名稱 <span class="required">*</span></label>
          <input
            v-model="formData.name"
            type="text"
            class="soft-input"
            placeholder="輸入世界書名稱"
          />
        </div>
      </section>

      <!-- 設定區域 -->
      <section class="settings-section">
        <button class="section-header" @click="toggleSettings">
          <span class="section-title">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
              />
            </svg>
            設定
          </span>
          <svg
            class="chevron"
            :class="{ open: showSettings }"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
          </svg>
        </button>

        <Transition name="slide">
          <div v-if="showSettings" class="settings-content">
            <!-- 遞迴掃描開關 -->
            <div class="setting-item">
              <div class="setting-info">
                <span class="setting-label">遞迴掃描</span>
                <span class="setting-desc">允許條目內容觸發其他條目</span>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" v-model="formData.recursive_scanning" />
                <span class="toggle-slider"></span>
              </label>
            </div>

            <!-- 最大遞迴深度 -->
            <div
              class="setting-item vertical"
              v-if="formData.recursive_scanning"
            >
              <div class="setting-info">
                <span class="setting-label">最大遞迴深度</span>
                <span class="setting-value">{{
                  formData.max_recursion_steps
                }}</span>
              </div>
              <input
                type="range"
                v-model.number="formData.max_recursion_steps"
                min="1"
                max="20"
                class="range-slider full"
              />
            </div>
          </div>
        </Transition>
      </section>

      <!-- 條目區域 -->
      <section class="entries-section">
        <!-- 搜尋與新增 -->
        <div class="entries-header">
          <div class="soft-search">
            <svg class="search-icon" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
              />
            </svg>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="搜尋條目..."
            />
          </div>
          <button class="add-entry-btn" @click="addEntry">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
          </button>
        </div>

        <!-- 條目列表 -->
        <div class="entries-list">
          <div
            v-for="entry in visibleEntries"
            :key="entry.id"
            class="entry-card"
            :class="{ expanded: entry.expanded, disabled: !entry.enabled }"
          >
            <!-- 條目標題列 -->
            <div class="entry-header" @click="toggleEntry(entry.id)">
              <button
                class="entry-toggle"
                :class="{ enabled: entry.enabled }"
                @click.stop="toggleEntryEnabled(entry.id)"
              >
                <svg
                  v-if="entry.enabled"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              </button>

              <div class="entry-info">
                <div class="entry-title-row">
                  <span class="order-badge">{{ entry.insertion_order }}</span>
                  <span class="entry-name">{{
                    entry.comment || entry.name || "未命名條目"
                  }}</span>
                  <span
                    v-if="entry.constant"
                    class="constant-badge"
                    title="始終激活"
                    >📌</span
                  >
                </div>
                <span class="entry-keys">{{
                  entry.keys.join(", ") || "無關鍵詞"
                }}</span>
              </div>

              <svg
                class="entry-chevron"
                :class="{ open: entry.expanded }"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"
                />
              </svg>
            </div>

            <!-- 條目內容（展開時顯示） -->
            <Transition name="slide">
              <div v-if="entry.expanded" class="entry-content">
                <div class="form-group">
                  <label class="form-label">條目名稱/註釋</label>
                  <input
                    v-model="entry.comment"
                    type="text"
                    class="soft-input"
                    placeholder="例如：角色背景、世界設定"
                  />
                </div>

                <div class="form-group">
                  <label class="form-label">
                    觸發關鍵詞
                    <span v-if="!entry.constant" class="required">*</span>
                    <span v-else class="optional">（始終激活時可選）</span>
                  </label>
                  <input
                    :value="getKeysString(entry.keys)"
                    @input="
                      updateEntryKeys(
                        entry.id,
                        ($event.target as HTMLInputElement).value,
                      )
                    "
                    type="text"
                    class="soft-input"
                    placeholder="關鍵詞1, 關鍵詞2, ..."
                  />
                  <p class="form-hint">
                    當消息中包含這些關鍵詞時，此條目會被激活
                  </p>
                </div>

                <div class="form-group">
                  <div class="content-label-row">
                    <label class="form-label"
                      >條目內容 <span class="required">*</span></label
                    >
                    <div class="mode-toggle">
                      <button
                        class="mode-btn"
                        :class="{ active: getEditMode(entry.id) === 'raw' }"
                        @click="switchToRaw(entry.id)"
                      >
                        原始文本
                      </button>
                      <button
                        class="mode-btn"
                        :class="{ active: getEditMode(entry.id) === 'visual' }"
                        @click="switchToVisual(entry.id, entry.content)"
                      >
                        條件編輯器
                      </button>
                    </div>
                  </div>

                  <!-- 原始文本模式 -->
                  <textarea
                    v-if="getEditMode(entry.id) === 'raw'"
                    v-model="entry.content"
                    class="soft-input textarea"
                    placeholder="輸入世界書內容，支援 EJS 語法（如 <%_ if (getvar('stat_data.角色名.變量名') > 50) { _%>）"
                    rows="5"
                  ></textarea>

                  <!-- 條件編輯器模式（Scratch 積木風格） -->
                  <div v-else class="visual-rule-editor">
                    <!-- 角色關聯狀態 bar -->
                    <div class="rule-char-bar">
                      <template v-if="linkedCharacters.length === 0">
                        <span class="char-bar-hint warn">⚠ 此世界書尚未連結任何角色，請在角色編輯頁面綁定世界書後再使用條件編輯器。</span>
                      </template>
                      <template v-else-if="!selectedLinkedConfig?.enabled">
                        <span class="char-bar-hint warn">⚠ 角色「{{ condEditorCharName }}」尚未啟用好感度系統，請在角色編輯頁面開啟「好感度數值」開關。</span>
                      </template>
                      <template v-else-if="(selectedLinkedConfig?.metrics ?? []).length === 0">
                        <span class="char-bar-hint warn">⚠ 好感度已啟用，但角色「{{ condEditorCharName }}」還沒有任何數值指標，請在角色編輯頁面點「+ 新增指標」來新增。</span>
                      </template>
                      <template v-else>
                        <span class="char-bar-label">角色：</span>
                        <select
                          v-if="linkedCharacters.length > 1"
                          v-model="selectedLinkedCharId"
                          class="soft-input small char-bar-select"
                        >
                          <option v-for="c in linkedCharacters" :key="c.id" :value="c.id">{{ c.name }}</option>
                        </select>
                        <span v-else class="char-bar-name">{{ condEditorCharName }}</span>
                        <span class="char-bar-metric-count">{{ availableMetrics.length }} 個指標</span>
                      </template>
                    </div>

                    <!-- 規則列表 -->
                    <div
                      v-for="(rule, ri) in entryRules[entry.id] ?? []"
                      :key="rule.id"
                      class="rule-card"
                    >
                      <!-- 規則標題列 -->
                      <div class="rule-header">
                        <span class="rule-label">規則 {{ ri + 1 }}</span>
                        <div class="rule-header-actions">
                          <button v-if="ri > 0" class="icon-btn-sm" title="上移" @click="moveRuleUp(entry.id, ri)">↑</button>
                          <button class="icon-btn-sm danger" title="刪除規則" @click="removeRule(entry.id, ri)">✕</button>
                        </div>
                      </div>

                      <!-- 條件組（OR groups） -->
                      <div class="rule-logic">
                        <template v-for="(group, gi) in rule.groups" :key="gi">
                          <!-- OR 分隔線（組與組之間） -->
                          <div v-if="gi > 0" class="or-divider">
                            <span class="or-label">或者 (OR)</span>
                          </div>

                          <!-- 條件組容器 -->
                          <div class="condition-group">
                            <div class="group-header">
                              <span class="group-label">條件組 {{ String.fromCharCode(65 + gi) }}</span>
                              <button
                                v-if="rule.groups.length > 1"
                                class="icon-btn-xs danger"
                                title="刪除此條件組"
                                @click="removeGroup(entry.id, ri, gi)"
                              >✕</button>
                            </div>

                            <!-- 條件積木（AND conditions） -->
                            <div class="conditions-list">
                              <template v-for="(cond, ci) in group" :key="ci">
                                <!-- AND 連接線 -->
                                <div v-if="ci > 0" class="and-connector">
                                  <span class="and-label">且</span>
                                </div>

                                <!-- 積木本體 -->
                                <div
                                  class="condition-block"
                                  :class="isStringMetric(cond.metricName) ? 'block-string' : 'block-number'"
                                >
                                  <!-- 指標選擇 -->
                                  <select
                                    v-model="cond.metricName"
                                    class="block-select metric-select"
                                    @change="syncRulesToEntry(entry.id)"
                                  >
                                    <option value="">選擇指標…</option>
                                    <option v-for="m in availableMetrics" :key="m.name" :value="m.name">{{ m.name }}</option>
                                  </select>

                                  <!-- 運算符 -->
                                  <select
                                    v-model="cond.operator"
                                    class="block-select op-select"
                                    @change="syncRulesToEntry(entry.id)"
                                  >
                                    <option v-for="op in getOperatorsForMetric(cond.metricName)" :key="op" :value="op">{{ op }}</option>
                                  </select>

                                  <!-- 值（字串有 options 時用下拉） -->
                                  <select
                                    v-if="isStringMetric(cond.metricName) && getMetricOptions(cond.metricName).length > 0"
                                    :value="String(cond.value)"
                                    class="block-select val-select"
                                    @change="cond.value = ($event.target as HTMLSelectElement).value; syncRulesToEntry(entry.id)"
                                  >
                                    <option v-for="opt in getMetricOptions(cond.metricName)" :key="opt" :value="opt">{{ opt }}</option>
                                  </select>
                                  <input
                                    v-else-if="isStringMetric(cond.metricName)"
                                    :value="String(cond.value)"
                                    class="block-input"
                                    placeholder="值"
                                    @input="cond.value = ($event.target as HTMLInputElement).value; syncRulesToEntry(entry.id)"
                                  />
                                  <input
                                    v-else
                                    :value="cond.value"
                                    type="number"
                                    class="block-input number-input"
                                    @input="cond.value = Number(($event.target as HTMLInputElement).value) || 0; syncRulesToEntry(entry.id)"
                                  />

                                  <!-- 刪除條件（同組內 > 1 才顯示） -->
                                  <button
                                    v-if="group.length > 1"
                                    class="icon-btn-xs danger block-del"
                                    title="刪除此條件"
                                    @click="removeCondition(entry.id, ri, gi, ci)"
                                  >✕</button>
                                </div>
                              </template>
                            </div>

                            <!-- 新增 AND 條件按鈕 -->
                            <button class="add-cond-btn" @click="addCondition(entry.id, ri, gi)">
                              + 新增條件（且）
                            </button>
                          </div>
                        </template>

                        <!-- 新增 OR 條件組按鈕 -->
                        <button class="add-group-btn" @click="addGroup(entry.id, ri)">
                          + 新增「或者」條件組
                        </button>
                      </div>

                      <!-- 注入文本 -->
                      <div class="rule-content-area">
                        <label class="form-label-sm">注入文本</label>
                        <textarea
                          v-model="rule.content"
                          class="soft-input textarea"
                          rows="3"
                          placeholder="當條件滿足時注入此文本（支援 {{user}} {{char}} 宏）"
                          @input="syncRulesToEntry(entry.id)"
                        ></textarea>
                      </div>
                    </div>

                    <!-- 底部操作列 -->
                    <div class="rule-editor-footer">
                      <button class="add-rule-btn" @click="addRule(entry.id)">
                        + 新增規則
                      </button>
                      <button
                        v-if="(entryRules[entry.id] ?? []).length > 0"
                        class="apply-rules-btn"
                        @click="applyRulesToEntry(entry.id, condEditorCharName)"
                      >
                        確認並同步
                      </button>
                    </div>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label"
                    >插入順序
                    <span class="hint-inline">（數字越小越靠前）</span></label
                  >
                  <input
                    v-model.number="entry.insertion_order"
                    type="number"
                    class="soft-input small"
                    min="0"
                    max="999"
                  />
                </div>

                <div class="form-group">
                  <label class="form-label">插入位置</label>
                  <select v-model.number="entry.position" class="soft-input">
                    <option
                      v-for="opt in POSITION_OPTIONS"
                      :key="opt.value"
                      :value="opt.value"
                    >
                      {{ opt.label }}
                    </option>
                  </select>
                  <p class="form-hint">
                    {{
                      POSITION_OPTIONS.find((o) => o.value === entry.position)
                        ?.desc
                    }}
                  </p>
                </div>

                <!-- AT_DEPTH 深度設定 -->
                <div
                  v-if="entry.position === WorldInfoPosition.AT_DEPTH"
                  class="form-group depth-setting"
                >
                  <label class="form-label"
                    >插入深度 (@D)
                    <span class="hint-inline"
                      >（0=最新訊息之前, 越大越靠近歷史開頭）</span
                    ></label
                  >
                  <input
                    v-model.number="entry.depth"
                    type="number"
                    class="soft-input small"
                    min="0"
                    max="999"
                  />
                </div>

                <div class="form-group">
                  <div class="checkbox-group">
                    <label class="checkbox-label">
                      <input type="checkbox" v-model="entry.enabled" />
                      <span>啟用此條目</span>
                    </label>
                    <label class="checkbox-label">
                      <input type="checkbox" v-model="entry.constant" />
                      <span>始終激活（不檢查關鍵詞）</span>
                    </label>
                    <label class="checkbox-label">
                      <input type="checkbox" v-model="entry.case_sensitive" />
                      <span>區分大小寫</span>
                    </label>
                  </div>
                </div>

                <div class="entry-actions">
                  <button
                    class="delete-entry-btn"
                    @click="deleteEntry(entry.id)"
                  >
                    🗑️ 刪除條目
                  </button>
                </div>
              </div>
            </Transition>
          </div>

          <!-- 載入更多哨兵 -->
          <div
            v-if="hasMoreEntries"
            ref="loadMoreSentinel"
            class="load-more-sentinel"
          >
            <span class="load-more-text">載入更多條目...</span>
          </div>

          <!-- 空狀態 -->
          <div v-if="filteredEntries.length === 0" class="empty-entries">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"
              />
            </svg>
            <p v-if="searchQuery">找不到符合的條目</p>
            <p v-else>還沒有條目，點擊上方按鈕新增</p>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style lang="scss" scoped>
.lorebook-edit-screen {
  background: var(--color-background);
}

.edit-content {
  padding: 16px;
  padding-bottom: calc(16px + var(--safe-bottom, 0px));
  max-width: 700px;
  width: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-x: hidden;
  overflow-y: auto;
  min-height: 0;
  box-sizing: border-box;
}

// 基本資訊區
.info-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  min-width: 0;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);

  .required {
    color: #dc3545;
  }

  .optional {
    font-size: 11px;
    font-weight: 400;
    color: #28a745;
  }

  .hint-inline {
    font-size: 11px;
    font-weight: 400;
    color: var(--color-text-muted);
  }
}

.form-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 4px 0 0 0;
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

// 深度設定區塊（AT_DEPTH 特有）
.depth-setting {
  background: rgba(var(--color-primary-rgb, 102, 126, 234), 0.08);
  padding: 12px;
  border-radius: var(--radius-md);
  border-left: 3px solid var(--color-primary);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text);

  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }
}

.soft-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  font-size: 14px;
  color: var(--color-text);
  transition: all 0.2s;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 0.2rem rgba(102, 126, 234, 0.25);
  }

  &::placeholder {
    color: var(--color-text-muted);
  }

  &.textarea {
    resize: vertical;
    min-height: 80px;
    max-height: 40vh;
    line-height: 1.5;
    font-family: inherit;
    overflow-y: auto;
    word-break: break-word;
    overflow-wrap: break-word;
  }

  &.small {
    width: 100px;
    text-align: center;
  }
}

// 設定區域
.settings-section {
  background: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
}

.section-header {
  width: 100%;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background var(--transition-fast);

  &:hover {
    background: var(--color-background);
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text);

    svg {
      width: 20px;
      height: 20px;
      color: var(--color-primary);
    }
  }

  .chevron {
    width: 20px;
    height: 20px;
    color: var(--color-text-muted);
    transition: transform var(--transition-fast);

    &.open {
      transform: rotate(180deg);
    }
  }
}

.settings-content {
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;

  &.vertical {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;

    .setting-info {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }
  }
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 2px;

  .setting-label {
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text);
  }

  .setting-desc {
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .setting-value {
    font-size: 13px;
    color: var(--color-primary);
    font-weight: 600;
  }
}

// 開關
.toggle-switch {
  position: relative;
  width: 48px;
  height: 28px;
  cursor: pointer;

  input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-slider {
    position: absolute;
    inset: 0;
    background: var(--color-border);
    border-radius: 14px;
    transition: background var(--transition-fast);

    &::before {
      content: "";
      position: absolute;
      width: 22px;
      height: 22px;
      left: 3px;
      top: 3px;
      background: white;
      border-radius: 50%;
      box-shadow: var(--shadow-sm);
      transition: transform var(--transition-fast);
    }
  }

  input:checked + .toggle-slider {
    background: var(--color-primary);

    &::before {
      transform: translateX(20px);
    }
  }
}

// 滑桿
.range-slider {
  width: 120px;
  height: 6px;
  appearance: none;
  background: var(--color-border);
  border-radius: 3px;
  outline: none;

  &::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
    background: var(--color-primary);
    border-radius: 50%;
    cursor: pointer;
    box-shadow: var(--shadow-sm);
  }

  &.full {
    width: 100%;
  }
}

// 條目區域
.entries-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.entries-header {
  display: flex;
  gap: 12px;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--color-background);
  padding: 8px 0;
}

.soft-search {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--color-surface);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);

  .search-icon {
    width: 20px;
    height: 20px;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 15px;
    color: var(--color-text);
    outline: none;

    &::placeholder {
      color: var(--color-text-muted);
    }
  }
}

.add-entry-btn {
  width: 44px;
  min-width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(
    135deg,
    var(--color-primary),
    var(--color-secondary)
  );
  border: none;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: transform var(--transition-fast);

  svg {
    width: 24px;
    height: 24px;
    color: white;
  }

  &:hover {
    transform: scale(1.05);
  }
}

// 條目卡片
.entries-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.entry-card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  transition: all var(--transition-fast);

  &.disabled {
    opacity: 0.6;
  }

  &.expanded {
    box-shadow: var(--shadow-md);
  }
}

.entry-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  cursor: pointer;
  transition: background var(--transition-fast);

  &:hover {
    background: var(--color-background);
  }
}

.entry-toggle {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-border);
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;

  svg {
    width: 16px;
    height: 16px;
    color: white;
  }

  &.enabled {
    background: var(--color-success, #5dd3b3);
  }
}

.entry-info {
  flex: 1;
  min-width: 0;

  .entry-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .order-badge {
    background: var(--color-text-muted);
    color: white;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .entry-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .constant-badge {
    flex-shrink: 0;
    font-size: 14px;
  }

  .entry-keys {
    display: block;
    font-size: 12px;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
  }
}

.entry-chevron {
  width: 20px;
  height: 20px;
  color: var(--color-text-muted);
  transition: transform var(--transition-fast);
  flex-shrink: 0;

  &.open {
    transform: rotate(180deg);
  }
}

.entry-content {
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-top: 1px solid var(--color-border);
  max-height: calc(100dvh - 200px);
  overflow-y: auto;
  min-width: 0;
}

.entry-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 8px;
}

.delete-entry-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: transparent;
  border: 1px solid var(--color-error);
  border-radius: var(--radius-md);
  color: var(--color-error);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);

  svg {
    width: 16px;
    height: 16px;
  }

  &:hover {
    background: rgba(255, 123, 123, 0.1);
  }
}

// 載入更多哨兵
.load-more-sentinel {
  padding: 16px;
  text-align: center;

  .load-more-text {
    font-size: 13px;
    color: var(--color-text-muted);
  }
}

// 空狀態
.empty-entries {
  padding: 40px 20px;
  text-align: center;
  color: var(--color-text-muted);

  svg {
    width: 48px;
    height: 48px;
    margin-bottom: 12px;
    opacity: 0.5;
  }

  p {
    font-size: 14px;
  }
}

// 標題欄按鈕
.header-btn {
  &.danger {
    color: var(--color-error);

    &:hover {
      background: rgba(255, 123, 123, 0.1);
    }
  }

  &.primary {
    background: linear-gradient(
      135deg,
      var(--color-primary),
      var(--color-secondary)
    );
    color: white;

    &:hover {
      transform: scale(1.05);
    }
  }
}

// 動畫
.slide-enter-active,
.slide-leave-active {
  transition:
    opacity 0.2s ease,
    max-height 0.2s ease;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0 !important;
}

.slide-enter-to,
.slide-leave-from {
  opacity: 1;
  max-height: 2000px;
}

// ===== 條件編輯器樣式 =====

.content-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.mode-toggle {
  display: flex;
  gap: 2px;
  background: var(--color-bg-secondary, #f0f0f0);
  border-radius: 6px;
  padding: 2px;
}

.mode-btn {
  padding: 3px 10px;
  font-size: 12px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-secondary, #999);
  cursor: pointer;
  transition: all 0.15s;

  &.active {
    background: var(--color-primary, #7dd3a8);
    color: #fff;
  }
}

/* ===== Scratch 積木式條件編輯器樣式 ===== */

.visual-rule-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rule-char-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--color-bg-secondary, #f5f5f5);
  font-size: 13px;
  flex-wrap: wrap;

  .char-bar-hint {
    font-size: 12px;
    line-height: 1.5;

    &.warn { color: #e6a23c; }
  }

  .char-bar-label { color: var(--color-text-secondary, #999); white-space: nowrap; }
  .char-bar-name { font-weight: 600; color: var(--color-primary, #7dd3a8); }
  .char-bar-select { max-width: 160px; padding: 2px 6px; height: 28px; font-size: 13px; }
  .char-bar-metric-count {
    margin-left: auto;
    font-size: 11px;
    color: var(--color-text-tertiary, #bbb);
    background: var(--color-primary-light, rgba(125, 211, 168, 0.15));
    padding: 2px 8px;
    border-radius: 10px;
  }
}

.rule-card {
  border: 1px solid var(--color-border, #e0e0e0);
  border-radius: 10px;
  padding: 12px;
  background: var(--color-bg, #fff);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

.rule-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.rule-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text, #333);
  letter-spacing: 0.03em;
}

.rule-header-actions {
  display: flex;
  gap: 4px;
}

.icon-btn-sm {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: var(--color-bg-tertiary, #e8e8e8);
  color: var(--color-text-secondary, #666);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;

  &:hover { background: var(--color-bg-hover, #ddd); }
  &.danger { color: var(--color-error, #e74c3c); }
  &.danger:hover { background: rgba(231, 76, 60, 0.1); }
}

.icon-btn-xs {
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--color-text-tertiary, #bbb);
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;

  &:hover { background: var(--color-bg-tertiary, #eee); }
  &.danger { color: var(--color-error, #e74c3c); }
  &.danger:hover { background: rgba(231, 76, 60, 0.1); }
}

/* 規則邏輯區（包含所有條件組） */
.rule-logic {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}

/* OR 分隔線 */
.or-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0;

  &::before,
  &::after {
    content: "";
    flex: 1;
    border-top: 1px dashed var(--color-border, #d0d0d0);
  }

  .or-label {
    font-size: 11px;
    font-weight: 600;
    color: #9b59b6;
    background: rgba(155, 89, 182, 0.08);
    padding: 2px 10px;
    border-radius: 10px;
    white-space: nowrap;
    border: 1px solid rgba(155, 89, 182, 0.2);
  }
}

/* 條件組容器 */
.condition-group {
  border: 1px solid var(--color-border, #e0e0e0);
  border-radius: 8px;
  padding: 8px;
  background: var(--color-bg-secondary, #f9f9f9);
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.group-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary, #888);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* 條件列表 */
.conditions-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 6px;
}

/* AND 連接 */
.and-connector {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 4px;

  &::before,
  &::after {
    content: "";
    flex: 1;
    border-top: 1px solid var(--color-border, #e0e0e0);
  }

  .and-label {
    font-size: 10px;
    font-weight: 600;
    color: #3498db;
    background: rgba(52, 152, 219, 0.08);
    padding: 1px 8px;
    border-radius: 8px;
    white-space: nowrap;
    border: 1px solid rgba(52, 152, 219, 0.2);
  }
}

/* 積木本體 */
.condition-block {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 8px;
  border-left: 3px solid transparent;
  flex-wrap: wrap;

  /* 數字型：藍色積木 */
  &.block-number {
    background: #e8f0fe;
    border-left-color: #667eea;
  }

  /* 字串型：綠色積木 */
  &.block-string {
    background: #e6f7ef;
    border-left-color: #5dd3b3;
  }
}

/* 積木內的下拉 */
.block-select {
  padding: 3px 5px;
  font-size: 12px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.85);
  color: var(--color-text, #333);
  cursor: pointer;
  outline: none;

  &:focus { border-color: rgba(0, 0, 0, 0.3); }

  &.metric-select { flex: 2; min-width: 90px; }
  &.op-select { flex: 0 0 52px; text-align: center; }
  &.val-select { flex: 1; min-width: 70px; }
}

/* 積木內的輸入框 */
.block-input {
  padding: 3px 6px;
  font-size: 12px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.85);
  color: var(--color-text, #333);
  flex: 1;
  min-width: 60px;
  outline: none;

  &:focus { border-color: rgba(0, 0, 0, 0.3); }
  &.number-input { max-width: 80px; }
}

.block-del {
  margin-left: auto;
}

/* 新增條件按鈕（虛線，淡色） */
.add-cond-btn {
  align-self: flex-start;
  padding: 3px 10px;
  font-size: 11px;
  border: 1px dashed rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-secondary, #999);
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: #3498db;
    color: #3498db;
    background: rgba(52, 152, 219, 0.05);
  }
}

/* 新增 OR 組按鈕 */
.add-group-btn {
  align-self: flex-start;
  padding: 4px 12px;
  font-size: 11px;
  border: 1px dashed rgba(155, 89, 182, 0.4);
  border-radius: 6px;
  background: transparent;
  color: #9b59b6;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: #9b59b6;
    background: rgba(155, 89, 182, 0.06);
  }
}

.rule-content-area {
  margin-top: 8px;

  .form-label-sm {
    font-size: 12px;
    color: var(--color-text-secondary, #999);
    margin-bottom: 4px;
    display: block;
  }

  .textarea {
    font-size: 13px;
    min-height: 60px;
  }
}

/* 底部操作列 */
.rule-editor-footer {
  display: flex;
  gap: 8px;
  align-items: center;
}

.add-rule-btn {
  flex: 1;
  padding: 8px;
  font-size: 13px;
  border: 1px dashed var(--color-primary, #7dd3a8);
  border-radius: 8px;
  background: transparent;
  color: var(--color-primary, #7dd3a8);
  cursor: pointer;
  text-align: center;
  transition: all 0.15s;

  &:hover {
    background: rgba(125, 211, 168, 0.08);
  }
}

.apply-rules-btn {
  padding: 8px 16px;
  font-size: 13px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--color-primary, #7dd3a8), var(--color-secondary, #a8d3e8));
  color: #fff;
  cursor: pointer;
  font-weight: 500;
  white-space: nowrap;
  transition: opacity 0.15s;

  &:hover { opacity: 0.9; }
}
</style>
