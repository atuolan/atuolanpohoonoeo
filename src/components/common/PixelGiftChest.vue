<script setup lang="ts">
import { onMounted, ref, watch } from "vue";

// Props
interface Props {
  giftName?: string;
  autoOpen?: boolean;
  /** 是否為接收者模式（角色接收禮物） */
  receiverMode?: boolean;
  /** 是否已被接收 */
  received?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  giftName: "",
  autoOpen: false,
  receiverMode: false,
  received: false,
});

// Emits
const emit = defineEmits<{
  (e: "open"): void;
  (e: "collect"): void;
  (e: "receive"): void;
}>();

// State
const isOpen = ref(props.autoOpen || props.received);
const isShaking = ref(false);
const showReward = ref(false);

// 監聽 received prop 變化，觸發接收動畫
watch(
  () => props.received,
  (newVal, oldVal) => {
    // 當 received 從 false 變成 true 時，觸發接收動畫
    if (newVal && !oldVal && !isOpen.value) {
      receiveGift();
    }
  },
);

// 打開寶箱（用戶點擊）
function openChest() {
  // 接收者模式下，用戶不能點擊打開
  if (props.receiverMode || isOpen.value) return;

  isShaking.value = true;
  spawnParticles();

  setTimeout(() => {
    isShaking.value = false;
    isOpen.value = true;
    emit("open");

    setTimeout(() => {
      showReward.value = true;
    }, 300);
  }, 500);
}

// 角色接收禮物（自動觸發）
function receiveGift() {
  if (isOpen.value) return;

  isShaking.value = true;
  spawnParticles();

  setTimeout(() => {
    isShaking.value = false;
    isOpen.value = true;
    emit("receive");
  }, 500);
}

// 收集獎勵
function collectReward() {
  showReward.value = false;
  emit("collect");
}

// 粒子效果
const particles = ref<
  Array<{
    id: number;
    color: string;
    tx: string;
    ty: string;
  }>
>([]);

function spawnParticles() {
  const colors = ["#FFD700", "#FFFFFF", "#FFA500", "#FF6B6B", "#4ECDC4"];
  const newParticles = [];

  for (let i = 0; i < 20; i++) {
    newParticles.push({
      id: Date.now() + i,
      color: colors[Math.floor(Math.random() * colors.length)],
      tx: `${(Math.random() - 0.5) * 80}px`,
      ty: `${(Math.random() - 1) * 60}px`,
    });
  }

  particles.value = newParticles;

  setTimeout(() => {
    particles.value = [];
  }, 1000);
}

// 暴露方法給父組件
defineExpose({
  receiveGift,
  isOpen,
});

// 如果已經被接收，直接顯示打開狀態
onMounted(() => {
  if (props.received) {
    isOpen.value = true;
  }
});
</script>

<template>
  <div class="pixel-gift-container">
    <div
      class="chest-wrapper"
      :class="{ shaking: isShaking }"
      @click="openChest"
    >
      <!-- SVG 像素寶箱 -->
      <svg
        viewBox="0 0 32 32"
        xmlns="http://www.w3.org/2000/svg"
        shape-rendering="crispEdges"
        class="chest-svg"
      >
        <!-- 關閉狀態 -->
        <g v-if="!isOpen" class="chest-closed">
          <!-- 陰影 -->
          <rect x="2" y="26" width="28" height="4" fill="#000" opacity="0.3" />
          <!-- 外框 -->
          <path
            d="M4 10 h24 v18 h-24 z"
            fill="#3E2723"
            stroke="#000"
            stroke-width="2"
          />
          <!-- 底色 -->
          <rect x="5" y="11" width="22" height="16" fill="#8D6E63" />
          <!-- 蓋子 -->
          <rect x="4" y="11" width="24" height="6" fill="#5D4037" />
          <!-- 金屬條 -->
          <rect
            x="8"
            y="10"
            width="4"
            height="18"
            fill="#FFC107"
            opacity="0.9"
          />
          <rect
            x="20"
            y="10"
            width="4"
            height="18"
            fill="#FFC107"
            opacity="0.9"
          />
          <!-- 鎖 -->
          <rect x="14" y="14" width="4" height="5" fill="#C0C0C0" />
          <rect x="15" y="15" width="2" height="3" fill="#000" opacity="0.2" />
          <!-- 高光 -->
          <rect x="5" y="11" width="22" height="1" fill="#FFF" opacity="0.2" />
          <rect x="8" y="10" width="1" height="18" fill="#FFE082" />
          <rect x="20" y="10" width="1" height="18" fill="#FFE082" />
        </g>

        <!-- 打開狀態 -->
        <g v-else class="chest-open">
          <!-- 陰影 -->
          <rect x="2" y="26" width="28" height="4" fill="#000" opacity="0.3" />
          <!-- 內部 -->
          <rect x="5" y="11" width="22" height="16" fill="#3E2723" />
          <rect x="6" y="12" width="20" height="14" fill="#212121" />
          <!-- 寶藏 -->
          <rect x="8" y="8" width="16" height="8" fill="#FFD700" />
          <rect x="10" y="6" width="4" height="4" fill="#FF5722" />
          <rect x="18" y="7" width="3" height="3" fill="#00BCD4" />
          <!-- 前面 -->
          <rect x="4" y="18" width="24" height="10" fill="#8D6E63" />
          <rect x="8" y="18" width="4" height="10" fill="#FFC107" />
          <rect x="20" y="18" width="4" height="10" fill="#FFC107" />
          <rect x="14" y="18" width="4" height="3" fill="#C0C0C0" />
          <!-- 蓋子（打開） -->
          <path d="M4 18 L2 6 L30 6 L28 18 Z" fill="#5D4037" />
          <path d="M8 18 L6 6 L10 6 L12 18 Z" fill="#FFC107" />
          <path d="M20 18 L22 6 L26 6 L24 18 Z" fill="#FFC107" />
        </g>
      </svg>

      <!-- 粒子效果 -->
      <div
        v-for="p in particles"
        :key="p.id"
        class="particle"
        :style="{
          '--tx': p.tx,
          '--ty': p.ty,
          backgroundColor: p.color,
        }"
      />
    </div>

    <!-- 禮物名稱標籤 -->
    <div class="gift-label">
      <span class="gift-text">{{ giftName }}</span>
    </div>

    <!-- 點擊提示 -->
    <p v-if="!isOpen && !receiverMode" class="tap-hint">點擊打開</p>
    <p v-else-if="!isOpen && receiverMode" class="tap-hint waiting">
      等待接收中...
    </p>
    <p v-else-if="isOpen && receiverMode" class="tap-hint received">已收下！</p>

    <!-- 獎勵彈窗 -->
    <Transition name="reward-pop">
      <div v-if="showReward" class="reward-overlay" @click="collectReward">
        <div class="reward-content">
          <h3 class="reward-title">獲得禮物！</h3>
          <div class="reward-item">{{ giftName }}</div>
          <button class="collect-btn" @click.stop="collectReward">收下</button>
        </div>
      </div>
    </Transition>

    <!-- 插槽 -->
    <slot />
  </div>
