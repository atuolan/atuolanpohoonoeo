<template>
  <Teleport to="body">
    <Transition name="photo-preview-fade">
      <div
        v-if="isVisible"
        class="photo-preview-modal"
        @click="handleBackdropClick"
      >
        <div class="photo-preview-header">
          <button class="photo-preview-close" @click="close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M18 6L6 18M6 6l12 12" stroke-width="2" />
            </svg>
          </button>
          <button class="photo-preview-download" @click="downloadPhoto">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"
                stroke-width="2"
              />
            </svg>
            <span>下載</span>
          </button>
        </div>

        <div class="photo-preview-content">
          <img
            :src="imageUrl"
            :alt="caption || '照片預覽'"
            class="photo-preview-image"
            @click.stop
          />
        </div>

        <div v-if="caption || date" class="photo-preview-info">
          <div v-if="caption" class="photo-preview-caption">{{ caption }}</div>
          <div v-if="date" class="photo-preview-date">{{ date }}</div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";

interface Props {
  visible: boolean;
  imageUrl: string;
  caption?: string;
  date?: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
}>();

const isVisible = ref(props.visible);

watch(
  () => props.visible,
  (newVal) => {
    isVisible.value = newVal;
    if (newVal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }
);

const close = () => {
  emit("update:visible", false);
};

const handleBackdropClick = (e: MouseEvent) => {
  if (e.target === e.currentTarget) {
    close();
  }
};

const downloadPhoto = async () => {
  try {
    const response = await fetch(props.imageUrl);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `photo_${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("下載照片失敗:", error);
  }
};
</script>

<style scoped lang="scss">
.photo-preview-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.95);
  z-index: 10000;
  display: flex;
  flex-direction: column;
  touch-action: none;
}

.photo-preview-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) 16px max(16px, env(safe-area-inset-left, 0px));
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.6) 0%,
    transparent 100%
  );
  z-index: 10;
}

.photo-preview-close,
.photo-preview-download {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 20px;
  color: white;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  backdrop-filter: blur(10px);

  svg {
    width: 20px;
    height: 20px;
  }

  &:active {
    transform: scale(0.95);
    background: rgba(255, 255, 255, 0.2);
  }
}

.photo-preview-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80px 20px 100px;
  overflow: hidden;
}

.photo-preview-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
}

.photo-preview-info {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 20px max(20px, env(safe-area-inset-right, 0px)) max(20px, env(safe-area-inset-bottom, 0px)) max(20px, env(safe-area-inset-left, 0px));
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.8) 0%,
    transparent 100%
  );
  color: white;
  text-align: center;
}

.photo-preview-caption {
  font-size: 16px;
  margin-bottom: 8px;
  font-weight: 500;
}

.photo-preview-date {
  font-size: 14px;
  opacity: 0.7;
}

.photo-preview-fade-enter-active,
.photo-preview-fade-leave-active {
  transition: opacity 0.3s ease;

  .photo-preview-image {
    transition: transform 0.3s ease;
  }
}

.photo-preview-fade-enter-from,
.photo-preview-fade-leave-to {
  opacity: 0;

  .photo-preview-image {
    transform: scale(0.9);
  }
}
</style>
