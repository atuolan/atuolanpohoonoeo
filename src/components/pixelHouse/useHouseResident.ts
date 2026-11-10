/**
 * 小屋裡的他：自己決定做什麼、走過去、做一陣子再換下一件。
 * 跟真實狀態連動：在睡就去床上睡、在忙就坐電腦前、出門或約會就不在家。
 */
import { onUnmounted, reactive, ref, type Ref } from "vue";
import { ACTS, WALK_SPEED, type RoomId, type Scene } from "./houseData";
import { actSpot, dwellMs, pickAct, planRoute, type Leg, type ResidentStatus, type Spot } from "./houseLogic";

type Pos = { x: number; y: number };

export interface ResidentDeps {
  scene: Ref<Scene>;
  status: Ref<ResidentStatus>;
  /** 少走動：每件事做久一點 */
  calm: Ref<boolean>;
  /** 房間 → 家具現在的位置 */
  current: (room: RoomId) => Record<string, Pos>;
  /** 房間 → 家具預設的位置 */
  defaults: (room: RoomId) => Record<string, Pos>;
}

/** 真實狀態要他做的事：睡覺去床上、忙碌坐電腦前 */
function forcedAct(status: ResidentStatus): string | null {
  if (status === "sleep") return "sleep";
  if (status === "busy") return "pc";
  return null;
}

