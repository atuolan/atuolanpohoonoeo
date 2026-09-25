<script setup lang="ts">
import { ImageCropper } from "@/components/common";
import {
  getAvatarFrameLayers,
  getAvatarFrameSvg,
  getLayerSrc,
  isAvatarFrameImage,
  isAvatarFrameSvg,
} from "@/data/avatarFrames";
import { getShopItemById } from "@/data/shopItems";
import type { AvatarStyle, BubbleStyle } from "@/stores";
import { themePresets, useSettingsStore, useThemeStore } from "@/stores";
import { useGameEconomyStore } from "@/stores/gameEconomy";
import type { ChatAppearance, ChatBarStyle, ChatBubbleEffects, ChatMessageSpacing } from "@/types/chat";
import {
  DEFAULT_BAR_STYLE,
  DEFAULT_BUBBLE_EFFECTS,
  CHAT_FONT_SIZE_DEFAULT,
  CHAT_FONT_SIZE_MAX,
  CHAT_FONT_SIZE_MIN,
  CHAT_FONT_STACKS,
  isFollowingGlobalWallpaper,
  resolveChatFontSizePx,
} from "@/utils/chatAppearanceVars";
import { toPickerHex } from "@/utils/simpleGradient";
import { deriveColorsFromPrimary, normalizeHex } from "@/utils/wallpaperLuminance";
import { computed, nextTick, ref, watch } from "vue";
import ChatAppearancePreview from "./theme-settings/ChatAppearancePreview.vue";
import BarStyleFields from "./theme-settings/BarStyleFields.vue";
import BubbleEffectsFields from "./theme-settings/BubbleEffectsFields.vue";
import GradientColorField from "./theme-settings/GradientColorField.vue";
import type {
  ChatColors,
  ChatFontStyle,
  ChatWallpaperStyle,
  PreviewElement,
  PreviewState,
  PreviewTarget,
} from "./theme-settings/types";

// 此彈窗只從聊天頁開啟，編輯的一律是「目前聊天」的專屬外觀
interface Props {
  visible: boolean;
  chatAppearance?: ChatAppearance;
  /** 聊天 ID（有值才顯示裝飾分頁） */
  chatId?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "saveChatAppearance", appearance: ChatAppearance): void;
}>();

const themeStore = useThemeStore();
const settingsStore = useSettingsStore();
const gameEconomyStore = useGameEconomyStore();

const GLOBAL_WALLET_ID = "global";

// ===== 分頁 =====
type Tab = "colors" | "bubbles" | "wallpaper" | "font" | "decorations";

const TABS: { id: Tab; label: string; icon: string }[] = [
  {
    id: "colors",
    label: "配色",
    icon: "M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8z",
  },
  {
    id: "bubbles",
    label: "氣泡",
    icon: "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z",
  },
  {
    id: "wallpaper",
    label: "背景",
    icon: "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z",
  },
  {
    id: "font",
    label: "字體",
    icon: "M9.93 13.5h4.14L12 7.98 9.93 13.5zM20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-4.05 16.5l-1.14-3H9.17l-1.12 3H5.96l5.11-13h1.86l5.11 13h-2.09z",
  },
  {
    id: "decorations",
    label: "裝飾",
    icon: "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z",
  },
];

const activeTab = ref<Tab>("colors");
/** 在預覽中點選的元素；有值時設定區只顯示該元素的完整設定 */
const previewFocus = ref<PreviewElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);
const sectionsRef = ref<HTMLElement | null>(null);

const visibleTabs = computed(() => TABS.filter((tab) => tab.id !== "decorations" || !!props.chatId));
const showPreview = computed(() => activeTab.value in TAB_SECTIONS);

type Section =
  | "theme"
  | "cardColors"
  | "accentColors"
  | "statusColors"
  | "userBubble"
  | "aiBubble"
  | "thought"
  | "bubbleShape"
  | "bubbleTexture"
  | "avatar"
  | "wallpaper"
  | "header"
  | "input";

/** 每個分頁列出的設定區（依範本順序顯示） */
const TAB_SECTIONS: Partial<Record<Tab, Section[]>> = {
  colors: ["theme", "cardColors", "accentColors", "statusColors"],
  bubbles: ["userBubble", "aiBubble", "thought", "bubbleShape", "bubbleTexture", "avatar"],
  wallpaper: ["wallpaper", "header", "input"],
};

/** 點選預覽元素時，顯示與該元素相關的所有設定 */
const ELEMENT_SECTIONS: Record<PreviewElement, Section[]> = {
  ai: ["aiBubble", "bubbleShape", "bubbleTexture"],
  user: ["userBubble", "bubbleShape", "bubbleTexture"],
  thought: ["thought"],
  avatar: ["avatar"],
  header: ["header"],
  input: ["input"],
  surface: ["cardColors"],
  surfaceHover: ["accentColors"],
  status: ["statusColors"],
};

const FOCUS_TITLES: Record<PreviewElement, string> = {
  ai: "AI 氣泡",
  user: "我的氣泡",
  thought: "想法氣泡",
  avatar: "頭像",
  header: "頂欄",
  input: "輸入欄",
  surface: "卡片與主要文字",
  surfaceHover: "滑過背景與輔助色",
  status: "狀態提示色",
};

const visibleSections = computed(
  () => new Set(previewFocus.value ? ELEMENT_SECTIONS[previewFocus.value] : (TAB_SECTIONS[activeTab.value] ?? [])),
);

function showSection(section: Section) {
  return visibleSections.value.has(section);
}

function selectTab(tab: Tab) {
  activeTab.value = tab;
  previewFocus.value = null;
  contentRef.value?.scrollTo({ top: 0 });
}

function handleTabsWheel(event: WheelEvent) {
  (event.currentTarget as HTMLElement).scrollLeft += event.deltaY;
}

// 預覽點擊：背景 → 背景分頁；其他元素 → 原地切換成該元素的設定，再點一次返回
async function onPreviewSelect(target: PreviewTarget) {
  if (target === "wallpaper") {
    selectTab("wallpaper");
    return;
  }
  previewFocus.value = previewFocus.value === target ? null : target;
  if (!previewFocus.value) return;
  // 讓設定面板的開頭進入可視範圍，同時保留部分預覽
  await nextTick();
  const content = contentRef.value;
  const panel = sectionsRef.value;
  if (!content || !panel) return;
  const panelTop = panel.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop;
  const target_ = panelTop - content.clientHeight * 0.45;
  if (target_ > content.scrollTop) content.scrollTo({ top: target_, behavior: "smooth" });
}

// ===== 選項常數 =====
const PRESETS = [
  { id: "soft-pink", name: "粉紅" },
  { id: "soft-purple", name: "紫羅蘭" },
  { id: "soft-mint", name: "薄荷" },
  { id: "soft-mint-green", name: "薄荷綠" },
  { id: "soft-peach", name: "蜜桃" },
  { id: "soft-blue", name: "天藍" },
].map((preset) => ({ ...preset, color: themePresets[preset.id]?.primary ?? "#FF85A2" }));

const AVATAR_SHAPES = [
  { id: "circle", name: "圓形", icon: "○" },
  { id: "rounded", name: "圓角", icon: "▢" },
  { id: "square", name: "方形", icon: "□" },
] as const;

const AVATAR_SIZES = [
  { id: "small", name: "小" },
  { id: "medium", name: "中" },
  { id: "large", name: "大" },
] as const;

const MESSAGE_SPACINGS = [
  { id: "compact", name: "緊湊" },
  { id: "normal", name: "標準" },
  { id: "relaxed", name: "寬鬆" },
] as const satisfies readonly { id: ChatMessageSpacing; name: string }[];

