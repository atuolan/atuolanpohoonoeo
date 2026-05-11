import { describe, expect, it } from "vitest";
import { getRegexedString, regex_placement } from "../RegexEngine";
import type { RegexScript } from "@/types/character";

function makeScript(overrides: Partial<RegexScript>): RegexScript {
  return {
    id: "script-1",
    scriptName: "script",
    findRegex: "/<music>([\\s\\S]*?)<\\/music>/g",
    replaceString: "<div class=\"music-player\">$1</div>",
    trimStrings: [],
    placement: [regex_placement.AI_OUTPUT],
    disabled: false,
    markdownOnly: true,
    promptOnly: false,
    runOnEdit: false,
    substituteRegex: 0,
    minDepth: -1,
    maxDepth: -1,
    ...overrides,
  };
}

describe("RegexEngine", () => {
  it("fences markdown html replacements at the original match position", () => {
    const result = getRegexedString(
      "<music>凡星</music>後面的文字",
      regex_placement.AI_OUTPUT,
      [makeScript({})],
      { isMarkdown: true },
    );

    expect(result).toBe("\n```html\n<div class=\"music-player\">凡星</div>\n```\n後面的文字");
  });

  it("does not fence non-markdown html replacements", () => {
    const result = getRegexedString(
      "<music>凡星</music>",
      regex_placement.AI_OUTPUT,
      [makeScript({ markdownOnly: false })],
      {},
    );

    expect(result).toBe("<div class=\"music-player\">凡星</div>");
  });

  it("fences markdown html replacements that start with external assets", () => {
    const result = getRegexedString(
      "<music>曲目1</music>正文",
      regex_placement.AI_OUTPUT,
      [
        makeScript({
          replaceString: "<link rel=\"stylesheet\" href=\"font.css\"><div>$1</div>",
        }),
      ],
      { isMarkdown: true },
    );

    expect(result).toBe(
      "\n```html\n<link rel=\"stylesheet\" href=\"font.css\"><div>曲目1</div>\n```\n正文",
    );
  });

  it("substitutes multi-digit capture groups without consuming lower-numbered prefixes", () => {
    const result = getRegexedString(
      "<status>g1|g2|g3|g4|g5|g6|g7|g8|g9|g10|g11|g12</status>",
      regex_placement.AI_OUTPUT,
      [
        makeScript({
          findRegex:
            "/<status>(.*?)\\|(.*?)\\|(.*?)\\|(.*?)\\|(.*?)\\|(.*?)\\|(.*?)\\|(.*?)\\|(.*?)\\|(.*?)\\|(.*?)\\|(.*?)<\\/status>/",
          replaceString: "$1,$10,$12,$2",
          markdownOnly: false,
        }),
      ],
      {},
    );

    expect(result).toBe("g1,g10,g12,g2");
  });
});
