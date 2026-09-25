<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  AudioLines,
  BellOff,
  CalendarClock,
  Check,
  Clock,
  Dices,
  Drama,
  Fish,
  Flower2,
  ImagePlus,
  Moon,
  Pencil,
  PhoneIncoming,
  ScanSearch,
  Settings,
  Tag,
  User,
  UserRound,
  Users,
  Utensils,
} from "lucide-vue-next";
import { useThemeStore } from "@/stores/theme";
import { isCssColorDark } from "@/utils/wallpaperLuminance";

interface PersonaOption {
  id: string;
  name: string;
  avatar?: string;
  description?: string;
}

const props = defineProps<{
  /** 貼齊螢幕邊緣（聊天外觀設定） */
  docked?: boolean;
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
  chatCharNarrativePerson: "first" | "third";
  chatUserNarrativePerson: "first" | "second" | "third";
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
  (e: "set-char-narrative-person", value: "first" | "third"): void;
  (e: "set-user-narrative-person", value: "first" | "second" | "third"): void;
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
  (e: "open-chat-details"): void;
  (e: "navigate", page: "character" | "worldbook" | "settings" | "peek-phone"): void;
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

const themeStore = useThemeStore();

// 偵測 chat-screen 實際渲染的桌布是否為深色（包含每個聊天的自訂桌布）
const headerEl = ref<HTMLElement | null>(null);
const detectedDark = ref<boolean | null>(null);
const hasCustomChatWallpaper = ref(false);

function detectChatBackgroundDark() {
  const el = headerEl.value?.closest(".chat-screen") as HTMLElement | null;
  if (!el) {
    detectedDark.value = null;
    hasCustomChatWallpaper.value = false;
    return;
  }
  const cs = getComputedStyle(el);
  hasCustomChatWallpaper.value = Boolean(cs.getPropertyValue("--chat-wallpaper").trim());
  const candidates = [
    cs.getPropertyValue("--chat-wallpaper"),
    cs.getPropertyValue("--wallpaper-value"),
    cs.getPropertyValue("--time-theme-bg"),
    cs.getPropertyValue("--color-background"),
  ];
  for (const raw of candidates) {
    const v = (raw || "").trim();
    if (!v || v.startsWith("var(") || v.startsWith("url(")) continue;
    const result = isCssColorDark(v);
    if (result !== null) {
      detectedDark.value = result;
      return;
    }
  }
  detectedDark.value = null;
}

let observer: MutationObserver | null = null;

// ===== 下拉選單：Esc 關閉並把焦點還給觸發按鈕 =====
const personaBtnRef = ref<HTMLButtonElement | null>(null);
const gameBtnRef = ref<HTMLButtonElement | null>(null);
const chatSettingsBtnRef = ref<HTMLButtonElement | null>(null);

function onMenuKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  if (props.showPersonaSelector) {
    emit("toggle-persona-selector");
    personaBtnRef.value?.focus();
  } else if (props.showGameMenu) {
    emit("toggle-game-menu");
    gameBtnRef.value?.focus();
  } else if (props.showChatSettingsMenu) {
    emit("toggle-chat-settings-menu");
    chatSettingsBtnRef.value?.focus();
  } else {
    return;
  }
  event.preventDefault();
}

