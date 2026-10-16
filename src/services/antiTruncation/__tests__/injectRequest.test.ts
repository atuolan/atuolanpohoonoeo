import { describe, expect, it } from "vitest";
import type { APIMessage } from "@/api/OpenAICompatible";
import { CONTROL_PROMPT_IDENTIFIER, injectAntiTruncation } from "../injectRequest";

const msg = (role: APIMessage["role"], content: string): APIMessage => ({ role, content });

describe("injectAntiTruncation", () => {
  it("inserts the control prompt before the last message", () => {
    const { messages, toolName } = injectAntiTruncation([msg("system", "Rules"), msg("user", "Hi")], []);
    expect(messages.map((message) => message.role)).toEqual(["system", "system", "user"]);
    expect(messages[1]).toMatchObject({ role: "system", identifier: CONTROL_PROMPT_IDENTIFIER });
    expect(String(messages[1].content)).toContain(toolName);
    expect(messages[2]).toEqual(msg("user", "Hi"));
  });

  it("inserts before a trailing assistant prefill", () => {
    const { messages } = injectAntiTruncation(
      [msg("system", "Rules"), msg("user", "Hi"), msg("assistant", "Pre1"), msg("assistant", "Pre2")],
      [],
    );
    expect(messages.map((message) => message.content)).toEqual(["Rules", "Hi", expect.any(String), "Pre1", "Pre2"]);
  });

  it("handles an empty message list", () => {
    const { messages } = injectAntiTruncation([], []);
    expect(messages).toHaveLength(1);
    expect(messages[0].identifier).toBe(CONTROL_PROMPT_IDENTIFIER);
  });

  it("does not mutate the input and keeps client tool names", () => {
    const input = [msg("user", "Hi")];
    const result = injectAntiTruncation(input, ["get_weather"]);
    expect(input).toEqual([msg("user", "Hi")]);
    expect(result.clientToolNames).toEqual(new Set(["get_weather"]));
    expect(result.tool.function.name).toBe(result.toolName);
    expect(result.toolName).not.toBe("get_weather");
  });
});
