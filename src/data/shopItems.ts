/**
 * 商城商品定義
 *
 * 定義所有可購買的商品，包含頭像框、聊天氣泡、魚竿、禮物、消耗品
 *
 * @requirements 5.1
 */
import type { Rarity } from "@/schemas/gameEconomy";

/** 商品分類 */
export type ShopCategory = "frame" | "bubble" | "gift" | "rod" | "consumable";

/** 消耗品效果類型 */
export type ConsumableEffectType = "work_efficiency" | "fishing_efficiency";

/** 消耗品使用類型 */
export type ConsumableUsageType = "count" | "duration";

/** 消耗品效果 */
export interface ConsumableEffect {
  type: ConsumableEffectType;
  multiplier: number;
  /** 使用類型：count = 次數制，duration = 時間制 */
  usageType: ConsumableUsageType;
  /** 使用次數（usageType = count 時） */
  maxUses?: number;
  /** 持續時間（毫秒，usageType = duration 時） */
  duration?: number;
  /** 暫停條件（僅自動釣魚器等特殊道具） */
  pauseConditions?: ("rod_durability" | "daily_limit")[];
}

/** 魚竿屬性 */
export interface RodStats {
  maxDurability: number;
  minFishTier: number;
  maxFishTier: number;
  efficiency: number;
}

/** 商品變體定義 */
export interface ShopItemVariant {
  /** 變體 ID（完整 ID = 商品ID_變體ID） */
  variantId: string;
  /** 變體名稱 */
  name: string;
  /** 變體描述（可選，不填則使用主商品描述） */
  description?: string;
  /** 變體預覽顏色（用於選擇器顯示） */
  previewColor?: string;
  /** 變體預覽圖片 URL（可選） */
  previewImage?: string;
}

/** 商品定義 */
export interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: ShopCategory;
  rarity: Rarity;
  icon: string;
  /** 魚竿專用屬性 */
  rodStats?: RodStats;
  /** 消耗品專用效果 */
  consumableEffect?: ConsumableEffect;
  /** 商品變體（擇一購買，如 Discord 顏色選擇） */
  variants?: ShopItemVariant[];
}

// ===== 頭像框 =====

