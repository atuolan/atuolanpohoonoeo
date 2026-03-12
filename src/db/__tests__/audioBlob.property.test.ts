/**
 * Property-Based Tests for Audio Blob Extract/Restore Round-Trip
 * Feature: audio-recording
 *
 * Tests Property 9 from the design document
 */

import type { ChatMessage } from "@/types/chat";
import "fake-indexeddb/auto";
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase } from "../database";
import {
    extractAudioFromMessages,
    isAudioBlobRef,
    restoreAudioToMessages,
} from "../operations";

/**
 * Helper: create a minimal ChatMessage with audio data for testing
 */
function createAudioMessage(overrides: {
  audioMimeType: string;
  audioDuration: number;
  audioWaveform: number[];
  audioBlob: Blob;
}): ChatMessage {
  const msg: ChatMessage & { _audioBlob?: Blob } = {
    id: crypto.randomUUID(),
    sender: "user",
    name: "Test User",
    content: "",
    is_user: true,
    status: "sent",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messageType: "audio",
    audioMimeType: overrides.audioMimeType,
    audioDuration: overrides.audioDuration,
    audioWaveform: overrides.audioWaveform,
    _audioBlob: overrides.audioBlob,
  };
  return msg as ChatMessage;
}
/**
 * **Feature: audio-recording, Property 9: Audio blob extract/restore round-trip**
 *
 * *For any* list of ChatMessages containing audio data, extracting audio blobs
 * and then restoring them SHALL produce messages with equivalent audioBlobId,
 * audioMimeType, audioDuration, and audioWaveform values.
 *
 * **Validates: Requirements 5.1, 5.2, 5.3**
 */
describe("Property 9: Audio blob extract/restore round-trip", () => {
  beforeEach(() => {
    // Reset the database instance before each test so fake-indexeddb is used fresh
    closeDatabase();
  });

  afterEach(() => {
    closeDatabase();
  });

  /** Arbitrary: a valid MIME type for audio */
  const mimeTypeArb = fc.constantFrom(
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/webm",
    "audio/wav",
  );

  /** Arbitrary: a valid audio duration in seconds (1-300) */
  const durationArb = fc.float({ min: 1, max: 300, noNaN: true });

  /** Arbitrary: a waveform array of 30-50 values between 0 and 1 */
  const waveformArb = fc.array(fc.float({ min: 0, max: 1, noNaN: true }), {
    minLength: 30,
    maxLength: 50,
  });

  /** Arbitrary: a small audio blob (random bytes) */
  const audioBlobArb = fc
    .uint8Array({ minLength: 100, maxLength: 500 })
    .chain((bytes) =>
      mimeTypeArb.map((mime) => ({
        blob: new Blob([bytes], { type: mime }),
        mimeType: mime,
        bytes,
      })),
    );

  it("extract then restore preserves audio metadata for any audio message", async () => {
    await fc.assert(
      fc.asyncProperty(
        audioBlobArb,
        durationArb,
        waveformArb,
        async (audioData, duration, waveform) => {
          const originalMsg = createAudioMessage({
            audioMimeType: audioData.mimeType,
            audioDuration: duration,
            audioWaveform: waveform,
            audioBlob: audioData.blob,
          });

          // Extract: saves blob to store, sets audioBlobId
          const extracted = await extractAudioFromMessages([originalMsg]);
          expect(extracted).toHaveLength(1);

          const extractedMsg = extracted[0];

          // After extraction, audioBlobId should be a valid store reference
          expect(isAudioBlobRef(extractedMsg.audioBlobId)).toBe(true);
          // Temporary blob field should be removed
          expect((extractedMsg as any)._audioBlob).toBeUndefined();
          // Metadata should be preserved
          expect(extractedMsg.audioMimeType).toBe(audioData.mimeType);
          expect(extractedMsg.audioDuration).toBe(duration);
          expect(extractedMsg.audioWaveform).toEqual(waveform);

          // Restore: load blob from store using audioBlobId
          const blobMap = await restoreAudioToMessages([extractedMsg]);
          const restoredRecord = blobMap.get(extractedMsg.audioBlobId!);

          expect(restoredRecord).toBeDefined();
          expect(restoredRecord!.mimeType).toBe(audioData.mimeType);
          expect(restoredRecord!.blob).toBeInstanceOf(Blob);
          expect(restoredRecord!.blob.size).toBe(audioData.blob.size);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("messages without audio data pass through extract unchanged", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        async (content) => {
          const textMsg: ChatMessage = {
            id: crypto.randomUUID(),
            sender: "user",
            name: "Test",
            content,
            is_user: true,
            status: "sent",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messageType: "text",
          };

          const extracted = await extractAudioFromMessages([textMsg]);
          expect(extracted).toHaveLength(1);
          expect(extracted[0]).toEqual(textMsg);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("restore returns empty map for messages without audio blob refs", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        async (content) => {
          const textMsg: ChatMessage = {
            id: crypto.randomUUID(),
            sender: "user",
            name: "Test",
            content,
            is_user: true,
            status: "sent",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          const blobMap = await restoreAudioToMessages([textMsg]);
          expect(blobMap.size).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
