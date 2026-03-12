/**
 * Property-Based Tests for Game Economy Zod Schemas
 * Feature: game-economy-system
 *
 * Tests Properties 13 and 14 from the design document
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ChatGameStateSchema, safeParseGameState } from "../gameEconomy";

/**
 * **Feature: game-economy-system, Property 13: Zod 驗證回退**
 *
 * *For any* 無效的遊戲狀態資料，Zod 驗證應失敗並回傳預設狀態
 *
 * **Validates: Requirements 7.2**
 */
describe("Property 13: Zod 驗證回退", () => {
  it("should return default state when parsing invalid data", () => {
    fc.assert(
      fc.property(
        // Generate random invalid data types
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.integer(),
          fc.string(),
          fc.boolean(),
          fc.array(fc.anything()),
        ),
        fc.string({ minLength: 1 }), // chatId for fallback
        (invalidData, chatId) => {
          const result = safeParseGameState(invalidData, chatId);

          // Should return a valid default state
          expect(result.chatId).toBe(chatId);
          expect(result.wallet).toBe(100); // Default wallet
          expect(result.transactions).toEqual([]);
          expect(result.version).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should return default state when wallet is negative", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: -1 }),
        fc.string({ minLength: 1 }),
        (negativeWallet, chatId) => {
          const invalidState = {
            chatId,
            wallet: negativeWallet,
          };

          const result = safeParseGameState(invalidState, chatId);

          // Should return default state since negative wallet is invalid
          expect(result.wallet).toBe(100);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should return default state when required fields have wrong types", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (chatId) => {
        const invalidStates = [
          { chatId, wallet: "not a number" },
          { chatId, transactions: "not an array" },
          { chatId, fishingRods: { invalid: true } },
          { chatId, version: "v1" },
        ];

        for (const invalidState of invalidStates) {
          const result = safeParseGameState(invalidState, chatId);
          // Should return valid default state
          expect(result.chatId).toBe(chatId);
          expect(typeof result.wallet).toBe("number");
          expect(Array.isArray(result.transactions)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("should fail validation for invalid transaction category", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc
          .string({ minLength: 1 })
          .filter(
            (s) =>
              ![
                "work",
                "fishing",
                "gambling",
                "shop",
                "gift",
                "transfer",
                "other",
              ].includes(s),
          ),
        (chatId, invalidCategory) => {
          const invalidState = {
            chatId,
            transactions: [
              {
                id: "tx1",
                type: "income",
                amount: 100,
                category: invalidCategory,
                description: "test",
                timestamp: Date.now(),
              },
            ],
          };

          const result = safeParseGameState(invalidState, chatId);
          // Should return default state with empty transactions
          expect(result.transactions).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should fail validation for fish tier out of range", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.oneof(
          fc.integer({ min: -100, max: 0 }),
          fc.integer({ min: 6, max: 100 }),
        ),
        (chatId, invalidTier) => {
          const invalidState = {
            chatId,
            fishInventory: [
              {
                id: "fish1",
                fishTypeId: "type1",
                name: "Test Fish",
                tier: invalidTier,
                weight: 1.5,
                basePrice: 10,
                finalPrice: 15,
                rarity: "common",
                caughtAt: Date.now(),
              },
            ],
          };

          const result = safeParseGameState(invalidState, chatId);
          // Should return default state with empty fish inventory
          expect(result.fishInventory).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * **Feature: game-economy-system, Property 14: Zod 預設值填充**
 *
 * *For any* 缺少欄位的舊版資料，Zod 應自動填入預設值
 *
 * **Validates: Requirements 7.3**
 */
describe("Property 14: Zod 預設值填充", () => {
  it("should fill default values for missing optional fields", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (chatId) => {
        // Minimal valid state - only chatId
        const minimalState = { chatId };

        const result = ChatGameStateSchema.parse(minimalState);

        // All top-level defaults should be filled
        expect(result.chatId).toBe(chatId);
        expect(result.wallet).toBe(100);
        expect(result.transactions).toEqual([]);
        expect(result.fishingRods).toEqual([]);
        expect(result.equippedRodId).toBeNull();
        expect(result.fishInventory).toEqual([]);
        expect(result.totalFishCaught).toBe(0);
        expect(result.currentIdleSession).toBeNull();
        expect(result.inventory).toEqual([]);
        expect(result.giftHistory).toEqual([]);
        expect(result.version).toBe(1);

        // Nested objects should exist (defaults applied)
        expect(result.workState).toBeDefined();
        expect(result.gamblingStats).toBeDefined();
        expect(result.decorations).toBeDefined();
      }),
      { numRuns: 100 },
    );
  });

  it("should preserve existing values while filling missing defaults", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.integer({ min: 0, max: 10000 }),
        fc.integer({ min: 0, max: 100 }),
        (chatId, wallet, totalFishCaught) => {
          // Partial state with some values
          const partialState = {
            chatId,
            wallet,
            totalFishCaught,
          };

          const result = ChatGameStateSchema.parse(partialState);

          // Provided values should be preserved
          expect(result.chatId).toBe(chatId);
          expect(result.wallet).toBe(wallet);
          expect(result.totalFishCaught).toBe(totalFishCaught);

          // Missing values should have defaults
          expect(result.transactions).toEqual([]);
          expect(result.fishingRods).toEqual([]);
          expect(result.version).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should fill nested object defaults", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.integer({ min: 0, max: 50 }),
        (chatId, dishesWashedToday) => {
          // State with partial nested object
          const partialState = {
            chatId,
            workState: {
              dishesWashedToday,
              // Missing: lastWorkDate, totalDishesWashed
            },
          };

          const result = ChatGameStateSchema.parse(partialState);

          // Provided nested value should be preserved
          expect(result.workState.dishesWashedToday).toBe(dishesWashedToday);

          // Missing nested values should have defaults
          expect(result.workState.lastWorkDate).toBeNull();
          expect(result.workState.totalDishesWashed).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should fill defaults for FishingRod efficiency", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        (chatId, rodId, price, maxDurability, minTier, maxTierOffset) => {
          const maxTier = Math.min(5, minTier + maxTierOffset);

          // Rod without efficiency field
          const partialState = {
            chatId,
            fishingRods: [
              {
                id: rodId,
                name: "Test Rod",
                price,
                durability: maxDurability,
                maxDurability,
                minFishTier: minTier,
                maxFishTier: maxTier,
                // Missing: efficiency
              },
            ],
          };

          const result = ChatGameStateSchema.parse(partialState);

          // Efficiency should default to 1
          expect(result.fishingRods[0].efficiency).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should fill defaults for GamblingStats", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.integer({ min: 0, max: 100 }),
        (chatId, totalWins) => {
          // Partial gambling stats
          const partialState = {
            chatId,
            gamblingStats: {
              totalWins,
              // Missing: totalLosses, todayGambles, lastGambleDate
            },
          };

          const result = ChatGameStateSchema.parse(partialState);

          // Provided value preserved
          expect(result.gamblingStats.totalWins).toBe(totalWins);

          // Missing values filled with defaults
          expect(result.gamblingStats.totalLosses).toBe(0);
          expect(result.gamblingStats.todayGambles).toBe(0);
          expect(result.gamblingStats.lastGambleDate).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should fill defaults for DecorationState", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.array(fc.string({ minLength: 1 }), { minLength: 0, maxLength: 5 }),
        (chatId, ownedFrames) => {
          // Partial decoration state
          const partialState = {
            chatId,
            decorations: {
              ownedFrames,
              // Missing: ownedBubbles, equippedFrameId, equippedBubbleId
            },
          };

          const result = ChatGameStateSchema.parse(partialState);

          // Provided value preserved
          expect(result.decorations.ownedFrames).toEqual(ownedFrames);

          // Missing values filled with defaults
          expect(result.decorations.ownedBubbles).toEqual([]);
          expect(result.decorations.equippedFrameId).toBeNull();
          expect(result.decorations.equippedBubbleId).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});
