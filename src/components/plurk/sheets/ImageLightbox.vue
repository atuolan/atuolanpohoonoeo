<script setup lang="ts">
/** 看圖：全螢幕圖片預覽，左右切換、計數、點背景關閉 */
import { computed, ref, watch } from "vue";
import { ChevronLeft, ChevronRight, X } from "lucide-vue-next";

const props = withDefaults(
  defineProps<{
    open: boolean;
    images: string[];
    startIndex: number;
  }>(),
  { images: () => [], startIndex: 0 },
);

const emit = defineEmits<{
  (e: "close"): void;
}>();

const index = ref(0);
const total = computed(() => props.images.length);
const current = computed(() => props.images[index.value] ?? "");
const hasMany = computed(() => total.value > 1);

watch(
  () => [props.open, props.startIndex, props.images.length] as const,
  ([open]) => {
    if (!open) return;
    const start = Math.min(Math.max(props.startIndex, 0), Math.max(total.value - 1, 0));
    index.value = start;
  },
  { immediate: true },
);

function prev() {
  if (total.value === 0) return;
  index.value = (index.value - 1 + total.value) % total.value;
}

function next() {
  if (total.value === 0) return;
  index.value = (index.value + 1) % total.value;
}
</script>

<template>
  <Teleport to="body">
    <Transition name="lightbox-fade">
      <div
        v-if="props.open"
        class="image-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label="圖片預覽"
        @click="emit('close')"
      >
        <button type="button" class="lightbox-close" aria-label="關閉" @click="emit('close')">
          <X :size="22" />
        </button>

        <button
          v-if="hasMany"
          type="button"
          class="lightbox-nav lightbox-prev"
          aria-label="上一張"
          @click.stop="prev"
        >
          <ChevronLeft :size="24" />
        </button>

        <div class="lightbox-content" @click.stop>
          <img v-if="current" :src="current" class="lightbox-image" alt="預覽圖片" />
        </div>

        <button
          v-if="hasMany"
          type="button"
          class="lightbox-nav lightbox-next"
          aria-label="下一張"
          @click.stop="next"
        >
          <ChevronRight :size="24" />
        </button>

        <div v-if="hasMany" class="lightbox-counter">{{ index + 1 }} / {{ total }}</div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
@use "@/components/plurk/plurk-theme.scss" as *;

.image-lightbox {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.94);
}

.lightbox-close {
  position: absolute;
  top: calc(16px + var(--safe-area-inset-top, env(safe-area-inset-top)));
  right: 16px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  width: $plurk-touch;
  height: $plurk-touch;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  cursor: pointer;

  &:active {
    background: rgba(255, 255, 255, 0.22);
  }
}

.lightbox-nav {
  position: absolute;
  top: 50%;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  cursor: pointer;
  transform: translateY(-50%);

  &:active {
    background: rgba(255, 255, 255, 0.22);
  }
}

.lightbox-prev {
  left: 12px;
}

.lightbox-next {
  right: 12px;
}

.lightbox-content {
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 92vw;
  max-height: 88vh;
}

.lightbox-image {
  max-width: 92vw;
  max-height: 88vh;
  object-fit: contain;
  border-radius: 8px;
}

.lightbox-counter {
  position: absolute;
  bottom: calc(20px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom)));
  left: 50%;
  padding: 8px 16px;
  border-radius: 20px;
  background: rgba(0, 0, 0, 0.6);
  color: #ffffff;
  font-size: 14px;
  font-weight: 700;
  transform: translateX(-50%);
}

.lightbox-fade-enter-active,
.lightbox-fade-leave-active {
  transition: opacity 0.22s ease;
}

.lightbox-fade-enter-from,
.lightbox-fade-leave-to {
  opacity: 0;
}
</style>
