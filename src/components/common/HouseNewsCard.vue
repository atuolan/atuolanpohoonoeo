<script setup lang="ts">
/**
 * 「小屋的事」卡片：使用者從小屋記事勾了幾件事告訴他
 */
import { computed } from "vue";
import { House } from "lucide-vue-next";
import type { HouseNewsShare } from "@/types/houseNews";
import { houseNewsTime } from "@/utils/houseNewsShare";

const props = defineProps<{ share: HouseNewsShare }>();

const rows = computed(() => props.share.items.map((i) => ({ time: houseNewsTime(i.at, props.share.sentAt), text: i.text })));
</script>

<template>
  <div class="house-news-card">
    <div class="house-news-head">
      <House :size="14" aria-hidden="true" />
      <span>小屋的事</span>
    </div>
    <ul class="house-news-list">
      <li v-for="(r, i) in rows" :key="i">
        <span class="house-news-time">{{ r.time }}</span>
        <span class="house-news-text">{{ r.text }}</span>
      </li>
    </ul>
  </div>
</template>

<style lang="scss" scoped>
.house-news-card {
  width: 240px;
  max-width: 100%;
  min-width: 0;
  padding: 10px 12px 11px;
  color: #3d2f22;
  background: #fbf3e4;
  border: 1px solid rgba(61, 47, 34, 0.16);
  border-radius: 12px;
}

body.is-night-mode .house-news-card {
  color: #efe3cf;
  background: #24201c;
  border-color: rgba(239, 227, 207, 0.18);
}

.house-news-head {
  display: flex;
  gap: 5px;
  align-items: center;
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: #a0643a;
}

body.is-night-mode .house-news-head {
  color: #e0a879;
}

.house-news-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    gap: 8px;
    align-items: baseline;
    min-width: 0;
  }
}

.house-news-time {
  flex: none;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  opacity: 0.55;
}

.house-news-text {
  min-width: 0;
  font-size: 13px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
</style>
