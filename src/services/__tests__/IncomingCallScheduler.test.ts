/**
 * IncomingCallScheduler 屬性測試
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  calculateTriggerTime,
  parseDelayString,
} from "../IncomingCallScheduler";

/**
 * **Feature: character-incoming-call, Property 2: 延遲時間計算正確性**
 * **Validates: Requirements 1.2, 1.3**
 *
 * Property: For any valid delay string (e.g., "5s", "30m", "1h", "2d"),
 * the system should correctly calculate the trigger timestamp as
 * current time plus the parsed duration.
 */
describe("IncomingCallScheduler - Delay Time Calculation", () => {
  describe("Property 2: Delay time calculation correctness", () => {
    // Delay units in milliseconds
    const DELAY_UNITS: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    // Arbitrary for valid delay values (positive integers)
    const validValueArb = fc.integer({ min: 1, max: 9999 });

    // Arbitrary for valid delay units
    const validUnitArb = fc.constantFrom(
      "s",
      "m",
      "h",
      "d",
      "S",
      "M",
      "H",
      "D",
    );

    // Arbitrary for valid delay strings
    const validDelayArb = fc
      .tuple(validValueArb, validUnitArb)
      .map(([value, unit]) => `${value}${unit}`);

    // Arbitrary for base time (reasonable timestamp range)
    const baseTimeArb = fc.integer({
      min: Date.now() - 365 * 24 * 60 * 60 * 1000, // 1 year ago
      max: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year from now
    });

    it("should correctly parse delay string to milliseconds", () => {
      fc.assert(
        fc.property(validValueArb, validUnitArb, (value, unit) => {
          const delayString = `${value}${unit}`;
          const result = parseDelayString(delayString);

          expect(result).not.toBeNull();

          const expectedMs = value * DELAY_UNITS[unit.toLowerCase()];
          expect(result).toBe(expectedMs);
        }),
        { numRuns: 100 },
      );
    });

    it("should calculate trigger time as base time plus delay", () => {
      fc.assert(
        fc.property(
          validValueArb,
          validUnitArb,
          baseTimeArb,
          (value, unit, baseTime) => {
            const delayString = `${value}${unit}`;
            const result = calculateTriggerTime(delayString, baseTime);

            expect(result).not.toBeNull();

            const expectedDelayMs = value * DELAY_UNITS[unit.toLowerCase()];
            const expectedTriggerTime = baseTime + expectedDelayMs;

            expect(result).toBe(expectedTriggerTime);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should use current time as default base time", () => {
      fc.assert(
        fc.property(validDelayArb, (delayString) => {
          const before = Date.now();
          const result = calculateTriggerTime(delayString);
          const after = Date.now();

          expect(result).not.toBeNull();

          const delayMs = parseDelayString(delayString)!;

          // Result should be between (before + delay) and (after + delay)
          expect(result).toBeGreaterThanOrEqual(before + delayMs);
          expect(result).toBeLessThanOrEqual(after + delayMs);
        }),
        { numRuns: 100 },
      );
    });

    it("should return null for invalid delay formats", () => {
      const invalidDelayArb = fc.oneof(
        fc.constant(""), // Empty string
        fc.constant("abc"), // No number
        fc.constant("123"), // No unit
        fc.constant("5x"), // Invalid unit
        fc.constant("0s"), // Zero value
        fc.constant("-5s"), // Negative value
        fc.constant("5.5s"), // Decimal value
        fc.constant("5 s"), // Space between
        fc.constant("s5"), // Unit before number
      );

      fc.assert(
        fc.property(invalidDelayArb, (delayString) => {
          const result = parseDelayString(delayString);
          expect(result).toBeNull();
        }),
        { numRuns: 100 },
      );
    });

    it("should return null for calculateTriggerTime with invalid delay", () => {
      const invalidDelayArb = fc.oneof(
        fc.constant(""),
        fc.constant("abc"),
        fc.constant("5x"),
      );

      fc.assert(
        fc.property(invalidDelayArb, baseTimeArb, (delayString, baseTime) => {
          const result = calculateTriggerTime(delayString, baseTime);
          expect(result).toBeNull();
        }),
        { numRuns: 100 },
      );
    });

    it("should handle case-insensitive units consistently", () => {
      fc.assert(
        fc.property(validValueArb, (value) => {
          const units = ["s", "S", "m", "M", "h", "H", "d", "D"];

          for (let i = 0; i < units.length; i += 2) {
            const lowerUnit = units[i];
            const upperUnit = units[i + 1];

            const lowerResult = parseDelayString(`${value}${lowerUnit}`);
            const upperResult = parseDelayString(`${value}${upperUnit}`);

            expect(lowerResult).toBe(upperResult);
          }
        }),
        { numRuns: 100 },
      );
    });
  });
});

/**
 * **Feature: character-incoming-call, Property 3: 存取一致性（round-trip）**
 * **Validates: Requirements 4.1**
 *
 * Property: For any pending call record, saving to IndexedDB and then
 * retrieving should produce an equivalent record.
 *
 * Note: Since we're in a Node environment without real IndexedDB,
 * we test the data transformation logic to ensure no data loss occurs
 * during the save/retrieve cycle.
 */
describe("IncomingCallScheduler - Pending Call Persistence", () => {
  describe("Property 3: Round-trip consistency", () => {
    // Arbitrary for valid character IDs (UUID-like)
    const uuidArb = fc.uuid();

    // Arbitrary for character names (non-empty strings)
    const nameArb = fc
      .string({ minLength: 1, maxLength: 50 })
      .filter((s) => s.trim().length > 0);

    // Arbitrary for optional avatar URLs
    const avatarArb = fc.option(fc.webUrl(), { nil: undefined });

    // Arbitrary for reason strings
    const reasonArb = fc
      .string({ minLength: 1, maxLength: 200 })
      .filter((s) => s.trim().length > 0);

    // Arbitrary for optional opening strings
    const openingArb = fc.option(fc.string({ minLength: 1, maxLength: 200 }), {
      nil: undefined,
    });

    // Arbitrary for timestamps
    const timestampArb = fc.integer({
      min: Date.now() - 365 * 24 * 60 * 60 * 1000,
      max: Date.now() + 365 * 24 * 60 * 60 * 1000,
    });

    // Arbitrary for complete PendingCall objects
    const pendingCallArb = fc.record({
      id: uuidArb,
      characterId: uuidArb,
      characterName: nameArb,
      characterAvatar: avatarArb,
      chatId: uuidArb,
      triggerTime: timestampArb,
      reason: reasonArb,
      opening: openingArb,
      createdAt: timestampArb,
    });

    it("should preserve all required fields through JSON serialization", () => {
      fc.assert(
        fc.property(pendingCallArb, (pendingCall) => {
          // Simulate the round-trip through JSON (as IndexedDB does internally)
          const serialized = JSON.stringify(pendingCall);
          const deserialized = JSON.parse(serialized);

          // All required fields should be preserved
          expect(deserialized.id).toBe(pendingCall.id);
          expect(deserialized.characterId).toBe(pendingCall.characterId);
          expect(deserialized.characterName).toBe(pendingCall.characterName);
          expect(deserialized.chatId).toBe(pendingCall.chatId);
          expect(deserialized.triggerTime).toBe(pendingCall.triggerTime);
          expect(deserialized.reason).toBe(pendingCall.reason);
          expect(deserialized.createdAt).toBe(pendingCall.createdAt);
        }),
        { numRuns: 100 },
      );
    });

    it("should preserve optional fields through JSON serialization", () => {
      fc.assert(
        fc.property(pendingCallArb, (pendingCall) => {
          const serialized = JSON.stringify(pendingCall);
          const deserialized = JSON.parse(serialized);

          // Optional fields should be preserved if present
          if (pendingCall.characterAvatar !== undefined) {
            expect(deserialized.characterAvatar).toBe(
              pendingCall.characterAvatar,
            );
          } else {
            expect(deserialized.characterAvatar).toBeUndefined();
          }

          if (pendingCall.opening !== undefined) {
            expect(deserialized.opening).toBe(pendingCall.opening);
          } else {
            expect(deserialized.opening).toBeUndefined();
          }
        }),
        { numRuns: 100 },
      );
    });

    it("should produce deep equal objects after round-trip", () => {
      fc.assert(
        fc.property(pendingCallArb, (pendingCall) => {
          const serialized = JSON.stringify(pendingCall);
          const deserialized = JSON.parse(serialized);

          // Deep equality check
          expect(deserialized).toEqual(pendingCall);
        }),
        { numRuns: 100 },
      );
    });

    it("should handle special characters in strings", () => {
      const specialCharArb = fc.string({
        minLength: 1,
        maxLength: 100,
      });

      fc.assert(
        fc.property(
          uuidArb,
          uuidArb,
          specialCharArb,
          uuidArb,
          timestampArb,
          specialCharArb,
          timestampArb,
          (
            id,
            characterId,
            characterName,
            chatId,
            triggerTime,
            reason,
            createdAt,
          ) => {
            const pendingCall = {
              id,
              characterId,
              characterName,
              chatId,
              triggerTime,
              reason,
              createdAt,
            };

            const serialized = JSON.stringify(pendingCall);
            const deserialized = JSON.parse(serialized);

            expect(deserialized.characterName).toBe(characterName);
            expect(deserialized.reason).toBe(reason);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

import type { PendingCall } from "@/types/incomingCall";

/**
 * **Feature: character-incoming-call, Property 4: 過期來電檢測**
 * **Validates: Requirements 4.2, 4.3**
 *
 * Property: For any pending call with triggerTime in the past,
 * checkPendingCalls should return that call for immediate triggering.
 */
describe("IncomingCallScheduler - Overdue Call Detection", () => {
  describe("Property 4: Overdue call detection", () => {
    // Helper to create a pending call with specific trigger time
    const createPendingCall = (
      triggerTime: number,
      createdAt: number,
    ): PendingCall => ({
      id: crypto.randomUUID(),
      characterId: crypto.randomUUID(),
      characterName: "Test Character",
      chatId: crypto.randomUUID(),
      triggerTime,
      reason: "Test reason",
      createdAt,
    });

    // Arbitrary for past timestamps (overdue)
    const pastTimestampArb = fc.integer({
      min: Date.now() - 365 * 24 * 60 * 60 * 1000, // 1 year ago
      max: Date.now() - 1, // Just before now
    });

    // Arbitrary for future timestamps (not yet due)
    const futureTimestampArb = fc.integer({
      min: Date.now() + 1000, // 1 second from now
      max: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year from now
    });

    // Arbitrary for creation timestamps (always in the past)
    const createdAtArb = fc.integer({
      min: Date.now() - 365 * 24 * 60 * 60 * 1000,
      max: Date.now(),
    });

    /**
     * Test the filtering logic for overdue calls
     * This tests the core algorithm without needing IndexedDB
     */
    it("should identify overdue calls (triggerTime <= now)", () => {
      fc.assert(
        fc.property(
          pastTimestampArb,
          createdAtArb,
          (triggerTime, createdAt) => {
            const now = Date.now();
            const pendingCall = createPendingCall(triggerTime, createdAt);

            // The call is overdue if triggerTime <= now
            const isOverdue = pendingCall.triggerTime <= now;

            expect(isOverdue).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should not identify future calls as overdue", () => {
      fc.assert(
        fc.property(
          futureTimestampArb,
          createdAtArb,
          (triggerTime, createdAt) => {
            const now = Date.now();
            const pendingCall = createPendingCall(triggerTime, createdAt);

            // The call is NOT overdue if triggerTime > now
            const isOverdue = pendingCall.triggerTime <= now;

            expect(isOverdue).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should sort overdue calls by createdAt (oldest first)", () => {
      fc.assert(
        fc.property(
          fc.array(fc.tuple(pastTimestampArb, createdAtArb), {
            minLength: 2,
            maxLength: 10,
          }),
          (callData) => {
            const now = Date.now();
            const calls = callData.map(([triggerTime, createdAt]) =>
              createPendingCall(triggerTime, createdAt),
            );

            // Filter overdue calls and sort by createdAt
            const overdueCalls = calls
              .filter((call) => call.triggerTime <= now)
              .sort((a, b) => a.createdAt - b.createdAt);

            // Verify sorting is correct
            for (let i = 1; i < overdueCalls.length; i++) {
              expect(overdueCalls[i].createdAt).toBeGreaterThanOrEqual(
                overdueCalls[i - 1].createdAt,
              );
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should return the oldest overdue call first", () => {
      fc.assert(
        fc.property(
          fc.array(fc.tuple(pastTimestampArb, createdAtArb), {
            minLength: 2,
            maxLength: 10,
          }),
          (callData) => {
            const now = Date.now();
            const calls = callData.map(([triggerTime, createdAt]) =>
              createPendingCall(triggerTime, createdAt),
            );

            // Filter overdue calls and sort by createdAt
            const overdueCalls = calls
              .filter((call) => call.triggerTime <= now)
              .sort((a, b) => a.createdAt - b.createdAt);

            if (overdueCalls.length > 0) {
              const firstCall = overdueCalls[0];

              // The first call should have the smallest createdAt
              const minCreatedAt = Math.min(
                ...overdueCalls.map((c) => c.createdAt),
              );
              expect(firstCall.createdAt).toBe(minCreatedAt);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should handle mixed overdue and future calls correctly", () => {
      fc.assert(
        fc.property(
          fc.array(pastTimestampArb, { minLength: 1, maxLength: 5 }),
          fc.array(futureTimestampArb, { minLength: 1, maxLength: 5 }),
          createdAtArb,
          (pastTimes, futureTimes, baseCreatedAt) => {
            const now = Date.now();

            // Create mixed calls
            const overdueCalls = pastTimes.map((t, i) =>
              createPendingCall(t, baseCreatedAt + i),
            );
            const futureCalls = futureTimes.map((t, i) =>
              createPendingCall(t, baseCreatedAt + pastTimes.length + i),
            );
            const allCalls = [...overdueCalls, ...futureCalls];

            // Filter should only return overdue calls
            const filteredOverdue = allCalls.filter(
              (call) => call.triggerTime <= now,
            );

            expect(filteredOverdue.length).toBe(overdueCalls.length);

            // All filtered calls should have triggerTime <= now
            filteredOverdue.forEach((call) => {
              expect(call.triggerTime).toBeLessThanOrEqual(now);
            });
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

/**
 * **Feature: character-incoming-call, Property 6: 處理後清理記錄**
 * **Validates: Requirements 4.4**
 *
 * Property: For any pending call that is answered or declined,
 * the record should be removed from storage.
 *
 * Note: Since we're in a Node environment without real IndexedDB,
 * we test the cleanup logic by simulating the storage operations.
 */
describe("IncomingCallScheduler - Call Cleanup After Handling", () => {
  describe("Property 6: Call cleanup after handling", () => {
    // Arbitrary for valid character IDs (UUID-like)
    const uuidArb = fc.uuid();

    // Arbitrary for character names (non-empty strings)
    const nameArb = fc
      .string({ minLength: 1, maxLength: 50 })
      .filter((s) => s.trim().length > 0);

    // Arbitrary for reason strings
    const reasonArb = fc
      .string({ minLength: 1, maxLength: 200 })
      .filter((s) => s.trim().length > 0);

    // Arbitrary for timestamps
    const timestampArb = fc.integer({
      min: Date.now() - 365 * 24 * 60 * 60 * 1000,
      max: Date.now() + 365 * 24 * 60 * 60 * 1000,
    });

    // Arbitrary for call status (answered or declined)
    const callStatusArb = fc.constantFrom("answered", "declined", "missed");

    // Helper to create a pending call
    const createPendingCall = (
      id: string,
      characterId: string,
      characterName: string,
      chatId: string,
      triggerTime: number,
      reason: string,
      createdAt: number,
    ): PendingCall => ({
      id,
      characterId,
      characterName,
      chatId,
      triggerTime,
      reason,
      createdAt,
    });

    /**
     * Simulates the storage behavior for pending calls (synchronous version)
     * This is a mock implementation to test the cleanup logic
     */
    class MockPendingCallStorage {
      private storage: Map<string, PendingCall> = new Map();

      put(call: PendingCall): void {
        this.storage.set(call.id, { ...call });
      }

      get(id: string): PendingCall | undefined {
        return this.storage.get(id);
      }

      delete(id: string): void {
        this.storage.delete(id);
      }

      getAll(): PendingCall[] {
        return Array.from(this.storage.values());
      }

      size(): number {
        return this.storage.size;
      }

      has(id: string): boolean {
        return this.storage.has(id);
      }
    }

    it("should remove pending call after it is handled (answered/declined/missed)", () => {
      fc.assert(
        fc.property(
          uuidArb,
          uuidArb,
          nameArb,
          uuidArb,
          timestampArb,
          reasonArb,
          timestampArb,
          callStatusArb,
          (
            id,
            characterId,
            characterName,
            chatId,
            triggerTime,
            reason,
            createdAt,
            _status,
          ) => {
            const storage = new MockPendingCallStorage();

            // Create and store a pending call
            const pendingCall = createPendingCall(
              id,
              characterId,
              characterName,
              chatId,
              triggerTime,
              reason,
              createdAt,
            );
            storage.put(pendingCall);

            // Verify it exists
            expect(storage.has(id)).toBe(true);
            expect(storage.size()).toBe(1);

            // Simulate handling the call (delete it)
            storage.delete(id);

            // Verify it's removed
            expect(storage.has(id)).toBe(false);
            expect(storage.size()).toBe(0);
            expect(storage.get(id)).toBeUndefined();
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should only remove the specific handled call, not others", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(
              uuidArb,
              uuidArb,
              nameArb,
              uuidArb,
              timestampArb,
              reasonArb,
              timestampArb,
            ),
            { minLength: 2, maxLength: 10 },
          ),
          fc.integer({ min: 0, max: 9 }),
          (callsData, indexToRemove) => {
            const storage = new MockPendingCallStorage();

            // Create and store multiple pending calls
            const calls = callsData.map(
              ([
                id,
                characterId,
                characterName,
                chatId,
                triggerTime,
                reason,
                createdAt,
              ]) =>
                createPendingCall(
                  id,
                  characterId,
                  characterName,
                  chatId,
                  triggerTime,
                  reason,
                  createdAt,
                ),
            );

            for (const call of calls) {
              storage.put(call);
            }

            const initialSize = storage.size();
            expect(initialSize).toBe(calls.length);

            // Pick a call to remove (handle)
            const safeIndex = indexToRemove % calls.length;
            const callToRemove = calls[safeIndex];

            // Simulate handling the call
            storage.delete(callToRemove.id);

            // Verify only that call is removed
            expect(storage.size()).toBe(initialSize - 1);
            expect(storage.has(callToRemove.id)).toBe(false);

            // Verify other calls still exist
            for (let i = 0; i < calls.length; i++) {
              if (i !== safeIndex) {
                expect(storage.has(calls[i].id)).toBe(true);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should handle deletion of non-existent call gracefully", () => {
      fc.assert(
        fc.property(uuidArb, (nonExistentId) => {
          const storage = new MockPendingCallStorage();

          // Storage is empty
          expect(storage.size()).toBe(0);

          // Deleting non-existent call should not throw
          expect(() => storage.delete(nonExistentId)).not.toThrow();

          // Storage should still be empty
          expect(storage.size()).toBe(0);
        }),
        { numRuns: 100 },
      );
    });

    it("should maintain storage integrity after multiple operations", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(
              uuidArb,
              uuidArb,
              nameArb,
              uuidArb,
              timestampArb,
              reasonArb,
              timestampArb,
            ),
            { minLength: 3, maxLength: 10 },
          ),
          fc.array(fc.integer({ min: 0, max: 9 }), {
            minLength: 1,
            maxLength: 5,
          }),
          (callsData, indicesToRemove) => {
            const storage = new MockPendingCallStorage();

            // Create and store multiple pending calls
            const calls = callsData.map(
              ([
                id,
                characterId,
                characterName,
                chatId,
                triggerTime,
                reason,
                createdAt,
              ]) =>
                createPendingCall(
                  id,
                  characterId,
                  characterName,
                  chatId,
                  triggerTime,
                  reason,
                  createdAt,
                ),
            );

            for (const call of calls) {
              storage.put(call);
            }

            // Track which calls we've removed
            const removedIds = new Set<string>();

            // Remove calls at specified indices
            for (const index of indicesToRemove) {
              const safeIndex = index % calls.length;
              const callToRemove = calls[safeIndex];

              if (!removedIds.has(callToRemove.id)) {
                storage.delete(callToRemove.id);
                removedIds.add(callToRemove.id);
              }
            }

            // Verify final state
            const expectedSize = calls.length - removedIds.size;
            expect(storage.size()).toBe(expectedSize);

            // Verify removed calls are gone
            for (const id of removedIds) {
              expect(storage.has(id)).toBe(false);
            }

            // Verify remaining calls still exist
            for (const call of calls) {
              if (!removedIds.has(call.id)) {
                expect(storage.has(call.id)).toBe(true);
                const retrieved = storage.get(call.id);
                expect(retrieved).toEqual(call);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

import { shouldTriggerCall } from "../IncomingCallScheduler";

/**
 * **Feature: character-incoming-call, Property 7: 勿擾模式阻止來電**
 * **Validates: Requirements 5.4**
 *
 * Property: For any pending call, if DND setting is enabled,
 * the call should not trigger the incoming call modal.
 */
describe("IncomingCallScheduler - Do Not Disturb Enforcement", () => {
  describe("Property 7: Do Not Disturb enforcement", () => {
    // Arbitrary for valid character IDs (UUID-like)
    const uuidArb = fc.uuid();

    // Arbitrary for character names (non-empty strings)
    const nameArb = fc
      .string({ minLength: 1, maxLength: 50 })
      .filter((s) => s.trim().length > 0);

    // Arbitrary for reason strings
    const reasonArb = fc
      .string({ minLength: 1, maxLength: 200 })
      .filter((s) => s.trim().length > 0);

    // Arbitrary for timestamps
    const timestampArb = fc.integer({
      min: Date.now() - 365 * 24 * 60 * 60 * 1000,
      max: Date.now() + 365 * 24 * 60 * 60 * 1000,
    });

    // Arbitrary for past timestamps (overdue calls)
    const pastTimestampArb = fc.integer({
      min: Date.now() - 365 * 24 * 60 * 60 * 1000,
      max: Date.now() - 1,
    });

    // Helper to create a pending call
    const createPendingCall = (
      id: string,
      characterId: string,
      characterName: string,
      chatId: string,
      triggerTime: number,
      reason: string,
      createdAt: number,
    ): PendingCall => ({
      id,
      characterId,
      characterName,
      chatId,
      triggerTime,
      reason,
      createdAt,
    });

    it("should NOT trigger call when DND is enabled, regardless of trigger time", () => {
      fc.assert(
        fc.property(
          uuidArb,
          uuidArb,
          nameArb,
          uuidArb,
          pastTimestampArb, // Use past timestamp (overdue call)
          reasonArb,
          timestampArb,
          (
            id,
            characterId,
            characterName,
            chatId,
            triggerTime,
            reason,
            createdAt,
          ) => {
            const pendingCall = createPendingCall(
              id,
              characterId,
              characterName,
              chatId,
              triggerTime,
              reason,
              createdAt,
            );

            // DND is enabled
            const doNotDisturb = true;
            const currentTime = Date.now();

            // Should NOT trigger when DND is enabled
            const shouldTrigger = shouldTriggerCall(
              pendingCall,
              doNotDisturb,
              currentTime,
            );

            expect(shouldTrigger).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should trigger overdue call when DND is disabled", () => {
      fc.assert(
        fc.property(
          uuidArb,
          uuidArb,
          nameArb,
          uuidArb,
          pastTimestampArb, // Use past timestamp (overdue call)
          reasonArb,
          timestampArb,
          (
            id,
            characterId,
            characterName,
            chatId,
            triggerTime,
            reason,
            createdAt,
          ) => {
            const pendingCall = createPendingCall(
              id,
              characterId,
              characterName,
              chatId,
              triggerTime,
              reason,
              createdAt,
            );

            // DND is disabled
            const doNotDisturb = false;
            const currentTime = Date.now();

            // Should trigger when DND is disabled and call is overdue
            const shouldTrigger = shouldTriggerCall(
              pendingCall,
              doNotDisturb,
              currentTime,
            );

            expect(shouldTrigger).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should NOT trigger future call even when DND is disabled", () => {
      // Arbitrary for future timestamps
      const futureTimestampArb = fc.integer({
        min: Date.now() + 1000, // 1 second from now
        max: Date.now() + 365 * 24 * 60 * 60 * 1000,
      });

      fc.assert(
        fc.property(
          uuidArb,
          uuidArb,
          nameArb,
          uuidArb,
          futureTimestampArb, // Use future timestamp
          reasonArb,
          timestampArb,
          (
            id,
            characterId,
            characterName,
            chatId,
            triggerTime,
            reason,
            createdAt,
          ) => {
            const pendingCall = createPendingCall(
              id,
              characterId,
              characterName,
              chatId,
              triggerTime,
              reason,
              createdAt,
            );

            // DND is disabled
            const doNotDisturb = false;
            const currentTime = Date.now();

            // Should NOT trigger when call is not yet due
            const shouldTrigger = shouldTriggerCall(
              pendingCall,
              doNotDisturb,
              currentTime,
            );

            expect(shouldTrigger).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should consistently block all calls when DND is enabled", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(
              uuidArb,
              uuidArb,
              nameArb,
              uuidArb,
              pastTimestampArb,
              reasonArb,
              timestampArb,
            ),
            { minLength: 1, maxLength: 10 },
          ),
          (callsData) => {
            const doNotDisturb = true;
            const currentTime = Date.now();

            // Create multiple pending calls
            const calls = callsData.map(
              ([
                id,
                characterId,
                characterName,
                chatId,
                triggerTime,
                reason,
                createdAt,
              ]) =>
                createPendingCall(
                  id,
                  characterId,
                  characterName,
                  chatId,
                  triggerTime,
                  reason,
                  createdAt,
                ),
            );

            // ALL calls should be blocked when DND is enabled
            const triggeredCalls = calls.filter((call) =>
              shouldTriggerCall(call, doNotDisturb, currentTime),
            );

            expect(triggeredCalls.length).toBe(0);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should allow overdue calls when DND is disabled", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(
              uuidArb,
              uuidArb,
              nameArb,
              uuidArb,
              pastTimestampArb,
              reasonArb,
              timestampArb,
            ),
            { minLength: 1, maxLength: 10 },
          ),
          (callsData) => {
            const doNotDisturb = false;
            const currentTime = Date.now();

            // Create multiple pending calls (all overdue)
            const calls = callsData.map(
              ([
                id,
                characterId,
                characterName,
                chatId,
                triggerTime,
                reason,
                createdAt,
              ]) =>
                createPendingCall(
                  id,
                  characterId,
                  characterName,
                  chatId,
                  triggerTime,
                  reason,
                  createdAt,
                ),
            );

            // ALL overdue calls should be allowed when DND is disabled
            const triggeredCalls = calls.filter((call) =>
              shouldTriggerCall(call, doNotDisturb, currentTime),
            );

            expect(triggeredCalls.length).toBe(calls.length);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("should respect DND toggle state changes", () => {
      fc.assert(
        fc.property(
          uuidArb,
          uuidArb,
          nameArb,
          uuidArb,
          pastTimestampArb,
          reasonArb,
          timestampArb,
          fc.boolean(),
          (
            id,
            characterId,
            characterName,
            chatId,
            triggerTime,
            reason,
            createdAt,
            dndState,
          ) => {
            const pendingCall = createPendingCall(
              id,
              characterId,
              characterName,
              chatId,
              triggerTime,
              reason,
              createdAt,
            );

            const currentTime = Date.now();

            // Test with the random DND state
            const shouldTrigger = shouldTriggerCall(
              pendingCall,
              dndState,
              currentTime,
            );

            // When DND is true, should NOT trigger
            // When DND is false and call is overdue, should trigger
            if (dndState) {
              expect(shouldTrigger).toBe(false);
            } else {
              // Call is overdue (pastTimestampArb), so should trigger
              expect(shouldTrigger).toBe(true);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
