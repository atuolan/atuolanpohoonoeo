/**
 * 約會地點與隨機事件
 *
 * - costPerPerson 是一個人的花費範圍，開始約會時抽一次，兩人份就是總花費
 * - vibe 給 AI 看的氣氛描述
 * - events 這個地點專屬的隨機事件；另外還有 COMMON_DATE_EVENTS 共用
 */

export interface DateSpot {
  id: string;
  name: string;
  emoji: string;
  durationMinutes: number;
  costPerPerson: [number, number];
  vibe: string;
  events: string[];
}

export const DATE_SPOTS: DateSpot[] = [
  {
    id: "cafe",
    name: "咖啡廳",
    emoji: "☕",
    durationMinutes: 120,
    costPerPerson: [150, 400],
    vibe: "安靜的轉角咖啡廳，靠窗的位子曬得到太陽，適合慢慢聊天",
    events: ["店員送錯飲料，兩杯剛好交換", "隔壁桌在求婚", "店裡的貓跳上你們的桌子"],
  },
  {
    id: "cinema",
    name: "電影院",
    emoji: "🎬",
    durationMinutes: 180,
    costPerPerson: [300, 600],
    vibe: "週末的電影院，爆米花的味道，燈暗下來之後只剩螢幕的光",
    events: ["電影比想像中恐怖很多", "爆米花只買了一桶，手一直碰到", "散場時發現兩個人都哭了"],
  },
  {
    id: "aquarium",
    name: "水族館",
    emoji: "🐠",
    durationMinutes: 180,
    costPerPerson: [500, 900],
    vibe: "藍色的燈光，大水族箱前很安靜，水母區暗暗的",
    events: ["海豚表演水花濺到你們", "在海底隧道停電了幾秒", "紀念品店有一對很像你們的企鵝玩偶"],
  },
  {
    id: "night-market",
    name: "夜市",
    emoji: "🏮",
    durationMinutes: 180,
    costPerPerson: [200, 600],
    vibe: "人擠人的夜市，炸物和糖葫蘆的味道，到處都是叫賣聲",
    events: ["套圈圈套中了大獎", "人太多差點走散", "吃到超辣的東西"],
  },
  {
    id: "amusement-park",
    name: "遊樂園",
    emoji: "🎡",
    durationMinutes: 360,
    costPerPerson: [1200, 2500],
    vibe: "遊樂園，雲霄飛車的尖叫聲，傍晚的摩天輪最熱門",
    events: ["摩天輪卡在最高點停了五分鐘", "鬼屋裡一直被嚇", "雲霄飛車的拍照區照片很醜"],
  },
  {
    id: "beach",
    name: "海邊",
    emoji: "🏖️",
    durationMinutes: 240,
    costPerPerson: [100, 500],
    vibe: "海邊，海風很大，沙灘上的腳印一下就被浪沖掉",
    events: ["鞋子被浪捲走一隻", "剛好碰到夕陽", "撿到很漂亮的貝殼"],
  },
  {
    id: "fine-dining",
    name: "高級餐廳",
    emoji: "🍷",
    durationMinutes: 150,
    costPerPerson: [2000, 6000],
    vibe: "燈光很暗的高級餐廳，桌上有蠟燭，服務生會幫忙倒酒",
    events: ["服務生以為你們是來慶祝紀念日，送了甜點", "菜單看不懂，點錯了一道菜", "隔壁桌是認識的人"],
  },
  {
    id: "shopping",
    name: "逛街",
    emoji: "🛍️",
    durationMinutes: 180,
    costPerPerson: [500, 3000],
    vibe: "熱鬧的商圈，一家一家的小店，試衣間前要等很久",
    events: ["看中同一件衣服", "店員一直說你們很配", "抽中商場的抽獎"],
  },
];

/** 自訂地點的預設時長 */
export const CUSTOM_DATE_DURATION_MINUTES = 180;

/** 共用的隨機事件；forgotWallet 會改誰付錢 */
export interface CommonDateEvent {
  id: string;
  text: string;
  forgotWallet?: boolean;
}

export const COMMON_DATE_EVENTS: CommonDateEvent[] = [
  { id: "rain", text: "突然下起大雨，兩個人只有一把傘" },
  { id: "acquaintance", text: "遇到認識的人，被問你們是什麼關係" },
  { id: "queue", text: "排隊排了很久" },
  { id: "phone-dead", text: "手機沒電了，只能靠彼此" },
  { id: "forgot-wallet", text: "出門忘了帶錢包", forgotWallet: true },
];

/** 開始約會時抽到隨機事件的機率 */
export const DATE_EVENT_CHANCE = 0.6;

/** 角色第幾輪回覆之前把事件交給 AI（第 3 輪 → 前面已經回了 2 輪） */
export const DATE_EVENT_AFTER_REPLIES = 2;

export function getDateSpot(id: string): DateSpot | undefined {
  return DATE_SPOTS.find((s) => s.id === id);
}
