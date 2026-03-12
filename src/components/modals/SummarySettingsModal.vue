<template>
  <div class="modal-overlay" @click="$emit('close')">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h3>
          <svg viewBox="0 0 24 24" fill="currentColor" class="header-icon">
            <path
              d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"
            />
          </svg>
          AI 總結記憶設置
        </h3>
        <button class="close-btn" @click="$emit('close')">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            />
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <p class="description">
          控制總結觸發時機、AI 讀取的歷史總結數量和實際對話消息數量
        </p>

        <!-- 間隔模式選擇 -->
        <div class="setting-section">
          <label class="section-label">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"
              />
            </svg>
            計算模式
          </label>
          <div class="radio-group horizontal">
            <label
              class="radio-option compact"
              :class="{ active: localSettings.intervalMode === 'message' }"
            >
              <input
                v-model="localSettings.intervalMode"
                type="radio"
                value="message"
                class="radio-input"
              />
              <div class="option-content">
                <div class="option-title">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"
                    />
                  </svg>
                  消息數
                </div>
              </div>
            </label>
            <label
              class="radio-option compact"
              :class="{ active: localSettings.intervalMode === 'turn' }"
            >
              <input
                v-model="localSettings.intervalMode"
                type="radio"
                value="turn"
                class="radio-input"
              />
              <div class="option-content">
                <div class="option-title">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3L5 6.99h3V14h2V6.99h3L9 3z"
                    />
                  </svg>
                  輪次
                </div>
              </div>
            </label>
          </div>
          <div class="count-hint">
            <span v-if="localSettings.intervalMode === 'message'">
              📝 按消息條數計算（每條氣泡算一條）
            </span>
            <span v-else> 🔄 按對話輪次計算（用戶發言+AI回覆=1輪） </span>
          </div>
        </div>

        <!-- 總結間隔設置 -->
        <div class="setting-section">
          <label class="section-label">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"
              />
            </svg>
            總結間隔
          </label>
          <div class="count-input-wrapper">
            <input
              v-model.number="currentSummaryInterval"
              type="range"
              :min="localSettings.intervalMode === 'turn' ? 5 : 10"
              :max="localSettings.intervalMode === 'turn' ? 50 : 100"
              :step="localSettings.intervalMode === 'turn' ? 1 : 5"
              class="range-input"
            />
            <div class="count-display">
              <span class="count-number">{{ currentSummaryInterval }}</span>
              <span class="count-label">{{
                localSettings.intervalMode === "turn" ? "輪" : "條"
              }}</span>
            </div>
          </div>
          <div class="count-hint">
            每 {{ currentSummaryInterval }}
            {{
              localSettings.intervalMode === "turn" ? "輪對話" : "條消息"
            }}自動生成一次總結
          </div>
        </div>

        <!-- 實際讀取消息數設置 -->
        <div class="setting-section">
          <label class="section-label">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
              />
            </svg>
            實際讀取消息數
          </label>
          <div class="count-input-wrapper">
            <input
              v-model.number="localSettings.actualMessageCount"
              type="range"
              :min="10"
              :max="100"
              :step="5"
              class="range-input"
            />
            <div class="count-display">
              <span class="count-number">{{
                localSettings.actualMessageCount
              }}</span>
              <span class="count-label">條</span>
            </div>
          </div>
          <div class="count-hint">
            <span
              v-if="localSettings.actualMessageCount >= currentSummaryInterval"
            >
              ✅ 總結後不會忘記剛才的對話
            </span>
            <span v-else> ⚠️ 總結後可能會忘記部分內容 </span>
          </div>
        </div>

        <!-- 分隔線 -->
        <div class="section-divider">
          <span class="divider-text">📔 總結讀取設定</span>
        </div>

        <!-- 讀取模式選擇 -->
        <div class="setting-section">
          <label class="section-label">讀取模式</label>
          <div class="radio-group">
            <label
              class="radio-option"
              :class="{ active: localSettings.summaryReadMode === 'recent' }"
            >
              <input
                v-model="localSettings.summaryReadMode"
                type="radio"
                value="recent"
                class="radio-input"
              />
              <div class="option-content">
                <div class="option-title">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"
                    />
                  </svg>
                  讀取最近 N 條總結
                </div>
                <div class="option-desc">節省 tokens，適合長期對話</div>
              </div>
            </label>
            <label
              class="radio-option"
              :class="{ active: localSettings.summaryReadMode === 'all' }"
            >
              <input
                v-model="localSettings.summaryReadMode"
                type="radio"
                value="all"
                class="radio-input"
              />
              <div class="option-content">
                <div class="option-title">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"
                    />
                  </svg>
                  讀取所有總結
                </div>
                <div class="option-desc">記憶更完整，但會消耗更多 tokens</div>
              </div>
            </label>
          </div>
        </div>

        <!-- 讀取數量設置 -->
        <Transition name="fade">
          <div
            v-if="localSettings.summaryReadMode === 'recent'"
            class="setting-section"
          >
            <label class="section-label">讀取數量</label>
            <div class="count-input-wrapper">
              <input
                v-model.number="localSettings.summaryReadCount"
                type="range"
                min="1"
                max="20"
                class="range-input"
              />
              <div class="count-display">
                <span class="count-number">{{
                  localSettings.summaryReadCount
                }}</span>
                <span class="count-label">條總結</span>
              </div>
            </div>
            <div class="count-hint">
              <span v-if="localSettings.summaryReadCount <= 3"
                >💰 極少 tokens，最近記憶</span
              >
              <span v-else-if="localSettings.summaryReadCount <= 5"
                >💰💰 較少 tokens，推薦設置</span
              >
              <span v-else-if="localSettings.summaryReadCount <= 10"
                >💰💰💰 中等 tokens，良好記憶</span
              >
              <span v-else>💰💰💰💰 較多 tokens，完整記憶</span>
            </div>
          </div>
        </Transition>

        <!-- 當前狀態 -->
        <div class="info-section">
          <div class="info-header">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
              />
            </svg>
            當前對話狀態
          </div>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">總結數量</span>
              <span class="info-value">{{ totalSummaries }} 條</span>
            </div>
            <div class="info-item">
              <span class="info-label">將讀取</span>
              <span class="info-value highlight">
                {{
                  localSettings.summaryReadMode === "all"
                    ? totalSummaries
                    : Math.min(localSettings.summaryReadCount, totalSummaries)
                }}
                條
              </span>
            </div>
            <div class="info-item">
              <span class="info-label">預估 tokens</span>
              <span class="info-value">{{ estimatedTokens }} tokens</span>
            </div>
          </div>
        </div>

        <!-- 說明 -->
        <div class="tips-section">
          <div class="tips-header">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6C7.8 12.16 7 10.63 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z"
              />
            </svg>
            使用建議
          </div>
          <ul class="tips-list">
            <li><strong>日常聊天：</strong>讀取最近 5 條（推薦）</li>
            <li><strong>長期對話：</strong>讀取最近 3-5 條</li>
            <li><strong>重要劇情：</strong>讀取最近 10 條或全部</li>
            <li><strong>短期對話：</strong>讀取所有（總結少時）</li>
          </ul>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-cancel" @click="$emit('close')">取消</button>
        <button class="btn-save" @click="saveSettings">保存設置</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