export function useHouseResident(deps: ResidentDeps) {
  const me = reactive<Spot>({ room: "living", x: 47, y: 252 });
  const act = ref<string>("sofa");
  const walking = ref(false);
  const facing = ref<1 | -1>(1);
  /** 這一段路走多久（毫秒）；0 = 直接出現 */
  const moveMs = ref(0);
  /** 走路時往哪間 */
  const heading = ref<RoomId>("living");
  const home = ref(false);
  /** 這趟會走到別間（同一間裡走動時是 false） */
  const crossing = ref(false);
  /** 排前後用的腳的位置：走路時用起點和終點裡比較前面的那個，走到了才換，不會走到一半被家具蓋住 */
  const depthY = ref(me.y);

  let nextTimer: ReturnType<typeof setTimeout> | null = null;
  let legTimer: ReturnType<typeof setTimeout> | null = null;
  let dead = false;

  const dwell = (key: string) => dwellMs(key, Math.random, deps.calm.value);

  function clearTimers() {
    if (nextTimer) clearTimeout(nextTimer);
    if (legTimer) clearTimeout(legTimer);
    nextTimer = legTimer = null;
  }

  function spotOf(key: string): Spot {
    const a = ACTS[key];
    return actSpot(a, deps.current(a.room), deps.defaults(a.room));
  }

  /** 臥室通往浴室的門口（門搬了跟著走） */
  function bathDoor(): Pos {
    const cur = deps.current("bedroom").door;
    const def = deps.defaults("bedroom").door;
    const dx = cur && def ? cur.x - def.x : 0;
    return { x: Math.min(Math.max(113 + dx, 6), 124), y: 158 };
  }

  function schedule(ms: number) {
    if (nextTimer) clearTimeout(nextTimer);
    nextTimer = setTimeout(() => {
      if (dead) return;
      const forced = forcedAct(deps.status.value);
      if (forced && forced === act.value && !walking.value) {
        // 一直在睡／在忙：原地繼續
        schedule(dwell(forced));
        return;
      }
      goTo(forced ?? pickAct(deps.scene.value, act.value, me.room));
    }, ms);
  }

  function goTo(key: string) {
    clearTimers();
    const target = spotOf(key);
    const legs = planRoute({ ...me }, target, bathDoor());
    act.value = key;
    crossing.value = target.room !== me.room;
    heading.value = target.room;
    walking.value = true;
    runLegs(legs, () => {
      walking.value = false;
      moveMs.value = 0;
      schedule(dwell(key));
    });
  }

  function runLegs(legs: Leg[], done: () => void) {
    if (dead) return;
    depthY.value = me.y;
    const [leg, ...rest] = legs;
    if (!leg) {
      done();
      return;
    }
    if (leg.teleport) {
      moveMs.value = 0;
      Object.assign(me, { room: leg.room, x: leg.x, y: leg.y });
      legTimer = setTimeout(() => runLegs(rest, done), 120);
      return;
    }
    // 跨房間時隔壁的邊上是同一個點，換算成同一條橫條上的距離
    const sameStrip = (leg.room === "bath") === (me.room === "bath");
    const dx = sameStrip ? stripX(leg) - stripX(me) : 0;
    const dy = leg.y - me.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) {
      Object.assign(me, { room: leg.room, x: leg.x, y: leg.y });
      runLegs(rest, done);
      return;
    }
    const ms = Math.round((dist / WALK_SPEED) * 1000);
    moveMs.value = ms;
    if (Math.abs(dx) > 2) facing.value = dx > 0 ? 1 : -1;
    depthY.value = Math.max(me.y, leg.y);
    Object.assign(me, { room: leg.room, x: leg.x, y: leg.y });
    legTimer = setTimeout(() => runLegs(rest, done), ms);
  }

  /** 開始（或回到家）：真實狀態有指定就先做那件，不然隨機挑一件，直接站到那裡 */
  function start(fromDoor = false) {
    clearTimers();
    home.value = true;
    const first = forcedAct(deps.status.value) ?? pickAct(deps.scene.value, null, null);
    if (fromDoor) {
      // 出門回來：從客廳大門走進來
      const door = spotOf("door");
      Object.assign(me, door);
      depthY.value = me.y;
      moveMs.value = 0;
      act.value = "door";
      goTo(first);
      return;
    }
    const spot = spotOf(first);
    moveMs.value = 0;
    Object.assign(me, spot);
    depthY.value = me.y;
    act.value = first;
    walking.value = false;
    schedule(dwell(first));
  }

  /** 出門（暫離、約會）：不在家 */
  function leave() {
    clearTimers();
    home.value = false;
    walking.value = false;
  }

  let paused = false;

  /** 畫面看不到了（App 切到背景、螢幕關掉）：停下來，不在背景繼續走 */
  function pause() {
    if (paused || !home.value) return;
    paused = true;
    clearTimers();
    if (walking.value) {
      // 走到一半：直接站到要去的地方
      Object.assign(me, spotOf(act.value));
      depthY.value = me.y;
      moveMs.value = 0;
      walking.value = false;
    }
  }

  /** 畫面回來了：真實狀態有指定就過去，不然繼續做原本的事 */
  function resume() {
    if (!paused) return;
    paused = false;
    if (!home.value) return;
    const forced = forcedAct(deps.status.value);
    if (forced && forced !== act.value) goTo(forced);
    else schedule(dwell(act.value));
  }

  /** 狀態變了：要睡、要忙就馬上過去；出門就離開；回來就從大門進來 */
  function onStatusChange(next: ResidentStatus, prev: ResidentStatus | undefined) {
    // 停著的時候不動，回來時 resume 會照最新的狀態走
    if (paused && next !== "away" && next !== "date" && home.value) return;
    if (next === "away" || next === "date") {
      leave();
      return;
    }
    if (!home.value) {
      start(prev === "away" || prev === "date");
      return;
    }
    const forced = forcedAct(next);
    if (forced && forced !== act.value) goTo(forced);
    else if (!forced && (prev === "sleep" || prev === "busy")) goTo(pickAct(deps.scene.value, act.value, me.room));
  }

  onUnmounted(() => {
    dead = true;
    clearTimers();
  });

  return { me, act, walking, facing, moveMs, heading, home, crossing, depthY, start, pause, resume, leave, onStatusChange };
}

/** 橫條上的 x（房間格子）：客廳 0、臥室 130、廚房 260；浴室自己一張 */
export function stripX(p: { room: RoomId; x: number }): number {
  const idx = p.room === "living" ? 0 : p.room === "kitchen" ? 2 : 1;
  return p.room === "bath" ? p.x : idx * 130 + p.x;
}
