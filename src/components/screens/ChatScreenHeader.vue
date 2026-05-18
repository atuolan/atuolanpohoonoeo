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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 12H5" />
        <path d="M12 19l-7-7 7-7" />
      </svg>
    </button>

    <div class="char-avatar-wrap">
      <div class="char-avatar" title="AI 記憶管理" @click.stop="emit('open-ai-summary')">
        <img v-if="displayAvatar" :src="displayAvatar" :alt="characterName" />
        <div v-else-if="isGroupChat" class="avatar-placeholder group-avatar">
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
            <path d="M4 20v-1a7 7 0 0 1 14 0v1" transform="translate(1 0)" />
          </svg>
        </div>
      </div>
      <svg v-if="hasMemoryBadge" class="char-avatar-heart" viewBox="0 0 24 24" fill="currentColor" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 20.5l-1.3-1.18C5.9 14.96 3 12.16 3 8.75 3 5.96 5.18 3.8 7.95 3.8c1.58 0 3.1.74 4.05 1.9.95-1.16 2.47-1.9 4.05-1.9 2.77 0 4.95 2.16 4.95 4.95 0 3.41-2.9 6.21-7.7 10.57L12 20.5z" />
      </svg>
    </div>

    <div class="chat-info">
      <div class="chat-name-row">
        <h1 class="chat-name">{{ isGroupChat ? groupDisplayName : displayCharacterName }}</h1>
        <button v-if="!isGroupChat && currentCharacter" class="nickname-edit-btn" title="編輯暱稱" @click.stop="emit('start-nickname-edit')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </button>
      </div>
      <p v-if="isGroupChat && !isGenerating" class="chat-status">{{ groupMemberCount }} 位成員</p>
      <p v-else-if="isGenerating" class="chat-status">正在輸入...</p>
    </div>

    <button class="rail-toggle-btn" :class="{ active: showRail }" @click.stop="emit('toggle-rail')">
      <svg v-if="!showRail" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m6 9 6 6 6-6" />
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m18 15-6-6-6 6" />
      </svg>
    </button>

    <div class="header-actions" :class="{ 'rail-open': showRail }">
      <div class="persona-dropdown" @click.stop>
        <button class="header-btn persona-btn" title="切換使用者" @click.stop="emit('toggle-persona-selector')">
          <div v-if="currentUserAvatar" class="persona-avatar-mini">
            <img :src="currentUserAvatar" :alt="currentUserName" />
          </div>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M5 20v-1a7 7 0 0 1 14 0v1" />
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
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M5 20v-1a7 7 0 0 1 14 0v1" />
                  </svg>
                </div>
                <div class="persona-item-info">
                  <span class="persona-item-name">{{ persona.name }}</span>
                  <span v-if="persona.description" class="persona-item-desc">
                    {{ persona.description.substring(0, 30) }}{{ persona.description.length > 30 ? '...' : '' }}
                  </span>
                </div>
                <svg v-if="persona.id === currentPersonaId" class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </button>
            </div>
            <div class="persona-selector-footer">
              <button class="edit-persona-btn" @click="emit('open-persona-edit')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
                <span>編輯設定</span>
              </button>
            </div>
          </div>
        </Transition>
      </div>

      <div class="game-dropdown" @click.stop>
        <button class="header-btn" :class="{ active: showGameMenu }" title="小遊戲" @click.stop="emit('toggle-game-menu')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <line x1="6" y1="12" x2="10" y2="12" />
            <line x1="8" y1="10" x2="8" y2="14" />
            <circle cx="15" cy="13" r="0.6" fill="currentColor" stroke="none" />
            <circle cx="18" cy="11" r="0.6" fill="currentColor" stroke="none" />
            <path d="M17.32 6H6.68A4 4 0 0 0 2.7 9.59C2.6 10.45 2 14.5 2 16a3 3 0 0 0 5.12 2.12L8.5 16.7a2 2 0 0 1 1.41-.59h4.18a2 2 0 0 1 1.41.59l1.38 1.42A3 3 0 0 0 22 16c0-1.5-.6-5.55-.7-6.41A4 4 0 0 0 17.32 6z" />
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
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      <button v-if="!isGroupChat && currentCharacter" class="header-btn" title="主動發訊息設置" @click.stop="emit('open-proactive-message-settings')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      </button>

      <div class="chat-settings-dropdown" @click.stop>
        <button class="header-btn" :class="{ active: showChatSettingsMenu }" title="聊天設定" @click.stop="emit('toggle-chat-settings-menu')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <line x1="4" y1="6" x2="10" y2="6" />
            <line x1="14" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="14" y2="12" />
            <line x1="18" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="8" y2="18" />
            <line x1="12" y1="18" x2="20" y2="18" />
            <circle cx="12" cy="6" r="2" />
            <circle cx="16" cy="12" r="2" />
            <circle cx="10" cy="18" r="2" />
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" />
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
  margin: 10px 12px;
  // 不疊加 safe-top：在有瀏海/動態島時讓 pill 緊貼狀態列下方（用 max 取較大值）
  margin-top: clamp(10px, calc(var(--safe-top, 0px) * 0.5), 24px);
  margin-left: max(12px, var(--safe-left));
  margin-right: max(12px, var(--safe-right));
  padding: 8px 12px !important;
  box-sizing: border-box;
  border-radius: 20px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--color-surface) 85%, transparent) 0%,
    color-mix(in srgb, var(--color-surface) 40%, transparent) 100%
  );
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  border: 1px solid color-mix(in srgb, var(--color-border) 45%, transparent);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
  gap: 10px;
  flex-shrink: 0;
  overflow: visible;
  position: relative;
  z-index: 10;
}

