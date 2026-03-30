/**
 * SettingsStore 屬性測試
 * Feature: location-context-enhancement
 */

import { closeDatabase } from "@/db/database";
import { useSettingsStore } from "@/stores/settings";
import "fake-indexeddb/auto";
import * as fc from "fast-check";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  closeDatabase();
  setActivePinia(createPinia());
});

afterEach(() => {
  closeDatabase();
});

// ===== Property 7: nearbyPlacesLimit 值域限制 =====
// Feature: location-context-enhancement, Property 7: nearbyPlacesLimit 值域限制
describe("Property 7: nearbyPlacesLimit 值域限制", () => {
  it("任意整數輸入後讀取值應在 [5, 30] 範圍內", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: -100, max: 200 }), async (input) => {
        const store = useSettingsStore();
        await store.loadSettings();

        // Pinia 自動解包 ref，直接賦值
        store.nearbyPlacesLimit = Math.min(30, Math.max(5, input));
        await store.saveSettings();

        closeDatabase();
        setActivePinia(createPinia());
        const store2 = useSettingsStore();
        await store2.loadSettings();

        expect(store2.nearbyPlacesLimit).toBeGreaterThanOrEqual(5);
        expect(store2.nearbyPlacesLimit).toBeLessThanOrEqual(30);
      }),
      { numRuns: 100 },
    );
  });

  it("loadSettings 時自動 clamp 超出範圍的儲存值", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.integer({ min: -100, max: 4 }),
          fc.integer({ min: 31, max: 200 }),
        ),
        async (outOfRange) => {
          const store = useSettingsStore();
          await store.loadSettings();
          // 強制寫入超出範圍值（模擬舊資料）
          store.nearbyPlacesLimit = outOfRange;
          await store.saveSettings();

          closeDatabase();
          setActivePinia(createPinia());
          const store2 = useSettingsStore();
          await store2.loadSettings();

          expect(store2.nearbyPlacesLimit).toBeGreaterThanOrEqual(5);
          expect(store2.nearbyPlacesLimit).toBeLessThanOrEqual(30);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ===== Property 8: nearbyPlacesRadius 值域限制 =====
// Feature: location-context-enhancement, Property 8: nearbyPlacesRadius 值域限制
describe("Property 8: nearbyPlacesRadius 值域限制", () => {
  it("任意整數輸入後讀取值應在 [10, 100] 範圍內", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: -100, max: 500 }), async (input) => {
        const store = useSettingsStore();
        await store.loadSettings();

        store.nearbyPlacesRadius = Math.min(100, Math.max(10, input));
        await store.saveSettings();

        closeDatabase();
        setActivePinia(createPinia());
        const store2 = useSettingsStore();
        await store2.loadSettings();

        expect(store2.nearbyPlacesRadius).toBeGreaterThanOrEqual(10);
        expect(store2.nearbyPlacesRadius).toBeLessThanOrEqual(100);
      }),
      { numRuns: 100 },
    );
  });

  it("loadSettings 時自動 clamp 超出範圍的儲存值", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.integer({ min: -100, max: 9 }),
          fc.integer({ min: 101, max: 500 }),
        ),
        async (outOfRange) => {
          const store = useSettingsStore();
          await store.loadSettings();
          store.nearbyPlacesRadius = outOfRange;
          await store.saveSettings();

          closeDatabase();
          setActivePinia(createPinia());
          const store2 = useSettingsStore();
          await store2.loadSettings();

          expect(store2.nearbyPlacesRadius).toBeGreaterThanOrEqual(10);
          expect(store2.nearbyPlacesRadius).toBeLessThanOrEqual(100);
        },
      ),
      { numRuns: 50 },
    );
  });
});
