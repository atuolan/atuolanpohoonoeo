import { describe, expect, it } from "vitest";
import {
  createDefaultStoredCharacter,
  normalizeStoredCharacter,
} from "./character";

describe("character tool permissions", () => {
  it("creates a character with enabled default tool permissions", () => {
    expect(createDefaultStoredCharacter().toolPermissions).toEqual({
      enabled: true,
      categories: {},
      tools: {},
    });
  });

  it("normalizes old records with missing permissions", () => {
    const character = createDefaultStoredCharacter();
    delete character.toolPermissions;
    expect(normalizeStoredCharacter(character).toolPermissions).toEqual({
      enabled: true,
      categories: {},
      tools: {},
    });
  });
});
