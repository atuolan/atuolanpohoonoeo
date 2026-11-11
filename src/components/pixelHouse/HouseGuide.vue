<script setup lang="ts">
/**
 * 小屋怎麼玩：第一次打開小屋時自動出現，之後從「全部 App › 小屋怎麼玩」再看。
 * 每一條是一個常見的問題；有「試試看」的，按了直接帶去做那件事。
 */
export type GuideAction = "show-spots" | "open-dial" | "find-resident" | "wardrobe" | "edit-layout" | "settings";

defineProps<{
  open: boolean;
  /** 他或她 */
  pronoun: string;
  /** 有沒有人住（沒有就不能換外觀） */
  hasResident: boolean;
  /** 他現在在家（出門了就不能去找他） */
  atHome: boolean;
}>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "try", action: GuideAction): void;
}>();

interface GuideItem {
  q: string;
  /** {p} 會換成他或她 */
  a: string;
  action?: GuideAction;
  actionLabel?: string;
  /** 要有人住（resident）或他在家（home）才能試 */
  needs?: "resident" | "home";
}

const GROUPS: { title: string; items: GuideItem[] }[] = [
  {
    title: "基本",
    items: [
      {
        q: "家具就是 App",
        a: "點家具會打開對應的功能，例如電視是遊戲中心、月曆是行事曆、窗戶是天氣。",
      },
      {
        q: "不知道哪些可以點？",
        a: "按右上角的「？」，可以點的家具會出現虛線框，旁邊寫著會打開什麼。再按一次收起來。",
        action: "show-spots",
        actionLabel: "顯示給我看",
      },
      {
        q: "找不到想要的 App？",
        a: "點右上角的彩色轉盤，右邊會滑出選單：上面是常用的 App，「全部 App」裡有每一個功能；往右滑或點旁邊就收起來。",
        action: "open-dial",
        actionLabel: "打開選單",
      },
      {
        q: "怎麼換房間？",
        a: "左右滑，或點上面的「客廳／臥室／廚房」。浴室要從臥室右邊的門進去，左上角可以回臥室。",
      },
    ],
  },
  {
    title: "住在小屋的{p}",
    items: [
      {
        q: "{p}在做什麼？",
        a: "{p}會自己在屋裡走動、做事，最下面那一列寫著{p}現在在哪裡、做什麼。{p}在聊天裡睡了、在忙或出門了，小屋裡也會跟著。",
      },
      {
        q: "{p}不在畫面上？",
        a: "上面房間名字旁邊的紅色小牌子，是{p}在的那一間。點最下面那一列，畫面會滑過去找{p}。",
        action: "find-resident",
        actionLabel: "去找{p}",
        needs: "home",
      },
      {
        q: "怎麼看訊息、跟{p}聊天？",
        a: "點客廳大門旁的紅色信箱，打開所有訊息；有未讀的時候，信箱會露出一封信，{p}頭上也會出現泡泡和未讀數。直接點{p}，會打開跟{p}的聊天。",
      },
      {
        q: "怎麼換髮型、換衣服？",
        a: "點浴室的鏡子（換髮型）或洗衣籃（換衣服），也可以從「全部 App › 換外觀」進去。款式用金幣買，顏色免費換，還可以上傳自己畫的。",
        action: "wardrobe",
        actionLabel: "打開衣櫃",
        needs: "resident",
      },
    ],
  },
  {
    title: "佈置和設定",
    items: [
      {
        q: "怎麼移動家具？",
        a: "長按房間空的地方，進入編輯後拖動家具，好了按「完成」。牆上的只能放牆上，地上的只能放地上；拖窗戶時窗簾會一起動。擺亂了可以按「還原這間」。",
        action: "edit-layout",
        actionLabel: "開始移動",
      },
      {
        q: "想換住在小屋的人、覺得太耗電？",
        a: "到「設定 › 主頁」：可以換住的人、打開「少走動」（比較省電）、關掉晚上變暗，或切回原本的畫布主頁。",
        action: "settings",
        actionLabel: "去設定",
      },
    ],
  },
];
</script>

