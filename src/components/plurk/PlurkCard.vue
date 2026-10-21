<script setup lang="ts">
/**
 * 河道裡的噗文卡片
 * 頭像／名字 → 發語詞＋內文 → 小劇場／轉噗／圖片／最新回應 → 底部互動列
 * 資料都由外面整理好（html 已安全渲染），這顆只負責畫面與事件
 */
import {
  BellOff,
  Bookmark,
  Clapperboard,
  Heart,
  MessageSquare,
  MoreHorizontal,
  Repeat2,
} from "lucide-vue-next";
import { computed } from "vue";
import PlurkAvatar from "@/components/plurk/PlurkAvatar.vue";
import QualifierChip from "@/components/plurk/QualifierChip.vue";
import type { PlurkCardData } from "@/components/plurk/types";

const props = defineProps<{ post: PlurkCardData }>();

const emit = defineEmits<{
  open: [];
  openProfile: [];
  like: [];
  repost: [];
  bookmark: [];
  more: [];
  openImage: [index: number];
  openTheater: [];
}>();

/** 2–4 張圖走兩欄格 */
const imageLayout = computed(() => (props.post.images.length > 1 ? "grid" : "single"));
const repostImages = computed(() => (props.post.repost?.images ?? []).slice(0, 2));
</script>

<template>
  <article
    class="plurk-card plurk-rich"
    :class="{ 'plurk-card--highlighted': props.post.highlighted }"
    @click="emit('open')"
  >
    <!-- 頭列 -->
    <header class="card-head">
      <button
        type="button"
        class="avatar-btn"
        :aria-label="`${props.post.authorName}的個人頁`"
        @click.stop="emit('openProfile')"
      >
        <PlurkAvatar :src="props.post.authorAvatar" :name="props.post.authorName" :size="40" />
      </button>
      <div class="card-who">
        <span class="who-name">
          <span class="who-name-text">{{ props.post.authorName }}</span>
          <BellOff v-if="props.post.muted" :size="14" class="muted-icon" aria-label="已消音" role="img" />
        </span>
        <span class="who-meta">{{ props.post.metaText }}</span>
      </div>
      <button type="button" class="icon-btn more-btn" aria-label="更多" @click.stop="emit('more')">
        <MoreHorizontal :size="20" />
      </button>
    </header>

    <!-- 內文 -->
    <p class="card-body">
      <QualifierChip :qualifier="props.post.qualifier" size="md" /><span
        class="card-body-text"
        v-html="props.post.html"
      ></span>
    </p>

    <!-- 小劇場連結卡 -->
    <button
      v-if="props.post.theater"
      type="button"
      class="theater-card"
      @click.stop="emit('openTheater')"
    >
      <Clapperboard :size="20" class="theater-icon" aria-hidden="true" />
      <span class="theater-text">
        <span class="theater-title">{{ props.post.theater.title }}</span>
        <span class="theater-note">前往小劇場閱讀全文 ›</span>
      </span>
    </button>

    <!-- 轉噗框 -->
    <div v-if="props.post.repost" class="repost-box">
      <div class="repost-head">
        <PlurkAvatar
          :src="props.post.repost.authorAvatar"
          :name="props.post.repost.authorName"
          :size="24"
        />
        <span class="repost-name">{{ props.post.repost.authorName }}</span>
        <QualifierChip :qualifier="props.post.repost.qualifier" size="sm" />
      </div>
      <p class="repost-text">{{ props.post.repost.text }}</p>
      <div v-if="repostImages.length" class="repost-images">
        <img
          v-for="(src, i) in repostImages"
          :key="`repost-${i}`"
          :src="src"
          alt=""
          loading="lazy"
        />
      </div>
    </div>

    <!-- 圖片 -->
    <div v-if="props.post.images.length" class="card-images" :class="`card-images--${imageLayout}`">
      <button
        v-for="(src, i) in props.post.images"
        :key="`img-${i}`"
        type="button"
        class="image-btn"
        :aria-label="`看第 ${i + 1} 張圖`"
        @click.stop="emit('openImage', i)"
      >
        <img :src="src" alt="" loading="lazy" />
      </button>
    </div>

    <!-- 影片 -->
    <div v-if="props.post.videos.length" class="card-videos">
      <video
        v-for="(src, i) in props.post.videos"
        :key="`video-${i}`"
        :src="src"
        controls
        preload="metadata"
        playsinline
        @click.stop
      ></video>
    </div>

    <!-- 最新回應 -->
    <button
      v-if="props.post.latestResponses.length"
      type="button"
      class="reply-box"
      @click.stop="emit('open')"
    >
      <span v-for="row in props.post.latestResponses" :key="row.id" class="reply-row">
        <b class="reply-name">{{ row.username }}</b>　
        <span class="reply-text" v-html="row.html"></span>
      </span>
      <span class="reply-all">看全部 {{ props.post.responseCount }} 則回應 ›</span>
    </button>

    <!-- 底部互動列 -->
    <footer class="card-foot">
      <button
        type="button"
        class="foot-btn foot-btn--reply"
        :class="{ 'foot-btn--unread': props.post.hasUnread }"
        :aria-label="`回應，${props.post.responseCount} 則`"
        @click.stop="emit('open')"
      >
        <MessageSquare :size="19" aria-hidden="true" />
        <span class="foot-num">{{ props.post.responseCount }}</span>
      </button>
      <button
        type="button"
        class="foot-btn foot-btn--like"
        :class="{ 'foot-btn--liked': props.post.liked }"
        :aria-label="`喜歡，${props.post.likeCount}`"
        :aria-pressed="props.post.liked"
        @click.stop="emit('like')"
      >
        <Heart :size="19" :fill="props.post.liked ? 'currentColor' : 'none'" aria-hidden="true" />
        <span class="foot-num">{{ props.post.likeCount }}</span>
      </button>
      <button
        type="button"
        class="foot-btn foot-btn--repost"
        :aria-label="`轉噗，${props.post.repostCount}`"
        @click.stop="emit('repost')"
      >
        <Repeat2 :size="19" aria-hidden="true" />
        <span class="foot-num">{{ props.post.repostCount }}</span>
      </button>
      <span class="foot-spacer"></span>
      <button
        type="button"
        class="icon-btn foot-bookmark"
        :class="{ 'foot-bookmark--on': props.post.bookmarked }"
        aria-label="收藏"
        :aria-pressed="props.post.bookmarked"
        @click.stop="emit('bookmark')"
      >
        <Bookmark :size="19" :fill="props.post.bookmarked ? 'currentColor' : 'none'" aria-hidden="true" />
      </button>
    </footer>
  </article>
