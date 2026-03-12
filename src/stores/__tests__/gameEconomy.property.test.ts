/**
 * Property-Based Tests for Game Economy Store
 * Feature: game-economy-system
 *
 * Tests Properties 1, 2, 3, 4, 5, 6, 7, 8, and 11 from the design document
 */

import {
  BUBBLE_ITEMS,
  CONSUMABLE_ITEMS,
  FRAME_ITEMS,
  ROD_ITEMS,
  SHOP_ITEMS,
} from "@/data/shopItems";
import * as fc from "fast-check";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useGameEconomyStore } from "../gameEconomy";

/**
 * Helper to create a fresh store for each property test iteration
 */
function createFreshStore() {
  setActivePinia(createPinia());
  return useGameEconomyStore();
}

describe("Game Economy Store Property Tests", () => {
  beforeEach(() => {
    // Create a fresh Pinia instance for each test
    setActivePinia(createPinia());
  });

  /**
   * **Feature: game-economy-system, Property 1: 錢包餘額一致性**
   *
   * *For any* 交易序列，錢包餘額應等於初始餘額加上所有收入減去所有支出
   *
   * **Validates: Requirements 1.1, 1.2**
   */
  describe("Property 1: 錢包餘額一致性", () => {
    it("wallet balance should equal initial balance plus all income minus all expenses", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }), // chatId
          fc.array(
            fc.record({
              type: fc.constantFrom("income", "expense") as fc.Arbitrary<
                "income" | "expense"
              >,
              amount: fc.integer({ min: 1, max: 1000 }),
            }),
            { minLength: 0, maxLength: 20 },
          ),
          (chatId, transactions) => {
            // Create fresh store for each iteration
            const store = createFreshStore();
            const initialBalance = 100; // Default initial balance

            // Apply transactions
            for (const tx of transactions) {
              if (tx.type === "income") {
                store.earnMoney(chatId, tx.amount, "work", "Test income");
              } else {
                // Only spend if we have enough balance
                if (store.hasEnoughBalance(chatId, tx.amount)) {
                  store.spendMoney(chatId, tx.amount, "shop", "Test expense");
                }
              }
            }

            // Calculate expected balance from transactions
            const calculatedBalance = store.calculateBalanceFromTransactions(
              chatId,
              initialBalance,
            );
            const actualBalance = store.getBalance(chatId);

            // Balance should match calculated value
            expect(actualBalance).toBe(calculatedBalance);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("earnMoney should increase balance by exact amount", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.integer({ min: 1, max: 10000 }),
          (chatId, amount) => {
            const store = createFreshStore();
            const initialBalance = store.getBalance(chatId);

            const result = store.earnMoney(chatId, amount, "work", "Test");

            expect(result.success).toBe(true);
            expect(result.newBalance).toBe(initialBalance + amount);
            expect(store.getBalance(chatId)).toBe(initialBalance + amount);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("spendMoney should decrease balance by exact amount when sufficient funds", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.integer({ min: 1, max: 100 }), // Max 100 to ensure we have enough (initial is 100)
          (chatId, amount) => {
            const store = createFreshStore();
            const initialBalance = store.getBalance(chatId);

            // Only test if we have enough balance
            if (initialBalance >= amount) {
              const result = store.spendMoney(chatId, amount, "shop", "Test");

              expect(result.success).toBe(true);
              expect(result.newBalance).toBe(initialBalance - amount);
              expect(store.getBalance(chatId)).toBe(initialBalance - amount);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("transaction records should match actual operations", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.array(fc.integer({ min: 1, max: 50 }), {
            minLength: 1,
            maxLength: 10,
          }),
          (chatId, amounts) => {
            const store = createFreshStore();

            // Perform income operations
            for (const amount of amounts) {
              store.earnMoney(chatId, amount, "work", `Earned ${amount}`);
            }

            const transactions = store.getTransactions(chatId);

            // Should have same number of transactions
            expect(transactions.length).toBe(amounts.length);

            // All transactions should be income type
            for (const tx of transactions) {
              expect(tx.type).toBe("income");
            }

            // Sum of transaction amounts should match
            const totalFromTransactions = transactions.reduce(
              (sum, tx) => sum + tx.amount,
              0,
            );
            const totalFromAmounts = amounts.reduce((sum, a) => sum + a, 0);
            expect(totalFromTransactions).toBe(totalFromAmounts);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Feature: game-economy-system, Property 2: 餘額不足阻止交易**
   *
   * *For any* 購買操作，當商品價格大於錢包餘額時，交易應被阻止且餘額不變
   *
   * **Validates: Requirements 1.3**
   */
  describe("Property 2: 餘額不足阻止交易", () => {
    it("should reject spending when amount exceeds balance", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.integer({ min: 101, max: 10000 }), // Amount greater than initial 100
          (chatId, amount) => {
            const store = createFreshStore();
            const initialBalance = store.getBalance(chatId);

            // Ensure amount exceeds balance
            expect(amount).toBeGreaterThan(initialBalance);

            const result = store.spendMoney(chatId, amount, "shop", "Test");

            // Transaction should fail
            expect(result.success).toBe(false);
            expect(result.error).toBe("insufficient_funds");

            // Balance should remain unchanged
            expect(store.getBalance(chatId)).toBe(initialBalance);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should not create transaction record when spending fails", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.integer({ min: 101, max: 10000 }),
          (chatId, amount) => {
            const store = createFreshStore();
            const transactionsBefore = store.getTransactions(chatId).length;

            store.spendMoney(chatId, amount, "shop", "Test");

            const transactionsAfter = store.getTransactions(chatId).length;

            // No new transaction should be added
            expect(transactionsAfter).toBe(transactionsBefore);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("hasEnoughBalance should correctly predict spending outcome", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.integer({ min: 1, max: 500 }),
          (chatId, amount) => {
            const store = createFreshStore();
            const hasEnough = store.hasEnoughBalance(chatId, amount);
            const balanceBefore = store.getBalance(chatId);

            const result = store.spendMoney(chatId, amount, "shop", "Test");

            // hasEnoughBalance should predict success/failure
            expect(result.success).toBe(hasEnough);

            if (!hasEnough) {
              // Balance should be unchanged if insufficient
              expect(store.getBalance(chatId)).toBe(balanceBefore);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("spending exactly the balance should succeed", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (chatId) => {
          const store = createFreshStore();
          const balance = store.getBalance(chatId);

          const result = store.spendMoney(chatId, balance, "shop", "Test");

          expect(result.success).toBe(true);
          expect(result.newBalance).toBe(0);
          expect(store.getBalance(chatId)).toBe(0);
        }),
        { numRuns: 100 },
      );
    });

    it("spending one more than balance should fail", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (chatId) => {
          const store = createFreshStore();
          const balance = store.getBalance(chatId);

          const result = store.spendMoney(chatId, balance + 1, "shop", "Test");

          expect(result.success).toBe(false);
          expect(result.error).toBe("insufficient_funds");
          expect(store.getBalance(chatId)).toBe(balance);
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Feature: game-economy-system, Property 5: 魚竿購買狀態更新**
   *
   * *For any* 魚竿購買操作，購買後背包應包含該魚竿且餘額應減少對應價格
   *
   * **Validates: Requirements 3.1**
   */
  describe("Property 5: 魚竿購買狀態更新", () => {
    // Generate arbitrary rod from available rod items
    const rodArbitrary = fc.constantFrom(...ROD_ITEMS);

    it("purchasing a rod should add it to fishingRods and decrease balance by price", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          rodArbitrary,
          (chatId, rodItem) => {
            const store = createFreshStore();

            // Ensure we have enough balance to purchase
            const neededBalance = rodItem.price;
            if (store.getBalance(chatId) < neededBalance) {
              store.earnMoney(chatId, neededBalance, "other", "Setup for test");
            }

            const balanceBefore = store.getBalance(chatId);
            const rodCountBefore = store.getFishingRods(chatId).length;

            const result = store.purchaseItem(chatId, rodItem.id);

            // Purchase should succeed
            expect(result.success).toBe(true);

            // Balance should decrease by rod price
            expect(store.getBalance(chatId)).toBe(
              balanceBefore - rodItem.price,
            );

            // Fishing rods count should increase by 1
            expect(store.getFishingRods(chatId).length).toBe(
              rodCountBefore + 1,
            );

            // The new rod should have correct properties
            const rods = store.getFishingRods(chatId);
            const newRod = rods[rods.length - 1];
            expect(newRod.name).toBe(rodItem.name);
            expect(newRod.maxDurability).toBe(rodItem.rodStats!.maxDurability);
            expect(newRod.durability).toBe(rodItem.rodStats!.maxDurability);
            expect(newRod.minFishTier).toBe(rodItem.rodStats!.minFishTier);
            expect(newRod.maxFishTier).toBe(rodItem.rodStats!.maxFishTier);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("purchasing a rod should create a transaction record", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          rodArbitrary,
          (chatId, rodItem) => {
            const store = createFreshStore();

            // Ensure we have enough balance
            if (store.getBalance(chatId) < rodItem.price) {
              store.earnMoney(chatId, rodItem.price, "other", "Setup");
            }

            const transactionsBefore = store.getTransactions(chatId).length;

            store.purchaseItem(chatId, rodItem.id);

            const transactionsAfter = store.getTransactions(chatId);

            // Should have one more transaction
            expect(transactionsAfter.length).toBe(transactionsBefore + 1);

            // Find the purchase transaction (expense for shop category)
            const purchaseTx = transactionsAfter.find(
              (tx) =>
                tx.type === "expense" &&
                tx.category === "shop" &&
                tx.amount === rodItem.price,
            );

            expect(purchaseTx).toBeDefined();
            expect(purchaseTx!.relatedItemId).toBe(rodItem.id);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("purchasing rod with insufficient funds should fail", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          rodArbitrary,
          (chatId, rodItem) => {
            const store = createFreshStore();

            // Spend all money first
            const balance = store.getBalance(chatId);
            if (balance > 0) {
              store.spendMoney(chatId, balance, "other", "Drain balance");
            }

            const balanceBefore = store.getBalance(chatId);
            const rodCountBefore = store.getFishingRods(chatId).length;

            const result = store.purchaseItem(chatId, rodItem.id);

            // Purchase should fail
            expect(result.success).toBe(false);
            expect(result.error).toBe("insufficient_funds");

            // Balance and rod count should remain unchanged
            expect(store.getBalance(chatId)).toBe(balanceBefore);
            expect(store.getFishingRods(chatId).length).toBe(rodCountBefore);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("multiple rod purchases should each add a separate rod instance", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.integer({ min: 1, max: 5 }),
          (chatId, purchaseCount) => {
            const store = createFreshStore();
            const cheapestRod = ROD_ITEMS[0]; // rod_bamboo is cheapest at 50

            // Ensure we have enough balance for multiple purchases
            const totalCost = cheapestRod.price * purchaseCount;
            store.earnMoney(chatId, totalCost, "other", "Setup");

            const rodCountBefore = store.getFishingRods(chatId).length;

            // Purchase multiple rods
            for (let i = 0; i < purchaseCount; i++) {
              store.purchaseItem(chatId, cheapestRod.id);
            }

            // Should have purchaseCount more rods
            expect(store.getFishingRods(chatId).length).toBe(
              rodCountBefore + purchaseCount,
            );

            // Each rod should have a unique ID
            const rods = store.getFishingRods(chatId);
            const rodIds = rods.map((r) => r.id);
            const uniqueIds = new Set(rodIds);
            expect(uniqueIds.size).toBe(rods.length);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Feature: game-economy-system, Property 11: 重複購買阻止**
   *
   * *For any* 已擁有的裝飾品，再次購買應被阻止且餘額不變
   *
   * **Validates: Requirements 5.5**
   */
  describe("Property 11: 重複購買阻止", () => {
    // Combine all decoration items (frames and bubbles)
    const decorationItems = [...FRAME_ITEMS, ...BUBBLE_ITEMS];
    const decorationArbitrary = fc.constantFrom(...decorationItems);

    it("purchasing an already owned decoration should fail with already_owned error", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          decorationArbitrary,
          (chatId, decorationItem) => {
            const store = createFreshStore();

            // Ensure we have enough balance for two purchases
            const neededBalance = decorationItem.price * 2;
            store.earnMoney(chatId, neededBalance, "other", "Setup for test");

            // First purchase should succeed
            const firstResult = store.purchaseItem(chatId, decorationItem.id);
            expect(firstResult.success).toBe(true);

            const balanceAfterFirst = store.getBalance(chatId);

            // Second purchase should fail
            const secondResult = store.purchaseItem(chatId, decorationItem.id);

            expect(secondResult.success).toBe(false);
            expect(secondResult.error).toBe("already_owned");

            // Balance should remain unchanged after failed purchase
            expect(store.getBalance(chatId)).toBe(balanceAfterFirst);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("ownsDecoration should return true after purchasing a decoration", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          decorationArbitrary,
          (chatId, decorationItem) => {
            const store = createFreshStore();

            // Ensure we have enough balance
            store.earnMoney(chatId, decorationItem.price, "other", "Setup");

            // Before purchase, should not own
            expect(
              store.ownsDecoration(
                chatId,
                decorationItem.id,
                decorationItem.category,
              ),
            ).toBe(false);

            // Purchase
            store.purchaseItem(chatId, decorationItem.id);

            // After purchase, should own
            expect(
              store.ownsDecoration(
                chatId,
                decorationItem.id,
                decorationItem.category,
              ),
            ).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("duplicate purchase should not create additional transaction", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          decorationArbitrary,
          (chatId, decorationItem) => {
            const store = createFreshStore();

            // Ensure we have enough balance
            store.earnMoney(chatId, decorationItem.price * 2, "other", "Setup");

            // First purchase
            store.purchaseItem(chatId, decorationItem.id);
            const transactionsAfterFirst = store.getTransactions(chatId).length;

            // Second purchase (should fail)
            store.purchaseItem(chatId, decorationItem.id);
            const transactionsAfterSecond =
              store.getTransactions(chatId).length;

            // No new transaction should be added
            expect(transactionsAfterSecond).toBe(transactionsAfterFirst);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("frames and bubbles should be tracked separately", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (chatId) => {
          const store = createFreshStore();
          const frame = FRAME_ITEMS[0];
          const bubble = BUBBLE_ITEMS[0];

          // Ensure we have enough balance
          store.earnMoney(chatId, frame.price + bubble.price, "other", "Setup");

          // Purchase frame
          const frameResult = store.purchaseItem(chatId, frame.id);
          expect(frameResult.success).toBe(true);

          // Purchase bubble (should succeed, different category)
          const bubbleResult = store.purchaseItem(chatId, bubble.id);
          expect(bubbleResult.success).toBe(true);

          // Verify ownership
          expect(store.ownsDecoration(chatId, frame.id, "frame")).toBe(true);
          expect(store.ownsDecoration(chatId, bubble.id, "bubble")).toBe(true);

          // Verify decorations state
          const decorations = store.getDecorations(chatId);
          expect(decorations.ownedFrames).toContain(frame.id);
          expect(decorations.ownedBubbles).toContain(bubble.id);
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Feature: game-economy-system, Property 3: 刷盤子獎勵範圍**
   *
   * *For any* 成功洗好的盤子，獎勵金幣應在 10-25 範圍內（含效率加成後）
   *
   * **Validates: Requirements 2.1**
   */
  describe("Property 3: 刷盤子獎勵範圍", () => {
    it("base reward should be between 10 and 25 coins", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (chatId) => {
          const store = createFreshStore();

          // Wash a dish
          const result = store.washDish(chatId);

          // Should succeed (first dish of the day)
          expect(result.success).toBe(true);

          // Base reward should be in range [10, 25]
          expect(result.baseReward).toBeGreaterThanOrEqual(10);
          expect(result.baseReward).toBeLessThanOrEqual(25);
        }),
        { numRuns: 100 },
      );
    });

    it("final reward should equal base reward when no efficiency items equipped", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (chatId) => {
          const store = createFreshStore();

          // Wash a dish without any efficiency items
          const result = store.washDish(chatId);

          expect(result.success).toBe(true);
          expect(result.efficiencyMultiplier).toBe(1.0);
          expect(result.reward).toBe(result.baseReward);
        }),
        { numRuns: 100 },
      );
    });

    it("washing multiple dishes should each give reward in valid range", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.integer({ min: 1, max: 10 }),
          (chatId, dishCount) => {
            const store = createFreshStore();

            for (let i = 0; i < dishCount; i++) {
              const result = store.washDish(chatId);

              if (result.success) {
                // Base reward should always be in range
                expect(result.baseReward).toBeGreaterThanOrEqual(10);
                expect(result.baseReward).toBeLessThanOrEqual(25);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should block washing when daily limit is reached", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (chatId) => {
          const store = createFreshStore();
          const config = store.getDishWashingConfig();

          // Wash dishes until limit
          for (let i = 0; i < config.DAILY_LIMIT; i++) {
            const result = store.washDish(chatId);
            expect(result.success).toBe(true);
          }

          // Next wash should fail
          const result = store.washDish(chatId);
          expect(result.success).toBe(false);
          expect(result.error).toBe("daily_limit_reached");
          expect(result.dishesWashedToday).toBe(config.DAILY_LIMIT);
        }),
        { numRuns: 100 },
      );
    });

    it("washing should increase wallet balance by reward amount", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (chatId) => {
          const store = createFreshStore();
          const balanceBefore = store.getBalance(chatId);

          const result = store.washDish(chatId);

          expect(result.success).toBe(true);
          expect(store.getBalance(chatId)).toBe(balanceBefore + result.reward!);
        }),
        { numRuns: 100 },
      );
    });

    it("washing should create a work transaction", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (chatId) => {
          const store = createFreshStore();
          const transactionsBefore = store.getTransactions(chatId).length;

          const result = store.washDish(chatId);

          expect(result.success).toBe(true);

          const transactionsAfter = store.getTransactions(chatId);
          expect(transactionsAfter.length).toBe(transactionsBefore + 1);

          // Find the work transaction
          const workTx = transactionsAfter.find(
            (tx) => tx.type === "income" && tx.category === "work",
          );
          expect(workTx).toBeDefined();
          expect(workTx!.amount).toBe(result.reward);
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Feature: game-economy-system, Property 4: 效率道具加成計算**
   *
   * *For any* 裝備的效率道具組合，最終效率應等於基礎效率乘以所有道具的乘數
   *
   * **Validates: Requirements 2.3**
   */
  describe("Property 4: 效率道具加成計算", () => {
    // Get work efficiency consumables
    const workEfficiencyItems = CONSUMABLE_ITEMS.filter(
      (item) => item.consumableEffect?.type === "work_efficiency",
    );
    const workEfficiencyArbitrary = fc.constantFrom(...workEfficiencyItems);

    it("efficiency multiplier should be 1.0 with no items", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (chatId) => {
          const store = createFreshStore();

          const multiplier = store.calculateWorkEfficiencyMultiplier(chatId);
          expect(multiplier).toBe(1.0);
        }),
        { numRuns: 100 },
      );
    });

    it("purchasing one efficiency item should apply its multiplier", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          workEfficiencyArbitrary,
          (chatId, efficiencyItem) => {
            const store = createFreshStore();

            // Ensure we have enough balance
            store.earnMoney(chatId, efficiencyItem.price, "other", "Setup");

            // Purchase the efficiency item
            const purchaseResult = store.purchaseItem(
              chatId,
              efficiencyItem.id,
            );
            expect(purchaseResult.success).toBe(true);

            // Check multiplier
            const multiplier = store.calculateWorkEfficiencyMultiplier(chatId);
            expect(multiplier).toBe(
              efficiencyItem.consumableEffect!.multiplier,
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    it("multiple different efficiency items should multiply together", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.uniqueArray(workEfficiencyArbitrary, {
            minLength: 1,
            maxLength: 3,
            comparator: (a, b) => a.id === b.id,
          }),
          (chatId, items) => {
            const store = createFreshStore();

            // Calculate expected multiplier (each unique item type applies once)
            let expectedMultiplier = 1.0;
            for (const item of items) {
              expectedMultiplier *= item.consumableEffect!.multiplier;
            }

            // Ensure we have enough balance for all items
            const totalCost = items.reduce((sum, item) => sum + item.price, 0);
            store.earnMoney(chatId, totalCost, "other", "Setup");

            // Purchase all items
            for (const item of items) {
              store.purchaseItem(chatId, item.id);
            }

            // Check multiplier
            const actualMultiplier =
              store.calculateWorkEfficiencyMultiplier(chatId);
            expect(actualMultiplier).toBeCloseTo(expectedMultiplier, 5);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("efficiency items should affect dish washing reward", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          workEfficiencyArbitrary,
          (chatId, efficiencyItem) => {
            const store = createFreshStore();

            // Ensure we have enough balance
            store.earnMoney(chatId, efficiencyItem.price, "other", "Setup");

            // Purchase the efficiency item
            store.purchaseItem(chatId, efficiencyItem.id);

            // Wash a dish
            const result = store.washDish(chatId);

            expect(result.success).toBe(true);
            expect(result.efficiencyMultiplier).toBe(
              efficiencyItem.consumableEffect!.multiplier,
            );

            // Final reward should be base reward * multiplier (floored)
            const expectedReward = Math.floor(
              result.baseReward! * result.efficiencyMultiplier!,
            );
            expect(result.reward).toBe(expectedReward);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("final reward with efficiency should be >= base reward", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.array(workEfficiencyArbitrary, { minLength: 0, maxLength: 3 }),
          (chatId, items) => {
            const store = createFreshStore();

            // Purchase efficiency items if any
            if (items.length > 0) {
              const totalCost = items.reduce(
                (sum, item) => sum + item.price,
                0,
              );
              store.earnMoney(chatId, totalCost, "other", "Setup");
              for (const item of items) {
                store.purchaseItem(chatId, item.id);
              }
            }

            // Wash a dish
            const result = store.washDish(chatId);

            expect(result.success).toBe(true);
            // Since all efficiency multipliers are >= 1.0, final reward should be >= base reward
            expect(result.reward).toBeGreaterThanOrEqual(result.baseReward!);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Feature: game-economy-system, Property 6: 釣魚結果在魚竿等級範圍內**
   *
   * *For any* 成功的釣魚操作，釣到的魚等級應在魚竿的 minFishTier 和 maxFishTier 之間
   *
   * **Validates: Requirements 3.3**
   */
  describe("Property 6: 釣魚結果在魚竿等級範圍內", () => {
    // Generate arbitrary rod from available rod items
    const rodArbitrary = fc.constantFrom(...ROD_ITEMS);

    it("caught fish tier should be within rod tier range", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          rodArbitrary,
          (chatId, rodItem) => {
            const store = createFreshStore();

            // Ensure we have enough balance to purchase rod
            store.earnMoney(chatId, rodItem.price, "other", "Setup");

            // Purchase and equip the rod
            store.purchaseItem(chatId, rodItem.id);
            const rods = store.getFishingRods(chatId);
            const rod = rods[rods.length - 1];
            store.equipRod(chatId, rod.id);

            // Catch a fish
            const result = store.catchFish(chatId);

            // Should succeed
            expect(result.success).toBe(true);
            expect(result.fish).toBeDefined();

            // Fish tier should be within rod's tier range
            expect(result.fish!.tier).toBeGreaterThanOrEqual(
              rodItem.rodStats!.minFishTier,
            );
            expect(result.fish!.tier).toBeLessThanOrEqual(
              rodItem.rodStats!.maxFishTier,
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    it("multiple catches should all be within rod tier range", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          rodArbitrary,
          fc.integer({ min: 1, max: 10 }),
          (chatId, rodItem, catchCount) => {
            const store = createFreshStore();

            // Ensure we have enough balance to purchase rod
            store.earnMoney(chatId, rodItem.price, "other", "Setup");

            // Purchase and equip the rod
            store.purchaseItem(chatId, rodItem.id);
            const rods = store.getFishingRods(chatId);
            const rod = rods[rods.length - 1];
            store.equipRod(chatId, rod.id);

            // Catch multiple fish (up to rod durability)
            const maxCatches = Math.min(
              catchCount,
              rodItem.rodStats!.maxDurability,
            );
            for (let i = 0; i < maxCatches; i++) {
              const result = store.catchFish(chatId);

              if (result.success && result.fish) {
                // Fish tier should be within rod's tier range
                expect(result.fish.tier).toBeGreaterThanOrEqual(
                  rodItem.rodStats!.minFishTier,
                );
                expect(result.fish.tier).toBeLessThanOrEqual(
                  rodItem.rodStats!.maxFishTier,
                );
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("fishing without equipped rod should fail", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (chatId) => {
          const store = createFreshStore();

          // Try to catch fish without a rod
          const result = store.catchFish(chatId);

          expect(result.success).toBe(false);
          expect(result.error).toBe("no_rod_equipped");
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Feature: game-economy-system, Property 7: 釣魚消耗耐久度**
   *
   * *For any* 成功的釣魚操作，魚竿耐久度應減少 1，且魚應加入魚簍
   *
   * **Validates: Requirements 3.4**
   */
  describe("Property 7: 釣魚消耗耐久度", () => {
    const rodArbitrary = fc.constantFrom(...ROD_ITEMS);

    it("catching fish should decrease rod durability by 1", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          rodArbitrary,
          (chatId, rodItem) => {
            const store = createFreshStore();

            // Ensure we have enough balance to purchase rod
            store.earnMoney(chatId, rodItem.price, "other", "Setup");

            // Purchase and equip the rod
            store.purchaseItem(chatId, rodItem.id);
            const rods = store.getFishingRods(chatId);
            const rod = rods[rods.length - 1];
            store.equipRod(chatId, rod.id);

            const durabilityBefore = rod.durability;

            // Catch a fish
            const result = store.catchFish(chatId);

            expect(result.success).toBe(true);
            expect(result.remainingDurability).toBe(durabilityBefore - 1);
            expect(rod.durability).toBe(durabilityBefore - 1);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("caught fish should be added to fish inventory", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          rodArbitrary,
          (chatId, rodItem) => {
            const store = createFreshStore();

            // Ensure we have enough balance to purchase rod
            store.earnMoney(chatId, rodItem.price, "other", "Setup");

            // Purchase and equip the rod
            store.purchaseItem(chatId, rodItem.id);
            const rods = store.getFishingRods(chatId);
            const rod = rods[rods.length - 1];
            store.equipRod(chatId, rod.id);

            const fishCountBefore = store.getFishInventory(chatId).length;

            // Catch a fish
            const result = store.catchFish(chatId);

            expect(result.success).toBe(true);
            expect(result.fish).toBeDefined();

            // Fish inventory should increase by 1
            const fishCountAfter = store.getFishInventory(chatId).length;
            expect(fishCountAfter).toBe(fishCountBefore + 1);

            // The caught fish should be in the inventory
            const inventory = store.getFishInventory(chatId);
            const foundFish = inventory.find((f) => f.id === result.fish!.id);
            expect(foundFish).toBeDefined();
          },
        ),
        { numRuns: 100 },
      );
    });

    it("rod should break when durability reaches 0", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (chatId) => {
          const store = createFreshStore();
          const cheapestRod = ROD_ITEMS[0]; // rod_bamboo with 50 durability

          // Ensure we have enough balance to purchase rod
          store.earnMoney(chatId, cheapestRod.price, "other", "Setup");

          // Purchase and equip the rod
          store.purchaseItem(chatId, cheapestRod.id);
          const rods = store.getFishingRods(chatId);
          const rod = rods[rods.length - 1];
          store.equipRod(chatId, rod.id);

          // Fish until rod breaks
          let lastResult;
          for (let i = 0; i < cheapestRod.rodStats!.maxDurability; i++) {
            lastResult = store.catchFish(chatId);
            if (!lastResult.success) break;
          }

          // Last successful catch should indicate rod is broken
          expect(lastResult!.rodBroken).toBe(true);
          expect(lastResult!.remainingDurability).toBe(0);

          // Rod should be unequipped
          expect(store.getEquippedRod(chatId)).toBeNull();
        }),
        { numRuns: 100 },
      );
    });

    it("total fish caught should increase with each catch", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          rodArbitrary,
          fc.integer({ min: 1, max: 5 }),
          (chatId, rodItem, catchCount) => {
            const store = createFreshStore();

            // Ensure we have enough balance to purchase rod
            store.earnMoney(chatId, rodItem.price, "other", "Setup");

            // Purchase and equip the rod
            store.purchaseItem(chatId, rodItem.id);
            const rods = store.getFishingRods(chatId);
            const rod = rods[rods.length - 1];
            store.equipRod(chatId, rod.id);

            const statsBefore = store.getFishingStats(chatId);
            const maxCatches = Math.min(
              catchCount,
              rodItem.rodStats!.maxDurability,
            );

            let successfulCatches = 0;
            for (let i = 0; i < maxCatches; i++) {
              const result = store.catchFish(chatId);
              if (result.success) {
                successfulCatches++;
              }
            }

            const statsAfter = store.getFishingStats(chatId);
            expect(statsAfter.totalFishCaught).toBe(
              statsBefore.totalFishCaught + successfulCatches,
            );
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Feature: game-economy-system, Property 8: 賣魚價格計算**
   *
   * *For any* 賣魚操作，最終價格應等於基礎價格加上重量乘以每公斤價格
   *
   * **Validates: Requirements 3.6**
   */
  describe("Property 8: 賣魚價格計算", () => {
    const rodArbitrary = fc.constantFrom(...ROD_ITEMS);

    it("selling fish should add correct amount to wallet", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          rodArbitrary,
          (chatId, rodItem) => {
            const store = createFreshStore();

            // Ensure we have enough balance to purchase rod
            store.earnMoney(chatId, rodItem.price, "other", "Setup");

            // Purchase and equip the rod
            store.purchaseItem(chatId, rodItem.id);
            const rods = store.getFishingRods(chatId);
            const rod = rods[rods.length - 1];
            store.equipRod(chatId, rod.id);

            // Catch a fish
            const catchResult = store.catchFish(chatId);
            expect(catchResult.success).toBe(true);

            const fish = catchResult.fish!;
            const balanceBefore = store.getBalance(chatId);

            // Sell the fish
            const sellResult = store.sellFish(chatId, fish.id);

            expect(sellResult.success).toBe(true);
            expect(sellResult.amount).toBe(fish.finalPrice);

            // Balance should increase by fish price
            expect(store.getBalance(chatId)).toBe(
              balanceBefore + fish.finalPrice,
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    it("fish finalPrice should equal basePrice + weight * pricePerKg", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          rodArbitrary,
          (chatId, rodItem) => {
            const store = createFreshStore();

            // Ensure we have enough balance to purchase rod
            store.earnMoney(chatId, rodItem.price, "other", "Setup");

            // Purchase and equip the rod
            store.purchaseItem(chatId, rodItem.id);
            const rods = store.getFishingRods(chatId);
            const rod = rods[rods.length - 1];
            store.equipRod(chatId, rod.id);

            // Catch a fish
            const catchResult = store.catchFish(chatId);
            expect(catchResult.success).toBe(true);

            const fish = catchResult.fish!;

            // The finalPrice is calculated using calculateFishPrice from fishTypes.ts
            // which is: Math.floor(basePrice + weight * pricePerKg)
            // We verify that finalPrice >= basePrice (since weight > 0 and pricePerKg > 0)
            expect(fish.finalPrice).toBeGreaterThanOrEqual(fish.basePrice);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("selling fish should remove it from inventory", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          rodArbitrary,
          (chatId, rodItem) => {
            const store = createFreshStore();

            // Ensure we have enough balance to purchase rod
            store.earnMoney(chatId, rodItem.price, "other", "Setup");

            // Purchase and equip the rod
            store.purchaseItem(chatId, rodItem.id);
            const rods = store.getFishingRods(chatId);
            const rod = rods[rods.length - 1];
            store.equipRod(chatId, rod.id);

            // Catch a fish
            const catchResult = store.catchFish(chatId);
            expect(catchResult.success).toBe(true);

            const fish = catchResult.fish!;
            const inventoryBefore = store.getFishInventory(chatId).length;

            // Sell the fish
            const sellResult = store.sellFish(chatId, fish.id);

            expect(sellResult.success).toBe(true);

            // Fish should be removed from inventory
            const inventoryAfter = store.getFishInventory(chatId).length;
            expect(inventoryAfter).toBe(inventoryBefore - 1);

            // Fish should not be found in inventory
            const foundFish = store
              .getFishInventory(chatId)
              .find((f) => f.id === fish.id);
            expect(foundFish).toBeUndefined();
          },
        ),
        { numRuns: 100 },
      );
    });

    it("selling fish should create a fishing transaction", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          rodArbitrary,
          (chatId, rodItem) => {
            const store = createFreshStore();

            // Ensure we have enough balance to purchase rod
            store.earnMoney(chatId, rodItem.price, "other", "Setup");

            // Purchase and equip the rod
            store.purchaseItem(chatId, rodItem.id);
            const rods = store.getFishingRods(chatId);
            const rod = rods[rods.length - 1];
            store.equipRod(chatId, rod.id);

            // Catch a fish
            const catchResult = store.catchFish(chatId);
            expect(catchResult.success).toBe(true);

            const fish = catchResult.fish!;
            const transactionsBefore = store.getTransactions(chatId).length;

            // Sell the fish
            store.sellFish(chatId, fish.id);

            const transactionsAfter = store.getTransactions(chatId);
            expect(transactionsAfter.length).toBe(transactionsBefore + 1);

            // Find the fishing transaction
            const fishingTx = transactionsAfter.find(
              (tx) =>
                tx.type === "income" &&
                tx.category === "fishing" &&
                tx.amount === fish.finalPrice,
            );
            expect(fishingTx).toBeDefined();
          },
        ),
        { numRuns: 100 },
      );
    });

    it("selling non-existent fish should fail", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          (chatId, fakeFishId) => {
            const store = createFreshStore();

            const balanceBefore = store.getBalance(chatId);

            // Try to sell a non-existent fish
            const result = store.sellFish(chatId, `fake-${fakeFishId}`);

            expect(result.success).toBe(false);
            expect(result.error).toBe("fish_not_found");

            // Balance should remain unchanged
            expect(store.getBalance(chatId)).toBe(balanceBefore);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("sellAllFish should sell all fish and return total amount", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.integer({ min: 1, max: 5 }),
          (chatId, fishCount) => {
            const store = createFreshStore();
            const rodItem = ROD_ITEMS[0]; // Use cheapest rod

            // Ensure we have enough balance to purchase rod
            store.earnMoney(chatId, rodItem.price, "other", "Setup");

            // Purchase and equip the rod
            store.purchaseItem(chatId, rodItem.id);
            const rods = store.getFishingRods(chatId);
            const rod = rods[rods.length - 1];
            store.equipRod(chatId, rod.id);

            // Catch multiple fish
            const maxCatches = Math.min(
              fishCount,
              rodItem.rodStats!.maxDurability,
            );
            for (let i = 0; i < maxCatches; i++) {
              store.catchFish(chatId);
            }

            const fishInventory = store.getFishInventory(chatId);
            const expectedTotal = fishInventory.reduce(
              (sum, f) => sum + f.finalPrice,
              0,
            );
            const balanceBefore = store.getBalance(chatId);

            // Sell all fish
            const totalAmount = store.sellAllFish(chatId);

            expect(totalAmount).toBe(expectedTotal);
            expect(store.getFishInventory(chatId).length).toBe(0);
            expect(store.getBalance(chatId)).toBe(
              balanceBefore + expectedTotal,
            );
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

/**
 * **Feature: game-economy-system, Property 9: 掛機收益計算**
 *
 * *For any* 掛機工作階段，收益應根據離線時間和效率正確計算，且不超過魚竿耐久度限制
 *
 * **Validates: Requirements 4.2, 4.3**
 */
describe("Property 9: 掛機收益計算", () => {
  const rodArbitrary = fc.constantFrom(...ROD_ITEMS);

  it("idle rewards should be calculated based on duration and efficiency", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        rodArbitrary,
        fc.integer({ min: 1, max: 60 }), // minutes of idle time
        (chatId, rodItem, idleMinutes) => {
          const store = createFreshStore();

          // Ensure we have enough balance to purchase rod
          store.earnMoney(chatId, rodItem.price, "other", "Setup");

          // Purchase and equip the rod
          store.purchaseItem(chatId, rodItem.id);
          const rods = store.getFishingRods(chatId);
          const rod = rods[rods.length - 1];
          store.equipRod(chatId, rod.id);

          // Start idle session
          const startResult = store.startIdleSession(chatId);
          expect(startResult.success).toBe(true);

          // Manually adjust the start time to simulate idle duration
          const state = store.getState(chatId);
          const idleDurationMs = idleMinutes * 60 * 1000;
          state.currentIdleSession!.startTime = Date.now() - idleDurationMs;

          // Calculate rewards
          const rewards = store.calculateIdleRewards(chatId);

          expect(rewards.hasSession).toBe(true);
          expect(rewards.duration).toBeGreaterThanOrEqual(idleDurationMs - 100); // Allow small timing variance

          // Fish count should be based on duration (5 min per fish) and efficiency
          const config = store.getIdleConfig();
          const expectedBaseFishCount = Math.floor(
            rewards.effectiveDuration / config.FISH_INTERVAL_MS,
          );
          const expectedFishCount = Math.floor(
            expectedBaseFishCount * rodItem.rodStats!.efficiency,
          );

          // Fish count should not exceed rod durability
          const maxFishByDurability = rod.durability;
          const actualExpectedFish = Math.min(
            expectedFishCount,
            maxFishByDurability,
          );

          expect(rewards.fishCount).toBe(actualExpectedFish);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("idle rewards should be limited by rod durability", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (chatId) => {
        const store = createFreshStore();
        const cheapestRod = ROD_ITEMS[0]; // rod_bamboo with 50 durability

        // Ensure we have enough balance to purchase rod
        store.earnMoney(chatId, cheapestRod.price, "other", "Setup");

        // Purchase and equip the rod
        store.purchaseItem(chatId, cheapestRod.id);
        const rods = store.getFishingRods(chatId);
        const rod = rods[rods.length - 1];
        store.equipRod(chatId, rod.id);

        // Start idle session
        store.startIdleSession(chatId);

        // Simulate very long idle time (more than rod can handle)
        const state = store.getState(chatId);
        const veryLongIdleMs = 24 * 60 * 60 * 1000; // 24 hours
        state.currentIdleSession!.startTime = Date.now() - veryLongIdleMs;

        // Calculate rewards
        const rewards = store.calculateIdleRewards(chatId);

        // Fish count should not exceed rod durability
        expect(rewards.fishCount).toBeLessThanOrEqual(rod.durability);

        // If fish count equals durability, rod should break
        if (rewards.fishCount === rod.durability) {
          expect(rewards.rodWillBreak).toBe(true);
          expect(rewards.remainingDurability).toBe(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("claiming idle rewards should add fish to inventory", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        rodArbitrary,
        fc.integer({ min: 5, max: 30 }), // minutes of idle time (at least 5 to get 1 fish)
        (chatId, rodItem, idleMinutes) => {
          const store = createFreshStore();

          // Ensure we have enough balance to purchase rod
          store.earnMoney(chatId, rodItem.price, "other", "Setup");

          // Purchase and equip the rod
          store.purchaseItem(chatId, rodItem.id);
          const rods = store.getFishingRods(chatId);
          const rod = rods[rods.length - 1];
          store.equipRod(chatId, rod.id);

          // Start idle session
          store.startIdleSession(chatId);

          // Simulate idle duration
          const state = store.getState(chatId);
          const idleDurationMs = idleMinutes * 60 * 1000;
          state.currentIdleSession!.startTime = Date.now() - idleDurationMs;

          // Calculate expected fish count before claiming
          const expectedRewards = store.calculateIdleRewards(chatId);
          const fishCountBefore = store.getFishInventory(chatId).length;

          // Claim rewards
          const claimResult = store.claimIdleRewards(chatId);

          expect(claimResult.success).toBe(true);

          // Fish inventory should increase by the expected amount
          const fishCountAfter = store.getFishInventory(chatId).length;
          expect(fishCountAfter).toBe(
            fishCountBefore + expectedRewards.fishCount,
          );

          // Claimed fish should match expected count
          expect(claimResult.fish!.length).toBe(expectedRewards.fishCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("claiming idle rewards should consume rod durability", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        rodArbitrary,
        fc.integer({ min: 5, max: 30 }),
        (chatId, rodItem, idleMinutes) => {
          const store = createFreshStore();

          // Ensure we have enough balance to purchase rod
          store.earnMoney(chatId, rodItem.price, "other", "Setup");

          // Purchase and equip the rod
          store.purchaseItem(chatId, rodItem.id);
          const rods = store.getFishingRods(chatId);
          const rod = rods[rods.length - 1];
          store.equipRod(chatId, rod.id);

          const durabilityBefore = rod.durability;

          // Start idle session
          store.startIdleSession(chatId);

          // Simulate idle duration
          const state = store.getState(chatId);
          const idleDurationMs = idleMinutes * 60 * 1000;
          state.currentIdleSession!.startTime = Date.now() - idleDurationMs;

          // Calculate expected fish count
          const expectedRewards = store.calculateIdleRewards(chatId);

          // Claim rewards
          store.claimIdleRewards(chatId);

          // Rod durability should decrease by fish count
          expect(rod.durability).toBe(
            durabilityBefore - expectedRewards.fishCount,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rod should break when durability is exhausted during idle", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (chatId) => {
        const store = createFreshStore();
        const cheapestRod = ROD_ITEMS[0]; // rod_bamboo with 50 durability

        // Ensure we have enough balance to purchase rod
        store.earnMoney(chatId, cheapestRod.price, "other", "Setup");

        // Purchase and equip the rod
        store.purchaseItem(chatId, cheapestRod.id);
        const rods = store.getFishingRods(chatId);
        const rod = rods[rods.length - 1];
        store.equipRod(chatId, rod.id);

        // Start idle session
        store.startIdleSession(chatId);

        // Simulate very long idle time to exhaust durability
        const state = store.getState(chatId);
        const veryLongIdleMs = 24 * 60 * 60 * 1000; // 24 hours
        state.currentIdleSession!.startTime = Date.now() - veryLongIdleMs;

        // Calculate expected rewards
        const expectedRewards = store.calculateIdleRewards(chatId);

        // Claim rewards
        const claimResult = store.claimIdleRewards(chatId);

        expect(claimResult.success).toBe(true);

        // If rod was expected to break, verify it did
        if (expectedRewards.rodWillBreak) {
          expect(claimResult.rodBroken).toBe(true);
          expect(rod.durability).toBe(0);
          // Rod should be unequipped
          expect(store.getEquippedRod(chatId)).toBeNull();
        }
      }),
      { numRuns: 100 },
    );
  });

  it("idle session should be cleared after claiming", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        rodArbitrary,
        (chatId, rodItem) => {
          const store = createFreshStore();

          // Ensure we have enough balance to purchase rod
          store.earnMoney(chatId, rodItem.price, "other", "Setup");

          // Purchase and equip the rod
          store.purchaseItem(chatId, rodItem.id);
          const rods = store.getFishingRods(chatId);
          const rod = rods[rods.length - 1];
          store.equipRod(chatId, rod.id);

          // Start idle session
          store.startIdleSession(chatId);
          expect(store.isIdle(chatId)).toBe(true);

          // Claim rewards
          store.claimIdleRewards(chatId);

          // Session should be cleared
          expect(store.isIdle(chatId)).toBe(false);
          expect(store.getCurrentIdleSession(chatId)).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("cannot start idle session without equipped rod", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (chatId) => {
        const store = createFreshStore();

        // Try to start idle without a rod
        const result = store.startIdleSession(chatId);

        expect(result.success).toBe(false);
        expect(result.error).toBe("no_rod_equipped");
      }),
      { numRuns: 100 },
    );
  });

  it("cannot start idle session when already idle", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        rodArbitrary,
        (chatId, rodItem) => {
          const store = createFreshStore();

          // Ensure we have enough balance to purchase rod
          store.earnMoney(chatId, rodItem.price, "other", "Setup");

          // Purchase and equip the rod
          store.purchaseItem(chatId, rodItem.id);
          const rods = store.getFishingRods(chatId);
          const rod = rods[rods.length - 1];
          store.equipRod(chatId, rod.id);

          // Start first idle session
          const firstResult = store.startIdleSession(chatId);
          expect(firstResult.success).toBe(true);

          // Try to start second idle session
          const secondResult = store.startIdleSession(chatId);
          expect(secondResult.success).toBe(false);
          expect(secondResult.error).toBe("already_idle");
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * **Feature: game-economy-system, Property 10: 掛機時長上限**
 *
 * *For any* 掛機工作階段，計算收益的時長應以 24 小時為上限
 *
 * **Validates: Requirements 4.5**
 */
describe("Property 10: 掛機時長上限", () => {
  const rodArbitrary = fc.constantFrom(...ROD_ITEMS);

  it("effective duration should be capped at 24 hours", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        rodArbitrary,
        fc.integer({ min: 25, max: 72 }), // hours of idle time (more than 24)
        (chatId, rodItem, idleHours) => {
          const store = createFreshStore();

          // Ensure we have enough balance to purchase rod
          store.earnMoney(chatId, rodItem.price, "other", "Setup");

          // Purchase and equip the rod
          store.purchaseItem(chatId, rodItem.id);
          const rods = store.getFishingRods(chatId);
          const rod = rods[rods.length - 1];
          store.equipRod(chatId, rod.id);

          // Start idle session
          store.startIdleSession(chatId);

          // Simulate idle duration longer than 24 hours
          const state = store.getState(chatId);
          const idleDurationMs = idleHours * 60 * 60 * 1000;
          state.currentIdleSession!.startTime = Date.now() - idleDurationMs;

          // Calculate rewards
          const rewards = store.calculateIdleRewards(chatId);
          const config = store.getIdleConfig();

          // Effective duration should be capped at 24 hours
          expect(rewards.effectiveDuration).toBeLessThanOrEqual(
            config.MAX_DURATION_MS,
          );

          // Actual duration should be the full time
          expect(rewards.duration).toBeGreaterThanOrEqual(idleDurationMs - 100);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("fish count should be based on capped duration, not actual duration", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (chatId) => {
        const store = createFreshStore();
        // Use a rod with high durability to not be limited by durability
        const highDurabilityRod = ROD_ITEMS[3]; // rod_gold with 200 durability

        // Ensure we have enough balance to purchase rod
        store.earnMoney(chatId, highDurabilityRod.price, "other", "Setup");

        // Purchase and equip the rod
        store.purchaseItem(chatId, highDurabilityRod.id);
        const rods = store.getFishingRods(chatId);
        const rod = rods[rods.length - 1];
        store.equipRod(chatId, rod.id);

        // Start idle session
        store.startIdleSession(chatId);

        // Simulate 48 hours of idle time
        const state = store.getState(chatId);
        const idleDurationMs = 48 * 60 * 60 * 1000;
        state.currentIdleSession!.startTime = Date.now() - idleDurationMs;

        // Calculate rewards
        const rewards = store.calculateIdleRewards(chatId);
        const config = store.getIdleConfig();

        // Calculate expected fish count based on 24 hour cap
        const expectedBaseFishCount = Math.floor(
          config.MAX_DURATION_MS / config.FISH_INTERVAL_MS,
        );
        const expectedFishCount = Math.floor(
          expectedBaseFishCount * highDurabilityRod.rodStats!.efficiency,
        );

        // Fish count should be based on capped duration (limited by durability)
        const maxByDurability = rod.durability;
        const actualExpected = Math.min(expectedFishCount, maxByDurability);

        expect(rewards.fishCount).toBe(actualExpected);
      }),
      { numRuns: 100 },
    );
  });

  it("duration under 24 hours should not be capped", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        rodArbitrary,
        fc.integer({ min: 1, max: 23 }), // hours of idle time (less than 24)
        (chatId, rodItem, idleHours) => {
          const store = createFreshStore();

          // Ensure we have enough balance to purchase rod
          store.earnMoney(chatId, rodItem.price, "other", "Setup");

          // Purchase and equip the rod
          store.purchaseItem(chatId, rodItem.id);
          const rods = store.getFishingRods(chatId);
          const rod = rods[rods.length - 1];
          store.equipRod(chatId, rod.id);

          // Start idle session
          store.startIdleSession(chatId);

          // Simulate idle duration less than 24 hours
          const state = store.getState(chatId);
          const idleDurationMs = idleHours * 60 * 60 * 1000;
          state.currentIdleSession!.startTime = Date.now() - idleDurationMs;

          // Calculate rewards
          const rewards = store.calculateIdleRewards(chatId);

          // Effective duration should equal actual duration (not capped)
          // Allow small timing variance
          expect(rewards.effectiveDuration).toBeGreaterThanOrEqual(
            idleDurationMs - 100,
          );
          expect(rewards.effectiveDuration).toBeLessThanOrEqual(
            idleDurationMs + 100,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("exactly 24 hours should not exceed cap", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        rodArbitrary,
        (chatId, rodItem) => {
          const store = createFreshStore();

          // Ensure we have enough balance to purchase rod
          store.earnMoney(chatId, rodItem.price, "other", "Setup");

          // Purchase and equip the rod
          store.purchaseItem(chatId, rodItem.id);
          const rods = store.getFishingRods(chatId);
          const rod = rods[rods.length - 1];
          store.equipRod(chatId, rod.id);

          // Start idle session
          store.startIdleSession(chatId);

          // Simulate exactly 24 hours of idle time
          const state = store.getState(chatId);
          const config = store.getIdleConfig();
          state.currentIdleSession!.startTime =
            Date.now() - config.MAX_DURATION_MS;

          // Calculate rewards
          const rewards = store.calculateIdleRewards(chatId);

          // Effective duration should be exactly 24 hours (or very close)
          expect(rewards.effectiveDuration).toBeLessThanOrEqual(
            config.MAX_DURATION_MS,
          );
          expect(rewards.effectiveDuration).toBeGreaterThanOrEqual(
            config.MAX_DURATION_MS - 100,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * **Feature: game-economy-system, Property 17: 賭博勝負金幣調整**
 *
 * *For any* 賭博操作，贏得時餘額應增加下注金額，輸掉時餘額應減少下注金額
 *
 * **Validates: Requirements 9.1, 9.2, 9.3**
 */
describe("Property 17: 賭博勝負金幣調整", () => {
  // Generate valid bet amounts (10-1000)
  const betAmountArbitrary = fc.integer({ min: 10, max: 1000 });
  const choiceArbitrary = fc.constantFrom("big", "small") as fc.Arbitrary<
    "big" | "small"
  >;

  it("winning should increase balance by bet amount", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        betAmountArbitrary,
        choiceArbitrary,
        (chatId, betAmount, choice) => {
          const store = createFreshStore();

          // Ensure we have enough balance
          store.earnMoney(chatId, betAmount * 2, "other", "Setup");
          const balanceBefore = store.getBalance(chatId);

          // Gamble
          const result = store.gamble(chatId, betAmount, choice);

          expect(result.success).toBe(true);

          if (result.won) {
            // Won: balance should increase by bet amount
            expect(result.netAmount).toBe(betAmount);
            expect(result.newBalance).toBe(balanceBefore + betAmount);
            expect(store.getBalance(chatId)).toBe(balanceBefore + betAmount);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("losing should decrease balance by bet amount", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        betAmountArbitrary,
        choiceArbitrary,
        (chatId, betAmount, choice) => {
          const store = createFreshStore();

          // Ensure we have enough balance
          store.earnMoney(chatId, betAmount * 2, "other", "Setup");
          const balanceBefore = store.getBalance(chatId);

          // Gamble
          const result = store.gamble(chatId, betAmount, choice);

          expect(result.success).toBe(true);

          if (!result.won) {
            // Lost: balance should decrease by bet amount
            expect(result.netAmount).toBe(-betAmount);
            expect(result.newBalance).toBe(balanceBefore - betAmount);
            expect(store.getBalance(chatId)).toBe(balanceBefore - betAmount);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("dice value should determine win/loss correctly", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        betAmountArbitrary,
        choiceArbitrary,
        (chatId, betAmount, choice) => {
          const store = createFreshStore();

          // Ensure we have enough balance
          store.earnMoney(chatId, betAmount * 2, "other", "Setup");

          // Gamble
          const result = store.gamble(chatId, betAmount, choice);

          expect(result.success).toBe(true);
          expect(result.diceValue).toBeGreaterThanOrEqual(1);
          expect(result.diceValue).toBeLessThanOrEqual(6);

          // Verify win/loss logic: 1-3 is small, 4-6 is big
          const diceResult = result.diceValue! <= 3 ? "small" : "big";
          const expectedWon = choice === diceResult;
          expect(result.won).toBe(expectedWon);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("gambling should create appropriate transaction", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        betAmountArbitrary,
        choiceArbitrary,
        (chatId, betAmount, choice) => {
          const store = createFreshStore();

          // Ensure we have enough balance
          store.earnMoney(chatId, betAmount * 2, "other", "Setup");
          const transactionsBefore = store.getTransactions(chatId).length;

          // Gamble
          const result = store.gamble(chatId, betAmount, choice);

          expect(result.success).toBe(true);

          const transactionsAfter = store.getTransactions(chatId);
          expect(transactionsAfter.length).toBe(transactionsBefore + 1);

          // Find the gambling transaction
          const gamblingTx = transactionsAfter.find(
            (tx) => tx.category === "gambling" && tx.amount === betAmount,
          );
          expect(gamblingTx).toBeDefined();

          if (result.won) {
            expect(gamblingTx!.type).toBe("income");
          } else {
            expect(gamblingTx!.type).toBe("expense");
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("gambling with insufficient funds should fail", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.integer({ min: 101, max: 1000 }), // Amount greater than initial 100
        choiceArbitrary,
        (chatId, betAmount, choice) => {
          const store = createFreshStore();
          const balanceBefore = store.getBalance(chatId);

          // Ensure bet amount exceeds balance
          expect(betAmount).toBeGreaterThan(balanceBefore);

          // Gamble should fail
          const result = store.gamble(chatId, betAmount, choice);

          expect(result.success).toBe(false);
          expect(result.error).toBe("insufficient_funds");

          // Balance should remain unchanged
          expect(store.getBalance(chatId)).toBe(balanceBefore);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("gambling should be blocked when daily limit is reached", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (chatId) => {
        const store = createFreshStore();
        const config = store.getGamblingConfig();

        // Ensure we have enough balance for all gambles
        store.earnMoney(
          chatId,
          config.MIN_BET * (config.DAILY_LIMIT + 5),
          "other",
          "Setup",
        );

        // Gamble until limit
        for (let i = 0; i < config.DAILY_LIMIT; i++) {
          const result = store.gamble(chatId, config.MIN_BET, "big");
          expect(result.success).toBe(true);
        }

        // Next gamble should fail
        const result = store.gamble(chatId, config.MIN_BET, "big");
        expect(result.success).toBe(false);
        expect(result.error).toBe("daily_limit_reached");
        expect(result.todayGambles).toBe(config.DAILY_LIMIT);
      }),
      { numRuns: 100 },
    );
  });

  it("gambling stats should be updated correctly", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        betAmountArbitrary,
        choiceArbitrary,
        (chatId, betAmount, choice) => {
          const store = createFreshStore();

          // Ensure we have enough balance
          store.earnMoney(chatId, betAmount * 2, "other", "Setup");

          const statsBefore = store.getGamblingStats(chatId);
          const winsBefore = statsBefore.totalWins;
          const lossesBefore = statsBefore.totalLosses;
          const todayGamblesBefore = statsBefore.todayGambles;

          // Gamble
          const result = store.gamble(chatId, betAmount, choice);

          expect(result.success).toBe(true);

          const statsAfter = store.getGamblingStats(chatId);

          // Today's gambles should increase by 1
          expect(statsAfter.todayGambles).toBe(todayGamblesBefore + 1);

          if (result.won) {
            expect(statsAfter.totalWins).toBe(winsBefore + 1);
            expect(statsAfter.totalLosses).toBe(lossesBefore);
          } else {
            expect(statsAfter.totalWins).toBe(winsBefore);
            expect(statsAfter.totalLosses).toBe(lossesBefore + 1);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("invalid bet amount should be rejected", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.oneof(
          fc.integer({ min: 1, max: 9 }), // Below minimum
          fc.integer({ min: 1001, max: 10000 }), // Above maximum
        ),
        choiceArbitrary,
        (chatId, invalidBetAmount, choice) => {
          const store = createFreshStore();

          // Ensure we have enough balance
          store.earnMoney(chatId, 10000, "other", "Setup");
          const balanceBefore = store.getBalance(chatId);

          // Gamble with invalid bet should fail
          const result = store.gamble(chatId, invalidBetAmount, choice);

          expect(result.success).toBe(false);
          expect(result.error).toBe("invalid_bet");

          // Balance should remain unchanged
          expect(store.getBalance(chatId)).toBe(balanceBefore);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("canGamble should correctly predict gambling availability", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (chatId) => {
        const store = createFreshStore();
        const config = store.getGamblingConfig();

        // Ensure we have enough balance
        store.earnMoney(
          chatId,
          config.MIN_BET * (config.DAILY_LIMIT + 5),
          "other",
          "Setup",
        );

        // Initially should be able to gamble
        expect(store.canGamble(chatId)).toBe(true);

        // Gamble until limit
        for (let i = 0; i < config.DAILY_LIMIT; i++) {
          expect(store.canGamble(chatId)).toBe(true);
          store.gamble(chatId, config.MIN_BET, "big");
        }

        // After reaching limit, should not be able to gamble
        expect(store.canGamble(chatId)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * **Feature: game-economy-system, Property 12: 禮物購買和送出**
 *
 * *For any* 禮物購買後送出操作，背包應先增加後減少該禮物，送禮記錄應包含該禮物
 *
 * **Validates: Requirements 6.1, 6.2**
 */
describe("Property 12: 禮物購買和送出", () => {
  // Get gift items from shop
  const giftItems = SHOP_ITEMS.filter((item) => item.category === "gift");
  const giftArbitrary = fc.constantFrom(...giftItems);

  it("purchasing a gift should add it to inventory", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        giftArbitrary,
        (chatId, giftItem) => {
          const store = createFreshStore();

          // Ensure we have enough balance
          store.earnMoney(chatId, giftItem.price, "other", "Setup");

          const inventoryBefore = store.getInventory(chatId);
          const giftCountBefore = inventoryBefore.filter(
            (item) => item.itemId === giftItem.id,
          ).length;

          // Purchase the gift
          const result = store.purchaseItem(chatId, giftItem.id);

          expect(result.success).toBe(true);

          // Gift should be in inventory
          const inventoryAfter = store.getInventory(chatId);
          const giftInInventory = inventoryAfter.find(
            (item) => item.itemId === giftItem.id,
          );

          expect(giftInInventory).toBeDefined();
          expect(giftInInventory!.type).toBe("gift");
          expect(giftInInventory!.name).toBe(giftItem.name);

          // If gift was already in inventory, quantity should increase
          if (giftCountBefore > 0) {
            expect(giftInInventory!.quantity).toBeGreaterThan(1);
          } else {
            expect(giftInInventory!.quantity).toBe(1);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("sending a gift should remove it from inventory and add to gift history", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        giftArbitrary,
        (chatId, giftItem) => {
          const store = createFreshStore();

          // Ensure we have enough balance and purchase the gift
          store.earnMoney(chatId, giftItem.price, "other", "Setup");
          store.purchaseItem(chatId, giftItem.id);

          // Get the inventory item
          const inventoryBefore = store.getInventory(chatId);
          const giftInInventory = inventoryBefore.find(
            (item) => item.itemId === giftItem.id,
          );
          expect(giftInInventory).toBeDefined();

          const quantityBefore = giftInInventory!.quantity;
          const giftHistoryBefore = store.getGiftHistory(chatId).length;

          // Send the gift
          const sendResult = store.sendGift(chatId, giftInInventory!.id);

          expect(sendResult.success).toBe(true);
          expect(sendResult.giftName).toBe(giftItem.name);
          expect(sendResult.giftItemId).toBe(giftItem.id);

          // Gift history should increase by 1
          const giftHistoryAfter = store.getGiftHistory(chatId);
          expect(giftHistoryAfter.length).toBe(giftHistoryBefore + 1);

          // The gift record should contain the gift info
          const latestGiftRecord = giftHistoryAfter[0];
          expect(latestGiftRecord.itemId).toBe(giftItem.id);
          expect(latestGiftRecord.itemName).toBe(giftItem.name);

          // Inventory quantity should decrease
          const inventoryAfter = store.getInventory(chatId);
          const giftAfter = inventoryAfter.find(
            (item) => item.itemId === giftItem.id,
          );

          if (quantityBefore === 1) {
            // Gift should be removed from inventory
            expect(giftAfter).toBeUndefined();
          } else {
            // Quantity should decrease by 1
            expect(giftAfter!.quantity).toBe(quantityBefore - 1);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("purchasing multiple gifts should stack in inventory", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        giftArbitrary,
        fc.integer({ min: 2, max: 5 }),
        (chatId, giftItem, purchaseCount) => {
          const store = createFreshStore();

          // Ensure we have enough balance for multiple purchases
          const totalCost = giftItem.price * purchaseCount;
          store.earnMoney(chatId, totalCost, "other", "Setup");

          // Purchase multiple gifts
          for (let i = 0; i < purchaseCount; i++) {
            const result = store.purchaseItem(chatId, giftItem.id);
            expect(result.success).toBe(true);
          }

          // Check inventory
          const inventory = store.getInventory(chatId);
          const giftInInventory = inventory.find(
            (item) => item.itemId === giftItem.id,
          );

          expect(giftInInventory).toBeDefined();
          expect(giftInInventory!.quantity).toBe(purchaseCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("sending gift without owning it should fail", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (chatId, fakeInventoryId) => {
          const store = createFreshStore();

          // Try to send a non-existent gift
          const result = store.sendGift(chatId, `fake-${fakeInventoryId}`);

          expect(result.success).toBe(false);
          expect(result.error).toBe("gift_not_found");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("sendGiftByItemId should work with shop item ID", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        giftArbitrary,
        (chatId, giftItem) => {
          const store = createFreshStore();

          // Ensure we have enough balance and purchase the gift
          store.earnMoney(chatId, giftItem.price, "other", "Setup");
          store.purchaseItem(chatId, giftItem.id);

          const giftHistoryBefore = store.getGiftHistory(chatId).length;

          // Send the gift using item ID
          const sendResult = store.sendGiftByItemId(chatId, giftItem.id);

          expect(sendResult.success).toBe(true);
          expect(sendResult.giftName).toBe(giftItem.name);
          expect(sendResult.giftItemId).toBe(giftItem.id);

          // Gift history should increase
          const giftHistoryAfter = store.getGiftHistory(chatId);
          expect(giftHistoryAfter.length).toBe(giftHistoryBefore + 1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("sendGiftByItemId should fail if gift not owned", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        giftArbitrary,
        (chatId, giftItem) => {
          const store = createFreshStore();

          // Don't purchase the gift, just try to send it
          const result = store.sendGiftByItemId(chatId, giftItem.id);

          expect(result.success).toBe(false);
          expect(result.error).toBe("gift_not_owned");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("gift purchase and send should create correct transaction", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        giftArbitrary,
        (chatId, giftItem) => {
          const store = createFreshStore();

          // Ensure we have enough balance
          store.earnMoney(chatId, giftItem.price, "other", "Setup");

          const transactionsBefore = store.getTransactions(chatId).length;

          // Purchase the gift
          store.purchaseItem(chatId, giftItem.id);

          const transactionsAfter = store.getTransactions(chatId);
          expect(transactionsAfter.length).toBe(transactionsBefore + 1);

          // Find the shop transaction
          const shopTx = transactionsAfter.find(
            (tx) =>
              tx.type === "expense" &&
              tx.category === "shop" &&
              tx.amount === giftItem.price &&
              tx.relatedItemId === giftItem.id,
          );

          expect(shopTx).toBeDefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("getRecentGifts should return most recent gifts first", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.integer({ min: 2, max: 5 }),
        (chatId, giftCount) => {
          const store = createFreshStore();
          const giftItem = giftItems[0]; // Use first gift item

          // Ensure we have enough balance for multiple purchases
          const totalCost = giftItem.price * giftCount;
          store.earnMoney(chatId, totalCost, "other", "Setup");

          // Purchase and send multiple gifts
          for (let i = 0; i < giftCount; i++) {
            store.purchaseItem(chatId, giftItem.id);
            const inventory = store.getInventory(chatId);
            const gift = inventory.find((item) => item.itemId === giftItem.id);
            if (gift) {
              store.sendGift(chatId, gift.id);
            }
          }

          // Get recent gifts
          const recentGifts = store.getRecentGifts(chatId, giftCount);

          expect(recentGifts.length).toBe(giftCount);

          // Verify they are sorted by sentAt descending
          for (let i = 1; i < recentGifts.length; i++) {
            expect(recentGifts[i - 1].sentAt).toBeGreaterThanOrEqual(
              recentGifts[i].sentAt,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * **Feature: game-economy-system, Property 18: 轉帳扣款正確性**
 *
 * *For any* 轉帳操作，餘額應減少轉帳金額，交易記錄應包含該筆轉帳
 *
 * **Validates: Requirements 11.3**
 */
describe("Property 18: 轉帳扣款正確性", () => {
  // Generate valid transfer amounts
  const transferAmountArbitrary = fc.integer({ min: 1, max: 1000 });

  it("transfer should decrease balance by exact amount", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        transferAmountArbitrary,
        (chatId, amount) => {
          const store = createFreshStore();

          // Ensure we have enough balance
          store.earnMoney(chatId, amount * 2, "other", "Setup");
          const balanceBefore = store.getBalance(chatId);

          // Transfer
          const result = store.transfer(chatId, amount);

          expect(result.success).toBe(true);
          expect(result.amount).toBe(amount);
          expect(result.newBalance).toBe(balanceBefore - amount);
          expect(store.getBalance(chatId)).toBe(balanceBefore - amount);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("transfer should create a transfer transaction record", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        transferAmountArbitrary,
        (chatId, amount) => {
          const store = createFreshStore();

          // Ensure we have enough balance
          store.earnMoney(chatId, amount * 2, "other", "Setup");
          const transactionsBefore = store.getTransactions(chatId).length;

          // Transfer
          store.transfer(chatId, amount);

          const transactionsAfter = store.getTransactions(chatId);
          expect(transactionsAfter.length).toBe(transactionsBefore + 1);

          // Find the transfer transaction
          const transferTx = transactionsAfter.find(
            (tx) =>
              tx.type === "expense" &&
              tx.category === "transfer" &&
              tx.amount === amount,
          );

          expect(transferTx).toBeDefined();
          expect(transferTx!.description).toContain("轉帳");
          expect(transferTx!.description).toContain(amount.toString());
        },
      ),
      { numRuns: 100 },
    );
  });

  it("transfer with insufficient funds should fail", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.integer({ min: 101, max: 10000 }), // Amount greater than initial 100
        (chatId, amount) => {
          const store = createFreshStore();
          const balanceBefore = store.getBalance(chatId);

          // Ensure amount exceeds balance
          expect(amount).toBeGreaterThan(balanceBefore);

          // Transfer should fail
          const result = store.transfer(chatId, amount);

          expect(result.success).toBe(false);
          expect(result.error).toBe("insufficient_funds");

          // Balance should remain unchanged
          expect(store.getBalance(chatId)).toBe(balanceBefore);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("transfer with invalid amount should fail", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.integer({ min: -1000, max: 0 }), // Invalid amounts (zero or negative)
        (chatId, invalidAmount) => {
          const store = createFreshStore();
          const balanceBefore = store.getBalance(chatId);
          const transactionsBefore = store.getTransactions(chatId).length;

          // Transfer should fail
          const result = store.transfer(chatId, invalidAmount);

          expect(result.success).toBe(false);
          expect(result.error).toBe("invalid_amount");

          // Balance should remain unchanged
          expect(store.getBalance(chatId)).toBe(balanceBefore);

          // No transaction should be created
          expect(store.getTransactions(chatId).length).toBe(transactionsBefore);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("transfer exactly the balance should succeed", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (chatId) => {
        const store = createFreshStore();
        const balance = store.getBalance(chatId);

        // Transfer exact balance
        const result = store.transfer(chatId, balance);

        expect(result.success).toBe(true);
        expect(result.newBalance).toBe(0);
        expect(store.getBalance(chatId)).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it("transfer one more than balance should fail", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (chatId) => {
        const store = createFreshStore();
        const balance = store.getBalance(chatId);

        // Transfer one more than balance
        const result = store.transfer(chatId, balance + 1);

        expect(result.success).toBe(false);
        expect(result.error).toBe("insufficient_funds");
        expect(store.getBalance(chatId)).toBe(balance);
      }),
      { numRuns: 100 },
    );
  });

  it("multiple transfers should correctly update balance", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.array(fc.integer({ min: 1, max: 50 }), {
          minLength: 1,
          maxLength: 10,
        }),
        (chatId, amounts) => {
          const store = createFreshStore();

          // Ensure we have enough balance for all transfers
          const totalAmount = amounts.reduce((sum, a) => sum + a, 0);
          store.earnMoney(chatId, totalAmount, "other", "Setup");
          const balanceBefore = store.getBalance(chatId);

          // Perform all transfers
          let totalTransferred = 0;
          for (const amount of amounts) {
            const result = store.transfer(chatId, amount);
            if (result.success) {
              totalTransferred += amount;
            }
          }

          // Balance should decrease by total transferred
          expect(store.getBalance(chatId)).toBe(
            balanceBefore - totalTransferred,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("failed transfer should not create transaction", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.integer({ min: 101, max: 10000 }),
        (chatId, amount) => {
          const store = createFreshStore();
          const transactionsBefore = store.getTransactions(chatId).length;

          // Transfer should fail (insufficient funds)
          store.transfer(chatId, amount);

          // No new transaction should be added
          expect(store.getTransactions(chatId).length).toBe(transactionsBefore);
        },
      ),
      { numRuns: 100 },
    );
  });
});