export const FRAME_ITEMS: ShopItem[] = [
  {
    id: "Silver_rim",
    name: "簡約銀框",
    description: "精緻的銀色圓框搭配金色星光點綴，低調中帶著優雅",
    price: 6000,
    category: "frame",
    rarity: "common",
    icon: "frame-silver-rim",
  },
  {
    id: "frame_moon",
    name: "月亮",
    description: "夢幻的月亮裝飾框，為你的頭像增添神秘氛圍",
    price: 8000,
    category: "frame",
    rarity: "common",
    icon: "frame-moon",
    variants: [
      {
        variantId: "yellow",
        name: "金黃月",
        description: "經典金黃色月亮，溫暖明亮",
        previewColor: "#ffd700",
      },
      {
        variantId: "red",
        name: "血月",
        description: "神秘的紅色月亮，帶有一絲詭異氛圍",
        previewColor: "#dc2626",
      },
    ],
  },
  {
    id: "frame_see_sea",
    name: "海的風情",
    description: "清涼的海洋主題框，可愛的草帽與小魚裝飾，夏日氣息滿滿",
    price: 8000,
    category: "frame",
    rarity: "common",
    icon: "frame-see-sea",
  },
  {
    id: "frame_bee",
    name: "蜜蜂採蜜",
    description: "蜂巢紋背景搭配可愛小蜜蜂，甜蜜又療癒",
    price: 8000,
    category: "frame",
    rarity: "common",
    icon: "frame-bee",
  },
  {
    id: "frame_peekcat",
    name: "偷看貓咪",
    description: "可愛的貓咪從角落偷看，粉嫩治癒",
    price: 15000,
    category: "frame",
    rarity: "rare",
    icon: "frame-peekcat",
  },
  {
    id: "frame_greencoal",
    name: "綠煤炭",
    description: "森林系噴漆風格，可愛的煤炭精靈與綠葉裝飾",
    price: 18000,
    category: "frame",
    rarity: "epic",
    icon: "frame-greencoal",
    variants: [
      {
        variantId: "green",
        name: "森林綠",
        description: "經典森林系配色，清新自然",
        previewColor: "#76c25b",
      },
      {
        variantId: "pink",
        name: "櫻花粉",
        description: "粉嫩櫻花配色，甜美可愛",
        previewColor: "#f5a9b8",
      },
      {
        variantId: "png",
        name: "精緻版",
        description: "高清 PNG 版本，細節更豐富",
        previewColor: "#2d5016",
      },
    ],
  },
  {
    id: "Demon_DC",
    name: "惡魔",
    description: "神秘的惡魔角裝飾，為你的頭像增添一絲邪魅氣息",
    price: 12000,
    category: "frame",
    rarity: "rare",
    icon: "frame-demon",
  },
  {
    id: "White_rose_DC",
    name: "玫瑰",
    description: "優雅的玫瑰裝飾，散發淡淡清香",
    price: 15000,
    category: "frame",
    rarity: "rare",
    icon: "frame-white-rose",
    variants: [
      {
        variantId: "white",
        name: "白玫瑰",
        description: "純潔優雅的白玫瑰，象徵純真",
        previewColor: "#ffffff",
      },
      {
        variantId: "black",
        name: "黑玫瑰",
        description: "神秘高貴的黑玫瑰，散發獨特魅力",
        previewColor: "#1a1a1a",
      },
    ],
  },
  {
    id: "Angel_wings",
    name: "天使翅膀",
    description: "聖潔的天使羽翼，為你的頭像增添神聖光輝",
    price: 5000,
    category: "frame",
    rarity: "common",
    icon: "frame-angel-wings",
  },
  {
    id: "Hazy_Starlight_DC",
    name: "朦朧星光",
    description: "夢幻的星光環繞，如夜空中閃爍的繁星",
    price: 12000,
    category: "frame",
    rarity: "rare",
    icon: "frame-hazy-starlight",
  },
  {
    id: "Moon_Stars_DC",
    name: "月和星",
    description: "月亮與星星的夢幻組合，點綴夜空的浪漫",
    price: 12000,
    category: "frame",
    rarity: "rare",
    icon: "frame-moon-stars",
  },
  {
    id: "Are_you_so_awesome_Klass",
    name: "你很牛逼克拉斯嗎",
    description: "霸氣外露的克拉斯主題框，展現你的自信態度",
    price: 18000,
    category: "frame",
    rarity: "epic",
    icon: "frame-awesome-klass",
  },
  {
    id: "Youre_not_satisfied",
    name: "頭像是我你不滿意？",
    description: "不滿意？那就看看這個頭像框吧，個性十足",
    price: 15000,
    category: "frame",
    rarity: "rare",
    icon: "frame-not-satisfied",
  },
  {
    id: "UPUP_love",
    name: "撫摸，好感度+5",
    description: "溫柔的撫摸互動框，好感度悄悄上升中",
    price: 12000,
    category: "frame",
    rarity: "rare",
    icon: "frame-upup-love",
  },
  {
    id: "Baking_Bear",
    name: "烘焙熊",
    description: "可愛的烘焙熊裝飾框，溫暖的烘焙香氣撲面而來",
    price: 18000,
    category: "frame",
    rarity: "epic",
    icon: "frame-baking-bear",
  },
  {
    id: "Overbearing_CEO",
    name: "霸道總裁小嬌妻",
    description: "霸道總裁風格動態框，展現你的霸氣與柔情",
    price: 8000,
    category: "frame",
    rarity: "common",
    icon: "frame-overbearing-ceo",
  },
  {
    id: "Emperor_arrived",
    name: "皇上駕到",
    description: "皇家氣派的動態框，龍袍加身，威風凜凜",
    price: 18000,
    category: "frame",
    rarity: "epic",
    icon: "frame-emperor-arrived",
  },
];

// ===== 聊天氣泡 =====

export const BUBBLE_ITEMS: ShopItem[] = [
  {
    id: "bubble_pink",
    name: "夢幻粉",
    description: "粉嫩可愛的聊天氣泡",
    price: 5000,
    category: "bubble",
    rarity: "common",
    icon: "bubble-pink",
  },
  {
    id: "bubble_cyber",
    name: "賽博龐克",
    description: "科技感十足的霓虹風格",
    price: 5000,
    category: "bubble",
    rarity: "common",
    icon: "bubble-cyber",
  },
  {
    id: "bubble_ink",
    name: "水墨風",
    description: "古典雅致的水墨畫風格",
    price: 5000,
    category: "bubble",
    rarity: "common",
    icon: "bubble-ink",
  },
  {
    id: "bubble_neon",
    name: "霓虹閃爍",
    description: "動態閃爍的霓虹燈效果",
    price: 8000,
    category: "bubble",
    rarity: "rare",
    icon: "bubble-neon",
  },
  {
    id: "bubble_galaxy",
    name: "星河漫步",
    description: "璀璨星空的夢幻氣泡",
    price: 15000,
    category: "bubble",
    rarity: "epic",
    icon: "bubble-galaxy",
  },
];

