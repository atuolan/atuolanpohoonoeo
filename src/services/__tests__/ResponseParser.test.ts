/**
 * ResponseParser 屬性測試
 * **Feature: character-incoming-call, Property 1: 標籤解析正確性**
 * **Validates: Requirements 1.1, 1.4**
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  isValidDelayFormat,
  parseAIResponse,
  parseScheduleCallTag,
} from "../ResponseParser";

describe("ResponseParser - Schedule Call Tag Parsing", () => {
  /**
   * **Feature: character-incoming-call, Property 1: 標籤解析正確性**
   * **Validates: Requirements 1.1, 1.4**
   *
   * Property: For any AI response containing a valid <schedule-call> tag,
   * the parser should correctly extract delay and reason attributes.
   * For invalid tags (missing required attributes or malformed), it should return null.
   */
  describe("Property 1: Tag parsing correctness", () => {
    // Arbitrary for valid delay strings (number + unit)
    const validDelayArb = fc
      .tuple(
        fc.integer({ min: 1, max: 999 }),
        fc.constantFrom("s", "m", "h", "d", "S", "M", "H", "D"),
      )
      .map(([num, unit]) => `${num}${unit}`);

    // Arbitrary for non-empty reason strings (no quotes to avoid breaking XML attributes)
    const reasonArb = fc
      .string({ minLength: 1, maxLength: 100 })
      .filter(
        (s) =>
          !s.includes('"') &&
          !s.includes("'") &&
          !s.includes("<") &&
          !s.includes(">"),
      )
      .filter((s) => s.trim().length > 0);

    // Arbitrary for optional opening strings
    const openingArb = fc.option(
      fc
        .string({ minLength: 1, maxLength: 100 })
        .filter(
          (s) =>
            !s.includes('"') &&
            !s.includes("'") &&
            !s.includes("<") &&
            !s.includes(">"),
        ),
      { nil: undefined },
    );

    it("should correctly parse valid schedule-call tags with delay and reason", () => {
      fc.assert(
        fc.property(validDelayArb, reasonArb, (delay, reason) => {
          const tag = `<schedule-call delay="${delay}" reason="${reason}"/>`;
          const result = parseScheduleCallTag(tag);

          expect(result).not.toBeNull();
          expect(result!.delay.toLowerCase()).toBe(delay.toLowerCase());
          expect(result!.reason).toBe(reason);
        }),
        { numRuns: 100 },
      );
    });

    it("should correctly parse schedule-call tags with optional opening attribute", () => {
      fc.assert(
        fc.property(
          validDelayArb,
          reasonArb,
          openingArb,
          (delay, reason, opening) => {
            let tag: string;
            if (opening) {
              tag = `<schedule-call delay="${delay}" reason="${reason}" opening="${opening}"/>`;
            } else {
              tag = `<schedule-call delay="${delay}" reason="${reason}"/>`;
            }

            const result = parseScheduleCallTag(tag);

            expect(result).not.toBeNull();
            expect(result!.delay.toLowerCase()).toBe(delay.toLowerCase());
            expect(result!.reason).toBe(reason);
            if (opening) {
              expect(result!.opening).toBe(opening);
            } else {
              expect(result!.opening).toBeUndefined();
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should return null for tags missing delay attribute", () => {
      fc.assert(
        fc.property(reasonArb, (reason) => {
          const tag = `<schedule-call reason="${reason}"/>`;
          const result = parseScheduleCallTag(tag);
          expect(result).toBeNull();
        }),
        { numRuns: 100 },
      );
    });

    it("should return null for tags missing reason attribute", () => {
      fc.assert(
        fc.property(validDelayArb, (delay) => {
          const tag = `<schedule-call delay="${delay}"/>`;
          const result = parseScheduleCallTag(tag);
          expect(result).toBeNull();
        }),
        { numRuns: 100 },
      );
    });

    it("should return null for invalid delay formats", () => {
      // Generate invalid delay strings (not matching pattern: number + s/m/h/d)
      const invalidDelayArb = fc.oneof(
        fc.string().filter((s) => !isValidDelayFormat(s)), // Random strings
        fc.constant("abc"), // No number
        fc.constant("123"), // No unit
        fc.constant("5x"), // Invalid unit
        fc.constant(""), // Empty
      );

      fc.assert(
        fc.property(invalidDelayArb, reasonArb, (delay, reason) => {
          const tag = `<schedule-call delay="${delay}" reason="${reason}"/>`;
          const result = parseScheduleCallTag(tag);
          expect(result).toBeNull();
        }),
        { numRuns: 100 },
      );
    });

    it("should return null when no schedule-call tag is present", () => {
      fc.assert(
        fc.property(
          fc.string().filter((s) => !s.includes("<schedule-call")),
          (content) => {
            const result = parseScheduleCallTag(content);
            expect(result).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should extract schedule-call from full AI response with other tags", () => {
      fc.assert(
        fc.property(
          validDelayArb,
          reasonArb,
          fc.string(),
          (delay, reason, otherContent) => {
            // Build a realistic AI response with think, output, and schedule-call
            const response = `
<think>Some thinking content ${otherContent}</think>
<output>
<msg>Hello!</msg>
</output>
<schedule-call delay="${delay}" reason="${reason}"/>
`;
            const result = parseAIResponse(response);

            expect(result.hasScheduleCall).toBe(true);
            expect(result.scheduleCallData).not.toBeNull();
            expect(result.scheduleCallData!.delay.toLowerCase()).toBe(
              delay.toLowerCase(),
            );
            expect(result.scheduleCallData!.reason).toBe(reason);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("isValidDelayFormat", () => {
    it("should accept valid delay formats", () => {
      const validFormats = [
        "5s",
        "30m",
        "1h",
        "2d",
        "100s",
        "60m",
        "24h",
        "7d",
      ];
      validFormats.forEach((format) => {
        expect(isValidDelayFormat(format)).toBe(true);
      });
    });

    it("should accept case-insensitive units", () => {
      const formats = ["5S", "30M", "1H", "2D"];
      formats.forEach((format) => {
        expect(isValidDelayFormat(format)).toBe(true);
      });
    });

    it("should reject invalid formats", () => {
      const invalidFormats = ["", "abc", "5", "s5", "5x", "5.5s", "-5s", "5 s"];
      invalidFormats.forEach((format) => {
        expect(isValidDelayFormat(format)).toBe(false);
      });
    });
  });
});
