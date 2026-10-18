<script setup lang="ts">
/**
 * 開 App 時跳的公告明信片：標題、一句話、最多 3 個重點，完整內容在「完整行程」。
 * info 點外面就收進信箱；important 要按按鈕；critical（電報）沒有「稍後再看」。
 */
import {
  countAnnouncementStops,
  getPopupHighlights,
  type Announcement,
} from "@/services/AnnouncementService";
import { ChevronRight, Compass, ExternalLink, House, Mail, TriangleAlert } from "lucide-vue-next";
import { computed, onMounted } from "vue";
import {
  ANNOUNCEMENT_KIND_LABELS,
  announcementIcon,
  ensureAnnouncementFont,
  splitAnnouncementDate,
} from "./announcementUi";

const props = defineProps<{
  announcement: Announcement;
  /** 信箱裡其他還沒拆的張數 */
  otherUnread?: number;
}>();

const emit = defineEmits<{
  receive: [id: string];
  later: [];
  "open-itinerary": [id: string];
  "open-mailbox": [];
}>();

onMounted(ensureAnnouncementFont);

const level = computed(() => props.announcement.level || "info");
const canLater = computed(
  () => level.value !== "critical" && props.announcement.dismissable !== false,
);
const date = computed(() => splitAnnouncementDate(props.announcement.date));
const highlights = computed(() => getPopupHighlights(props.announcement));
const stops = computed(() => countAnnouncementStops(props.announcement.body));
const titleId = computed(() => `ann-title-${props.announcement.id}`);

function handleOverlay() {
  if (level.value === "info" && canLater.value) emit("later");
}

function handleAction() {
  if (props.announcement.actionUrl) {
    window.open(props.announcement.actionUrl, "_blank", "noopener,noreferrer");
  }
}
</script>

<template>
  <div class="ann-overlay" @click.self="handleOverlay">
    <div
      class="ann-card"
      :class="`level-${level}`"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
    >
      <div class="ann-paper">
        <div v-if="level === 'critical'" class="ann-telegram">
          <span class="ann-mono">TELEGRAM</span>
          <span class="ann-telegram__urgent"><TriangleAlert :size="15" aria-hidden="true" />急件</span>
        </div>

        <header class="ann-head">
          <div class="ann-head__meta">
            <span class="ann-mono ann-muted">{{ ANNOUNCEMENT_KIND_LABELS[level] }}</span>
            <span v-if="date.full" class="ann-mono ann-head__date">{{ date.full }}</span>
            <span class="ann-hand ann-muted">寄到 203 號房</span>
          </div>
          <div v-if="level !== 'critical'" class="ann-stamp-wrap" aria-hidden="true">
            <div class="ann-stamp">
              <span class="ann-stamp__inner">
                <House :size="26" :stroke-width="1.6" />
                <span class="ann-mono">203</span>
              </span>
            </div>
            <div v-if="level === 'important'" class="ann-postmark">
              <span class="ann-mono ann-postmark__top">掛號</span>
              <span class="ann-mono ann-postmark__date">{{ date.monthDay || "203" }}</span>
            </div>
          </div>
        </header>

        <img
          v-if="announcement.imageUrl"
          :src="announcement.imageUrl"
          :alt="announcement.title"
          class="ann-cover"
          loading="lazy"
        />

        <div class="ann-titlebox">
          <h2 :id="titleId" class="ann-title ann-hand">{{ announcement.title }}</h2>
          <p v-if="announcement.summary" class="ann-summary">{{ announcement.summary }}</p>
        </div>

        <template v-if="highlights.length">
          <div class="ann-divider" />
          <div class="ann-hl">
            <div class="ann-hl__label ann-hand">這趟帶回來的</div>
            <div v-for="(item, i) in highlights" :key="i" class="ann-hl__row">
              <span class="ann-hl__icon" aria-hidden="true">
                <component :is="announcementIcon(item.icon)" :size="18" :stroke-width="1.7" />
              </span>
              <span class="ann-hl__text">
                <span class="ann-hl__title">{{ item.title }}</span>
                <span v-if="item.detail" class="ann-hl__detail">{{ item.detail }}</span>
              </span>
            </div>
          </div>
        </template>

        <div v-if="announcement.howto" class="ann-howto">
          <Compass :size="18" :stroke-width="1.7" aria-hidden="true" />
          <span>怎麼用：{{ announcement.howto }}</span>
        </div>

        <div class="ann-actions">
          <button type="button" class="ann-btn ann-btn--primary" @click="emit('receive', announcement.id)">
            收下了
          </button>
          <button
            v-if="announcement.actionUrl"
            type="button"
            class="ann-btn ann-btn--outline"
            @click="handleAction"
          >
            {{ announcement.actionLabel }}
            <ExternalLink :size="15" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="ann-btn ann-btn--link"
            @click="emit('open-itinerary', announcement.id)"
          >
            {{ stops > 0 ? `看完整行程（${stops} 站）` : "看完整內容" }}
            <ChevronRight :size="16" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>

    <div v-if="canLater" class="ann-below">
      <button type="button" class="ann-below__btn" @click="emit('later')">稍後再看</button>
      <template v-if="otherUnread">
        <span class="ann-below__dot" aria-hidden="true">·</span>
        <button type="button" class="ann-below__btn" @click="emit('open-mailbox')">
          <Mail :size="16" aria-hidden="true" />
          信箱還有 {{ otherUnread }} 張沒拆
        </button>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.ann-overlay {
  --ann-paper: #fffdf8;
  --ann-ink: #26303b;
  --ann-muted: #5a6470;
  --ann-navy: #2b4162;
  --ann-clay: #b5502f;
  --ann-line: #d8cdbf;
  --ann-chip: #e7ecf3;
  --ann-stamp: #f4e4d4;
  --ann-tip: #f3eee6;

  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: calc(16px + var(--safe-top, 0px)) 20px 16px;
  background: rgba(24, 30, 38, 0.62);
  backdrop-filter: blur(6px);
  font-family: "Noto Sans TC", -apple-system, sans-serif;
  color: var(--ann-ink);
}

