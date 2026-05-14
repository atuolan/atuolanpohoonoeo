<script setup lang="ts">
interface PersonaOption {
  id: string;
  name: string;
  avatar?: string;
  description?: string;
}

const props = defineProps<{
  displayAvatar: string;
  characterName: string;
  isGroupChat: boolean;
  groupDisplayName: string;
  displayCharacterName: string;
  currentCharacter: unknown;
  showNicknameEdit: boolean;
  nicknameEditValue: string;
  isGenerating: boolean;
  groupMemberCount: number;
  showRail: boolean;
  currentUserAvatar: string;
  currentUserName: string;
  personas: PersonaOption[];
  currentPersonaId: string | null;
  showPersonaSelector: boolean;
  showGameMenu: boolean;
  showChatSettingsMenu: boolean;
  chatFaceToFaceMode: boolean;
  chatThirdPersonMode: boolean;
  nightMode: boolean;
  chatEnableRealTimeAwareness: boolean;
  showFakeTimePanel: boolean;
  fakeTimeMode: "real" | "loop" | "offset";
  fakeTimeLoopStart: string;
  fakeTimeLoopEnd: string;
  offsetStartDateTime: string;
  formattedFakeTime: string;
  timeJumpInput: string;
  chatDoNotDisturb: boolean;
  enablePhoneDecision: boolean;
  novelAIEnabled: boolean;
  novelAIUseUserTag: boolean;
  chatImageSearchEnabled: boolean;
  chatMinimaxTTSEnabled: boolean;
  showMoreMenu: boolean;
  isCharBlocked: boolean;
  hasMemoryBadge: boolean;
}>();

const emit = defineEmits<{
  (e: "back"): void;
  (e: "open-ai-summary"): void;
  (e: "start-nickname-edit"): void;
  (e: "update:nicknameEditValue", value: string): void;
  (e: "save-nickname"): void;
  (e: "close-nickname-edit"): void;
  (e: "toggle-rail"): void;
  (e: "toggle-persona-selector"): void;
  (e: "select-persona", personaId: string): void;
  (e: "open-persona-edit"): void;
  (e: "toggle-game-menu"): void;
  (e: "open-game", game: "dishwashing" | "fishing" | "gambling" | "merit"): void;
  (e: "open-settings"): void;
  (e: "open-proactive-message-settings"): void;
  (e: "toggle-chat-settings-menu"): void;
  (e: "toggle-face-to-face-mode"): void;
  (e: "toggle-third-person-mode"): void;
  (e: "toggle-night-mode"): void;
  (e: "toggle-real-time-awareness"): void;
  (e: "toggle-fake-time-panel"): void;
  (e: "set-fake-time-mode", mode: "real" | "loop" | "offset"): void;
  (e: "update-fake-time-loop-start", value: string): void;
  (e: "update-fake-time-loop-end", value: string): void;
  (e: "update-offset-start-datetime", value: string): void;
  (e: "update-time-jump-input", value: string): void;
  (e: "handle-time-jump"): void;
  (e: "toggle-chat-do-not-disturb"): void;
  (e: "toggle-phone-decision"): void;
  (e: "toggle-novel-ai-image"): void;
  (e: "toggle-novel-ai-use-user-tag"): void;
  (e: "toggle-chat-image-search"): void;
  (e: "open-novel-ai-settings"): void;
  (e: "toggle-minimax-tts"): void;
  (e: "open-minimax-tts-settings"): void;
  (e: "toggle-more-menu"): void;
  (e: "navigate", page: "character" | "worldbook" | "settings" | "peek-phone"): void;
  (e: "open-search-bar"): void;
  (e: "open-chat-info"): void;
  (e: "open-chat-files-panel"): void;
  (e: "export-current-chat"): void;
  (e: "trigger-jsonl-import"): void;
  (e: "start-new-conversation"): void;
  (e: "toggle-block-character"): void;
  (e: "clear-chat-history"): void;
}>();

function onNicknameInput(event: Event) {
  emit("update:nicknameEditValue", (event.target as HTMLInputElement).value);
}

function onFakeTimeLoopStartChange(event: Event) {
  emit("update-fake-time-loop-start", (event.target as HTMLInputElement).value);
}

function onFakeTimeLoopEndChange(event: Event) {
  emit("update-fake-time-loop-end", (event.target as HTMLInputElement).value);
}

