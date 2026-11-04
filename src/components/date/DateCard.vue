<script setup lang="ts">
/**
 * 聊天裡的約會卡片：邀請、請求（可以答應／拒絕）、出發、結束（回顧＋日記）
 */
import type { DateCardData } from "@/types/date";
import { computed, ref } from "vue";

const props = defineProps<{
  card: DateCardData;
  userName: string;
  charName: string;
  /** 這張卡是不是目前還在等回覆的那一場（只有它的按鈕能按） */
  actionable: boolean;
}>();
const emit = defineEmits<{
  (e: "accept"): void;
  (e: "decline"): void;
  (e: "cancel"): void;
}>();

const showDiary = ref(false);

const title = computed(() => {
  const c = props.card;
  switch (c.kind) {
    case "invite":
      return `約${props.charName}去${c.place}`;
    case "request":
      return `${props.charName}約你去${c.place}`;
    case "started":
      return `出發去${c.place}`;
    case "ended":
      return `${c.place}約會回憶`;
  }
  return c.place;
});

const statusText = computed(() => {
  const c = props.card;
  if (c.kind !== "invite" && c.kind !== "request") return "";
  if (c.status === "accepted") return "答應了";
  if (c.status === "declined") {
    if (c.reason === "取消了") return "已取消";
    return c.kind === "invite" ? `${props.charName}拒絕了` : "你拒絕了";
  }
  return c.kind === "invite" ? `等${props.charName}回覆` : "";
});
</script>

<template>
  <div class="date-card" :class="[`date-card--${card.kind}`, card.status ? `is-${card.status}` : '']">
    <div class="date-card-head">
      <span class="date-card-emoji" aria-hidden="true">{{ card.emoji }}</span>
      <span class="date-card-title">{{ title }}</span>
    </div>

    <p v-if="card.reason && card.reason !== '取消了'" class="date-card-reason">「{{ card.reason }}」</p>

    <template v-if="card.kind === 'ended'">
      <p v-if="card.recap" class="date-card-recap">{{ card.recap }}</p>
      <ul class="date-card-facts">
        <li v-if="card.eventText">⚡ {{ card.eventText }}</li>
        <li v-if="card.paymentNote">💸 {{ card.paymentNote }}</li>
      </ul>
      <button v-if="card.diary" type="button" class="date-card-diary-toggle" @click="showDiary = !showDiary">
        {{ showDiary ? "收起" : `偷看${charName}的日記` }}
      </button>
      <p v-if="showDiary && card.diary" class="date-card-diary">{{ card.diary }}</p>
    </template>

    <div v-if="statusText" class="date-card-status">{{ statusText }}</div>

    <div v-if="actionable && card.kind === 'request' && card.status === 'pending'" class="date-card-actions">
      <button type="button" class="date-card-btn" @click="emit('decline')">不要</button>
      <button type="button" class="date-card-btn is-primary" @click="emit('accept')">好啊，走吧</button>
    </div>
    <div v-if="actionable && card.kind === 'invite' && card.status === 'pending'" class="date-card-actions">
      <button type="button" class="date-card-btn" @click="emit('cancel')">取消邀請</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.date-card {
  width: min(320px, calc(100% - 32px));
  margin: 8px auto;
  padding: 14px 16px;
  border-radius: 16px;
  background: var(--color-surface, #fff);
  color: var(--color-text-primary, #1f2937);
  border: 1px solid var(--color-border, #e5e7eb);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);

  &.is-declined {
    opacity: 0.7;
  }
}

.date-card--started {
  padding: 8px 14px;
  text-align: center;

  .date-card-head {
    justify-content: center;
  }
}

.date-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.date-card-emoji {
  font-size: 22px;
  line-height: 1;
}

.date-card-title {
  font-size: 15px;
  font-weight: 600;
}

.date-card-reason,
.date-card-recap {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text-secondary, #6b7280);
}

.date-card-facts {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);
}

.date-card-diary-toggle {
  margin-top: 10px;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-primary, #7dd3a8);
  font-size: 13px;
  cursor: pointer;
}

.date-card-diary {
  margin: 8px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--color-surface-alt, #f9fafb);
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.date-card-status {
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-text-tertiary, #9ca3af);
}

.date-card-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.date-card-btn {
  flex: 1;
  padding: 9px 0;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 12px;
  background: transparent;
  color: inherit;
  font-size: 14px;
  cursor: pointer;

  &.is-primary {
    border-color: var(--color-primary, #7dd3a8);
    background: var(--color-primary, #7dd3a8);
    color: var(--color-on-primary-contrast, #fff);
    font-weight: 600;
  }
}
</style>