<template>
  <Transition name="ph-guide">
    <div v-if="open" class="ph-sheet-wrap ph-guide-wrap" @click.self="emit('close')">
      <section class="ph-guide" role="dialog" aria-label="小屋怎麼玩">
        <header class="ph-guide-head">
          <h2>小屋怎麼玩</h2>
          <button class="ph-guide-close" aria-label="關閉" @click="emit('close')">×</button>
        </header>

        <div class="ph-guide-body">
          <template v-for="g in GROUPS" :key="g.title">
            <h3 class="ph-guide-sub">{{ g.title.replace(/\{p\}/g, pronoun) }}</h3>
            <ul class="ph-guide-list">
              <li v-for="it in g.items" :key="it.q" class="ph-guide-item">
                <div class="ph-guide-q">{{ it.q.replace(/\{p\}/g, pronoun) }}</div>
                <div class="ph-guide-a">{{ it.a.replace(/\{p\}/g, pronoun) }}</div>
                <button
                  v-if="it.action && it.actionLabel && (!it.needs || (it.needs === 'home' ? atHome : hasResident))"
                  class="ph-guide-try"
                  @click="emit('try', it.action)"
                >
                  {{ it.actionLabel.replace(/\{p\}/g, pronoun) }}
                </button>
              </li>
            </ul>
          </template>
          <p class="ph-guide-foot">之後想再看：右上角的選單 › 全部 App › 小屋怎麼玩</p>
        </div>

        <footer class="ph-guide-actions">
          <button class="ph-guide-ok" @click="emit('close')">知道了</button>
        </footer>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.ph-guide-wrap {
  position: absolute;
  inset: 0;
  z-index: 32;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(30, 20, 18, 0.4);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
}

.ph-guide {
  position: relative;
  width: min(100%, 480px);
  max-height: 84%;
  display: flex;
  flex-direction: column;
  background: #fffbf5;
  border-radius: 24px 24px 0 0;
  box-shadow: 0 -10px 40px rgba(30, 20, 18, 0.25);
  color: #3b2a26;
  padding-bottom: env(safe-area-inset-bottom);
}

/* 上面的小把手 */
.ph-guide::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 7px;
  width: 38px;
  height: 5px;
  margin-left: -19px;
  border-radius: 999px;
  background: rgba(59, 42, 38, 0.18);
}

.ph-guide-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 14px 4px 20px;
}

.ph-guide-head h2 {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
}

.ph-guide-close {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  background: rgba(59, 42, 38, 0.08);
  color: #3b2a26;
  font-family: inherit;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.ph-guide-body {
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
  padding: 0 16px 8px;
  -webkit-overflow-scrolling: touch;
}

.ph-guide-sub {
  margin: 18px 4px 8px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  opacity: 0.55;
}

.ph-guide-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(59, 42, 38, 0.1);
}

.ph-guide-item {
  padding: 13px 16px;
  border-bottom: 1px solid rgba(59, 42, 38, 0.08);
}

.ph-guide-item:last-child {
  border-bottom: 0;
}

.ph-guide-q {
  font-size: 15px;
  font-weight: 600;
  line-height: 21px;
}

.ph-guide-a {
  margin-top: 3px;
  font-size: 13.5px;
  line-height: 20px;
  opacity: 0.72;
}

.ph-guide-try {
  margin-top: 9px;
  min-height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: rgba(232, 163, 61, 0.2);
  color: #7a4d0d;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.ph-guide-try:active {
  background: rgba(232, 163, 61, 0.34);
}

.ph-guide-foot {
  margin: 14px 4px 4px;
  font-size: 12px;
  text-align: center;
  opacity: 0.5;
}

.ph-guide-actions {
  padding: 10px 16px 14px;
}

.ph-guide-ok {
  width: 100%;
  min-height: 46px;
  border: 0;
  border-radius: 14px;
  background: #3b2a26;
  color: #fffbf5;
  font-family: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.ph-guide-enter-active,
.ph-guide-leave-active {
  transition: opacity 220ms ease;
}

.ph-guide-enter-active .ph-guide,
.ph-guide-leave-active .ph-guide {
  transition: transform 260ms cubic-bezier(0.3, 0.9, 0.3, 1);
}

.ph-guide-enter-from,
.ph-guide-leave-to {
  opacity: 0;
}

.ph-guide-enter-from .ph-guide,
.ph-guide-leave-to .ph-guide {
  transform: translateY(40px);
}
</style>
