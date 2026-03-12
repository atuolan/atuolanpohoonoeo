/**
 * PromptBuilder 群成員 prompt 注入屬性測試
 *
 * **Feature: group-chat, Property 2: Group member prompt inclusion**
 * **Validates: Requirements 3.2**
 *
 * Property: For any group chat with N members, the built prompt should
 * contain each member's name exactly once in the member list section.
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

/** Pool of unique CJK names for group members */
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

/** Arbitrary for a single group member with a given name */
function groupMemberArb(name: string) {
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
    isMuted: fc.boolean(),
  });
}

/** Arbitrary for 2-6 group members with unique names */
const groupMembersArb = fc
  .shuffledSubarray(NAME_POOL, { minLength: 2, maxLength: 6 })
  .chain((names) => fc.tuple(...names.map((n) => groupMemberArb(n))));

describe("PromptBuilder - Group Chat Member Prompt Inclusion", () => {
  /**
   * **Feature: group-chat, Property 2: Group member prompt inclusion**
   * **Validates: Requirements 3.2**
   *
   * For any group chat with N members, the built prompt should contain
   * each member's name exactly once in the member list section.
   */
  it("should include each group member's name exactly once in the member list section", async () => {
    await fc.assert(
      fc.asyncProperty(groupMembersArb, async (members) => {
        const options = createGroupChatOptions({
          groupMembers: members,
          groupName: "測試群",
        });

        const builder = new PromptBuilder(options);
        const result = await builder.build();
        const allContent = getAllMessageContent(result.messages);

        // Extract the group_members section
        const memberSectionMatch = allContent.match(
          /<group_members>([\s\S]*?)<\/group_members>/,
        );
        expect(memberSectionMatch).not.toBeNull();
        const memberSection = memberSectionMatch![1];

        // Each member's name should appear exactly once in the 【name】 format
        for (const member of members) {
          const escaped = member.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const matches = memberSection.match(new RegExp(`【${escaped}`, "g"));
          expect(
            matches?.length,
            `Expected "${member.name}" to appear exactly once in member list`,
          ).toBe(1);
        }
      }),
      { numRuns: 100 },
    );
  });
});