function onOffsetStartDateTimeChange(event: Event) {
  emit("update-offset-start-datetime", (event.target as HTMLInputElement).value);
}

function onTimeJumpInput(event: Event) {
  emit("update-time-jump-input", (event.target as HTMLInputElement).value);
}

</script>

<template>
  <header class="chat-header">
    <button class="header-back" @click="emit('back')">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
      </svg>
    </button>

    <div class="char-avatar-wrap">
      <div class="char-avatar" title="AI 記憶管理" @click.stop="emit('open-ai-summary')">
        <img v-if="displayAvatar" :src="displayAvatar" :alt="characterName" />
        <div v-else-if="isGroupChat" class="avatar-placeholder group-avatar">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
          </svg>
        </div>
        <div v-else class="avatar-placeholder">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
          </svg>
        </div>
      </div>
      <svg v-if="hasMemoryBadge" class="char-avatar-heart" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    </div>

    <div class="chat-info">
      <div class="chat-name-row">
        <h1 class="chat-name">{{ isGroupChat ? groupDisplayName : displayCharacterName }}</h1>
        <button v-if="!isGroupChat && currentCharacter" class="nickname-edit-btn" title="編輯暱稱" @click.stop="emit('start-nickname-edit')">
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
          </svg>
        </button>
      </div>
      <div v-if="showNicknameEdit" class="nickname-edit-popup" @click.stop>
        <input
          :value="nicknameEditValue"
          class="nickname-edit-input"
          placeholder="輸入暱稱..."
          maxlength="30"
          @input="onNicknameInput"
          @keydown.enter="emit('save-nickname')"
          @keydown.escape="emit('close-nickname-edit')"
        />
        <button class="nickname-save-btn" @click="emit('save-nickname')">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
        </button>
      </div>
      <p v-if="isGroupChat && !isGenerating" class="chat-status">{{ groupMemberCount }} 位成員</p>
      <p v-else-if="isGenerating" class="chat-status">正在輸入...</p>
    </div>

    <button class="rail-toggle-btn" :class="{ active: showRail }" @click.stop="emit('toggle-rail')">
      <svg v-if="!showRail" viewBox="0 0 24 24" fill="currentColor">
        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="currentColor">
        <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
      </svg>
    </button>

    <div class="header-actions" :class="{ 'rail-open': showRail }">
      <div class="persona-dropdown" @click.stop>
        <button class="header-btn persona-btn" title="切換使用者" @click.stop="emit('toggle-persona-selector')">
          <div v-if="currentUserAvatar" class="persona-avatar-mini">
            <img :src="currentUserAvatar" :alt="currentUserName" />
          </div>
          <svg v-else viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
        </button>

        <Transition name="dropdown">
          <div v-if="showPersonaSelector" class="persona-selector">
            <div class="persona-selector-header">
              <span>選擇使用者</span>
            </div>
            <div class="persona-list">
              <button
                v-for="persona in personas"
                :key="persona.id"
                class="persona-item"
                :class="{ active: persona.id === currentPersonaId }"
                @click="emit('select-persona', persona.id)"
              >
                <div class="persona-item-avatar">
                  <img v-if="persona.avatar" :src="persona.avatar" :alt="persona.name" />
                  <svg v-else viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                </div>
                <div class="persona-item-info">
                  <span class="persona-item-name">{{ persona.name }}</span>
                  <span v-if="persona.description" class="persona-item-desc">
                    {{ persona.description.substring(0, 30) }}{{ persona.description.length > 30 ? '...' : '' }}
                  </span>
                </div>
                <svg v-if="persona.id === currentPersonaId" class="check-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              </button>
            </div>
            <div class="persona-selector-footer">
              <button class="edit-persona-btn" @click="emit('open-persona-edit')">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                </svg>
                <span>編輯設定</span>
              </button>
            </div>
          </div>
        </Transition>
      </div>

      <div class="game-dropdown" @click.stop>
        <button class="header-btn" :class="{ active: showGameMenu }" title="小遊戲" @click.stop="emit('toggle-game-menu')">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
          </svg>
        </button>

        <Transition name="dropdown">
          <div v-if="showGameMenu" class="dropdown-menu game-menu">
            <div class="dropdown-section-title">小遊戲</div>
            <button class="dropdown-item" @click="emit('open-game', 'dishwashing')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
                <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
              </svg>
              <span>刷盤子</span>
            </button>
            <button class="dropdown-item" @click="emit('open-game', 'fishing')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 4a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3z" />
                <path d="M18 11v9" />
                <path d="M18 20l-3-3" />
                <path d="M18 20l3-3" />
                <circle cx="6" cy="12" r="4" />
                <path d="M10 12h4" />
              </svg>
              <span>釣魚</span>
            </button>
            <button class="dropdown-item" @click="emit('open-game', 'gambling')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="2" width="20" height="20" rx="2" />
                <circle cx="8" cy="8" r="1.5" fill="currentColor" />
                <circle cx="16" cy="8" r="1.5" fill="currentColor" />
                <circle cx="8" cy="16" r="1.5" fill="currentColor" />
                <circle cx="16" cy="16" r="1.5" fill="currentColor" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" />
              </svg>
              <span>猜大小</span>
            </button>
            <button class="dropdown-item" @click="emit('open-game', 'merit')">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <ellipse cx="12" cy="14" rx="9" ry="7" />
                <ellipse cx="12" cy="8" rx="3" ry="2" />
                <circle cx="12" cy="6" r="1.5" />
              </svg>
              <span>修行</span>
            </button>
          </div>
        </Transition>
      </div>

      <button class="header-btn" title="外觀設定" @click.stop="emit('open-settings')">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
        </svg>
      </button>

      <button v-if="!isGroupChat && currentCharacter" class="header-btn" title="主動發訊息設置" @click.stop="emit('open-proactive-message-settings')">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
        </svg>
      </button>

      <div class="chat-settings-dropdown" @click.stop>
        <button class="header-btn" :class="{ active: showChatSettingsMenu }" title="聊天設定" @click.stop="emit('toggle-chat-settings-menu')">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z" />
          </svg>
        </button>

        <Transition name="dropdown">
          <div v-if="showChatSettingsMenu" class="dropdown-menu chat-settings-menu">
            <div class="dropdown-section-title">顯示模式</div>
            <div class="dropdown-toggle-item">
              <div class="toggle-item-info">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                </svg>
                <span>面對面模式</span>
              </div>
              <label class="toggle-switch-mini">
                <input type="checkbox" :checked="chatFaceToFaceMode" @change="emit('toggle-face-to-face-mode')" />
                <span class="toggle-slider-mini"></span>
              </label>
            </div>
            <div v-if="chatFaceToFaceMode" class="dropdown-toggle-item">
              <div class="toggle-item-info">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
                <span>第三人稱</span>
              </div>
              <label class="toggle-switch-mini">
                <input type="checkbox" :checked="chatThirdPersonMode" @change="emit('toggle-third-person-mode')" />
                <span class="toggle-slider-mini"></span>
              </label>
            </div>
            <div class="dropdown-toggle-item">
              <div class="toggle-item-info">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 2c-1.05 0-2.05.16-3 .46 4.06 1.27 7 5.06 7 9.54 0 4.48-2.94 8.27-7 9.54.95.3 1.95.46 3 .46 5.52 0 10-4.48 10-10S14.52 2 9 2z" />
                </svg>
                <span>夜晚模式</span>
              </div>
              <label class="toggle-switch-mini">
                <input type="checkbox" :checked="nightMode" @change="emit('toggle-night-mode')" />
                <span class="toggle-slider-mini"></span>
              </label>
            </div>
            <div class="dropdown-toggle-item">
              <div class="toggle-item-info">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
                </svg>
                <span>感知現實時間</span>
              </div>
              <label class="toggle-switch-mini">
                <input type="checkbox" :checked="chatEnableRealTimeAwareness" @change="emit('toggle-real-time-awareness')" />
                <span class="toggle-slider-mini"></span>
              </label>
            </div>
            <div v-if="chatEnableRealTimeAwareness" class="dropdown-toggle-item" style="cursor: pointer" @click="emit('toggle-fake-time-panel')">
              <div class="toggle-item-info">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z" />
                </svg>
                <span>時間模式</span>
              </div>
              <span style="font-size: 11px; opacity: 0.7">
                {{ fakeTimeMode === 'real' ? '真實' : fakeTimeMode === 'loop' ? '輪迴' : '偏移' }}
              </span>
            </div>
            <div v-if="showFakeTimePanel && chatEnableRealTimeAwareness" class="fake-time-panel">
              <div class="fake-time-mode-selector">
                <button v-for="m in ['real', 'loop', 'offset'] as const" :key="m" :class="['fake-time-mode-btn', { active: fakeTimeMode === m }]" @click="emit('set-fake-time-mode', m)">
                  {{ m === 'real' ? '真實時間' : m === 'loop' ? '輪迴時間' : '偏移時間' }}
                </button>
              </div>
              <div v-if="fakeTimeMode === 'loop'" class="fake-time-config">
                <label class="fake-time-label">
                  起始
                  <input type="datetime-local" :value="fakeTimeLoopStart" class="fake-time-input" @change="onFakeTimeLoopStartChange" />
                </label>
                <label class="fake-time-label">
                  結束
                  <input type="datetime-local" :value="fakeTimeLoopEnd" class="fake-time-input" @change="onFakeTimeLoopEndChange" />
                </label>
              </div>
              <div v-if="fakeTimeMode === 'offset'" class="fake-time-config">
                <label class="fake-time-label">
                  設定現在時間
                  <input type="datetime-local" :value="offsetStartDateTime" class="fake-time-input" @change="onOffsetStartDateTimeChange" />
                </label>
              </div>
              <div v-if="fakeTimeMode !== 'real'" class="fake-time-preview">AI 感知時間：{{ formattedFakeTime }}</div>
              <div v-if="fakeTimeMode !== 'real'" class="fake-time-jump">
                <span style="font-size: 12px; color: var(--color-text-secondary); flex-shrink: 0">跳轉到</span>
                <input :value="timeJumpInput" type="datetime-local" class="fake-time-input" style="max-width: none; flex: 1" @input="onTimeJumpInput" />
                <button class="fake-time-jump-btn" @click="emit('handle-time-jump')">跳轉</button>
              </div>
            </div>
            <div class="dropdown-divider"></div>
            <div class="dropdown-section-title">電話設定</div>
            <div class="dropdown-toggle-item">
              <div class="toggle-item-info">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z" />
                </svg>
                <span>勿擾模式</span>
              </div>
              <label class="toggle-switch-mini">
                <input type="checkbox" :checked="chatDoNotDisturb" @change="emit('toggle-chat-do-not-disturb')" />
                <span class="toggle-slider-mini"></span>
              </label>
            </div>
            <div class="dropdown-toggle-item">
              <div class="toggle-item-info">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
                </svg>
                <span>角色決定接電話</span>
              </div>
              <label class="toggle-switch-mini">
                <input type="checkbox" :checked="enablePhoneDecision" @change="emit('toggle-phone-decision')" />
                <span class="toggle-slider-mini"></span>
              </label>
            </div>
            <div class="dropdown-divider"></div>
            <div class="dropdown-section-title">AI 繪圖</div>
            <div class="dropdown-toggle-item">
              <div class="toggle-item-info">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                </svg>
                <span>啟用文生圖</span>
              </div>
              <label class="toggle-switch-mini">
                <input type="checkbox" :checked="novelAIEnabled" @change="emit('toggle-novel-ai-image')" />
                <span class="toggle-slider-mini"></span>
              </label>
            </div>
            <div class="dropdown-toggle-item">
              <div class="toggle-item-info">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
                <span>使用 User Tag</span>
              </div>
              <label class="toggle-switch-mini">
                <input type="checkbox" :checked="novelAIUseUserTag" @change="emit('toggle-novel-ai-use-user-tag')" />
                <span class="toggle-slider-mini"></span>
              </label>
            </div>
            <div class="dropdown-toggle-item">
              <div class="toggle-item-info">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9.5 3C5.91 3 3 5.91 3 9.5S5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57L19.29 20 20.7 18.59l-5.56-5.56A6.47 6.47 0 0 0 16 9.5C16 5.91 13.09 3 9.5 3zm0 2C11.99 5 14 7.01 14 9.5S11.99 14 9.5 14 5 11.99 5 9.5 7.01 5 9.5 5z" />
                </svg>
                <span>使用搜圖</span>
              </div>
              <label class="toggle-switch-mini">
                <input type="checkbox" :checked="chatImageSearchEnabled" @change="emit('toggle-chat-image-search')" />
                <span class="toggle-slider-mini"></span>
              </label>
            </div>
            <button class="dropdown-item" @click="emit('open-novel-ai-settings')">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
              </svg>
              <span>文生圖設定</span>
            </button>
            <div class="dropdown-divider"></div>
            <div class="dropdown-section-title">AI 語音</div>
            <div class="dropdown-toggle-item">
              <div class="toggle-item-info">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z" />
                </svg>
                <span>MiniMax 語音合成</span>
              </div>
              <label class="toggle-switch-mini">
                <input type="checkbox" :checked="chatMinimaxTTSEnabled" @change="emit('toggle-minimax-tts')" />
                <span class="toggle-slider-mini"></span>
              </label>
            </div>
            <button class="dropdown-item" @click="emit('open-minimax-tts-settings')">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
              </svg>
              <span>語音設定</span>
            </button>
          </div>
        </Transition>
      </div>

      <div class="more-dropdown" @click.stop>
        <button class="header-btn" title="更多選項" @click.stop="emit('toggle-more-menu')">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
          </svg>
        </button>

        <Transition name="dropdown">
          <div v-if="showMoreMenu" class="dropdown-menu">
            <div class="dropdown-section-title">快捷導航</div>
            <button class="dropdown-item" @click="emit('navigate', 'character')">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
              <span>角色卡</span>
            </button>
            <button class="dropdown-item" @click="emit('navigate', 'worldbook')">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z" />
              </svg>
              <span>世界書</span>
            </button>
            <button class="dropdown-item" @click="emit('navigate', 'peek-phone')">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
              </svg>
              <span>頭盔TA</span>
            </button>
            <button class="dropdown-item" @click="emit('navigate', 'settings')">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
              </svg>
              <span>設置</span>
            </button>
            <div class="dropdown-divider"></div>
            <button class="dropdown-item" @click.stop="emit('open-search-bar')">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
              <span>搜索訊息</span>
            </button>
            <button class="dropdown-item" @click.stop="emit('open-chat-info')">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z" />
              </svg>
              <span>聊天資訊</span>
            </button>
            <button class="dropdown-item" @click.stop="emit('open-chat-files-panel')">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
              </svg>
              <span>聊天檔案</span>
            </button>
            <button class="dropdown-item" @click.stop="emit('export-current-chat')">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
              </svg>
              <span>導出聊天</span>
            </button>
            <button class="dropdown-item" @click.stop="emit('trigger-jsonl-import')">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM6 20V4h5v7h7v9H6z" />
              </svg>
              <span>匯入 JSONL 對話</span>
            </button>
            <button class="dropdown-item" @click.stop="emit('start-new-conversation')">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
              </svg>
              <span>開啟新對話</span>
            </button>
            <button v-if="!isGroupChat" class="dropdown-item" :class="{ danger: !isCharBlocked }" @click.stop="emit('toggle-block-character')">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path v-if="isCharBlocked" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z" />
                <path v-else d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
              <span>{{ isCharBlocked ? '解除封鎖' : '封鎖角色' }}</span>
            </button>
            <div class="dropdown-divider"></div>
            <button class="dropdown-item danger" @click.stop="emit('clear-chat-history')">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
              </svg>
              <span>清空聊天記錄</span>
            </button>
          </div>
        </Transition>
      </div>
    </div>
  </header>
