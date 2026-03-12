<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="affinity-overlay" @click.self="close">
        <div class="affinity-modal">
          <header class="affinity-header">
            <h3>角色數值</h3>
            <div class="header-actions">
              <button class="rescan-btn" @click="rescan" title="從最新訊息重新獲取變量">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="23 4 23 10 17 10"></polyline>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                </svg>
              </button>
              <button class="close-btn" @click="close">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                  />
                </svg>
              </button>
            </div>
          </header>

          <div class="affinity-content">
            <div v-if="metrics.length === 0" class="empty-state">
              尚未配置數值指標
            </div>

            <div
              v-for="m in metrics"
              :key="m.id"
              class="metric-item"
            >
              <!-- 數字型指標：進度條 + ±按鈕 -->
              <template v-if="m.type !== 'string'">
                <div class="metric-top">
                  <span class="metric-name">{{ m.name }}</span>
                  <span class="metric-value">{{ m.value }}/{{ m.max }}</span>
                </div>

                <div class="metric-bar-wrap">
                  <div
                    class="metric-bar-fill"
                    :style="{ width: (m.percentage * 100) + '%' }"
                  ></div>
                </div>

                <div class="metric-bottom">
                  <span v-if="m.stage" class="metric-stage">{{ m.stage }}</span>
                  <span v-else class="metric-stage empty"></span>
                  <div class="metric-controls">
                    <button
                      class="adj-btn"
                      :disabled="typeof m.value === 'number' && m.value <= m.min"
                      @click="adjust(m.id, -1)"
                    >
                      −
                    </button>
                    <button
                      class="adj-btn"
                      :disabled="typeof m.value === 'number' && m.value >= m.max"
                      @click="adjust(m.id, 1)"
                    >
                      +
                    </button>
                  </div>
                </div>
              </template>

              <!-- 字串型指標：標籤 + 下拉選擇器 -->
              <template v-else>
                <div class="metric-top">
                  <span class="metric-name">{{ m.name }}</span>
                  <span class="metric-tag">{{ m.value }}</span>
                </div>
                <div class="metric-bottom">
                  <select
                    v-if="m.options && m.options.length > 0"
                    class="string-select"
                    :value="String(m.value)"
                    @change="setStringMetric(m.id, ($event.target as HTMLSelectElement).value)"
                  >
                    <option
                      v-for="opt in m.options"
                      :key="opt"
                      :value="opt"
                    >{{ opt }}</option>
                  </select>
                  <input
                    v-else
                    class="string-input"
                    :value="String(m.value)"
                    @change="setStringMetric(m.id, ($event.target as HTMLInputElement).value)"
                    placeholder="輸入值"
                  />
                </div>
              </template>
            </div>

            <!-- 變化歷史 -->
            <div v-if="recentHistory.length > 0" class="history-section">
              <h4 class="history-title">近期變化</h4>
              <div
                v-for="(h, idx) in recentHistory"
                :key="idx"
                class="history-item"
              >
                <span class="history-metric">{{ getMetricName(h.metricId) }}</span>
                <span
                  v-if="typeof h.oldValue === 'number' && typeof h.newValue === 'number'"
                  class="history-change"
                  :class="{ positive: h.newValue > h.oldValue, negative: h.newValue < h.oldValue }"
                >
                  {{ h.newValue > h.oldValue ? '+' : '' }}{{ h.newValue - h.oldValue }}
                </span>
                <span v-else class="history-change string-change">
                  {{ h.oldValue }} → {{ h.newValue }}
                </span>
                <span class="history-reason">{{ h.reason || '手動調整' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useAffinityStore } from "@/stores/affinity";

const props = defineProps<{
  visible: boolean;
  chatId: string;
  characterId: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "rescan"): void;
}>();

const affinityStore = useAffinityStore();

const metrics = computed(() => affinityStore.getMetricsSnapshot(props.chatId));

const recentHistory = computed(() => {
  const state = affinityStore.getState(props.chatId);
  if (!state) return [];
  return [...state.history].reverse().slice(0, 10);
});

function getMetricName(metricId: string): string {
  const config = affinityStore.getConfig(props.characterId);
  const m = config?.metrics.find((x) => x.id === metricId);
  return m?.name || metricId;
}

function adjust(metricId: string, delta: number) {
  affinityStore.updateMetric(props.chatId, metricId, delta, "手動調整");
}

function setStringMetric(metricId: string, value: string) {
  affinityStore.setMetric(props.chatId, metricId, value, "手動調整");
}

function close() {
  emit("close");
}

function rescan() {
  emit("rescan");
}
</script>

<style scoped lang="scss">
.affinity-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.affinity-modal {
  background: white;
  border-radius: 16px;
  width: min(360px, 90vw);
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}

.affinity-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;

  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
  }
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.rescan-btn {
  background: none;
  border: none;
  width: 28px;
  height: 28px;
  cursor: pointer;
  color: #9ca3af;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;

  &:hover {
    background: #f3f4f6;
    color: #059669;
  }

  svg {
    width: 16px;
    height: 16px;
  }
}

.close-btn {
  background: none;
  border: none;
  width: 28px;
  height: 28px;
  cursor: pointer;
  color: #9ca3af;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;

  &:hover {
    background: #f3f4f6;
    color: #374151;
  }

  svg {
    width: 18px;
    height: 18px;
  }
}

.affinity-content {
  padding: 16px 20px;
}

.empty-state {
  text-align: center;
  color: #9ca3af;
  font-size: 14px;
  padding: 24px 0;
}

.metric-item {
  margin-bottom: 16px;

  &:last-child {
    margin-bottom: 0;
  }
}

.metric-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}

.metric-name {
  font-size: 14px;
  font-weight: 500;
  color: #374151;
}

.metric-value {
  font-size: 13px;
  color: #6b7280;
  font-variant-numeric: tabular-nums;
}

.metric-bar-wrap {
  height: 8px;
  background: #f3f4f6;
  border-radius: 4px;
  overflow: hidden;
}

.metric-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #7dd3a8, #34d399);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.metric-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
}

.metric-stage {
  font-size: 12px;
  color: #7dd3a8;
  font-weight: 500;

  &.empty {
    visibility: hidden;
  }
}

.metric-controls {
  display: flex;
  gap: 4px;
}

.adj-btn {
  width: 26px;
  height: 26px;
  border: 1px solid #e5e7eb;
  background: white;
  border-radius: 6px;
  font-size: 16px;
  color: #6b7280;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;

  &:hover:not(:disabled) {
    border-color: #7dd3a8;
    color: #059669;
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
}

// 字串型指標
.metric-tag {
  font-size: 13px;
  background: linear-gradient(135deg, #e0f2fe, #dbeafe);
  color: #1d4ed8;
  padding: 2px 10px;
  border-radius: 10px;
  font-weight: 500;
}

.string-select {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  background: white;
  cursor: pointer;
}

.string-input {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  background: white;
}

.string-change {
  color: #6366f1;
}

// 歷史記錄
.history-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
}

.history-title {
  font-size: 13px;
  color: #6b7280;
  margin: 0 0 10px 0;
  font-weight: 500;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
}

.history-metric {
  color: #374151;
  font-weight: 500;
  min-width: 50px;
}

.history-change {
  font-variant-numeric: tabular-nums;
  font-weight: 600;

  &.positive {
    color: #059669;
  }

  &.negative {
    color: #dc2626;
  }
}

.history-reason {
  color: #9ca3af;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// 過渡動畫
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s;

  .affinity-modal {
    transition: transform 0.2s;
  }
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;

  .affinity-modal {
    transform: scale(0.95);
  }
}
</style>
