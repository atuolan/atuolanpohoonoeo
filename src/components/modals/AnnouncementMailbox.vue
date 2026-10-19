<script setup lang="ts">
/**
 * 203 號房的信箱：作者寄回家的每張明信片（公告）都收在這裡，分「還沒拆」「已收下」。
 */
import { countAnnouncementStops, type Announcement } from "@/services/AnnouncementService";
import { ChevronLeft, ChevronRight, Mail, MailOpen, Mailbox } from "lucide-vue-next";
import { computed, onMounted } from "vue";
import { ensureAnnouncementFont, splitAnnouncementDate } from "./announcementUi";

const props = defineProps<{
  items: Announcement[];
  isRead: (id: string) => boolean;
  loaded: boolean;
}>();

const emit = defineEmits<{
  close: [];
  open: [id: string];
}>();

onMounted(ensureAnnouncementFont);

interface Row {
  id: string;
  title: string;
  meta: string;
  important: boolean;
}

function toRow(item: Announcement): Row {
  const stops = countAnnouncementStops(item.body);
  const parts = [splitAnnouncementDate(item.date).full, stops > 0 ? `${stops} STOPS` : ""];
  return {
    id: item.id,
    title: item.title,
    meta: parts.filter(Boolean).join(" · "),
    important: item.level === "important" || item.level === "critical",
  };
}

const unread = computed(() => props.items.filter((i) => !props.isRead(i.id)).map(toRow));
const read = computed(() => props.items.filter((i) => props.isRead(i.id)).map(toRow));
</script>

<template>
  <div class="mbx-root" role="dialog" aria-modal="true" aria-label="信箱">
    <header class="mbx-bar">
      <button type="button" class="mbx-bar__back" aria-label="返回" @click="emit('close')">
        <ChevronLeft :size="22" aria-hidden="true" />
      </button>
      <span class="mbx-bar__title mbx-hand">信箱</span>
      <span class="mbx-bar__spacer" aria-hidden="true" />
    </header>

    <div class="mbx-scroll">
      <div class="mbx-intro">
        <span class="mbx-intro__icon" aria-hidden="true">
          <Mailbox :size="26" :stroke-width="1.6" />
        </span>
        <span class="mbx-intro__text">
          <span class="mbx-intro__title mbx-hand">203 號房的信箱</span>
          <span class="mbx-intro__detail">作者每次更新寄回家的明信片，都收在這裡</span>
        </span>
      </div>

      <p v-if="loaded && items.length === 0" class="mbx-empty">
        目前收不到信，可能是網路不通，晚點再來看看。
      </p>

      <section v-if="unread.length" class="mbx-group">
        <div class="mbx-group__head">
          <h2 class="mbx-group__title">還沒拆</h2>
          <span class="mbx-group__count">{{ unread.length }}</span>
        </div>
        <button
          v-for="row in unread"
          :key="row.id"
          type="button"
          class="mbx-item mbx-item--unread"
          :class="{ 'mbx-item--airmail': row.important }"
          @click="emit('open', row.id)"
        >
          <span class="mbx-item__inner">
            <span class="mbx-item__icon" aria-hidden="true">
              <Mail :size="20" :stroke-width="1.7" />
              <span class="mbx-item__dot" />
            </span>
            <span class="mbx-item__text">
              <span class="mbx-item__title">{{ row.title }}</span>
              <span v-if="row.meta" class="mbx-item__meta">{{ row.meta }}</span>
            </span>
            <ChevronRight class="mbx-item__chev" :size="18" aria-hidden="true" />
          </span>
        </button>
      </section>

      <section v-if="read.length" class="mbx-group">
        <div class="mbx-group__head">
          <h2 class="mbx-group__title">已收下</h2>
        </div>
        <button
          v-for="row in read"
          :key="row.id"
          type="button"
          class="mbx-item mbx-item--read"
          @click="emit('open', row.id)"
        >
          <span class="mbx-item__inner">
            <span class="mbx-item__icon" aria-hidden="true">
              <MailOpen :size="20" :stroke-width="1.7" />
            </span>
            <span class="mbx-item__text">
              <span class="mbx-item__title">{{ row.title }}</span>
              <span v-if="row.meta" class="mbx-item__meta">{{ row.meta }}</span>
            </span>
            <span class="mbx-item__stamp mbx-hand">已收下</span>
          </span>
        </button>
      </section>

      <div v-if="items.length" class="mbx-end">
        <span class="mbx-end__line" aria-hidden="true" />
        <span class="mbx-hand">沒有更早的明信片了</span>
        <span class="mbx-end__line" aria-hidden="true" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.mbx-root {
  --ann-ground: #f7f3ec;
  --ann-paper: #fffdf8;
  --ann-ink: #26303b;
  --ann-muted: #5a6470;
  --ann-navy: #2b4162;
  --ann-clay: #b5502f;
  --ann-sage: #4f6b4e;
  --ann-line: #d8cdbf;
  --ann-chip: #e7ecf3;

  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  flex-direction: column;
  background: var(--ann-ground);
  color: var(--ann-ink);
  font-family: "Noto Sans TC", -apple-system, sans-serif;
  padding-top: var(--safe-top, 0px);
}

