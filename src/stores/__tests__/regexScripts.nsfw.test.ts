import "fake-indexeddb/auto";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { getRegexedString, regex_placement } from "@/services/RegexEngine";
import { useRegexScriptsStore } from "@/stores/regexScripts";

const STORY = "她把臉埋進他頸窩裡。";
const NSFW = "<NSFW>\n涅芙愛色色：現在是第3/10的階段\n</NSFW>";

describe("[內置] 隱藏 <NSFW> 色色判定", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  function nsfwScript() {
    const script = useRegexScriptsStore().builtinScripts.find(
      (s) => s.id === "__builtin_hide_nsfw_judgement",
    );
    expect(script).toBeDefined();
    return [script!];
  }

  it("氣泡顯示時隱藏整段 <NSFW>", () => {
    const shown = getRegexedString(`${STORY}\n\n${NSFW}`, regex_placement.AI_OUTPUT, nsfwScript(), {
      isMarkdown: true,
    });
    expect(shown).toBe(STORY);
  });

  it("串流中還沒收到 </NSFW> 也先隱藏", () => {
    const shown = getRegexedString(`${STORY}\n<NSFW>\n涅芙愛色色`, regex_placement.AI_OUTPUT, nsfwScript(), {
      isMarkdown: true,
    });
    expect(shown).toBe(STORY);
  });

  it("存檔與發送給 AI 時保留原文", () => {
    const raw = `${STORY}\n\n${NSFW}`;
    expect(getRegexedString(raw, regex_placement.AI_OUTPUT, nsfwScript())).toBe(raw);
    expect(getRegexedString(raw, regex_placement.AI_OUTPUT, nsfwScript(), { isPrompt: true })).toBe(raw);
  });
});
