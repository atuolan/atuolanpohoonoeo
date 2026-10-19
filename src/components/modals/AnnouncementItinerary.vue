<script setup lang="ts">
/**
 * 公告的完整行程：body 裡每個 ann-section 是路線上的一站，最後一站回到 203 號房。
 */
import { countAnnouncementStops, type Announcement } from "@/services/AnnouncementService";
import { ChevronLeft, ExternalLink, House } from "lucide-vue-next";
import { marked } from "marked";
import { computed, onMounted } from "vue";
import { ensureAnnouncementFont, splitAnnouncementDate } from "./announcementUi";

const props = defineProps<{
  announcement: Announcement;
}>();

const emit = defineEmits<{
  close: [];
  receive: [id: string];
}>();

onMounted(ensureAnnouncementFont);

marked.setOptions({ breaks: true, gfm: true });

const date = computed(() => splitAnnouncementDate(props.announcement.date));
const stops = computed(() => countAnnouncementStops(props.announcement.body));

const renderedBody = computed(() => {
  let html: string;
  try {
    html = marked.parse(props.announcement.body) as string;
  } catch {
    html = props.announcement.body;
  }
  // 小標題開頭的 emoji 換成站牌標籤，這裡拿掉
  return html.replace(/(<h[2-4][^>]*>)[\p{Extended_Pictographic}️‍\s]+/gu, "$1");
});

function handleAction() {
  if (props.announcement.actionUrl) {
    window.open(props.announcement.actionUrl, "_blank", "noopener,noreferrer");
  }
}
</script>

<template>
  <div class="itn-root" role="dialog" aria-modal="true" aria-label="完整行程">
    <header class="itn-bar">
      <button type="button" class="itn-bar__back" aria-label="返回" @click="emit('close')">
        <ChevronLeft :size="22" aria-hidden="true" />
      </button>
      <span class="itn-bar__title itn-hand">旅行手帳</span>
      <span class="itn-bar__spacer" aria-hidden="true" />
    </header>

    <div class="itn-scroll">
      <div class="itn-ticket">
        <div v-if="date.full" class="itn-ticket__stub">
          <span v-if="date.year" class="itn-mono itn-ticket__year">{{ date.year }}</span>
          <span class="itn-mono itn-ticket__day">{{ date.monthDay }}</span>
        </div>
        <div class="itn-ticket__main">
          <h1 class="itn-ticket__title itn-hand">{{ announcement.title }}</h1>
          <p v-if="announcement.summary" class="itn-ticket__summary">{{ announcement.summary }}</p>
          <span v-if="stops > 0" class="itn-mono itn-ticket__stops">{{ stops }} STOPS</span>
        </div>
      </div>

      <img
        v-if="announcement.imageUrl"
        :src="announcement.imageUrl"
        :alt="announcement.title"
        class="itn-cover"
        loading="lazy"
      />

      <div class="itn-route" v-html="renderedBody" />

      <div class="itn-home">
        <span class="itn-home__icon" aria-hidden="true">
          <House :size="18" :stroke-width="1.7" />
        </span>
        <span class="itn-home__text">
          <span class="itn-home__title itn-hand">到家了</span>
          <span class="itn-home__detail">這趟更新就到這裡，歡迎回到 203 號房。</span>
        </span>
      </div>
    </div>

    <footer class="itn-footer">
      <button
        v-if="announcement.actionUrl"
        type="button"
        class="itn-btn itn-btn--outline"
        @click="handleAction"
      >
        {{ announcement.actionLabel }}
        <ExternalLink :size="15" aria-hidden="true" />
      </button>
      <button type="button" class="itn-btn itn-btn--primary" @click="emit('receive', announcement.id)">
        收下了
      </button>
    </footer>
  </div>
</template>

<style lang="scss" scoped>
.itn-root {
  --ann-ground: #f7f3ec;
  --ann-paper: #fffdf8;
  --ann-ink: #26303b;
  --ann-muted: #5a6470;
  --ann-body: #4a535e;
  --ann-navy: #2b4162;
  --ann-clay: #b5502f;
  --ann-sage: #4f6b4e;
  --ann-line: #d8cdbf;
  --ann-route: #c9bcab;

  position: fixed;
  inset: 0;
  z-index: 1110;
  display: flex;
  flex-direction: column;
  background: var(--ann-ground);
  color: var(--ann-ink);
  font-family: "Noto Sans TC", -apple-system, sans-serif;
  padding-top: var(--safe-top, 0px);
}

.itn-hand {
  font-family: "LXGW WenKai TC", "Noto Serif TC", serif;
}

.itn-mono {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  letter-spacing: 0.12em;
}

.itn-bar {
  height: 56px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;

  &__back {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  &__title {
    font-size: 18px;
    font-weight: 700;
  }

  &__spacer {
    width: 44px;
  }
}

.itn-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 4px 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 560px;
  width: 100%;
  box-sizing: border-box;
  margin: 0 auto;
}

