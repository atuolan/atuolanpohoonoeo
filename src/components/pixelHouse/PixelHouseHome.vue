<script setup lang="ts">
/**
 * 像素小屋主頁（設計稿「三房：客廳｜臥室｜廚房＋浴室」）
 *
 * - 客廳、臥室、廚房排成一條，左右自由滑，停在哪就是哪；浴室從臥室的門進去，蓋在上面
 * - 家具就是 App：點了打開；長按房間進入編輯，可以拖動家具（牆上的在牆上、地上的在地上）
 * - 他自己在屋裡走來走去，跟聊天裡的真實狀態連動（睡覺、忙碌、出門、約會）
 */
import { CHAT_UNREAD_CHANGED_EVENT, loadAllChats, loadChatsByCharacter, resolvePreferredDirectChat } from "@/storage/chatStorage";
import { loadDateSession } from "@/services/dateOuting";
import { useCharactersStore } from "@/stores";
import { useHomeBadgesStore } from "@/stores/homeBadges";
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import HouseAppsSheet from "./HouseAppsSheet.vue";
import HouseRoom from "./HouseRoom.vue";
import HouseWardrobe from "./HouseWardrobe.vue";
import type { PartSlot } from "./wardrobeData";
import PixelDial from "./PixelDial.vue";
import {
  ACTS,
  CHAR_HEIGHT,
  FURNITURE_ACTIONS,
  itemZone,
  ROOM_H,
  ROOM_NAMES,
  ROOM_W,
  SCENE_TINT,
  STRIP_ROOMS,
  type FurnitureAction,
  type ItemZone,
  type RoomId,
} from "./houseData";
import { clampPlacement, followAnchor, pickDefaultResident, residentStatus, sceneAt, stripIndex, type ResidentStatus } from "./houseLogic";
import { loadCustomParts, loadPixelHouseState, PIXEL_HOUSE_CHANGED_EVENT, savePixelHouseState, type PixelHouseState } from "./houseState";
import { composeLook, loadDollManifest, loadWardrobeCatalog, type ComposedLook } from "./dollCompose";
import { defaultOutfit, type CustomPart, type DollManifest, type DollPose, type Outfit, type WardrobeCatalog } from "./wardrobeLogic";
import { stripX, useHouseResident } from "./useHouseResident";

const emit = defineEmits<{
  (e: "navigate", page: string, data?: Record<string, unknown>): void;
  (e: "open-global-theme"): void;
}>();

const ASSET = `${import.meta.env.BASE_URL}pixel-house/`;
const ALL_ROOMS: RoomId[] = ["living", "bedroom", "kitchen", "bath"];

// ===== 房間圖 =====
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface LayoutItem extends Box {
  id: string;
  name: string;
  empty?: boolean;
}
interface RoomLayout {
  size: [number, number];
  layers: string[];
  items: LayoutItem[];
  [layer: string]: unknown;
}

const layouts = reactive<Partial<Record<RoomId, RoomLayout>>>({});
const walkSizes = ref<Record<string, { w: number; h: number }>>({});

/** 使用者自己畫的分層小人（紙娃娃）：每個動作一組圖層，1 px＝房間 1 格；照他的外觀疊好再顯示 */
const doll = ref<DollManifest | null>(null);
const catalog = ref<WardrobeCatalog | null>(null);
/** 讀過這個身體的紙娃娃了（讀完才決定要用紙娃娃還是暫用的走路圖，不會先閃一下暫用圖） */
const dollChecked = ref(false);

const loaded = ref(false);

async function loadAssets() {
  const results = await Promise.all(
    ALL_ROOMS.map(async (room) => {
      const res = await fetch(`${ASSET}${room}/layout.json`);
      return [room, (await res.json()) as RoomLayout] as const;
    }),
  );
  for (const [room, layout] of results) layouts[room] = layout;
  try {
    walkSizes.value = await (await fetch(`${ASSET}chars/walk.json`)).json();
  } catch {
    walkSizes.value = {};
  }
  loaded.value = true;
}

// ===== 存的東西 =====
const state = reactive<PixelHouseState>(loadPixelHouseState());
function persist() {
  savePixelHouseState(JSON.parse(JSON.stringify(state)));
}
/** 設定頁改了光線就跟著換（其他設定回到主頁時才重新讀）；上傳的部位也重讀 */
function onSettingsChanged() {
  state.timeLight = loadPixelHouseState().timeLight;
  customParts.value = loadCustomParts();
}

function floorTop(room: RoomId): number {
  const f = layouts[room]?.floor as Box | undefined;
  return f ? f.y : 158;
}

function defaultsOf(room: RoomId): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  for (const it of layouts[room]?.items ?? []) out[it.id] = { x: it.x, y: it.y };
  return out;
}

function currentOf(room: RoomId): Record<string, { x: number; y: number }> {
  const out = defaultsOf(room);
  const saved = state.placements[room] ?? {};
  for (const [id, [x, y]] of Object.entries(saved)) if (out[id]) out[id] = { x, y };
  return out;
}

interface RenderItem extends LayoutItem {
  room: RoomId;
  px: number;
  py: number;
  zone: ItemZone;
  action?: FurnitureAction;
}

function itemsOf(room: RoomId): RenderItem[] {
  const layout = layouts[room];
  if (!layout) return [];
  const cur = currentOf(room);
  const ft = floorTop(room);
  return layout.items
    .filter((it) => !it.empty)
    .map((it) => ({
      ...it,
      room,
      px: cur[it.id].x,
      py: cur[it.id].y,
      zone: itemZone(room, it.id, it.y + it.h, ft),
      action: FURNITURE_ACTIONS[room][it.id],
    }));
}

const roomItems = computed(() => {
  const out = {} as Record<RoomId, RenderItem[]>;
  for (const r of ALL_ROOMS) out[r] = itemsOf(r);
  return out;
});

function layersOf(room: RoomId): { name: string; box: Box }[] {
  const layout = layouts[room];
  if (!layout) return [];
  return layout.layers.map((name) => ({ name, box: layout[name] as Box }));
}

