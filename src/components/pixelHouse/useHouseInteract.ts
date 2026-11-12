/**
 * 跟他互動：點他冒出「聊天／摸頭」、摸頭的反應、到新地方冒一句話、他留東西給你。
 *
 * 省電：沒有一直跑的計時器。全部是「使用者點了」或「他換一件事」那一刻才做事，
 * 要過幾秒收起來的用一次性的 setTimeout；畫面切到背景時 reset() 全部清掉。
 */
import { onUnmounted, ref, watch, type Ref } from "vue";
import type { Scene } from "./houseData";
import { countDaily, dailyLeft, loadHouseLifeState, rollDay, saveHouseLifeState } from "./houseLife";
import {
  GIFT_DAILY_LIMIT,
  PAT_MS,
  PAT_WINDOW_MS,
  SAY_CHANCE,
  SAY_MS,
  patMood,
  pickLine,
  pickPatLine,
  rollGift,
  type GiftKind,
  type PatMood,
  type PendingGift,
} from "./houseLines";
import { earnCoins } from "./wardrobeShop";

/** 點他之後，兩個按鈕過多久自己收起來 */
const MENU_MS = 3000;
const NOTICE_MS = 4500;

export function useHouseInteract(deps: {
  act: Ref<string>;
  walking: Ref<boolean>;
  scene: Ref<Scene>;
  /** 他在家、而且是自由活動（不是在睡、在忙） */
  free: Ref<boolean>;
  sleeping: Ref<boolean>;
  pronoun: Ref<string>;
}) {
  const menuOpen = ref(false);
  /** 他頭上現在的一句話（空字串 = 沒有） */
  const say = ref("");
  /** 摸頭的反應（null = 沒有） */
  const mood = ref<PatMood | null>(null);
  /** 每摸一次加一：讓愛心的動畫重新播 */
  const fxKey = ref(0);
  /** 下面提示列暫時顯示的話（收下東西…） */
  const notice = ref("");
  const gifts = ref<PendingGift[]>(loadHouseLifeState().gifts);

  let menuTimer: ReturnType<typeof setTimeout> | null = null;
  let sayTimer: ReturnType<typeof setTimeout> | null = null;
  let moodTimer: ReturnType<typeof setTimeout> | null = null;
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;
  let taps: number[] = [];

  function closeMenu() {
    if (menuTimer) clearTimeout(menuTimer);
    menuTimer = null;
    menuOpen.value = false;
  }

  function toggleMenu() {
    if (menuOpen.value) {
      closeMenu();
      return;
    }
    menuOpen.value = true;
    menuTimer = setTimeout(closeMenu, MENU_MS);
  }

  function speak(text: string, ms: number) {
    if (sayTimer) clearTimeout(sayTimer);
    say.value = text;
    sayTimer = setTimeout(() => {
      sayTimer = null;
      say.value = "";
    }, ms);
  }

  function showNotice(text: string) {
    if (noticeTimer) clearTimeout(noticeTimer);
    notice.value = text;
    noticeTimer = setTimeout(() => {
      noticeTimer = null;
      notice.value = "";
    }, NOTICE_MS);
  }

  function pat() {
    closeMenu();
    const now = Date.now();
    taps = [...taps.filter((t) => now - t <= PAT_WINDOW_MS), now];
    const m = patMood(taps, now, deps.sleeping.value);
    mood.value = m;
    fxKey.value++;
    speak(pickPatLine(m), PAT_MS);
    if (moodTimer) clearTimeout(moodTimer);
    moodTimer = setTimeout(() => {
      moodTimer = null;
      mood.value = null;
    }, PAT_MS);
  }

  // 走到了、開始做新的事：有機會說一句
  let lastSaid: string | null = null;
  watch(deps.walking, (now, was) => {
    if (now || !was || !deps.free.value) return;
    const act = deps.act.value;
    if (act === lastSaid || mood.value) return;
    lastSaid = act;
    if (Math.random() >= SAY_CHANCE) return;
    const line = pickLine(act, deps.scene.value);
    if (line) speak(line, SAY_MS);
  });

  // 做完一件事（要去做下一件了）：有機會留下東西
  watch(deps.act, (_next, prev) => {
    if (!prev || !deps.free.value) return;
    const now = new Date();
    const state = rollDay(loadHouseLifeState(now), now);
    const gift = rollGift(prev, state.gifts, dailyLeft(state, "gift", GIFT_DAILY_LIMIT));
    if (!gift) return;
    const counted = countDaily(state, "gift", GIFT_DAILY_LIMIT, now);
    if (!counted) return;
    const next = { ...counted, gifts: [...counted.gifts, gift] };
    saveHouseLifeState(next);
    gifts.value = next.gifts;
  });

  /** 收下他留的東西 */
  async function collect(kind: GiftKind) {
    const now = new Date();
    const state = loadHouseLifeState(now);
    const gift = state.gifts.find((g) => g.kind === kind);
    if (!gift) {
      gifts.value = state.gifts;
      return;
    }
    // 先從存檔拿掉再給錢：連點兩下不會領兩次
    const next = { ...state, gifts: state.gifts.filter((g) => g.kind !== kind), lastSeenAt: Math.max(state.lastSeenAt, now.getTime()) };
    saveHouseLifeState(next);
    gifts.value = next.gifts;
    const p = deps.pronoun.value;
    if (kind === "note") {
      showNotice(`${p}留的紙條：「${gift.text}」`);
      return;
    }
    const balance = gift.coins > 0 ? await earnCoins(gift.coins, `小屋：${p}煮的${gift.text}`, `pixel-house:gift:${kind}`) : null;
    showNotice(balance === null ? `收下${p}煮的${gift.text}` : `收下${p}煮的${gift.text}　＋${gift.coins} 金幣`);
  }

  /** 畫面看不到了：收起選單、清掉所有還沒到的計時器 */
  function reset() {
    closeMenu();
    for (const t of [sayTimer, moodTimer, noticeTimer]) if (t) clearTimeout(t);
    sayTimer = moodTimer = noticeTimer = null;
    say.value = "";
    mood.value = null;
    notice.value = "";
  }

  onUnmounted(reset);

  return { menuOpen, say, mood, fxKey, notice, gifts, toggleMenu, closeMenu, pat, collect, reset };
}
