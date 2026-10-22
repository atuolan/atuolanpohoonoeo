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
import type { ChatMessageLayout } from "@/stores/theme";
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
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import ChatAppearancePreview from "./theme-settings/ChatAppearancePreview.vue";
import BarStyleFields from "./theme-settings/BarStyleFields.vue";
import BubbleEffectsFields from "./theme-settings/BubbleEffectsFields.vue";
import GradientColorField from "./theme-settings/GradientColorField.vue";
import type {
  ChatColors,
  ChatFontStyle,
  ChatWallpaperStyle,
  PreviewElement,
  PreviewScene,
  PreviewState,
  PreviewTarget,
} from "./theme-settings/types";

// 從聊天頁開啟：可在「全域外觀」與「這個聊天專屬」之間切換；
// 從聊天以外開啟（沒有 chatAppearance）：只編輯全域外觀
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

// ===== 分頁：照「看到的東西」分 =====
type Tab = "overall" | "messages" | "avatar" | "wallpaper" | "font" | "decorations";

const TABS: { id: Tab; label: string }[] = [
  { id: "overall", label: "整體" },
  { id: "messages", label: "訊息" },
  { id: "avatar", label: "頭像" },
  { id: "wallpaper", label: "背景" },
  { id: "font", label: "文字" },
  { id: "decorations", label: "裝飾" },
];

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
  | "input"
  | "fontBasics"
  | "fontSpacing"
  | "markdown"
  | "userFrame"
  | "charFrame"
  | "bubbleDeco";

/** 每個分頁列出的設定卡（依範本順序顯示） */
const TAB_SECTIONS: Record<Tab, Section[]> = {
  overall: ["theme", "cardColors", "accentColors", "statusColors"],
  messages: ["userBubble", "aiBubble", "thought", "bubbleShape", "bubbleTexture"],
  avatar: ["avatar"],
  wallpaper: ["wallpaper", "header", "input"],
  font: ["fontBasics", "fontSpacing", "markdown"],
  decorations: ["userFrame", "charFrame", "bubbleDeco"],
};

/** 設定卡對應預覽中亮起的元素（沒有對應元素的卡不亮預覽） */
const SECTION_FOCUS: Partial<Record<Section, PreviewElement>> = {
  cardColors: "surface",
  accentColors: "surfaceHover",
  statusColors: "status",
  userBubble: "user",
  aiBubble: "ai",
  thought: "thought",
  avatar: "avatar",
  header: "header",
  input: "input",
};

/** 點預覽元素 → 跳到對應的設定卡 */
const ELEMENT_SECTION: Record<PreviewTarget, Section> = {
  ai: "aiBubble",
  user: "userBubble",
  thought: "thought",
  avatar: "avatar",
  header: "header",
  input: "input",
  surface: "cardColors",
  surfaceHover: "accentColors",
  status: "statusColors",
  wallpaper: "wallpaper",
};

const activeTab = ref<Tab>("overall");
/** 目前預覽對應的設定卡：跟著捲動位置、點選的卡或預覽點擊變動 */
const activeSection = ref<Section>("theme");
const contentRef = ref<HTMLElement | null>(null);

// 裝飾（頭像框）只屬於單一聊天；只編輯全域時不顯示
const visibleTabs = computed(() =>
  TABS.filter((tab) => tab.id !== "decorations" || (!!props.chatId && !isGlobalOnly.value)),
);
const previewFocusElement = computed(() => SECTION_FOCUS[activeSection.value] ?? null);

function showSection(section: Section) {
  return TAB_SECTIONS[activeTab.value].includes(section);
}

function tabOfSection(section: Section): Tab {
  return (Object.keys(TAB_SECTIONS) as Tab[]).find((tab) => TAB_SECTIONS[tab].includes(section)) ?? "overall";
}

function selectTab(tab: Tab) {
  activeTab.value = tab;
  activeSection.value = TAB_SECTIONS[tab][0];
  contentRef.value?.scrollTo({ top: 0 });
}

function handleTabsWheel(event: WheelEvent) {
  (event.currentTarget as HTMLElement).scrollLeft += event.deltaY;
}

// ===== 版面：寬螢幕左右並排／一般手機／小螢幕 =====
// 由 JS 判斷後加在視窗的 class 上，CSS 只認這個 class，兩邊不會不同步。
function useMediaQuery(query: string) {
  const matches = ref(false);
  if (typeof window === "undefined" || !window.matchMedia) return matches;
  const mql = window.matchMedia(query);
  const update = () => {
    matches.value = mql.matches;
  };
  update();
  mql.addEventListener("change", update);
  onBeforeUnmount(() => mql.removeEventListener("change", update));
  return matches;
}

/** 寬螢幕，或橫拿手機（矮但夠寬）→ 預覽放左欄 */
const isWideViewport = useMediaQuery(
  "(min-width: 760px) and (min-height: 520px), (min-width: 560px) and (max-height: 500px)",
);
/** 可視高度不足（例：iPhone SE 用 Safari）→ 套用範圍收進頂列、預覽只畫正在調的東西 */
const isShortViewport = useMediaQuery("(max-height: 720px)");
const layoutMode = computed<"wide" | "phone" | "compact">(() =>
  isWideViewport.value ? "wide" : isShortViewport.value ? "compact" : "phone",
);

