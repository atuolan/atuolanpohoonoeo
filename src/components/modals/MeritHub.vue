<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="visible"
        class="merit-hub-overlay"
        @click.self="$emit('close')"
      >
        <div class="merit-hub-modal">
          <div class="modal-header">
            <h2 class="title">修行</h2>
            <button class="close-btn" @click="$emit('close')">
              <X :size="20" />
            </button>
          </div>

          <!-- 功德總覽 -->
          <div class="merit-overview">
            <div class="merit-balance">
              <span class="label">功德</span>
              <span class="value">{{ meritStore.state.balance }}</span>
            </div>
            <div class="merit-total">
              累計 {{ meritStore.state.totalEarned }}
            </div>
          </div>

          <!-- 分頁 -->
          <div class="tabs">
            <button
              class="tab"
              :class="{ active: activeTab === 'games' }"
              @click="activeTab = 'games'"
            >
              修行
            </button>
            <button
              class="tab"
              :class="{ active: activeTab === 'shop' }"
              @click="activeTab = 'shop'"
            >
              功德商店
            </button>
          </div>

          <!-- 修行分頁 -->
          <div v-if="activeTab === 'games'" class="tab-content">
            <div class="games-grid">
              <button class="game-card" @click="showWoodfish = true">
                <div class="game-icon woodfish">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <ellipse cx="12" cy="14" rx="9" ry="7" />
                    <ellipse cx="12" cy="8" rx="3" ry="2" />
                    <circle cx="12" cy="6" r="1.5" />
                  </svg>
                </div>
                <div class="game-info">
                  <h3>敲木魚</h3>
                  <p>咚咚咚，功德 +1</p>
                </div>
                <div class="game-stat">
                  已敲 {{ meritStore.state.woodfish.totalTaps }} 次
                </div>
              </button>

              <button class="game-card" @click="showBeads = true">
                <div class="game-icon beads">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <circle cx="12" cy="3" r="2" />
                    <circle cx="18" cy="6" r="2" />
                    <circle cx="20" cy="12" r="2" />
                    <circle cx="18" cy="18" r="2" />
                    <circle cx="12" cy="21" r="2" />
                    <circle cx="6" cy="18" r="2" />
                    <circle cx="4" cy="12" r="2" />
                    <circle cx="6" cy="6" r="2" />
                  </svg>
                </div>
                <div class="game-info">
                  <h3>盤佛珠</h3>
                  <p>一圈 18 顆，完成 +5</p>
                </div>
                <div class="game-stat">
                  已完成 {{ meritStore.state.beads.completedRounds }} 圈
                </div>
              </button>
            </div>
          </div>

          <!-- 商店分頁 -->
          <div v-if="activeTab === 'shop'" class="tab-content shop-content">
            <!-- 句子商品 -->
            <div class="shop-section">
              <div class="section-title">飄字句子</div>
              <div class="shop-list">
                <div
                  v-for="s in unlockableSentences"
                  :key="s.id"
                  class="shop-item"
                  :class="{ owned: meritStore.isSentenceUnlocked(s.id) }"
                >
                  <div class="item-info">
                    <div class="item-name">{{ s.words.join(" ") }}</div>
                    <div class="item-category">{{ s.category }}</div>
                  </div>
                  <button
                    v-if="!meritStore.isSentenceUnlocked(s.id)"
                    class="buy-btn"
                    :disabled="meritStore.state.balance < s.price"
                    @click="buySentence(s.id)"
                  >
                    {{ s.price }} 功德
                  </button>
                  <span v-else class="owned-badge">已解鎖</span>
                </div>
              </div>
            </div>

            <!-- 自訂句子欄位 -->
            <div class="shop-section">
              <div class="section-title">
                自訂句子（{{ meritStore.state.customSentences.length }}/{{
                  meritStore.state.customSlots
                }}）
              </div>

              <!-- 已有的自訂句子 -->
              <div
                v-for="cs in meritStore.state.customSentences"
                :key="cs.id"
                class="custom-sentence-row"
              >
                <span class="cs-text">{{ cs.text }}</span>
                <button class="cs-delete" @click="deleteCustom(cs.id)">
                  <X :size="14" />
                </button>
              </div>

              <!-- 新增自訂句子 -->
              <div
                v-if="
                  meritStore.state.customSentences.length <
                  meritStore.state.customSlots
                "
                class="add-custom"
              >
                <input
                  v-model="newCustomText"
                  class="custom-input"
                  placeholder="輸入你的句子..."
                  @keyup.enter="addCustom"
                />
                <button
                  class="add-btn"
                  :disabled="!newCustomText.trim()"
                  @click="addCustom"
                >
                  新增
                </button>
              </div>

              <!-- 解鎖更多欄位 -->
              <button
                v-if="meritStore.state.customSlots < MAX_CUSTOM_SLOTS"
                class="unlock-slot-btn"
                :disabled="meritStore.state.balance < CUSTOM_SLOT_PRICE"
                @click="unlockSlot"
              >
                解鎖自訂欄位（{{ CUSTOM_SLOT_PRICE }} 功德）
              </button>
              <div v-else class="max-hint">已達自訂上限</div>
            </div>

            <!-- 句子選擇 -->
            <div class="shop-section">
              <div class="section-title">當前使用的句子</div>
              <div class="selector-row">
                <label class="selector-label">敲木魚</label>
                <select
                  class="selector"
                  :value="meritStore.state.woodfish.selectedSentenceId"
                  @change="onSelectWoodfish"
                >
                  <option
                    v-for="opt in availableSentenceOptions"
                    :key="opt.id"
                    :value="opt.id"
                  >
                    {{ opt.label }}
                  </option>
                </select>
              </div>
              <div class="selector-row">
                <label class="selector-label">盤佛珠</label>
                <select
                  class="selector"
                  :value="meritStore.state.beads.selectedSentenceId"
                  @change="onSelectBeads"
                >
                  <option
                    v-for="opt in availableSentenceOptions"
                    :key="opt.id"
                    :value="opt.id"
                  >
                    {{ opt.label }}
                  </option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <WoodfishGame :visible="showWoodfish" @close="showWoodfish = false" />
  <PrayerBeadsGame :visible="showBeads" @close="showBeads = false" />