const FONT_FAMILIES = [
  { id: "system", name: "系統預設" },
  { id: "rounded", name: "圓體" },
  { id: "serif", name: "襯線體" },
  { id: "mono", name: "等寬字體" },
] as const;

const MARKDOWN_COLOR_FIELDS = [
  { key: "italic", label: "斜體文字" },
  { key: "bold", label: "粗體文字" },
  { key: "underline", label: "底線文字" },
  { key: "strikethrough", label: "刪除線" },
  { key: "highlight", label: "高亮背景" },
  { key: "quote", label: "引用文字" },
  { key: "code", label: "行內代碼" },
  { key: "heading", label: "標題文字" },
] as const;

const WALLPAPER_PRESETS = [
  { id: "follow", name: "跟隨全域", type: "global-image", value: "" },
  { id: "time-theme", name: "跟隨時間", type: "time-theme", value: "" },
  { id: "none", name: "無", type: "color", value: "var(--color-background)" },
  { id: "gradient1", name: "夢幻粉", type: "gradient", value: "linear-gradient(135deg, #FFE6F0 0%, #E6F0FF 100%)" },
  { id: "gradient2", name: "薰衣草", type: "gradient", value: "linear-gradient(135deg, #E6E6FA 0%, #FFF0F5 100%)" },
  { id: "gradient3", name: "清新綠", type: "gradient", value: "linear-gradient(135deg, #E8F5E9 0%, #E3F2FD 100%)" },
  { id: "gradient4", name: "暖陽橙", type: "gradient", value: "linear-gradient(135deg, #FFF3E0 0%, #FFECB3 100%)" },
] as const;

type WallpaperPreset = (typeof WALLPAPER_PRESETS)[number];

const WALLPAPER_FITS = [
  { id: "cover", name: "填滿" },
  { id: "contain", name: "完整" },
  { id: "fill", name: "拉伸" },
  { id: "repeat", name: "平鋪" },
] as const;

const AI_BUBBLE_FIELDS = [
  { label: "背景", color: "aiBgColor", gradient: "aiBgGradient", fallback: "#ffffff" },
  { label: "訊息文字", color: "aiContentColor", gradient: "aiContentGradient", fallback: "#4a4a6a" },
  { label: "名稱／時間", color: "aiTextColor", gradient: "aiTextGradient", fallback: "#4a4a6a" },
] as const;

const THOUGHT_BUBBLE_FIELDS = [
  { label: "背景", color: "thoughtBgColor", gradient: "thoughtBgGradient", fallback: "#ADD8E6" },
  { label: "文字", color: "thoughtTextColor", gradient: "thoughtTextGradient", fallback: "#4a6572" },
] as const;

const USER_BUBBLE_FIELDS = [
  { label: "背景", color: "userBgColor", gradient: "userBgGradient", fallback: "#FF85A2" },
  { label: "文字／時間", color: "userTextColor", gradient: "userTextGradient", fallback: "#FFFFFF" },
] as const;

type ColorField = { key: keyof ChatColors; label: string };

const PALETTE_GROUPS: { id: "cardColors" | "accentColors" | "statusColors"; title: string; fields: ColorField[] }[] = [
  {
    id: "cardColors",
    title: "卡片與主要文字",
    fields: [
      { key: "surface", label: "卡片背景" },
      { key: "text", label: "主要文字" },
      { key: "textMuted", label: "提示文字" },
    ],
  },
  {
    id: "accentColors",
    title: "滑過背景與輔助色",
    fields: [
      { key: "surfaceHover", label: "滑過背景" },
      { key: "secondary", label: "輔助色" },
      { key: "textSecondary", label: "次要文字" },
    ],
  },
  {
    id: "statusColors",
    title: "狀態提示色",
    fields: [
      { key: "success", label: "成功提示" },
      { key: "error", label: "錯誤提示" },
      { key: "warning", label: "警告提示" },
    ],
  },
];

// 頂欄與輸入欄的背景都讀 surface（與卡片背景相同）
const BARS: { id: "header" | "input"; name: string; colorFields: ColorField[] }[] = [
  {
    id: "header",
    name: "頂欄",
    colorFields: [
      { key: "surface", label: "背景" },
      { key: "text", label: "標題文字" },
      { key: "textSecondary", label: "次要文字" },
    ],
  },
  { id: "input", name: "輸入欄", colorFields: [{ key: "surface", label: "背景" }] },
];

const COLOR_KEYS = [
  "primary",
  "primaryLight",
  "secondary",
  "background",
  "surface",
  "surfaceHover",
  "text",
  "textSecondary",
  "textMuted",
  "border",
  "shadow",
  "success",
  "error",
  "warning",
] as const satisfies readonly (keyof ChatColors)[];

// ===== 預設值（皆取自全域設定） =====
function globalColors(): ChatColors {
  return Object.fromEntries(COLOR_KEYS.map((key) => [key, themeStore.colors[key]])) as ChatColors;
}

function defaultFont(): ChatFontStyle {
  return {
    family: "system",
    lineHeight: 1.6,
    letterSpacing: 0,
    markdownColors: {
      text: "#4a4a6a",
      italic: "#8b7355",
      bold: "#4a4a6a",
      underline: "#8b2942",
      strikethrough: "#999999",
      highlight: "#fff3cd",
      quote: "#8b5a2b",
      code: "#e83e8c",
      heading: "#4a4a6a",
    },
  };
}

function defaultBars(): Record<"header" | "input", ChatBarStyle> {
  return { header: { ...DEFAULT_BAR_STYLE }, input: { ...DEFAULT_BAR_STYLE } };
}

function followGlobalWallpaper(): ChatWallpaperStyle {
  const g = themeStore.wallpaperStyle;
  return {
    type: "global-image",
    value: "",
    blur: g.blur ?? 0,
    opacity: g.opacity ?? 100,
    overlay: g.overlay ?? "",
    fit: g.fit || "cover",
  };
}

/** 舊版會複製全域桌布圖片（含會失效的 blob: 網址），載入時一律改回「跟隨全域」 */
function normalizeWallpaper(wallpaper?: ChatWallpaperStyle): ChatWallpaperStyle {
  if (!wallpaper) return followGlobalWallpaper();
  const g = themeStore.wallpaperStyle;
  const isGlobalCopy = wallpaper.type === "image" && g.type === "image" && wallpaper.value === g.value;
  if (isFollowingGlobalWallpaper(wallpaper) || isGlobalCopy) {
    return { ...wallpaper, type: "global-image", value: "" };
  }
  return { ...wallpaper };
}

/** IndexedDB 會保留值為 undefined 的欄位，展開覆蓋預設值前先濾掉 */
function definedOnly<T extends object>(obj: T | undefined): Partial<T> {
  if (!obj) return {};
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  ) as Partial<T>;
}

// ===== 編輯中的暫存值 =====
const useCustomAppearance = ref(false);
const unifiedColors = ref(true);
const customHexInput = ref("");
const tempColors = ref<ChatColors>(globalColors());
const tempAvatarStyle = ref<AvatarStyle>({ ...themeStore.avatarStyle });
const tempBubbleStyle = ref<BubbleStyle>({ ...themeStore.bubbleStyle });
const tempWallpaperStyle = ref<ChatWallpaperStyle>(followGlobalWallpaper());
const tempFontStyle = ref<ChatFontStyle>(defaultFont());
const tempFontSizeValue = ref(CHAT_FONT_SIZE_DEFAULT);
const tempAvatarFrames = ref<{ userFrameId: string | null; charFrameId: string | null }>({
  userFrameId: null,
  charFrameId: null,
});
const tempBars = ref(defaultBars());
const tempBubbleEffects = ref<ChatBubbleEffects>({ ...DEFAULT_BUBBLE_EFFECTS });
const tempMessageSpacing = ref<ChatMessageSpacing>("normal");