.header-back {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
  transition: all var(--transition-fast);

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover {
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
    border-color: color-mix(in srgb, var(--color-primary) 35%, transparent);
    color: var(--color-primary);
    transform: scale(1.05);
  }

  &:active {
    background: color-mix(in srgb, var(--color-primary) 16%, transparent);
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
  bottom: -2px;
  right: -2px;
  width: 14px;
  height: 14px;
  color: color-mix(in srgb, var(--color-primary) 75%, #ec4899);
  pointer-events: none;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.18));
}

.char-avatar {
  width: 44px;
  height: 44px;
  border-radius: var(--avatar-border-radius, 50%);
  overflow: hidden;
  background: var(--color-background);
  cursor: pointer;
  transition: all var(--transition-fast);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--color-border) 70%, transparent),
    0 1px 3px rgba(0, 0, 0, 0.05);

  &:hover {
    transform: scale(1.05);
    box-shadow:
      0 0 0 1.5px color-mix(in srgb, var(--color-primary) 55%, transparent),
      0 4px 10px rgba(0, 0, 0, 0.12);
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
      width: 26px;
      height: 26px;
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
  align-self: center;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary, #999);
  cursor: pointer;
  border-radius: 6px;
  padding: 0;
  opacity: 0.65;
  transition: opacity 0.2s, background 0.2s, color 0.2s;

  svg {
    width: 13px;
    height: 13px;
  }

  &:hover {
    opacity: 1;
    color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 12%, transparent);
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
  padding: 5px 10px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 60%, transparent);
  border-radius: 10px;
  font-size: 13px;
  font-family: inherit;
  background: var(--color-surface, #fff);
  color: var(--color-text, #333);
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;

  &:focus {
    border-color: var(--color-primary, #7dd3a8);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 22%, transparent);
  }
}

.nickname-save-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: var(--color-primary, #7dd3a8);
  color: white;
  border-radius: 10px;
  cursor: pointer;
  padding: 0;
  transition: transform 0.15s, box-shadow 0.2s;
  box-shadow: 0 1px 4px color-mix(in srgb, var(--color-primary) 30%, transparent);

  svg {
    width: 16px;
    height: 16px;
  }

  &:hover {
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }
}

.chat-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
  line-height: 1.2;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-status {
  font-size: 11px;
  color: var(--color-primary);
  margin: 2px 0 0;
  min-height: 14px;
  line-height: 1.2;
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-info {
  // Reserve consistent vertical space so generating-status toggle does not jump header height
  min-height: 38px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.header-actions {
  display: flex;
  gap: 6px;
}

.rail-toggle-btn {
  display: none;
  width: 36px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
  flex-shrink: 0;
  transition: all var(--transition-fast);

  svg {
    width: 18px;
    height: 18px;
    transition: transform 0.2s ease;
  }

  &:hover {
    background: color-mix(in srgb, var(--color-primary) 12%, transparent);
    border-color: color-mix(in srgb, var(--color-primary) 35%, transparent);
    color: var(--color-primary);
  }

  &:active {
    transform: scale(0.96);
  }

  &.active {
    background: color-mix(in srgb, var(--color-primary) 14%, transparent);
    border-color: color-mix(in srgb, var(--color-primary) 40%, transparent);
    color: var(--color-primary);
  }
}

.header-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
  transition: all var(--transition-fast);

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover {
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
    border-color: color-mix(in srgb, var(--color-primary) 35%, transparent);
    color: var(--color-primary);
    transform: scale(1.05);
  }

  &:active {
    background: color-mix(in srgb, var(--color-primary) 16%, transparent);
    transform: scale(0.95);
  }

  &.active {
    background: color-mix(in srgb, var(--color-primary) 14%, transparent);
    border-color: color-mix(in srgb, var(--color-primary) 40%, transparent);
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
  width: 26px;
  height: 26px;
  border-radius: 50%;
  overflow: hidden;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-border) 60%, transparent);

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
  /* Use viewport height constraints but ensure it doesn't bleed out of the fixed app window */
  max-height: calc(100dvh - 160px);
  max-height: calc(100svh - 160px);
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
    top: calc(100% + 8px);
    left: 0;
    right: 0;
    z-index: 100;
    flex-wrap: wrap;
    gap: 6px;
    padding: 10px 12px;
    border-radius: 20px;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--color-surface) 90%, transparent) 0%,
      color-mix(in srgb, var(--color-surface) 60%, transparent) 100%
    );
    backdrop-filter: blur(16px) saturate(140%);
    -webkit-backdrop-filter: blur(16px) saturate(140%);
    border: 1px solid color-mix(in srgb, var(--color-border) 45%, transparent);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
    justify-content: center;
    animation: rail-slide-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);

    &.rail-open {
      display: flex;
    }
  }

  .header-actions.rail-open {
    overflow: visible;

    .dropdown-menu {
      position: absolute;
      top: calc(100% + 8px);
      bottom: auto;
      right: 0;
      left: 0;
      width: auto;
      max-width: none;
      /* In mobile, the dropdown is positioned under the floating header-actions */
      max-height: calc(100svh - 220px);
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
    margin: 14px 24px;
    margin-top: clamp(14px, calc(var(--safe-top, 0px) * 0.5), 28px);
    margin-left: calc(24px + var(--safe-left));
    margin-right: calc(24px + var(--safe-right));
    padding: 10px 16px !important;
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
