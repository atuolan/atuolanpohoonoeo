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
import HouseDecorShop from "./HouseDecorShop.vue";
import HouseGuide, { type GuideAction } from "./HouseGuide.vue";
import HouseRoom from "./HouseRoom.vue";
import HouseWardrobe from "./HouseWardrobe.vue";
import type { PartSlot } from "./wardrobeData";
import PixelDial from "./PixelDial.vue";
import {
  ACTS,
  CHAR_HEIGHT,
  FURNITURE_ACTIONS,
  itemZone,
  moveGroupOf,
  ROOM_H,
  ROOM_NAMES,
  ROOM_W,
  SCENE_TINT,
  STRIP_ROOMS,
  type DecorDef,
  type SkinDef,
  type FurnitureAction,
  type ItemZone,
  type RoomId,
} from "./houseData";
import { clampGroupMove, clampPlacement, followAnchor, itemDepths, itemsInFront, pickDefaultResident, residentStatus, sceneAt, stripIndex, type ResidentStatus } from "./houseLogic";
import { loadCustomParts, loadPixelHouseState, PIXEL_HOUSE_CHANGED_EVENT, savePixelHouseState, type PixelHouseState } from "./houseState";
import { autoSleepSource, composeLook, SLEEP_POSE, loadDollManifest, loadWardrobeCatalog, type ComposedLook } from "./dollCompose";
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
  /** 商店買的擺件：圖的網址、是不是掛在牆上 */
  src?: string;
  wall?: boolean;
}
interface RoomLayout {
  size: [number, number];
  layers: string[];
  items: LayoutItem[];
  [layer: string]: unknown;
}

const layouts = reactive<Partial<Record<RoomId, RoomLayout>>>({});
const walkSizes = ref<Record<string, { w: number; h: number }>>({});
/** 擺件商店賣的全部擺件 */
const decorDefs = ref<DecorDef[]>([]);
/** 擺件商店「換款式」賣的全部款式 */
const skinDefs = ref<SkinDef[]>([]);

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
    decorDefs.value = await (await fetch(`${ASSET}decor/decor.json`)).json();
  } catch {
    decorDefs.value = [];
  }
  try {
    skinDefs.value = await (await fetch(`${ASSET}skins/skins.json`)).json();
  } catch {
    skinDefs.value = [];
  }
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
  const saved = loadPixelHouseState();
  state.timeLight = saved.timeLight;
  state.calm = saved.calm;
  customParts.value = loadCustomParts();
}

function floorTop(room: RoomId): number {
  const f = layouts[room]?.floor as Box | undefined;
  return f ? f.y : 158;
}

/** 這間房的全部家具：原本就有的，加上買了而且擺出來的擺件 */
function layoutItems(room: RoomId): LayoutItem[] {
  const base = layouts[room]?.items ?? [];
  const decor = decorDefs.value
    .filter((d) => d.room === room && state.decor[d.id] === true)
    .map((d) => ({ id: d.id, name: d.name, x: d.x, y: d.y, w: d.w, h: d.h, src: `${ASSET}decor/${d.id}.png`, wall: d.wall }));
  return decor.length ? [...base, ...decor] : base;
}

function defaultsOf(room: RoomId): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  for (const it of layoutItems(room)) out[it.id] = { x: it.x, y: it.y };
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
  /** 排在多前面（houseLogic.itemDepths） */
  depth: number;
  action?: FurnitureAction;
}

