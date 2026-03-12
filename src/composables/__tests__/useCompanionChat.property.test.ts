/**
 * Property-Based Tests for Companion Chat Core Logic
 * Feature: book-companion-chat
 *
 * Tests Properties 1-7 from the design document.
 * Tests the pure CompanionChatCore class and getAccumulatedContent function.
 */

import type { BookChapter } from "@/types/book";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
    buildSyncData,
    CompanionChatCore,
    getAccumulatedContent,
} from "../useCompanionChat";

/** Arbitrary: trigger frequency between 1 and 20 */
const frequencyArb = fc.integer({ min: 1, max: 20 });

/** Arbitrary: chapter index (non-negative) */
const chapterIndexArb = fc.integer({ min: 0, max: 100 });

/** Arbitrary: a BookChapter with random content */
const bookChapterArb = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 30 }),
  content: fc.string({ minLength: 0, maxLength: 500 }),
  order: fc.nat(),
});

/**
 * **Feature: book-companion-chat, Property 1: Page turn trigger fires at exact threshold**
 *
 * *For any* trigger frequency N (1-20) and any sequence of page turns,
 * the system should trigger AI response exactly when the page turn counter
 * reaches N, and not before.
 *
 * **Validates: Requirements 3.1**
 */
describe("Property 1: Page turn trigger fires at exact threshold", () => {
  it("triggers exactly at the Nth page turn and not before", () => {
    fc.assert(
      fc.property(
        frequencyArb,
        fc.array(chapterIndexArb, { minLength: 1, maxLength: 40 }),
        (frequency, chapterIndices) => {
          const core = new CompanionChatCore();
          core.start();
          core.setTriggerFrequency(frequency);

          for (let i = 0; i < chapterIndices.length; i++) {
            const triggered = core.onPageTurn(chapterIndices[i]);
            const turnNumber = i + 1; // 1-based turn count within current cycle

            if (turnNumber % frequency === 0) {
              // Should trigger at exact threshold
              expect(triggered).toBe(true);
              // Reset after trigger (simulating what the composable does)
              core.resetAfterTrigger();
            } else {
              expect(triggered).toBe(false);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * **Feature: book-companion-chat, Property 2: Trigger resets counter and accumulated content**
 *
 * *For any* trigger event, after the trigger fires, the page turn counter
 * should be 0 and the accumulated chapters list should be empty.
 *
 * **Validates: Requirements 3.2**
 */
describe("Property 2: Trigger resets counter and accumulated content", () => {
  it("after resetAfterTrigger, counter is 0 and accumulated chapters is empty", () => {
    fc.assert(
      fc.property(
        frequencyArb,
        fc.array(chapterIndexArb, { minLength: 1, maxLength: 20 }),
        (frequency, chapterIndices) => {
          const core = new CompanionChatCore();
          core.start();
          core.setTriggerFrequency(frequency);

          // Accumulate some page turns
          for (const idx of chapterIndices) {
            core.onPageTurn(idx);
          }

          // Trigger reset
          core.resetAfterTrigger();

          expect(core.pageTurnCounter).toBe(0);
          expect(core.accumulatedChapterIndices).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * **Feature: book-companion-chat, Property 3: Content accumulation grows with each page turn below threshold**
 *
 * *For any* page turn where the counter is below the threshold, the accumulated
 * chapters list should grow by exactly one entry containing the turned-to chapter's index.
 *
 * **Validates: Requirements 3.3**
 */
describe("Property 3: Content accumulation grows with each page turn below threshold", () => {
  it("each page turn below threshold adds exactly one chapter index", () => {
    fc.assert(
      fc.property(
        frequencyArb.filter((f) => f >= 2), // need at least 2 so we can have a turn below threshold
        chapterIndexArb,
        (frequency, chapterIndex) => {
          const core = new CompanionChatCore();
          core.start();
          core.setTriggerFrequency(frequency);

          const prevLength = core.accumulatedChapterIndices.length;
          const triggered = core.onPageTurn(chapterIndex);

          // First turn with frequency >= 2 should not trigger
          expect(triggered).toBe(false);
          expect(core.accumulatedChapterIndices.length).toBe(prevLength + 1);
          expect(
            core.accumulatedChapterIndices[
              core.accumulatedChapterIndices.length - 1
            ],
          ).toBe(chapterIndex);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * **Feature: book-companion-chat, Property 4: Accumulated content only contains current cycle chapters**
 *
 * *For any* sequence of triggers and page turns, the accumulated content at any
 * point should only contain chapter indices from after the most recent trigger.
 *
 * **Validates: Requirements 3.4**
 */
describe("Property 4: Accumulated content only contains current cycle chapters", () => {
  it("after a trigger+reset, accumulated chapters only contain post-reset turns", () => {
    fc.assert(
      fc.property(
        frequencyArb,
        fc.array(chapterIndexArb, { minLength: 1, maxLength: 10 }),
        fc.array(chapterIndexArb, { minLength: 1, maxLength: 10 }),
        (frequency, beforeTrigger, afterTrigger) => {
          const core = new CompanionChatCore();
          core.start();
          core.setTriggerFrequency(frequency);

          // Accumulate some turns before trigger
          for (const idx of beforeTrigger) {
            core.onPageTurn(idx);
          }

          // Simulate trigger reset
          core.resetAfterTrigger();

          // Accumulate turns after trigger
          const postResetIndices: number[] = [];
          for (const idx of afterTrigger) {
            core.onPageTurn(idx);
            postResetIndices.push(idx);
          }

          // Accumulated should only contain post-reset indices
          expect(core.accumulatedChapterIndices).toEqual(postResetIndices);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * **Feature: book-companion-chat, Property 5: Content truncation respects character limit**
 *
 * *For any* accumulated content string, the result of the truncation function
 * should have length less than or equal to the configured maximum (default 3000 characters).
 *
 * **Validates: Requirements 3.5**
 */
describe("Property 5: Content truncation respects character limit", () => {
  it("getAccumulatedContent output never exceeds maxChars + ellipsis overhead", () => {
    fc.assert(
      fc.property(
        fc.array(bookChapterArb, { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 100, max: 5000 }),
        (chapters, maxChars) => {
          const indices = chapters.map((_, i) => i);
          const result = getAccumulatedContent(chapters, indices, maxChars);

          // The ellipsis marker "...（中間內容省略）..." adds some overhead
          // but the two halves together should be <= maxChars
          // The actual content (excluding the ellipsis) should respect the limit
          // For the truncated case: head (maxChars/2) + tail (maxChars/2) + ellipsis
          // For the non-truncated case: content <= maxChars, so result <= maxChars
          const ellipsisOverhead = "\n\n...（中間內容省略）...\n\n".length;
          expect(result.length).toBeLessThanOrEqual(
            maxChars + ellipsisOverhead,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * **Feature: book-companion-chat, Property 6: Frequency change resets counter**
 *
 * *For any* trigger frequency value, setting a new frequency should result
 * in the page turn counter being 0.
 *
 * **Validates: Requirements 2.2**
 */
describe("Property 6: Frequency change resets counter", () => {
  it("setTriggerFrequency always resets pageTurnCounter to 0", () => {
    fc.assert(
      fc.property(
        frequencyArb,
        frequencyArb,
        fc.array(chapterIndexArb, { minLength: 0, maxLength: 10 }),
        (initialFreq, newFreq, turns) => {
          const core = new CompanionChatCore();
          core.start();
          core.setTriggerFrequency(initialFreq);

          // Do some page turns to build up counter
          for (const idx of turns) {
            core.onPageTurn(idx);
          }

          // Change frequency
          core.setTriggerFrequency(newFreq);

          expect(core.pageTurnCounter).toBe(0);
          expect(core.triggerFrequency).toBe(newFreq);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * **Feature: book-companion-chat, Property 7: Stop companion resets all state**
 *
 * *For any* active companion chat state, stopping the companion should result
 * in isActive being false, counter being 0, accumulated content being empty,
 * and messages being empty.
 *
 * **Validates: Requirements 1.3**
 */
describe("Property 7: Stop companion resets all state", () => {
  it("stop() resets isActive, counter, accumulated chapters, and messages", () => {
    fc.assert(
      fc.property(
        frequencyArb,
        fc.array(chapterIndexArb, { minLength: 0, maxLength: 10 }),
        fc.array(
          fc.record({
            id: fc.uuid(),
            role: fc.constantFrom("user" as const, "assistant" as const),
            content: fc.string({ minLength: 1, maxLength: 100 }),
            timestamp: fc.nat(),
            senderName: fc.string({ minLength: 1, maxLength: 20 }),
          }),
          { minLength: 0, maxLength: 5 },
        ),
        (frequency, turns, msgs) => {
          const core = new CompanionChatCore();
          core.start();
          core.setTriggerFrequency(frequency);

          // Build up state
          for (const idx of turns) {
            core.onPageTurn(idx);
          }
          core.messages = [...msgs];

          // Stop
          core.stop();

          expect(core.isActive).toBe(false);
          expect(core.pageTurnCounter).toBe(0);
          expect(core.accumulatedChapterIndices).toEqual([]);
          expect(core.messages).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * **Feature: book-companion-chat, Property 8: Unread indicator reflects collapsed state with new messages**
 *
 * *For any* state where the panel is collapsed (isPanelExpanded = false) and a new
 * assistant message has been added since the last panel expansion, hasUnread should
 * be true. Conversely, if the panel is expanded, hasUnread should be false.
 *
 * **Validates: Requirements 4.5**
 */
describe("Property 8: Unread indicator reflects collapsed state with new messages", () => {
  it("hasUnread is true when panel is collapsed and new assistant message arrives; false when expanded", () => {
    fc.assert(
      fc.property(
        fc.boolean(), // whether panel starts expanded
        fc.nat({ max: 5 }), // number of assistant messages to add
        (startExpanded, msgCount) => {
          const core = new CompanionChatCore();
          core.start();

          // Set initial panel state
          if (!startExpanded) {
            core.togglePanel(); // collapse it
          }

          // Add assistant messages
          for (let i = 0; i < msgCount; i++) {
            core.onNewAssistantMessage();
          }

          if (core.isPanelExpanded) {
            // Panel is expanded → hasUnread should always be false
            expect(core.hasUnread).toBe(false);
          } else if (msgCount > 0) {
            // Panel is collapsed and messages arrived → hasUnread should be true
            expect(core.hasUnread).toBe(true);
          }

          // Now expand the panel → hasUnread should become false
          if (!core.isPanelExpanded) {
            core.togglePanel(); // expand
          }
          expect(core.hasUnread).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/** Arbitrary: a CompanionMessage */
const companionMessageArb = fc.record({
  id: fc.uuid(),
  role: fc.constantFrom("user" as const, "assistant" as const),
  content: fc.string({ minLength: 1, maxLength: 200 }),
  timestamp: fc.nat(),
  senderName: fc.string({ minLength: 1, maxLength: 30 }),
});

/**
 * **Feature: book-companion-chat, Property 9: Sync to main chat produces valid GroupChatHistoryCard data**
 *
 * *For any* set of companion messages from a completed round, the resulting
 * groupChatHistoryData should contain: a groupName matching "📖 共讀：{bookTitle}",
 * and a messages array where each entry has senderName, content, timestamp, and
 * isUser fields matching the original companion messages.
 *
 * **Validates: Requirements 6.1, 6.2**
 */
describe("Property 9: Sync to main chat produces valid GroupChatHistoryCard data", () => {
  it("buildSyncData produces correct groupName and message mapping", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }), // bookTitle
        fc.array(companionMessageArb, { minLength: 1, maxLength: 10 }),
        (bookTitle, msgs) => {
          const result = buildSyncData(bookTitle, msgs);

          // groupName must match the expected format
          expect(result.groupName).toBe(`📖 共讀：${bookTitle}`);

          // messages array length must match
          expect(result.messages.length).toBe(msgs.length);

          // Each message must have correct fields
          for (let i = 0; i < msgs.length; i++) {
            const original = msgs[i];
            const synced = result.messages[i];

            expect(synced.senderName).toBe(original.senderName);
            expect(synced.content).toBe(original.content);
            expect(synced.timestamp).toBe(original.timestamp);
            expect(synced.isUser).toBe(original.role === "user");
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Import persistence pure functions
import {
    deserializeCompanionState,
    serializeCompanionState,
} from "../useCompanionChat";

/** Arbitrary: a valid CompanionChatState */
const companionChatStateArb = fc.record({
  bookId: fc.uuid(),
  characterId: fc.uuid(),
  triggerFrequency: fc.integer({ min: 1, max: 20 }),
  pageTurnCounter: fc.integer({ min: 0, max: 100 }),
  bubblePosition: fc.record({
    x: fc.integer({ min: 0, max: 1000 }),
    y: fc.integer({ min: 0, max: 1000 }),
  }),
  messages: fc.array(companionMessageArb, { minLength: 0, maxLength: 10 }),
});

/**
 * **Feature: book-companion-chat, Property 10: Companion state persistence round-trip**
 *
 * *For any* valid CompanionChatState object, serializing it and then deserializing
 * it should produce an equivalent object (same bookId, characterId, triggerFrequency,
 * pageTurnCounter, bubblePosition, and messages).
 *
 * **Validates: Requirements 7.1, 7.2**
 */
describe("Property 10: Companion state persistence round-trip", () => {
  it("serialize then deserialize produces an equivalent CompanionChatState", () => {
    fc.assert(
      fc.property(companionChatStateArb, (state) => {
        const serialized = serializeCompanionState(
          state.bookId,
          state.characterId,
          state.triggerFrequency,
          state.pageTurnCounter,
          state.bubblePosition,
          state.messages,
        );

        const deserialized = deserializeCompanionState(serialized);

        // All fields must be equivalent
        expect(deserialized.bookId).toBe(state.bookId);
        expect(deserialized.characterId).toBe(state.characterId);
        expect(deserialized.triggerFrequency).toBe(state.triggerFrequency);
        expect(deserialized.pageTurnCounter).toBe(state.pageTurnCounter);
        expect(deserialized.bubblePosition).toEqual(state.bubblePosition);
        expect(deserialized.messages.length).toBe(state.messages.length);

        for (let i = 0; i < state.messages.length; i++) {
          const original = state.messages[i];
          const restored = deserialized.messages[i];
          expect(restored.id).toBe(original.id);
          expect(restored.role).toBe(original.role);
          expect(restored.content).toBe(original.content);
          expect(restored.timestamp).toBe(original.timestamp);
          expect(restored.senderName).toBe(original.senderName);
        }
      }),
      { numRuns: 100 },
    );
  });
});
