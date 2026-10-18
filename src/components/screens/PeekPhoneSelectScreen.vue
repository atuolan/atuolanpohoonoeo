<script setup lang="ts">
import PeekWallpaper from "@/components/peek-phone/PeekWallpaper.vue";
import { useRootBackground } from "@/components/peek-phone/useRootBackground";
import {
  batteryLevel,
  formatClock,
  formatLockDate,
  formatRelative,
  latestNotifications,
  type PeekNotification,
} from "@/components/peek-phone/peekPhoneView";
import { db, DB_STORES } from "@/db/database";
import { shouldHideFromPeekPhone } from "@/services/BlockService";
import { useCharactersStore } from "@/stores";
import type { StoredCharacter } from "@/types/character";
import type { Chat } from "@/types/chat";
import type { PeekPhoneData } from "@/types/peekPhone";
import { ArrowLeft, ChevronRight, Loader2, MessageSquare, X } from "lucide-vue-next";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

const emit = defineEmits<{
  back: [];
  select: [characterId: string, chatId: string];
}>();

const charactersStore = useCharactersStore();

// 封鎖角色 ID 集合（用於過濾 Peek Phone 角色列表）
const blockedCharacterIds = ref<Set<string>>(new Set());

/** 從 IndexedDB 載入被用戶封鎖的角色 ID */
async function loadBlockedCharacterIds() {
  try {
    await db.init();
    const allChats = await db.getAll<Chat>(DB_STORES.CHATS);
    const ids = new Set<string>();
    for (const chat of allChats) {
      if (shouldHideFromPeekPhone(chat)) {
        ids.add(chat.characterId);
      }
    }
    blockedCharacterIds.value = ids;
  } catch (err) {
    console.warn('[PeekPhone] 載入封鎖角色失敗:', err);
  }
}

// ===== 手機預覽：拿最近偷看過的那支手機的通知 =====
interface PhonePreview {
  notification: PeekNotification | null;
  notificationCount: number;
  updatedAt: number;
}
const previews = ref<Map<string, PhonePreview>>(new Map());

async function loadPreviews() {
  try {
    await db.init();
    const records = await db.getAll<{ characterId: string; data: PeekPhoneData; updatedAt: number }>(
      DB_STORES.PEEK_PHONE_DATA,
    );
    const map = new Map<string, PhonePreview>();
    for (const r of [...records].sort((a, b) => a.updatedAt - b.updatedAt)) {
      // 同一個角色有多段聊天時，後面（較新）的蓋掉前面的
      const notifications = latestNotifications(r.data?.chats ?? [], 99);
      map.set(r.characterId, {
        notification: notifications[0] ?? null,
        notificationCount: notifications.length,
        updatedAt: r.updatedAt,
      });
    }
    previews.value = map;
  } catch (err) {
    console.warn("[PeekPhone] 載入手機預覽失敗:", err);
  }
}

const now = ref(new Date());
const timer = setInterval(() => {
  now.value = new Date();
}, 30000);
onUnmounted(() => clearInterval(timer));

onMounted(() => {
  loadBlockedCharacterIds();
  loadPreviews();
});

const characters = computed(() =>
  charactersStore.characters.filter((c) => !blockedCharacterIds.value.has(c.id))
);

function nameOf(c: StoredCharacter | undefined): string {
  return c?.nickname || c?.data?.name || "未命名角色";
}

function descOf(c: StoredCharacter): string {
  return c.data?.personality?.slice(0, 40) || c.data?.description?.slice(0, 40) || "";
}

const headline = computed(() => {
  const h = now.value.getHours();
  return h >= 18 || h < 5 ? "今晚，要看誰的手機？" : "現在，要看誰的手機？";
});

// ===== 左右滑的手機輪播 =====
const carouselEl = ref<HTMLElement | null>(null);
const activeIndex = ref(0);
const activeCharacter = computed(() => characters.value[activeIndex.value]);
const activePreview = computed(() =>
  activeCharacter.value ? previews.value.get(activeCharacter.value.id) : undefined,
);

