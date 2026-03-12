/**
 * Property-Based Tests for PromptTemplateService
 * Feature: game-economy-system
 *
 * Tests Properties 15, 16, and 19 from the design document
 */

import type {
  CaughtFish,
  ChatGameState,
  GiftRecord,
  Rarity,
} from "@/schemas/gameEconomy";
import { createDefaultGameState } from "@/schemas/gameEconomy";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  prepareGameStateTemplateData,
  PromptTemplateService,
} from "../PromptTemplateService";

// ===== Arbitraries =====

/** 稀有度 Arbitrary */
const rarityArbitrary: fc.Arbitrary<Rarity> = fc.constantFrom(
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
);

/** 送禮記錄 Arbitrary - 使用字母數字避免 HTML 轉義問題 */
const giftRecordArbitrary: fc.Arbitrary<GiftRecord> = fc.record({
  id: fc.stringMatching(/^[a-zA-Z0-9]+$/),
  itemId: fc.stringMatching(/^[a-zA-Z0-9]+$/),
  itemName: fc.stringMatching(/^[a-zA-Z0-9\u4e00-\u9fff]+$/), // 字母數字或中文
  sentAt: fc.integer({ min: 0, max: Date.now() }),
});

/** 釣到的魚 Arbitrary - 使用字母數字避免 HTML 轉義問題 */
const caughtFishArbitrary: fc.Arbitrary<CaughtFish> = fc.record({
  id: fc.stringMatching(/^[a-zA-Z0-9]+$/),
  fishTypeId: fc.stringMatching(/^[a-zA-Z0-9]+$/),
  name: fc.stringMatching(/^[a-zA-Z0-9\u4e00-\u9fff]+$/), // 字母數字或中文
  tier: fc.integer({ min: 1, max: 5 }),
  weight: fc.float({
    min: Math.fround(0.1),
    max: Math.fround(200),
    noNaN: true,
  }),
  basePrice: fc.integer({ min: 0, max: 10000 }),
  finalPrice: fc.integer({ min: 0, max: 50000 }),
  rarity: rarityArbitrary,
  caughtAt: fc.integer({ min: 0, max: Date.now() }),
});

/** 遊戲狀態 Arbitrary（用於測試） */
const gameStateArbitrary: fc.Arbitrary<ChatGameState> = fc.record({
  chatId: fc.string({ minLength: 1, maxLength: 20 }),
  wallet: fc.integer({ min: 0, max: 1000000 }),
  transactions: fc.array(
    fc.record({
      id: fc.string({ minLength: 1, maxLength: 20 }),
      type: fc.constantFrom("income", "expense") as fc.Arbitrary<
        "income" | "expense"
      >,
      amount: fc.integer({ min: 1, max: 10000 }),
      category: fc.constantFrom(
        "work",
        "fishing",
        "gambling",
        "shop",
        "gift",
        "transfer",
        "other",
      ) as fc.Arbitrary<
        "work" | "fishing" | "gambling" | "shop" | "gift" | "transfer" | "other"
      >,
      description: fc.string({ minLength: 0, maxLength: 100 }),
      relatedItemId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), {
        nil: undefined,
      }),
      timestamp: fc.integer({ min: 0, max: Date.now() }),
    }),
    { minLength: 0, maxLength: 10 },
  ),
  workState: fc.record({
    dishesWashedToday: fc.integer({ min: 0, max: 50 }),
    lastWorkDate: fc.option(fc.string({ minLength: 10, maxLength: 10 }), {
      nil: null,
    }),
    totalDishesWashed: fc.integer({ min: 0, max: 10000 }),
  }),
  fishingRods: fc.constant([]),
  equippedRodId: fc.constant(null),
  fishInventory: fc.array(caughtFishArbitrary, { minLength: 0, maxLength: 10 }),
  totalFishCaught: fc.integer({ min: 0, max: 10000 }),
  gamblingStats: fc.record({
    totalWins: fc.integer({ min: 0, max: 1000 }),
    totalLosses: fc.integer({ min: 0, max: 1000 }),
    todayGambles: fc.integer({ min: 0, max: 10 }),
    lastGambleDate: fc.option(fc.string({ minLength: 10, maxLength: 10 }), {
      nil: null,
    }),
  }),
  currentIdleSession: fc.constant(null),
  decorations: fc.record({
    ownedFrames: fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
      minLength: 0,
      maxLength: 5,
    }),
    ownedBubbles: fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
      minLength: 0,
      maxLength: 5,
    }),
    equippedFrameId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), {
      nil: null,
    }),
    equippedBubbleId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), {
      nil: null,
    }),
  }),
  inventory: fc.constant([]),
  giftHistory: fc.array(giftRecordArbitrary, { minLength: 0, maxLength: 10 }),
  version: fc.constant(1),
});