// ===== 尺寸：房間高度撐滿畫面 =====
const root = ref<HTMLElement | null>(null);
const stageW = ref(390);
const stageH = ref(844);
const s = computed(() => stageH.value / ROOM_H);
const roomPx = computed(() => ROOM_W * s.value);
const stripPx = computed(() => roomPx.value * STRIP_ROOMS.length);
const maxScroll = computed(() => Math.max(0, stripPx.value - stageW.value));
const stripOffset = computed(() => (stripPx.value < stageW.value ? (stageW.value - stripPx.value) / 2 : 0));
const bathLeft = computed(() => (stageW.value - roomPx.value) / 2);
const u = (n: number) => n * s.value;

let resizeObs: ResizeObserver | null = null;
function measure() {
  const el = root.value;
  if (!el) return;
  stageW.value = el.clientWidth || 390;
  stageH.value = el.clientHeight || 844;
  scrollX.value = clampScroll(scrollX.value);
}

// ===== 左右滑 =====
const scrollX = ref(0);
const clampScroll = (v: number) => Math.min(Math.max(v, 0), maxScroll.value);
let anim = 0;

function stopAnim() {
  if (anim) cancelAnimationFrame(anim);
  anim = 0;
}

function animateTo(target: number, ms = 420) {
  stopAnim();
  const from = scrollX.value;
  const to = clampScroll(target);
  // 時間一律用 requestAnimationFrame 給的，不跟 performance.now() 混用
  let t0: number | null = null;
  const step = (t: number) => {
    if (t0 === null) t0 = t;
    const k = Math.min(1, Math.max(0, (t - t0) / ms));
    const e = 1 - Math.pow(1 - k, 3);
    scrollX.value = from + (to - from) * e;
    anim = k < 1 ? requestAnimationFrame(step) : 0;
  };
  anim = requestAnimationFrame(step);
}

function fling(v: number) {
  stopAnim();
  let vel = v;
  let last: number | null = null;
  const step = (t: number) => {
    const dt = last === null ? 16 : Math.max(0, t - last);
    last = t;
    const next = clampScroll(scrollX.value - vel * dt);
    const hitEdge = next === 0 || next === maxScroll.value;
    scrollX.value = next;
    vel *= Math.pow(0.94, dt / 16);
    anim = Math.abs(vel) > 0.02 && !hitEdge ? requestAnimationFrame(step) : 0;
  };
  anim = requestAnimationFrame(step);
}

/** 畫面中間是哪一間 */
const viewIdx = computed(() => {
  // 三間都看得到（寬螢幕）就算在客廳
  if (maxScroll.value <= 2) return 0;
  const center = scrollX.value + stageW.value / 2 - stripOffset.value;
  return Math.min(Math.max(Math.floor(center / roomPx.value), 0), STRIP_ROOMS.length - 1);
});

function scrollToRoom(idx: number, ms = 420) {
  const target = idx * roomPx.value + roomPx.value / 2 - stageW.value / 2;
  if (ms === 0) {
    stopAnim();
    scrollX.value = clampScroll(target);
  } else animateTo(target, ms);
}

// ===== 浴室 =====
const bathOpen = ref(false);
function openBath() {
  bathOpen.value = true;
  showAll.value = false;
}
function closeBath() {
  bathOpen.value = false;
  scrollToRoom(STRIP_ROOMS.indexOf("bedroom"));
}

// ===== 時間的光線 =====
const now = ref(new Date());
const scene = computed(() => sceneAt(now.value));
const tint = computed(() => (state.timeLight ? SCENE_TINT[scene.value] : SCENE_TINT.day));

// ===== 住在小屋的他 =====
const charactersStore = useCharactersStore();
const residentId = ref<string | null>(null);
const residentChatId = ref<string | null>(null);
const status = ref<ResidentStatus>("home");
const unread = ref(0);
const resident = computed(() => charactersStore.characters.find((c) => c.id === residentId.value) ?? null);

// ===== 他的外觀（每個角色一套） =====
const customParts = ref<CustomPart[]>(loadCustomParts());
const residentOutfit = computed<Outfit>(() => (residentId.value && state.looks[residentId.value]) || defaultOutfit(state.look));
const currentBase = computed(() => residentOutfit.value.base);
const pronoun = computed(() => (currentBase.value === "girl" ? "她" : "他"));
const composedLook = ref<ComposedLook | null>(null);

watch(
  currentBase,
  async (base) => {
    dollChecked.value = false;
    const [d, c] = await Promise.all([loadDollManifest(`${ASSET}chars/`, base), loadWardrobeCatalog(`${ASSET}chars/`, base)]);
    if (currentBase.value !== base) return;
    doll.value = d;
    catalog.value = c;
    dollChecked.value = true;
  },
  { immediate: true },
);

watch(
  () => [doll.value, JSON.stringify(residentOutfit.value), customParts.value] as const,
  async () => {
    const d = doll.value;
    if (!d) {
      composedLook.value = null;
      return;
    }
    const want = residentOutfit.value;
    const look = await composeLook(d, `${ASSET}chars/${want.base}/`, want, customParts.value);
    if (JSON.stringify(residentOutfit.value) === JSON.stringify(want) && doll.value === d) composedLook.value = look;
  },
  { immediate: true },
);

const residentName = computed(() => resident.value?.nickname || resident.value?.data?.name || "他");
const wardrobeOpen = ref(false);
const wardrobeSlot = ref<PartSlot | null>(null);
function openWardrobe(slot: PartSlot | null) {
  // 沒人住就沒有衣櫃（下面的提示會說到設定選一位）
  if (!residentId.value) return;
  wardrobeSlot.value = slot;
  wardrobeOpen.value = true;
}

/** 衣櫃存好了：記到這個角色 */
function saveOutfit(outfit: Outfit) {
  if (!residentId.value) return;
  state.looks[residentId.value] = JSON.parse(JSON.stringify(outfit)) as Outfit;
  persist();
}

const life = useHouseResident({
  scene,
  status,
  current: currentOf,
  defaults: defaultsOf,
});