const props = defineProps<{
  chatId: string;
  summaryCount?: number;
}>();

const emit = defineEmits<{
  close: [];
  save: [settings: typeof localSettings.value];
}>();

// 本地設置
const localSettings = ref({
  intervalMode: "message" as "message" | "turn",
  summaryIntervalMessage: 30,
  summaryIntervalTurn: 15,
  actualMessageCount: 60,
  summaryReadMode: "recent" as "all" | "recent",
  summaryReadCount: 5,
});

// 計算屬性
const currentSummaryInterval = computed({
  get: () =>
    localSettings.value.intervalMode === "turn"
      ? localSettings.value.summaryIntervalTurn
      : localSettings.value.summaryIntervalMessage,
  set: (val: number) => {
    if (localSettings.value.intervalMode === "turn") {
      localSettings.value.summaryIntervalTurn = val;
    } else {
      localSettings.value.summaryIntervalMessage = val;
    }
  },
});

const totalSummaries = computed(() => props.summaryCount || 0);

const estimatedTokens = computed(() => {
  const count =
    localSettings.value.summaryReadMode === "all"
      ? totalSummaries.value
      : Math.min(localSettings.value.summaryReadCount, totalSummaries.value);
  return count * 150;
});

// 保存設置
function saveSettings() {
  emit("save", { ...localSettings.value });
  emit("close");
}
</script>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100dvh;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 20px;
}

.modal-content {
  background: var(--color-surface, white);
  border-radius: 20px;
  width: 100%;
  max-width: 520px;
  max-height: calc(
    100dvh - 40px - env(safe-area-inset-top) - var(--safe-bottom, 0px)
  );
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));

  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text, #1f2937);
    display: flex;
    align-items: center;
    gap: 8px;

    .header-icon {
      width: 22px;
      height: 22px;
      color: var(--color-primary, #7dd3a8);
    }
  }

  .close-btn {
    width: 36px;
    height: 36px;
    padding: 0;
    background: var(--color-background, rgba(0, 0, 0, 0.04));
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary, #6b7280);

    svg {
      width: 20px;
      height: 20px;
    }

    &:hover {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
    }
  }
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  background: var(--color-background, #f9fafb);

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
  }
}

