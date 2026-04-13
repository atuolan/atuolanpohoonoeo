/**
 * 魚種定義
 *
 * 定義所有可釣到的魚種，分為 5 個等級
 * 等級越高的魚越稀有，價值也越高
 *
 * @requirements 3.3
 */
import type { Rarity } from "@/schemas/gameEconomy";

/** 魚種定義 */
export interface FishType {
  id: string;
  name: string;
  /** 魚的等級 (1-5) */
  tier: number;
  rarity: Rarity;
  /** 基礎價格 */
  basePrice: number;
  /** 最小重量 (公斤) */
  minWeight: number;
  /** 最大重量 (公斤) */
  maxWeight: number;
  /** 每公斤價格 */
  pricePerKg: number;
  /** 魚的描述 */
  description: string;
}

// ===== Tier 1 魚種（新手魚） =====

export const TIER_1_FISH: FishType[] = [
  {
    id: "fish_crucian",
    name: "小鯽魚",
    tier: 1,
    rarity: "common",
    basePrice: 1,
    minWeight: 0.1,
    maxWeight: 0.5,
    pricePerKg: 3,
    description: "最常見的淡水魚，適合新手練習",
  },
  {
    id: "fish_loach",
    name: "泥鰍",
    tier: 1,
    rarity: "common",
    basePrice: 2,
    minWeight: 0.05,
    maxWeight: 0.3,
    pricePerKg: 4,
    description: "喜歡躲在泥巴裡的小魚",
  },
  {
    id: "fish_minnow",
    name: "小蝦米",
    tier: 1,
    rarity: "common",
    basePrice: 1,
    minWeight: 0.01,
    maxWeight: 0.1,
    pricePerKg: 6,
    description: "雖然小但很美味",
  },
  {
    id: "fish_goldfish",
    name: "金魚",
    tier: 1,
    rarity: "common",
    basePrice: 2,
    minWeight: 0.05,
    maxWeight: 0.2,
    pricePerKg: 4,
    description: "觀賞用的小金魚",
  },
];

// ===== Tier 2 魚種（普通魚） =====

export const TIER_2_FISH: FishType[] = [
  {
    id: "fish_carp",
    name: "鯉魚",
    tier: 2,
    rarity: "common",
    basePrice: 4,
    minWeight: 0.5,
    maxWeight: 2,
    pricePerKg: 3,
    description: "常見的大型淡水魚",
  },
  {
    id: "fish_bass",
    name: "鱸魚",
    tier: 2,
    rarity: "common",
    basePrice: 5,
    minWeight: 0.3,
    maxWeight: 1.5,
    pricePerKg: 4,
    description: "肉質鮮美的食用魚",
  },
  {
    id: "fish_catfish",
    name: "鯰魚",
    tier: 2,
    rarity: "common",
    basePrice: 4,
    minWeight: 0.5,
    maxWeight: 3,
    pricePerKg: 2,
    description: "有著長鬍鬚的底棲魚",
  },
  {
    id: "fish_tilapia",
    name: "吳郭魚",
    tier: 2,
    rarity: "common",
    basePrice: 3,
    minWeight: 0.3,
    maxWeight: 1,
    pricePerKg: 3,
    description: "適應力強的養殖魚種",
  },
];

// ===== Tier 3 魚種（稀有魚） =====

export const TIER_3_FISH: FishType[] = [
  {
    id: "fish_salmon",
    name: "鮭魚",
    tier: 3,
    rarity: "uncommon",
    basePrice: 8,
    minWeight: 1,
    maxWeight: 5,
    pricePerKg: 5,
    description: "洄游的美味魚種",
  },
  {
    id: "fish_snapper",
    name: "鯛魚",
    tier: 3,
    rarity: "uncommon",
    basePrice: 10,
    minWeight: 0.8,
    maxWeight: 4,
    pricePerKg: 6,
    description: "高級料理的首選食材",
  },
  {
    id: "fish_trout",
    name: "鱒魚",
    tier: 3,
    rarity: "uncommon",
    basePrice: 9,
    minWeight: 0.5,
    maxWeight: 3,
    pricePerKg: 5,
    description: "清澈溪流中的美麗魚種",
  },
  {
    id: "fish_eel",
    name: "鰻魚",
    tier: 3,
    rarity: "uncommon",
    basePrice: 12,
    minWeight: 0.3,
    maxWeight: 2,
    pricePerKg: 10,
    description: "滑溜溜的高級食材",
  },
];

