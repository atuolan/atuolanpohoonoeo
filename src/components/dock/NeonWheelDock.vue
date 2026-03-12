<script setup lang="ts">
import {
    Book,
    BookOpen,
    Calendar,
    Cloud,
    Dumbbell,
    Gamepad2,
    LayoutGrid,
    MessageCircle,
    Music,
    Phone,
    Settings,
    ShoppingCart,
    Sparkles,
    User,
    Wallet,
} from "lucide-vue-next";
import { onMounted, onUnmounted, ref } from "vue";

// ===== 轉盤狀態 =====
const railOffset = ref(0);
const isExpanded = ref(false); // 展開/收合狀態（默認收合）
const collapseOffset = ref(180); // 收合動畫偏移量（默認收合位置）
let railTarget = 0;
let railVelocity = 0;
let isRailDragging = false;
let lastRailX = 0;
let startRailX = 0;
let animationId: number | null = null;
let collapseAnimationId: number | null = null;
let pointerDownActive = false;

// 方向判定
let directionDetermined = false;
let isHorizontalSwipe = false;
const DIRECTION_THRESHOLD = 8;

// 收合動畫目標角度（往右旋轉到螢幕外）
const COLLAPSE_ANGLE = 180;

// Dock 項目 - 所有 APP
const dockItems = [
  { id: "character", icon: User, label: "角色" },
  { id: "message", icon: MessageCircle, label: "訊息" },
  { id: "settings", icon: Settings, label: "設置" },
  { id: "space", icon: Sparkles, label: "空間" },
  { id: "music", icon: Music, label: "音樂" },
  { id: "fitness", icon: Dumbbell, label: "健身" },
  { id: "wallet", icon: Wallet, label: "錢包" },
  { id: "game", icon: Gamepad2, label: "遊戲" },
  { id: "shop", icon: ShoppingCart, label: "購物" },
  { id: "book", icon: Book, label: "世界書" },
  { id: "calendar", icon: Calendar, label: "日曆" },
  { id: "weather", icon: Cloud, label: "天氣" },
  { id: "phone", icon: Phone, label: "電話" },
  { id: "reading", icon: BookOpen, label: "閱讀" },
  { id: "bookshelf", icon: Book, label: "書架" },
];

// 可見範圍的項目數量
const VISIBLE_ITEMS = 7;
const ANGLE_PER_ITEM = 20; // 每個項目佔用的角度

// 計算每個按鈕的角度 - 支援無限滾動
function getBaseAngle(index: number) {
  // 從中心開始計算
  const centerIndex = Math.floor(dockItems.length / 2);
  return (index - centerIndex) * ANGLE_PER_ITEM;
}

// 按鈕樣式
function getItemStyle(index: number) {
  // 基礎角度 + 滾動偏移 + 收合偏移
  const baseAngle = getBaseAngle(index) + railOffset.value;
  const angle = baseAngle + collapseOffset.value;

  // 計算可見性 - 超出範圍的隱藏
  const maxAngle = 70;
  const isVisible = isExpanded.value && Math.abs(baseAngle) <= maxAngle;

  return {
    transform: `rotate(${angle}deg)`,
    opacity: isVisible ? 1 : 0,
    pointerEvents: isVisible ? "auto" : ("none" as const),
  };
}

// 計算最大滾動範圍
const maxOffset = ((dockItems.length - VISIBLE_ITEMS) * ANGLE_PER_ITEM) / 2;

// ===== 拖拽旋轉邏輯 =====
function onRailPointerDown(e: MouseEvent | TouchEvent) {
  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  startRailX = clientX;
  lastRailX = clientX;
  railVelocity = 0;
  pointerDownActive = true;
  directionDetermined = false;
  isHorizontalSwipe = false;
  isRailDragging = false;
}

function onRailPointerMove(e: MouseEvent | TouchEvent) {
  if (!pointerDownActive) return;

  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  const deltaX = clientX - startRailX;

  if (!directionDetermined) {
    if (Math.abs(deltaX) > DIRECTION_THRESHOLD) {
      directionDetermined = true;
      isHorizontalSwipe = true;
      isRailDragging = true;
    }
    return;
  }

  if (!isHorizontalSwipe || !isRailDragging) return;

  const moveDeltaX = clientX - lastRailX;
  railVelocity = moveDeltaX * 0.5;

  // 邊界阻力 - 越接近邊界，移動越慢
  const boundaryLimit = maxOffset;
  const proposedTarget = railTarget + railVelocity;

  if (proposedTarget > boundaryLimit || proposedTarget < -boundaryLimit) {
    // 超出邊界時增加阻力
    railVelocity *= 0.3;
  }

  railTarget += railVelocity;
  railOffset.value = railTarget;
  lastRailX = clientX;
}

