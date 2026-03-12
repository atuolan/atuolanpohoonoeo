<template>
  <teleport to="body">
    <transition name="modal">
      <div v-if="visible" class="guide-overlay" @click.self="handleClose">
        <div class="guide-modal pixel-theme">
          <!-- 關閉按鈕 -->
          <button class="close-btn" @click="handleClose">
            <X :size="18" />
          </button>

          <!-- 標題區 -->
          <div class="guide-header">
            <div class="title-icon">
              <svg
                viewBox="0 0 16 16"
                fill="currentColor"
                shape-rendering="crispEdges"
              >
                <path
                  d="M3 5h2v1h1v1h1v-1h2v-1h3v1h1v1h1v2h1v1h-1v1h-1v1h-3v-1h-2v-1h-1v1h-1v1h-2v-1h-1v-1h-1v-2h1v-1h1v-1z M12 7h1v1h-1v-1z"
                />
              </svg>
            </div>
            <h2 class="title">釣魚</h2>
          </div>

          <!-- 主要說明 -->
          <div class="guide-intro">
            <p>你可以在各種地點釣到各式各樣的生魚，並用於烹飪。</p>
            <p>請確保銀行欄位有剩餘的空間來存放你可能獲得的道具。</p>
          </div>

          <!-- 內容區 -->
          <div class="guide-content">
            <!-- 額外道具 -->
            <div class="guide-section">
              <h3 class="section-title">遊戲說明</h3>

              <div class="guide-item">
                <div class="item-icon rod-icon">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M3 3l18 18M3 3v4M3 3h4" />
                    <circle cx="18" cy="18" r="3" />
                  </svg>
                </div>
                <div class="item-content">
                  <h4>魚竿系統</h4>
                  <p>
                    每種魚竿只會有一隻，購買時是增加耐力值而非獲得新魚竿。建議購買多支竹竿累積耐力後再開始掛機釣魚。
                  </p>
                </div>
              </div>

              <div class="guide-item">
                <div class="item-icon idle-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
                    />
                  </svg>
                </div>
                <div class="item-content">
                  <h4>掛機釣魚</h4>
                  <p>
                    掛機時間最長 24
                    小時，但實際掛機時長會受當前魚竿耐力值影響。耐力不足時會提前結束掛機。
                  </p>
                </div>
              </div>

              <div class="guide-item">
                <div class="item-icon trash-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M15 4V3H9v1H4v2h1v13c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V6h1V4h-5zm2 15H7V6h10v13z"
                    />
                  </svg>
                </div>
                <div class="item-content">
                  <h4>垃圾道具</h4>
                  <p>有時候會釣到海草垃圾等無用道具。</p>
                </div>
              </div>
            </div>
          </div>

          <!-- 提示區 -->
          <div class="guide-tips">
            <div class="tip-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
                />
              </svg>
            </div>
            <div class="tip-content">
              <strong>小提示：</strong
              >建議先購買多支竹竿累積耐力值後再開始掛機，這樣可以獲得更長的掛機時間和更多的魚獲！
            </div>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { X } from "lucide-vue-next";

defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

function handleClose() {
  emit("close");
}
</script>

<style scoped lang="scss">
@import url("https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap");

// 像素風格變數
$pixel-black: #1a1a2e;
$pixel-white: #ffffff;
$pixel-bg: #16213e;
$pixel-card-bg: #1a1a2e;
$pixel-text: #e2e8f0;
$pixel-text-muted: #94a3b8;
$pixel-accent: #22d3ee;
$pixel-font: "Press Start 2P", "Courier New", monospace;

.guide-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 20px;
}

.guide-modal {
  background: $pixel-bg;
  border: 3px solid $pixel-black;
  width: 100%;
  max-width: 680px;
  max-height: 85vh;
  overflow-y: auto;
  position: relative;
  padding: 32px;
  box-shadow: 0 0 40px rgba(0, 0, 0, 0.5);

  scrollbar-width: thin;
  scrollbar-color: $pixel-accent $pixel-bg;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: $pixel-accent;
    border-radius: 0;
  }
  &::-webkit-scrollbar-track {
    background: $pixel-bg;
  }
}

// 關閉按鈕
.close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  color: $pixel-text-muted;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;

  &:hover {
    color: $pixel-white;
  }
}

// 標題區
.guide-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 24px;

  .title-icon {
    width: 48px;
    height: 48px;
    color: $pixel-accent;
    margin-bottom: 12px;

    svg {
      width: 100%;
      height: 100%;
    }
  }

  .title {
    font-family: $pixel-font;
    font-size: 24px;
    font-weight: 400;
    color: $pixel-accent;
    margin: 0;
    letter-spacing: 2px;
  }
}

// 主要說明
.guide-intro {
  text-align: center;
  margin-bottom: 32px;
  padding: 0 20px;

  p {
    font-size: 13px;
    color: $pixel-text;
    line-height: 1.8;
    margin: 8px 0;
  }
}

// 內容區
.guide-content {
  display: flex;
  flex-direction: column;
}

// 區塊
.guide-section {
  .section-title {
    font-family: $pixel-font;
    font-size: 12px;
    font-weight: 400;
    color: $pixel-text;
    margin: 0 0 20px 0;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
}

// 項目
.guide-item {
  display: flex;
  gap: 14px;
  margin-bottom: 20px;

  &:last-child {
    margin-bottom: 0;
  }

  .item-icon {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;

    svg {
      width: 24px;
      height: 24px;
    }
  }

  // 圖標顏色
  .rod-icon {
    background: rgba(147, 197, 253, 0.2);
    color: #93c5fd;
  }

  .idle-icon {
    background: rgba(134, 239, 172, 0.2);
    color: #86efac;
  }

  .trash-icon {
    background: rgba(253, 186, 116, 0.2);
    color: #fdba74;
  }

  .cook-icon {
    background: rgba(252, 211, 77, 0.2);
    color: #fcd34d;
  }

  .magic-icon {
    background: rgba(216, 180, 254, 0.2);
    color: #d8b4fe;
  }

  .item-content {
    flex: 1;

    h4 {
      font-family: $pixel-font;
      font-size: 11px;
      font-weight: 400;
      color: $pixel-text;
      margin: 0 0 8px 0;
    }

    p {
      font-size: 12px;
      color: $pixel-text-muted;
      line-height: 1.7;
      margin: 0;
    }
  }
}

// 提示區
.guide-tips {
  display: flex;
  gap: 12px;
  margin-top: 28px;
  padding: 16px;
  background: rgba(34, 211, 238, 0.1);
  border: 1px solid rgba(34, 211, 238, 0.3);
  border-radius: 8px;

  .tip-icon {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    color: $pixel-accent;

    svg {
      width: 100%;
      height: 100%;
    }
  }

  .tip-content {
    font-size: 12px;
    color: $pixel-text;
    line-height: 1.7;

    strong {
      color: $pixel-accent;
    }
  }
}

// 動畫
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .guide-modal,
.modal-leave-active .guide-modal {
  transition: transform 0.2s ease;
}

.modal-enter-from .guide-modal,
.modal-leave-to .guide-modal {
  transform: scale(0.95);
}
</style>
