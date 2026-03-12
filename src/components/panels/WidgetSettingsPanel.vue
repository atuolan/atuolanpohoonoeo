<script setup lang="ts">
import { useCanvasStore } from "@/stores";
import { useWeatherStore } from "@/stores/weather";
import {
    backgroundColors,
    borderColors,
    colorThemes,
    foregroundColors,
    gradientPresets,
} from "@/styles/color-presets";
import { shapePresets } from "@/styles/shape-presets";
import type { ClockStyle, WidgetCustomStyle, WidgetInstance } from "@/types";
import {
    Check,
    Clock,
    Image as ImageIcon,
    Palette,
    RotateCcw,
    Shapes,
    X,
} from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref } from "vue";
import IconPickerPanel from "./IconPickerPanel.vue";

const props = defineProps<{
  widget: WidgetInstance;
}>();

const emit = defineEmits<{
  close: [];
}>();

const canvasStore = useCanvasStore();
const weatherStore = useWeatherStore();

// 當前編輯的樣式（本地副本）
const localStyle = ref<WidgetCustomStyle>({
  backgroundColor: props.widget.data?.customStyle?.backgroundColor,
  backgroundGradient: props.widget.data?.customStyle?.backgroundGradient,
  foregroundColor: props.widget.data?.customStyle?.foregroundColor,
  textColor: props.widget.data?.customStyle?.textColor,
  borderColor: props.widget.data?.customStyle?.borderColor,
  borderWidth: props.widget.data?.customStyle?.borderWidth,
  layout: props.widget.data?.customStyle?.layout,
  vinylStyle: props.widget.data?.customStyle?.vinylStyle,
  iconType: props.widget.data?.customStyle?.iconType,
  iconName: props.widget.data?.customStyle?.iconName,
  customIconUrl: props.widget.data?.customStyle?.customIconUrl,
  iconSize: props.widget.data?.customStyle?.iconSize,
  shape: props.widget.data?.customStyle?.shape,
});

// 時鐘樣式（本地副本）
const clockStyleValue = ref<ClockStyle>(
  props.widget.data?.clockStyle || "minimal",
);
const showSecondsValue = ref<boolean>(props.widget.data?.showSeconds ?? true);
const showDateValue = ref<boolean>(props.widget.data?.showDate ?? true);
const clockColorValue = ref<string>(props.widget.data?.clockColor || "");

// 行事曆顏色設定
const calendarColors = ref({
  today: props.widget.data?.calendarColors?.today || "",
  holiday: props.widget.data?.calendarColors?.holiday || "",
  weekday: props.widget.data?.calendarColors?.weekday || "",
});

// 時鐘樣式選項
const clockStyles: {
  id: ClockStyle;
  name: string;
  desc: string;
  icon: string;
}[] = [
  { id: "minimal", name: "極簡", desc: "簡潔優雅", icon: "⏱️" },
  { id: "digital", name: "數字", desc: "卡片式", icon: "🔢" },
  { id: "analog", name: "指針", desc: "傳統錶盤", icon: "🕐" },
  { id: "flip", name: "翻頁", desc: "復古風格", icon: "📅" },
  { id: "neon", name: "霓虹", desc: "炫彩發光", icon: "✨" },
  { id: "progress", name: "進度環", desc: "環形顯示", icon: "🔄" },
  { id: "binary", name: "二進制", desc: "極客風格", icon: "💻" },
  { id: "dotmatrix", name: "點陣", desc: "LED 風格", icon: "🔲" },
  { id: "orbit", name: "軌道", desc: "行星系統", icon: "🌍" },
];

// 分頁狀態
const activeTab = ref<"color" | "icon" | "shape">("color");

// 顏色選擇器類型
const colorPickerType = ref<
  "background" | "gradient" | "foreground" | "border"
>("background");

// 音樂播放器佈局選項
const musicLayouts = [
  { id: "compact", name: "橫條簡約", desc: "節省空間的橫向佈局" },
  { id: "classic", name: "經典卡片", desc: "展示大封面藝術" },
  { id: "vinyl", name: "黑膠唱片", desc: "復古旋轉唱片風格" },
];

// 世界書佈局選項
const worldBookLayouts = [
  { id: "shelf", name: "書架模式", desc: "真實書架展示藏書" },
  { id: "featured", name: "精選模式", desc: "3D 封面展示當前閱讀" },
  { id: "icon", name: "圖標模式", desc: "簡約 App 圖標風格" },
];

// 角色手機佈局選項
const charPhoneLayouts = [
  { id: "phone", name: "手機模式", desc: "模擬角色手機界面" },
  { id: "icon", name: "圖標模式", desc: "簡約 App 圖標風格" },
];

// 拍立得和其他小工具佈局選項
const styleLayouts = [
  { id: "pop", name: "普普風", desc: "新粗野派立體互動" },
  { id: "classic", name: "極簡", desc: "傳統簡約留白" },
  { id: "flat", name: "平面", desc: "圓潤撞色插圖感" },
  { id: "illustration", name: "復古", desc: "90年代復古視窗" },
  { id: "pixel", name: "像素", desc: "點陣微復古網格" },
];

// 當前佈局（本地副本）
const currentLayout = ref(
  props.widget.data?.customStyle?.layout ||
    (props.widget.type === "world-book"
      ? "shelf"
      : props.widget.type === "char-phone"
        ? "phone"
        : [
              "polaroid",
              "mood-diary",
              "quote",
              "todo",
              "focus-timer",
              "weather",
              "calendar",
            ].includes(props.widget.type)
          ? "pop"
          : "compact"),
);

