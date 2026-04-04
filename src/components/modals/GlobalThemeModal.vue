<script setup lang="ts">
import { useLanguage } from "@/composables/useLanguage";
import { useSettingsStore } from "@/stores/settings";
import type { GlobalFontOverride, WallpaperStyle } from "@/stores/theme";
import { useThemeStore } from "@/stores/theme";
import { compressImage, compressionPresets } from "@/utils/imageCompression";
import { computed, ref, watch } from "vue";

// Props
interface Props {
  visible: boolean;
}

const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
  (e: "close"): void;
}>();

// Store
const themeStore = useThemeStore();
const settingsStore = useSettingsStore();
const { currentLanguage, isSimplifiedChinese, t } = useLanguage();

// 當前分頁
const activeTab = ref<"colors" | "wallpaper" | "font" | "customFont" | "animation" | "css">(
  "colors",
);

// 處理分頁標籤滾輪事件（將垂直滾動轉換為水平滾動）
function handleTabsWheel(event: WheelEvent) {
  const container = event.currentTarget as HTMLElement;
  if (container) {
    container.scrollLeft += event.deltaY || event.deltaX;
  }
}

// 預設主題列表
const presetList = computed(() => [
  { id: "soft-pink", name: "粉紅", color: "#FF85A2" },
  { id: "soft-purple", name: "紫羅蘭", color: "#B388FF" },
  { id: "soft-mint", name: "薄荷", color: "#5DD3B3" },
  { id: "soft-mint-green", name: "薄荷綠", color: "#7DD3A8" },
  { id: "soft-peach", name: "蜜桃", color: "#FFAB91" },
  { id: "soft-blue", name: "天藍", color: "#64B5F6" },
]);

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

// 臨時桌布樣式
const tempWallpaperStyle = ref<WallpaperStyle>({
  ...themeStore.wallpaperStyle,
});

// 臨時自訂 CSS
const tempCustomCSS = ref<string>(themeStore.customCSS);

// 臨時全局字體設定
const tempGlobalFont = ref<GlobalFontOverride>({ ...themeStore.globalFont });

// 彈窗動畫選項
const enterAnimations = [
  { id: "modal-pop-in 300ms cubic-bezier(0.2, 0.8, 0.2, 1)", name: "彈跳放大 (Pop In)" },
  { id: "slideUp 300ms cubic-bezier(0.2, 0.8, 0.2, 1)", name: "平滑向上 (Slide Up)" },
  { id: "scaleIn 300ms cubic-bezier(0.2, 0.8, 0.2, 1)", name: "縮放進入 (Scale In)" },
  { id: "fadeIn 300ms ease-out", name: "淡入 (Fade In)" },
  { id: "slideFromLeft 300ms cubic-bezier(0.2, 0.8, 0.2, 1)", name: "從左滑入 (Slide From Left)" },
  { id: "flipIn 350ms cubic-bezier(0.2, 0.8, 0.2, 1)", name: "翻轉進入 (Flip In)" },
  { id: "bounceDrop 500ms cubic-bezier(0.2, 0.8, 0.2, 1)", name: "彈跳落下 (Bounce Drop)" },
];

const leaveAnimations = [
  { id: "modal-pop-out 500ms ease-in forwards", name: "掉落旋轉 (Drop & Rotate)" },
  { id: "slideDown 300ms ease-in forwards", name: "平滑向下 (Slide Down)" },
  { id: "scaleOut 300ms ease-in forwards", name: "縮放退出 (Scale Out)" },
  { id: "fadeOut 300ms ease-in forwards", name: "淡出 (Fade Out)" },
  { id: "flyOutLeft 300ms ease-in forwards", name: "向左飛出 (Fly Out Left)" },
  { id: "flipOut 350ms ease-in forwards", name: "翻轉退出 (Flip Out)" },
  { id: "shrinkOut 300ms cubic-bezier(0.4, 0, 1, 1) forwards", name: "縮小消失 (Shrink Out)" },
];

