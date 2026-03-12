/**
 * Property-Based Tests for Audio Settings Persistence Round-Trip
 * Feature: audio-recording
 *
 * Tests Property 11 from the design document
 */

import type { AudioSettings } from "@/types/settings";
import { createDefaultAudioSettings } from "@/types/settings";
import "fake-indexeddb/auto";
import * as fc from "fast-check";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase } from "../../db/database";
import { useSettingsStore } from "../settings";

/**
 * **Feature: audio-recording, Property 11: Audio settings persistence round-trip**
 *
 * *For any* valid AudioSettings object, saving to IndexedDB and then loading
 * SHALL produce an equivalent AudioSettings object.
 *
 * **Validates: Requirements 7.2, 7.3, 7.4, 7.5**
 */
describe("Property 11: Audio settings persistence round-trip", () => {
  beforeEach(() => {
    closeDatabase();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    closeDatabase();
  });

  /** Arbitrary: a valid AudioSettings object */
  const audioSettingsArb: fc.Arbitrary<AudioSettings> = fc.record({
    quality: fc.constantFrom(
      "low" as const,
      "medium" as const,
      "high" as const,
    ),
    maxDuration: fc.constantFrom(
      30 as const,
      60 as const,
      120 as const,
      300 as const,
    ),
    sttEnabled: fc.boolean(),
    transmissionFormat: fc.constantFrom(
      "image_url" as const,
      "input_audio" as const,
    ),
  });

  it("saving and loading audio settings preserves all fields", async () => {
    await fc.assert(
      fc.asyncProperty(audioSettingsArb, async (settings) => {
        const store = useSettingsStore();

        // Load defaults first (initializes isLoaded flag)
        await store.loadSettings();

        // Apply the generated settings
        store.audio.quality = settings.quality;
        store.audio.maxDuration = settings.maxDuration;
        store.audio.sttEnabled = settings.sttEnabled;
        store.audio.transmissionFormat = settings.transmissionFormat;

        // Save to IndexedDB
        await store.saveSettings();

        // Create a fresh store and load from IndexedDB
        const freshPinia = createPinia();
        setActivePinia(freshPinia);
        const freshStore = useSettingsStore();
        await freshStore.loadSettings();

        // Verify round-trip
        expect(freshStore.audio.quality).toBe(settings.quality);
        expect(freshStore.audio.maxDuration).toBe(settings.maxDuration);
        expect(freshStore.audio.sttEnabled).toBe(settings.sttEnabled);
        expect(freshStore.audio.transmissionFormat).toBe(
          settings.transmissionFormat,
        );
      }),
      { numRuns: 100 },
    );
  });

  it("default audio settings survive round-trip", async () => {
    const store = useSettingsStore();
    await store.loadSettings();

    const defaults = createDefaultAudioSettings();

    // Save defaults
    await store.saveSettings();

    // Reload
    const freshPinia = createPinia();
    setActivePinia(freshPinia);
    const freshStore = useSettingsStore();
    await freshStore.loadSettings();

    expect(freshStore.audio.quality).toBe(defaults.quality);
    expect(freshStore.audio.maxDuration).toBe(defaults.maxDuration);
    expect(freshStore.audio.sttEnabled).toBe(defaults.sttEnabled);
    expect(freshStore.audio.transmissionFormat).toBe(
      defaults.transmissionFormat,
    );
  });
});
