<script setup lang="ts">
import ExpandableTextarea from "@/components/common/ExpandableTextarea.vue";
import type {
  AffinityMetricConfig,
  CharacterAffinityConfig,
} from "@/schemas/affinity";
import { createDefaultConfig } from "@/schemas/affinity";
import {
  affinityTemplateService,
  DEFAULT_PROMPT_TEMPLATE,
} from "@/services/AffinityTemplateService";
import { CHARACTER_DELETE_CONFIRM } from "@/services/characterDeletion";
import { showFloatingToast } from "@/utils/floatingToast";
import { searchCities } from "@/services/WeatherService";
import { useCharactersStore, useLorebooksStore } from "@/stores";
import { useAffinityStore } from "@/stores/affinity";
import { useFitnessStore } from "@/stores/fitness";
import { createDefaultCharacterToolPermissions, normalizeCharacterToolPermissions, type CharacterToolPermissions, type CharacterWorldSettings, type RegexScript } from "@/types/character";
import CharacterToolPermissionsPanel from "@/components/panels/CharacterToolPermissionsPanel.vue";
import { migrateRegexScript, regexFromString } from "@/services/RegexEngine";
import { CHAT_TOOLS } from "@/services/toolCalling/chatTools";
import { useSettingsStore } from "@/stores/settings";
import type { CharacterFitnessConfig } from "@/types/fitness";
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  toRaw,
  watch,
} from "vue";

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
  source?: "import" | "manual" | "api" | "png" | "json";
  createdAt?: number;
  updatedAt?: number;
  worldSettings?: CharacterWorldSettings;
  toolPermissions?: CharacterToolPermissions;
}

// Lorebook 類型已從 availableLorebooks computed 中推斷

// Props
const props = defineProps<{
  characterId?: string;
  isNew?: boolean;
  /** 父層的 @save；寫成 prop 才能等它存完、知道成功與否 */
  onSave?: (character: Character) => Promise<boolean>;
}>();

// Emits
const emit = defineEmits<{
  (e: "back"): void;
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
  toolPermissions: createDefaultCharacterToolPermissions(),
});
const toolPermissions = computed<CharacterToolPermissions>({
  get: () => formData.value.toolPermissions ?? createDefaultCharacterToolPermissions(),
  set: (value) => { formData.value.toolPermissions = value; },
});
// 角色工具權限裡可個別關閉的 MCP 伺服器
const settingsStore = useSettingsStore();
const mcpServerOptions = computed(() => settingsStore.mcp.servers.map((server) => ({ id: server.id, name: server.name })));

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
  worldSettings: true,
  modules: true,
  meta: false,
  danger: false,
});

// 編輯分頁
const activeTab = ref<
  "basic" | "persona" | "chat" | "world" | "mods" | "tools" | "adv"
>("basic");
const editTabs = [
  { id: "basic", label: "基本" },
  { id: "persona", label: "人設" },
  { id: "chat", label: "對話" },
  { id: "world", label: "世界" },
  { id: "mods", label: "模組" },
  { id: "tools", label: "工具" },
  { id: "adv", label: "進階" },
] as const;

// 未儲存提示
const hasUnsaved = ref(false);

// Stores
const charactersStore = useCharactersStore();
const lorebooksStore = useLorebooksStore();
const fitnessStore = useFitnessStore();
const affinityStore = useAffinityStore();

const PNG_KEYWORD = "chara";
const pngCrcTable = createPngCrcTable();

// 健身夥伴設定
const fitnessConfig = ref<CharacterFitnessConfig>({
  enabled: false,
  role: "partner",
  style: "gentle",
});

// 世界設定
const worldSettings = ref<CharacterWorldSettings>({
  location: "",
  timezone: "",
  weatherOverride: "",
});
// 世界設定城市搜尋
const worldLocationQuery = ref("");
const worldLocationResults = ref<
  Array<{
    id: number;
    name: string;
    region: string;
    country: string;
    lat: number;
    lon: number;
  }>
>([]);
const worldLocationSearching = ref(false);

async function searchWorldLocation() {
  const q = worldLocationQuery.value.trim();
  if (!q) return;
  worldLocationSearching.value = true;
  try {
    worldLocationResults.value = await searchCities(q);
  } catch {
    worldLocationResults.value = [];
  } finally {
    worldLocationSearching.value = false;
  }
}

