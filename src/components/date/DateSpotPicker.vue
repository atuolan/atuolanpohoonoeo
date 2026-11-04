<script setup lang="ts">
/**
 * 約會地點選擇（底部抽屜）：內建地點＋自訂地點
 */
import { DATE_SPOTS } from "@/data/dateSpots";
import type { DatePick } from "@/composables/useChatDate";
import { formatDuration } from "@/utils/dateLogic";
import { ref } from "vue";

defineProps<{ visible: boolean; charName: string }>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "pick", pick: DatePick): void;
}>();

const BUDGETS: Array<{ label: string; range: [number, number] }> = [
  { label: "隨便走走", range: [100, 400] },
  { label: "普通", range: [400, 1500] },
  { label: "奢侈一點", range: [2000, 6000] },
];

const customPlace = ref("");
const customBudget = ref(1);

function pickSpot(spotId: string) {
  emit("pick", { spotId });
}

function pickCustom() {
  const place = customPlace.value.trim();
  if (!place) return;
  emit("pick", { custom: { place: place.slice(0, 20), costPerPerson: BUDGETS[customBudget.value].range } });
  customPlace.value = "";
}

const priceText = (range: [number, number]) =>
  `每人 $${range[0].toLocaleString("en-US")}～${range[1].toLocaleString("en-US")}`;
</script>

<template>
  <Teleport to="body">
    <Transition name="date-picker-fade">
      <div v-if="visible" class="date-picker-overlay" @click.self="emit('close')">
        <div class="date-picker" role="dialog" aria-label="選約會地點">
          <div class="date-picker-header">
            <h3>約{{ charName }}出門</h3>
            <button type="button" class="date-picker-close" aria-label="關閉" @click="emit('close')">✕</button>
          </div>
          <div class="date-picker-body">
            <button
              v-for="spot in DATE_SPOTS"
              :key="spot.id"
              type="button"
              class="date-spot"
              @click="pickSpot(spot.id)"
            >
              <span class="date-spot-emoji" aria-hidden="true">{{ spot.emoji }}</span>
              <span class="date-spot-main">
                <span class="date-spot-name">{{ spot.name }}</span>
                <span class="date-spot-meta">{{ formatDuration(spot.durationMinutes) }}・{{ priceText(spot.costPerPerson) }}</span>
              </span>
            </button>

            <div class="date-custom">
              <div class="date-custom-title">📍 自訂地點</div>
              <input
                v-model="customPlace"
                type="text"
                maxlength="20"
                class="date-custom-input"
                placeholder="例如：陽明山、他家附近的公園"
                @keydown.enter.prevent="pickCustom"
              />
              <div class="date-custom-budgets" role="radiogroup" aria-label="花費">
                <button
                  v-for="(b, i) in BUDGETS"
                  :key="b.label"
                  type="button"
                  class="date-budget"
                  :class="{ active: customBudget === i }"
                  role="radio"
                  :aria-checked="customBudget === i"
                  @click="customBudget = i"
                >
                  {{ b.label }}
                </button>
              </div>
              <button type="button" class="date-custom-go" :disabled="!customPlace.trim()" @click="pickCustom">
                約他去這裡
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.date-picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.date-picker {
  width: 100%;
  max-height: 75vh;
  display: flex;
  flex-direction: column;
  border-radius: 20px 20px 0 0;
  background: var(--color-surface, #fff);
  color: var(--color-text-primary, #1f2937);
  padding-bottom: env(safe-area-inset-bottom);
}

.date-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, rgba(0, 0, 0, 0.06));

  h3 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
  }
}

.date-picker-close {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: var(--color-surface-alt, #f3f4f6);
  color: inherit;
  cursor: pointer;
}

.date-picker-body {
  overflow-y: auto;
  padding: 12px 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.date-spot {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 14px;
  background: var(--color-surface, #fff);
  color: inherit;
  text-align: left;
  cursor: pointer;

  &:active {
    transform: scale(0.99);
  }
}

.date-spot-emoji {
  font-size: 26px;
  line-height: 1;
}

.date-spot-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.date-spot-name {
  font-size: 15px;
  font-weight: 600;
}

.date-spot-meta {
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);
}

.date-custom {
  margin-top: 4px;
  padding: 12px 14px;
  border: 1px dashed var(--color-border, #e5e7eb);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.date-custom-title {
  font-size: 14px;
  font-weight: 600;
}

.date-custom-input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
  background: var(--color-surface, #fff);
  color: inherit;
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: var(--color-primary, #7dd3a8);
  }
}

.date-custom-budgets {
  display: flex;
  gap: 6px;
}

.date-budget {
  flex: 1;
  padding: 7px 0;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  cursor: pointer;

  &.active {
    border-color: var(--color-primary, #7dd3a8);
    background: var(--color-primary, #7dd3a8);
    color: var(--color-on-primary-contrast, #fff);
  }
}

.date-custom-go {
  padding: 10px;
  border: none;
  border-radius: 12px;
  background: var(--color-primary, #7dd3a8);
  color: var(--color-on-primary-contrast, #fff);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
}

.date-picker-fade-enter-active,
.date-picker-fade-leave-active {
  transition: opacity 0.2s ease;
}

.date-picker-fade-enter-from,
.date-picker-fade-leave-to {
  opacity: 0;
}
</style>