async function ensureResident() {
  if (!charactersStore.characters.length) {
    try {
      await charactersStore.loadCharacters();
    } catch {
      // 讀不到角色就當沒人住
    }
  }
  const exists = (id: string | null) => !!id && charactersStore.characters.some((c) => c.id === id);
  if (exists(state.residentCharId)) {
    residentId.value = state.residentCharId;
    return;
  }
  // 第一次用（或原本的角色被刪了）：最近聊過的那位，之後固定
  const picked = pickDefaultResident(await loadAllChats());
  residentId.value = exists(picked) ? picked : null;
  if (residentId.value) {
    state.residentCharId = residentId.value;
    persist();
  }
}

async function refreshResident() {
  const id = residentId.value;
  if (!id) return;
  try {
    const chat = await resolvePreferredDirectChat(id);
    residentChatId.value = chat?.id ?? null;
    let dateOngoing = false;
    if (chat) {
      const session = await loadDateSession(chat.id);
      dateOngoing = session?.status === "ongoing";
    }
    const chats = await loadChatsByCharacter(id, { isGroupChat: false });
    unread.value = chats.reduce((sum, c) => sum + Math.max(0, c.unreadCount || 0), 0);
    status.value = residentStatus(chat?.charAway, dateOngoing);
  } catch (err) {
    console.warn("[PixelHouse] 讀角色狀態失敗", err);
  }
}

watch(status, (next, prev) => {
  if (!loaded.value || !residentId.value) return;
  life.onStatusChange(next, prev);
});

function openChat() {
  if (editMode.value) return;
  if (!residentId.value) return;
  emit("navigate", "chat", { chatId: residentChatId.value ?? undefined, characterId: residentId.value });
}

// ===== 他的樣子 =====
const frame = ref(0);
let frameTimer: ReturnType<typeof setInterval> | null = null;

const isHome = computed(() => !!residentId.value && life.home.value && loaded.value);
const meInBath = computed(() => life.me.room === "bath");
const meAct = computed(() => ACTS[life.act.value]);
const lying = computed(() => !life.walking.value && life.act.value === "sleep");

const spriteSet = computed(() => `${currentBase.value}-${life.facing.value > 0 ? "right" : "left"}`);
const spriteSrc = computed(() => {
  const dir = life.facing.value > 0 ? "right" : "left";
  const n = life.walking.value ? (frame.value % 6) + 1 : 1;
  return `${ASSET}chars/${currentBase.value}/walk-${dir}-${n}.png`;
});
/** 紙娃娃現在用哪個動作：有畫的就用，沒畫的先用正面 */
const dollPoseKey = computed<string | null>(() => {
  const d = doll.value;
  if (!d) return null;
  const dir = life.facing.value > 0 ? "right" : "left";
  const want = life.walking.value ? [`walk-${dir}`, "walk", "front"] : [meAct.value?.pose ?? "front", "front"];
  for (const k of want) if (d.poses[k]) return k;
  return Object.keys(d.poses)[0] ?? null;
});
const dollPose = computed<DollPose | null>(() => (dollPoseKey.value ? (doll.value?.poses[dollPoseKey.value] ?? null) : null));

/** 這個動作疊好的每一格（照他的外觀換好色）；每格都放，只顯示現在這格（換格時不會閃） */
const dollFrames = computed(() => (dollPoseKey.value ? (composedLook.value?.[dollPoseKey.value] ?? []) : []));
/** 好幾格的動作現在在第幾格（frame 每 110ms 加一） */
const dollFrame = computed(() => {
  const p = dollPose.value;
  if (!p?.frames || p.frames < 2) return 0;
  return Math.floor((frame.value * 110) / (p.ms ?? 150)) % p.frames;
});
const dollAnimated = computed(() => (dollPose.value?.frames ?? 1) > 1);
/** 畫的方向跟現在走的方向相反就左右翻 */
const dollFlip = computed(() => {
  const faces = dollPose.value?.faces;
  if (!faces) return false;
  return (faces === "left") !== (life.facing.value < 0);
});

/** 小人高幾格：紙娃娃照原尺寸，暫用的走路圖拉成 CHAR_HEIGHT */
const charUnits = computed(() => dollPose.value?.h ?? CHAR_HEIGHT);

const spriteSize = computed(() => {
  const p = dollPose.value;
  if (p) return { w: u(p.w), h: u(p.h) };
  const sz = walkSizes.value[spriteSet.value] ?? { w: 180, h: 312 };
  const h = u(CHAR_HEIGHT);
  return { w: (sz.w / sz.h) * h, h };
});

/** 他的腳在畫面上的位置（橫條或浴室裡的座標） */
const mePos = computed(() => {
  if (lying.value && meAct.value.lie) {
    const p = followAnchor(meAct.value.lie, meAct.value.anchor, currentOf("bedroom"), defaultsOf("bedroom"));
    return { x: stripX({ room: "bedroom", x: p.x }), y: p.y };
  }
  return { x: stripX(life.me), y: life.me.y };
});

const meStyle = computed(() => ({
  left: `${u(mePos.value.x)}px`,
  top: `${u(mePos.value.y)}px`,
  transition: lying.value ? "none" : `left ${life.moveMs.value}ms linear, top ${life.moveMs.value}ms linear`,
}));

const spriteStyle = computed(() => {
  const { w, h } = spriteSize.value;
  return {
    width: `${w}px`,
    height: `${h}px`,
    left: `${-w / 2}px`,
    top: `${-h + (dollPose.value ? 0 : u(1))}px`,
    // 躺下：先用站姿轉 90 度代替（之後換成睡覺的圖）；紙娃娃沒有走路的圖時，走路一上一下跳
    transform: lying.value
      ? "rotate(-90deg)"
      : dollFlip.value
        ? "scaleX(-1)"
        : dollPose.value && !dollAnimated.value && life.walking.value && frame.value % 2
          ? `translateY(${-u(1)}px)`
          : undefined,
    transformOrigin: lying.value ? "50% 100%" : undefined,
  };
});

const meVisible = computed(() => {
  if (!isHome.value) return false;
  if (meInBath.value) return bathOpen.value;
  if (bathOpen.value) return false;
  const x = u(mePos.value.x) + stripOffset.value - scrollX.value;
  return x > -20 && x < stageW.value + 20;
});

