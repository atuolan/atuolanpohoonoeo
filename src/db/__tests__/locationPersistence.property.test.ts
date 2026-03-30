/**
 * 位置情境增強持久化往返屬性測試
 * Feature: location-context-enhancement
 *
 * Property 10: ChatLocationOverride 持久化往返
 * Property 13: CharacterWorldSettings 持久化往返
 */

import type {
  CharacterWorldSettings,
  StoredCharacter,
} from "@/types/character";
import type { Chat, ChatLocationOverride } from "@/types/chat";
import "fake-indexeddb/auto";
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getDatabase } from "../database";

// ===== 測試輔助 =====

function createMinimalChat(
  id: string,
  locationOverride?: ChatLocationOverride,
): Chat {
  return {
    id,
    name: "測試聊天",
    characterId: "char-1",
    messages: [],
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    locationOverride,
  };
}

function createMinimalCharacter(
  id: string,
  worldSettings?: CharacterWorldSettings,
): StoredCharacter {
  return {
    id,
    nickname: "測試角色",
    avatar: "",
    data: {
      name: "測試角色",
      description: "",
      personality: "",
      scenario: "",
      first_mes: "",
      mes_example: "",
      creator_notes: "",
      system_prompt: "",
      post_history_instructions: "",
      alternate_greetings: [],
      tags: [],
      creator: "",
      character_version: "1.0",
      extensions: {
        talkativeness: 0.5,
        fav: false,
        world: "",
        depth_prompt: { prompt: "", depth: 0, role: "system" },
        regex_scripts: [],
      },
    },
    lorebookIds: [],
    source: "manual",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    worldSettings,
  };
}

beforeEach(() => {
  closeDatabase();
});

afterEach(() => {
  closeDatabase();
});

// ===== Arbitraries =====

const chatLocationOverrideArb = fc.record({
  mode: fc.constantFrom("manual" as const, "browser" as const),
  city: fc.option(fc.string({ minLength: 1, maxLength: 20 }), {
    nil: undefined,
  }),
  lat: fc.option(fc.float({ min: -90, max: 90, noNaN: true }), {
    nil: undefined,
  }),
  lon: fc.option(fc.float({ min: -180, max: 180, noNaN: true }), {
    nil: undefined,
  }),
});

const characterWorldSettingsArb = fc.record({
  location: fc.option(fc.string({ minLength: 1, maxLength: 30 }), {
    nil: undefined,
  }),
  timezone: fc.option(
    fc.constantFrom("Asia/Tokyo", "Asia/Taipei", "America/New_York", "UTC"),
    { nil: undefined },
  ),
  weatherOverride: fc.option(fc.string({ minLength: 1, maxLength: 30 }), {
    nil: undefined,
  }),
});

// ===== Property 10: ChatLocationOverride 持久化往返 =====
// Feature: location-context-enhancement, Property 10: ChatLocationOverride 持久化往返
describe("Property 10: ChatLocationOverride 持久化往返", () => {
  it("儲存後讀取應得到結構等價的 ChatLocationOverride", async () => {
    await fc.assert(
      fc.asyncProperty(chatLocationOverrideArb, async (locationOverride) => {
        const id = `chat-${crypto.randomUUID()}`;
        const chat = createMinimalChat(id, locationOverride);

        const db = await getDatabase();
        await db.put("chats", chat);

        const loaded = await db.get("chats", id);
        expect(loaded).toBeDefined();
        expect(loaded!.locationOverride).toBeDefined();

        const lo = loaded!.locationOverride!;
        expect(lo.mode).toBe(locationOverride.mode);

        if (locationOverride.city !== undefined) {
          expect(lo.city).toBe(locationOverride.city);
        } else {
          expect(lo.city).toBeUndefined();
        }

        if (locationOverride.lat !== undefined) {
          expect(lo.lat).toBeCloseTo(locationOverride.lat, 5);
        } else {
          expect(lo.lat).toBeUndefined();
        }

        if (locationOverride.lon !== undefined) {
          expect(lo.lon).toBeCloseTo(locationOverride.lon, 5);
        } else {
          expect(lo.lon).toBeUndefined();
        }
      }),
      { numRuns: 100 },
    );
  });

  it("locationOverride 為 undefined 時，讀取後仍為 undefined", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(undefined), async () => {
        const id = `chat-${crypto.randomUUID()}`;
        const chat = createMinimalChat(id, undefined);

        const db = await getDatabase();
        await db.put("chats", chat);

        const loaded = await db.get("chats", id);
        expect(loaded).toBeDefined();
        expect(loaded!.locationOverride).toBeUndefined();
      }),
      { numRuns: 20 },
    );
  });
});

// ===== Property 13: CharacterWorldSettings 持久化往返 =====
// Feature: location-context-enhancement, Property 13: CharacterWorldSettings 持久化往返
describe("Property 13: CharacterWorldSettings 持久化往返", () => {
  it("儲存後讀取應得到結構等價的 CharacterWorldSettings", async () => {
    await fc.assert(
      fc.asyncProperty(characterWorldSettingsArb, async (worldSettings) => {
        const id = `char-${crypto.randomUUID()}`;
        const character = createMinimalCharacter(id, worldSettings);

        const db = await getDatabase();
        await db.put("characters", character);

        const loaded = await db.get("characters", id);
        expect(loaded).toBeDefined();
        expect(loaded!.worldSettings).toBeDefined();

        const ws = loaded!.worldSettings!;

        if (worldSettings.location !== undefined) {
          expect(ws.location).toBe(worldSettings.location);
        } else {
          expect(ws.location).toBeUndefined();
        }

        if (worldSettings.timezone !== undefined) {
          expect(ws.timezone).toBe(worldSettings.timezone);
        } else {
          expect(ws.timezone).toBeUndefined();
        }

        if (worldSettings.weatherOverride !== undefined) {
          expect(ws.weatherOverride).toBe(worldSettings.weatherOverride);
        } else {
          expect(ws.weatherOverride).toBeUndefined();
        }
      }),
      { numRuns: 100 },
    );
  });

  it("worldSettings 為 undefined 時，讀取後仍為 undefined", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(undefined), async () => {
        const id = `char-${crypto.randomUUID()}`;
        const character = createMinimalCharacter(id, undefined);

        const db = await getDatabase();
        await db.put("characters", character);

        const loaded = await db.get("characters", id);
        expect(loaded).toBeDefined();
        expect(loaded!.worldSettings).toBeUndefined();
      }),
      { numRuns: 20 },
    );
  });
});
