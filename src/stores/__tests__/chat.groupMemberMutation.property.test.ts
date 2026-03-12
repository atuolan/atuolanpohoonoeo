/**
 * Property-Based Tests for Group Chat Member List Mutation
 * Feature: group-chat
 *
 * Tests Property 12 from the design document
 */

import * as fc from "fast-check";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useChatStore } from "../chat";

/** 角色 ID Arbitrary */
const characterIdArbitrary = fc
  .stringMatching(/^[a-zA-Z0-9-]+$/)
  .filter((s) => s.length >= 1 && s.length <= 36);

/**
 * Helper to create a fresh store with a group chat loaded
 */
function createStoreWithGroupChat(memberIds: string[]) {
  setActivePinia(createPinia());
  const store = useChatStore();
  store.createGroupChat("Test Group", memberIds);
  return store;
}

describe("Group Chat Member Mutation Property Tests", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  /**
   * **Feature: group-chat, Property 12: Member list mutation consistency**
   *
   * *For any* add or remove operation on a group's member list, the resulting
   * member list should reflect exactly the expected change (one more or one fewer member).
   *
   * **Validates: Requirements 7.3**
   */
  describe("Property 12: Member list mutation consistency", () => {
    it("addGroupMember increases member count by exactly one", () => {
      fc.assert(
        fc.property(
          // Generate 2-5 unique initial member IDs
          fc.uniqueArray(characterIdArbitrary, { minLength: 2, maxLength: 5 }),
          // Generate a new member ID to add
          characterIdArbitrary,
          (initialIds, newId) => {
            // Skip if newId already exists in initialIds
            if (initialIds.includes(newId)) return;

            const store = createStoreWithGroupChat(initialIds);
            const membersBefore =
              store.currentChat!.groupMetadata!.members.length;

            store.addGroupMember(newId);

            const membersAfter =
              store.currentChat!.groupMetadata!.members.length;

            // Exactly one member added
            expect(membersAfter).toBe(membersBefore + 1);

            // The new member should be present
            const added = store.currentChat!.groupMetadata!.members.find(
              (m) => m.characterId === newId,
            );
            expect(added).toBeDefined();
            expect(added!.isAdmin).toBe(false);
            expect(added!.isMuted).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("addGroupMember with duplicate ID does not change member count", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(characterIdArbitrary, { minLength: 2, maxLength: 5 }),
          (initialIds) => {
            const store = createStoreWithGroupChat(initialIds);
            const membersBefore =
              store.currentChat!.groupMetadata!.members.length;

            // Try to add an already-existing member
            const existingId = initialIds[0];
            store.addGroupMember(existingId);

            const membersAfter =
              store.currentChat!.groupMetadata!.members.length;

            // Count should remain unchanged
            expect(membersAfter).toBe(membersBefore);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("removeGroupMember decreases member count by exactly one when group has more than 2 members", () => {
      fc.assert(
        fc.property(
          // Need at least 3 members so removal is allowed (minimum 2 must remain)
          fc.uniqueArray(characterIdArbitrary, { minLength: 3, maxLength: 8 }),
          (initialIds) => {
            const store = createStoreWithGroupChat(initialIds);
            const membersBefore =
              store.currentChat!.groupMetadata!.members.length;

            // Remove the last member
            const removeId = initialIds[initialIds.length - 1];
            store.removeGroupMember(removeId);

            const membersAfter =
              store.currentChat!.groupMetadata!.members.length;

            // Exactly one member removed
            expect(membersAfter).toBe(membersBefore - 1);

            // The removed member should no longer be present
            const removed = store.currentChat!.groupMetadata!.members.find(
              (m) => m.characterId === removeId,
            );
            expect(removed).toBeUndefined();
          },
        ),
        { numRuns: 100 },
      );
    });

    it("removeGroupMember does not change count when group has exactly 2 members", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(characterIdArbitrary, {
            minLength: 2,
            maxLength: 2,
          }),
          (initialIds) => {
            const store = createStoreWithGroupChat(initialIds);
            const membersBefore =
              store.currentChat!.groupMetadata!.members.length;

            // Try to remove a member — should be blocked (minimum 2)
            store.removeGroupMember(initialIds[0]);

            const membersAfter =
              store.currentChat!.groupMetadata!.members.length;

            // Count should remain unchanged
            expect(membersAfter).toBe(membersBefore);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("removeGroupMember with non-existent ID does not change member count", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(characterIdArbitrary, { minLength: 3, maxLength: 5 }),
          characterIdArbitrary,
          (initialIds, nonExistentId) => {
            // Skip if the ID happens to exist
            if (initialIds.includes(nonExistentId)) return;

            const store = createStoreWithGroupChat(initialIds);
            const membersBefore =
              store.currentChat!.groupMetadata!.members.length;

            store.removeGroupMember(nonExistentId);

            const membersAfter =
              store.currentChat!.groupMetadata!.members.length;

            // Count should remain unchanged
            expect(membersAfter).toBe(membersBefore);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("add then remove restores original member count", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(characterIdArbitrary, { minLength: 2, maxLength: 5 }),
          characterIdArbitrary,
          (initialIds, newId) => {
            // Skip if newId already exists
            if (initialIds.includes(newId)) return;

            const store = createStoreWithGroupChat(initialIds);
            const membersBefore =
              store.currentChat!.groupMetadata!.members.length;

            // Add then remove
            store.addGroupMember(newId);
            store.removeGroupMember(newId);

            const membersAfter =
              store.currentChat!.groupMetadata!.members.length;

            // Should be back to original count
            expect(membersAfter).toBe(membersBefore);

            // The added-then-removed member should not be present
            const found = store.currentChat!.groupMetadata!.members.find(
              (m) => m.characterId === newId,
            );
            expect(found).toBeUndefined();
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
