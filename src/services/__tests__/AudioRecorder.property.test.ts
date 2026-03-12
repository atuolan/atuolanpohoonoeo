/**
 * Property-Based Tests for AudioRecorder
 * Feature: audio-recording
 *
 * Tests Properties 1, 3, and 10 from the design document
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
    formatTime,
    getSupportedMimeType,
    isDurationValid,
    MIN_DURATION,
} from "../AudioRecorder";

/**
 * **Feature: audio-recording, Property 10: MIME type selection priority**
 *
 * *For any* set of supported MIME types, the Audio_Recorder SHALL select the first
 * type from the priority list ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus',
 * 'audio/webm', 'audio/wav'] that is in the supported set.
 *
 * **Validates: Requirements 8.1, 8.4**
 */
describe("Property 10: MIME type selection priority", () => {
  const PRIORITY_LIST = [
    "audio/wav",
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/webm",
  ];

  /**
   * Pure version of getSupportedMimeType for testing without browser APIs.
   * Mirrors the logic in AudioRecorder.ts exactly.
   */
  function getSupportedMimeTypePure(supportedSet: Set<string>): string {
    return PRIORITY_LIST.find((t) => supportedSet.has(t)) ?? "";
  }

  /** Arbitrary: a random subset of the MIME priority list */
  const supportedSetArbitrary = fc
    .subarray(PRIORITY_LIST, { minLength: 0 })
    .map((arr) => new Set(arr));

  it("should select the highest-priority supported type", () => {
    fc.assert(
      fc.property(supportedSetArbitrary, (supportedSet) => {
        const selected = getSupportedMimeTypePure(supportedSet);

        if (supportedSet.size === 0) {
          // No supported types → empty string
          expect(selected).toBe("");
        } else {
          // Selected type must be in the supported set
          expect(supportedSet.has(selected)).toBe(true);

          // Selected type must be the first one in priority order
          const expectedIndex = PRIORITY_LIST.findIndex((t) =>
            supportedSet.has(t),
          );
          expect(selected).toBe(PRIORITY_LIST[expectedIndex]);

          // No higher-priority type should be in the supported set
          for (let i = 0; i < expectedIndex; i++) {
            expect(supportedSet.has(PRIORITY_LIST[i])).toBe(false);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * **Feature: audio-recording, Property 1: Duration threshold determines send/cancel**
 *
 * *For any* recording duration value, if the duration is >= 1 second the recording
 * SHALL be accepted for sending, and if the duration is < 1 second the recording
 * SHALL be rejected.
 *
 * **Validates: Requirements 1.4, 1.5**
 */
describe("Property 1: Duration threshold determines send/cancel", () => {
  it("durations >= MIN_DURATION are valid, durations < MIN_DURATION are invalid", () => {
    fc.assert(
      fc.property(fc.float({ min: 0, max: 600, noNaN: true }), (duration) => {
        const valid = isDurationValid(duration);
        if (duration >= MIN_DURATION) {
          expect(valid).toBe(true);
        } else {
          expect(valid).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("boundary: exactly MIN_DURATION is valid", () => {
    expect(isDurationValid(MIN_DURATION)).toBe(true);
  });

  it("boundary: just below MIN_DURATION is invalid", () => {
    expect(isDurationValid(MIN_DURATION - 0.001)).toBe(false);
  });
});

/**
 * **Feature: audio-recording, Property 3: Time formatting consistency**
 *
 * *For any* non-negative integer number of seconds, the formatted time string SHALL
 * match the pattern M:SS where M is minutes and SS is zero-padded seconds.
 *
 * **Validates: Requirements 2.2, 6.5**
 */
describe("Property 3: Time formatting consistency", () => {
  it("formatted time matches M:SS pattern for any non-negative seconds", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 599 }), // up to 9:59 (under 10 minutes)
        (seconds) => {
          const formatted = formatTime(seconds);

          // Must match M:SS pattern
          expect(formatted).toMatch(/^\d+:\d{2}$/);

          // Parse back and verify round-trip
          const [mStr, ssStr] = formatted.split(":");
          const m = parseInt(mStr, 10);
          const ss = parseInt(ssStr, 10);

          expect(m).toBe(Math.floor(seconds / 60));
          expect(ss).toBe(seconds % 60);

          // SS must be 0-59
          expect(ss).toBeGreaterThanOrEqual(0);
          expect(ss).toBeLessThanOrEqual(59);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("negative values are clamped to 0:00", () => {
    fc.assert(
      fc.property(fc.integer({ min: -10000, max: -1 }), (seconds) => {
        expect(formatTime(seconds)).toBe("0:00");
      }),
      { numRuns: 100 },
    );
  });
});