</template>

<style lang="scss" scoped>
.chat-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  padding-top: calc(12px + var(--safe-top));
  padding-left: calc(16px + var(--safe-left));
  padding-right: calc(16px + var(--safe-right));
  background: color-mix(in srgb, var(--color-surface) 50%, transparent);
  border-bottom: none;
  gap: 12px;
  flex-shrink: 0;
  overflow: visible;
  position: relative;
  z-index: 10;
  @supports not (background: color-mix(in srgb, white 50%, transparent)) {
    background: rgba(255, 255, 255, 0.5);
  }
}

.header-back {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  background: var(--color-background);
  color: var(--color-text);
  cursor: pointer;
  border: none;
  transition: all var(--transition-fast);

  svg {
    width: 24px;
    height: 24px;
  }

  &:hover {
    background: var(--color-surface-hover);
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }
}

.char-avatar-wrap {
  position: relative;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
}

.char-avatar-heart {
  position: absolute;
  bottom: -3px;
  right: -3px;
  width: 14px;
  height: 14px;
  color: #f472b6;
  pointer-events: none;
  filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.4));
}

.char-avatar {
  width: 44px;
  height: 44px;
  border-radius: var(--avatar-border-radius, 50%);
  overflow: hidden;
  background: var(--color-background);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    transform: scale(1.05);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  &:active {
    transform: scale(0.95);
  }

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
      width: 28px;
      height: 28px;
    }
  }
}

