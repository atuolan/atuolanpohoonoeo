/**
 * Prompt Template Service
 *
 * 使用純 TypeScript 模板函數生成遊戲狀態相關的 AI Prompt
 * 讓 AI 角色能感知玩家的遊戲狀態並做出適當回應
 *
 * @requirements 8.1, 8.2, 8.3, 8.4
 */
import type {
    CaughtFish,
    ChatGameState,
    GiftRecord,
    Rarity,
} from "@/schemas/gameEconomy";

// ===== 類型定義 =====

/** 遊戲狀態模板資料 */
export interface GameStateTemplateData {
  wallet: number;
  recentGifts: GiftRecord[];
  totalFishCaught: number;
  rarestFish: CaughtFish | null;
  recentGamblingResult: {
    won: boolean;
    amount: number;
  } | null;
}

/** 送禮事件模板資料 */
export interface GiftEventTemplateData {
  gift: {
    name: string;
    isLiked?: boolean;
    isDisliked?: boolean;
  };
}

/** 轉帳事件模板資料 */
export interface TransferEventTemplateData {
  amount: number;
}

/** 釣魚成果模板資料 */
export interface FishingResultTemplateData {
  fish: {
    name: string;
    weight: number;
    rarity: Rarity;
  };
}

// ===== 稀有度排序 =====

const RARITY_ORDER: Record<Rarity, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
};

// ===== 模板渲染函數 =====

/** 渲染遊戲狀態文字 */
function renderGameStateText(data: GameStateTemplateData): string {
  const lines: string[] = [`[遊戲狀態]`, `- 玩家目前持有 ${data.wallet} 金幣`];

  if (data.recentGifts.length > 0) {
    lines.push(
      `- 最近送過的禮物：${data.recentGifts.map((g) => g.itemName).join("、")}`,
    );
  }

  if (data.totalFishCaught > 0) {
    lines.push(`- 釣魚成就：已釣過 ${data.totalFishCaught} 條魚`);
    if (data.rarestFish) {
      lines.push(
        `- 最稀有的魚：${data.rarestFish.name}（${data.rarestFish.weight.toFixed(1)} 公斤）`,
      );
    }
  }

  if (data.recentGamblingResult) {
    const result = data.recentGamblingResult.won ? "贏了" : "輸了";
    lines.push(
      `- 最近賭博：${result} ${data.recentGamblingResult.amount} 金幣`,
    );
  }

  return lines.join("\n");
}

/** 渲染送禮事件文字 */
function renderGiftEventText(data: GiftEventTemplateData): string {
  const lines: string[] = [
    `[送禮事件]`,
    `玩家剛剛送了「${data.gift.name}」給你。`,
  ];

  if (data.gift.isLiked) {
    lines.push("這是你喜歡的禮物類型！");
  } else if (data.gift.isDisliked) {
    lines.push("這不是你喜歡的禮物類型。");
  }

  lines.push("請根據角色性格做出適當的反應。");
  return lines.join("\n");
}

/** 渲染轉帳事件文字 */
function renderTransferEventText(data: TransferEventTemplateData): string {
  return [
    `[轉帳事件]`,
    `玩家剛剛轉了 ${data.amount} 金幣給你。`,
    `請根據角色性格做出適當的反應。`,
  ].join("\n");
}

/** 渲染釣魚成果文字 */
function renderFishingResultText(data: FishingResultTemplateData): string {
  const lines: string[] = [
    `[釣魚成果]`,
    `玩家剛剛釣到了一條「${data.fish.name}」！`,
    `- 重量：${data.fish.weight.toFixed(1)} 公斤`,
    `- 稀有度：${data.fish.rarity}`,
  ];

  if (data.fish.rarity === "legendary") {
    lines.push("這是一條傳說級的魚！非常稀有！");
  } else if (data.fish.rarity === "rare" || data.fish.rarity === "epic") {
    lines.push("這是一條稀有的魚！");
  }

  lines.push("請根據角色性格做出適當的反應。");
  return lines.join("\n");
}

// ===== 輔助函數 =====

/**
 * 從遊戲狀態中找出最稀有的魚
 * @param fishInventory 魚簍中的魚
 * @returns 最稀有的魚或 null
 */