// 任何外觀變動都自動啟用聊天專屬外觀（載入資料時除外）
let hydrating = false;
watch(
  [
    tempColors,
    tempAvatarStyle,
    tempBubbleStyle,
    tempWallpaperStyle,
    tempFontStyle,
    tempFontSizeValue,
    tempAvatarFrames,
    tempBars,
    tempBubbleEffects,
    tempMessageSpacing,
  ],
  () => {
    if (!hydrating) useCustomAppearance.value = true;
  },
  { deep: true, flush: "sync" },
);

function hydrate(apply: () => void) {
  hydrating = true;
  try {
    apply();
  } finally {
    hydrating = false;
  }
}

function loadAppearance(appearance: ChatAppearance | undefined) {
  hydrate(() => {
    useCustomAppearance.value = !!appearance && appearance.useCustom !== false;
    const { unified, ...savedColors } = appearance?.colors ?? {};
    tempColors.value = { ...globalColors(), ...definedOnly(savedColors) };
    unifiedColors.value = unified !== false;
    customHexInput.value = tempColors.value.primary;
    tempAvatarStyle.value = { ...themeStore.avatarStyle, ...definedOnly(appearance?.avatar) };
    tempBubbleStyle.value = { ...themeStore.bubbleStyle, ...definedOnly(appearance?.bubble) };
    tempWallpaperStyle.value = normalizeWallpaper(appearance?.wallpaper);

    const font = appearance?.font;
    const fallbackFont = defaultFont();
    tempFontStyle.value = {
      family: font?.family ?? fallbackFont.family,
      lineHeight: font?.lineHeight ?? fallbackFont.lineHeight,
      letterSpacing: font?.letterSpacing ?? fallbackFont.letterSpacing,
      markdownColors: { ...fallbackFont.markdownColors, ...definedOnly(font?.markdownColors) },
    };
    tempFontSizeValue.value = resolveChatFontSizePx(font?.size);

    tempAvatarFrames.value = {
      userFrameId: appearance?.avatarFrames?.userFrameId ?? null,
      charFrameId: appearance?.avatarFrames?.charFrameId ?? null,
    };

    tempBars.value = {
      header: { ...DEFAULT_BAR_STYLE, ...definedOnly(appearance?.bars?.header) },
      input: { ...DEFAULT_BAR_STYLE, ...definedOnly(appearance?.bars?.input) },
    };
    tempBubbleEffects.value = { ...DEFAULT_BUBBLE_EFFECTS, ...definedOnly(appearance?.bubbleEffects) };
    tempMessageSpacing.value = appearance?.messageSpacing ?? "normal";
  });
}

watch(
  () => props.visible,
  async (isVisible) => {
    if (!isVisible) return;
    activeTab.value = "colors";
    previewFocus.value = null;
    loadAppearance(props.chatAppearance);
    await gameEconomyStore.loadState(GLOBAL_WALLET_ID);
  },
);

const previewState = computed<PreviewState>(() => ({
  colors: tempColors.value,
  bubble: tempBubbleStyle.value,
  avatar: tempAvatarStyle.value,
  wallpaper: tempWallpaperStyle.value,
  font: tempFontStyle.value,
  fontSizePx: tempFontSizeValue.value,
  bars: tempBars.value,
  bubbleEffects: tempBubbleEffects.value,
  messageSpacing: tempMessageSpacing.value,
}));

// ===== 配色 =====
const activePresetId = computed(
  () => PRESETS.find((preset) => preset.color.toLowerCase() === tempColors.value.primary.toLowerCase())?.id ?? null,
);

function syncUserBubbleWithPrimary(primary: string, primaryLight: string) {
  tempBubbleStyle.value.userBgColor = primary;
  tempBubbleStyle.value.userBgGradient = `linear-gradient(135deg, ${primary}, ${primaryLight})`;
  customHexInput.value = primary;
}

function selectPreset(presetId: string) {
  const preset = themePresets[presetId];
  if (!preset) return;
  const { background: _keepBackground, ...presetColors } = preset;
  tempColors.value = { ...tempColors.value, ...definedOnly(presetColors) };
  syncUserBubbleWithPrimary(preset.primary, preset.primaryLight);
  unifiedColors.value = true;
}

function applyCustomPrimary(hex: string) {
  const derived = deriveColorsFromPrimary(hex);
  if (unifiedColors.value) {
    tempColors.value = { ...tempColors.value, ...derived };
  } else {
    tempColors.value = { ...tempColors.value, primary: hex, primaryLight: derived.primaryLight };
  }
  syncUserBubbleWithPrimary(hex, derived.primaryLight);
}

function onCustomHexCommit(event: Event) {
  const input = event.target as HTMLInputElement;
  const hex = normalizeHex(input.value);
  if (!hex) {
    // 無效色碼：還原成目前主色
    input.value = tempColors.value.primary;
    customHexInput.value = tempColors.value.primary;
    return;
  }
  if (hex !== normalizeHex(tempColors.value.primary)) applyCustomPrimary(hex);
  customHexInput.value = hex;
}

function setColor(key: keyof ChatColors, value: string) {
  tempColors.value[key] = value;
}

// ===== 背景 =====
const globalWallpaperIsImage = computed(
  () => themeStore.wallpaperStyle.type === "image" && !!themeStore.wallpaperStyle.value,
);

const usesImageWallpaper = computed(
  () =>
    (tempWallpaperStyle.value.type === "image" && !!tempWallpaperStyle.value.value) ||
    (isFollowingGlobalWallpaper(tempWallpaperStyle.value) && globalWallpaperIsImage.value),
);

const hasCustomImage = computed(
  () => tempWallpaperStyle.value.type === "image" && !isFollowingGlobalWallpaper(tempWallpaperStyle.value),
);

const solidWallpaperColor = computed(() =>
  tempWallpaperStyle.value.type === "color" ? normalizeHex(tempWallpaperStyle.value.value) : null,
);

function isWallpaperPresetActive(preset: WallpaperPreset): boolean {
  const w = tempWallpaperStyle.value;
  if (preset.type === "global-image") return isFollowingGlobalWallpaper(w);
  if (preset.type === "time-theme") return w.type === "time-theme";
  return w.type === preset.type && w.value === preset.value;
}

function wallpaperPresetStyle(preset: WallpaperPreset) {
  if (preset.type === "global-image") {
    return { background: "var(--wallpaper-value, var(--color-background))", backgroundSize: "cover", backgroundPosition: "center" };
  }
  if (preset.type === "time-theme") return {};
  return { background: preset.value };
}

function selectWallpaperPreset(preset: WallpaperPreset) {
  if (preset.type === "global-image") {
    tempWallpaperStyle.value = followGlobalWallpaper();
    return;
  }
  tempWallpaperStyle.value = { ...tempWallpaperStyle.value, type: preset.type, value: preset.value };
}

function setSolidWallpaper(hex: string) {
  tempWallpaperStyle.value = { ...tempWallpaperStyle.value, type: "color", value: hex };
  tempColors.value.background = hex;
}

const showCropper = ref(false);
const cropperImageSrc = ref("");

function handleImageUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    cropperImageSrc.value = e.target?.result as string;
    showCropper.value = true;
  };
  reader.readAsDataURL(file);
  // 重置 input 以允許重複上傳同一檔案
  input.value = "";
}

function onCropComplete(dataUrl: string) {
  showCropper.value = false;
  tempWallpaperStyle.value = { ...tempWallpaperStyle.value, type: "image", value: dataUrl, fit: "cover" };
}

function onCropClose() {
  showCropper.value = false;
  cropperImageSrc.value = "";
}

// ===== 裝飾品 =====
// 解析商品 ID（支援變體格式 baseId_variantId）
function resolveShopItem(itemId: string) {
  const direct = getShopItemById(itemId);
  if (direct) return { item: direct, variantName: null as string | null };

  const lastUnderscore = itemId.lastIndexOf("_");
  if (lastUnderscore === -1) return null;
  const baseItem = getShopItemById(itemId.substring(0, lastUnderscore));
  const variant = baseItem?.variants?.find((v) => v.variantId === itemId.substring(lastUnderscore + 1));
  if (!baseItem || !variant) return null;
  return { item: baseItem, variantName: variant.name };
}

function toOwnedItems(ids: string[] | undefined) {
  return (ids || []).flatMap((id) => {
    const resolved = resolveShopItem(id);
    if (!resolved) return [];
    const { item, variantName } = resolved;
    return [{ id, name: variantName ? `${item.name} - ${variantName}` : item.name, rarity: item.rarity }];
  });
}

const decorations = computed(() => gameEconomyStore.getDecorations(GLOBAL_WALLET_ID));
const ownedFrames = computed(() => toOwnedItems(decorations.value?.ownedFrames));
const ownedBubbles = computed(() => toOwnedItems(decorations.value?.ownedBubbles));
const equippedBubbleId = computed(() => decorations.value?.equippedBubbleId ?? null);

const FRAME_TARGETS = [
  { key: "userFrameId", title: "我的頭像框", hint: "只套用在這個聊天" },
  { key: "charFrameId", title: "角色頭像框", hint: "只套用在這個聊天" },
] as const;

// 聊天氣泡是全域裝備，會立即生效到所有聊天
async function equipBubble(bubbleId: string | null) {
  gameEconomyStore.equipBubble(GLOBAL_WALLET_ID, bubbleId);
  await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
}

// ===== 重置 / 儲存 =====
function resetToDefault() {
  if (!confirm("確定要把這個聊天的外觀恢復成全域預設嗎？（頭像框不受影響）")) return;
  tempColors.value = globalColors();
  tempAvatarStyle.value = { ...themeStore.avatarStyle };
  tempBubbleStyle.value = { ...themeStore.bubbleStyle };
  tempWallpaperStyle.value = followGlobalWallpaper();
  tempFontStyle.value = defaultFont();
  tempFontSizeValue.value = CHAT_FONT_SIZE_DEFAULT;
  tempBars.value = defaultBars();
  tempBubbleEffects.value = { ...DEFAULT_BUBBLE_EFFECTS };
  tempMessageSpacing.value = "normal";
  unifiedColors.value = true;
  customHexInput.value = tempColors.value.primary;
  previewFocus.value = null;
}

// 關閉專屬外觀時仍保留設定內容，之後重新開啟不必重設
function buildAppearance(): ChatAppearance {
  return {
    useCustom: useCustomAppearance.value,
    colors: { ...tempColors.value, unified: unifiedColors.value },
    avatar: { ...tempAvatarStyle.value },
    avatarFrames: { ...tempAvatarFrames.value },
    bubble: { ...tempBubbleStyle.value },
    wallpaper: { ...tempWallpaperStyle.value },
    font: {
      ...tempFontStyle.value,
      markdownColors: { ...tempFontStyle.value.markdownColors },
      size: `${tempFontSizeValue.value}px`,
    },
    bars: { header: { ...tempBars.value.header }, input: { ...tempBars.value.input } },
    bubbleEffects: { ...tempBubbleEffects.value },
    messageSpacing: tempMessageSpacing.value,
  };
}

function saveAndClose() {
  emit("saveChatAppearance", buildAppearance());
  emit("close");
}

