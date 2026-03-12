<script setup lang="ts">
import AddWidgetPanel from "@/components/panels/AddWidgetPanel.vue";
import BatchStylePanel from "@/components/panels/BatchStylePanel.vue";
import BookmarkSticky from "@/components/widgets/BookmarkSticky.vue";
import CalendarWidget from "@/components/widgets/CalendarWidget.vue";
import CharPhoneWidget from "@/components/widgets/CharPhoneWidget.vue";
import ClockWidget from "@/components/widgets/ClockWidget.vue";
import CountdownSticky from "@/components/widgets/CountdownSticky.vue";
import FluidButtonWidget from "@/components/widgets/FluidButtonWidget.vue";
import FocusTimerWidget from "@/components/widgets/FocusTimerWidget.vue";
import HabitTrackerWidget from "@/components/widgets/HabitTrackerWidget.vue";
import MoodDiarySticky from "@/components/widgets/MoodDiarySticky.vue";
import MusicPlayerWidget from "@/components/widgets/MusicPlayerWidget.vue";
import PolaroidSticky from "@/components/widgets/PolaroidSticky.vue";
import QuoteSticky from "@/components/widgets/QuoteSticky.vue";
import TodoSticky from "@/components/widgets/TodoSticky.vue";
import WeatherWidget from "@/components/widgets/WeatherWidget.vue";
import WidgetWrapper from "@/components/widgets/WidgetWrapper.vue";
import WorldBookWidget from "@/components/widgets/WorldBookWidget.vue";
import { useTimeTheme } from "@/composables/useTimeTheme";
import { useCanvasStore, useThemeStore } from "@/stores";
import {
    AlignCenter,
    Check,
    CheckCheck,
    Download,
    GripHorizontal,
    Palette,
    Pencil,
    Plus,
    RotateCcw,
    SquareDashedMousePointer,
    Upload,
} from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref, watchEffect } from "vue";

const canvasStore = useCanvasStore();
const themeStore = useThemeStore();

// 時間主題（用於動態背景）
const { backgroundColor: timeThemeBg } = useTimeTheme();

// 動態設置時間主題背景 CSS 變數
watchEffect(() => {
  if (themeStore.wallpaperStyle.type === "time-theme") {
    document.documentElement.style.setProperty(
      "--time-theme-bg",
      timeThemeBg.value,
    );
  }
});

// 新增組件面板狀態
const showAddPanel = ref(false);

// 批量樣式面板狀態
const showBatchStylePanel = ref(false);

// ===== 框選狀態 =====
const isSelecting = ref(false);
const selectionBox = ref({ startX: 0, startY: 0, endX: 0, endY: 0 });

// ===== 框選自動滾動 =====
let selectionScrollAnimId: number | null = null;
const EDGE_SCROLL_ZONE = 60; // 邊緣觸發區域（px）
const EDGE_SCROLL_SPEED = 4; // 滾動速度（px/frame）

// ===== 工具列拖曳狀態 =====
const toolbarPosition = ref({ x: 0, y: 0 });
const isToolbarDragging = ref(false);
const toolbarDragStart = ref({ x: 0, y: 0, posX: 0, posY: 0 });
const toolbarRef = ref<HTMLElement | null>(null);

// 工具列位置樣式
const toolbarStyle = computed(() => {
  if (toolbarPosition.value.x === 0 && toolbarPosition.value.y === 0) {
    return {}; // 使用 CSS 預設位置
  }
  return {
    left: `${toolbarPosition.value.x}px`,
    top: `${toolbarPosition.value.y}px`,
    transform: "none",
  };
});

// 開始拖曳工具列
function startToolbarDrag(e: MouseEvent | TouchEvent) {
  e.preventDefault();
  isToolbarDragging.value = true;

  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

  // 如果是第一次拖曳，計算當前位置
  if (
    toolbarPosition.value.x === 0 &&
    toolbarPosition.value.y === 0 &&
    toolbarRef.value
  ) {
    const rect = toolbarRef.value.getBoundingClientRect();
    toolbarPosition.value = { x: rect.left, y: rect.top };
  }

  toolbarDragStart.value = {
    x: clientX,
    y: clientY,
    posX: toolbarPosition.value.x,
    posY: toolbarPosition.value.y,
  };

  document.addEventListener("mousemove", onToolbarDrag);
  document.addEventListener("mouseup", stopToolbarDrag);
  document.addEventListener("touchmove", onToolbarDrag, { passive: false });
  document.addEventListener("touchend", stopToolbarDrag);
}

// 拖曳中
function onToolbarDrag(e: MouseEvent | TouchEvent) {
  if (!isToolbarDragging.value) return;
  e.preventDefault();

  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

  const deltaX = clientX - toolbarDragStart.value.x;
  const deltaY = clientY - toolbarDragStart.value.y;

  // 計算新位置，限制在視窗範圍內
  const newX = Math.max(
    0,
    Math.min(window.innerWidth - 100, toolbarDragStart.value.posX + deltaX),
  );
  const newY = Math.max(
    0,
    Math.min(window.innerHeight - 60, toolbarDragStart.value.posY + deltaY),
  );

  toolbarPosition.value = { x: newX, y: newY };
}

// 停止拖曳
function stopToolbarDrag() {
  isToolbarDragging.value = false;
  document.removeEventListener("mousemove", onToolbarDrag);
  document.removeEventListener("mouseup", stopToolbarDrag);
  document.removeEventListener("touchmove", onToolbarDrag);
  document.removeEventListener("touchend", stopToolbarDrag);
}

// 重置工具列位置
function resetToolbarPosition() {
  toolbarPosition.value = { x: 0, y: 0 };
}