// ===== Tier 4 魚種（珍稀魚） =====

export const TIER_4_FISH: FishType[] = [
  {
    id: "fish_tuna",
    name: "金槍魚",
    tier: 4,
    rarity: "rare",
    basePrice: 18,
    minWeight: 5,
    maxWeight: 20,
    pricePerKg: 3,
    description: "深海中的速度之王",
  },
  {
    id: "fish_marlin",
    name: "旗魚",
    tier: 4,
    rarity: "rare",
    basePrice: 28,
    minWeight: 10,
    maxWeight: 50,
    pricePerKg: 2,
    description: "擁有長劍般嘴巴的大型魚",
  },
  {
    id: "fish_grouper",
    name: "石斑魚",
    tier: 4,
    rarity: "rare",
    basePrice: 22,
    minWeight: 2,
    maxWeight: 15,
    pricePerKg: 4,
    description: "珊瑚礁中的霸主",
  },
  {
    id: "fish_sturgeon",
    name: "鱘魚",
    tier: 4,
    rarity: "rare",
    basePrice: 32,
    minWeight: 5,
    maxWeight: 30,
    pricePerKg: 2,
    description: "古老的活化石魚種",
  },
];

// ===== Tier 5 魚種（傳說魚） =====

export const TIER_5_FISH: FishType[] = [
  {
    id: "fish_giant",
    name: "傳說巨魚",
    tier: 5,
    rarity: "legendary",
    basePrice: 60,
    minWeight: 50,
    maxWeight: 200,
    pricePerKg: 1,
    description: "傳說中的深海巨獸",
  },
  {
    id: "fish_dragon",
    name: "龍魚",
    tier: 5,
    rarity: "legendary",
    basePrice: 100,
    minWeight: 1,
    maxWeight: 3,
    pricePerKg: 60,
    description: "神秘的東方龍魚，極其珍貴",
  },
  {
    id: "fish_golden_carp",
    name: "金鯉",
    tier: 5,
    rarity: "legendary",
    basePrice: 120,
    minWeight: 2,
    maxWeight: 8,
    pricePerKg: 35,
    description: "傳說中能帶來好運的金色鯉魚",
  },
  {
    id: "fish_moonfish",
    name: "月光魚",
    tier: 5,
    rarity: "legendary",
    basePrice: 180,
    minWeight: 0.5,
    maxWeight: 2,
    pricePerKg: 100,
    description: "只在月圓之夜出現的神秘魚種",
  },
];

// ===== 匯出所有魚種 =====

/** 所有魚種列表 */
export const FISH_TYPES: FishType[] = [
  ...TIER_1_FISH,
  ...TIER_2_FISH,
  ...TIER_3_FISH,
  ...TIER_4_FISH,
  ...TIER_5_FISH,
];

/** 按等級分組的魚種 */
export const FISH_BY_TIER: Record<number, FishType[]> = {
  1: TIER_1_FISH,
  2: TIER_2_FISH,
  3: TIER_3_FISH,
  4: TIER_4_FISH,
  5: TIER_5_FISH,
};

// ===== 輔助函數 =====

/**
 * 根據 ID 取得魚種
 * @param fishId 魚種 ID
 * @returns 魚種資料或 undefined
 */
export function getFishTypeById(fishId: string): FishType | undefined {
  return FISH_TYPES.find((fish) => fish.id === fishId);
}

/**
 * 根據等級取得魚種列表
 * @param tier 魚的等級 (1-5)
 * @returns 該等級的魚種列表
 */
export function getFishTypesByTier(tier: number): FishType[] {
  return FISH_BY_TIER[tier] || [];
}

