<script setup lang="ts">
/**
 * 噗浪使用說明：只吃 emits，內容寫死在元件裡
 */
import {
  Bell,
  ChevronLeft,
  Coins,
  Compass,
  EyeOff,
  MessageSquare,
  PenLine,
  ShieldAlert,
  Smile,
  Sparkles,
  UserRound,
  Waves,
} from "lucide-vue-next";
import { ref } from "vue";

const emit = defineEmits<{
  back: [];
}>();

interface GuideSection {
  id: string;
  icon: unknown;
  title: string;
  items: string[];
}

const SECTIONS: GuideSection[] = [
  { id: "river", icon: Waves, title: "河道", items: [
    "你和好友角色發的噗都在這裡，最新的在最上面。",
    "上方的時間軸可以左右滑，看今天誰在什麼時候說了話；點泡泡會跳到那則噗。",
    "用「全部／好友／私噗／我的」篩選，右上角的放大鏡可以搜尋。",
    "卡片下方可以按讚、轉噗、收藏；卡片的「⋯」裡有叫角色回應、重新生成 AI 回應、消音、刪除。",
    "右上角的「⋯」可以開小劇場、把全部標為已讀、再打開這份使用說明。",
  ] },
  { id: "compose", icon: PenLine, title: "發噗", items: [
    "按右下角「發噗」，先選發語詞（說、想、覺得、問…），再寫內容。",
    "給誰看：全員（好友河道＋廣場）、好友、私噗（只給選定的人）、偷偷說（不顯示名字，上廣場，一天 5 則）。",
    "誰來回應：讓 AI 挑、我指定、不要回應。",
    "角色不會一次全部回完，會像真人一樣隔幾分鐘陸續回；正在回的人會顯示「正在回應」。",
  ] },
  { id: "thread", icon: MessageSquare, title: "回應串", items: [
    "點噗進到回應串，可以回整則噗，也可以點某則回應單獨回他。",
    "角色的回應不滿意，可以單則重新生成。",
    "你回角色之後，他可能會再接一句；不想要可以到 AI 導演關掉「你回應後角色會接話」。",
    "只有你發的、或你回過的噗收到新回應時，才會跳通知。",
  ] },
  { id: "square", icon: Compass, title: "廣場", items: [
    "廣場是陌生路人的噗，分「熱門噗／偷偷說／最新」，也可以用求助、好物、曬娃、吐槽、二手篩選。",
    "按「讓廣場熱鬧起來」會用一次 AI 呼叫生一批路人噗：大約三分之一馬上出現，其餘照排好的時間陸續出現。",
    "關掉 App 也沒關係，再打開時，時間到了的噗就會在廣場上。",
    "喜歡某位路人，可以在他的噗裡按「加好友」，之後他的噗也會出現在你的河道。",
    "回應串可以切「只看角色」；角色有時也會自己來廣場逛、回路人的噗。",
  ] },
  { id: "anon", icon: EyeOff, title: "偷偷說", items: [
    "偷偷說的噗裡，每個人都只顯示「#四位數」代號，同一則噗裡同一個人的代號不會變；你自己的代號是綠色。",
    "好友角色偶爾也會偷偷說心裡話，卡片上出現「這個語氣，好像在哪見過」就是線索。",
  ] },
  { id: "director", icon: Sparkles, title: "AI 導演", items: [
    "從河道右上角的 ✦ 按鈕，或「我 → AI 導演與記憶」打開。",
    "模式：關閉（角色只在你按「現在就讓…」時出現）、自由（AI 依個性、關係和作息自己決定）、只用名單。",
    "每個角色可以設「常出現／只回應／不出現」和作息；熱鬧程度決定多常自己活動，每日上限控制一天最多花幾次 AI 呼叫。",
    "廣場：路人多寡、每次生成幾則（5–20 則，一次越多越省呼叫）、版主嚴格度；面板上會顯示還有幾則排隊中。",
    "記憶：讀取最近的聊天記錄、參考角色手機裡的內容（PEEK）。",
    "自動模式只在 App 開著時運作，每 5 分鐘看一次；重新打開時會補上你不在時發生的事（最多 3 件）。",
  ] },
  { id: "moderation", icon: ShieldAlert, title: "版主與禁言", items: [
    "廣場版主是「阿杏」，分寬鬆／普通／嚴格。太過分的路人噗會在出現後一陣子被摺疊、路人回應被刪除，原處留一行灰字。",
    "你在廣場回應時，同一句話貼在好幾則噗下會被當成洗版，講話太衝也可能被摺疊；嚴重的會被禁言 1–3 天（寬鬆時不會）。",
    "禁言期間不能回別人的廣場噗，發全員或偷偷說會改成只給好友；河道和你自己的噗不受影響。",
    "覺得冤枉，可以在「通知」上方的禁言卡寫申訴，大約 1–6 小時後出結果。",
    "角色也可能被禁言，系統通知裡會出現版務公告。",
  ] },
  { id: "notice", icon: Bell, title: "通知", items: [
    "分成全部／回應／讚／系統，點一則通知會打開那則噗。",
    "角色回你的噗時，有時也會順手按讚。",
  ] },
  { id: "profile", icon: UserRound, title: "角色個人頁", items: [
    "點角色頭像打開：私訊、他一天裡常出沒的時段、平均多快回你、他的噗和回應。",
    "「整理印象」會用一次 AI 呼叫，替他整理 3–5 個印象標籤。",
    "「偷看他的手機」會打開他的 PEEK。",
  ] },
  { id: "me", icon: Smile, title: "我", items: [
    "看自己的噗、回應過的噗、收藏。",
    "卡馬：發噗、回應、被按讚會加分，太久沒來會慢慢掉。",
    "可以切換發噗用的人設，也能設定舊噗文的頭像。",
  ] },
  { id: "cost", icon: Coins, title: "省 API 的小技巧", items: [
    "只有你按按鈕、或開了 AI 導演的自動模式，才會呼叫 AI。",
    "噗浪可以改走便宜的備用 API：到「設定 → 備用模型與分流」打開「啟用備用 API」，在「各功能走哪個 API」把「噗浪發文」「噗浪評論」選成備用配置，聊天照樣用主 API。",
    "自動模式有每日上限；熱鬧程度調低、廣場一次多生幾則，都能少呼叫幾次。",
    "開著「串流輸出」時，按按鈕觸發的生成會顯示在串流視窗，隨時可以按停止。",
  ] },
];