// ===== 套用範圍：這個聊天用哪一套，調整的就是那一套 =====
/** 從聊天以外的地方打開（例如全局美化）：只編輯全域外觀 */
const isGlobalOnly = computed(() => !props.chatAppearance);
const modalTitle = computed(() => (isGlobalOnly.value ? "全域聊天外觀" : "聊天外觀"));
const scopeLabel = computed(() => (useCustomAppearance.value ? "這個聊天專屬" : "全域外觀"));
const scopeHint = computed(() =>
  useCustomAppearance.value
    ? "只套用在這個聊天；切回全域外觀時，這裡的設定會保留"
    : "調整會套用到所有使用全域外觀的聊天；整體配色和全局美化共用",
);

// ===== 固定預覽 =====
// 手機與小螢幕：預覽框高度固定（捲動時設定區不會跳動），內容依目前的設定卡只畫相關部分，放不下就等比例縮小。
// 寬螢幕：左欄畫完整預覽。
const PREVIEW_BOX_HEIGHT = { phone: 220, compact: 120, compactFull: 300 } as const;
/** 再小就看不清楚；仍放不下時從下方裁切 */
const PREVIEW_MIN_SCALE = 0.6;

/** 一般手機：預覽框高度夠，畫整段對話 */
const PHONE_SCENES: Record<Section, PreviewScene> = {
  theme: "colors",
  cardColors: "colors",
  accentColors: "colors",
  statusColors: "colors",
  userBubble: "messages",
  aiBubble: "messages",
  thought: "messages",
  bubbleShape: "messages",
  bubbleTexture: "messages",
  avatar: "messages",
  wallpaper: "messages",
  header: "headerPair",
  input: "pairInput",
  fontBasics: "messages",
  fontSpacing: "messages",
  markdown: "messages",
  userFrame: "messages",
  charFrame: "messages",
  bubbleDeco: "messages",
};

/** 小螢幕：只畫正在調的東西 */
const COMPACT_SCENES: Record<Section, PreviewScene> = {
  theme: "colors",
  cardColors: "colors",
  accentColors: "colors",
  statusColors: "colors",
  userBubble: "pair",
  aiBubble: "pair",
  thought: "thought",
  bubbleShape: "conversation",
  bubbleTexture: "pair",
  avatar: "pair",
  wallpaper: "pair",
  header: "header",
  input: "input",
  fontBasics: "pair",
  fontSpacing: "pair",
  markdown: "pair",
  userFrame: "pair",
  charFrame: "pair",
  bubbleDeco: "pair",
};

/** 一般手機可把預覽收成一條；小螢幕可切換成完整預覽 */
const previewCollapsed = ref(false);
const previewFull = ref(false);

const previewScene = computed<PreviewScene>(() => {
  if (layoutMode.value === "compact") return previewFull.value ? "full" : COMPACT_SCENES[activeSection.value];
  return PHONE_SCENES[activeSection.value];
});

const previewBoxHeight = computed(() => {
  if (layoutMode.value === "compact") {
    return previewFull.value ? PREVIEW_BOX_HEIGHT.compactFull : PREVIEW_BOX_HEIGHT.compact;
  }
  return PREVIEW_BOX_HEIGHT.phone;
});

const previewBoxRef = ref<HTMLElement | null>(null);
const previewInnerRef = ref<HTMLElement | null>(null);
const previewBoxWidth = ref(0);
const previewNaturalHeight = ref(0);

const previewScale = computed(() => {
  const natural = previewNaturalHeight.value;
  if (natural <= 0) return 1;
  return Math.min(1, Math.max(PREVIEW_MIN_SCALE, previewBoxHeight.value / natural));
});

/** 以框寬原寸排版後整體縮放，垂直置中 */
const previewInnerStyle = computed<Record<string, string>>(() => {
  const scale = previewScale.value;
  const natural = previewNaturalHeight.value;
  // 還沒量到原寸高度前不置中，避免第一格畫面被往下推
  const offset = natural > 0 ? Math.max(0, (previewBoxHeight.value - natural * scale) / 2) : 0;
  return {
    width: previewBoxWidth.value > 0 ? `${previewBoxWidth.value}px` : "100%",
    transform: `translateY(${offset}px) scale(${scale})`,
  };
});

// transform 不影響 offsetHeight，量到的是原寸高度；內容或框寬改變時重新量
let previewResizeObserver: ResizeObserver | null = null;
watch([previewBoxRef, previewInnerRef], ([box, inner]) => {
  previewResizeObserver?.disconnect();
  previewResizeObserver = null;
  if (!box || !inner || typeof ResizeObserver === "undefined") return;
  previewResizeObserver = new ResizeObserver(() => {
    previewBoxWidth.value = box.clientWidth;
    previewNaturalHeight.value = inner.offsetHeight;
  });
  previewResizeObserver.observe(box);
  previewResizeObserver.observe(inner);
});

function togglePreviewSize() {
  if (layoutMode.value === "compact") previewFull.value = !previewFull.value;
  else previewCollapsed.value = !previewCollapsed.value;
}

// ===== 捲動連動：捲到哪張卡，預覽就亮哪個元素 =====
/** 卡片頂端越過內容區上方這條線，就算「目前的卡」 */
const ACTIVE_LINE_RATIO = 0.35;
const ACTIVE_LINE_MAX_PX = 160;
/** 點預覽跳轉時的平滑捲動期間，不讓捲動事件改掉目標卡 */
const SCROLL_SYNC_LOCK_MS = 700;
let scrollSyncLockUntil = 0;
let scrollSyncFrame = 0;