.description {
  margin: 0 0 20px 0;
  color: var(--color-text-secondary, #6b7280);
  font-size: 14px;
  line-height: 1.6;
  padding: 14px 16px;
  background: var(--color-surface, white);
  border-radius: 12px;
  border-left: 3px solid var(--color-primary, #7dd3a8);
}

.setting-section {
  margin-bottom: 20px;
  background: var(--color-surface, white);
  padding: 18px;
  border-radius: 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.section-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  color: var(--color-text, #1f2937);
  margin-bottom: 14px;

  svg {
    width: 20px;
    height: 20px;
    color: var(--color-primary, #7dd3a8);
  }
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 10px;

  &.horizontal {
    flex-direction: row;
    .radio-option {
      flex: 1;
    }
  }
}

.radio-option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  border: 1.5px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--color-background, #fafafa);

  &:hover {
    border-color: var(--color-primary, #7dd3a8);
    background: var(--color-surface, white);
  }

  &.active {
    border-color: var(--color-primary, #7dd3a8);
    background: var(--color-surface, white);
    box-shadow: 0 0 0 3px rgba(125, 211, 168, 0.1);
  }

  &.compact {
    padding: 12px;
    align-items: center;
    .option-content .option-title {
      margin-bottom: 0;
    }
  }

  .radio-input {
    margin-top: 2px;
    cursor: pointer;
    width: 18px;
    height: 18px;
    accent-color: var(--color-primary, #7dd3a8);
    flex-shrink: 0;
  }

  .option-content {
    flex: 1;
  }

  .option-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 14px;
    color: var(--color-text, #1f2937);
    margin-bottom: 4px;

    svg {
      width: 18px;
      height: 18px;
      color: var(--color-primary, #7dd3a8);
    }
  }

  .option-desc {
    font-size: 13px;
    color: var(--color-text-secondary, #6b7280);
    line-height: 1.4;
  }
}

.count-input-wrapper {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px;
  background: var(--color-background, #fafafa);
  border-radius: 10px;
  margin-bottom: 10px;

  .range-input {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: var(--color-border, #e5e7eb);
    outline: none;
    cursor: pointer;
    -webkit-appearance: none;

    &::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--color-primary, #7dd3a8);
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
      transition: transform 0.2s;

      &:hover {
        transform: scale(1.15);
      }
    }
  }

  .count-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 54px;

    .count-number {
      font-size: 22px;
      font-weight: 700;
      color: var(--color-primary, #7dd3a8);
      line-height: 1;
    }

    .count-label {
      font-size: 11px;
      color: var(--color-text-muted, #9ca3af);
      margin-top: 2px;
    }
  }
}

.count-hint {
  text-align: center;
  font-size: 13px;
  color: var(--color-text-secondary, #6b7280);
  padding: 10px 12px;
  background: #fef3c7;
  border-radius: 8px;
  font-weight: 500;
}

.section-divider {
  display: flex;
  align-items: center;
  margin: 24px 0 20px;

  &::before,
  &::after {
    content: "";
    flex: 1;
    height: 1px;
    background: linear-gradient(
      to right,
      transparent,
      var(--color-border, #e5e7eb),
      transparent
    );
  }

  .divider-text {
    padding: 0 16px;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-secondary, #6b7280);
  }
}

.info-section {
  background: var(--color-primary, #7dd3a8);
  border-radius: 14px;
  padding: 18px;
  color: white;
  margin-bottom: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);

  .info-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 14px;
    margin-bottom: 14px;

    svg {
      width: 18px;
      height: 18px;
    }
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  .info-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 8px;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 10px;
    backdrop-filter: blur(10px);

    .info-label {
      font-size: 11px;
      opacity: 0.9;
      margin-bottom: 4px;
    }

    .info-value {
      font-size: 17px;
      font-weight: 700;

      &.highlight {
        color: #fbbf24;
      }
    }
  }
}

.tips-section {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 12px;
  padding: 16px;

  .tips-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 14px;
    color: #0369a1;
    margin-bottom: 10px;

    svg {
      width: 18px;
      height: 18px;
      color: #0284c7;
    }
  }

  .tips-list {
    margin: 0;
    padding-left: 20px;

    li {
      font-size: 13px;
      color: #075985;
      line-height: 1.8;
      margin-bottom: 4px;

      strong {
        color: #0c4a6e;
        font-weight: 600;
      }

      &:last-child {
        margin-bottom: 0;
      }
    }
  }
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  padding-bottom: max(16px, var(--safe-bottom, 0px));
  border-top: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
  background: var(--color-surface, white);

  button {
    padding: 10px 24px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    border: none;

    &.btn-cancel {
      background: var(--color-background, #f3f4f6);
      color: var(--color-text-secondary, #6b7280);

      &:hover {
        background: var(--color-surface-hover, #e5e7eb);
      }
    }

    &.btn-save {
      background: var(--color-primary, #7dd3a8);
      color: white;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);

      &:hover {
        box-shadow: 0 4px 12px rgba(125, 211, 168, 0.3);
        transform: translateY(-1px);
      }
    }
  }
}

.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.2s,
    transform 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
