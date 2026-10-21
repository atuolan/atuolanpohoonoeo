<script setup lang="ts">
/** 舊噗頭像：預覽、重新隨機、六種風格（存檔後回傳頭像網址） */
import { computed, ref, watch } from "vue";
import { Check, RefreshCw, X } from "lucide-vue-next";

const AVATAR_STYLES = [
  { label: "日系", value: "lorelei" },
  { label: "冒險", value: "adventurer" },
  { label: "簡約", value: "micah" },
  { label: "像素", value: "pixel-art" },
  { label: "Notion", value: "notionists" },
  { label: "機器", value: "bottts" },
] as const;

const props = withDefaults(
  defineProps<{
    open: boolean;
    avatar: string;
  }>(),
  { avatar: "" },
);

const emit = defineEmits<{
  (e: "close"): void;
  (e: "save", avatarUrl: string): void;
}>();

const draft = ref(props.avatar);
const style = ref(styleOf(props.avatar));

function styleOf(url: string): string {
  const hit = AVATAR_STYLES.find((s) => url.includes(`/7.x/${s.value}/`));
  return hit?.value ?? AVATAR_STYLES[0].value;
}

function randomAvatarUrl(currentStyle: string): string {
  const seed = Math.random().toString(36).substring(7);
  let url = `https://api.dicebear.com/7.x/${currentStyle}/svg?seed=user-${seed}`;

  // 這幾種風格加底色比較好看
  if (["lorelei", "notionists", "micah"].includes(currentStyle)) {
    url += "&backgroundColor=b6e3f4,c0aede,d1d4f9,ffdfbf,ffd5dc";
  }

  return url;
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    draft.value = props.avatar;
    style.value = styleOf(props.avatar);
  },
);

const preview = computed(() => draft.value);

function randomize() {
  draft.value = randomAvatarUrl(style.value);
}

function pickStyle(value: string) {
  style.value = value;
  draft.value = randomAvatarUrl(value);
}

function save() {
  emit("save", draft.value);
  emit("close");
}
</script>

<template>
  <Teleport to="body">
    <Transition name="plurk-dim-fade">
      <div v-if="props.open" class="plurk-dim" @click="emit('close')"></div>
    </Transition>
    <Transition name="plurk-sheet-slide">
      <section
        v-if="props.open"
        class="legacy-avatar-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="換頭像"
      >
        <span class="sheet-handle" aria-hidden="true"></span>

        <div class="sheet-head">
          <span class="sheet-title">換頭像</span>
          <button type="button" class="head-close" aria-label="關閉" @click="emit('close')">
            <X :size="18" />
          </button>
        </div>

        <div class="avatar-block">
          <div class="avatar-wrap">
            <img v-if="preview" :src="preview" class="avatar-img" alt="頭像預覽" />
            <span v-else class="avatar-empty" aria-hidden="true"></span>
            <button
              type="button"
              class="avatar-refresh"
              aria-label="隨機生成新頭像"
              @click="randomize"
            >
              <RefreshCw :size="18" />
            </button>
          </div>
        </div>

        <div class="style-grid" role="group" aria-label="頭像風格">
          <button
            v-for="s in AVATAR_STYLES"
            :key="s.value"
            type="button"
            class="style-btn"
            :class="{ 'is-on': style === s.value }"
            :aria-pressed="style === s.value"
            @click="pickStyle(s.value)"
          >
            {{ s.label }}
          </button>
        </div>

        <div class="sheet-actions">
          <button type="button" class="btn btn--ghost" @click="emit('close')">取消</button>
          <button type="button" class="btn btn--primary" @click="save">
            <Check :size="16" />
            儲存
          </button>
        </div>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
@use "@/components/plurk/plurk-theme.scss" as *;

.plurk-dim {
  @include plurk-dim;
}

.legacy-avatar-sheet {
  @include plurk-sheet;

  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sheet-handle {
  align-self: center;
  width: 36px;
  height: 5px;
  border-radius: 3px;
  background: var(--color-border);
  flex-shrink: 0;
}

.sheet-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding-top: 4px;
}

.sheet-title {
  flex: 1;
  min-width: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text);
}

.head-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: $plurk-touch;
  height: $plurk-touch;
  margin-right: -10px;
  padding: 0;
  border: none;
  border-radius: 22px;
  background: none;
  color: var(--color-text-secondary);
  cursor: pointer;

  &:active {
    background: var(--color-surface-hover);
  }
}

.avatar-block {
  display: flex;
  justify-content: center;
  padding: 8px 0 4px;
}

.avatar-wrap {
  position: relative;
  width: 108px;
  height: 108px;
}

.avatar-img,
.avatar-empty {
  display: block;
  width: 108px;
  height: 108px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--color-surface-hover);
}

.avatar-refresh {
  position: absolute;
  right: -4px;
  bottom: -4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: $plurk-touch;
  height: $plurk-touch;
  padding: 0;
  border: 2px solid var(--color-surface);
  border-radius: 50%;
  background: var(--color-primary);
  color: var(--color-on-primary-contrast);
  cursor: pointer;

  &:active {
    opacity: 0.9;
  }
}

.style-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 4px 0 6px;
}

.style-btn {
  min-height: $plurk-touch;
  padding: 0 8px;
  border: 1.5px solid var(--color-border);
  border-radius: 12px;
  background: transparent;
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.2;
  cursor: pointer;
  transition:
    background 0.14s ease,
    color 0.14s ease;

  &:active {
    background: var(--color-surface-hover);
  }

  &.is-on {
    border-color: var(--color-primary);
    background: rgba(var(--color-primary-rgb), 0.12);
    color: var(--color-primary);
  }
}

.sheet-actions {
  display: flex;
  gap: 10px;
  padding: 2px 0 4px;
}

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: 1;
  min-height: $plurk-touch;
  padding: 0 16px;
  border: none;
  border-radius: 999px;
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;

  &:active {
    opacity: 0.9;
  }
}

.btn--ghost {
  background: var(--color-surface-hover);
  color: var(--color-text-secondary);
}

.btn--primary {
  background: var(--color-primary);
  color: var(--color-on-primary-contrast);
}

.plurk-dim-fade-enter-active,
.plurk-dim-fade-leave-active {
  transition: opacity 0.2s ease;
}

.plurk-dim-fade-enter-from,
.plurk-dim-fade-leave-to {
  opacity: 0;
}

.plurk-sheet-slide-enter-active,
.plurk-sheet-slide-leave-active {
  transition: transform 0.26s cubic-bezier(0.32, 0.72, 0, 1);
}

.plurk-sheet-slide-enter-from,
.plurk-sheet-slide-leave-to {
  transform: translateY(100%);
}
</style>
