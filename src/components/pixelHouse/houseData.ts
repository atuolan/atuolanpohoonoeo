/**
 * 像素小屋主頁的固定資料：房間、家具對到哪個 App、他會做的事、轉盤選單。
 *
 * 房間圖在 public/pixel-house/<房間>/（scripts/pixel-house/draw_rooms.py 畫的），座標都是房間格子（130×282）。
 */

export type RoomId = "living" | "bedroom" | "kitchen" | "bath";
/** 四間排成一條左右滑：客廳在中間偏左，廚房在它左邊；臥室右邊的門過去就是浴室 */
export const STRIP_ROOMS: RoomId[] = ["kitchen", "living", "bedroom", "bath"];
/** 一打開看的那一間 */
export const HOME_ROOM: RoomId = "living";
export const ROOM_W = 130;
export const ROOM_H = 282;

export const ROOM_NAMES: Record<RoomId, string> = {
  living: "客廳",
  bedroom: "臥室",
  kitchen: "廚房",
  bath: "浴室",
};

/** 前排（y ≥ 這個）和後排之間走這條直的走道，比較不會穿過家具 */
export const ROOM_CORRIDOR: Record<RoomId, number> = {
  living: 92,
  bedroom: 72,
  kitchen: 124,
  bath: 85,
};

// ===== 家具 =====

/**
 * 家具能放哪：
 * - wall：掛在牆上的，只能在牆上（底部不超過地板線）
 * - floor：站在地上的，底部要在地板上
 * - any：放在別的家具上的小東西（盆栽、杯子、電視…），房間裡哪裡都可以
 * - row：門，只能左右移
 * - fixed：不能移（廚房的磁磚牆面算牆的一部分）
 */
export type ItemZone = "wall" | "floor" | "any" | "row" | "fixed";

const WALL_ITEMS: Record<RoomId, string[]> = {
  living: ["garland", "clock", "window", "curtains", "mailbox", "wall-shelf", "wall-photo"],
  bedroom: ["garland", "photo-landscape", "photo-heart", "wall-shelf", "calendar", "curtains", "window", "clock", "board"],
  kitchen: ["clock", "valance", "window", "spice-rack", "canister-shelf", "hood", "utensil-rack"],
  bath: ["window", "mirror", "towels", "skincare-shelf", "curtain", "shower-head", "vent", "tub-tap"],
};
const ROW_ITEMS: Record<RoomId, string[]> = {
  living: ["door"],
  bedroom: ["door"],
  kitchen: [],
  bath: [],
};
const FIXED_ITEMS: Record<RoomId, string[]> = {
  living: [],
  bedroom: [],
  kitchen: ["tiles"],
  bath: [],
};

export function itemZone(room: RoomId, id: string, defaultBottom: number, floorTop: number): ItemZone {
  if (FIXED_ITEMS[room].includes(id)) return "fixed";
  if (ROW_ITEMS[room].includes(id)) return "row";
  if (WALL_ITEMS[room].includes(id)) return "wall";
  return defaultBottom >= floorTop - 6 ? "floor" : "any";
}

/** 平貼在地上的（地毯、浴墊）：永遠在其他家具和他的下面 */
export const FLAT_ITEMS: Record<RoomId, string[]> = {
  living: ["rug"],
  bedroom: ["rug"],
  kitchen: [],
  bath: ["bath-mat"],
};

/** 排前後時往前挪幾格：椅子的腳比桌腳高一點，但畫的時候是擺在桌子前面 */
export const DEPTH_BIAS: Record<RoomId, Record<string, number>> = {
  living: {},
  bedroom: {},
  kitchen: { "chair-left": 2, "chair-right": 2 },
  bath: {},
};

/**
 * 一起移動的家具：拖帶頭的（窗戶、窗簾）整組一起動，拖其他的（窗台上的盆栽、花瓶）只動那一件。
 * 圖還是一件一張，之後商店可以單獨換其中一件的樣式。
 */
export const MOVE_GROUPS: Record<RoomId, { leaders: string[]; members: string[] }[]> = {
  living: [{ leaders: ["window", "curtains"], members: ["window", "curtains", "sill-plant", "vase"] }],
  bedroom: [{ leaders: ["window", "curtains"], members: ["window", "curtains", "sill-plant", "vase"] }],
  kitchen: [{ leaders: ["window", "valance"], members: ["window", "valance"] }],
  bath: [],
};

