/**
 * PromptBuilder 禁言成員 prompt 指示屬性測試
 *
 * **Feature: group-chat, Property 3: Muted member prompt indicator**
 * **Validates: Requirements 3.5, 7.5**
 *
 * Property: For any group chat where a member is marked as muted,
 * the built prompt should contain a `[已禁言]` indicator adjacent to
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

function groupMemberArb(name: string, isMuted: boolean) {
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
    isAdmin: fc.boolean(),
    isMuted: fc.constant(isMuted),
  });
}

const groupWithMutedMembersArb = fc
  .shuffledSubarray(NAME_POOL, { minLength: 2, maxLength: 6 })
  .chain((names) => {
    return fc.integer({ min: 1, max: names.length - 1 }).chain((mutedCount) => {
      return fc
        .shuffledSubarray(names, {
          minLength: names.length,
          maxLength: names.length,
        })
        .chain((shuffled) => {
          const mutedNames = shuffled.slice(0, mutedCount);
          const unmutedNames = shuffled.slice(mutedCount);
          const memberArbs = shuffled.map((n) =>
            groupMemberArb(n, mutedNames.includes(n)),
          );
          return fc
            .tuple(...memberArbs)
            .map(
              (members) =>
                [members, mutedNames, unmutedNames] as [
                  typeof members,
                  string[],
                  string[],
                ],
            );
        });
    });
  });

describe("PromptBuilder - Muted Member Prompt Indicator", () => {
  /**
   * **Feature: group-chat, Property 3: Muted member prompt indicator**
   * **Validates: Requirements 3.5, 7.5**
   */
  it("should include [已禁言] indicator for muted members and not for unmuted members", async () => {
    await fc.assert(
      fc.asyncProperty(
        groupWithMutedMembersArb,
        async ([members, mutedNames, unmutedNames]) => {
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
          for (const name of mutedNames) {
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const lineRegex = new RegExp(
              `【${escaped}[^】]*】[^\\n]*\\[已禁言\\]`,
            );
            expect(
              lineRegex.test(memberSection),
              `Expected muted member "${name}" to have [已禁言] indicator`,
            ).toBe(true);
          }
          for (const name of unmutedNames) {
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const lineRegex = new RegExp(
              `【${escaped}[^】]*】[^\\n]*\\[已禁言\\]`,
            );
            expect(
              lineRegex.test(memberSection),
              `Expected unmuted member "${name}" to NOT have [已禁言] indicator`,
            ).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
