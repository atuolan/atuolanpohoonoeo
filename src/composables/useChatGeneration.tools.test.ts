import { describe, expect, it, vi } from "vitest";
import { runChatGenerationRequest } from "./useChatGeneration";
import type { ChatSettings } from "@/types/chat";
import type { APISettings } from "@/types/settings";
import type { ChatToolDefinition } from "@/services/toolCalling/types";

const settings = { streaming: false, maxContextLength: 1000, maxResponseLength: 100, temperature: 0.7, topP: 1, topK: 0, frequencyPenalty: 0, presencePenalty: 0, repetitionPenalty: 1, stopSequences: [], useStreamingWindow: false } as ChatSettings;
const apiSettings = { endpoint: "http://fixture", apiKey: "key", model: "fixture", toolsEnabled: true, toolProtocol: "native" } as APISettings;
const tool = (risk: "low" | "high" = "low"): ChatToolDefinition => ({ name: risk === "high" ? "schedule_call" : "get_current_time", description: "fixture", category: risk === "high" ? "phone" : "time", risk, parameters: { type: "object", properties: {}, additionalProperties: false }, execute: vi.fn(async () => "tool-result") });

describe("runChatGenerationRequest tool integration", () => {
  it("executes a low-risk call and resumes with final text", async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce({ content: "", tokenCount: { prompt: 2, completion: 1, total: 3 }, toolCalls: [{ id: "c1", name: "get_current_time", arguments: {} }] })
      .mockResolvedValueOnce({ content: "It is noon.", tokenCount: { prompt: 3, completion: 3, total: 6 } });
    const result = await runChatGenerationRequest({ client: { generate, generateStream: vi.fn() }, messages: [{ role: "user", content: "time?" }], settings, apiSettings, signal: new AbortController().signal, streaming: false, initialDiagnostics: {}, tools: [tool()], chatId: "chat-1", characterId: "char-1" });
    expect(result.content).toBe("It is noon.");
    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.toolResults?.[0]).toMatchObject({ name: "get_current_time", ok: true });
  });

  it("pauses high-risk calls and exposes a resolver without another request", async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce({ content: "", tokenCount: { prompt: 1, completion: 1, total: 2 }, toolCalls: [{ id: "c1", name: "schedule_call", arguments: {} }] })
      .mockResolvedValueOnce({ content: "Scheduled.", tokenCount: { prompt: 2, completion: 2, total: 4 } });
    const result = await runChatGenerationRequest({ client: { generate, generateStream: vi.fn() }, messages: [], settings, apiSettings, signal: new AbortController().signal, streaming: false, initialDiagnostics: {}, tools: [tool("high")] });
    expect(result.confirmationRequired?.toolCall.name).toBe("schedule_call");
    expect(generate).toHaveBeenCalledTimes(1);
    await result.resolveToolConfirmation?.("reject");
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("keeps the existing non-tool streaming callback behavior", async () => {
    const generateStream = vi.fn(async function* () { yield { type: "token" as const, token: "Hi" }; yield { type: "done" as const, content: "Hi", usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }; });
    const onToken = vi.fn();
    const result = await runChatGenerationRequest({ client: { generate: vi.fn(), generateStream }, messages: [], settings, apiSettings, signal: new AbortController().signal, streaming: true, initialDiagnostics: {}, onToken });
    expect(result.content).toBe("Hi");
    expect(onToken).toHaveBeenCalledWith("Hi", "Hi");
  });
});
