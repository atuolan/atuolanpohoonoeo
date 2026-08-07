import { describe, expect, it } from "vitest";
import type { APIMessage } from "./OpenAICompatible";

describe("API tool message types", () => {
  it("accepts an assistant tool call and a tool result message", () => {
    const messages: APIMessage[] = [
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: { name: "get_time", arguments: "{}" },
          },
        ],
      },
      { role: "tool", content: "2026-08-07", tool_call_id: "call-1" },
    ];
    expect(messages[0].tool_calls?.[0].function.name).toBe("get_time");
  });
});
