import { describe, expect, it } from "vitest";
import { DEFAULT_GROUP_CHAT_PROMPT_ORDER, GROUP_CHAT_PROMPT_DEFINITIONS } from "@/data/groupChatPrompts";
import { getMacroEngine } from "@/engine/macros/MacroEngine";
import { PromptBuilder } from "@/engine/prompt/PromptBuilder";
import { createDefaultPromptManagerConfig } from "@/types/promptManager";

const WORD_COUNT_NAME = "字數";

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
  () => "gc",
);

function member(name: string) {
  return {
    characterId: `id_${name}`,
    name,
    personality: `${name}的性格`,
    description: `${name}的人設`,
    avatar: "",
    isAdmin: false,
    isMuted: false,
  };
}

function msg(id: string, isUser: boolean, name: string, content: string) {
  return {
    id,
    sender: isUser ? "user" : "assistant",
    name,
    is_user: isUser,
    content,
    status: "sent",
    createdAt: 1,
    updatedAt: 1,
  };
}

async function build(disabledNames: string[] = [], extra: Record<string, unknown> = {}) {
  const config = createDefaultPromptManagerConfig();
  const disabledIds = GROUP_CHAT_PROMPT_DEFINITIONS.filter((d) => disabledNames.includes(d.name)).map(
    (d) => d.identifier,
  );
  config.groupChatPromptOrder = config.groupChatPromptOrder!.map((entry) =>
    disabledIds.includes(entry.identifier) ? { ...entry, enabled: false } : entry,
  );
  const result = await new PromptBuilder({
    character: { id: "char-1", data: { name: "阿明", description: "", personality: "" } },
    lorebooks: [],
    messages: [msg("m1", false, "阿明", "早啊"), msg("m2", true, "小林", "今天好累")],
    settings: { maxContextLength: 100000, maxResponseLength: 1000 },
    userName: "小林",
    userPersona: "上班族",
    promptManagerConfig: config,
    groupChatMode: true,
    groupName: "下班群",
    groupMembers: [member("阿明"), member("大雄")],
    ...extra,
  } as any).build();
  return result.messages as Array<{ role: string; content: string }>;
}

const join = (messages: Array<{ content: string }>) => messages.map((m) => m.content).join("\n");

describe("群聊預設提示詞（照線上模式分區）", () => {
  it("每個分區開頭後面都有對應的結尾，沒有 assistant 預填", () => {
    const nameOf = (id: string) => GROUP_CHAT_PROMPT_DEFINITIONS.find((d) => d.identifier === id)?.name ?? id;
    const names = DEFAULT_GROUP_CHAT_PROMPT_ORDER.map((e) => nameOf(e.identifier));
    const openers = GROUP_CHAT_PROMPT_DEFINITIONS.filter((d) => d.description?.startsWith("分區開頭"));
    expect(openers.length).toBeGreaterThan(0);
    for (const opener of openers) {
      const tag = opener.name.slice(1, -1);
      expect(names.indexOf(`</${tag}>`), tag).toBeGreaterThan(names.indexOf(opener.name));
    }
    expect(GROUP_CHAT_PROMPT_DEFINITIONS.some((d) => d.role === "assistant" && /^<think(ing)?>$/.test(d.content.trim()))).toBe(
      false,
    );
  });

  it("順序裡每一條都有定義（提示詞管理才不會顯示成 identifier 加「自訂」）", () => {
    const ids = new Set(GROUP_CHAT_PROMPT_DEFINITIONS.map((d) => d.identifier));
    expect(DEFAULT_GROUP_CHAT_PROMPT_ORDER.filter((e) => !ids.has(e.identifier))).toEqual([]);
  });

  it("組好的提示詞依分區排列，宏全部展開，群聊不處理的標籤不出現", async () => {
    const messages = await build();
    const text = join(messages);
    const order = [
      "<User_Profile>",
      "</User_Profile>",
      "<CHAR_Profile>",
      "<group_members>",
      "</CHAR_Profile>",
      "<前情提要>",
      "<Chat history>",
      "</Chat history>",
      "</前情提要>",
      "當前時間資訊",
      "<group_xml_format>",
      "<group_chat_rules>",
      "<group_call_system>",
      "<language_mode>",
      "<UserMessage>",
      "<group_character_names>",
      "【基拉祈·分析】",
    ];
    const positions = order.map((marker) => text.indexOf(marker));
    expect(positions.every((p) => p >= 0), JSON.stringify(positions)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);

    expect(text.match(/.{0,20}(\{\{|\}\}).{0,20}/g)).toBeNull();
    for (const unsupported of ["char-location", "schedule-call", "<plurk", "char-status", "face-to-face-request"]) {
      expect(text, unsupported).not.toContain(unsupported);
    }
    expect(messages[messages.length - 1].role).not.toBe("assistant");
  });

  it("思考框架讀出字數與語言；關掉模塊後不留上一輪的值", async () => {
    let text = join(await build());
    expect(text).toContain("這輪發幾條訊息？每個要發言的角色 1-3 條");
    expect(text).toContain("每個角色這輪用什麼語言輸出？依每個角色的國籍與背景選擇語言");

    text = join(await build([WORD_COUNT_NAME]));
    expect(text).toContain("這輪發幾條訊息？\n");
    expect(text).not.toContain("每個要發言的角色 1-3 條");
  });

  it("勿擾時群通話系統整條不注入", async () => {
    const text = join(await build([], { doNotDisturb: true }));
    expect(text).toContain("開了勿擾");
    expect(text).not.toContain("<group-call-request");
  });

  it("開了 MiniMax 語音才帶語音標記規則，放在思考框架後面", async () => {
    const text = join(await build([], { minimaxTTSEnabled: true }));
    expect(text.indexOf("語音合成標記規則")).toBeGreaterThan(text.indexOf("<thinking>"));
    expect(text).toContain('<msg name="角色名">好啊，我等你[emotion=calm]</msg>');
    expect(text).not.toContain("引號關閉前");
    expect(join(await build())).not.toContain("語音合成標記規則");
  });
});
