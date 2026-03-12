<script setup lang="ts">
import { computed } from "vue";

interface Props {
  amount: number;
  note?: string;
  /** 轉帳類型：pay=轉帳, refund=退回 */
  transferType?: "pay" | "refund";
  /** 轉帳狀態：sent=已發送, pending=待收款, received=已收款, refunded=已退回 */
  status?: "sent" | "pending" | "received" | "refunded";
}

const props = withDefaults(defineProps<Props>(), {
  note: "",
  transferType: "pay",
  status: "sent",
});

const emit = defineEmits<{
  (e: "accept"): void;
  (e: "refund"): void;
}>();

const formattedAmount = computed(() => props.amount.toLocaleString());

// 是否為退回類型
const isRefund = computed(() => props.transferType === "refund");

// 狀態文字
const statusText = computed(() => {
  switch (props.status) {
    case "sent":
      return "已發送";
    case "pending":
      return "待收款";
    case "received":
      return "已收款";
    case "refunded":
      return "已退回";
    default:
      return "";
  }
});

// 是否顯示操作按鈕（只有 pending 狀態才顯示）
const showActions = computed(() => props.status === "pending");
</script>

<template>
  <div class="transfer-card" :class="{ refund: isRefund }">
    <div class="transfer-header" :class="{ refund: isRefund }">
      <span class="title">LINK PAY</span>
      <span class="menu-icon">≡</span>
    </div>
    <div class="amount-box">
      <div class="amount-label">{{ isRefund ? "REFUND" : "AMOUNT" }}</div>
      <div class="amount-value">${{ formattedAmount }}</div>
    </div>
    <!-- 備註 -->
    <div v-if="note" class="transfer-note">
      <span class="note-label">備註：</span>
      <span class="note-text">{{ note }}</span>
    </div>
    <!-- 狀態或操作按鈕 -->
    <div v-if="showActions" class="transfer-actions">
      <button class="action-btn accept" @click="emit('accept')">
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
        收款
      </button>
      <button class="action-btn refund" @click="emit('refund')">
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
          <path
            d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"
          />
        </svg>
        退回
      </button>
    </div>
    <div v-else class="transfer-info" :class="status">
      <span>{{ statusText }}</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.transfer-card {
  background: #f5f5f5;
  border: 3px solid #222;
  border-radius: 4px;
  width: 180px;
  font-family: "Courier New", monospace;
  overflow: hidden;

  &.refund {
    border-color: #b91c1c;
  }
}

.transfer-header {
  background: #4ade80;
  padding: 8px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;

  &.refund {
    background: #ef4444;
  }

  .title {
    font-size: 14px;
    font-weight: bold;
    color: #000;
    letter-spacing: 1px;
  }

  .menu-icon {
    font-size: 16px;
    color: #000;
  }
}

.amount-box {
  margin: 12px;
  border: 3px solid #222;
  padding: 8px;
  background: #fff;
  text-align: center;

  .amount-label {
    font-size: 10px;
    color: #666;
    margin-bottom: 4px;
  }

  .amount-value {
    font-size: 22px;
    font-weight: bold;
    color: #222;
  }
}

.transfer-note {
  padding: 0 12px 8px;
  font-size: 11px;

  .note-label {
    color: #666;
  }

  .note-text {
    color: #333;
  }
}

.transfer-actions {
  display: flex;
  gap: 8px;
  padding: 8px 12px 12px;

  .action-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 8px 12px;
    border: 2px solid #222;
    border-radius: 4px;
    font-size: 12px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.15s;

    &.accept {
      background: #4ade80;
      color: #000;

      &:active {
        background: #22c55e;
        transform: scale(0.98);
      }
    }

    &.refund {
      background: #fef3c7;
      color: #92400e;

      &:active {
        background: #fde68a;
        transform: scale(0.98);
      }
    }
  }
}

.transfer-info {
  padding: 12px;
  text-align: center;
  font-size: 11px;
  font-weight: bold;

  &.sent {
    color: #16a34a;
  }

  &.pending {
    color: #d97706;
  }

  &.received {
    color: #16a34a;
  }

  &.refunded {
    color: #dc2626;
  }
}
</style>
