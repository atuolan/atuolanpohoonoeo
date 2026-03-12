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
import type { AvatarStyle, BubbleStyle, WallpaperStyle } from "@/stores";
import { useThemeStore } from "@/stores";
import { useGameEconomyStore } from "@/stores/gameEconomy";
import type { ChatAppearance } from "@/types/chat";
import { computed, ref, watch } from "vue";

// Props
interface Props {
  visible: boolean;
  /** 聊天專屬外觀（傳入時為聊天專屬模式） */
  chatAppearance?: ChatAppearance;
  /** 聊天 ID（用於獲取遊戲裝飾品） */
  chatId?: string;
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  (e: "close"): void;
  (e: "saveChatAppearance", appearance: ChatAppearance): void;
}>();

// Store
const themeStore = useThemeStore();
const gameEconomyStore = useGameEconomyStore();

// 全局錢包 ID
const GLOBAL_WALLET_ID = "global";

// 是否為聊天專屬模式（只有當 chatAppearance 是有效對象時才為 true）
const isChatMode = computed(() => {
  // 檢查 chatAppearance 是否存在（包括空對象 { useCustom: false }）
  // undefined 或 null 表示非聊天模式
  if (props.chatAppearance === undefined || props.chatAppearance === null) {
    return false;
  }
  // 只要傳入了 chatAppearance 對象（即使是 { useCustom: false }），就是聊天模式
  return true;
});

// 是否使用聊天專屬外觀
const useCustomAppearance = ref(false);

// 當前分頁
const activeTab = ref<
  "colors" | "avatar" | "bubble" | "wallpaper" | "font" | "decorations"
>("colors");

// 預設主題列表
const presetList = computed(() => [
  { id: "soft-pink", name: "粉紅", color: "#FF85A2" },
  { id: "soft-purple", name: "紫羅蘭", color: "#B388FF" },
  { id: "soft-mint", name: "薄荷", color: "#5DD3B3" },
  { id: "soft-mint-green", name: "薄荷綠", color: "#7DD3A8" },
  { id: "soft-peach", name: "蜜桃", color: "#FFAB91" },
  { id: "soft-blue", name: "天藍", color: "#64B5F6" },
]);

// 頭像形狀選項
const avatarShapes = [
  { id: "circle", name: "圓形", icon: "○" },
  { id: "rounded", name: "圓角", icon: "▢" },
  { id: "square", name: "方形", icon: "□" },
];

// 頭像大小選項
const avatarSizes = [
  { id: "small", name: "小", size: "36px" },
  { id: "medium", name: "中", size: "48px" },
  { id: "large", name: "大", size: "64px" },
];

// 桌布預設
const wallpaperPresets = [
  { id: "time-theme", name: "跟隨時間", type: "time-theme", value: "" },
  { id: "none", name: "無", type: "color", value: "var(--color-background)" },
  {
    id: "gradient1",
    name: "夢幻粉",
    type: "gradient",
    value: "linear-gradient(135deg, #FFE6F0 0%, #E6F0FF 100%)",
  },
  {
    id: "gradient2",
    name: "薰衣草",
    type: "gradient",
    value: "linear-gradient(135deg, #E6E6FA 0%, #FFF0F5 100%)",
  },
  {
    id: "gradient3",
    name: "清新綠",
    type: "gradient",
    value: "linear-gradient(135deg, #E8F5E9 0%, #E3F2FD 100%)",
  },
  {
    id: "gradient4",
    name: "暖陽橙",
    type: "gradient",
    value: "linear-gradient(135deg, #FFF3E0 0%, #FFECB3 100%)",
  },
];

// ===== 遊戲裝飾品 =====

// 解析商品 ID（支援變體格式 baseId_variantId）
function resolveShopItem(itemId: string) {
  // 先直接查找
  const direct = getShopItemById(itemId);
  if (direct) return { item: direct, variantName: null as string | null };

  // 嘗試解析變體 ID
  const lastUnderscore = itemId.lastIndexOf("_");
  if (lastUnderscore === -1) return null;

  const baseId = itemId.substring(0, lastUnderscore);
  const variantId = itemId.substring(lastUnderscore + 1);
  const baseItem = getShopItemById(baseId);
  if (!baseItem?.variants) return null;

  const variant = baseItem.variants.find((v) => v.variantId === variantId);
  if (!variant) return null;

  return { item: baseItem, variantName: variant.name };
}

// 已購買的頭像框
const ownedFrames = computed(() => {
  const decorations = gameEconomyStore.getDecorations(GLOBAL_WALLET_ID);
  return (decorations?.ownedFrames || [])
    .map((frameId) => {
      const resolved = resolveShopItem(frameId);
      if (!resolved) return null;
      const { item, variantName } = resolved;
      return {
        id: frameId,
        name: variantName ? `${item.name} - ${variantName}` : item.name,
        description: item.description,
        rarity: item.rarity,
      };
    })
    .filter(Boolean) as {
    id: string;
    name: string;
    description: string;
    rarity: string;
  }[];
});

// 已購買的聊天氣泡
const ownedBubbles = computed(() => {
  const decorations = gameEconomyStore.getDecorations(GLOBAL_WALLET_ID);
  return (decorations?.ownedBubbles || [])
    .map((bubbleId) => {
      const resolved = resolveShopItem(bubbleId);
      if (!resolved) return null;
      const { item, variantName } = resolved;
      return {
        id: bubbleId,
        name: variantName ? `${item.name} - ${variantName}` : item.name,
        description: item.description,
        rarity: item.rarity,
      };
    })
    .filter(Boolean) as {
    id: string;
    name: string;
    description: string;
    rarity: string;
  }[];
});

// 當前裝備的頭像框
const equippedFrameId = computed(() => {
  return (
    gameEconomyStore.getDecorations(GLOBAL_WALLET_ID)?.equippedFrameId ?? null
  );
});

// 當前裝備的聊天氣泡
const equippedBubbleId = computed(() => {
  return (
    gameEconomyStore.getDecorations(GLOBAL_WALLET_ID)?.equippedBubbleId ?? null
  );
});

// ===== 聊天專屬頭像框 =====
// 臨時頭像框設定（聊天專屬模式用）
const tempAvatarFrames = ref<{
  userFrameId: string | null;
  charFrameId: string | null;
}>({
  userFrameId: null,
  charFrameId: null,
});

// 設定用戶頭像框
function setUserFrame(frameId: string | null) {
  tempAvatarFrames.value.userFrameId = frameId;
  if (isChatMode.value) {
    useCustomAppearance.value = true;
  }
}

// 設定角色頭像框
function setCharFrame(frameId: string | null) {
  tempAvatarFrames.value.charFrameId = frameId;
  if (isChatMode.value) {
    useCustomAppearance.value = true;
  }
}

// 裝備頭像框（全局模式）
async function equipFrame(frameId: string | null) {
  gameEconomyStore.equipFrame(GLOBAL_WALLET_ID, frameId);
  await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
}

