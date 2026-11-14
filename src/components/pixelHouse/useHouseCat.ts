/**
 * 小屋裡的一隻貓（或狗：同一套，碗、上廁所的地方、會不會跳窗台不一樣；狗還會出門散步）：自己決定做什麼、走過去、待一陣子再換；餓了去碗那邊吃、想上廁所時頭上冒驚嘆號、
 * 生病時趴著、去醫院時不在家。牠的數值和家裡的用品在 usePetHome（好幾隻共用）。
 *
 * 省電：跟他一樣，一次只有一個一次性的計時器（40～90 秒才換一件事），走路交給 CSS 補間；
 * 數值照時間差算，不用計時器扣；畫面切到背景時 pause() 全停。
 */
import { computed, onUnmounted, reactive, ref, watch, type Ref } from "vue";
import {
  awayUntil,
  catDwellMs,
  catLevels,
  catListless,
  rollCatGift,
  CAT_ACTS,
  CAT_GIFT_DAILY_LIMIT,
  CAT_FOLLOW,
  CAT_FOLLOW_LABEL,
  CAT_JUMP_MS,
  CAT_RUB,
  CAT_RUB_LABEL,
  CAT_WANDER,
  CAT_WANDER_LABEL,
  pickWanderSpot,
  hungryBelow,
  PERCH_FLOOR_Y,
  pickCatFind,
  CAT_SPEED,
  FERRET_RUN_OVER,
  FERRET_RUN_SPEED,
  FERRET_SPEED,
  pickCatAct,
  type CatCare,
  type CatPose,
  type CatState,
  type CatStatKey,
} from "./houseCat";
import { ROOM_W, type RoomId, type Scene } from "./houseData";
import { countDaily, dailyLeft, loadHouseLifeState, rollDay, saveHouseLifeState } from "./houseLife";
import { followAnchor, planRoute, type Spot } from "./houseLogic";
import { DOG_BOWL_SPOT, FERRET_BOWL_SPOT, LITTER_SPOT, PAD_SPOT, SPECIES_INFO } from "./petHome";
import type { PetHomeStore } from "./usePetHome";
import { stripX } from "./useHouseResident";
import { earnCoins } from "./wardrobeShop";

type Pos = { x: number; y: number };
/** 一段路；jump = 跳上跳下（窗台），用固定的短時間 */
type CatLeg = Spot & { jump?: boolean };
export type CatFx = "heart" | "bubble" | "note";

const FX_MS = 1600;
/** 想上廁所：頭上冒驚嘆號等多久（點了牠之後再多給這麼久，讓你滑到浴室點貓砂盆） */
export const URGE_MS = 15_000;
/** 站在貓砂盆上的位置（腳） */
const LITTER_ACT = "litter";
/** 想上廁所：原地等 */
const URGE_ACT = "urge";

export type HouseCat = ReturnType<typeof useHouseCat>;

/** 一起睡的時候往左右錯開幾格（房間格子） */
const SLEEP_NUDGE = [0, -13, 13];
const BED_NUDGE = [0, -13, -26];

