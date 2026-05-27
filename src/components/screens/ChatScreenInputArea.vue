<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import StickerPanel from "@/components/common/StickerPanel.vue";
import { formatTime as formatAudioTime } from "@/services/AudioRecorder";
import { useThemeStore } from "@/stores/theme";
import { isCssColorDark } from "@/utils/wallpaperLuminance";
interface ReplyTarget {
  role: "user" | "ai" | "system";
  content: string;
}

interface QuickAction {
  label: string;
  text: string;
  hint: string;
}

const props = defineProps<{
  // 封鎖相關
  isBlockedByChar: boolean;
  // 回覆相關
  replyingTo: ReplyTarget | null;
  characterName: string;
  // 面對面模式
  chatFaceToFaceMode: boolean;
  isInputFocused: boolean;
  quickActions: QuickAction[];
  // 輸入框
  inputText: string;
  // 按鈕狀態
  showMoreFeatures: boolean;
  showStickerPanel: boolean;
  isGenerating: boolean;
  hasAIMessages: boolean;
  canRecord: boolean;
  isRecording: boolean;
  recordingDuration: number;
  recordingVolumeLevel: number;
  isCancelMode: boolean;
  // 文字語音
  showTextVoiceModal: boolean;
  textVoiceInput: string;
  // 展開輸入框
  isInputExpanded: boolean;
  // 發言模式
  speakerMode: "user" | "char" | "system";
  showSpeakerModePopover: boolean;
  // 更多功能面板內的按鈕狀態 - 不需要，由 emit 處理
}>();

const emit = defineEmits<{
  (e: "showFriendRequestInput"): void;
  (e: "cancelReply"): void;
  (e: "handleQuickInputWheel", event: WheelEvent): void;
  (e: "insertQuickAction", text: string): void;
  (e: "openQuickActionEditor"): void;
  (e: "toggleMoreFeatures"): void;
  (e: "openMediaDrawer"): void;
  (e: "update:inputText", value: string): void;
  (e: "handleKeydown", event: KeyboardEvent): void;
  (e: "autoResizeInput"): void;
  (e: "handleInputFocusWithScroll"): void;
  (e: "onInputBlur"): void;
  (e: "toggleStickerPanel"): void;
  (e: "toggleInputExpand"): void;
  (e: "regenerateLastAIResponse"): void;
  (e: "update:showSpeakerModePopover", value: boolean): void;
  (e: "setSpeakerMode", mode: "user" | "char" | "system"): void;
  (e: "stopAIGeneration"): void;
  (e: "onMicDown", event: MouseEvent | TouchEvent): void;
  (e: "onMicUp"): void;
  (e: "startRecording", event: MouseEvent | TouchEvent | Event): void;
  (e: "finishRecording"): void;
  (e: "sendAndTriggerAI"): void;
  (e: "update:showTextVoiceModal", value: boolean): void;
  (e: "update:textVoiceInput", value: string): void;
  (e: "sendTextAsVoice"): void;
  (e: "handleStickerSelect", sticker: any): void;
  (e: "closeStickerPanel"): void;
  (e: "openGiftDrawer"): void;
  (e: "handleFeatureClick", type: string): void;
  (e: "closeExpandedInput"): void;
  (e: "sendFromExpanded"): void;
  (e: "update:showMoreFeatures", value: boolean): void;
}>();

const messageTextareaRef = ref<HTMLTextAreaElement | null>(null);
const expandedTextareaRef = ref<HTMLTextAreaElement | null>(null);

defineExpose({
  messageTextareaRef,
  expandedTextareaRef,
});

// ===== 底線指示器 =====
const inputContainerRef = ref<HTMLElement | null>(null);
const underlineTrackRef = ref<HTMLElement | null>(null);
const plusBtnRef = ref<HTMLElement | null>(null);
const imageBtnRef = ref<HTMLElement | null>(null);
const emojiBtnRef = ref<HTMLElement | null>(null);
const inputWrapperRef = ref<HTMLElement | null>(null);

type IndicatorTarget = "full" | "plus" | "image" | "emoji" | "message";

const indicatorTarget = computed<IndicatorTarget>(() => {
  if (props.showMoreFeatures) return "plus";
  if (props.showStickerPanel) return "emoji";
  if (props.isInputFocused) return "message";
  return "full";
});

const indicatorRect = ref<{ left: number; width: number }>({ left: 0, width: 0 });

const indicatorColorClass = computed(() => {
  switch (indicatorTarget.value) {
    case "plus":
      return "color-plus";
    case "image":
      return "color-image";
    case "emoji":
      return "color-emoji";
    case "message":
      return "color-message";
    default:
      return "color-message";
  }
});

function getTargetEl(target: IndicatorTarget): HTMLElement | null {
  switch (target) {
    case "plus":
      return plusBtnRef.value;
    case "image":
      return imageBtnRef.value;
    case "emoji":
      return emojiBtnRef.value;
    case "message":
      return inputWrapperRef.value;
    default:
      return null;
  }
}

function updateIndicator() {
  const track = underlineTrackRef.value;
  if (!track) return;
  const target = indicatorTarget.value;
  if (target === "full") {
    indicatorRect.value = { left: 0, width: track.clientWidth };
    return;
  }
  const el = getTargetEl(target);
  if (!el) {
    indicatorRect.value = { left: 0, width: track.clientWidth };
    return;
  }
  const a = el.getBoundingClientRect();
  const b = track.getBoundingClientRect();
  indicatorRect.value = { left: a.left - b.left, width: a.width };
}

let resizeObserver: ResizeObserver | null = null;

function scheduleUpdate() {
  nextTick(updateIndicator);
  // 對應更多面板/表情包面板/按鈕 v-if 切換的 transition 結束，重新對齊
  setTimeout(updateIndicator, 60);
  setTimeout(updateIndicator, 220);
  setTimeout(updateIndicator, 360);
}

watch(indicatorTarget, scheduleUpdate);
// 三個狀態 props 各自變化時，即使 indicatorTarget 沒變，也可能導致同層按鈕 v-if 切換造成位移，需要重新量測
watch(() => props.showMoreFeatures, scheduleUpdate);
watch(() => props.showStickerPanel, scheduleUpdate);
watch(() => props.isInputFocused, scheduleUpdate);
watch(() => props.isGenerating, scheduleUpdate);
watch(() => props.inputText, scheduleUpdate);
watch(() => props.hasAIMessages, scheduleUpdate);

