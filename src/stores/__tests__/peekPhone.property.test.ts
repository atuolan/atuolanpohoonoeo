/**
 * Property-based tests for peekPhone store cache operations
 */
import type {
    PeekChatMessage,
    PeekChatThread,
    PeekDiaryEntry,
    PeekMealRecord,
    PeekMemo,
    PeekNote,
    PeekPhoneData,
    PeekScheduleItem,
    PeekTransaction,
} from "@/types/peekPhone";
import * as fc from "fast-check";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { usePeekPhoneStore } from "../peekPhone";

// ============================================================
// Arbitraries
// ============================================================

const safeChars =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");

const safeStr = fc
  .array(fc.constantFrom(...safeChars), { minLength: 1, maxLength: 20 })
  .map((arr) => arr.join(""));

const arbMealType = fc.constantFrom(
  "breakfast" as const,
  "lunch" as const,
  "dinner" as const,
  "snack" as const,
);
const arbMood = fc.constantFrom(
  "happy" as const,
  "neutral" as const,
  "sad" as const,
  "angry" as const,
  "excited" as const,
);

const arbChatMessage: fc.Arbitrary<PeekChatMessage> = fc.record({
  id: safeStr,
  senderName: safeStr,
  content: safeStr,
  isSelf: fc.boolean(),
  timestamp: fc.integer({ min: 0, max: 9999999 }),
});

const arbChatThread: fc.Arbitrary<PeekChatThread> = fc.record({
  id: safeStr,
  contactName: safeStr,
  messages: fc.array(arbChatMessage, { minLength: 0, maxLength: 3 }),
  updatedAt: fc.integer({ min: 0, max: 9999999 }),
});

const arbScheduleItem: fc.Arbitrary<PeekScheduleItem> = fc.record({
  id: safeStr,
  time: safeStr,
  title: safeStr,
  location: fc.option(safeStr, { nil: undefined }),
  done: fc.boolean(),
});

const arbMealRecord: fc.Arbitrary<PeekMealRecord> = fc.record({
  id: safeStr,
  mealType: arbMealType,
  food: safeStr,
  time: safeStr,
  note: fc.option(safeStr, { nil: undefined }),
});

const arbMemo: fc.Arbitrary<PeekMemo> = fc.record({
  id: safeStr,
  content: safeStr,
  done: fc.boolean(),
  createdAt: fc.integer({ min: 0, max: 9999999 }),
});

const arbNote: fc.Arbitrary<PeekNote> = fc.record({
  id: safeStr,
  title: safeStr,
  content: safeStr,
  updatedAt: fc.integer({ min: 0, max: 9999999 }),
});

const arbDiaryEntry: fc.Arbitrary<PeekDiaryEntry> = fc.record({
  id: safeStr,
  date: safeStr,
  mood: arbMood,
  content: safeStr,
  weather: fc.option(safeStr, { nil: undefined }),
});

const arbTransaction: fc.Arbitrary<PeekTransaction> = fc.record({
  id: safeStr,
  description: safeStr,
  amount: fc.integer({ min: -99999, max: 99999 }),
  time: safeStr,
});

const arbPeekPhoneData: fc.Arbitrary<PeekPhoneData> = fc.record({
  characterId: safeStr,
  chats: fc.array(arbChatThread, { minLength: 0, maxLength: 3 }),
  schedule: fc.array(arbScheduleItem, { minLength: 0, maxLength: 3 }),
  meals: fc.array(arbMealRecord, { minLength: 0, maxLength: 3 }),
  balance: fc.integer({ min: 0, max: 999999 }),
  transactions: fc.array(arbTransaction, { minLength: 0, maxLength: 3 }),
  memos: fc.array(arbMemo, { minLength: 0, maxLength: 3 }),
  notes: fc.array(arbNote, { minLength: 0, maxLength: 3 }),
  diary: fc.array(arbDiaryEntry, { minLength: 0, maxLength: 3 }),
});

// ============================================================
// Property Tests
// ============================================================

describe("peekPhone store cache", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  /**
   * **Feature: peek-phone-ai-content, Property 5: Cache Store-Retrieve Round-Trip**
   * **Validates: Requirements 7.1, 7.2**
   *
   * For any characterId, chatId, and valid PeekPhoneData, storing the data
   * in the cache and then retrieving it with the same keys shall return
   * data equivalent to what was stored.
   */
  it("Property 5: Cache Store-Retrieve Round-Trip", () => {
    fc.assert(
      fc.property(
        safeStr,
        safeStr,
        arbPeekPhoneData,
        (charId, cId, phoneData) => {
          const store = usePeekPhoneStore();
          store.storeCache(charId, cId, phoneData);
          const retrieved = store.getCached(charId, cId);
          expect(retrieved).toEqual(phoneData);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Feature: peek-phone-ai-content, Property 6: Cache Clear Removes Entry**
   * **Validates: Requirements 7.3**
   *
   * For any characterId and chatId that have cached data, clearing the cache
   * for that combination shall cause subsequent retrieval to return null.
   */
  it("Property 6: Cache Clear Removes Entry", () => {
    fc.assert(
      fc.property(
        safeStr,
        safeStr,
        arbPeekPhoneData,
        (charId, cId, phoneData) => {
          const store = usePeekPhoneStore();
          store.storeCache(charId, cId, phoneData);
          // Verify it's stored
          expect(store.getCached(charId, cId)).toEqual(phoneData);
          // Clear and verify removal
          store.clearCache(charId, cId);
          expect(store.getCached(charId, cId)).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});
