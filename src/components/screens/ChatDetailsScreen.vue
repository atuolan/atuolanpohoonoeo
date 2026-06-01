<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  displayAvatar: string;
  characterName: string;
  isGroupChat: boolean;
  groupDisplayName: string;
  displayCharacterName: string;
  groupMemberCount?: number;
  isCharBlocked: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "navigate", page: "character" | "worldbook" | "peek-phone" | "settings"): void;
  (e: "open-search-bar"): void;
  (e: "open-chat-info"): void;
  (e: "open-chat-files-panel"): void;
  (e: "export-current-chat"): void;
  (e: "trigger-jsonl-import"): void;
  (e: "start-new-conversation"): void;
  (e: "toggle-block-character"): void;
  (e: "clear-chat-history"): void;
  (e: "open-proactive-message-settings"): void;
}>();

const displayName = computed(() => props.isGroupChat ? props.groupDisplayName : props.displayCharacterName);
// 暱稱：displayCharacterName 與 characterName 不同時表示有設定暱稱
const nickname = computed(() => {
  if (props.isGroupChat) return null;
  const hasNickname = props.displayCharacterName && props.characterName &&
    props.displayCharacterName !== props.characterName;
  return hasNickname ? props.characterName : null;
});

function handleAction(action: string) {
  switch (action) {
    case "character":
    case "worldbook":
    case "peek-phone":
    case "settings":
      emit("navigate", action as "character" | "worldbook" | "peek-phone" | "settings");
      break;
    case "search":
      emit("close");
      emit("open-search-bar");
      break;
    case "chat-info":
      emit("open-chat-info");
      break;
    case "chat-files":
      emit("close");
      emit("open-chat-files-panel");
      break;
    case "export":
      emit("export-current-chat");
      break;
    case "import":
      emit("trigger-jsonl-import");
      break;
    case "new-conversation":
      emit("start-new-conversation");
      break;
    case "block":
      emit("toggle-block-character");
      break;
    case "clear":
      emit("clear-chat-history");
      break;
  }
}
</script>

