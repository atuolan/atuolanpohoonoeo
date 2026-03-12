/**
 * Property-Based Tests for Group Chat
 * Feature: group-chat
 *
 * Tests Property 1 and Property 11 from the design document
 */

import type {
    Chat,
    ChatMessage,
    GroupChatMetadata,
    GroupMember,
} from "@/types/chat";
import { createDefaultGroupChat } from "@/types/chat";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

// ===== Arbitraries =====

/** 角色 ID Arbitrary */
const characterIdArbitrary = fc
  .stringMatching(/^[a-zA-Z0-9-]+$/)
  .filter((s) => s.length >= 1 && s.length <= 36);

/** 群成員 Arbitrary */
const groupMemberArbitrary: fc.Arbitrary<GroupMember> = fc.record({
  characterId: characterIdArbitrary,
  nickname: fc.option(fc.string({ minLength: 1, maxLength: 20 }), {
    nil: undefined,
  }),
  isAdmin: fc.boolean(),
  isMuted: fc.boolean(),
  joinedAt: fc.integer({ min: 0, max: Date.now() }),
});

/** 群聊元數據 Arbitrary */
const groupChatMetadataArbitrary: fc.Arbitrary<GroupChatMetadata> = fc.record({
  groupName: fc.string({ minLength: 1, maxLength: 50 }),
  members: fc.array(groupMemberArbitrary, { minLength: 2, maxLength: 10 }),
  groupAvatar: fc.option(fc.string({ minLength: 1, maxLength: 100 }), {
    nil: undefined,
  }),
  longTermMemory: fc.option(
    fc.array(fc.string({ minLength: 1, maxLength: 200 }), {
      minLength: 0,
      maxLength: 5,
    }),
    { nil: undefined },
  ),
  worldSetting: fc.option(fc.string({ minLength: 1, maxLength: 200 }), {
    nil: undefined,
  }),
});

/** 群聊訊息 Arbitrary（含群聊欄位） */
const groupChatMessageArbitrary: fc.Arbitrary<ChatMessage> = fc.record({
  id: fc.uuid(),
  sender: fc.constantFrom(
    "user",
    "assistant",
    "system",
    "narrator",
  ) as fc.Arbitrary<ChatMessage["sender"]>,
  name: fc.string({ minLength: 1, maxLength: 30 }),
  content: fc.string({ minLength: 0, maxLength: 500 }),
  is_user: fc.boolean(),
  status: fc.constantFrom(
    "pending",
    "sent",
    "streaming",
    "error",
  ) as fc.Arbitrary<ChatMessage["status"]>,
  createdAt: fc.integer({ min: 0, max: Date.now() }),
  updatedAt: fc.integer({ min: 0, max: Date.now() }),
  senderCharacterId: fc.option(characterIdArbitrary, { nil: undefined }),
  isRecall: fc.option(fc.boolean(), { nil: undefined }),
  recallContent: fc.option(fc.string({ minLength: 1, maxLength: 100 }), {
    nil: undefined,
  }),
  isPrivateMessage: fc.option(fc.boolean(), { nil: undefined }),
  isGroupAction: fc.option(fc.boolean(), { nil: undefined }),
  groupActionType: fc.option(
    fc.constantFrom("rename", "kick", "mute", "unmute") as fc.Arbitrary<
      "rename" | "kick" | "mute" | "unmute"
    >,
    { nil: undefined },
  ),
  groupActionActor: fc.option(fc.string({ minLength: 1, maxLength: 30 }), {
    nil: undefined,
  }),
  groupActionTarget: fc.option(fc.string({ minLength: 1, maxLength: 30 }), {
    nil: undefined,
  }),
  groupActionValue: fc.option(fc.string({ minLength: 1, maxLength: 50 }), {
    nil: undefined,
  }),
});

/** 完整群聊 Chat Arbitrary */
const groupChatArbitrary: fc.Arbitrary<Chat> = fc
  .record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    characterId: characterIdArbitrary,
    messages: fc.array(groupChatMessageArbitrary, {
      minLength: 0,
      maxLength: 5,
    }),
    metadata: fc.constant({}),
    createdAt: fc.integer({ min: 0, max: Date.now() }),
    updatedAt: fc.integer({ min: 0, max: Date.now() }),
    isGroupChat: fc.constant(true as const),
    groupMetadata: groupChatMetadataArbitrary,
  })
  .map((chat) => chat as Chat);

