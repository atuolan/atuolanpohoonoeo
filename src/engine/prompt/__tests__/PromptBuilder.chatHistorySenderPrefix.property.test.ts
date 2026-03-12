/**
 * PromptBuilder 聊天歷史發送者前綴屬性測試
 *
 * **Feature: group-chat, Property 4: Chat history sender prefix**
 * **Validates: Requirements 3.6**
 *
 * Property: For any set of group chat messages with different senders,
 * the formatted chat history should prefix each message with the
 * sender's character name.
 */

import type { StoredCharacter } from "@/types/character";
import type { ChatMessage } from "@/types/chat";
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
      maxContextLength: 16384,
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
    groupMembers: [],
    groupName: "測試群",
    ...overrides,
  };
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
];

/**
 * Arbitrary for a group chat message from an AI character (non-user).
 * Content is alphanumeric to avoid regex issues.
 */
function aiMessageArb(name: string): fc.Arbitrary<ChatMessage> {
  return fc
    .record({
      id: fc.uuid(),
      content: fc.stringMatching(/^[a-zA-Z0-9\u4e00-\u9fff]{1,50}$/),
      createdAt: fc.integer({ min: 1000000, max: Date.now() }),
    })
    .map(({ id, content, createdAt }) => ({
      id,
      sender: "assistant" as const,
      name,
      content,
      is_user: false,
      status: "sent" as const,
      createdAt,
      updatedAt: createdAt,
    }));
}

/** Arbitrary for a user message */
function userMessageArb(userName: string): fc.Arbitrary<ChatMessage> {
  return fc
    .record({
      id: fc.uuid(),
      content: fc.stringMatching(/^[a-zA-Z0-9\u4e00-\u9fff]{1,50}$/),
      createdAt: fc.integer({ min: 1000000, max: Date.now() }),
    })
    .map(({ id, content, createdAt }) => ({
      id,
      sender: "user" as const,
      name: userName,
      content,
      is_user: true,
      status: "sent" as const,
      createdAt,
      updatedAt: createdAt,
    }));
}

/**
 * Arbitrary that generates a mixed list of user and AI messages
 * from multiple senders, sorted by createdAt.
 */
const groupChatMessagesArb = fc
  .shuffledSubarray(NAME_POOL, { minLength: 2, maxLength: 4 })
  .chain((names) => {
    const aiMsgArbs = names.map((n) => aiMessageArb(n));
    const allArbs = [...aiMsgArbs, userMessageArb("User")];
    // Generate 2-8 messages, each randomly picked from the senders
    return fc
      .array(fc.oneof(...allArbs), { minLength: 2, maxLength: 8 })
      .map((msgs) => {
        // Sort by createdAt to simulate chronological order
        msgs.sort((a, b) => a.createdAt - b.createdAt);
        return { names, messages: msgs };
      });
  });

describe("PromptBuilder - Chat History Sender Prefix", () => {
  /**
   * **Feature: group-chat, Property 4: Chat history sender prefix**
   * **Validates: Requirements 3.6**
   *
   * For any set of group chat messages with different senders,
   * the formatted chat history should prefix each non-user message
   * with the sender's character name in [name] format.
   */
  it("should prefix non-user messages with [senderName] in group chat history", async () => {
    await fc.assert(
      fc.asyncProperty(groupChatMessagesArb, async ({ names, messages }) => {
        const groupMembers = names.map((name) => ({
          characterId: crypto.randomUUID(),
          name,
          personality: "友善",
          description: "角色",
          avatar: "",
          isAdmin: false,
          isMuted: false,
        }));

        const options = createGroupChatOptions({
          messages,
          groupMembers,
        });

        const builder = new PromptBuilder(options);
        const result = await builder.build();

        // Collect all assistant-role messages from the built result
        const assistantMessages = result.messages.filter(
          (m) => m.role === "assistant",
        );
        const allAssistantContent = assistantMessages
          .map((m) => m.content)
          .join("\n");

        // For each non-user message in the input, verify the prefix exists
        for (const msg of messages) {
          if (!msg.is_user && msg.name) {
            const prefix = `[${msg.name}]`;
            expect(
              allAssistantContent.includes(prefix),
              `Expected assistant content to contain prefix "${prefix}" for sender "${msg.name}"`,
            ).toBe(true);
          }
        }

        // For user messages, verify they do NOT get the [name] prefix
        const userMessages = result.messages.filter((m) => m.role === "user");
        const allUserContent = userMessages.map((m) => m.content).join("\n");
        for (const msg of messages) {
          if (msg.is_user) {
            const prefix = `[${msg.name}]`;
            expect(
              allUserContent.includes(prefix),
              `Expected user content to NOT contain prefix "${prefix}"`,
            ).toBe(false);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