<template>
  <div class="chat-details-screen">
    <!-- 環境裝飾光暈 -->
    <div class="ambient-glow ambient-glow--top"></div>
    <div class="ambient-glow ambient-glow--bottom"></div>

    <!-- 浮動頂部標題列 -->
    <header class="float-header">
      <button class="header-btn" :title="'返回'" @click="emit('close')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </svg>
      </button>
      <h1 class="header-title">聊天詳情</h1>
      <div class="header-btn-placeholder"></div>
    </header>

    <!-- 主要內容 -->
    <main class="details-main">
      <!-- 個人資料 -->
      <section class="profile-section">
        <div class="avatar-container">
          <div class="avatar-glow"></div>
          <div class="avatar-frame">
            <img v-if="displayAvatar" :src="displayAvatar" :alt="characterName" />
            <div v-else-if="isGroupChat" class="avatar-placeholder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="9" cy="9" r="3" />
                <circle cx="17" cy="10" r="2.2" />
                <path d="M3 19v-1a5.5 5.5 0 0 1 11 0v1" />
                <path d="M14 14a4 4 0 0 1 7 4v1" />
              </svg>
            </div>
            <div v-else class="avatar-placeholder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
              </svg>
            </div>
          </div>
        </div>
        <h2 class="profile-name">{{ displayName }}</h2>
        <p v-if="nickname" class="profile-subtitle">{{ nickname }}</p>
      </section>

      <!-- 內容流 -->
      <div class="content-flow">
        <!-- 快捷導航 -->
        <section class="glass-panel organic-shape-1">
          <div class="panel-deco panel-deco--tr"></div>
          <h3 class="panel-title">快捷導航</h3>
          <div class="quick-grid">
            <button class="quick-item" @click="handleAction('character')">
              <div class="quick-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
                </svg>
              </div>
              <span class="quick-label">角色卡</span>
            </button>
            <button class="quick-item" @click="handleAction('worldbook')">
              <div class="quick-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </div>
              <span class="quick-label">世界書</span>
            </button>
            <button class="quick-item" @click="handleAction('peek-phone')">
              <div class="quick-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7z" />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
              </div>
              <span class="quick-label">頭盔TA</span>
            </button>
            <button class="quick-item" @click="handleAction('settings')">
              <div class="quick-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </div>
              <span class="quick-label">設置</span>
            </button>
          </div>
        </section>

        <!-- 聊天管理 -->
        <section class="glass-panel rounded-soft">
          <div class="panel-deco panel-deco--bl"></div>
          <h3 class="panel-title">聊天管理</h3>
          <div class="list-group">
            <button v-if="!isGroupChat" class="list-item" @click="emit('open-proactive-message-settings')">
              <div class="list-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </div>
              <span class="list-label">主動發訊息設置</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <button class="list-item" @click="handleAction('search')">
              <div class="list-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </div>
              <span class="list-label">搜索訊息</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <button class="list-item" @click="handleAction('chat-info')">
              <div class="list-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
              </div>
              <span class="list-label">聊天資訊</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <button class="list-item" @click="handleAction('chat-files')">
              <div class="list-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
                </svg>
              </div>
              <span class="list-label">聊天檔案</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        </section>

        <!-- 資料管理 -->
        <section class="glass-panel organic-shape-2">
          <div class="panel-deco panel-deco--right"></div>
          <h3 class="panel-title">資料管理</h3>
          <div class="list-group">
            <button class="list-item" @click="handleAction('export')">
              <div class="list-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <path d="m7 10 5 5 5-5" />
                  <path d="M12 15V3" />
                </svg>
              </div>
              <span class="list-label">導出聊天</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <button class="list-item" @click="handleAction('import')">
              <div class="list-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <path d="m17 8-5-5-5 5" />
                  <path d="M12 3v12" />
                </svg>
              </div>
              <span class="list-label">匯入 JSONL</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <button class="list-item" @click="handleAction('new-conversation')">
              <div class="list-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9" />
                  <path d="M3 4v5h5" />
                </svg>
              </div>
              <span class="list-label">開啟新對話</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        </section>

        <!-- 危險操作 -->
        <section class="glass-panel rounded-soft">
          <h3 class="panel-title">危險操作</h3>
          <div class="list-group">
            <button v-if="!isGroupChat" class="list-item danger" @click="handleAction('block')">
              <div class="list-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="m4.93 4.93 14.14 14.14" />
                </svg>
              </div>
              <span class="list-label">{{ isCharBlocked ? '解除封鎖' : '封鎖角色' }}</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
            <button class="list-item danger" @click="handleAction('clear')">
              <div class="list-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </div>
              <span class="list-label">清空聊天</span>
              <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<style lang="scss" scoped>