const steam = computed(() => {
  const a = meAct.value;
  if (!a?.steam || life.walking.value) return null;
  const p = followAnchor(a.steam, a.anchor, currentOf(a.room), defaultsOf(a.room));
  return { x: a.room === "bath" ? p.x : stripX({ room: a.room, x: p.x }), y: p.y, inBath: a.room === "bath" };
});

const bubbleText = computed(() => {
  if (unread.value > 0) return `💬 ${unread.value > 99 ? "99+" : unread.value}`;
  if (life.walking.value) return "";
  return meAct.value?.label ?? "";
});

// ===== 可以點的家具 =====
const showAll = ref(false);
const flashKey = ref<string | null>(null);
const choosing = ref<{ name: string; options: { app: string; label: string }[] } | null>(null);

function onItemClick(it: { room: RoomId; id: string; name: string; action?: FurnitureAction }) {
  if (editMode.value || !it.action) return;
  const action = it.action;
  flashKey.value = `${it.room}:${it.id}`;
  setTimeout(() => {
    flashKey.value = null;
    if (action.kind === "enter-bath") openBath();
    else if (action.kind === "choose") choosing.value = { name: it.name, options: action.options };
    else if (action.kind === "wardrobe") openWardrobe(action.slot as PartSlot);
    else emit("navigate", action.app);
  }, 160);
}

// ===== 轉盤、全部 App =====
const menuOpen = ref(false);
const sheetOpen = ref(false);
const homeBadges = useHomeBadgesStore();
const badges = computed(() => homeBadges.badges);

function pickDialApp(app: string) {
  menuOpen.value = false;
  if (app === "__all__") {
    sheetOpen.value = true;
    return;
  }
  emit("navigate", app);
}

function pickSheetApp(app: string) {
  sheetOpen.value = false;
  emit("navigate", app);
}

function backToCanvas() {
  sheetOpen.value = false;
  state.homeStyle = "canvas";
  persist();
}

// ===== 編輯擺設 =====
const editMode = ref(false);
const dragging = ref<string | null>(null);

function enterEdit() {
  editMode.value = true;
  menuOpen.value = false;
  sheetOpen.value = false;
  showAll.value = false;
  choosing.value = null;
  try {
    navigator.vibrate?.(15);
  } catch {
    // 不支援震動就算了
  }
}

function finishEdit() {
  editMode.value = false;
  dragging.value = null;
  persist();
}

function resetRoom() {
  const room: RoomId = bathOpen.value ? "bath" : STRIP_ROOMS[viewIdx.value];
  delete state.placements[room];
  persist();
}

// ===== 手指：滑、長按、拖家具 =====
interface PointerState {
  id: number;
  startX: number;
  startY: number;
  startScroll: number;
  lastX: number;
  lastT: number;
  vel: number;
  moved: boolean;
  item?: { room: RoomId; it: RenderItem; ft: number; defY: number };
}
let ptr: PointerState | null = null;
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let suppressClick = false;

/** 蓋在房間上的面板（全部 App、衣櫃、轉盤）：在上面滑不要帶動房間 */
const OVERLAY_SELECTOR = ".ph-sheet-wrap, .wd-wrap, .ph-dial-root";

function onPointerDown(e: PointerEvent) {
  if (ptr || (e.pointerType === "mouse" && e.button !== 0)) return;
  if ((e.target as HTMLElement | null)?.closest?.(OVERLAY_SELECTOR)) return;
  stopAnim();
  ptr = {
    id: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    startScroll: scrollX.value,
    lastX: e.clientX,
    lastT: performance.now(),
    vel: 0,
    moved: false,
  };
  if (editMode.value) {
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-item]");
    const room = el?.dataset.room as RoomId | undefined;
    const it = room ? roomItems.value[room].find((i) => i.id === el?.dataset.item) : undefined;
    if (room && it && it.zone !== "fixed") {
      const def = layouts[room]?.items.find((i) => i.id === it.id);
      ptr.item = { room, it: { ...it }, ft: floorTop(room), defY: def?.y ?? it.py };
      dragging.value = `${room}:${it.id}`;
    }
  } else {
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      if (ptr && !ptr.moved) {
        enterEdit();
        suppressClick = true;
      }
    }, 550);
  }
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
}