// 裝備聊天氣泡
async function equipBubble(bubbleId: string | null) {
  gameEconomyStore.equipBubble(GLOBAL_WALLET_ID, bubbleId);
  await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
}

// 臨時值（用於預覽）
const tempAvatarStyle = ref<AvatarStyle>({ ...themeStore.avatarStyle });
const tempBubbleStyle = ref<BubbleStyle>({ ...themeStore.bubbleStyle });
const tempWallpaperStyle = ref<WallpaperStyle>({
  ...themeStore.wallpaperStyle,
});
// 臨時字體樣式（聊天專屬模式用）
const tempFontStyle = ref<{
  size: "small" | "medium" | "large";
  family: "system" | "rounded" | "serif" | "mono";
  lineHeight: number;
  letterSpacing: number;
  markdownColors: {
    text: string;
    italic: string;
    bold: string;
    underline: string;
    strikethrough: string;
    highlight: string;
    quote: string;
    code: string;
    heading: string;
  };
}>({
  size: "medium",
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
});
// 臨時顏色預設（聊天專屬模式用）
const tempColorPreset = ref<string>(themeStore.currentPreset);
const tempColors = ref({
  primary: themeStore.colors.primary,
  primaryLight: themeStore.colors.primaryLight,
});

// 字體大小選項（改為滑块范围）
const fontSizeMin = 12;
const fontSizeMax = 20;
const fontSizeDefault = 15;

// 臨時字體大小（用於滑块）
const tempFontSizeValue = ref(fontSizeDefault);

// 字體樣式選項
const fontFamilies = [
  { id: "system", name: "系統預設", preview: "Aa" },
  { id: "rounded", name: "圓體", preview: "Aa" },
  { id: "serif", name: "襯線體", preview: "Aa" },
  { id: "mono", name: "等寬字體", preview: "Aa" },
];

// 當前顯示的顏色（聊天專屬模式用臨時值，全局模式用 themeStore）
const displayColors = computed(() => {
  if (isChatMode.value) {
    return tempColors.value;
  }
  return themeStore.colors;
});

// 當前選中的預設
const currentPreset = computed(() => {
  if (isChatMode.value) {
    return tempColorPreset.value;
  }
  return themeStore.currentPreset;
});

// 處理預設主題選擇
function selectPreset(presetId: string) {
  console.log(
    "[ThemeSettingsModal] selectPreset called:",
    presetId,
    "isChatMode:",
    isChatMode.value,
  );
  if (isChatMode.value) {
    // 聊天專屬模式：只更新臨時值，自動啟用專屬外觀
    console.log("[ThemeSettingsModal] Chat mode - updating temp values only");
    useCustomAppearance.value = true;
    tempColorPreset.value = presetId;
    import("@/stores/theme").then(({ themePresets }) => {
      const colors = themePresets[presetId];
      if (colors) {
        tempColors.value = {
          primary: colors.primary,
          primaryLight: colors.primaryLight,
        };
        // 同步更新氣泡顏色
        tempBubbleStyle.value.userBgColor = colors.primary;
        tempBubbleStyle.value.userBgGradient = `linear-gradient(135deg, ${colors.primary}, ${colors.primaryLight})`;
      }
    });
  } else {
    // 全局模式：更新 themeStore
    console.log("[ThemeSettingsModal] Global mode - updating themeStore");
    themeStore.setPreset(presetId);
  }
}

// 處理頭像形狀變更
function setAvatarShape(shape: "circle" | "square" | "rounded") {
  tempAvatarStyle.value.shape = shape;
  if (isChatMode.value) {
    useCustomAppearance.value = true;
  } else {
    themeStore.updateAvatarStyle({ shape });
  }
}

// 處理頭像大小變更
function setAvatarSize(size: "small" | "medium" | "large") {
  tempAvatarStyle.value.size = size;
  if (isChatMode.value) {
    useCustomAppearance.value = true;
  } else {
    themeStore.updateAvatarStyle({ size });
  }
}

// 處理頭像邊框寬度變更
function setAvatarBorderWidth(width: number) {
  tempAvatarStyle.value.borderWidth = width;
  if (isChatMode.value) {
    useCustomAppearance.value = true;
  } else {
    themeStore.updateAvatarStyle({ borderWidth: width });
  }
}

// 處理氣泡顏色變更
function setBubbleColor(
  key: "aiBgColor" | "aiTextColor" | "userBgColor" | "userTextColor",
  value: string,
) {
  tempBubbleStyle.value[key] = value;
  // 用戶背景色變更時同步更新漸層
  if (key === "userBgColor") {
    tempBubbleStyle.value.userBgGradient = "";
  }
  if (isChatMode.value) {
    useCustomAppearance.value = true;
  } else {
    themeStore.updateBubbleStyle({ [key]: value });
  }
}

// 處理氣泡圓角變更
function setBubbleRadius(radius: number) {
  tempBubbleStyle.value.borderRadius = radius;
  if (isChatMode.value) {
    useCustomAppearance.value = true;
  } else {
    themeStore.updateBubbleStyle({ borderRadius: radius });
  }
}

// 處理氣泡最大寬度變更
function setBubbleMaxWidth(width: number) {
  tempBubbleStyle.value.maxWidth = width;
  if (isChatMode.value) {
    useCustomAppearance.value = true;
  } else {
    themeStore.updateBubbleStyle({ maxWidth: width });
  }
}

// 處理桌布選擇
function selectWallpaper(preset: (typeof wallpaperPresets)[0]) {
  tempWallpaperStyle.value.type = preset.type as WallpaperStyle["type"];
  tempWallpaperStyle.value.value = preset.value;
  if (isChatMode.value) {
    useCustomAppearance.value = true;
  } else {
    themeStore.updateWallpaperStyle({
      type: preset.type as WallpaperStyle["type"],
      value: preset.value,
    });
  }
}

// 處理桌布模糊度變更
function setWallpaperBlur(blur: number) {
  tempWallpaperStyle.value.blur = blur;
  if (isChatMode.value) {
    useCustomAppearance.value = true;
  } else {
    themeStore.updateWallpaperStyle({ blur });
  }
}

// 處理桌布透明度變更
function setWallpaperOpacity(opacity: number) {
  tempWallpaperStyle.value.opacity = opacity;
  if (isChatMode.value) {
    useCustomAppearance.value = true;
  } else {
    themeStore.updateWallpaperStyle({ opacity });
  }
}

// 處理桌布顯示方式變更
function setWallpaperFit(fit: "cover" | "contain" | "fill" | "repeat") {
  tempWallpaperStyle.value.fit = fit;
  if (isChatMode.value) {
    useCustomAppearance.value = true;
  } else {
    themeStore.updateWallpaperStyle({ fit });
  }
}

// 字體大小 px → 名稱映射（用於向後兼容）
const fontSizeToName: Record<number, "small" | "medium" | "large"> = {
  14: "small",
  15: "medium",
  17: "large",
};

// 字體大小名稱 → px 映射
const fontNameToSize: Record<string, number> = {
  small: 14,
  medium: 15,
  large: 17,
};

