/**
 * Property-based tests for PeekPhonePromptBuilder
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
    buildGroupAPrompt,
    buildGroupBPrompt,
    buildGroupCPrompt,
} from "../PeekPhonePromptBuilder";

/**
 * Safe non-empty string arbitrary that avoids empty strings.
 * Uses alphanumeric + CJK characters to simulate realistic character data.
 */
const safeChars =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\u4e00\u4e01\u4e03\u4e09\u4e0a\u4e0b\u4e2d\u4eba\u5927\u5c0f\u597d\u5929\u6c23".split(
    "",
  );

const nonEmptyStr = fc
  .array(fc.constantFrom(...safeChars), { minLength: 1, maxLength: 30 })
  .map((arr) => arr.join(""));

describe("PeekPhonePromptBuilder", () => {
  /**
   * **Feature: peek-phone-ai-content, Property 3: Prompt Contains All Character Fields**
   * **Validates: Requirements 2.2, 2.3**
   *
   * For any character name, description, personality, scenario, and chat context,
   * every built prompt (A, B, C) must contain all five strings as substrings.
   */
  it("Property 3: Prompt Contains All Character Fields", () => {
    fc.assert(
      fc.property(
        nonEmptyStr,
        nonEmptyStr,
        nonEmptyStr,
        nonEmptyStr,
        nonEmptyStr,
        (charName, charDesc, personality, scenario, chatContext) => {
          const prompts = [
            buildGroupAPrompt(
              charName,
              charDesc,
              personality,
              scenario,
              chatContext,
            ),
            buildGroupBPrompt(
              charName,
              charDesc,
              personality,
              scenario,
              chatContext,
            ),
            buildGroupCPrompt(
              charName,
              charDesc,
              personality,
              scenario,
              chatContext,
            ),
          ];

          for (const prompt of prompts) {
            expect(prompt).toContain(charName);
            expect(prompt).toContain(charDesc);
            expect(prompt).toContain(personality);
            expect(prompt).toContain(scenario);
            expect(prompt).toContain(chatContext);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
