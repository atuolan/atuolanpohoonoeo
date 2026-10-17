import { describe, expect, it } from "vitest";
import { DEFAULT_PROMPT_DEFINITIONS, DEFAULT_PROMPT_ORDER } from "@/data/defaultPrompts/chat";
import { getMacroEngine } from "@/engine/macros/MacroEngine";
import { PromptBuilder } from "@/engine/prompt/PromptBuilder";
import { createDefaultPromptManagerConfig } from "@/types/promptManager";

const WORD_COUNT_ID = "custom_1780407815279";

// 聊天變量跨輪保存，模擬 chatVariablesStore
const local = new Map<string, string>();
getMacroEngine().registerVarMacros(
  {
    getLocal: (name) => local.get(name) ?? "",
    setLocal: (name, value) => void local.set(name, value),
    addLocal: (name, value) => void local.set(name, (local.get(name) ?? "") + value),
    incLocal: () => "",
    decLocal: () => "",
    getGlobal: () => "",
    setGlobal: () => {},
    addGlobal: () => {},
    incGlobal: () => "",
    decGlobal: () => "",
  },
  () => "online",
);

function msg(id: string, isUser: boolean, content: string) {
  return {
    id,
    sender: isUser ? "user" : "assistant",
    name: isUser ? "小林" : "小鯤",
    is_user: isUser,
    content,
    status: "sent",
    createdAt: 1,
    updatedAt: 1,
  };
}

async function build(disabledIds: string[] = [], extra: Record<string, unknown> = {}) {
  const config = createDefaultPromptManagerConfig();
  config.globalPromptOrder = config.globalPromptOrder.map((entry) =>
    disabledIds.includes(entry.identifier) ? { ...entry, enabled: false } : entry,
  );
  const result = await new PromptBuilder({
    character: { id: "char-1", data: { name: "小鯤", description: "住在北冥的一條魚", personality: "愛吐槽" } },
    lorebooks: [],
    messages: [msg("m1", false, "早啊"), msg("m2", true, "今天好累")],
    settings: { maxContextLength: 100000, maxResponseLength: 1000 },
    userName: "小林",
    userPersona: "上班族",
    promptManagerConfig: config,
    ...extra,
  } as any).build();
  return result.messages as Array<{ role: string; content: string }>;
}

function between(text: string, open: string, close: string): string {
  return text.slice(text.indexOf(open), text.indexOf(close) + close.length);
}

function nameOf(identifier: string): string {
  return DEFAULT_PROMPT_DEFINITIONS.find((d) => d.identifier === identifier)!.name;
}

describe("線上模式預設提示詞分區", () => {
  it("每個分區開頭後面都有對應的結尾，沒有 assistant 預填", () => {
    const names = DEFAULT_PROMPT_ORDER.map((e) => nameOf(e.identifier));
    const openers = DEFAULT_PROMPT_DEFINITIONS.filter((d) => d.description?.startsWith("分區開頭"));
    expect(openers.length).toBeGreaterThan(0);
    for (const opener of openers) {
      const tag = opener.name.slice(1, -1);
      expect(names.indexOf(`</${tag}>`), tag).toBeGreaterThan(names.indexOf(opener.name));
    }
    expect(DEFAULT_PROMPT_DEFINITIONS.some((d) => d.role === "assistant" && d.content.trim() === "<thinking>")).toBe(false);
  });

  it("組好的提示詞依分區排列，宏全部展開", async () => {
    const messages = await build();
    const text = messages.map((m) => m.content).join("\n");
    const order = [
      "<User_Profile>",
      "</User_Profile>",
      "<CHAR_Profile>",
      "</CHAR_Profile>",
      "<前情提要>",
      "<Chat history>",
      "</Chat history>",
      "</前情提要>",
      "當前時間資訊",
      "<online_mode_features>",
      "<language_mode>",
      "【基拉祈·分析】",
    ];
    const positions = order.map((marker) => text.indexOf(marker));
    expect(positions.every((p) => p >= 0), JSON.stringify(positions)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);

    expect(text.match(/.{0,20}(\{\{|\}\}).{0,20}/g)).toBeNull();
    const last = messages[messages.length - 1];
    expect(last.role).not.toBe("assistant");
    expect(last.content.trimEnd().endsWith("不需要就不放）")).toBe(true);
  });

  it("功能標籤的格式各只寫在一處：來電預約只在來電決策，勿擾時整份都不出現", async () => {
    let text = (await build()).map((m) => m.content).join("\n");
    const callDecision = between(text, "<call_decision>", "</call_decision>");
    expect(callDecision).toContain("<schedule-call");
    expect(text.replace(callDecision, "")).not.toContain("schedule-call");

    // 還沒有飲食記錄時也看得到 food-record 的規則與範例
    const features = between(text, "<online_mode_features>", "</online_mode_features>");
    expect(features).toContain('<food-record meal="餐別"');
    expect(features).toContain('例如：<food-record meal="snack"');
    expect(text.split("<food-record meal=").length - 1).toBe(2);

    text = (await build([], { doNotDisturb: true })).map((m) => m.content).join("\n");
    expect(text).not.toContain("schedule-call");
  });

  it("思考框架讀出字數與語言；關掉模塊後不留上一輪的值", async () => {
    let text = (await build()).map((m) => m.content).join("\n");
    expect(text).toContain("這輪發幾條訊息？簡單回應 1-2 條");
    expect(text).toContain("這輪用什麼語言輸出？依 小鯤 的國籍與背景選擇語言");

    text = (await build([WORD_COUNT_ID])).map((m) => m.content).join("\n");
    expect(text).toContain("這輪發幾條訊息？\n");
    expect(text).not.toContain("簡單回應 1-2 條");
  });
});