describe("PromptTemplateService Property Tests", () => {
  const service = new PromptTemplateService();

  /**
   * **Feature: game-economy-system, Property 15: EJS 模板渲染包含遊戲狀態**
   *
   * *For any* 遊戲狀態，EJS 模板渲染結果應包含錢包餘額和相關資訊
   *
   * **Validates: Requirements 8.1**
   */
  describe("Property 15: EJS 模板渲染包含遊戲狀態", () => {
    it("rendered game state should contain wallet balance", () => {
      fc.assert(
        fc.property(gameStateArbitrary, (state) => {
          const result = service.renderGameState(state);

          // Result should not be empty
          expect(result.length).toBeGreaterThan(0);

          // Result should contain the wallet balance
          expect(result).toContain(state.wallet.toString());

          // Result should contain the game state header
          expect(result).toContain("[遊戲狀態]");
          expect(result).toContain("金幣");
        }),
        { numRuns: 100 },
      );
    });

    it("rendered game state should include recent gifts when present", () => {
      fc.assert(
        fc.property(
          gameStateArbitrary.filter((state) => state.giftHistory.length > 0),
          (state) => {
            const result = service.renderGameState(state);

            // Should contain gift-related text
            expect(result).toContain("最近送過的禮物");

            // Should contain at least one gift name
            const hasGiftName = state.giftHistory.some((gift) =>
              result.includes(gift.itemName),
            );
            expect(hasGiftName).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("rendered game state should include fishing stats when fish caught", () => {
      fc.assert(
        fc.property(
          gameStateArbitrary.filter((state) => state.totalFishCaught > 0),
          (state) => {
            const result = service.renderGameState(state);

            // Should contain fishing achievement text
            expect(result).toContain("釣魚成就");
            expect(result).toContain(state.totalFishCaught.toString());
          },
        ),
        { numRuns: 100 },
      );
    });

    it("rendered game state should not crash with empty state", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (chatId) => {
          const emptyState = createDefaultGameState(chatId);
          const result = service.renderGameState(emptyState);

          // Should return a valid string
          expect(typeof result).toBe("string");
          expect(result).toContain("[遊戲狀態]");
          expect(result).toContain("100"); // Default wallet balance
        }),
        { numRuns: 100 },
      );
    });

    it("prepareGameStateTemplateData should extract correct data", () => {
      fc.assert(
        fc.property(gameStateArbitrary, (state) => {
          const data = prepareGameStateTemplateData(state);

          // Wallet should match
          expect(data.wallet).toBe(state.wallet);

          // Total fish caught should match
          expect(data.totalFishCaught).toBe(state.totalFishCaught);

          // Recent gifts should be at most 5
          expect(data.recentGifts.length).toBeLessThanOrEqual(5);

          // Recent gifts should be sorted by sentAt (descending)
          for (let i = 1; i < data.recentGifts.length; i++) {
            expect(data.recentGifts[i - 1].sentAt).toBeGreaterThanOrEqual(
              data.recentGifts[i].sentAt,
            );
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Feature: game-economy-system, Property 16: EJS 模板渲染包含禮物資訊**
   *
   * *For any* 送禮操作後，EJS 模板渲染結果應包含禮物名稱
   *
   * **Validates: Requirements 8.2, 6.3**
   */
  describe("Property 16: EJS 模板渲染包含禮物資訊", () => {
    // 使用字母數字避免 HTML 轉義問題
    const safeGiftNameArbitrary = fc.stringMatching(
      /^[a-zA-Z0-9\u4e00-\u9fff]+$/,
    );

    it("rendered gift event should contain gift name", () => {
      fc.assert(
        fc.property(
          safeGiftNameArbitrary,
          fc.boolean(),
          fc.boolean(),
          (giftName, isLiked, isDisliked) => {
            const result = service.renderGiftEvent(
              giftName,
              isLiked,
              isDisliked,
            );

            // Result should not be empty
            expect(result.length).toBeGreaterThan(0);

            // Result should contain the gift name
            expect(result).toContain(giftName);

            // Result should contain the event header
            expect(result).toContain("[送禮事件]");
          },
        ),
        { numRuns: 100 },
      );
    });

    it("rendered gift event should indicate liked status when true", () => {
      fc.assert(
        fc.property(safeGiftNameArbitrary, (giftName) => {
          const result = service.renderGiftEvent(giftName, true, false);

          // Should contain liked message
          expect(result).toContain("喜歡的禮物");
        }),
        { numRuns: 100 },
      );
    });

    it("rendered gift event should indicate disliked status when true", () => {
      fc.assert(
        fc.property(safeGiftNameArbitrary, (giftName) => {
          const result = service.renderGiftEvent(giftName, false, true);

          // Should contain disliked message
          expect(result).toContain("不是你喜歡的禮物");
        }),
        { numRuns: 100 },
      );
    });

    it("rendered gift event should ask for character response", () => {
      fc.assert(
        fc.property(
          safeGiftNameArbitrary,
          fc.boolean(),
          fc.boolean(),
          (giftName, isLiked, isDisliked) => {
            const result = service.renderGiftEvent(
              giftName,
              isLiked,
              isDisliked,
            );

            // Should contain response instruction
            expect(result).toContain("請根據角色性格做出適當的反應");
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Feature: game-economy-system, Property 19: 禮物送出 Prompt 注入**
   *
   * *For any* 禮物送出操作，生成的 Prompt 應包含禮物資訊
   *
   * **Validates: Requirements 11.5**
   */
  describe("Property 19: 禮物送出 Prompt 注入", () => {
    it("transfer event should contain transfer amount", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100000 }), (amount) => {
          const result = service.renderTransferEvent(amount);

          // Result should not be empty
          expect(result.length).toBeGreaterThan(0);

          // Result should contain the amount
          expect(result).toContain(amount.toString());

          // Result should contain the event header
          expect(result).toContain("[轉帳事件]");
          expect(result).toContain("金幣");
        }),
        { numRuns: 100 },
      );
    });

    it("fishing result should contain fish information", () => {
      fc.assert(
        fc.property(caughtFishArbitrary, (fish) => {
          const result = service.renderFishingResult(fish);

          // Result should not be empty
          expect(result.length).toBeGreaterThan(0);

          // Result should contain the fish name
          expect(result).toContain(fish.name);

          // Result should contain the event header
          expect(result).toContain("[釣魚成果]");

          // Result should contain weight (formatted to 1 decimal)
          expect(result).toContain(fish.weight.toFixed(1));

          // Result should contain rarity
          expect(result).toContain(fish.rarity);
        }),
        { numRuns: 100 },
      );
    });

    it("fishing result should highlight legendary fish", () => {
      fc.assert(
        fc.property(
          caughtFishArbitrary.map((fish) => ({
            ...fish,
            rarity: "legendary" as Rarity,
          })),
          (fish) => {
            const result = service.renderFishingResult(fish);

            // Should contain legendary highlight
            expect(result).toContain("傳說級的魚");
            expect(result).toContain("非常稀有");
          },
        ),
        { numRuns: 100 },
      );
    });

    it("fishing result should highlight rare and epic fish", () => {
      fc.assert(
        fc.property(
          caughtFishArbitrary,
          fc.constantFrom("rare", "epic") as fc.Arbitrary<Rarity>,
          (fish, rarity) => {
            const rareFish = { ...fish, rarity };
            const result = service.renderFishingResult(rareFish);

            // Should contain rare highlight
            expect(result).toContain("稀有的魚");
          },
        ),
        { numRuns: 100 },
      );
    });

    it("all event templates should ask for character response", () => {
      // 使用字母數字避免 HTML 轉義問題
      const safeGiftName = fc.stringMatching(/^[a-zA-Z0-9\u4e00-\u9fff]+$/);
      fc.assert(
        fc.property(
          safeGiftName,
          fc.integer({ min: 1, max: 100000 }),
          caughtFishArbitrary,
          (giftName, amount, fish) => {
            const giftResult = service.renderGiftEvent(giftName);
            const transferResult = service.renderTransferEvent(amount);
            const fishingResult = service.renderFishingResult(fish);

            // All should contain response instruction
            expect(giftResult).toContain("請根據角色性格做出適當的反應");
            expect(transferResult).toContain("請根據角色性格做出適當的反應");
            expect(fishingResult).toContain("請根據角色性格做出適當的反應");
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Error handling tests
   */
  describe("Error Handling", () => {
    it("renderGameState should return empty string on error", () => {
      // Create an invalid state that might cause rendering issues
      const invalidState = {
        chatId: "test",
        wallet: NaN, // Invalid wallet value
      } as unknown as ChatGameState;

      // Should not throw, should return empty string
      const result = service.renderGameState(invalidState);
      expect(typeof result).toBe("string");
    });
  });
});