function onPointerMove(e: PointerEvent) {
  if (!ptr || e.pointerId !== ptr.id) return;
  const dx = e.clientX - ptr.startX;
  const dy = e.clientY - ptr.startY;
  if (!ptr.moved && Math.hypot(dx, dy) > 8) {
    ptr.moved = true;
    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  if (!ptr.moved) return;
  if (ptr.item) {
    const { room, it, ft, defY } = ptr.item;
    const pos = clampPlacement(it.zone, { x: it.px + dx / s.value, y: it.py + dy / s.value, w: it.w, h: it.h }, ft, defY);
    state.placements[room] = { ...(state.placements[room] ?? {}), [it.id]: [pos.x, pos.y] };
    return;
  }
  if (bathOpen.value) return;
  const t = performance.now();
  const dt = Math.max(1, t - ptr.lastT);
  ptr.vel = 0.8 * ((e.clientX - ptr.lastX) / dt) + 0.2 * ptr.vel;
  ptr.lastX = e.clientX;
  ptr.lastT = t;
  scrollX.value = clampScroll(ptr.startScroll - dx);
}

function onPointerUp(e: PointerEvent) {
  if (!ptr || e.pointerId !== ptr.id) return;
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", onPointerUp);
  if (longPressTimer) clearTimeout(longPressTimer);
  longPressTimer = null;
  const p = ptr;
  ptr = null;
  if (p.item) {
    dragging.value = null;
    if (p.moved) persist();
  } else if (p.moved && !bathOpen.value && performance.now() - p.lastT < 80) {
    fling(p.vel);
  }
  if (p.moved) suppressClick = true;
  if (suppressClick) setTimeout(() => (suppressClick = false), 0);
}

/** 滑動或長按後放開，不算點到家具 */
function onClickCapture(e: MouseEvent) {
  if (suppressClick) {
    e.stopPropagation();
    e.preventDefault();
    suppressClick = false;
  }
}

// ===== 上面的房間列、下面的提示 =====
const tabs = computed(() => {
  const meTab = isHome.value ? stripIndex(life.me.room) : -1;
  return STRIP_ROOMS.map((room, i) => ({
    room,
    i,
    name: ROOM_NAMES[room],
    current: !bathOpen.value ? viewIdx.value === i : room === "bedroom",
    here: meTab === i,
  }));
});

function goTab(i: number) {
  if (bathOpen.value) bathOpen.value = false;
  scrollToRoom(i);
}

const canLeft = computed(() => !bathOpen.value && !editMode.value && scrollX.value > 2);
const canRight = computed(() => !bathOpen.value && !editMode.value && scrollX.value < maxScroll.value - 2);

const meLine = computed(() => {
  const p = pronoun.value;
  if (!residentId.value) return "還沒有人住進來｜到設定 › 主頁 選一位";
  if (status.value === "date") return `${p}出門約會了`;
  if (status.value === "away") return `${p}出門了`;
  if (life.walking.value) return `${p}正在走去${ROOM_NAMES[life.heading.value]}`;
  return `${p}在${ROOM_NAMES[life.me.room]}${meAct.value?.label ?? ""}`;
});

const hint = computed(() => {
  if (editMode.value) return "拖動家具，好了按「完成」";
  if (menuOpen.value) return "選一個 App";
  if (showAll.value) return "虛線框都可以點";
  if (!isHome.value || meVisible.value) return meLine.value;
  return `${meLine.value}　去看看 ▸`;
});

function hintTap() {
  if (editMode.value || menuOpen.value || !isHome.value || meVisible.value) return;
  if (meInBath.value) {
    openBath();
    return;
  }
  bathOpen.value = false;
  scrollToRoom(stripIndex(life.me.room));
}

// ===== 開始 =====
const onChatEvent = () => void refreshResident();

/**
 * 瀏覽器把聚焦的按鈕捲進畫面時會捲動 overflow:hidden 的容器，捲回來（左右滑由 scrollX 控制）。
 * 本來就可以捲的（全部 App、衣櫃的清單）不管。
 */
function onNativeScroll(e: Event) {
  const el = e.target as HTMLElement;
  if (!(el instanceof HTMLElement)) return;
  const st = getComputedStyle(el);
  if (/(auto|scroll)/.test(st.overflowY) || /(auto|scroll)/.test(st.overflowX)) return;
  if (el.scrollLeft !== 0) el.scrollLeft = 0;
  if (el.scrollTop !== 0) el.scrollTop = 0;
}
let statusTimer: ReturnType<typeof setInterval> | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  measure();
  if (typeof ResizeObserver !== "undefined" && root.value) {
    resizeObs = new ResizeObserver(measure);
    resizeObs.observe(root.value);
  }
  homeBadges.start();
  frameTimer = setInterval(() => {
    if (life.walking.value) frame.value++;
  }, 110);
  clockTimer = setInterval(() => (now.value = new Date()), 60_000);
  window.addEventListener(CHAT_UNREAD_CHANGED_EVENT, onChatEvent);
  window.addEventListener("aguaphone:chat-messages-appended", onChatEvent);
  window.addEventListener(PIXEL_HOUSE_CHANGED_EVENT, onSettingsChanged);

  await loadAssets();
  await ensureResident();
  await refreshResident();
  if (residentId.value && status.value !== "away" && status.value !== "date") life.start();
  // 一打開都從客廳開始（不跟著他跑；想看他點下面的提示）
  scrollToRoom(0, 0);
  statusTimer = setInterval(() => void refreshResident(), 30_000);
});

onUnmounted(() => {
  stopAnim();
  resizeObs?.disconnect();
  if (frameTimer) clearInterval(frameTimer);
  if (statusTimer) clearInterval(statusTimer);
  if (clockTimer) clearInterval(clockTimer);
  if (longPressTimer) clearTimeout(longPressTimer);
  window.removeEventListener(CHAT_UNREAD_CHANGED_EVENT, onChatEvent);
  window.removeEventListener("aguaphone:chat-messages-appended", onChatEvent);
  window.removeEventListener(PIXEL_HOUSE_CHANGED_EVENT, onSettingsChanged);
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", onPointerUp);
});

function itemStyle(it: RenderItem) {
  return {
    left: `${u(it.px)}px`,
    top: `${u(it.py)}px`,
    width: `${u(it.w)}px`,
    height: `${u(it.h)}px`,
  };
}

const clickableInView = (room: RoomId) => roomItems.value[room].filter((it) => it.action);
</script>