/** 拖這件時要一起動的家具（含自己）；不是帶頭的就只有自己 */
export function moveGroupOf(room: RoomId, id: string): string[] {
  return MOVE_GROUPS[room].find((g) => g.leaders.includes(id))?.members ?? [id];
}

/** 晚上換成夜景的家具（items/<id>-night.png，draw_rooms.py 一起畫的） */
export const NIGHT_ITEMS: Record<RoomId, string[]> = {
  living: ["window"],
  bedroom: ["window"],
  kitchen: ["window"],
  bath: ["window"],
};

/** 有未讀訊息時換成 items/<id>-full.png 的家具（信箱露出一封信；draw_rooms.py 一起畫的） */
export const MAIL_ITEMS: Record<RoomId, string[]> = {
  living: ["mailbox"],
  bedroom: [],
  kitchen: [],
  bath: [],
};

/** 他睡在裡面時換成 items/<id>-sleep.png 的家具（床的被子鼓起來） */
export const SLEEP_ITEMS: Record<RoomId, string[]> = {
  living: [],
  bedroom: ["bed"],
  kitchen: [],
  bath: [],
};

/**
 * 擺件：擺件商店買的（public/pixel-house/decor/decor.json，scripts/pixel-house/draw/decor.py 畫的）。
 * 買了出現在 room 的 (x, y)，之後跟其他家具一樣可以搬。
 */
export interface DecorDef {
  id: string;
  name: string;
  price: number;
  room: RoomId;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 掛在牆上的 */
  wall: boolean;
}

/**
 * 家具的款式（換色、換花樣）：擺件商店「換款式」買的（public/pixel-house/skins/skins.json，scripts/pixel-house/draw/skins.py 畫的）。
 * 跟原本的家具一樣大；圖在 skins/<room>/<item>/<id>.png，原本有睡覺、有信、晚上的圖的也一起畫了（<id>-sleep.png…）。
 */
export interface SkinDef {
  room: RoomId;
  /** 哪件家具（房間原本的家具或擺件的 id） */
  item: string;
  itemName: string;
  id: string;
  name: string;
  price: number;
  /** 原本那張圖（相對 public/pixel-house/） */
  base: string;
  w: number;
  h: number;
}

/** 款式的 key：房間:家具 */
export function skinSlot(room: RoomId, item: string): string {
  return `${room}:${item}`;
}

/** 點家具打開的東西：App（handleNavigate 的 id）、幾個 App 選一個、或滑到浴室 */
export type FurnitureAction =
  | { kind: "app"; app: string; to: string }
  | { kind: "choose"; to: string; options: { app: string; label: string }[] }
  | { kind: "enter-bath"; to: string }
  /** 打開衣櫃，從這個部位開始 */
  | { kind: "wardrobe"; to: string; slot: string };

/** 家具 → 打開什麼。沒列的（或功能還沒做的）點了沒反應，只能在編輯時移動 */
export const FURNITURE_ACTIONS: Record<RoomId, Record<string, FurnitureAction>> = {
  living: {
    tv: { kind: "app", app: "game", to: "遊戲中心" },
    mailbox: { kind: "app", app: "message", to: "訊息" },
    door: {
      kind: "choose",
      to: "商店．外送",
      options: [
        { app: "shop", label: "商店" },
        { app: "delivery", label: "外送" },
      ],
    },
    window: { kind: "app", app: "weather", to: "天氣" },
    lamp: { kind: "app", app: "pomodoro", to: "番茄鐘" },
    dumbbell: { kind: "app", app: "fitness", to: "健身" },
  },
  bedroom: {
    calendar: { kind: "app", app: "calendar", to: "行事曆" },
    window: { kind: "app", app: "weather", to: "天氣" },
    bookshelf: { kind: "app", app: "bookshelf", to: "書架" },
    board: { kind: "app", app: "note-board", to: "便利貼" },
    monitor: { kind: "app", app: "space", to: "噗浪．空間" },
    door: { kind: "enter-bath", to: "去浴室" },
    tv: { kind: "app", app: "game", to: "遊戲中心" },
    "desk-lamp": { kind: "app", app: "pomodoro", to: "番茄鐘" },
    phone: { kind: "app", app: "peek-phone", to: "偷看手機" },
    "floor-box": { kind: "app", app: "settings", to: "設定" },
  },
  kitchen: {
    fridge: { kind: "app", app: "delivery", to: "外賣" },
    window: { kind: "app", app: "weather", to: "天氣" },
  },
  bath: {
    "skincare-shelf": { kind: "app", app: "shop", to: "購物" },
    mirror: { kind: "wardrobe", to: "換外觀", slot: "hair" },
    "laundry-basket": { kind: "wardrobe", to: "換衣服", slot: "shirt" },
    window: { kind: "app", app: "weather", to: "天氣" },
  },
};

