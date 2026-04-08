/**
 * ResponseParser 屬性測試
 * **Feature: character-incoming-call, Property 1: 標籤解析正確性**
 * **Validates: Requirements 1.1, 1.4**
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  isValidDelayFormat,
  parseAffinityUpdateTags,
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

describe("ResponseParser - MVU affinity command parsing", () => {
  it("parses _.assign as absolute assignment", () => {
    const updates = parseAffinityUpdateTags(
      `<update>_.assign('黎靖青.目前模式', '恋人');</update>`,
    );

    expect(updates).toEqual([
      {
        metric: "黎靖青.目前模式",
        change: 0,
        reason: "MVU _.assign",
        stringValue: "恋人",
        isAbsolute: true,
      },
    ]);
  });

  it("parses _.add as delta update", () => {
    const updates = parseAffinityUpdateTags(
      `<update>_.add('黎靖青.亲密值', 2);</update>`,
    );

    expect(updates).toEqual([
      {
        metric: "黎靖青.亲密值",
        change: 2,
        reason: "MVU _.add",
      },
    ]);
  });

  it("parses JSONPatch move with sourceMetric metadata", () => {
    const updates = parseAffinityUpdateTags(
      `<UpdateVariable><JSONPatch>[{"op":"move","from":"/黎靖青/目前模式","path":"/黎靖青/待办事项"}]</JSONPatch></UpdateVariable>`,
    );

    expect(updates).toEqual([
      {
        metric: "黎靖青.待办事项",
        change: 0,
        reason: "MVU JSONPatch",
        isAbsolute: true,
        sourceMetric: "黎靖青.目前模式",
      },
    ]);
  });

  it("parses _.unset and _.delete as remove operations", () => {
    const updates = parseAffinityUpdateTags(
      `<update>_.unset('黎靖青.隐藏线索');_.delete('黎靖青.废弃字段');</update>`,
    );

    expect(updates).toEqual([
      {
        metric: "黎靖青.隐藏线索",
        change: 0,
        reason: "MVU _.unset",
        operation: "remove",
      },
      {
        metric: "黎靖青.废弃字段",
        change: 0,
        reason: "MVU _.delete",
        operation: "remove",
      },
    ]);
  });

  it("parses JSONPatch remove and insert as object-tree operations", () => {
    const updates = parseAffinityUpdateTags(
      `<UpdateVariable><JSONPatch>[{"op":"remove","path":"/黎靖青/隐藏线索"},{"op":"insert","path":"/黎靖青/标签/1","value":"新标签"}]</JSONPatch></UpdateVariable>`,
    );

    expect(updates).toEqual([
      {
        metric: "黎靖青.隐藏线索",
        change: 0,
        reason: "MVU JSONPatch",
        operation: "remove",
      },
      {
        metric: "黎靖青.标签",
        change: 0,
        reason: "MVU JSONPatch",
        operation: "insert",
        stringValue: "新标签",
        insertIndex: 1,
      },
    ]);
  });
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
            // Build a realistic AI response with think, content, and schedule-call
            const response = `
<think>Some thinking content ${otherContent}</think>
<content>
<msg>Hello!</msg>
</content>
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