// 字體來源選項
const fontSourceOptions = [
  {
    id: "zeoseven" as const,
    name: "ZeoSeven Fonts",
    url: "https://fonts.zeoseven.com/",
  },
  {
    id: "google" as const,
    name: "Google Fonts",
    url: "https://fonts.google.com/",
  },
  { id: "custom" as const, name: "自訂 URL", url: "" },
];

// 字體來源提示
const fontSourceHints: Record<string, string> = {
  zeoseven:
    "從 ZeoSeven Fonts 複製 @import URL，例如：https://fontsapi.zeoseven.com/793/main/result.css",
  google:
    "從 Google Fonts 複製 @import URL，例如：https://fonts.googleapis.com/css2?family=Noto+Sans+TC",
  custom: "CSS URL 或字體檔案直連（.ttf / .woff / .woff2 / .otf）",
};

// 是否展開 CSS 編輯器
const isCSSExpanded = ref(false);

// 是否為字體檔案直連
const isFontFileUrl = computed(() => {
  const url = tempGlobalFont.value.importUrl.trim();
  return /\.(ttf|otf|woff2?)(?:\?.*)?$/i.test(url);
});

// 處理預設主題選擇
function selectPreset(presetId: string) {
  themeStore.setPreset(presetId);
}

// 處理桌布選擇
function selectWallpaper(preset: (typeof wallpaperPresets)[0]) {
  tempWallpaperStyle.value.type = preset.type as WallpaperStyle["type"];
  tempWallpaperStyle.value.value = preset.value;
  themeStore.updateWallpaperStyle({
    type: preset.type as WallpaperStyle["type"],
    value: preset.value,
  });
}

// 處理圖片上傳
async function handleImageUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    // 使用壁紙預設壓縮圖片
    const compressedDataUrl = await compressImage(
      file,
      compressionPresets.wallpaper,
    );
    tempWallpaperStyle.value.type = "image";
    tempWallpaperStyle.value.value = compressedDataUrl;
    themeStore.updateWallpaperStyle({
      type: "image",
      value: compressedDataUrl,
    });
  } catch (error) {
    console.error("圖片壓縮失敗:", error);
    // 降級：直接使用原始圖片
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      tempWallpaperStyle.value.type = "image";
      tempWallpaperStyle.value.value = dataUrl;
      themeStore.updateWallpaperStyle({
        type: "image",
        value: dataUrl,
      });
    };
    reader.readAsDataURL(file);
  }

  // 清空 input 以便重複選擇同一檔案
  input.value = "";
}

// 處理桌布模糊度變更
function setWallpaperBlur(blur: number) {
  tempWallpaperStyle.value.blur = blur;
  themeStore.updateWallpaperStyle({ blur });
}

// 處理桌布透明度變更
function setWallpaperOpacity(opacity: number) {
  tempWallpaperStyle.value.opacity = opacity;
  themeStore.updateWallpaperStyle({ opacity });
}

// 處理桌布顯示方式變更
function setWallpaperFit(fit: "cover" | "contain" | "fill" | "repeat") {
  tempWallpaperStyle.value.fit = fit;
  themeStore.updateWallpaperStyle({ fit });
}

const modalRef = ref<HTMLElement | null>(null);

// 處理動畫變更
function setEnterAnimation(anim: string) {
  themeStore.updateModalAnimation({ enter: anim });
  // 預覽進場動畫
  if (modalRef.value) {
    modalRef.value.style.animation = "none";
    void modalRef.value.offsetHeight; // 觸發重繪
    modalRef.value.style.animation = anim;
    
    // 動畫結束後清除 inline style，恢復使用 CSS class 的設定
    setTimeout(() => {
      if (modalRef.value) {
        modalRef.value.style.animation = "";
      }
    }, 500);
  }
}

