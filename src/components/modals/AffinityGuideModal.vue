<script setup lang="ts">
/**
 * 好感度使用說明：內容寫死在元件裡。
 * 從角色編輯的好感度模組、聊天裡的數值面板都打得開。
 */
import {
  BookOpen,
  ChevronLeft,
  Heart,
  LifeBuoy,
  MessageCircle,
  Package,
  SlidersHorizontal,
  Sparkles,
  Wrench,
} from "lucide-vue-next";
import { ref } from "vue";

defineProps<{ visible: boolean }>();
const emit = defineEmits<{ close: [] }>();

interface GuideSection {
  id: string;
  icon: unknown;
  title: string;
  items: string[];
}

const SECTIONS: GuideSection[] = [
  { id: "start", icon: Sparkles, title: "三步開始", items: [
    "角色編輯 → 模組 → 打開「好感度數值」。會自動加好一個「好感度」，什麼都不用改就能用。",
    "按右上角「儲存」。",
    "回去聊天。AI 回覆下面出現「♡ 好感度 +3」這樣的小字，就代表有在運作。",
  ] },
  { id: "chat", icon: MessageCircle, title: "聊天時", items: [
    "AI 訊息下面的小字是這一輪的變化：粉紅是增加、灰藍是減少，文字型會寫成「心情 平靜→開心」。",
    "點那行小字（或點角色頭像）會打開數值面板：看目前分數、關係階段和最近的變化，也可以用 − ＋ 自己調。",
    "面板最上面會寫「幾分鐘前自動更新」，看得出系統有沒有在動。",
    "重抽回覆、左右切換回覆、刪訊息、開分支，數值都會跟著那則回覆走，不會重抽一次就多加一次。",
  ] },
  { id: "edit", icon: SlidersHorizontal, title: "調整數值", items: [
    "每個數值平常收成一行，按「編輯」才展開。",
    "「一開始」是新聊天的起點；「最低／最高」是範圍；「每次最多增減」避免一句話就從陌生變戀人。",
    "「什麼時候會變？」寫越清楚，AI 判斷越準。例如：被關心、被誇獎時增加；被冷落、被欺騙時減少。",
    "關係階段：分數到了某個值就換階段。在「這時候角色會怎樣」寫上表現（例如：會主動找話題、偶爾吃醋），AI 會照著演。",
    "收起來的數值後面出現「未填說明」，代表還沒寫什麼時候會變，建議補上。",
  ] },
  { id: "more", icon: Heart, title: "再加一個數值", items: [
    "在「＋ 再加一個數值」點信任度、心情、關係，內容都先填好了；也可以「自己建一個」。",
    "數字型：好感度、信任度這種有分數的。文字型：心情、關係這種狀態，在「可以是哪些？」列出選項，用逗號分開。",
    "金錢、天數這類沒有上限的值，展開後把「限制在最低～最高之間」取消。",
  ] },
  { id: "stuck", icon: LifeBuoy, title: "數值一直不動？", items: [
    "有些模型常忘記回報。連續幾輪沒回報時，訊息下面會問要不要改成「旁觀者判斷」，按「改用」就好。",
    "旁觀者判斷：每次回覆完，另外請一個 AI 讀這一輪對話來決定數值。比較穩定、回覆裡也不會出現標籤，但每次回覆會多花一次呼叫。也可以在「進階設定 → 數值由誰判斷」切換。",
    "想省一點：到「設定 → 備用模型與分流」打開「啟用備用 API」，在「各功能走哪個 API」把「好感度旁觀者」選成便宜的模型。",
    "面板右上角的 ↻ 會重新讀取最新一次的回報（旁觀者模式下是請旁觀者重新判斷），不會重複加。",
    "還是不動：到聊天預設的提示詞裡，確認「好感度數值狀態」和「好感度更新規則」兩項是開著的。",
    "數值亂掉了：面板裡可以「以角色預設值重置」，或「套用開場白初始值」。",
  ] },
  { id: "mvu", icon: Package, title: "MVU 角色卡", items: [
    "導入酒館的 MVU 角色卡時，會自動認出卡片的變數、初始值和說明，不用另外設定。",
    "卡片世界書裡已經有的狀態或規則，這裡不會再送一份給 AI。",
    "支援 _.set / _.add / _.insert / _.remove、JSON Patch、[值, 說明] 格式、$meta 結構限制，狀態欄讀到的 display_data 也是「舊->新 (原因)」的原版格式。",
    "每個數值展開後可以看到它的變數路徑，例如「悠纪.好感度」。",
  ] },
  { id: "advanced", icon: Wrench, title: "進階（會寫世界書的人）", items: [
    "世界書和正則的 EJS 可以用 getvar('stat_data.角色名.好感度') 讀數值；「進階設定 → 變數名稱」決定這裡的角色名。",
    "也讀得到 display_data（顯示用）和 delta_data（上一次的變化）。",
    "進階設定裡可以改「目前數值的模板」、自己寫更新規則，或把兩者做成世界書條目。做成條目後，「送給 AI」會自動關掉，避免送兩次。",
    "回報格式有兩種：簡單標籤 <affinity-update 好感度=\"+2\"/>，或 MVU 指令 _.set('好感度', 50, 52)。一般角色用簡單標籤，MVU 卡會自動用 MVU 指令。",
  ] },
];