// 黑膠唱片子風格選項（與 styleLayouts 一致）
const vinylStyles = [
  { id: "pop", name: "普普風", desc: "新粗野派立體互動" },
  { id: "classic", name: "極簡", desc: "傳統簡約留白" },
  { id: "flat", name: "平面", desc: "圓潤撞色插圖感" },
  { id: "illustration", name: "復古", desc: "90年代復古視窗" },
  { id: "pixel", name: "像素", desc: "點陣微復古網格" },
];

// 當前黑膠子風格
const currentVinylStyle = ref(
  props.widget.data?.customStyle?.vinylStyle || "pop",
);

// 選擇黑膠子風格
function selectVinylStyle(styleId: string) {
  currentVinylStyle.value = styleId;
  localStyle.value.vinylStyle = styleId;
}

// 選擇佈局
function selectLayout(layoutId: string) {
  currentLayout.value = layoutId;
  localStyle.value.layout = layoutId;

  // 根據佈局自動調整一些默認樣式
  if (layoutId === "vinyl" && props.widget.type === "music") {
    localStyle.value.borderColor = "rgba(255, 255, 255, 0.1)";
    localStyle.value.borderWidth = 1;
  }
}

// 圖標選擇器顯示狀態
const showIconPicker = ref(false);

// 自定義顏色輸入
const customColorInput = ref("");

// 是否有圖標設定選項（只有 fluid-button 類型才顯示）
const showIconSettings = computed(() => {
  return props.widget.type === "fluid-button";
});

// 當前選中的背景類型
const backgroundType = computed({
  get: () => (localStyle.value.backgroundGradient ? "gradient" : "solid"),
  set: (val) => {
    if (val === "solid") {
      localStyle.value.backgroundGradient = undefined;
    } else {
      localStyle.value.backgroundColor = undefined;
    }
  },
});

// 選擇純色背景
function selectBackgroundColor(color: string) {
  localStyle.value.backgroundColor = color;
  localStyle.value.backgroundGradient = undefined;
}

// 選擇漸變背景
function selectGradient(gradient: string) {
  localStyle.value.backgroundGradient = gradient;
  localStyle.value.backgroundColor = undefined;
}

// 選擇前景色（圖標）
function selectForegroundColor(color: string) {
  localStyle.value.foregroundColor = color;
}

// 選擇文字顏色
function selectTextColor(color: string) {
  localStyle.value.textColor = color;
}

// 選擇邊框色
function selectBorderColor(color: string) {
  localStyle.value.borderColor = color;
}

// 應用主題預設
function applyTheme(theme: (typeof colorThemes)[0]) {
  localStyle.value.backgroundColor = theme.backgroundColor;
  localStyle.value.backgroundGradient = theme.backgroundGradient;
  localStyle.value.foregroundColor = theme.foregroundColor;
  localStyle.value.textColor = undefined;
  localStyle.value.borderColor = theme.borderColor;
}

// 選擇預設圖標
function onIconSelect(iconName: string) {
  localStyle.value.iconType = "preset";
  localStyle.value.iconName = iconName;
  localStyle.value.customIconUrl = undefined;
  showIconPicker.value = false;
}

// 選擇自定義圖標
function onCustomIconSelect(imageUrl: string) {
  localStyle.value.iconType = "custom";
  localStyle.value.customIconUrl = imageUrl;
  localStyle.value.iconName = undefined;
  showIconPicker.value = false;
}

// 重置樣式
function resetStyle() {
  localStyle.value = {
    backgroundColor: undefined,
    backgroundGradient: undefined,
    foregroundColor: undefined,
    textColor: undefined,
    borderColor: undefined,
    borderWidth: undefined,
    layout: undefined,
    iconType: undefined,
    iconName: undefined,
    customIconUrl: undefined,
    iconSize: undefined,
    shape: undefined,
  };

  if (props.widget.type === "world-book") {
    currentLayout.value = "shelf";
  } else if (props.widget.type === "char-phone") {
    currentLayout.value = "phone";
  } else if (
    [
      "polaroid",
      "mood-diary",
      "quote",
      "todo",
      "focus-timer",
      "weather",
      "calendar",
    ].includes(props.widget.type)
  ) {
    currentLayout.value = "pop";
  } else {
    currentLayout.value = "compact";
  }

  // 重置時鐘設定
  if (props.widget.type === "clock") {
    clockStyleValue.value = "minimal";
    showSecondsValue.value = true;
    showDateValue.value = true;
    clockColorValue.value = "";
  }

  // 重置行事曆顏色
  if (props.widget.type === "calendar") {
    calendarColors.value = { today: "", holiday: "", weekday: "" };
  }

  // 重置天氣數據
  if (props.widget.type === "weather") {
    weatherStore.clearCache();
    weatherStore.refreshWeather(true);
  }
}

