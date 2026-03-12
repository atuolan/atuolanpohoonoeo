/**
 * Property-Based Tests for Audio Player State Management
 * Feature: audio-recording
 *
 * Tests Properties 4 and 6 from the design document.
 * Tests the pure AudioPlayerState class which encapsulates
 * the core state logic without browser API dependencies.
 */

import * as fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import { AudioPlayerState } from "../useAudioPlayer";

/** Arbitrary: a non-empty message ID string */
const messageIdArb = fc.uuid();

/**
 * **Feature: audio-recording, Property 4: Single playback invariant**
 *
 * *For any* sequence of play commands on different message IDs, only the last
 * played message SHALL be in the playing state, and all previously playing
 * messages SHALL be stopped.
 *
 * **Validates: Requirements 3.5**
 */
describe("Property 4: Single playback invariant", () => {
  it("after any sequence of startPlay calls, only the last message is playing", () => {
    fc.assert(
      fc.property(
        fc.array(messageIdArb, { minLength: 1, maxLength: 20 }),
        (messageIds) => {
          const state = new AudioPlayerState();

          for (const id of messageIds) {
            state.startPlay(id);
          }

          const lastId = messageIds[messageIds.length - 1];

          // Only the last message should be playing
          expect(state.playingMessageId).toBe(lastId);
          expect(state.isPlaying).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("startPlay returns the previously playing message ID", () => {
    fc.assert(
      fc.property(messageIdArb, messageIdArb, (firstId, secondId) => {
        const state = new AudioPlayerState();

        const prev1 = state.startPlay(firstId);
        expect(prev1).toBeNull(); // nothing was playing before

        const prev2 = state.startPlay(secondId);
        expect(prev2).toBe(firstId); // first was playing before
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * **Feature: audio-recording, Property 6: Seek proportionality**
 *
 * *For any* progress value between 0 and 1, seeking SHALL set currentTime to
 * `progress * duration`, and the resulting progress SHALL equal the input
 * progress value.
 *
 * **Validates: Requirements 3.7**
 */
describe("Property 6: Seek proportionality", () => {
  it("seek sets currentTime to progress * duration for any valid progress", () => {
    fc.assert(
      fc.property(
        messageIdArb,
        fc.float({ min: 1, max: 600, noNaN: true, noDefaultInfinity: true }),
        fc.float({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        (messageId, dur, seekProgress) => {
          const state = new AudioPlayerState();
          state.startPlay(messageId);
          state.duration = dur;

          const result = state.seekTo(seekProgress);

          expect(result).not.toBeNull();

          // currentTime should equal progress * duration
          const expected = seekProgress * dur;
          expect(state.currentTime).toBeCloseTo(expected, 5);
          expect(state.progress).toBeCloseTo(seekProgress, 5);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("seek clamps progress values outside 0-1 range", () => {
    fc.assert(
      fc.property(
        messageIdArb,
        fc.float({ min: 1, max: 600, noNaN: true, noDefaultInfinity: true }),
        fc.oneof(
          fc.float({
            min: Math.fround(-100),
            max: Math.fround(-0.001),
            noNaN: true,
            noDefaultInfinity: true,
          }),
          fc.float({
            min: Math.fround(1.001),
            max: Math.fround(100),
            noNaN: true,
            noDefaultInfinity: true,
          }),
        ),
        (messageId, dur, outOfRangeProgress) => {
          const state = new AudioPlayerState();
          state.startPlay(messageId);
          state.duration = dur;

          state.seekTo(outOfRangeProgress);

          // Progress should be clamped to [0, 1]
          expect(state.progress).toBeGreaterThanOrEqual(0);
          expect(state.progress).toBeLessThanOrEqual(1);
          // currentTime should be within [0, duration]
          expect(state.currentTime).toBeGreaterThanOrEqual(0);
          expect(state.currentTime).toBeLessThanOrEqual(dur);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("seek returns null when no message is playing", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        (seekProgress) => {
          const state = new AudioPlayerState();
          const result = state.seekTo(seekProgress);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});
