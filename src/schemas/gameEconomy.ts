/**
 * 遊戲經濟系統 Zod Schemas
 * 使用 Zod 進行 runtime 資料驗證，確保資料格式正確並支援版本遷移
 *
 * @requirements 7.1, 7.3, 7.4
 */
import { z } from "zod";

// ===== 基礎枚舉 =====

/** 稀有度枚舉 */
export const RaritySchema = z.enum([
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
]);

/** 交易類型枚舉 */
export const TransactionTypeSchema = z.enum(["income", "expense"]);

/** 交易分類枚舉 */
export const TransactionCategorySchema = z.enum([
  "work",
  "fishing",
  "gambling",
  "shop",
  "gift",
  "transfer",
  "other",
]);

/** 物品類型枚舉 */
export const ItemTypeSchema = z.enum(["gift", "consumable", "equipment"]);

/** 掛機類型枚舉 */
export const IdleTypeSchema = z.enum(["fishing"]);

// ===== 交易記錄 =====

/** 交易記錄 Schema */
export const TransactionSchema = z.object({
  id: z.string(),
  type: TransactionTypeSchema,
  amount: z.number().min(0),
  category: TransactionCategorySchema,
  description: z.string(),
  relatedItemId: z.string().optional(),
  timestamp: z.number(),
});

// ===== 釣魚相關 =====

/** 魚竿 Schema - 使用 preprocess 來處理舊資料中的 null 值 */
export const FishingRodSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number().min(0),
  durability: z.preprocess(
    (val) => (val === null || val === undefined ? 0 : val),
    z.number().min(0),
  ),
  maxDurability: z.number().positive(),
  minFishTier: z.number().min(1).max(5),
  maxFishTier: z.number().min(1).max(5),
  efficiency: z.number().positive().default(1),
});

/** 釣到的魚 Schema */
export const CaughtFishSchema = z.object({
  id: z.string(),
  fishTypeId: z.string(),
  name: z.string(),
  tier: z.number().min(1).max(5),
  weight: z.number().positive(),
  basePrice: z.number().min(0),
  finalPrice: z.number().min(0),
  rarity: RaritySchema,
  caughtAt: z.number(),
});

// ===== 掛機系統 =====

/** 掛機工作階段 Schema */
export const IdleSessionSchema = z.object({
  type: IdleTypeSchema,
  startTime: z.number(),
  maxDuration: z.number().positive(),
  rodId: z.string(),
  efficiency: z.number().positive().default(1),
});

// ===== 背包系統 =====

/** 背包物品 Schema */
export const InventoryItemSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  name: z.string(),
  type: ItemTypeSchema,
  quantity: z.number().positive(),
  acquiredAt: z.number(),
});

// ===== 送禮記錄 =====

/** 送禮記錄 Schema */
export const GiftRecordSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  itemName: z.string(),
  sentAt: z.number(),
});

// ===== 打工狀態 =====

/** 打工狀態 Schema */
export const WorkStateSchema = z.object({
  dishesWashedToday: z.number().min(0).default(0),
  lastWorkDate: z.string().nullable().default(null),
  totalDishesWashed: z
    .union([z.number(), z.null()])
    .transform((val) => (val === null || val === undefined || Number.isNaN(val)) ? 0 : val)
    .pipe(z.number().min(0))
    .default(0),
});

// ===== 賭博統計 =====

/** 賭博統計 Schema */
export const GamblingStatsSchema = z.object({
  totalWins: z.number().min(0).default(0),
  totalLosses: z.number().min(0).default(0),
  todayGambles: z.number().min(0).default(0),
  lastGambleDate: z.string().nullable().default(null),
});

// ===== 裝飾品狀態 =====

/** 裝飾品狀態 Schema */
export const DecorationStateSchema = z.object({
  ownedFrames: z.array(z.string()).default([]),
  ownedBubbles: z.array(z.string()).default([]),
  equippedFrameId: z.string().nullable().default(null),
  equippedBubbleId: z.string().nullable().default(null),
});

// ===== 完整遊戲狀態 =====

/** 完整遊戲狀態 Schema（每個聊天獨立） */
export const ChatGameStateSchema = z.object({
  chatId: z.string(),
  wallet: z.preprocess(
    (val) => (typeof val === "number" && val < 0 ? 0 : val),
    z.number().min(0).default(100),
  ),

  transactions: z.array(TransactionSchema).default([]),

  // 打工
  workState: WorkStateSchema.default({}),

  // 釣魚
  fishingRods: z.array(FishingRodSchema).default([]),
  equippedRodId: z.string().nullable().default(null),
  fishInventory: z.array(CaughtFishSchema).default([]),
  totalFishCaught: z.number().min(0).default(0),

  // 賭博
  gamblingStats: GamblingStatsSchema.default({}),

  // 掛機
  currentIdleSession: IdleSessionSchema.nullable().default(null),

  // 裝飾
  decorations: DecorationStateSchema.default({}),

  // 背包
  inventory: z.array(InventoryItemSchema).default([]),

  // 送禮記錄
  giftHistory: z.array(GiftRecordSchema).default([]),

  // 版本（用於資料遷移）
  version: z.number().default(1),
});

// ===== TypeScript 型別推導 =====

export type Rarity = z.infer<typeof RaritySchema>;
export type TransactionType = z.infer<typeof TransactionTypeSchema>;
export type TransactionCategory = z.infer<typeof TransactionCategorySchema>;
export type ItemType = z.infer<typeof ItemTypeSchema>;
export type IdleType = z.infer<typeof IdleTypeSchema>;