function syncActiveSectionFromScroll() {
  if (Date.now() < scrollSyncLockUntil) return;
  cancelAnimationFrame(scrollSyncFrame);
  scrollSyncFrame = requestAnimationFrame(() => {
    const content = contentRef.value;
    if (!content) return;
    const cards = Array.from(content.querySelectorAll<HTMLElement>(".settings-card[data-section]"));
    if (cards.length === 0) return;
    const c = content.getBoundingClientRect();
    const line = c.top + Math.min(c.height * ACTIVE_LINE_RATIO, ACTIVE_LINE_MAX_PX);
    let current = cards[0];
    for (const card of cards) {
      if (card.getBoundingClientRect().top > line) break;
      current = card;
    }
    // 捲到底時，最後幾張短卡碰不到判斷線，直接算最後一張
    if (content.scrollTop + content.clientHeight >= content.scrollHeight - 4) current = cards[cards.length - 1];
    activeSection.value = current.dataset.section as Section;
  });
}

/** 碰到卡片裡的控制項，就以那張卡為準（捲不到判斷線的卡也能被選到） */
function activateSection(section: Section) {
  activeSection.value = section;
}

/** 點預覽元素：切到對應分頁、捲到那張卡並亮起 */
async function onPreviewSelect(target: PreviewTarget) {
  const section = ELEMENT_SECTION[target];
  const tab = tabOfSection(section);
  if (activeTab.value !== tab) {
    activeTab.value = tab;
    await nextTick();
  }
  activeSection.value = section;
  const content = contentRef.value;
  const card = content?.querySelector<HTMLElement>(`.settings-card[data-section="${section}"]`);
  if (!content || !card) return;
  scrollSyncLockUntil = Date.now() + SCROLL_SYNC_LOCK_MS;
  const top = card.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop - 8;
  content.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

onBeforeUnmount(() => {
  previewResizeObserver?.disconnect();
  cancelAnimationFrame(scrollSyncFrame);
});
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

// 訊息排版（全域設定，點了立即套用到所有聊天，不跟著本視窗的「套用」）
const MESSAGE_LAYOUTS = [
  { id: "grouped", name: "成組" },
  { id: "classic", name: "經典" },
] as const satisfies readonly { id: ChatMessageLayout; name: string }[];

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

// ===== 預設值 =====
/** 全域配色一律讀白天配色：夜晚模式時 themeStore.colors 是夜晚配色，不能拿來當預設或存回去 */
function globalColors(): ChatColors {
  return Object.fromEntries(COLOR_KEYS.map((key) => [key, themeStore.dayColors[key]])) as ChatColors;
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

/** 氣泡欄位：漸層存成空字串代表「改用純色」，要保留，不然重新打開會被全域的漸層蓋回去 */
function savedBubbleFields(bubble: ChatAppearance["bubble"]): Partial<BubbleStyle> {
  if (!bubble) return {};
  return Object.fromEntries(
    Object.entries(bubble).filter(
      ([key, value]) => value !== undefined && value !== null && (value !== "" || key.endsWith("Gradient")),
    ),
  ) as Partial<BubbleStyle>;
}

// ===== 兩份草稿：全域外觀、這個聊天的專屬外觀 =====
// 畫面上的控制項綁的是「目前這一套」的暫存值；切換套用範圍時，先把暫存值存回原本那份草稿，再載入另一份。
interface AppearanceDraft {
  colors: ChatColors;
  unified: boolean;
  avatar: AvatarStyle;
  bubble: BubbleStyle;
  wallpaper: ChatWallpaperStyle;
  font: ChatFontStyle;
  fontSize: number;
  bars: Record<"header" | "input", ChatBarStyle>;
  effects: ChatBubbleEffects;
  spacing: ChatMessageSpacing;
}

function cloneDraft(draft: AppearanceDraft): AppearanceDraft {
  return JSON.parse(JSON.stringify(draft));
}

/** 字體欄位：存檔值優先，沒有就用 base */
function mergeFont(font: ChatAppearance["font"] | undefined, base: ChatFontStyle): ChatFontStyle {
  return {
    family: font?.family ?? base.family,
    lineHeight: font?.lineHeight ?? base.lineHeight,
    letterSpacing: font?.letterSpacing ?? base.letterSpacing,
    markdownColors: { ...base.markdownColors, ...definedOnly(font?.markdownColors) },
  };
}

/** 全域草稿：配色、氣泡、頭像來自主題的全域設定；其餘來自全域聊天外觀（沒設定過就用內建預設） */
function globalDraftFromStore(): AppearanceDraft {
  const g = themeStore.globalChatAppearance;
  return {
    colors: globalColors(),
    unified: true,
    avatar: { ...themeStore.avatarStyle },
    bubble: { ...themeStore.bubbleStyle },
    wallpaper: normalizeWallpaper(g?.wallpaper),
    font: mergeFont(g?.font, defaultFont()),
    fontSize: g?.font ? resolveChatFontSizePx(g.font.size) : CHAT_FONT_SIZE_DEFAULT,
    bars: {
      header: { ...DEFAULT_BAR_STYLE, ...definedOnly(g?.bars?.header) },
      input: { ...DEFAULT_BAR_STYLE, ...definedOnly(g?.bars?.input) },
    },
    effects: { ...DEFAULT_BUBBLE_EFFECTS, ...definedOnly(g?.bubbleEffects) },
    spacing: g?.messageSpacing ?? "normal",
  };
}

/** 這個聊天存過專屬外觀內容（就算目前切回全域，內容也保留著） */
function hasSavedCustomContent(appearance: ChatAppearance): boolean {
  return !!(
    appearance.colors ||
    appearance.bubble ||
    appearance.avatar ||
    appearance.wallpaper ||
    appearance.font ||
    appearance.bars ||
    appearance.bubbleEffects ||
    appearance.messageSpacing
  );
}

/** 專屬草稿：存檔值蓋在全域草稿上，缺的欄位跟全域一樣 */
function chatDraftFromAppearance(appearance: ChatAppearance, base: AppearanceDraft): AppearanceDraft {
  const { unified, ...savedColors } = appearance.colors ?? {};
  return {
    colors: { ...base.colors, ...definedOnly(savedColors) },
    unified: unified !== false,
    avatar: { ...base.avatar, ...definedOnly(appearance.avatar) },
    bubble: { ...base.bubble, ...savedBubbleFields(appearance.bubble) },
    wallpaper: appearance.wallpaper ? normalizeWallpaper(appearance.wallpaper) : { ...base.wallpaper },
    font: mergeFont(appearance.font, base.font),
    fontSize: appearance.font ? resolveChatFontSizePx(appearance.font.size) : base.fontSize,
    bars: {
      header: { ...base.bars.header, ...definedOnly(appearance.bars?.header) },
      input: { ...base.bars.input, ...definedOnly(appearance.bars?.input) },
    },
    effects: { ...base.effects, ...definedOnly(appearance.bubbleEffects) },
    spacing: appearance.messageSpacing ?? base.spacing,
  };
}

// ===== 編輯中的暫存值（目前這一套） =====
/** 這個聊天是否使用專屬外觀；同時決定畫面上編輯的是哪一套 */
const useCustomAppearance = ref(false);
const unifiedColors = ref(true);
const customHexInput = ref("");
const tempColors = ref<ChatColors>(globalColors());
const tempAvatarStyle = ref<AvatarStyle>({ ...themeStore.avatarStyle });
const tempBubbleStyle = ref<BubbleStyle>({ ...themeStore.bubbleStyle });
const tempWallpaperStyle = ref<ChatWallpaperStyle>(followGlobalWallpaper());
const tempFontStyle = ref<ChatFontStyle>(defaultFont());
const tempFontSizeValue = ref(CHAT_FONT_SIZE_DEFAULT);
/** 頭像框只屬於這個聊天，不跟著套用範圍切換 */
const tempAvatarFrames = ref<{ userFrameId: string | null; charFrameId: string | null }>({
  userFrameId: null,
  charFrameId: null,
});
const tempBars = ref(defaultBars());
const tempBubbleEffects = ref<ChatBubbleEffects>({ ...DEFAULT_BUBBLE_EFFECTS });
const tempMessageSpacing = ref<ChatMessageSpacing>("normal");

let globalDraft: AppearanceDraft = globalDraftFromStore();
let chatDraft: AppearanceDraft | null = null;
/** 打開時的全域草稿，按完成時比對，沒改就不寫入主題 */
let initialGlobalDraftJson = "";

function snapshotDraft(): AppearanceDraft {
  return cloneDraft({
    colors: tempColors.value,
    unified: unifiedColors.value,
    avatar: tempAvatarStyle.value,
    bubble: tempBubbleStyle.value,
    wallpaper: tempWallpaperStyle.value,
    font: tempFontStyle.value,
    fontSize: tempFontSizeValue.value,
    bars: tempBars.value,
    effects: tempBubbleEffects.value,
    spacing: tempMessageSpacing.value,
  });
}

function applyDraft(draft: AppearanceDraft) {
  const d = cloneDraft(draft);
  tempColors.value = d.colors;
  unifiedColors.value = d.unified;
  customHexInput.value = d.colors.primary;
  tempAvatarStyle.value = d.avatar;
  tempBubbleStyle.value = d.bubble;
  tempWallpaperStyle.value = d.wallpaper;
  tempFontStyle.value = d.font;
  tempFontSizeValue.value = d.fontSize;
  tempBars.value = d.bars;
  tempBubbleEffects.value = d.effects;
  tempMessageSpacing.value = d.spacing;
}

/** 把目前畫面上的值存回所屬的那份草稿 */
function storeCurrentDraft() {
  const draft = snapshotDraft();
  if (useCustomAppearance.value) chatDraft = draft;
  else globalDraft = draft;
}

/** 切換套用範圍：這個聊天改用另一套，畫面也換成編輯那一套 */
function setScope(custom: boolean) {
  if (isGlobalOnly.value || custom === useCustomAppearance.value) return;
  storeCurrentDraft();
  useCustomAppearance.value = custom;
  // 第一次改成專屬：從目前的全域外觀開始，不會突然跳成別的樣子
  if (custom && !chatDraft) chatDraft = cloneDraft(globalDraft);
  applyDraft(custom ? chatDraft! : globalDraft);
}

function loadAppearance(appearance: ChatAppearance | undefined) {
  globalDraft = globalDraftFromStore();
  initialGlobalDraftJson = JSON.stringify(globalDraft);
  chatDraft = appearance && hasSavedCustomContent(appearance) ? chatDraftFromAppearance(appearance, globalDraft) : null;
  useCustomAppearance.value = !!appearance && appearance.useCustom !== false;
  if (useCustomAppearance.value && !chatDraft) chatDraft = cloneDraft(globalDraft);
  applyDraft(useCustomAppearance.value ? chatDraft! : globalDraft);
  tempAvatarFrames.value = {
    userFrameId: appearance?.avatarFrames?.userFrameId ?? null,
    charFrameId: appearance?.avatarFrames?.charFrameId ?? null,
  };
}

watch(
  () => props.visible,
  async (isVisible) => {
    if (!isVisible) return;
    activeTab.value = "overall";
    activeSection.value = TAB_SECTIONS.overall[0];
    previewCollapsed.value = false;
    previewFull.value = false;
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
  { key: "userFrameId", section: "userFrame", title: "我的頭像框", hint: "只套用在這個聊天" },
  { key: "charFrameId", section: "charFrame", title: "角色頭像框", hint: "只套用在這個聊天" },
] as const;

// 聊天氣泡是全域裝備，會立即生效到所有聊天
async function equipBubble(bubbleId: string | null) {
  gameEconomyStore.equipBubble(GLOBAL_WALLET_ID, bubbleId);
  await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
}

// ===== 重置 / 儲存 =====
const resetLabel = computed(() => (useCustomAppearance.value ? "恢復成和全域外觀一樣…" : "全域外觀恢復預設…"));

/** 專屬外觀 → 變回和全域一樣；全域外觀 → 回到內建預設（整體配色不動，那是全局美化的設定） */
function resetToDefault() {
  if (useCustomAppearance.value) {
    if (!confirm("確定要把這個聊天的外觀恢復成和全域外觀一樣嗎？（頭像框不受影響）")) return;
    applyDraft(globalDraft);
    return;
  }
  if (!confirm("確定要把全域聊天外觀恢復成內建預設嗎？會影響所有使用全域外觀的聊天。（整體配色不變，請到全局美化調整）")) {
    return;
  }
  const defaults = themeStore.getDefaultChatStyles();
  applyDraft({
    ...snapshotDraft(),
    avatar: defaults.avatar,
    bubble: defaults.bubble,
    wallpaper: followGlobalWallpaper(),
    font: defaultFont(),
    fontSize: CHAT_FONT_SIZE_DEFAULT,
    bars: defaultBars(),
    effects: { ...DEFAULT_BUBBLE_EFFECTS },
    spacing: "normal",
  });
}

/** 草稿 → 存檔格式的外觀欄位 */
function draftToAppearanceFields(draft: AppearanceDraft) {
  return {
    wallpaper: { ...draft.wallpaper },
    font: {
      ...draft.font,
      markdownColors: { ...draft.font.markdownColors },
      size: `${draft.fontSize}px` as const,
    },
    bars: { header: { ...draft.bars.header }, input: { ...draft.bars.input } },
    bubbleEffects: { ...draft.effects },
    messageSpacing: draft.spacing,
  };
}

// 切回全域外觀時仍保留專屬內容，之後再切回專屬不必重設
function buildAppearance(): ChatAppearance {
  if (!chatDraft) {
    return { useCustom: false, avatarFrames: { ...tempAvatarFrames.value } };
  }
  return {
    useCustom: useCustomAppearance.value,
    colors: { ...chatDraft.colors, unified: chatDraft.unified },
    avatar: { ...chatDraft.avatar },
    avatarFrames: { ...tempAvatarFrames.value },
    bubble: { ...chatDraft.bubble },
    ...draftToAppearanceFields(chatDraft),
  };
}

function saveAndClose() {
  storeCurrentDraft();
  // 全域外觀有改才寫入主題（配色、氣泡、頭像寫進主題本身；其餘寫進全域聊天外觀）
  if (JSON.stringify(globalDraft) !== initialGlobalDraftJson) {
    themeStore.applyGlobalChatAppearance({
      colors: globalDraft.colors,
      bubble: globalDraft.bubble,
      avatar: globalDraft.avatar,
      chat: draftToAppearanceFields(globalDraft),
    });
  }
  if (!isGlobalOnly.value) emit("saveChatAppearance", buildAppearance());
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
        <div class="soft-modal theme-settings-modal" :class="`layout-${layoutMode}`">
          <!-- 頂列：取消／標題／完成（小螢幕時套用範圍收成標題下的小標籤） -->
          <div class="ts-topbar">
            <button class="ts-topbar-btn" @click="cancel">取消</button>
            <div class="ts-topbar-title">
              <h2 class="ts-title">{{ modalTitle }}</h2>
              <button
                v-if="layoutMode === 'compact' && !isGlobalOnly"
                class="ts-scope-chip"
                :aria-label="`套用範圍：${scopeLabel}，點擊切換`"
                @click="setScope(!useCustomAppearance)"
              >
                {{ scopeLabel }}
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m7 15 5 5 5-5" />
                  <path d="m7 9 5-5 5 5" />
                </svg>
              </button>
            </div>
            <button class="ts-done-btn" @click="saveAndClose">完成</button>
          </div>

          <!-- 套用範圍 -->
          <div v-if="isGlobalOnly" class="ts-scope">
            <p class="ts-scope-hint">會套用到所有使用全域外觀的聊天；整體配色和全局美化共用</p>
          </div>
          <div v-else-if="layoutMode !== 'compact'" class="ts-scope">
            <div class="ts-scope-row">
              <span class="ts-scope-label">這個聊天使用</span>
              <div class="ts-seg" role="radiogroup" aria-label="這個聊天使用的外觀">
                <button
                  role="radio"
                  :aria-checked="!useCustomAppearance"
                  :class="{ active: !useCustomAppearance }"
                  @click="setScope(false)"
                >
                  全域外觀
                </button>
                <button
                  role="radio"
                  :aria-checked="useCustomAppearance"
                  :class="{ active: useCustomAppearance }"
                  @click="setScope(true)"
                >
                  這個聊天專屬
                </button>
              </div>
            </div>
            <p class="ts-scope-hint">{{ scopeHint }}</p>
          </div>

          <div class="ts-body">
            <!-- 固定預覽：不隨設定捲走；點裡面的東西會跳到對應設定卡 -->
            <div class="ts-preview-pane">
              <ChatAppearancePreview
                v-if="layoutMode === 'wide'"
                :state="previewState"
                :focus="previewFocusElement"
                :layout="themeStore.chatMessageLayout"
                @select="onPreviewSelect"
              />
              <button
                v-else-if="layoutMode === 'phone' && previewCollapsed"
                class="ts-preview-collapsed"
                @click="previewCollapsed = false"
              >
                顯示預覽
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
              </button>
              <div v-else ref="previewBoxRef" class="ts-preview-box" :style="{ height: `${previewBoxHeight}px` }">
                <div ref="previewInnerRef" class="ts-preview-inner" :style="previewInnerStyle">
                  <ChatAppearancePreview
                    compact
                    :scene="previewScene"
                    :state="previewState"
                    :focus="previewFocusElement"
                    :layout="themeStore.chatMessageLayout"
                    @select="onPreviewSelect"
                  />
                </div>
                <button
                  class="ts-preview-toggle"
                  :aria-label="
                    layoutMode === 'compact' ? (previewFull ? '只看正在調的部分' : '展開完整預覽') : '收起預覽'
                  "
                  @click="togglePreviewSize"
                >
                  <svg v-if="layoutMode === 'compact' && !previewFull" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="m18 15-6-6-6 6" /></svg>
                  {{ layoutMode === "compact" ? (previewFull ? "精簡" : "完整") : "收起" }}
                </button>
              </div>
            </div>

            <div class="ts-settings-pane">
              <div class="tabs-container" @wheel.prevent="handleTabsWheel">
                <div class="soft-tabs" role="tablist" aria-label="設定分類">
                  <button
                    v-for="tab in visibleTabs"
                    :key="tab.id"
                    class="tab-item"
                    :class="{ active: activeTab === tab.id }"
                    role="tab"
                    :aria-selected="activeTab === tab.id"
                    @click="selectTab(tab.id)"
                  >
                    {{ tab.label }}
                  </button>
                </div>
              </div>

              <div ref="contentRef" class="modal-content ts-content" @scroll.passive="syncActiveSectionFromScroll">
                <p v-if="settingsStore.nightMode && activeTab !== 'decorations'" class="night-hint">
                  🌙 夜間模式中，聊天頁的顏色與背景會改用夜間配色；字體、形狀、透明度等設定照常套用。
                </p>

                <!-- ===== 整體 ===== -->
                <section
                  v-if="showSection('theme')"
                  class="settings-card"
                  :class="{ active: activeSection === 'theme' }"
                  data-section="theme"
                  @pointerdown="activateSection('theme')"
                >
                  <div class="card-head">
                    <h3 class="section-title">主題配色</h3>
                    <span v-if="activeSection === 'theme'" class="card-badge">預覽中</span>
                  </div>
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

                  <h4 class="card-subtitle">自訂主題色</h4>
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
                </section>

                <template v-for="group in PALETTE_GROUPS" :key="group.id">
                  <section
                    v-if="showSection(group.id)"
                    class="settings-card"
                    :class="{ active: activeSection === group.id }"
                    :data-section="group.id"
                    @pointerdown="activateSection(group.id)"
                  >
                    <div class="card-head">
                      <h3 class="section-title">{{ group.title }}</h3>
                      <span v-if="activeSection === group.id" class="card-badge">預覽中</span>
                    </div>
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
                  </section>
                </template>

                <!-- ===== 訊息 ===== -->
                <section
                  v-if="showSection('userBubble')"
                  class="settings-card"
                  :class="{ active: activeSection === 'userBubble' }"
                  data-section="userBubble"
                  @pointerdown="activateSection('userBubble')"
                >
                  <div class="card-head">
                    <h3 class="section-title">我的氣泡</h3>
                    <span v-if="activeSection === 'userBubble'" class="card-badge">預覽中</span>
                  </div>
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
                </section>

                <section
                  v-if="showSection('aiBubble')"
                  class="settings-card"
                  :class="{ active: activeSection === 'aiBubble' }"
                  data-section="aiBubble"
                  @pointerdown="activateSection('aiBubble')"
                >
                  <div class="card-head">
                    <h3 class="section-title">AI 氣泡</h3>
                    <span v-if="activeSection === 'aiBubble'" class="card-badge">預覽中</span>
                  </div>
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
                </section>

                <section
                  v-if="showSection('thought')"
                  class="settings-card"
                  :class="{ active: activeSection === 'thought' }"
                  data-section="thought"
                  @pointerdown="activateSection('thought')"
                >
                  <div class="card-head">
                    <h3 class="section-title">想法氣泡</h3>
                    <span v-if="activeSection === 'thought'" class="card-badge">預覽中</span>
                  </div>
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
                </section>

                <section
                  v-if="showSection('bubbleShape')"
                  class="settings-card"
                  :class="{ active: activeSection === 'bubbleShape' }"
                  data-section="bubbleShape"
                  @pointerdown="activateSection('bubbleShape')"
                >
                  <div class="card-head">
                    <h3 class="section-title">形狀與排版</h3>
                    <span v-if="activeSection === 'bubbleShape'" class="card-badge">預覽中</span>
                  </div>
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
                  <div class="slider-control">
                    <span class="slider-label">訊息排版</span>
                    <div class="chip-row">
                      <button
                        v-for="layout in MESSAGE_LAYOUTS"
                        :key="layout.id"
                        class="chip"
                        :class="{ active: themeStore.chatMessageLayout === layout.id }"
                        :aria-pressed="themeStore.chatMessageLayout === layout.id"
                        @click="themeStore.setChatMessageLayout(layout.id)"
                      >
                        {{ layout.name }}
                      </button>
                    </div>
                  </div>
                  <p class="section-hint bars-hint">
                    {{
                      themeStore.chatMessageLayout === "classic"
                        ? "經典：每則訊息都有頭像、名字和時間。"
                        : "成組：同一人連續的訊息合成一組，時間改為置中分隔，每組最後一則旁邊標時間。"
                    }}
                    訊息排版所有聊天共用，點了立即生效。
                  </p>
                </section>

                <section
                  v-if="showSection('bubbleTexture')"
                  class="settings-card"
                  :class="{ active: activeSection === 'bubbleTexture' }"
                  data-section="bubbleTexture"
                  @pointerdown="activateSection('bubbleTexture')"
                >
                  <div class="card-head">
                    <h3 class="section-title">質感 <small class="section-note">AI 與我的氣泡共用</small></h3>
                    <span v-if="activeSection === 'bubbleTexture'" class="card-badge">預覽中</span>
                  </div>
                  <BubbleEffectsFields v-model="tempBubbleEffects" :fallback-border-color="tempColors.border" />
                </section>

                <!-- ===== 頭像 ===== -->
                <section
                  v-if="showSection('avatar')"
                  class="settings-card"
                  :class="{ active: activeSection === 'avatar' }"
                  data-section="avatar"
                  @pointerdown="activateSection('avatar')"
                >
                  <div class="card-head">
                    <h3 class="section-title">頭像形狀</h3>
                    <span v-if="activeSection === 'avatar'" class="card-badge">預覽中</span>
                  </div>
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

                  <h4 class="card-subtitle">頭像大小</h4>
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

                  <h4 class="card-subtitle">頭像邊框</h4>
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
                </section>

                <!-- ===== 背景 ===== -->
                <section
                  v-if="showSection('wallpaper')"
                  class="settings-card"
                  :class="{ active: activeSection === 'wallpaper' }"
                  data-section="wallpaper"
                  @pointerdown="activateSection('wallpaper')"
                >
                  <div class="card-head">
                    <h3 class="section-title">聊天背景</h3>
                    <span v-if="activeSection === 'wallpaper'" class="card-badge">預覽中</span>
                  </div>
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

                  <div v-if="usesImageWallpaper" class="slider-control">
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
                </section>

                <template v-for="bar in BARS" :key="bar.id">
                  <section
                    v-if="showSection(bar.id)"
                    class="settings-card"
                    :class="{ active: activeSection === bar.id }"
                    :data-section="bar.id"
                    @pointerdown="activateSection(bar.id)"
                  >
                    <div class="card-head">
                      <h3 class="section-title">{{ bar.name }}</h3>
                      <span v-if="activeSection === bar.id" class="card-badge">預覽中</span>
                    </div>
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
                  </section>
                </template>
                <p v-if="activeTab === 'wallpaper'" class="section-hint bars-hint">
                  頂欄與輸入欄共用同一個背景色。不透明度調低後，才看得到後面的背景與毛玻璃效果。
                </p>

                <!-- ===== 文字 ===== -->
                <section
                  v-if="showSection('fontBasics')"
                  class="settings-card"
                  :class="{ active: activeSection === 'fontBasics' }"
                  data-section="fontBasics"
                  @pointerdown="activateSection('fontBasics')"
                >
                  <div class="card-head">
                    <h3 class="section-title">字體大小</h3>
                    <span v-if="activeSection === 'fontBasics'" class="card-badge">預覽中</span>
                  </div>
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

                  <h4 class="card-subtitle">字體樣式</h4>
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
                </section>

                <section
                  v-if="showSection('fontSpacing')"
                  class="settings-card"
                  :class="{ active: activeSection === 'fontSpacing' }"
                  data-section="fontSpacing"
                  @pointerdown="activateSection('fontSpacing')"
                >
                  <div class="card-head">
                    <h3 class="section-title">行高與字距</h3>
                    <span v-if="activeSection === 'fontSpacing'" class="card-badge">預覽中</span>
                  </div>
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
                </section>

                <section
                  v-if="showSection('markdown')"
                  class="settings-card"
                  :class="{ active: activeSection === 'markdown' }"
                  data-section="markdown"
                  @pointerdown="activateSection('markdown')"
                >
                  <div class="card-head">
                    <h3 class="section-title">Markdown 樣式顏色</h3>
                  </div>
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
                  <!-- 上方預覽不畫 Markdown，這裡保留專用的文字預覽 -->
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
                </section>

                <!-- ===== 裝飾 ===== -->
                <template v-if="activeTab === 'decorations' && chatId">
                  <section
                    v-for="target in FRAME_TARGETS"
                    :key="target.key"
                    class="settings-card"
                    :class="{ active: activeSection === target.section }"
                    :data-section="target.section"
                    @pointerdown="activateSection(target.section)"
                  >
                    <div class="card-head">
                      <h3 class="section-title">{{ target.title }}</h3>
                    </div>
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
                  </section>

                  <section
                    class="settings-card"
                    :class="{ active: activeSection === 'bubbleDeco' }"
                    data-section="bubbleDeco"
                    @pointerdown="activateSection('bubbleDeco')"
                  >
                    <div class="card-head">
                      <h3 class="section-title">聊天氣泡</h3>
                    </div>
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
                  </section>
                </template>

                <!-- 恢復預設：放在最底下，不跟「完成」擠在一起 -->
                <button v-if="activeTab !== 'decorations'" class="ts-reset-btn" @click="resetToDefault">
                  {{ resetLabel }}
                </button>
              </div>
            </div>
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
  display: flex;
  flex-direction: column;

  @media (max-height: 600px), (max-width: 520px) {
    height: calc(100dvh - 24px);
    max-height: calc(100dvh - 24px);
    border-radius: 22px;
  }

  @media (max-width: 520px) {
    max-width: calc(100vw - 24px);
  }

  // 寬螢幕／橫拿手機：預覽放左欄，視窗加寬
  &.layout-wide {
    max-width: min(920px, calc(100vw - 48px));
    max-height: min(calc(100dvh - 24px), 820px);
  }
}

// ===== 頂列：取消／標題／完成 =====
.ts-topbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 56px;
  box-sizing: border-box;
  padding: 6px 12px 6px 4px;
  border-bottom: 1px solid var(--color-border);
}

.ts-topbar-btn {
  height: 44px;
  padding: 0 12px;
  border: none;
  border-radius: 12px;
  background: none;
  font-size: 15px;
  color: var(--color-text-secondary);
  cursor: pointer;

  &:hover {
    color: var(--color-text);
  }
}

.ts-topbar-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.ts-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text);
}