export function useHouseCat(
  catId: Ref<string | null>,
  store: PetHomeStore,
  deps: {
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
    /** 這間現在在畫面上嗎（想上廁所的小遊戲只在看得到的時候玩） */
    inView: (room: RoomId) => boolean;
    /** 還沒拿到的、只有貓會叼回來的小擺件 */
    unownedFinds: () => { id: string; name: string }[];
    /** 拿到一件（擺出來） */
    grantFind: (id: string) => void;
    notify: (text: string) => void;
  },
  /** 第幾格（0～2）：大家一起睡同一個地方時錯開一點，不會疊成一隻 */
  slot = 0,
) {
  const cat = computed<CatState | undefined>(() => (catId.value ? store.catById(catId.value) : undefined));
  const me = reactive<Spot>({ room: "living", x: 30, y: 192 });
  const act = ref("sit-living");
  const walking = ref(false);
  /** 雪貂這趟用跑的（長距離、跨房間）：換跑步的圖、跑得快 */
  const running = ref(false);
  const facing = ref<1 | -1>(1);
  const moveMs = ref(0);
  /** 摸、洗、逗的時候頭上冒的東西 */
  const fx = ref<CatFx | null>(null);
  const fxKey = ref(0);
  /** 數值（牠換一件事、照顧完時重算；不是每秒算） */
  const levels = ref<Record<CatStatKey, number>>({ food: 0, clean: 0, mood: 0 });
  /** 正在逗牠：原地跳一下 */
  const playing = ref(false);
  /** 想上廁所（頭上冒驚嘆號）、已經點過牠（等你點貓砂盆） */
  const urge = ref(false);
  const picked = ref(false);
  /** 在醫院（不在家） */
  const away = ref(false);

  let nextTimer: ReturnType<typeof setTimeout> | null = null;
  let legTimer: ReturnType<typeof setTimeout> | null = null;
  let fxTimer: ReturnType<typeof setTimeout> | null = null;
  let urgeTimer: ReturnType<typeof setTimeout> | null = null;
  let awayTimer: ReturnType<typeof setTimeout> | null = null;
  let paused = false;
  let started = false;
  let dead = false;
  /** 到處逛這一趟要去哪（挑到「到處逛」時決定） */
  let wanderTo: Spot | null = null;

  function refreshLevels() {
    if (cat.value) levels.value = catLevels(cat.value, Date.now());
  }

  const sick = computed(() => !!cat.value?.sickSince);
  const isDog = computed(() => cat.value?.species === "dog");
  /** 出門散步中（不是在醫院） */
  const onWalk = computed(() => !!cat.value && cat.value.outUntil > cat.value.vetUntil);
  const listless = computed(() => !!cat.value && catListless(levels.value, sick.value));

  function clearTimers() {
    for (const t of [nextTimer, legTimer, urgeTimer]) if (t) clearTimeout(t);
    nextTimer = legTimer = urgeTimer = null;
  }

  /** 這件事在哪：固定的照設計稿（家具搬了跟著走）；蹭他是他現在站的地方旁邊 */
  function spotOf(key: string): Spot {
    if (key === CAT_RUB || key === CAT_FOLLOW) {
      const r = deps.residentSpot();
      const side = r.x > ROOM_W / 2 ? -14 : 14;
      return { room: r.room, x: Math.min(Math.max(r.x + side, 10), ROOM_W - 10), y: Math.min(r.y + 3, 276) };
    }
    if (key === LITTER_ACT) {
      if (isDog.value) return { room: PAD_SPOT.room, x: PAD_SPOT.x + 8, y: PAD_SPOT.y + 5 };
      return { room: LITTER_SPOT.room, x: LITTER_SPOT.x + 9, y: LITTER_SPOT.y + 5 };
    }
    if (key === URGE_ACT) return { ...me };
    if (key === CAT_WANDER) return wanderTo ? { ...wanderTo } : { ...me };
    // 狗碗在貓碗右邊：站在碗後面一點，頭朝右低下去埋進碗裡（畫面那邊在牠前面再疊一個碗）
    if (key === "eat" && isDog.value) return { room: DOG_BOWL_SPOT.room, x: DOG_BOWL_SPOT.x, y: DOG_BOWL_SPOT.y + 3 };
    // 雪貂的碗在貓碗左邊
    if (key === "eat" && cat.value?.species === "ferret") return { room: FERRET_BOWL_SPOT.room, x: FERRET_BOWL_SPOT.x - 6, y: FERRET_BOWL_SPOT.y + 7 };
    const a = CAT_ACTS[key];
    if (!a) return { ...me };
    const p = followAnchor([a.x, a.y], a.anchor, deps.current(a.room), deps.defaults(a.room));
    // 床的右邊是床尾：往左排（不然第三隻會掉到床外面）
    const nudges = key === "nap-bed" ? BED_NUDGE : SLEEP_NUDGE;
    const nudge = a.pose === "sleep" ? nudges[slot % nudges.length] : 0;
    return { room: a.room, x: Math.min(Math.max(p.x + nudge, 10), ROOM_W - 10), y: p.y };
  }

  function pickNext(): string {
    refreshLevels();
    const c = cat.value;
    // 餓了、碗裡有飯：去吃（貓一天大約 4 頓、狗 2 頓）
    if (c && levels.value.food < hungryBelow(c.species) && store.home.value.stock[SPECIES_INFO[c.species].food] > 0 && act.value !== "eat") return "eat";
    const next = pickCatAct({
      scene: deps.scene.value,
      current: act.value,
      residentAsleep: deps.residentAsleep.value && !sick.value,
      residentHome: deps.residentHome.value,
      listless: listless.value,
      personality: c?.personality,
      species: c?.species,
    });
    if (next === CAT_WANDER) wanderTo = pickWanderSpot(me.room);
    return next;
  }

  function dwell(key: string) {
    return catDwellMs(key, Math.random, deps.calm.value, cat.value?.species);
  }

  function schedule(ms: number) {
    if (nextTimer) clearTimeout(nextTimer);
    nextTimer = setTimeout(tick, ms);
  }

  /** 換一件事的時間到了 */
  function tick() {
    nextTimer = null;
    const c = cat.value;
    if (dead || !c || paused) return;
    store.liveTick();
    if (checkAway()) return;
    // 該上廁所了：看得到牠就玩小遊戲，看不到就照訓練度自己決定
    if (Date.now() >= c.toiletAt) {
      if (deps.inView(me.room)) {
        startUrge();
        return;
      }
      afterToilet(store.toilet(c.id, false).result, false);
    }
    // 他在睡、牠已經在床上：繼續睡
    if (deps.residentAsleep.value && act.value === "nap-bed" && !walking.value) {
      schedule(dwell(act.value));
      return;
    }
    void maybeGift();
    goTo(pickNext());
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
    startRoute(routeTo(key), () => {
      walking.value = false;
      moveMs.value = 0;
      // 吃飯：頭要朝著碗（碗在右邊），吃掉一份
      if (key === "eat") {
        facing.value = 1;
        if (cat.value) store.eat(cat.value.id);
        refreshLevels();
      }
      onArrive?.();
      schedule(dwell(key));
    });
  }

  /** 開始走一趟：雪貂看這趟多遠，遠的（或跨房間）用跑的 */
  function startRoute(legs: CatLeg[], done: () => void) {
    if (cat.value?.species === "ferret") {
      let total = 0;
      let at: Spot = { ...me };
      for (const leg of legs) {
        total += Math.hypot(stripX(leg) - stripX(at), leg.y - at.y);
        at = leg;
      }
      running.value = total > FERRET_RUN_OVER || legs.some((l) => l.room !== me.room);
    } else running.value = false;
    runLegs(legs, done);
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
      Object.assign(me, { room: leg.room, x: leg.x, y: leg.y });
      runLegs(rest, done);
      return;
    }
    const speed = cat.value?.species === "ferret" ? (running.value ? FERRET_RUN_SPEED : FERRET_SPEED) : CAT_SPEED;
    const ms = leg.jump ? CAT_JUMP_MS : Math.round((dist / speed) * 1000);
    moveMs.value = ms;
    if (Math.abs(dx) > 2) facing.value = dx > 0 ? 1 : -1;
    Object.assign(me, { room: leg.room, x: leg.x, y: leg.y });
    legTimer = setTimeout(() => runLegs(rest, done), ms);
  }

  // ===== 去醫院、出門散步 =====

  /** 不在家（在醫院、散步）：先不出現，回家的時間到了再開始。回傳 true = 不在家 */
  function checkAway(): boolean {
    const c = cat.value;
    const now = Date.now();
    if (!c || awayUntil(c) <= now) {
      away.value = false;
      return false;
    }
    clearTimers();
    urge.value = picked.value = false;
    away.value = true;
    walking.value = false;
    if (awayTimer) clearTimeout(awayTimer);
    const walk = onWalk.value;
    awayTimer = setTimeout(() => {
      awayTimer = null;
      away.value = false;
      if (!paused && !dead) {
        // 從大門回來
        Object.assign(me, spotOf("sit-living"), { x: 112, y: 162 });
        moveMs.value = 0;
        deps.notify(walk ? `${cat.value?.name ?? "牠"}散步回來了` : `${cat.value?.name ?? "牠"}從醫院回來了`);
        goTo(pickNext());
      }
    }, awayUntil(c) - now);
    return true;
  }

  watch(
    () => (cat.value ? awayUntil(cat.value) : 0),
    () => {
      if (started && !paused) checkAway();
    },
  );

  // ===== 想上廁所（小遊戲） =====

  function startUrge() {
    clearTimers();
    playing.value = false;
    act.value = URGE_ACT;
    walking.value = false;
    moveMs.value = 0;
    urge.value = true;
    picked.value = false;
    urgeTimer = setTimeout(() => endUrge(), URGE_MS);
  }

  /** 沒趕上：照訓練度決定牠自己去貓砂盆還是上在地上 */
  function endUrge() {
    urgeTimer = null;
    urge.value = picked.value = false;
    const c = cat.value;
    if (!c) return;
    afterToilet(store.toilet(c.id, false).result, true);
  }

  /** 上完廁所：去貓砂盆的走過去，上在地上的說一聲 */
  function afterToilet(result: "box" | "floor", visible: boolean) {
    const name = cat.value?.name ?? "貓";
    if (result === "floor") {
      deps.notify(visible ? `${name}來不及，在地上上了……點一下清掉` : `${name}在地上上廁所了，點一下清掉`);
      if (visible) schedule(dwell("sit-living"));
      return;
    }
    if (visible) goTo(LITTER_ACT);
  }

  /** 點了牠：想上廁所時是「選這隻」，等你點貓砂盆；不是的話回傳 false（打開照顧牠的面板） */
  function tap(): boolean {
    if (!urge.value) return false;
    picked.value = true;
    if (urgeTimer) clearTimeout(urgeTimer);
    urgeTimer = setTimeout(() => endUrge(), URGE_MS);
    deps.notify(`點浴室的${isDog.value ? "尿布墊" : "貓砂盆"}，帶${cat.value?.name ?? "牠"}過去`);
    return true;
  }

  /** 點了貓砂盆：有選這隻就帶牠過去。回傳 true = 這隻接手了 */
  function guideToBox(): boolean {
    const c = cat.value;
    if (!c || !urge.value || !picked.value) return false;
    const problem = store.boxProblem(c.id);
    if (problem) {
      deps.notify(problem);
      return true;
    }
    if (urgeTimer) clearTimeout(urgeTimer);
    urgeTimer = null;
    urge.value = picked.value = false;
    goTo(LITTER_ACT, () => {
      const r = store.toilet(c.id, true);
      if (r.result !== "box") return;
      showFx("heart");
      const place = c.species === "dog" ? "尿布墊" : "貓砂盆";
      const snack = c.species === "dog" ? "一根潔牙骨" : c.species === "ferret" ? "一條營養膏" : "一條貓條";
      deps.notify(`做得好！${c.name}在${place}上了，訓練度 +${r.trained}${r.trained > 10 ? `（用了${snack}當獎勵）` : ""}`);
    });
    return true;
  }

  /** 訓練：要牠現在上廁所（看得到牠才行） */
  function trainNow(): string | null {
    const c = cat.value;
    if (!c || away.value) return null;
    if (c.toiletAt - Date.now() > 2 * 3_600_000) {
      const h = Math.max(1, Math.round((c.toiletAt - Date.now()) / 3_600_000));
      return `${c.name}現在不想上廁所（大約 ${h} 小時後）`;
    }
    store.urgeNow(c.id);
    if (!paused) startUrge();
    return null;
  }

  // ===== 開始、暫停 =====

  /** 開始：直接出現在第一件事的位置 */
  function start() {
    if (!cat.value || dead) return;
    started = true;
    clearTimers();
    urge.value = picked.value = false;
    refreshLevels();
    if (checkAway()) return;
    // 一打開就要吃的話，先在廚房坐著，下一次再走去碗那邊（才看得到牠走過去）
    const picked0 = pickNext();
    const first = picked0 === "eat" ? "sit-kitchen" : picked0;
    Object.assign(me, spotOf(first));
    moveMs.value = 0;
    act.value = first;
    walking.value = false;
    if (!paused) schedule(dwell(first));
  }

  /** 畫面看不到了：停下來（走到一半就直接到；想上廁所的等到回來再說） */
  function pause() {
    if (paused) return;
    paused = true;
    clearTimers();
    for (const t of [fxTimer, awayTimer]) if (t) clearTimeout(t);
    fxTimer = awayTimer = null;
    fx.value = null;
    playing.value = false;
    urge.value = picked.value = false;
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
    if (checkAway()) return;
    schedule(dwell(act.value));
  }

  // 這一格換了一隻貓（剛領養）：重新開始
  watch(catId, (id, prev) => {
    if (id && id !== prev && !dead) {
      start();
      if (!prev) showFx("heart");
    }
  });

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

  /** 照顧牠。回傳 null 是做了；回傳字串是沒做的原因（顯示給使用者） */
  function care(kind: CatCare): string | null {
    const c = cat.value;
    if (!c) return null;
    const why = store.care(c.id, kind);
    refreshLevels();
    if (why) return why;
    if (paused || away.value) return null;
    if (kind === "wash") goTo("sit-bath", () => showFx("bubble"));
    else if (kind === "can") goTo("eat", () => showFx("heart"));
    else if (kind === "play") {
      playing.value = true;
      showFx("note");
    } else showFx("heart");
    return null;
  }

  /** 心情好的時候偶爾叼金幣或小擺件回來（家裡全部的貓加起來一天最多兩次） */
  async function maybeGift() {
    const c = cat.value;
    if (!c) return;
    const now = new Date();
    const state = rollDay(loadHouseLifeState(now), now);
    const coins = rollCatGift(catLevels(c, now.getTime()), dailyLeft(state, "catGift", CAT_GIFT_DAILY_LIMIT), Math.random, c.affinity, !!c.sickSince);
    if (coins <= 0) return;
    // 雪貂：叼走東西藏起來，要你去找（已經藏了一處就先不藏）
    if (c.species === "ferret" && store.home.value.stash) return;
    const counted = countDaily(state, "catGift", CAT_GIFT_DAILY_LIMIT, now);
    if (!counted) return;
    saveHouseLifeState(counted);
    if (c.species === "ferret") {
      if (store.hide(c.name, Math.round(coins * 1.5))) deps.notify(`${c.name}叼走了什麼東西，藏起來了……找找看`);
      return;
    }
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
    if (act.value !== CAT_FOLLOW || paused || dead || !started || !cat.value || away.value) return;
    if (legTimer) clearTimeout(legTimer);
    legTimer = null;
    walking.value = true;
    startRoute(routeTo(CAT_FOLLOW), () => {
      walking.value = false;
      moveMs.value = 0;
      // 第一次走到之前就被叫去改路：到了才開始算這件事做多久
      if (!nextTimer) schedule(dwell(CAT_FOLLOW));
    });
  });

  /**
   * 現在用哪張圖。"run" = 雪貂在跑（跑步那 8 張，畫面那邊照 frame 挑）。
   * 雪貂的 frame 每 110 毫秒加一，走路兩張換慢一點（220 毫秒）
   */
  function poseAt(frame: number): CatPose | "run" {
    if (walking.value && cat.value?.species === "ferret") return running.value ? "run" : Math.floor(frame / 2) % 2 ? "walk-b" : "walk-a";
    if (walking.value) return frame % 2 ? "walk-b" : "walk-a";
    if (playing.value || urge.value) return "sit";
    if (act.value === "eat") return "eat";
    if (listless.value) return "sleep";
    if (act.value === CAT_RUB || act.value === CAT_FOLLOW || act.value === LITTER_ACT) return "sit";
    return CAT_ACTS[act.value]?.pose ?? "sit";
  }

  const label = computed(() => {
    if (!cat.value) return "";
    if (away.value) return onWalk.value ? "出門散步" : "在醫院";
    if (walking.value) return "走來走去";
    if (urge.value) return "想上廁所！";
    if (act.value === "eat") return "吃飯";
    if (act.value === LITTER_ACT) return isDog.value ? "在尿布墊上" : "在貓砂盆上";
    if (sick.value) return "生病了，趴著";
    if (listless.value) return "沒精神，趴著";
    if (act.value === CAT_RUB) return CAT_RUB_LABEL;
    if (act.value === CAT_FOLLOW) return CAT_FOLLOW_LABEL;
    if (act.value === CAT_WANDER) return CAT_WANDER_LABEL;
    return CAT_ACTS[act.value]?.label ?? "";
  });

  const hop = computed(() => !walking.value && !listless.value && !urge.value && (playing.value || !!CAT_ACTS[act.value]?.hop));

  onUnmounted(() => {
    dead = true;
    clearTimers();
    for (const t of [fxTimer, awayTimer]) if (t) clearTimeout(t);
  });

  return {
    catId,
    cat,
    isDog,
    onWalk,
    me,
    act,
    walking,
    running,
    facing,
    moveMs,
    fx,
    fxKey,
    levels,
    sick,
    listless,
    urge,
    picked,
    away,
    label,
    hop,
    poseAt,
    refreshLevels,
    start,
    pause,
    resume,
    care,
    tap,
    guideToBox,
    trainNow,
  };
}
