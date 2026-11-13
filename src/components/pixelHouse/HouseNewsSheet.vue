<script setup lang="ts">
/**
 * 聊天的＋選單 →「小屋記事」：從下面升起的面板，勾幾件家裡的事放進聊天（不叫他馬上回）。
 * 只在住在小屋的那個人的聊天裡出現。
 */
import { computed, onMounted, onUnmounted, ref } from "vue";
import type { HouseNewsShare } from "@/types/houseNews";
import { houseNewsTime } from "@/utils/houseNewsShare";
import HouseNewsPicker, { type PickerNews } from "./HouseNewsPicker.vue";
import { buildNewsShare, HOUSE_NEWS_EVENT, loadNews, markTold, newsFor, newsHouseText, saveNews, type HouseNews } from "./houseNews";

const props = defineProps<{ characterId: string; name: string }>();
const emit = defineEmits<{ close: []; send: [share: HouseNewsShare] }>();

const list = ref<HouseNews[]>([]);
const now = ref(Date.now());
function refresh() {
  now.value = Date.now();
  list.value = newsFor(loadNews(now.value), props.characterId);
}

const items = computed<PickerNews[]>(() =>
  list.value.map((n) => ({ id: n.id, time: houseNewsTime(n.at, now.value), text: newsHouseText(n.text, props.name), who: n.who, told: !!n.told })),
);

function send(ids: string[]) {
  const at = Date.now();
  const share = buildNewsShare(loadNews(at), ids, at);
  if (!share) return;
  saveNews(markTold(loadNews(at), ids, at));
  emit("send", share);
  emit("close");
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}

onMounted(() => {
  refresh();
  window.addEventListener(HOUSE_NEWS_EVENT, refresh);
  window.addEventListener("keydown", onKey);
});
onUnmounted(() => {
  window.removeEventListener(HOUSE_NEWS_EVENT, refresh);
  window.removeEventListener("keydown", onKey);
});
</script>

<template>
  <Teleport to="body">
    <div class="hns-dim" @click.self="emit('close')">
      <section class="hns-sheet" role="dialog" aria-label="小屋記事">
        <header class="hns-head">
          <h2>小屋記事</h2>
          <button type="button" class="hns-close" aria-label="關閉" @click="emit('close')">×</button>
        </header>
        <div class="hns-body">
          <HouseNewsPicker :items="items" :pronoun="name" @send="send" />
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.hns-dim {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(30, 20, 18, 0.38);
}

.hns-sheet {
  width: 100%;
  max-width: 480px;
  max-height: 78vh;
  display: flex;
  flex-direction: column;
  border-radius: 20px 20px 0 0;
  background: #fffbf5;
  box-shadow: 0 -10px 30px rgba(30, 20, 18, 0.18);
  animation: hns-up 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes hns-up {
  from {
    transform: translateY(40px);
    opacity: 0;
  }
}

.hns-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 14px 6px 16px;
  color: #3b2a26;
}

.hns-head h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
}

.hns-close {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 50%;
  background: rgba(59, 42, 38, 0.08);
  color: #3b2a26;
  font-family: inherit;
  font-size: 19px;
  line-height: 1;
  cursor: pointer;
}

.hns-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 8px calc(env(safe-area-inset-bottom, 0px) + 12px);
}

@media (prefers-reduced-motion: reduce) {
  .hns-sheet {
    animation: none;
  }
}
</style>
