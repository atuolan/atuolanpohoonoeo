<script setup lang="ts">
import type { ChatMessageLayout } from "@/stores/theme";
import {
  BUBBLE_SHADOWS,
  CHAT_FONT_STACKS,
  MESSAGE_GAP_PX,
  MESSAGE_GROUP_GAP_PX,
  buildBarBackdrop,
  buildBarBackground,
  isFollowingGlobalWallpaper,
  withOpacity,
} from "@/utils/chatAppearanceVars";
import { hexToRgba } from "@/utils/chatScreenHelpers";
import { buildChatSkinAttrs, buildChatSkinVars, type ResolvedChatSkins } from "@/utils/chatSkinResolve";
import { toPickerHex } from "@/utils/simpleGradient";
import { computed } from "vue";
import type { PreviewElement, PreviewScene, PreviewState, PreviewTarget } from "./types";

const props = withDefaults(
  defineProps<{
    state: PreviewState;
    focus: PreviewElement | null;
    /** 訊息排版（全域設定）：成組 / 經典 */
    layout?: ChatMessageLayout;
    /** 精簡版（設定視窗固定預覽用）：只畫 scene 需要的部分 */
    compact?: boolean;
    scene?: PreviewScene;
    /** 這次裝了哪些聊天裝扮（顏色、形狀照部件畫） */
    skins?: ResolvedChatSkins;
    /** 夜間模式：部件用夜間那套配色 */
    night?: boolean;
  }>(),
  { layout: "grouped", compact: false, scene: "pair", skins: () => ({}), night: false },
);

type PreviewPart = "header" | "body" | "separator" | "firstAi" | "thought" | "user" | "samples" | "input";

/** 精簡版各情境要畫的部分（完整版全部顯示） */
const SCENE_PARTS: Record<PreviewScene, PreviewPart[]> = {
  pair: ["body", "user"],
  thought: ["body", "thought"],
  conversation: ["body", "separator", "firstAi", "user"],
  messages: ["body", "separator", "firstAi", "thought", "user"],
  colors: ["body", "user", "samples"],
  header: ["header"],
  input: ["input"],
  headerPair: ["header", "body", "user"],
  pairInput: ["body", "user", "input"],
  full: ["header", "body", "separator", "firstAi", "thought", "user", "samples", "input"],
};

function showPart(part: PreviewPart) {
  return !props.compact || SCENE_PARTS[props.scene].includes(part);
}

const isClassic = computed(() => props.layout === "classic");

const emit = defineEmits<{
  (e: "select", target: PreviewTarget): void;
}>();