// 城市 → IANA 時區的常見對應（Open-Meteo 回傳的 timezone 欄位）
async function selectWorldLocation(city: {
  id: number;
  name: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
}) {
  const displayName = [city.name, city.region, city.country]
    .filter(Boolean)
    .join("，");
  worldSettings.value.location = displayName;
  // 保存精確座標，避免之後查角色天氣時走字串模糊 geocoding
  worldSettings.value.lat = city.lat;
  worldSettings.value.lon = city.lon;
  // 嘗試從 Open-Meteo geocoding 取得時區
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.name)}&count=1&language=zh`,
    );
    if (res.ok) {
      const data = await res.json();
      const tz = data.results?.[0]?.timezone;
      if (tz) worldSettings.value.timezone = tz;
    }
  } catch {
    // 查不到時區就留空，不影響功能
  }
  worldLocationQuery.value = "";
  worldLocationResults.value = [];
}

// 好感度設定（使用 placeholder ID，onMounted 時會替換為真實 characterId）
const affinityConfig = ref<CharacterAffinityConfig>({
  characterId: "_placeholder",
  enabled: false,
  statKey: "",
  mvuEnabled: false,
  mvuInitialData: {},
  mvuPromptTemplate: "",
  mvuUpdateInstruction: "",
  postMutationRules: [],
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
    affinityTemplateService.generateUpdateInstructionEntry(
      affinityConfig.value,
    );
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

// 角色資訊列：已綁定且仍存在的世界書數量
const heroLorebookChip = computed(() => {
  const bound = (formData.value.lorebookIds ?? []).filter((id) =>
    availableLorebooks.value.some((lb) => lb.id === id),
  ).length;
  return bound === 0 ? "未綁世界書" : `世界書 ${bound} 本`;
});

// 角色資訊列：工具狀態
const heroToolsChip = computed(() =>
  toolPermissions.value.enabled ? "工具已開啟" : "工具已關閉",
);

// 角色資訊列：副標（暱稱、創建者）
const heroSubline = computed(() => {
  const nickname = formData.value.nickname?.trim();
  const name = formData.value.data.name?.trim();
  const parts = [
    nickname && nickname !== name ? `暱稱：${nickname}` : "暱稱同本名",
  ];
  const creator = formData.value.data.creator?.trim();
  if (creator) parts.push(`創建者 ${creator}`);
  return parts.join(" · ");
});

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
    case "import":
      return "導入的角色卡";
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
          (character.source as any) ||
          "manual",
        createdAt: character.createdAt,
        updatedAt: character.updatedAt,
        toolPermissions: normalizeCharacterToolPermissions(
          character.toolPermissions,
        ),
      };

      // 載入健身設定
      const storedFitnessConfig = fitnessStore.getCharacterFitnessConfig(
        character.id,
      );
      if (storedFitnessConfig) {
        fitnessConfig.value = { ...storedFitnessConfig };
      }

      // 載入世界設定
      if (character.worldSettings) {
        worldSettings.value = { ...character.worldSettings };
      }

      // 載入好感度設定
      await affinityStore.initialize();
      const storedAffinityConfig = await affinityStore.loadConfig(character.id);
      if (storedAffinityConfig) {
        // 深拷貝：淺拷貝會和 store 快取共用 metrics，沒按儲存也會改到聊天正在用的設定
        affinityConfig.value = JSON.parse(
          JSON.stringify(toRaw(storedAffinityConfig)),
        );
        _updateAffinityPreview();
      } else {
        affinityConfig.value = createDefaultConfig(character.id);
      }
    } else {
      console.error("找不到角色:", props.characterId);
      emit("back");
      return;
    }
  } else {
    // 新建模式，生成新 ID
    formData.value.id = `char_${Date.now()}`;
    formData.value.createdAt = Date.now();
    formData.value.updatedAt = Date.now();
  }

  // 以載入完的內容為基準，之後有改動才自動儲存
  markSaved();
  editorLoaded = true;
});

// ===== 儲存與自動儲存 =====
// 離開頁面時（返回鍵、右滑、Android 返回、點進世界書、App 切到背景）有改動就自動存

const isSaving = ref(false);
let inflightSave: Promise<boolean> | null = null;
/** 載入完才開始比對；載入前就離開不算有改動 */
let editorLoaded = false;
let savedSnapshot = "";
/** 刪除角色後不要再自動存回去 */
let skipAutoSave = false;

function editorSnapshot(): string {
  return JSON.stringify([
    formData.value,
    worldSettings.value,
    fitnessConfig.value,
    affinityConfig.value,
  ]);
}

function markSaved() {
  savedSnapshot = editorSnapshot();
  hasUnsaved.value = false;
}

let dirtyTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  [formData, worldSettings, fitnessConfig, affinityConfig],
  () => {
    if (dirtyTimer) clearTimeout(dirtyTimer);
    dirtyTimer = setTimeout(() => {
      hasUnsaved.value = isDirty();
    }, 400);
  },
  { deep: true },
);

function isDirty(): boolean {
  return editorLoaded && !skipAutoSave && editorSnapshot() !== savedSnapshot;
}

// 處理返回
async function handleBack() {
  if (!(await confirmLeave())) return;
  emit("back");
}

// 點綁定的世界書：先存，回來時修改還在
async function openLorebook(lorebookId: string) {
  if (!(await confirmLeave())) return;
  emit("open-lorebook", lorebookId);
}

/** 自動儲存；存不了時問要不要照樣離開 */
async function confirmLeave(): Promise<boolean> {
  const result = await autoSaveIfNeeded();
  if (result === "saved") showFloatingToast("已自動儲存");
  const warning =
    result === "no-name"
      ? "還沒填角色名稱，沒辦法儲存。仍要離開嗎？（這次的修改不會保存）"
      : result === "failed"
        ? "自動儲存失敗。仍要離開嗎？（這次的修改不會保存）"
        : "";
  if (warning && !confirm(warning)) return false;
  // 已經處理過了，卸載時不用再存一次
  skipAutoSave = true;
  return true;
}

async function autoSaveIfNeeded(): Promise<
  "clean" | "saved" | "no-name" | "failed"
> {
  if (inflightSave) await inflightSave;
  if (!isDirty()) return "clean";
  if (!formData.value.data.name.trim()) return "no-name";
  // 離開時沒辦法請使用者補名稱：沒名稱的好感度指標／階段直接拿掉
  tidyAffinityConfigForSave(true);
  return (await runSave()) ? "saved" : "failed";
}

function onVisibilityChange() {
  if (document.visibilityState === "hidden") void autoSaveIfNeeded();
}

onMounted(() => {
  document.addEventListener("visibilitychange", onVisibilityChange);
});

onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", onVisibilityChange);
  // 右滑、Android 返回等由 App 切頁的離開：頁面已經要卸載，沒辦法問，直接存
  if (skipAutoSave) return;
  void autoSaveIfNeeded().then((result) => {
    if (result === "saved") showFloatingToast("已自動儲存");
    if (result === "failed") showFloatingToast("角色自動儲存失敗", true);
  });
});

// 處理儲存
async function handleSave() {
  if (isSaving.value) return;
  if (!formData.value.data.name.trim()) {
    alert("請輸入角色名稱");
    return;
  }
  const affinityProblem = tidyAffinityConfigForSave();
  if (affinityProblem) {
    alert(affinityProblem);
    return;
  }
  if (await runSave()) {
    showFloatingToast("已儲存");
  } else {
    alert("角色儲存失敗，請再試一次");
  }
}

/** 同一時間只存一次：連點勾勾或存到一半就離開，新建時會建出兩張一樣的卡 */
function runSave(): Promise<boolean> {
  if (inflightSave) return inflightSave;
  isSaving.value = true;
  inflightSave = saveAll().finally(() => {
    isSaving.value = false;
    inflightSave = null;
  });
  return inflightSave;
}

/**
 * 存好感度前整理：沒名稱的指標／階段讀回來會驗證失敗，清空的數字欄位會存成空字串。
 * 模組開著就請使用者補上名稱；關著時（編輯區看不到）或離開時自動存，直接把空的拿掉。
 */
function tidyAffinityConfigForSave(
  dropBlank = !affinityConfig.value.enabled,
): string | null {
  const config = affinityConfig.value;
  if (dropBlank) {
    config.metrics = config.metrics.filter((m) => m.name?.trim());
  }
  for (const metric of config.metrics) {
    if (!metric.name?.trim()) return "好感度數值有指標還沒填名稱";
    if (dropBlank) {
      metric.stages = metric.stages.filter((s) => s.name?.trim());
    }
    if (metric.stages.some((s) => !s.name?.trim())) {
      return `好感度指標「${metric.name}」有階段還沒填名稱`;
    }
    if (!Number.isFinite(metric.min)) metric.min = 0;
    if (!Number.isFinite(metric.max)) metric.max = 100;
    if (metric.type === "number" && !Number.isFinite(metric.initial)) {
      metric.initial = metric.min;
    }
    for (const stage of metric.stages) {
      if (!Number.isFinite(stage.minValue)) stage.minValue = 0;
    }
  }
  return null;
}

async function saveAll(): Promise<boolean> {
  formData.value.updatedAt = Date.now();

  // 儲存世界設定（只保留有值的欄位）
  const ws = worldSettings.value;
  formData.value.worldSettings =
    ws.location?.trim() || ws.timezone?.trim() || ws.weatherOverride?.trim()
      ? {
          location: ws.location?.trim() || undefined,
          timezone: ws.timezone?.trim() || undefined,
          lat: typeof ws.lat === "number" ? ws.lat : undefined,
          lon: typeof ws.lon === "number" ? ws.lon : undefined,
          weatherOverride: ws.weatherOverride?.trim() || undefined,
        }
      : undefined;

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

  const ok = (await props.onSave?.({ ...formData.value })) ?? false;
  if (ok) markSaved();
  return ok;
}

// ===== 好感度配置 =====

function addAffinityMetric() {
  const id = `metric_${Date.now()}`;
  affinityConfig.value.metrics.push({
    id,
    name: "",
    path: "",
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

// 可選值：半形逗號、全形逗號、頓號都當分隔
function parseMetricOptions(text: string): string[] {
  return text
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);
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
  if (confirm(CHARACTER_DELETE_CONFIRM)) {
    skipAutoSave = true;
    emit("delete", formData.value.id);
  }
}

function createPngCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

function pngCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = pngCrcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint32(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function encodeUtf8Base64(value: string): string {
  return btoa(unescape(encodeURIComponent(value)));
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function createPlaceholderPngDataUrl(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#f8f5ff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#d9b8ff";
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 96, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas.toDataURL("image/png");
}

async function renderAvatarToPngBytes(imageSource: string): Promise<Uint8Array> {
  if (!imageSource) return dataUrlToBytes(createPlaceholderPngDataUrl());
  const src =
    imageSource.startsWith("data:") ||
    imageSource.startsWith("http") ||
    imageSource.startsWith("blob:")
      ? imageSource
      : `data:image/png;base64,${imageSource}`;

  const dataUrl = await new Promise<string>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const naturalWidth = img.naturalWidth || 512;
      const naturalHeight = img.naturalHeight || 768;
      const scale = Math.min(1, 800 / naturalWidth, 1200 / naturalHeight);
      const width = Math.max(1, Math.round(naturalWidth * scale));
      const height = Math.max(1, Math.round(naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(createPlaceholderPngDataUrl());
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      try {
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(createPlaceholderPngDataUrl());
      }
    };
    img.onerror = () => resolve(createPlaceholderPngDataUrl());
    img.src = src;
  });

  return dataUrlToBytes(dataUrl);
}

function createPngTextChunk(keyword: string, text: string): Uint8Array {
  const encoder = new TextEncoder();
  const typeBytes = encoder.encode("tEXt");
  const keywordBytes = encoder.encode(keyword);
  const textBytes = encoder.encode(text);
  const data = new Uint8Array(keywordBytes.length + 1 + textBytes.length);
  data.set(keywordBytes, 0);
  data[keywordBytes.length] = 0;
  data.set(textBytes, keywordBytes.length + 1);

  const chunk = new Uint8Array(12 + data.length);
  writeUint32(chunk, 0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);

  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  writeUint32(chunk, 8 + data.length, pngCrc32(crcInput));
  return chunk;
}

function findPngIendOffset(bytes: Uint8Array): number {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) return -1;
  }

  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    );
    if (offset + 12 + length > bytes.length) return -1;
    if (type === "IEND") return offset;
    offset += 12 + length;
  }
  return -1;
}

async function createCharacterCardPngBlob(
  imageSource: string,
  metadata: string,
): Promise<Blob> {
  const pngBytes = await renderAvatarToPngBytes(imageSource);
  const iendOffset = findPngIendOffset(pngBytes);
  if (iendOffset < 0) throw new Error("Invalid PNG");

  const textChunk = createPngTextChunk(
    PNG_KEYWORD,
    encodeUtf8Base64(metadata),
  );
  const output = new Uint8Array(pngBytes.length + textChunk.length);
  output.set(pngBytes.slice(0, iendOffset), 0);
  output.set(textChunk, iendOffset);
  output.set(pngBytes.slice(iendOffset), iendOffset + textChunk.length);
  return new Blob([output], { type: "image/png" });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function buildCharacterCardExportData(): Promise<{
  exportData: any;
  safeName: string;
}> {
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
    const { convertLorebookToCharacterBook } =
      await import("@/services/ImportExportService");
    const allEntries: any[] = [];
    let firstName = "";
    let firstDesc: string | undefined;

    for (const lbId of lorebookIds) {
      const lb = lorebooksStore.lorebooks.find((l) => l.id === lbId);
      if (!lb) continue;
      const book = convertLorebookToCharacterBook(lb);
      if (!firstName) {
        firstName = book.name || "";
        firstDesc = book.description || "";
      }
      allEntries.push(...book.entries);
    }

    if (allEntries.length > 0) {
      baseData.character_book = {
        name: firstName,
        description: firstDesc || "",
        scan_depth: undefined,
        token_budget: undefined,
        recursive_scanning: false,
        entries: allEntries,
      };
    }
  }

  const exportData: any = {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: baseData,
  };
  // 檔名只保留安全字元，避免手機下載後副檔名遺失
  const safeName = (fd.name || "character").replace(/[<>:"/\\|?*]/g, "_");
  return { exportData, safeName };
}

// 導出角色卡 JSON（完整 CharacterCardV2 格式，包含綁定的世界書）
async function exportJSON() {
  const { exportData, safeName } = await buildCharacterCardExportData();
  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, `${safeName}.json`);
}

async function exportPNG() {
  try {
    const { exportData, safeName } = await buildCharacterCardExportData();
    const blob = await createCharacterCardPngBlob(
      formData.value.avatar,
      JSON.stringify(exportData),
    );
    downloadBlob(blob, `${safeName}.png`);
  } catch (e) {
    console.error("[CharacterEditScreen] Failed to export PNG:", e);
    alert(`導出 PNG 失敗：${e instanceof Error ? e.message : String(e)}`);
  }
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
  // 注音／拼音選字時按 Enter 是確認選字，不是送出標籤
  if (event.isComposing || event.keyCode === 229) return;
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

// 下載單個正則腳本為 JSON
function downloadRegexScript(script: RegexScript) {
  const payload = {
    // HTML 模板等額外欄位一起帶出去，再導入才是同一支腳本
    ...toRaw(script),
    id: script.id,
    scriptName: script.scriptName,
    findRegex: script.findRegex,
    replaceString: script.replaceString,
    trimStrings: script.trimStrings ?? [],
    placement: script.placement ?? [],
    disabled: script.disabled ?? false,
    markdownOnly: script.markdownOnly ?? false,
    promptOnly: script.promptOnly ?? false,
    runOnEdit: script.runOnEdit ?? false,
    substituteRegex: script.substituteRegex ?? 0,
    minDepth: script.minDepth ?? -1,
    maxDepth: script.maxDepth ?? -1,
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const safeName =
    (script.scriptName || "regex").replace(/[\\/:*?"<>|]+/g, "_").trim() ||
    "regex";
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  // 跟執行時同一套解析，避免這裡說能用、聊天時卻不生效
  rfError.value = regexFromString(rfFindRegex.value) ? "" : "正則格式無效";
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

  const character = charactersStore.characters.find(
    (c) => c.id === props.characterId,
  );
  if (!character) return;

  const existing = character.data?.extensions?.regex_scripts ?? [];
  const original = regexEditingId.value
    ? existing.find((s) => s.id === regexEditingId.value)
    : undefined;

  // 表單沒有勾選框的位置（例如 6 推理）照原本的留著
  const placement: number[] = (original?.placement ?? []).filter(
    (p) => ![1, 2, 3, 5].includes(p),
  );
  if (rfPlaceUser.value) placement.push(1);
  if (rfPlaceAI.value) placement.push(2);
  if (rfPlaceSlash.value) placement.push(3);
  if (rfPlaceWI.value) placement.push(5);
  placement.sort((a, b) => a - b);

  const scriptData: RegexScript = {
    // 表單沒有的欄位（HTML 模板、渲染方式等）要留著，不然一編輯模板就不見
    ...original,
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

async function importRegexScriptsFromText(text: string): Promise<number> {
  if (!props.characterId) return 0;
  const raw = JSON.parse(text);
  const items: Partial<RegexScript>[] = Array.isArray(raw) ? raw : [raw];
  const character = charactersStore.characters.find(
    (c) => c.id === props.characterId,
  );
  if (!character) return 0;
  const existing = character.data?.extensions?.regex_scripts ?? [];
  const newScripts = [...existing];
  let count = 0;
  for (const item of items) {
    if (!item.scriptName) continue;
    // 跟導入角色卡走同一套轉換，HTML 模板等欄位才不會被丟掉
    newScripts.push({
      ...migrateRegexScript(item),
      id: crypto.randomUUID(),
      findRegex: item.findRegex ?? "",
      replaceString: item.replaceString ?? "",
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
  return count;
}

async function onRegexFileImport(e: Event) {
  if (!props.characterId) return;
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const count = await importRegexScriptsFromText(text);
    alert(`成功導入 ${count} 個角色腳本`);
  } catch {
    alert("導入失敗：JSON 格式錯誤");
  }
  if (regexFileInput.value) regexFileInput.value.value = "";
}

// ===== 貼上 JSON 導入 =====
const showRegexPasteModal = ref(false);
const regexPasteText = ref("");
const regexPasteError = ref("");

function openPasteRegex() {
  regexPasteText.value = "";
  regexPasteError.value = "";
  showRegexPasteModal.value = true;
}

async function submitPasteRegex() {
  const text = regexPasteText.value.trim();
  if (!text) {
    regexPasteError.value = "請貼上 JSON 內容";
    return;
  }
  try {
    const count = await importRegexScriptsFromText(text);
    showRegexPasteModal.value = false;
    alert(`成功導入 ${count} 個角色腳本`);
  } catch {
    regexPasteError.value = "JSON 格式錯誤，請檢查內容";
  }
}
</script>

<template>
  <div class="screen-container character-edit-screen">
    <!-- 頂欄 -->
    <header class="edit-header">
      <button
        type="button"
        class="edit-back"
        aria-label="返回"
        @click="handleBack"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>

      <span class="edit-header-title">{{ pageTitle }}</span>

      <span v-if="hasUnsaved" class="edit-unsaved">
        <span class="edit-unsaved-dot"></span>未儲存
      </span>

      <button
        type="button"
        class="edit-save"
        :disabled="isSaving"
        @click="handleSave"
      >
        {{ isSaving ? "儲存中…" : "儲存" }}
      </button>
    </header>

    <!-- 角色資訊 -->
    <section class="edit-hero">
      <div class="hero-avatar-wrap">
        <button
          type="button"
          class="hero-avatar"
          aria-label="更換頭像"
          @click="triggerAvatarUpload"
        >
          <img
            v-if="formData.avatar"
            :src="formData.avatar"
            alt="角色頭像"
            class="hero-avatar-img"
          />
          <span v-else class="hero-avatar-initial">{{
            (formData.data.name || "?").charAt(0)
          }}</span>
        </button>
        <button
          type="button"
          class="hero-avatar-camera"
          aria-label="更換頭像"
          @click.stop="triggerAvatarUpload"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M4 8h4l2-3h4l2 3h4v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        </button>
      </div>
      <input
        ref="avatarInput"
        type="file"
        accept="image/*"
        class="hidden-input"
        @change="handleAvatarUpload"
      />
      <div class="hero-info">
        <span class="hero-name">{{ formData.data.name || "未命名角色" }}</span>
        <span class="hero-subline">{{ heroSubline }}</span>
        <div class="hero-chips">
          <span class="hero-chip">{{ heroLorebookChip }}</span>
          <span class="hero-chip">{{ heroToolsChip }}</span>
        </div>
      </div>
    </section>

    <!-- 分頁 -->
    <nav class="edit-tabs" role="tablist" aria-label="編輯分類">
      <button
        v-for="t in editTabs"
        :key="t.id"
        type="button"
        role="tab"
        class="edit-tab"
        :class="{ active: activeTab === t.id }"
        :aria-selected="activeTab === t.id"
        @click="activeTab = t.id"
      >
        {{ t.label }}
      </button>
    </nav>

    <!-- 編輯內容 -->
    <main class="soft-content edit-content">
      <!-- ===== 基本 ===== -->
      <div v-show="activeTab === 'basic'" class="tab-panel">
        <section class="tab-card">
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
        </section>
      </div>

      <!-- ===== 人設 ===== -->
      <div v-show="activeTab === 'persona'" class="tab-panel">
        <section class="tab-card">
            <div class="form-group">
              <label class="form-label">角色描述</label>
              <ExpandableTextarea
                v-model="formData.data.description!"
                :rows="4"
                placeholder="描述角色的外觀、背景等..."
                label="角色描述"
              />
            </div>

            <div class="form-group">
              <label class="form-label">秘密</label>
              <ExpandableTextarea
                v-model="formData.data.personality!"
                :rows="3"
                placeholder="角色的秘密..."
                label="秘密"
              />
            </div>

            <div class="form-group">
              <label class="form-label">說話方式</label>
              <ExpandableTextarea
                v-model="formData.data.scenario!"
                :rows="3"
                placeholder="角色的說話方式、語氣特點..."
                label="說話方式"
              />
            </div>

            <div class="form-group">
              <label class="form-label">角色氛圍</label>
              <ExpandableTextarea
                v-model="formData.data.character_atmosphere!"
                :rows="3"
                placeholder="角色散發的氛圍、給人的感覺..."
                label="角色氛圍"
              />
            </div>

            <div class="form-group">
              <label class="form-label">NAI 角色串</label>
              <ExpandableTextarea
                v-model="formData.data.nai_character_prompt!"
                :rows="3"
                placeholder="例如：1girl, long hair, blue eyes"
                label="NAI 角色串"
              />
              <p class="form-hint">生圖時會自動加在提示詞最前方，留空則跳過</p>
            </div>
        </section>
      </div>

      <!-- ===== 對話 ===== -->
      <div v-show="activeTab === 'chat'" class="tab-panel">
        <section class="tab-card">
            <div class="form-group">
              <label class="form-label">初始消息</label>
              <ExpandableTextarea
                v-model="formData.data.first_mes!"
                :rows="3"
                placeholder="角色的第一句話..."
                label="初始消息"
              />
            </div>

            <div class="form-group">
              <label class="form-label">對話範例</label>
              <ExpandableTextarea
                v-model="formData.data.mes_example!"
                :rows="5"
                placeholder="{{user}}: 你好！&#10;{{char}}: 你好呀！很高興見到你。"
                label="對話範例"
              />
              <p class="form-hint">
                使用 &#123;&#123;user&#125;&#125; 和
                &#123;&#123;char&#125;&#125; 作為佔位符
              </p>
            </div>
        </section>
      </div>

      <!-- ===== 世界 ===== -->
      <div v-show="activeTab === 'world'" class="tab-panel">
        <section class="tab-card">
          <h3 class="tab-card-title">綁定世界書</h3>
          <p class="tab-card-hint">和這個角色聊天時自動載入</p>
            <div class="lorebook-list">
              <div
                v-for="lbId in formData.lorebookIds"
                :key="lbId"
                class="lorebook-item"
              >
                <span class="lorebook-icon">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
                    <path d="M9 4v16" />
                  </svg>
                </span>
                <span
                  class="lorebook-name lorebook-link"
                  @click="openLorebook(lbId)"
                  >{{
                    availableLorebooks.find((lb) => lb.id === lbId)?.name ||
                    "未知世界書"
                  }}</span
                >
                <button
                  class="lorebook-remove"
                  aria-label="解除綁定"
                  @click="toggleLorebook(lbId)"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    aria-hidden="true"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
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
        </section>

        <section class="tab-card">
          <h3 class="tab-card-title">所在地與天氣</h3>
          <p class="tab-card-hint">
            設定角色所在的世界位置，天氣與時區會自動查詢填入。
          </p>
            <!-- 城市搜尋 -->
            <div class="form-group">
              <label class="form-label">搜尋城市</label>
              <div class="world-search-row">
                <input
                  v-model="worldLocationQuery"
                  type="text"
                  class="soft-input"
                  placeholder="輸入城市名稱..."
                  @keydown.enter="searchWorldLocation"
                />
                <button
                  class="world-search-btn"
                  :disabled="worldLocationSearching"
                  @click="searchWorldLocation"
                >
                  {{ worldLocationSearching ? "…" : "搜尋" }}
                </button>
              </div>
              <!-- 搜尋結果 -->
              <div
                v-if="worldLocationResults.length > 0"
                class="world-search-results"
              >
                <button
                  v-for="city in worldLocationResults"
                  :key="city.id"
                  class="world-result-item"
                  @click="selectWorldLocation(city)"
                >
                  <span class="world-result-name">{{ city.name }}</span>
                  <span class="world-result-sub">
                    {{ [city.region, city.country].filter(Boolean).join("，") }}
                  </span>
                </button>
              </div>
            </div>
            <!-- 已選城市顯示 -->
            <div v-if="worldSettings.location" class="world-selected">
              <div class="world-selected-info">
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  width="14"
                  height="14"
                >
                  <path
                    d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                  />
                </svg>
                <span>{{ worldSettings.location }}</span>
                <span v-if="worldSettings.timezone" class="world-tz-badge">{{
                  worldSettings.timezone
                }}</span>
              </div>
              <button
                class="world-clear-btn"
                @click="
                  worldSettings.location = '';
                  worldSettings.timezone = '';
                  worldSettings.lat = undefined;
                  worldSettings.lon = undefined;
                  worldSettings.weatherOverride = '';
                "
              >
                清除
              </button>
            </div>
            <!-- 天氣描述（可選手動覆蓋） -->
            <div class="form-group" style="margin-top: 12px">
              <label class="form-label" style="font-size: 12px; opacity: 0.7">
                天氣描述（選填，留空則自動查詢即時天氣）
              </label>
              <input
                v-model="worldSettings.weatherOverride"
                type="text"
                class="soft-input"
                placeholder="例如：晴天，25°C，微風"
              />
            </div>
        </section>

        <section v-if="!isCreateMode" class="tab-card">
          <h3 class="tab-card-title">
            正則腳本 ({{ characterRegexScripts.length }})
          </h3>
          <p class="tab-card-hint">內嵌在角色卡，只在和這個角色聊天時生效</p>
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
                    class="regex-download"
                    @click.stop="downloadRegexScript(script)"
                    title="下載 JSON"
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
                    </svg>
                  </button>
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
              導入 JSON 檔案
            </button>
            <button
              class="add-lorebook-btn"
              style="margin-top: 4px; border-style: dotted"
              @click="openPasteRegex"
            >
              貼上 JSON 文字
            </button>
            <input
              ref="regexFileInput"
              type="file"
              accept=".json"
              style="display: none"
              @change="onRegexFileImport"
            />
        </section>
      </div>

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

      <!-- ===== 貼上 JSON 導入彈窗 ===== -->
      <div
        v-if="showRegexPasteModal"
        class="modal-overlay"
        @click.self="showRegexPasteModal = false"
      >
        <div class="regex-modal">
          <div class="regex-modal-header">
            <span>貼上 JSON 導入正則腳本</span>
            <button
              class="regex-modal-close"
              @click="showRegexPasteModal = false"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                />
              </svg>
            </button>
          </div>
          <div class="regex-modal-body">
            <label class="form-label">JSON 內容（單個物件或陣列）</label>
            <textarea
              v-model="regexPasteText"
              class="soft-input textarea"
              rows="12"
              style="font-family: monospace; font-size: 12px"
              placeholder='{"scriptName": "...", "findRegex": "/.../i", "replaceString": "...", "placement": [2]}'
            />
            <p
              v-if="regexPasteError"
              style="font-size: 12px; color: #e53e3e; margin: 6px 0 0"
            >
              {{ regexPasteError }}
            </p>
          </div>
          <div class="regex-modal-footer">
            <button
              class="regex-modal-cancel"
              @click="showRegexPasteModal = false"
            >
              取消
            </button>
            <button class="regex-modal-save" @click="submitPasteRegex">
              導入
            </button>
          </div>
        </div>
      </div>

      <!-- ===== 模組 ===== -->
      <div v-show="activeTab === 'mods'" class="tab-panel">
        <p class="tab-panel-hint">為這個角色開啟額外玩法</p>
        <section class="tab-card">
            <!-- 健身夥伴模組 -->
            <div class="module-card">
              <div class="module-header">
                <div class="module-info">
                  <span class="module-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 7v10M17 7v10M4 9v6M20 9v6M7 12h10" /></svg></span>
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
                  <span class="module-icon affinity" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg></span>
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
                      <span class="setting-hint"
                        >（留空使用角色名「{{ formData.data.name }}」）</span
                      >
                    </label>
                    <input
                      v-model="affinityConfig.statKey"
                      class="soft-input"
                      :placeholder="formData.data.name"
                    />
                    <p class="setting-desc">
                      世界書 EJS 中引用數值的路徑前綴，例如填「黎靖青」後可在
                      EJS 寫
                      <code>getvar('stat_data.黎靖青.亲密值')</code>，
                      也支援
                      <code>getvar('display_data.黎靖青.亲密值')</code>
                      與
                      <code>getvar('delta_data.黎靖青.亲密值')</code>，
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

                      <div
                        v-if="metric.type !== 'string'"
                        class="affinity-metric-ranges"
                      >
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
                          <!-- 離開欄位才拆：邊打邊拆會把剛打的逗號吃掉，永遠打不出第二個值 -->
                          <input
                            :value="(metric.options ?? []).join(', ')"
                            @change="
                              metric.options = parseMetricOptions(
                                ($event.target as HTMLInputElement).value,
                              )
                            "
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
                  <div
                    v-if="affinityConfig.metrics.length > 0"
                    class="setting-group generate-instruction-group"
                  >
                    <label class="setting-label">AI 更新指令生成器</label>
                    <p class="setting-hint-text">
                      根據你配置的指標，自動生成「告訴 AI
                      如何更新數值」的世界書條目文字。
                    </p>
                    <button
                      class="btn-generate-instruction"
                      @click="generateUpdateInstruction"
                    >
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
                      <pre class="preview-text">{{
                        affinityTemplatePreview
                      }}</pre>
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
        </section>
      </div>

      <!-- ===== 工具 ===== -->
      <div v-show="activeTab === 'tools'" class="tab-panel">
        <CharacterToolPermissionsPanel
          v-model="toolPermissions"
          :tools="CHAT_TOOLS"
          :mcp-servers="mcpServerOptions"
        />
      </div>

      <!-- ===== 進階 ===== -->
      <div v-show="activeTab === 'adv'" class="tab-panel">
        <section class="tab-card">
          <div class="form-group">
            <label class="form-label">系統提示</label>
            <ExpandableTextarea
              v-model="formData.data.system_prompt!"
              :rows="3"
              placeholder="給 AI 的系統級指示..."
              label="系統提示"
            />
          </div>

          <div class="form-group">
            <label class="form-label">歷史後指令</label>
            <ExpandableTextarea
              v-model="formData.data.post_history_instructions!"
              :rows="3"
              placeholder="在對話歷史後添加的指令..."
              label="歷史後指令"
            />
          </div>

          <div class="form-group">
            <label class="form-label">創建者備註</label>
            <ExpandableTextarea
              v-model="formData.data.creator_notes!"
              :rows="3"
              placeholder="創建者的備註、使用說明..."
              label="創建者備註"
            />
          </div>
        </section>

        <section class="tab-card">
          <h3 class="tab-card-title">卡片資訊</h3>
            <div class="meta-info">
              <p><strong>來源:</strong> {{ getSourceText() }}</p>
              <p>
                <strong>創建時間:</strong> {{ formatDate(formData.createdAt) }}
              </p>
              <p>
                <strong>更新時間:</strong> {{ formatDate(formData.updatedAt) }}
              </p>
            </div>
        </section>

        <section v-if="!isCreateMode" class="tab-card">
          <h3 class="tab-card-title">匯出</h3>
          <button class="action-btn" @click="exportPNG">
            匯出角色卡 (PNG)
          </button>
          <button class="action-btn" @click="exportJSON">
            匯出角色卡 (JSON)
          </button>
        </section>

        <section v-if="!isCreateMode" class="tab-card danger-card">
          <h3 class="tab-card-title">危險區域</h3>
          <button class="danger-btn delete" @click="handleDelete">
            刪除角色卡
          </button>
        </section>
      </div>
    </main>

    <!-- ===== 生成 AI 更新指令 Modal ===== -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showUpdateInstructionModal"
          class="modal-overlay"
          @click.self="showUpdateInstructionModal = false"
        >
          <div class="modal-panel generate-modal">
            <div class="modal-header">
              <h3 class="modal-title">AI 更新指令</h3>
              <button
                class="modal-close"
                @click="showUpdateInstructionModal = false"
              >
                ✕
              </button>
            </div>
            <p class="modal-desc">
              將此文字加入世界書條目，AI 就會知道如何更新數值。
            </p>
            <textarea
              v-model="generatedUpdateInstruction"
              class="soft-input code-textarea modal-text-area"
              rows="14"
              readonly
            ></textarea>
            <div class="modal-actions">
              <button
                class="modal-btn secondary"
                @click="copyUpdateInstruction"
              >
                複製文字
              </button>
              <button
                class="modal-btn primary"
                :disabled="(formData.lorebookIds ?? []).length === 0"
                :title="
                  (formData.lorebookIds ?? []).length === 0
                    ? '請先連結世界書'
                    : '加入第一個連結的世界書'
                "
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

.regex-download {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  font-size: 14px;
  color: #999;
  cursor: pointer;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    color: #4caf50;
    background: rgba(76, 175, 80, 0.1);
  }
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

  &:hover {
    opacity: 0.88;
  }
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 9999;
  padding-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0));
}

.modal-panel {
  background: var(--color-surface, #fff);
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
  background: var(--color-surface-hover, #f0f0f0);
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
      background: var(--color-surface-hover, #f0f0f0);
      color: var(--color-text, #333);
    }

    &.primary {
      background: linear-gradient(
        135deg,
        var(--color-primary, #7dd3a8),
        var(--color-secondary, #a8d3e8)
      );
      color: #fff;

      &:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
    }

    &:not(:disabled):hover {
      opacity: 0.88;
    }
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
  .modal-panel {
    transform: translateY(40px);
  }
}

// ===== 夜晚模式覆蓋 =====
// 上面寫死的淺色在夜晚模式下會跟全域深色輸入框混在一起；
// body.is-night-mode 由 theme store 同步切換，保持巢狀讓 scoped 附在內層元素上。
body.is-night-mode {
  .character-edit-screen {
    background: var(--color-background);
  }

  .avatar-preview {
    border-color: var(--color-surface);
  }

  .avatar-placeholder {
    background: var(--color-surface);
    border-color: var(--color-border);

    svg {
      color: var(--color-text-muted);
    }
  }

  .avatar-edit-badge {
    border-color: var(--color-background);
  }

  .avatar-hint {
    color: var(--color-text-secondary);
  }

  .edit-section {
    background: var(--color-surface);

    &.danger-section {
      border-color: rgba(255, 123, 123, 0.3);
    }
  }

  .section-header:hover {
    background: var(--color-surface-hover);
  }

  .section-title {
    color: var(--color-text);
  }

  .section-chevron {
    color: var(--color-text-muted);
  }

  .form-label {
    color: var(--color-text-secondary);

    .optional {
      color: var(--color-text-muted);
    }
  }

  .form-hint {
    color: var(--color-text-muted);
  }

  .soft-input {
    border-color: var(--color-border);

    &:focus {
      border-color: #f093fb;
    }

    &::placeholder {
      color: var(--color-text-muted);
    }
  }

  .tags-container {
    border-color: var(--color-border);
  }

  .soft-tag.editable {
    background: var(--color-surface-hover);
    color: var(--color-text);

    .tag-remove {
      color: var(--color-text-muted);
    }
  }

  .tag-input {
    background: transparent;
    color: var(--color-text);

    &::placeholder {
      color: var(--color-text-muted);
    }
  }

  .lorebook-item {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  .add-lorebook-btn {
    background: var(--color-surface-hover);
    border-color: var(--color-border);
    color: var(--color-text-secondary);

    &:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: var(--color-text-muted);
    }
  }

  .lorebook-picker {
    background: var(--color-background);
    color: var(--color-text);
  }

  .lorebook-option:hover {
    background: var(--color-surface-hover);
  }

  .no-lorebooks {
    color: var(--color-text-muted);
  }

  .regex-item {
    background: var(--color-surface-hover);

    &.disabled {
      border-left-color: var(--color-border);
    }
  }

  .regex-name {
    color: var(--color-text);
  }

  .regex-download,
  .regex-delete {
    color: var(--color-text-muted);
  }

  .regex-find {
    color: var(--color-text-secondary);
    background: rgba(255, 255, 255, 0.06);
  }

  .regex-placement {
    color: var(--color-text-muted);
  }

  .toggle-switch .toggle-slider {
    background: #3a3a5a;
  }

  .toggle-switch input:checked + .toggle-slider {
    background: #7dd3a8;
  }

  .module-card {
    background: var(--color-surface-hover);
  }

  .module-info {
    .module-name {
      color: var(--color-text);
    }

    .module-desc {
      color: var(--color-text-secondary);
    }
  }

  .module-settings {
    border-top-color: rgba(255, 255, 255, 0.08);
  }

  .setting-label,
  .setting-desc {
    color: var(--color-text-secondary);
  }

  .setting-desc code {
    background: rgba(255, 255, 255, 0.08);
    color: #f48fb1;
  }

  .setting-hint,
  .setting-label-sm,
  .range-field label {
    color: var(--color-text-muted);
  }

  .setting-options button {
    background: var(--color-surface);
    border-color: var(--color-border);
    color: var(--color-text);

    &.active {
      background: #7dd3a8;
      border-color: #7dd3a8;
      color: #1a1a2e;
    }
  }

  .affinity-metric-card {
    background: var(--color-surface);
    border-color: var(--color-border);
  }

  .affinity-stages {
    border-top-color: var(--color-border);
  }

  .btn-icon-sm {
    color: var(--color-text-muted);

    &:hover {
      background: rgba(255, 123, 123, 0.15);
      color: #ff7b7b;
    }
  }

  .btn-danger-sm {
    color: #5a5a7a;
  }

  .btn-add-sm,
  .btn-add {
    border-color: var(--color-border);
    color: var(--color-text-muted);

    &:hover {
      border-color: #7dd3a8;
      color: #7dd3a8;
    }
  }

  .template-preview {
    background: rgba(255, 255, 255, 0.05);
  }

  .preview-text {
    color: var(--color-text-secondary);
  }

  .meta-info p {
    color: var(--color-text-secondary);

    strong {
      color: var(--color-text);
    }
  }

  .action-btn {
    background: rgba(255, 183, 77, 0.15);
    color: #ffb74d;

    &:hover {
      background: rgba(255, 183, 77, 0.22);
    }
  }

  .danger-btn.delete {
    background: rgba(255, 123, 123, 0.15);
    color: #ff7b7b;

    &:hover {
      background: rgba(255, 123, 123, 0.22);
    }
  }

  .regex-modal {
    color: var(--color-text);
  }

  .regex-modal-header,
  .regex-modal-footer {
    border-color: var(--color-border);
  }

  .regex-modal-close {
    color: var(--color-text-secondary);
  }

  .regex-checkbox-row label {
    color: var(--color-text);
  }

  .regex-modal-cancel {
    border-color: var(--color-border);
    color: var(--color-text);
  }
}
// ===== 改版：頂欄、角色資訊、分頁、分頁卡片 =====
.character-edit-screen {
  display: flex;
  flex-direction: column;
  background: var(--color-background);
}

.edit-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: calc(12px + var(--safe-top)) calc(16px + var(--safe-right)) 0
    calc(8px + var(--safe-left));
}

.edit-back {
  width: 44px;
  height: 44px;
  border-radius: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text);

  &:active {
    background: var(--color-surface);
  }
}

.edit-header-title {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.edit-unsaved {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-right: 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.edit-unsaved-dot {
  width: 7px;
  height: 7px;
  border-radius: 4px;
  background: var(--color-warning);
}

.edit-save {
  height: 40px;
  padding: 0 18px;
  border-radius: 20px;
  background: var(--color-primary);
  color: var(--color-on-primary-contrast);
  font-size: 14px;
  font-weight: 700;

  &:disabled {
    opacity: 0.6;
  }

  &:active:not(:disabled) {
    transform: scale(0.97);
  }
}

.edit-hero {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px calc(20px + var(--safe-right)) 12px calc(20px + var(--safe-left));
}

.hero-avatar-wrap {
  position: relative;
  flex: none;
}

.hero-avatar {
  width: 72px;
  height: 72px;
  border-radius: 36px;
  overflow: hidden;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary-light);
  color: var(--color-primary);
}

.hero-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero-avatar-initial {
  font-family: "Noto Serif TC", "Source Han Serif TC", serif;
  font-size: 32px;
  font-weight: 900;
}

.hero-avatar-camera {
  position: absolute;
  right: -6px;
  bottom: -6px;
  width: 34px;
  height: 34px;
  border-radius: 17px;
  border: 3px solid var(--color-background);
  background: var(--color-text);
  color: var(--color-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.hero-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hero-name {
  font-family: "Noto Serif TC", "Source Han Serif TC", serif;
  font-size: 24px;
  font-weight: 900;
  letter-spacing: 0.03em;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hero-subline {
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hero-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}

.hero-chip {
  height: 22px;
  padding: 0 8px;
  border-radius: 11px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 11px;
  display: flex;
  align-items: center;
}

.edit-tabs {
  flex-shrink: 0;
  display: flex;
  overflow-x: auto;
  padding: 0 calc(12px + var(--safe-right)) 0 calc(12px + var(--safe-left));
  border-bottom: 1px solid var(--color-border);
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.edit-tab {
  flex: none;
  height: 46px;
  padding: 0 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  white-space: nowrap;

  &.active {
    color: var(--color-text);
    font-weight: 700;
    box-shadow: inset 0 -2.5px 0 var(--color-primary);
  }
}

.edit-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  width: 100%;
  box-sizing: border-box;
  padding: 16px calc(16px + var(--safe-right)) calc(32px + var(--safe-bottom))
    calc(16px + var(--safe-left));
}

.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.tab-card {
  background: var(--color-surface);
  border-radius: 18px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  color: var(--color-text);

  .form-group {
    margin-bottom: 0;
  }

  .soft-input {
    min-height: 48px;
    border-radius: 12px;
    background: var(--color-background);
    border: 1px solid var(--color-border);
    color: var(--color-text);
  }

  textarea.soft-input {
    min-height: 96px;
  }
}

.tab-card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text);
}

.tab-card-hint,
.tab-panel-hint {
  margin: -8px 0 0;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.tab-panel-hint {
  margin: 0;
  padding: 0 4px;
  font-size: 13px;
}

.tab-card .add-lorebook-btn {
  width: 100%;
  min-height: 52px;
  margin-top: 0 !important;
  border: 1.5px dashed var(--color-border);
  border-radius: 14px;
  background: var(--color-background);
  color: var(--color-text);
  font-size: 14px;
  font-weight: 700;
}

body.is-night-mode .tab-card .add-lorebook-btn {
  border-color: var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
}

.danger-card {
  background: transparent;
  border: 1.5px solid color-mix(in srgb, var(--color-error) 35%, transparent);

  .tab-card-title {
    color: var(--color-error);
  }
}

.module-info .module-icon {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--color-success) 16%, var(--color-surface));
  color: var(--color-success);

  &.affinity {
    background: var(--color-primary-light);
    color: var(--color-primary);
  }
}
</style>

<style lang="scss" scoped>
// 世界設定搜尋
.world-search-row {
  display: flex;
  gap: 6px;
}

.world-search-btn {
  padding: 10px 14px;
  border: none;
  border-radius: 10px;
  background: var(--color-primary, #7dd3a8);
  color: white;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.world-search-results {
  margin-top: 6px;
  border: 1px solid var(--color-border, #eee);
  border-radius: 10px;
  overflow: hidden;
  max-height: 200px;
  overflow-y: auto;
}

.world-result-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: 10px 14px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  & + & {
    border-top: 1px solid var(--color-border, #eee);
  }
  &:hover {
    background: var(--color-hover, rgba(0, 0, 0, 0.04));
  }
}

.world-result-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text, #333);
}

.world-result-sub {
  font-size: 12px;
  opacity: 0.6;
  color: var(--color-text, #333);
}

.world-selected {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--color-primary-light, rgba(125, 211, 168, 0.12));
  border-radius: 10px;
  margin-top: 8px;
}

.world-selected-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text, #333);
  flex: 1;
  min-width: 0;
  flex-wrap: wrap;
}

.world-tz-badge {
  font-size: 11px;
  background: var(--color-primary, #7dd3a8);
  color: white;
  padding: 2px 7px;
  border-radius: 20px;
  white-space: nowrap;
}

.world-clear-btn {
  font-size: 12px;
  padding: 4px 10px;
  border: 1px solid var(--color-border, #ddd);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  color: var(--color-text-secondary, #888);
  flex-shrink: 0;
  &:hover {
    background: rgba(0, 0, 0, 0.05);
  }
}
</style>