/** 家具對應、但還沒做的功能：放在「全部 App」裡，標「還沒開放」 */
export const COMING_SOON: { label: string; where: string }[] = [
  { label: "一起看電影", where: "客廳的沙發" },
  { label: "日記", where: "臥室的相框" },
  { label: "哄他睡覺／叫他起床", where: "臥室的床" },
  { label: "做菜小遊戲", where: "廚房的爐子" },
  { label: "購物清單", where: "廚房的調味料架" },
  { label: "記帳", where: "廚房的餐桌" },
  { label: "泡澡", where: "浴室的浴缸" },
  { label: "洗衣和換季", where: "浴室的毛巾" },
];

// ===== 他會做的事 =====

export type Pose = "stand" | "back" | "happy" | "phone" | "sleep" | "sad";

export interface ActDef {
  room: RoomId;
  /** 站的位置（腳，房間格子）；設計稿的預設擺法下的位置 */
  x: number;
  y: number;
  /** 跟著哪件家具走：家具搬了，站位跟著平移 */
  anchor?: string;
  pose: Pose;
  label: string;
  /** 運動：原地跳 */
  hop?: boolean;
  /** 冒蒸氣的位置（房間格子；跟著 anchor 家具走） */
  steam?: [number, number];
  /** 做這件事時他在這件家具後面（泡在浴缸裡）：這件家具畫在他前面 */
  behind?: string;
  /** 睡覺：腳的位置（房間格子；跟著 anchor 家具走）。只露出頭在枕頭上，身體在鼓起來的被子裡 */
  lie?: [number, number];
}

export const ACTS: Record<string, ActDef> = {
  tv: { room: "living", x: 81, y: 158, anchor: "tv", pose: "back", label: "看電視" },
  game: { room: "living", x: 79, y: 162, anchor: "tv", pose: "back", label: "打電動" },
  sofa: { room: "living", x: 47, y: 252, anchor: "sofa", pose: "phone", label: "窩沙發滑手機" },
  workout: { room: "living", x: 101, y: 253, anchor: "dumbbell", pose: "happy", label: "運動中", hop: true },
  door: { room: "living", x: 114, y: 160, anchor: "door", pose: "back", label: "等外送" },
  pc: { room: "bedroom", x: 66, y: 157, anchor: "desk", pose: "back", label: "打電腦" },
  read: { room: "bedroom", x: 20, y: 160, anchor: "bookshelf", pose: "back", label: "找書看" },
  bedphone: { room: "bedroom", x: 66, y: 252, anchor: "bed", pose: "phone", label: "滑手機" },
  daze: { room: "bedroom", x: 92, y: 196, pose: "sad", label: "發呆" },
  sleep: { room: "bedroom", x: 72, y: 252, anchor: "bed", pose: "sleep", label: "睡覺中", lie: [36, 229] },
  cook: { room: "kitchen", x: 78, y: 158, anchor: "stove", pose: "back", label: "煮飯中", steam: [77, 108] },
  fridge: { room: "kitchen", x: 113, y: 160, anchor: "fridge", pose: "back", label: "找東西吃" },
  dishes: { room: "kitchen", x: 27, y: 158, anchor: "faucet", pose: "back", label: "洗碗中" },
  // 站在餐桌後面、面向前，退後一點讓頭露在桌上的東西上面
  eat: { room: "kitchen", x: 64, y: 232, anchor: "table", pose: "stand", label: "吃飯中" },
  brush: { room: "bath", x: 85, y: 158, anchor: "sink", pose: "back", label: "刷牙中" },
  mirror: { room: "bath", x: 86, y: 162, anchor: "mirror", pose: "happy", label: "照鏡子" },
  shower: { room: "bath", x: 31, y: 150, anchor: "bathtub", pose: "back", label: "洗澡中", steam: [44, 70], behind: "bathtub" },
};

