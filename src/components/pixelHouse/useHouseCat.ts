/**
 * 小屋裡的貓：自己決定做什麼、走過去、待一陣子再換；可以領養、餵、洗、摸、逗。
 *
 * 省電：跟他一樣，一次只有一個一次性的計時器（40～90 秒才換一件事），走路交給 CSS 補間；
 * 數值照時間差算，不用計時器扣；畫面切到背景時 pause() 全停。
 */
import { computed, onUnmounted, reactive, ref, watch, type Ref } from "vue";
import {
  adoptCat,
  careCat,
  catDwellMs,
  catLevels,
  catListless,
  cleanCatName,
  rollCatGift,
  CAT_ACTS,
  CAT_FEED_BELOW,
  CAT_FEED_COINS,
  CAT_GIFT_DAILY_LIMIT,
  CAT_FOLLOW,
  CAT_FOLLOW_LABEL,
  CAT_JUMP_MS,
  CAT_RUB,
  CAT_RUB_LABEL,
  PERCH_FLOOR_Y,
  pickCatFind,
  CAT_SPEED,
  CAT_WASH_BELOW,
  pickCatAct,
  type CatCare,
  type CatColor,
  type CatPose,
  type CatState,
  type CatStatKey,
} from "./houseCat";
import { ROOM_W, type RoomId, type Scene } from "./houseData";
import { countDaily, dailyLeft, loadHouseLifeState, rollDay, saveHouseLifeState } from "./houseLife";
import { followAnchor, planRoute, type Spot } from "./houseLogic";
import { stripX } from "./useHouseResident";
import { earnCoins, payCoins } from "./wardrobeShop";

type Pos = { x: number; y: number };
/** 一段路；jump = 跳上跳下（窗台），用固定的短時間 */
type CatLeg = Spot & { jump?: boolean };
export type CatFx = "heart" | "bubble" | "note";

const FX_MS = 1600;

