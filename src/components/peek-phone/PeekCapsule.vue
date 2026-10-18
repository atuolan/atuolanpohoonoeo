<script setup lang="ts">
/** 頂部膠囊：窺視層的入口，點了叫出窺視選單 */
import { Loader2 } from "lucide-vue-next";
import { initialOf } from "./peekPhoneView";

const props = defineProps<{
  name: string;
  avatar?: string;
  battery: number;
  /** 窺視選單打開中 */
  active?: boolean;
  /** 還在生成手機內容 */
  loading?: boolean;
  /** 膠囊上的字，例如「這裡有 2 個秘密」；沒給就是「XX的手機」 */
  label?: string;
  /** 還有沒找到的秘密：亮琥珀點 */
  secret?: boolean;
}>();

const emit = defineEmits<{ open: [] }>();
</script>

<template>
  <button
    type="button"
    class="peek-capsule"
    :class="{ 'is-active': props.active }"
    :aria-label="`窺視選單：${props.label ?? `${props.name}的手機`}，電量 ${props.battery}%`"
    :aria-expanded="props.active"
    @click="emit('open')"
  >
    <span class="peek-capsule-pill">
      <span class="peek-capsule-avatar">
        <img v-if="props.avatar" :src="props.avatar" alt="" />
        <template v-else>{{ initialOf(props.name) }}</template>
      </span>
      <span class="peek-capsule-label">{{ props.active ? "窺視中" : (props.label ?? `${props.name}的手機`) }}</span>
      <Loader2 v-if="props.loading" :size="12" class="peek-capsule-spin" aria-hidden="true" />
      <span v-else-if="props.secret && !props.active" class="peek-capsule-dot" aria-hidden="true" />
      <span class="peek-capsule-battery">{{ props.battery }}%</span>
    </span>
  </button>
</template>

<style scoped lang="scss">
.peek-capsule {
  position: absolute;
  left: 50%;
  top: calc(var(--safe-top, 0px) + 10px);
  transform: translateX(-50%);
  // 窺視選單打開時也浮在遮罩上面
  z-index: 40;
  height: 44px;
  max-width: calc(100% - 32px);
  display: flex;
  align-items: center;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
}

.peek-capsule-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  min-width: 0;
  padding: 0 12px 0 5px;
  border-radius: 17px;
  background: #0a0a0b;
  color: #ffffff;
  font-size: 12px;
  white-space: nowrap;
  box-shadow: 0 0 0 1px #26272b;
  transition: box-shadow 0.2s;

  .is-active & {
    box-shadow: 0 0 0 2px #ffc65c;
  }
}

.peek-capsule-avatar {
  width: 24px;
  height: 24px;
  border-radius: 12px;
  flex-shrink: 0;
  overflow: hidden;
  background: var(--p-owner);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.peek-capsule-label {
  font-weight: 500;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.peek-capsule-spin {
  flex-shrink: 0;
  color: #c9c9cc;
  animation: peek-capsule-spin 1s linear infinite;
}

.peek-capsule-dot {
  width: 6px;
  height: 6px;
  border-radius: 3px;
  flex-shrink: 0;
  background: var(--p-peek);
}

.peek-capsule-battery {
  flex-shrink: 0;
  font-family: var(--p-num);
  font-weight: 500;
  color: #c9c9cc;
}

@keyframes peek-capsule-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