.mbx-hand {
  font-family: "LXGW WenKai TC", "Noto Serif TC", serif;
}

.mbx-bar {
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

.mbx-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 8px 20px max(24px, var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
  display: flex;
  flex-direction: column;
  gap: 28px;
  max-width: 560px;
  width: 100%;
  box-sizing: border-box;
  margin: 0 auto;
}

.mbx-intro {
  display: flex;
  align-items: center;
  gap: 14px;

  &__icon {
    width: 52px;
    height: 52px;
    flex-shrink: 0;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f4e4d4;
    color: var(--ann-clay);
  }

  &__text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__title {
    font-size: 20px;
    font-weight: 700;
  }

  &__detail {
    font-size: 13px;
    color: var(--ann-muted);
  }
}

.mbx-empty {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--ann-muted);
}

.mbx-group {
  display: flex;
  flex-direction: column;
  gap: 12px;

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__title {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
  }

  &__count {
    min-width: 22px;
    padding: 1px 8px;
    box-sizing: border-box;
    border-radius: 10px;
    background: var(--ann-clay);
    color: #fff;
    font-size: 12px;
    text-align: center;
  }
}

.mbx-item {
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  border-radius: 14px;
  background: transparent;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;

  &__inner {
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 52px;
    padding: 14px 14px 14px 16px;
    border-radius: 12px;
    background: var(--ann-paper);
  }

  &--unread &__inner {
    box-shadow: 0 6px 18px rgba(38, 48, 59, 0.08);
  }

  // 重要公告：航空信封紅藍斜紋邊
  &--airmail {
    padding: 4px;
    background: repeating-linear-gradient(
      135deg,
      var(--ann-clay) 0 10px,
      var(--ann-paper) 10px 18px,
      var(--ann-navy) 18px 28px,
      var(--ann-paper) 28px 36px
    );

    .mbx-item__inner {
      border-radius: 10px;
      box-shadow: none;
    }
  }

  &--read &__inner {
    border: 1px solid #e6ded2;
  }

  &__icon {
    position: relative;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ann-chip);
    color: var(--ann-navy);
  }

  &--read &__icon {
    background: #efeae1;
    color: var(--ann-muted);
  }

  &__dot {
    position: absolute;
    top: -3px;
    right: -3px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--ann-clay);
    box-shadow: 0 0 0 2px var(--ann-paper);
  }

  &__text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  &__title {
    font-size: 15px;
    font-weight: 700;
    line-height: 1.4;
  }

  &--read &__title {
    font-weight: 500;
    color: #4a535e;
  }

  &__meta {
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 11.5px;
    letter-spacing: 0.06em;
    color: var(--ann-muted);
  }

  &__chev {
    flex-shrink: 0;
    color: var(--ann-muted);
  }

  &__stamp {
    flex-shrink: 0;
    padding: 1px 6px;
    border: 1.5px solid var(--ann-sage);
    border-radius: 6px;
    color: var(--ann-sage);
    font-size: 12px;
    transform: rotate(-6deg);
  }
}

.mbx-end {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--ann-muted);
  font-size: 13px;

  &__line {
    flex: 1;
    border-top: 1.5px dashed var(--ann-line);
  }
}
</style>