const scrollEl = ref<HTMLElement | null>(null);
const topbarEl = ref<HTMLElement | null>(null);

function jump(id: string): void {
  const container = scrollEl.value;
  if (!container) return;
  const target = container.querySelector<HTMLElement>(`#guide-${id}`);
  if (!target) return;
  const topbarHeight = topbarEl.value?.offsetHeight ?? 0;
  container.scrollTo({ top: target.offsetTop - topbarHeight - 8, behavior: "smooth" });
}
</script>

<template>
  <div ref="scrollEl" class="guide-view">
    <header ref="topbarEl" class="pv-topbar">
      <div class="pv-topbar-row">
        <button type="button" class="pv-back" aria-label="返回" @click="emit('back')">
          <ChevronLeft :size="22" :stroke-width="2" aria-hidden="true" />
        </button>
        <h1 class="pv-title">使用說明</h1>
        <span class="pv-topbar-spacer" aria-hidden="true"></span>
      </div>

      <div class="guide-chips">
        <button
          v-for="section in SECTIONS"
          :key="section.id"
          type="button"
          class="guide-chip"
          @click="jump(section.id)"
        >
          {{ section.title }}
        </button>
      </div>
    </header>

    <div class="guide-body">
      <p class="guide-intro">
        噗浪是你和角色們的社群河道。這裡整理了每個功能怎麼用，想到再回來翻就好。
      </p>

      <section v-for="s in SECTIONS" :id="`guide-${s.id}`" :key="s.id" class="guide-card">
        <div class="guide-card-head">
          <component :is="s.icon" :size="18" aria-hidden="true" class="guide-icon" />
          <h2 class="guide-card-title">{{ s.title }}</h2>
        </div>
        <ul class="guide-list">
          <li v-for="(item, index) in s.items" :key="index">{{ item }}</li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "@/components/plurk/plurk-theme.scss" as *;

.guide-view {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
  background: var(--color-background);
  color: var(--color-text);
}

/* ---------- 頂欄 ---------- */
.pv-topbar {
  position: sticky;
  top: 0;
  z-index: 5;
  padding-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
  background: var(--color-background);
}

.pv-topbar-row {
  display: grid;
  grid-template-columns: $plurk-touch minmax(0, 1fr) $plurk-touch;
  align-items: center;
  height: 44px;
}

.pv-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: $plurk-touch;
  height: $plurk-touch;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-text);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.pv-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pv-topbar-spacer {
  display: block;
}

/* ---------- 分類按鈕 ---------- */
.guide-chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 16px 10px;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.guide-chip {
  flex: none;
  height: 32px;
  padding: 0 14px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

/* ---------- 內容 ---------- */
.guide-body {
  padding: 8px 16px calc(32px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.guide-intro {
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  margin: 0;
}

.guide-card {
  background: var(--color-surface);
  border-radius: 16px;
  padding: 14px 16px;
}

.guide-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.guide-icon {
  color: var(--color-primary);
}

.guide-card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.guide-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
  line-height: 1.6;

  li::marker {
    color: var(--color-text-muted);
  }
}
</style>