function setLeaveAnimation(anim: string) {
  themeStore.updateModalAnimation({ leave: anim });
  // 預覽退場動畫
  if (modalRef.value) {
    modalRef.value.style.animation = "none";
    void modalRef.value.offsetHeight; // 觸發重繪
    modalRef.value.style.animation = anim;
    
    // 退場動畫結束後，自動播放進場動畫恢復原狀
    setTimeout(() => {
      if (modalRef.value) {
        modalRef.value.style.animation = "none";
        void modalRef.value.offsetHeight;
        modalRef.value.style.animation = themeStore.modalAnimation.enter || "modal-pop-in 300ms cubic-bezier(0.2, 0.8, 0.2, 1)";
        
        setTimeout(() => {
          if (modalRef.value) {
            modalRef.value.style.animation = "";
          }
        }, 500);
      }
    }, 500);
  }
}

// 處理自訂 CSS 變更
function handleCSSChange(event: Event) {
  const textarea = event.target as HTMLTextAreaElement;
  tempCustomCSS.value = textarea.value;
}

// 應用自訂 CSS
function applyCustomCSS() {
  themeStore.updateCustomCSS(tempCustomCSS.value);
}

// 清空自訂 CSS
function clearCustomCSS() {
  tempCustomCSS.value = "";
  themeStore.updateCustomCSS("");
}