function onRailPointerUp() {
  pointerDownActive = false;

  if (isRailDragging && Math.abs(railVelocity) > 0.1) {
    startAnimation();
  }

  isRailDragging = false;
  directionDetermined = false;
  isHorizontalSwipe = false;
}

// 慣性動畫
function animateRail() {
  if (!isRailDragging && !pointerDownActive) {
    // 摩擦力
    railVelocity *= 0.94;

    if (Math.abs(railVelocity) > 0.01) {
      railTarget += railVelocity;
    }

    // 邊界處理 - 更平滑的回彈
    const boundaryLimit = maxOffset;

    if (railTarget > boundaryLimit) {
      // 超出右邊界，平滑回彈
      const overshot = railTarget - boundaryLimit;
      railTarget = boundaryLimit + overshot * 0.85;
      railVelocity *= 0.5;
    } else if (railTarget < -boundaryLimit) {
      // 超出左邊界，平滑回彈
      const overshot = railTarget + boundaryLimit;
      railTarget = -boundaryLimit + overshot * 0.85;
      railVelocity *= 0.5;
    }

    // 平滑過渡到目標位置
    const diff = railTarget - railOffset.value;
    railOffset.value += diff * 0.25;

    // 停止條件
    if (Math.abs(railVelocity) < 0.01 && Math.abs(diff) < 0.1) {
      // 確保停在邊界內
      if (railOffset.value > boundaryLimit) {
        railOffset.value = boundaryLimit;
      } else if (railOffset.value < -boundaryLimit) {
        railOffset.value = -boundaryLimit;
      }
      railTarget = railOffset.value;
      animationId = null;
      return;
    }
  }

  animationId = requestAnimationFrame(animateRail);
}

function startAnimation() {
  if (animationId === null) {
    animateRail();
  }
}

// 點擊中央按鈕 - 切換收合/展開
function onCoreClick() {
  if (isExpanded.value) {
    // 收合：向右旋轉
    animateCollapse(COLLAPSE_ANGLE);
    isExpanded.value = false;
  } else {
    // 展開：旋轉回來
    animateCollapse(0);
    isExpanded.value = true;
  }
}

// 收合/展開動畫
function animateCollapse(targetAngle: number) {
  if (collapseAnimationId) {
    cancelAnimationFrame(collapseAnimationId);
  }

  const animate = () => {
    const diff = targetAngle - collapseOffset.value;

    if (Math.abs(diff) < 0.5) {
      collapseOffset.value = targetAngle;
      collapseAnimationId = null;
      return;
    }

    // 使用緩動效果
    collapseOffset.value += diff * 0.12;
    collapseAnimationId = requestAnimationFrame(animate);
  };

  animate();
}

// Emits
const emit = defineEmits<{
  (e: "navigate", page: string): void;
  (e: "openGlobalTheme"): void;
}>();

// 長按中央按鈕 - 打開全局美化
function onCoreLongPress() {
  emit("openGlobalTheme");
}

// 長按計時器
let longPressTimer: ReturnType<typeof setTimeout> | null = null;

function onCorePointerDown() {
  longPressTimer = setTimeout(() => {
    onCoreLongPress();
    longPressTimer = null;
  }, 500);
}

function onCorePointerUp() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

// 點擊 dock 項目
function onItemClick(item: (typeof dockItems)[0]) {
  console.log("點擊:", item.label);
  emit("navigate", item.id);
}

onMounted(() => {
  window.addEventListener("mousemove", onRailPointerMove);
  window.addEventListener("mouseup", onRailPointerUp);
  window.addEventListener("touchmove", onRailPointerMove, { passive: true });
  window.addEventListener("touchend", onRailPointerUp);
});

onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId);
  if (collapseAnimationId) cancelAnimationFrame(collapseAnimationId);
  window.removeEventListener("mousemove", onRailPointerMove);
  window.removeEventListener("mouseup", onRailPointerUp);
  window.removeEventListener("touchmove", onRailPointerMove);
  window.removeEventListener("touchend", onRailPointerUp);
});
</script>