function cancel() {
  emit("close");
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="soft-modal-overlay" @click.self="saveAndClose">
        <div class="soft-modal theme-settings-modal">
          <div class="modal-header">
            <h2 class="modal-title">聊天外觀設定</h2>
            <button class="modal-close" title="儲存並關閉" aria-label="儲存並關閉" @click="saveAndClose">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                />
              </svg>
            </button>
          </div>

          <label class="toggle-card chat-mode-toggle" :class="{ active: useCustomAppearance }">
            <span class="toggle-info">
              <span class="toggle-title">使用此聊天專屬外觀</span>
              <span class="toggle-sub">關閉時套用全域外觀，這裡的設定會保留</span>
            </span>
            <span class="toggle-switch">
              <input v-model="useCustomAppearance" type="checkbox" />
              <span class="switch-track"><span class="switch-thumb"></span></span>
            </span>
          </label>

          <div class="tabs-container" @wheel.prevent="handleTabsWheel">
            <div class="soft-tabs" role="tablist">
              <button
                v-for="tab in visibleTabs"
                :key="tab.id"
                class="tab-item"
                :class="{ active: activeTab === tab.id }"
                role="tab"
                :aria-selected="activeTab === tab.id"
                @click="selectTab(tab.id)"
              >
                <svg viewBox="0 0 24 24" fill="currentColor"><path :d="tab.icon" /></svg>
                {{ tab.label }}
              </button>
            </div>
          </div>

          <div ref="contentRef" class="modal-content">
            <p v-if="settingsStore.nightMode && activeTab !== 'decorations'" class="night-hint">
              🌙 夜間模式中，聊天頁的顏色與背景會改用夜間配色；字體、形狀、透明度等設定照常套用。
            </p>

            <ChatAppearancePreview
              v-if="showPreview"
              class="preview-block"
              :state="previewState"
              :focus="previewFocus"
              @select="onPreviewSelect"
            />

            <!-- ===== 配色／氣泡／背景：依分頁顯示；點預覽元素時只顯示該元素的完整設定 ===== -->
            <div
              v-if="showPreview"
              ref="sectionsRef"
              class="settings-section"
              :class="{ 'focus-settings-panel': !!previewFocus }"
            >
              <div v-if="previewFocus" class="focus-settings-header">
                <span class="focus-settings-title">{{ FOCUS_TITLES[previewFocus] }}</span>
                <button class="focus-close-btn" title="返回全部設定" aria-label="返回全部設定" @click="previewFocus = null">
                  ✕
                </button>
              </div>

              <!-- 主題配色 -->
              <template v-if="showSection('theme')">
                <h3 class="section-title">主題配色</h3>
                <div class="preset-grid">
                  <button
                    v-for="preset in PRESETS"
                    :key="preset.id"
                    class="preset-item"
                    :class="{ active: activePresetId === preset.id }"
                    @click="selectPreset(preset.id)"
                  >
                    <span class="preset-color" :style="{ background: preset.color }"></span>
                    <span class="preset-name">{{ preset.name }}</span>
                  </button>
                </div>

                <h3 class="section-title">自訂主題色</h3>
                <div class="custom-color-row">
                  <input
                    type="color"
                    class="custom-color-picker"
                    aria-label="自訂主題色"
                    :value="toPickerHex(tempColors.primary, '#FF85A2')"
                    @input="applyCustomPrimary(($event.target as HTMLInputElement).value)"
                  />
                  <input
                    type="text"
                    class="custom-hex-input"
                    :value="customHexInput"
                    placeholder="#FF85A2"
                    spellcheck="false"
                    maxlength="7"
                    aria-label="主題色色碼"
                    @change="onCustomHexCommit"
                  />
                  <span class="custom-color-hint">輸入色碼或選色</span>
                </div>

                <label class="toggle-card" :class="{ active: unifiedColors }">
                  <span class="toggle-info">
                    <span class="toggle-title">統一配色</span>
                    <span class="toggle-sub">{{ unifiedColors ? "改主色時自動推導其他顏色" : "只改主色，其他顏色各自調整" }}</span>
                  </span>
                  <span class="toggle-switch">
                    <input v-model="unifiedColors" type="checkbox" />
                    <span class="switch-track"><span class="switch-thumb"></span></span>
                  </span>
                </label>
              </template>

              <!-- 介面顏色 -->
              <template v-for="group in PALETTE_GROUPS" :key="group.id">
                <template v-if="showSection(group.id)">
                  <h3 v-if="!previewFocus" class="section-title">{{ group.title }}</h3>
                  <div class="individual-colors">
                    <div v-for="field in group.fields" :key="field.key" class="color-item">
                      <input
                        type="color"
                        :aria-label="field.label"
                        :value="toPickerHex(tempColors[field.key], '#ffffff')"
                        @input="setColor(field.key, ($event.target as HTMLInputElement).value)"
                      />
                      <span>{{ field.label }}</span>
                    </div>
                  </div>
                </template>
              </template>

              <!-- 我的氣泡 -->
              <template v-if="showSection('userBubble')">
                <h3 v-if="!previewFocus" class="section-title">我的氣泡</h3>
                <div class="individual-colors">
                  <GradientColorField
                    v-for="field in USER_BUBBLE_FIELDS"
                    :key="field.color"
                    :label="field.label"
                    :color="tempBubbleStyle[field.color]"
                    :gradient="tempBubbleStyle[field.gradient]"
                    :fallback-color="field.fallback"
                    @update:color="tempBubbleStyle[field.color] = $event"
                    @update:gradient="tempBubbleStyle[field.gradient] = $event"
                  />
                </div>
              </template>

              <!-- AI 氣泡 -->
              <template v-if="showSection('aiBubble')">
                <h3 v-if="!previewFocus" class="section-title">AI 氣泡</h3>
                <div class="individual-colors">
                  <GradientColorField
                    v-for="field in AI_BUBBLE_FIELDS"
                    :key="field.color"
                    :label="field.label"
                    :color="tempBubbleStyle[field.color]"
                    :gradient="tempBubbleStyle[field.gradient]"
                    :fallback-color="field.fallback"
                    @update:color="tempBubbleStyle[field.color] = $event"
                    @update:gradient="tempBubbleStyle[field.gradient] = $event"
                  />
                </div>
              </template>

              <!-- 想法氣泡 -->
              <template v-if="showSection('thought')">
                <h3 v-if="!previewFocus" class="section-title">想法氣泡</h3>
                <div class="individual-colors">
                  <GradientColorField
                    v-for="field in THOUGHT_BUBBLE_FIELDS"
                    :key="field.color"
                    :label="field.label"
                    :color="tempBubbleStyle[field.color]"
                    :gradient="tempBubbleStyle[field.gradient]"
                    :fallback-color="field.fallback"
                    @update:color="tempBubbleStyle[field.color] = $event"
                    @update:gradient="tempBubbleStyle[field.gradient] = $event"
                  />
                  <div class="color-item">
                    <input
                      type="color"
                      aria-label="光暈顏色"
                      :value="toPickerHex(tempBubbleStyle.thoughtGlowColor, '#ADD8E6')"
                      @input="tempBubbleStyle.thoughtGlowColor = ($event.target as HTMLInputElement).value"
                    />
                    <span>光暈顏色</span>
                  </div>
                </div>
                <div class="slider-control">
                  <span class="slider-label">光暈強度</span>
                  <input
                    v-model.number="tempBubbleStyle.thoughtGlowOpacity"
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.1"
                    aria-label="想法氣泡光暈強度"
                  />
                  <span class="slider-value">{{ Math.round((tempBubbleStyle.thoughtGlowOpacity ?? 0.6) * 100) }}%</span>
                </div>
              </template>

              <!-- 形狀與間距 -->
              <template v-if="showSection('bubbleShape')">
                <h3 class="section-title">形狀與間距</h3>
                <div class="slider-control">
                  <span class="slider-label">圓角</span>
                  <input v-model.number="tempBubbleStyle.borderRadius" type="range" min="8" max="32" step="2" aria-label="氣泡圓角" />
                  <span class="slider-value">{{ tempBubbleStyle.borderRadius }}px</span>
                </div>
                <div class="slider-control">
                  <span class="slider-label">最大寬度</span>
                  <input v-model.number="tempBubbleStyle.maxWidth" type="range" min="50" max="90" step="5" aria-label="氣泡最大寬度" />
                  <span class="slider-value">{{ tempBubbleStyle.maxWidth }}%</span>
                </div>
                <div class="slider-control">
                  <span class="slider-label">訊息間距</span>
                  <div class="chip-row">
                    <button
                      v-for="spacing in MESSAGE_SPACINGS"
                      :key="spacing.id"
                      class="chip"
                      :class="{ active: tempMessageSpacing === spacing.id }"
                      @click="tempMessageSpacing = spacing.id"
                    >
                      {{ spacing.name }}
                    </button>
                  </div>
                </div>
              </template>

              <!-- 質感 -->
              <template v-if="showSection('bubbleTexture')">
                <h3 class="section-title">質感 <small class="section-note">AI 與我的氣泡共用</small></h3>
                <BubbleEffectsFields v-model="tempBubbleEffects" :fallback-border-color="tempColors.border" />
              </template>

              <!-- 頭像 -->
              <template v-if="showSection('avatar')">
                <h3 class="section-title">頭像形狀</h3>
                <div class="option-grid">
                  <button
                    v-for="shape in AVATAR_SHAPES"
                    :key="shape.id"
                    class="option-item"
                    :class="{ active: tempAvatarStyle.shape === shape.id }"
                    @click="tempAvatarStyle.shape = shape.id"
                  >
                    <span class="option-icon">{{ shape.icon }}</span>
                    <span class="option-name">{{ shape.name }}</span>
                  </button>
                </div>

                <h3 class="section-title">頭像大小</h3>
                <div class="option-grid">
                  <button
                    v-for="size in AVATAR_SIZES"
                    :key="size.id"
                    class="option-item"
                    :class="{ active: tempAvatarStyle.size === size.id }"
                    @click="tempAvatarStyle.size = size.id"
                  >
                    <span class="option-name">{{ size.name }}</span>
                  </button>
                </div>

                <h3 class="section-title">頭像邊框</h3>
                <div class="slider-control">
                  <span class="slider-label">粗細</span>
                  <input v-model.number="tempAvatarStyle.borderWidth" type="range" min="0" max="4" step="1" aria-label="頭像邊框粗細" />
                  <span class="slider-value">{{ tempAvatarStyle.borderWidth }}px</span>
                </div>
                <div class="individual-colors">
                  <div class="color-item">
                    <input
                      type="color"
                      aria-label="頭像邊框顏色"
                      :value="toPickerHex(tempAvatarStyle.borderColor, '#ffffff')"
                      @input="tempAvatarStyle.borderColor = ($event.target as HTMLInputElement).value"
                    />
                    <span>邊框顏色</span>
                  </div>
                </div>
                <label class="toggle-card" :class="{ active: tempAvatarStyle.shadowEnabled }">
                  <span class="toggle-info">
                    <span class="toggle-title">頭像陰影</span>
                    <span class="toggle-sub">讓頭像稍微浮起來</span>
                  </span>
                  <span class="toggle-switch">
                    <input v-model="tempAvatarStyle.shadowEnabled" type="checkbox" />
                    <span class="switch-track"><span class="switch-thumb"></span></span>
                  </span>
                </label>
              </template>

              <!-- 聊天背景 -->
              <template v-if="showSection('wallpaper')">
                <h3 class="section-title">聊天背景</h3>
                <div class="wallpaper-grid">
                  <button
                    v-for="preset in WALLPAPER_PRESETS"
                    :key="preset.id"
                    class="wallpaper-item"
                    :class="{ active: isWallpaperPresetActive(preset) }"
                    @click="selectWallpaperPreset(preset)"
                  >
                    <span
                      class="wallpaper-preview"
                      :class="{ 'time-theme-preview': preset.type === 'time-theme' }"
                      :style="wallpaperPresetStyle(preset)"
                    ></span>
                    <span class="wallpaper-name">{{ preset.name }}</span>
                  </button>
                  <button v-if="hasCustomImage" class="wallpaper-item active" disabled>
                    <span
                      class="wallpaper-preview"
                      :style="{ backgroundImage: `url(&quot;${tempWallpaperStyle.value}&quot;)` }"
                    ></span>
                    <span class="wallpaper-name">自訂圖片</span>
                  </button>
                  <label class="wallpaper-item upload">
                    <input type="file" accept="image/*" @change="handleImageUpload" />
                    <span class="wallpaper-preview">
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
                    </span>
                    <span class="wallpaper-name">上傳圖片</span>
                  </label>
                </div>

                <div class="individual-colors">
                  <div class="color-item" :class="{ selected: !!solidWallpaperColor }">
                    <input
                      type="color"
                      aria-label="純色背景"
                      :value="solidWallpaperColor ?? toPickerHex(tempColors.background, '#ffffff')"
                      @input="setSolidWallpaper(($event.target as HTMLInputElement).value)"
                    />
                    <span>純色背景</span>
                  </div>
                </div>

                <template v-if="usesImageWallpaper">
                  <div class="slider-control">
                    <span class="slider-label">顯示方式</span>
                    <div class="chip-row">
                      <button
                        v-for="fit in WALLPAPER_FITS"
                        :key="fit.id"
                        class="chip"
                        :class="{ active: (tempWallpaperStyle.fit || 'cover') === fit.id }"
                        @click="tempWallpaperStyle.fit = fit.id"
                      >
                        {{ fit.name }}
                      </button>
                    </div>
                  </div>
                </template>

                <template v-if="tempWallpaperStyle.type === 'image' || tempWallpaperStyle.type === 'global-image'">
                  <div class="slider-control">
                    <span class="slider-label">模糊</span>
                    <input v-model.number="tempWallpaperStyle.blur" type="range" min="0" max="20" step="1" aria-label="背景模糊度" />
                    <span class="slider-value">{{ tempWallpaperStyle.blur }}px</span>
                  </div>
                  <div class="slider-control">
                    <span class="slider-label">不透明度</span>
                    <input
                      v-model.number="tempWallpaperStyle.opacity"
                      type="range"
                      min="20"
                      max="100"
                      step="5"
                      aria-label="背景不透明度"
                    />
                    <span class="slider-value">{{ tempWallpaperStyle.opacity }}%</span>
                  </div>
                </template>
              </template>

              <!-- 頂欄與輸入欄 -->
              <template v-for="bar in BARS" :key="bar.id">
                <template v-if="showSection(bar.id)">
                  <h3 v-if="!previewFocus" class="section-title">{{ bar.name }}</h3>
                  <div class="individual-colors">
                    <div v-for="field in bar.colorFields" :key="field.key" class="color-item">
                      <input
                        type="color"
                        :aria-label="field.label"
                        :value="toPickerHex(tempColors[field.key], '#ffffff')"
                        @input="setColor(field.key, ($event.target as HTMLInputElement).value)"
                      />
                      <span>{{ field.label }}</span>
                    </div>
                  </div>
                  <BarStyleFields v-model="tempBars[bar.id]" :name="bar.name" />
                </template>
              </template>
              <p v-if="showSection('header') || showSection('input')" class="section-hint bars-hint">
                頂欄與輸入欄共用同一個背景色。不透明度調低後，才看得到後面的背景與毛玻璃效果。
              </p>
            </div>

            <!-- ===== 字體 ===== -->
            <div v-if="activeTab === 'font'" class="settings-section">
              <h3 class="section-title">字體大小</h3>
              <div class="slider-control">
                <input
                  v-model.number="tempFontSizeValue"
                  type="range"
                  :min="CHAT_FONT_SIZE_MIN"
                  :max="CHAT_FONT_SIZE_MAX"
                  step="1"
                  aria-label="字體大小"
                />
                <span class="slider-value">{{ tempFontSizeValue }}px</span>
              </div>

              <h3 class="section-title">字體樣式</h3>
              <div class="font-family-grid">
                <button
                  v-for="font in FONT_FAMILIES"
                  :key="font.id"
                  class="font-family-item"
                  :class="{ active: tempFontStyle.family === font.id }"
                  @click="tempFontStyle.family = font.id"
                >
                  <span class="font-preview" :style="{ fontFamily: CHAT_FONT_STACKS[font.id] }">字 Aa</span>
                  <span class="font-name">{{ font.name }}</span>
                </button>
              </div>

              <h3 class="section-title">行高與字距</h3>
              <div class="slider-control">
                <span class="slider-label">行高</span>
                <input v-model.number="tempFontStyle.lineHeight" type="range" min="1" max="2.5" step="0.1" aria-label="行高" />
                <span class="slider-value">{{ tempFontStyle.lineHeight.toFixed(1) }}</span>
              </div>
              <div class="slider-control">
                <span class="slider-label">字距</span>
                <input v-model.number="tempFontStyle.letterSpacing" type="range" min="-2" max="5" step="0.5" aria-label="字距" />
                <span class="slider-value">{{ tempFontStyle.letterSpacing }}px</span>
              </div>

              <h3 class="section-title">Markdown 樣式顏色</h3>
              <div class="individual-colors">
                <div v-for="field in MARKDOWN_COLOR_FIELDS" :key="field.key" class="color-item">
                  <input
                    type="color"
                    :aria-label="field.label"
                    :value="toPickerHex(tempFontStyle.markdownColors[field.key], '#4a4a6a')"
                    @input="tempFontStyle.markdownColors[field.key] = ($event.target as HTMLInputElement).value"
                  />
                  <span>{{ field.label }}</span>
                </div>
              </div>

              <div>
                <div class="preview-label">預覽</div>
                <div
                  class="font-preview-text"
                  :style="{
                    fontSize: `${tempFontSizeValue}px`,
                    fontFamily: CHAT_FONT_STACKS[tempFontStyle.family],
                    lineHeight: tempFontStyle.lineHeight,
                    letterSpacing: `${tempFontStyle.letterSpacing}px`,
                    background: tempBubbleStyle.aiBgGradient || tempBubbleStyle.aiBgColor,
                    color: tempBubbleStyle.aiContentColor,
                  }"
                >
                  <strong class="md-heading" :style="{ color: tempFontStyle.markdownColors.heading }">標題文字</strong>
                  <span>這是一段預覽文字，</span>
                  <em :style="{ color: tempFontStyle.markdownColors.italic }">斜體文字</em>、
                  <strong :style="{ color: tempFontStyle.markdownColors.bold }">粗體文字</strong>、
                  <u :style="{ color: tempFontStyle.markdownColors.underline }">底線文字</u>、
                  <del :style="{ color: tempFontStyle.markdownColors.strikethrough }">刪除線</del>、
                  <mark :style="{ backgroundColor: tempFontStyle.markdownColors.highlight }">高亮文字</mark>
                  <span
                    class="quote-preview"
                    :style="{ color: tempFontStyle.markdownColors.quote, borderLeftColor: tempFontStyle.markdownColors.quote }"
                  >
                    引用文字
                  </span>
                  <code :style="{ color: tempFontStyle.markdownColors.code }">行內代碼</code>
                </div>
              </div>
            </div>

            <!-- ===== 裝飾 ===== -->
            <div v-if="activeTab === 'decorations' && chatId" class="settings-section">
              <template v-for="target in FRAME_TARGETS" :key="target.key">
                <h3 class="section-title">{{ target.title }}</h3>
                <p class="section-hint">{{ target.hint }}</p>
                <div v-if="ownedFrames.length > 0" class="decoration-grid">
                  <button
                    class="decoration-item"
                    :class="{ active: tempAvatarFrames[target.key] === null }"
                    @click="tempAvatarFrames[target.key] = null"
                  >
                    <span class="decoration-icon none">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path
                          d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                        />
                      </svg>
                    </span>
                    <span class="decoration-name">無</span>
                  </button>
                  <button
                    v-for="frame in ownedFrames"
                    :key="`${target.key}-${frame.id}`"
                    class="decoration-item"
                    :class="{ active: tempAvatarFrames[target.key] === frame.id }"
                    @click="tempAvatarFrames[target.key] = frame.id"
                  >
                    <span
                      v-if="isAvatarFrameSvg(frame.id)"
                      class="decoration-icon svg-frame"
                      :class="frame.rarity"
                      v-html="getAvatarFrameSvg(frame.id, 'circle')"
                    ></span>
                    <span v-else-if="isAvatarFrameImage(frame.id)" class="decoration-icon image-frame" :class="frame.rarity">
                      <img
                        v-if="getAvatarFrameLayers(frame.id)?.background"
                        class="frame-layer-bg"
                        :src="getLayerSrc(getAvatarFrameLayers(frame.id)?.background)"
                        alt=""
                      />
                      <img
                        v-if="getAvatarFrameLayers(frame.id)?.overlay"
                        class="frame-layer-overlay"
                        :src="getLayerSrc(getAvatarFrameLayers(frame.id)?.overlay)"
                        alt=""
                      />
                      <img
                        v-if="getAvatarFrameLayers(frame.id)?.decoration"
                        class="frame-layer-decoration"
                        :src="getLayerSrc(getAvatarFrameLayers(frame.id)?.decoration)"
                        alt=""
                      />
                    </span>
                    <span v-else class="decoration-icon" :class="frame.rarity">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path
                          d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"
                        />
                      </svg>
                    </span>
                    <span class="decoration-name">{{ frame.name }}</span>
                  </button>
                </div>
                <div v-else class="empty-decorations">
                  <p>還沒有購買頭像框</p>
                  <p class="hint">前往商城購買裝飾品</p>
                </div>
              </template>

              <h3 class="section-title">聊天氣泡</h3>
              <p class="section-hint">全域裝備：會立即套用到所有聊天</p>
              <div v-if="ownedBubbles.length > 0" class="decoration-grid">
                <button class="decoration-item" :class="{ active: equippedBubbleId === null }" @click="equipBubble(null)">
                  <span class="decoration-icon none">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                      />
                    </svg>
                  </span>
                  <span class="decoration-name">無</span>
                </button>
                <button
                  v-for="bubble in ownedBubbles"
                  :key="bubble.id"
                  class="decoration-item"
                  :class="{ active: equippedBubbleId === bubble.id }"
                  @click="equipBubble(bubble.id)"
                >
                  <span class="decoration-icon" :class="bubble.rarity">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                    </svg>
                  </span>
                  <span class="decoration-name">{{ bubble.name }}</span>
                </button>
              </div>
              <div v-else class="empty-decorations">
                <p>還沒有購買聊天氣泡</p>
                <p class="hint">前往商城購買裝飾品</p>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button class="soft-btn secondary" @click="resetToDefault">恢復預設</button>
            <button class="soft-btn secondary" @click="cancel">取消</button>
            <button class="soft-btn primary" @click="saveAndClose">完成</button>
          </div>
        </div>
      </div>
    </Transition>

    <ImageCropper
      :visible="showCropper"
      :image-src="cropperImageSrc"
      :output-width="1024"
      title="裁剪桌布圖片"
      @crop="onCropComplete"
      @close="onCropClose"
    />
  </Teleport>
