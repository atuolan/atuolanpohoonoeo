<script setup lang="ts">
import { CHAT_FONT_STACKS, isFollowingGlobalWallpaper } from "@/utils/chatAppearanceVars";
import { hexToRgba } from "@/utils/chatScreenHelpers";
import { toPickerHex } from "@/utils/simpleGradient";
import { computed } from "vue";
import type { ColorFocusTarget, PreviewState, PreviewTarget } from "./types";

const props = defineProps<{
  state: PreviewState;
  focus: ColorFocusTarget | null;
}>();

const emit = defineEmits<{
  (e: "select", target: PreviewTarget): void;
}>();

const FOCUS_LABELS: Record<ColorFocusTarget, string> = {
  ai: "AI 氣泡",
  user: "我的氣泡",
  header: "頂欄",
  surface: "卡片",
  surfaceHover: "輔助色",
  status: "狀態色",
};

type StyleMap = Record<string, string>;

/** 文字色：有漸層時用 background-clip: text，與聊天頁 MessageBubble 的做法一致 */
function textStyle(color: string | undefined, gradient: string | undefined): StyleMap {
  if (gradient) {
    return {
      backgroundImage: gradient,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      WebkitTextFillColor: "transparent",
      color: "transparent",
    };
  }
  return { color: color ?? "inherit" };
}

const colors = computed(() => props.state.colors);
const bubble = computed(() => props.state.bubble);

const fontStyle = computed<StyleMap>(() => ({
  fontFamily: CHAT_FONT_STACKS[props.state.font.family] ?? CHAT_FONT_STACKS.system,
  fontSize: `${props.state.fontSizePx}px`,
  lineHeight: `${props.state.font.lineHeight}`,
  letterSpacing: `${props.state.font.letterSpacing}px`,
}));

const avatarStyle = computed<StyleMap>(() => {
  const a = props.state.avatar;
  return {
    borderRadius: a.shape === "circle" ? "50%" : a.shape === "rounded" ? "10px" : "6px",
    border: `${a.borderWidth}px solid ${a.borderColor || "#ffffff"}`,
    boxShadow: a.shadowEnabled ? `0 4px 12px ${colors.value.shadow}` : "none",
  };
});

const wallpaperStyle = computed((): StyleMap => {
  const w = props.state.wallpaper;
  const fallback = colors.value.background;
  const fit = w.fit || "cover";
  const layout = {
    backgroundSize: fit === "repeat" ? "auto" : fit === "fill" ? "100% 100%" : fit,
    backgroundRepeat: fit === "repeat" ? "repeat" : "no-repeat",
    backgroundPosition: "center",
  };
  if (isFollowingGlobalWallpaper(w)) {
    return { background: "var(--wallpaper-value, var(--color-background))", ...layout };
  }
  if (w.type === "image" && w.value) {
    return { backgroundColor: fallback, backgroundImage: `url("${w.value}")`, ...layout };
  }
  if (w.type === "time-theme") {
    return { background: "linear-gradient(135deg, #fff8f0 0%, #f8fafc 35%, #fef3e2 70%, #e0f2fe 100%)" };
  }
  return { background: w.value || fallback };
});

const thoughtStyle = computed<StyleMap>(() => {
  const b = bubble.value;
  const glow = toPickerHex(b.thoughtGlowColor, "#ADD8E6");
  const opacity = b.thoughtGlowOpacity ?? 0.6;
  return {
    background: b.thoughtBgGradient || hexToRgba(toPickerHex(b.thoughtBgColor, "#ADD8E6"), 0.9),
    boxShadow: `0 0 8px ${hexToRgba(glow, opacity)}, 0 0 16px ${hexToRgba(glow, opacity * 0.6)}`,
  };
});

function onKey(target: PreviewTarget) {
  emit("select", target);
}
</script>