<template>
  <nav class="neon-wheel-dock">
    <!-- 弧形軌道 -->
    <div
      class="arc-rail"
      :class="{ hidden: !isExpanded }"
      @mousedown="onRailPointerDown"
      @touchstart="onRailPointerDown"
    >
      <!-- 圓環軌道 -->
      <div class="rail-glow" :class="{ hidden: !isExpanded }"></div>

      <!-- Dock 項目 -->
      <div
        v-for="(item, index) in dockItems"
        :key="item.id"
        class="nav-btn"
        :style="getItemStyle(index)"
        @click="onItemClick(item)"
      >
        <div class="nav-btn-inner">
          <component :is="item.icon" :size="20" :stroke-width="1.5" />
        </div>
        <span class="nav-label">{{ item.label }}</span>
      </div>
    </div>

    <!-- 滾動提示 -->
    <div class="scroll-hint" :class="{ hidden: !isExpanded }">
      <span class="hint-text">← 滑動查看更多 →</span>
    </div>

    <!-- 中央按鈕 -->
    <button
      class="core-btn"
      @click="onCoreClick"
      @pointerdown="onCorePointerDown"
      @pointerup="onCorePointerUp"
      @pointerleave="onCorePointerUp"
    >
      <LayoutGrid :size="28" :stroke-width="1.5" color="#1f2937" />
    </button>
  </nav>
</template>

<style lang="scss" scoped>
.neon-wheel-dock {
  // 用 absolute 而非 fixed：iOS PWA 下 fixed 的高度 = innerHeight（不含瀏海），
  // 會導致底部空白。absolute 相對於 #app（100vh = 全螢幕）定位才正確。
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 80px;
  z-index: 50;
  pointer-events: none;
}

.arc-rail {
  position: absolute;
  bottom: -160px; // 更多隱藏在底部
  left: 50%;
  transform: translateX(-50%);
  width: 320px;
  height: 320px;
  pointer-events: auto;
  transition: opacity 0.3s ease;

  &.hidden {
    pointer-events: none;
    opacity: 0;
  }
}

// 圓環軌道 - 簡潔風格
.rail-glow {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.15);
  opacity: 0.6;
  transition: opacity 0.3s ease;

  &.hidden {
    opacity: 0;
  }
}

// 導航按鈕
.nav-btn {
  position: absolute;
  top: 0;
  left: 50%;
  margin-left: -24px;
  margin-top: -24px;
  transform-origin: 24px 184px;
  width: 48px;
  height: 48px;
  background: rgba(30, 41, 59, 0.85); // 深色背景
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 2px;
  backdrop-filter: blur(10px);
  cursor: pointer;
  transition:
    opacity 0.25s ease,
    background 0.2s,
    border-color 0.2s,
    box-shadow 0.2s;
  color: white; // 圖標白色

  // 使用 CSS 變量控制縮放
  .nav-btn-inner {
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.15s;
  }

  // 標籤
  .nav-label {
    font-size: 8px;
    font-weight: 500;
    opacity: 0.7;
    white-space: nowrap;
    max-width: 44px;
    overflow: hidden;
    text-overflow: ellipsis;
    transform: rotate(calc(var(--angle, 0deg) * -1));
  }

  &:hover {
    background: rgba(30, 41, 59, 0.95);
    border-color: rgba(255, 255, 255, 0.4);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);

    .nav-label {
      opacity: 1;
    }
  }
}

// 滾動提示
.scroll-hint {
  position: absolute;
  bottom: 70px;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: none;
  transition: opacity 0.3s ease;

  &.hidden {
    opacity: 0;
  }

  .hint-text {
    font-size: 10px;
    color: rgba(100, 100, 100, 0.5);
    white-space: nowrap;
    animation: fadeInOut 4s ease-in-out infinite;
  }
}

@keyframes fadeInOut {
  0%,
  100% {
    opacity: 0.2;
  }
  50% {
    opacity: 0.5;
  }
}

// 中央按鈕
.core-btn {
  position: absolute;
  bottom: 8px; // 更緊貼底部
  left: 50%;
  transform: translateX(-50%);
  width: 52px; // 稍微縮小
  height: 52px;
  background: white;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  z-index: 60;
  pointer-events: auto;

  &:active {
    transform: translateX(-50%) scale(0.95);
  }
}
</style>