</template>

<style lang="scss" scoped>
@use "../../styles/theme-settings-shared";

.theme-settings-modal {
  width: 100%;
  max-width: 500px;
  height: calc(100dvh - 40px);
  max-height: calc(100dvh - 40px);
  border-radius: 24px;

  @media (max-height: 600px), (max-width: 520px) {
    height: calc(100dvh - 24px);
    max-height: calc(100dvh - 24px);
    border-radius: 22px;
  }

  @media (max-width: 520px) {
    max-width: calc(100vw - 24px);
  }
}

// ===== 開關卡片（專屬外觀、統一配色、頭像陰影共用） =====
.toggle-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 18px;
  background: var(--color-background);
  cursor: pointer;
  user-select: none;
  transition: background var(--transition-fast);

  &.active {
    background: var(--color-primary-light);
  }

  .toggle-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .toggle-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
  }

  .toggle-sub {
    font-size: 12px;
    color: var(--color-text-muted);
  }
}

.chat-mode-toggle {
  margin: 14px 20px 0;
  padding: 14px 16px;
}

.toggle-switch {
  position: relative;
  width: 46px;
  height: 28px;
  flex-shrink: 0;

  input {
    position: absolute;
    inset: 0;
    z-index: 1;
    opacity: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    cursor: pointer;
  }

  .switch-track {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.18);
    border-radius: 999px;
    transition: background 0.2s ease;
  }

  .switch-thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
    transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }

  input:checked + .switch-track {
    background: var(--color-primary);
  }

  input:checked + .switch-track .switch-thumb {
    transform: translateX(18px);
  }

  input:focus-visible + .switch-track {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
}