<template>
  <div class="chat-preview">
    <div class="preview-label">預覽 <span class="preview-hint">點擊畫面中的元素即可調整</span></div>
    <div class="preview-card">
      <div
        class="preview-header preview-clickable"
        :class="{ 'preview-focused': focus === 'header' }"
        :style="{ background: colors.surface }"
        tabindex="0"
        role="button"
        aria-label="調整頂欄顏色"
        @click="emit('select', 'header')"
        @keydown.enter="onKey('header')"
      >
        <span class="preview-header-btn" :style="{ color: colors.text }" aria-hidden="true">‹</span>
        <div class="preview-header-avatar" :style="avatarStyle" aria-hidden="true">
          <span>🐾</span>
        </div>
        <div class="preview-header-title">
          <span :style="{ color: colors.text }">AI 角色</span>
          <small :style="{ color: colors.textSecondary }">✎</small>
        </div>
        <span class="preview-header-btn" :style="{ color: colors.text }" aria-hidden="true">⌄</span>
        <span v-if="focus === 'header'" class="focus-badge">{{ FOCUS_LABELS.header }}</span>
      </div>

      <div
        class="preview-body"
        :style="wallpaperStyle"
        tabindex="0"
        role="button"
        aria-label="調整背景"
        @click="emit('select', 'wallpaper')"
        @keydown.enter.self="onKey('wallpaper')"
      >
        <div class="preview-message-row ai">
          <div class="preview-row-avatar" :class="'size-' + state.avatar.size" :style="avatarStyle" aria-hidden="true">
            <span>🐾</span>
          </div>
          <div class="preview-message-content">
            <div class="preview-sender-name">
              <span :style="textStyle(bubble.aiTextColor, bubble.aiTextGradient)">AI 角色</span>
            </div>
            <div
              class="preview-bubble ai"
              :class="{ 'preview-focused': focus === 'ai' }"
              :style="{
                borderRadius: `${bubble.borderRadius}px`,
                borderBottomLeftRadius: '6px',
                maxWidth: `${bubble.maxWidth}%`,
                background: bubble.aiBgGradient || bubble.aiBgColor,
                ...fontStyle,
              }"
              tabindex="0"
              role="button"
              aria-label="調整 AI 氣泡顏色"
              @click.stop="emit('select', 'ai')"
              @keydown.enter.stop="onKey('ai')"
            >
              <span :style="textStyle(bubble.aiContentColor, bubble.aiContentGradient)">這是 AI 的訊息氣泡</span>
              <span class="preview-time" :style="textStyle(bubble.aiTextColor, bubble.aiTextGradient)">12:00</span>
              <span v-if="focus === 'ai'" class="focus-badge">{{ FOCUS_LABELS.ai }}</span>
            </div>
            <div
              class="preview-thought"
              :style="thoughtStyle"
              tabindex="0"
              role="button"
              aria-label="調整想法氣泡顏色"
              @click.stop="emit('select', 'ai')"
              @keydown.enter.stop="onKey('ai')"
            >
              <span :style="textStyle(bubble.thoughtTextColor, bubble.thoughtTextGradient)">💭 角色的內心想法</span>
            </div>
          </div>
        </div>

        <div class="preview-message-row user">
          <div class="preview-message-content">
            <div
              class="preview-bubble user"
              :class="{ 'preview-focused': focus === 'user' }"
              :style="{
                borderRadius: `${bubble.borderRadius}px`,
                borderBottomRightRadius: '6px',
                maxWidth: `${bubble.maxWidth}%`,
                background: bubble.userBgGradient || bubble.userBgColor,
                ...fontStyle,
              }"
              tabindex="0"
              role="button"
              aria-label="調整我的氣泡顏色"
              @click.stop="emit('select', 'user')"
              @keydown.enter.stop="onKey('user')"
            >
              <span :style="textStyle(bubble.userTextColor, bubble.userTextGradient)">這是我的訊息氣泡</span>
              <span class="preview-time" :style="textStyle(bubble.userTextColor, bubble.userTextGradient)">12:01</span>
              <span v-if="focus === 'user'" class="focus-badge">{{ FOCUS_LABELS.user }}</span>
            </div>
          </div>
          <div
            class="preview-row-avatar user-side"
            :class="'size-' + state.avatar.size"
            :style="avatarStyle"
            aria-hidden="true"
          >
            <span>🙂</span>
          </div>
        </div>

        <div class="preview-ui-samples">
          <div
            class="preview-ui-card preview-clickable"
            :class="{ 'preview-focused': focus === 'surface' }"
            :style="{ background: colors.surface, borderColor: colors.border, color: colors.text }"
            tabindex="0"
            role="button"
            aria-label="調整卡片背景與主要文字"
            @click.stop="emit('select', 'surface')"
            @keydown.enter.stop="onKey('surface')"
          >
            <span class="preview-ui-title">卡片背景 / 主要文字</span>
            <span :style="{ color: colors.textMuted }">提示文字範例</span>
            <span v-if="focus === 'surface'" class="focus-badge">{{ FOCUS_LABELS.surface }}</span>
          </div>
          <div
            class="preview-ui-card preview-clickable"
            :class="{ 'preview-focused': focus === 'surfaceHover' }"
            :style="{ background: colors.surfaceHover, borderColor: colors.secondary, color: colors.textSecondary }"
            tabindex="0"
            role="button"
            aria-label="調整滑過背景與輔助色"
            @click.stop="emit('select', 'surfaceHover')"
            @keydown.enter.stop="onKey('surfaceHover')"
          >
            <span class="preview-ui-title">滑過背景 / 輔助色</span>
            <span>次要文字範例</span>
            <span v-if="focus === 'surfaceHover'" class="focus-badge">{{ FOCUS_LABELS.surfaceHover }}</span>
          </div>
          <div
            class="preview-status-row preview-clickable"
            :class="{ 'preview-focused': focus === 'status' }"
            tabindex="0"
            role="button"
            aria-label="調整狀態提示顏色"
            @click.stop="emit('select', 'status')"
            @keydown.enter.stop="onKey('status')"
          >
            <span :style="{ background: colors.success }">成功</span>
            <span :style="{ background: colors.error }">錯誤</span>
            <span :style="{ background: colors.warning }">警告</span>
            <span v-if="focus === 'status'" class="focus-badge">{{ FOCUS_LABELS.status }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.preview-label {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 8px;
}

.preview-hint {
  margin-left: 4px;
  font-size: 11px;
  opacity: 0.85;
}

.preview-card {
  border-radius: 20px;
  overflow: hidden;
  box-shadow:
    0 10px 28px rgba(0, 0, 0, 0.1),
    0 2px 6px rgba(0, 0, 0, 0.05);
}

.preview-header {
  margin: 12px 12px 0;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  border-radius: 22px;
  font-size: 14px;
  font-weight: 500;
  position: relative;
  z-index: 1;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.45),
    0 6px 16px rgba(0, 0, 0, 0.06);
}

