<script setup lang="ts">
// Y2K 版型：MSN 對話視窗。整塊點擊由宿主處理（導航到聊天），這裡不 emit。
import { computed } from "vue";
import type { ThemedChatProps } from "../types";

const props = defineProps<ThemedChatProps>();

// 標題列的頭像字：沒有頭像圖時取名字第一個字
const initial = computed(() => props.displayName.trim().charAt(0) || "?");
// 使用者設定的文字色只套在訊息內文，標題列維持白字
const msgStyle = computed(() => (props.color ? { color: props.color } : undefined));
</script>

<template>
  <div class="y2kch">
    <div class="y2kch-win">
      <div class="y2kch-bar">
        <span class="y2kch-avatar" aria-hidden="true">
          <img v-if="avatar" :src="avatar" alt="" />
          <template v-else>{{ initial }}</template>
        </span>
        <span class="y2kch-title">{{ displayName }} － 對話</span>
        <span class="y2kch-time">{{ timeText }}</span>
        <span
          v-if="unreadCount > 0"
          class="y2kch-unread"
          :aria-label="`${unreadCount} 則未讀`"
        >{{ unreadCount > 99 ? "99+" : unreadCount }}</span>
      </div>

      <div class="y2kch-body">
        <template v-if="hasCharacter">
          <div class="y2kch-name">{{ displayName }} 說：</div>
          <p v-if="previewText" class="y2kch-msg" :style="msgStyle">{{ previewText }}</p>
          <span v-if="stickerName || stickerUrl" class="y2kch-sticker">
            <img v-if="stickerUrl" :src="stickerUrl" alt="" class="y2kch-sticker-img" />
            ［貼圖］{{ stickerName || "貼圖" }}
          </span>

          <!-- 看起來像輸入框的區塊：只是外觀（div / span），點擊交給宿主打開聊天 -->
          <div class="y2kch-input" aria-hidden="true">
            <span class="y2kch-field">輸入訊息…</span>
            <span class="y2kch-send">傳送</span>
          </div>
        </template>
        <div v-else class="y2kch-empty" :style="msgStyle">
          {{ isEditMode ? "點擊齒輪圖示綁定角色" : "還沒有聊天，去找角色聊聊吧" }}
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// 以根元素高度（cqh）為基準，設計稿格子高 192px。格子矮時輸入列隱藏，優先保留標題與訊息。
.y2kch {
  container-type: size;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  font-family: "Noto Sans TC", sans-serif;
  color: #2D1B4E;
}

.y2kch-win {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 7.3cqh;
  border: 1.5px solid #FFFFFF;
  background: rgba(255, 255, 255, 0.68);
  box-shadow: 0 12px 24px -14px rgba(60, 40, 120, 0.6);
}

// MSN 風標題列：青到藍的漸層
.y2kch-bar {
  flex: 0 0 auto;
  height: 14.6cqh;
  padding: 0 4.2cqh;
  display: flex;
  align-items: center;
  gap: 3.6cqh;
  background: linear-gradient(90deg, #6FD3C3 0%, #6E9BFF 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
  color: #FFFFFF;
  font-size: 6.25cqh;
  font-weight: 700;
  text-shadow: 0 1px 1px rgba(30, 60, 120, 0.5);
}

.y2kch-avatar {
  flex: 0 0 auto;
  width: 9.4cqh;
  height: 9.4cqh;
  border-radius: 50%;
  background: #2D1B4E;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-size: 5.2cqh;
  text-shadow: none;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.y2kch-title {
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.y2kch-time {
  flex: 0 0 auto;
  font-size: 5.7cqh;
  font-weight: 500;
  white-space: nowrap;
  opacity: 0.95;
}

// 未讀數：粉紅小膠囊
.y2kch-unread {
  flex: 0 0 auto;
  min-width: 7.8cqh;
  height: 7.8cqh;
  padding: 0 4px;
  box-sizing: border-box;
  border-radius: 999px;
  border: 1px solid #FFFFFF;
  background: #F06AAE;
  color: #FFFFFF;
  font-size: 4.7cqh;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-shadow: none;
}

.y2kch-body {
  flex: 1 1 auto;
  min-height: 0;
  box-sizing: border-box;
  padding: 5.2cqh 6.25cqh 6.25cqh;
  display: flex;
  flex-direction: column;
  gap: 4cqh;
  overflow: hidden;
}

.y2kch-name {
  flex: 0 0 auto;
  font-size: 6.25cqh;
  font-weight: 700;
  line-height: 1.2;
  color: #4A63C8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

// 訊息最多兩行，超出截斷
.y2kch-msg {
  flex: 0 1 auto;
  min-height: 0;
  margin: 0;
  font-size: 6.8cqh;
  line-height: 1.6;
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

// 粉紅貼圖標籤
.y2kch-sticker {
  flex: 0 0 auto;
  align-self: flex-start;
  max-width: 100%;
  box-sizing: border-box;
  padding: 2px 10px;
  border-radius: 999px;
  background: #FFE3F2;
  border: 1px solid #F7B5D6;
  color: #8A2E62;
  font-size: 6cqh;
  line-height: 1.4;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  overflow: hidden;
}

.y2kch-sticker-img {
  flex: 0 0 auto;
  height: 1.4em;
  width: auto;
  border-radius: 4px;
  object-fit: contain;
}

.y2kch-empty {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 6.8cqh;
  line-height: 1.6;
  color: #6A5A9A;
}

// 假輸入列：貼齊底部；格子矮時隱藏
.y2kch-input {
  flex: 0 0 auto;
  margin-top: auto;
  height: 18.75cqh;
  display: flex;
  gap: 4cqh;
  align-items: center;
}

.y2kch-field {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  box-sizing: border-box;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid #B9B2D8;
  background: #FFFFFF;
  box-shadow: inset 0 1px 3px rgba(60, 40, 120, 0.2);
  color: #8A7FA8;
  font-size: 6.8cqh;
  display: flex;
  align-items: center;
  white-space: nowrap;
  overflow: hidden;
}

// 果凍粉紅傳送鈕（span，不是 button，點擊交給宿主）
.y2kch-send {
  flex: 0 0 auto;
  height: 100%;
  box-sizing: border-box;
  padding: 0 16px;
  border-radius: 999px;
  border: 1.5px solid rgba(255, 255, 255, 0.85);
  background:
    radial-gradient(60% 50% at 50% 10%, #FFFFFFCC 0%, #FFFFFF00 100%),
    linear-gradient(180deg, #FFC4E4 0%, #F06AAE 100%);
  color: #FFFFFF;
  font-size: 6.8cqh;
  font-weight: 700;
  display: flex;
  align-items: center;
  text-shadow: 0 1px 1px rgba(120, 0, 60, 0.4);
  white-space: nowrap;
}

// 格子矮時隱藏輸入列（容器查詢：根元素高度不足 180px）
@container (max-height: 180px) {
  .y2kch-input {
    display: none;
  }
}
</style>