// ===== 分頁 =====
.tabs-container {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  padding: 10px 16px;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  background: var(--color-surface);
  box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.05);
  scroll-snap-type: x proximity;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.soft-tabs {
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  min-width: max-content;

  .tab-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    white-space: nowrap;
    flex-shrink: 0;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-secondary);
    background: transparent;
    border: none;
    cursor: pointer;
    scroll-snap-align: start;
    transition:
      background 0.18s ease,
      color 0.18s ease;

    svg {
      width: 16px;
      height: 16px;
      opacity: 0.75;
    }

    &:hover {
      color: var(--color-text);
    }

    &.active {
      background: var(--color-primary-light);
      color: var(--color-primary);
      font-weight: 600;

      svg {
        opacity: 1;
      }
    }
  }
}

// ===== 內容區 =====
.night-hint {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 14px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-secondary);
  background: var(--color-background);
}

.preview-block {
  margin-bottom: 16px;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section-note {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 400;
  color: var(--color-text-muted);
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin: 0;
  padding-top: 6px;

  &:first-child {
    padding-top: 0;
  }
}

.section-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: -8px 0 0;

  &.bars-hint {
    margin-top: 0;
    line-height: 1.5;
  }
}

.preview-label {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 8px;
}

.individual-colors {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 8px;
  width: 100%;

  .color-item.selected {
    box-shadow: inset 0 0 0 2px var(--color-primary);
  }
}

