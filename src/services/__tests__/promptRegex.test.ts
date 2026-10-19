import { describe, expect, it } from "vitest";

import { regex_placement } from "@/services/RegexEngine";
import {
  applyPromptRegexToHistory,
  applyWorldInfoRegexToLorebooks,
  chatMessageRole,
  type PromptRegexContext,
} from "@/services/promptRegex";
import type { RegexScript } from "@/types/character";
import type { Lorebook } from "@/types/worldinfo";

function script(overrides: Partial<RegexScript>): RegexScript {
  return {
    id: "s",
    scriptName: "s",
    findRegex: "/<狀態>[\\s\\S]*?<\\/狀態>/g",
    replaceString: "",
    trimStrings: [],
    placement: [regex_placement.AI_OUTPUT],
    disabled: false,
    markdownOnly: false,
    promptOnly: true,
    runOnEdit: false,
    substituteRegex: 0,
    minDepth: -1,
    maxDepth: -1,
    ...overrides,
  };
}

const msg = (sender: "user" | "assistant" | "system", content: string) => ({
  sender,
  is_user: sender === "user",
  content,
});

describe("applyPromptRegexToHistory", () => {
  it("只動 AI 訊息、依位置算深度（0 是最新一則），系統訊息不動", () => {
    const ctx: PromptRegexContext = { scripts: [script({ minDepth: 1 })] };
    const history = [
      msg("assistant", "舊<狀態>a</狀態>"),
      msg("system", "系統<狀態>b</狀態>"),
      msg("user", "我<狀態>c</狀態>"),
      msg("assistant", "新<狀態>d</狀態>"),
    ];

    const result = applyPromptRegexToHistory(history, chatMessageRole, ctx);

    expect(result.map((m) => m.content)).toEqual([
      "舊",
      "系統<狀態>b</狀態>",
      "我<狀態>c</狀態>",
      "新<狀態>d</狀態>",
    ]);
    // 沒變的訊息原樣保留
    expect(result[3]).toBe(history[3]);
  });

  it("沒有「僅提示詞」腳本就原樣回傳", () => {
    const history = [msg("assistant", "x<狀態>a</狀態>")];
    const ctx: PromptRegexContext = { scripts: [script({ promptOnly: false })] };
    expect(applyPromptRegexToHistory(history, chatMessageRole, ctx)).toBe(history);
  });
});

describe("applyWorldInfoRegexToLorebooks", () => {
  it("影響位置勾「世界資訊」的腳本套用到條目，不改到原本的世界書", () => {
    const book = {
      id: "lb",
      name: "書",
      entries: [{ uid: 1, content: "設定<狀態>x</狀態>" }],
    } as unknown as Lorebook;
    const ctx: PromptRegexContext = {
      scripts: [script({ placement: [regex_placement.WORLD_INFO] })],
    };

    const [result] = applyWorldInfoRegexToLorebooks([book], ctx);

    expect(result.entries[0].content).toBe("設定");
    expect(book.entries[0].content).toBe("設定<狀態>x</狀態>");
  });
});