// ===== 魚竿 =====

export const ROD_ITEMS: ShopItem[] = [
  // Tier 1 - 入門級
  {
    id: "rod_bamboo",
    name: "竹竿",
    description: "新手入門的基礎魚竿，只能釣到普通魚",
    price: 30,
    category: "rod",
    rarity: "common",
    icon: "rod-bamboo",
    rodStats: {
      maxDurability: 30,
      minFishTier: 1,
      maxFishTier: 1,
      efficiency: 1,
    },
  },
  // Tier 2 - 初級
  {
    id: "rod_wooden",
    name: "木製竿",
    description: "手工打造的木製魚竿，稍微耐用一些",
    price: 80,
    category: "rod",
    rarity: "common",
    icon: "rod-wooden",
    rodStats: {
      maxDurability: 50,
      minFishTier: 1,
      maxFishTier: 2,
      efficiency: 1.1,
    },
  },
  // Tier 3 - 中級
  {
    id: "rod_carbon",
    name: "碳纖竿",
    description: "輕巧耐用的碳纖維魚竿",
    price: 250,
    category: "rod",
    rarity: "uncommon",
    icon: "rod-carbon",
    rodStats: {
      maxDurability: 80,
      minFishTier: 1,
      maxFishTier: 3,
      efficiency: 1.2,
    },
  },
  // Tier 4 - 進階
  {
    id: "rod_steel",
    name: "鋼製竿",
    description: "堅固的鋼製魚竿，適合釣大魚",
    price: 600,
    category: "rod",
    rarity: "uncommon",
    icon: "rod-steel",
    rodStats: {
      maxDurability: 100,
      minFishTier: 2,
      maxFishTier: 3,
      efficiency: 1.3,
    },
  },
  // Tier 5 - 專業級
  {
    id: "rod_pro",
    name: "專業竿",
    description: "專業釣手的首選裝備",
    price: 1500,
    category: "rod",
    rarity: "rare",
    icon: "rod-pro",
    rodStats: {
      maxDurability: 150,
      minFishTier: 2,
      maxFishTier: 4,
      efficiency: 1.5,
    },
  },
  // Tier 6 - 高級
  {
    id: "rod_titanium",
    name: "鈦合金竿",
    description: "輕量化的鈦合金魚竿，高效耐用",
    price: 3500,
    category: "rod",
    rarity: "rare",
    icon: "rod-titanium",
    rodStats: {
      maxDurability: 200,
      minFishTier: 3,
      maxFishTier: 4,
      efficiency: 1.8,
    },
  },
  // Tier 7 - 頂級
  {
    id: "rod_gold",
    name: "黃金竿",
    description: "鍍金的頂級魚竿，可釣傳說魚種",
    price: 8000,
    category: "rod",
    rarity: "epic",
    icon: "rod-gold",
    rodStats: {
      maxDurability: 300,
      minFishTier: 3,
      maxFishTier: 5,
      efficiency: 2.2,
    },
  },
  // Tier 8 - 傳說級
  {
    id: "rod_legendary",
    name: "傳說之竿",
    description: "傳說中的神器，據說能釣到龍魚",
    price: 25000,
    category: "rod",
    rarity: "legendary",
    icon: "rod-legendary",
    rodStats: {
      maxDurability: 500,
      minFishTier: 4,
      maxFishTier: 5,
      efficiency: 3,
    },
  },
];

// ===== 禮物 =====

