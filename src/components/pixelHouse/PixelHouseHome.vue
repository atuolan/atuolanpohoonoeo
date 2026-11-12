<script setup lang="ts">
/**
 * 像素小屋主頁：廚房｜客廳｜臥室｜浴室
 *
 * - 四間排成一條左右滑，放開會停在最近的那一間；一打開在客廳，臥室右邊的門過去就是浴室
 * - 下面一排固定的常用 App、「小屋」（換外觀、擺件商店、移動家具、怎麼玩）、「全部 App」
 * - 家具也是 App 的入口：可以點的右上角有小亮點；長按房間進入編輯，可以拖動家具（牆上的在牆上、地上的在地上）
 * - 他自己在屋裡走來走去，跟聊天裡的真實狀態連動（睡覺、忙碌、出門、約會）
 */
import { CHAT_UNREAD_CHANGED_EVENT, loadAllChats, loadChatsByCharacter, resolvePreferredDirectChat } from "@/storage/chatStorage";
import { loadDateSession } from "@/services/dateOuting";
import { useCharactersStore } from "@/stores";
import { useHomeBadgesStore } from "@/stores/homeBadges";
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { GIFTS, GIFT_ART, type GiftKind } from "./houseLines";
import { pixelSvg } from "./pixelArt";
import HouseCatSheet from "./HouseCatSheet.vue";
import {
  awayUntil,
  BOWL_ART,
  BOWL_PALETTE,
  BOWL_SPOT,
  catLevels,
  catListless,
  hamsterPose,
  SPECIES_COLORS,
  type CatCare,
  type CatPose,
  type PetColor,
  type PetSpecies,
} from "./houseCat";
import {
  CAGE_ART,
  CAGE_H,
  CAGE_PALETTE,
  CAGE_RUNNER,
  CAGE_SITTER,
  CAGE_W,
  CAGE_WHEEL,
  DOG_BOWL_PALETTE,
  HAMSTER_ART,
  HAMSTER_H,
  HAMSTER_W,
  hamsterFrames,
  PAD_ART,
  walkerArt,
} from "./petArt";
import {
  BOX_FULL_NEAT,
  CAGE_SPOTS,
  DOG_BOWL_SPOT,
  ICON_ART,
  LITTER_ART,
  LITTER_SPOT,
  MAX_WALKERS,
  MESS_ART,
  MESS_BY_ID,
  PAD_SPOT,
  roams,
  type MessKind,
} from "./petHome";
import { useHouseCat, type HouseCat } from "./useHouseCat";
import { usePetHome } from "./usePetHome";
import { DIRT_ART, DIRT_BY_ID, choreAct, type DirtKind } from "./houseChores";
import { useHouseChores } from "./useHouseChores";
import { useHouseInteract } from "./useHouseInteract";
import HouseAppsSheet from "./HouseAppsSheet.vue";
import HouseDecorShop from "./HouseDecorShop.vue";
import HouseDock from "./HouseDock.vue";
import HouseGuide, { type GuideAction } from "./HouseGuide.vue";
import HouseRoom from "./HouseRoom.vue";
import HouseWardrobe from "./HouseWardrobe.vue";
import type { PartSlot } from "./wardrobeData";
import PixelWaveMenu from "./PixelWaveMenu.vue";
import {
  ACTS,
  CHAR_HEIGHT,
  FURNITURE_ACTIONS,
  HOME_ROOM,
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
import { clampGroupMove, clampPlacement, followAnchor, itemDepths, itemsInFront, pickDefaultResident, residentStatus, sceneAt, snapRoomIndex, stripIndex, type ResidentStatus } from "./houseLogic";
import { getLastHouseRoom, loadCustomParts, loadPixelHouseState, setLastHouseRoom, PIXEL_HOUSE_CHANGED_EVENT, savePixelHouseState, type PixelHouseState } from "./houseState";
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

/** 有沒有養貓或狗（在下面才建好；家具這邊要先知道，浴缸才能點） */
const catAdopted = ref(false);
/** 有養貓狗：點浴缸是幫牠洗澡（泡澡還沒開放） */
const WASH_CAT = "__wash-cat__";
function actionOf(room: RoomId, id: string): FurnitureAction | undefined {
  if (room === "bath" && id === "bathtub" && catAdopted.value) return { kind: "app", app: WASH_CAT, to: "幫寵物洗澡" };
  return FURNITURE_ACTIONS[room][id];
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
      action: actionOf(room, it.id),
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

/** 畫面中間是哪一間 */
const viewIdx = computed(() => {
  // 四間都看得到（寬螢幕）就算在客廳
  if (maxScroll.value <= 2) return stripIndex(HOME_ROOM);
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
  scrollToRoom(stripIndex(room));
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
  // 打掃：髒污那邊決定要不要去、去哪一處（chores 在下面才建好，所以包一層）
  extraAct: choreAct,
  pickExtra: (current, room) => chores?.pickExtra(current, room) ?? null,
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
    // 他在聊天裡忙完、暫離回來了：帶錢回來（每一趟只發一次）
    void chores.settleWork(chat?.charAway);
  } catch (err) {
    console.warn("[PixelHouse] 讀角色狀態失敗", err);
  }
}

watch(status, (next, prev) => {
  if (!loaded.value || !residentId.value) return;
  // 陪狗散步中：回來的時間到了 syncWalk 會照當時的狀態讓他進門
  if (walkUntil.value > Date.now() && next !== "away" && next !== "date") return;
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
const meAct = computed(() => ACTS[life.act.value] ?? choreAct(life.act.value));
const lying = computed(() => !life.walking.value && life.act.value === "sleep");

// ===== 跟他互動：點他冒出「聊天／摸頭」、摸頭、頭上冒話、他留東西 =====
const play = useHouseInteract({
  act: life.act,
  walking: life.walking,
  scene,
  free: computed(() => isHome.value && status.value === "home"),
  sleeping: lying,
  pronoun,
});

// ===== 家事和每日收入：髒污、信箱每天一封信、他忙完帶錢回來 =====
const chores = useHouseChores({
  act: life.act,
  walking: life.walking,
  scene,
  free: computed(() => isHome.value && status.value === "home"),
  pronoun,
  notify: play.showNotice,
});

/** 髒污畫在哪（水槽的碗、洗衣籃的衣服跟著家具走） */
const dirtSpots = computed(() =>
  Object.keys(chores.dirt.value).flatMap((id) => {
    const def = DIRT_BY_ID[id];
    if (!def || !layouts[def.room]) return [];
    const art = DIRT_ART[def.kind];
    const pos = followAnchor([def.x, def.y], def.anchor, currentOf(def.room), defaultsOf(def.room));
    return [
      {
        id,
        label: `${ROOM_NAMES[def.room]}有點髒，點了打掃`,
        src: dirtImages[def.kind],
        style: {
          left: `${u(stripX({ room: def.room, x: pos.x }))}px`,
          top: `${u(pos.y)}px`,
          width: `${u(art.rows[0].length)}px`,
          height: `${u(art.rows.length)}px`,
        },
      },
    ];
  }),
);
const dirtImages = Object.fromEntries(Object.entries(DIRT_ART).map(([k, a]) => [k, pixelSvg(a.rows, a.palette)])) as Record<DirtKind, string>;

// ===== 寵物（貓狗最多三隻、倉鼠最多三隻；用品、貓砂盆、便便、看醫生、散步在 usePetHome） =====
const pets = usePetHome({ notify: play.showNotice });
const catDeps = {
  scene,
  calm: computed(() => state.calm),
  current: currentOf,
  defaults: defaultsOf,
  residentHome: computed(() => isHome.value),
  residentAsleep: computed(() => isHome.value && lying.value),
  residentSpot: () => ({ room: life.me.room, x: life.me.x, y: life.me.y }),
  residentKey: computed(() => `${life.me.room}:${life.me.x}:${life.me.y}`),
  inView: (room: RoomId) => STRIP_ROOMS[viewIdx.value] === room,
  unownedFinds: () => decorDefs.value.filter((d) => d.catOnly && !(d.id in state.decor)).map((d) => ({ id: d.id, name: d.name })),
  grantFind: (id: string) => {
    state.decor = { ...state.decor, [id]: true };
    persist();
  },
  notify: play.showNotice,
};
/** 會在家裡走的（貓、狗）照領養的順序排；倉鼠住籠子，不在這裡 */
const walkerIds = computed(() => pets.home.value.cats.filter(roams).map((c) => c.id));
/** 三格，每格一隻貓或狗（還沒養的格子什麼都不做） */
const kitties: HouseCat[] = Array.from({ length: MAX_WALKERS }, (_, i) =>
  useHouseCat(computed(() => walkerIds.value[i] ?? null), pets, catDeps),
);
watch(() => walkerIds.value.length > 0, (v) => (catAdopted.value = v), { immediate: true });
const kittyOf = (id: string) => kitties.find((k) => k.catId.value === id);
const hasSpecies = (sp: PetSpecies) => pets.home.value.cats.some((c) => c.species === sp);
const hasCat = computed(() => hasSpecies("cat"));
const hasDog = computed(() => hasSpecies("dog"));

/** 點碗、點浴缸：沒做成的原因顯示在下面那一列 */
function onBowlTap(dog = false) {
  const n = dog ? pets.home.value.stock.dogFood : pets.home.value.stock.kibble;
  const food = dog ? "狗糧" : "貓糧";
  if (n <= 0) {
    play.showNotice(`${food}吃完了，買一點吧`);
    openCatSheet("supplies");
  } else play.showNotice(`碗裡有${food}，餓了會自己來吃（還有 ${n} 份）`);
}
function washFromTub() {
  const c = pets.dirtiest();
  if (!c) return;
  const why = kittyOf(c.id)?.care("wash");
  if (why) play.showNotice(why);
}
/** 點貓砂盆：有貓在等著上廁所就帶牠過去，不然就是鏟一鏟 */
function onLitterTap() {
  if (kitties.some((k) => k.guideToBox())) return;
  if (pets.home.value.box > 0) pets.scoop();
  else if (pets.home.value.stock.litter <= 0) {
    play.showNotice("沒有貓砂了，買一點吧");
    openCatSheet("supplies");
  } else play.showNotice(`貓砂盆很乾淨（貓砂還有 ${pets.home.value.stock.litter} 次）`);
}
/** 點尿布墊：有狗在等著上廁所就帶牠過去 */
function onPadTap() {
  if (kitties.some((k) => k.isDog.value && k.guideToBox())) return;
  const n = pets.home.value.stock.pad;
  if (n <= 0) {
    play.showNotice("沒有尿布墊了，買一點吧");
    openCatSheet("supplies");
  } else play.showNotice(`狗想上廁所時，點牠再點這裡（尿布墊還有 ${n} 片）`);
}
function onCatTap(k: HouseCat) {
  if (editMode.value || !k.cat.value) return;
  if (k.tap()) return;
  openCatSheet(k.cat.value.id);
}

/** 貓走路換腳（跟他共用同一個計時器，只在有誰在走路時跑） */
const catFrame = ref(0);
const catSheetOpen = ref(false);
const catSheetFocus = ref<string | null>(null);
const catMessage = ref("");
const catBusy = ref(false);
const catNow = ref(Date.now());

/** 每種花色的圖（用到才畫）。每個姿勢都先放著、只顯示一張：換姿勢時不用臨時解碼圖片（會卡一下） */
const catImageCache = new Map<string, Record<CatPose, string>>();
function catImages(species: PetSpecies, color: PetColor): Record<CatPose, string> {
  const key = `${species}:${color}`;
  let imgs = catImageCache.get(key);
  if (!imgs) {
    const palette = SPECIES_COLORS[species][color]?.palette ?? {};
    imgs = Object.fromEntries(Object.entries(walkerArt(species).art).map(([pose, rows]) => [pose, pixelSvg(rows, palette)])) as Record<CatPose, string>;
    catImageCache.set(key, imgs);
  }
  return imgs;
}
const iconImages = Object.fromEntries(Object.entries(ICON_ART).map(([k, a]) => [k, pixelSvg(a.rows, a.palette)])) as Record<keyof typeof ICON_ART, string>;

function catOnScreen(k: HouseCat): boolean {
  const x = u(stripX(k.me)) + stripOffset.value - scrollX.value;
  return x > -40 && x < stageW.value + 40;
}
function catStyle(k: HouseCat) {
  return {
    transform: `translate3d(${u(stripX(k.me))}px, ${u(k.me.y)}px, 0)`,
    transition: `transform ${k.moveMs.value}ms linear`,
    // 在他前面（比較靠近畫面）就蓋住他和家具；在他後面就被蓋住
    zIndex: !isHome.value || k.me.y >= meDepth.value || k.me.room !== life.me.room ? 4 : 2,
  };
}
/** 圖的大小（狗比貓大一點）：腳底在 (0, 0) */
function catBox(species: PetSpecies) {
  const { w, h } = walkerArt(species);
  return { width: `${u(w)}px`, height: `${u(h)}px`, left: `${-u(w / 2)}px`, top: `${-u(h)}px` };
}
const spriteH = (k: HouseCat) => walkerArt(k.cat.value?.species ?? "cat").h;

/** 飼料碗：有養貓才放；有貓糧時碗裡是滿的 */
const bowlImages = { empty: pixelSvg(BOWL_ART.empty, BOWL_PALETTE), full: pixelSvg(BOWL_ART.full, BOWL_PALETTE) };
const bowlStyle = computed(() => ({
  left: `${u(stripX(BOWL_SPOT))}px`,
  top: `${u(BOWL_SPOT.y)}px`,
  width: `${u(BOWL_ART.empty[0].length)}px`,
  height: `${u(BOWL_ART.empty.length)}px`,
}));

/** 狗碗：在貓碗右邊，藍色 */
const dogBowlImages = { empty: pixelSvg(BOWL_ART.empty, DOG_BOWL_PALETTE), full: pixelSvg(BOWL_ART.full, DOG_BOWL_PALETTE) };
const dogBowlStyle = computed(() => ({
  left: `${u(stripX(DOG_BOWL_SPOT))}px`,
  top: `${u(DOG_BOWL_SPOT.y)}px`,
  width: `${u(BOWL_ART.empty[0].length)}px`,
  height: `${u(BOWL_ART.empty.length)}px`,
}));

/** 尿布墊（浴室，浴墊下面）：沒有了只剩一個框；有狗等著被帶過去時亮起來 */
const padImages = { ready: pixelSvg(PAD_ART.ready.rows, PAD_ART.ready.palette), empty: pixelSvg(PAD_ART.empty.rows, PAD_ART.empty.palette) };
const padStyle = computed(() => ({
  left: `${u(stripX(PAD_SPOT))}px`,
  top: `${u(PAD_SPOT.y)}px`,
  width: `${u(PAD_ART.ready.rows[0].length)}px`,
  height: `${u(PAD_ART.ready.rows.length)}px`,
}));
const padWanted = computed(() => kitties.some((k) => k.isDog.value && k.picked.value));

/** 倉鼠籠（客廳角落，疊起來）：籠子的圖只畫一次，倉鼠照花色畫 */
const cageImages = Object.fromEntries(Object.entries(CAGE_ART).map(([k, rows]) => [k, pixelSvg(rows, CAGE_PALETTE)])) as Record<keyof typeof CAGE_ART, string>;
const hamsterImageCache = new Map<string, Record<keyof typeof HAMSTER_ART, string>>();
function hamsterImages(color: PetColor) {
  let imgs = hamsterImageCache.get(color);
  if (!imgs) {
    const palette = SPECIES_COLORS.hamster[color]?.palette ?? {};
    imgs = Object.fromEntries(Object.entries(HAMSTER_ART).map(([k, rows]) => [k, pixelSvg(rows, palette)])) as Record<keyof typeof HAMSTER_ART, string>;
    hamsterImageCache.set(color, imgs);
  }
  return imgs;
}
/**
 * 每個籠子現在的樣子。倉鼠不走路、沒有自己的計時器：跟著時鐘（一分鐘一次）重算姿勢；
 * 跑滾輪是 CSS 輪流換兩張圖，籠子在畫面外就停。
 */
const cages = computed(() => {
  const t = now.value.getTime();
  return pets.home.value.cats
    .filter((c) => c.species === "hamster")
    .slice(0, CAGE_SPOTS.length)
    .map((c, i) => {
      const spot = CAGE_SPOTS[i];
      const away = awayUntil(c) > t;
      const listless = catListless(catLevels(c, t), !!c.sickSince);
      const pose = hamsterPose(c, scene.value, listless, t);
      const run = pose === "run";
      const pos = run ? CAGE_RUNNER : CAGE_SITTER;
      return {
        cat: c,
        away,
        run,
        frames: hamsterFrames(pose).map((f) => hamsterImages(c.color)[f]),
        sick: !!c.sickSince,
        x: stripX(spot),
        style: {
          left: `${u(stripX(spot))}px`,
          top: `${u(spot.y)}px`,
          width: `${u(CAGE_W)}px`,
          height: `${u(CAGE_H)}px`,
        },
        hamStyle: { left: `${u(pos.x)}px`, top: `${u(pos.y)}px`, width: `${u(HAMSTER_W)}px`, height: `${u(HAMSTER_H)}px` },
        label: away ? "在醫院" : c.sickSince ? "生病了" : run ? "在跑滾輪" : pose === "sleep" ? "在睡覺" : pose === "eat" ? "在吃東西" : "醒著",
      };
    });
});
const cageWheelStyle = computed(() => ({ left: `${u(CAGE_WHEEL.x)}px`, top: `${u(CAGE_WHEEL.y)}px`, width: `${u(11)}px`, height: `${u(11)}px` }));
function cageOnScreen(x: number): boolean {
  const left = u(x) + stripOffset.value - scrollX.value;
  return left > -u(CAGE_W) && left < stageW.value;
}

/** 貓砂盆（浴室）：乾淨、髒、沒貓砂 */
const litterImages = Object.fromEntries(Object.entries(LITTER_ART).map(([k, a]) => [k, pixelSvg(a.rows, a.palette)])) as Record<keyof typeof LITTER_ART, string>;
const litterState = computed(() => (pets.home.value.stock.litter <= 0 ? "empty" : pets.home.value.box >= BOX_FULL_NEAT ? "dirty" : "clean"));
const litterStyle = computed(() => ({
  left: `${u(stripX(LITTER_SPOT))}px`,
  top: `${u(LITTER_SPOT.y)}px`,
  width: `${u(LITTER_ART.clean.rows[0].length)}px`,
  height: `${u(LITTER_ART.clean.rows.length)}px`,
}));
/** 有貓在等著被帶去貓砂盆：貓砂盆亮起來 */
const litterWanted = computed(() => kitties.some((k) => !k.isDog.value && k.picked.value));

/** 地上的便便（點了清掉，沒有錢） */
const messImages = Object.fromEntries(Object.entries(MESS_ART).map(([k, a]) => [k, pixelSvg(a.rows, a.palette)])) as Record<MessKind, string>;
const messSpots = computed(() =>
  Object.entries(pets.home.value.messes).flatMap(([id, kind]) => {
    const spot = MESS_BY_ID[id];
    if (!spot) return [];
    const art = MESS_ART[kind];
    return [
      {
        id,
        src: messImages[kind],
        style: {
          left: `${u(stripX({ room: spot.room, x: spot.x }))}px`,
          top: `${u(spot.y)}px`,
          width: `${u(art.rows[0].length)}px`,
          height: `${u(art.rows.length)}px`,
        },
      },
    ];
  }),
);

function openCatSheet(focus: string | null = null) {
  if (editMode.value) return;
  catMessage.value = "";
  catNow.value = Date.now();
  catSheetFocus.value = focus;
  catSheetOpen.value = true;
}

/** 面板裡的動作：做完重算數值；沒做成的原因顯示在面板 */
async function catAction(run: () => Promise<string | null> | string | null, after?: () => void) {
  if (catBusy.value) return;
  catBusy.value = true;
  // 先清掉：同一句話再出現一次（換一隻摸）也看得到
  catMessage.value = "";
  try {
    const why = await run();
    catMessage.value = why ?? "";
    catNow.value = Date.now();
    if (!why) after?.();
  } finally {
    catBusy.value = false;
  }
}

function adoptCat(name: string, color: PetColor, species: PetSpecies) {
  void catAction(
    () => pets.adopt(name, color, species),
    () => (catMessage.value = ""),
  );
}

function careCat(id: string, kind: CatCare) {
  const k = kittyOf(id);
  if (!k) {
    // 倉鼠：在籠子裡，沒有動畫，照顧完面板留著
    void catAction(() => {
      const why = pets.care(id, kind);
      if (why === "bite") return "被咬了一口！牠還跟你不太熟，多餵幾次葵花子";
      if (why) return why;
      return kind === "wash" ? "換好木屑了，籠子乾乾淨淨" : kind === "treat" ? "牠抱著葵花子啃得好開心" : "牠瞇起眼睛，好像很舒服";
    });
    return;
  }
  void catAction(
    () => k.care(kind),
    () => {
      // 洗澡、罐頭、逗牠有動畫：收起面板讓使用者看得到
      if (kind === "pet" || kind === "treat") return;
      catSheetOpen.value = false;
      scrollToRoom(stripIndex(kind === "wash" ? "bath" : kind === "can" ? BOWL_SPOT.room : k.me.room));
    },
  );
}

function trainCat(id: string) {
  const k = kittyOf(id);
  if (!k) return;
  void catAction(
    () => k.trainNow(),
    () => {
      catSheetOpen.value = false;
      scrollToRoom(stripIndex(k.me.room));
      play.showNotice(`${k.cat.value?.name ?? "牠"}想上廁所了：點牠，再點浴室的${k.isDog.value ? "尿布墊" : "貓砂盆"}`);
    },
  );
}

// ===== 狗散步：他帶狗出門，兩個都不在家 =====

/** 他陪狗散步到什麼時候（0 = 沒有）。不另外存檔：從狗的 outUntil 算出來 */
const walkUntil = ref(0);
const walkDogName = ref("狗");
let walkTimer: ReturnType<typeof setTimeout> | null = null;

/** 打開小屋、回到前景時對一下：狗還在外面 → 他也不在家；時間到了 → 他從大門回來 */
function syncWalk() {
  const t = Date.now();
  const out = pets.home.value.cats.filter((c) => c.species === "dog" && c.outUntil > Math.max(c.vetUntil, t));
  const until = Math.max(0, ...out.map((c) => c.outUntil));
  if (out.length) walkDogName.value = out.map((c) => c.name).join("、");
  if (walkTimer) clearTimeout(walkTimer);
  walkTimer = null;
  if (until > t) {
    walkUntil.value = until;
    if (life.home.value) life.leave();
    walkTimer = setTimeout(syncWalk, until - t);
    return;
  }
  if (!walkUntil.value) return;
  walkUntil.value = 0;
  if (document.hidden || !residentId.value || !loaded.value) return;
  if (status.value !== "away" && status.value !== "date" && !life.home.value) life.start(true);
}

function walkDog(id: string) {
  void catAction(
    () => {
      if (!isHome.value) return `${pronoun.value}不在家，等${pronoun.value}回來再去散步`;
      if (lying.value || status.value === "sleep") return `${pronoun.value}在睡覺`;
      if (status.value === "busy") return `${pronoun.value}在忙，等一下再去`;
      return pets.walk(id);
    },
    () => {
      catSheetOpen.value = false;
      syncWalk();
    },
  );
}

function onMeTap() {
  if (editMode.value || !residentId.value) return;
  play.toggleMenu();
}

/** 兩個按鈕的位置（相對他的腳）：他靠近畫面邊邊時往裡面挪，不會被切掉 */
const menuLeft = computed(() => {
  const base = lying.value && !sleepUpright.value ? -u(charUnits.value / 2) : 0;
  const x = u(mePos.value.x) + stripOffset.value - scrollX.value + base;
  const half = 74;
  return base + Math.min(Math.max(x, half), Math.max(half, stageW.value - half)) - x;
});

function chatFromMenu() {
  play.closeMenu();
  openChat();
}

/** 他留的東西放在哪（跟著那件家具走）；那間房還沒讀好、家具不見了就不顯示 */
const giftSpots = computed(() =>
  play.gifts.value.flatMap((g) => {
    const def = GIFTS[g.kind];
    const anchor = roomItems.value[def.room]?.find((i) => i.id === def.anchor);
    if (!anchor) return [];
    const art = GIFT_ART[g.kind];
    const left = u(stripX({ room: def.room, x: anchor.px + def.dx }));
    const onScreen = left + stripOffset.value - scrollX.value;
    return [
      {
        kind: g.kind,
        label: g.kind === "note" ? `${pronoun.value}留了一張紙條，點了看` : `${pronoun.value}煮的${g.text}，點了收下`,
        src: giftImages[g.kind],
        // 不在畫面上的不動
        offscreen: onScreen < -40 || onScreen > stageW.value + 40,
        style: {
          left: `${left}px`,
          top: `${u(anchor.py + def.dy)}px`,
          width: `${u(art.rows[0].length)}px`,
          height: `${u(art.rows.length)}px`,
        },
      },
    ];
  }),
);
const giftImages = Object.fromEntries(Object.entries(GIFT_ART).map(([k, a]) => [k, pixelSvg(a.rows, a.palette)])) as Record<GiftKind, string>;


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
  // 被摸頭時轉過來看你（正面）
  const want = life.walking.value ? [`walk-${dir}`, "walk", "front"] : play.mood.value ? ["front"] : [meAct.value?.pose ?? "front", "front"];
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
    // 每間都算（走到房間邊上會跨到隔壁）
    out[room] = isHome.value ? itemsInFront(Object.fromEntries(roomItems.value[room].map((i) => [i.id, i.depth])), meDepth.value) : [];
  }
  return out;
});

const steam = computed(() => {
  const a = meAct.value;
  if (!a?.steam || life.walking.value) return null;
  const p = followAnchor(a.steam, a.anchor, currentOf(a.room), defaultsOf(a.room));
  return { x: stripX({ room: a.room, x: p.x }), y: p.y };
});

const bubbleText = computed(() => {
  if (play.menuOpen.value) return "";
  if (play.say.value) return play.say.value;
  if (unread.value > 0) return `💬 ${unread.value > 99 ? "99+" : unread.value}`;
  if (life.walking.value) return "";
  return meAct.value?.label ?? "";
});

// ===== 可以點的家具 =====
const showAll = ref(false);
const flashKey = ref<string | null>(null);
const choosing = ref<{ name: string; options: { app: string; label: string }[] } | null>(null);

const ADOPT_OPTION = "__adopt-cat__";
const VET_OPTION = "__vet-cat__:";
function pickOption(app: string) {
  choosing.value = null;
  if (app === ADOPT_OPTION) openCatSheet("adopt");
  else if (app.startsWith(VET_OPTION)) openCatSheet(app.slice(VET_OPTION.length));
  else emit("navigate", app);
}

function onItemClick(it: { room: RoomId; id: string; name: string; action?: FurnitureAction }) {
  if (editMode.value || !it.action) return;
  // 信箱裡有今天的信：這次點是收信，不打開訊息
  if (it.room === "living" && it.id === "mailbox" && chores.mailReady.value && chores.takeMail()) return;
  const action = it.action;
  if (action.kind === "app" && action.app === WASH_CAT) {
    flashKey.value = `${it.room}:${it.id}`;
    setTimeout(() => (flashKey.value = null), 160);
    washFromTub();
    return;
  }
  flashKey.value = `${it.room}:${it.id}`;
  setTimeout(() => {
    flashKey.value = null;
    if (action.kind === "enter-bath") scrollToRoom(stripIndex("bath"));
    else if (action.kind === "choose") {
      // 還沒養寵物：客廳大門多一個「領養寵物」
      // 有貓生病：大門多一個「帶去看醫生」
      const sickCat = pets.home.value.cats.find((c) => c.sickSince && c.vetUntil <= Date.now());
      const adopt =
        it.room !== "living" || it.id !== "door"
          ? []
          : [
              ...(pets.home.value.cats.length ? [] : [{ app: ADOPT_OPTION, label: "領養寵物" }]),
              ...(sickCat ? [{ app: `${VET_OPTION}${sickCat.id}`, label: `帶${sickCat.name}去看醫生` }] : []),
            ];
      choosing.value = { name: it.name, options: [...action.options, ...adopt] };
    }
    else if (action.kind === "wardrobe") openWardrobe(action.slot as PartSlot);
    else emit("navigate", action.app);
  }, 160);
}

// ===== 側邊選單、全部 App =====
const menuOpen = ref(false);
const sheetOpen = ref(false);
/** 面板現在是「全部 App」還是「小屋」 */
const sheetMode = ref<"apps" | "house">("apps");
function openSheet(mode: "apps" | "house") {
  menuOpen.value = false;
  showAll.value = false;
  sheetMode.value = mode;
  sheetOpen.value = true;
}
const homeBadges = useHomeBadgesStore();
const badges = computed(() => homeBadges.badges);
/** 有未讀訊息：客廳的信箱露出一封信 */
const hasMail = computed(() => (badges.value.message ?? 0) > 0 || chores.mailReady.value);

/** 下面那一排 App：展開或收成小按鈕，記住 */
function toggleDock() {
  state.dockOpen = !state.dockOpen;
  persist();
}

function pickDialApp(app: string) {
  menuOpen.value = false;
  if (app === "__all__") {
    openSheet("apps");
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
  else if (action === "cat") openCatSheet();
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
  const room: RoomId = STRIP_ROOMS[viewIdx.value];
  delete state.placements[room];
  persist();
}

// ===== 手指：滑、長按、拖家具 =====
interface PointerState {
  id: number;
  startX: number;
  startY: number;
  startScroll: number;
  /** 開始滑的時候在哪一間 */
  startIdx: number;
  lastX: number;
  lastT: number;
  vel: number;
  moved: boolean;
  item?: { room: RoomId; it: RenderItem; ft: number; defY: number; group: RenderItem[] };
}
let ptr: PointerState | null = null;
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let suppressClick = false;

/** 蓋在房間上的面板（全部 App、衣櫃、擺件商店、側邊選單）：在上面滑不要帶動房間 */
const OVERLAY_SELECTOR = ".ph-sheet-wrap, .wd-wrap, .ds-wrap, .pw-root, .ph-dock, .ph-dock-fab, .ph-tabs";

function onPointerDown(e: PointerEvent) {
  if (ptr || (e.pointerType === "mouse" && e.button !== 0)) return;
  if (!(e.target as HTMLElement | null)?.closest?.(".ph-me-hit, .ph-me-menu")) play.closeMenu();
  if ((e.target as HTMLElement | null)?.closest?.(OVERLAY_SELECTOR)) return;
  stopAnim();
  ptr = {
    id: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    startScroll: scrollX.value,
    startIdx: viewIdx.value,
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
  } else if (p.moved && maxScroll.value > 2) {
    // 停在最近的那一間（放開前手指停住了就不算速度）
    const vel = performance.now() - p.lastT < 80 ? p.vel : 0;
    const center = scrollX.value + stageW.value / 2 - stripOffset.value;
    scrollToRoom(snapRoomIndex(center, vel, p.startIdx, roomPx.value), 300);
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
    current: viewIdx.value === i,
    here: meTab === i,
  }));
});