</template>

<style scoped lang="scss">
@use "@/components/plurk/plurk-theme.scss" as *;

.plurk-card {
  box-sizing: border-box;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--color-surface);
  border-radius: $plurk-radius-card;
  padding: 14px 16px 8px;
  color: var(--color-text);
  cursor: pointer;
}

/* 從時間軸點進來時閃一下 */
.plurk-card--highlighted {
  animation: plurk-card-flash 2s ease-out;
}

@keyframes plurk-card-flash {
  0%,
  55% {
    box-shadow: 0 0 0 2px var(--color-primary);
  }
  100% {
    box-shadow: 0 0 0 2px rgba(var(--color-primary-rgb), 0);
  }
}

/* ---------- 頭列 ---------- */
.card-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar-btn {
  flex: 0 0 auto;
  width: $plurk-touch;
  height: $plurk-touch;
  margin: -2px 0 -2px -2px;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.card-who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}

.who-name {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.who-name-text {
  font-size: 15px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.muted-icon {
  flex: 0 0 auto;
  color: var(--color-text-secondary);
}

.who-meta {
  font-size: 12px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.icon-btn {
  flex: 0 0 auto;
  width: $plurk-touch;
  height: $plurk-touch;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.more-btn {
  margin-right: -10px;
}

/* ---------- 內文 ---------- */
.card-body {
  margin: 0;
  font-size: 15px;
  line-height: 1.7;
  word-break: break-word;
}

.card-body-text {
  word-break: break-word;
}

/* ---------- 小劇場 ---------- */
.theater-card {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  box-sizing: border-box;
  min-height: $plurk-touch;
  padding: 10px 12px;
  border: none;
  border-radius: $plurk-radius-soft;
  background: var(--color-surface-hover);
  color: var(--color-text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.theater-icon {
  flex: 0 0 auto;
  color: var(--color-primary);
}

.theater-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: 13px;
  line-height: 1.5;
}

.theater-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.theater-note {
  color: var(--color-text-secondary);
  font-size: 12px;
}

/* ---------- 轉噗 ---------- */
.repost-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid var(--color-border);
  border-radius: $plurk-radius-soft;
  padding: 10px 12px;
}

.repost-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.repost-name {
  font-size: 13px;
  font-weight: 700;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.repost-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--color-text-secondary);
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.repost-images {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  margin-top: 2px;

  img {
    display: block;
    width: 100%;
    height: 88px;
    object-fit: cover;
    border-radius: 10px;
  }
}

.repost-images img:only-child {
  grid-column: 1 / -1;
}

/* ---------- 圖片 ---------- */
.card-images {
  display: grid;
  gap: 4px;
}

.card-images--single {
  grid-template-columns: minmax(0, 1fr);
}

.card-images--grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.image-btn {
  padding: 0;
  border: none;
  background: var(--color-surface-hover);
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  display: block;
  width: 100%;

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.card-images--single .image-btn {
  height: 180px;
}

.card-images--grid .image-btn {
  height: 132px;
  border-radius: 14px;
}

/* ---------- 影片 ---------- */
.card-videos {
  display: flex;
  flex-direction: column;
  gap: 6px;

  video {
    width: 100%;
    border-radius: 16px;
    background: var(--color-background);
    display: block;
  }
}

/* ---------- 最新回應 ---------- */
.reply-box {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: none;
  border-radius: $plurk-radius-soft;
  background: var(--color-surface-hover);
  color: var(--color-text);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
}

.reply-row {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  width: 100%;
  min-width: 0;
  word-break: break-word;
}

.reply-name {
  font-weight: 700;
}

.reply-text {
  display: inline;
}

.reply-all {
  color: var(--color-text-secondary);
}

/* ---------- 底部互動列 ---------- */
.card-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  height: $plurk-touch;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.foot-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: $plurk-touch;
  padding: 0 18px 0 0;
  border: none;
  background: none;
  color: inherit;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}

.foot-btn--reply {
  padding-right: 18px;
}

.foot-btn--unread {
  color: var(--color-primary);

  .foot-num {
    font-weight: 700;
  }
}

.foot-btn--liked {
  color: var(--color-primary);
}

.foot-num {
  font-variant-numeric: tabular-nums;
}

.foot-spacer {
  flex: 1;
}

.foot-bookmark {
  margin-right: -10px;
}

.foot-bookmark--on {
  color: var(--color-primary);
}
</style>