export type Scene = "day" | "dusk" | "night";

/** 白天、黃昏、晚上各做什麼的機率（照設計稿） */
export const ACT_WEIGHTS: Record<Scene, Record<string, number>> = {
  night: { sleep: 10, bedphone: 2, brush: 1, shower: 1, fridge: 1 },
  dusk: { cook: 4, eat: 3, dishes: 2, sofa: 2, tv: 2, shower: 2, pc: 2, fridge: 1, door: 1 },
  day: { tv: 2, game: 2, sofa: 3, workout: 1, door: 1, pc: 3, read: 2, bedphone: 2, daze: 1, fridge: 2, cook: 1, dishes: 1, eat: 1, brush: 1, mirror: 1 },
};

/** 時間的光線：multiply 疊色，白色＝不變（淡一點，晚上也看得清楚家具） */
export const SCENE_TINT: Record<Scene, string> = {
  day: "#FFFFFF",
  dusk: "#FBDDC4",
  night: "#B4B9DE",
};

/** 走路速度（房間格子／秒） */
export const WALK_SPEED = 30;
/** 小人顯示的高度（房間格子） */
export const CHAR_HEIGHT = 46;

// ===== 側邊選單（右上角轉盤按鈕打開） =====

export interface DialApp {
  key: string;
  /** 送給 App.vue handleNavigate 的 id；"__all__" 打開全部 App */
  app: string;
  name: string;
  bg: string;
  glyph: string[];
}

/** 9×9 的像素圖示，# 是有顏色的格子 */
export const DIAL_APPS: DialApp[] = [
  { key: "msg", app: "message", name: "訊息", bg: "#9ED3A5", glyph: [".........", ".#######.", "#########", "##.#.#.##", "#########", ".#######.", "..##.....", "..#......", "........."] },
  { key: "char", app: "character", name: "角色", bg: "#F2B8A0", glyph: ["...###...", "..#####..", "..#####..", "..#####..", "...###...", ".........", ".#######.", "#########", "#########"] },
  { key: "user", app: "user", name: "使用者", bg: "#F4A9B8", glyph: [".........", ".##...##.", "####.####", "#########", "#########", ".#######.", "..#####..", "...###...", "....#...."] },
  { key: "world", app: "book", name: "世界書", bg: "#9CC7E6", glyph: ["...###...", ".##.#.##.", ".#..#..#.", "#########", "#...#...#", "#########", ".#..#..#.", ".##.#.##.", "...###..."] },
  { key: "prompt", app: "prompt-manager", name: "提示詞", bg: "#F3D98B", glyph: [".#######.", ".#.....#.", ".#.###.#.", ".#.....#.", ".#.###.#.", ".#.....#.", ".#.##..#.", ".#.....#.", ".#######."] },
  { key: "theater", app: "theater", name: "劇場", bg: "#C9A7E0", glyph: [".#######.", "#########", "##.###.##", "#########", "#.#####.#", "##.....##", ".##...##.", "..#####..", "........."] },
  { key: "fate", app: "fate", name: "占卜", bg: "#B7B4EE", glyph: ["..#####..", ".#.....#.", "#..#....#", "#.......#", "#.......#", ".#.....#.", "..#####..", ".#######.", "#########"] },
  { key: "read", app: "reading", name: "閱讀", bg: "#E8C79A", glyph: [".........", ".##...##.", "#..#.#..#", "#..#.#..#", "#..#.#..#", "#..#.#..#", "####.####", "...###...", "........."] },
  { key: "all", app: "__all__", name: "全部 App", bg: "#D8CFC0", glyph: [".........", ".###.###.", ".###.###.", ".###.###.", ".........", ".###.###.", ".###.###.", ".###.###.", "........."] },
];

/** 下面那一排固定的常用 App（DIAL_APPS 的 key），不用記哪件家具是哪個 App */
export const DOCK_APP_KEYS = ["msg", "char", "world", "prompt"];
/** 下面那一排的「小屋」：換外觀、擺件商店、移動家具、怎麼玩都在這裡 */
export const HOUSE_GLYPH = ["....#....", "...###...", "..#####..", ".#######.", "#########", ".#######.", ".##.#.##.", ".##.###..", ".##.###.."];

export const INK = "#3B2A26";
export const PAPER = "#FBF7EE";
export const BADGE_RED = "#D9453A";
