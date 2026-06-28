// ===== WidgetSettingsPanel 設定狀態 composable =====
// 集中管理組件設定面板的全部本地狀態、setter、預覽 computed 與 save/reset 邏輯。
// 設計：母組件與各子組件共用同一份狀態來源；存檔/重置語意與原 WidgetSettingsPanel 完全一致。

import { useCanvasStore } from "@/stores";
import { useCharactersStore } from "@/stores/characters";
import { useWeatherStore } from "@/stores/weather";
import {
  backgroundColors,
  borderColors,
  colorThemes,
  foregroundColors,
  gradientPresets,
} from "@/styles/color-presets";
import { getShapeStyle, shapePresets } from "@/styles/shape-presets";
import type { ClockStyle, WidgetCustomStyle, WidgetInstance } from "@/types";
import { resolveWidgetIcon } from "@/utils/widgetIconMap";
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  characterLayoutMap,
  characterWidgetTypes,
  charPhoneLayouts,
  clockStyles,
  habitLayouts,
  musicLayouts,
  styleLayouts,
  vinylStyles,
  worldBookLayouts,
} from "./widgetSettingsOptions";

export function useWidgetSettings(
  widget: WidgetInstance,
  onClose: () => void,
) {
  const canvasStore = useCanvasStore();
  const weatherStore = useWeatherStore();
  const charactersStore = useCharactersStore();

  // ===== 角色綁定組件相關 =====
  const isCharacterWidget = computed(() =>
    characterWidgetTypes.includes(widget.type),
  );

  // 綁定的角色 ID（本地副本）
  const boundCharacterId = ref<string>(widget.data?.characterId || "");

  const characterLayouts = computed(
    () => characterLayoutMap[widget.type] || [],
  );

  // 角色組件當前佈局
  const characterLayout = ref<string>(
    widget.data?.layout || characterLayouts.value[0]?.id || "",
  );

  function selectCharacterLayout(layoutId: string) {
    characterLayout.value = layoutId;
  }

  // 當前編輯的樣式（本地副本）
  const localStyle = ref<WidgetCustomStyle>({
    backgroundColor: widget.data?.customStyle?.backgroundColor,
    backgroundGradient: widget.data?.customStyle?.backgroundGradient,
    foregroundColor: widget.data?.customStyle?.foregroundColor,
    textColor: widget.data?.customStyle?.textColor,
    borderColor: widget.data?.customStyle?.borderColor,
    borderWidth: widget.data?.customStyle?.borderWidth,
    layout: widget.data?.customStyle?.layout,
    vinylStyle: widget.data?.customStyle?.vinylStyle,
    iconType: widget.data?.customStyle?.iconType,
    iconName: widget.data?.customStyle?.iconName,
    customIconUrl: widget.data?.customStyle?.customIconUrl,
    iconSize: widget.data?.customStyle?.iconSize,
    iconOffsetX: widget.data?.customStyle?.iconOffsetX,
    iconOffsetY: widget.data?.customStyle?.iconOffsetY,
    iconScale: widget.data?.customStyle?.iconScale,
    shape: widget.data?.customStyle?.shape,
  });

  // 時鐘樣式（本地副本）
  const clockStyleValue = ref<ClockStyle>(
    widget.data?.clockStyle || "minimal",
  );
  const showSecondsValue = ref<boolean>(widget.data?.showSeconds ?? true);
  const showDateValue = ref<boolean>(widget.data?.showDate ?? true);
  const clockColorValue = ref<string>(widget.data?.clockColor || "");

  // 行事曆顏色設定
  const calendarColors = ref({
    today: widget.data?.calendarColors?.today || "",
    holiday: widget.data?.calendarColors?.holiday || "",
    weekday: widget.data?.calendarColors?.weekday || "",
  });

  // 分頁狀態
  const activeTab = ref<"color" | "icon" | "shape">("color");

  // 顏色選擇器類型
  const colorPickerType = ref<
    "background" | "gradient" | "foreground" | "border"
  >("background");

  // 當前佈局（本地副本）
  const currentLayout = ref(
    widget.data?.customStyle?.layout ||
      (widget.type === "world-book"
        ? "shelf"
        : widget.type === "char-phone"
          ? "phone"
          : widget.type === "habit-tracker"
            ? "list"
            : [
                  "polaroid",
                  "mood-diary",
                  "quote",
                  "todo",
                  "focus-timer",
                  "weather",
                  "calendar",
                ].includes(widget.type)
              ? "classic"
              : "compact"),
  );

  // 當前黑膠子風格
  const currentVinylStyle = ref(
    widget.data?.customStyle?.vinylStyle || "classic",
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
    if (layoutId === "vinyl" && widget.type === "music") {
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
    return widget.type === "fluid-button";
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
      iconOffsetX: undefined,
      iconOffsetY: undefined,
      iconScale: undefined,
      shape: undefined,
    };

    if (widget.type === "world-book") {
      currentLayout.value = "shelf";
    } else if (widget.type === "char-phone") {
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
      ].includes(widget.type)
    ) {
      currentLayout.value = "classic";
    } else {
      currentLayout.value = "compact";
    }

    // 重置時鐘設定
    if (widget.type === "clock") {
      clockStyleValue.value = "minimal";
      showSecondsValue.value = true;
      showDateValue.value = true;
      clockColorValue.value = "";
    }

    // 重置行事曆顏色
    if (widget.type === "calendar") {
      calendarColors.value = { today: "", holiday: "", weekday: "" };
    }

    // 重置天氣數據
    if (widget.type === "weather") {
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
    if (
      localStyle.value.iconOffsetX !== undefined &&
      localStyle.value.iconOffsetX !== 0
    )
      cleanStyle.iconOffsetX = localStyle.value.iconOffsetX;
    if (
      localStyle.value.iconOffsetY !== undefined &&
      localStyle.value.iconOffsetY !== 0
    )
      cleanStyle.iconOffsetY = localStyle.value.iconOffsetY;
    if (
      localStyle.value.iconScale !== undefined &&
      localStyle.value.iconScale !== 1
    )
      cleanStyle.iconScale = localStyle.value.iconScale;
    if (localStyle.value.layout) cleanStyle.layout = localStyle.value.layout;
    if (localStyle.value.vinylStyle)
      cleanStyle.vinylStyle = localStyle.value.vinylStyle;
    if (localStyle.value.shape) cleanStyle.shape = localStyle.value.shape;

    // 如果沒有任何自定義，則清空 customStyle
    const hasCustomStyle = Object.keys(cleanStyle).length > 0;

    // 構建更新數據
    const updateData: Record<string, any> = {
      ...widget.data,
      customStyle: hasCustomStyle ? cleanStyle : undefined,
    };

    // 時鐘特有設定
    if (widget.type === "clock") {
      updateData.clockStyle = clockStyleValue.value;
      updateData.showSeconds = showSecondsValue.value;
      updateData.showDate = showDateValue.value;
      updateData.clockColor = clockColorValue.value || undefined;
    }

    // 行事曆特有設定
    if (widget.type === "calendar") {
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

    // 角色綁定組件特有設定
    if (isCharacterWidget.value) {
      updateData.characterId = boundCharacterId.value || undefined;
      if (characterLayout.value) {
        updateData.layout = characterLayout.value;
      }
    }

    canvasStore.updateWidgetData(widget.id, updateData);

    onClose();
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
    // 角色組件：確保角色列表已載入供選擇器使用
    if (
      isCharacterWidget.value &&
      charactersStore.characters.length === 0 &&
      !charactersStore.isLoading
    ) {
      void charactersStore.loadCharacters();
    }
  });

  onUnmounted(() => {
    document.body.style.overflow = "";
    document.body.style.touchAction = "";
  });

  // === 圖標即時容器預覽 ===
  // 模擬 FluidButtonWidget .blob-shape 的形狀 + 背景 + 邊框
  const iconPreviewBlobStyle = computed(() => {
    const style: Record<string, string> = {};

    const shapeId = localStyle.value.shape;
    if (shapeId) {
      Object.assign(style, getShapeStyle(shapeId));
    } else {
      // 預設流體 blob
      style.borderRadius = "62% 38% 45% 55% / 52% 58% 42% 48%";
    }

    if (localStyle.value.backgroundGradient) {
      style.background = localStyle.value.backgroundGradient;
      style.border = "none";
    } else if (localStyle.value.backgroundColor) {
      style.backgroundColor = localStyle.value.backgroundColor;
      style.border = "none";
    }

    if (localStyle.value.borderColor) {
      style.borderColor = localStyle.value.borderColor;
      style.borderWidth = `${localStyle.value.borderWidth || 2}px`;
      style.borderStyle = "solid";
    }

    return style;
  });

  // 預覽中的圖標元素樣式（大小 / X / Y 偏移 / 縮放 / 顏色）
  const iconPreviewIconStyle = computed(() => {
    const size = localStyle.value.iconSize ?? 50;
    const offsetX = localStyle.value.iconOffsetX ?? 0;
    const offsetY = localStyle.value.iconOffsetY ?? 0;
    const scale = localStyle.value.iconScale ?? 1;

    const style: Record<string, string> = {
      width: `${size}%`,
      height: `${size}%`,
      transform: `translate(${offsetX}%, ${offsetY}%) scale(${scale})`,
    };

    if (localStyle.value.foregroundColor) {
      style.color = localStyle.value.foregroundColor;
    }

    return style;
  });

  // 預覽是否使用自訂圖片
  const previewUsesCustomImage = computed(
    () => !!localStyle.value.customIconUrl,
  );

  // 預覽用預設圖標組件（依 iconName 或 widget label 解析）
  const previewIconComponent = computed(() => {
    return resolveWidgetIcon(
      localStyle.value.iconName || widget.data?.label,
    );
  });

  // 將 X/Y 設回置中
  function centerIconOffset() {
    localStyle.value.iconOffsetX = undefined;
    localStyle.value.iconOffsetY = undefined;
  }

  // 重置圖標縮放為 1x
  function resetIconScale() {
    localStyle.value.iconScale = undefined;
  }

  // color input 只接受 #rrggbb，過濾掉 rgba/transparent 等格式
  function toHexColor(color: string | undefined, fallback: string): string {
    if (!color) return fallback;
    if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
    return fallback;
  }

  return {
    // stores
    charactersStore,
    // 角色綁定
    isCharacterWidget,
    boundCharacterId,
    characterLayouts,
    characterLayout,
    selectCharacterLayout,
    // 樣式狀態
    localStyle,
    // 時鐘
    clockStyleValue,
    showSecondsValue,
    showDateValue,
    clockColorValue,
    clockStyles,
    // 行事曆
    calendarColors,
    // 分頁與顏色選擇器
    activeTab,
    colorPickerType,
    // 佈局選項
    musicLayouts,
    worldBookLayouts,
    charPhoneLayouts,
    habitLayouts,
    styleLayouts,
    currentLayout,
    selectLayout,
    // 黑膠子風格
    vinylStyles,
    currentVinylStyle,
    selectVinylStyle,
    // 圖標選擇器
    showIconPicker,
    customColorInput,
    showIconSettings,
    // 背景/顏色
    backgroundType,
    selectBackgroundColor,
    selectGradient,
    selectForegroundColor,
    selectTextColor,
    selectBorderColor,
    applyTheme,
    onIconSelect,
    onCustomIconSelect,
    // 重置/保存
    resetStyle,
    saveAndClose,
    // 預覽 computed
    previewStyle,
    previewContentStyle,
    iconPreviewBlobStyle,
    iconPreviewIconStyle,
    previewUsesCustomImage,
    previewIconComponent,
    centerIconOffset,
    resetIconScale,
    toHexColor,
    // 靜態預設資料
    backgroundColors,
    borderColors,
    colorThemes,
    foregroundColors,
    gradientPresets,
    shapePresets,
  };
}