onMounted(() => {
  nextTick(updateIndicator);
  if (typeof ResizeObserver !== "undefined" && underlineTrackRef.value) {
    resizeObserver = new ResizeObserver(() => updateIndicator());
    resizeObserver.observe(underlineTrackRef.value);
    if (inputContainerRef.value) resizeObserver.observe(inputContainerRef.value);
    if (inputWrapperRef.value) resizeObserver.observe(inputWrapperRef.value);
    if (emojiBtnRef.value) resizeObserver.observe(emojiBtnRef.value);
    if (plusBtnRef.value) resizeObserver.observe(plusBtnRef.value);
  }
  window.addEventListener("resize", updateIndicator);
});

// emoji / plus 等按鈕可能在 v-if 條件變化時被卸載重建，重新掛 observer
watch(emojiBtnRef, (el) => {
  if (resizeObserver && el) resizeObserver.observe(el);
  scheduleUpdate();
});
watch(plusBtnRef, (el) => {
  if (resizeObserver && el) resizeObserver.observe(el);
  scheduleUpdate();
});
watch(imageBtnRef, (el) => {
  if (resizeObserver && el) resizeObserver.observe(el);
  scheduleUpdate();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  window.removeEventListener("resize", updateIndicator);
});

function getPreviewText(content: string): string {
  const text = content
    .replace(/\[img:.*?\]/g, "[圖片]")
    .replace(/\[sticker:.*?\]/g, "[表情包]");
  return text.length > 50 ? text.slice(0, 50) + "..." : text;
}

function handleAudioCommandChange(e: Event) {
  const target = e.target as HTMLInputElement;
  if (target.checked) {
    emit('startRecording', e);
  } else {
    emit('finishRecording');
    emit('update:showTextVoiceModal', false);
  }
}

// 偵測 chat-screen 實際渲染的桌布是否為深色（同 ChatScreenHeader 邏輯）
const themeStore = useThemeStore();
const inputAreaRef = ref<HTMLElement | null>(null);
const detectedDark = ref<boolean | null>(null);
const hasCustomChatWallpaper = ref(false);