function goTab(i: number) {
  scrollToRoom(i);
}

const canLeft = computed(() => !editMode.value && scrollX.value > 2);
const canRight = computed(() => !editMode.value && scrollX.value < maxScroll.value - 2);

const meLine = computed(() => {
  const p = pronoun.value;
  if (!residentId.value) return "還沒有人住進來｜到設定 › 主頁 選一位";
  if (status.value === "date") return `${p}出門約會了`;
  if (status.value === "away") return `${p}出門了`;
  if (walkUntil.value) return `${p}帶${walkDogName.value}出門散步了，大約 ${Math.max(1, Math.ceil((walkUntil.value - now.value.getTime()) / 60_000))} 分鐘後回來`;
  if (life.walking.value) {
    return life.crossing.value ? `${p}正在走去${ROOM_NAMES[life.heading.value]}` : `${p}在${ROOM_NAMES[life.heading.value]}走動`;
  }
  return `${p}在${ROOM_NAMES[life.me.room]}${meAct.value?.label ?? ""}`;
});

const hint = computed(() => {
  if (editMode.value) return "拖動家具，好了按「完成」";
  if (menuOpen.value) return "選一個 App";
  if (showAll.value) return "虛線框都可以點";
  if (play.notice.value) return play.notice.value;
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

/** 換腳的計時器：只在他走路時開著，站著不動時不空轉 */
function syncFrameTimer() {
  const want = timersOn && (life.walking.value || kitties.some((k) => k.walking.value));
  if (want && !frameTimer) {
    frameTimer = setInterval(() => {
      if (life.walking.value) frame.value++;
      // 貓的腳步慢一半（每 220 毫秒換一格）
      if (kitties.some((k) => k.walking.value) && ++catTick % 2 === 0) catFrame.value++;
    }, 110);
  }
  else if (!want && frameTimer) {
    clearInterval(frameTimer);
    frameTimer = null;
  }
}
let timersOn = false;
let catTick = 0;
let clockTicks = 0;
watch(() => life.walking.value || kitties.some((k) => k.walking.value), syncFrameTimer);

function startTimers() {
  stopTimers();
  timersOn = true;
  syncFrameTimer();
  clockTimer = setInterval(() => {
    now.value = new Date();
    // 只有倉鼠（沒有會走的貓狗幫忙算）：每 10 分鐘判斷一次生病
    if (++clockTicks % 10 === 0 && pets.home.value.cats.length && !walkerIds.value.length) pets.liveTick();
  }, 60_000);
  statusTimer = setInterval(() => void refreshResident(), 30_000);
}

function stopTimers() {
  timersOn = false;
  if (frameTimer) clearInterval(frameTimer);
  if (statusTimer) clearInterval(statusTimer);
  if (clockTimer) clearInterval(clockTimer);
  frameTimer = statusTimer = clockTimer = null;
}

/** App 切到背景、螢幕關掉：他停下來、計時器全停；回來再繼續 */
function onVisibilityChange() {
  if (document.hidden) {
    life.pause();
    for (const k of kitties) k.pause();
    pets.flush();
    play.reset();
    stopTimers();
    return;
  }
  if (!started) return;
  now.value = new Date();
  chores.open();
  startTimers();
  // 關著的那段時間：牠們自己吃、自己上廁所、可能生病
  pets.catchUp();
  for (const k of kitties) k.resume();
  void refreshResident().then(() => {
    life.resume();
    syncWalk();
  });
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
  chores.open();
  await ensureResident();
  await refreshResident();
  if (residentId.value && status.value !== "away" && status.value !== "date") life.start();
  pets.catchUp();
  for (const k of kitties) k.start();
  // 關掉小屋時他正陪狗散步：還沒回來的話他也不在家
  syncWalk();
  // 一打開從客廳開始（不跟著他跑；想看他點下面的提示）；從 App 回來接著看剛剛那間
  scrollToRoom(stripIndex(getLastHouseRoom() ?? HOME_ROOM), 0);
  // 第一次打開小屋：先看一次怎麼玩
  if (!state.guideSeen) guideOpen.value = true;
  started = true;
  if (document.hidden) life.pause();
  else startTimers();
});

onUnmounted(() => {
  if (started) setLastHouseRoom(STRIP_ROOMS[viewIdx.value]);
  stopAnim();
  resizeObs?.disconnect();
  stopTimers();
  if (walkTimer) clearTimeout(walkTimer);
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
  return stripOffset.value - scrollX.value + stripIndex(room) * roomPx.value;
}

/** 每個標籤在畫面上的位置（x 是畫面座標，y 跟房間同一個座標） */
const labelLayout = computed(() => {
  const out: Record<string, { x: number; y: number } | null> = {};
  if (!showAll.value) return out;
  const rooms: RoomId[] = STRIP_ROOMS;
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
  const layerLeft = stripOffset.value - scrollX.value;
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
    <!-- 四間房排成一條 -->
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
        <template v-if="showAll">
          <div v-for="it in clickableInView(room)" :key="`hint-${it.id}`" class="ph-spot" :style="itemStyle(it)" aria-hidden="true"></div>
        </template>
      </div>
      <!-- 「？」的標籤：放在所有房間上面，跨到隔壁房間也不會被切掉 -->
      <template v-if="showAll">
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

      <!-- 髒污：點了打掃（靜態的圖，不動） -->
      <template v-if="!editMode">
        <button v-for="d in dirtSpots" :key="`dirt-${d.id}`" class="ph-dirt" :style="d.style" :aria-label="d.label" @click.stop="chores.clean(d.id, 'user')">
          <img :src="d.src" alt="" draggable="false" />
        </button>
      </template>

      <!-- 他 -->
      <div v-if="isHome" class="ph-me" :class="{ 'is-offscreen': !meVisible }" :style="meStyle">
        <div v-if="!lying" class="ph-me-shadow" :style="{ width: `${u(24)}px`, height: `${u(3.4)}px` }"></div>
        <div
          v-if="dollPose"
          class="ph-me-sprite ph-doll"
          :class="{ 'is-hop': !life.walking.value && (meAct?.hop || play.mood.value === 'happy') }"
          :style="spriteStyle"
        >
          <img v-for="(src, n) in dollFrames" v-show="n === dollFrame" :key="n" :src="src" alt="" draggable="false" />
        </div>
        <img
          v-else-if="dollChecked"
          class="ph-me-sprite"
          :class="{ 'is-hop': !life.walking.value && (meAct?.hop || play.mood.value === 'happy') }"
          :src="spriteSrc"
          alt=""
          draggable="false"
          :style="spriteStyle"
        />
        <button
          class="ph-me-hit"
          :style="{ width: `${spriteSize.w}px`, height: `${spriteSize.h}px`, left: `${-spriteSize.w / 2}px`, top: `${-spriteSize.h}px` }"
          :aria-label="`${pronoun}，${meLine}，點了可以聊天或摸頭`"
          :aria-expanded="play.menuOpen.value"
          @click.stop="onMeTap"
        ></button>
        <!-- 點他：頭上冒出兩個小按鈕 -->
        <div
          v-if="play.menuOpen.value && !editMode"
          class="ph-me-menu"
          :style="{ top: `${-(lying && !sleepUpright ? u(30) : spriteSize.h) - 44}px`, left: `${menuLeft}px` }"
        >
          <button @click.stop="chatFromMenu">聊天</button>
          <button @click.stop="play.pat()">摸頭</button>
        </div>
        <!-- 摸頭的反應：愛心（開心）、生氣（摸太多）、點點點（睡覺被吵） -->
        <div
          v-if="play.mood.value"
          :key="play.fxKey.value"
          class="ph-fx"
          :class="`is-${play.mood.value}`"
          :style="{ top: `${-(lying && !sleepUpright ? u(26) : spriteSize.h * 0.8)}px`, left: lying && !sleepUpright ? `${-u(charUnits / 2)}px` : undefined }"
          aria-hidden="true"
        >
          <span></span><span></span><span></span>
        </div>
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
        v-if="isHome && steam"
        class="ph-steam"
        :class="{ 'is-offscreen': !meVisible }"
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

      <template v-if="pets.home.value.cats.length && !editMode">
        <!-- 貓的飼料碗：有貓糧時是滿的 -->
        <button v-if="hasCat" class="ph-bowl" :style="bowlStyle" :aria-label="`貓的飼料碗，貓糧還有 ${pets.home.value.stock.kibble} 份`" @click.stop="onBowlTap(false)">
          <img :src="pets.home.value.stock.kibble > 0 ? bowlImages.full : bowlImages.empty" alt="" draggable="false" />
        </button>
        <!-- 狗碗（藍色，在貓碗右邊） -->
        <button v-if="hasDog" class="ph-bowl" :style="dogBowlStyle" :aria-label="`狗碗，狗糧還有 ${pets.home.value.stock.dogFood} 份`" @click.stop="onBowlTap(true)">
          <img :src="pets.home.value.stock.dogFood > 0 ? dogBowlImages.full : dogBowlImages.empty" alt="" draggable="false" />
        </button>
        <!-- 狗的尿布墊：有狗在等著上廁所時是帶牠過去 -->
        <button
          v-if="hasDog"
          class="ph-bowl ph-litter"
          :class="{ 'is-wanted': padWanted }"
          :style="padStyle"
          :aria-label="padWanted ? '尿布墊，點了帶牠過來' : `尿布墊，還有 ${pets.home.value.stock.pad} 片`"
          @click.stop="onPadTap"
        >
          <img :src="pets.home.value.stock.pad > 0 ? padImages.ready : padImages.empty" alt="" draggable="false" />
        </button>
        <!-- 倉鼠籠：疊在客廳角落，最下面那個最後畫（蓋住上面那個的底）。點了打開照顧牠的面板 -->
        <button
          v-for="c in [...cages].reverse()"
          :key="c.cat.id"
          class="ph-cage"
          :class="{ 'is-run': c.run && !c.away, 'is-offscreen': !cageOnScreen(c.x) }"
          :style="c.style"
          :aria-label="`${c.cat.name}的籠子，${c.label}，點了照顧牠`"
          @click.stop="openCatSheet(c.cat.id)"
        >
          <img :src="cageImages.back" class="ph-cage-layer" alt="" draggable="false" />
          <span class="ph-cage-wheel" :style="cageWheelStyle">
            <img :src="cageImages['wheel-a']" class="ph-flip-a" alt="" draggable="false" />
            <img :src="cageImages['wheel-b']" class="ph-flip-b" alt="" draggable="false" />
          </span>
          <span v-if="!c.away" class="ph-cage-ham" :style="c.hamStyle">
            <img v-for="(src, i) in c.frames" :key="i" :src="src" :class="c.frames.length > 1 ? (i ? 'ph-flip-b' : 'ph-flip-a') : ''" alt="" draggable="false" />
          </span>
          <img :src="cageImages.front" class="ph-cage-layer" alt="" draggable="false" />
          <img v-if="c.sick && !c.away" class="ph-cage-icon" :src="iconImages.sick" :style="{ width: `${u(5)}px`, height: `${u(8)}px` }" alt="" draggable="false" />
        </button>
        <!-- 貓砂盆：點了鏟一鏟；有貓在等著上廁所時是帶牠過去 -->
        <button
          v-if="hasCat"
          class="ph-bowl ph-litter"
          :class="{ 'is-wanted': litterWanted }"
          :style="litterStyle"
          :aria-label="litterWanted ? '貓砂盆，點了帶牠過來' : `貓砂盆，${litterState === 'dirty' ? '有點髒，點了鏟一鏟' : litterState === 'empty' ? '沒有貓砂' : '很乾淨'}`"
          @click.stop="onLitterTap"
        >
          <img :src="litterImages[litterState]" alt="" draggable="false" />
        </button>
        <!-- 地上的便便：點了清掉 -->
        <button v-for="m in messSpots" :key="m.id" class="ph-dirt" :style="m.style" aria-label="地上的便便，點了清掉" @click.stop="pets.cleanMess(m.id)">
          <img :src="m.src" alt="" draggable="false" />
        </button>
      </template>

      <!-- 貓：點了打開照顧牠的面板；想上廁所時點了是「選牠」 -->
      <template v-if="loaded">
        <template v-for="(k, slot) in kitties" :key="`cat-${slot}`">
          <div
            v-if="k.cat.value && !k.away.value"
            class="ph-cat"
            :class="{ 'is-offscreen': !catOnScreen(k) }"
            :style="catStyle(k)"
          >
            <div class="ph-cat-sprite" :class="{ 'is-hop': k.hop.value }" :style="{ ...catBox(k.cat.value.species), transform: k.facing.value < 0 ? 'scaleX(-1)' : undefined }">
              <img
                v-for="(src, pose) in catImages(k.cat.value.species, k.cat.value.color)"
                v-show="pose === k.poseAt(catFrame)"
                :key="pose"
                :src="src"
                alt=""
                draggable="false"
              />
            </div>
            <button
              class="ph-cat-hit"
              :style="catBox(k.cat.value.species)"
              :aria-label="`${k.cat.value.name}，${k.label.value}，${k.urge.value ? `點了選牠，再點${k.isDog.value ? '尿布墊' : '貓砂盆'}` : '點了照顧牠'}`"
              @click.stop="onCatTap(k)"
            ></button>
            <!-- 頭上：想上廁所（驚嘆號）、生病（溫度計）。靜態的圖，不動 -->
            <img
              v-if="k.urge.value || k.sick.value"
              class="ph-cat-icon"
              :class="{ 'is-picked': k.picked.value }"
              :src="k.urge.value ? iconImages.urge : iconImages.sick"
              :style="{ top: `${-u(spriteH(k)) - u(11)}px`, width: `${u(5)}px`, height: `${u(k.urge.value ? 9 : 8)}px`, left: `${-u(2.5)}px` }"
              alt=""
              draggable="false"
            />
            <div v-if="k.fx.value" :key="k.fxKey.value" class="ph-fx ph-cat-fx" :class="`is-${k.fx.value}`" :style="{ top: `${-u(spriteH(k))}px` }" aria-hidden="true">
              <span></span><span></span><span></span>
            </div>
          </div>
        </template>
      </template>

      <!-- 他留給你的東西：點了收下 -->
      <template v-if="!editMode">
        <button
          v-for="g in giftSpots"
          :key="`gift-${g.kind}`"
          class="ph-gift"
          :class="{ 'is-offscreen': g.offscreen }"
          :style="g.style"
          :aria-label="g.label"
          @click.stop="play.collect(g.kind)"
        >
          <img :src="g.src" alt="" draggable="false" />
        </button>
      </template>
    </div>

    <!-- 時間的光線（multiply：白色＝不變） -->
    <div v-if="tintOn" class="ph-tint" :style="{ background: tint }" aria-hidden="true"></div>

    <!-- 介面 -->
    <div class="ph-ui">
      <!-- 左右換房間 -->
      <button v-if="canLeft" class="ph-arrow is-left" :aria-label="`去${ROOM_NAMES[STRIP_ROOMS[Math.max(0, viewIdx - 1)]]}`" @click="scrollToRoom(Math.max(0, viewIdx - 1))">◀</button>
      <button v-if="canRight" class="ph-arrow is-right" :aria-label="`去${ROOM_NAMES[STRIP_ROOMS[Math.min(STRIP_ROOMS.length - 1, viewIdx + 1)]]}`" @click="scrollToRoom(Math.min(STRIP_ROOMS.length - 1, viewIdx + 1))">▶</button>

      <!-- 房間列：他在哪間有小紅牌 -->
      <div class="ph-tabs">
        <button
          v-for="t in tabs"
          :key="t.room"
          class="ph-tab"
          :class="{ 'is-current': t.current }"
          :aria-current="t.current ? 'page' : undefined"
          :aria-label="t.name + (t.here ? `，${pronoun}在這裡` : '')"
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

      <PixelWaveMenu
        v-if="!editMode"
        :open="menuOpen"
        :badges="badges"
        @toggle="menuOpen = !menuOpen; showAll = false"
        @close="menuOpen = false"
        @pick="pickDialApp"
        @decor="menuOpen = false; decorOpen = true"
        @wardrobe="menuOpen = false; openWardrobe(null)"
        @edit-layout="enterEdit"
      />

      <!-- 下面的提示列 -->
      <div v-if="editMode" class="ph-edit-bar">
        <span class="ph-edit-text">{{ hint }}</span>
        <button class="ph-edit-btn" @click="resetRoom">還原這間</button>
        <button class="ph-edit-btn is-primary" @click="finishEdit">完成</button>
      </div>
      <template v-else>
        <!-- 他在哪、在做什麼：在房間列下面；他不在畫面上時點了滑過去 -->
        <button class="ph-hint" aria-live="polite" @click="hintTap">{{ hint }}</button>
        <HouseDock :open="state.dockOpen" :badges="badges" @toggle="toggleDock" @pick="emit('navigate', $event)" @house="openSheet('house')" @all="openSheet('apps')" />
      </template>

      <!-- 大門：商店還是外送 -->
      <div v-if="choosing" class="ph-choose-wrap" @click.self="choosing = null">
        <div class="ph-choose" role="dialog" :aria-label="choosing.name">
          <div class="ph-choose-title">{{ choosing.name }}</div>
          <button v-for="o in choosing.options" :key="o.app" class="ph-choose-btn" @click="pickOption(o.app)">
            {{ o.label }}
          </button>
          <button class="ph-choose-btn is-cancel" @click="choosing = null">取消</button>
        </div>
      </div>

      <HouseCatSheet
        :open="catSheetOpen"
        :home="pets.home.value"
        :now="catNow"
        :focus="catSheetFocus"
        :message="catMessage"
        :busy="catBusy"
        @close="catSheetOpen = false"
        @adopt="adoptCat"
        @care="careCat"
        @rename="pets.rename"
        @buy="(id) => catAction(() => pets.buy(id))"
        @insurance="catAction(() => pets.buyInsurance())"
        @checkup="(id) => catAction(() => pets.checkup(id))"
        @vet="(id) => catAction(() => pets.goVet(id))"
        @train="trainCat"
        @walk="walkDog"
      />

      <HouseAppsSheet
        :open="sheetOpen"
        :mode="sheetMode"
        :badges="badges"
        @close="sheetOpen = false"
        @pick="pickSheetApp"
        @edit-layout="enterEdit"
        @wardrobe="sheetOpen = false; openWardrobe(null)"
        @decor="sheetOpen = false; decorOpen = true"
        @cat="sheetOpen = false; openCatSheet()"
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
  /* 全域樣式給按鈕 max-width: 100%，外層 .ph-me 寬度是 0，不取消會被壓成 0 寬、點不到 */
  max-width: none;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.is-editing .ph-me-hit {
  pointer-events: none;
}

/* 點他冒出來的兩個小按鈕 */
.ph-me-menu {
  position: absolute;
  left: 0;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
  white-space: nowrap;
  animation: ph-pop 140ms ease-out;
}

.ph-me-menu button {
  min-width: 56px;
  min-height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 251, 245, 0.97);
  color: var(--ui-ink);
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  line-height: 36px;
  box-shadow: var(--ui-shadow);
  cursor: pointer;
}

.ph-me-menu button:active {
  background: #fff1c9;
}

/* 摸頭的反應 */
.ph-fx {
  position: absolute;
  left: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}

.ph-fx span {
  position: absolute;
  font-size: 18px;
  line-height: 1;
  opacity: 0;
  animation: ph-float 900ms ease-out forwards;
}

.ph-fx span::before { content: "♥"; color: #e8627a; text-shadow: 1px 1px 0 #3b2a26; }
.ph-fx.is-annoyed span::before { content: "💢"; text-shadow: none; }
.ph-fx.is-sleepy span::before { content: "…"; color: #fbf7ee; }
.ph-fx span:nth-child(1) { left: -22px; top: 0; }
.ph-fx span:nth-child(2) { left: -4px; top: -14px; animation-delay: 120ms; }
.ph-fx span:nth-child(3) { left: 14px; top: 2px; animation-delay: 240ms; }
/* 生氣、被吵醒只冒一個 */
.ph-fx.is-annoyed span:nth-child(n + 2),
.ph-fx.is-sleepy span:nth-child(n + 2) { display: none; }
.ph-fx.is-annoyed span:nth-child(1),
.ph-fx.is-sleepy span:nth-child(1) { left: 6px; }

/* 他留的東西 */
.ph-gift {
  position: absolute;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  z-index: 3;
  animation: ph-bob 1.2s steps(2, jump-none) infinite;
}

/* 東西很小：點得到的範圍放大到手指好按 */
.ph-gift::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 48px;
  height: 48px;
  transform: translate(-50%, -50%);
}

/* 貓 */
.ph-cat {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  will-change: transform;
}

.ph-cat-sprite {
  position: absolute;
  pointer-events: none;
}

.ph-cat-sprite img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  image-rendering: crisp-edges;
  image-rendering: pixelated;
  -webkit-user-drag: none;
}

.ph-cat-sprite.is-hop {
  animation: ph-cat-hop 520ms steps(2, jump-none) infinite;
}

.ph-cat-hit {
  position: absolute;
  /* 同 .ph-me-hit：外層寬度是 0，不取消 max-width 會被壓扁 */
  max-width: none;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

/* 貓很小：點得到的範圍放大到手指好按 */
.ph-cat-hit::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 100%;
  min-width: 48px;
  height: 48px;
  transform: translate(-50%, -50%);
}

.is-editing .ph-cat-hit {
  pointer-events: none;
}

.ph-cat-fx.is-bubble span::before { content: "●"; color: #f2faff; text-shadow: 0 0 0 #4f8db8, 1px 1px 0 #4f8db8; }
.ph-cat-fx.is-note span::before { content: "♪"; color: #fbf7ee; }

.ph-bowl {
  position: absolute;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  z-index: 2;
}

.ph-bowl::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 44px;
  height: 44px;
  transform: translate(-50%, -50%);
}

/* 倉鼠籠：後面（木屑）、滾輪、倉鼠、前面（鐵絲、底盤）疊起來 */
.ph-cage {
  position: absolute;
  max-width: none;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  z-index: 2;
}

.ph-cage img,
.ph-cage-wheel,
.ph-cage-ham {
  position: absolute;
  image-rendering: crisp-edges;
  image-rendering: pixelated;
  pointer-events: none;
  -webkit-user-drag: none;
}

.ph-cage-layer {
  inset: 0;
  width: 100%;
  height: 100%;
}

.ph-cage-wheel img,
.ph-cage-ham img {
  inset: 0;
  width: 100%;
  height: 100%;
}

.ph-cage-icon {
  right: 0;
  top: -6px;
}

/* 跑滾輪：兩張圖輪流（只動 opacity，不重畫）。沒在跑的時候只顯示第一張 */
.ph-cage .ph-flip-b {
  opacity: 0;
}

.ph-cage.is-run .ph-flip-a {
  animation: ph-flip-a 300ms steps(1, end) infinite;
}

.ph-cage.is-run .ph-flip-b {
  animation: ph-flip-b 300ms steps(1, end) infinite;
}

@keyframes ph-flip-a {
  0% { opacity: 1; }
  50% { opacity: 0; }
}

@keyframes ph-flip-b {
  0% { opacity: 0; }
  50% { opacity: 1; }
}

.ph-litter.is-wanted img {
  filter: drop-shadow(0 0 2px #fff1b8) drop-shadow(0 0 2px #e8a33d);
}

.ph-cat-icon {
  position: absolute;
  image-rendering: crisp-edges;
  image-rendering: pixelated;
  pointer-events: none;
  -webkit-user-drag: none;
}

.ph-cat-icon.is-picked {
  filter: drop-shadow(0 0 2px #fff1b8);
}

.ph-bowl img {
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: crisp-edges;
  image-rendering: pixelated;
  pointer-events: none;
  -webkit-user-drag: none;
}

/* 髒污：在家具上面、他的後面 */
.ph-dirt {
  position: absolute;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  z-index: 2;
}

.ph-dirt::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 44px;
  height: 44px;
  transform: translate(-50%, -50%);
}

.ph-dirt img,
.ph-gift img {
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: crisp-edges;
  image-rendering: pixelated;
  pointer-events: none;
  -webkit-user-drag: none;
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
  min-width: 48px;
  padding: 0 11px;
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

.ph-ui > .pw-root,
.ph-ui :deep(.pw-root) {
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

.ph-hint {
  position: absolute;
  left: 12px;
  top: calc(var(--ph-top) + 52px);
  max-width: calc(100% - 24px);
  min-height: 32px;
  box-sizing: border-box;
  padding: 5px 14px;
  border: 0;
  border-radius: 999px;
  background: var(--ui-dark);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  color: #fff;
  font-family: inherit;
  font-size: 13px;
  line-height: 18px;
  display: flex;
  align-items: center;
  text-align: left;
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

@keyframes ph-pop {
  from { opacity: 0; transform: translateX(-50%) scale(0.8); }
  to { opacity: 1; transform: translateX(-50%) scale(1); }
}

@keyframes ph-float {
  0% { opacity: 0; transform: translateY(6px) scale(0.6); }
  25% { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-34px) scale(1); }
}

@keyframes ph-cat-hop {
  0%, 100% { translate: 0 0; }
  50% { translate: 0 -5px; }
}

@keyframes ph-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}

@keyframes ph-z {
  0%, 66% { opacity: 1; }
  67%, 100% { opacity: 0.3; }
}

@keyframes ph-steam {
  0% { transform: translateY(0) scale(1); opacity: 0.85; }
  100% { transform: translateY(-54px) scale(0.5); opacity: 0; }
}

/* 他不在畫面上（在別間）：跳、Z、蒸氣都先停，滑過去看到了再動 */
.is-offscreen .ph-cat-sprite.is-hop,
.ph-cage.is-offscreen .ph-flip-a,
.ph-cage.is-offscreen .ph-flip-b,
.is-offscreen.ph-gift,
.is-offscreen.ph-steam i,
.is-offscreen .ph-zs span,
.is-offscreen .ph-me-sprite.is-hop {
  animation-play-state: paused;
}

@media (prefers-reduced-motion: reduce) {
  .ph-me-sprite.is-hop,
  .ph-zs span,
  .ph-steam i,
  .ph-gift,
  .ph-cat-sprite.is-hop,
  .ph-cage .ph-flip-a,
  .ph-cage .ph-flip-b,
  .ph-me-menu {
    animation: none;
  }

  /* 愛心不飄，直接顯示 */
  .ph-fx span {
    animation: none;
    opacity: 1;
  }
}
</style>
