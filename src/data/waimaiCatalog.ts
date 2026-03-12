/**
 * 外賣/商城 MVP 商品目錄
 *
 * 三大館：
 * 1) 良心商店（日用品、化妝品、玩偶）
 * 2) 邪氣商店（成人用品）
 * 3) 美食廣場（餐飲）
 */

import type { WaimaiItemLogisticsMeta } from "../types/waimaiDelivery";

export type WaimaiMallSection = "kind" | "spicy" | "food";

export interface WaimaiCatalogItem {
  /** 全域唯一 ID（不可重複） */
  id: string;
  /** 所屬館別 */
  section: WaimaiMallSection;
  /** 店家名稱 */
  storeName: string;
  /** 商品名稱 */
  name: string;
  /** 售價（整數） */
  price: number;
  /** 圖片 */
  imageUrl: string;
  /** 商品標籤 */
  tags: string[];
  /** 是否可售（下架時 false） */
  isAvailable: boolean;
  /** 短描述 */
  description?: string;
  /** 物流元資料（ETA 用） */
  logisticsMeta: WaimaiItemLogisticsMeta;
}

export interface WaimaiMallSectionMeta {
  id: WaimaiMallSection;
  label: string;
  subtitle: string;
}

export const WAIMAI_SECTION_META: WaimaiMallSectionMeta[] = [
  {
    id: "kind",
    label: "良心商店",
    subtitle: "日用品、化妝品、玩偶",
  },
  {
    id: "spicy",
    label: "邪氣商店",
    subtitle: "成人用品專區",
  },
  {
    id: "food",
    label: "美食廣場",
    subtitle: "名氣店家、主食與甜點",
  },
];

const SECTION_LOGISTICS_DEFAULTS: Record<WaimaiMallSection, WaimaiItemLogisticsMeta> = {
  food: {
    logisticsType: "local",
    originCountry: "TW",
    originCity: "Taipei",
    prepMinutesRange: [12, 28],
  },
  kind: {
    logisticsType: "cross_border",
    originCountry: "TW",
    originCity: "Taipei",
    prepHoursRange: [12, 48],
  },
  spicy: {
    logisticsType: "cross_border",
    originCountry: "DE",
    originCity: "Berlin",
    prepHoursRange: [12, 48],
  },
};

