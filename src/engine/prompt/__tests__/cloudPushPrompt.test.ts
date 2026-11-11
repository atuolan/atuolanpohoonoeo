import { describe, expect, it } from "vitest";
import { PromptBuilder } from "@/engine/prompt/PromptBuilder";
import { createDefaultPromptManagerConfig } from "@/types/promptManager";
import { CLOUD_PUSH_MARKERS } from "@/utils/proactiveHistory";
// Worker 那邊的處理（純函式），確認 App 組的東西 Worker 接得起來
// @ts-expect-error Worker 的 JS 模組沒有型別宣告
import { finalizeCloudPromptBody } from "../../../../cloudflare-worker/cloud-push/src/cloud-prompt.js";

const USER_AT = new Date(2026, 10, 11, 20, 0).getTime();
const TOPIC = "<request>【話題引導】主動發起對話</request>";

function history() {
  return [
    { id: "u1", sender: "user", name: "雪丘", content: "我去睡了", is_user: true, status: "sent", createdAt: USER_AT },
    { id: "a1", sender: "assistant", name: "角色", content: "晚安", is_user: false, status: "sent", createdAt: USER_AT + 1000 },
    {
      id: "topic",
      sender: "user",
      name: "System",
      content: `${TOPIC}${CLOUD_PUSH_MARKERS.note}`,
      is_user: true,
      status: "sent",
      createdAt: 0,
    },
  ];
}

async function build(cloud: boolean) {
  const result = await new PromptBuilder({
    character: { id: "char-1", data: { name: "角色", description: "" } },
    lorebooks: [],
    messages: history(),
    settings: { maxContextLength: 100000, maxResponseLength: 1000 },
    userName: "雪丘",
    promptManagerConfig: createDefaultPromptManagerConfig(),
    enableRealTimeAwareness: true,
    cloudPushTimeTokens: cloud,
  } as any).build();
  return result.messages as Array<{ role: string; content: string; identifier?: string }>;
}

describe("雲端推送：組提示詞時時間放記號", () => {
  it("時間資訊放記號", async () => {
    const messages = await build(true);
    const timeInfo = messages.find((m) => m.content.includes("<time_info>"));
    expect(timeInfo?.content).toContain(CLOUD_PUSH_MARKERS.time);
    expect(timeInfo?.content).toContain(CLOUD_PUSH_MARKERS.date);
  });

  it("話題引導不被標上同步當下的時間，記號留著", async () => {
    const messages = await build(true);
    const topic = messages.find((m) => m.identifier === "chatMessage" && m.content.includes(TOPIC));
    expect(topic?.content.startsWith(TOPIC)).toBe(true);
    expect(topic?.content).toContain(CLOUD_PUSH_MARKERS.note);
  });

  it("一般聊天的時間不變記號", async () => {
    const messages = await build(false);
    expect(messages.some((m) => m.content.includes(CLOUD_PUSH_MARKERS.time))).toBe(false);
  });

  it("Worker 填完就沒有記號，提醒接在話題引導後面", async () => {
    const body = JSON.stringify({ messages: await build(true) });
    const out = JSON.parse(
      finalizeCloudPromptBody(body, {
        nowMs: Date.now(),
        schedule: { timeZone: "Asia/Taipei" },
        userName: "雪丘",
        unrepliedCount: 1,
        lastUserAt: USER_AT,
        sentTexts: ["雲端上次發的"],
      }),
    );
    expect(JSON.stringify(out)).not.toContain("⟦CP_");
    const topic = out.messages.find(
      (m: { identifier?: string; content: string }) => m.identifier === "chatMessage" && m.content.includes(TOPIC),
    );
    expect(topic.content).toContain("主動傳了 2 次");
    expect(topic.content).toContain("「雲端上次發的」");
  });
});