.chat-info {
  flex: 1;
  min-width: 0;
}

.chat-name-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.nickname-edit-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary, #999);
  cursor: pointer;
  border-radius: 4px;
  padding: 0;
  opacity: 0.5;
  transition: opacity 0.2s, background 0.2s;

  svg {
    width: 14px;
    height: 14px;
  }

  &:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.1);
  }
}

.nickname-edit-popup {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.nickname-edit-input {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid var(--color-primary, #7dd3a8);
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  background: var(--color-surface, #fff);
  color: var(--color-text, #333);
  outline: none;

  &:focus {
    border-color: var(--color-primary, #7dd3a8);
    box-shadow: 0 0 0 2px rgba(125, 211, 168, 0.2);
  }
}

.nickname-save-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  background: var(--color-primary, #7dd3a8);
  color: white;
  border-radius: 6px;
  cursor: pointer;
  padding: 0;

  svg {
    width: 16px;
    height: 16px;
  }
}

.chat-name {
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-status {
  font-size: 12px;
  color: var(--color-primary);
  margin: 2px 0 0;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.rail-toggle-btn {
  display: none;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  background: var(--color-background);
  color: var(--color-text-secondary);
  cursor: pointer;
  border: none;
  flex-shrink: 0;
  transition: all var(--transition-fast);

  svg {
    width: 20px;
    height: 20px;
    transition: transform 0.2s ease;
  }

  &:hover {
    background: var(--color-primary-light);
    color: var(--color-primary);
  }

  &:active {
    transform: scale(0.95);
  }

  &.active {
    background: var(--color-primary-light);
    color: var(--color-primary);
  }
}

.header-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  background: var(--color-background);
  color: var(--color-text-secondary);
  cursor: pointer;
  border: none;
  transition: all var(--transition-fast);

  svg {
    width: 22px;
    height: 22px;
  }

  &:hover {
    background: var(--color-primary-light);
    color: var(--color-primary);
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }

  &.active {
    background: var(--color-primary-light);
    color: var(--color-primary);
  }
}

.more-dropdown,
.game-dropdown,
.persona-dropdown,
.chat-settings-dropdown {
  position: relative;
}

.game-menu {
  min-width: 160px;
}

.persona-btn.header-btn {
  overflow: hidden;
}

.persona-avatar-mini {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.persona-selector {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  min-width: 220px;
  max-width: min(280px, calc(100vw - 40px));
  z-index: 500;
}

.persona-selector-header {
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-muted);
  border-bottom: 1px solid var(--color-border);
}

.persona-list {
  max-height: 300px;
  overflow-y: auto;
}

.persona-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background var(--transition-fast);
  text-align: left;

  &:hover {
    background: var(--color-background);
  }

  &.active {
    background: var(--color-primary-light);
  }
}

.persona-item-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--color-background);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  svg {
    width: 20px;
    height: 20px;
    color: var(--color-text-muted);
  }
}

.persona-item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.persona-item-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.persona-item-desc {
  font-size: 12px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.check-icon {
  width: 18px;
  height: 18px;
  color: var(--color-primary);
  flex-shrink: 0;
}

.persona-selector-footer {
  padding: 8px 12px;
  border-top: 1px solid var(--color-border);
}

.edit-persona-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 10px 12px;
  background: var(--color-background);
  border: none;
  border-radius: var(--radius-lg);
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);

  svg {
    width: 16px;
    height: 16px;
  }

  &:hover {
    background: var(--color-primary-light);
    color: var(--color-primary);
  }
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  overflow-y: auto;
  overflow-x: hidden;
  min-width: 180px;
  max-height: calc(100dvh - 120px);
  max-height: calc(100svh - 120px);
  z-index: 500;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 2px;
  }
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 18px;
  background: transparent;
  border: none;
  font-size: 15px;
  color: var(--color-text);
  cursor: pointer;
  transition: background var(--transition-fast);

  svg {
    width: 20px;
    height: 20px;
    color: var(--color-text-secondary);
    flex-shrink: 0;
  }

  &:hover {
    background: var(--color-background);
  }

  &.danger {
    color: var(--color-error);

    &:hover {
      background: rgba(255, 123, 123, 0.1);
    }
  }
}

.dropdown-divider {
  height: 1px;
  background: var(--color-border);
  margin: 4px 0;
}

.dropdown-section-title {
  padding: 10px 18px 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.chat-settings-menu {
  min-width: 220px;
}

.dropdown-clear-btn {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.2));
  background: transparent;
  color: var(--color-text-secondary, rgba(255, 255, 255, 0.6));
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
}