</template>

<script setup lang="ts">
import PrayerBeadsGame from "@/components/modals/PrayerBeadsGame.vue";
import WoodfishGame from "@/components/modals/WoodfishGame.vue";
import {
    BEADS_DEFAULT_SENTENCE,
    CUSTOM_SLOT_PRICE,
    getSentenceById,
    MAX_CUSTOM_SLOTS,
    UNLOCKABLE_SENTENCES,
    WOODFISH_DEFAULT_SENTENCE,
} from "@/data/meritSentences";
import { useMeritStore } from "@/stores/merit";
import { X } from "lucide-vue-next";
import { computed, ref, watch } from "vue";

const props = defineProps<{ visible: boolean }>();
defineEmits<{ close: [] }>();

const meritStore = useMeritStore();
const showWoodfish = ref(false);
const showBeads = ref(false);
const activeTab = ref<"games" | "shop">("games");
const newCustomText = ref("");

const unlockableSentences = UNLOCKABLE_SENTENCES;

/** 所有可選句子（已解鎖的 + 自訂的） */
const availableSentenceOptions = computed(() => {
  const options: { id: string; label: string }[] = [];

  // 預設句子
  options.push({
    id: WOODFISH_DEFAULT_SENTENCE.id,
    label: WOODFISH_DEFAULT_SENTENCE.words.join(" "),
  });
  options.push({
    id: BEADS_DEFAULT_SENTENCE.id,
    label: BEADS_DEFAULT_SENTENCE.words.join(" "),
  });

  // 已解鎖句子
  for (const sid of meritStore.state.unlockedSentences) {
    const s = getSentenceById(sid);
    if (s) options.push({ id: s.id, label: s.words.join(" ") });
  }

  // 自訂句子
  for (const cs of meritStore.state.customSentences) {
    options.push({ id: cs.id, label: cs.text });
  }

  return options;
});

function buySentence(id: string) {
  const result = meritStore.unlockSentence(id);
  if (result.success) meritStore.saveState();
}

function unlockSlot() {
  const result = meritStore.unlockCustomSlot();
  if (result.success) meritStore.saveState();
}

function addCustom() {
  const text = newCustomText.value.trim();
  if (!text) return;
  const result = meritStore.addCustomSentence(text);
  if (result.success) {
    newCustomText.value = "";
    meritStore.saveState();
  }
}

function deleteCustom(id: string) {
  meritStore.removeCustomSentence(id);
  meritStore.saveState();
}

function onSelectWoodfish(e: Event) {
  const val = (e.target as HTMLSelectElement).value;
  meritStore.selectWoodfishSentence(val);
  meritStore.saveState();
}

function onSelectBeads(e: Event) {
  const val = (e.target as HTMLSelectElement).value;
  meritStore.selectBeadsSentence(val);
  meritStore.saveState();
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      meritStore.initialize();
      activeTab.value = "games";
    }
  },
);
</script>