const FOCUS_LABELS: Record<PreviewElement, string> = {
  ai: "AI 氣泡",
  user: "我的氣泡",
  thought: "想法氣泡",
  avatar: "頭像",
  header: "頂欄",
  input: "輸入欄",
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

// ===== 聊天裝扮：部件配色（「用我自己的顏色」的欄位不輸出）與形狀 =====
const skinVars = computed(() => buildChatSkinVars(props.skins, props.night));
const skinAttrs = computed(() => buildChatSkinAttrs(props.skins));
const skinMessage = computed(() => !!props.skins.message);
const hidesHeaderAvatar = computed(() => !!props.skins.header?.piece.hidesHeaderAvatar);
const headerTextColor = computed(() => skinVars.value["--skin-header-text"] ?? colors.value.text);
const metaTextColor = computed(() => skinVars.value["--skin-meta-text"] ?? colors.value.textMuted);

/** 訊息文字色：部件有給就用部件的，否則照玩家設定 */
function bubbleTextStyle(skinVar: string, color: string | undefined, gradient: string | undefined): StyleMap {
  const skinColor = skinVars.value[skinVar];
  return skinColor ? { color: skinColor } : textStyle(color, gradient);
}

const fontStyle = computed<StyleMap>(() => ({
  fontFamily: CHAT_FONT_STACKS[props.state.font.family] ?? CHAT_FONT_STACKS.system,
  fontSize: `${props.state.fontSizePx}px`,
  lineHeight: `${props.state.font.lineHeight}`,
  letterSpacing: `${props.state.font.letterSpacing}px`,
}));

const avatarStyle = computed<StyleMap>(() => {
  const a = props.state.avatar;
  return {
    borderRadius: skinMessage.value ? "6px" : a.shape === "circle" ? "50%" : a.shape === "rounded" ? "10px" : "6px",
    border: `${a.borderWidth}px solid ${a.borderColor || "#ffffff"}`,
    boxShadow: a.shadowEnabled ? `0 4px 12px ${colors.value.shadow}` : "none",
  };
});

const wallpaperStyle = computed((): StyleMap => {
  const skinWallpaper = skinVars.value["--chat-wallpaper"];
  if (skinWallpaper) return { background: skinWallpaper };
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

/** 頂欄／輸入欄：與聊天頁相同的背景層與毛玻璃 */
function barStyle(kind: "header" | "input"): StyleMap {
  const skinBg = skinVars.value[kind === "header" ? "--skin-header-bg" : "--skin-input-bg"];
  if (skinBg) {
    const divider = skinVars.value[kind === "header" ? "--skin-header-divider" : "--skin-input-divider"];
    return { background: skinBg, ...(divider ? { "--pv-skin-divider": divider } : {}) };
  }
  const bar = props.state.bars[kind];
  const backdrop = buildBarBackdrop(bar.blur);
  return {
    background: buildBarBackground(kind, bar.opacity, {
      surface: colors.value.surface,
      background: colors.value.background,
    }),
    backdropFilter: backdrop,
    WebkitBackdropFilter: backdrop,
  };
}

/** 氣泡底色與質感；陰影走 CSS 變數，才不會蓋掉預覽的聚焦外框 */
function bubbleSurface(side: "ai" | "user"): StyleMap {
  const b = bubble.value;
  const fx = props.state.bubbleEffects;
  const bg = side === "ai" ? b.aiBgGradient || b.aiBgColor : b.userBgGradient || b.userBgColor;
  const style: StyleMap = { background: withOpacity(bg, fx.opacity) };
  if (fx.blur > 0) {
    style.backdropFilter = `blur(${fx.blur}px) saturate(160%)`;
    style.WebkitBackdropFilter = style.backdropFilter;
  }
  if (fx.shadow !== "theme") style["--pv-bubble-shadow"] = BUBBLE_SHADOWS[fx.shadow];
  if (fx.borderWidth > 0) {
    style.outline = `${fx.borderWidth}px solid ${fx.borderColor || colors.value.border}`;
    style.outlineOffset = `-${fx.borderWidth}px`;
  }
  if (skinMessage.value) {
    const skinBg = skinVars.value[side === "ai" ? "--bubble-ai-bg" : "--bubble-user-bg"];
    if (skinBg) style.background = skinBg;
    style["--pv-bubble-shadow"] = "none";
    // 小尖角跟氣泡同色（漸層時取不到單色，就不畫）
    if (!style.background.includes("gradient")) style["--pv-tail"] = style.background;
  }
  return style;
}

/** 裝了訊息部件：圓角固定 4px（形狀不跟「用我自己的顏色」走） */
const SKIN_BUBBLE_RADIUS: StyleMap = {
  borderRadius: "4px",
  borderTopLeftRadius: "4px",
  borderTopRightRadius: "4px",
  borderBottomLeftRadius: "4px",
  borderBottomRightRadius: "4px",
};

const bodyStyle = computed<StyleMap>(() => ({
  gap: `${MESSAGE_GAP_PX[props.state.messageSpacing] ?? MESSAGE_GAP_PX.normal}px`,
}));

/** 角色連續兩則：成組時用同組間距，經典時與一般訊息間距相同 */
const aiGroupStyle = computed<StyleMap>(() => ({
  gap: isClassic.value
    ? bodyStyle.value.gap
    : `${MESSAGE_GROUP_GAP_PX[props.state.messageSpacing] ?? MESSAGE_GROUP_GAP_PX.normal}px`,
}));

/** AI 氣泡：成組的第二則上方靠頭像的角也收小，與聊天頁一致 */
function aiBubbleStyle(position: "first" | "last"): StyleMap {
  const style: StyleMap = {
    borderRadius: `${bubble.value.borderRadius}px`,
    borderBottomLeftRadius: "6px",
    maxWidth: `${bubble.value.maxWidth}%`,
    ...bubbleSurface("ai"),
    ...fontStyle.value,
  };
  // 只有前面真的有同組第一則時，才算「最後一則」收小上角
  if (!isClassic.value && position === "last" && showPart("firstAi")) style.borderTopLeftRadius = "6px";
  if (skinMessage.value) Object.assign(style, SKIN_BUBBLE_RADIUS);
  return style;
}

const userBubbleStyle = computed<StyleMap>(() => ({
  borderRadius: `${bubble.value.borderRadius}px`,
  borderBottomRightRadius: "6px",
  maxWidth: `${bubble.value.maxWidth}%`,
  ...bubbleSurface("user"),
  ...fontStyle.value,
  ...(skinMessage.value ? SKIN_BUBBLE_RADIUS : {}),
}));

function onKey(target: PreviewTarget) {
  emit("select", target);
}
</script>

<template>
  <div class="chat-preview" :class="{ compact }" v-bind="skinAttrs">
    <div v-if="!compact" class="preview-label">預覽 <span class="preview-hint">點擊畫面中的元素即可調整</span></div>
    <div class="preview-card" :style="wallpaperStyle">
      <div
        v-if="showPart('header')"
        class="preview-header preview-clickable"
        :class="{ 'preview-focused': focus === 'header', docked: state.bars.header.docked }"
        :style="barStyle('header')"
        tabindex="0"
        role="button"
        aria-label="調整頂欄"
        @click="emit('select', 'header')"
        @keydown.enter="onKey('header')"
      >
        <span class="preview-header-btn" :style="{ color: headerTextColor }" aria-hidden="true">‹</span>
        <div v-if="!hidesHeaderAvatar" class="preview-header-avatar" :style="avatarStyle" aria-hidden="true">
          <span>🐾</span>
        </div>
        <div class="preview-header-title">
          <span :style="{ color: headerTextColor }">AI 角色</span>
          <small :style="{ color: skinVars['--skin-header-text-secondary'] ?? colors.textSecondary }">✎</small>
        </div>
        <span class="preview-header-btn" :style="{ color: headerTextColor }" aria-hidden="true">{{ skins.header ? "⋯" : "⌄" }}</span>
        <span v-if="focus === 'header'" class="focus-badge">{{ FOCUS_LABELS.header }}</span>
      </div>

      <div
        v-if="showPart('body')"
        class="preview-body"
        :style="bodyStyle"
        tabindex="0"
        role="button"
        aria-label="調整背景"
        @click="emit('select', 'wallpaper')"
        @keydown.enter.self="onKey('wallpaper')"
      >
        <!-- 時間分隔：經典 = 換日時的「── 今天 ──」；成組 = 置中時間 -->
        <div v-if="showPart('separator')" class="preview-separator" :class="{ classic: isClassic }" aria-hidden="true">
          <i v-if="isClassic"></i>
          <span :style="skinMessage ? { background: 'transparent', color: metaTextColor } : { background: colors.surface, color: colors.textMuted }">{{ isClassic ? "今天" : "12:00" }}</span>
          <i v-if="isClassic"></i>
        </div>

        <!-- 角色連續兩則：成組時頭像與時間只在最後一則、不顯示名字 -->
        <div class="preview-ai-group" :style="aiGroupStyle">
          <div v-if="showPart('firstAi')" class="preview-message-row ai" :class="{ grouped: !isClassic }">
            <div
              class="preview-row-avatar"
              :class="['size-' + state.avatar.size, { 'preview-focused': focus === 'avatar', 'avatar-hidden': !isClassic }]"
              :style="avatarStyle"
              :tabindex="isClassic ? 0 : -1"
              role="button"
              aria-label="調整頭像"
              @click.stop="emit('select', 'avatar')"
              @keydown.enter.stop="onKey('avatar')"
            >
              <span aria-hidden="true">🐾</span>
            </div>
            <div class="preview-message-content">
              <div v-if="isClassic" class="preview-sender-name">
                <span :style="textStyle(bubble.aiTextColor, bubble.aiTextGradient)">AI 角色</span>
              </div>
              <div
                class="preview-bubble ai"
                :class="{ 'preview-focused': focus === 'ai' }"
                :style="aiBubbleStyle('first')"
                tabindex="0"
                role="button"
                aria-label="調整 AI 氣泡"
                @click.stop="emit('select', 'ai')"
                @keydown.enter.stop="onKey('ai')"
              >
                <span :style="bubbleTextStyle('--bubble-ai-content', bubble.aiContentColor, bubble.aiContentGradient)">這是 AI 的訊息氣泡</span>
                <span v-if="isClassic" class="preview-time" :style="textStyle(bubble.aiTextColor, bubble.aiTextGradient)">12:00</span>
                <span v-if="focus === 'ai'" class="focus-badge">{{ FOCUS_LABELS.ai }}</span>
              </div>
            </div>
          </div>

          <div class="preview-message-row ai" :class="{ grouped: !isClassic }">
            <div
              class="preview-row-avatar"
              :class="['size-' + state.avatar.size, { 'preview-focused': focus === 'avatar' }]"
              :style="avatarStyle"
              tabindex="0"
              role="button"
              aria-label="調整頭像"
              @click.stop="emit('select', 'avatar')"
              @keydown.enter.stop="onKey('avatar')"
            >
              <span aria-hidden="true">🐾</span>
            </div>
            <div class="preview-message-content">
              <div v-if="isClassic" class="preview-sender-name">
                <span :style="textStyle(bubble.aiTextColor, bubble.aiTextGradient)">AI 角色</span>
              </div>
              <div
                class="preview-bubble ai"
                :class="{ 'preview-focused': focus === 'ai' }"
                :style="aiBubbleStyle('last')"
                tabindex="0"
                role="button"
                aria-label="調整 AI 氣泡"
                @click.stop="emit('select', 'ai')"
                @keydown.enter.stop="onKey('ai')"
              >
                <span :style="bubbleTextStyle('--bubble-ai-content', bubble.aiContentColor, bubble.aiContentGradient)">{{
                  showPart("firstAi") ? "連續傳的第二則" : "這是 AI 的訊息氣泡"
                }}</span>
                <span v-if="isClassic" class="preview-time" :style="textStyle(bubble.aiTextColor, bubble.aiTextGradient)">12:00</span>
              </div>
              <div
                v-if="showPart('thought')"
                class="preview-thought"
              :class="{ 'preview-focused': focus === 'thought' }"
              :style="thoughtStyle"
              tabindex="0"
              role="button"
              aria-label="調整想法氣泡"
              @click.stop="emit('select', 'thought')"
              @keydown.enter.stop="onKey('thought')"
            >
              <span :style="textStyle(bubble.thoughtTextColor, bubble.thoughtTextGradient)">💭 角色的內心想法</span>
              <span v-if="focus === 'thought'" class="focus-badge">{{ FOCUS_LABELS.thought }}</span>
              </div>
            </div>
            <span v-if="!isClassic" class="preview-side-time" :style="{ color: metaTextColor }">12:00</span>
          </div>
        </div>

        <div v-if="showPart('user')" class="preview-message-row user" :class="{ grouped: !isClassic }">
          <span v-if="!isClassic" class="preview-side-time" :style="{ color: metaTextColor }">12:01</span>
          <div class="preview-message-content">
            <div
              class="preview-bubble user"
              :class="{ 'preview-focused': focus === 'user' }"
              :style="userBubbleStyle"
              tabindex="0"
              role="button"
              aria-label="調整我的氣泡"
              @click.stop="emit('select', 'user')"
              @keydown.enter.stop="onKey('user')"
            >
              <span :style="bubbleTextStyle('--bubble-user-text', bubble.userTextColor, bubble.userTextGradient)">這是我的訊息氣泡</span>
              <span v-if="isClassic" class="preview-time" :style="textStyle(bubble.userTextColor, bubble.userTextGradient)">12:01</span>
              <span v-if="focus === 'user'" class="focus-badge">{{ FOCUS_LABELS.user }}</span>
            </div>
          </div>
          <div
            class="preview-row-avatar user-side"
            :class="['size-' + state.avatar.size, { 'preview-focused': focus === 'avatar' }]"
            :style="avatarStyle"
            tabindex="0"
            role="button"
            aria-label="調整頭像"
            @click.stop="emit('select', 'avatar')"
            @keydown.enter.stop="onKey('avatar')"
          >
            <span aria-hidden="true">🙂</span>
          </div>
        </div>

        <div v-if="showPart('samples')" class="preview-ui-samples">
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

      <div
        v-if="showPart('input')"
        class="preview-input preview-clickable"
        :class="{ 'preview-focused': focus === 'input', docked: state.bars.input.docked }"
        :style="{ ...barStyle('input'), color: skinVars['--skin-input-icon'] ?? colors.textMuted }"
        tabindex="0"
        role="button"
        aria-label="調整輸入欄"
        @click="emit('select', 'input')"
        @keydown.enter="onKey('input')"
      >
        <span class="preview-input-btn" aria-hidden="true">＋</span>
        <span
          class="preview-input-field"
          :style="skinVars['--skin-input-field-bg'] ? { background: skinVars['--skin-input-field-bg'], color: skinVars['--skin-input-text'] } : {}"
          aria-hidden="true"
          >輸入訊息…</span
        >
        <span
          class="preview-input-send"
          :style="{ background: skinVars['--skin-send-bg'] ?? colors.primary, color: skinVars['--skin-send-text'] ?? '#fff' }"
          aria-hidden="true"
          >➤</span
        >
        <span v-if="focus === 'input'" class="focus-badge">{{ FOCUS_LABELS.input }}</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// ===== 聊天裝扮：綠泡泡的形狀（顏色由 script 依部件變數給） =====
.chat-preview[data-skin-message="greenbubble"] {
  .preview-bubble {
    box-shadow: none;
  }

  // 小尖角對準頭像中間
  .preview-bubble::before {
    content: "";
    position: absolute;
    top: 12px;
    border: 5px solid transparent;
  }

  .preview-bubble.ai::before {
    left: -9px;
    border-right-color: var(--pv-tail, transparent);
  }

  .preview-bubble.user::before {
    right: -9px;
    border-left-color: var(--pv-tail, transparent);
  }
}

.chat-preview[data-skin-header="greenbubble"] .preview-header {
  margin: 0;
  border-radius: 0;
  box-shadow: none;
  border: none;
  border-bottom: 1px solid var(--pv-skin-divider, transparent);

  .preview-header-btn {
    background: none;
    box-shadow: none;
  }

  .preview-header-title {
    justify-content: center;
  }
}

.chat-preview[data-skin-input="greenbubble"] .preview-input {
  margin: 0;
  border-radius: 0;
  box-shadow: none;
  border-top: 1px solid var(--pv-skin-divider, transparent);

  .preview-input-field {
    padding: 6px 10px;
    border-radius: 4px;
  }

  .preview-input-send {
    width: auto;
    height: 28px;
    padding: 0 12px;
    border-radius: 4px;
  }
}

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
  border: 1px solid transparent;
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

  &.docked {
    margin: 0;
    border-radius: 0;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  }
}

.preview-input {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 12px 12px;
  padding: 6px 8px;
  border-radius: 22px;
  font-size: 13px;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.45),
    0 6px 16px rgba(0, 0, 0, 0.06);

  &.docked {
    margin: 0;
    border-radius: 0;
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.08);
  }
}