.dropdown-toggle-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 12px 18px;
  background: transparent;
  transition: background var(--transition-fast);

  &:hover {
    background: var(--color-background);
  }
}

.toggle-item-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;

  svg {
    width: 20px;
    height: 20px;
    color: var(--color-text-secondary);
    flex-shrink: 0;
  }

  span {
    font-size: 14px;
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.toggle-switch-mini {
  position: relative;
  width: 40px;
  height: 22px;
  flex-shrink: 0;

  input {
    opacity: 0;
    width: 0;
    height: 0;

    &:checked + .toggle-slider-mini {
      background: var(--color-primary);

      &::before {
        transform: translateX(18px);
      }
    }
  }
}

.toggle-slider-mini {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--color-border);
  border-radius: 11px;
  transition: 0.3s;

  &::before {
    content: "";
    position: absolute;
    height: 18px;
    width: 18px;
    left: 2px;
    bottom: 2px;
    background: white;
    border-radius: 50%;
    transition: 0.3s;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }
}

.fake-time-panel {
  padding: 8px 18px 12px;
  border-top: 1px solid var(--color-border);
}

.fake-time-mode-selector {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}

.fake-time-mode-btn {
  flex: 1;
  padding: 5px 0;
  font-size: 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s;

  &.active {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }
}