// 保存並關閉
function saveAndClose() {
  // 過濾掉 undefined 值
  const cleanStyle: WidgetCustomStyle = {};

  if (localStyle.value.backgroundColor)
    cleanStyle.backgroundColor = localStyle.value.backgroundColor;
  if (localStyle.value.backgroundGradient)
    cleanStyle.backgroundGradient = localStyle.value.backgroundGradient;
  if (localStyle.value.foregroundColor)
    cleanStyle.foregroundColor = localStyle.value.foregroundColor;
  if (localStyle.value.textColor)
    cleanStyle.textColor = localStyle.value.textColor;
  if (localStyle.value.borderColor)
    cleanStyle.borderColor = localStyle.value.borderColor;
  if (localStyle.value.borderWidth !== undefined)
    cleanStyle.borderWidth = localStyle.value.borderWidth;
  if (localStyle.value.iconType)
    cleanStyle.iconType = localStyle.value.iconType;
  if (localStyle.value.iconName)
    cleanStyle.iconName = localStyle.value.iconName;
  if (localStyle.value.customIconUrl)
    cleanStyle.customIconUrl = localStyle.value.customIconUrl;
  if (localStyle.value.iconSize !== undefined)
    cleanStyle.iconSize = localStyle.value.iconSize;
  if (localStyle.value.layout) cleanStyle.layout = localStyle.value.layout;
  if (localStyle.value.vinylStyle)
    cleanStyle.vinylStyle = localStyle.value.vinylStyle;
  if (localStyle.value.shape) cleanStyle.shape = localStyle.value.shape;

  // 如果沒有任何自定義，則清空 customStyle
  const hasCustomStyle = Object.keys(cleanStyle).length > 0;

  // 構建更新數據
  const updateData: Record<string, any> = {
    ...props.widget.data,
    customStyle: hasCustomStyle ? cleanStyle : undefined,
  };

  // 時鐘特有設定
  if (props.widget.type === "clock") {
    updateData.clockStyle = clockStyleValue.value;
    updateData.showSeconds = showSecondsValue.value;
    updateData.showDate = showDateValue.value;
    updateData.clockColor = clockColorValue.value || undefined;
  }

  // 行事曆特有設定
  if (props.widget.type === "calendar") {
    const cc = calendarColors.value;
    updateData.calendarColors =
      cc.today || cc.holiday || cc.weekday
        ? {
            today: cc.today || undefined,
            holiday: cc.holiday || undefined,
            weekday: cc.weekday || undefined,
          }
        : undefined;
  }

  canvasStore.updateWidgetData(props.widget.id, updateData);

  emit("close");
}

// 預覽樣式
const previewStyle = computed(() => {
  // 如果是黑膠風格，根據子風格設定背景
  if (localStyle.value.layout === "vinyl") {
    const vinylPreviewMap: Record<string, Record<string, string>> = {
      pop: {
        background: "#fce7f3",
        color: "#1a1a1a",
        borderColor: "#1a1a1a",
        borderWidth: "3px",
        borderStyle: "solid",
      },
      classic: {
        background: "linear-gradient(135deg, #2c3e50 0%, #000000 100%)",
        color: "white",
        borderColor: "rgba(255,255,255,0.1)",
        borderWidth: "1px",
        borderStyle: "solid",
      },
      flat: {
        background: "#FFF0F5",
        color: "#332650",
        borderColor: "#332650",
        borderWidth: "3px",
        borderStyle: "solid",
      },
      illustration: {
        background: "#F6F3EB",
        color: "#1a1a1a",
        borderColor: "#1a1a1a",
        borderWidth: "2px",
        borderStyle: "solid",
      },
      pixel: {
        background: "#FFF1F5",
        color: "#d06d9a",
        borderColor: "#F4A2C5",
        borderWidth: "4px",
        borderStyle: "solid",
      },
    };
    return vinylPreviewMap[currentVinylStyle.value] || vinylPreviewMap.pop;
  }

  // 如果是 Classic 風格且沒選背景，使用默認漸變
  if (
    localStyle.value.layout === "classic" &&
    !localStyle.value.backgroundColor &&
    !localStyle.value.backgroundGradient
  ) {
    return {
      background:
        "linear-gradient(to bottom, rgba(255,255,255,0.95), rgba(240,240,250,0.95))",
      color: "#333",
    };
  }

  const style: Record<string, string> = {};

  if (localStyle.value.backgroundGradient) {
    style.background = localStyle.value.backgroundGradient;
  } else if (localStyle.value.backgroundColor) {
    style.backgroundColor = localStyle.value.backgroundColor;
  }

  if (localStyle.value.borderColor) {
    style.borderColor = localStyle.value.borderColor;
    style.borderWidth = `${localStyle.value.borderWidth || 2}px`;
    style.borderStyle = "solid";
  }

  return style;
});

const previewContentStyle = computed(() => {
  const style: Record<string, string> = {};

  if (localStyle.value.textColor) {
    style.color = localStyle.value.textColor;
  } else if (localStyle.value.foregroundColor) {
    style.color = localStyle.value.foregroundColor;
  }

  return style;
});

// 防止滾動穿透
onMounted(() => {
  document.body.style.overflow = "hidden";
  document.body.style.touchAction = "none";
});

onUnmounted(() => {
  document.body.style.overflow = "";
  document.body.style.touchAction = "";
});

// color input 只接受 #rrggbb，過濾掉 rgba/transparent 等格式
function toHexColor(color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  return fallback;
}
</script>