const scrollEl = ref<HTMLElement | null>(null);
const topbarEl = ref<HTMLElement | null>(null);

function jump(id: string): void {
  const container = scrollEl.value;
  if (!container) return;
  const target = container.querySelector<HTMLElement>(`#affinity-guide-${id}`);
  if (!target) return;
  const topbarHeight = topbarEl.value?.offsetHeight ?? 0;
  container.scrollTo({ top: target.offsetTop - topbarHeight - 8, behavior: "smooth" });
}
</script>

<template>
  <Teleport to="body">
    <Transition name="affinity-guide">
      <div v-if="visible" ref="scrollEl" class="affinity-guide" role="dialog" aria-label="好感度使用說明">
        <header ref="topbarEl" class="ag-topbar">
          <div class="ag-topbar-row">
            <button type="button" class="ag-back" aria-label="返回" @click="emit('close')">
              <ChevronLeft :size="22" :stroke-width="2" aria-hidden="true" />
            </button>
            <h1 class="ag-title">好感度使用說明</h1>
            <span aria-hidden="true"></span>
          </div>
          <div class="ag-chips">
            <button
              v-for="section in SECTIONS"
              :key="section.id"
              type="button"
              class="ag-chip"
              @click="jump(section.id)"
            >
              {{ section.title }}
            </button>
          </div>
        </header>

        <div class="ag-body">
          <p class="ag-intro">
            <BookOpen :size="16" aria-hidden="true" class="ag-intro-icon" />
            開了好感度，角色會依聊天內容自動增減數值，分數到了不同關係階段，態度也會跟著變。新手看「三步開始」就夠了，其他想到再回來翻。
          </p>

          <section
            v-for="s in SECTIONS"
            :id="`affinity-guide-${s.id}`"
            :key="s.id"
            class="ag-card"
          >
            <div class="ag-card-head">
              <component :is="s.icon" :size="18" aria-hidden="true" class="ag-icon" />
              <h2 class="ag-card-title">{{ s.title }}</h2>
            </div>
            <ol v-if="s.id === 'start'" class="ag-list is-steps">
              <li v-for="(item, index) in s.items" :key="index">{{ item }}</li>
            </ol>
            <ul v-else class="ag-list">
              <li v-for="(item, index) in s.items" :key="index">{{ item }}</li>
            </ul>
          </section>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.affinity-guide {
  position: fixed;
  inset: 0;
  z-index: 10000;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
  background: var(--color-background, #f5f5f5);
  color: var(--color-text, #1f2937);
}

.ag-topbar {
  position: sticky;
  top: 0;
  z-index: 5;
  padding-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
  background: var(--color-background, #f5f5f5);
}

.ag-topbar-row {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  height: 44px;
}

.ag-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.ag-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ag-chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 16px 10px;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.ag-chip {
  flex: none;
  height: 32px;
  padding: 0 14px;
  border-radius: 16px;
  border: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-surface, #fff);
  color: inherit;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.ag-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 640px;
  margin: 0 auto;
  padding: 8px 16px calc(32px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
}

.ag-intro {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text-secondary, #6b7280);
}

.ag-intro-icon {
  vertical-align: -3px;
  margin-right: 4px;
  color: #ff6b9d;
}

.ag-card {
  padding: 14px 16px;
  border-radius: 16px;
  background: var(--color-surface, #fff);
}

.ag-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.ag-icon {
  color: #ff6b9d;
}

.ag-card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.ag-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding-left: 18px;
  font-size: 14px;
  line-height: 1.65;
  overflow-wrap: anywhere;

  li::marker {
    color: var(--color-text-muted, #9ca3af);
  }

  &.is-steps li::marker {
    color: #ff6b9d;
    font-weight: 700;
  }
}

.affinity-guide-enter-active,
.affinity-guide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.affinity-guide-enter-from,
.affinity-guide-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
