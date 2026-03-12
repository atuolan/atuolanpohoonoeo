<script setup lang="ts">
import type { WidgetCustomStyle } from "@/types";
import {
    Battery,
    Phone,
    Send,
    Signal,
    Smartphone,
    User,
    Wifi
} from "lucide-vue-next";
import { computed } from "vue";

const props = defineProps<{
  data?: {
    customStyle?: WidgetCustomStyle;
  };
}>();

// 模擬聊天數據
const messages = [
  { id: 1, text: "嘿，今晚有空嗎？", sender: "char", time: "20:30" },
  { id: 2, text: "想去哪裡逛逛？", sender: "char", time: "20:31" },
  { id: 3, text: "我知道一家不錯的酒吧", sender: "me", time: "20:32" },
  { id: 4, text: "太好了，這就出發！", sender: "char", time: "20:33" },
];

// 獲取當前佈局風格，默認為 'phone'
const currentLayout = computed(
  () => props.data?.customStyle?.layout || "phone",
);

// 自定義樣式
const containerStyle = computed(() => {
  const style = props.data?.customStyle;
  if (!style) return {};

  const result: Record<string, string> = {};
  if (style.backgroundGradient) {
    result.background = style.backgroundGradient;
  } else if (style.backgroundColor) {
    result.backgroundColor = style.backgroundColor;
  }
  if (style.borderColor) {
    result.borderColor = style.borderColor;
    result.borderWidth = `${style.borderWidth || 2}px`;
    result.borderStyle = "solid";
  }
  return result;
});

const textStyle = computed(() => {
  const style = props.data?.customStyle;
  if (style?.textColor) return { color: style.textColor };
  if (style?.foregroundColor) return { color: style.foregroundColor };
  return {};
});
</script>

<template>
  <div
    class="char-phone-container"
    :style="containerStyle"
    :class="currentLayout"
  >
    <!-- 風格 1: Phone (手機模式 - 預設) -->
    <template v-if="currentLayout === 'phone'">
      <div class="phone-frame">
        <!-- 狀態欄 -->
        <div class="status-bar">
          <span class="time">20:35</span>
          <div class="status-icons">
            <Signal :size="10" />
            <Wifi :size="10" />
            <Battery :size="10" />
          </div>
        </div>

        <!-- 頂部欄 -->
        <div class="app-header">
          <div class="avatar">
            <User :size="16" />
          </div>
          <span class="contact-name">神秘角色</span>
          <Phone :size="16" class="call-btn" />
        </div>

        <!-- 聊天內容 -->
        <div class="chat-area">
          <div
            v-for="msg in messages"
            :key="msg.id"
            class="message-bubble"
            :class="{
              sent: msg.sender === 'me',
              received: msg.sender === 'char',
            }"
          >
            {{ msg.text }}
            <span class="msg-time">{{ msg.time }}</span>
          </div>
        </div>

        <!-- 輸入欄 -->
        <div class="input-area">
          <div class="input-box">
            <span>輸入訊息...</span>
          </div>
          <button class="send-btn">
            <Send :size="14" />
          </button>
        </div>

        <!-- 底部條 -->
        <div class="home-indicator"></div>
      </div>
    </template>

    <!-- 風格 2: Icon (圖標模式 - 仿 App) -->
    <template v-else-if="currentLayout === 'icon'">
      <div class="icon-layout">
        <div class="app-icon-bg">
          <Smartphone :size="28" color="white" />
          <div class="notification-badge">3</div>
        </div>
        <span class="app-label" :style="textStyle">角色手機</span>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.char-phone-container {
  width: 100%;
  height: 100%;
  background: transparent;
  overflow: hidden;
  position: relative;

  // Phone 樣式
  &.phone {
    .phone-frame {
      width: 100%;
      height: 100%;
      background: #fff;
      border-radius: 24px;
      border: 6px solid #1f2937;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
      position: relative;

      // 瀏海
      &::before {
        content: "";
        position: absolute;
        top: 0;
        left: 50%;
        transform: translateX(-50%);
        width: 30%;
        height: 18px;
        background: #1f2937;
        border-radius: 0 0 10px 10px;
        z-index: 10;
      }
    }

    .status-bar {
      height: 24px;
      padding: 0 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f3f4f6;
      font-size: 10px;
      color: #374151;

      .status-icons {
        display: flex;
        gap: 4px;
      }
    }

    .app-header {
      height: 44px;
      padding: 0 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      background: #fff;
      border-bottom: 1px solid #f3f4f6;
      z-index: 5;

      .avatar {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: #e5e7eb;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #6b7280;
      }

      .contact-name {
        flex: 1;
        font-size: 14px;
        font-weight: 600;
        color: #1f2937;
      }

      .call-btn {
        color: #4f46e5;
      }
    }

    .chat-area {
      flex: 1;
      background: #f9fafb;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow-y: auto;

      .message-bubble {
        max-width: 80%;
        padding: 8px 12px;
        border-radius: 12px;
        font-size: 12px;
        line-height: 1.4;
        position: relative;

        &.received {
          align-self: flex-start;
          background: #fff;
          color: #374151;
          border-bottom-left-radius: 4px;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        &.sent {
          align-self: flex-end;
          background: #4f46e5;
          color: white;
          border-bottom-right-radius: 4px;
          box-shadow: 0 1px 2px rgba(79, 70, 229, 0.2);
        }

        .msg-time {
          display: block;
          font-size: 8px;
          margin-top: 2px;
          opacity: 0.7;
          text-align: right;
        }
      }
    }

    .input-area {
      height: 48px;
      padding: 8px 12px;
      background: #fff;
      border-top: 1px solid #f3f4f6;
      display: flex;
      align-items: center;
      gap: 8px;

      .input-box {
        flex: 1;
        height: 32px;
        background: #f3f4f6;
        border-radius: 16px;
        padding: 0 12px;
        display: flex;
        align-items: center;

        span {
          font-size: 12px;
          color: #9ca3af;
        }
      }

      .send-btn {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: #4f46e5;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;

        &:active {
          transform: scale(0.95);
        }
      }
    }

    .home-indicator {
      height: 16px;
      background: #fff;
      display: flex;
      justify-content: center;
      align-items: center;

      &::after {
        content: "";
        width: 40%;
        height: 4px;
        background: #e5e7eb;
        border-radius: 2px;
      }
    }
  }

  // Icon 樣式
  &.icon {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;

    .icon-layout {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
    }

    .app-icon-bg {
      width: 100%;
      aspect-ratio: 1;
      max-width: 64px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
      transition: transform 0.2s;
      position: relative;

      &:hover {
        transform: scale(1.05);
      }

      .notification-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        width: 20px;
        height: 20px;
        background: #ef4444;
        border-radius: 50%;
        color: white;
        font-size: 10px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid white;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      }
    }

    .app-label {
      font-size: 12px;
      font-weight: 500;
      color: #374151;
      text-shadow: 0 1px 2px rgba(255, 255, 255, 0.8);
    }
  }
}
</style>