.fake-time-config {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fake-time-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--color-text-secondary);
  gap: 8px;
}

.fake-time-input {
  flex: 1;
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background);
  color: var(--color-text);
  max-width: 180px;
}

.fake-time-preview {
  margin-top: 8px;
  padding: 6px 10px;
  font-size: 11px;
  color: var(--color-primary);
  background: var(--color-primary-light, rgba(var(--color-primary-rgb, 99, 102, 241), 0.1));
  border-radius: 6px;
  text-align: center;
}

.fake-time-jump {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  align-items: center;
}

.fake-time-jump-btn {
  padding: 4px 10px;
  font-size: 12px;
  border: none;
  border-radius: 6px;
  background: var(--color-primary);
  color: white;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;

  &:active {
    opacity: 0.8;
  }
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 600px) {
  .rail-toggle-btn {
    display: flex;
  }

  .header-actions {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 100;
    flex-wrap: wrap;
    gap: 6px;
    padding: 10px 16px 12px;
    padding-left: calc(16px + var(--safe-left));
    padding-right: calc(16px + var(--safe-right));
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    justify-content: center;
    animation: rail-slide-in 0.2s ease-out;

    &.rail-open {
      display: flex;
    }
  }

  .header-actions.rail-open {
    overflow: visible;

    .dropdown-menu {
      position: fixed;
      top: auto;
      right: 8px;
      left: 8px;
      width: auto;
      max-width: calc(100vw - 16px);
    }

    .persona-selector {
      position: fixed;
      top: auto;
      left: 50%;
      right: auto;
      transform: translateX(-50%);
      width: auto;
      min-width: 220px;
      max-width: min(280px, calc(100vw - 32px));
      z-index: 1000;
    }

    .persona-dropdown,
    .game-dropdown,
    .more-dropdown,
    .chat-settings-dropdown {
      position: static;
    }
  }
}

@media (min-width: 768px) and (max-width: 1024px) {
  .chat-header {
    padding: 14px 24px;
    padding-left: calc(24px + var(--safe-left));
    padding-right: calc(24px + var(--safe-right));
  }
}

@keyframes rail-slide-in {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