/** 捲動時找離中間最近的那支 */
function onCarouselScroll() {
  const el = carouselEl.value;
  if (!el) return;
  const center = el.scrollLeft + el.clientWidth / 2;
  let best = 0;
  let bestDist = Infinity;
  Array.from(el.children).forEach((child, i) => {
    const c = child as HTMLElement;
    const dist = Math.abs(c.offsetLeft + c.offsetWidth / 2 - center);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  activeIndex.value = best;
}

function scrollToIndex(i: number) {
  const child = carouselEl.value?.children[i] as HTMLElement | undefined;
  child?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
}

function onPhoneClick(i: number) {
  if (i === activeIndex.value) pickActive();
  else scrollToIndex(i);
}

// 聊天選擇狀態
const selectedCharacterId = ref<string | null>(null);
const characterChats = ref<Chat[]>([]);
const isLoadingChats = ref(false);
// 這個角色還沒有任何聊天紀錄
const noChats = ref(false);

const selectedCharacter = computed(() =>
  characters.value.find((c) => c.id === selectedCharacterId.value),
);
const showChatSheet = computed(
  () => !!selectedCharacterId.value && (noChats.value || characterChats.value.length > 1),
);

// iOS 底部露出的那一截跟著畫面最底下的顏色
useRootBackground(computed(() => (showChatSheet.value ? "#f6f5f2" : "#e6e5e2")));

function pickActive() {
  if (activeCharacter.value && !isLoadingChats.value) onCharacterSelect(activeCharacter.value.id);
}

/** 選擇角色後，查詢該角色的所有聊天紀錄 */
async function onCharacterSelect(charId: string) {
  isLoadingChats.value = true;
  selectedCharacterId.value = charId;
  noChats.value = false;
  try {
    await db.init();
    const allChats = await db.getAll<Chat>(DB_STORES.CHATS);
    // 包含分支聊天，讓用戶可以選擇任何聊天記錄
    const chats = allChats
      .filter((c) => c.characterId === charId)
      .sort((a, b) => b.updatedAt - a.updatedAt);

    if (chats.length === 0) {
      // 沒有聊天紀錄：在面板裡說明
      noChats.value = true;
      characterChats.value = [];
      return;
    }

    if (chats.length === 1) {
      // 只有一個聊天，自動選擇
      emit("select", charId, chats[0].id);
      selectedCharacterId.value = null;
      characterChats.value = [];
      return;
    }

    // 多個聊天，顯示選擇介面
    characterChats.value = chats;
  } catch (err) {
    console.error("[PeekPhoneSelectScreen] Failed to load chats:", err);
    selectedCharacterId.value = null;
    characterChats.value = [];
  } finally {
    isLoadingChats.value = false;
  }
}

/** 選擇聊天紀錄 */
function onChatSelect(chatId: string) {
  if (!selectedCharacterId.value) return;
  emit("select", selectedCharacterId.value, chatId);
  closeChatSheet();
}

function closeChatSheet() {
  selectedCharacterId.value = null;
  characterChats.value = [];
  noChats.value = false;
}

/** 格式化時間 */
function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// 角色列表變動（例如封鎖名單載入後）時，重新對齊目前在中間的那支
watch(
  () => characters.value.length,
  () => nextTick(onCarouselScroll),
);
</script>

<template>
  <div class="peek-select peek-theme">
    <div class="select-head">
      <button type="button" class="round-btn" aria-label="返回" @click="emit('back')">
        <ArrowLeft :size="20" />
      </button>
      <div class="select-brand">
        <span class="select-mark" aria-hidden="true">窺</span>
        <span class="select-brand-name">頭盔TA</span>
      </div>
      <span class="round-btn-spacer" />
    </div>

    <div class="select-intro">
      <h1 class="select-title">{{ headline }}</h1>
      <p class="select-sub">左右滑，挑一支拿起來</p>
    </div>

    <template v-if="characters.length > 0">
      <div ref="carouselEl" class="select-carousel" @scroll.passive="onCarouselScroll">
        <button
          v-for="(char, i) in characters"
          :key="char.id"
          type="button"
          class="mock"
          :class="{ 'is-active': i === activeIndex }"
          :aria-label="i === activeIndex ? `拿起${nameOf(char)}的手機` : `看${nameOf(char)}的手機`"
          @click="onPhoneClick(i)"
        >
          <PeekWallpaper :avatar="char.avatar" />
          <span class="mock-screen">
            <span class="mock-date">{{ formatLockDate(now) }}</span>
            <span class="mock-time">{{ formatClock(now) }}</span>
            <span v-if="previews.get(char.id)?.notification" class="mock-notif">
              <span class="mock-notif-icon"><MessageSquare :size="12" aria-hidden="true" /></span>
              <span class="mock-notif-body">
                <span class="mock-notif-name">{{ previews.get(char.id)!.notification!.contactName }}</span>
                <span class="mock-notif-text">{{ previews.get(char.id)!.notification!.content }}</span>
              </span>
              <span class="mock-notif-time">
                {{ formatRelative(previews.get(char.id)!.notification!.timestamp, now) }}
              </span>
            </span>
            <span v-else class="mock-pill">還沒看過</span>
          </span>
        </button>
      </div>

      <div v-if="activeCharacter" class="select-info">
        <div class="select-name">{{ nameOf(activeCharacter) }}</div>
        <div v-if="descOf(activeCharacter)" class="select-desc">{{ descOf(activeCharacter) }}</div>
        <div class="select-chips">
          <template v-if="activePreview">
            <span class="chip">
              <span class="chip-dot" aria-hidden="true" />{{ activePreview.notificationCount }} 則通知
            </span>
            <span class="chip">上次偷看 {{ formatRelative(activePreview.updatedAt, now) }}</span>
          </template>
          <span v-else class="chip">還沒看過</span>
          <span class="chip">電量 {{ batteryLevel(activeCharacter.id) }}%</span>
        </div>
      </div>

      <div v-if="characters.length > 1 && characters.length <= 12" class="select-dots" aria-hidden="true">
        <span
          v-for="(char, i) in characters"
          :key="char.id"
          class="select-dot"
          :class="{ 'is-active': i === activeIndex }"
        />
      </div>

      <div class="select-cta-wrap">
        <button type="button" class="select-cta" :disabled="isLoadingChats" @click="pickActive">
          <Loader2 v-if="isLoadingChats" :size="18" class="spin" aria-hidden="true" />
          {{ isLoadingChats ? "正在找聊天紀錄…" : "拿起 TA 的手機" }}
        </button>
      </div>
    </template>

    <div v-else class="select-empty">
      <p>還沒有角色</p>
      <p class="select-empty-sub">先去建立角色吧</p>
    </div>

    <!-- 選聊天紀錄 / 沒有聊天紀錄 -->
    <Transition name="select-sheet">
      <div v-if="showChatSheet" class="sheet-layer">
        <div class="sheet-scrim" @click="closeChatSheet" />
        <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="peek-chat-sheet-title">
          <span class="sheet-handle" aria-hidden="true" />
          <div class="sheet-head">
            <div class="sheet-title-wrap">
              <span id="peek-chat-sheet-title" class="sheet-title">
                {{ noChats ? `還沒跟${nameOf(selectedCharacter)}聊過天` : "要用哪一段聊天？" }}
              </span>
              <span class="sheet-sub">
                {{ noChats ? "TA 的手機內容是從你們的聊天長出來的，先去聊幾句再來" : "手機內容會依這段聊天生成" }}
              </span>
            </div>
            <button type="button" class="round-btn round-btn--soft" aria-label="關閉" @click="closeChatSheet">
              <X :size="20" />
            </button>
          </div>

          <ul v-if="!noChats" class="sheet-list">
            <li v-for="chat in characterChats" :key="chat.id">
              <button type="button" class="sheet-row" @click="onChatSelect(chat.id)">
                <span class="sheet-row-main">
                  <span class="sheet-row-name">{{ chat.name }}</span>
                  <span class="sheet-row-preview">
                    {{ chat.lastMessagePreview || `${chat.messageCount ?? chat.messages?.length ?? 0} 條訊息` }}
                  </span>
                </span>
                <span class="sheet-row-date">{{ formatDate(chat.updatedAt) }}</span>
                <ChevronRight :size="16" class="sheet-row-chev" aria-hidden="true" />
              </button>
            </li>
          </ul>
          <button v-else type="button" class="select-cta" @click="closeChatSheet">知道了</button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss">
@use "@/components/peek-phone/peek-theme.scss";
</style>

<style lang="scss" scoped>
@import url("https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap");

.peek-select {
  --phone-h: clamp(240px, calc(100vh - 420px), 450px);
  --phone-w: calc(var(--phone-h) * 0.489);

  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--p-paper);
  color: var(--p-ink);
  display: flex;
  flex-direction: column;
  padding: calc(var(--safe-top, 0px) + 16px) 0 calc(var(--safe-bottom, 0px) + 20px);
  box-sizing: border-box;

  @supports (height: 100dvh) {
    --phone-h: clamp(240px, calc(100dvh - 420px), 450px);
  }
}

.select-head {
  height: 44px;
  padding: 0 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.round-btn {
  width: 44px;
  height: 44px;
  border-radius: 22px;
  flex-shrink: 0;
  border: none;
  background: var(--p-chip);
  color: var(--p-ink);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;

  &--soft {
    background: var(--p-sheet-btn);
  }
}

.round-btn-spacer {
  width: 44px;
}

.select-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.select-mark {
  width: 34px;
  height: 34px;
  border-radius: 17px;
  background: var(--p-ink);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 700;
}

.select-brand-name {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.select-intro {
  padding: 0 20px;
  margin-top: 16px;
  flex-shrink: 0;
}

.select-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
}

.select-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--p-ink-2);
}