function detectChatBackgroundDark() {
  const el = inputAreaRef.value?.closest(".chat-screen") as HTMLElement | null;
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

let bgObserver: MutationObserver | null = null;

onMounted(() => {
  detectChatBackgroundDark();
  const el = inputAreaRef.value?.closest(".chat-screen") as HTMLElement | null;
  if (el) {
    bgObserver = new MutationObserver(() => detectChatBackgroundDark());
    bgObserver.observe(el, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
  }
});

onBeforeUnmount(() => {
  bgObserver?.disconnect();
  bgObserver = null;
});

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
  <!-- 輸入區 -->
  <footer ref="inputAreaRef" class="input-area">
    <!-- 被角色封鎖提示列 -->
    <div v-if="isBlockedByChar" class="blocked-by-char-bar">
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        width="14"
        height="14"
        style="flex-shrink: 0; opacity: 0.7"
      >
        <path
          d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"
        />
      </svg>
      <span>你已被對方封鎖，訊息可能無法送達</span>
      <button
        class="blocked-friend-request-btn"
        @click="emit('showFriendRequestInput')"
      >
        發送好友申請
      </button>
    </div>

    <!-- 回覆預覽欄 -->
    <Transition name="slide-up">
      <div v-if="replyingTo" class="reply-preview-bar">
        <div class="reply-preview-content">
          <div class="reply-preview-header">
            <svg class="reply-icon" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"
              />
            </svg>
            <span class="reply-to-name"
              >回覆
              {{ replyingTo.role === "user" ? "自己" : characterName }}</span
            >
          </div>
          <div class="reply-preview-text">
            {{ getPreviewText(replyingTo.content) }}
          </div>
        </div>
        <button class="cancel-reply-btn" @click="emit('cancelReply')">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            />
          </svg>
        </button>
      </div>
    </Transition>

    <!-- 快速輸入助手（僅面對面模式且輸入框獲得焦點時顯示） -->
    <Transition name="slide-up">
      <div
        v-if="chatFaceToFaceMode && isInputFocused"
        class="quick-input-bar"
      >
        <div
          class="quick-input-scroll"
          @wheel.prevent="emit('handleQuickInputWheel', $event)"
        >
          <button
            v-for="action in quickActions"
            :key="action.text"
            class="quick-input-btn"
            :title="action.hint"
            @mousedown.prevent="emit('insertQuickAction', action.text)"
          >
            {{ action.label }}
          </button>
        </div>
        <!-- 自定義按鈕 -->
        <button
          class="quick-input-edit-btn"
          title="自定義快捷"
          @mousedown.prevent="emit('openQuickActionEditor')"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
        </button>
      </div>
    </Transition>

    <div class="input-container" :class="{ 'dark-bg': isDarkBackground }" ref="inputContainerRef">
      <!-- 左側按鈕組 -->
      <div class="left-buttons" @click.stop>
        <!-- 更多功能按鈕 -->
        <button
          ref="plusBtnRef"
          class="input-btn plus-btn"
          :class="{ active: showMoreFeatures }"
          @click="emit('toggleMoreFeatures')"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
        </button>

        <!-- 發言模式切換按鈕（取代原圖片按鈕位置） -->
        <div class="speaker-mode-wrapper">
          <button
            class="input-btn speaker-mode-btn"
            :class="['mode-' + speakerMode, { active: showSpeakerModePopover }]"
            :title="speakerMode === 'user' ? '發言模式：我' : speakerMode === 'char' ? '發言模式：角色' : '發言模式：系統'"
            @click.stop="emit('update:showSpeakerModePopover', !showSpeakerModePopover)"
          >
            <!-- user：人像 -->
            <svg v-if="speakerMode === 'user'" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
            <!-- char：對話氣泡 -->
            <svg v-else-if="speakerMode === 'char'" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z" />
            </svg>
            <!-- system：齒輪 -->
            <svg v-else viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
            </svg>
          </button>

          <Transition name="fade">
            <div
              v-if="showSpeakerModePopover"
              class="speaker-mode-popover"
              @click.stop
            >
              <button
                class="speaker-mode-option"
                :class="{ selected: speakerMode === 'user' }"
                @click="emit('setSpeakerMode', 'user')"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
                <span>我（user）</span>
              </button>
              <button
                class="speaker-mode-option"
                :class="{ selected: speakerMode === 'char' }"
                @click="emit('setSpeakerMode', 'char')"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z" />
                </svg>
                <span>角色（char）</span>
              </button>
              <button
                class="speaker-mode-option"
                :class="{ selected: speakerMode === 'system' }"
                @click="emit('setSpeakerMode', 'system')"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                </svg>
                <span>系統（system）</span>
              </button>
            </div>
          </Transition>
        </div>
      </div>

      <!-- 輸入框容器（包含表情按鈕） -->
      <div class="input-wrapper" ref="inputWrapperRef" @click.stop>
        <textarea
          ref="messageTextareaRef"
          :value="inputText"
          class="message-input"
          placeholder="輸入消息..."
          rows="1"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          @input="emit('update:inputText', ($event.target as HTMLTextAreaElement).value); emit('autoResizeInput')"
          @keydown="emit('handleKeydown', $event)"
          @focus="emit('handleInputFocusWithScroll')"
          @blur="emit('onInputBlur')"
        ></textarea>

        <!-- 表情按鈕（在輸入框內右側） -->
        <button
          ref="emojiBtnRef"
          class="emoji-btn-inner"
          :class="{ active: showStickerPanel }"
          @click.stop="emit('toggleStickerPanel')"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"
            />
          </svg>
        </button>

        <!-- 展開輸入框按鈕 -->
        <button
          v-if="inputText.length > 50"
          class="expand-btn-inner"
          title="展開編輯"
          @click.stop="emit('toggleInputExpand')"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
          </svg>
        </button>
      </div>

      <!-- 右側按鈕組 -->
      <div class="right-buttons" @click.stop>
        <!-- 圖片按鈕（未聚焦且無輸入時顯示，原 continue-btn 位置） -->
        <button
          v-if="!isGenerating && !inputText.trim() && !isInputFocused"
          ref="imageBtnRef"
          class="input-btn image-btn"
          title="圖片 / 媒體"
          @click="emit('openMediaDrawer')"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
            />
          </svg>
        </button>

        <!-- 重新生成按鈕（有 AI 訊息且未生成中） -->
        <button
          v-if="
            hasAIMessages &&
            !isGenerating &&
            !inputText.trim() &&
            !isInputFocused
          "
          class="input-btn regenerate-btn"
          title="重新生成最後一條回覆（滑動）"
          @click="emit('regenerateLastAIResponse')"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
            />
          </svg>
        </button>

        <!-- 停止生成按鈕 -->
        <button
          v-if="isGenerating"
          class="input-btn stop-btn"
          title="停止生成"
          @click="emit('stopAIGeneration')"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4 14H8V8h8v8z"
            />
          </svg>
        </button>

        <!-- 錄音按鈕（聚焦時顯示，在發送按鈕左邊） -->
        <Transition name="fade-slide">
          <button
            v-if="!isGenerating && isInputFocused && canRecord"
            class="input-btn mic-inline-btn"
            title="點擊輸入文字或語音"
            @click.prevent="emit('update:showTextVoiceModal', true)"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"
              />
              <path
                d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"
              />
            </svg>
          </button>
        </Transition>

        <!-- 發送按鈕（有文字時顯示） -->
        <button
          v-if="!isGenerating && inputText.trim()"
          class="send-btn active"
          @click="emit('sendAndTriggerAI')"
          title="發送訊息並觸發 AI 回覆"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>

        <!-- 發送按鈕（無文字且未聚焦時顯示小飛機） -->
        <button
          v-if="
            !isGenerating && !inputText.trim() && canRecord && !isInputFocused
          "
          class="send-btn"
          @click="emit('sendAndTriggerAI')"
          title="發送訊息並觸發 AI 回覆"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>

        <!-- 發送按鈕（無文字且聚焦時，或不支援錄音時顯示） -->
        <button
          v-if="
            !isGenerating &&
            !inputText.trim() &&
            (!canRecord || isInputFocused)
          "
          class="send-btn"
          @click="emit('sendAndTriggerAI')"
          title="發送訊息並觸發 AI 回覆"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>


    <!-- 語音輸入 Modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showTextVoiceModal || isRecording"
          class="text-voice-overlay"
          @click.self="!isRecording && emit('update:showTextVoiceModal', false)"
        >
          <div class="card">
            <input
              class="input"
              hidden
              type="checkbox"
              aria-label="audio-command"
              name="audio-command"
              id="audio-command"
              :checked="isRecording"
              @change="handleAudioCommandChange"
            />

            <div class="inner-card">
              <div class="trigger-wrap">
                <label class="trigger" for="audio-command"> </label>

                <svg
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  class="mic"
                  stroke-linejoin="round"
                  stroke-linecap="round"
                  stroke-width="2.5"
                  stroke="currentColor"
                  fill="none"
                >
                  <path
                    d="m19.5,10.89c0,4.44-3.36,8.04-7.5,8.04s-7.5-3.6-7.5-8.04"
                  ></path>
                  <line x1="12" y1="22.42" x2="12" y2="18.93"></line>
                  <rect
                    x="8.38"
                    y="1.81"
                    width="7.23"
                    height="13.25"
                    rx="3.62"
                    ry="3.62"
                  ></rect>
                </svg>

                <div class="spectrum" v-if="isRecording">
                  <b v-for="n in 45" :key="n-1" :style="`--index: ${n-1};`"></b>
                </div>
              </div>

              <div class="content">
                <div class="voice-actions-container" :class="{ 'is-recording': isRecording }">
                  <textarea
                    :value="textVoiceInput"
                    class="text-voice-input-new"
                    placeholder="輸入文字轉換為語音..."
                    rows="2"
                    @input="emit('update:textVoiceInput', ($event.target as HTMLTextAreaElement).value)"
                    @keydown.enter.ctrl="emit('sendTextAsVoice')"
                  ></textarea>
                  <button
                    class="send-text-voice-btn"
                    @click="emit('sendTextAsVoice')"
                    :disabled="!textVoiceInput.trim()"
                  >
                    發送文字
                  </button>
                </div>
                <div class="hint-text">
                  <span v-if="!isRecording">或點擊上方麥克風開始錄音</span>
                  <span v-else class="recording-time-text">{{ formatAudioTime(recordingDuration) }} - 點擊停止發送</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 表情包面板 -->
    <Transition name="slide-up">
      <StickerPanel
        v-if="showStickerPanel"
        @select="emit('handleStickerSelect', $event)"
        @close="emit('closeStickerPanel')"
      />
    </Transition>

    <!-- 更多功能面板 -->
    <Transition name="slide-up">
      <div v-if="showMoreFeatures" class="more-features-panel" @click.stop>
        <div class="features-grid">
          <button
            class="feature-item"
            @click="
              emit('openGiftDrawer');
              emit('update:showMoreFeatures', false);
            "
          >
            <div class="feature-icon gift-feature-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 11 8.76l1-1.36 1 1.36L15.38 12 17 10.83 14.92 8H20v6z"
                />
              </svg>
            </div>
            <span class="feature-label">禮物</span>
          </button>
          <button class="feature-item" @click="emit('handleFeatureClick', 'phone')">
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"
                />
              </svg>
            </div>
            <span class="feature-label">電話</span>
          </button>
          <button class="feature-item" @click="emit('handleFeatureClick', 'video')">
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"
                />
              </svg>
            </div>
            <span class="feature-label">視訊</span>
          </button>
          <button
            class="feature-item"
            @click="emit('handleFeatureClick', 'location')"
          >
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                />
              </svg>
            </div>
            <span class="feature-label">位置</span>
          </button>
          <button class="feature-item" @click="emit('handleFeatureClick', 'weather')">
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12.74 5.47C15.1 6.5 16.35 9.03 15.92 11.46c-.17.99-.6 1.94-1.25 2.75-.52.64-1.16 1.19-1.89 1.61-.73.42-1.54.71-2.38.85-.84.14-1.7.13-2.53-.04-.83-.17-1.62-.49-2.33-.94-.71-.45-1.33-1.02-1.82-1.69-.49-.67-.85-1.43-1.05-2.24-.2-.81-.24-1.65-.12-2.48.12-.83.4-1.63.82-2.36.42-.73.97-1.38 1.62-1.91.65-.53 1.39-.94 2.18-1.2.79-.26 1.62-.38 2.45-.34.83.04 1.64.24 2.39.58zM19 13h2v2h-2v-2zm-4-8h2v2h-2V5zm4 4h2v2h-2V9zm-4 8h2v2h-2v-2zm4 0h2v2h-2v-2z"
                />
              </svg>
            </div>
            <span class="feature-label">天氣</span>
          </button>
          <button class="feature-item" @click="emit('handleFeatureClick', 'file')">
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"
                />
              </svg>
            </div>
            <span class="feature-label">文件</span>
          </button>
          <button class="feature-item" @click="emit('handleFeatureClick', 'magic')">
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5zm-7.63 5.29c-.39-.39-1.02-.39-1.41 0L1.29 18.96c-.39.39-.39 1.02 0 1.41l2.34 2.34c.39.39 1.02.39 1.41 0L16.7 11.05c.39-.39.39-1.02 0-1.41l-2.33-2.35zm-1.03 5.49l-2.12-2.12 2.44-2.44 2.12 2.12-2.44 2.44z"
                />
              </svg>
            </div>
            <span class="feature-label">跳轉魔法</span>
          </button>
          <button
            class="feature-item"
            @click="emit('handleFeatureClick', 'small-theater')"
          >
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM8.5 8c.83 0 1.5.67 1.5 1.5S9.33 11 8.5 11 7 10.33 7 9.5 7.67 8 8.5 8zm3.5 9c-2.33 0-4.31-1.46-5.11-3.5h10.22c-.8 2.04-2.78 3.5-5.11 3.5zm3.5-6c-.83 0-1.5-.67-1.5-1.5S14.67 8 15.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
                />
              </svg>
            </div>
            <span class="feature-label">小劇場</span>
          </button>
          <button
            class="feature-item"
            @click="emit('handleFeatureClick', 'topic-prompt')"
          >
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6C7.8 12.16 7 10.63 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z"
                />
              </svg>
            </div>
            <span class="feature-label">話題引導</span>
          </button>
          <button
            class="feature-item"
            @click="emit('handleFeatureClick', 'game-score')"
          >
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
                />
              </svg>
            </div>
            <span class="feature-label">遊戲成績</span>
          </button>
          <button
            class="feature-item"
            @click="emit('handleFeatureClick', 'media-log')"
          >
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"
                />
              </svg>
            </div>
            <span class="feature-label">書影</span>
          </button>
          <button
            class="feature-item"
            @click="emit('handleFeatureClick', 'food-log')"
          >
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M8.1 13.34l2.83-2.83L3.91 3.5a4.008 4.008 0 000 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.2-1.1-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L3.7 19.87l1.41 1.41L12 14.41l6.88 6.88 1.41-1.41L13.41 13l1.47-1.47z"
                />
              </svg>
            </div>
            <span class="feature-label">食記</span>
          </button>
          <button
            class="feature-item"
            @click="emit('handleFeatureClick', 'image-search')"
          >
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
                />
              </svg>
            </div>
            <span class="feature-label">搜圖分享</span>
          </button>
          <button
            class="feature-item"
            @click="emit('handleFeatureClick', 'music')"
          >
            <div class="feature-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
                />
              </svg>
            </div>
            <span class="feature-label">分享歌曲</span>
          </button>
        </div>
      </div>
    </Transition>
  </footer>

  <!-- 展開輸入框覆蓋層 -->
  <Transition name="expand-input">
    <div v-if="isInputExpanded" class="expanded-input-overlay" @click.stop>
      <div class="expanded-input-header">
        <button
          class="expanded-close-btn"
          @click="emit('closeExpandedInput')"
          title="收合"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
          </svg>
        </button>
        <span class="expanded-char-count">{{ inputText.length }}</span>
        <button
          class="expanded-send-btn"
          :class="{ active: inputText.trim() }"
          @click="emit('sendFromExpanded')"
          :disabled="!inputText.trim() || isGenerating"
        >
          發送
        </button>
      </div>
      <textarea
        ref="expandedTextareaRef"
        :value="inputText"
        class="expanded-textarea"
        placeholder="輸入消息..."
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        @input="emit('update:inputText', ($event.target as HTMLTextAreaElement).value)"
        @keydown.ctrl.enter.prevent="emit('sendFromExpanded')"
      ></textarea>
      <!-- 展開模式快速輸入助手 -->
      <div v-if="chatFaceToFaceMode" class="expanded-quick-input-bar">
        <div
          class="quick-input-scroll"
          @wheel.prevent="emit('handleQuickInputWheel', $event)"
        >
          <button
            v-for="action in quickActions"
            :key="action.text"
            class="quick-input-btn"
            :title="action.hint"
            @mousedown.prevent="emit('insertQuickAction', action.text)"
          >
            {{ action.label }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style lang="scss" scoped>
// 輸入區
.input-area {
  padding: 10px 12px;
  padding-bottom: calc(10px + var(--safe-bottom, 0px));

  // 被角色封鎖提示列
  .blocked-by-char-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    font-size: 12px;
    color: rgba(180, 50, 50, 0.85);
    background: rgba(255, 80, 80, 0.06);
    border-bottom: 1px solid rgba(255, 80, 80, 0.12);
  }

  .blocked-friend-request-btn {
    margin-left: auto;
    flex-shrink: 0;
    font-size: 12px;
    color: var(--color-primary, #6c8ebf);
    background: none;
    border: 1px solid currentColor;
    border-radius: 12px;
    padding: 2px 10px;
    cursor: pointer;
    &:hover {
      opacity: 0.75;
    }
  }
  padding-left: calc(12px + var(--safe-left, 0px));
  padding-right: calc(12px + var(--safe-right, 0px));
  background: transparent;
  border-top: none;
  flex-shrink: 0;
  position: relative;
  z-index: 2;
}

// 回覆預覽欄
.reply-preview-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: var(--color-background);
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 8px;
  border-radius: 12px 12px 0 0;

  .reply-preview-content {
    flex: 1;
    min-width: 0;
  }

  .reply-preview-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;

    .reply-icon {
      width: 16px;
      height: 16px;
      color: var(--color-primary);
    }

    .reply-to-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--color-primary);
    }
  }

  .reply-preview-text {
    font-size: 13px;
    color: var(--chat-header-text-secondary, var(--color-text-secondary));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cancel-reply-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--chat-header-surface, var(--color-surface));
    border: none;
    border-radius: 50%;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;

    svg {
      width: 16px;
      height: 16px;
    }

    &:hover {
      background: var(--color-surface-hover);
      color: var(--chat-header-text, var(--color-text));
    }
  }
}

