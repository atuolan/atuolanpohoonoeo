import { storageService } from "@/services/storage";
import type { WidgetCustomStyle, WidgetData, WidgetInstance } from "@/types";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

// ===== 響應式縮放常量 =====
const BASE_GRID_SIZE = 16; // 固定網格大小
const DOCK_HEIGHT = 70; // 底部 dock 高度

// 預設佈局需要的最大格數（y: 28 + height: 5 = 33 格）
const MAX_GRID_ROWS = 35; // 留一點餘量
const REQUIRED_CANVAS_HEIGHT = MAX_GRID_ROWS * BASE_GRID_SIZE; // 560px

// 固定畫布寬度（90 格）
const FIXED_CANVAS_GRIDS = 90;
const FIXED_CANVAS_WIDTH = FIXED_CANVAS_GRIDS * BASE_GRID_SIZE; // 1440px

// 每屏可見的格數（中間屏佈局大約佔 21 格寬，從 x:35 到 x:56）
const SINGLE_SCREEN_GRIDS = 22;
const SINGLE_SCREEN_WIDTH = SINGLE_SCREEN_GRIDS * BASE_GRID_SIZE; // 352px

const MIN_SCALE = 0.5; // 最小縮放比例
const MAX_SCALE = 1.5; // 最大縮放比例（允許適當放大）