.chat-details-screen {
  position: fixed;
  inset: 0;
  z-index: 1000;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% -10%,
      color-mix(in srgb, var(--color-primary, #00723a) 8%, var(--color-background)) 0%,
      var(--color-background) 60%);
  color: var(--color-text);
  font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
}

/* === 環境光暈 === */
.ambient-glow {
  position: absolute;
  border-radius: 9999px;
  filter: blur(80px);
  pointer-events: none;
  z-index: 0;
  opacity: 0.3;
}

.ambient-glow--top {
  top: 80px;
  left: -10%;
  width: 260px;
  height: 260px;
  background: color-mix(in srgb, var(--color-primary, #00723a) 35%, transparent);
}

.ambient-glow--bottom {
  bottom: 160px;
  right: -10%;
  width: 320px;
  height: 320px;
  background: color-mix(in srgb, var(--color-primary, #00723a) 18%, transparent);
}

/* === 浮動標題列 === */
.float-header {
  position: fixed;
  top: max(16px, calc(var(--safe-top, 0px) + 16px));
  left: 16px;
  right: 16px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 6px;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--color-surface) 60%, transparent);
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid color-mix(in srgb, var(--color-surface) 80%, transparent);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
  z-index: 50;
}

.header-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: transparent;
  border: none;
  color: var(--color-primary, #00723a);
  cursor: pointer;
  transition: background-color 0.2s, transform 0.15s;

  &:hover {
    background: color-mix(in srgb, var(--color-primary, #00723a) 12%, transparent);
  }

  &:active {
    transform: scale(0.92);
  }

  svg {
    width: 22px;
    height: 22px;
  }
}

.header-btn-placeholder {
  width: 40px;
  height: 40px;
}

.header-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-primary, #00723a);
  margin: 0;
  letter-spacing: 0.2px;
}

/* === 主要內容區 === */
.details-main {
  position: relative;
  z-index: 10;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
  width: 100%;
  padding:
    calc(max(16px, calc(var(--safe-top, 0px) + 16px)) + 56px + 24px)
    20px
    calc(24px + max(0px, var(--safe-bottom, 0px)));
}

/* === 個人資料 === */
.profile-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 32px;
}

.avatar-container {
  position: relative;
  width: 128px;
  height: 128px;
  margin-bottom: 16px;
}

.avatar-glow {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background: var(--color-primary, #00723a);
  filter: blur(20px);
  opacity: 0.18;
  transform: scale(1.08);
}

.avatar-frame {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  overflow: hidden;
  border: 3px solid var(--color-surface);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--color-primary, #00723a) 18%, transparent),
    0 12px 28px color-mix(in srgb, var(--color-primary, #00723a) 18%, transparent);
  background: var(--color-surface);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);

    svg {
      width: 56px;
      height: 56px;
    }
  }
}

.profile-name {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0 0 4px;
  text-align: center;
  letter-spacing: -0.2px;
}

.profile-subtitle {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0;
  text-align: center;
}

/* === 內容流 === */
.content-flow {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  box-sizing: border-box;
}

/* === 玻璃面板 === */
.glass-panel {
  position: relative;
  padding: 22px 22px;
  background: color-mix(in srgb, var(--color-surface) 55%, transparent);
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid color-mix(in srgb, var(--color-surface) 75%, transparent);
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.04);
  width: 100%;
  box-sizing: border-box;
}

.rounded-soft {
  border-radius: 28px;
}

.organic-shape-1 {
  border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;
  // 讓文字標籤不被有機形狀裁切
  overflow: visible;
}

.organic-shape-2 {
  border-radius: 28px;
}

.panel-deco {
  position: absolute;
  border-radius: 9999px;
  filter: blur(40px);
  pointer-events: none;
  z-index: 0;

  &--tr {
    top: 0;
    right: 0;
    width: 130px;
    height: 130px;
    background: color-mix(in srgb, var(--color-primary, #00723a) 28%, transparent);
    opacity: 0.35;
    transform: translate(40%, -50%);
  }

  &--bl {
    bottom: 0;
    left: 0;
    width: 160px;
    height: 160px;
    background: color-mix(in srgb, var(--color-primary, #00723a) 14%, transparent);
    opacity: 0.4;
    transform: translate(-30%, 50%);
  }

  &--right {
    top: 50%;
    right: 0;
    width: 100px;
    height: 100px;
    background: color-mix(in srgb, var(--color-primary, #00723a) 20%, transparent);
    opacity: 0.25;
    transform: translate(40%, -50%);
  }
}

.panel-title {
  position: relative;
  z-index: 1;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 1.6px;
  margin: 0 0 16px;
}

/* === 快捷導航 === */
.quick-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.quick-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  background: transparent;
  border: none;
  cursor: pointer;

  &:active .quick-icon {
    transform: scale(0.92);
  }

  &:hover .quick-icon {
    background: var(--color-primary, #00723a);
    color: var(--color-on-primary, #ffffff);
  }
}

.quick-icon {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
  background: color-mix(in srgb, var(--color-surface) 95%, transparent);
  color: var(--color-primary, #00723a);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
  transition: all 0.25s;

  svg {
    width: 24px;
    height: 24px;
  }
}

.quick-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
  letter-spacing: 0.3px;
}

/* === 列表群組 === */
.list-group {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.list-item {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 10px;
  border-radius: 18px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.15s;

  &:hover {
    background: color-mix(in srgb, var(--color-surface) 70%, transparent);
  }

  &:active {
    transform: scale(0.985);
  }

  &.danger {
    .list-icon {
      color: var(--color-error, #b3261e);
    }

    .list-label {
      color: var(--color-error, #b3261e);
    }
  }
}

.list-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: var(--color-surface);
  color: var(--color-primary, #00723a);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);

  svg {
    width: 20px;
    height: 20px;
  }
}

.list-label {
  flex: 1;
  text-align: left;
  font-size: 16px;
  font-weight: 500;
  color: var(--color-text);
  letter-spacing: 0.1px;
}

.chevron {
  width: 18px;
  height: 18px;
  color: color-mix(in srgb, var(--color-text-secondary) 70%, transparent);
  flex-shrink: 0;
}
</style>