<template>
  <div
    ref="root"
    class="pixel-house"
    :class="{ 'is-editing': editMode }"
    @pointerdown="onPointerDown"
    @click.capture="onClickCapture"
    @scroll.capture="onNativeScroll"
  >
    <!-- 三間房排成一條 -->
    <div
      class="ph-strip"
      :style="{ width: `${stripPx}px`, transform: `translate3d(${stripOffset - scrollX}px, 0, 0)` }"
    >
      <div
        v-for="(room, idx) in STRIP_ROOMS"
        :key="room"
        class="ph-room"
        :style="{ left: `${idx * roomPx}px`, width: `${roomPx}px` }"
      >
        <HouseRoom
          :room="room"
          :asset="ASSET"
          :scale="s"
          :layers="layersOf(room)"
          :items="roomItems[room]"
          :edit-mode="editMode"
          :dragging="dragging"
          :flash-key="flashKey"
          :night="scene === 'night'"
          @item-click="onItemClick"
        />
        <!-- 「？」：所有可以點的地方 -->
        <template v-if="showAll && !bathOpen">
          <template v-for="it in clickableInView(room)" :key="`hint-${it.id}`">
            <div class="ph-spot" :style="itemStyle(it)" aria-hidden="true"></div>
            <div
              class="ph-spot-label"
              :style="{ left: `${u(it.px)}px`, top: `${Math.max(0, u(it.py) - 20)}px` }"
              aria-hidden="true"
            >
              {{ it.name }} → {{ it.action?.to }}
            </div>
          </template>
        </template>
      </div>

      <!-- 他（在客廳／臥室／廚房時） -->
      <div v-if="isHome && !meInBath" class="ph-me" :style="meStyle">
        <div v-if="!lying" class="ph-me-shadow" :style="{ width: `${u(24)}px`, height: `${u(3.4)}px` }"></div>
        <div
          v-if="dollPose"
          class="ph-me-sprite ph-doll"
          :class="{ 'is-hop': meAct?.hop && !life.walking.value }"
          :style="spriteStyle"
        >
          <img v-for="(src, n) in dollFrames" v-show="n === dollFrame" :key="n" :src="src" alt="" draggable="false" />
        </div>
        <img
          v-else-if="dollChecked"
          class="ph-me-sprite"
          :class="{ 'is-hop': meAct?.hop && !life.walking.value }"
          :src="spriteSrc"
          alt=""
          draggable="false"
          :style="spriteStyle"
        />
        <button
          class="ph-me-hit"
          :style="{ width: `${spriteSize.w}px`, height: `${spriteSize.h}px`, left: `${-spriteSize.w / 2}px`, top: `${-spriteSize.h}px` }"
          :aria-label="`${pronoun}，${meLine}，點了聊天`"
          @click.stop="openChat"
        ></button>
        <div
          v-if="bubbleText && !editMode"
          class="ph-bubble"
          :class="{ 'is-unread': unread > 0 }"
          :style="{ top: `${-(lying ? u(30) : spriteSize.h) - 34}px`, left: lying ? `${-u(charUnits / 2)}px` : undefined }"
          aria-hidden="true"
        >
          {{ bubbleText }}
        </div>
        <div v-if="lying" class="ph-zs" :style="{ left: `${-u(charUnits - 6)}px`, top: `${-u(14)}px` }" aria-hidden="true">
          <span>Z</span><span>Z</span><span>Z</span>
        </div>
      </div>
      <div
        v-if="isHome && steam && !steam.inBath"
        class="ph-steam"
        :style="{ left: `${u(steam.x)}px`, top: `${u(steam.y)}px` }"
        aria-hidden="true"
      >
        <i></i><i></i><i></i>
      </div>
    </div>

    <!-- 浴室：從臥室的門進去，蓋在上面 -->
    <div
      class="ph-bath"
      :class="{ 'is-open': bathOpen }"
      :style="{ left: `${bathLeft}px`, width: `${roomPx}px` }"
    >
      <HouseRoom
        room="bath"
        :asset="ASSET"
        :scale="s"
        :layers="layersOf('bath')"
        :items="roomItems.bath"
        :edit-mode="editMode"
        :dragging="dragging"
        :flash-key="flashKey"
        :night="scene === 'night'"
        @item-click="onItemClick"
      />
      <template v-if="showAll && bathOpen">
        <template v-for="it in clickableInView('bath')" :key="`hint-${it.id}`">
          <div class="ph-spot" :style="itemStyle(it)" aria-hidden="true"></div>
          <div class="ph-spot-label" :style="{ left: `${u(it.px)}px`, top: `${Math.max(0, u(it.py) - 20)}px` }" aria-hidden="true">
            {{ it.name }} → {{ it.action?.to }}
          </div>
        </template>
      </template>
      <div v-if="isHome && meInBath" class="ph-me" :style="meStyle">
        <div class="ph-me-shadow" :style="{ width: `${u(24)}px`, height: `${u(3.4)}px` }"></div>
        <div v-if="dollPose" class="ph-me-sprite ph-doll" :style="spriteStyle">
          <img v-for="(src, n) in dollFrames" v-show="n === dollFrame" :key="n" :src="src" alt="" draggable="false" />
        </div>
        <img v-else-if="dollChecked" class="ph-me-sprite" :src="spriteSrc" alt="" draggable="false" :style="spriteStyle" />
        <button
          class="ph-me-hit"
          :style="{ width: `${spriteSize.w}px`, height: `${spriteSize.h}px`, left: `${-spriteSize.w / 2}px`, top: `${-spriteSize.h}px` }"
          :aria-label="`${pronoun}，${meLine}，點了聊天`"
          @click.stop="openChat"
        ></button>
        <div v-if="bubbleText && !editMode" class="ph-bubble" :class="{ 'is-unread': unread > 0 }" :style="{ top: `${-spriteSize.h - 34}px` }" aria-hidden="true">
          {{ bubbleText }}
        </div>
      </div>
      <div v-if="isHome && steam && steam.inBath" class="ph-steam" :style="{ left: `${u(steam.x)}px`, top: `${u(steam.y)}px` }" aria-hidden="true">
        <i></i><i></i><i></i>
      </div>
    </div>

    <!-- 時間的光線（multiply：白色＝不變） -->
    <div class="ph-tint" :style="{ background: tint }" aria-hidden="true"></div>

    <!-- 介面 -->
    <div class="ph-ui">
      <!-- 左右換房間 -->
      <button v-if="canLeft" class="ph-arrow is-left" :aria-label="`去${ROOM_NAMES[STRIP_ROOMS[Math.max(0, viewIdx - 1)]]}`" @click="scrollToRoom(Math.max(0, viewIdx - 1))">◀</button>
      <button v-if="canRight" class="ph-arrow is-right" :aria-label="`去${ROOM_NAMES[STRIP_ROOMS[Math.min(2, viewIdx + 1)]]}`" @click="scrollToRoom(Math.min(2, viewIdx + 1))">▶</button>
      <button v-if="bathOpen" class="ph-leave-bath" @click="closeBath">◀ 回臥室</button>

      <!-- 房間列：他在哪間有小紅牌 -->
      <div class="ph-tabs">
        <button
          v-for="t in tabs"
          :key="t.room"
          class="ph-tab"
          :class="{ 'is-current': t.current }"
          :aria-current="t.current ? 'page' : undefined"
          :aria-label="t.name + (t.here ? `，${pronoun}在這裡` + (meInBath ? '（浴室）' : '') : '')"
          @click="goTab(t.i)"
        >
          {{ t.name }}
          <span v-if="t.here" class="ph-tab-here" aria-hidden="true">{{ pronoun }}</span>
        </button>
      </div>

      <button
        v-if="!editMode"
        class="ph-help"
        :class="{ 'is-on': showAll }"
        :aria-label="showAll ? '隱藏可以點的地方' : '顯示所有可以點的地方'"
        @click="showAll = !showAll"
      >
        ?
      </button>

      <PixelDial
        v-if="!editMode"
        :open="menuOpen"
        :badges="badges"
        @toggle="menuOpen = !menuOpen; showAll = false"
        @close="menuOpen = false"
        @pick="pickDialApp"
      />

      <!-- 下面的提示列 -->
      <div v-if="editMode" class="ph-edit-bar">
        <span class="ph-edit-text">{{ hint }}</span>
        <button class="ph-edit-btn" @click="resetRoom">還原這間</button>
        <button class="ph-edit-btn is-primary" @click="finishEdit">完成</button>
      </div>
      <button v-else class="ph-hint" aria-live="polite" @click="hintTap">{{ hint }}</button>

      <!-- 大門：商店還是外送 -->
      <div v-if="choosing" class="ph-choose-wrap" @click.self="choosing = null">
        <div class="ph-choose" role="dialog" :aria-label="choosing.name">
          <div class="ph-choose-title">{{ choosing.name }}</div>
          <button v-for="o in choosing.options" :key="o.app" class="ph-choose-btn" @click="choosing = null; emit('navigate', o.app)">
            {{ o.label }}
          </button>
          <button class="ph-choose-btn is-cancel" @click="choosing = null">取消</button>
        </div>
      </div>

      <HouseAppsSheet
        :open="sheetOpen"
        :badges="badges"
        @close="sheetOpen = false"
        @pick="pickSheetApp"
        @edit-layout="enterEdit"
        @wardrobe="sheetOpen = false; openWardrobe(null)"
        @global-theme="sheetOpen = false; emit('open-global-theme')"
        @back-to-canvas="backToCanvas"
      />
      <HouseWardrobe
        :open="wardrobeOpen"
        :char-name="residentName"
        :outfit="residentOutfit"
        :customs="customParts"
        :asset="ASSET"
        :start-slot="wardrobeSlot"
        @close="wardrobeOpen = false"
        @save="saveOutfit"
        @customs-changed="customParts = $event"
      />
    </div>

    <div v-if="!loaded" class="ph-loading" aria-live="polite">小屋載入中…</div>
  </div>
