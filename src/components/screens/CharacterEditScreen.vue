<script setup lang="ts">
import ExpandableTextarea from "@/components/common/ExpandableTextarea.vue";
import { useCharactersStore, useLorebooksStore } from "@/stores";
import { useFitnessStore } from "@/stores/fitness";
import { useAffinityStore } from "@/stores/affinity";
import type { RegexScript } from "@/types/character";
import type { CharacterFitnessConfig } from "@/types/fitness";
import type { CharacterAffinityConfig, AffinityMetricConfig } from "@/schemas/affinity";
import { createDefaultConfig } from "@/schemas/affinity";
import { affinityTemplateService, DEFAULT_PROMPT_TEMPLATE } from "@/services/AffinityTemplateService";
import { computed, onMounted, ref } from "vue";

// 類型定義
interface CharacterData {
  name: string;
  description?: string;
  personality?: string;
  scenario?: string;
  character_atmosphere?: string;
  nai_character_prompt?: string;
  first_mes?: string;
  mes_example?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  creator?: string;
  creator_notes?: string;
  tags?: string[];
}

interface Character {
  id: string;
  nickname?: string;
  avatar: string;
  data: CharacterData;
  lorebookIds?: string[];
  source?: "png" | "json" | "manual";
  createdAt?: number;
  updatedAt?: number;
}

// Lorebook 類型已從 availableLorebooks computed 中推斷

// Props
const props = defineProps<{
  characterId?: string;
  isNew?: boolean;
}>();

// Emits
const emit = defineEmits<{
  (e: "back"): void;
  (e: "save", character: Character): void;
  (e: "open-lorebook", lorebookId: string): void;
  (e: "delete", id: string): void;
}>();