export const GIFT_ITEMS: ShopItem[] = [
  // ===== Common 普通禮物 =====
  {
    id: "gift_flower",
    name: "鮮花",
    description: "一束美麗的鮮花，表達心意的基本款",
    price: 200,
    category: "gift",
    rarity: "common",
    icon: "gift-flower",
  },
  {
    id: "gift_chocolate",
    name: "巧克力",
    description: "甜蜜的手工巧克力，融化人心",
    price: 300,
    category: "gift",
    rarity: "common",
    icon: "gift-chocolate",
  },
  {
    id: "gift_cake",
    name: "蛋糕",
    description: "精緻的小蛋糕，甜蜜的祝福",
    price: 500,
    category: "gift",
    rarity: "common",
    icon: "gift-cake",
  },
  {
    id: "gift_cola",
    name: "可樂",
    description: "冰涼暢快的可樂，簡單的快樂",
    price: 100,
    category: "gift",
    rarity: "common",
    icon: "gift-cola",
  },
  {
    id: "gift_mug_simple",
    name: "簡約馬克杯",
    description: "實用的白色馬克杯，日常必備",
    price: 400,
    category: "gift",
    rarity: "common",
    icon: "gift-mug",
  },
  {
    id: "gift_plush_bear",
    name: "小熊娃娃",
    description: "可愛的小熊玩偶，溫暖的陪伴",
    price: 600,
    category: "gift",
    rarity: "common",
    icon: "gift-plush",
  },

  // ===== Uncommon 優良禮物 =====
  {
    id: "gift_lotion",
    name: "保濕乳液",
    description: "高品質保濕乳液，呵護肌膚",
    price: 1500,
    category: "gift",
    rarity: "uncommon",
    icon: "gift-lotion",
  },
  {
    id: "gift_toner",
    name: "化妝水",
    description: "清爽補水化妝水，煥發光彩",
    price: 1800,
    category: "gift",
    rarity: "uncommon",
    icon: "gift-toner",
  },
  {
    id: "gift_mug_cat",
    name: "貓咪馬克杯",
    description: "可愛貓咪造型馬克杯，療癒系設計",
    price: 1200,
    category: "gift",
    rarity: "uncommon",
    icon: "gift-mug-cat",
  },
  {
    id: "gift_plush_bunny",
    name: "兔子娃娃",
    description: "軟綿綿的兔子玩偶，超級治癒",
    price: 2000,
    category: "gift",
    rarity: "uncommon",
    icon: "gift-plush-bunny",
  },
  {
    id: "gift_charm_star",
    name: "星星吊飾",
    description: "閃亮的星星造型吊飾，點綴生活",
    price: 2500,
    category: "gift",
    rarity: "uncommon",
    icon: "gift-charm",
  },
  {
    id: "gift_earring_pearl",
    name: "珍珠耳環",
    description: "優雅的淡水珍珠耳環，氣質之選",
    price: 3000,
    category: "gift",
    rarity: "uncommon",
    icon: "gift-earring",
  },
  {
    id: "gift_crystal_clear",
    name: "白水晶",
    description: "淨化心靈的白水晶，象徵純淨與智慧，能量之王",
    price: 3500,
    category: "gift",
    rarity: "uncommon",
    icon: "gift-crystal",
  },

  // ===== Rare 稀有禮物 =====
  {
    id: "gift_necklace_silver",
    name: "銀項鍊",
    description: "精緻的純銀項鍊，簡約優雅",
    price: 5000,
    category: "gift",
    rarity: "rare",
    icon: "gift-necklace",
  },
  {
    id: "gift_ring_silver",
    name: "銀戒指",
    description: "精美的純銀戒指，永恆的承諾",
    price: 6000,
    category: "gift",
    rarity: "rare",
    icon: "gift-ring",
  },
  {
    id: "gift_crystal_rose",
    name: "粉晶",
    description: "愛情之石，招桃花、促進人緣，散發溫柔粉色光芒",
    price: 8000,
    category: "gift",
    rarity: "rare",
    icon: "gift-crystal-rose",
  },
  {
    id: "gift_crystal_amethyst",
    name: "紫水晶",
    description: "智慧之石，提升靈性與直覺，帶來平靜與安寧",
    price: 8500,
    category: "gift",
    rarity: "rare",
    icon: "gift-crystal-amethyst",
  },
  {
    id: "gift_crystal_citrine",
    name: "黃水晶",
    description: "財富之石，招財進寶，帶來好運與正能量",
    price: 9000,
    category: "gift",
    rarity: "rare",
    icon: "gift-crystal-citrine",
  },
  {
    id: "gift_earring_crystal",
    name: "水晶耳環",
    description: "璀璨的施華洛世奇水晶耳環，閃耀動人",
    price: 7500,
    category: "gift",
    rarity: "rare",
    icon: "gift-earring-crystal",
  },
  {
    id: "gift_plush_giant",
    name: "巨型泰迪熊",
    description: "超大號泰迪熊，滿滿的愛與溫暖",
    price: 10000,
    category: "gift",
    rarity: "rare",
    icon: "gift-plush-giant",
  },
  {
    id: "gift_charm_moon",
    name: "月亮吊飾",
    description: "精緻的月亮造型吊飾，鑲嵌小鑽石",
    price: 8000,
    category: "gift",
    rarity: "rare",
    icon: "gift-charm-moon",
  },
  {
    id: "gift_skincare_set",
    name: "護膚禮盒",
    description: "高級護膚品套裝，乳液、化妝水、精華液",
    price: 12000,
    category: "gift",
    rarity: "rare",
    icon: "gift-skincare",
  },

  // ===== Epic 史詩禮物 =====
  {
    id: "gift_necklace_gold",
    name: "金項鍊",
    description: "18K金項鍊，奢華典雅",
    price: 25000,
    category: "gift",
    rarity: "epic",
    icon: "gift-necklace-gold",
  },
  {
    id: "gift_ring_gold",
    name: "金戒指",
    description: "18K金戒指，永恆的愛情象徵",
    price: 30000,
    category: "gift",
    rarity: "epic",
    icon: "gift-ring-gold",
  },
  {
    id: "gift_crystal_obsidian",
    name: "黑曜石",
    description: "強大的保護石，辟邪擋煞，吸收負能量，守護平安",
    price: 20000,
    category: "gift",
    rarity: "epic",
    icon: "gift-crystal-obsidian",
  },
  {
    id: "gift_crystal_moonstone",
    name: "月光石",
    description: "神秘的月光石，增強直覺與靈感，帶來好運與愛情",
    price: 22000,
    category: "gift",
    rarity: "epic",
    icon: "gift-crystal-moonstone",
  },
  {
    id: "gift_crystal_labradorite",
    name: "拉長石",
    description: "魔法之石，展現神秘的藍綠光彩，激發創造力與想像力",
    price: 25000,
    category: "gift",
    rarity: "epic",
    icon: "gift-crystal-labradorite",
  },
  {
    id: "gift_crystal_aquamarine",
    name: "海藍寶",
    description: "勇氣之石，如海水般清澈，帶來平靜與勇氣，守護旅人",
    price: 28000,
    category: "gift",
    rarity: "epic",
    icon: "gift-crystal-aquamarine",
  },
  {
    id: "gift_earring_diamond",
    name: "鑽石耳環",
    description: "璀璨的小鑽石耳環，閃耀奪目",
    price: 35000,
    category: "gift",
    rarity: "epic",
    icon: "gift-earring-diamond",
  },
  {
    id: "gift_charm_custom",
    name: "訂製吊飾",
    description: "專屬訂製的個人化吊飾，刻上專屬名字或日期",
    price: 40000,
    category: "gift",
    rarity: "epic",
    icon: "gift-charm-custom",
  },
  {
    id: "gift_limited_box",
    name: "限定禮盒",
    description: "神秘的限定版禮盒，內含多種驚喜",
    price: 45000,
    category: "gift",
    rarity: "epic",
    icon: "gift-limited",
  },

  // ===== Legendary 傳說禮物 =====
  {
    id: "gift_diamond",
    name: "鑽石",
    description: "一克拉璀璨鑽石，永恆的愛情見證",
    price: 50000,
    category: "gift",
    rarity: "legendary",
    icon: "gift-diamond",
  },
  {
    id: "gift_necklace_custom",
    name: "訂製項鍊",
    description: "專屬訂製的18K金項鍊，可刻字或鑲嵌寶石",
    price: 65000,
    category: "gift",
    rarity: "legendary",
    icon: "gift-necklace-custom",
  },
  {
    id: "gift_crystal_ruby",
    name: "紅寶石",
    description: "寶石之王，象徵熱情與愛情，帶來勇氣與活力，極其珍貴",
    price: 80000,
    category: "gift",
    rarity: "legendary",
    icon: "gift-ruby",
  },
  {
    id: "gift_crystal_sapphire",
    name: "藍寶石",
    description: "智慧與忠誠之石，深邃的藍色象徵永恆，皇室珍藏",
    price: 85000,
    category: "gift",
    rarity: "legendary",
    icon: "gift-sapphire",
  },
  {
    id: "gift_crystal_emerald",
    name: "祖母綠",
    description: "綠寶石之王，象徵希望與重生，帶來好運與繁榮",
    price: 90000,
    category: "gift",
    rarity: "legendary",
    icon: "gift-emerald",
  },
  {
    id: "gift_ring_diamond",
    name: "鑽戒",
    description: "一克拉鑽石戒指，永恆的承諾與愛情",
    price: 100000,
    category: "gift",
    rarity: "legendary",
    icon: "gift-ring-diamond",
  },
  {
    id: "gift_charm_diamond",
    name: "訂製鑽石吊飾",
    description: "頂級訂製鑽石吊飾，獨一無二的專屬設計",
    price: 120000,
    category: "gift",
    rarity: "legendary",
    icon: "gift-charm-diamond",
  },
  {
    id: "gift_crystal_alexandrite",
    name: "亞歷山大石",
    description: "變色寶石之王，日光下呈綠色、燈光下呈紅色，極其稀有",
    price: 150000,
    category: "gift",
    rarity: "legendary",
    icon: "gift-alexandrite",
  },
];