</template>

<style scoped>
.pixel-house {
  --ph-top: calc(var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + 12px);
  --ph-bottom: calc(var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) + 14px);
  position: absolute;
  inset: 0;
  overflow: hidden;
  overflow: clip;
  background: #3b2a26;
  font-family: "DotGothic16", "Noto Sans TC", "PingFang TC", sans-serif;
  color: #3b2a26;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.ph-strip {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  will-change: transform;
}

.ph-room {
  position: absolute;
  top: 0;
  height: 100%;
  overflow: hidden;
  overflow: clip;
}

.ph-spot {
  position: absolute;
  box-sizing: border-box;
  border: 2px dashed rgba(255, 243, 196, 0.95);
  background: rgba(255, 243, 196, 0.12);
  pointer-events: none;
}

.ph-spot-label {
  position: absolute;
  padding: 2px 6px;
  background: #3b2a26;
  color: #fbf7ee;
  font-size: 12px;
  line-height: 16px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 2;
}

/* ===== 他 ===== */
.ph-me {
  position: absolute;
  width: 0;
  height: 0;
  z-index: 3;
}

.ph-me-shadow {
  position: absolute;
  left: 0;
  top: 0;
  transform: translate(-50%, -60%);
  background: rgba(59, 42, 38, 0.22);
  border-radius: 50%;
  pointer-events: none;
}

.ph-me-sprite {
  position: absolute;
  display: block;
  pointer-events: none;
  -webkit-user-drag: none;
}

.ph-doll img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  image-rendering: crisp-edges;
  image-rendering: pixelated;
  pointer-events: none;
  -webkit-user-drag: none;
}

.ph-me-sprite.is-hop {
  animation: ph-hop 440ms steps(2, jump-none) infinite;
}

