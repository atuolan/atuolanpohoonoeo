/**
 * Property-Based Tests for XmlFuzzyRepair
 * Feature: group-chat
 *
 * Tests Property 10 from the design document
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { repairXmlTags } from "../XmlFuzzyRepair";

// ===== Known repair rule patterns =====

const REPAIRABLE_TAGS = [
  "msg",
  "recall",
  "dm",
  "group-action",
  "output",
  "think",
] as const;

const DASH_REPAIRABLE_TAGS = [
  "msg",
  "recall",
  "dm",
  "group-action",
  "pay",
  "refund",
  "redpacket",
  "location",
  "reply-to",
  "送禮物",
] as const;

const SPELLING_VARIANTS: Record<string, string> = {
  messge: "msg",
  messg: "msg",
  mesage: "msg",
  message: "msg",
  mesg: "msg",
  recal: "recall",
  recll: "recall",
  recalll: "recall",
  "group-acton": "group-action",
  "group-actoin": "group-action",
  groupaction: "group-action",
  "group-acion": "group-action",
};

// ===== Arbitraries =====

const safeContentArbitrary = fc
  .array(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz你好世界測試內容".split("")),
    { minLength: 1, maxLength: 20 },
  )
  .map((arr) => arr.join(""));

const nameArbitrary = fc
  .array(fc.constantFrom(..."abcABC阿瓜雲小明大白兔貓咪".split("")), {
    minLength: 1,
    maxLength: 8,
  })
  .map((arr) => arr.join(""));

const spacesArbitrary = fc
  .array(fc.constant(" "), { minLength: 1, maxLength: 3 })
  .map((arr) => arr.join(""));

const dashesArbitrary = fc
  .array(fc.constant("-"), { minLength: 1, maxLength: 3 })
  .map((arr) => arr.join(""));

describe("XmlFuzzyRepair Property Tests", () => {
  /**
   * **Feature: group-chat, Property 10: Fuzzy repair correctness**
   *
   * *For any* known misspelling pattern (from the repair rule set), applying fuzzy
   * repair should produce the correct canonical tag, and the repair log should contain
   * both the original and repaired strings.
   *
   * **Validates: Requirements 5.1, 5.5**
   */
  describe("Property 10: Fuzzy repair correctness", () => {
    it("extra-space-in-tag: leading spaces are removed and logged", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...REPAIRABLE_TAGS),
          spacesArbitrary,
          safeContentArbitrary,
          (tag, spaces, content) => {
            const malformed = `<${spaces}${tag}>${content}</${tag}>`;
            const result = repairXmlTags(malformed);

            expect(result.content).toContain(`<${tag}>`);
            expect(result.content).toContain(content);
            expect(result.wasRepaired).toBe(true);
            expect(result.logs.length).toBeGreaterThan(0);
            for (const log of result.logs) {
              expect(log.original.length).toBeGreaterThan(0);
              expect(log.repaired.length).toBeGreaterThan(0);
              expect(log.rule.length).toBeGreaterThan(0);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("extra-symbol-before-tag: leading dashes are removed and logged", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...DASH_REPAIRABLE_TAGS),
          dashesArbitrary,
          safeContentArbitrary,
          (tag, dashes, content) => {
            const malformed = `<${dashes}${tag}>${content}</${tag}>`;
            const result = repairXmlTags(malformed);

            expect(result.content).toContain(`<${tag}>`);
            expect(result.content).toContain(content);
            expect(result.wasRepaired).toBe(true);
            expect(result.logs.length).toBeGreaterThan(0);
            for (const log of result.logs) {
              expect(log.original.length).toBeGreaterThan(0);
              expect(log.repaired.length).toBeGreaterThan(0);
              expect(log.rule.length).toBeGreaterThan(0);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("spelling-variant: misspellings are corrected to canonical tags and logged", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...Object.keys(SPELLING_VARIANTS)),
          safeContentArbitrary,
          (misspelling, content) => {
            const correct = SPELLING_VARIANTS[misspelling];
            const malformed = `<${misspelling}>${content}</${misspelling}>`;
            const result = repairXmlTags(malformed);

            expect(result.content).toContain(`<${correct}>`);
            expect(result.content).toContain(`</${correct}>`);
            expect(result.content).toContain(content);
            expect(result.wasRepaired).toBe(true);
            expect(result.logs.some((l) => l.rule === "spelling-variant")).toBe(
              true,
            );
            for (const log of result.logs) {
              expect(log.original.length).toBeGreaterThan(0);
              expect(log.repaired.length).toBeGreaterThan(0);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("unclosed-attribute-quote: missing closing quote is inserted and logged", () => {
      fc.assert(
        fc.property(nameArbitrary, safeContentArbitrary, (name, content) => {
          const malformed = `<msg name="${name}>${content}</msg>`;
          const result = repairXmlTags(malformed);

          expect(result.content).toContain(`name="${name}"`);
          expect(result.content).toContain(content);
          expect(result.wasRepaired).toBe(true);
          expect(
            result.logs.some((l) => l.rule === "unclosed-attribute-quote"),
          ).toBe(true);
          for (const log of result.logs) {
            expect(log.original).toBeDefined();
            expect(log.repaired).toBeDefined();
            expect(log.rule).toBeDefined();
          }
        }),
        { numRuns: 100 },
      );
    });

    it("unclosed-msg-tag: missing </msg> is inserted before next <msg> and logged", () => {
      fc.assert(
        fc.property(
          nameArbitrary,
          nameArbitrary,
          safeContentArbitrary,
          safeContentArbitrary,
          (name1, name2, content1, content2) => {
            const malformed = `<msg name="${name1}">${content1}<msg name="${name2}">${content2}</msg>`;
            const result = repairXmlTags(malformed);

            expect(result.content).toContain(`${content1}</msg>`);
            expect(result.content).toContain(content2);
            expect(result.wasRepaired).toBe(true);
            expect(result.logs.some((l) => l.rule === "unclosed-msg-tag")).toBe(
              true,
            );
            for (const log of result.logs) {
              expect(log.original).toBeDefined();
              expect(log.repaired).toBeDefined();
              expect(log.rule).toBeDefined();
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("valid XML passes through unchanged with no repair logs", () => {
      fc.assert(
        fc.property(nameArbitrary, safeContentArbitrary, (name, content) => {
          const valid = `<msg name="${name}">${content}</msg>`;
          const result = repairXmlTags(valid);

          expect(result.content).toBe(valid);
          expect(result.wasRepaired).toBe(false);
          expect(result.logs).toHaveLength(0);
        }),
        { numRuns: 100 },
      );
    });
  });
});