// ===== 消耗品 =====

export const CONSUMABLE_ITEMS: ShopItem[] = [
  {
    id: "item_gloves",
    name: "洗碗手套",
    description: "提升洗盤子效率 20%，可使用 50 次",
    price: 100,
    category: "consumable",
    rarity: "common",
    icon: "item-gloves",
    consumableEffect: {
      type: "work_efficiency",
      multiplier: 1.2,
      usageType: "count",
      maxUses: 50,
    },
  },
  {
    id: "item_soap",
    name: "高級洗碗精",
    description: "提升洗盤子效率 50%，可使用 100 次",
    price: 300,
    category: "consumable",
    rarity: "common",
    icon: "item-soap",
    consumableEffect: {
      type: "work_efficiency",
      multiplier: 1.5,
      usageType: "count",
      maxUses: 100,
    },
  },
  {
    id: "item_super_soap",
    name: "超級洗碗精",
    description: "提升洗盤子效率 100%，可使用 100 次",
    price: 800,
    category: "consumable",
    rarity: "rare",
    icon: "item-super-soap",
    consumableEffect: {
      type: "work_efficiency",
      multiplier: 2.0,
      usageType: "count",
      maxUses: 100,
    },
  },
  {
    id: "item_bait",
    name: "高級魚餌",
    description: "提升釣魚效率 30%，可使用 50 次",
    price: 200,
    category: "consumable",
    rarity: "common",
    icon: "item-bait",
    consumableEffect: {
      type: "fishing_efficiency",
      multiplier: 1.3,
      usageType: "count",
      maxUses: 50,
    },
  },
  {
    id: "item_auto_fish",
    name: "自動釣魚器",
    description:
      "掛機釣魚效率 +50%，持續 5 小時（魚竿耐久歸零或達每日上限時暫停）",
    price: 500,
    category: "consumable",
    rarity: "rare",
    icon: "item-auto-fish",
    consumableEffect: {
      type: "fishing_efficiency",
      multiplier: 1.5,
      usageType: "duration",
      duration: 5 * 60 * 60 * 1000, // 5 小時
      pauseConditions: ["rod_durability", "daily_limit"],
    },
  },
];

