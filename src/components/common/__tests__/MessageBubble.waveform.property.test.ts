/**
 * Property-Based Tests for MessageBubble Waveform Rendering
 * Feature: audio-recording
 *
 * Tests Property 12 from the design document
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

/**
 * Pure function that mirrors the waveform bar count logic in MessageBubble.vue template:
 *   `v-for="(bar, i) in audioWaveform?.length ? audioWaveform : Array(20).fill(0.3)"`
 *
 * Returns the number of waveform bars that would be rendered.
 */
function getWaveformBars(audioWaveform: number[] | undefined): {
  count: number;
  bars: number[];
} {
  const bars =
    audioWaveform && audioWaveform.length > 0
      ? audioWaveform
      : Array(20).fill(0.3);
  return { count: bars.length, bars };
}

/**
 * **Feature: audio-recording, Property 12: Waveform bar count matches data**
 *
 * *For any* waveform data array, the number of rendered waveform bars SHALL equal
 * the length of the waveform data array.
 *
 * **Validates: Requirements 6.4**
 */
describe("Property 12: Waveform bar count matches data", () => {
  /** Arbitrary: non-empty array of amplitude values (0-1) */
  const waveformArbitrary = fc.array(
    fc.float({ min: 0, max: 1, noNaN: true }),
    {
      minLength: 1,
      maxLength: 100,
    },
  );

  it("bar count equals waveform data length for any non-empty waveform", () => {
    fc.assert(
      fc.property(waveformArbitrary, (waveform) => {
        const { count, bars } = getWaveformBars(waveform);

        // The number of bars must equal the waveform array length
        expect(count).toBe(waveform.length);

        // Each bar value must match the original data
        expect(bars).toEqual(waveform);
      }),
      { numRuns: 100 },
    );
  });

  it("renders 20 default bars when waveform is undefined", () => {
    const { count } = getWaveformBars(undefined);
    expect(count).toBe(20);
  });

  it("renders 20 default bars when waveform is empty", () => {
    const { count } = getWaveformBars([]);
    expect(count).toBe(20);
  });
});