function findRarestFish(fishInventory: CaughtFish[]): CaughtFish | null {
  if (fishInventory.length === 0) {
    return null;
  }

  return fishInventory.reduce((rarest, fish) => {
    if (RARITY_ORDER[fish.rarity] > RARITY_ORDER[rarest.rarity]) {
      return fish;
    }
    return rarest;
  }, fishInventory[0]);
}

/**
 * 從遊戲狀態準備模板資料
 * @param state 遊戲狀態
 * @returns 模板資料
 */
export function prepareGameStateTemplateData(
  state: ChatGameState,
): GameStateTemplateData {
  // 取得最近 5 筆送禮記錄
  const recentGifts = state.giftHistory
    .slice()
    .sort((a, b) => b.sentAt - a.sentAt)
    .slice(0, 5);

  // 找出最稀有的魚
  const rarestFish = findRarestFish(state.fishInventory);

  // 取得最近的賭博結果（從交易記錄中找）
  const gamblingTransactions = state.transactions
    .filter((tx) => tx.category === "gambling")
    .sort((a, b) => b.timestamp - a.timestamp);

  let recentGamblingResult: { won: boolean; amount: number } | null = null;
  if (gamblingTransactions.length > 0) {
    const lastGamble = gamblingTransactions[0];
    recentGamblingResult = {
      won: lastGamble.type === "income",
      amount: lastGamble.amount,
    };
  }

  return {
    wallet: state.wallet,
    recentGifts,
    totalFishCaught: state.totalFishCaught,
    rarestFish,
    recentGamblingResult,
  };
}

// ===== 主要服務類別 =====

/**
 * Prompt 模板服務
 * 提供模板渲染功能，用於生成遊戲相關的 AI Prompt
 */
export class PromptTemplateService {
  /**
   * 渲染遊戲狀態 Prompt
   * @param state 遊戲狀態
   * @returns 渲染後的 Prompt 字串，失敗時回傳空字串
   * @requirements 8.1
   */
  renderGameState(state: ChatGameState): string {
    try {
      const data = prepareGameStateTemplateData(state);
      return renderGameStateText(data);
    } catch (error) {
      console.error("[PromptTemplateService] 渲染遊戲狀態失敗:", error);
      return "";
    }
  }

  /**
   * 渲染送禮事件 Prompt
   * @param giftName 禮物名稱
   * @param isLiked 是否為角色喜歡的禮物
   * @param isDisliked 是否為角色不喜歡的禮物
   * @returns 渲染後的 Prompt 字串，失敗時回傳空字串
   * @requirements 8.2
   */
  renderGiftEvent(
    giftName: string,
    isLiked?: boolean,
    isDisliked?: boolean,
  ): string {
    try {
      const data: GiftEventTemplateData = {
        gift: { name: giftName, isLiked, isDisliked },
      };
      return renderGiftEventText(data);
    } catch (error) {
      console.error("[PromptTemplateService] 渲染送禮事件失敗:", error);
      return "";
    }
  }

  /**
   * 渲染轉帳事件 Prompt
   * @param amount 轉帳金額
   * @returns 渲染後的 Prompt 字串，失敗時回傳空字串
   * @requirements 8.2
   */
  renderTransferEvent(amount: number): string {
    try {
      const data: TransferEventTemplateData = { amount };
      return renderTransferEventText(data);
    } catch (error) {
      console.error("[PromptTemplateService] 渲染轉帳事件失敗:", error);
      return "";
    }
  }

  /**
   * 渲染釣魚成果 Prompt
   * @param fish 釣到的魚
   * @returns 渲染後的 Prompt 字串，失敗時回傳空字串
   * @requirements 8.3
   */
  renderFishingResult(fish: CaughtFish): string {
    try {
      const data: FishingResultTemplateData = {
        fish: { name: fish.name, weight: fish.weight, rarity: fish.rarity },
      };
      return renderFishingResultText(data);
    } catch (error) {
      console.error("[PromptTemplateService] 渲染釣魚成果失敗:", error);
      return "";
    }
  }
}

// ===== 單例導出 =====

/** 預設的 PromptTemplateService 實例 */
export const promptTemplateService = new PromptTemplateService();