export function useHouseCat(deps: {
  scene: Ref<Scene>;
  calm: Ref<boolean>;
  current: (room: RoomId) => Record<string, Pos>;
  defaults: (room: RoomId) => Record<string, Pos>;
  /** 他在家嗎、在睡覺嗎、現在站哪 */
  residentHome: Ref<boolean>;
  residentAsleep: Ref<boolean>;
  residentSpot: () => Spot;
  /** 他站的位置變了就會變（他每走一段變一次）：「跟著他走」時重新找路 */
  residentKey: Ref<string>;
  /** 還沒拿到的、只有貓會叼回來的小擺件 */
  unownedFinds: () => { id: string; name: string }[];
  /** 拿到一件（擺出來） */
  grantFind: (id: string) => void;
  notify: (text: string) => void;
}) {
  const cat = ref<CatState | null>(loadHouseLifeState().cat);
  const me = reactive<Spot>({ room: "living", x: 30, y: 192 });
  const act = ref("sit-living");
  const walking = ref(false);
  const facing = ref<1 | -1>(1);
  const moveMs = ref(0);
  /** 摸、洗、逗的時候頭上冒的東西 */
  const fx = ref<CatFx | null>(null);
  const fxKey = ref(0);
  /** 三個數值（打開面板、照顧完、牠換一件事時重算；不是每秒算） */
  const levels = ref<Record<CatStatKey, number>>({ food: 0, clean: 0, mood: 0 });
  /** 正在逗牠：原地跳一下 */
  const playing = ref(false);

  let nextTimer: ReturnType<typeof setTimeout> | null = null;
  let legTimer: ReturnType<typeof setTimeout> | null = null;
  let fxTimer: ReturnType<typeof setTimeout> | null = null;
  let paused = false;
  let started = false;
  let dead = false;

  function refreshLevels() {
    if (cat.value) levels.value = catLevels(cat.value, Date.now());
  }
  refreshLevels();

  const listless = computed(() => !!cat.value && catListless(levels.value));

  function clearTimers() {
    if (nextTimer) clearTimeout(nextTimer);
    if (legTimer) clearTimeout(legTimer);
    nextTimer = legTimer = null;
  }

  /** 這件事在哪：固定的照設計稿（家具搬了跟著走）；蹭他是他現在站的地方旁邊 */
  function spotOf(key: string): Spot {
    if (key === CAT_RUB || key === CAT_FOLLOW) {
      const r = deps.residentSpot();
      const side = r.x > ROOM_W / 2 ? -14 : 14;
      return { room: r.room, x: Math.min(Math.max(r.x + side, 10), ROOM_W - 10), y: Math.min(r.y + 3, 276) };
    }
    const a = CAT_ACTS[key];
    if (!a) return { ...me };
    const p = followAnchor([a.x, a.y], a.anchor, deps.current(a.room), deps.defaults(a.room));
    return { room: a.room, x: p.x, y: p.y };
  }

  function pickNext(): string {
    refreshLevels();
    return pickCatAct({
      scene: deps.scene.value,
      current: act.value,
      residentAsleep: deps.residentAsleep.value,
      residentHome: deps.residentHome.value,
      listless: listless.value,
    });
  }

  function schedule(ms: number) {
    if (nextTimer) clearTimeout(nextTimer);
    nextTimer = setTimeout(() => {
      if (dead || !cat.value) return;
      // 他在睡、牠已經在床上：繼續睡
      if (deps.residentAsleep.value && act.value === "nap-bed" && !walking.value) {
        schedule(catDwellMs(act.value, Math.random, deps.calm.value));
        return;
      }
      void maybeGift();
      goTo(pickNext());
    }, ms);
  }

  /** 從現在的位置到這件事的路：在窗台上就先跳下來；要去窗台就走到下面再跳上去 */
  function routeTo(key: string): CatLeg[] {
    const target = spotOf(key);
    const legs: CatLeg[] = [];
    let from: Spot = { ...me };
    if (me.y < PERCH_FLOOR_Y - 4) {
      from = { room: me.room, x: me.x, y: PERCH_FLOOR_Y };
      legs.push({ ...from, jump: true });
    }
    if (CAT_ACTS[key]?.perch) {
      const below = { room: target.room, x: target.x, y: PERCH_FLOOR_Y };
      legs.push(...planRoute(from, below), { ...target, jump: true });
    } else legs.push(...planRoute(from, target));
    return legs;
  }

  function goTo(key: string, onArrive?: () => void) {
    clearTimers();
    playing.value = false;
    act.value = key;
    walking.value = true;
    runLegs(routeTo(key), () => {
      walking.value = false;
      moveMs.value = 0;
      onArrive?.();
      // 吃飯：頭要朝著碗（碗在右邊）
      if (key === "eat") facing.value = 1;
      schedule(catDwellMs(key, Math.random, deps.calm.value));
    });
  }

  function runLegs(legs: CatLeg[], done: () => void) {
    if (dead) return;
    const [leg, ...rest] = legs;
    if (!leg) {
      done();
      return;
    }
    const dx = stripX(leg) - stripX(me);
    const dist = Math.hypot(dx, leg.y - me.y);
    if (dist < 1) {
      Object.assign(me, leg);
      runLegs(rest, done);
      return;
    }
    const ms = leg.jump ? CAT_JUMP_MS : Math.round((dist / CAT_SPEED) * 1000);
    moveMs.value = ms;
    if (Math.abs(dx) > 2) facing.value = dx > 0 ? 1 : -1;
    Object.assign(me, { room: leg.room, x: leg.x, y: leg.y });
    legTimer = setTimeout(() => runLegs(rest, done), ms);
  }

  /** 開始：直接出現在第一件事的位置 */
  function start() {
    if (!cat.value || dead) return;
    started = true;
    clearTimers();
    const first = pickNext();
    Object.assign(me, spotOf(first));
    moveMs.value = 0;
    act.value = first;
    walking.value = false;
    if (!paused) schedule(catDwellMs(first, Math.random, deps.calm.value));
  }

  /** 畫面看不到了：停下來（走到一半就直接到） */
  function pause() {
    if (paused) return;
    paused = true;
    clearTimers();
    if (fxTimer) clearTimeout(fxTimer);
    fxTimer = null;
    fx.value = null;
    playing.value = false;
    if (walking.value) {
      Object.assign(me, spotOf(act.value));
      moveMs.value = 0;
      walking.value = false;
    }
  }

  function resume() {
    if (!paused) return;
    paused = false;
    if (!cat.value || !started) return;
    refreshLevels();
    schedule(catDwellMs(act.value, Math.random, deps.calm.value));
  }

  function showFx(kind: CatFx) {
    fx.value = kind;
    fxKey.value++;
    if (fxTimer) clearTimeout(fxTimer);
    fxTimer = setTimeout(() => {
      fxTimer = null;
      fx.value = null;
      playing.value = false;
    }, FX_MS);
  }

  function saveCat(next: CatState) {
    cat.value = next;
    saveHouseLifeState({ ...loadHouseLifeState(), cat: next });
    refreshLevels();
  }

  /** 領養（第一隻免費） */
  function adopt(name: string, color: CatColor) {
    if (cat.value) return;
    const next = adoptCat(name, color, Date.now());
    saveCat(next);
    deps.notify(`${next.name}來了！點牠可以照顧牠`);
    start();
    showFx("heart");
  }

  function rename(name: string) {
    if (!cat.value) return;
    const next = cleanCatName(name);
    if (next) saveCat({ ...cat.value, name: next });
  }

  /** 照顧牠。回傳 null 是做了；回傳字串是沒做的原因（顯示給使用者） */
  async function care(kind: CatCare): Promise<string | null> {
    const c = cat.value;
    if (!c) return null;
    refreshLevels();
    if (kind === "feed") {
      if (levels.value.food >= CAT_FEED_BELOW) return `${c.name}還很飽`;
      const paid = await payCoins(CAT_FEED_COINS, `小屋：${c.name}的飼料`, "pixel-house:cat:feed");
      if (!paid.ok) return paid.error === "insufficient_funds" ? `金幣不夠（飼料 ${CAT_FEED_COINS} 金幣）` : "付款失敗，再試一次";
      saveCat(careCat(c, "feed", Date.now()));
      // 走去碗那邊吃
      if (!paused) goTo("eat");
      return null;
    }
    if (kind === "wash") {
      if (levels.value.clean >= CAT_WASH_BELOW) return `${c.name}還很乾淨`;
      saveCat(careCat(c, "wash", Date.now()));
      // 走去浴室，到了才冒泡泡
      if (paused) showFx("bubble");
      else goTo("sit-bath", () => showFx("bubble"));
      return null;
    }
    saveCat(careCat(c, kind, Date.now()));
    if (kind === "play") {
      playing.value = true;
      showFx("note");
    } else showFx("heart");
    return null;
  }

  /** 心情好的時候偶爾叼金幣回來（一天最多兩次） */
  async function maybeGift() {
    const c = cat.value;
    if (!c) return;
    const now = new Date();
    const state = rollDay(loadHouseLifeState(now), now);
    const coins = rollCatGift(catLevels(c, now.getTime()), dailyLeft(state, "catGift", CAT_GIFT_DAILY_LIMIT));
    if (coins <= 0) return;
    const counted = countDaily(state, "catGift", CAT_GIFT_DAILY_LIMIT, now);
    if (!counted) return;
    saveHouseLifeState(counted);
    // 有時候是商店沒賣的小擺件（拿過的不會再叼）
    const finds = deps.unownedFinds();
    const findId = pickCatFind(finds.map((f) => f.id));
    if (findId) {
      deps.grantFind(findId);
      deps.notify(`${c.name}叼了一個${finds.find((f) => f.id === findId)?.name ?? "東西"}回來！已經擺出來了`);
      return;
    }
    await earnCoins(coins, `小屋：${c.name}叼回來的`, "pixel-house:cat:gift");
    deps.notify(`${c.name}叼了東西回來　＋${coins} 金幣`);
  }

  // 跟著他走：他每走一段（站的位置變了），牠就重新找路跟過去。不是一直算，是他動了才算一次
  watch(deps.residentKey, () => {
    if (act.value !== CAT_FOLLOW || paused || dead || !started || !cat.value) return;
    if (legTimer) clearTimeout(legTimer);
    legTimer = null;
    walking.value = true;
    runLegs(routeTo(CAT_FOLLOW), () => {
      walking.value = false;
      moveMs.value = 0;
      // 第一次走到之前就被叫去改路：到了才開始算這件事做多久
      if (!nextTimer) schedule(catDwellMs(CAT_FOLLOW, Math.random, deps.calm.value));
    });
  });

  /** 現在用哪張圖 */
  function poseAt(frame: number): CatPose {
    if (walking.value) return frame % 2 ? "walk-b" : "walk-a";
    if (playing.value) return "sit";
    if (listless.value) return "sleep";
    if (act.value === CAT_RUB || act.value === CAT_FOLLOW) return "sit";
    return CAT_ACTS[act.value]?.pose ?? "sit";
  }

  const label = computed(() => {
    if (!cat.value) return "";
    if (walking.value) return "走來走去";
    if (listless.value) return "沒精神，趴著";
    if (act.value === CAT_RUB) return CAT_RUB_LABEL;
    if (act.value === CAT_FOLLOW) return CAT_FOLLOW_LABEL;
    return CAT_ACTS[act.value]?.label ?? "";
  });

  const hop = computed(() => !walking.value && !listless.value && (playing.value || !!CAT_ACTS[act.value]?.hop));

  onUnmounted(() => {
    dead = true;
    clearTimers();
    if (fxTimer) clearTimeout(fxTimer);
  });

  return { cat, me, act, walking, facing, moveMs, fx, fxKey, levels, listless, label, hop, poseAt, refreshLevels, start, pause, resume, adopt, rename, care };
}