// 快速輸入助手欄（面對面模式）
.quick-input-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding: 0 4px;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
}

.quick-input-scroll {
  flex: 1;
  display: flex;
  justify-content: center;
  gap: 6px;
  overflow-x: auto;
  padding: 4px 0;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    display: none;
  }
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.quick-input-btn {
  flex-shrink: 0;
  padding: 6px 12px;
  background: var(--color-background, #f5f5f5);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 16px;
  font-size: 13px;
  color: var(--chat-header-text-secondary, var(--color-text-secondary, #666));
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;

  &:hover {
    background: var(--color-primary-light, rgba(125, 211, 168, 0.15));
    border-color: var(--color-primary, #7dd3a8);
    color: var(--color-primary, #7dd3a8);
  }

  &:active {
    transform: scale(0.95);
  }
}

.quick-input-edit-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-background, #f5f5f5);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 50%;
  color: var(--color-text-muted, #999);
  cursor: pointer;
  transition: all 0.15s ease;

  svg {
    width: 16px;
    height: 16px;
  }

  &:hover {
    background: var(--color-primary-light, rgba(125, 211, 168, 0.15));
    border-color: var(--color-primary, #7dd3a8);
    color: var(--color-primary, #7dd3a8);
  }
}

.input-container {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
  box-sizing: border-box;
  padding: 6px 10px;
  border-radius: 22px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--chat-header-surface, var(--color-surface)) 85%, transparent) 0%,
    color-mix(in srgb, var(--chat-header-surface, var(--color-surface)) 40%, transparent) 100%
  );
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  border: 1px solid color-mix(in srgb, var(--color-border) 45%, transparent);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);

  // 深色背景：將輸入區的文字、placeholder、按鈕色調切換為亮色
  &.dark-bg {
    background: linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.18) 0%,
      rgba(255, 255, 255, 0.08) 100%
    );
    border-color: rgba(255, 255, 255, 0.22);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);

    .message-input {
      color: #ffffff;
      &::placeholder {
        color: rgba(255, 255, 255, 0.65);
      }
    }

    .plus-btn {
      color: rgba(255, 255, 255, 0.85);
      &:hover { color: #ffffff; }
      &.active { color: #ffffff; }
      svg { color: inherit; }
    }

    // 發言模式按鈕（user / system 兩種非 primary 顏色變亮，char 維持主題色）
    .input-btn {
      &.mode-user { color: rgba(255, 255, 255, 0.9); }
      &.mode-system { color: #fbbf24; }
    }

    // 表情按鈕等通用 input-btn 預設色
    .emoji-btn {
      color: rgba(255, 255, 255, 0.85);
      &:hover { color: #ffffff; }
    }
  }
}


.left-buttons,
.right-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.input-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;

  svg {
    width: 22px;
    height: 22px;
  }

  &:hover {
    transform: scale(1.1);
  }
}

// 左側按鈕顏色
.plus-btn {
  color: #666;

  &:hover {
    color: #333;
  }
}

.image-btn {
  color: var(--color-primary, #7dd3a8);

  &:hover {
    color: #5cb88a;
  }
}

// 發言模式切換按鈕
.speaker-mode-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.speaker-mode-btn {
  color: #888;
  transition: color var(--transition-fast), background var(--transition-fast);

  &.mode-user {
    color: #888;
  }
  &.mode-char {
    color: var(--color-primary, #7dd3a8);
  }
  &.mode-system {
    color: #f59e0b;
  }
  &.active {
    background: rgba(125, 211, 168, 0.12);
  }
}

.speaker-mode-popover {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 30;
  background: var(--chat-header-surface, var(--color-surface, #fff));
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
  border-radius: 12px;
  padding: 6px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  min-width: 148px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.speaker-mode-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--chat-header-text, var(--color-text, #222));
  text-align: left;
  width: 100%;

  svg {
    width: 18px;
    height: 18px;
    color: #888;
    flex-shrink: 0;
  }

  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }

  &.selected {
    background: rgba(125, 211, 168, 0.16);
    color: var(--color-primary, #5cb88a);

    svg {
      color: var(--color-primary, #5cb88a);
    }
  }
}

.gift-feature-icon {
  svg {
    color: #e53935 !important;
  }
}

.input-wrapper {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.message-input {
  width: 100%;
  min-height: 36px;
  max-height: 84px;
  padding: 8px 40px 8px 8px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--chat-header-text, var(--color-text));
  font-size: 15px;
  line-height: 1.4;
  resize: none;
  outline: none;
  box-shadow: none;
  transition: none;

  &::placeholder {
    color: var(--color-text-muted);
  }

  &:focus {
    border: none;
    box-shadow: none;
  }
}

.emoji-btn-inner {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 50%;
  color: #888;
  cursor: pointer;
  transition: all var(--transition-fast);

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover {
    color: #666;
    transform: translateY(-50%) scale(1.1);
  }

  &.active {
    color: var(--color-primary, #7dd3a8);
    background: var(--color-primary-light, rgba(125, 211, 168, 0.15));
  }
}

// 展開輸入框按鈕（在輸入框右側）
.expand-btn-inner {
  position: absolute;
  right: 36px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 50%;
  color: #888;
  cursor: pointer;
  transition: all var(--transition-fast);

  svg {
    width: 18px;
    height: 18px;
  }

  &:hover {
    color: var(--color-primary, #7dd3a8);
    background: var(--color-primary-light, rgba(125, 211, 168, 0.15));
  }
}

.send-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 50%;
  color: var(--color-primary, #7dd3a8);
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;

  svg {
    width: 22px;
    height: 22px;
  }

  &:hover {
    transform: scale(1.1);
  }

  &:active {
    transform: scale(0.95);
  }

  &.active {
    color: var(--color-primary, #7dd3a8);
    filter: brightness(1.1);
  }
}

// 重新生成按鈕
.regenerate-btn {
  color: var(--color-primary);

  &:hover {
    background: var(--color-primary-light);
  }
}

// 停止按鈕
.stop-btn {
  color: var(--color-error, #e53e3e);

  &:hover {
    background: rgba(229, 62, 62, 0.1);
  }
}

// 加號按鈕激活狀態
.plus-btn.active {
  color: var(--color-primary);
  transform: rotate(45deg);
}

// 更多功能面板
.more-features-panel {
  padding: 16px;
  background: var(--chat-header-surface, var(--color-surface));
  border-top: 1px solid var(--color-border);
  border-radius: 16px 16px 0 0;
  margin-top: 8px;
  max-height: 280px;
  overflow-y: auto;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.feature-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 8px;
  background: transparent;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: var(--color-background);
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }
}

.feature-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: var(--color-background);

  svg {
    width: 24px;
    height: 24px;
    color: var(--chat-header-text-secondary, var(--color-text-secondary));
  }
}

.feature-label {
  font-size: 12px;
  color: var(--chat-header-text-secondary, var(--color-text-secondary));
  text-align: center;
}

// 展開輸入框覆蓋層
// position: absolute !important 是為了覆蓋父級 .chat-screen > * { position: relative } 的 scoped CSS
.expanded-input-overlay {
  position: absolute !important;
  bottom: 0;
  left: 0;
  right: 0;
  top: auto;
  height: 60%;
  min-height: 250px;
  max-height: 80%;
  background: var(--chat-header-surface, var(--color-surface, #fff));
  display: flex;
  flex-direction: column;
  z-index: 50;
  padding: 0 12px;
  padding-bottom: calc(10px + var(--safe-bottom));
  padding-left: calc(12px + var(--safe-left));
  padding-right: calc(12px + var(--safe-right));
  will-change: transform;
  backface-visibility: hidden;
  border-top: 1px solid var(--color-border, #e2e8f0);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.1);
  border-radius: 16px 16px 0 0;
}

.expanded-input-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  flex-shrink: 0;
}

.expanded-close-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 50%;
  color: var(--chat-header-text-secondary, var(--color-text-secondary, #666));
  cursor: pointer;
  transition: all 0.15s ease;

  svg {
    width: 24px;
    height: 24px;
  }

  &:hover {
    background: var(--color-background, #f5f5f5);
    color: var(--chat-header-text, var(--color-text, #333));
  }
}

.expanded-char-count {
  font-size: 13px;
  color: var(--color-text-muted, #999);
}

.expanded-send-btn {
  padding: 6px 20px;
  background: var(--color-primary, #7dd3a8);
  border: none;
  border-radius: 16px;
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  opacity: 0.5;
  transition: all 0.15s ease;

  &.active {
    opacity: 1;
  }

  &:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  &:disabled {
    cursor: not-allowed;
  }
}

.expanded-textarea {
  flex: 1;
  width: 100%;
  padding: 12px 16px;
  border: 2px solid var(--color-primary, #7dd3a8);
  border-radius: 16px;
  background: var(--color-background, #fff);
  color: var(--chat-header-text, var(--color-text));
  font-size: 15px;
  line-height: 1.6;
  resize: none;
  outline: none;
  overflow-y: auto;

  &::placeholder {
    color: var(--color-text-muted);
  }

  &:focus {
    border-color: var(--color-primary, #7dd3a8);
    box-shadow: 0 0 0 3px rgba(125, 211, 168, 0.15);
  }
}

// 展開模式快速輸入助手
.expanded-quick-input-bar {
  flex-shrink: 0;
  padding: 8px 0 4px;

  .quick-input-scroll {
    display: flex;
    justify-content: center;
    gap: 6px;
    overflow-x: auto;
    padding: 4px 0;
    -webkit-overflow-scrolling: touch;

    &::-webkit-scrollbar {
      display: none;
    }
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
}

// 展開動畫
.expand-input-enter-active,
.expand-input-leave-active {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.expand-input-enter-from {
  transform: translateY(100%);
}

.expand-input-leave-to {
  transform: translateY(100%);
}

// ===== 語音輸入 Card CSS =====
.text-voice-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--app-height, 100%);
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(2px);
}

.card {
  --w-card: 320px;
  --h-card: 460px;
  --p-card: 2.4px;
  --p-inner: 18px;
  --round-card: 28px;
  --w-inner: calc(var(--w-card) - calc(var(--p-card) * 2));
  --h-inner: calc(var(--h-card) - calc(var(--p-card) * 2));
  --round-inner: calc(var(--round-card) - var(--p-card));
  border-radius: var(--round-card);
  width: var(--w-card);
  height: var(--h-card);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: linear-gradient(130deg, #7209d450, #fff 33%, #00a5b250);
  box-shadow:
    rgba(0, 0, 0, 0.1) 0 4px 30px,
    rgba(60, 64, 67, 0.1) 0 1px 8px 0,
    rgba(60, 64, 67, 0.1) 0 1px 1px 0,
    rgba(187, 18, 199, 0.15) 1px 1px 200px 0px,
    rgba(0, 98, 178, 0.15) -1px -1px 200px 0px;
}
.card::before {
  content: "";
  z-index: 1;
  position: absolute;
  width: var(--w-inner);
  height: var(--h-inner);
  border-radius: var(--round-inner);
  background: #ffffff;
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
}

.inner-card {
  position: relative;
  z-index: 2;
  width: var(--w-inner);
  height: var(--h-inner);
  border-radius: var(--round-inner);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  overflow: hidden;
  transition: all 0.35s ease;
  background: rgba(255, 255, 255, 0.1);
  outline: var(--p-card) solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 0 80px rgba(0, 0, 0, 0.25);
}
.inner-card::before,
.inner-card::after {
  content: "";
  position: absolute;
  width: 100%;
  height: 100%;
  z-index: -1;
  border-radius: var(--round-inner);
  filter: blur(60px);
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
}
.inner-card::before {
  background: linear-gradient(135deg, #fff, #7209d425 25%, #0000);
}
.inner-card::after {
  background: linear-gradient(135deg, #0000, #00a6b225 66%, #fff);
}

.input {
  display: none;
  position: absolute;
  height: 0;
  width: 0;
  overflow: hidden;
  pointer-events: none;
  visibility: hidden;
}

.trigger-wrap {
  --sz-trigger-wrap: calc(var(--w-card) * 0.65);
  --sz-trigger: calc(var(--sz-trigger-wrap) * 0.65);
  z-index: 4;
  position: absolute;
  top: 30px;
  left: 50%;
  transform: translateX(-50%);
  height: var(--sz-trigger-wrap);
  width: var(--sz-trigger-wrap);
  outline: 1.4px solid #ffffff70;
  border-radius: 9999px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.35s ease;
  --shadow-wrap: rgba(255, 255, 255, 0.6) 0 0 20px 4px inset,
    rgba(50, 50, 93, 0.2) 0 10px 80px 2px inset,
    rgba(0, 0, 0, 0.1) 0px 18px 36px -18px inset;
  box-shadow:
    rgba(0, 0, 0, 0.25) 0 10px 50px,
    var(--shadow-wrap);
}

.trigger {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 6;
  border-radius: 9999px;
  width: var(--sz-trigger);
  height: var(--sz-trigger);
  overflow: hidden;
  --shadows: rgb(255, 255, 255) 0 0 1px 1px, rgb(255, 255, 255) 0 0 10px 3px,
    rgb(255, 255, 255) 0 0 11px 2px, rgb(255, 255, 255) 0 0 22px 6px,
    rgba(255, 255, 255, 0.85) 0px 20px 50px,
    rgba(187, 18, 199, 0.8) 4px 4px 30px 0px,
    rgba(0, 98, 178, 0.8) -4px -4px 30px 0px;
  box-shadow: var(
    --shadows,
    rgba(255, 255, 255, 0.75) 0 0 1px 1px,
    rgba(255, 255, 255, 0.75) 0 0 15px 2px,
    rgba(255, 255, 255, 0.75) 0px 10px 50px,
    rgba(187, 18, 199, 0.8) 2px 2px 20px 0px,
    rgba(0, 98, 178, 0.8) -2px -2px 20px 0px
  );
  transition: all 0.35s ease;
}
.trigger::after {
  content: "";
  position: relative;
  z-index: 1;
  width: var(--sz-trigger);
  height: var(--sz-trigger);
  transition: all 0.35s ease;
  background: linear-gradient(130deg, #bb12c7, #7209d4 33%, #00a5b2);
  filter: blur(35px);
  backdrop-filter: blur(60px);
  -webkit-backdrop-filter: blur(60px);
  border-radius: 9999px;
}
.mic {
  height: 60px;
  width: 60px;
  color: white;
  opacity: 0.5;
  transition: all 0.35s ease;
  position: absolute;
  z-index: 9;
  pointer-events: none;
  overflow: visible;
}
.mic * {
  transition: all 0.35s ease;
}
.spectrum {
  z-index: 2;
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 90%;
  height: 90%;
  overflow: hidden;
  border-radius: 999px;
  pointer-events: none;
}
.spectrum b {
  width: 1px;
  pointer-events: none;
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(calc(8deg * var(--index)));
}
.spectrum b::before,
.spectrum b::after {
  --h-spectrums: 1px;
  content: "";
  position: absolute;
  z-index: 0;
  inset-inline: 0;
  width: 1px;
  opacity: 1;
  background: white;
  border-radius: 9999px;
  transition: all 0.35s ease;
  height: calc(var(--index) * calc(var(--h-spectrums) / 2.5));
}
.spectrum b::before {
  top: 68px;
}
.spectrum b::after {
  bottom: 68px;
}

.input:checked ~ .inner-card {
  box-shadow:
    rgba(255, 255, 255) 0 0 10px,
    rgba(255, 255, 255, 0.95) 0 0 10px 4px;
}
.input:checked ~ .inner-card .trigger-wrap {
  transform: translateX(-50%) scale(1.05);
  top: 25px;
  outline: 1px solid #fff;
  box-shadow:
    rgba(0, 0, 0, 0.25) 0 0 50px,
    var(--shadow-wrap);
}
.input:checked ~ .inner-card .trigger-wrap .spectrum b::before {
  --h-spectrums: 1.5px;
  top: 68px;
  animation: spectrums 0.6s steps(3) infinite 0.6s;
}
.input:checked ~ .inner-card .trigger-wrap .spectrum b::after {
  --h-spectrums: 2px;
  bottom: 68px;
  animation: spectrums 0.6s steps(3) infinite 0.6s;
}
@keyframes spectrums {
  0%,
  100% {
    opacity: 0.5;
    height: calc(var(--index) * 0px);
  }
  25% {
    opacity: 0.5;
    height: calc(var(--index) * calc(var(--h-spectrums) / 2));
  }
  50% {
    opacity: 1;
    height: calc(var(--index) * var(--h-spectrums));
  }
  75% {
    opacity: 0.75;
    height: calc(var(--index) * calc(var(--h-spectrums) / 3));
  }
}

.trigger:hover ~ .mic,
.trigger:hover ~ .mic .fill-head-mic {
  opacity: 0.85;
}
.trigger:active {
  transform: scale(0.95);
}
.trigger:active ~ .mic {
  transform: scale(1.05);
}
.input:checked ~ .inner-card .trigger-wrap .trigger {
  --shadows: rgb(255, 255, 255) 0 0 1px 6px, rgb(255, 255, 255) 0 0 10px 9px,
    rgb(255, 255, 255) 0 0 11px 7px, rgb(255, 255, 255) 0 0 22px 11px,
    rgba(255, 255, 255, 0.85) 0px 20px 50px,
    rgba(187, 18, 199, 0.8) 4px 4px 30px 0px,
    rgba(0, 98, 178, 0.8) -4px -4px 30px 0px;
  animation: shadows 1.2s linear infinite 1s;
}
@keyframes shadows {
  from,
  to {
    box-shadow: var(--shadows);
  }
  50% {
    box-shadow:
      rgb(255, 255, 255, 0.85) 0 0 1px 4px,
      rgb(255, 255, 255, 0.85) 0 0 10px 6px,
      rgb(255, 255, 255, 0.85) 0 0 11px 8px,
      rgb(255, 255, 255, 0.85) 0 0 22px 4px,
      rgba(255, 255, 255, 0.85) 0px 20px 50px,
      rgba(187, 18, 199, 0.8) 4px 4px 30px 0px,
      rgba(0, 98, 178, 0.8) -4px -4px 30px 0px;
  }
}

.input:checked ~ .inner-card .trigger-wrap .trigger::after {
  animation: gradients 2.4s linear infinite;
}
@keyframes gradients {
  0%,
  99.99% {
    background: radial-gradient(
      circle,
      #bb12c7cc 0%,
      #7c09d4cc 20%,
      #0062b2cc 100%
    );
  }
  33.33% {
    background: radial-gradient(circle, #0062b2cc 0%, #7c09d4cc 100%);
  }
  66.66% {
    background: radial-gradient(circle, #7c09d4cc 0%, #1260c7cc 100%);
  }
}
.input:checked ~ .inner-card .trigger-wrap .mic {
  opacity: 0.85;
  animation: opacity 2.4s linear infinite 1s;
}
@keyframes opacity {
  from,
  to {
    opacity: 0.85;
  }
  50% {
    opacity: 0.45;
  }
}
.input:checked ~ .inner-card .trigger-wrap .mic path {
  --dasharray: 100;
  d: path(
    "m37.75,11.84h-13.75c-.72,0-5.2-6.05-6-6.04s-5.53,15.65-6,15.65C11.56,21.45,6.84,0,5.99,0,5.02,0,1.49,11.86,0,11.85h-13.75"
  );
  stroke-width: 1.6;
  stroke-dasharray: var(--dasharray);
  animation: rate 2.4s infinite linear forwards;
}
@keyframes rate {
  from {
    stroke-dashoffset: calc(var(--dasharray) * -1px);
  }
  to {
    stroke-dashoffset: var(--dasharray);
  }
}

.input:checked ~ .inner-card .trigger-wrap .mic line {
  opacity: 0;
}
.input:checked ~ .inner-card .trigger-wrap .mic rect {
  --sz-rect: 54px;
  x: -15;
  y: -15;
  width: var(--sz-rect);
  height: var(--sz-rect);
  rx: var(--sz-rect);
  ry: var(--sz-rect);
  stroke: #0000;
  stroke-width: 0.8;
}
.input:checked ~ .inner-card .content {
  transform: translate(0%, 5%);
  transition-delay: 0s;
}

.content {
  position: absolute;
  bottom: var(--p-inner);
  z-index: 10;
  margin-top: 44px;
  font-family: sans-serif;
  font-size: 12px;
  line-height: 1.5;
  width: calc(100% - calc(var(--p-inner) * 2));
  padding: 12px;
  background: rgba(255, 255, 255, 0.6);
  outline: 2px solid rgba(255, 255, 255, 0.7);
  border-radius: 12px;
  transition: all 0.35s ease;
  transition-delay: 0.25s;
  box-shadow:
    rgba(0, 0, 0, 0.06) 0px 2px 4px 0px,
    rgba(0, 0, 0, 0.1) 0px 10px 50px,
    rgba(0, 0, 0, 0.1) 0px 0px 1px inset;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.voice-actions-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: all 0.3s;
}

.voice-actions-container.is-recording {
  opacity: 0.3;
  pointer-events: none;
}

.text-voice-input-new {
  width: 100%;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  padding: 8px;
  font-size: 14px;
  resize: none;
  background: rgba(255, 255, 255, 0.8);
  color: var(--chat-header-text, var(--color-text, #333));
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s;
  
  &:focus {
    border-color: var(--color-primary, #7dd3a8);
    background: #fff;
  }
}

.send-text-voice-btn {
  width: 100%;
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary, #7dd3a8);
  color: #fff;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  &:active:not(:disabled) {
    transform: scale(0.98);
  }
}

.hint-text {
  text-align: center;
  font-size: 12px;
  color: #666;
  margin-top: 4px;
}

.recording-time-text {
  color: #e53e3e;
  font-weight: bold;
}

// 麥克風按鈕樣式
.mic-btn {
  &:active {
    color: #e53e3e;
  }
}

// 聚焦時出現的行內錄音按鈕
.mic-inline-btn {
  color: var(--color-text-muted, #999);

  &:hover {
    color: var(--color-primary, #7dd3a8);
  }

  &:active {
    color: #e53e3e;
  }
}

// 淡入滑動動畫
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(-8px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(8px);
}

// 表情包面板滑入動畫
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(100%);
}

// 淡入淡出動畫
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
