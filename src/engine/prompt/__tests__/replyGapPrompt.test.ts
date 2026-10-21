import { describe, expect, it } from "vitest";
import { PromptBuilder } from "@/engine/prompt/PromptBuilder";
import { createDefaultPromptManagerConfig } from "@/types/promptManager";

const NOW = new Date(2026, 9, 18, 23, 40);
const MIN = 60 * 1000;

function msg(isUser: boolean, minutesAgo: number, content: string, extra: Record<string, unknown> = {}) {
  const t = NOW.getTime() - minutesAgo * MIN;
  return { is_user: isUser, name: isUser ? "用戶" : "角色", content, createdAt: t, storyTime: t, ...extra };
}

async function buildTexts(extra: Record<string, unknown>): Promise<string[]> {
  const result = await new PromptBuilder({
    character: { id: "char-1", data: { name: "角色", description: "" } },
    lorebooks: [],
    messages: [],
    settings: { maxContextLength: 100000, maxResponseLength: 1000 },
    userName: "用戶",
    promptManagerConfig: createDefaultPromptManagerConfig(),
    enableRealTimeAwareness: true,
    fakeTimeMode: "offset",
    fakeTimeOverride: NOW,
    ...extra,
  } as any).build();
  return result.messages.map((m: { content: unknown }) =>
    typeof m.content === "string" ? m.content : "",
  );
}

async function timeInfo(extra: Record<string, unknown>): Promise<string> {
  const text = (await buildTexts(extra)).find((c) => c.includes("<time_info>"));
  expect(text).toBeTruthy();
  return text!;
}

describe("時間資訊帶上距離角色上次回覆多久", () => {
  it("隔得久：算好經過時間，提醒生活照常在走", async () => {
    const text = await timeInfo({
      messages: [
        msg(false, 70, "我先進屋裡沖個熱水"),
        msg(true, 2, "你熱水澡也洗太久"),
      ],
    });
    expect(text).toContain("角色 上一次回覆在 22:30，到現在已經過了 1 小時 10 分鐘");
    expect(text).toContain("照常理該做完了就是做完了");
    expect(text).toContain("<char-status>");
    expect(text).not.toContain("{{char}}");
  });

  it("不到一小時完全不加", async () => {
    for (const minutesAgo of [3, 50]) {
      const text = await timeInfo({
        messages: [msg(false, minutesAgo, "嗯"), msg(true, 1, "然後呢")],
      });
      expect(text).not.toContain("[距離上次回覆]");
    }
  });

  it("跨日時帶上日期", async () => {
    const text = await timeInfo({ messages: [msg(false, 26 * 60, "晚安")] });
    expect(text).toContain("上一次回覆在 10/17 21:40，到現在已經過了 1 天 2 小時");
  });

  it("系統訊息、時間跳轉不算角色回覆；還沒回覆過就不加", async () => {
    const text = await timeInfo({
      messages: [
        msg(false, 5, "跳到隔天", { isTimetravel: true }),
        msg(false, 4, "小劇場：下雨", { sender: "narrator" }),
        msg(true, 1, "嗨"),
      ],
    });
    expect(text).not.toContain("[距離上次回覆]");
  });

  it("關閉現實時間感知就不輸出", async () => {
    const texts = await buildTexts({
      enableRealTimeAwareness: false,
      messages: [msg(false, 70, "我去洗澡")],
    });
    expect(texts.some((c) => c.includes("[距離上次回覆]"))).toBe(false);
  });
});

describe("{{charStatus}} 帶上設定了多久", () => {
  it("線上模式功能的狀態後面有多久前設定", async () => {
    const texts = await buildTexts({
      charStatus: "在洗澡",
      charStatusUpdatedAt: Date.now() - 70 * MIN,
    });
    const features = texts.find((c) => c.includes("<online_mode_features>"));
    expect(features).toContain("目前是：在洗澡（1 小時 10 分鐘前設定）");
  });
});