// 自動解析貼上的字體 CSS 片段
function parseFontInput(raw: string) {
  const text = raw.trim();
  if (!text) return;

  // 解析 @import url("...")
  const importMatch = text.match(/@import\s+url\(["']?([^"')]+)["']?\)/);
  if (importMatch) {
    tempGlobalFont.value.importUrl = importMatch[1];
  }

  // 解析 font-family: "..."
  const familyMatch = text.match(/font-family:\s*["']?([^"';}]+)["']?\s*[;}]/);
  if (familyMatch) {
    tempGlobalFont.value.fontFamily = familyMatch[1].trim();
  }

  // 解析 font-weight: ...
  const weightMatch = text.match(/font-weight:\s*([^;}"']+)/);
  if (weightMatch) {
    tempGlobalFont.value.fontWeight = weightMatch[1].trim();
  }

  // 自動偵測來源
  if (tempGlobalFont.value.importUrl.includes("zeoseven")) {
    tempGlobalFont.value.source = "zeoseven";
  } else if (
    tempGlobalFont.value.importUrl.includes("googleapis") ||
    tempGlobalFont.value.importUrl.includes("fonts.google")
  ) {
    tempGlobalFont.value.source = "google";
  }
}

// 處理字體 URL 輸入變更（貼上時自動解析）
function handleFontUrlInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const value = input.value.trim();
  // 如果包含 @import 或 font-family，視為完整 CSS 片段，自動解析
  if (value.includes("@import") || value.includes("font-family")) {
    parseFontInput(value);
    return;
  }
  // 如果是字體檔案直連（.ttf / .woff / .woff2 / .otf），自動從檔名提取 font-family
  const fontFileMatch = value.match(/\/([^/?#]+)\.(ttf|otf|woff2?)(?:\?.*)?$/i);
  if (fontFileMatch && !tempGlobalFont.value.fontFamily.trim()) {
    // 從檔名提取名稱，去掉時間戳前綴（如 1770499389032_）
    let fileName = decodeURIComponent(fontFileMatch[1]);
    fileName = fileName.replace(/^\d+[_-]/, "");
    tempGlobalFont.value.fontFamily = fileName;
  }
}

// 套用全局字體
function applyGlobalFont() {
  // 自動解析 @import 語句中的 URL
  let importUrl = tempGlobalFont.value.importUrl.trim();
  // 如果用戶貼了完整的 @import url("..."); 語句，提取 URL
  const importMatch = importUrl.match(/@import\s+url\(["']?([^"')]+)["']?\)/);
  if (importMatch) {
    importUrl = importMatch[1];
    tempGlobalFont.value.importUrl = importUrl;
  }

  themeStore.updateGlobalFont({
    ...tempGlobalFont.value,
    enabled: true,
    importUrl,
  });
}

// 清除全局字體
function clearGlobalFont() {
  tempGlobalFont.value = {
    enabled: false,
    importUrl: "",
    fontFamily: "",
    fontWeight: "normal",
    source: "custom",
    fontSize: 100,
    letterSpacing: 0,
    lineHeight: 0,
  };
  themeStore.updateGlobalFont(tempGlobalFont.value);
}

// 重置為預設
function resetToDefault() {
  if (confirm("確定要重置所有全局設定嗎？")) {
    themeStore.resetToDefault();
    tempWallpaperStyle.value = { ...themeStore.wallpaperStyle };
    tempCustomCSS.value = "";
  }
}

// 關閉彈窗
function handleClose() {
  // 關閉前自動保存自訂 CSS
  if (tempCustomCSS.value !== themeStore.customCSS) {
    themeStore.updateCustomCSS(tempCustomCSS.value);
  }
  // 關閉前自動套用字體設定
  applyGlobalFont();
  // 保存語言設定
  settingsStore.saveSettings();
  emit("close");
}

// 監聽 visible 變化，初始化
watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      tempWallpaperStyle.value = { ...themeStore.wallpaperStyle };
      tempCustomCSS.value = themeStore.customCSS;
      tempGlobalFont.value = { ...themeStore.globalFont };
      isCSSExpanded.value = false;
    }
  },
);
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="soft-modal-overlay" @click.self="handleClose">
        <div ref="modalRef" class="soft-modal global-theme-modal">
          <!-- 標題 -->
          <div class="modal-header">
            <h2 class="modal-title">全局美化配置</h2>
            <button class="modal-close" @click="handleClose">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                />
              </svg>
            </button>
          </div>

          <div class="modal-hint">
            此設定影響整個 App 的外觀，聊天室內的外觀請在聊天設定中調整
          </div>

          <!-- 分頁標籤 -->
          <div class="tabs-container">
            <div class="soft-tabs" @wheel.prevent="handleTabsWheel">
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
                主題色
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
                    d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"
                  />
                </svg>
                繁簡轉
              </button>
              <button
                class="tab-item"
                :class="{ active: activeTab === 'customFont' }"
                @click="activeTab = 'customFont'"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M9.93 13.5h4.14L12 7.98 9.93 13.5zM20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-4.05 16.5l-1.14-3H9.17l-1.12 3H5.96l5.11-13h1.86l5.11 13h-2.09z"
                  />
                </svg>
                自訂字體
              </button>
              <button
                class="tab-item"
                :class="{ active: activeTab === 'animation' }"
                @click="activeTab = 'animation'"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                </svg>
                動畫
              </button>
              <button
                class="tab-item"
                :class="{ active: activeTab === 'css' }"
                @click="activeTab = 'css'"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"
                  />
                </svg>
                自訂 CSS
              </button>
            </div>
          </div>

          <!-- 內容區 -->
          <div class="modal-content">
            <!-- 顏色設定 -->
            <div v-if="activeTab === 'colors'" class="settings-section">
              <h3 class="section-title">全局主題配色</h3>
              <div class="preset-grid">
                <button
                  v-for="preset in presetList"
                  :key="preset.id"
                  class="preset-item"
                  :class="{ active: themeStore.currentPreset === preset.id }"
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
                    :style="{ background: themeStore.colors.primary }"
                  >
                    <span style="color: white">導航欄</span>
                  </div>
                  <div
                    class="preview-body"
                    :style="{ background: themeStore.colors.background }"
                  >
                    <div
                      class="preview-item"
                      :style="{ background: themeStore.colors.surface }"
                    >
                      <div
                        class="preview-icon"
                        :style="{ background: themeStore.colors.primary }"
                      ></div>
                      <span>列表項目</span>
                    </div>
                    <div
                      class="preview-item"
                      :style="{ background: themeStore.colors.surface }"
                    >
                      <div
                        class="preview-icon"
                        :style="{ background: themeStore.colors.primaryLight }"
                      ></div>
                      <span>列表項目</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 桌布設定 -->
            <div v-if="activeTab === 'wallpaper'" class="settings-section">
              <h3 class="section-title">全局背景</h3>
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

                <!-- 已上傳的自定義圖片 -->
                <button
                  v-if="tempWallpaperStyle.type === 'image'"
                  class="wallpaper-item"
                  :class="{ active: true }"
                >
                  <div
                    class="wallpaper-preview"
                    :style="{
                      backgroundImage: `url(${tempWallpaperStyle.value})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }"
                  ></div>
                  <span class="wallpaper-name">自定義</span>
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

            <!-- 繁簡轉設定 -->
            <div v-if="activeTab === 'font'" class="settings-section">
              <h3 class="section-title">繁簡字形切換</h3>
              <div class="font-switch-card">
                <div class="font-switch-info">
                  <div class="font-switch-label">顯示字形</div>
                  <div class="font-switch-desc">
                    切換介面文字的繁體/簡體顯示，資料儲存不受影響
                  </div>
                </div>
                <div class="font-switch-toggle">
                  <button
                    class="lang-option"
                    :class="{ active: !isSimplifiedChinese }"
                    @click="settingsStore.setLanguage('zh-TW')"
                  >
                    繁
                  </button>
                  <button
                    class="lang-option"
                    :class="{ active: isSimplifiedChinese }"
                    @click="settingsStore.setLanguage('zh-CN')"
                  >
                    简
                  </button>
                </div>
              </div>

              <h3 class="section-title">預覽</h3>
              <div class="font-preview-card">
                <div class="font-preview-row">
                  <span class="font-preview-label">原文（繁體）</span>
                  <span class="font-preview-text"
                    >其實我知道，來來往往有多少人，只是揚起了灰塵</span
                  >
                </div>
                <div class="font-preview-row">
                  <span class="font-preview-label">轉換結果</span>
                  <span class="font-preview-text converted">{{
                    t("其實我知道，來來往往有多少人，只是揚起了灰塵")
                  }}</span>
                </div>
              </div>

              <div class="css-hint">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
                  />
                </svg>
                <span
                  >所有資料以繁體儲存，切換僅影響顯示。映射表來源：OpenCC（共
                  2956 字）</span
                >
              </div>
            </div>

            <!-- 自訂字體設定 -->
            <div v-if="activeTab === 'customFont'" class="settings-section">
              <div class="css-hint" style="margin-bottom: 4px">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
                  />
                </svg>
                <span
                  >使用線上字體覆蓋全局字體，支援 ZeoSeven Fonts、Google Fonts
                  及字體檔案直連（.ttf / .woff / .woff2）</span
                >
              </div>

              <!-- 字體來源選擇 -->
              <div class="font-source-tabs">
                <button
                  v-for="src in fontSourceOptions"
                  :key="src.id"
                  class="font-source-tab"
                  :class="{ active: tempGlobalFont.source === src.id }"
                  @click="tempGlobalFont.source = src.id"
                >
                  {{ src.name }}
                </button>
              </div>

              <!-- 瀏覽字體連結 -->
              <div
                v-if="tempGlobalFont.source !== 'custom'"
                class="font-browse-link"
              >
                <a
                  :href="
                    fontSourceOptions.find(
                      (s) => s.id === tempGlobalFont.source,
                    )?.url
                  "
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    width="14"
                    height="14"
                  >
                    <path
                      d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"
                    />
                  </svg>
                  瀏覽字體庫
                </a>
              </div>

              <!-- 字體 URL 輸入 -->
              <div class="font-input-group">
                <label class="font-input-label">字體 CSS URL</label>
                <input
                  v-model="tempGlobalFont.importUrl"
                  class="font-input"
                  type="text"
                  :placeholder="fontSourceHints[tempGlobalFont.source]"
                  spellcheck="false"
                  @input="handleFontUrlInput"
                />
              </div>

              <!-- 字體名稱輸入 -->
              <div class="font-input-group">
                <label class="font-input-label">font-family 名稱</label>
                <input
                  v-model="tempGlobalFont.fontFamily"
                  class="font-input"
                  type="text"
                  placeholder="例如：BoutiqueBitmap9x9 Square Dot"
                  spellcheck="false"
                />
              </div>

              <!-- 字重選擇 -->
              <div class="font-input-group">
                <label class="font-input-label">字重 (font-weight)</label>
                <div class="font-weight-options">
                  <button
                    v-for="w in ['normal', 'bold', '300', '500', '700']"
                    :key="w"
                    class="font-weight-btn"
                    :class="{ active: tempGlobalFont.fontWeight === w }"
                    @click="tempGlobalFont.fontWeight = w"
                  >
                    {{ w }}
                  </button>
                </div>
                <div v-if="isFontFileUrl" class="font-weight-hint">
                  單一字體檔案（.ttf/.woff）通常只包含一種字重，切換可能無效。多字重需使用
                  Google Fonts 等 CSS URL。
                </div>
              </div>

              <!-- 字體大小 -->
              <h3 class="section-title">全局文字調整</h3>
              <div class="font-input-group">
                <label class="font-input-label"
                  >字體大小 ({{ tempGlobalFont.fontSize }}%)</label
                >
                <div class="slider-control">
                  <input
                    type="range"
                    min="50"
                    max="200"
                    step="1"
                    v-model.number="tempGlobalFont.fontSize"
                  />
                  <span class="slider-value"
                    >{{ tempGlobalFont.fontSize }}%</span
                  >
                </div>
              </div>

              <!-- 字距 -->
              <div class="font-input-group">
                <label class="font-input-label"
                  >字距 ({{ tempGlobalFont.letterSpacing }}px)</label
                >
                <div class="slider-control">
                  <input
                    type="range"
                    min="-2"
                    max="10"
                    step="0.5"
                    v-model.number="tempGlobalFont.letterSpacing"
                  />
                  <span class="slider-value"
                    >{{ tempGlobalFont.letterSpacing }}px</span
                  >
                </div>
              </div>

              <!-- 行高 -->
              <div class="font-input-group">
                <label class="font-input-label"
                  >行高 ({{
                    tempGlobalFont.lineHeight === 0
                      ? "預設"
                      : tempGlobalFont.lineHeight
                  }})</label
                >
                <div class="slider-control">
                  <input
                    type="range"
                    min="0"
                    max="3"
                    step="0.1"
                    v-model.number="tempGlobalFont.lineHeight"
                  />
                  <span class="slider-value">{{
                    tempGlobalFont.lineHeight === 0
                      ? "預設"
                      : tempGlobalFont.lineHeight
                  }}</span>
                </div>
              </div>

              <!-- 字體操作按鈕 -->
              <div class="font-actions">
                <button
                  class="soft-btn secondary small"
                  @click="clearGlobalFont"
                >
                  清除全部
                </button>
                <button class="soft-btn primary small" @click="applyGlobalFont">
                  套用
                </button>
              </div>

              <!-- 目前啟用的字體 -->
              <div
                v-if="
                  themeStore.globalFont.enabled &&
                  themeStore.globalFont.fontFamily
                "
                class="font-active-card"
              >
                <div class="font-active-info">
                  <span class="font-active-label">目前使用</span>
                  <span class="font-active-name">{{
                    themeStore.globalFont.fontFamily
                  }}</span>
                </div>
                <div class="font-active-badge">啟用中</div>
              </div>
            </div>

            <!-- 動畫設定 -->
            <div v-if="activeTab === 'animation'" class="settings-section">
              <h3 class="section-title">視窗進場動畫</h3>
              <div class="fit-options">
                <button
                  v-for="anim in enterAnimations"
                  :key="anim.id"
                  :class="[
                    'fit-btn',
                    {
                      active: themeStore.modalAnimation.enter === anim.id,
                    },
                  ]"
                  @click="setEnterAnimation(anim.id)"
                >
                  {{ anim.name }}
                </button>
              </div>

              <h3 class="section-title">視窗退場動畫</h3>
              <div class="fit-options">
                <button
                  v-for="anim in leaveAnimations"
                  :key="anim.id"
                  :class="[
                    'fit-btn',
                    {
                      active: themeStore.modalAnimation.leave === anim.id,
                    },
                  ]"
                  @click="setLeaveAnimation(anim.id)"
                >
                  {{ anim.name }}
                </button>
              </div>
              
              <div class="css-hint" style="margin-top: 16px;">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                </svg>
                <span>點擊選項後，關閉並重新打開此視窗即可預覽效果。</span>
              </div>
            </div>

            <!-- 自訂 CSS 設定 -->
            <div v-if="activeTab === 'css'" class="settings-section">
              <div class="css-header">
                <h3 class="section-title">自訂 CSS 樣式</h3>
                <button
                  class="expand-btn"
                  :class="{ expanded: isCSSExpanded }"
                  @click="isCSSExpanded = !isCSSExpanded"
                  title="展開/收起"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M15 3l2.3 2.3-2.89 2.87 1.42 1.42L18.7 6.7 21 9V3h-6zM3 9l2.3-2.3 2.87 2.89 1.42-1.42L6.7 5.3 9 3H3v6zm6 12l-2.3-2.3 2.89-2.87-1.42-1.42L5.3 17.3 3 15v6h6zm12-6l-2.3 2.3-2.87-2.89-1.42 1.42 2.89 2.87L15 21h6v-6z"
                    />
                  </svg>
                </button>
              </div>
              <div
                class="css-editor-container"
                :class="{ expanded: isCSSExpanded }"
              >
                <textarea
                  class="css-editor"
                  :value="tempCustomCSS"
                  @input="handleCSSChange"
                  placeholder="/* 在此輸入自訂 CSS */
body {
  /* 你的樣式 */
}"
                  spellcheck="false"
                ></textarea>
              </div>
              <div class="css-actions">
                <button
                  class="soft-btn secondary small"
                  @click="clearCustomCSS"
                >
                  清空
                </button>
                <button class="soft-btn primary small" @click="applyCustomCSS">
                  套用
                </button>
              </div>
              <div class="css-hint">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
                  />
                </svg>
                <span>自訂 CSS 會覆蓋全局樣式，可使用 !important 強制覆蓋</span>
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
  </Teleport>
</template>

<style lang="scss" scoped>
.global-theme-modal {
  width: 100%;
  max-width: 500px;
}

.modal-hint {
  padding: 12px 20px;
  font-size: 12px;
  color: var(--color-text-muted);
  background: var(--color-background);
  border-bottom: 1px solid var(--color-border);
}

.tabs-container {
  padding: 0 20px;
}

.soft-tabs {
  display: flex;
  gap: 8px;
  padding: 12px 0;
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  .tab-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    font-size: 14px;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
    white-space: nowrap;
    flex-shrink: 0;

    svg {
      width: 18px;
      height: 18px;
    }

    &:hover {
      background: var(--color-background);
    }

    &.active {
      background: var(--color-primary-light);
      color: var(--color-primary);
    }
  }
}

.modal-content {
  padding: 20px;
  max-height: 60vh;
  overflow-y: auto;
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

// 預設主題網格
.preset-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
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
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
}

.preview-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--color-text);
}

.preview-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
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

// 滑動條
.slider-control {
  display: flex;
  align-items: center;
  gap: 16px;

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

.slider-value {
  min-width: 50px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  text-align: right;
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

// 字形切換
.font-switch-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: var(--color-background);
  border-radius: var(--radius-lg);
  gap: 16px;
}

.font-switch-info {
  flex: 1;
}

.font-switch-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 4px;
}

.font-switch-desc {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.4;
}

.font-switch-toggle {
  display: flex;
  background: var(--color-surface);
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--color-border);
  flex-shrink: 0;
}

.lang-option {
  padding: 8px 18px;
  border: none;
  background: transparent;
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);

  &.active {
    background: var(--color-primary);
    color: white;
  }

  &:hover:not(.active) {
    background: var(--color-surface-hover);
  }
}

.font-preview-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--color-background);
  border-radius: var(--radius-lg);
}

.font-preview-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.font-preview-label {
  font-size: 11px;
  color: var(--color-text-muted);
  font-weight: 500;
}

.font-preview-text {
  font-size: 14px;
  color: var(--color-text);
  line-height: 1.6;

  &.converted {
    color: var(--color-primary);
  }
}

// CSS 編輯器
.css-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.expand-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-background);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--color-text-muted);
  transition: all var(--transition-fast);

  svg {
    width: 18px;
    height: 18px;
  }

  &:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }

  &.expanded {
    color: var(--color-primary);
  }
}

.css-editor-container {
  position: relative;
  transition: height var(--transition-normal);

  &.expanded {
    .css-editor {
      height: 300px;
    }
  }
}

.css-editor {
  width: 100%;
  height: 150px;
  padding: 12px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-family: "SF Mono", "Monaco", "Inconsolata", "Fira Code", monospace;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text);
  resize: none;
  transition: height var(--transition-normal);

  &::placeholder {
    color: var(--color-text-muted);
  }

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
}

.css-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.css-hint {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  background: var(--color-background);
  border-radius: var(--radius-md);
  font-size: 12px;
  color: var(--color-text-muted);

  svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    margin-top: 1px;
  }
}

// 線上字體覆蓋樣式
.font-source-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.font-source-tab {
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  cursor: pointer;
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

.font-browse-link {
  a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--color-primary);
    text-decoration: none;

    svg {
      width: 14px;
      height: 14px;
    }

    &:hover {
      text-decoration: underline;
    }
  }
}

.font-input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.font-input-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.font-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--color-text);
  transition: border-color 0.2s;
  box-sizing: border-box;

  &::placeholder {
    color: var(--color-text-muted);
    font-size: 12px;
  }

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
}

.font-weight-options {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.font-weight-btn {
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  cursor: pointer;
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

.font-weight-hint {
  font-size: 11px;
  color: var(--color-text-muted);
  line-height: 1.4;
  margin-top: 2px;
}

.font-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.font-active-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-primary-light);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-primary);
}

.font-active-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.font-active-label {
  font-size: 11px;
  color: var(--color-text-muted);
}

.font-active-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.font-active-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  background: var(--color-primary);
  color: white;
}

.soft-btn.small {
  flex: 0;
  padding: 8px 16px;
  font-size: 13px;
}

// Modal 通用樣式
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.modal-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  color: var(--color-text-muted);
  transition: all var(--transition-fast);

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover {
    background: var(--color-background);
    color: var(--color-text);
  }
}

.modal-footer {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
}

.soft-btn {
  flex: 1;
  padding: 12px 20px;
  border: none;
  border-radius: var(--radius-lg);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);

  &.primary {
    background: var(--color-primary);
    color: white;

    &:hover {
      filter: brightness(1.1);
    }
  }

  &.secondary {
    background: var(--color-background);
    color: var(--color-text-secondary);

    &:hover {
      background: var(--color-surface-hover);
    }
  }
}

// Modal overlay
.soft-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.soft-modal {
  background: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

</style>
