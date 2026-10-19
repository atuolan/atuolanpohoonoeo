import { _escapeRegex } from "@/utils/chatScreenHelpers";
import {
  applyHtmlTemplateRules,
  hasRenderableHtmlBlock,
} from "@/services/HtmlTemplateEngine";
import { getRegexedString, regex_placement } from "@/services/RegexEngine";
import { createStTemplateContext } from "@/services/StTemplateContextService";
import { useRegexScriptsStore } from "@/stores/regexScripts";
import { useUserStore } from "@/stores/user";
import type { CharacterAffinityConfig, ChatAffinityState } from "@/schemas/affinity";
import type { ChatMessage } from "@/types/chat";
import type { Lorebook } from "@/types/worldinfo";
import ejs from "ejs";
import { type Ref } from "vue";

export function useChatRegex(context: {
  currentCharacter: Ref<any>;
  characterName: string;
  effectivePersona: Ref<any>;
  currentChatId: Ref<string | null | undefined>;
  messages: Ref<any[]>;
  _affinityConfig: Ref<CharacterAffinityConfig | null>;
  _affinityState: Ref<ChatAffinityState | null>;
}) {
  const regexScriptsStore = useRegexScriptsStore();
  const userStore = useUserStore();

  function getActiveRegexScripts() {
    const global = regexScriptsStore.allScripts ?? [];
    const charScripts =
      context.currentCharacter.value?.data?.extensions?.regex_scripts ?? [];
    return [...global, ...charScripts];
  }

  function applyAIOutputRegex(content: string): string {
    content = content
      .replace(/\[time(?:stamp)?\s*[:：][^\]]*\]/gi, "")
      .trimStart();
    const scripts = getActiveRegexScripts();
    if (!scripts.length) return content;
    const charName =
      context.currentCharacter.value?.data?.name || context.characterName;
    const userName = userStore.currentPersona?.name || "User";
    const regexed = getRegexedString(
      content,
      regex_placement.AI_OUTPUT,
      scripts,
      { characterName: charName, userName },
    );
    const markdownRegexed = getRegexedString(
      regexed,
      regex_placement.AI_OUTPUT,
      scripts,
      { characterName: charName, userName, isMarkdown: true },
    );
    const displayRegexed = hasRenderableHtmlBlock(markdownRegexed)
      ? markdownRegexed
      : regexed;
    return applyHtmlTemplateRules(displayRegexed, scripts, {
      characterName: charName,
      userName,
      placement: regex_placement.AI_OUTPUT,
    }).text;
  }

  function applyUserInputRegex(content: string): string {
    const scripts = getActiveRegexScripts();
    if (!scripts.length) return content;
    const charName =
      context.currentCharacter.value?.data?.name || context.characterName;
    const userName = userStore.currentPersona?.name || "User";
    const regexed = getRegexedString(
      content,
      regex_placement.USER_INPUT,
      scripts,
      { characterName: charName, userName },
    );
    return applyHtmlTemplateRules(regexed, scripts, {
      characterName: charName,
      userName,
      placement: regex_placement.USER_INPUT,
    }).text;
  }

  /**
   * 組提示詞時套用到歷史訊息：只有勾「僅提示詞」的腳本會跑（對應 ST 組 prompt 的 isPrompt）。
   * depth 0 是最新一則，給腳本的最小／最大深度用。以前完全沒套用，這類腳本形同無效。
   */
  function applyPromptRegex(
    content: string,
    role: "user" | "assistant",
    depth: number,
  ): string {
    if (!content) return content;
    const scripts = getActiveRegexScripts();
    if (!scripts.length) return content;
    return getRegexedString(
      content,
      role === "user" ? regex_placement.USER_INPUT : regex_placement.AI_OUTPUT,
      scripts,
      {
        characterName:
          context.currentCharacter.value?.data?.name || context.characterName,
        userName: userStore.currentPersona?.name || "User",
        isPrompt: true,
        depth,
      },
    );
  }

  /**
   * 送進提示詞的世界書條目：套用影響位置勾「世界資訊」的「僅提示詞」腳本（對應 ST）。
   * 不改到 store 裡的世界書，回傳複本；沒有這類腳本就原樣回傳。
   */
  function applyWorldInfoRegex(lorebooks: Lorebook[]): Lorebook[] {
    const scripts = getActiveRegexScripts().filter(
      (s) =>
        !s.disabled &&
        s.promptOnly &&
        s.placement?.includes(regex_placement.WORLD_INFO),
    );
    if (!scripts.length) return lorebooks;
    const params = {
      characterName:
        context.currentCharacter.value?.data?.name || context.characterName,
      userName: userStore.currentPersona?.name || "User",
      isPrompt: true,
    };
    return lorebooks.map((book) => ({
      ...book,
      entries: (Array.isArray(book.entries) ? book.entries : []).map((entry) => ({
        ...entry,
        content: getRegexedString(
          entry.content,
          regex_placement.WORLD_INFO,
          scripts,
          params,
        ),
      })),
    }));
  }

  function processAiOutputTemplate(content: string): string {
    if (!content.includes("<%")) return content;
    const processed = content.replace(
      /(<%[-_=]?)(\s*[\s\S]*?)([-_]?%>)/g,
      (_match, open, body, close) =>
        open + body.replace(/\bawait\s+/g, "") + close,
    );
    try {
      const ctx = createStTemplateContext({
        affinityConfig: context._affinityConfig.value,
        affinityState: context._affinityState.value,
        charName:
          context.currentCharacter.value?.data?.name ||
          context.characterName ||
          "角色",
        userName:
          context.effectivePersona.value?.name ||
          userStore.currentPersona?.name ||
          "User",
        chatId: context.currentChatId.value ?? undefined,
        messages: context.messages.value as unknown as ChatMessage[],
      });
      return ejs.render(processed, ctx, { async: false });
    } catch (error) {
      console.warn("[useChatRegex] AI 回覆模板預處理失敗，保留原文:", error);
      return content;
    }
  }

  return {
    getActiveRegexScripts,
    applyAIOutputRegex,
    applyUserInputRegex,
    applyPromptRegex,
    applyWorldInfoRegex,
    processAiOutputTemplate,
  };
}