/**
 * 根據等級範圍取得可釣到的魚種
 * @param minTier 最低等級
 * @param maxTier 最高等級
 * @returns 在等級範圍內的魚種列表
 */
export function getFishTypesInRange(
  minTier: number,
  maxTier: number,
): FishType[] {
  return FISH_TYPES.filter(
    (fish) => fish.tier >= minTier && fish.tier <= maxTier,
  );
}

/**
 * 計算魚的最終價格
 * @param fishType 魚種
 * @param weight 重量（公斤）
 * @returns 最終價格
 */
export function calculateFishPrice(fishType: FishType, weight: number): number {
  return Math.floor(fishType.basePrice + weight * fishType.pricePerKg);
}

/**
 * 根據魚竿等級隨機生成魚的重量
 * @param fishType 魚種
 * @returns 隨機重量（公斤）
 */
export function generateRandomWeight(fishType: FishType): number {
  const range = fishType.maxWeight - fishType.minWeight;
  const weight = fishType.minWeight + Math.random() * range;
  // 保留兩位小數
  return Math.round(weight * 100) / 100;
}

// ===== 垃圾系統 =====

/** 垃圾類型定義 */
export interface TrashType {
  id: string;
  name: string;
  /** 清理費用（從錢包扣除） */
  disposalCost: number;
  /** 描述 */
  description: string;
}

/** 所有垃圾類型 */
export const TRASH_TYPES: TrashType[] = [
  {
    id: "trash_boot",
    name: "破靴子",
    disposalCost: 500,
    description: "一隻發臭的舊靴子，需要花錢清理",
  },
  {
    id: "trash_plastic",
    name: "塑膠袋",
    disposalCost: 300,
    description: "纏在魚鉤上的塑膠袋，真煩人",
  },
  {
    id: "trash_tire",
    name: "廢輪胎",
    disposalCost: 1500,
    description: "沉重的廢棄輪胎，清理費很貴",
  },
  {
    id: "trash_can",
    name: "鏽鐵罐",
    disposalCost: 800,
    description: "銹跡斑斑的空罐頭",
  },
  {
    id: "trash_bottle",
    name: "碎玻璃瓶",
    disposalCost: 1000,
    description: "危險的碎玻璃瓶，必須妥善處理",
  },
  {
    id: "trash_seaweed",
    name: "一團水草",
    disposalCost: 200,
    description: "亂七八糟的水草纏住了魚線",
  },
];

/** 釣到垃圾的最低機率（20%） */
export const TRASH_CATCH_RATE_MIN = 0.20;
/** 釣到垃圾的最高機率（40%） */
export const TRASH_CATCH_RATE_MAX = 0.40;

/**
 * 取得本次釣到垃圾的機率（每次隨機浮動 20%~40%）
 */
export function getTrashCatchRate(): number {
  return TRASH_CATCH_RATE_MIN + Math.random() * (TRASH_CATCH_RATE_MAX - TRASH_CATCH_RATE_MIN);
}

/**
 * 隨機取得一個垃圾
 * @returns 隨機垃圾
 */
export function getRandomTrash(): TrashType {
  return TRASH_TYPES[Math.floor(Math.random() * TRASH_TYPES.length)];
}

/**
 * 根據魚竿等級範圍隨機選擇一種魚
 * @param minTier 最低等級
 * @param maxTier 最高等級
 * @returns 隨機選中的魚種或 undefined
 */
export function getRandomFishType(
  minTier: number,
  maxTier: number,
): FishType | undefined {
  const availableFish = getFishTypesInRange(minTier, maxTier);
  if (availableFish.length === 0) return undefined;

  // 根據稀有度加權隨機
  const weights: Record<Rarity, number> = {
    common: 50,
    uncommon: 30,
    rare: 15,
    epic: 4,
    legendary: 1,
  };

  const totalWeight = availableFish.reduce(
    (sum, fish) => sum + weights[fish.rarity],
    0,
  );
  let random = Math.random() * totalWeight;

  for (const fish of availableFish) {
    random -= weights[fish.rarity];
    if (random <= 0) {
      return fish;
    }
  }

  // 預設回傳第一個
  return availableFish[0];
}