describe("Group Chat Property Tests", () => {
  /**
   * **Feature: group-chat, Property 1: Group chat round-trip serialization**
   *
   * *For any* valid group chat object (with any combination of group name, member list,
   * and messages), serializing to a plain JS object and deserializing back should produce
   * an equivalent group chat object.
   *
   * **Validates: Requirements 1.4**
   */
  describe("Property 1: Group chat round-trip serialization", () => {
    it("JSON round-trip preserves group chat structure", () => {
      fc.assert(
        fc.property(groupChatArbitrary, (chat) => {
          // Simulate IndexedDB serialization: JSON.stringify then JSON.parse
          const serialized = JSON.stringify(chat);
          const deserialized: Chat = JSON.parse(serialized);

          // Top-level fields
          expect(deserialized.id).toBe(chat.id);
          expect(deserialized.name).toBe(chat.name);
          expect(deserialized.characterId).toBe(chat.characterId);
          expect(deserialized.isGroupChat).toBe(true);
          expect(deserialized.createdAt).toBe(chat.createdAt);
          expect(deserialized.updatedAt).toBe(chat.updatedAt);

          // Group metadata
          expect(deserialized.groupMetadata).toBeDefined();
          expect(deserialized.groupMetadata!.groupName).toBe(
            chat.groupMetadata!.groupName,
          );
          expect(deserialized.groupMetadata!.members.length).toBe(
            chat.groupMetadata!.members.length,
          );

          // Each member round-trips correctly
          for (let i = 0; i < chat.groupMetadata!.members.length; i++) {
            const original = chat.groupMetadata!.members[i];
            const restored = deserialized.groupMetadata!.members[i];
            expect(restored.characterId).toBe(original.characterId);
            expect(restored.isAdmin).toBe(original.isAdmin);
            expect(restored.isMuted).toBe(original.isMuted);
            expect(restored.joinedAt).toBe(original.joinedAt);
            expect(restored.nickname).toBe(original.nickname);
          }

          // Optional metadata fields
          expect(deserialized.groupMetadata!.groupAvatar).toBe(
            chat.groupMetadata!.groupAvatar,
          );
          expect(deserialized.groupMetadata!.longTermMemory).toEqual(
            chat.groupMetadata!.longTermMemory,
          );
          expect(deserialized.groupMetadata!.worldSetting).toBe(
            chat.groupMetadata!.worldSetting,
          );

          // Messages round-trip correctly
          expect(deserialized.messages.length).toBe(chat.messages.length);
          for (let i = 0; i < chat.messages.length; i++) {
            const origMsg = chat.messages[i];
            const restoredMsg = deserialized.messages[i];
            expect(restoredMsg.id).toBe(origMsg.id);
            expect(restoredMsg.content).toBe(origMsg.content);
            expect(restoredMsg.senderCharacterId).toBe(
              origMsg.senderCharacterId,
            );
            expect(restoredMsg.isRecall).toBe(origMsg.isRecall);
            expect(restoredMsg.recallContent).toBe(origMsg.recallContent);
            expect(restoredMsg.isPrivateMessage).toBe(origMsg.isPrivateMessage);
            expect(restoredMsg.isGroupAction).toBe(origMsg.isGroupAction);
            expect(restoredMsg.groupActionType).toBe(origMsg.groupActionType);
            expect(restoredMsg.groupActionActor).toBe(origMsg.groupActionActor);
            expect(restoredMsg.groupActionTarget).toBe(
              origMsg.groupActionTarget,
            );
            expect(restoredMsg.groupActionValue).toBe(origMsg.groupActionValue);
          }
        }),
        { numRuns: 100 },
      );
    });

    it("deep equality holds after round-trip", () => {
      fc.assert(
        fc.property(groupChatArbitrary, (chat) => {
          const serialized = JSON.stringify(chat);
          const deserialized: Chat = JSON.parse(serialized);

          // Full deep equality — the strongest round-trip check
          expect(deserialized).toEqual(chat);
        }),
        { numRuns: 100 },
      );
    });

    it("createDefaultGroupChat factory produces valid round-trippable objects", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 30 }),
          fc.array(characterIdArbitrary, { minLength: 2, maxLength: 8 }),
          (groupName, characterIds) => {
            const chat = createDefaultGroupChat(groupName, characterIds);

            // Verify factory output structure
            expect(chat.isGroupChat).toBe(true);
            expect(chat.groupMetadata).toBeDefined();
            expect(chat.groupMetadata!.groupName).toBe(groupName);
            expect(chat.groupMetadata!.members.length).toBe(
              characterIds.length,
            );

            // Round-trip the factory output
            const serialized = JSON.stringify(chat);
            const deserialized: Chat = JSON.parse(serialized);
            expect(deserialized).toEqual(chat);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Feature: group-chat, Property 11: Minimum group size validation**
   *
   * *For any* attempt to create a group chat with fewer than 2 characters,
   * the system should reject the creation.
   *
   * **Validates: Requirements 7.1**
   */
  describe("Property 11: Minimum group size validation", () => {
    it("rejects creation with 0 or 1 character IDs", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 30 }),
          fc.array(characterIdArbitrary, { minLength: 0, maxLength: 1 }),
          (groupName, characterIds) => {
            expect(() =>
              createDefaultGroupChat(groupName, characterIds),
            ).toThrow();
          },
        ),
        { numRuns: 100 },
      );
    });

    it("accepts creation with 2 or more character IDs", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 30 }),
          fc.array(characterIdArbitrary, { minLength: 2, maxLength: 8 }),
          (groupName, characterIds) => {
            const chat = createDefaultGroupChat(groupName, characterIds);
            expect(chat.isGroupChat).toBe(true);
            expect(chat.groupMetadata).toBeDefined();
            expect(chat.groupMetadata!.members.length).toBe(
              characterIds.length,
            );
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