.preview-header-btn {
  width: 34px;
  height: 34px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.45);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  line-height: 1;
}

.preview-header-avatar {
  width: 42px;
  height: 42px;
  min-width: 42px;
  background: linear-gradient(135deg, #1f2937, #020617);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;

  span {
    font-size: 20px;
    filter: saturate(0.7);
  }
}

.preview-header-title {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 700;
  }

  small {
    font-size: 13px;
    opacity: 0.75;
  }
}

.preview-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  cursor: pointer;
}

.preview-message-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;

  &.user {
    justify-content: flex-end;
  }
}

.preview-row-avatar {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, #cbd5f5, #a5b4fc);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-size: 18px;

  &.size-small {
    width: 30px;
    height: 30px;
    font-size: 15px;
  }

  &.size-large {
    width: 44px;
    height: 44px;
    font-size: 22px;
  }

  &.user-side {
    background: linear-gradient(135deg, #fbcfe8, #f9a8d4);
  }
}

.preview-message-content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  flex: 1;

  .preview-message-row.user & {
    align-items: flex-end;
  }
}

.preview-sender-name {
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 4px;
  padding-left: 4px;
}

// 與聊天頁一致：時間在氣泡內，使用「名稱／時間」文字色
.preview-time {
  display: block;
  width: fit-content;
  margin-top: 2px;
  margin-left: auto;
  font-size: 11px;
  line-height: 1.3;
  font-style: normal;
  letter-spacing: 0;
  opacity: 0.75;
}

.preview-bubble {
  padding: 10px 14px;
  position: relative;
  cursor: pointer;
  transition:
    box-shadow 0.2s ease,
    transform 0.15s ease;
  width: fit-content;
  word-break: break-word;

  &.ai {
    box-shadow: var(--shadow-sm);
  }

  &:hover {
    box-shadow:
      0 0 0 2px var(--color-primary),
      0 4px 12px rgba(0, 0, 0, 0.1);
  }

  &.preview-focused {
    box-shadow:
      0 0 0 2.5px var(--color-primary),
      0 0 12px rgba(0, 0, 0, 0.15);
    transform: scale(1.02);
  }
}

.preview-thought {
  margin-top: 6px;
  padding: 6px 12px;
  border-radius: 14px;
  font-size: 12px;
  font-style: italic;
  cursor: pointer;
  width: fit-content;
  max-width: 100%;
}

.preview-clickable {
  cursor: pointer;
  position: relative;
  transition: box-shadow 0.2s ease;

  &:hover {
    box-shadow: 0 0 0 2px var(--color-primary-light);
  }

  &.preview-focused {
    box-shadow:
      0 0 0 2.5px var(--color-primary),
      0 0 12px rgba(0, 0, 0, 0.12);
  }
}

.focus-badge {
  position: absolute;
  top: -8px;
  right: 6px;
  background: var(--color-primary);
  color: #fff;
  -webkit-text-fill-color: #fff;
  font-size: 10px;
  font-weight: 600;
  font-style: normal;
  letter-spacing: 0;
  line-height: 1.4;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
  z-index: 2;
  animation: focus-badge-in 0.2s ease;
}

@keyframes focus-badge-in {
  from {
    opacity: 0;
    transform: scale(0.8);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.preview-ui-samples {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 8px;
  margin-top: 4px;
}

.preview-ui-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid;
  border-radius: var(--radius-md);
  font-size: 11px;
  min-width: 0;
}

.preview-ui-title {
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  min-height: 28px;
  padding: 4px;
  border-radius: var(--radius-md);

  > span:not(.focus-badge) {
    padding: 5px 8px;
    border-radius: 999px;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
  }
}
</style>