<style scoped lang="scss">
.merit-hub-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.merit-hub-modal {
  background: var(--color-surface, #fff);
  border-radius: 20px;
  width: 100%;
  max-width: 400px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 20px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;

  .title {
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text, #1f2937);
    margin: 0;
  }

  .close-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: var(--color-background, #f3f4f6);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--color-text-secondary, #6b7280);
  }
}

.merit-overview {
  text-align: center;
  margin-bottom: 14px;
  padding: 12px;
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  border-radius: 12px;

  .merit-balance {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 8px;
    .label {
      font-size: 14px;
      color: #92400e;
    }
    .value {
      font-size: 32px;
      font-weight: 700;
      color: #92400e;
    }
  }
  .merit-total {
    font-size: 12px;
    color: #a16207;
    margin-top: 2px;
  }
}

.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 14px;
  background: var(--color-background, #f3f4f6);
  border-radius: 10px;
  padding: 3px;

  .tab {
    flex: 1;
    padding: 8px 0;
    border: none;
    background: transparent;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text-secondary, #6b7280);
    cursor: pointer;
    transition: all 0.2s;

    &.active {
      background: var(--color-surface, #fff);
      color: #d97706;
      font-weight: 600;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }
  }
}

.tab-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

// ===== 修行分頁 =====
.games-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.game-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  background: var(--color-background, #f9fafb);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  width: 100%;

  &:active {
    transform: scale(0.98);
  }

  .game-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    svg {
      width: 24px;
      height: 24px;
      color: white;
    }
    &.woodfish {
      background: #a0782c;
    }
    &.beads {
      background: #d97706;
    }
  }

  .game-info {
    flex: 1;
    min-width: 0;
    h3 {
      font-size: 15px;
      font-weight: 600;
      color: var(--color-text, #1f2937);
      margin: 0;
    }
    p {
      font-size: 12px;
      color: var(--color-text-secondary, #6b7280);
      margin: 2px 0 0;
    }
  }

  .game-stat {
    font-size: 11px;
    color: var(--color-text-secondary, #9ca3af);
    white-space: nowrap;
  }
}

// ===== 商店分頁 =====
.shop-content {
  padding-bottom: 8px;
}

.shop-section {
  margin-bottom: 18px;

  .section-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-secondary, #6b7280);
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
}

.shop-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.shop-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--color-background, #f9fafb);
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.04);

  &.owned {
    opacity: 0.7;
  }

  .item-info {
    flex: 1;
    min-width: 0;

    .item-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--color-text, #1f2937);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .item-category {
      font-size: 11px;
      color: var(--color-text-secondary, #9ca3af);
    }
  }

  .buy-btn {
    padding: 5px 12px;
    border: none;
    background: #d97706;
    color: white;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s;

    &:disabled {
      background: #e5e7eb;
      color: #9ca3af;
      cursor: not-allowed;
    }

    &:not(:disabled):active {
      transform: scale(0.95);
    }
  }

  .owned-badge {
    font-size: 12px;
    color: #16a34a;
    font-weight: 500;
    white-space: nowrap;
  }
}

.custom-sentence-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--color-background, #f9fafb);
  border-radius: 8px;
  margin-bottom: 6px;

  .cs-text {
    flex: 1;
    font-size: 13px;
    color: var(--color-text, #1f2937);
  }

  .cs-delete {
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    color: var(--color-text-secondary, #9ca3af);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;

    &:hover {
      color: #e53e3e;
    }
  }
}

.add-custom {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;

  .custom-input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 8px;
    font-size: 13px;
    background: var(--color-background, #fff);
    color: var(--color-text, #1f2937);
    outline: none;

    &:focus {
      border-color: #d97706;
    }
  }

  .add-btn {
    padding: 8px 14px;
    border: none;
    background: #d97706;
    color: white;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;

    &:disabled {
      background: #e5e7eb;
      color: #9ca3af;
      cursor: not-allowed;
    }
    &:not(:disabled):active {
      transform: scale(0.95);
    }
  }
}

.unlock-slot-btn {
  width: 100%;
  padding: 10px;
  border: 2px dashed rgba(217, 119, 6, 0.3);
  background: transparent;
  color: #d97706;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:disabled {
    border-color: rgba(0, 0, 0, 0.08);
    color: #9ca3af;
    cursor: not-allowed;
  }

  &:not(:disabled):hover {
    background: rgba(217, 119, 6, 0.05);
  }
}

.max-hint {
  text-align: center;
  font-size: 12px;
  color: var(--color-text-secondary, #9ca3af);
  padding: 8px;
}

.selector-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;

  .selector-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text, #1f2937);
    width: 60px;
    flex-shrink: 0;
  }

  .selector {
    flex: 1;
    padding: 7px 10px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 8px;
    font-size: 12px;
    background: var(--color-background, #fff);
    color: var(--color-text, #1f2937);
    outline: none;
    cursor: pointer;

    &:focus {
      border-color: #d97706;
    }
  }
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.25s;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