<template>
  <div class="widget-settings-panel" @touchmove.prevent>
    <div class="panel-backdrop" @click="emit('close')" @touchmove.prevent></div>

    <div class="panel-content" @touchmove.stop>
      <!-- 標題 -->
      <div class="panel-header">
        <h3>組件設定</h3>
        <button class="close-btn" @click="emit('close')">
          <X :size="20" :stroke-width="2" />
        </button>
      </div>

      <!-- 預覽區域 -->
      <div class="preview-section">
        <div class="preview-label">預覽效果</div>
        <div class="preview-box" :style="previewStyle">
          <span class="preview-text" :style="previewContentStyle">
            {{ widget.data?.label || "預覽" }}
          </span>
        </div>
      </div>

      <!-- 標籤頁 -->
      <div class="tabs" v-if="showIconSettings">
        <button
          :class="['tab', { active: activeTab === 'color' }]"
          @click="activeTab = 'color'"
        >
          <Palette :size="16" />
          色彩
        </button>
        <button
          :class="['tab', { active: activeTab === 'shape' }]"
          @click="activeTab = 'shape'"
        >
          <Shapes :size="16" />
          形狀
        </button>
        <button
          :class="['tab', { active: activeTab === 'icon' }]"
          @click="activeTab = 'icon'"
        >
          <ImageIcon :size="16" />
          圖標
        </button>
      </div>

      <!-- 色彩設定 -->
      <div v-show="activeTab === 'color'" class="settings-section">
        <!-- 時鐘樣式選擇 (僅時鐘) -->
        <div v-if="widget.type === 'clock'" class="setting-group">
          <div class="group-label">
            <Clock
              :size="14"
              style="
                display: inline-block;
                vertical-align: middle;
                margin-right: 4px;
              "
            />
            時鐘樣式
          </div>
          <div class="clock-styles-grid">
            <button
              v-for="style in clockStyles"
              :key="style.id"
              :class="[
                'clock-style-item',
                { active: clockStyleValue === style.id },
              ]"
              @click="clockStyleValue = style.id"
            >
              <span class="style-icon">{{ style.icon }}</span>
              <span class="style-name">{{ style.name }}</span>
              <span class="style-desc">{{ style.desc }}</span>
            </button>
          </div>

          <!-- 時鐘顯示選項 -->
          <div class="clock-options">
            <label class="toggle-option">
              <input type="checkbox" v-model="showSecondsValue" />
              <span class="toggle-label">顯示秒數</span>
            </label>
            <label class="toggle-option">
              <input type="checkbox" v-model="showDateValue" />
              <span class="toggle-label">顯示日期</span>
            </label>
          </div>

          <!-- 時鐘顏色（僅 minimal/digital/flip 等文字型時鐘） -->
          <div
            v-if="
              ['minimal', 'digital', 'flip', 'analog'].includes(clockStyleValue)
            "
            class="clock-color-row"
          >
            <span class="clock-color-label">時鐘顏色</span>
            <div class="clock-color-swatches">
              <button
                v-for="c in [
                  '',
                  '#1f2937',
                  '#ffffff',
                  '#7dd3a8',
                  '#f5a9b8',
                  '#89CFF0',
                  '#FFB347',
                  '#a78bfa',
                  '#fb7185',
                ]"
                :key="c"
                :class="['clock-swatch', { active: clockColorValue === c }]"
                :style="c ? { backgroundColor: c } : {}"
                @click="clockColorValue = c"
              >
                <span v-if="!c" class="swatch-auto">自動</span>
              </button>
              <!-- 自訂顏色 -->
              <label
                :class="[
                  'clock-swatch custom-swatch',
                  {
                    active:
                      clockColorValue &&
                      ![
                        '',
                        '#1f2937',
                        '#ffffff',
                        '#7dd3a8',
                        '#f5a9b8',
                        '#89CFF0',
                        '#FFB347',
                        '#a78bfa',
                        '#fb7185',
                      ].includes(clockColorValue),
                  },
                ]"
                :style="
                  clockColorValue &&
                  ![
                    '',
                    '#1f2937',
                    '#ffffff',
                    '#7dd3a8',
                    '#f5a9b8',
                    '#89CFF0',
                    '#FFB347',
                    '#a78bfa',
                    '#fb7185',
                  ].includes(clockColorValue)
                    ? { backgroundColor: clockColorValue }
                    : {}
                "
              >
                <Palette :size="12" />
                <input
                  type="color"
                  class="hidden-color-input"
                  :value="toHexColor(clockColorValue, '#000000')"
                  @input="
                    clockColorValue = ($event.target as HTMLInputElement).value
                  "
                />
              </label>
            </div>
          </div>
        </div>

        <!-- 行事曆顏色設定 -->
        <div v-if="widget.type === 'calendar'" class="setting-group">
          <div class="group-label">日期顏色</div>
          <div class="cal-color-blocks">
            <div
              v-for="item in [
                { key: 'today', label: '今日高亮', default: '#6366f1' },
                { key: 'holiday', label: '節假日', default: '#f59e0b' },
                { key: 'weekday', label: '一般日期', default: '#374151' },
              ]"
              :key="item.key"
              class="cal-color-block"
            >
              <div class="cal-block-header">
                <span class="cal-block-label">{{ item.label }}</span>
                <span
                  class="cal-block-preview"
                  :style="{
                    background:
                      calendarColors[item.key as keyof typeof calendarColors] ||
                      item.default,
                  }"
                ></span>
              </div>
              <div class="cal-swatches">
                <button
                  v-for="c in [
                    '',
                    item.default,
                    '#7dd3a8',
                    '#f5a9b8',
                    '#89CFF0',
                    '#FFB347',
                    '#e53e3e',
                    '#1f2937',
                    '#ffffff',
                  ]"
                  :key="c"
                  :class="[
                    'cal-swatch',
                    {
                      active:
                        calendarColors[
                          item.key as keyof typeof calendarColors
                        ] === c,
                    },
                  ]"
                  :style="c ? { backgroundColor: c } : {}"
                  @click="
                    calendarColors[item.key as keyof typeof calendarColors] = c
                  "
                >
                  <span v-if="!c" class="swatch-auto">自動</span>
                </button>
                <label
                  class="cal-swatch cal-swatch-custom"
                  :class="{
                    active:
                      !!calendarColors[
                        item.key as keyof typeof calendarColors
                      ] &&
                      calendarColors[
                        item.key as keyof typeof calendarColors
                      ] !== item.default &&
                      ![
                        '',
                        '#7dd3a8',
                        '#f5a9b8',
                        '#89CFF0',
                        '#FFB347',
                        '#e53e3e',
                        '#1f2937',
                        '#ffffff',
                      ].includes(
                        calendarColors[item.key as keyof typeof calendarColors],
                      ),
                  }"
                  :style="
                    calendarColors[item.key as keyof typeof calendarColors] &&
                    calendarColors[item.key as keyof typeof calendarColors] !==
                      item.default &&
                    ![
                      '',
                      '#7dd3a8',
                      '#f5a9b8',
                      '#89CFF0',
                      '#FFB347',
                      '#e53e3e',
                      '#1f2937',
                      '#ffffff',
                    ].includes(
                      calendarColors[item.key as keyof typeof calendarColors],
                    )
                      ? {
                          backgroundColor:
                            calendarColors[
                              item.key as keyof typeof calendarColors
                            ],
                        }
                      : {}
                  "
                >
                  <Palette :size="11" />
                  <input
                    type="color"
                    class="hidden-color-input"
                    :value="
                      toHexColor(
                        calendarColors[item.key as keyof typeof calendarColors],
                        item.default,
                      )
                    "
                    @input="
                      calendarColors[item.key as keyof typeof calendarColors] =
                        ($event.target as HTMLInputElement).value
                    "
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- 佈局選擇 (僅音樂播放器) -->
        <div v-if="widget.type === 'music'" class="setting-group">
          <div class="group-label">顯示風格</div>
          <div class="layouts-grid">
            <button
              v-for="layout in musicLayouts"
              :key="layout.id"
              :class="['layout-item', { active: currentLayout === layout.id }]"
              @click="selectLayout(layout.id)"
            >
              <span class="layout-name">{{ layout.name }}</span>
              <span class="layout-desc">{{ layout.desc }}</span>
            </button>
          </div>
        </div>

        <!-- 黑膠唱片子風格選擇 -->
        <div
          v-if="widget.type === 'music' && currentLayout === 'vinyl'"
          class="setting-group"
        >
          <div class="group-label">黑膠風格</div>
          <div class="layouts-grid">
            <button
              v-for="vs in vinylStyles"
              :key="vs.id"
              :class="['layout-item', { active: currentVinylStyle === vs.id }]"
              @click="selectVinylStyle(vs.id)"
            >
              <span class="layout-name">{{ vs.name }}</span>
              <span class="layout-desc">{{ vs.desc }}</span>
            </button>
          </div>
        </div>

        <!-- 佈局選擇 (僅世界書) -->
        <div v-if="widget.type === 'world-book'" class="setting-group">
          <div class="group-label">顯示風格</div>
          <div class="layouts-grid">
            <button
              v-for="layout in worldBookLayouts"
              :key="layout.id"
              :class="['layout-item', { active: currentLayout === layout.id }]"
              @click="selectLayout(layout.id)"
            >
              <span class="layout-name">{{ layout.name }}</span>
              <span class="layout-desc">{{ layout.desc }}</span>
            </button>
          </div>
        </div>

        <!-- 佈局選擇 (僅角色手機) -->
        <div v-if="widget.type === 'char-phone'" class="setting-group">
          <div class="group-label">顯示風格</div>
          <div class="layouts-grid">
            <button
              v-for="layout in charPhoneLayouts"
              :key="layout.id"
              :class="['layout-item', { active: currentLayout === layout.id }]"
              @click="selectLayout(layout.id)"
            >
              <span class="layout-name">{{ layout.name }}</span>
              <span class="layout-desc">{{ layout.desc }}</span>
            </button>
          </div>
        </div>

        <!-- 佈局選擇 (支持防普普風切換的組件) -->
        <div
          v-if="
            [
              'polaroid',
              'mood-diary',
              'quote',
              'todo',
              'focus-timer',
              'weather',
              'calendar',
            ].includes(widget.type)
          "
          class="setting-group"
        >
          <div class="group-label">顯示風格</div>
          <div class="layouts-grid">
            <button
              v-for="layout in styleLayouts"
              :key="layout.id"
              :class="['layout-item', { active: currentLayout === layout.id }]"
              @click="selectLayout(layout.id)"
            >
              <span class="layout-name">{{ layout.name }}</span>
              <span class="layout-desc">{{ layout.desc }}</span>
            </button>
          </div>
        </div>

        <!-- 快速主題 -->
        <div class="setting-group">
          <div class="group-label">快速主題</div>
          <div class="themes-grid">
            <button
              v-for="theme in colorThemes"
              :key="theme.id"
              class="theme-item"
              :style="{
                background: theme.backgroundGradient || theme.backgroundColor,
                color: theme.foregroundColor,
              }"
              @click="applyTheme(theme)"
            >
              {{ theme.name }}
            </button>
          </div>
        </div>

        <!-- 背景色 -->
        <div class="setting-group">
          <div class="group-label">背景色</div>
          <div class="color-type-tabs">
            <button
              :class="['type-tab', { active: backgroundType === 'solid' }]"
              @click="backgroundType = 'solid'"
            >
              純色
            </button>
            <button
              :class="['type-tab', { active: backgroundType === 'gradient' }]"
              @click="backgroundType = 'gradient'"
            >
              漸變
            </button>
          </div>

          <!-- 純色選擇 -->
          <div v-if="backgroundType === 'solid'" class="colors-grid">
            <button
              v-for="color in backgroundColors"
              :key="color"
              :class="[
                'color-item',
                { active: localStyle.backgroundColor === color },
              ]"
              :style="{
                backgroundColor: color === 'transparent' ? '#fff' : color,
              }"
              @click="selectBackgroundColor(color)"
            >
              <span v-if="color === 'transparent'" class="no-border">✕</span>
            </button>
            <!-- 自訂顏色 -->
            <label
              :class="[
                'color-item custom-color-picker',
                {
                  active:
                    localStyle.backgroundColor &&
                    localStyle.backgroundColor !== 'transparent' &&
                    !backgroundColors.includes(localStyle.backgroundColor),
                },
              ]"
              :style="{
                backgroundColor:
                  localStyle.backgroundColor &&
                  localStyle.backgroundColor !== 'transparent' &&
                  !backgroundColors.includes(localStyle.backgroundColor)
                    ? localStyle.backgroundColor
                    : undefined,
              }"
            >
              <Palette :size="16" />
              <input
                type="color"
                class="hidden-color-input"
                :value="toHexColor(localStyle.backgroundColor, '#ffffff')"
                @input="
                  selectBackgroundColor(
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </label>
          </div>

          <!-- 漸變選擇 -->
          <div v-else class="gradients-grid">
            <button
              v-for="gradient in gradientPresets"
              :key="gradient.id"
              :class="[
                'gradient-item',
                { active: localStyle.backgroundGradient === gradient.value },
              ]"
              :style="{ background: gradient.value }"
              @click="selectGradient(gradient.value)"
            >
              <span class="gradient-name">{{ gradient.name }}</span>
            </button>
          </div>
        </div>

        <!-- 圖標顏色 -->
        <div class="setting-group">
          <div class="group-label">圖標顏色</div>
          <div class="colors-grid">
            <button
              v-for="color in foregroundColors"
              :key="color"
              :class="[
                'color-item',
                { active: localStyle.foregroundColor === color },
              ]"
              :style="{ backgroundColor: color }"
              @click="selectForegroundColor(color)"
            />
            <!-- 自訂顏色 -->
            <label
              :class="[
                'color-item custom-color-picker',
                {
                  active:
                    localStyle.foregroundColor &&
                    !foregroundColors.includes(localStyle.foregroundColor),
                },
              ]"
              :style="{
                backgroundColor:
                  localStyle.foregroundColor &&
                  !foregroundColors.includes(localStyle.foregroundColor)
                    ? localStyle.foregroundColor
                    : undefined,
              }"
            >
              <Palette :size="16" />
              <input
                type="color"
                class="hidden-color-input"
                :value="toHexColor(localStyle.foregroundColor, '#000000')"
                @input="
                  selectForegroundColor(
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </label>
          </div>
        </div>

        <!-- 文字顏色 -->
        <div class="setting-group">
          <div class="group-label">文字顏色</div>
          <div class="colors-grid">
            <button
              v-for="color in foregroundColors"
              :key="'text-' + color"
              :class="[
                'color-item',
                { active: localStyle.textColor === color },
              ]"
              :style="{ backgroundColor: color }"
              @click="selectTextColor(color)"
            />
            <!-- 自訂顏色 -->
            <label
              :class="[
                'color-item custom-color-picker',
                {
                  active:
                    localStyle.textColor &&
                    !foregroundColors.includes(localStyle.textColor),
                },
              ]"
              :style="{
                backgroundColor:
                  localStyle.textColor &&
                  !foregroundColors.includes(localStyle.textColor)
                    ? localStyle.textColor
                    : undefined,
              }"
            >
              <Palette :size="16" />
              <input
                type="color"
                class="hidden-color-input"
                :value="toHexColor(localStyle.textColor, '#000000')"
                @input="
                  selectTextColor(($event.target as HTMLInputElement).value)
                "
              />
            </label>
          </div>
        </div>

        <!-- 邊框色 -->
        <div class="setting-group">
          <div class="group-label">邊框顏色</div>
          <div class="colors-grid">
            <button
              v-for="color in borderColors"
              :key="color"
              :class="[
                'color-item border-color',
                { active: localStyle.borderColor === color },
              ]"
              :style="{
                backgroundColor: color === 'transparent' ? '#fff' : color,
              }"
              @click="selectBorderColor(color)"
            >
              <span v-if="color === 'transparent'" class="no-border">✕</span>
            </button>
            <!-- 自訂顏色 -->
            <label
              :class="[
                'color-item custom-color-picker',
                {
                  active:
                    localStyle.borderColor &&
                    localStyle.borderColor !== 'transparent' &&
                    !borderColors.includes(localStyle.borderColor),
                },
              ]"
              :style="{
                backgroundColor:
                  localStyle.borderColor &&
                  localStyle.borderColor !== 'transparent' &&
                  !borderColors.includes(localStyle.borderColor)
                    ? localStyle.borderColor
                    : undefined,
              }"
            >
              <Palette :size="16" />
              <input
                type="color"
                class="hidden-color-input"
                :value="toHexColor(localStyle.borderColor, '#000000')"
                @input="
                  selectBorderColor(($event.target as HTMLInputElement).value)
                "
              />
            </label>
          </div>
        </div>
      </div>

      <!-- 形狀設定 -->
      <div
        v-show="activeTab === 'shape' && showIconSettings"
        class="settings-section"
      >
        <div class="setting-group">
          <div class="group-label">選擇形狀</div>
          <div class="shapes-grid">
            <button
              v-for="shape in shapePresets"
              :key="shape.id"
              :class="['shape-item', { active: localStyle.shape === shape.id }]"
              @click="
                localStyle.shape =
                  localStyle.shape === shape.id ? undefined : shape.id
              "
            >
              <svg class="shape-preview" viewBox="0 0 60 60" fill="none">
                <path
                  :d="shape.previewPath"
                  fill="currentColor"
                  opacity="0.15"
                  stroke="currentColor"
                  stroke-width="1.5"
                />
              </svg>
              <span class="shape-name">{{ shape.name }}</span>
            </button>
          </div>
          <p class="shape-hint">點擊已選形狀可取消，恢復預設流體形狀</p>
        </div>
      </div>

      <!-- 圖標設定 -->
      <div
        v-show="activeTab === 'icon' && showIconSettings"
        class="settings-section"
      >
        <div class="setting-group">
          <div class="group-label">當前圖標</div>
          <div class="current-icon">
            <div v-if="localStyle.customIconUrl" class="icon-preview custom">
              <img :src="localStyle.customIconUrl" alt="自定義圖標" />
            </div>
            <div v-else-if="localStyle.iconName" class="icon-preview preset">
              {{ localStyle.iconName }}
            </div>
            <div v-else class="icon-preview default">使用預設</div>
          </div>
          <button class="change-icon-btn" @click="showIconPicker = true">
            <ImageIcon :size="16" />
            更換圖標
          </button>
        </div>

        <!-- 圖標大小調整 -->
        <div class="setting-group">
          <div class="group-label">
            圖標大小
            <span class="size-value">{{ localStyle.iconSize || 50 }}%</span>
          </div>
          <input
            type="range"
            class="size-slider"
            :value="localStyle.iconSize || 50"
            min="20"
            max="110"
            step="5"
            @input="
              localStyle.iconSize = Number(
                ($event.target as HTMLInputElement).value,
              )
            "
          />
          <div class="slider-labels">
            <span>小</span>
            <span>大</span>
          </div>
        </div>
      </div>

      <!-- 底部按鈕 -->
      <div class="panel-footer">
        <button class="footer-btn reset" @click="resetStyle">
          <RotateCcw :size="16" />
          重置
        </button>
        <button class="footer-btn save" @click="saveAndClose">
          <Check :size="16" />
          保存
        </button>
      </div>
    </div>

    <!-- 圖標選擇器 -->
    <IconPickerPanel
      v-if="showIconPicker"
      @select="onIconSelect"
      @select-custom="onCustomIconSelect"
      @close="showIconPicker = false"
    />
  </div>
