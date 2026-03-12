/**
 * Property-Based Tests for Audio Message Packaging
 * Feature: audio-recording
 *
 * Tests Properties 7 and 8 from the design document
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type {
    ImageContent,
    InputAudioContent,
    TextContent,
} from "../OpenAICompatible";
import {
    createAudioMessage,
    createAudioMessageNative,
} from "../OpenAICompatible";

/**
 * **Feature: audio-recording, Property 7: Audio message packaging (image_url mode)**
 *
 * *For any* audio data URI string and optional text, the created API message SHALL
 * contain a content array with the audio wrapped as `type: "image_url"` with the
 * data URI as the url field, and if text is non-empty, a `type: "text"` part SHALL
 * also be present.
 *
 * **Validates: Requirements 4.1, 4.3**
 */
describe("Property 7: Audio message packaging (image_url mode)", () => {
  /** Arbitrary: a plausible audio data URI */
  const audioDataUriArb = fc
    .tuple(
      fc.constantFrom(
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
        "audio/webm",
        "audio/wav",
      ),
      fc.base64String({ minLength: 4, maxLength: 200 }),
    )
    .map(([mime, data]) => `data:${mime};base64,${data}`);

  /** Arbitrary: text that may be empty or non-empty (with possible whitespace-only) */
  const textArb = fc.oneof(
    fc.constant(""),
    fc.constant("   "),
    fc
      .string({ minLength: 1, maxLength: 100 })
      .filter((s) => s.trim().length > 0),
  );

  it("should always produce a user message with image_url content containing the data URI", () => {
    fc.assert(
      fc.property(textArb, audioDataUriArb, (text, audioDataUri) => {
        const msg = createAudioMessage(text, audioDataUri);

        // Role must be user
        expect(msg.role).toBe("user");

        // Content must be an array
        expect(Array.isArray(msg.content)).toBe(true);
        const parts = msg.content as Array<TextContent | ImageContent>;

        // Must contain exactly one image_url part with the audio data URI
        const imageUrlParts = parts.filter(
          (p) => p.type === "image_url",
        ) as ImageContent[];
        expect(imageUrlParts).toHaveLength(1);
        expect(imageUrlParts[0].image_url.url).toBe(audioDataUri);

        // Text part presence depends on whether text is non-empty after trim
        const textParts = parts.filter(
          (p) => p.type === "text",
        ) as TextContent[];
        if (text.trim().length > 0) {
          expect(textParts).toHaveLength(1);
          expect(textParts[0].text).toBe(text);
        } else {
          expect(textParts).toHaveLength(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * **Feature: audio-recording, Property 8: Audio message packaging (input_audio mode)**
 *
 * *For any* audio base64 string and format identifier, the created API message SHALL
 * contain a content array with `type: "input_audio"` and the correct data and format fields.
 *
 * **Validates: Requirements 4.2**
 */
describe("Property 8: Audio message packaging (input_audio mode)", () => {
  /** Arbitrary: base64-encoded audio data */
  const audioBase64Arb = fc.base64String({ minLength: 4, maxLength: 200 });

  /** Arbitrary: audio format string */
  const formatArb = fc.constantFrom("wav", "mp3", "webm", "ogg", "opus");

  /** Arbitrary: text that may be empty or non-empty */
  const textArb = fc.oneof(
    fc.constant(""),
    fc.constant("   "),
    fc
      .string({ minLength: 1, maxLength: 100 })
      .filter((s) => s.trim().length > 0),
  );

  it("should always produce a user message with input_audio content containing data and format", () => {
    fc.assert(
      fc.property(
        textArb,
        audioBase64Arb,
        formatArb,
        (text, audioBase64, format) => {
          const msg = createAudioMessageNative(text, audioBase64, format);

          // Role must be user
          expect(msg.role).toBe("user");

          // Content must be an array
          expect(Array.isArray(msg.content)).toBe(true);
          const parts = msg.content as Array<TextContent | InputAudioContent>;

          // Must contain exactly one input_audio part
          const audioParts = parts.filter(
            (p) => p.type === "input_audio",
          ) as InputAudioContent[];
          expect(audioParts).toHaveLength(1);
          expect(audioParts[0].input_audio.data).toBe(audioBase64);
          expect(audioParts[0].input_audio.format).toBe(format);

          // Text part presence depends on whether text is non-empty after trim
          const textParts = parts.filter(
            (p) => p.type === "text",
          ) as TextContent[];
          if (text.trim().length > 0) {
            expect(textParts).toHaveLength(1);
            expect(textParts[0].text).toBe(text);
          } else {
            expect(textParts).toHaveLength(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
