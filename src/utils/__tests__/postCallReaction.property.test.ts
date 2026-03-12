/**
 * Property-Based Tests for Post-Call Reaction
 * Feature: post-call-reaction
 *
 * Tests Properties 1–5 from the design document.
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
    buildPostCallPrompt,
    createCallNotificationCard,
    type CallNotificationType,
} from "../postCallReaction";

// ===== Arbitraries =====

const callTypeArbitrary: fc.Arbitrary<CallNotificationType> = fc.constantFrom(
  "declined" as const,
  "missed" as const,
);

const nonEmptyStringArbitrary = fc.string({ minLength: 1, maxLength: 200 });

const characterNameArbitrary = fc.string({ minLength: 1, maxLength: 50 });

const userNameArbitrary = fc.string({ minLength: 1, maxLength: 50 });

const reasonArbitrary = fc.string({ minLength: 1, maxLength: 300 });

describe("Post-Call Reaction Property Tests", () => {
  /**
   * **Feature: post-call-reaction, Property 1: Call notification card insertion**
   *
   * *For any* pending call and any call result type (declined or missed),
   * inserting a call notification card SHALL produce a message with
   * `isCallNotification === true` and `callNotificationType` matching the given type.
   *
   * **Validates: Requirements 1.1, 2.1**
   */
  describe("Property 1: Call notification card insertion", () => {
    it("creates a card with correct isCallNotification and callNotificationType", () => {
      fc.assert(
        fc.property(
          callTypeArbitrary,
          characterNameArbitrary,
          reasonArbitrary,
          (type, charName, reason) => {
            const card = createCallNotificationCard(type, charName, reason);

            expect(card.isCallNotification).toBe(true);
            expect(card.callNotificationType).toBe(type);
            expect(card.callReason).toBe(reason);
            expect(card.role).toBe("system");
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Feature: post-call-reaction, Property 2: Call reason inclusion in prompt**
   *
   * *For any* call type (declined or missed) and any non-empty reason string,
   * the built post-call prompt SHALL contain the original reason string.
   *
   * **Validates: Requirements 1.3, 2.3, 5.3**
   */
  describe("Property 2: Call reason inclusion in prompt", () => {
    it("prompt contains the call reason", () => {
      fc.assert(
        fc.property(
          callTypeArbitrary,
          reasonArbitrary,
          characterNameArbitrary,
          userNameArbitrary,
          (type, reason, charName, userName) => {
            const prompt = buildPostCallPrompt(
              type,
              reason,
              charName,
              userName,
            );
            expect(prompt).toContain(reason);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Feature: post-call-reaction, Property 3: Declined prompt conveys intentional rejection**
   *
   * *For any* declined call, the built post-call prompt SHALL contain language
   * indicating the user intentionally rejected the call.
   *
   * **Validates: Requirements 1.4, 5.1**
   */
  describe("Property 3: Declined prompt conveys intentional rejection", () => {
    it("declined prompt contains intentional rejection language", () => {
      fc.assert(
        fc.property(
          reasonArbitrary,
          characterNameArbitrary,
          userNameArbitrary,
          (reason, charName, userName) => {
            const prompt = buildPostCallPrompt(
              "declined",
              reason,
              charName,
              userName,
            );
            const hasRejectionLanguage =
              prompt.includes("拒接") || prompt.includes("故意不接");
            expect(hasRejectionLanguage).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Feature: post-call-reaction, Property 4: Missed prompt conveys uncertainty**
   *
   * *For any* missed call, the built post-call prompt SHALL contain language
   * indicating the user's availability is unknown.
   *
   * **Validates: Requirements 2.4, 5.2**
   */
  describe("Property 4: Missed prompt conveys uncertainty", () => {
    it("missed prompt contains uncertainty language", () => {
      fc.assert(
        fc.property(
          reasonArbitrary,
          characterNameArbitrary,
          userNameArbitrary,
          (reason, charName, userName) => {
            const prompt = buildPostCallPrompt(
              "missed",
              reason,
              charName,
              userName,
            );
            const hasUncertaintyLanguage =
              prompt.includes("不確定") || prompt.includes("沒人接");
            expect(hasUncertaintyLanguage).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Feature: post-call-reaction, Property 5: Prompt instructs text message format**
   *
   * *For any* call type, the built post-call prompt SHALL contain instructions
   * specifying that the response should be a text message, not a phone conversation.
   *
   * **Validates: Requirements 6.1, 6.2**
   */
  describe("Property 5: Prompt instructs text message format", () => {
    it("prompt instructs text message format, not phone conversation", () => {
      fc.assert(
        fc.property(
          callTypeArbitrary,
          reasonArbitrary,
          characterNameArbitrary,
          userNameArbitrary,
          (type, reason, charName, userName) => {
            const prompt = buildPostCallPrompt(
              type,
              reason,
              charName,
              userName,
            );
            expect(prompt).toContain("文字訊息");
            expect(prompt).toContain("不是電話通話");
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