</template>

<style lang="scss" scoped>
.widget-settings-panel {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.panel-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.panel-content {
  position: relative;
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  background: #ffffff;
  border-radius: 24px 24px 0 0;
  padding: 20px;
  padding-bottom: max(20px, var(--safe-bottom, 0px));
  animation: slideUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  transform: translateZ(0);
  will-change: transform;
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;

  h3 {
    font-size: 18px;
    font-weight: 700;
    color: #1f2937;
  }

  .close-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #f3f4f6;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
    transition: all 0.2s;

    &:hover {
      background: #e5e7eb;
      color: #374151;
    }
  }
}

// 預覽區域
.preview-section {
  margin-bottom: 20px;
}

.preview-label {
  font-size: 13px;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 8px;
}

.preview-box {
  height: 80px;
  border-radius: 16px;
  background: #f8fafc;
  border: 2px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}

.preview-text {
  font-size: 16px;
  font-weight: 600;
  color: #374151;
}

// 標籤頁
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  background: #f3f4f6;
  border-radius: 12px;
  padding: 4px;
}

.tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  color: #6b7280;
  transition: all 0.2s;

  &:hover {
    color: #374151;
  }

  &.active {
    background: white;
    color: #4f46e5;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }
}

// 設定區塊
.settings-section {
  max-height: 40vh;
  min-height: 150px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding-right: 4px;

  // PC 端給更多空間
  @media (min-width: 768px) {
    max-height: 45vh;
  }
}