// ===== 匯出所有商品 =====

/** 所有商品列表 */
export const SHOP_ITEMS: ShopItem[] = [
  ...FRAME_ITEMS,
  ...BUBBLE_ITEMS,
  ...ROD_ITEMS,
  ...GIFT_ITEMS,
  ...CONSUMABLE_ITEMS,
];

// ===== 輔助函數 =====

/**
 * 根據 ID 取得商品
 * @param itemId 商品 ID
 * @returns 商品資料或 undefined
 */
export function getShopItemById(itemId: string): ShopItem | undefined {
  return SHOP_ITEMS.find((item) => item.id === itemId);
}

/**
 * 根據分類取得商品列表
 * @param category 商品分類
 * @returns 該分類的商品列表
 */
export function getShopItemsByCategory(category: ShopCategory): ShopItem[] {
  return SHOP_ITEMS.filter((item) => item.category === category);
}

/**
 * 根據稀有度取得商品列表
 * @param rarity 稀有度
 * @returns 該稀有度的商品列表
 */
export function getShopItemsByRarity(rarity: Rarity): ShopItem[] {
  return SHOP_ITEMS.filter((item) => item.rarity === rarity);
}

/**
 * 取得所有魚竿商品
 * @returns 魚竿商品列表
 */
export function getRodItems(): ShopItem[] {
  return ROD_ITEMS;
}

/**
 * 取得所有禮物商品
 * @returns 禮物商品列表
 */
export function getGiftItems(): ShopItem[] {
  return GIFT_ITEMS;
}