// 框選樣式
const selectionBoxStyle = computed(() => {
  if (!isSelecting.value) return { display: "none" };

  const x1 = selectionBox.value.startX;
  const y1 = selectionBox.value.startY;
  const x2 = selectionBox.value.endX;
  const y2 = selectionBox.value.endY;

  return {
    display: "block",
    left: `${Math.min(x1, x2)}px`,
    top: `${Math.min(y1, y2)}px`,
    width: `${Math.abs(x2 - x1)}px`,
    height: `${Math.abs(y2 - y1)}px`,
  };
});

// Emits - 導航事件
const emit = defineEmits<{
  (e: "navigate", page: string): void;
}>();

// 標籤到頁面的映射
const labelToPageMap: Record<string, string> = {
  訊息: "chat",
  角色: "character",
  世界書: "worldbook",
  設置: "settings",
  空間: "qzone",
  使用者: "user",
};

// 導出佈局
function exportLayout() {
  const data = {
    type: "aguaphone-layout",
    version: 1,
    exportedAt: new Date().toISOString(),
    widgets: JSON.parse(JSON.stringify(canvasStore.widgets)),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `aguaphone-layout-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// 導入佈局
const layoutFileInput = ref<HTMLInputElement | null>(null);

function triggerImportLayout() {
  layoutFileInput.value?.click();
}

const IMPORT_ICON_DATA_URL_MAX_LENGTH = 120_000;

async function compressLargeIconDataUrl(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:image/")) return dataUrl;
  if (dataUrl.length <= IMPORT_ICON_DATA_URL_MAX_LENGTH) return dataUrl;

  return new Promise((resolve) => {
    const img = document.createElement("img");

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      // 這裡只針對桌面圖標，限制到較小尺寸可顯著降體積
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
        candidates.find((x) => x.length <= IMPORT_ICON_DATA_URL_MAX_LENGTH) ||
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

async function optimizeImportedWidgetIcons(widgets: any[]): Promise<{
  widgets: any[];
  optimizedCount: number;
}> {
  const cloned = JSON.parse(JSON.stringify(widgets));
  let optimizedCount = 0;

  for (const widget of cloned) {
    const customIconUrl = widget?.data?.customStyle?.customIconUrl;
    if (
      typeof customIconUrl === "string" &&
      customIconUrl.startsWith("data:image/") &&
      customIconUrl.length > IMPORT_ICON_DATA_URL_MAX_LENGTH
    ) {
      const compressed = await compressLargeIconDataUrl(customIconUrl);
      widget.data.customStyle.customIconUrl = compressed;
      if (compressed.length < customIconUrl.length) {
        optimizedCount += 1;
      }
    }
  }

  return { widgets: cloned, optimizedCount };
}

async function handleLayoutImport(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // 支援兩種格式：新格式（有 type 欄位）和舊格式（直接是陣列）
    let widgets: any[];
    if (data.type === "aguaphone-layout" && Array.isArray(data.widgets)) {
      widgets = data.widgets;
    } else if (Array.isArray(data)) {
      widgets = data;
    } else {
      alert("無效的佈局檔案格式");
      return;
    }

    if (
      !confirm(
        `確定要載入此佈局嗎？\n共 ${widgets.length} 個組件，將覆蓋目前的桌面配置。`,
      )
    )
      return;

    // 只在「外部 JSON 匯入」時優化超大圖標，避免拖慢桌面
    // 不動主題/桌布資料（桌布在另一個 store/IDB 流程）
    const { widgets: optimizedWidgets, optimizedCount } =
      await optimizeImportedWidgetIcons(widgets);

    canvasStore.widgets.splice(
      0,
      canvasStore.widgets.length,
      ...optimizedWidgets,
    );
    await canvasStore.saveData();

    const tips =
      optimizedCount > 0
        ? `\n已自動壓縮 ${optimizedCount} 個超大圖標，避免桌面卡頓。`
        : "";
    alert(`佈局載入成功！共 ${optimizedWidgets.length} 個組件${tips}`);
  } catch (e) {
    alert("載入失敗: " + (e instanceof Error ? e.message : String(e)));
  } finally {
    input.value = "";
  }
}

// 處理組件點擊導航
function handleWidgetClick(widget: { type: string; data?: any }) {
  // 編輯模式下不導航
  if (canvasStore.isEditMode) return;

  // 根據組件類型處理
  if (widget.type === "fluid-button") {
    const label = widget.data?.label || "";
    const page = labelToPageMap[label];
    if (page) {
      emit("navigate", page);
    } else if (label === "音樂") {
      emit("navigate", "music");
    }
  } else if (widget.type === "char-phone") {
    emit("navigate", "chat");
  } else if (widget.type === "world-book") {
    emit("navigate", "worldbook");
  } else if (widget.type === "weather") {
    emit("navigate", "weather");
  }
}

// 處理 widget 內部的導航事件
function handleWidgetNavigate(page: string) {
  // 編輯模式下不導航
  if (canvasStore.isEditMode) return;
  emit("navigate", page);
}

// 組件類型映射
const widgetComponents: Record<string, any> = {
  clock: ClockWidget,
  weather: WeatherWidget,
  calendar: CalendarWidget,
  "mood-diary": MoodDiarySticky,
  polaroid: PolaroidSticky,
  todo: TodoSticky,
  quote: QuoteSticky,
  countdown: CountdownSticky,
  bookmark: BookmarkSticky,
  "fluid-button": FluidButtonWidget,
  music: MusicPlayerWidget,
  "habit-tracker": HabitTrackerWidget,
  "focus-timer": FocusTimerWidget,
  "world-book": WorldBookWidget,
  "char-phone": CharPhoneWidget,
};

// 初始化預設組件
onMounted(async () => {
  // 加載數據
  await canvasStore.initData();

  // 如果沒有組件，添加精美預設佈局
  // 畫布 90 格，中心在 45 格
  if (canvasStore.widgets.length === 0) {
    // ===== 第一屏（左側）：效率 =====
    canvasStore.addWidget({
      type: "focus-timer",
      x: 8,
      y: 3,
      width: 12,
      height: 18,
      data: {},
    });

    canvasStore.addWidget({
      type: "todo",
      x: 10,
      y: 23,
      width: 9,
      height: 11,
      data: {
        customStyle: { foregroundColor: "#3b82f6", borderColor: "#fef08a" },
      },
    });

    canvasStore.addWidget({
      type: "mood-diary",
      x: 21,
      y: 3,
      width: 12,
      height: 11,
      data: {
        customStyle: {
          backgroundGradient:
            "linear-gradient(135deg, #ffecd2 0%, #fcb69f 50%, #ffecd2 100%)",
          foregroundColor: "#374151",
          borderColor: "transparent",
        },
      },
    });

    canvasStore.addWidget({
      type: "fluid-button",
      x: 22,
      y: 16,
      width: 5,
      height: 5,
      data: { label: "收藏" },
    });

    canvasStore.addWidget({
      type: "fluid-button",
      x: 27,
      y: 16,
      width: 5,
      height: 5,
      data: { label: "閱讀" },
    });

    canvasStore.addWidget({
      type: "quote",
      x: 21,
      y: 23,
      width: 12,
      height: 10,
      data: { customStyle: { backgroundColor: "#bae6fd" } },
    });

    // ===== 第二屏（中間）：主頁 =====
    canvasStore.addWidget({
      type: "clock",
      x: 35,
      y: 2,
      width: 21,
      height: 7,
      data: {},
    });

    canvasStore.addWidget({
      type: "polaroid",
      x: 35,
      y: 11,
      width: 10,
      height: 11,
      data: {},
    });

    canvasStore.addWidget({
      type: "music",
      x: 35,
      y: 23,
      width: 10,
      height: 10,
      data: {
        customStyle: {
          borderColor: "rgba(255, 255, 255, 0.1)",
          borderWidth: 1,
          layout: "vinyl",
        },
      },
    });

    canvasStore.addWidget({
      type: "fluid-button",
      x: 46,
      y: 12,
      width: 5,
      height: 5,
      data: { label: "訊息" },
    });

    canvasStore.addWidget({
      type: "fluid-button",
      x: 51,
      y: 12,
      width: 5,
      height: 5,
      data: { label: "角色" },
    });

    canvasStore.addWidget({
      type: "fluid-button",
      x: 46,
      y: 17,
      width: 5,
      height: 5,
      data: { label: "設置" },
    });

    canvasStore.addWidget({
      type: "fluid-button",
      x: 51,
      y: 17,
      width: 5,
      height: 5,
      data: { label: "使用者" },
    });

    canvasStore.addWidget({
      type: "fluid-button",
      x: 46,
      y: 23,
      width: 5,
      height: 5,
      data: { label: "相冊" },
    });

    canvasStore.addWidget({
      type: "fluid-button",
      x: 51,
      y: 23,
      width: 5,
      height: 5,
      data: { label: "遊戲" },
    });

    canvasStore.addWidget({
      type: "fluid-button",
      x: 46,
      y: 28,
      width: 5,
      height: 5,
      data: { label: "音樂" },
    });

    canvasStore.addWidget({
      type: "fluid-button",
      x: 51,
      y: 28,
      width: 5,
      height: 5,
      data: { label: "空間" },
    });

    // ===== 第三屏（右側）：生活 =====
    canvasStore.addWidget({
      type: "calendar",
      x: 58,
      y: 2,
      width: 14,
      height: 16,
      data: {
        customStyle: {
          backgroundColor: "#ffffff",
          foregroundColor: "#374151",
          borderColor: "rgba(0, 0, 0, 0.1)",
        },
      },
    });

    canvasStore.addWidget({
      type: "fluid-button",
      x: 57,
      y: 19,
      width: 5,
      height: 5,
      data: { label: "購物" },
    });

    canvasStore.addWidget({
      type: "fluid-button",
      x: 63,
      y: 19,
      width: 5,
      height: 5,
      data: { label: "頭盔TA" },
    });

    canvasStore.addWidget({
      type: "fluid-button",
      x: 69,
      y: 19,
      width: 5,
      height: 5,
      data: { label: "錢包" },
    });

    canvasStore.addWidget({
      type: "fluid-button",
      x: 57,
      y: 24,
      width: 5,
      height: 5,
      data: { label: "外賣" },
    });

    canvasStore.addWidget({
      type: "weather",
      x: 73,
      y: 2,
      width: 10,
      height: 8,
      data: {},
    });

    canvasStore.addWidget({
      type: "fluid-button",
      x: 57,
      y: 30,
      width: 5,
      height: 5,
      data: { label: "健身" },
    });

    canvasStore.addWidget({
      type: "world-book",
      x: 64,
      y: 25,
      width: 14,
      height: 8,
      data: {},
    });

    canvasStore.addWidget({
      type: "fluid-button",
      x: 75,
      y: 19,
      width: 5,
      height: 5,
      data: { type: "4", label: "書架" },
    });
  }
});

// ===== 滾動狀態 =====
const containerRef = ref<HTMLElement | null>(null);
let isDragging = false;
const isDraggingActive = ref(false);
const isMomentumAnimating = ref(false);
let startX = 0;
let startScrollX = 0;
let velocity = 0;
let lastX = 0;
let lastTime = 0;
let animationId: number | null = null;
let dragScrollRafId: number | null = null;
let pendingDragScrollX: number | null = null;

function queueDragScrollX(value: number) {
  pendingDragScrollX = value;
  if (dragScrollRafId !== null) return;

  dragScrollRafId = requestAnimationFrame(() => {
    dragScrollRafId = null;
    if (pendingDragScrollX === null) return;
    canvasStore.scrollX = pendingDragScrollX;
    pendingDragScrollX = null;
  });
}

function flushDragScrollX() {
  if (dragScrollRafId !== null) {
    cancelAnimationFrame(dragScrollRafId);
    dragScrollRafId = null;
  }
  if (pendingDragScrollX !== null) {
    canvasStore.scrollX = pendingDragScrollX;
    pendingDragScrollX = null;
  }
}

// ===== 觸控方向判定（防止卡住） =====
let isTouchPending = false; // 觸控已按下但尚未確定方向
let touchStartClientX = 0; // 原始螢幕座標（用於方向判定）
let touchStartClientY = 0;
const DIRECTION_THRESHOLD = 8; // 移動超過 8px 才判定方向

// 彈性邊界參數
const RUBBER_BAND_FACTOR = 0.3;
const DECELERATION = 0.95;
const MIN_VELOCITY = 0.5;

// ===== 框選邊緣自動滾動 =====
let lastSelectionClientX = 0;

function startSelectionEdgeScroll(clientX: number) {
  lastSelectionClientX = clientX;
  const screenWidth = window.innerWidth;
  const scaledScreenWidth = screenWidth / canvasStore.canvasScale;
  const maxScroll = canvasStore.canvasWidth - scaledScreenWidth;

  // 判斷是否在邊緣區域
  let scrollDir = 0;
  if (clientX < EDGE_SCROLL_ZONE) {
    scrollDir = -1; // 向左滾動
  } else if (clientX > screenWidth - EDGE_SCROLL_ZONE) {
    scrollDir = 1; // 向右滾動
  }

  if (scrollDir === 0) {
    stopSelectionEdgeScroll();
    return;
  }

  // 如果已經在滾動，不重複啟動
  if (selectionScrollAnimId !== null) return;

  function scrollStep() {
    const scaledScreenW = window.innerWidth / canvasStore.canvasScale;
    const maxS = canvasStore.canvasWidth - scaledScreenW;
    const speed = EDGE_SCROLL_SPEED / canvasStore.canvasScale;

    canvasStore.scrollX = Math.max(
      0,
      Math.min(maxS, canvasStore.scrollX + scrollDir * speed),
    );

    // 同步更新框選終點（因為畫布滾動了，但手指沒動）
    selectionBox.value.endX =
      lastSelectionClientX / canvasStore.canvasScale + canvasStore.scrollX;

    selectionScrollAnimId = requestAnimationFrame(scrollStep);
  }

  selectionScrollAnimId = requestAnimationFrame(scrollStep);
}

function stopSelectionEdgeScroll() {
  if (selectionScrollAnimId !== null) {
    cancelAnimationFrame(selectionScrollAnimId);
    selectionScrollAnimId = null;
  }
}

// ===== 觸控/滑鼠事件 =====
function onPointerDown(e: MouseEvent | TouchEvent) {
  // 只有在框選模式下才啟用框選
  if (canvasStore.isEditMode && canvasStore.isSelectMode) {
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    // 計算相對於畫布的座標（考慮縮放和滾動）
    const canvasX = clientX / canvasStore.canvasScale + canvasStore.scrollX;
    const canvasY = clientY / canvasStore.canvasScale;

    // 檢查是否按住 Ctrl/Cmd（用於追加選取）
    const addToSelection =
      "touches" in e
        ? false
        : (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey;

    // 如果沒有按住修飾鍵，清除現有選取
    if (!addToSelection) {
      canvasStore.clearSelection();
    }

    // 開始框選
    isSelecting.value = true;
    selectionBox.value = {
      startX: canvasX,
      startY: canvasY,
      endX: canvasX,
      endY: canvasY,
    };
    return;
  }

  stopAnimation();

  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

  // 觸控事件：先進入 pending 狀態，等移動後判定方向
  if ("touches" in e) {
    isTouchPending = true;
    isDragging = false;
    touchStartClientX = clientX;
    touchStartClientY = clientY;
  } else {
    // 滑鼠事件：直接開始拖拽（桌面端不需要方向判定）
    isDragging = true;
    isDraggingActive.value = true;
    isTouchPending = false;
  }

  // 將螢幕座標轉換為畫布座標（考慮縮放）
  const canvasX = clientX / canvasStore.canvasScale;
  startX = canvasX;
  lastX = canvasX;
  lastTime = Date.now();
  startScrollX = canvasStore.scrollX;
  velocity = 0;
}

function onPointerMove(e: MouseEvent | TouchEvent) {
  // 框選模式
  if (isSelecting.value && canvasStore.isEditMode && canvasStore.isSelectMode) {
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    const canvasX = clientX / canvasStore.canvasScale + canvasStore.scrollX;
    const canvasY = clientY / canvasStore.canvasScale;

    selectionBox.value.endX = canvasX;
    selectionBox.value.endY = canvasY;

    // 邊緣自動滾動：手指/滑鼠靠近螢幕左右邊緣時自動滾動畫布
    startSelectionEdgeScroll(clientX);
    return;
  }

  // 觸控方向判定階段
  if (isTouchPending && "touches" in e) {
    const clientX = e.touches[0].clientX;
    const clientY = e.touches[0].clientY;
    const dx = Math.abs(clientX - touchStartClientX);
    const dy = Math.abs(clientY - touchStartClientY);

    // 還沒超過閾值，繼續等待
    if (dx < DIRECTION_THRESHOLD && dy < DIRECTION_THRESHOLD) {
      return;
    }

    // 判定方向
    if (dx >= dy) {
      // 水平滑動 → 啟動畫布橫向滾動
      isTouchPending = false;
      isDragging = true;
      isDraggingActive.value = true;
    } else {
      // 垂直滑動 → 放棄，讓瀏覽器/其他元素處理
      isTouchPending = false;
      isDragging = false;
      return;
    }
  }

  if (!isDragging) return;

  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  // 將螢幕座標轉換為畫布座標（考慮縮放）
  const canvasX = clientX / canvasStore.canvasScale;
  const now = Date.now();
  const dt = now - lastTime;

  if (dt > 0) {
    velocity = ((lastX - canvasX) / dt) * 16; // 標準化到 16ms
  }

  lastX = canvasX;
  lastTime = now;

  let deltaX = startX - canvasX;
  let newScrollX = startScrollX + deltaX;

  // 彈性邊界
  const scaledScreenWidth = window.innerWidth / canvasStore.canvasScale;
  const maxScroll = canvasStore.canvasWidth - scaledScreenWidth;
  if (newScrollX < 0) {
    newScrollX = newScrollX * RUBBER_BAND_FACTOR;
  } else if (newScrollX > maxScroll) {
    newScrollX = maxScroll + (newScrollX - maxScroll) * RUBBER_BAND_FACTOR;
  }

  queueDragScrollX(newScrollX);
}

function onPointerUp(e: MouseEvent | TouchEvent) {
  // 完成框選
  if (isSelecting.value && canvasStore.isEditMode && canvasStore.isSelectMode) {
    stopSelectionEdgeScroll();
    const { startX, startY, endX, endY } = selectionBox.value;

    // 檢查是否按住 Ctrl/Cmd
    const addToSelection =
      "touches" in e
        ? false
        : (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey;

    // 選取框內的組件
    canvasStore.selectWidgetsInRect(startX, startY, endX, endY, addToSelection);

    isSelecting.value = false;
    return;
  }

  // 清除 pending 狀態
  isTouchPending = false;

  if (!isDragging) return;
  isDragging = false;
  isDraggingActive.value = false;
  flushDragScrollX();

  // 開始慣性動畫
  if (Math.abs(velocity) > MIN_VELOCITY) {
    startMomentumAnimation();
  } else {
    // 回彈到邊界
    snapToBounds();
  }
}

// ===== 慣性動畫 =====
function startMomentumAnimation() {
  const scaledScreenWidth = window.innerWidth / canvasStore.canvasScale;
  const maxScroll = canvasStore.canvasWidth - scaledScreenWidth;

  isMomentumAnimating.value = true;

  function animate() {
    velocity *= DECELERATION;

    let newScrollX = canvasStore.scrollX + velocity;

    // 邊界回彈
    if (newScrollX < 0) {
      newScrollX = newScrollX * 0.8;
      velocity *= 0.5;
    } else if (newScrollX > maxScroll) {
      newScrollX = maxScroll + (newScrollX - maxScroll) * 0.8;
      velocity *= 0.5;
    }

    canvasStore.scrollX = newScrollX;

    // 繼續動畫或停止
    if (Math.abs(velocity) > MIN_VELOCITY) {
      animationId = requestAnimationFrame(animate);
    } else {
      isMomentumAnimating.value = false;
      snapToBounds();
    }
  }

  animationId = requestAnimationFrame(animate);
}

function snapToBounds() {
  const scaledScreenWidth = window.innerWidth / canvasStore.canvasScale;
  const maxScroll = canvasStore.canvasWidth - scaledScreenWidth;
  let targetScroll = canvasStore.scrollX;

  if (targetScroll < 0) {
    targetScroll = 0;
  } else if (targetScroll > maxScroll) {
    targetScroll = maxScroll;
  }

  if (targetScroll !== canvasStore.scrollX) {
    animateToScroll(targetScroll);
  }
}

function animateToScroll(target: number) {
  function animate() {
    const diff = target - canvasStore.scrollX;
    if (Math.abs(diff) < 1) {
      canvasStore.scrollX = target;
      isMomentumAnimating.value = false;
      return;
    }
    canvasStore.scrollX += diff * 0.15;
    animationId = requestAnimationFrame(animate);
  }
  isMomentumAnimating.value = true;
  animationId = requestAnimationFrame(animate);
}

function stopAnimation() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  isMomentumAnimating.value = false;
}

// ===== 長按進入編輯模式 =====
let longPressTimer: number | null = null;
const LONG_PRESS_DURATION = 800;
const LONG_PRESS_MOVE_TOLERANCE = 15; // 允許 15px 的手指抖動
let longPressStartX = 0;
let longPressStartY = 0;

function onLongPressStart(e: MouseEvent | TouchEvent) {
  // 已經在編輯模式就不需要長按了
  if (canvasStore.isEditMode) return;

  // 清除之前的計時器
  onLongPressCancel();

  // 記錄起始位置
  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
  longPressStartX = clientX;
  longPressStartY = clientY;

  longPressTimer = window.setTimeout(() => {
    longPressTimer = null;
    canvasStore.setEditMode(true);
    // 觸發震動反饋（如果支持）
    if (navigator.vibrate) {
      try {
        navigator.vibrate(50);
      } catch (e) {
        // 忽略震動權限錯誤
      }
    }
  }, LONG_PRESS_DURATION);
}

// 移動時檢查是否超出容忍範圍
function onLongPressMove(e: MouseEvent | TouchEvent) {
  if (!longPressTimer) return;

  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
  const dx = Math.abs(clientX - longPressStartX);
  const dy = Math.abs(clientY - longPressStartY);

  // 只有移動超過容忍範圍才取消長按
  if (dx > LONG_PRESS_MOVE_TOLERANCE || dy > LONG_PRESS_MOVE_TOLERANCE) {
    onLongPressCancel();
  }
}

function onLongPressCancel() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

// ===== 畫布樣式 =====
// 判斷是否需要滾動（螢幕寬度 < 畫布寬度）
const needsScroll = computed(() => {
  const scaledScreenWidth = window.innerWidth / canvasStore.canvasScale;
  return scaledScreenWidth < canvasStore.canvasWidth;
});

const canvasStyle = computed(() => {
  const scaledScreenWidth = window.innerWidth / canvasStore.canvasScale;

  // 如果螢幕寬度 >= 畫布寬度，居中顯示
  if (scaledScreenWidth >= canvasStore.canvasWidth) {
    const offset = (scaledScreenWidth - canvasStore.canvasWidth) / 2;
    return {
      width: `${canvasStore.canvasWidth}px`,
      transform: `translateX(${offset}px)`,
      "--grid-size": `${canvasStore.gridSize}px`,
    };
  }

  // 否則使用滾動
  return {
    width: `${canvasStore.canvasWidth}px`,
    transform: `translateX(-${canvasStore.scrollX}px)`,
    "--grid-size": `${canvasStore.gridSize}px`,
  };
});

// 畫布容器樣式（應用縮放）
const viewportStyle = computed(() => ({
  "--canvas-scale": canvasStore.canvasScale,
}));

// 滾動進度（0-1）
const scrollProgress = computed(() => {
  const scaledScreenWidth = window.innerWidth / canvasStore.canvasScale;
  const maxScroll = canvasStore.canvasWidth - scaledScreenWidth;
  if (maxScroll <= 0) return 0;
  return Math.max(0, Math.min(1, canvasStore.scrollX / maxScroll));
});

// ===== 生命週期 =====
onMounted(() => {
  window.addEventListener("mousemove", onPointerMove);
  window.addEventListener("mouseup", onPointerUp);
  window.addEventListener("touchmove", onPointerMove, { passive: true });
  window.addEventListener("touchend", onPointerUp);
});

onUnmounted(() => {
  stopAnimation();
  flushDragScrollX();
  stopSelectionEdgeScroll();
  onLongPressCancel();
  canvasStore.cleanup(); // 清理 resize 監聽器
  window.removeEventListener("mousemove", onPointerMove);
  window.removeEventListener("mouseup", onPointerUp);
  window.removeEventListener("touchmove", onPointerMove);
  window.removeEventListener("touchend", onPointerUp);
});
</script>

<template>
  <div
    class="whiteboard-viewport"
    :class="{ 'is-scrolling': isDraggingActive || isMomentumAnimating }"
    :style="viewportStyle"
  >
    <!-- 桌布背景層 -->
    <div class="wallpaper-layer"></div>

    <!-- 滾動進度指示器（只在需要滾動時顯示） -->
    <div v-if="needsScroll" class="scroll-indicator">
      <div class="scroll-track">
        <div
          class="scroll-thumb"
          :style="{ left: `${scrollProgress * 100}%` }"
        ></div>
      </div>
    </div>

    <!-- 縮放容器 -->
    <div class="canvas-scaler">
      <!-- 畫布主體 -->
      <div
        ref="containerRef"
        class="whiteboard-canvas"
        :class="{ 'edit-mode': canvasStore.isEditMode }"
        :style="canvasStyle"
        @mousedown="onPointerDown"
        @touchstart="onPointerDown"
        @mousedown.capture="onLongPressStart"
        @touchstart.capture="onLongPressStart"
        @mouseup="onLongPressCancel"
        @touchend="onLongPressCancel"
        @mouseleave="onLongPressCancel"
        @mousemove="onLongPressMove"
        @touchmove="onLongPressMove"
      >
        <!-- 網格背景（編輯模式時顯示） -->
        <div v-if="canvasStore.isEditMode" class="grid-overlay"></div>

        <!-- 框選框 -->
        <div
          v-if="isSelecting"
          class="selection-box"
          :style="selectionBoxStyle"
        ></div>

        <!-- 小組件容器 -->
        <div class="widgets-container">
          <!-- 渲染所有小組件 -->
          <WidgetWrapper
            v-for="widget in canvasStore.sortedWidgets"
            :key="widget.id"
            :widget="widget"
            @click.stop="handleWidgetClick(widget)"
          >
            <component
              :is="widgetComponents[widget.type]"
              :widget-id="widget.id"
              :data="widget.data"
              @navigate="handleWidgetNavigate"
            />
          </WidgetWrapper>

          <!-- 佔位提示（無組件時顯示） -->
          <div v-if="canvasStore.widgets.length === 0" class="placeholder-hint">
            <div class="hint-icon">
              <Palette :size="48" :stroke-width="1.5" />
            </div>
            <p class="hint-title">橫向白板畫布</p>
            <p class="hint-sub">
              <GripHorizontal :size="16" :stroke-width="1.5" />
              左右滑動瀏覽 | 長按進入編輯模式
            </p>
            <p v-if="canvasStore.isEditMode" class="edit-hint">
              <Pencil :size="16" :stroke-width="1.5" />
              編輯模式已啟用
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- 編輯模式工具列 -->
    <div
      v-if="canvasStore.isEditMode"
      ref="toolbarRef"
      class="edit-toolbar"
      :class="{ dragging: isToolbarDragging }"
      :style="toolbarStyle"
    >
      <!-- 拖曳手柄 -->
      <div
        class="toolbar-drag-handle"
        @mousedown="startToolbarDrag"
        @touchstart="startToolbarDrag"
      >
        <GripHorizontal :size="16" :stroke-width="2" />
      </div>
      <button class="toolbar-btn reset-btn" @click="canvasStore.resetLayout()">
        <RotateCcw :size="18" :stroke-width="2" />
        重置
      </button>
      <div class="divider"></div>
      <button
        class="toolbar-btn select-btn"
        :class="{ active: canvasStore.isSelectMode }"
        @click="canvasStore.toggleSelectMode()"
      >
        <SquareDashedMousePointer :size="18" :stroke-width="2" />
        {{
          canvasStore.isSelectMode
            ? `框選中${canvasStore.selectedCount > 0 ? ` (${canvasStore.selectedCount})` : ""}`
            : "框選"
        }}
      </button>
      <!-- 全選和置中按鈕（框選模式下顯示） -->
      <template v-if="canvasStore.isSelectMode">
        <button
          class="toolbar-btn select-all-btn"
          @click="canvasStore.selectAll()"
        >
          <CheckCheck :size="18" :stroke-width="2" />
          全選
        </button>
        <button
          class="toolbar-btn center-btn"
          :disabled="canvasStore.selectedCount === 0"
          @click="canvasStore.centerSelectedWidgets()"
        >
          <AlignCenter :size="18" :stroke-width="2" />
          置中
        </button>
        <button
          class="toolbar-btn style-btn"
          :disabled="canvasStore.selectedCount === 0"
          @click="showBatchStylePanel = true"
        >
          <Palette :size="18" :stroke-width="2" />
          樣式
        </button>
        <div class="resize-group" v-if="canvasStore.selectedCount > 0">
          <button
            class="toolbar-btn resize-btn"
            @click="canvasStore.resizeSelectedWidgets(-1)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <span class="resize-label">大小</span>
          <button
            class="toolbar-btn resize-btn"
            @click="canvasStore.resizeSelectedWidgets(1)"
          >
            <Plus :size="16" :stroke-width="2" />
          </button>
        </div>
      </template>
      <div class="divider"></div>
      <button class="toolbar-btn export-btn" @click="exportLayout">
        <Download :size="18" :stroke-width="2" />
        導出
      </button>
      <button class="toolbar-btn import-btn" @click="triggerImportLayout">
        <Upload :size="18" :stroke-width="2" />
        導入
      </button>
      <input
        ref="layoutFileInput"
        type="file"
        accept=".json"
        style="display: none"
        @change="handleLayoutImport"
      />
      <div class="divider"></div>
      <button class="toolbar-btn add-btn" @click="showAddPanel = true">
        <Plus :size="18" :stroke-width="2" />
        新增
      </button>
      <button
        class="toolbar-btn done-btn"
        @click="canvasStore.setEditMode(false)"
      >
        <Check :size="18" :stroke-width="2" />
        完成
      </button>
    </div>

    <!-- 新增組件面板 -->
    <AddWidgetPanel v-if="showAddPanel" @close="showAddPanel = false" />

    <!-- 批量樣式面板 -->
    <BatchStylePanel
      v-if="showBatchStylePanel"
      @close="showBatchStylePanel = false"
    />
  </div>
</template>

<style lang="scss" scoped>
.whiteboard-viewport {
  position: absolute;
  inset: 0;
  overflow: hidden;

  // 頂部安全區域：讓畫布內容（widgets）從瀏海下方開始
  // wallpaper-layer 是 absolute 不受影響，仍會填滿全屏
  padding-top: var(--safe-top, 0px);

  // 移動端：使用 safe-area 處理底部間距（Dock 高度 + 安全區域）
  padding-bottom: calc(70px + var(--safe-bottom, 0px));

  // PC 端（寬度 >= 768px）：固定底部間距
  @media (min-width: 768px) {
    padding-bottom: 70px;
  }
}

// 桌布背景層（獨立元素，避免 z-index 問題）
.wallpaper-layer {
  position: absolute;
  inset: 0;
  background: var(--wallpaper-value, var(--color-background));
  background-size: var(--wallpaper-fit, cover);
  background-position: center;
  background-repeat: var(--wallpaper-repeat, no-repeat);
  filter: blur(var(--wallpaper-blur, 0px));
  opacity: var(--wallpaper-opacity, 1);
  z-index: 0;
  pointer-events: none;
  will-change: transform, opacity, filter;
  transform: translateZ(0);
}

.whiteboard-viewport.is-scrolling .wallpaper-layer {
  // 滑動中先關閉高成本 blur，提升拖動 FPS
  filter: none !important;
}

// 縮放容器
.canvas-scaler {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  transform: scale(var(--canvas-scale, 1));
  transform-origin: top left;
  will-change: transform;
  // 縮放後需要調整容器大小以填滿視口
  width: calc(100% / var(--canvas-scale, 1));
  height: calc(100% / var(--canvas-scale, 1));
}

// 滾動進度指示器
.scroll-indicator {
  position: absolute;
  top: calc(var(--safe-top, 0px) + 12px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  opacity: 0.5;
  transition: opacity 0.3s;
  pointer-events: none;

  &:hover {
    opacity: 0.8;
  }
}

.scroll-track {
  width: 60px;
  height: 4px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 2px;
  position: relative;
}

.scroll-thumb {
  position: absolute;
  top: -2px;
  width: 8px;
  height: 8px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 50%;
  transform: translateX(-50%);
  transition: background 0.2s;
}

// 畫布主體
.whiteboard-canvas {
  height: 100%;
  min-height: 100%;
  position: relative;
  cursor: grab;
  padding-bottom: 20px; // 額外底部間距
  box-sizing: border-box;
  touch-action: pan-y; // 允許垂直滑動穿透，水平由 JS 處理
  will-change: transform;
  transform: translateZ(0);

  &:active {
    cursor: grabbing;
  }

  &.edit-mode {
    touch-action: none; // 編輯模式下完全由 JS 控制
  }
}

// 網格覆蓋層
.grid-overlay {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(
    circle,
    rgba(0, 0, 0, 0.15) 1px,
    transparent 1px
  );
  background-size: var(--grid-size, 16px) var(--grid-size, 16px);
  pointer-events: none;
  animation: fadeIn 0.2s ease;
}

// 框選框
.selection-box {
  position: absolute;
  background: rgba(99, 179, 237, 0.2);
  border: 2px dashed rgba(99, 179, 237, 0.8);
  border-radius: 4px;
  pointer-events: none;
  z-index: 1000;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

// 組件容器
.widgets-container {
  width: 100%;
  height: 100%;
  position: relative;
}

// 佔位提示
.placeholder-hint {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  opacity: 0.5;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;

  .hint-icon {
    opacity: 0.8;
  }

  .hint-title {
    font-size: 24px;
    font-weight: 600;
  }

  .hint-sub {
    font-size: 14px;
    opacity: 0.7;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .edit-hint {
    font-size: 16px;
    color: #10b981;
    display: flex;
    align-items: center;
    gap: 6px;
  }
}

// 編輯工具列 - 少女風改造
.edit-toolbar {
  position: fixed;
  top: max(20px, env(safe-area-inset-top)); // 懸浮在頂部
  left: 50%;
  transform: translateX(-50%);
  width: auto;
  max-width: calc(100vw - 32px); // 自適應螢幕寬度，留出邊距
  height: auto;
  min-height: 56px;

  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 28px;
  box-shadow:
    0 8px 32px rgba(31, 38, 135, 0.1),
    0 4px 12px rgba(0, 0, 0, 0.05);

  display: flex;
  flex-wrap: wrap; // 允許換行
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  gap: 6px;
  z-index: 100;
  animation: floatDown 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);

  // 拖曳中狀態
  &.dragging {
    cursor: grabbing;
    box-shadow:
      0 12px 40px rgba(31, 38, 135, 0.15),
      0 6px 16px rgba(0, 0, 0, 0.08);
  }

  // 手機端樣式調整
  @media (max-width: 600px) {
    padding: 6px 8px;
    gap: 4px;
    border-radius: 20px;
  }
}

// 拖曳手柄
.toolbar-drag-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: #9ca3af;
  cursor: grab;
  transition: all 0.2s ease;
  flex-shrink: 0;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
    color: #6b7280;
  }

  &:active {
    cursor: grabbing;
    background: rgba(0, 0, 0, 0.08);
  }
}

@keyframes floatDown {
  from {
    opacity: 0;
    transform: translate(-50%, -40px);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}

.divider {
  width: 1px;
  height: 24px;
  background: rgba(0, 0, 0, 0.1);
  margin: 0 2px;
  flex-shrink: 0;

  // 手機端隱藏分隔線
  @media (max-width: 600px) {
    display: none;
  }
}

.toolbar-btn {
  height: 40px;
  padding: 0 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  &.add-btn {
    background: linear-gradient(135deg, #c3fcc7 0%, #fc8ea894 100%);
    color: #5b4b8a;
    box-shadow: 0 4px 12px rgba(142, 197, 252, 0.3);

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(142, 197, 252, 0.4);
    }

    &:active {
      transform: translateY(0);
    }
  }

  &.done-btn {
    background: linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%);
    color: #2c7a7b;
    box-shadow: 0 4px 12px rgba(132, 250, 176, 0.3);

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(132, 250, 176, 0.4);
    }

    &:active {
      transform: translateY(0);
    }
  }

  &.reset-btn {
    background: #f3f4f6;
    color: #6b7280;

    &:hover {
      background: #e5e7eb;
      color: #374151;
    }
  }

  &.select-btn {
    background: #f3f4f6;
    color: #6b7280;

    &:hover {
      background: #e5e7eb;
      color: #374151;
    }

    &.active {
      background: linear-gradient(135deg, #a5b4fc 0%, #818cf8 100%);
      color: white;
      box-shadow: 0 4px 12px rgba(129, 140, 248, 0.4);

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(129, 140, 248, 0.5);
      }
    }
  }

  &.export-btn {
    background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%);
    color: #92400e;
    box-shadow: 0 4px 12px rgba(252, 182, 159, 0.3);

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(252, 182, 159, 0.4);
    }

    &:active {
      transform: translateY(0);
    }
  }

  &.import-btn {
    background: #e0f2fe;
    color: #0369a1;
    box-shadow: 0 4px 12px rgba(3, 105, 161, 0.15);

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(3, 105, 161, 0.25);
    }

    &:active {
      transform: translateY(0);
    }
  }

  &.select-all-btn {
    background: #e0e7ff;
    color: #4338ca;

    &:hover {
      background: #c7d2fe;
    }
  }

  &.center-btn {
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
    color: #92400e;
    box-shadow: 0 4px 12px rgba(253, 230, 138, 0.3);

    &:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(253, 230, 138, 0.4);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &.style-btn {
    background: linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%);
    color: #5b21b6;
    box-shadow: 0 4px 12px rgba(224, 195, 252, 0.3);

    &:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(224, 195, 252, 0.4);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &.resize-btn {
    padding: 6px;
    min-width: 32px;
    background: rgba(99, 102, 241, 0.1);
    color: #6366f1;
    border-radius: 8px;

    &:hover {
      background: rgba(99, 102, 241, 0.2);
      transform: translateY(-1px);
    }

    &:active {
      transform: scale(0.95);
    }
  }
}

.resize-group {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(99, 102, 241, 0.06);
  border-radius: 10px;
  padding: 2px 6px;

  .resize-label {
    font-size: 11px;
    font-weight: 600;
    color: #6366f1;
    user-select: none;
  }
}
</style>