.setting-group {
  margin-bottom: 20px;
}

.group-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 10px;
}

// 快速主題
.themes-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.theme-item {
  padding: 12px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  transition: all 0.2s;
  border: 2px solid transparent;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  &:active {
    transform: translateY(0);
  }
}

// 時鐘樣式網格
.clock-styles-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

.clock-style-item {
  padding: 10px 6px;
  border-radius: 12px;
  background: #f8fafc;
  border: 2px solid transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  text-align: center;
  transition: all 0.2s;

  &:hover {
    background: #f1f5f9;
    transform: translateY(-2px);
  }

  &.active {
    background: linear-gradient(135deg, #e0e7ff 0%, #ddd6fe 100%);
    border-color: #6366f1;

    .style-name {
      color: #4f46e5;
    }
  }

  .style-icon {
    font-size: 20px;
    line-height: 1;
  }

  .style-name {
    font-size: 12px;
    font-weight: 600;
    color: #374151;
  }

  .style-desc {
    font-size: 9px;
    color: #6b7280;
    line-height: 1.2;
  }
}

// 時鐘選項
.clock-options {
  display: flex;
  gap: 16px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 12px;
}

// 行事曆顏色設定
.cal-color-blocks {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cal-color-block {
  background: #f8fafc;
  border-radius: 12px;
  padding: 10px 12px;

  .cal-block-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .cal-block-label {
    font-size: 12px;
    font-weight: 600;
    color: #374151;
  }

  .cal-block-preview {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid rgba(0, 0, 0, 0.08);
    flex-shrink: 0;
  }

  .cal-swatches {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }
}

.cal-swatch {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  outline: 2px solid transparent;
  outline-offset: 2px;
  transition: all 0.15s;

  &:first-child {
    background: linear-gradient(135deg, #e5e7eb 50%, #9ca3af 50%);
  }

  &.active {
    outline-color: #6366f1;
  }

  .swatch-auto {
    font-size: 7px;
    font-weight: 700;
    color: #6b7280;
    line-height: 1;
  }

  &.cal-swatch-custom {
    background: #f3f4f6;
    border-color: #e5e7eb;
    cursor: pointer;
    position: relative;
    overflow: hidden;
  }
}

// 時鐘顏色列
.clock-color-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 12px;

  .clock-color-label {
    font-size: 12px;
    font-weight: 600;
    color: #374151;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .clock-color-swatches {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }
}

.clock-swatch {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
  outline: 2px solid transparent;
  outline-offset: 2px;

  &.active {
    outline-color: #6366f1;
  }

  &:first-child {
    background: linear-gradient(135deg, #e5e7eb 50%, #9ca3af 50%);
  }

  .swatch-auto {
    font-size: 8px;
    font-weight: 700;
    color: #6b7280;
    line-height: 1;
  }

  &.custom-swatch {
    background: #f3f4f6;
    border-color: #e5e7eb;
    cursor: pointer;
    position: relative;
    overflow: hidden;
  }
}

.toggle-option {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;

  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    accent-color: #6366f1;
    cursor: pointer;
  }

  .toggle-label {
    font-size: 13px;
    font-weight: 500;
    color: #374151;
  }
}

// 佈局網格
.layouts-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.layout-item {
  padding: 12px 8px;
  border-radius: 12px;
  background: #f8fafc;
  border: 2px solid transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
  transition: all 0.2s;

  &:hover {
    background: #f1f5f9;
  }

  &.active {
    background: #e0e7ff;
    border-color: #6366f1;

    .layout-name {
      color: #4f46e5;
    }
  }

  .layout-name {
    font-size: 13px;
    font-weight: 600;
    color: #374151;
  }

  .layout-desc {
    font-size: 10px;
    color: #6b7280;
    line-height: 1.2;
  }
}

// 顏色類型標籤
.color-type-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.type-tab {
  padding: 6px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  background: #f3f4f6;
  transition: all 0.2s;

  &:hover {
    background: #e5e7eb;
  }

  &.active {
    background: #4f46e5;
    color: white;
  }
}

// 顏色網格
.colors-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 10px;
}

.color-item {
  aspect-ratio: 1;
  border-radius: 12px;
  border: 3px solid transparent;
  transition: all 0.2s;
  position: relative;

  &:hover {
    transform: scale(1.1);
  }

  &.active {
    border-color: #4f46e5;
    box-shadow:
      0 0 0 2px white,
      0 0 0 4px #4f46e5;
  }

  &.border-color {
    border: 2px solid #e5e7eb;
  }

  .no-border {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: #9ca3af;
  }
}

// 自訂調色盤按鈕
.custom-color-picker {
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  cursor: pointer;
  border: 2px dashed #d1d5db;
  position: relative;
  overflow: hidden;

  &:hover {
    border-color: #9ca3af;
    color: #6b7280;
  }

  &.active {
    border-style: solid;
    border-color: #4f46e5;
    box-shadow:
      0 0 0 2px white,
      0 0 0 4px #4f46e5;
    color: white;
  }
}

.hidden-color-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

// 漸變網格
.gradients-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.gradient-item {
  aspect-ratio: 2/1;
  border-radius: 12px;
  border: 3px solid transparent;
  transition: all 0.2s;
  display: flex;
  align-items: flex-end;
  padding: 8px;

  &:hover {
    transform: scale(1.02);
  }

  &.active {
    border-color: #4f46e5;
    box-shadow:
      0 0 0 2px white,
      0 0 0 4px #4f46e5;
  }

  .gradient-name {
    font-size: 11px;
    font-weight: 600;
    color: white;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }
}

// 圖標設定
.current-icon {
  margin-bottom: 12px;
}

.icon-preview {
  width: 80px;
  height: 80px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 500;

  &.custom img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 16px;
  }

  &.preset {
    background: linear-gradient(135deg, #e0e7ff 0%, #ddd6fe 100%);
    color: #4f46e5;
  }

  &.default {
    background: #f3f4f6;
    color: #9ca3af;
  }
}

.change-icon-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border-radius: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
  }
}

