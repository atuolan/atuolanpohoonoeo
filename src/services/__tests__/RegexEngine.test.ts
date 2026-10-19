import { describe, expect, it } from "vitest";

import { getRegexedString, regex_placement, runRegexScript } from "@/services/RegexEngine";
import type { RegexScript } from "@/types/character";

function script(overrides: Partial<RegexScript>): RegexScript {
  return {
    id: "s",
    scriptName: "s",
    findRegex: "",
    replaceString: "",
    trimStrings: [],
    placement: [regex_placement.AI_OUTPUT],
    disabled: false,
    markdownOnly: false,
    promptOnly: false,
    runOnEdit: false,
    substituteRegex: 0,
    minDepth: -1,
    maxDepth: -1,
    ...overrides,
  };
}

describe("runRegexScript", () => {
  it("{{match}} 帶進來的原文裡有 $1 不會被當成群組代換", () => {
    const s = script({ findRegex: "/價格：(\\S+)/", replaceString: "【{{match}}】" });
    expect(runRegexScript(s, "價格：$100")).toBe("【價格：$100】");
  });

  it("$0 是整段比對，具名群組 $<name> 也能代換", () => {
    const s = script({
      findRegex: "/(?<who>\\S+)說：(?<what>.+)/",
      replaceString: "$<who>：「$<what>」（$0）",
    });
    expect(runRegexScript(s, "譚堯說：你好")).toBe("譚堯：「你好」（譚堯說：你好）");
  });

  it("修剪字串也套用在 {{match}}", () => {
    const s = script({ findRegex: "/<b>.*?<\\/b>/", replaceString: "{{match}}", trimStrings: ["<b>", "</b>"] });
    expect(runRegexScript(s, "<b>粗體</b>")).toBe("粗體");
  });
});

describe("getRegexedString 深度", () => {
  const strip = script({ findRegex: "/<狀態>[\\s\\S]*?<\\/狀態>/g", promptOnly: true, minDepth: 2 });

  it("沒設最大深度（-1）時不會被當成上限 -1 而整個跳過", () => {
    expect(
      getRegexedString("A<狀態>x</狀態>", regex_placement.AI_OUTPUT, [strip], { isPrompt: true, depth: 5 }),
    ).toBe("A");
  });

  it("最小深度以內的訊息不套用", () => {
    expect(
      getRegexedString("A<狀態>x</狀態>", regex_placement.AI_OUTPUT, [strip], { isPrompt: true, depth: 1 }),
    ).toBe("A<狀態>x</狀態>");
  });
});