.ts-done-btn {
  height: 36px;
  padding: 0 18px;
  border: none;
  border-radius: 18px;
  background: var(--color-primary);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 30%, transparent);

  &:active {
    transform: scale(0.97);
  }
}

// 小螢幕：套用範圍收成標題下的小標籤，點一下切換
.ts-scope-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 22px;
  padding: 0 8px 0 10px;
  border: none;
  border-radius: 999px;
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;

  svg {
    width: 12px;
    height: 12px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

// ===== 套用範圍 =====
.ts-scope {
  flex-shrink: 0;
  padding: 10px 16px 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ts-scope-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ts-scope-label {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.ts-seg {
  flex: 1;
  max-width: 320px;
  display: flex;
  padding: 3px;
  border-radius: 999px;
  background: var(--color-background);

  button {
    flex: 1;
    height: 32px;
    border: none;
    border-radius: 999px;
    background: transparent;
    font-size: 13px;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition:
      background 0.18s ease,
      color 0.18s ease;

    &.active {
      background: var(--color-surface);
      color: var(--color-primary);
      font-weight: 700;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
    }
  }
}

.ts-scope-hint {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--color-text-muted);
}

// ===== 主體：預覽＋設定 =====
.ts-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ts-preview-pane {
  flex-shrink: 0;
  padding: 10px 16px 0;
}

// 高度固定的預覽框；內容以原寸排版後整體縮放（previewInnerStyle）
.ts-preview-box {
  position: relative;
  overflow: hidden;
  border-radius: 18px;
}

.ts-preview-inner {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: top center;
}

.ts-preview-toggle {
  position: absolute;
  right: 8px;
  bottom: 8px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-surface) 92%, transparent);
  color: var(--color-text-secondary);
  font-size: 11.5px;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);

  svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

