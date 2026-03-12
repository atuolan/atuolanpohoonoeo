/**
 * Property-based tests for PeekPhoneYAMLParser and PeekPhoneYAMLPrinter
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
import { describe, expect, it } from "vitest";
import { parseFullData } from "../PeekPhoneYAMLParser";
import { printFullData } from "../PeekPhoneYAMLPrinter";

// ============================================================
// Arbitraries
// ============================================================

/** Safe single-line string (no YAML-breaking chars) */
const safeChars =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ\u4e00\u4e01\u4e03\u4e09\u4e0a\u4e0b\u4e2d\u4eba\u5927\u5c0f\u597d\u5929\u6c23".split(
    "",
  );

const singleLineStr = fc
  .array(fc.constantFrom(...safeChars), { minLength: 1, maxLength: 20 })
  .map((arr) => arr.join(""));

/** Time string like "08:30" */
const timeStr = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(
    ([h, m]) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
  );

/** Date string like "2026-02-22" */
const dateStr = fc
  .tuple(
    fc.integer({ min: 2020, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(
    ([y, m, d]) =>
      `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
  );

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
  id: fc.constant("x"),
  senderName: singleLineStr,
  content: singleLineStr,
  isSelf: fc.boolean(),
  timestamp: fc.integer({ min: 0, max: 9999999999 }),
});

const arbChatThread: fc.Arbitrary<PeekChatThread> = fc.record({
  id: fc.constant("x"),
  contactName: singleLineStr,
  messages: fc.array(arbChatMessage, { minLength: 1, maxLength: 4 }),
  updatedAt: fc.constant(0),
});

const arbScheduleItem: fc.Arbitrary<PeekScheduleItem> = fc.record({
  id: fc.constant("x"),
  time: timeStr,
  title: singleLineStr,
  location: fc.option(singleLineStr, { nil: undefined }),
  done: fc.boolean(),
});

const arbMealRecord: fc.Arbitrary<PeekMealRecord> = fc.record({
  id: fc.constant("x"),
  mealType: arbMealType,
  food: singleLineStr,
  time: timeStr,
  note: fc.option(singleLineStr, { nil: undefined }),
});

const arbMemo: fc.Arbitrary<PeekMemo> = fc.record({
  id: fc.constant("x"),
  content: singleLineStr,
  done: fc.boolean(),
  createdAt: fc.constant(0),
});

const arbNote: fc.Arbitrary<PeekNote> = fc.record({
  id: fc.constant("x"),
  title: singleLineStr,
  content: singleLineStr,
  updatedAt: fc.constant(0),
});

const arbDiaryEntry: fc.Arbitrary<PeekDiaryEntry> = fc.record({
  id: fc.constant("x"),
  date: dateStr,
  mood: arbMood,
  content: singleLineStr,
  weather: fc.option(singleLineStr, { nil: undefined }),
});

const arbTransaction: fc.Arbitrary<PeekTransaction> = fc.record({
  id: fc.constant("x"),
  description: singleLineStr,
  amount: fc.integer({ min: -99999, max: 99999 }),
  time: timeStr,
});

const arbPeekPhoneData: fc.Arbitrary<PeekPhoneData> = fc.record({
  characterId: fc.constant(""),
  chats: fc.array(arbChatThread, { minLength: 1, maxLength: 3 }),
  schedule: fc.array(arbScheduleItem, { minLength: 1, maxLength: 4 }),
  meals: fc.array(arbMealRecord, { minLength: 1, maxLength: 3 }),
  balance: fc.integer({ min: 0, max: 999999 }),
  transactions: fc.array(arbTransaction, { minLength: 0, maxLength: 5 }),
  memos: fc.array(arbMemo, { minLength: 1, maxLength: 4 }),
  notes: fc.array(arbNote, { minLength: 1, maxLength: 3 }),
  diary: fc.array(arbDiaryEntry, { minLength: 1, maxLength: 3 }),
});

// ============================================================
// Helper: strip non-serialized fields for comparison
// ============================================================

function stripMeta(data: PeekPhoneData) {
  return {
    chats: data.chats.map((t) => ({
      contactName: t.contactName,
      messages: t.messages.map((m) => ({
        senderName: m.senderName,
        content: m.content,
        isSelf: m.isSelf,
        timestamp: m.timestamp,
      })),
    })),
    schedule: data.schedule.map((s) => ({
      time: s.time,
      title: s.title,
      location: s.location,
      done: s.done,
    })),
    meals: data.meals.map((m) => ({
      mealType: m.mealType,
      food: m.food,
      time: m.time,
      note: m.note,
    })),
    balance: data.balance,
    transactions: data.transactions.map((tx) => ({
      description: tx.description,
      amount: tx.amount,
      time: tx.time,
    })),
    memos: data.memos.map((m) => ({
      content: m.content,
      done: m.done,
    })),
    notes: data.notes.map((n) => ({
      title: n.title,
      content: n.content,
    })),
    diary: data.diary.map((d) => ({
      date: d.date,
      mood: d.mood,
      content: d.content,
      weather: d.weather,
    })),
  };
}

// ============================================================
// Property Tests
// ============================================================

describe("PeekPhoneYAML", () => {
  /**
   * **Feature: peek-phone-ai-content, Property 1: YAML Round-Trip Consistency**
   * **Validates: Requirements 3.1, 3.3, 3.4**
   *
   * For any valid PeekPhoneData, parse(print(data)) should produce
   * equivalent content fields (ignoring generated ids and timestamps).
   */
  it("Property 1: YAML Round-Trip Consistency", () => {
    fc.assert(
      fc.property(arbPeekPhoneData, (data) => {
        const yaml = printFullData(data);
        const parsed = parseFullData(yaml);
        expect(stripMeta(parsed)).toEqual(stripMeta(data));
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Feature: peek-phone-ai-content, Property 2: Malformed YAML Produces Valid Fallback**
   * **Validates: Requirements 3.2**
   *
   * For any arbitrary string, the parser should never crash and should
   * return a structurally valid result with empty arrays and zero balance.
   */
  it("Property 2: Malformed YAML Produces Valid Fallback", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 200 }), (garbage) => {
        const parsed = parseFullData(garbage);

        // Must be structurally valid
        expect(Array.isArray(parsed.chats)).toBe(true);
        expect(Array.isArray(parsed.schedule)).toBe(true);
        expect(Array.isArray(parsed.meals)).toBe(true);
        expect(Array.isArray(parsed.memos)).toBe(true);
        expect(Array.isArray(parsed.notes)).toBe(true);
        expect(Array.isArray(parsed.diary)).toBe(true);
        expect(Array.isArray(parsed.transactions)).toBe(true);
        expect(typeof parsed.balance).toBe("number");
        expect(typeof parsed.characterId).toBe("string");
      }),
      { numRuns: 100 },
    );
  });
});