// ===== 手機輪播 =====
.select-carousel {
  flex-shrink: 0;
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 20px;
  // 上下留白給選中那支的陰影，不然會被捲動區切出硬邊
  padding: 16px calc(50% - var(--phone-w) / 2) 48px;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
}

.mock {
  position: relative;
  flex-shrink: 0;
  width: var(--phone-w);
  height: var(--phone-h);
  container-type: inline-size;
  border: 6px solid var(--p-ink);
  border-radius: calc(var(--phone-w) * 0.18);
  box-sizing: border-box;
  overflow: hidden;
  padding: 0;
  scroll-snap-align: center;
  color: #ffffff;
  font-family: inherit;
  cursor: pointer;
  transform: scale(0.86);
  opacity: 0.72;
  transition:
    transform 0.25s ease,
    opacity 0.25s ease,
    box-shadow 0.25s ease;

  &.is-active {
    transform: scale(1);
    opacity: 1;
    box-shadow: 0 24px 48px rgba(18, 18, 20, 0.28);
  }
}

.mock-screen {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 22cqw;
}

.mock-date {
  font-size: 5cqw;
  color: var(--p-on-wall-2);
}

.mock-time {
  font-family: var(--p-num);
  font-weight: 500;
  font-size: 28cqw;
  line-height: 1.05;
}

