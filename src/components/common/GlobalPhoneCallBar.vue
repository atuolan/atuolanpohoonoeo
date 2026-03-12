<script setup lang="ts">
import { usePhoneCallStore } from "@/stores/phoneCall";
import { computed, ref, watch } from "vue";

const phoneCallStore = usePhoneCallStore();

const show = computed(() => phoneCallStore.isActive && !phoneCallStore.isExpanded);

// 未讀紅點：縮小狀態下有新 AI 訊息時顯示
const hasUnread = ref(false);
const lastSeenCount = ref(0);

// 監聽訊息數量，縮小狀態下新增 AI 訊息就亮紅點
watch(
  () => phoneCallStore.callMessages.length,
  (newLen) => {
    if (!phoneCallStore.isExpanded && newLen > lastSeenCount.value) {
      const newMsgs = phoneCallStore.callMessages.slice(lastSeenCount.value);
      if (newMsgs.some((m) => m.role === "ai" && !m.isStreaming)) {
        hasUnread.value = true;
      }
    }
    lastSeenCount.value = newLen;
  },
);

function handleExpand() {
  hasUnread.value = false;
  lastSeenCount.value = phoneCallStore.callMessages.length;
  phoneCallStore.expand();
}

function handleHangup() {
  phoneCallStore.endCall();
}
</script>

<template>
  <Teleport to="body">
    <Transition name="call-widget">
      <div v-if="show" class="call-widget">
        <!-- 頭像（點擊展開） -->
        <div class="widget-avatar" @click="handleExpand" title="返回通話">
          <img
            v-if="phoneCallStore.activeCall?.characterAvatar"
            :src="phoneCallStore.activeCall.characterAvatar"
            :alt="phoneCallStore.activeCall?.characterName"
          />
          <div v-else class="avatar-fallback">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          </div>
          <!-- 通話中波形 -->
          <div class="wave-overlay" :class="{ active: phoneCallStore.isGenerating }">
            <span></span><span></span><span></span>
          </div>
          <!-- 未讀紅點 -->
          <Transition name="dot">
            <div v-if="hasUnread" class="unread-dot"></div>
          </Transition>
        </div>

        <!-- 時長 -->
        <div class="widget-duration" @click="handleExpand">
          {{ phoneCallStore.formattedDuration }}
        </div>

        <!-- 掛斷按鈕 -->
        <button class="widget-hangup" @click.stop="handleHangup" title="掛斷">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
          </svg>
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.call-widget {
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + 60px);
  right: 12px;
  width: 72px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  z-index: 4000;
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.35));
}

.widget-avatar {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 18px;
  overflow: hidden;
  cursor: pointer;
  border: 2.5px solid #4ade80;
  background: #1a1a1a;
  flex-shrink: 0;

  &:active {
    opacity: 0.85;
    transform: scale(0.96);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-fallback {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #2a2a2a;

    svg {
      width: 28px;
      height: 28px;
      color: #888;
    }
  }
}

// 未讀紅點
.unread-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #ef4444;
  border: 2px solid #1a1a1a;
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.7);
}

.dot-enter-active { transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s; }
.dot-leave-active { transition: transform 0.15s ease, opacity 0.15s; }
.dot-enter-from, .dot-leave-to { transform: scale(0); opacity: 0; }

// 波形疊加在頭像底部
.wave-overlay {
  position: absolute;
  bottom: 6px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: flex-end;
  gap: 2px;

  span {
    display: block;
    width: 3px;
    height: 4px;
    background: #4ade80;
    border-radius: 2px;
    opacity: 0.9;
  }

  &.active span {
    animation: wave 0.8s ease-in-out infinite;
    &:nth-child(1) { animation-delay: 0s; }
    &:nth-child(2) { animation-delay: 0.2s; }
    &:nth-child(3) { animation-delay: 0.4s; }
  }
}

@keyframes wave {
  0%, 100% { height: 4px; }
  50% { height: 14px; }
}

.widget-duration {
  font-size: 11px;
  font-weight: 600;
  color: #4ade80;
  font-family: monospace;
  background: rgba(0, 0, 0, 0.65);
  padding: 2px 8px;
  border-radius: 10px;
  cursor: pointer;
  white-space: nowrap;
  backdrop-filter: blur(6px);
}

.widget-hangup {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #ef4444;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;

  &:active {
    background: #dc2626;
    transform: scale(0.92);
  }

  svg {
    width: 17px;
    height: 17px;
    color: #fff;
  }
}

// 進入/離開動畫（從右側滑入）
.call-widget-enter-active,
.call-widget-leave-active {
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease;
}

.call-widget-enter-from,
.call-widget-leave-to {
  transform: translateX(90px);
  opacity: 0;
}
</style>