// ===== 配色 =====
.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 10px;
}

.preset-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--color-background);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  min-width: 0;
  transition:
    background var(--transition-fast),
    transform 0.18s ease;

  &:hover {
    background: var(--color-surface-hover);
  }

  &:active {
    transform: scale(0.97);
  }

  &.active {
    background: var(--color-primary-light);

    .preset-color {
      box-shadow:
        0 0 0 3px var(--color-surface),
        0 0 0 5px var(--color-primary),
        0 4px 12px rgba(0, 0, 0, 0.18);

      &::after {
        content: "";
        position: absolute;
        inset: 0;
        background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'><path d='M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z'/></svg>")
          center / 18px no-repeat;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35));
      }
    }
  }
}

.preset-color {
  position: relative;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 50%;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.55),
    0 4px 12px rgba(0, 0, 0, 0.15);
  transition: box-shadow 0.2s ease;
}

.preset-name {
  font-size: 12px;
  color: var(--color-text-secondary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.custom-color-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.custom-color-picker {
  width: 40px;
  height: 40px;
  border: 2px solid var(--color-border);
  border-radius: 14px;
  padding: 2px;
  cursor: pointer;
  background: transparent;
  flex-shrink: 0;

  &::-webkit-color-swatch-wrapper {
    padding: 0;
  }

  &::-webkit-color-swatch {
    border: none;
    border-radius: 10px;
  }
}

.custom-hex-input {
  width: 100px;
  padding: 8px 10px;
  border: 1.5px solid var(--color-border);
  border-radius: 14px;
  font-size: 14px;
  font-family: monospace;
  color: var(--color-text);
  background: var(--color-surface);
  text-transform: uppercase;

  &:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-light);
  }
}

.custom-color-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  white-space: nowrap;
}

// 點預覽後展開的顏色設定
.focus-settings-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  background: var(--color-surface);
  border-radius: 18px;
  border: 1.5px solid var(--color-primary-light);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
  animation: focus-panel-in 0.25s ease;
}

@keyframes focus-panel-in {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.focus-settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.focus-settings-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-primary);
}

.focus-close-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background: var(--color-background);
  color: var(--color-text-muted);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }
}

// ===== 版面 =====
.option-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.option-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  background: var(--color-background);
  border: none;
  border-radius: 16px;
  cursor: pointer;
  transition:
    background var(--transition-fast),
    box-shadow 0.18s ease,
    transform 0.18s ease;

  &:hover {
    background: var(--color-surface-hover);
  }

  &:active {
    transform: scale(0.97);
  }

  &.active {
    background: var(--color-primary-light);
    box-shadow: inset 0 0 0 2px var(--color-primary);
  }
}

.option-icon {
  font-size: 20px;
  color: var(--color-text);
}

.option-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
}

// ===== 背景 =====
.wallpaper-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.wallpaper-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 6px;
  background: transparent;
  border: none;
  border-radius: 16px;
  cursor: pointer;
  transition:
    background var(--transition-fast),
    transform 0.18s ease;

  &:hover {
    background: var(--color-background);
  }

  &:active:not(:disabled) {
    transform: scale(0.97);
  }

  &:disabled {
    cursor: default;
  }

  &.active {
    background: var(--color-primary-light);

    .wallpaper-preview {
      box-shadow:
        0 0 0 2px var(--color-surface),
        0 0 0 4px var(--color-primary);
    }
  }

  &.upload {
    input {
      display: none;
    }

    .wallpaper-preview {
      border: 2px dashed var(--color-border);
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-background);

      svg {
        width: 24px;
        height: 24px;
        color: var(--color-text-muted);
      }
    }
  }
}

.wallpaper-preview {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 12px;
  background-size: cover;
  background-position: center;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06);
  transition: box-shadow 0.18s ease;

  &.time-theme-preview {
    background: linear-gradient(135deg, #fff8f0 0%, #f8fafc 20%, #fafafa 40%, #fef3e2 60%, #1e293b 80%, #0f172a 100%);
  }
}

.wallpaper-name {
  font-size: 11px;
  color: var(--color-text-secondary);
}

// ===== 字體 =====
.font-family-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.font-family-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 12px;
  background: var(--color-background);
  border: none;
  border-radius: 18px;
  cursor: pointer;
  transition:
    background var(--transition-fast),
    box-shadow 0.18s ease,
    transform 0.18s ease;

  &:hover {
    background: var(--color-surface-hover);
  }

  &:active {
    transform: scale(0.97);
  }

  &.active {
    background: var(--color-primary-light);
    box-shadow: inset 0 0 0 2px var(--color-primary);
  }
}

.font-preview {
  font-size: 24px;
  color: var(--color-text);
}

.font-name {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.font-preview-text {
  padding: 14px 16px;
  border-radius: 18px;
  box-shadow: var(--shadow-sm);
  word-break: break-word;

  .md-heading {
    display: block;
    font-size: 1.15em;
    margin-bottom: 4px;
  }

  .quote-preview {
    display: block;
    margin: 6px 0;
    padding-left: 8px;
    border-left: 3px solid;
    font-style: italic;
  }

  code {
    padding: 2px 6px;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 4px;
    font-family: ui-monospace, Menlo, Consolas, monospace;
  }

  mark {
    padding: 0 4px;
    border-radius: 2px;
  }
}

// 三顆按鈕平分寬度，窄螢幕避免「恢復預設」折行
.modal-footer .soft-btn {
  white-space: nowrap;
  padding-left: 8px;
  padding-right: 8px;
}

// ===== 裝飾品 =====
.decoration-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.decoration-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 8px;
  background: var(--color-background);
  border: none;
  border-radius: 18px;
  cursor: pointer;
  transition:
    background 0.2s,
    box-shadow 0.18s ease,
    transform 0.18s ease;

  &:hover {
    background: var(--color-surface-hover);
  }

  &:active {
    transform: scale(0.97);
  }

  &.active {
    background: var(--color-primary-light);
    box-shadow: inset 0 0 0 2px var(--color-primary);
  }

  .decoration-icon {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;

    svg {
      width: 28px;
      height: 28px;
    }

    &.none {
      background: #9ca3af;
    }

    &.common {
      background: #6b7280;
    }

    &.uncommon {
      background: #22c55e;
    }

    &.rare {
      background: #3b82f6;
    }

    &.epic {
      background: #a855f7;
    }

    &.legendary {
      background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
    }

    &.svg-frame {
      background: transparent;
      overflow: visible;

      :deep(svg) {
        width: 100%;
        height: 100%;
      }
    }

    &.image-frame {
      background: transparent;
      position: relative;
      overflow: visible;

      img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: contain;

        &.frame-layer-bg {
          z-index: 0;
        }
        &.frame-layer-overlay {
          z-index: 1;
        }
        &.frame-layer-decoration {
          z-index: 2;
        }
      }
    }
  }

  .decoration-name {
    font-size: 12px;
    color: var(--color-text);
    text-align: center;
  }
}

.empty-decorations {
  text-align: center;
  padding: 24px;
  color: var(--color-text-secondary);

  p {
    margin: 0;
    font-size: 14px;
  }

  .hint {
    margin-top: 8px;
    font-size: 12px;
    opacity: 0.7;
  }
}
</style>
