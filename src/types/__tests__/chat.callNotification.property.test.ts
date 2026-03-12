/**
 * Property-Based Tests for Post-Call Reaction
 * Feature: post-call-reaction
 *
 * Tests Property 6 from the design document
 */

import type { ChatMessage } from "@/types/chat";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

// ===== Arbitraries =====

/** Call notification type Arbitrary */
const callNotificationTypeArbitrary = fc.constantFrom(
  "declined" as const,
  "missed" as const,
);

/** Call reason Arbitrary */
const callReasonArbitrary = fc.string({ minLength: 1, maxLength: 200 });

/** Call notification ChatMessage Arbitrary */
const callNotificationMessageArbitrary: fc.Arbitrary<ChatMessage> = fc
  .record({
    id: fc.uuid(),
    sender: fc.constant("system" as const),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    content: fc.string({ minLength: 1, maxLength: 200 }),
    is_user: fc.constant(false),
    status: fc.constant("sent" as const),
    createdAt: fc.integer({ min: 0, max: Date.now() }),
    updatedAt: fc.integer({ min: 0, max: Date.now() }),
    isCallNotification: fc.constant(true),
    callNotificationType: callNotificationTypeArbitrary,
    callReason: callReasonArbitrary,
  })
  .map((msg) => msg as ChatMessage);

describe("Post-Call Reaction Property Tests", () => {
  /**
   * **Feature: post-call-reaction, Property 6: Notification card metadata persistence**
   *
   * *For any* call notification card with a given type and reason, after serialization
   * and deserialization (round-trip through JSON), the `callNotificationType` and
   * `callReason` fields SHALL be preserved.
   *
   * **Validates: Requirements 4.4**
   */
  describe("Property 6: Notification card metadata persistence", () => {
    it("JSON round-trip preserves callNotificationType and callReason", () => {
      fc.assert(
        fc.property(callNotificationMessageArbitrary, (msg) => {
          const serialized = JSON.stringify(msg);
          const deserialized: ChatMessage = JSON.parse(serialized);

          expect(deserialized.isCallNotification).toBe(true);
          expect(deserialized.callNotificationType).toBe(
            msg.callNotificationType,
          );
          expect(deserialized.callReason).toBe(msg.callReason);
        }),
        { numRuns: 100 },
      );
    });

    it("deep equality holds after round-trip for call notification messages", () => {
      fc.assert(
        fc.property(callNotificationMessageArbitrary, (msg) => {
          const serialized = JSON.stringify(msg);
          const deserialized: ChatMessage = JSON.parse(serialized);

          expect(deserialized).toEqual(msg);
        }),
        { numRuns: 100 },
      );
    });
  });
});
