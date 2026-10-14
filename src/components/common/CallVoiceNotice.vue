<template>
  <div class="call-voice-notice" role="dialog" aria-label="語音輸入說明">
    <p class="notice-title">可以直接用說的跟 {{ characterName || "對方" }} 講電話</p>
    <p class="notice-body">
      接通後會自動收音，講完停頓一下就會送出；角色說話時會暫停收音。語音會上傳到阿里
      ModelScope 的公開辨識服務（伺服器位於中國大陸）轉成文字。
    </p>
    <div class="notice-actions">
      <button class="notice-btn secondary" @click="emit('decline')">先不要</button>
      <button class="notice-btn primary" @click="emit('confirm')">知道了，開始</button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ characterName?: string }>();
const emit = defineEmits<{ confirm: []; decline: [] }>();
</script>

<style scoped lang="scss">
.call-voice-notice {
  margin: 0 16px 10px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(16px);
  color: #fff;
  animation: noticeIn 0.25s ease;
}

.notice-title {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
}

.notice-body {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.75);
}

.notice-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.notice-btn {
  border: none;
  border-radius: 999px;
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;

  &.secondary {
    background: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.85);
  }

  &.primary {
    background: var(--color-primary, #7dd3a8);
    color: #fff;
    font-weight: 600;
  }
}

@keyframes noticeIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
