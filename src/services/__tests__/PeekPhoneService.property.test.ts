/**
 * Property-based tests for PeekPhoneService
 */
import type { Chat, ChatMessage } from "@/types/chat";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { extractChatContext } from "../PeekPhoneService";

// ============================================================
// Arbitraries
// ============================================================

/** Safe characters for message content */
const safeChars =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");

const safeStr = fc
  .array(fc.constantFrom(...safeChars), { minLength: 1, maxLength: 30 })
  .map((arr) => arr.join(""));

/** Arbitrary for a single ChatMessage */
const arbChatMessage: fc.Arbitrary<ChatMessage> = fc.record({
  id: fc.uuid(),
  sender: fc.constantFrom("user" as const, "assistant" as const),
  name: safeStr,
  content: safeStr,
  is_user: fc.boolean(),
  status: fc.constant("sent" as const),
  createdAt: fc.integer({ min: 1000000000000, max: 2000000000000 }),
  updatedAt: fc.integer({ min: 1000000000000, max: 2000000000000 }),
});

/** Arbitrary for a Chat with variable message count */
function arbChat(minMessages: number, maxMessages: number): fc.Arbitrary<Chat> {
  return fc
    .array(arbChatMessage, { minLength: minMessages, maxLength: maxMessages })
    .map((messages) => ({
      id: "test-chat",
      name: "Test Chat",
      characterId: "test-char",
      messages,
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
}

// ============================================================
// Property Tests
// ============================================================

describe("PeekPhoneService", () => {
  /**
   * **Feature: peek-phone-ai-content, Property 4: Context Extraction Respects Message Limit**
   * **Validates: Requirements 1.4**
   *
   * For any Chat with N messages (N >= 0), extractChatContext shall produce
   * a context string that references at most 30 messages, and those messages
   * shall be the most recent ones.
   */
  it("Property 4: Context Extraction Respects Message Limit", () => {
    fc.assert(
      fc.property(arbChat(0, 80), (chat) => {
        const context = extractChatContext(chat, 30);
        const messages = chat.messages;

        if (messages.length === 0) {
          // Empty chat should produce fallback text
          expect(context).toBeTruthy();
          return;
        }

        // Determine which messages should appear in context
        const expectedRecent = messages.slice(-30);

        // Each expected message's content should appear in the context
        for (const msg of expectedRecent) {
          // Content may be truncated to 100 chars, so check the prefix
          const prefix = msg.content.slice(0, 100);
          expect(context).toContain(prefix);
        }

        // Messages before the most recent 30 should NOT appear
        if (messages.length > 30) {
          const excluded = messages.slice(0, messages.length - 30);
          for (const msg of excluded) {
            // The excluded message's content should not be in the context
            // (since our safe strings are unique enough with UUIDs as ids)
            // We check that the full "sender: content" line is absent
            const sender = msg.is_user ? "用戶" : msg.name;
            const line = `${sender}: ${msg.content}`;
            expect(context).not.toContain(line);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
