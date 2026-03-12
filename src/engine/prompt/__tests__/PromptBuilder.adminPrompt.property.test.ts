/**
 * PromptBuilder 管理員 prompt 指示屬性測試
 *
 * **Feature: group-chat, Property 13: Admin designation in prompt**
 * **Validates: Requirements 7.4**
 *
 * Property: For any group chat where a member is designated as admin,
 * the built prompt should contain an `[管理員]` indicator adjacent to
 * that member's name.
 */

import type { StoredCharacter } from "@/types/character";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { PromptBuilderOptions } from "../PromptBuilder";
import { PromptBuilder } from "../PromptBuilder";

function createMockCharacter(name: string = "TestChar"): StoredCharacter {
  return {
    id: crypto.randomUUID(),
    data: {
      name,
      description: "A test character",
      personality: "Friendly",
      scenario: "",
      first_mes: "",
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

function createGroupChatOptions(
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
    groupChatMode: true,
    ...overrides,
  };
}

function getAllMessageContent(messages: Array<{ content: string }>): string {
  return messages.map((m) => m.content).join("\n");
}

const NAME_POOL = [
  "阿瓜",
  "小花",
  "大雲",
  "月星",
  "風雨",
  "雪龍",
  "鳳虎",
  "熊貓",
  "小鹿",
  "白鶴",
  "蝶魚",
  "青竹",
  "紅梅",
  "金鳳",
  "銀河",
  "玉兔",
  "翠鳥",
  "黑熊",
  "白狼",
  "藍鯨",
];

function groupMemberArb(name: string, isAdmin: boolean) {
  return fc.record({
    characterId: fc.uuid(),
    name: fc.constant(name),
    nickname: fc.option(fc.constant(""), { nil: undefined }),
    personality: fc.constantFrom(
      "活潑開朗",
      "安靜內向",
      "熱情大方",
      "冷酷帥氣",
    ),
    description: fc.constantFrom("學生", "上班族", "藝術家", "廚師"),
    avatar: fc.constant(""),
    isAdmin: fc.constant(isAdmin),
    isMuted: fc.boolean(),
  });
}

/**
 * Generates a group with at least one admin and at least one non-admin,
 * returning [members, adminNames, nonAdminNames].
 */
const groupWithAdminMembersArb = fc
  .shuffledSubarray(NAME_POOL, { minLength: 2, maxLength: 6 })
  .chain((names) => {
    return fc.integer({ min: 1, max: names.length - 1 }).chain((adminCount) => {
      return fc
        .shuffledSubarray(names, {
          minLength: names.length,
          maxLength: names.length,
        })
        .chain((shuffled) => {
          const adminNames = shuffled.slice(0, adminCount);
          const nonAdminNames = shuffled.slice(adminCount);
          const memberArbs = shuffled.map((n) =>
            groupMemberArb(n, adminNames.includes(n)),
          );
          return fc
            .tuple(...memberArbs)
            .map(
              (members) =>
                [members, adminNames, nonAdminNames] as [
                  typeof members,
                  string[],
                  string[],
                ],
            );
        });
    });
  });

describe("PromptBuilder - Admin Designation in Prompt", () => {
  /**
   * **Feature: group-chat, Property 13: Admin designation in prompt**
   * **Validates: Requirements 7.4**
   *
   * For any group chat where a member is designated as admin,
   * the built prompt should contain an `[管理員]` indicator adjacent
   * to that member's name.
   */
  it("should include [管理員] indicator for admin members and not for non-admin members", async () => {
    await fc.assert(
      fc.asyncProperty(
        groupWithAdminMembersArb,
        async ([members, adminNames, nonAdminNames]) => {
          const options = createGroupChatOptions({
            groupMembers: members,
            groupName: "測試群",
          });
          const builder = new PromptBuilder(options);
          const result = await builder.build();
          const allContent = getAllMessageContent(result.messages);

          const memberSectionMatch = allContent.match(
            /<group_members>([\s\S]*?)<\/group_members>/,
          );
          expect(memberSectionMatch).not.toBeNull();
          const memberSection = memberSectionMatch![1];

          // Admin members should have [管理員] on their line
          for (const name of adminNames) {
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const lineRegex = new RegExp(
              `【${escaped}[^】]*】[^\\n]*\\[管理員\\]`,
            );
            expect(
              lineRegex.test(memberSection),
              `Expected admin member "${name}" to have [管理員] indicator`,
            ).toBe(true);
          }

          // Non-admin members should NOT have [管理員] on their line
          for (const name of nonAdminNames) {
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const lineRegex = new RegExp(
              `【${escaped}[^】]*】[^\\n]*\\[管理員\\]`,
            );
            expect(
              lineRegex.test(memberSection),
              `Expected non-admin member "${name}" to NOT have [管理員] indicator`,
            ).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