// 處理字體大小變更（滑块）
function setFontSizeValue(size: number) {
  tempFontSizeValue.value = size;
  // 轉換為名稱（向後兼容）
  const sizeName = fontSizeToName[size] || "medium";
  tempFontStyle.value.size = sizeName;
  if (isChatMode.value) {
    useCustomAppearance.value = true;
  }
}

// 字體樣式名稱 → 全局 fontFamily 映射
const fontFamilyMap: Record<string, string> = {
  system: "",
  rounded: "Nunito",
  serif: "Georgia",
  mono: "monospace",
};

// 處理字體樣式變更
function setFontFamily(family: "system" | "rounded" | "serif" | "mono") {
  tempFontStyle.value.family = family;
  if (isChatMode.value) {
    useCustomAppearance.value = true;
  }
}

// 處理圖片上傳
const showCropper = ref(false);
const cropperImageSrc = ref("");

function handleImageUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target?.result as string;
    cropperImageSrc.value = dataUrl;
    showCropper.value = true;
  };
  reader.readAsDataURL(file);
  // 重置 input 以允許重複上傳同一檔案
  input.value = "";
}

function onCropComplete(dataUrl: string) {
  showCropper.value = false;
  tempWallpaperStyle.value.type = "image";
  tempWallpaperStyle.value.value = dataUrl;
  if (isChatMode.value) {
    useCustomAppearance.value = true;
  } else {
    themeStore.updateWallpaperStyle({
      type: "image",
      value: dataUrl,
    });
  }
}

function onCropClose() {
  showCropper.value = false;
  cropperImageSrc.value = "";
}

// 處理分頁標籤滾輪事件（將垂直滾動轉換為水平滾動）
function handleTabsWheel(event: WheelEvent) {
  const container = event.currentTarget as HTMLElement;
  if (container) {
    container.scrollLeft += event.deltaY;
  }
}

