<script setup lang="ts">
/**
 * 角色手機的鎖定畫面：時間、下一個行程、聊天通知
 * 第一次拿起手機時，內容在這裡生成；向上滑或點按鈕解鎖
 * 有鎖屏密碼又還沒解過，解鎖前要先猜密碼（可以跳過）
 */
import type { GroupStatus } from "@/stores/peekPhone";
import type { PeekLockScreen, PeekScheduleItem } from "@/types/peekPhone";
import {
  AlertTriangle,
  Calendar,
  Camera,
  Check,
  Flashlight,
  Loader2,
  MapPin,
  MessageSquare,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import PeekPasscode from "./PeekPasscode.vue";
import PeekWallpaper from "./PeekWallpaper.vue";
import {
  formatClock,
  formatLockDate,
  formatRelative,
  type PeekNotification,
} from "./peekPhoneView";

const props = defineProps<{
  name: string;
  avatar?: string;
  now: Date;
  nextSchedule: PeekScheduleItem | null;
  notifications: PeekNotification[];
  groupStatus: Record<"A" | "B" | "C" | "D", GroupStatus>;
  lockScreen?: PeekLockScreen;
  /** 聊天頂欄那行狀態 */
  statusText?: string;
  /** 所在城市、天氣 */
  placeText?: string;
  /** 解鎖前要先猜密碼 */
  needCode: boolean;
}>();

const emit = defineEmits<{
  unlock: [];
  openThread: [threadId: string];
  /** 猜對密碼 */
  solved: [];
  /** 跳過謎題 */
  skip: [];
}>();

const showCode = ref(false);
// 鎖著時點了通知：解開後直接打開那個聊天
const pendingThread = ref<string | null>(null);

function requestUnlock(threadId: string | null = null) {
  if (props.needCode && props.lockScreen) {
    pendingThread.value = threadId;
    showCode.value = true;
    return;
  }
  proceed(threadId);
}

function proceed(threadId: string | null) {
  showCode.value = false;
  if (threadId) emit("openThread", threadId);
  else emit("unlock");
}

function onSkip() {
  emit("skip");
  proceed(pendingThread.value);
}

const steps = computed(() => {
  const s = props.groupStatus;
  const merge = (...list: GroupStatus[]): GroupStatus =>
    list.includes("error")
      ? "error"
      : list.includes("loading")
        ? "loading"
        : list.every((x) => x === "done")
          ? "done"
          : "idle";
  return [
    { label: "訊息", status: s.A },
    { label: "行程、日記、錢包", status: merge(s.B, s.C) },
    { label: "相簿、瀏覽紀錄", status: s.D },
  ];
});

const isBusy = computed(() => Object.values(props.groupStatus).some((s) => s === "loading"));
const hasError = computed(() => Object.values(props.groupStatus).some((s) => s === "error"));

// 向上滑動解鎖
const touchStartY = ref<number | null>(null);
function onTouchStart(e: TouchEvent) {
  touchStartY.value = e.touches[0]?.clientY ?? null;
}
function onTouchEnd(e: TouchEvent) {
  if (touchStartY.value === null) return;
  const dy = (e.changedTouches[0]?.clientY ?? touchStartY.value) - touchStartY.value;
  touchStartY.value = null;
  if (dy < -60 && !showCode.value) requestUnlock();
}
</script>

<template>
  <div class="peek-lock" @touchstart.passive="onTouchStart" @touchend="onTouchEnd">
    <PeekWallpaper :avatar="props.avatar" />

    <div class="peek-lock-body">
      <div class="peek-lock-date">{{ formatLockDate(props.now) }}</div>
      <div class="peek-lock-time">{{ formatClock(props.now) }}</div>
      <div v-if="props.placeText" class="peek-lock-next">
        <MapPin :size="14" aria-hidden="true" />
        <span>{{ props.placeText }}</span>
      </div>
      <div v-if="props.statusText" class="peek-lock-mood">{{ props.statusText }}</div>
      <div v-if="props.nextSchedule" class="peek-lock-next">
        <Calendar :size="14" aria-hidden="true" />
        <span>{{ props.nextSchedule.time || "整天" }} · {{ props.nextSchedule.title }}</span>
      </div>

      <div class="peek-lock-stack">
        <div v-if="isBusy || hasError" class="peek-lock-card peek-lock-status" role="status">
          <div class="peek-lock-status-title">
            {{ isBusy ? `正在讀取${props.name}的手機…` : "有些內容沒讀到" }}
          </div>
          <ul class="peek-lock-steps">
            <li v-for="step in steps" :key="step.label" class="peek-lock-step">
              <Loader2 v-if="step.status === 'loading'" :size="14" class="peek-lock-spin" aria-hidden="true" />
              <Check v-else-if="step.status === 'done'" :size="14" aria-hidden="true" />
              <AlertTriangle v-else-if="step.status === 'error'" :size="14" aria-hidden="true" />
              <span v-else class="peek-lock-step-dot" aria-hidden="true" />
              <span>{{ step.label }}</span>
            </li>
          </ul>
          <div class="peek-lock-status-hint">
            {{ isBusy ? "可以先解鎖看看，讀好的會先出現" : "點頂部膠囊可以重新生成" }}
          </div>
        </div>

        <button
          v-for="n in props.notifications"
          :key="n.threadId"
          type="button"
          class="peek-lock-card peek-lock-notif"
          @click="requestUnlock(n.threadId)"
        >
          <span class="peek-lock-notif-icon">
            <MessageSquare :size="20" aria-hidden="true" />
          </span>
          <span class="peek-lock-notif-body">
            <span class="peek-lock-notif-top">
              <span class="peek-lock-notif-name">{{ n.contactName }}</span>
              <span class="peek-lock-notif-time">{{ formatRelative(n.timestamp, props.now) }}</span>
            </span>
            <span class="peek-lock-notif-text">{{ n.content }}</span>
          </span>
        </button>
      </div>

      <div class="peek-lock-bottom">
        <span class="peek-lock-round" aria-hidden="true"><Flashlight :size="20" /></span>
        <button type="button" class="peek-lock-unlock" @click="requestUnlock()">向上滑動以解鎖</button>
        <span class="peek-lock-round" aria-hidden="true"><Camera :size="20" /></span>
      </div>
    </div>

    <PeekPasscode
      v-if="showCode && props.lockScreen"
      :lock-screen="props.lockScreen"
      @solved="emit('solved')"
      @skip="onSkip"
      @cancel="showCode = false"
      @done="proceed(pendingThread)"
    />
  </div>
</template>

<style scoped lang="scss">
.peek-lock {
  position: absolute;
  inset: 0;
  color: var(--p-on-wall);
  overflow: hidden;
}

.peek-lock-body {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: calc(var(--safe-top, 0px) + 84px) 16px calc(var(--safe-bottom, 0px) + 32px);
  box-sizing: border-box;
}

.peek-lock-date {
  font-size: 16px;
  font-weight: 500;
  color: #ececee;
}

.peek-lock-time {
  font-family: var(--p-num);
  font-weight: 500;
  font-size: clamp(72px, 24vw, 96px);
  line-height: 1;
  letter-spacing: -0.01em;
}

.peek-lock-next {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  max-width: 100%;
  font-size: 13px;
  color: var(--p-on-wall-2);

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.peek-lock-mood {
  margin-top: 10px;
  max-width: 100%;
  padding: 4px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  font-size: 12px;
  color: var(--p-on-wall);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.peek-lock-stack {
  margin-top: auto;
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
}

.peek-lock-card {
  background: var(--p-glass);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 22px;
  padding: 12px 14px;
  color: var(--p-on-wall);
}

.peek-lock-status-title {
  font-size: 14px;
  font-weight: 700;
}

.peek-lock-steps {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.peek-lock-step {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.peek-lock-step-dot {
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;

  &::before {
    content: "";
    width: 5px;
    height: 5px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.5);
  }
}

.peek-lock-status-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #d6d6da;
}

.peek-lock-notif {
  width: 100%;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  border: none;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.peek-lock-notif-icon {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  flex-shrink: 0;
  background: var(--p-app-icon);
  color: var(--p-app-glyph);
  display: flex;
  align-items: center;
  justify-content: center;
}

.peek-lock-notif-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.peek-lock-notif-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.peek-lock-notif-name {
  font-size: 14px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.peek-lock-notif-time {
  flex-shrink: 0;
  font-size: 12px;
  color: #d6d6da;
}

.peek-lock-notif-text {
  font-size: 14px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.peek-lock-bottom {
  width: 100%;
  max-width: 420px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 22px;
  padding: 0 26px;
  box-sizing: border-box;
}

.peek-lock-round {
  width: 50px;
  height: 50px;
  border-radius: 25px;
  background: rgba(16, 16, 18, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.peek-lock-unlock {
  height: 44px;
  padding: 0 12px;
  border: none;
  background: none;
  color: #ececee;
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
}

.peek-lock-spin {
  animation: peek-lock-spin 1s linear infinite;
}

@keyframes peek-lock-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