.ts-preview-collapsed {
  width: 100%;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px dashed var(--color-border);
  border-radius: 12px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12.5px;
  cursor: pointer;

  svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

.ts-settings-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

// 提高權重，蓋過 soft 主題 .soft-modal .modal-content 的內距
.theme-settings-modal .ts-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

// 寬螢幕：預覽左欄、設定右欄
.layout-wide {
  .ts-body {
    flex-direction: row;
  }

  .ts-preview-pane {
    width: 360px;
    box-sizing: border-box;
    padding: 16px;
    border-right: 1px solid var(--color-border);
    overflow-y: auto;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  .ts-scope {
    padding: 12px 20px 0;
  }
}

// ===== 設定卡：目前預覽對應的那張會亮起 =====
.settings-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
  padding: 14px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--color-background) 55%, var(--color-surface));
  box-shadow: inset 0 0 0 1.5px transparent;
  transition:
    background 0.2s ease,
    box-shadow 0.2s ease;

  &.active {
    background: color-mix(in srgb, var(--color-primary) 7%, var(--color-surface));
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--color-primary) 45%, transparent);
  }
}

.card-head {
  display: flex;
  align-items: center;
  gap: 8px;

  .section-title {
    padding-top: 0;
  }
}

.card-badge {
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--color-primary);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.6;
}

.card-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

// 恢復預設：放在設定最底下，不和「完成」擠在一起
.ts-reset-btn {
  align-self: center;
  flex-shrink: 0;
  margin-top: 4px;
  height: 40px;
  padding: 0 16px;
  border: none;
  background: none;
  font-size: 13px;
  color: var(--color-text-muted);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;

  &:hover {
    color: var(--color-error);
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
  flex-shrink: 0;
  margin: 0;
  padding: 10px 12px;
  border-radius: 14px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-secondary);
  background: var(--color-background);
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
    background: linear-gradient(135deg, #fff8f0 0%, #f8fafc 20%, #fafafa 40%, #fef3e2 60%, #1f1a17 80%, #131110 100%);
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

// ===== 夜晚模式覆蓋 =====
// 關閉狀態的開關底色是半透明黑，疊在夜晚深色面板上幾乎看不見
body.is-night-mode {
  input:not(:checked) + .switch-track {
    background: rgba(255, 255, 255, 0.18);
  }
}
</style>