function itemsOf(room: RoomId): RenderItem[] {
  const layout = layouts[room];
  if (!layout) return [];
  const cur = currentOf(room);
  const ft = floorTop(room);
  const list = layoutItems(room)
    .filter((it) => !it.empty)
    .map((it) => ({
      ...it,
      room,
      px: cur[it.id].x,
      py: cur[it.id].y,
      zone: it.wall ? ("wall" as ItemZone) : itemZone(room, it.id, it.y + it.h, ft),
      depth: 0,
      action: FURNITURE_ACTIONS[room][it.id],
    }));
  const depths = itemDepths(
    room,
    list.map((it) => ({ id: it.id, x: it.px, y: it.py, w: it.w, h: it.h, zone: it.zone })),
  );
  for (const it of list) it.depth = depths[it.id] ?? 0;
  // 後面的先畫；一樣前後的維持原本的順序（sort 是穩定的）
  return list.sort((a, b) => a.depth - b.depth);
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
/** 白天不用疊色：整個畫面的混色很耗電，不需要就不放 */
const tintOn = computed(() => tint.value !== SCENE_TINT.day);

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

// ===== 擺件商店 =====
const decorOpen = ref(false);
/** 買了（或收起來的再擺出來）：出現在預設的位置 */
function onDecorChange(next: Record<string, boolean>) {
  state.decor = next;
  persist();
}
/** 買了款式、換款式 */
function onSkinsChange(next: { owned: string[]; worn: Record<string, string> }) {
  state.ownedSkins = next.owned;
  state.skins = next.worn;
  persist();
}
/** 每間房的家具換了哪個款式：家具 id → 款式 id */
const roomSkins = computed(() => {
  const out = {} as Record<RoomId, Record<string, string>>;
  for (const r of ALL_ROOMS) out[r] = {};
  for (const [slot, id] of Object.entries(state.skins)) {
    const [room, item] = slot.split(":") as [RoomId, string];
    if (out[room]) out[room][item] = id;
  }
  return out;
});
/** 去看：關掉商店，滑到那間房，那件家具閃一下 */
function showItem(room: RoomId, id: string) {
  decorOpen.value = false;
  if (room === "bath") openBath();
  else {
    bathOpen.value = false;
    scrollToRoom(stripIndex(room));
  }
  flashKey.value = `${room}:${id}`;
  setTimeout(() => {
    if (flashKey.value === `${room}:${id}`) flashKey.value = null;
  }, 1200);
}
function showDecor(id: string) {
  const d = decorDefs.value.find((x) => x.id === id);
  if (d) showItem(d.room, id);
  else decorOpen.value = false;
}
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
  calm: computed(() => state.calm),
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
/** 睡覺的圖還沒畫：用正面站姿自動做的那張（dollCompose，只有頭、閉眼），放在枕頭上 */
const autoSleepFrom = computed(() => (doll.value && !doll.value.poses[SLEEP_POSE] ? autoSleepSource(doll.value) : null));
const autoSleep = computed(() => lying.value && !!autoSleepFrom.value);
/** 睡覺時是直的（頭在枕頭上、身體在被子裡）；只有側面圖的舊紙娃娃和暫用的走路圖才轉 90 度躺著 */
const sleepUpright = computed(() => lying.value && !!doll.value && (!!doll.value.poses[SLEEP_POSE] || autoSleepFrom.value === "front"));
const dollPoseKey = computed<string | null>(() => {
  const d = doll.value;
  if (!d) return null;
  if (autoSleep.value) return SLEEP_POSE;
  const dir = life.facing.value > 0 ? "right" : "left";
  const want = life.walking.value ? [`walk-${dir}`, "walk", "front"] : [meAct.value?.pose ?? "front", "front"];
  for (const k of want) if (d.poses[k]) return k;
  return Object.keys(d.poses)[0] ?? null;
});
const dollPose = computed<DollPose | null>(() => {
  const d = doll.value;
  if (!d || !dollPoseKey.value) return null;
  // 自動做的睡覺圖跟拿來做的那個動作一樣大，只有一格
  if (autoSleep.value && autoSleepFrom.value) return { ...d.poses[autoSleepFrom.value], frames: 1 };
  return d.poses[dollPoseKey.value] ?? null;
});

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
  if (!faces || lying.value) return false;
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

// 用位移（transform）移動：不用每一格重新排版，交給顯示晶片處理，比改 left/top 省電
const meStyle = computed(() => ({
  transform: `translate3d(${u(mePos.value.x)}px, ${u(mePos.value.y)}px, 0)`,
  transition: lying.value ? "none" : `transform ${life.moveMs.value}ms linear`,
}));

const spriteStyle = computed(() => {
  const { w, h } = spriteSize.value;
  return {
    width: `${w}px`,
    height: `${h}px`,
    left: `${-w / 2}px`,
    top: `${-h + (dollPose.value ? 0 : u(1))}px`,
    // 躺下：先用站姿轉 90 度代替（之後換成睡覺的圖）；紙娃娃沒有走路的圖時，走路一上一下跳
    // 有畫睡覺的圖（已經是躺著的）就不轉
    transform: lying.value
      ? sleepUpright.value
        ? undefined
        : autoSleep.value && dollPose.value?.faces === "right"
          ? "rotate(-90deg) scaleX(-1)"
          : "rotate(-90deg)"
      : dollFlip.value
        ? "scaleX(-1)"
        : dollPose.value && !dollAnimated.value && life.walking.value && frame.value % 2
          ? `translateY(${-u(1)}px)`
          : undefined,
    transformOrigin: lying.value && !sleepUpright.value ? "50% 100%" : undefined,
  };
});

const meVisible = computed(() => {
  if (!isHome.value) return false;
  if (meInBath.value) return bathOpen.value;
  if (bathOpen.value) return false;
  const x = u(mePos.value.x) + stripOffset.value - scrollX.value;
  return x > -20 && x < stageW.value + 20;
});

/** 排前後用的腳的位置：靠牆那排家具（書桌、書櫃、門）永遠在他後面；躺在床上時沒有東西蓋住他 */
const meDepth = computed(() => {
  if (lying.value) return Infinity;
  const room = life.me.room;
  let d = Math.max(life.depthY.value, floorTop(room) + 2);
  const behind = life.walking.value ? undefined : meAct.value?.behind;
  const it = behind ? roomItems.value[room].find((i) => i.id === behind) : undefined;
  if (it) d = Math.min(d, it.depth - 0.5);
  return d;
});

/** 每間房哪些家具畫在他前面 */
const frontIds = computed(() => {
  const out = {} as Record<RoomId, string[]>;
  for (const room of ALL_ROOMS) {
    // 他在橫條上時三間都算（走到房間邊上會跨到隔壁），在浴室時只算浴室
    const same = (room === "bath") === meInBath.value;
    out[room] = isHome.value && same ? itemsInFront(Object.fromEntries(roomItems.value[room].map((i) => [i.id, i.depth])), meDepth.value) : [];
  }
  return out;
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
/** 有未讀訊息：客廳的信箱露出一封信 */
const hasMail = computed(() => (badges.value.message ?? 0) > 0);

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

// ===== 小屋怎麼玩 =====
const guideOpen = ref(false);
function closeGuide() {
  guideOpen.value = false;
  if (!state.guideSeen) {
    state.guideSeen = true;
    persist();
  }
}
/** 說明裡的「試試看」：關掉說明，直接帶去做那件事 */
function tryGuide(action: GuideAction) {
  closeGuide();
  if (action === "show-spots") {
    menuOpen.value = false;
    showAll.value = true;
  } else if (action === "open-dial") {
    showAll.value = false;
    menuOpen.value = true;
  } else if (action === "find-resident") findResident();
  else if (action === "wardrobe") openWardrobe(null);
  else if (action === "edit-layout") enterEdit();
  else if (action === "settings") emit("navigate", "settings");
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
  item?: { room: RoomId; it: RenderItem; ft: number; defY: number; group: RenderItem[] };
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
      const def = layoutItems(room).find((i) => i.id === it.id);
      const ids = moveGroupOf(room, it.id);
      const group = ids.length > 1 ? roomItems.value[room].filter((i) => ids.includes(i.id)).map((i) => ({ ...i })) : [];
      ptr.item = { room, it: { ...it }, ft: floorTop(room), defY: def?.y ?? it.py, group };
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
    const { room, it, ft, defY, group } = ptr.item;
    if (group.length > 1) {
      // 窗戶和窗簾整組一起動
      const d = clampGroupMove(
        group.map((g) => ({ x: g.px, y: g.py, w: g.w, h: g.h })),
        dx / s.value,
        dy / s.value,
        ft,
      );
      const next = { ...(state.placements[room] ?? {}) };
      for (const g of group) next[g.id] = [g.px + d.dx, g.py + d.dy];
      state.placements[room] = next;
      return;
    }
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
  if (life.walking.value) {
    return life.crossing.value ? `${p}正在走去${ROOM_NAMES[life.heading.value]}` : `${p}在${ROOM_NAMES[life.heading.value]}走動`;
  }
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
  findResident();
}

/** 畫面滑到他在的那一間 */
function findResident() {
  if (!isHome.value) return;
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

function startTimers() {
  stopTimers();
  frameTimer = setInterval(() => {
    if (life.walking.value) frame.value++;
  }, 110);
  clockTimer = setInterval(() => (now.value = new Date()), 60_000);
  statusTimer = setInterval(() => void refreshResident(), 30_000);
}

function stopTimers() {
  if (frameTimer) clearInterval(frameTimer);
  if (statusTimer) clearInterval(statusTimer);
  if (clockTimer) clearInterval(clockTimer);
  frameTimer = statusTimer = clockTimer = null;
}

/** App 切到背景、螢幕關掉：他停下來、計時器全停；回來再繼續 */
function onVisibilityChange() {
  if (document.hidden) {
    life.pause();
    stopTimers();
    return;
  }
  if (!started) return;
  now.value = new Date();
  startTimers();
  void refreshResident().then(() => life.resume());
}
let started = false;

onMounted(async () => {
  measure();
  if (typeof ResizeObserver !== "undefined" && root.value) {
    resizeObs = new ResizeObserver(measure);
    resizeObs.observe(root.value);
  }
  homeBadges.start();
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener(CHAT_UNREAD_CHANGED_EVENT, onChatEvent);
  window.addEventListener("aguaphone:chat-messages-appended", onChatEvent);
  window.addEventListener(PIXEL_HOUSE_CHANGED_EVENT, onSettingsChanged);

  await loadAssets();
  await ensureResident();
  await refreshResident();
  if (residentId.value && status.value !== "away" && status.value !== "date") life.start();
  // 一打開都從客廳開始（不跟著他跑；想看他點下面的提示）
  scrollToRoom(0, 0);
  // 第一次打開小屋：先看一次怎麼玩
  if (!state.guideSeen) guideOpen.value = true;
  started = true;
  if (document.hidden) life.pause();
  else startTimers();
});

onUnmounted(() => {
  stopAnim();
  resizeObs?.disconnect();
  stopTimers();
  document.removeEventListener("visibilitychange", onVisibilityChange);
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

// ===== 「？」的標籤 =====
// 量每個標籤的大小，一起排：快超出畫面左右就往內推、跟別的標籤疊到就往下挪；家具幾乎看不到就不顯示
const LABEL_MARGIN = 8;
const LABEL_GAP = 3;
/** 家具至少要露出這麼多（px）才顯示標籤 */
const LABEL_MIN_VISIBLE = 12;
const labelSizes = reactive<Record<string, { w: number; h: number }>>({});
function measureLabel(key: string, el: unknown) {
  if (!(el instanceof HTMLElement) || !el.offsetWidth) return;
  const cur = labelSizes[key];
  if (!cur || cur.w !== el.offsetWidth || cur.h !== el.offsetHeight) labelSizes[key] = { w: el.offsetWidth, h: el.offsetHeight };
}
/** 這間房的左邊在畫面上的哪裡 */
function roomScreenLeft(room: RoomId): number {
  if (room === "bath") return bathLeft.value;
  return stripOffset.value - scrollX.value + stripIndex(room) * roomPx.value;
}

/** 每個標籤在畫面上的位置（x 是畫面座標，y 跟房間同一個座標） */
const labelLayout = computed(() => {
  const out: Record<string, { x: number; y: number } | null> = {};
  if (!showAll.value) return out;
  const rooms: RoomId[] = bathOpen.value ? ["bath"] : STRIP_ROOMS;
  const entries: { key: string; x: number; y: number; w: number; h: number }[] = [];
  for (const room of rooms) {
    for (const it of clickableInView(room)) {
      const key = `${room}:${it.id}`;
      const itemL = roomScreenLeft(room) + u(it.px);
      const itemW = u(it.w);
      const shown = Math.min(itemL + itemW, stageW.value) - Math.max(itemL, 0);
      // 露出不到 12px（很小的家具：整件都要露出來）就不顯示；減 0.5 是小數誤差
      if (shown < Math.min(LABEL_MIN_VISIBLE, itemW) - 0.5) {
        out[key] = null;
        continue;
      }
      const size = labelSizes[key] ?? { w: 0, h: 22 };
      const x = Math.max(LABEL_MARGIN, Math.min(itemL, stageW.value - LABEL_MARGIN - size.w));
      entries.push({ key, x, y: Math.max(0, u(it.py) - 20), w: size.w, h: size.h });
    }
  }
  // 由上往下放；疊到上面已經放好的就往下挪到它下面
  entries.sort((a, b) => a.y - b.y || a.x - b.x);
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const hits = (a: { x: number; y: number; w: number; h: number }) =>
    placed.filter((p) => a.x < p.x + p.w + LABEL_GAP && p.x < a.x + a.w + LABEL_GAP && a.y < p.y + p.h + LABEL_GAP && p.y < a.y + a.h + LABEL_GAP);
  for (const e of entries) {
    let y = e.y;
    for (let i = 0; i < 8; i++) {
      const over = hits({ ...e, y });
      if (!over.length) break;
      y = Math.max(...over.map((p) => p.y + p.h + LABEL_GAP));
    }
    placed.push({ ...e, y });
    out[e.key] = { x: e.x, y };
  }
  return out;
});

function labelStyle(room: RoomId, it: RenderItem) {
  const pos = labelLayout.value[`${room}:${it.id}`];
  if (!pos) return { left: "0px", top: "0px", visibility: "hidden" as const };
  // 標籤放在橫條（或浴室）裡：畫面座標換回那一層的座標
  const layerLeft = room === "bath" ? bathLeft.value : stripOffset.value - scrollX.value;
  return { left: `${pos.x - layerLeft}px`, top: `${pos.y}px` };
}
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
          :has-mail="hasMail"
          :skins="roomSkins[room]"
          :sleeping="sleepUpright && isHome && room === 'bedroom'"
          pass="back"
          :front-ids="frontIds[room]"
          @item-click="onItemClick"
        />
        <!-- 「？」：所有可以點的地方 -->
        <template v-if="showAll && !bathOpen">
          <div v-for="it in clickableInView(room)" :key="`hint-${it.id}`" class="ph-spot" :style="itemStyle(it)" aria-hidden="true"></div>
        </template>
      </div>
      <!-- 「？」的標籤：放在所有房間上面，跨到隔壁房間也不會被切掉 -->
      <template v-if="showAll && !bathOpen">
        <template v-for="room in STRIP_ROOMS" :key="`labels-${room}`">
          <div
            v-for="it in clickableInView(room)"
            :key="`label-${room}-${it.id}`"
            :ref="(el) => measureLabel(`${room}:${it.id}`, el)"
            class="ph-spot-label"
            :style="labelStyle(room, it)"
            aria-hidden="true"
          >
            {{ it.name }} → {{ it.action?.to }}
          </div>
        </template>
      </template>

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
          :style="{ top: `${-(lying && !sleepUpright ? u(30) : spriteSize.h) - 34}px`, left: lying && !sleepUpright ? `${-u(charUnits / 2)}px` : undefined }"
          aria-hidden="true"
        >
          {{ bubbleText }}
        </div>
        <div
          v-if="lying"
          class="ph-zs"
          :style="sleepUpright ? { left: `${u(9)}px`, top: `${-u(charUnits - 8)}px` } : { left: `${-u(charUnits - 6)}px`, top: `${-u(14)}px` }"
          aria-hidden="true"
        >
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

      <!-- 在他前面的家具：疊在他上面 -->
      <div
        v-for="(room, idx) in STRIP_ROOMS"
        :key="`front-${room}`"
        class="ph-room ph-front"
        :style="{ left: `${idx * roomPx}px`, width: `${roomPx}px` }"
      >
        <HouseRoom
          :room="room"
          :asset="ASSET"
          :scale="s"
          :layers="[]"
          :items="roomItems[room]"
          :edit-mode="editMode"
          :dragging="dragging"
          :flash-key="flashKey"
          :night="scene === 'night'"
          :has-mail="hasMail"
          :skins="roomSkins[room]"
          :sleeping="sleepUpright && isHome && room === 'bedroom'"
          pass="front"
          :front-ids="frontIds[room]"
          @item-click="onItemClick"
        />
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
        :has-mail="hasMail"
        :skins="roomSkins.bath"
        pass="back"
        :front-ids="frontIds.bath"
        @item-click="onItemClick"
      />
      <template v-if="showAll && bathOpen">
        <template v-for="it in clickableInView('bath')" :key="`hint-${it.id}`">
          <div class="ph-spot" :style="itemStyle(it)" aria-hidden="true"></div>
          <div
            :ref="(el) => measureLabel(`bath:${it.id}`, el)"
            class="ph-spot-label"
            :style="labelStyle('bath', it)"
            aria-hidden="true"
          >
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
      <div class="ph-front ph-front-bath">
        <HouseRoom
          room="bath"
          :asset="ASSET"
          :scale="s"
          :layers="[]"
          :items="roomItems.bath"
          :edit-mode="editMode"
          :dragging="dragging"
          :flash-key="flashKey"
          :night="scene === 'night'"
          :has-mail="hasMail"
          :skins="roomSkins.bath"
          pass="front"
          :front-ids="frontIds.bath"
          @item-click="onItemClick"
        />
      </div>
    </div>

    <!-- 時間的光線（multiply：白色＝不變） -->
    <div v-if="tintOn" class="ph-tint" :style="{ background: tint }" aria-hidden="true"></div>

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
        @decor="sheetOpen = false; decorOpen = true"
        @global-theme="sheetOpen = false; emit('open-global-theme')"
        @back-to-canvas="backToCanvas"
        @guide="sheetOpen = false; guideOpen = true"
      />
      <HouseGuide
        :open="guideOpen"
        :pronoun="pronoun"
        :has-resident="!!residentId"
        :at-home="isHome"
        @close="closeGuide"
        @try="tryGuide"
      />
      <HouseDecorShop
        :open="decorOpen"
        :asset="ASSET"
        :defs="decorDefs"
        :owned="state.decor"
        :skin-defs="skinDefs"
        :owned-skins="state.ownedSkins"
        :worn-skins="state.skins"
        :room-names="ROOM_NAMES"
        @close="decorOpen = false"
        @change="onDecorChange"
        @change-skins="onSkinsChange"
        @show="showDecor"
        @show-item="showItem"
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
  /* 介面（按鈕、視窗）用一般字體和圓角；房間和小人維持像素 */
  --ui-ink: #3b2a26;
  --ui-paper: rgba(255, 251, 245, 0.9);
  --ui-glass: rgba(255, 251, 245, 0.78);
  --ui-dark: rgba(52, 37, 33, 0.84);
  --ui-accent: #e8a33d;
  --ui-shadow: 0 6px 18px rgba(43, 30, 27, 0.18), 0 1px 3px rgba(43, 30, 27, 0.14);
  position: absolute;
  inset: 0;
  overflow: hidden;
  overflow: clip;
  background: #3b2a26;
  /* 介面跟著 App 的字體（全局美化可以換） */
  font-family: inherit;
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

/* 在他前面的家具：疊在他上面；空的地方不擋手指 */
.ph-front {
  z-index: 3;
  pointer-events: none;
}

.ph-front-bath {
  position: absolute;
  inset: 0;
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
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--ui-dark);
  color: #fff;
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
  pointer-events: none;
  /* 在小人上面：按「？」就是要看清楚 */
  z-index: 4;
  box-shadow: 0 2px 6px rgba(43, 30, 27, 0.25);
}

/* ===== 他 ===== */
.ph-me {
  position: absolute;
  left: 0;
  top: 0;
  will-change: transform;
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
  padding: 4px 10px;
  border-radius: 12px;
  background: rgba(255, 251, 245, 0.96);
  color: var(--ui-ink);
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: var(--ui-shadow);
}

.ph-bubble::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -5px;
  width: 10px;
  height: 10px;
  margin-left: -5px;
  background: inherit;
  transform: rotate(45deg);
  border-radius: 0 0 3px 0;
}

.ph-bubble.is-unread {
  background: #fff1c9;
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
  font-family: "DotGothic16", sans-serif;
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
  /* 在他和他頭上的泡泡後面（蒸氣是從他面前的鍋子、浴缸冒出來的） */
  z-index: 2;
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
  gap: 2px;
  padding: 4px;
  border-radius: 999px;
  background: var(--ui-glass);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  box-shadow: var(--ui-shadow);
}

.ph-tab {
  position: relative;
  height: 36px;
  min-width: 56px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--ui-ink);
  font-family: inherit;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: background 160ms ease, color 160ms ease;
}

.ph-tab.is-current {
  background: var(--ui-ink);
  color: #fff;
}

.ph-tab-here {
  position: absolute;
  right: -2px;
  top: -6px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  box-sizing: border-box;
  border-radius: 999px;
  background: #e0533f;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  white-space: nowrap;
  box-shadow: 0 0 0 2px #fff;
}

.ph-help {
  position: absolute;
  right: 76px;
  top: var(--ph-top);
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--ui-glass);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  color: var(--ui-ink);
  font-family: inherit;
  font-size: 19px;
  font-weight: 600;
  line-height: 20px;
  cursor: pointer;
  box-shadow: var(--ui-shadow);
}

.ph-help.is-on {
  background: var(--ui-ink);
  color: #fff;
}

.ph-ui > .ph-dial-root,
.ph-ui :deep(.ph-dial-root) {
  pointer-events: none;
}

.ph-arrow {
  position: absolute;
  /* 放在地板靠牆那一段（房間第 176 列）：預設的擺法這裡沒有家具，不會蓋住門 */
  top: 62.4%;
  width: 36px;
  height: 36px;
  margin-top: -18px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--ui-glass);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  color: var(--ui-ink);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  box-shadow: var(--ui-shadow);
}

.ph-arrow.is-left { left: 6px; }
.ph-arrow.is-right { right: 6px; }

.ph-leave-bath {
  position: absolute;
  left: 12px;
  top: calc(var(--ph-top) + 56px);
  height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: 999px;
  background: var(--ui-glass);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  color: var(--ui-ink);
  font-family: inherit;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: var(--ui-shadow);
}

.ph-hint {
  position: absolute;
  left: 50%;
  bottom: var(--ph-bottom);
  transform: translateX(-50%);
  width: min(300px, calc(100% - 92px));
  min-height: 42px;
  box-sizing: border-box;
  padding: 6px 16px;
  border: 0;
  border-radius: 999px;
  background: var(--ui-dark);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  color: #fff;
  font-family: inherit;
  font-size: 14px;
  line-height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  box-shadow: var(--ui-shadow);
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
  padding: 6px 6px 6px 16px;
  border-radius: 999px;
  background: var(--ui-dark);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  color: #fff;
  box-shadow: var(--ui-shadow);
}

.ph-edit-text {
  flex: 1;
  font-size: 14px;
  line-height: 18px;
}

.ph-edit-btn {
  height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}

.ph-edit-btn.is-primary {
  background: var(--ui-accent);
  color: #3b2a26;
  font-weight: 600;
}

.ph-choose-wrap {
  position: absolute;
  inset: 0;
  z-index: 25;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(30, 20, 18, 0.4);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
}

.ph-choose {
  width: 240px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: 20px;
  background: #fffbf5;
  box-shadow: 0 16px 40px rgba(30, 20, 18, 0.28);
}

.ph-choose-title {
  font-size: 16px;
  font-weight: 600;
  text-align: center;
  margin-bottom: 4px;
}

.ph-choose-btn {
  height: 44px;
  border: 0;
  border-radius: 12px;
  background: #f6e2b5;
  color: #3b2a26;
  font-family: inherit;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
}

.ph-choose-btn.is-cancel {
  background: transparent;
  color: rgba(59, 42, 38, 0.6);
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