.itn-ticket {
  display: flex;
  background: var(--ann-paper);
  border-radius: 14px;
  overflow: hidden;
  box-shadow:
    0 1px 0 rgba(38, 48, 59, 0.06),
    0 8px 24px rgba(38, 48, 59, 0.06);

  &__stub {
    width: 92px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 18px 0;
    background: var(--ann-navy);
    color: #fff;
    border-right: 2px dashed var(--ann-line);
  }

  &__year {
    font-size: 11px;
    opacity: 0.85;
  }

  &__day {
    font-size: 24px;
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  &__main {
    flex: 1;
    min-width: 0;
    padding: 16px 16px 16px 18px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 6px;
  }

  &__title {
    margin: 0;
    font-size: 21px;
    font-weight: 700;
    line-height: 1.3;
    word-break: break-word;
  }

  &__summary {
    margin: 0;
    font-size: 13px;
    line-height: 1.55;
    color: var(--ann-muted);
  }

  &__stops {
    font-size: 11px;
    color: var(--ann-muted);
  }
}

.itn-cover {
  display: block;
  width: 100%;
  max-height: 220px;
  object-fit: cover;
  border-radius: 12px;
}

// ===== 路線：每個 ann-section 是一站 =====
.itn-route {
  position: relative;
  padding-left: 44px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--ann-body);
  word-break: break-word;

  &::before {
    content: "";
    position: absolute;
    left: 16px;
    top: 8px;
    bottom: 0;
    border-left: 2px dashed var(--ann-route);
  }

  > :deep(p) {
    margin: 0 0 14px;
  }

  :deep(.ann-section),
  :deep(.ann-feature-box),
  :deep(.ann-bug-box) {
    --stop: var(--ann-navy);
    --stop-label: "途中";
    position: relative;
    margin: 0 0 18px;
    padding: 44px 16px 14px;
    background: var(--ann-paper);
    border-radius: 12px;
    color: var(--ann-body);

    // 路線上的站點
    &::before {
      content: "";
      position: absolute;
      left: -35px;
      top: 18px;
      width: 14px;
      height: 14px;
      box-sizing: border-box;
      border-radius: 50%;
      background: var(--stop);
      box-shadow: 0 0 0 4px var(--ann-ground);
    }

    // 站牌標籤
    &::after {
      content: var(--stop-label);
      position: absolute;
      left: 16px;
      top: 14px;
      padding: 3px 8px;
      border-radius: 6px;
      background: var(--stop);
      color: #fff;
      font-size: 11.5px;
      font-weight: 700;
      line-height: 1.4;
    }
  }

  :deep(.ann-section.feature),
  :deep(.ann-feature-box) {
    --stop-label: "新景點";
  }

  // 整修完成：空心站點、外框標籤
  :deep(.ann-section.update) {
    --stop-label: "整修完成";

    &::before {
      background: var(--ann-ground);
      border: 3px solid var(--ann-navy);
    }

    &::after {
      padding: 2px 7px;
      background: transparent;
      border: 1.5px solid var(--ann-navy);
      color: var(--ann-navy);
    }
  }

  // 出發前提醒：菱形站點
  :deep(.ann-section.important) {
    --stop: var(--ann-clay);
    --stop-label: "出發前提醒";

    &::before {
      border-radius: 3px;
      transform: rotate(45deg);
    }
  }

  :deep(.ann-section.bug),
  :deep(.ann-bug-box) {
    --stop: var(--ann-sage);
    --stop-label: "修好了";

    &::after {
      padding: 2px 7px;
      background: transparent;
      border: 1.5px solid var(--ann-sage);
      color: var(--ann-sage);
    }
  }

  :deep(h2),
  :deep(h3),
  :deep(h4) {
    margin: 0 0 8px;
    font-size: 16px;
    font-weight: 700;
    line-height: 1.4;
    color: var(--ann-ink);
  }

  :deep(* + h2),
  :deep(* + h3),
  :deep(* + h4) {
    margin-top: 16px;
  }

  :deep(.ann-section p),
  :deep(.ann-feature-box p),
  :deep(.ann-bug-box p) {
    margin: 0 0 8px;
  }

  :deep(p:last-child) {
    margin-bottom: 0;
  }

  :deep(strong),
  :deep(b) {
    font-weight: 700;
    color: var(--ann-ink);
  }

  :deep(em),
  :deep(i) {
    font-style: italic;
  }

  :deep(ul),
  :deep(ol) {
    margin: 0 0 8px;
    padding-left: 18px;
  }

  :deep(li) {
    margin: 2px 0;
  }

  :deep(img) {
    display: block;
    max-width: 100%;
    margin: 8px 0;
    border-radius: 8px;
  }

  :deep(a) {
    color: var(--ann-navy);
    text-decoration: underline;
  }

  :deep(code) {
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 0.88em;
    padding: 1px 5px;
    border-radius: 4px;
    background: #f0ebe2;
  }

  :deep(pre) {
    padding: 10px;
    border-radius: 8px;
    background: #f0ebe2;
    overflow-x: auto;
    font-size: 0.85em;
  }

  :deep(blockquote) {
    margin: 0 0 8px;
    padding-left: 10px;
    border-left: 3px solid var(--ann-line);
    color: var(--ann-muted);
  }
}

.itn-home {
  display: flex;
  gap: 14px;
  align-items: flex-start;

  &__icon {
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f4e4d4;
    color: var(--ann-clay);
  }

  &__text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 4px;
  }

  &__title {
    font-size: 17px;
    font-weight: 700;
  }

  &__detail {
    font-size: 13px;
    line-height: 1.6;
    color: var(--ann-muted);
  }
}

.itn-footer {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 20px max(16px, var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
  border-top: 1px solid #e6ded2;
  background: var(--ann-ground);
}

.itn-btn {
  width: 100%;
  max-width: 520px;
  align-self: center;
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
  }

  &--outline {
    border: 1.5px solid var(--ann-navy);
    background: transparent;
    color: var(--ann-navy);
    font-weight: 500;
  }
}
</style>