.ph-me-hit {
  position: absolute;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.is-editing .ph-me-hit {
  pointer-events: none;
}

.ph-bubble {
  position: absolute;
  left: 0;
  transform: translateX(-50%);
  padding: 3px 8px;
  background: #fbf7ee;
  border: 3px solid #3b2a26;
  font-size: 13px;
  line-height: 16px;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 3px 3px 0 rgba(59, 42, 38, 0.25);
}

.ph-bubble.is-unread {
  background: #fff3c4;
}

.ph-zs {
  position: absolute;
  left: 10px;
  top: -70px;
  width: 0;
  height: 0;
  pointer-events: none;
}

.ph-zs span {
  position: absolute;
  color: #fff3c4;
  text-shadow: 2px 2px 0 #3b2a26;
  line-height: 1;
  animation: ph-z 1.8s linear infinite;
}

.ph-zs span:nth-child(1) { left: 0; top: 0; font-size: 16px; }
.ph-zs span:nth-child(2) { left: 18px; top: -30px; font-size: 22px; animation-delay: 0.3s; }
.ph-zs span:nth-child(3) { left: 36px; top: -62px; font-size: 28px; animation-delay: 0.6s; }

.ph-steam {
  position: absolute;
  width: 0;
  height: 0;
  pointer-events: none;
  z-index: 3;
}

.ph-steam i {
  position: absolute;
  width: 9px;
  height: 9px;
  background: #fff;
  animation: ph-steam 1.98s steps(9) infinite;
}

.ph-steam i:nth-child(1) { left: -15px; }
.ph-steam i:nth-child(2) { left: -3px; animation-delay: 0.66s; }
.ph-steam i:nth-child(3) { left: 9px; animation-delay: 1.32s; }

/* ===== 浴室 ===== */
.ph-bath {
  position: absolute;
  top: 0;
  height: 100%;
  overflow: hidden;
  overflow: clip;
  opacity: 0;
  transform: scale(0.92);
  transform-origin: 87% 43%;
  pointer-events: none;
  box-shadow: 0 0 0 100vmax #3b2a26;
  visibility: hidden;
  transition:
    opacity 260ms ease,
    transform 320ms cubic-bezier(0.3, 0.9, 0.3, 1),
    visibility 0s linear 320ms;
}

.ph-bath.is-open {
  opacity: 1;
  transform: scale(1);
  pointer-events: auto;
  visibility: visible;
  transition:
    opacity 260ms ease,
    transform 320ms cubic-bezier(0.3, 0.9, 0.3, 1),
    visibility 0s;
}

.ph-tint {
  position: absolute;
  inset: 0;
  mix-blend-mode: multiply;
  pointer-events: none;
}

/* ===== 介面 ===== */
.ph-ui {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.ph-ui > * {
  pointer-events: auto;
}

.ph-tabs {
  position: absolute;
  left: 12px;
  top: var(--ph-top);
  display: flex;
  gap: 4px;
}

.ph-tab {
  position: relative;
  height: 40px;
  min-width: 60px;
  padding: 0 10px;
  border: 3px solid #3b2a26;
  background: #fbf7ee;
  color: #3b2a26;
  font-family: inherit;
  font-size: 15px;
  cursor: pointer;
  box-shadow: 3px 3px 0 rgba(59, 42, 38, 0.3);
}

.ph-tab.is-current {
  background: #3b2a26;
  color: #fbf7ee;
}

.ph-tab-here {
  position: absolute;
  right: -7px;
  top: -9px;
  padding: 0 3px;
  height: 18px;
  box-sizing: border-box;
  background: #d9453a;
  border: 2px solid #3b2a26;
  color: #fbf7ee;
  font-size: 11px;
  line-height: 14px;
  white-space: nowrap;
}

.ph-help {
  position: absolute;
  right: 76px;
  top: var(--ph-top);
  width: 44px;
  height: 44px;
  padding: 0;
  border: 3px solid #3b2a26;
  background: #fbf7ee;
  color: #3b2a26;
  font-family: inherit;
  font-size: 20px;
  line-height: 20px;
  cursor: pointer;
  box-shadow: 3px 3px 0 rgba(59, 42, 38, 0.3);
}

.ph-help.is-on {
  background: #3b2a26;
  color: #fbf7ee;
}

.ph-ui > .ph-dial-root,
.ph-ui :deep(.ph-dial-root) {
  pointer-events: none;
}

.ph-arrow {
  position: absolute;
  top: 50%;
  width: 32px;
  height: 52px;
  margin-top: -26px;
  padding: 0;
  border: 3px solid #3b2a26;
  background: rgba(251, 247, 238, 0.88);
  color: #3b2a26;
  font-family: inherit;
  font-size: 16px;
  cursor: pointer;
}

.ph-arrow.is-left { left: 6px; }
.ph-arrow.is-right { right: 6px; }

.ph-leave-bath {
  position: absolute;
  left: 12px;
  top: calc(var(--ph-top) + 56px);
  height: 40px;
  padding: 0 12px;
  border: 3px solid #3b2a26;
  background: #fbf7ee;
  color: #3b2a26;
  font-family: inherit;
  font-size: 15px;
  cursor: pointer;
  box-shadow: 3px 3px 0 rgba(59, 42, 38, 0.3);
}

.ph-hint {
  position: absolute;
  left: 50%;
  bottom: var(--ph-bottom);
  transform: translateX(-50%);
  width: min(298px, calc(100% - 92px));
  min-height: 40px;
  box-sizing: border-box;
  padding: 4px 12px;
  border: 0;
  background: #3b2a26;
  color: #fbf7ee;
  font-family: inherit;
  font-size: 15px;
  line-height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  box-shadow: 0 0 0 3px #fbf7ee;
  cursor: pointer;
}

.ph-edit-bar {
  position: absolute;
  left: 50%;
  bottom: var(--ph-bottom);
  transform: translateX(-50%);
  width: min(360px, calc(100% - 24px));
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 6px 6px 12px;
  background: #3b2a26;
  color: #fbf7ee;
  box-shadow: 0 0 0 3px #fbf7ee;
}

.ph-edit-text {
  flex: 1;
  font-size: 14px;
  line-height: 18px;
}

.ph-edit-btn {
  height: 34px;
  padding: 0 10px;
  border: 3px solid #fbf7ee;
  background: transparent;
  color: #fbf7ee;
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}

.ph-edit-btn.is-primary {
  background: #fbf7ee;
  color: #3b2a26;
}

.ph-choose-wrap {
  position: absolute;
  inset: 0;
  z-index: 25;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(43, 30, 27, 0.45);
}

.ph-choose {
  width: 220px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: #fbf7ee;
  border: 3px solid #3b2a26;
  box-shadow: 4px 4px 0 rgba(43, 30, 27, 0.35);
}

.ph-choose-title {
  font-size: 16px;
  text-align: center;
  margin-bottom: 2px;
}

.ph-choose-btn {
  height: 42px;
  border: 3px solid #3b2a26;
  background: #f3d98b;
  color: #3b2a26;
  font-family: inherit;
  font-size: 15px;
  cursor: pointer;
  box-shadow: 3px 3px 0 rgba(59, 42, 38, 0.25);
}

.ph-choose-btn.is-cancel {
  background: #fbf7ee;
}

.ph-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fbf7ee;
  font-size: 15px;
  pointer-events: none;
}

@keyframes ph-hop {
  0% { transform: translateY(0); }
  100% { transform: translateY(-6px); }
}

@keyframes ph-z {
  0%, 66% { opacity: 1; }
  67%, 100% { opacity: 0.3; }
}

@keyframes ph-steam {
  0% { transform: translateY(0) scale(1); opacity: 0.85; }
  100% { transform: translateY(-54px) scale(0.5); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .ph-me-sprite.is-hop,
  .ph-zs span,
  .ph-steam i {
    animation: none;
  }
}
</style>