export type Transaction = z.infer<typeof TransactionSchema>;
export type FishingRod = z.infer<typeof FishingRodSchema>;
export type CaughtFish = z.infer<typeof CaughtFishSchema>;
export type IdleSession = z.infer<typeof IdleSessionSchema>;
export type InventoryItem = z.infer<typeof InventoryItemSchema>;
export type GiftRecord = z.infer<typeof GiftRecordSchema>;
export type WorkState = z.infer<typeof WorkStateSchema>;
export type GamblingStats = z.infer<typeof GamblingStatsSchema>;
export type DecorationState = z.infer<typeof DecorationStateSchema>;
export type ChatGameState = z.infer<typeof ChatGameStateSchema>;

// ===== 輔助函數 =====

/**
 * 建立預設遊戲狀態
 * @param chatId 聊天 ID
 * @returns 預設的遊戲狀態
 */
export function createDefaultGameState(chatId: string): ChatGameState {
  return ChatGameStateSchema.parse({ chatId });
}

/**
 * 安全解析遊戲狀態，失敗時嘗試部分恢復而非完全重置
 * @param data 原始資料
 * @param chatId 聊天 ID（用於建立預設狀態）
 * @returns 解析後的遊戲狀態或盡可能恢復的狀態
 */
export function safeParseGameState(
  data: unknown,
  chatId: string,
): ChatGameState {
  const result = ChatGameStateSchema.safeParse(data);
  if (result.success) {
    return result.data;
  }

  console.warn("[GameEconomy] Zod 驗證失敗，嘗試部分恢復:", result.error);

  // 嘗試部分恢復：用預設值填充失敗的欄位，但保留能解析的資料
  if (data && typeof data === "object") {
    const raw = data as Record<string, unknown>;
    const defaults = createDefaultGameState(chatId);

    try {
      // 逐欄位嘗試恢復
      const recovered: ChatGameState = {
        ...defaults,
        chatId,
      };

      // 恢復錢包（最重要的欄位）
      if (typeof raw.wallet === "number" && !Number.isNaN(raw.wallet)) {
        recovered.wallet = Math.max(0, raw.wallet);
      }

      // 恢復交易記錄（過濾掉無效的）
      if (Array.isArray(raw.transactions)) {
        const validTransactions: Transaction[] = [];
        for (const tx of raw.transactions) {
          const txResult = TransactionSchema.safeParse(tx);
          if (txResult.success) {
            validTransactions.push(txResult.data);
          }
        }
        recovered.transactions = validTransactions;
      }

      // 恢復裝飾品狀態
      if (raw.decorations && typeof raw.decorations === "object") {
        const decResult = DecorationStateSchema.safeParse(raw.decorations);
        if (decResult.success) {
          recovered.decorations = decResult.data;
        }
      }

      // 恢復背包
      if (Array.isArray(raw.inventory)) {
        const validItems: InventoryItem[] = [];
        for (const item of raw.inventory) {
          const itemResult = InventoryItemSchema.safeParse(item);
          if (itemResult.success) {
            validItems.push(itemResult.data);
          }
        }
        recovered.inventory = validItems;
      }

      // 恢復魚竿
      if (Array.isArray(raw.fishingRods)) {
        const validRods: FishingRod[] = [];
        for (const rod of raw.fishingRods) {
          const rodResult = FishingRodSchema.safeParse(rod);
          if (rodResult.success) {
            validRods.push(rodResult.data);
          }
        }
        recovered.fishingRods = validRods;
      }

      // 恢復裝備的魚竿 ID
      if (typeof raw.equippedRodId === "string" || raw.equippedRodId === null) {
        recovered.equippedRodId = raw.equippedRodId as string | null;
      }

      // 恢復魚簍
      if (Array.isArray(raw.fishInventory)) {
        const validFish: CaughtFish[] = [];
        for (const fish of raw.fishInventory) {
          const fishResult = CaughtFishSchema.safeParse(fish);
          if (fishResult.success) {
            validFish.push(fishResult.data);
          }
        }
        recovered.fishInventory = validFish;
      }

      // 恢復釣魚統計
      if (typeof raw.totalFishCaught === "number" && !Number.isNaN(raw.totalFishCaught)) {
        recovered.totalFishCaught = Math.max(0, raw.totalFishCaught);
      }

      // 恢復打工狀態
      if (raw.workState && typeof raw.workState === "object") {
        const wsResult = WorkStateSchema.safeParse(raw.workState);
        if (wsResult.success) {
          recovered.workState = wsResult.data;
        }
      }

      // 恢復賭博統計
      if (raw.gamblingStats && typeof raw.gamblingStats === "object") {
        const gsResult = GamblingStatsSchema.safeParse(raw.gamblingStats);
        if (gsResult.success) {
          recovered.gamblingStats = gsResult.data;
        }
      }

      // 恢復掛機狀態
      if (raw.currentIdleSession && typeof raw.currentIdleSession === "object") {
        const isResult = IdleSessionSchema.safeParse(raw.currentIdleSession);
        if (isResult.success) {
          recovered.currentIdleSession = isResult.data;
        }
      }

      // 恢復送禮記錄
      if (Array.isArray(raw.giftHistory)) {
        const validGifts: GiftRecord[] = [];
        for (const gift of raw.giftHistory) {
          const giftResult = GiftRecordSchema.safeParse(gift);
          if (giftResult.success) {
            validGifts.push(giftResult.data);
          }
        }
        recovered.giftHistory = validGifts;
      }

      console.log("[GameEconomy] 部分恢復成功，錢包:", recovered.wallet,
        "交易數:", recovered.transactions.length,
        "裝飾品:", recovered.decorations.ownedFrames.length, "框 +", recovered.decorations.ownedBubbles.length, "泡");

      return recovered;
    } catch (recoverError) {
      console.error("[GameEconomy] 部分恢復也失敗:", recoverError);
    }
  }

  return createDefaultGameState(chatId);
}