// 計算畫布縮放比例
function calculateCanvasScale(): number {
  const availableHeight = window.innerHeight - DOCK_HEIGHT;
  const availableWidth = window.innerWidth;

  // 基於高度的縮放：讓組件填滿可用高度
  const heightScale = availableHeight / REQUIRED_CANVAS_HEIGHT;

  // 基於寬度的縮放：讓單屏內容填滿螢幕寬度
  const widthScale = availableWidth / SINGLE_SCREEN_WIDTH;

  // 取較小值，確保兩個方向都不會溢出
  const scale = Math.min(heightScale, widthScale);

  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

const ICON_DATA_URL_MAX_LENGTH = 120_000;

async function compressLargeIconDataUrl(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:image/")) return dataUrl;
  if (dataUrl.length <= ICON_DATA_URL_MAX_LENGTH) return dataUrl;

  return new Promise((resolve) => {
    const img = document.createElement("img");

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      const maxSide = 160;
      const scale = Math.min(
        maxSide / img.naturalWidth,
        maxSide / img.naturalHeight,
        1,
      );
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      const candidates = [
        canvas.toDataURL("image/webp", 0.75),
        canvas.toDataURL("image/jpeg", 0.72),
        canvas.toDataURL("image/png", 0.72),
      ];

      const best =
        candidates.find((x) => x.length <= ICON_DATA_URL_MAX_LENGTH) ||
        candidates.reduce(
          (prev, curr) => (curr.length < prev.length ? curr : prev),
          candidates[0],
        );

      resolve(best);
    };

    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function optimizePersistedWidgetIcons(
  widgets: WidgetInstance[],
): Promise<number> {
  let optimizedCount = 0;

  for (const widget of widgets) {
    const customIconUrl = widget?.data?.customStyle?.customIconUrl;
    if (
      typeof customIconUrl === "string" &&
      customIconUrl.startsWith("data:image/") &&
      customIconUrl.length > ICON_DATA_URL_MAX_LENGTH
    ) {
      const compressed = await compressLargeIconDataUrl(customIconUrl);
      if (compressed.length < customIconUrl.length) {
        widget.data = {
          ...widget.data,
          customStyle: {
            ...widget.data?.customStyle,
            customIconUrl: compressed,
          },
        };
        optimizedCount += 1;
      }
    }
  }

  return optimizedCount;
}

export const useCanvasStore = defineStore("canvas", () => {
  // ===== 狀態 =====
  const widgets = ref<WidgetInstance[]>([]);
  const gridSize = ref(BASE_GRID_SIZE); // 固定網格大小
  const canvasScale = ref(calculateCanvasScale()); // 畫布縮放比例
  const canvasWidth = ref(FIXED_CANVAS_WIDTH); // 固定畫布寬度
  const scrollX = ref(0);
  const isEditMode = ref(false);
  const isLoaded = ref(false);

  // ===== 多選狀態 =====
  const selectedWidgetIds = ref<Set<string>>(new Set());
  const isSelectMode = ref(false); // 框選模式

  // ===== 計算屬性 =====
  const sortedWidgets = computed(() => {
    return [...widgets.value].sort((a, b) => a.zIndex - b.zIndex);
  });

  const maxZIndex = computed(() => {
    if (widgets.value.length === 0) return 0;
    return Math.max(...widgets.value.map((w) => w.zIndex));
  });

  // ===== 方法 =====

  // 處理視窗大小變化
  let resizeTimeout: number | null = null;
  function handleResize() {
    // 防抖處理
    if (resizeTimeout) {
      clearTimeout(resizeTimeout);
    }
    resizeTimeout = window.setTimeout(() => {
      canvasScale.value = calculateCanvasScale();
      // 畫布寬度固定，不再根據螢幕寬度變化
    }, 100);
  }

  // 初始化數據
  async function initData() {
    try {
      // 設置 resize 監聯
      window.addEventListener("resize", handleResize);

      // 初始化縮放（畫布寬度固定）
      canvasScale.value = calculateCanvasScale();

      // 計算初始滾動位置：讓畫布中央顯示在視口中央
      const scaledScreenWidth = window.innerWidth / canvasScale.value;
      const canvasCenterPx = FIXED_CANVAS_WIDTH / 2; // 畫布中心 = 720px
      // 滾動量 = 畫布中心 - 螢幕寬度的一半
      scrollX.value = Math.max(0, canvasCenterPx - scaledScreenWidth / 2);

      await storageService.init();
      const savedWidgets = await storageService.loadLayout();
      if (savedWidgets && savedWidgets.length > 0) {
        widgets.value = savedWidgets;

        // 一次性自動優化：壓縮已存在於 IDB 的超大圖標 data URL
        // 僅處理 widget.customStyle.customIconUrl，不碰背景/主題分流資料
        const optimizedCount = await optimizePersistedWidgetIcons(widgets.value);
        if (optimizedCount > 0) {
          await storageService.saveLayout(widgets.value);
          console.warn(
            `[canvasStore] 已自動壓縮 ${optimizedCount} 個既有桌面圖標，減少卡頓。`,
          );
        }
      }
      isLoaded.value = true;
    } catch (e) {
      console.error("Failed to load layout:", e);
      isLoaded.value = true;
    }
  }

  // 清理函數
  function cleanup() {
    window.removeEventListener("resize", handleResize);
    if (resizeTimeout) {
      clearTimeout(resizeTimeout);
    }
  }

  // 保存數據
  async function saveData() {
    try {
      await storageService.saveLayout(widgets.value);
      console.log("Layout saved successfully");
    } catch (e) {
      console.error("Failed to save layout:", e);
    }
  }

  // 重置佈局
  function resetLayout() {
    widgets.value = [];
    saveData();
    // 這裡只需要清空，WhiteboardCanvas 會在 widgets 為空時自動重新生成預設佈局
    // 我們可以通過重新加載頁面來觸發，或者手動調用生成邏輯
    // 為了簡單，我們這裡只清空，讓 UI 組件決定如何填充
    setTimeout(() => {
      window.location.reload();
    }, 100);
  }

  // 添加組件
  function addWidget(widget: Omit<WidgetInstance, "id" | "zIndex">) {
    const newWidget: WidgetInstance = {
      ...widget,
      id: `widget-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      zIndex: maxZIndex.value + 1,
    };
    widgets.value.push(newWidget);

    // 如果不在編輯模式，添加後立即保存
    if (!isEditMode.value) {
      saveData();
    }

    return newWidget;
  }

  // 移除組件
  function removeWidget(id: string) {
    const index = widgets.value.findIndex((w) => w.id === id);
    if (index !== -1) {
      widgets.value.splice(index, 1);
      // 如果不在編輯模式，刪除後立即保存（雖然通常只能在編輯模式刪除）
      if (!isEditMode.value) {
        saveData();
      }
    }
  }

  // 更新組件位置
  function updateWidgetPosition(id: string, x: number, y: number) {
    const widget = widgets.value.find((w) => w.id === id);
    if (widget) {
      widget.x = x;
      widget.y = y;
    }
  }

  // 更新組件大小
  function updateWidgetSize(id: string, width: number, height: number) {
    const widget = widgets.value.find((w) => w.id === id);
    if (widget) {
      widget.width = width;
      widget.height = height;
    }
  }

  // 更新組件數據（包含自定義樣式）
  function updateWidgetData(id: string, data: Partial<WidgetData>) {
    const index = widgets.value.findIndex((w) => w.id === id);
    if (index !== -1) {
      // 用新對象替換整個 widget 以確保 Vue 響應性正確觸發
      widgets.value[index] = {
        ...widgets.value[index],
        data: {
          ...widgets.value[index].data,
          ...data,
        },
      };
      // 立即保存以確保自定義樣式持久化
      saveData();
    }
  }

  // 更新組件自定義樣式
  function updateWidgetCustomStyle(
    id: string,
    customStyle: Partial<WidgetCustomStyle>,
  ) {
    const index = widgets.value.findIndex((w) => w.id === id);
    if (index !== -1) {
      // 用新對象替換整個 widget 以確保 Vue 響應性正確觸發
      widgets.value[index] = {
        ...widgets.value[index],
        data: {
          ...widgets.value[index].data,
          customStyle: {
            ...widgets.value[index].data?.customStyle,
            ...customStyle,
          },
        },
      };
      // 立即保存以確保自定義樣式持久化
      saveData();
    }
  }

  // 獲取組件
  function getWidget(id: string): WidgetInstance | undefined {
    return widgets.value.find((w) => w.id === id);
  }

  // 將組件移到最上層
  function bringToFront(id: string) {
    const widget = widgets.value.find((w) => w.id === id);
    if (widget) {
      widget.zIndex = maxZIndex.value + 1;
    }
  }

  // 切換編輯模式
  function toggleEditMode() {
    setEditMode(!isEditMode.value);
  }

  function setEditMode(value: boolean) {
    // 如果是從 true 變成 false (即結束編輯模式)，則保存數據
    if (isEditMode.value === true && value === false) {
      saveData();
      // 清除選取狀態和框選模式
      selectedWidgetIds.value.clear();
      isSelectMode.value = false;
    }
    isEditMode.value = value;
  }

  // 切換框選模式
  function toggleSelectMode() {
    isSelectMode.value = !isSelectMode.value;
    if (!isSelectMode.value) {
      // 退出框選模式時清除選取
      selectedWidgetIds.value.clear();
    }
  }

  // ===== 多選方法 =====

  // 選取單個組件（點擊選取）
  function selectWidget(id: string, addToSelection = false) {
    if (addToSelection) {
      // 按住 Ctrl/Cmd 點擊：切換選取狀態
      if (selectedWidgetIds.value.has(id)) {
        selectedWidgetIds.value.delete(id);
      } else {
        selectedWidgetIds.value.add(id);
      }
    } else {
      // 普通點擊：只選取這一個
      selectedWidgetIds.value.clear();
      selectedWidgetIds.value.add(id);
    }
  }

  // 框選多個組件
  function selectWidgetsInRect(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    addToSelection = false,
  ) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    if (!addToSelection) {
      selectedWidgetIds.value.clear();
    }

    // 找出與選取框相交的組件
    for (const widget of widgets.value) {
      const widgetLeft = widget.x * gridSize.value;
      const widgetTop = widget.y * gridSize.value;
      const widgetRight = widgetLeft + widget.width * gridSize.value;
      const widgetBottom = widgetTop + widget.height * gridSize.value;

      // 檢查是否相交
      if (
        widgetLeft < maxX &&
        widgetRight > minX &&
        widgetTop < maxY &&
        widgetBottom > minY
      ) {
        selectedWidgetIds.value.add(widget.id);
      }
    }
  }

  // 清除所有選取
  function clearSelection() {
    selectedWidgetIds.value.clear();
  }

  // 檢查組件是否被選取
  function isWidgetSelected(id: string): boolean {
    return selectedWidgetIds.value.has(id);
  }

  // 批量移動選取的組件
  function moveSelectedWidgets(deltaX: number, deltaY: number) {
    for (const id of selectedWidgetIds.value) {
      const widget = widgets.value.find((w) => w.id === id);
      if (widget) {
        widget.x += deltaX;
        widget.y += deltaY;
      }
    }
  }

  // 全選所有組件
  function selectAll() {
    selectedWidgetIds.value.clear();
    for (const widget of widgets.value) {
      selectedWidgetIds.value.add(widget.id);
    }
  }

  // 將選取的組件置中到畫布中央
  function centerSelectedWidgets() {
    if (selectedWidgetIds.value.size === 0) return;

    // 計算選取組件的邊界框
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const id of selectedWidgetIds.value) {
      const widget = widgets.value.find((w) => w.id === id);
      if (widget) {
        minX = Math.min(minX, widget.x);
        minY = Math.min(minY, widget.y);
        maxX = Math.max(maxX, widget.x + widget.width);
        maxY = Math.max(maxY, widget.y + widget.height);
      }
    }

    // 計算選取組件群組的中心點（格數）
    const groupCenterX = (minX + maxX) / 2;
    const groupCenterY = (minY + maxY) / 2;

    // 計算畫布中心點（格數）
    const canvasCenterX = FIXED_CANVAS_GRIDS / 2; // 45 格
    const canvasCenterY = MAX_GRID_ROWS / 2; // 17.5 格

    // 計算需要移動的距離
    const deltaX = Math.round(canvasCenterX - groupCenterX);
    const deltaY = Math.round(canvasCenterY - groupCenterY);

    // 移動所有選取的組件
    for (const id of selectedWidgetIds.value) {
      const widget = widgets.value.find((w) => w.id === id);
      if (widget) {
        widget.x += deltaX;
        widget.y += deltaY;
      }
    }
  }

  // 批量更新選取組件的樣式
  function updateSelectedWidgetsStyle(customStyle: Partial<WidgetCustomStyle>) {
    if (selectedWidgetIds.value.size === 0) return;

    for (const id of selectedWidgetIds.value) {
      const index = widgets.value.findIndex((w) => w.id === id);
      if (index !== -1) {
        widgets.value[index] = {
          ...widgets.value[index],
          data: {
            ...widgets.value[index].data,
            customStyle: {
              ...widgets.value[index].data?.customStyle,
              ...customStyle,
            },
          },
        };
      }
    }
    // 保存更改
    saveData();
  }

  // 批量調整選取組件的大小（等比例縮放）
  function resizeSelectedWidgets(delta: number) {
    if (selectedWidgetIds.value.size === 0) return;

    for (const id of selectedWidgetIds.value) {
      const widget = widgets.value.find((w) => w.id === id);
      if (widget) {
        const newWidth = Math.max(2, widget.width + delta);
        const newHeight = Math.max(2, widget.height + delta);
        widget.width = newWidth;
        widget.height = newHeight;
      }
    }
  }

  // 獲取選取的組件列表
  function getSelectedWidgets(): WidgetInstance[] {
    return widgets.value.filter((w) => selectedWidgetIds.value.has(w.id));
  }

  // 獲取選取的組件數量
  const selectedCount = computed(() => selectedWidgetIds.value.size);

  // 更新滾動位置
  function setScrollX(value: number) {
    const maxScroll = canvasWidth.value - window.innerWidth / canvasScale.value;
    scrollX.value = Math.max(0, Math.min(value, maxScroll));
  }

  return {
    // 狀態
    widgets,
    gridSize,
    canvasScale,
    canvasWidth,
    scrollX,
    isEditMode,
    isLoaded,
    selectedWidgetIds,
    isSelectMode,
    // 計算屬性
    sortedWidgets,
    maxZIndex,
    selectedCount,
    // 方法
    initData,
    cleanup,
    saveData,
    resetLayout,
    addWidget,
    removeWidget,
    updateWidgetPosition,
    updateWidgetSize,
    updateWidgetData,
    updateWidgetCustomStyle,
    getWidget,
    bringToFront,
    toggleEditMode,
    setEditMode,
    setScrollX,
    toggleSelectMode,
    // 多選方法
    selectWidget,
    selectWidgetsInRect,
    clearSelection,
    isWidgetSelected,
    moveSelectedWidgets,
    selectAll,
    centerSelectedWidgets,
    updateSelectedWidgetsStyle,
    resizeSelectedWidgets,
    getSelectedWidgets,
  };
});