// 表單數據
const formData = ref<Character>({
  id: "",
  nickname: "",
  avatar: "",
  data: {
    name: "",
    description: "",
    personality: "",
    scenario: "",
    character_atmosphere: "",
    nai_character_prompt: "",
    first_mes: "",
    mes_example: "",
    system_prompt: "",
    post_history_instructions: "",
    creator: "",
    creator_notes: "",
    tags: [],
  },
  lorebookIds: [],
  source: "manual",
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// 新標籤輸入
const newTag = ref("");

// 顯示世界書選擇器
const showLorebookPicker = ref(false);

// 頭像上傳 input ref
const avatarInput = ref<HTMLInputElement | null>(null);

// 展開的區域
const expandedSections = ref({
  basic: true,
  character: true,
  dialogue: false,
  advanced: false,
  lorebook: true,
  regexScripts: true,
  modules: true,
  meta: false,
  danger: false,
});

// Stores
const charactersStore = useCharactersStore();
const lorebooksStore = useLorebooksStore();
const fitnessStore = useFitnessStore();
const affinityStore = useAffinityStore();

// 健身夥伴設定
const fitnessConfig = ref<CharacterFitnessConfig>({
  enabled: false,
  role: "partner",
  style: "gentle",
});

// 好感度設定（使用 placeholder ID，onMounted 時會替換為真實 characterId）
const affinityConfig = ref<CharacterAffinityConfig>({
  characterId: "_placeholder",
  enabled: false,
  statKey: "",
  metrics: [],
  promptTemplate: "",
  updateInstruction: "",
  lastUpdated: 0,
});
const affinityTemplatePreview = ref("");

// 「生成 AI 更新指令」Modal 狀態
const showUpdateInstructionModal = ref(false);
const generatedUpdateInstruction = ref("");

function generateUpdateInstruction() {
  generatedUpdateInstruction.value =
    affinityTemplateService.generateUpdateInstructionEntry(affinityConfig.value);
  showUpdateInstructionModal.value = true;
}

async function copyUpdateInstruction() {
  try {
    await navigator.clipboard.writeText(generatedUpdateInstruction.value);
  } catch {
    // 降級方案
    const el = document.createElement("textarea");
    el.value = generatedUpdateInstruction.value;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}

async function addInstructionToLinkedLorebook() {
  const lorebookIds = formData.value.lorebookIds ?? [];
  if (lorebookIds.length === 0) {
    alert("請先在「世界書」區域連結一個世界書。");
    return;
  }
  const targetLbId = lorebookIds[0];
  await lorebooksStore.addEntry(targetLbId, {
    comment: "[AI 更新指令] 好感度數值更新規則",
    key: [],
    content: generatedUpdateInstruction.value,
    constant: true,
    disable: false,
    order: 0,
  });
  showUpdateInstructionModal.value = false;
  alert("已成功加入世界書！");
}

// 可用世界書列表（從 store 獲取）
const availableLorebooks = computed(() =>
  lorebooksStore.lorebooks.map((lb) => ({ id: lb.id, name: lb.name })),
);

// 是否為新建模式
const isCreateMode = computed(() => props.isNew || !props.characterId);

// 頁面標題
const pageTitle = computed(() =>
  isCreateMode.value ? "創建角色" : "編輯角色",
);

// 切換區域展開
function toggleSection(section: keyof typeof expandedSections.value) {
  expandedSections.value[section] = !expandedSections.value[section];
}

// 格式化日期
function formatDate(timestamp?: number): string {
  if (!timestamp) return "未知";
  return new Date(timestamp).toLocaleString("zh-TW");
}

// 獲取來源文字
function getSourceText(): string {
  switch (formData.value.source) {
    case "png":
      return "PNG 角色卡";
    case "json":
      return "JSON 角色卡";
    case "manual":
      return "手動創建";
    default:
      return "未知";
  }
}

// 初始化數據
onMounted(async () => {
  // 確保世界書已載入
  if (lorebooksStore.lorebooks.length === 0) {
    await lorebooksStore.loadLorebooks();
  }

  // 載入健身設定
  await fitnessStore.loadFromDB();

  if (props.characterId && !props.isNew) {
    // 從 store 載入現有角色數據
    const character = charactersStore.characters.find(
      (c) => c.id === props.characterId,
    );
    if (character) {
      formData.value = {
        id: character.id,
        nickname: character.nickname || "",
        avatar: character.avatar || "",
        data: {
          name: character.data.name || "",
          description: character.data.description || "",
          personality: character.data.personality || "",
          scenario: character.data.scenario || "",
          character_atmosphere:
            (character.data.extensions as any)?.character_atmosphere || "",
          nai_character_prompt:
            (character.data.extensions as any)?.naiCharacterPrompt || "",
          first_mes: character.data.first_mes || "",
          mes_example: character.data.mes_example || "",
          system_prompt: character.data.system_prompt || "",
          post_history_instructions:
            character.data.post_history_instructions || "",
          creator: character.data.creator || "",
          creator_notes: character.data.creator_notes || "",
          tags: character.data.tags || [],
        },
        lorebookIds: character.lorebookIds || [],
        source:
          (character.source === "import" ? "manual" : character.source) ||
          "manual",
        createdAt: character.createdAt,
        updatedAt: character.updatedAt,
      };

      // 載入健身設定
      const storedFitnessConfig = fitnessStore.getCharacterFitnessConfig(
        character.id,
      );
      if (storedFitnessConfig) {
        fitnessConfig.value = { ...storedFitnessConfig };
      }

      // 載入好感度設定
      await affinityStore.initialize();
      const storedAffinityConfig = await affinityStore.loadConfig(character.id);
      if (storedAffinityConfig) {
        affinityConfig.value = { ...storedAffinityConfig };
        _updateAffinityPreview();
      } else {
        affinityConfig.value = createDefaultConfig(character.id);
      }
    } else {
      console.error("找不到角色:", props.characterId);
      emit("back");
    }
  } else {
    // 新建模式，生成新 ID
    formData.value.id = `char_${Date.now()}`;
    formData.value.createdAt = Date.now();
    formData.value.updatedAt = Date.now();
  }
});

// 處理返回
function handleBack() {
  emit("back");
}

// 處理儲存
async function handleSave() {
  if (!formData.value.data.name.trim()) {
    alert("請輸入角色名稱");
    return;
  }
  formData.value.updatedAt = Date.now();

  // 儲存健身設定
  if (fitnessConfig.value.enabled) {
    fitnessStore.setCharacterFitnessConfig(
      formData.value.id,
      fitnessConfig.value,
    );
  } else {
    fitnessStore.removeCharacterFitnessConfig(formData.value.id);
  }

  // 儲存好感度設定
  affinityConfig.value.characterId = formData.value.id;
  await affinityStore.saveConfig(affinityConfig.value);

  emit("save", { ...formData.value });
}

// ===== 好感度配置 =====

function addAffinityMetric() {
  const id = `metric_${Date.now()}`;
  affinityConfig.value.metrics.push({
    id,
    name: "",
    type: "number",
    min: 0,
    max: 100,
    initial: 50,
    options: [],
    stages: [],
  });
}

function removeAffinityMetric(index: number) {
  affinityConfig.value.metrics.splice(index, 1);
  _updateAffinityPreview();
}

function addAffinityStage(metricIndex: number) {
  affinityConfig.value.metrics[metricIndex].stages.push({
    name: "",
    minValue: 0,
  });
}

function removeAffinityStage(metricIndex: number, stageIndex: number) {
  affinityConfig.value.metrics[metricIndex].stages.splice(stageIndex, 1);
  _updateAffinityPreview();
}

function _updateAffinityPreview() {
  const template =
    affinityConfig.value.promptTemplate || DEFAULT_PROMPT_TEMPLATE;
  affinityTemplatePreview.value = affinityTemplateService.previewTemplate(
    template,
    affinityConfig.value.metrics,
  );
}

// 處理刪除
function handleDelete() {
  if (confirm("確定要刪除這個角色嗎？此操作不可恢復！")) {
    emit("delete", formData.value.id);
  }
}

// 導出角色卡 JSON（完整 CharacterCardV2 格式，包含綁定的世界書）
async function exportJSON() {
  // 從 store 取得完整角色資料（包含 extensions 等欄位）
  const fullCharacter = props.characterId
    ? charactersStore.characters.find((c) => c.id === props.characterId)
    : null;

  // 使用 store 中的完整 data，再覆蓋表單中可能被修改的欄位
  const baseData = fullCharacter?.data
    ? JSON.parse(JSON.stringify(fullCharacter.data))
    : {
        character_version: "1.0",
        alternate_greetings: [],
        extensions: {
          talkativeness: 0.5,
          fav: false,
          world: "",
          depth_prompt: { depth: 4, prompt: "", role: "system" },
          regex_scripts: [],
        },
      };

  // 覆蓋表單中編輯過的欄位
  const fd = formData.value.data;
  baseData.name = fd.name || "";
  baseData.description = fd.description || "";
  baseData.personality = fd.personality || "";
  baseData.scenario = fd.scenario || "";
  baseData.first_mes = fd.first_mes || "";
  baseData.mes_example = fd.mes_example || "";
  baseData.system_prompt = fd.system_prompt || "";
  baseData.post_history_instructions = fd.post_history_instructions || "";
  baseData.creator = fd.creator || "";
  baseData.creator_notes = fd.creator_notes || "";
  baseData.tags = fd.tags || [];
  if (fd.character_atmosphere) {
    baseData.extensions = baseData.extensions || {};
    baseData.extensions.character_atmosphere = fd.character_atmosphere;
  }
  if (fd.nai_character_prompt) {
    baseData.extensions = baseData.extensions || {};
    baseData.extensions.naiCharacterPrompt = fd.nai_character_prompt;
  }

  // 嵌入綁定的世界書到 character_book
  const lorebookIds = fullCharacter?.lorebookIds ?? [];
  if (lorebookIds.length > 0) {
    const { convertLorebookToCharacterBook } = await import(
      "@/services/ImportExportService"
    );
    const allEntries: any[] = [];
    let firstName = "";
    let firstDesc: string | undefined;

    for (const lbId of lorebookIds) {
      const lb = lorebooksStore.lorebooks.find((l) => l.id === lbId);
      if (!lb) continue;
      const book = convertLorebookToCharacterBook(lb);
      if (!firstName) {
        firstName = book.name;
        firstDesc = book.description;
      }
      allEntries.push(...book.entries);
    }

    if (allEntries.length > 0) {
      baseData.character_book = {
        name: firstName,
        description: firstDesc,
        scan_depth: undefined,
        token_budget: undefined,
        recursive_scanning: false,
        entries: allEntries,
      };
    }
  }

  const exportData = {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: baseData,
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  // 檔名只保留安全字元，避免手機下載後副檔名遺失
  const safeName = (fd.name || "character").replace(/[<>:"/\\|?*]/g, "_");
  a.download = `${safeName}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// 觸發頭像上傳
function triggerAvatarUpload() {
  avatarInput.value?.click();
}

// 處理頭像上傳
function handleAvatarUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  // 檢查檔案類型
  if (!file.type.startsWith("image/")) {
    alert("請選擇圖片檔案");
    return;
  }

  // 讀取並預覽
  const reader = new FileReader();
  reader.onload = (e) => {
    formData.value.avatar = e.target?.result as string;
  };
  reader.readAsDataURL(file);
}

// 新增標籤
function addTag() {
  const tag = newTag.value.trim();
  if (tag && !formData.value.data.tags?.includes(tag)) {
    formData.value.data.tags = [...(formData.value.data.tags || []), tag];
    newTag.value = "";
  }
}

// 移除標籤
function removeTag(tag: string) {
  formData.value.data.tags =
    formData.value.data.tags?.filter((t) => t !== tag) || [];
}

// 處理標籤輸入按鍵
function handleTagKeydown(event: KeyboardEvent) {
  if (event.key === "Enter") {
    event.preventDefault();
    addTag();
  }
}

// 切換世界書關聯
function toggleLorebook(id: string) {
  const ids = formData.value.lorebookIds || [];
  if (ids.includes(id)) {
    formData.value.lorebookIds = ids.filter((i) => i !== id);
  } else {
    formData.value.lorebookIds = [...ids, id];
  }
}

// ===== 角色正則腳本 =====
// 從 store 取得當前角色的正則腳本
const characterRegexScripts = computed<RegexScript[]>(() => {
  if (!props.characterId) return [];
  const character = charactersStore.characters.find(
    (c) => c.id === props.characterId,
  );
  return character?.data?.extensions?.regex_scripts ?? [];
});

// placement 數字轉顯示文字
function placementLabel(placement: number[]): string {
  const map: Record<number, string> = {
    1: "User",
    2: "AI",
    3: "Slash",
    5: "WI",
    6: "Reasoning",
  };
  return placement.map((p) => map[p] || String(p)).join(", ") || "—";
}

// 切換腳本啟用/停用
async function toggleRegexScript(scriptId: string) {
  if (!props.characterId) return;
  const character = charactersStore.characters.find(
    (c) => c.id === props.characterId,
  );
  if (!character?.data?.extensions?.regex_scripts) return;
  const scripts = [...character.data.extensions.regex_scripts];
  const idx = scripts.findIndex((s) => s.id === scriptId);
  if (idx === -1) return;
  scripts[idx] = { ...scripts[idx], disabled: !scripts[idx].disabled };
  const updatedData = {
    ...character.data,
    extensions: { ...character.data.extensions, regex_scripts: scripts },
  };
  await charactersStore.updateCharacter(props.characterId, {
    data: updatedData,
  });
}

// 刪除腳本
async function deleteRegexScript(scriptId: string) {
  if (!props.characterId) return;
  if (!confirm("確定要刪除這個正則腳本嗎？")) return;
  const character = charactersStore.characters.find(
    (c) => c.id === props.characterId,
  );
  if (!character?.data?.extensions?.regex_scripts) return;
  const scripts = character.data.extensions.regex_scripts.filter(
    (s) => s.id !== scriptId,
  );
  const updatedData = {
    ...character.data,
    extensions: { ...character.data.extensions, regex_scripts: scripts },
  };
  await charactersStore.updateCharacter(props.characterId, {
    data: updatedData,
  });
}

// ===== 角色正則腳本新增/編輯彈窗 =====
const showRegexModal = ref(false);
const regexEditingId = ref<string | null>(null);
const regexFileInput = ref<HTMLInputElement | null>(null);

const rfName = ref("");
const rfFindRegex = ref("");
const rfReplaceString = ref("");
const rfTrimStrings = ref("");
const rfPlaceUser = ref(true);
const rfPlaceAI = ref(true);
const rfPlaceSlash = ref(false);
const rfPlaceWI = ref(false);
const rfDisabled = ref(false);
const rfMarkdownOnly = ref(false);
const rfPromptOnly = ref(false);
const rfRunOnEdit = ref(false);
const rfSubstituteRegex = ref(0);
const rfMinDepth = ref<number | "">("");
const rfMaxDepth = ref<number | "">("");
const rfError = ref("");

function validateCharRegex() {
  if (!rfFindRegex.value) {
    rfError.value = "";
    return;
  }
  try {
    const m = rfFindRegex.value.match(/(\/?)(.+)\1([a-z]*)/i);
    if (m) new RegExp(m[2], m[3]);
    rfError.value = "";
  } catch {
    rfError.value = "正則格式無效";
  }
}

function resetRegexForm() {
  regexEditingId.value = null;
  rfName.value = "";
  rfFindRegex.value = "";
  rfReplaceString.value = "";
  rfTrimStrings.value = "";
  rfPlaceUser.value = true;
  rfPlaceAI.value = true;
  rfPlaceSlash.value = false;
  rfPlaceWI.value = false;
  rfDisabled.value = false;
  rfMarkdownOnly.value = false;
  rfPromptOnly.value = false;
  rfRunOnEdit.value = false;
  rfSubstituteRegex.value = 0;
  rfMinDepth.value = "";
  rfMaxDepth.value = "";
  rfError.value = "";
}

function openNewRegex() {
  resetRegexForm();
  showRegexModal.value = true;
}

function openEditRegex(script: RegexScript) {
  regexEditingId.value = script.id;
  rfName.value = script.scriptName;
  rfFindRegex.value = script.findRegex;
  rfReplaceString.value = script.replaceString;
  rfTrimStrings.value = (script.trimStrings ?? []).join("\n");
  rfPlaceUser.value = script.placement?.includes(1) ?? false;
  rfPlaceAI.value = script.placement?.includes(2) ?? false;
  rfPlaceSlash.value = script.placement?.includes(3) ?? false;
  rfPlaceWI.value = script.placement?.includes(5) ?? false;
  rfDisabled.value = script.disabled ?? false;
  rfMarkdownOnly.value = script.markdownOnly ?? false;
  rfPromptOnly.value = script.promptOnly ?? false;
  rfRunOnEdit.value = script.runOnEdit ?? false;
  rfSubstituteRegex.value = script.substituteRegex ?? 0;
  rfMinDepth.value =
    script.minDepth != null && script.minDepth >= 0 ? script.minDepth : "";
  rfMaxDepth.value =
    script.maxDepth != null && script.maxDepth >= 0 ? script.maxDepth : "";
  rfError.value = "";
  showRegexModal.value = true;
}

async function saveCharRegex() {
  if (!props.characterId || !rfName.value.trim()) return;
  validateCharRegex();
  if (rfError.value) return;

  const placement: number[] = [];
  if (rfPlaceUser.value) placement.push(1);
  if (rfPlaceAI.value) placement.push(2);
  if (rfPlaceSlash.value) placement.push(3);
  if (rfPlaceWI.value) placement.push(5);

  const scriptData: RegexScript = {
    id: regexEditingId.value || crypto.randomUUID(),
    scriptName: rfName.value.trim(),
    findRegex: rfFindRegex.value,
    replaceString: rfReplaceString.value,
    trimStrings: rfTrimStrings.value
      ? rfTrimStrings.value.split("\n").filter(Boolean)
      : [],
    placement,
    disabled: rfDisabled.value,
    markdownOnly: rfMarkdownOnly.value,
    promptOnly: rfPromptOnly.value,
    runOnEdit: rfRunOnEdit.value,
    substituteRegex: rfSubstituteRegex.value,
    minDepth: rfMinDepth.value === "" ? -1 : Number(rfMinDepth.value),
    maxDepth: rfMaxDepth.value === "" ? -1 : Number(rfMaxDepth.value),
  };

  const character = charactersStore.characters.find(
    (c) => c.id === props.characterId,
  );
  if (!character) return;

  const existing = character.data?.extensions?.regex_scripts ?? [];
  let scripts: RegexScript[];

  if (regexEditingId.value) {
    scripts = existing.map((s) =>
      s.id === regexEditingId.value ? scriptData : s,
    );
  } else {
    scripts = [...existing, scriptData];
  }

  const updatedData = {
    ...character.data,
    extensions: {
      ...(character.data.extensions ?? {}),
      regex_scripts: scripts,
    },
  };
  await charactersStore.updateCharacter(props.characterId, {
    data: updatedData,
  });
  showRegexModal.value = false;
}

async function onRegexFileImport(e: Event) {
  if (!props.characterId) return;
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const raw = JSON.parse(text);
    const items: Partial<RegexScript>[] = Array.isArray(raw) ? raw : [raw];
    const character = charactersStore.characters.find(
      (c) => c.id === props.characterId,
    );
    if (!character) return;
    const existing = character.data?.extensions?.regex_scripts ?? [];
    const newScripts = [...existing];
    let count = 0;
    for (const item of items) {
      if (!item.scriptName) continue;
      newScripts.push({
        id: crypto.randomUUID(),
        scriptName: item.scriptName,
        findRegex: item.findRegex ?? "",
        replaceString: item.replaceString ?? "",
        trimStrings: item.trimStrings ?? [],
        placement: Array.isArray(item.placement) ? item.placement : [],
        disabled: item.disabled ?? false,
        markdownOnly: item.markdownOnly ?? false,
        promptOnly: item.promptOnly ?? false,
        runOnEdit: item.runOnEdit ?? false,
        substituteRegex: item.substituteRegex ?? 0,
        minDepth: item.minDepth ?? -1,
        maxDepth: item.maxDepth ?? -1,
      });
      count++;
    }
    const updatedData = {
      ...character.data,
      extensions: {
        ...(character.data.extensions ?? {}),
        regex_scripts: newScripts,
      },
    };
    await charactersStore.updateCharacter(props.characterId, {
      data: updatedData,
    });
    alert(`成功導入 ${count} 個角色腳本`);
  } catch {
    alert("導入失敗：JSON 格式錯誤");
  }
  if (regexFileInput.value) regexFileInput.value.value = "";
}
</script>

<template>
  <div class="screen-container character-edit-screen">
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
        <!-- 刪除按鈕（僅編輯模式） -->
        <button
          v-if="!isCreateMode"
          class="header-btn danger"
          title="刪除角色"
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
      <!-- 頭像區域 -->
      <section class="avatar-section">
        <div class="avatar-wrapper" @click="triggerAvatarUpload">
          <img
            v-if="formData.avatar"
            :src="formData.avatar"
            alt="角色頭像"
            class="avatar-preview"
          />
          <div v-else class="avatar-placeholder">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
              />
            </svg>
          </div>
          <div class="avatar-edit-badge">📷</div>
        </div>
        <input
          ref="avatarInput"
          type="file"
          accept="image/*"
          class="hidden-input"
          @change="handleAvatarUpload"
        />
        <p class="avatar-hint">點擊更換頭像</p>
      </section>

      <!-- ===== 基本信息 ===== -->
      <section class="edit-section">
        <div class="section-header" @click="toggleSection('basic')">
          <h3 class="section-title">基本信息</h3>
          <svg
            class="section-chevron"
            :class="{ open: expandedSections.basic }"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
          </svg>
        </div>

        <Transition name="slide">
          <div v-if="expandedSections.basic" class="section-content">
            <div class="form-group">
              <label class="form-label"
                >角色名稱 <span class="required">*</span></label
              >
              <input
                v-model="formData.data.name"
                type="text"
                class="soft-input"
                placeholder="輸入角色名稱"
              />
            </div>

            <div class="form-group">
              <label class="form-label"
                >暱稱 <span class="optional">(可選)</span></label
              >
              <input
                v-model="formData.nickname"
                type="text"
                class="soft-input"
                placeholder="輸入角色暱稱，用於顯示"
              />
              <p class="form-hint">
                設置暱稱後，在聊天列表、噗浪空間、通知等界面會顯示暱稱，但
                &#123;&#123;char&#125;&#125; 仍使用角色本名
              </p>
            </div>

            <div class="form-group">
              <label class="form-label">創建者</label>
              <input
                v-model="formData.data.creator"
                type="text"
                class="soft-input"
                placeholder="創建者名稱"
              />
            </div>

            <div class="form-group">
              <label class="form-label">標籤</label>
              <div class="tags-container">
                <span
                  v-for="tag in formData.data.tags"
                  :key="tag"
                  class="soft-tag editable"
                >
                  {{ tag }}
                  <button class="tag-remove" @click="removeTag(tag)">×</button>
                </span>
                <div class="tag-input-wrapper">
                  <input
                    v-model="newTag"
                    type="text"
                    class="tag-input"
                    placeholder="添加標籤..."
                    @keydown="handleTagKeydown"
                  />
                  <button
                    v-if="newTag.trim()"
                    class="tag-add-btn"
                    @click="addTag"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </section>

      <!-- ===== 角色設定 ===== -->
      <section class="edit-section">
        <div class="section-header" @click="toggleSection('character')">
          <h3 class="section-title">角色設定</h3>
          <svg
            class="section-chevron"
            :class="{ open: expandedSections.character }"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
          </svg>
        </div>

        <Transition name="slide">
          <div v-if="expandedSections.character" class="section-content">
            <div class="form-group">
              <label class="form-label">角色描述</label>
              <ExpandableTextarea
                v-model="formData.data.description"
                :rows="4"
                placeholder="描述角色的外觀、背景等..."
                label="角色描述"
              />
            </div>

            <div class="form-group">
              <label class="form-label">秘密</label>
              <ExpandableTextarea
                v-model="formData.data.personality"
                :rows="3"
                placeholder="角色的秘密..."
                label="秘密"
              />
            </div>

            <div class="form-group">
              <label class="form-label">說話方式</label>
              <ExpandableTextarea
                v-model="formData.data.scenario"
                :rows="3"
                placeholder="角色的說話方式、語氣特點..."
                label="說話方式"
              />
            </div>

            <div class="form-group">
              <label class="form-label">角色氛圍</label>
              <ExpandableTextarea
                v-model="formData.data.character_atmosphere"
                :rows="3"
                placeholder="角色散發的氛圍、給人的感覺..."
                label="角色氛圍"
              />
            </div>

            <div class="form-group">
              <label class="form-label">NAI 角色串</label>
              <ExpandableTextarea
                v-model="formData.data.nai_character_prompt"
                :rows="3"
                placeholder="例如：1girl, long hair, blue eyes"
                label="NAI 角色串"
              />
              <p class="form-hint">
                生圖時會自動加在提示詞最前方，留空則跳過
              </p>
            </div>
          </div>
        </Transition>
      </section>

      <!-- ===== 對話設定 ===== -->
      <section class="edit-section">
        <div class="section-header" @click="toggleSection('dialogue')">
          <h3 class="section-title">對話設定</h3>
          <svg
            class="section-chevron"
            :class="{ open: expandedSections.dialogue }"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
          </svg>
        </div>

        <Transition name="slide">
          <div v-if="expandedSections.dialogue" class="section-content">
            <div class="form-group">
              <label class="form-label">初始消息</label>
              <ExpandableTextarea
                v-model="formData.data.first_mes"
                :rows="3"
                placeholder="角色的第一句話..."
                label="初始消息"
              />
            </div>

            <div class="form-group">
              <label class="form-label">對話範例</label>
              <ExpandableTextarea
                v-model="formData.data.mes_example"
                :rows="5"
                placeholder="{{user}}: 你好！&#10;{{char}}: 你好呀！很高興見到你。"
                label="對話範例"
              />
              <p class="form-hint">
                使用 &#123;&#123;user&#125;&#125; 和
                &#123;&#123;char&#125;&#125; 作為佔位符
              </p>
            </div>
          </div>
        </Transition>
      </section>

      <!-- ===== 高級設定 ===== -->
      <section class="edit-section">
        <div class="section-header" @click="toggleSection('advanced')">
          <h3 class="section-title">高級設定</h3>
          <svg
            class="section-chevron"
            :class="{ open: expandedSections.advanced }"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
          </svg>
        </div>

        <Transition name="slide">
          <div v-if="expandedSections.advanced" class="section-content">
            <div class="form-group">
              <label class="form-label">系統提示</label>
              <ExpandableTextarea
                v-model="formData.data.system_prompt"
                :rows="3"
                placeholder="給 AI 的系統級指示..."
                label="系統提示"
              />
            </div>

            <div class="form-group">
              <label class="form-label">歷史後指令</label>
              <ExpandableTextarea
                v-model="formData.data.post_history_instructions"
                :rows="3"
                placeholder="在對話歷史後添加的指令..."
                label="歷史後指令"
              />
            </div>

            <div class="form-group">
              <label class="form-label">創建者備註</label>
              <ExpandableTextarea
                v-model="formData.data.creator_notes"
                :rows="3"
                placeholder="創建者的備註、使用說明..."
                label="創建者備註"
              />
            </div>
          </div>
        </Transition>
      </section>

      <!-- ===== 綁定世界書 ===== -->
      <section class="edit-section">
        <div class="section-header" @click="toggleSection('lorebook')">
          <h3 class="section-title">綁定世界書</h3>
          <svg
            class="section-chevron"
            :class="{ open: expandedSections.lorebook }"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
          </svg>
        </div>

        <Transition name="slide">
          <div v-if="expandedSections.lorebook" class="section-content">
            <div class="lorebook-list">
              <div
                v-for="lbId in formData.lorebookIds"
                :key="lbId"
                class="lorebook-item"
              >
                <span class="lorebook-icon">📖</span>
                <span
                  class="lorebook-name lorebook-link"
                  @click="emit('open-lorebook', lbId)"
                >{{
                  availableLorebooks.find((lb) => lb.id === lbId)?.name ||
                  "未知世界書"
                }}</span>
                <button class="lorebook-remove" @click="toggleLorebook(lbId)">
                  🗑️
                </button>
              </div>
              <button
                class="add-lorebook-btn"
                @click="showLorebookPicker = !showLorebookPicker"
              >
                + 綁定世界書
              </button>
            </div>

            <!-- 世界書選擇列表 -->
            <Transition name="slide">
              <div v-if="showLorebookPicker" class="lorebook-picker">
                <label
                  v-for="lb in availableLorebooks"
                  :key="lb.id"
                  class="lorebook-option"
                >
                  <input
                    type="checkbox"
                    :checked="formData.lorebookIds?.includes(lb.id)"
                    @change="toggleLorebook(lb.id)"
                  />
                  <span class="checkbox-custom"></span>
                  <span>{{ lb.name }}</span>
                </label>
                <p v-if="availableLorebooks.length === 0" class="no-lorebooks">
                  還沒有世界書，請先創建
                </p>
              </div>
            </Transition>
          </div>
        </Transition>
      </section>

      <!-- ===== 綁定正則腳本 ===== -->
      <section v-if="!isCreateMode" class="edit-section">
        <div class="section-header" @click="toggleSection('regexScripts')">
          <h3 class="section-title">
            正則腳本 ({{ characterRegexScripts.length }})
          </h3>
          <svg
            class="section-chevron"
            :class="{ open: expandedSections.regexScripts }"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
          </svg>
        </div>

        <Transition name="slide">
          <div v-if="expandedSections.regexScripts" class="section-content">
            <p class="form-hint" style="margin-bottom: 12px">
              角色卡內嵌的正則腳本，僅在與此角色聊天時生效
            </p>
            <div class="regex-list">
              <div
                v-for="script in characterRegexScripts"
                :key="script.id"
                class="regex-item"
                :class="{ disabled: script.disabled }"
              >
                <div class="regex-item-header">
                  <label class="toggle-switch small">
                    <input
                      type="checkbox"
                      :checked="!script.disabled"
                      @change="toggleRegexScript(script.id)"
                    />
                    <span class="toggle-slider"></span>
                  </label>
                  <span class="regex-name" @click="openEditRegex(script)">{{
                    script.scriptName
                  }}</span>
                  <button
                    class="regex-delete"
                    @click="deleteRegexScript(script.id)"
                    title="刪除"
                  >
                    ×
                  </button>
                </div>
                <div class="regex-detail" @click="openEditRegex(script)">
                  <code class="regex-find">{{ script.findRegex }}</code>
                  <span class="regex-placement">{{
                    placementLabel(script.placement)
                  }}</span>
                </div>
              </div>
            </div>
            <button
              class="add-lorebook-btn"
              style="margin-top: 8px"
              @click="openNewRegex"
            >
              + 新增正則腳本
            </button>
            <!-- 導入角色腳本 -->
            <button
              class="add-lorebook-btn"
              style="margin-top: 4px; border-style: dotted"
              @click="regexFileInput?.click()"
            >
              📥 導入 JSON
            </button>
            <input
              ref="regexFileInput"
              type="file"
              accept=".json"
              style="display: none"
              @change="onRegexFileImport"
            />
          </div>
        </Transition>
      </section>

      <!-- ===== 角色正則腳本編輯彈窗 ===== -->
      <div
        v-if="showRegexModal"
        class="modal-overlay"
        @click.self="showRegexModal = false"
      >
        <div class="regex-modal">
          <div class="regex-modal-header">
            <span>{{ regexEditingId ? "編輯腳本" : "新增角色腳本" }}</span>
            <button class="regex-modal-close" @click="showRegexModal = false">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                />
              </svg>
            </button>
          </div>
          <div class="regex-modal-body">
            <label class="form-label">腳本名稱</label>
            <input v-model="rfName" class="soft-input" placeholder="腳本名稱" />

            <label class="form-label" style="margin-top: 12px">查找正則</label>
            <input
              v-model="rfFindRegex"
              class="soft-input"
              style="font-family: monospace; font-size: 13px"
              placeholder="/pattern/flags"
              @input="validateCharRegex"
            />
            <p
              v-if="rfError"
              style="font-size: 12px; color: #e53e3e; margin: 2px 0 0"
            >
              {{ rfError }}
            </p>

            <label class="form-label" style="margin-top: 12px">替換為</label>
            <textarea
              v-model="rfReplaceString"
              class="soft-input textarea"
              rows="3"
              style="font-family: monospace; font-size: 13px"
              placeholder="替換字串，支援 {{match}}、$1"
            />

            <label class="form-label" style="margin-top: 12px"
              >修剪字串（每行一個）</label
            >
            <textarea
              v-model="rfTrimStrings"
              class="soft-input textarea"
              rows="2"
              placeholder="每行一個"
            />

            <label class="form-label" style="margin-top: 12px">影響位置</label>
            <div class="regex-checkbox-row">
              <label
                ><input type="checkbox" v-model="rfPlaceUser" />
                使用者輸入</label
              >
              <label
                ><input type="checkbox" v-model="rfPlaceAI" /> AI 輸出</label
              >
              <label
                ><input type="checkbox" v-model="rfPlaceSlash" />
                斜線命令</label
              >
              <label
                ><input type="checkbox" v-model="rfPlaceWI" /> 世界資訊</label
              >
            </div>

            <label class="form-label" style="margin-top: 12px">選項</label>
            <div class="regex-checkbox-row">
              <label><input type="checkbox" v-model="rfDisabled" /> 停用</label>
              <label
                ><input type="checkbox" v-model="rfRunOnEdit" />
                編輯時執行</label
              >
              <label
                ><input type="checkbox" v-model="rfMarkdownOnly" />
                僅顯示</label
              >
              <label
                ><input type="checkbox" v-model="rfPromptOnly" />
                僅提示詞</label
              >
            </div>

            <label class="form-label" style="margin-top: 12px">巨集替換</label>
            <select
              v-model="rfSubstituteRegex"
              class="soft-input"
              style="cursor: pointer"
            >
              <option :value="0">不替換</option>
              <option :value="1">替換（直接）</option>
              <option :value="2">替換（跳脫）</option>
            </select>

            <div style="display: flex; gap: 8px; margin-top: 12px">
              <div style="flex: 1">
                <label class="form-label">最小深度</label>
                <input
                  v-model="rfMinDepth"
                  type="number"
                  class="soft-input"
                  placeholder="無"
                  min="0"
                />
              </div>
              <div style="flex: 1">
                <label class="form-label">最大深度</label>
                <input
                  v-model="rfMaxDepth"
                  type="number"
                  class="soft-input"
                  placeholder="無"
                  min="0"
                />
              </div>
            </div>
          </div>
          <div class="regex-modal-footer">
            <button class="regex-modal-cancel" @click="showRegexModal = false">
              取消
            </button>
            <button
              class="regex-modal-save"
              :disabled="!rfName.trim() || !!rfError"
              @click="saveCharRegex"
            >
              儲存
            </button>
          </div>
        </div>
      </div>

      <!-- ===== 功能模組 ===== -->
      <section class="edit-section">
        <div class="section-header" @click="toggleSection('modules')">
          <h3 class="section-title">功能模組</h3>
          <svg
            class="section-chevron"
            :class="{ open: expandedSections.modules }"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
          </svg>
        </div>

        <Transition name="slide">
          <div v-if="expandedSections.modules" class="section-content">
            <!-- 健身夥伴模組 -->
            <div class="module-card">
              <div class="module-header">
                <div class="module-info">
                  <span class="module-icon">🏋️</span>
                  <div>
                    <span class="module-name">健身夥伴</span>
                    <span class="module-desc">讓角色陪伴你訓練</span>
                  </div>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" v-model="fitnessConfig.enabled" />
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <Transition name="slide">
                <div v-if="fitnessConfig.enabled" class="module-settings">
                  <div class="setting-group">
                    <label class="setting-label">角色類型</label>
                    <div class="setting-options">
                      <button
                        :class="{ active: fitnessConfig.role === 'coach' }"
                        @click="fitnessConfig.role = 'coach'"
                      >
                        教練
                      </button>
                      <button
                        :class="{ active: fitnessConfig.role === 'partner' }"
                        @click="fitnessConfig.role = 'partner'"
                      >
                        夥伴
                      </button>
                      <button
                        :class="{
                          active: fitnessConfig.role === 'cheerleader',
                        }"
                        @click="fitnessConfig.role = 'cheerleader'"
                      >
                        啦啦隊
                      </button>
                    </div>
                  </div>

                  <div class="setting-group">
                    <label class="setting-label">互動風格</label>
                    <div class="setting-options">
                      <button
                        :class="{ active: fitnessConfig.style === 'strict' }"
                        @click="fitnessConfig.style = 'strict'"
                      >
                        嚴格
                      </button>
                      <button
                        :class="{ active: fitnessConfig.style === 'gentle' }"
                        @click="fitnessConfig.style = 'gentle'"
                      >
                        溫柔
                      </button>
                      <button
                        :class="{ active: fitnessConfig.style === 'playful' }"
                        @click="fitnessConfig.style = 'playful'"
                      >
                        俏皮
                      </button>
                    </div>
                  </div>
                </div>
              </Transition>
            </div>

            <!-- 好感度數值模組 -->
            <div class="module-card">
              <div class="module-header">
                <div class="module-info">
                  <span class="module-icon">💕</span>
                  <div>
                    <span class="module-name">好感度數值</span>
                    <span class="module-desc">自定義數值指標系統</span>
                  </div>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" v-model="affinityConfig.enabled" />
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <Transition name="slide">
                <div v-if="affinityConfig.enabled" class="module-settings">
                  <!-- EJS 路徑名稱 -->
                  <div class="setting-group">
                    <label class="setting-label">
                      EJS 路徑名稱
                      <span class="setting-hint">（留空使用角色名「{{ formData.data.name }}」）</span>
                    </label>
                    <input
                      v-model="affinityConfig.statKey"
                      class="soft-input"
                      :placeholder="formData.data.name"
                    />
                    <p class="setting-desc">
                      世界書 EJS 中引用數值的路徑前綴，例如填「黎靖青」後可在 EJS 寫
                      <code>getvar('stat_data.黎靖青.亲密值')</code>，
                      即使卡片名字不同也能正確解析。
                    </p>
                  </div>

                  <!-- 指標列表 -->
                  <div class="setting-group">
                    <label class="setting-label">數值指標</label>
                    <div
                      v-for="(metric, mIdx) in affinityConfig.metrics"
                      :key="metric.id"
                      class="affinity-metric-card"
                    >
                      <div class="affinity-metric-header">
                        <input
                          v-model="metric.name"
                          placeholder="指標名稱（如 好感度）"
                          class="soft-input affinity-name-input"
                          @blur="_updateAffinityPreview()"
                        />
                        <button
                          class="btn-icon-sm btn-danger-sm"
                          @click="removeAffinityMetric(mIdx)"
                          title="刪除指標"
                        >
                          ✕
                        </button>
                      </div>
                      <div class="affinity-metric-type-row">
                        <label class="setting-label-sm">類型</label>
                        <select
                          v-model="metric.type"
                          class="soft-input type-select"
                          @change="_updateAffinityPreview()"
                        >
                          <option value="number">數字</option>
                          <option value="string">字串/枚舉</option>
                        </select>
                      </div>

                      <div v-if="metric.type !== 'string'" class="affinity-metric-ranges">
                        <div class="range-field">
                          <label>最小</label>
                          <input
                            type="number"
                            v-model.number="metric.min"
                            class="soft-input range-input"
                          />
                        </div>
                        <div class="range-field">
                          <label>最大</label>
                          <input
                            type="number"
                            v-model.number="metric.max"
                            class="soft-input range-input"
                          />
                        </div>
                        <div class="range-field">
                          <label>初始</label>
                          <input
                            type="number"
                            v-model.number="metric.initial"
                            class="soft-input range-input"
                            @change="_updateAffinityPreview()"
                          />
                        </div>
                      </div>

                      <div v-else class="affinity-string-config">
                        <div class="range-field">
                          <label>初始值</label>
                          <input
                            v-model="metric.initial"
                            class="soft-input"
                            placeholder="初始狀態值"
                            @change="_updateAffinityPreview()"
                          />
                        </div>
                        <div class="range-field">
                          <label>可選值（逗號分隔）</label>
                          <input
                            :value="(metric.options ?? []).join(', ')"
                            @input="metric.options = ($event.target as HTMLInputElement).value.split(',').map((s: string) => s.trim()).filter(Boolean)"
                            class="soft-input"
                            placeholder="例如：未識破, 已識破"
                          />
                        </div>
                      </div>

                      <!-- 階段定義 -->
                      <div class="affinity-stages">
                        <label class="setting-label-sm">階段定義</label>
                        <div
                          v-for="(stage, sIdx) in metric.stages"
                          :key="sIdx"
                          class="affinity-stage-row"
                        >
                          <input
                            v-model="stage.name"
                            placeholder="階段名"
                            class="soft-input stage-name-input"
                            @blur="_updateAffinityPreview()"
                          />
                          <input
                            type="number"
                            v-model.number="stage.minValue"
                            placeholder="起始值"
                            class="soft-input stage-value-input"
                          />
                          <button
                            class="btn-icon-sm btn-danger-sm"
                            @click="removeAffinityStage(mIdx, sIdx)"
                          >
                            ✕
                          </button>
                        </div>
                        <button
                          class="btn-add-sm"
                          @click="addAffinityStage(mIdx)"
                        >
                          + 新增階段
                        </button>
                      </div>
                    </div>
                    <button class="btn-add" @click="addAffinityMetric">
                      + 新增指標
                    </button>
                  </div>

                  <!-- 生成 AI 更新指令按鈕 -->
                  <div v-if="affinityConfig.metrics.length > 0" class="setting-group generate-instruction-group">
                    <label class="setting-label">AI 更新指令生成器</label>
                    <p class="setting-hint-text">根據你配置的指標，自動生成「告訴 AI 如何更新數值」的世界書條目文字。</p>
                    <button class="btn-generate-instruction" @click="generateUpdateInstruction">
                      生成 AI 更新指令
                    </button>
                  </div>

                  <!-- EJS 模板編輯器 -->
                  <div class="setting-group">
                    <label class="setting-label">Prompt 注入模板（EJS）</label>
                    <textarea
                      v-model="affinityConfig.promptTemplate"
                      class="soft-input code-textarea"
                      rows="5"
                      :placeholder="'留空使用預設模板'"
                      @input="_updateAffinityPreview()"
                    ></textarea>
                    <div
                      v-if="affinityTemplatePreview"
                      class="template-preview"
                    >
                      <label class="setting-label-sm">預覽</label>
                      <pre class="preview-text">{{ affinityTemplatePreview }}</pre>
                    </div>
                  </div>

                  <!-- AI 更新規則 -->
                  <div class="setting-group">
                    <label class="setting-label">AI 更新規則</label>
                    <textarea
                      v-model="affinityConfig.updateInstruction"
                      class="soft-input"
                      rows="4"
                      placeholder="留空使用預設規則（告知 AI 如何用 <affinity-update> 標籤更新數值）"
                    ></textarea>
                  </div>
                </div>
              </Transition>
            </div>
          </div>
        </Transition>
      </section>

      <!-- ===== 元數據 ===== -->
      <section class="edit-section">
        <div class="section-header" @click="toggleSection('meta')">
          <h3 class="section-title">元數據</h3>
          <svg
            class="section-chevron"
            :class="{ open: expandedSections.meta }"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
          </svg>
        </div>

        <Transition name="slide">
          <div v-if="expandedSections.meta" class="section-content">
            <div class="meta-info">
              <p><strong>來源:</strong> {{ getSourceText() }}</p>
              <p>
                <strong>創建時間:</strong> {{ formatDate(formData.createdAt) }}
              </p>
              <p>
                <strong>更新時間:</strong> {{ formatDate(formData.updatedAt) }}
              </p>
            </div>
          </div>
        </Transition>
      </section>

      <!-- ===== 危險區域 ===== -->
      <section class="edit-section danger-section" v-if="!isCreateMode">
        <div class="section-header" @click="toggleSection('danger')">
          <h3 class="section-title">危險區域</h3>
          <svg
            class="section-chevron"
            :class="{ open: expandedSections.danger }"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
          </svg>
        </div>

        <Transition name="slide">
          <div v-if="expandedSections.danger" class="section-content">
            <button class="action-btn" @click="exportJSON">
              📄 導出角色卡 (JSON)
            </button>
            <button class="danger-btn delete" @click="handleDelete">
              🗑️ 刪除角色
            </button>
          </div>
        </Transition>
      </section>
    </main>

    <!-- ===== 生成 AI 更新指令 Modal ===== -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showUpdateInstructionModal" class="modal-overlay" @click.self="showUpdateInstructionModal = false">
          <div class="modal-panel generate-modal">
            <div class="modal-header">
              <h3 class="modal-title">AI 更新指令</h3>
              <button class="modal-close" @click="showUpdateInstructionModal = false">✕</button>
            </div>
            <p class="modal-desc">將此文字加入世界書條目，AI 就會知道如何更新數值。</p>
            <textarea
              v-model="generatedUpdateInstruction"
              class="soft-input code-textarea modal-text-area"
              rows="14"
              readonly
            ></textarea>
            <div class="modal-actions">
              <button class="modal-btn secondary" @click="copyUpdateInstruction">複製文字</button>
              <button
                class="modal-btn primary"
                :disabled="(formData.lorebookIds ?? []).length === 0"
                :title="(formData.lorebookIds ?? []).length === 0 ? '請先連結世界書' : '加入第一個連結的世界書'"
                @click="addInstructionToLinkedLorebook"
              >
                加入世界書
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.character-edit-screen {
  background: #f5f5f5;
}

// 編輯內容區
.edit-content {
  padding: 16px;
  padding-bottom: calc(16px + var(--safe-bottom, 0px));
  max-width: 600px;
  margin: 0 auto;
}

// 頭像區域
.avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0;
}

.avatar-wrapper {
  position: relative;
  width: 120px;
  height: 120px;
  cursor: pointer;

  &:hover .avatar-edit-badge {
    transform: scale(1.1);
  }
}

.avatar-preview {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  border: 4px solid white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 4px solid #e0e0e0;

  svg {
    width: 48px;
    height: 48px;
    color: #9ca3af;
  }
}

.avatar-edit-badge {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 36px;
  height: 36px;
  background: #f093fb;
  border-radius: 50%;
  border: 2px solid white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition: transform 0.2s;
}

.avatar-hint {
  margin-top: 12px;
  font-size: 13px;
  color: #6b7280;
}

.hidden-input {
  display: none;
}

// 區域樣式
.edit-section {
  background: white;
  border-radius: 12px;
  margin-bottom: 16px;
  overflow: hidden;

  &.danger-section {
    border: 2px solid #ffebee;
  }
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #f9fafb;
  }
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin: 0;
}

.section-chevron {
  width: 20px;
  height: 20px;
  color: #9ca3af;
  transition: transform 0.2s;

  &.open {
    transform: rotate(180deg);
  }
}

.section-content {
  padding: 0 16px 16px;
}

// 表單
.form-group {
  margin-bottom: 16px;

  &:last-child {
    margin-bottom: 0;
  }
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #666;
  margin-bottom: 8px;

  .required {
    color: #ef4444;
  }

  .optional {
    font-size: 11px;
    font-weight: 400;
    color: #999;
    font-style: italic;
  }
}

.form-hint {
  margin: 4px 0 0 0;
  font-size: 12px;
  color: #999;
}

.soft-input {
  width: 100%;
  padding: 10px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: #f093fb;
  }

  &::placeholder {
    color: #9ca3af;
  }

  &.textarea {
    resize: vertical;
    min-height: 60px;
  }
}

// 標籤
.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  min-height: 44px;
}

.soft-tag.editable {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: #f0f0f0;
  border-radius: 4px;
  font-size: 12px;

  .tag-remove {
    border: none;
    background: transparent;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    color: #999;
    padding: 0;

    &:hover {
      color: #f44336;
    }
  }
}

.tag-input-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 100px;
}

.tag-input {
  flex: 1;
  min-width: 80px;
  border: none;
  outline: none;
  font-size: 14px;
  padding: 4px;
}

.tag-add-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: #f093fb;
  color: white;
  border-radius: 50%;
  font-size: 16px;
  cursor: pointer;
  transition: transform 0.2s;

  &:hover {
    transform: scale(1.1);
  }
}

// 世界書列表
.lorebook-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lorebook-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;

  .lorebook-icon {
    font-size: 16px;
  }

  .lorebook-name {
    flex: 1;
    font-size: 14px;
  }

  .lorebook-link {
    cursor: pointer;
    color: var(--color-primary, #7dd3a8);
    text-decoration: underline;
    text-underline-offset: 2px;

    &:hover {
      opacity: 0.8;
    }
  }

  .lorebook-remove {
    border: none;
    background: transparent;
    font-size: 16px;
    cursor: pointer;
    transition: transform 0.2s;

    &:hover {
      transform: scale(1.1);
    }
  }
}

.add-lorebook-btn {
  padding: 12px;
  background: #f5f5f5;
  border: 2px dashed #ccc;
  border-radius: 8px;
  font-size: 14px;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #e8e8e8;
    border-color: #999;
  }
}

.lorebook-picker {
  margin-top: 8px;
  padding: 8px;
  background: #f9fafb;
  border-radius: 8px;
}

.lorebook-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: white;
  }

  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  .checkbox-custom {
    display: none;
  }
}

.no-lorebooks {
  padding: 16px;
  text-align: center;
  color: #9ca3af;
  font-size: 14px;
}

// 正則腳本列表
.regex-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.regex-item {
  padding: 10px 12px;
  background: #f5f5f5;
  border-radius: 8px;
  border-left: 3px solid #7dd3a8;
  transition: opacity 0.2s;

  &.disabled {
    opacity: 0.5;
    border-left-color: #ccc;
  }
}

.regex-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.regex-name {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.regex-delete {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  font-size: 18px;
  color: #999;
  cursor: pointer;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    color: #f44336;
    background: rgba(244, 67, 54, 0.1);
  }
}

.regex-detail {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding-left: 44px;
}

.regex-find {
  font-size: 12px;
  color: #666;
  background: #e8e8e8;
  padding: 2px 6px;
  border-radius: 4px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.regex-placement {
  font-size: 11px;
  color: #999;
}

.toggle-switch.small {
  width: 36px;
  height: 20px;

  .toggle-slider {
    &::before {
      height: 14px;
      width: 14px;
    }
  }

  input:checked + .toggle-slider::before {
    transform: translateX(16px);
  }
}

// 功能模組
.module-card {
  background: #f9fafb;
  border-radius: 12px;
  padding: 14px;
}

.module-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.module-info {
  display: flex;
  align-items: center;
  gap: 12px;

  .module-icon {
    font-size: 24px;
  }

  .module-name {
    display: block;
    font-weight: 600;
    color: #333;
    font-size: 14px;
  }

  .module-desc {
    display: block;
    font-size: 12px;
    color: #6b7280;
  }
}

.toggle-switch {
  position: relative;
  width: 48px;
  height: 26px;

  input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background: #ccc;
    border-radius: 26px;
    transition: 0.3s;

    &::before {
      content: "";
      position: absolute;
      height: 20px;
      width: 20px;
      left: 3px;
      bottom: 3px;
      background: white;
      border-radius: 50%;
      transition: 0.3s;
    }
  }

  input:checked + .toggle-slider {
    background: #7dd3a8;
  }

  input:checked + .toggle-slider::before {
    transform: translateX(22px);
  }
}

.module-settings {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.setting-group {
  margin-bottom: 12px;

  &:last-child {
    margin-bottom: 0;
  }
}

.setting-label {
  display: block;
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 8px;
}

.setting-hint {
  font-size: 11px;
  color: #9ca3af;
  margin-left: 4px;
}

.setting-desc {
  margin-top: 6px;
  font-size: 11px;
  color: #6b7280;
  line-height: 1.5;

  code {
    background: #f3f4f6;
    padding: 1px 4px;
    border-radius: 3px;
    font-family: monospace;
    color: #e91e63;
  }
}

.setting-options {
  display: flex;
  gap: 8px;

  button {
    flex: 1;
    padding: 8px 12px;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    font-size: 13px;
    color: #333;
    transition: all 0.2s;

    &:hover {
      border-color: #7dd3a8;
    }

    &.active {
      background: #7dd3a8;
      border-color: #7dd3a8;
      color: white;
    }
  }
}

// 好感度配置
.affinity-metric-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
}

.affinity-metric-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.affinity-name-input {
  flex: 1;
  font-weight: 500;
  padding: 8px 10px;
}

.affinity-metric-type-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;

  .type-select {
    flex: 1;
    max-width: 140px;
    padding: 4px 8px;
    font-size: 13px;
  }
}

.affinity-metric-ranges {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.affinity-string-config {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}

.range-field {
  flex: 1;
  label {
    display: block;
    font-size: 11px;
    color: #9ca3af;
    margin-bottom: 2px;
  }
}

.range-input {
  width: 100%;
  padding: 6px 8px !important;
  font-size: 13px;
}

.affinity-stages {
  padding-top: 8px;
  border-top: 1px dashed #e5e7eb;
}

.setting-label-sm {
  display: block;
  font-size: 11px;
  color: #9ca3af;
  margin-bottom: 4px;
}

.affinity-stage-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.stage-name-input {
  flex: 2;
  padding: 6px 8px !important;
  font-size: 13px;
}

.stage-value-input {
  flex: 1;
  padding: 6px 8px !important;
  font-size: 13px;
}

.btn-icon-sm {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  background: transparent;
  color: #9ca3af;
  flex-shrink: 0;

  &:hover {
    background: #fee2e2;
    color: #ef4444;
  }
}

.btn-danger-sm {
  color: #d1d5db;
  &:hover {
    color: #ef4444;
  }
}

.btn-add-sm {
  background: none;
  border: 1px dashed #d1d5db;
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 12px;
  color: #9ca3af;
  cursor: pointer;
  width: 100%;
  margin-top: 4px;

  &:hover {
    border-color: #7dd3a8;
    color: #7dd3a8;
  }
}

.btn-add {
  background: none;
  border: 1px dashed #d1d5db;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  color: #9ca3af;
  cursor: pointer;
  width: 100%;
  margin-top: 8px;

  &:hover {
    border-color: #7dd3a8;
    color: #7dd3a8;
  }
}

.code-textarea {
  font-family: "Consolas", "Monaco", monospace;
  font-size: 12px;
  line-height: 1.5;
}

.template-preview {
  margin-top: 8px;
  background: #f3f4f6;
  border-radius: 8px;
  padding: 8px 12px;
}

.preview-text {
  font-family: "Consolas", "Monaco", monospace;
  font-size: 12px;
  color: #374151;
  white-space: pre-wrap;
  margin: 0;
}

.module-card + .module-card {
  margin-top: 12px;
}

// 元數據
.meta-info {
  p {
    margin: 8px 0;
    font-size: 13px;
    color: #666;

    strong {
      color: #333;
    }
  }
}

// 操作按鈕
.action-btn {
  width: 100%;
  padding: 12px;
  margin-bottom: 8px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  background: #fff3e0;
  color: #f57c00;

  &:hover {
    background: #ffe0b2;
  }
}

.danger-btn {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &.delete {
    background: #ffebee;
    color: #f44336;

    &:hover {
      background: #ffcdd2;
    }
  }
}

// 標題欄按鈕
.header-btn {
  &.danger {
    color: #f44336;

    &:hover {
      background: rgba(244, 67, 54, 0.1);
    }
  }

  &.primary {
    background: #f093fb;
    color: white;

    &:hover {
      background: #5568d3;
    }
  }
}

// 動畫
.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
}

// 角色正則腳本彈窗
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 200;
}

.regex-modal {
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  background: var(--color-surface, #fff);
  border-radius: 20px 20px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.regex-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  font-size: 16px;
  font-weight: 600;
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
}

.regex-modal-close {
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  cursor: pointer;
  color: #666;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  svg {
    width: 20px;
    height: 20px;
  }
}

.regex-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.regex-checkbox-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 4px 0;
  label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 13px;
    color: #333;
    cursor: pointer;
    input {
      cursor: pointer;
    }
  }
}

.regex-modal-footer {
  display: flex;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid #eee;
  flex-shrink: 0;
}

.regex-modal-cancel {
  flex: 1;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 12px;
  background: none;
  font-size: 15px;
  cursor: pointer;
  color: #333;
}

.regex-modal-save {
  flex: 2;
  padding: 12px;
  border: none;
  border-radius: 12px;
  background: #7dd3a8;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

/* ===== 生成 AI 更新指令 ===== */

.generate-instruction-group {
  .setting-hint-text {
    font-size: 12px;
    color: var(--color-text-secondary, #888);
    margin: 4px 0 8px;
    line-height: 1.5;
  }
}

.btn-generate-instruction {
  padding: 8px 16px;
  font-size: 13px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  cursor: pointer;
  font-weight: 500;
  transition: opacity 0.15s;
  width: 100%;

  &:hover { opacity: 0.88; }
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 9999;
  padding-bottom: env(safe-area-inset-bottom, 0);
}

.modal-panel {
  background: var(--color-bg, #fff);
  border-radius: 16px 16px 0 0;
  padding: 20px 16px;
  width: 100%;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text, #333);
}

.modal-close {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: var(--color-bg-secondary, #f0f0f0);
  color: var(--color-text-secondary, #666);
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-desc {
  font-size: 13px;
  color: var(--color-text-secondary, #888);
  line-height: 1.5;
}

.modal-text-area {
  min-height: 200px;
  font-size: 12px;
  font-family: "Consolas", "Monaco", monospace;
  line-height: 1.6;
}

.modal-actions {
  display: flex;
  gap: 8px;

  .modal-btn {
    flex: 1;
    padding: 10px;
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;

    &.secondary {
      background: var(--color-bg-secondary, #f0f0f0);
      color: var(--color-text, #333);
    }

    &.primary {
      background: linear-gradient(135deg, var(--color-primary, #7dd3a8), var(--color-secondary, #a8d3e8));
      color: #fff;

      &:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
    }

    &:not(:disabled):hover { opacity: 0.88; }
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
  .modal-panel {
    transition: transform 0.25s ease;
  }
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  .modal-panel { transform: translateY(40px); }
}
</style>
