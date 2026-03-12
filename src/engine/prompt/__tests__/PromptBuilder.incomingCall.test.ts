/**
 * PromptBuilder 來電模式屬性測試
 *
 * **Feature: character-incoming-call, Property 8: 來電原因包含在提示詞中**
 * **Validates: Requirements 3.1, 3.2**
 *
 * Property: For any incoming call with a reason, the prompt builder
 * should include that reason in the context for generating the opening message.
 */

import type { StoredCharacter } from "@/types/character";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { PromptBuilderOptions } from "../PromptBuilder";
import { PromptBuilder } from "../PromptBuilder";

/**
 * Create a minimal mock character for testing
 */
function createMockCharacter(name: string = "Test Character"): StoredCharacter {
  return {
    id: crypto.randomUUID(),
    data: {
      name,
      description: "A test character",
      personality: "Friendly and helpful",
      scenario: "Testing scenario",
      first_mes: "Hello!",
      mes_example: "",
      creator_notes: "",
      system_prompt: "",
      post_history_instructions: "",
      alternate_greetings: [],
      tags: [],
      creator: "Test",
      character_version: "1.0",
      extensions: {
        talkativeness: 0.5,
        fav: false,
        world: "",
        depth_prompt: { prompt: "", depth: 0, role: "system" },
        regex_scripts: [],
      },
      character_book: undefined,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Create minimal PromptBuilder options for testing
 */
function createMinimalOptions(
  overrides: Partial<PromptBuilderOptions> = {},
): PromptBuilderOptions {
  return {
    character: createMockCharacter(),
    lorebooks: [],
    messages: [],
    settings: {
      maxContextLength: 4096,
      maxResponseLength: 1024,
      temperature: 0.7,
      topP: 1,
      topK: 0,
      frequencyPenalty: 0,
      presencePenalty: 0,
      repetitionPenalty: 1,
      stopSequences: [],
      streaming: false,
      useStreamingWindow: false,
    },
    userName: "User",
    ...overrides,
  };
}

/**
 * Helper function to get all message content as a single string
 */
function getAllMessageContent(messages: Array<{ content: string }>): string {
  return messages.map((m) => m.content).join("\n");
}

describe("PromptBuilder - Incoming Call Mode", () => {
  /**
   * **Feature: character-incoming-call, Property 8: 來電原因包含在提示詞中**
   * **Validates: Requirements 3.1, 3.2**
   *
   * Property: For any incoming call with a reason, the prompt builder
   * should include that reason in the context for generating the opening message.
   */
  describe("Property 8: Call reason in prompt", () => {
    // Arbitrary for non-empty call reasons (Chinese text that won't break XML)
    const callReasonArb = fc.oneof(
      fc.constant("想確認她有沒有去看醫生"),
      fc.constant("突然很想聽她的聲音"),
      fc.constant("答應她晚點打電話聊"),
      fc.constant("擔心她因為剛才說不舒服"),
      fc.constant("有驚喜要告訴她"),
      fc.constant("想問她今天過得怎麼樣"),
      fc.constant("有重要的事情要說"),
      fc.constant("想聽她的意見"),
    );

    // Arbitrary for phone context
    const phoneContextArb = fc.record({
      currentTime: fc.constantFrom("08:30", "12:00", "18:45", "22:15"),
      currentDate: fc.constantFrom("2026/02/01", "2026/01/15", "2025/12/25"),
      lastChatTime: fc.constantFrom("5 分鐘前", "1 小時前", "昨天", "3 天前"),
    });

    /**
     * Core property test: When incomingCallMode is true and callReason is provided,
     * the generated prompt MUST contain the callReason text.
     *
     * This validates Requirements 3.1 and 3.2:
     * - 3.1: WHEN the call is connected THEN the System SHALL use the reason attribute
     *        to generate the character's opening message
     * - 3.2: WHEN generating the opening message THEN the System SHALL include the
     *        call context (reason) in the prompt
     */
    it("should include callReason in prompt content when incomingCallMode is true", async () => {
      await fc.assert(
        fc.asyncProperty(
          callReasonArb,
          phoneContextArb,
          async (callReason, phoneContext) => {
            const options = createMinimalOptions({
              phoneCallMode: true,
              incomingCallMode: true,
              callReason,
              phoneContext,
            });

            const builder = new PromptBuilder(options);
            const result = await builder.build();

            // Get all message content
            const allContent = getAllMessageContent(result.messages);

            // The callReason MUST appear in the prompt content
            expect(allContent).toContain(callReason);
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Property: When incomingCallMode is false, the callReason should NOT
     * be included in the prompt (even if provided).
     */
    it("should NOT include incomingCallContext when incomingCallMode is false", async () => {
      await fc.assert(
        fc.asyncProperty(
          callReasonArb,
          phoneContextArb,
          async (callReason, phoneContext) => {
            const options = createMinimalOptions({
              phoneCallMode: true,
              incomingCallMode: false,
              callReason,
              phoneContext,
            });

            const builder = new PromptBuilder(options);
            const result = await builder.build();

            // Get all message content
            const allContent = getAllMessageContent(result.messages);

            // The "來電模式" header should NOT appear when incomingCallMode is false
            expect(allContent).not.toContain("📞 來電模式");
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Property: The prompt should contain the "來電模式" context block
     * when incomingCallMode is true with a valid callReason.
     */
    it("should include incoming call context block when incomingCallMode is true", async () => {
      await fc.assert(
        fc.asyncProperty(
          callReasonArb,
          phoneContextArb,
          async (callReason, phoneContext) => {
            const options = createMinimalOptions({
              phoneCallMode: true,
              incomingCallMode: true,
              callReason,
              phoneContext,
            });

            const builder = new PromptBuilder(options);
            const result = await builder.build();

            // Get all message content
            const allContent = getAllMessageContent(result.messages);

            // The incoming call context block should be present
            expect(allContent).toContain("📞 來電模式");
            expect(allContent).toContain("來電原因");
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Property: Phone context (time, date, lastChatTime) should also be
     * included in the prompt when incomingCallMode is true.
     */
    it("should include phone context in prompt when incomingCallMode is true", async () => {
      await fc.assert(
        fc.asyncProperty(
          callReasonArb,
          phoneContextArb,
          async (callReason, phoneContext) => {
            const options = createMinimalOptions({
              phoneCallMode: true,
              incomingCallMode: true,
              callReason,
              phoneContext,
            });

            const builder = new PromptBuilder(options);
            const result = await builder.build();

            // Get all message content
            const allContent = getAllMessageContent(result.messages);

            // Phone context should be present
            expect(allContent).toContain(phoneContext.currentTime);
            expect(allContent).toContain(phoneContext.lastChatTime);
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Property: The prompt should build successfully without errors
     * for any valid combination of incomingCallMode and callReason.
     */
    it("should build prompts without errors for all valid input combinations", async () => {
      await fc.assert(
        fc.asyncProperty(
          callReasonArb,
          phoneContextArb,
          fc.boolean(),
          async (callReason, phoneContext, incomingCallMode) => {
            const options = createMinimalOptions({
              phoneCallMode: true,
              incomingCallMode,
              callReason,
              phoneContext,
            });

            const builder = new PromptBuilder(options);
            const result = await builder.build();

            expect(result.messages).toBeDefined();
            expect(Array.isArray(result.messages)).toBe(true);
            expect(result.messages.length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Property: When callReason is undefined but incomingCallMode is true,
     * the prompt should still build without errors (graceful handling).
     */
    it("should handle undefined callReason gracefully", async () => {
      await fc.assert(
        fc.asyncProperty(phoneContextArb, async (phoneContext) => {
          const options = createMinimalOptions({
            phoneCallMode: true,
            incomingCallMode: true,
            callReason: undefined,
            phoneContext,
          });

          const builder = new PromptBuilder(options);
          const result = await builder.build();

          expect(result.messages).toBeDefined();
          expect(Array.isArray(result.messages)).toBe(true);
          expect(result.messages.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 },
      );
    });

    /**
     * Property: Multiple builds with the same options should produce
     * consistent results (idempotence).
     */
    it("should produce consistent results across multiple builds", async () => {
      await fc.assert(
        fc.asyncProperty(
          callReasonArb,
          phoneContextArb,
          async (callReason, phoneContext) => {
            const options = createMinimalOptions({
              phoneCallMode: true,
              incomingCallMode: true,
              callReason,
              phoneContext,
            });

            const builder = new PromptBuilder(options);
            const result1 = await builder.build();
            const result2 = await builder.build();

            const content1 = getAllMessageContent(result1.messages);
            const content2 = getAllMessageContent(result2.messages);

            // Both builds should contain the callReason
            expect(content1).toContain(callReason);
            expect(content2).toContain(callReason);

            // Message count should be the same
            expect(result1.messages.length).toBe(result2.messages.length);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