// 形狀選擇網格
.shapes-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.shape-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px 8px;
  border-radius: 12px;
  background: #f8fafc;
  border: 2px solid transparent;
  transition: all 0.2s;
  color: #6b7280;

  &:hover {
    background: #f1f5f9;
    color: #4f46e5;
    transform: translateY(-2px);
  }

  &.active {
    background: #e0e7ff;
    border-color: #6366f1;
    color: #4f46e5;
  }

  .shape-preview {
    width: 36px;
    height: 36px;
  }

  .shape-name {
    font-size: 11px;
    font-weight: 500;
    line-height: 1;
  }
}

.shape-hint {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 8px;
  text-align: center;
}

// 圖標大小滑桿
.size-value {
  float: right;
  font-weight: 400;
  color: #6b7280;
  font-size: 12px;
}

.size-slider {
  width: 100%;
  height: 6px;
  appearance: none;
  background: #e5e7eb;
  border-radius: 3px;
  outline: none;

  &::-webkit-slider-thumb {
    appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #6366f1;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(99, 102, 241, 0.3);
  }
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #9ca3af;
  margin-top: 4px;
}

// 底部按鈕
.panel-footer {
  display: flex;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
}

.footer-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 20px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 600;
  transition: all 0.2s;

  &.reset {
    background: #f3f4f6;
    color: #6b7280;

    &:hover {
      background: #e5e7eb;
      color: #374151;
    }
  }

  &.save {
    background: linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%);
    color: #065f46;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(132, 250, 176, 0.4);
    }
  }
}
</style>