</template>

<style lang="scss" scoped>
.pixel-gift-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
  position: relative;
}

.chest-wrapper {
  width: 100px;
  height: 100px;
  cursor: pointer;
  position: relative;
  transition: transform 0.1s;

  &:hover {
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }

  &.shaking {
    animation: shake 0.5s infinite;
  }
}

.chest-svg {
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  overflow: visible;
}

// 粒子
.particle {
  position: absolute;
  width: 4px;
  height: 4px;
  left: 50%;
  top: 50%;
  pointer-events: none;
  animation: float-up 1s ease-out forwards;
}

// 禮物標籤
.gift-label {
  background: linear-gradient(135deg, #fff8e7 0%, #fff0d4 100%);
  padding: 6px 16px;
  border-radius: 16px;
  border: 2px solid #e8d5b7;
  box-shadow:
    0 2px 8px rgba(139, 90, 43, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);

  .gift-text {
    font-size: 13px;
    font-weight: 600;
    color: #8b4513;
    letter-spacing: 0.5px;
  }
}

// 點擊提示
.tap-hint {
  font-size: 10px;
  color: #888;
  margin: 0;
  animation: pulse 2s ease-in-out infinite;

  &.waiting {
    color: #f59e0b;
  }

  &.received {
    color: #10b981;
    animation: none;
  }
}

// 獎勵彈窗
.reward-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  z-index: 10;
}

.reward-content {
  text-align: center;
  padding: 16px;
}

.reward-title {
  color: #ffd700;
  font-size: 14px;
  margin: 0 0 8px 0;
  text-shadow: 1px 1px #000;
}

.reward-item {
  font-size: 18px;
  color: #fff;
  margin: 8px 0;
}

.collect-btn {
  background: linear-gradient(180deg, #4caf50 0%, #388e3c 100%);
  border: 2px solid #2e7d32;
  color: white;
  padding: 8px 20px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  margin-top: 8px;
  box-shadow: 0 3px 0 #1b5e20;
  transition: all 0.1s;

  &:active {
    transform: translateY(2px);
    box-shadow: 0 1px 0 #1b5e20;
  }
}

// 動畫
@keyframes shake {
  0% {
    transform: translate(0, 0) rotate(0deg);
  }
  25% {
    transform: translate(-2px, 0) rotate(-5deg);
  }
  50% {
    transform: translate(2px, 0) rotate(5deg);
  }
  75% {
    transform: translate(-2px, 0) rotate(-5deg);
  }
  100% {
    transform: translate(0, 0) rotate(0deg);
  }
}

@keyframes float-up {
  0% {
    transform: translate(0, 0);
    opacity: 1;
  }
  100% {
    transform: translate(var(--tx), var(--ty));
    opacity: 0;
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}

// 獎勵彈窗過渡
.reward-pop-enter-active,
.reward-pop-leave-active {
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.reward-pop-enter-from,
.reward-pop-leave-to {
  opacity: 0;
  transform: scale(0.8);
}
</style>