const RAW_WAIMAI_CATALOG: Omit<WaimaiCatalogItem, "logisticsMeta">[] = [
  // ===== 良心商店 =====
  {
    id: "kind_daily_toothpaste_mint",
    section: "kind",
    storeName: "良心生活館",
    name: "薄荷清新牙膏",
    price: 120,
    imageUrl: "https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=800",
    tags: ["日用品", "清潔", "口腔"],
    isAvailable: true,
    description: "溫和不刺激，日常清潔首選。",
  },
  {
    id: "kind_daily_shampoo_herb",
    section: "kind",
    storeName: "良心生活館",
    name: "草本修護洗髮露",
    price: 260,
    imageUrl: "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=800",
    tags: ["日用品", "洗護", "草本"],
    isAvailable: true,
    description: "適合日常使用，氣味清新。",
  },
  {
    id: "kind_daily_laundry_capsule",
    section: "kind",
    storeName: "良心生活館",
    name: "植萃洗衣膠囊（30 顆）",
    price: 399,
    imageUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800",
    tags: ["日用品", "清潔", "衣物"],
    isAvailable: true,
    description: "低敏配方，去汙同時保護纖維。",
  },
  {
    id: "kind_daily_tissue_soft_pack",
    section: "kind",
    storeName: "日常補給站",
    name: "柔感抽取衛生紙（10 包）",
    price: 179,
    imageUrl: "https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=800",
    tags: ["日用品", "居家", "補貨"],
    isAvailable: true,
    description: "三層柔韌，不易掉屑。",
  },
  {
    id: "kind_daily_detergent_citrus",
    section: "kind",
    storeName: "日常補給站",
    name: "柑橘香洗碗精",
    price: 135,
    imageUrl: "https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=800",
    tags: ["日用品", "廚房", "清潔"],
    isAvailable: true,
    description: "快速去油，清香不刺鼻。",
  },
  {
    id: "kind_beauty_lipbalm_rose",
    section: "kind",
    storeName: "小鹿美妝",
    name: "玫瑰潤澤護唇膏",
    price: 180,
    imageUrl: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=800",
    tags: ["化妝品", "保養", "唇部"],
    isAvailable: true,
    description: "保濕不黏膩，淡淡玫瑰香。",
  },
  {
    id: "kind_beauty_handcream_shea",
    section: "kind",
    storeName: "小鹿美妝",
    name: "乳木果護手霜",
    price: 220,
    imageUrl: "https://images.unsplash.com/photo-1612817288484-6f916006741a?w=800",
    tags: ["化妝品", "保養", "手部"],
    isAvailable: true,
    description: "乾燥季節救星，快速吸收。",
  },
  {
    id: "kind_beauty_mask_hydra_box",
    section: "kind",
    storeName: "小鹿美妝",
    name: "玻尿酸補水面膜（5 入）",
    price: 320,
    imageUrl: "https://images.unsplash.com/photo-1596755389378-c31d21fd1273?w=800",
    tags: ["化妝品", "面膜", "保養"],
    isAvailable: true,
    description: "急救保濕組，妝前敷感更服貼。",
  },
  {
    id: "kind_beauty_sunscreen_daily",
    section: "kind",
    storeName: "小鹿美妝",
    name: "日常防曬乳 SPF50+",
    price: 420,
    imageUrl: "https://images.unsplash.com/photo-1526758097130-bab247274f58?w=800",
    tags: ["化妝品", "防曬", "臉部"],
    isAvailable: true,
    description: "清爽不泛白，通勤外出皆適用。",
  },
  {
    id: "kind_toy_plush_bunny",
    section: "kind",
    storeName: "抱抱玩偶社",
    name: "奶油兔玩偶",
    price: 490,
    imageUrl: "https://images.unsplash.com/photo-1559454403-b8fb88521f11?w=800",
    tags: ["玩偶", "禮物", "療癒"],
    isAvailable: true,
    description: "柔軟親膚，適合陪睡與擺飾。",
  },
  {
    id: "kind_toy_plush_bear",
    section: "kind",
    storeName: "抱抱玩偶社",
    name: "焦糖熊玩偶",
    price: 620,
    imageUrl: "https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=800",
    tags: ["玩偶", "禮物", "收藏"],
    isAvailable: true,
    description: "經典熊系，送禮安全牌。",
  },
  {
    id: "kind_toy_plush_cat_gray",
    section: "kind",
    storeName: "抱抱玩偶社",
    name: "灰貓抱枕玩偶",
    price: 540,
    imageUrl: "https://images.unsplash.com/photo-1595433707802-6b2626ef1c91?w=800",
    tags: ["玩偶", "抱枕", "療癒"],
    isAvailable: true,
    description: "可當腰靠與午睡枕，辦公室人氣款。",
  },
  {
    id: "kind_toy_mystery_box_cute",
    section: "kind",
    storeName: "驚喜扭蛋屋",
    name: "萌系盲盒（隨機款）",
    price: 299,
    imageUrl: "https://images.unsplash.com/photo-1515488764276-beab7607c1e6?w=800",
    tags: ["玩偶", "盲盒", "驚喜"],
    isAvailable: true,
    description: "共 8 款含隱藏版，收藏樂趣滿點。",
  },

  // ===== 邪氣商店 =====
  {
    id: "spicy_safe_condom_thin",
    section: "spicy",
    storeName: "夜魅實驗室",
    name: "超薄保險套（12 入）",
    price: 350,
    imageUrl: "https://images.unsplash.com/photo-1584515933487-779824d29309?w=800",
    tags: ["成人", "保護", "安全"],
    isAvailable: true,
    description: "重視保護與舒適的基礎款。",
  },
  {
    id: "spicy_safe_condom_delay",
    section: "spicy",
    storeName: "夜魅實驗室",
    name: "持久型保險套（10 入）",
    price: 390,
    imageUrl: "https://images.unsplash.com/photo-1514996550219-62672472d03b?w=800",
    tags: ["成人", "保護", "持久"],
    isAvailable: true,
    description: "加厚環節設計，兼顧安全與耐用。",
  },
  {
    id: "spicy_vibe_egg_silent",
    section: "spicy",
    storeName: "夜魅實驗室",
    name: "靜音跳蛋",
    price: 980,
    imageUrl: "https://images.unsplash.com/photo-1619454016518-697bc231e7cb?w=800",
    tags: ["成人", "情趣", "電動"],
    isAvailable: true,
    description: "多段震動模式，噪音控制良好。",
  },
  {
    id: "spicy_vibe_wand_compact",
    section: "spicy",
    storeName: "午夜研究所",
    name: "口袋魔杖（迷你款）",
    price: 1180,
    imageUrl: "https://images.unsplash.com/photo-1590165482129-1b8b27698780?w=800",
    tags: ["成人", "情趣", "震動"],
    isAvailable: true,
    description: "機身輕巧，USB 充電方便收納。",
  },
  {
    id: "spicy_lube_waterbased_classic",
    section: "spicy",
    storeName: "午夜研究所",
    name: "水性潤滑液 120ml",
    price: 460,
    imageUrl: "https://images.unsplash.com/photo-1582719188393-bb71ca45dbb9?w=800",
    tags: ["成人", "保養", "潤滑"],
    isAvailable: true,
    description: "溫和配方，易清洗、不黏膩。",
  },
  {
    id: "spicy_patch_electric_mini",
    section: "spicy",
    storeName: "暗潮器材舖",
    name: "電擊貼片（輕量版）",
    price: 1280,
    imageUrl: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800",
    tags: ["成人", "器材", "探索"],
    isAvailable: true,
    description: "新手向低強度版本。",
  },
  {
    id: "spicy_patch_electric_pro",
    section: "spicy",
    storeName: "暗潮器材舖",
    name: "電擊貼片（進階版）",
    price: 1890,
    imageUrl: "https://images.unsplash.com/photo-1484704849700-f032a568e944?w=800",
    tags: ["成人", "器材", "進階"],
    isAvailable: true,
    description: "可微調強度曲線，適合熟練玩家。",
  },
  {
    id: "spicy_plug_steel_s",
    section: "spicy",
    storeName: "暗潮器材舖",
    name: "鋼塞 S 號",
    price: 890,
    imageUrl: "https://images.unsplash.com/photo-1616628182509-6f3d2ea2981b?w=800",
    tags: ["成人", "器材", "金屬"],
    isAvailable: true,
    description: "拋光表面，手感細緻。",
  },
  {
    id: "spicy_plug_silicone_set",
    section: "spicy",
    storeName: "暗潮器材舖",
    name: "矽膠尾塞三件組",
    price: 1320,
    imageUrl: "https://images.unsplash.com/photo-1522337660859-02fbefca4702?w=800",
    tags: ["成人", "器材", "矽膠"],
    isAvailable: true,
    description: "由小到大階段練習，材質柔韌。",
  },
  {
    id: "spicy_kit_starter",
    section: "spicy",
    storeName: "午夜研究所",
    name: "情趣入門組",
    price: 1680,
    imageUrl: "https://images.unsplash.com/photo-1515377905703-c4788e51af15?w=800",
    tags: ["成人", "組合", "入門"],
    isAvailable: true,
    description: "基礎配件一次到位。",
  },
  {
    id: "spicy_kit_couple_night",
    section: "spicy",
    storeName: "午夜研究所",
    name: "雙人夜光互動組",
    price: 2280,
    imageUrl: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800",
    tags: ["成人", "組合", "雙人"],
    isAvailable: true,
    description: "含配件與桌遊任務卡，提升互動感。",
  },

  // ===== 美食廣場 =====
  {
    id: "food_steak_ribeye_set",
    section: "food",
    storeName: "炙火牛排館",
    name: "肋眼牛排套餐",
    price: 880,
    imageUrl: "https://images.unsplash.com/photo-1544025162-d76694265947?w=800",
    tags: ["牛排", "主餐", "人氣"],
    isAvailable: true,
    description: "七分熟推薦，含配菜與濃湯。",
  },
  {
    id: "food_steak_chicken_combo",
    section: "food",
    storeName: "炙火牛排館",
    name: "香煎雞排雙拼",
    price: 520,
    imageUrl: "https://images.unsplash.com/photo-1604908176997-431fd4a31f3f?w=800",
    tags: ["排餐", "主餐", "高蛋白"],
    isAvailable: true,
    description: "雞腿排搭季節時蔬，份量剛好。",
  },
  {
    id: "food_hotpot_seafood",
    section: "food",
    storeName: "沸點鍋物",
    name: "海陸雙拼火鍋",
    price: 760,
    imageUrl: "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800",
    tags: ["火鍋", "海鮮", "聚餐"],
    isAvailable: true,
    description: "肉盤+海鮮盤，一次滿足。",
  },
  {
    id: "food_hotpot_beef_miso",
    section: "food",
    storeName: "沸點鍋物",
    name: "味噌雪花牛鍋",
    price: 620,
    imageUrl: "https://images.unsplash.com/photo-1553163147-622ab57be1c7?w=800",
    tags: ["火鍋", "牛肉", "湯底"],
    isAvailable: true,
    description: "味噌湯底濃郁，搭雪花牛更順口。",
  },
  {
    id: "food_rice_curry_pork_cutlet",
    section: "food",
    storeName: "巷口咖哩屋",
    name: "炸豬排咖哩飯",
    price: 240,
    imageUrl: "https://images.unsplash.com/photo-1604908177522-040f69db54b0?w=800",
    tags: ["咖哩", "主食", "炸物"],
    isAvailable: true,
    description: "厚切豬排酥脆，微辣咖哩香氣十足。",
  },
  {
    id: "food_rice_teriyaki_chicken",
    section: "food",
    storeName: "日曜食堂",
    name: "照燒雞腿便當",
    price: 190,
    imageUrl: "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=800",
    tags: ["便當", "日式", "主食"],
    isAvailable: true,
    description: "雞腿肉嫩多汁，配菜均衡。",
  },
  {
    id: "food_noodle_beef_briset",
    section: "food",
    storeName: "老街牛肉麵",
    name: "紅燒半筋半肉牛肉麵",
    price: 260,
    imageUrl: "https://images.unsplash.com/photo-1617093727343-374698b1b08d?w=800",
    tags: ["麵食", "牛肉", "湯麵"],
    isAvailable: true,
    description: "湯頭厚實，肉量充足。",
  },
  {
    id: "food_noodle_sesame_cold",
    section: "food",
    storeName: "巷弄涼麵舖",
    name: "麻醬雞絲涼麵",
    price: 145,
    imageUrl: "https://images.unsplash.com/photo-1617093727343-374698b1b08d?w=800",
    tags: ["麵食", "清爽", "夏季"],
    isAvailable: true,
    description: "麻醬濃郁，搭配小黃瓜更爽口。",
  },
  {
    id: "food_drink_brown_sugar_milk",
    section: "food",
    storeName: "白雲手搖",
    name: "黑糖珍珠鮮奶",
    price: 85,
    imageUrl: "https://images.unsplash.com/photo-1558857563-f4e8d69108f4?w=800",
    tags: ["飲料", "甜", "珍珠"],
    isAvailable: true,
    description: "招牌飲品，冰度甜度可調。",
  },
  {
    id: "food_drink_lemon_green_tea",
    section: "food",
    storeName: "白雲手搖",
    name: "檸檬綠茶",
    price: 70,
    imageUrl: "https://images.unsplash.com/photo-1497534446932-c925b458314e?w=800",
    tags: ["飲料", "清爽", "茶"],
    isAvailable: true,
    description: "酸甜平衡，解膩首選。",
  },
  {
    id: "food_drink_oolong_milk_tea",
    section: "food",
    storeName: "白雲手搖",
    name: "焙火烏龍拿鐵",
    price: 95,
    imageUrl: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=800",
    tags: ["飲料", "奶茶", "茶香"],
    isAvailable: true,
    description: "茶韻濃厚、奶香柔順。",
  },
  {
    id: "food_snack_fried_chicken_bucket",
    section: "food",
    storeName: "脆星炸物",
    name: "卡啦雞腿桶（4 塊）",
    price: 329,
    imageUrl: "https://images.unsplash.com/photo-1562967916-eb82221dfb92?w=800",
    tags: ["炸物", "點心", "分享"],
    isAvailable: true,
    description: "外酥內嫩，聚會必備。",
  },
  {
    id: "food_snack_fries_truffle",
    section: "food",
    storeName: "脆星炸物",
    name: "松露風味薯條",
    price: 139,
    imageUrl: "https://images.unsplash.com/photo-1576107232684-1279f390859f?w=800",
    tags: ["炸物", "薯條", "點心"],
    isAvailable: true,
    description: "灑上帕瑪森起司粉，香氣升級。",
  },
  {
    id: "food_icecream_pistachio",
    section: "food",
    storeName: "雪頂冰淇淋",
    name: "開心果冰淇淋（雙球）",
    price: 150,
    imageUrl: "https://images.unsplash.com/photo-1560008581-09826d1de69e?w=800",
    tags: ["冰淇淋", "甜點", "人氣"],
    isAvailable: true,
    description: "堅果香濃郁，口感綿密。",
  },
  {
    id: "food_icecream_choco_brownie",
    section: "food",
    storeName: "雪頂冰淇淋",
    name: "布朗尼巧克力聖代",
    price: 190,
    imageUrl: "https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=800",
    tags: ["冰淇淋", "巧克力", "甜點"],
    isAvailable: true,
    description: "冰淇淋搭熱布朗尼，口感對比強烈。",
  },
  {
    id: "food_dessert_cheesecake_slice",
    section: "food",
    storeName: "雲朵甜點所",
    name: "重乳酪蛋糕",
    price: 165,
    imageUrl: "https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=800",
    tags: ["甜點", "蛋糕", "下午茶"],
    isAvailable: true,
    description: "乳香濃郁，口感紮實滑順。",
  },
  {
    id: "food_dessert_tiramisu_cup",
    section: "food",
    storeName: "雲朵甜點所",
    name: "提拉米蘇杯",
    price: 145,
    imageUrl: "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=800",
    tags: ["甜點", "咖啡", "人氣"],
    isAvailable: true,
    description: "咖啡酒香與奶霜比例平衡。",
  },
];

export const WAIMAI_CATALOG: WaimaiCatalogItem[] = RAW_WAIMAI_CATALOG.map((item) => ({
  ...item,
  logisticsMeta: SECTION_LOGISTICS_DEFAULTS[item.section],
}));

export function getWaimaiCatalogBySection(
  section: WaimaiMallSection,
): WaimaiCatalogItem[] {
  return WAIMAI_CATALOG.filter((item) => item.section === section);
}

export function getWaimaiCatalogItemById(
  id: string,
): WaimaiCatalogItem | undefined {
  return WAIMAI_CATALOG.find((item) => item.id === id);
}