.ann-hand {
  font-family: "LXGW WenKai TC", "Noto Serif TC", serif;
}

.ann-mono {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  letter-spacing: 0.12em;
}

.ann-muted {
  color: var(--ann-muted);
}

.ann-card {
  width: 100%;
  max-width: 360px;
  max-height: calc(100% - 64px);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  border-radius: 16px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);

  &.level-info {
    border: 1px solid #e0d6c8;
    background: var(--ann-paper);
  }

  // 掛號信：航空信封紅藍斜紋邊
  &.level-important {
    padding: 6px;
    background: repeating-linear-gradient(
      135deg,
      var(--ann-clay) 0 12px,
      var(--ann-paper) 12px 22px,
      var(--ann-navy) 22px 34px,
      var(--ann-paper) 34px 44px
    );
  }

  &.level-critical {
    border: 2px solid var(--ann-ink);
    background: var(--ann-paper);
    overflow: hidden;
  }
}

.ann-paper {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--ann-paper);
  border-radius: 11px;
  padding: 20px 20px 14px;
  display: flex;
  flex-direction: column;
  gap: 16px;

  .level-critical & {
    border-radius: 0;
    padding-top: 0;
  }
}

.ann-telegram {
  margin: 0 -20px;
  padding: 10px 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--ann-ink);
  color: #fff;
  font-size: 12px;

  &__urgent {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0;
  }
}

.ann-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;

  &__meta {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 4px;
    font-size: 11px;
    min-width: 0;

    .ann-hand {
      font-size: 15px;
    }
  }

  &__date {
    font-size: 13px;
    letter-spacing: 0.06em;
    color: var(--ann-ink);
  }
}

.ann-stamp-wrap {
  position: relative;
  width: 104px;
  height: 82px;
  flex-shrink: 0;

  .level-info & {
    width: 64px;
  }
}

.ann-stamp {
  position: absolute;
  right: 0;
  top: 0;
  width: 62px;
  height: 76px;
  box-sizing: border-box;
  padding: 4px;
  background: var(--ann-paper);
  border: 2px dashed rgba(181, 80, 47, 0.55);
  transform: rotate(3deg);

  &__inner {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: var(--ann-stamp);
    color: var(--ann-clay);
    font-size: 10px;
  }

  .level-info & {
    border-color: rgba(43, 65, 98, 0.45);

    .ann-stamp__inner {
      background: var(--ann-chip);
      color: var(--ann-navy);
    }
  }
}

.ann-postmark {
  position: absolute;
  left: 0;
  top: 18px;
  width: 62px;
  height: 62px;
  box-sizing: border-box;
  border-radius: 50%;
  border: 1.5px solid var(--ann-navy);
  color: var(--ann-navy);
  background: rgba(255, 253, 248, 0.45);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transform: rotate(-14deg);
  opacity: 0.85;

  &__top {
    font-size: 9px;
  }

  &__date {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
  }
}

.ann-cover {
  display: block;
  width: 100%;
  max-height: 180px;
  object-fit: cover;
  border-radius: 10px;
}

.ann-titlebox {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ann-title {
  margin: 0;
  font-size: 25px;
  font-weight: 700;
  line-height: 1.3;
  word-break: break-word;
}

.ann-summary {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--ann-muted);
}

.ann-divider {
  border-top: 1.5px dashed var(--ann-line);
}

.ann-hl {
  display: flex;
  flex-direction: column;
  gap: 12px;

  &__label {
    font-size: 14px;
    color: var(--ann-muted);
  }

  &__row {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  &__icon {
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ann-chip);
    color: var(--ann-navy);
  }

  &__text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-top: 1px;
    min-width: 0;
  }

  &__title {
    font-size: 15px;
    font-weight: 700;
    line-height: 1.45;
  }

  &__detail {
    font-size: 13px;
    line-height: 1.5;
    color: var(--ann-muted);
  }
}

.ann-howto {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--ann-tip);
  color: #4a535e;
  font-size: 12.5px;
  line-height: 1.5;

  svg {
    flex-shrink: 0;
    color: var(--ann-muted);
  }
}

.ann-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 2px;
}

.ann-btn {
  min-height: 44px;
  border-radius: 12px;
  font: inherit;
  font-size: 15px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;

  &--primary {
    min-height: 48px;
    border: none;
    background: var(--ann-navy);
    color: #fff;
    font-weight: 700;

    .level-critical & {
      background: var(--ann-clay);
    }
  }

  &--outline {
    border: 1.5px solid var(--ann-navy);
    background: transparent;
    color: var(--ann-navy);
    font-weight: 500;
  }

  &--link {
    border: none;
    background: transparent;
    color: var(--ann-navy);
    font-size: 14px;
    font-weight: 500;
  }
}

.ann-below {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  color: #fff;

  &__btn {
    min-height: 44px;
    padding: 0 8px;
    border: none;
    background: transparent;
    color: #fff;
    font: inherit;
    font-size: 13px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  &__dot {
    opacity: 0.7;
  }
}
</style>
