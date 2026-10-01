import { describe, expect, it } from "vitest";
import type { ChatLocalPrompt } from "@/types/chat";
import type { PromptDefinition, PromptOrderEntry } from "@/types/promptManager";
import {
  applyChatPromptPreset,
  buildPresetToggleRows,
  readChatPromptPreset,
  sanitizeChatPrompts,
} from "@/utils/chatPromptPreset";

const ORDER: PromptOrderEntry[] = [
  { identifier: "main", enabled: true },
  { identifier: "style", enabled: false },
  { identifier: "chatHistory", enabled: true },
  { identifier: "final", enabled: true },
];

function prompt(patch: Partial<ChatLocalPrompt> & { id: string }): ChatLocalPrompt {
  return {
    name: patch.id,
    role: "system",
    content: "內容",
    placement: "end",
    depth: 0,
    modes: ["online", "f2f"],
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  };
}

function ids(order: PromptOrderEntry[]): string[] {
  return order.map((entry) => entry.identifier);
}

describe("applyChatPromptPreset", () => {
  it("強制開關蓋過全域預設，沒列出的條目維持原狀", () => {
    const result = applyChatPromptPreset(ORDER, { toggles: { main: false, style: true } }, "online");
    expect(result).toEqual([
      { identifier: "main", enabled: false },
      { identifier: "style", enabled: true },
      { identifier: "chatHistory", enabled: true },
      { identifier: "final", enabled: true },
    ]);
    // 不改動傳入的順序
    expect(ORDER[0].enabled).toBe(true);
  });

  it("專屬條目依放置位置插入，同位置維持建立順序", () => {
    const result = applyChatPromptPreset(
      ORDER,
      {
        prompts: [
          prompt({ id: "end-1", placement: "end" }),
          prompt({ id: "top-1", placement: "top" }),
          prompt({ id: "before-1", placement: "beforeHistory" }),
          prompt({ id: "top-2", placement: "top" }),
          prompt({ id: "before-2", placement: "beforeHistory" }),
          prompt({ id: "depth-1", placement: "depth", depth: 2 }),
        ],
      },
      "online",
    );
    expect(ids(result)).toEqual([
      "top-1",
      "top-2",
      "main",
      "style",
      "before-1",
      "before-2",
      "chatHistory",
      "final",
      "end-1",
      "depth-1",
    ]);
  });

  it("面對面與群聊的聊天記錄條目也認得", () => {
    for (const historyId of ["f2fChatHistory", "gcChatHistory"]) {
      const order = [
        { identifier: "a", enabled: true },
        { identifier: historyId, enabled: true },
        { identifier: "b", enabled: true },
      ];
      const result = applyChatPromptPreset(
        order,
        { prompts: [prompt({ id: "x", placement: "beforeHistory", modes: ["f2f", "gc"] })] },
        historyId === "f2fChatHistory" ? "f2f" : "gc",
      );
      expect(ids(result)).toEqual(["a", "x", historyId, "b"]);
    }
  });

  it("順序裡沒有聊天記錄時，「聊天記錄之前」的條目退到最後面", () => {
    const result = applyChatPromptPreset(
      [{ identifier: "main", enabled: true }],
      {
        prompts: [
          prompt({ id: "end-1", placement: "end" }),
          prompt({ id: "before-1", placement: "beforeHistory" }),
        ],
      },
      "online",
    );
    expect(ids(result)).toEqual(["main", "before-1", "end-1"]);
  });

  it("只帶上適用於目前模式的專屬條目", () => {
    const prompts = [
      prompt({ id: "text-only", modes: ["online", "f2f"] }),
      prompt({ id: "call-only", modes: ["call"] }),
      prompt({ id: "f2f-only", modes: ["f2f"] }),
    ];
    const added = (mode: Parameters<typeof applyChatPromptPreset>[2]) =>
      ids(applyChatPromptPreset(ORDER, { prompts }, mode)).filter((id) => !ids(ORDER).includes(id));

    expect(added("online")).toEqual(["text-only"]);
    expect(added("f2f")).toEqual(["text-only", "f2f-only"]);
    expect(added("call")).toEqual(["call-only"]);
    expect(added("gc")).toEqual([]);
  });

  it("停用的專屬條目保留位置但標記為關閉", () => {
    const result = applyChatPromptPreset(
      ORDER,
      { prompts: [prompt({ id: "x", placement: "top", enabled: false })] },
      "online",
    );
    expect(result[0]).toEqual({ identifier: "x", enabled: false });
  });
});

describe("sanitizeChatPrompts", () => {
  it("捨棄舊格式（沒有 placement / modes）與殘缺的條目", () => {
    const legacy = {
      id: "chat__old",
      name: "舊條目",
      role: "system",
      content: "內容",
      injection_position: 0,
      injection_depth: 0,
      injection_order: 100,
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    };
    expect(sanitizeChatPrompts([legacy, null, "x", { id: "only-id" }])).toEqual([]);
  });

  it("保留完整條目，並修正不合法的深度與模式", () => {
    const result = sanitizeChatPrompts([
      { ...prompt({ id: "ok" }), depth: -3, modes: ["online", "bogus"] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].depth).toBe(0);
    expect(result[0].modes).toEqual(["online"]);
  });
});

describe("readChatPromptPreset", () => {
  it("沒有聊天記錄或沒有專屬預設時回傳空內容", () => {
    expect(readChatPromptPreset(null)).toEqual({ chatPromptToggles: {}, chatLocalPrompts: [] });
    expect(readChatPromptPreset({ chatVariables: null })).toEqual({
      chatPromptToggles: {},
      chatLocalPrompts: [],
    });
  });

  it("讀出聊天記錄上的強制開關與專屬條目", () => {
    const preset = readChatPromptPreset({
      chatVariables: {
        promptToggles: { main: false, junk: "yes" },
        chatPrompts: [prompt({ id: "x" })],
      },
    });
    expect(preset.chatPromptToggles).toEqual({ main: false });
    expect(preset.chatLocalPrompts.map((p) => p.id)).toEqual(["x"]);
  });
});

describe("buildPresetToggleRows", () => {
  const definitions = [
    { identifier: "main", name: "主提示", role: "system", content: "內容" },
    { identifier: "style", name: "風格", role: "system", content: "內容" },
    { identifier: "chatHistory", name: "聊天記錄", role: "system", content: "", marker: true },
    { identifier: "final", name: "<結尾>", role: "system", content: "  " },
  ] as PromptDefinition[];

  it("依提示詞順序列出條目，略過 marker，並算出實際生效狀態", () => {
    const rows = buildPresetToggleRows(definitions, ORDER, { main: false, style: true });
    expect(
      rows.map((row) => [row.identifier, row.defaultEnabled, row.override, row.enabled]),
    ).toEqual([
      ["main", true, false, false],
      ["style", false, true, true],
      ["final", true, null, true],
    ]);
  });

  it("強制值和預設相同時仍算作已調整", () => {
    const rows = buildPresetToggleRows(definitions, ORDER, { main: true });
    expect(rows[0].override).toBe(true);
    expect(rows[0].enabled).toBe(true);
  });

  it("沒有內容的條目標記為結構標籤", () => {
    const rows = buildPresetToggleRows(definitions, ORDER, {});
    expect(rows.find((row) => row.identifier === "final")?.structural).toBe(true);
    expect(rows.find((row) => row.identifier === "main")?.structural).toBe(false);
  });
});