.mock-notif {
  position: absolute;
  left: 5cqw;
  right: 5cqw;
  bottom: 22cqw;
  display: flex;
  align-items: center;
  gap: 4cqw;
  padding: 4cqw 4.5cqw;
  border-radius: 8cqw;
  background: var(--p-glass);
  text-align: left;
}

.mock-notif-icon {
  width: 11cqw;
  height: 11cqw;
  border-radius: 3cqw;
  flex-shrink: 0;
  background: var(--p-app-icon);
  color: var(--p-app-glyph);
  display: flex;
  align-items: center;
  justify-content: center;
}

.mock-notif-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.35;
  font-size: 5cqw;
}

.mock-notif-name {
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mock-notif-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mock-notif-time {
  flex-shrink: 0;
  align-self: flex-start;
  font-size: 4cqw;
  color: #d6d6da;
}

.mock-pill {
  position: absolute;
  bottom: 10cqw;
  height: 10cqw;
  padding: 0 4.5cqw;
  border-radius: 5cqw;
  background: var(--p-glass);
  font-size: 4.5cqw;
  display: flex;
  align-items: center;
}

// ===== 選中角色的資訊 =====
.select-info {
  padding: 0 20px;
  margin-top: -26px;
  text-align: center;
  flex-shrink: 0;
}

.select-name {
  font-size: 24px;
  font-weight: 700;
}

.select-desc {
  margin-top: 2px;
  font-size: 13px;
  color: var(--p-ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select-chips {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.chip {
  height: 30px;
  padding: 0 12px;
  border-radius: 15px;
  background: var(--p-chip);
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.chip-dot {
  width: 7px;
  height: 7px;
  border-radius: 4px;
  background: #e8a93a;
}

.select-dots {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin-top: 16px;
  flex-shrink: 0;
}

.select-dot {
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background: #b4b3af;
  transition: width 0.2s;

  &.is-active {
    width: 18px;
    background: var(--p-ink);
  }
}

.select-cta-wrap {
  margin-top: auto;
  padding: 16px 20px 0;
}

.select-cta {
  width: 100%;
  height: 56px;
  border: none;
  border-radius: 28px;
  background: var(--p-ink);
  color: #ffffff;
  font-family: inherit;
  font-size: 16px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  flex-shrink: 0;

  &:disabled {
    opacity: 0.7;
    cursor: default;
  }
}

.select-empty {
  margin: auto 0;
  text-align: center;
  font-size: 16px;
  font-weight: 700;

  p {
    margin: 0;
  }

  .select-empty-sub {
    margin-top: 4px;
    font-size: 13px;
    font-weight: 400;
    color: var(--p-ink-2);
  }
}

.spin {
  animation: select-spin 1s linear infinite;
}

@keyframes select-spin {
  to {
    transform: rotate(360deg);
  }
}

// ===== 選聊天紀錄面板 =====
.sheet-layer {
  position: absolute;
  inset: 0;
  z-index: 30;
}

.sheet-scrim {
  position: absolute;
  inset: 0;
  background: var(--p-scrim);
}

.sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: calc(100% - var(--safe-top, 0px) - 64px);
  overflow-y: auto;
  background: var(--p-sheet);
  border-radius: 28px 28px 0 0;
  padding: 10px 20px calc(var(--safe-bottom, 0px) + 28px);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sheet-handle {
  align-self: center;
  width: 36px;
  height: 5px;
  border-radius: 3px;
  background: #c9c8c3;
}

.sheet-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.sheet-title-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sheet-title {
  font-size: 17px;
  font-weight: 700;
}

.sheet-sub {
  font-size: 13px;
  line-height: 1.5;
  color: var(--p-sheet-ink-2);
}

.sheet-list {
  list-style: none;
  margin: 0;
  padding: 0 14px;
  background: #ffffff;
  border-radius: 18px;

  li + li .sheet-row {
    border-top: 1px solid var(--p-sheet-line);
  }
}

.sheet-row {
  width: 100%;
  min-height: 64px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: none;
  background: none;
  color: var(--p-ink);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  padding: 10px 0;
}

.sheet-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sheet-row-name {
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sheet-row-preview {
  font-size: 13px;
  color: var(--p-sheet-ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sheet-row-date {
  flex-shrink: 0;
  font-family: var(--p-num);
  font-size: 12px;
  color: var(--p-sheet-ink-2);
}

.sheet-row-chev {
  flex-shrink: 0;
  color: #a8a7a2;
}

.select-sheet-enter-active,
.select-sheet-leave-active {
  transition: opacity 0.22s ease;

  .sheet {
    transition: transform 0.26s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
}

.select-sheet-enter-from,
.select-sheet-leave-to {
  opacity: 0;

  .sheet {
    transform: translateY(100%);
  }
}
</style>