.preview-input-btn {
  width: 28px;
  text-align: center;
  font-size: 18px;
  line-height: 1;
}

.preview-input-field {
  flex: 1;
  min-width: 0;
}

.preview-input-send {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  color: #fff;
  font-size: 12px;
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

  // 成組排版：頭像對齊泡泡底部，與聊天頁一致
  &.grouped {
    align-items: flex-end;
  }
}

.preview-ai-group {
  display: flex;
  flex-direction: column;
}

// 成組時每組最後一則在泡泡外側底部標時間，與聊天頁一致
.preview-side-time {
  flex-shrink: 0;
  margin: 0 -4px;
  padding-bottom: 2px;
  font-size: 10px;
  line-height: 1.2;
  white-space: nowrap;
}

// 成組時同組前面幾則不顯示頭像，但保留寬度讓泡泡對齊
.preview-row-avatar.avatar-hidden {
  visibility: hidden;
  height: 0;
}

.preview-separator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 11px;

  span {
    padding: 2px 10px;
    border-radius: 999px;
    font-variant-numeric: tabular-nums;
  }

  // 經典排版：兩側有橫線
  i {
    flex: 1;
    height: 1px;
    background: var(--color-border, #e2e8f0);
  }
}

// 精簡版（設定視窗固定預覽）：縮小內距
.chat-preview.compact {
  .preview-body {
    padding: 12px;
  }

  // 只畫頂欄或輸入欄時，上下留出背景
  .preview-header:not(.docked):last-child {
    margin-bottom: 12px;
  }

  .preview-input:not(.docked):first-child {
    margin-top: 12px;
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
    box-shadow: var(--pv-bubble-shadow, var(--shadow-sm));
  }

  &.user {
    box-shadow: var(--pv-bubble-shadow, none);
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

.preview-row-avatar,
.preview-thought {
  cursor: pointer;
  transition: outline-color 0.2s ease;
  outline: 2px solid transparent;
  outline-offset: 2px;

  &:hover {
    outline-color: var(--color-primary-light);
  }

  &.preview-focused {
    outline: 2.5px solid var(--color-primary);
  }
}

.preview-thought {
  position: relative;
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