// 重置為預設
function resetToDefault() {
  if (isChatMode.value) {
    // 聊天專屬模式：重置為使用全局設定
    useCustomAppearance.value = false;
    tempAvatarStyle.value = { ...themeStore.avatarStyle };
    tempBubbleStyle.value = { ...themeStore.bubbleStyle };
    tempWallpaperStyle.value = { ...themeStore.wallpaperStyle };
    tempFontStyle.value = {
      size: "medium",
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
  } else {
    if (confirm("確定要重置所有設定嗎？")) {
      themeStore.resetToDefault();
      tempAvatarStyle.value = { ...themeStore.avatarStyle };
      tempBubbleStyle.value = { ...themeStore.bubbleStyle };
      tempWallpaperStyle.value = { ...themeStore.wallpaperStyle };
    }
  }
}

// 關閉彈窗
function handleClose() {
  if (isChatMode.value) {
    // 聊天專屬模式：保存外觀設定
    const appearance: ChatAppearance = {
      useCustom: useCustomAppearance.value,
      colors: useCustomAppearance.value
        ? {
            primary: tempColors.value.primary,
            primaryLight: tempColors.value.primaryLight,
          }
        : undefined,
      avatar: useCustomAppearance.value
        ? { ...tempAvatarStyle.value }
        : undefined,
      // 頭像框設定（即使 useCustom 為 false 也保存，因為頭像框是獨立設定）
      avatarFrames: {
        userFrameId: tempAvatarFrames.value.userFrameId,
        charFrameId: tempAvatarFrames.value.charFrameId,
      },
      bubble: useCustomAppearance.value
        ? { ...tempBubbleStyle.value }
        : undefined,
      wallpaper: useCustomAppearance.value
        ? { ...tempWallpaperStyle.value }
        : undefined,
      font: useCustomAppearance.value 
        ? { 
            ...tempFontStyle.value,
            // 保存實際的 px 值而不是名稱
            size: `${tempFontSizeValue.value}px` as any
          } 
        : undefined,
    };
    emit("saveChatAppearance", appearance);
  }
  emit("close");
}

// 監聽 visible 變化，初始化聊天專屬外觀
watch(
  () => props.visible,
  async (newVal) => {
    if (newVal && isChatMode.value) {
      // 載入聊天專屬外觀
      useCustomAppearance.value = props.chatAppearance?.useCustom ?? false;

      // 先設定預設值
      const defaultColors = {
        primary: themeStore.colors.primary,
        primaryLight: themeStore.colors.primaryLight,
      };
      const defaultAvatar = { ...themeStore.avatarStyle };
      const defaultBubble = { ...themeStore.bubbleStyle };
      const defaultWallpaper = { ...themeStore.wallpaperStyle };
      const defaultFont = {
        size: "medium" as const,
        family: "system" as const,
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

      if (props.chatAppearance?.useCustom) {
        // 載入聊天專屬設定，沒有的用全局預設
        tempColors.value = props.chatAppearance.colors
          ? { ...props.chatAppearance.colors }
          : defaultColors;
        tempAvatarStyle.value = props.chatAppearance.avatar
          ? { ...props.chatAppearance.avatar }
          : defaultAvatar;
        tempBubbleStyle.value = props.chatAppearance.bubble
          ? { ...props.chatAppearance.bubble }
          : defaultBubble;
        tempWallpaperStyle.value = props.chatAppearance.wallpaper
          ? { ...props.chatAppearance.wallpaper }
          : defaultWallpaper;
        tempFontStyle.value = props.chatAppearance.font
          ? {
              ...defaultFont,
              ...props.chatAppearance.font,
              markdownColors: {
                ...defaultFont.markdownColors,
                ...props.chatAppearance.font.markdownColors,
              },
            }
          : defaultFont;
        
        // 初始化字體大小滑块值（支持新舊格式）
        if (props.chatAppearance.font?.size) {
          const sizeValue = props.chatAppearance.font.size;
          if (typeof sizeValue === 'string' && sizeValue.endsWith('px')) {
            // 新格式：直接解析 px 值
            tempFontSizeValue.value = parseInt(sizeValue);
          } else {
            // 舊格式：從名稱轉換
            tempFontSizeValue.value = fontNameToSize[sizeValue as string] || fontSizeDefault;
          }
        } else {
          tempFontSizeValue.value = fontSizeDefault;
        }
      } else {
        // 使用全局設定作為預設
        tempColors.value = defaultColors;
        tempAvatarStyle.value = defaultAvatar;
        tempBubbleStyle.value = defaultBubble;
        tempWallpaperStyle.value = defaultWallpaper;
        tempFontStyle.value = defaultFont;
        tempFontSizeValue.value = fontSizeDefault;
      }

      // 載入頭像框設定（獨立於 useCustom）
      tempAvatarFrames.value = {
        userFrameId: props.chatAppearance?.avatarFrames?.userFrameId ?? null,
        charFrameId: props.chatAppearance?.avatarFrames?.charFrameId ?? null,
      };


      // 載入遊戲經濟狀態（用於裝飾品）
      await gameEconomyStore.loadState(GLOBAL_WALLET_ID);
    } else if (newVal && !isChatMode.value) {
      // 全局模式不使用此面板的字體設置
      tempFontStyle.value.size = "medium";
      tempFontStyle.value.family = "system";
      tempFontStyle.value.lineHeight = 1.6;
      tempFontStyle.value.letterSpacing = 0;
      tempFontSizeValue.value = fontSizeDefault;
    }
  },
);
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="soft-modal-overlay" @click.self="handleClose">
        <div class="soft-modal theme-settings-modal">
          <!-- 標題 -->
          <div class="modal-header">
            <h2 class="modal-title">
              {{ isChatMode ? "聊天外觀設定" : "外觀設定" }}
            </h2>
            <button class="modal-close" @click="handleClose">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                />
              </svg>
            </button>
          </div>

          <!-- 聊天專屬模式開關 -->
          <div v-if="isChatMode" class="chat-mode-toggle">
            <label class="toggle-label">
              <input type="checkbox" v-model="useCustomAppearance" />
              <span class="toggle-text">使用此聊天專屬外觀</span>
            </label>
            <span class="toggle-hint">關閉則使用全局設定</span>
          </div>

          <!-- 分頁標籤 -->
          <div class="tabs-container" @wheel.prevent="handleTabsWheel">
            <div class="soft-tabs">
              <button
                class="tab-item"
                :class="{ active: activeTab === 'colors' }"
                @click="activeTab = 'colors'"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8z"
                  />
                </svg>
                顏色
              </button>
              <button
                class="tab-item"
                :class="{ active: activeTab === 'avatar' }"
                @click="activeTab = 'avatar'"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                  />
                </svg>
                頭像
              </button>
              <button
                class="tab-item"
                :class="{ active: activeTab === 'bubble' }"
                @click="activeTab = 'bubble'"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
                  />
                </svg>
                氣泡
              </button>
              <button
                class="tab-item"
                :class="{ active: activeTab === 'wallpaper' }"
                @click="activeTab = 'wallpaper'"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM5 15h14v3H5z"
                  />
                </svg>
                桌布
              </button>
              <button
                class="tab-item"
                :class="{ active: activeTab === 'font' }"
                @click="activeTab = 'font'"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M9.93 13.5h4.14L12 7.98 9.93 13.5zM20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-4.05 16.5l-1.14-3H9.17l-1.12 3H5.96l5.11-13h1.86l5.11 13h-2.09z"
                  />
                </svg>
                字體
              </button>
              <button
                v-if="isChatMode && props.chatId"
                class="tab-item"
                :class="{ active: activeTab === 'decorations' }"
                @click="activeTab = 'decorations'"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
                  />
                </svg>
                裝飾
              </button>
            </div>
          </div>

          <!-- 內容區 -->
          <div class="modal-content">
            <!-- 顏色設定 -->
            <div v-if="activeTab === 'colors'" class="settings-section">
              <h3 class="section-title">主題配色</h3>
              <div class="preset-grid">
                <button
                  v-for="preset in presetList"
                  :key="preset.id"
                  class="preset-item"
                  :class="{ active: currentPreset === preset.id }"
                  @click="selectPreset(preset.id)"
                >
                  <div
                    class="preset-color"
                    :style="{ background: preset.color }"
                  ></div>
                  <span class="preset-name">{{ preset.name }}</span>
                </button>
              </div>

              <div class="color-preview">
                <div class="preview-label">預覽效果</div>
                <div class="preview-card">
                  <div
                    class="preview-header"
                    :style="{ background: displayColors.primary }"
                  >
                    <span style="color: white">標題欄</span>
                  </div>
                  <div
                    class="preview-body"
                    :style="{ background: themeStore.colors.background }"
                  >
                    <div
                      class="preview-bubble ai"
                      :style="{ background: themeStore.colors.surface }"
                    >
                      AI 訊息
                    </div>
                    <div
                      class="preview-bubble user"
                      :style="{
                        background: `linear-gradient(135deg, ${displayColors.primary}, ${displayColors.primaryLight})`,
                        color: 'white',
                      }"
                    >
                      用戶訊息
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 頭像設定 -->
            <div v-if="activeTab === 'avatar'" class="settings-section">
              <h3 class="section-title">頭像形狀</h3>
              <div class="option-grid">
                <button
                  v-for="shape in avatarShapes"
                  :key="shape.id"
                  class="option-item"
                  :class="{ active: tempAvatarStyle.shape === shape.id }"
                  @click="setAvatarShape(shape.id as any)"
                >
                  <span class="option-icon">{{ shape.icon }}</span>
                  <span class="option-name">{{ shape.name }}</span>
                </button>
              </div>

              <h3 class="section-title">頭像大小</h3>
              <div class="option-grid">
                <button
                  v-for="size in avatarSizes"
                  :key="size.id"
                  class="option-item"
                  :class="{ active: tempAvatarStyle.size === size.id }"
                  @click="setAvatarSize(size.id as any)"
                >
                  <span class="option-name">{{ size.name }}</span>
                  <span class="option-hint">{{ size.size }}</span>
                </button>
              </div>

              <h3 class="section-title">邊框寬度</h3>
              <div class="slider-control">
                <input
                  type="range"
                  min="0"
                  max="4"
                  step="1"
                  :value="tempAvatarStyle.borderWidth"
                  @input="
                    setAvatarBorderWidth(
                      Number(($event.target as HTMLInputElement).value),
                    )
                  "
                />
                <span class="slider-value"
                  >{{ tempAvatarStyle.borderWidth }}px</span
                >
              </div>

              <div class="avatar-preview">
                <div class="preview-label">預覽效果</div>
                <div
                  class="preview-avatar"
                  :style="{
                    width:
                      tempAvatarStyle.size === 'small'
                        ? '36px'
                        : tempAvatarStyle.size === 'medium'
                          ? '48px'
                          : '64px',
                    height:
                      tempAvatarStyle.size === 'small'
                        ? '36px'
                        : tempAvatarStyle.size === 'medium'
                          ? '48px'
                          : '64px',
                    borderRadius:
                      tempAvatarStyle.shape === 'circle'
                        ? '50%'
                        : tempAvatarStyle.shape === 'rounded'
                          ? '16px'
                          : '8px',
                    border: `${tempAvatarStyle.borderWidth}px solid white`,
                    boxShadow: '0 4px 12px var(--color-shadow)',
                  }"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"
                    />
                  </svg>
                </div>
              </div>
            </div>

            <!-- 氣泡設定 -->
            <div v-if="activeTab === 'bubble'" class="settings-section">
              <h3 class="section-title">AI 氣泡顏色</h3>
              <div class="bubble-color-row">
                <div class="color-item">
                  <input
                    type="color"
                    :value="tempBubbleStyle.aiBgColor"
                    @input="
                      setBubbleColor(
                        'aiBgColor',
                        ($event.target as HTMLInputElement).value,
                      )
                    "
                  />
                  <span>背景</span>
                </div>
                <div class="color-item">
                  <input
                    type="color"
                    :value="tempBubbleStyle.aiTextColor"
                    @input="
                      setBubbleColor(
                        'aiTextColor',
                        ($event.target as HTMLInputElement).value,
                      )
                    "
                  />
                  <span>時間</span>
                </div>
              </div>

              <h3 class="section-title">用戶氣泡顏色</h3>
              <div class="bubble-color-row">
                <div class="color-item">
                  <input
                    type="color"
                    :value="tempBubbleStyle.userBgColor"
                    @input="
                      setBubbleColor(
                        'userBgColor',
                        ($event.target as HTMLInputElement).value,
                      )
                    "
                  />
                  <span>背景</span>
                </div>
                <div class="color-item">
                  <input
                    type="color"
                    :value="tempBubbleStyle.userTextColor"
                    @input="
                      setBubbleColor(
                        'userTextColor',
                        ($event.target as HTMLInputElement).value,
                      )
                    "
                  />
                  <span>時間</span>
                </div>
              </div>

              <h3 class="section-title">圓角大小</h3>
              <div class="slider-control">
                <input
                  type="range"
                  min="8"
                  max="32"
                  step="2"
                  :value="tempBubbleStyle.borderRadius"
                  @input="
                    setBubbleRadius(
                      Number(($event.target as HTMLInputElement).value),
                    )
                  "
                />
                <span class="slider-value"
                  >{{ tempBubbleStyle.borderRadius }}px</span
                >
              </div>

              <h3 class="section-title">最大寬度</h3>
              <div class="slider-control">
                <input
                  type="range"
                  min="50"
                  max="90"
                  step="5"
                  :value="tempBubbleStyle.maxWidth"
                  @input="
                    setBubbleMaxWidth(
                      Number(($event.target as HTMLInputElement).value),
                    )
                  "
                />
                <span class="slider-value"
                  >{{ tempBubbleStyle.maxWidth }}%</span
                >
              </div>

              <div class="bubble-preview">
                <div class="preview-label">預覽效果</div>
                <div class="preview-bubbles">
                  <div
                    class="preview-bubble ai"
                    :style="{
                      borderRadius: `${tempBubbleStyle.borderRadius}px`,
                      borderBottomLeftRadius: '6px',
                      maxWidth: `${tempBubbleStyle.maxWidth}%`,
                      background: tempBubbleStyle.aiBgColor,
                    }"
                  >
                    這是 AI 的訊息氣泡
                    <div class="preview-time" :style="{ color: tempBubbleStyle.aiTextColor }">12:00</div>
                  </div>
                  <div
                    class="preview-bubble user"
                    :style="{
                      borderRadius: `${tempBubbleStyle.borderRadius}px`,
                      borderBottomRightRadius: '6px',
                      maxWidth: `${tempBubbleStyle.maxWidth}%`,
                      background: tempBubbleStyle.userBgColor,
                      marginLeft: 'auto',
                    }"
                  >
                    這是用戶的訊息氣泡
                    <div class="preview-time" :style="{ color: tempBubbleStyle.userTextColor }">12:01</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 桌布設定 -->
            <div v-if="activeTab === 'wallpaper'" class="settings-section">
              <h3 class="section-title">背景樣式</h3>
              <div class="wallpaper-grid">
                <button
                  v-for="preset in wallpaperPresets"
                  :key="preset.id"
                  class="wallpaper-item"
                  :class="{
                    active:
                      tempWallpaperStyle.type === preset.type &&
                      (preset.type === 'time-theme' ||
                        tempWallpaperStyle.value === preset.value),
                  }"
                  @click="selectWallpaper(preset)"
                >
                  <div
                    class="wallpaper-preview"
                    :class="{
                      'time-theme-preview': preset.type === 'time-theme',
                    }"
                    :style="
                      preset.type !== 'time-theme'
                        ? { background: preset.value }
                        : {}
                    "
                  ></div>
                  <span class="wallpaper-name">{{ preset.name }}</span>
                </button>

                <!-- 已上傳的圖片 -->
                <button
                  v-if="
                    tempWallpaperStyle.type === 'image' &&
                    tempWallpaperStyle.value
                  "
                  class="wallpaper-item active"
                >
                  <div
                    class="wallpaper-preview"
                    :style="{
                      backgroundImage: `url(${tempWallpaperStyle.value})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }"
                  ></div>
                  <span class="wallpaper-name">已上傳</span>
                </button>

                <!-- 上傳按鈕 -->
                <label class="wallpaper-item upload">
                  <input
                    type="file"
                    accept="image/*"
                    @change="handleImageUpload"
                  />
                  <div class="wallpaper-preview">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                    </svg>
                  </div>
                  <span class="wallpaper-name">上傳圖片</span>
                </label>
              </div>

              <template v-if="tempWallpaperStyle.type === 'image'">
                <h3 class="section-title">顯示方式</h3>
                <div class="fit-options">
                  <button
                    v-for="opt in [
                      { id: 'cover', label: '填滿裁切' },
                      { id: 'contain', label: '完整顯示' },
                      { id: 'fill', label: '拉伸填滿' },
                      { id: 'repeat', label: '平鋪重複' },
                    ]"
                    :key="opt.id"
                    :class="[
                      'fit-btn',
                      {
                        active: (tempWallpaperStyle.fit || 'cover') === opt.id,
                      },
                    ]"
                    @click="setWallpaperFit(opt.id as any)"
                  >
                    {{ opt.label }}
                  </button>
                </div>

                <h3 class="section-title">模糊度</h3>
                <div class="slider-control">
                  <input
                    type="range"
                    min="0"
                    max="20"
                    step="1"
                    :value="tempWallpaperStyle.blur"
                    @input="
                      setWallpaperBlur(
                        Number(($event.target as HTMLInputElement).value),
                      )
                    "
                  />
                  <span class="slider-value"
                    >{{ tempWallpaperStyle.blur }}px</span
                  >
                </div>

                <h3 class="section-title">透明度</h3>
                <div class="slider-control">
                  <input
                    type="range"
                    min="20"
                    max="100"
                    step="5"
                    :value="tempWallpaperStyle.opacity"
                    @input="
                      setWallpaperOpacity(
                        Number(($event.target as HTMLInputElement).value),
                      )
                    "
                  />
                  <span class="slider-value"
                    >{{ tempWallpaperStyle.opacity }}%</span
                  >
                </div>
              </template>
            </div>

            <!-- 字體設定 -->
            <div
              v-if="activeTab === 'font'"
              class="settings-section"
            >
              <h3 class="section-title">字體大小 ({{ tempFontSizeValue }}px)</h3>
              <div class="slider-control">
                <button
                  class="size-preset-btn"
                  @click="setFontSizeValue(14)"
                >
                  小
                </button>
                <input
                  type="range"
                  :min="fontSizeMin"
                  :max="fontSizeMax"
                  step="1"
                  :value="tempFontSizeValue"
                  @input="setFontSizeValue(Number(($event.target as HTMLInputElement).value))"
                />
                <button
                  class="size-preset-btn"
                  @click="setFontSizeValue(15)"
                >
                  中
                </button>
                <button
                  class="size-preset-btn"
                  @click="setFontSizeValue(17)"
                >
                  大
                </button>
                <span class="slider-value">{{ tempFontSizeValue }}px</span>
              </div>

              <h3 class="section-title">字體樣式</h3>
              <div class="font-family-grid">
                <button
                  v-for="font in fontFamilies"
                  :key="font.id"
                  class="font-family-item"
                  :class="{ active: tempFontStyle.family === font.id }"
                  @click="setFontFamily(font.id as any)"
                >
                  <span
                    class="font-preview"
                    :style="{
                      fontFamily:
                        font.id === 'system'
                          ? '-apple-system, BlinkMacSystemFont, sans-serif'
                          : font.id === 'rounded'
                            ? 'Nunito, sans-serif'
                            : font.id === 'serif'
                              ? 'Georgia, serif'
                              : 'monospace',
                    }"
                    >{{ font.preview }}</span
                  >
                  <span class="font-name">{{ font.name }}</span>
                </button>
              </div>

              <h3 class="section-title">行高</h3>
              <div class="slider-control">
                <input
                  type="range"
                  min="1.0"
                  max="2.5"
                  step="0.1"
                  :value="tempFontStyle.lineHeight"
                  @input="
                    tempFontStyle.lineHeight = Number(
                      ($event.target as HTMLInputElement).value,
                    );
                    if (isChatMode) {
                      useCustomAppearance = true;
                    } else {
                      themeStore.updateGlobalFont({ lineHeight: tempFontStyle.lineHeight });
                    }
                  "
                />
                <span class="slider-value">{{
                  tempFontStyle.lineHeight.toFixed(1)
                }}</span>
              </div>

              <h3 class="section-title">字間距</h3>
              <div class="slider-control">
                <input
                  type="range"
                  min="-2"
                  max="5"
                  step="0.5"
                  :value="tempFontStyle.letterSpacing"
                  @input="
                    tempFontStyle.letterSpacing = Number(
                      ($event.target as HTMLInputElement).value,
                    );
                    if (isChatMode) {
                      useCustomAppearance = true;
                    } else {
                      themeStore.updateGlobalFont({ letterSpacing: tempFontStyle.letterSpacing });
                    }
                  "
                />
                <span class="slider-value"
                  >{{ tempFontStyle.letterSpacing }}px</span
                >
              </div>

              <h3 v-if="isChatMode" class="section-title">Markdown 樣式顏色</h3>
              <div v-if="isChatMode" class="markdown-colors-grid">
                <div class="color-item">
                  <input
                    type="color"
                    :value="tempFontStyle.markdownColors.text"
                    @input="
                      tempFontStyle.markdownColors.text = (
                        $event.target as HTMLInputElement
                      ).value;
                      useCustomAppearance = true;
                    "
                  />
                  <span>主要文字</span>
                </div>
                <div class="color-item">
                  <input
                    type="color"
                    :value="tempFontStyle.markdownColors.italic"
                    @input="
                      tempFontStyle.markdownColors.italic = (
                        $event.target as HTMLInputElement
                      ).value;
                      useCustomAppearance = true;
                    "
                  />
                  <span>斜體文字</span>
                </div>
                <div class="color-item">
                  <input
                    type="color"
                    :value="tempFontStyle.markdownColors.bold"
                    @input="
                      tempFontStyle.markdownColors.bold = (
                        $event.target as HTMLInputElement
                      ).value;
                      useCustomAppearance = true;
                    "
                  />
                  <span>粗體文字</span>
                </div>
                <div class="color-item">
                  <input
                    type="color"
                    :value="tempFontStyle.markdownColors.underline"
                    @input="
                      tempFontStyle.markdownColors.underline = (
                        $event.target as HTMLInputElement
                      ).value;
                      useCustomAppearance = true;
                    "
                  />
                  <span>底線文字</span>
                </div>
                <div class="color-item">
                  <input
                    type="color"
                    :value="tempFontStyle.markdownColors.strikethrough"
                    @input="
                      tempFontStyle.markdownColors.strikethrough = (
                        $event.target as HTMLInputElement
                      ).value;
                      useCustomAppearance = true;
                    "
                  />
                  <span>刪除線</span>
                </div>
                <div class="color-item">
                  <input
                    type="color"
                    :value="tempFontStyle.markdownColors.highlight"
                    @input="
                      tempFontStyle.markdownColors.highlight = (
                        $event.target as HTMLInputElement
                      ).value;
                      useCustomAppearance = true;
                    "
                  />
                  <span>高亮背景</span>
                </div>
                <div class="color-item">
                  <input
                    type="color"
                    :value="tempFontStyle.markdownColors.quote"
                    @input="
                      tempFontStyle.markdownColors.quote = (
                        $event.target as HTMLInputElement
                      ).value;
                      useCustomAppearance = true;
                    "
                  />
                  <span>引用文字</span>
                </div>
                <div class="color-item">
                  <input
                    type="color"
                    :value="tempFontStyle.markdownColors.code"
                    @input="
                      tempFontStyle.markdownColors.code = (
                        $event.target as HTMLInputElement
                      ).value;
                      useCustomAppearance = true;
                    "
                  />
                  <span>行內代碼</span>
                </div>
                <div class="color-item">
                  <input
                    type="color"
                    :value="tempFontStyle.markdownColors.heading"
                    @input="
                      tempFontStyle.markdownColors.heading = (
                        $event.target as HTMLInputElement
                      ).value;
                      useCustomAppearance = true;
                    "
                  />
                  <span>標題文字</span>
                </div>
              </div>

              <div class="font-preview-section">
                <div class="preview-label">預覽效果</div>
                <div
                  class="font-preview-text markdown-preview"
                  :style="{
                    fontSize:
                      tempFontStyle.size === 'small'
                        ? '14px'
                        : tempFontStyle.size === 'medium'
                          ? '15px'
                          : '17px',
                    fontFamily:
                      tempFontStyle.family === 'system'
                        ? '-apple-system, BlinkMacSystemFont, sans-serif'
                        : tempFontStyle.family === 'rounded'
                          ? 'Nunito, sans-serif'
                          : tempFontStyle.family === 'serif'
                            ? 'Georgia, serif'
                            : 'monospace',
                    lineHeight: tempFontStyle.lineHeight,
                    letterSpacing: `${tempFontStyle.letterSpacing}px`,
                    color: tempFontStyle.markdownColors.text,
                  }"
                >
                  <span>這是一段預覽文字</span><br />
                  <em :style="{ color: tempFontStyle.markdownColors.italic }"
                    >斜體文字 *italic*</em
                  ><br />
                  <strong :style="{ color: tempFontStyle.markdownColors.bold }"
                    >粗體文字 **bold**</strong
                  ><br />
                  <u :style="{ color: tempFontStyle.markdownColors.underline }"
                    >底線文字</u
                  ><br />
                  <del
                    :style="{
                      color: tempFontStyle.markdownColors.strikethrough,
                    }"
                    >刪除線 ~~text~~</del
                  ><br />
                  <mark
                    :style="{
                      backgroundColor: tempFontStyle.markdownColors.highlight,
                    }"
                    >高亮文字</mark
                  ><br />
                  <span
                    class="quote-preview"
                    :style="{
                      color: tempFontStyle.markdownColors.quote,
                      borderLeftColor: tempFontStyle.markdownColors.quote,
                    }"
                    >引用文字</span
                  ><br />
                  <code :style="{ color: tempFontStyle.markdownColors.code }"
                    >行內代碼</code
                  >
                </div>
              </div>
            </div>

            <!-- 裝飾品設定（僅聊天專屬模式且有 chatId） -->
            <div
              v-if="activeTab === 'decorations' && isChatMode && props.chatId"
              class="settings-section"
            >
              <h3 class="section-title">我的頭像框</h3>
              <p class="section-hint">選擇你在此聊天中使用的頭像框</p>
              <div v-if="ownedFrames.length > 0" class="decoration-grid">
                <button
                  class="decoration-item"
                  :class="{ active: tempAvatarFrames.userFrameId === null }"
                  @click="setUserFrame(null)"
                >
                  <div class="decoration-icon none">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                      />
                    </svg>
                  </div>
                  <span class="decoration-name">無</span>
                </button>
                <button
                  v-for="frame in ownedFrames"
                  :key="'user-' + frame.id"
                  class="decoration-item"
                  :class="{ active: tempAvatarFrames.userFrameId === frame.id }"
                  @click="setUserFrame(frame.id)"
                >
                  <div
                    v-if="isAvatarFrameSvg(frame.id)"
                    class="decoration-icon svg-frame"
                    :class="frame.rarity"
                    v-html="getAvatarFrameSvg(frame.id, 'circle')"
                  ></div>
                  <div
                    v-else-if="isAvatarFrameImage(frame.id)"
                    class="decoration-icon image-frame"
                    :class="frame.rarity"
                  >
                    <img
                      v-if="getAvatarFrameLayers(frame.id)?.background"
                      class="frame-layer-bg"
                      :src="
                        getLayerSrc(getAvatarFrameLayers(frame.id)?.background)
                      "
                      alt=""
                    />
                    <img
                      v-if="getAvatarFrameLayers(frame.id)?.overlay"
                      class="frame-layer-overlay"
                      :src="
                        getLayerSrc(getAvatarFrameLayers(frame.id)?.overlay)
                      "
                      alt=""
                    />
                    <img
                      v-if="getAvatarFrameLayers(frame.id)?.decoration"
                      class="frame-layer-decoration"
                      :src="
                        getLayerSrc(getAvatarFrameLayers(frame.id)?.decoration)
                      "
                      alt=""
                    />
                  </div>
                  <div v-else class="decoration-icon" :class="frame.rarity">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"
                      />
                    </svg>
                  </div>
                  <span class="decoration-name">{{ frame.name }}</span>
                </button>
              </div>
              <div v-else class="empty-decorations">
                <p>還沒有購買頭像框</p>
                <p class="hint">前往商城購買裝飾品</p>
              </div>

              <h3 class="section-title">角色頭像框</h3>
              <p class="section-hint">選擇角色在此聊天中使用的頭像框</p>
              <div v-if="ownedFrames.length > 0" class="decoration-grid">
                <button
                  class="decoration-item"
                  :class="{ active: tempAvatarFrames.charFrameId === null }"
                  @click="setCharFrame(null)"
                >
                  <div class="decoration-icon none">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                      />
                    </svg>
                  </div>
                  <span class="decoration-name">無</span>
                </button>
                <button
                  v-for="frame in ownedFrames"
                  :key="'char-' + frame.id"
                  class="decoration-item"
                  :class="{ active: tempAvatarFrames.charFrameId === frame.id }"
                  @click="setCharFrame(frame.id)"
                >
                  <div
                    v-if="isAvatarFrameSvg(frame.id)"
                    class="decoration-icon svg-frame"
                    :class="frame.rarity"
                    v-html="getAvatarFrameSvg(frame.id, 'circle')"
                  ></div>
                  <div
                    v-else-if="isAvatarFrameImage(frame.id)"
                    class="decoration-icon image-frame"
                    :class="frame.rarity"
                  >
                    <img
                      v-if="getAvatarFrameLayers(frame.id)?.background"
                      class="frame-layer-bg"
                      :src="
                        getLayerSrc(getAvatarFrameLayers(frame.id)?.background)
                      "
                      alt=""
                    />
                    <img
                      v-if="getAvatarFrameLayers(frame.id)?.overlay"
                      class="frame-layer-overlay"
                      :src="
                        getLayerSrc(getAvatarFrameLayers(frame.id)?.overlay)
                      "
                      alt=""
                    />
                    <img
                      v-if="getAvatarFrameLayers(frame.id)?.decoration"
                      class="frame-layer-decoration"
                      :src="
                        getLayerSrc(getAvatarFrameLayers(frame.id)?.decoration)
                      "
                      alt=""
                    />
                  </div>
                  <div v-else class="decoration-icon" :class="frame.rarity">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"
                      />
                    </svg>
                  </div>
                  <span class="decoration-name">{{ frame.name }}</span>
                </button>
              </div>
              <div v-else class="empty-decorations">
                <p>還沒有購買頭像框</p>
                <p class="hint">前往商城購買裝飾品</p>
              </div>

              <h3 class="section-title">聊天氣泡</h3>
              <div v-if="ownedBubbles.length > 0" class="decoration-grid">
                <button
                  class="decoration-item"
                  :class="{ active: equippedBubbleId === null }"
                  @click="equipBubble(null)"
                >
                  <div class="decoration-icon none">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                      />
                    </svg>
                  </div>
                  <span class="decoration-name">無</span>
                </button>
                <button
                  v-for="bubble in ownedBubbles"
                  :key="bubble.id"
                  class="decoration-item"
                  :class="{ active: equippedBubbleId === bubble.id }"
                  @click="equipBubble(bubble.id)"
                >
                  <div class="decoration-icon" :class="bubble.rarity">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
                      />
                    </svg>
                  </div>
                  <span class="decoration-name">{{ bubble.name }}</span>
                </button>
              </div>
              <div v-else class="empty-decorations">
                <p>還沒有購買聊天氣泡</p>
                <p class="hint">前往商城購買裝飾品</p>
              </div>
            </div>
          </div>

          <!-- 底部按鈕 -->
          <div class="modal-footer">
            <button class="soft-btn secondary" @click="resetToDefault">
              恢復預設
            </button>
            <button class="soft-btn primary" @click="handleClose">完成</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 圖片裁切器 -->
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
.theme-settings-modal {
  width: 100%;
  max-width: 500px;
  height: calc(100dvh - 40px);
  max-height: calc(100dvh - 40px);

  // 小螢幕全屏
  @media (max-height: 600px) {
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
  }

  @media (max-width: 520px) {
    max-width: 100%;
    border-radius: 0;
    height: 100dvh;
    max-height: 100dvh;
  }
}

// 聊天專屬模式開關
.chat-mode-toggle {
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;

    input[type="checkbox"] {
      width: 18px;
      height: 18px;
      accent-color: var(--color-primary);
    }

    .toggle-text {
      font-size: 14px;
      color: var(--color-text);
    }
  }

  .toggle-hint {
    font-size: 12px;
    color: var(--color-text-muted);
  }
}

.tabs-container {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  padding: 12px 20px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);

  &::-webkit-scrollbar {
    display: none;
  }
}

.soft-tabs {
  display: flex;
  flex-wrap: nowrap;
  min-width: max-content;

  .tab-item {
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    flex-shrink: 0;

    svg {
      width: 18px;
      height: 18px;
    }
  }
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin: 0;
  padding-top: 8px;

  &:first-child {
    padding-top: 0;
  }
}

.section-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: -8px 0 8px 0;
}

// 預設主題網格
.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
  gap: 12px;
}

.preset-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 8px;
  background: var(--color-background);
  border: 2px solid transparent;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--color-surface-hover);
  }

  &.active {
    border-color: var(--color-primary);
    background: var(--color-primary-light);
  }
}

.preset-color {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.preset-name {
  font-size: 12px;
  color: var(--color-text-secondary);
}

// 選項網格
.option-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 12px;
}

.option-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px 12px;
  background: var(--color-background);
  border: 2px solid transparent;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--color-surface-hover);
  }

  &.active {
    border-color: var(--color-primary);
    background: var(--color-primary-light);
  }
}

.option-icon {
  font-size: 24px;
  color: var(--color-text);
}

.option-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}

.option-hint {
  font-size: 11px;
  color: var(--color-text-muted);
}

// 滑動條
.slider-control {
  display: flex;
  align-items: center;
  gap: 12px;

  input[type="range"] {
    flex: 1;
    height: 6px;
    background: var(--color-border);
    border-radius: 3px;
    appearance: none;
    cursor: pointer;

    &::-webkit-slider-thumb {
      appearance: none;
      width: 20px;
      height: 20px;
      background: var(--color-primary);
      border-radius: 50%;
      cursor: pointer;
      box-shadow: 0 2px 6px var(--color-shadow);
    }
  }
}

// 字體大小快捷按鈕
.size-preset-btn {
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;

  &:hover {
    background: var(--color-surface-hover);
    border-color: var(--color-primary);
  }

  &:active {
    transform: scale(0.95);
  }
}

.slider-value {
  min-width: 50px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  text-align: right;
  flex-shrink: 0;
}

// 桌布顯示方式
.fit-options {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.fit-btn {
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  transition: all 0.2s;

  &:hover {
    background: var(--color-surface-hover);
  }

  &.active {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }
}

// 預覽區域
.preview-label {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 8px;
}

.color-preview {
  margin-top: 8px;
}

.preview-card {
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-md);

  .preview-header {
    padding: 12px 16px;
    font-size: 14px;
    font-weight: 500;
  }

  .preview-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
}

.preview-bubble {
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 13px;
  max-width: 70%;

  &.ai {
    align-self: flex-start;
    box-shadow: var(--shadow-sm);
  }

  &.user {
    align-self: flex-end;
  }

  .preview-time {
    font-size: 11px;
    margin-top: 4px;
    opacity: 0.9;
  }
}

.avatar-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 16px;
}

.preview-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-background);

  svg {
    width: 60%;
    height: 60%;
    color: var(--color-text-muted);
  }
}

.bubble-preview {
  margin-top: 16px;
}

.preview-bubbles {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--color-background);
  border-radius: var(--radius-lg);
}

// 桌布網格
.wallpaper-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.wallpaper-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: transparent;
  border: 2px solid transparent;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--color-background);
  }

  &.active {
    border-color: var(--color-primary);
    background: var(--color-primary-light);
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

      svg {
        width: 24px;
        height: 24px;
        color: var(--color-text-muted);
      }
    }
  }
}

.wallpaper-preview {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: var(--radius-md);
  background-size: cover;
  background-position: center;

  // 跟隨時間主題的預覽樣式
  &.time-theme-preview {
    background: linear-gradient(
      135deg,
      #fff8f0 0%,
      #f8fafc 20%,
      #fafafa 40%,
      #fef3e2 60%,
      #1e293b 80%,
      #0f172a 100%
    );
  }
}

.wallpaper-name {
  font-size: 12px;
  color: var(--color-text-secondary);
}

// 字體樣式網格
.font-family-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.font-family-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 12px;
  background: var(--color-background);
  border: 2px solid transparent;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--color-surface-hover);
  }

  &.active {
    border-color: var(--color-primary);
    background: var(--color-primary-light);
  }
}

.font-preview {
  font-size: 28px;
  font-weight: 500;
  color: var(--color-text);
}

.font-name {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.font-preview-section {
  margin-top: 16px;
}

.font-preview-text {
  padding: 16px;
  background: var(--color-background);
  border-radius: var(--radius-lg);
  color: var(--color-text);
  line-height: 1.6;

  &.markdown-preview {
    .quote-preview {
      display: inline-block;
      padding-left: 8px;
      border-left: 3px solid;
      font-style: italic;
    }

    code {
      padding: 2px 6px;
      background: rgba(0, 0, 0, 0.05);
      border-radius: 4px;
      font-family: monospace;
    }

    mark {
      padding: 2px 4px;
      border-radius: 2px;
    }
  }
}

// Markdown 顏色設定網格
.markdown-colors-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;

  .color-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    background: var(--color-background);
    border-radius: var(--radius-md);

    input[type="color"] {
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      padding: 0;

      &::-webkit-color-swatch-wrapper {
        padding: 2px;
      }

      &::-webkit-color-swatch {
        border-radius: 4px;
        border: 1px solid rgba(0, 0, 0, 0.1);
      }
    }

    span {
      font-size: 12px;
      color: var(--color-text-secondary);
      white-space: nowrap;
    }
  }
}

.bubble-color-row {
  display: flex;
  gap: 16px;

  .color-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    background: var(--color-background);
    border-radius: var(--radius-md);

    input[type="color"] {
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      padding: 0;

      &::-webkit-color-swatch-wrapper {
        padding: 2px;
      }

      &::-webkit-color-swatch {
        border-radius: 4px;
        border: 1px solid rgba(0, 0, 0, 0.1);
      }
    }

    span {
      font-size: 12px;
      color: var(--color-text-secondary);
      white-space: nowrap;
    }
  }
}

// ===== 裝飾品設定 =====
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
  background: var(--color-surface);
  border: 2px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: var(--color-surface-hover);
  }

  &.active {
    border-color: var(--color-primary);
    background: var(--color-primary-light);
  }

  .decoration-icon {
    width: 48px;
    height: 48px;
    border-radius: 10px;
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

    // SVG 頭像框預覽
    &.svg-frame {
      background: transparent;
      padding: 0;
      overflow: visible;

      :deep(svg) {
        width: 100%;
        height: 100%;
      }
    }

    // 圖片圖層頭像框預覽
    &.image-frame {
      background: transparent;
      padding: 0;
      position: relative;
      overflow: visible;

      img {
        position: absolute;
        top: 0;
        left: 0;
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