onMounted(() => {
  document.addEventListener("keydown", onMenuKeydown);
  detectChatBackgroundDark();
  const el = headerEl.value?.closest(".chat-screen") as HTMLElement | null;
  if (el) {
    observer = new MutationObserver(() => detectChatBackgroundDark());
    observer.observe(el, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onMenuKeydown);
  observer?.disconnect();
  observer = null;
});

// 全局桌布/夜晚模式變化時也重新偵測
watch(
  () => [themeStore.isWallpaperDark, themeStore.wallpaperStyle],
  () => detectChatBackgroundDark(),
  { deep: true },
);

const isDarkBackground = computed(() =>
  detectedDark.value !== null
    ? detectedDark.value
    : hasCustomChatWallpaper.value
      ? false
      : themeStore.isWallpaperDark,
);
</script>

<template>
  <header ref="headerEl" class="chat-header" :class="{ 'dark-bg': isDarkBackground, docked }">
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
        <button
          ref="personaBtnRef"
          class="header-btn persona-btn"
          :class="{ active: showPersonaSelector }"
          title="切換使用者"
          aria-haspopup="menu"
          :aria-expanded="showPersonaSelector"
          @click.stop="emit('toggle-persona-selector')"
        >
          <div v-if="currentUserAvatar" class="persona-avatar-mini">
            <img :src="currentUserAvatar" :alt="currentUserName" />
          </div>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M5 20v-1a7 7 0 0 1 14 0v1" />
          </svg>
        </button>

        <Transition name="dropdown">
          <div v-if="showPersonaSelector" class="dropdown-menu persona-menu" role="menu">
            <div class="dropdown-section-title">選擇使用者</div>
            <div class="persona-list">
              <button
                v-for="persona in personas"
                :key="persona.id"
                class="persona-item"
                :class="{ active: persona.id === currentPersonaId }"
                role="menuitemradio"
                :aria-checked="persona.id === currentPersonaId"
                @click="emit('select-persona', persona.id)"
              >
                <div class="persona-item-avatar">
                  <img v-if="persona.avatar" :src="persona.avatar" :alt="persona.name" />
                  <UserRound v-else :size="20" :stroke-width="1.75" />
                </div>
                <div class="persona-item-info">
                  <span class="persona-item-name">{{ persona.name }}</span>
                  <span v-if="persona.description" class="persona-item-desc">
                    {{ persona.description.substring(0, 30) }}{{ persona.description.length > 30 ? '...' : '' }}
                  </span>
                </div>
                <Check v-if="persona.id === currentPersonaId" class="check-icon" :size="18" :stroke-width="2.2" />
              </button>
            </div>
            <div class="dropdown-divider"></div>
            <button class="dropdown-item" role="menuitem" @click="emit('open-persona-edit')">
              <Pencil :size="20" :stroke-width="1.75" />
              <span>編輯使用者設定</span>
            </button>
          </div>
        </Transition>
      </div>

      <div class="game-dropdown" @click.stop>
        <button
          ref="gameBtnRef"
          class="header-btn"
          :class="{ active: showGameMenu }"
          title="小遊戲"
          aria-haspopup="menu"
          :aria-expanded="showGameMenu"
          @click.stop="emit('toggle-game-menu')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <line x1="6" y1="12" x2="10" y2="12" />
            <line x1="8" y1="10" x2="8" y2="14" />
            <circle cx="15" cy="13" r="0.6" fill="currentColor" stroke="none" />
            <circle cx="18" cy="11" r="0.6" fill="currentColor" stroke="none" />
            <path d="M17.32 6H6.68A4 4 0 0 0 2.7 9.59C2.6 10.45 2 14.5 2 16a3 3 0 0 0 5.12 2.12L8.5 16.7a2 2 0 0 1 1.41-.59h4.18a2 2 0 0 1 1.41.59l1.38 1.42A3 3 0 0 0 22 16c0-1.5-.6-5.55-.7-6.41A4 4 0 0 0 17.32 6z" />
          </svg>
        </button>

        <Transition name="dropdown">
          <div v-if="showGameMenu" class="dropdown-menu game-menu" role="menu">
            <div class="dropdown-section-title">小遊戲</div>
            <button class="dropdown-item" @click="emit('open-game', 'dishwashing')">
              <Utensils :size="20" :stroke-width="1.75" />
              <span>刷盤子</span>
            </button>
            <button class="dropdown-item" @click="emit('open-game', 'fishing')">
              <Fish :size="20" :stroke-width="1.75" />
              <span>釣魚</span>
            </button>
            <button class="dropdown-item" @click="emit('open-game', 'gambling')">
              <Dices :size="20" :stroke-width="1.75" />
              <span>猜大小</span>
            </button>
            <button class="dropdown-item" @click="emit('open-game', 'merit')">
              <Flower2 :size="20" :stroke-width="1.75" />
              <span>修行</span>
            </button>
          </div>
        </Transition>
      </div>

      <button class="header-btn" title="外觀設定" @click.stop="emit('open-settings')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="13.5" cy="6.5" r="2.5" />
          <circle cx="17.5" cy="13.5" r="2.5" />
          <circle cx="8.5" cy="13.5" r="2.5" />
          <path d="M13.5 9v2" />
          <path d="M17.5 11v2" />
          <path d="M8.5 11v2" />
          <path d="M13.5 4V2" />
          <path d="M6 6.5H2" />
          <path d="M22 13.5h-2" />
          <path d="M4 13.5H2" />
          <path d="M22 6.5h-2" />
        </svg>
      </button>

      <div class="chat-settings-dropdown" @click.stop>
        <button
          ref="chatSettingsBtnRef"
          class="header-btn"
          :class="{ active: showChatSettingsMenu }"
          title="聊天設定"
          aria-haspopup="menu"
          :aria-expanded="showChatSettingsMenu"
          @click.stop="emit('toggle-chat-settings-menu')"
        >
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
                <Users :size="20" :stroke-width="1.75" />
                <span>面對面模式</span>
              </div>
              <label class="toggle-switch-mini">
                <input type="checkbox" aria-label="面對面模式" :checked="chatFaceToFaceMode" @change="emit('toggle-face-to-face-mode')" />
                <span class="toggle-slider-mini"></span>
              </label>
            </div>
            <div v-if="chatFaceToFaceMode" class="narrative-person-panel">
              <div class="narrative-person-row">
                <div class="toggle-item-info narrative-person-label">
                  <Drama :size="20" :stroke-width="1.75" />
                  <span>角色人稱</span>
                </div>
                <div class="fake-time-mode-selector narrative-person-selector">
                  <button :class="['fake-time-mode-btn', { active: chatCharNarrativePerson === 'third' }]" @click="emit('set-char-narrative-person', 'third')">第三人稱</button>
                  <button :class="['fake-time-mode-btn', { active: chatCharNarrativePerson === 'first' }]" @click="emit('set-char-narrative-person', 'first')">我</button>
                </div>
              </div>
              <div class="narrative-person-row">
                <div class="toggle-item-info narrative-person-label">
                  <User :size="20" :stroke-width="1.75" />
                  <span>用戶人稱</span>
                </div>
                <div class="fake-time-mode-selector narrative-person-selector">
                  <button :class="['fake-time-mode-btn', { active: chatUserNarrativePerson === 'third' }]" @click="emit('set-user-narrative-person', 'third')">第三人稱</button>
                  <button :class="['fake-time-mode-btn', { active: chatUserNarrativePerson === 'second' }]" @click="emit('set-user-narrative-person', 'second')">你</button>
                  <button v-if="chatCharNarrativePerson !== 'first'" :class="['fake-time-mode-btn', { active: chatUserNarrativePerson === 'first' }]" @click="emit('set-user-narrative-person', 'first')">我</button>
                </div>
              </div>
            </div>
            <div class="dropdown-toggle-item">
              <div class="toggle-item-info">
                <Moon :size="20" :stroke-width="1.75" />
                <span>夜晚模式</span>
              </div>
              <label class="toggle-switch-mini">
                <input type="checkbox" aria-label="夜晚模式" :checked="nightMode" @change="emit('toggle-night-mode')" />
                <span class="toggle-slider-mini"></span>
              </label>
            </div>
            <div class="dropdown-toggle-item">
              <div class="toggle-item-info">
                <Clock :size="20" :stroke-width="1.75" />
                <span>感知現實時間</span>
              </div>
              <label class="toggle-switch-mini">
                <input type="checkbox" aria-label="感知現實時間" :checked="chatEnableRealTimeAwareness" @change="emit('toggle-real-time-awareness')" />
                <span class="toggle-slider-mini"></span>
              </label>
            </div>
            <div v-if="chatEnableRealTimeAwareness" class="dropdown-toggle-item" style="cursor: pointer" @click="emit('toggle-fake-time-panel')">
              <div class="toggle-item-info">
                <CalendarClock :size="20" :stroke-width="1.75" />
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
                <BellOff :size="20" :stroke-width="1.75" />
                <span>勿擾模式</span>
              </div>
              <label class="toggle-switch-mini">
                <input type="checkbox" aria-label="勿擾模式" :checked="chatDoNotDisturb" @change="emit('toggle-chat-do-not-disturb')" />
                <span class="toggle-slider-mini"></span>
              </label>
            </div>
            <div class="dropdown-toggle-item">
              <div class="toggle-item-info">
                <PhoneIncoming :size="20" :stroke-width="1.75" />
                <span>角色決定接電話</span>
              </div>
              <label class="toggle-switch-mini">
                <input type="checkbox" aria-label="角色決定接電話" :checked="enablePhoneDecision" @change="emit('toggle-phone-decision')" />
                <span class="toggle-slider-mini"></span>
              </label>
            </div>
            <div class="dropdown-divider"></div>
            <div class="dropdown-section-title">AI 繪圖</div>
            <div class="dropdown-toggle-item">
              <div class="toggle-item-info">
                <ImagePlus :size="20" :stroke-width="1.75" />
                <span>啟用文生圖</span>
              </div>
              <label class="toggle-switch-mini">
                <input type="checkbox" aria-label="啟用文生圖" :checked="novelAIEnabled" @change="emit('toggle-novel-ai-image')" />
                <span class="toggle-slider-mini"></span>
              </label>
            </div>
            <div class="dropdown-toggle-item">
              <div class="toggle-item-info">
                <Tag :size="20" :stroke-width="1.75" />
                <span>使用 User Tag</span>
              </div>
              <label class="toggle-switch-mini">
                <input type="checkbox" aria-label="使用 User Tag" :checked="novelAIUseUserTag" @change="emit('toggle-novel-ai-use-user-tag')" />
                <span class="toggle-slider-mini"></span>
              </label>
            </div>
            <div class="dropdown-toggle-item">
              <div class="toggle-item-info">
                <ScanSearch :size="20" :stroke-width="1.75" />
                <span>使用搜圖</span>
              </div>
              <label class="toggle-switch-mini">
                <input type="checkbox" aria-label="使用搜圖" :checked="chatImageSearchEnabled" @change="emit('toggle-chat-image-search')" />
                <span class="toggle-slider-mini"></span>
              </label>
            </div>
            <button class="dropdown-item" @click="emit('open-novel-ai-settings')">
              <Settings :size="20" :stroke-width="1.75" />
              <span>文生圖設定</span>
            </button>
            <div class="dropdown-divider"></div>
            <div class="dropdown-section-title">AI 語音</div>
            <div class="dropdown-toggle-item">
              <div class="toggle-item-info">
                <AudioLines :size="20" :stroke-width="1.75" />
                <span>MiniMax 語音合成</span>
              </div>
              <label class="toggle-switch-mini">
                <input type="checkbox" aria-label="MiniMax 語音合成" :checked="chatMinimaxTTSEnabled" @change="emit('toggle-minimax-tts')" />
                <span class="toggle-slider-mini"></span>
              </label>
            </div>
            <button class="dropdown-item" @click="emit('open-minimax-tts-settings')">
              <Settings :size="20" :stroke-width="1.75" />
              <span>語音設定</span>
            </button>
          </div>
        </Transition>
      </div>

      <button class="header-btn" title="聊天詳情" @click.stop="emit('open-chat-details')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      </button>
    </div>
  </header>
</template>

<style lang="scss" scoped>
.chat-header {
  // 半透明色票（如 pearl 主題的 surface 只有 12% alpha）疊在不透明底色上，
  // 才能避免聊天內容透出面板。底層用主題的不透明 --color-background 當隔離層。
  --chat-header-panel-bg:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--chat-header-surface, var(--color-surface)) 94%, transparent) 0%,
      color-mix(in srgb, var(--chat-header-surface, var(--color-surface)) 78%, transparent) 100%
    ),
    var(--color-background, #1a1a2e);
  display: flex;
  align-items: center;
  min-width: 0;
  margin: 10px 12px;
  margin-top: max(10px, calc(var(--safe-top, 0px) + 4px));
  margin-left: max(12px, var(--safe-left));
  margin-right: max(12px, var(--safe-right));
  padding: 8px 12px !important;
  box-sizing: border-box;
  border-radius: 20px;
  // --chat-header-bg / --chat-header-backdrop 來自聊天外觀設定（不透明度、毛玻璃）
  background: var(--chat-header-bg, var(--chat-header-panel-bg));
  backdrop-filter: var(--chat-header-backdrop, blur(30px) saturate(180%));
  -webkit-backdrop-filter: var(--chat-header-backdrop, blur(30px) saturate(180%));
  border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
  box-shadow:
    0 12px 34px rgba(0, 0, 0, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.45);
  gap: 10px;
  flex-shrink: 0;
  overflow: visible;
  position: relative;
  z-index: 20;

  &:has(.rail-open) {
    z-index: 120;
  }

  // 貼齊螢幕邊緣：取消外距與圓角，安全區改由內距讓出
  &.docked {
    margin: 0;
    padding-top: calc(8px + var(--safe-top, 0px)) !important;
    padding-left: calc(12px + var(--safe-left, 0px)) !important;
    padding-right: calc(12px + var(--safe-right, 0px)) !important;
    border-radius: 0;
    border-width: 0 0 1px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  }

  // 深色背景：將標題與按鈕色調切換為亮色，提高對比
  &.dark-bg {
    --chat-header-panel-bg: linear-gradient(
      135deg,
      color-mix(in srgb, var(--chat-header-surface, rgba(255, 255, 255, 0.3)) 92%, transparent) 0%,
      color-mix(in srgb, var(--chat-header-surface, rgba(255, 255, 255, 0.18)) 76%, transparent) 100%
    );
    background: var(--chat-header-bg-dark, var(--chat-header-panel-bg));
    border-color: rgba(255, 255, 255, 0.36);
    box-shadow:
      0 12px 34px rgba(0, 0, 0, 0.34),
      inset 0 1px 0 rgba(255, 255, 255, 0.28);

    .chat-name {
      color: var(--chat-header-text, #ffffff);
    }

    .chat-status {
      color: var(--chat-header-text-secondary, rgba(255, 255, 255, 0.85));
    }

    .header-back,
    .header-btn,
    .rail-toggle-btn {
      color: var(--chat-header-text, #ffffff);
      border-color: rgba(255, 255, 255, 0.32);

      svg {
        color: currentColor;
        stroke: currentColor;
      }

      &:hover {
        background: rgba(255, 255, 255, 0.16);
        border-color: rgba(255, 255, 255, 0.5);
        color: var(--chat-header-text, #ffffff);
      }

      &:active {
        background: rgba(255, 255, 255, 0.22);
      }

      &.active {
        background: rgba(255, 255, 255, 0.22);
        border-color: rgba(255, 255, 255, 0.55);
        color: var(--chat-header-text, #ffffff);
      }
    }

    .nickname-edit-btn {
      color: var(--chat-header-text-secondary, rgba(255, 255, 255, 0.75));

      &:hover {
        color: var(--chat-header-text, #ffffff);
        background: rgba(255, 255, 255, 0.16);
      }
    }
  }
}

.header-back {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: transparent;
  color: var(--chat-header-text, var(--color-text));
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
  // 自定義邊框：透過 useChatAppearance 注入；未啟用時 fallback 為 0/transparent，回到既有的 box-shadow 描邊外觀
  border: var(--avatar-border-width, 0) solid
    var(--avatar-border-color, transparent);
  box-shadow: var(
    --avatar-shadow,
    0 0 0 1px color-mix(in srgb, var(--color-border) 70%, transparent),
    0 1px 3px rgba(0, 0, 0, 0.05)
  );

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
  background: var(--chat-header-surface, var(--color-surface, #fff));
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
  min-width: 0;
  max-width: 100%;
  font-size: 16px;
  font-weight: 600;
  color: var(--chat-header-text, var(--color-text));
  margin: 0;
  line-height: 1.2;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-status {
  font-size: 11px;
  // 對齊 ThemeSettingsModal 預覽卡 ✎ 圖示綁定的 textSecondary
  color: var(--chat-header-text-secondary, var(--color-text-secondary));
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
  min-width: 0;
  flex-shrink: 0;
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
  color: var(--chat-header-text-secondary, var(--color-text-secondary));
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
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: transparent;
  color: var(--chat-header-text-secondary, var(--color-text-secondary));
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

// 鍵盤操作時的焦點外框改用主題色；滑鼠點擊不顯示瀏覽器預設黑框
.header-back,
.header-btn,
.rail-toggle-btn,
.dropdown-item,
.persona-item,
.fake-time-mode-btn,
.fake-time-jump-btn {
  &:focus {
    outline: none;
  }

  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
}

.dropdown-item:focus-visible,
.persona-item:focus-visible {
  outline-offset: -2px;
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

// 外框、位置、動畫沿用共用的 .dropdown-menu，這裡只定義使用者清單本身
.persona-menu {
  width: 260px;
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
  padding: 10px 18px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background var(--transition-fast);
  text-align: left;

  &:hover {
    background: var(--color-background);
  }

  // 與其他選單一致：淡底 + 打勾，不用整塊主色，避免說明文字看不清
  &.active {
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);

    .persona-item-name {
      font-weight: 600;
      color: var(--color-primary);
    }
  }
}

.persona-item-avatar {
  width: 32px;
  height: 32px;
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

.dropdown-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  // 半透明色票疊在不透明底色上，避免聊天內容透出下拉選單。
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--chat-header-surface, var(--color-surface)) 94%, transparent) 0%,
      color-mix(in srgb, var(--chat-header-surface, var(--color-surface)) 82%, transparent) 100%
    ),
    var(--color-background, #1a1a2e);
  backdrop-filter: blur(30px) saturate(180%);
  -webkit-backdrop-filter: blur(30px) saturate(180%);
  border: 1px solid color-mix(in srgb, var(--color-border) 68%, transparent);
  border-radius: var(--radius-xl);
  box-shadow:
    0 18px 42px rgba(0, 0, 0, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.42);
  overflow-y: auto;
  overflow-x: hidden;
  min-width: 180px;
  max-width: min(320px, calc(100vw - 32px));
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
  min-width: 0;
  gap: 12px;
  width: 100%;
  padding: 12px 18px;
  background: transparent;
  border: none;
  font-size: 14px;
  text-align: left;
  color: var(--color-text);
  cursor: pointer;
  transition: background var(--transition-fast);

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

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
      background: color-mix(in srgb, var(--color-error) 12%, transparent);
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
  min-width: 0;
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

  // 隱藏原生 checkbox 但保留可聚焦；Tab 到開關時在滑軌上顯示焦點外框
  input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
    margin: 0;

    &:focus-visible + .toggle-slider-mini {
      outline: 2px solid var(--color-primary);
      outline-offset: 2px;
    }

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

.narrative-person-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 18px;
}

.narrative-person-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.narrative-person-label {
  flex: 0 0 auto;
}

.narrative-person-selector {
  flex: 1;
  min-width: 132px;
  margin-bottom: 0;
}

.fake-time-mode-selector {
  display: flex;
  min-width: 0;
  gap: 4px;
  margin-bottom: 8px;
}

.fake-time-mode-btn {
  flex: 1;
  min-width: 0;
  padding: 5px 0;
  font-size: 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

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
  min-width: 0;
  font-size: 12px;
  color: var(--color-text-secondary);
  gap: 8px;
}

.fake-time-input {
  flex: 1;
  min-width: 0;
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
  overflow-wrap: anywhere;
}

.fake-time-jump {
  display: flex;
  min-width: 0;
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
    z-index: 120;
    flex-wrap: wrap;
    gap: 6px;
    padding: 10px 12px;
    border-radius: 20px;
    /* 加強毛玻璃：提高背景不透明度（85%/40% → 96%/82%）並增強模糊與飽和 */
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--chat-header-surface, var(--color-surface)) 96%, transparent) 0%,
      color-mix(in srgb, var(--chat-header-surface, var(--color-surface)) 82%, transparent) 100%
    );
    backdrop-filter: blur(28px) saturate(180%);
    -webkit-backdrop-filter: blur(28px) saturate(180%);
    border: 1px solid color-mix(in srgb, var(--color-border) 60%, transparent);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
    justify-content: center;
    animation: rail-slide-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);

    &.rail-open {
      display: flex;
    }
  }

  /* 深色背景下的 rail：保持白色玻璃感的同時更實在 */
  .chat-header.dark-bg .header-actions {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--chat-header-surface, rgba(20, 22, 36, 0.85)) 96%, transparent) 0%,
      color-mix(in srgb, var(--chat-header-surface, rgba(20, 22, 36, 0.7)) 82%, transparent) 100%
    );
    border-color: rgba(255, 255, 255, 0.28);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
  }

  .header-actions.rail-open {
    overflow: visible;
    z-index: 120;

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
      z-index: 130;
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
    margin-top: max(14px, calc(var(--safe-top, 0px) + 4px));
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
