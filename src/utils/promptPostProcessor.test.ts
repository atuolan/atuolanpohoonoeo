import { describe, expect, it } from "vitest";
import type { APIMessage } from "@/api/OpenAICompatible";
import { postProcessPrompt } from "./promptPostProcessor";

const msg = (role: APIMessage["role"], content: APIMessage["content"], extra: Partial<APIMessage> = {}): APIMessage => ({ role, content, ...extra });

describe("prompt post processor", () => {
  it("clones empty and none inputs without mutation", () => {
    const input = [msg("user", "hello")];
    const out = postProcessPrompt(input, "none");
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
    expect(out[0]).not.toBe(input[0]);
  });
  it("treats claude as merge and merges adjacent roles", () => {
    const input = [msg("system", "a", { identifier: "x" }), msg("system", "b"), msg("user", "c"), msg("user", "d")];
    expect(postProcessPrompt(input, "claude")).toEqual(postProcessPrompt(input, "merge"));
    expect(postProcessPrompt(input, "merge").map((m) => [m.role, m.content])).toEqual([["system", "a\n\nb"], ["user", "c\n\nd"]]);
  });
  it("preserves name prefixes when merging", () => {
    const result = postProcessPrompt([msg("user", "one", { name: "A" }), msg("user", "two", { name: "B" })], "merge");
    expect(result[0].content).toBe("A: one\n\nB: two");
  });
  it("converts middle system messages to user in semi", () => {
    const result = postProcessPrompt([msg("system", "s1"), msg("system", "s2"), msg("user", "u")], "semi");
    expect(result.map((m) => m.role)).toEqual(["system", "user"]);
    expect(result[1].content).toBe("s2\n\nu");
  });
  it("inserts strict placeholder after system and at non-user start", () => {
    expect(postProcessPrompt([msg("system", "s"), msg("assistant", "a")], "strict")).toEqual([msg("system", "s"), msg("user", "[Start a new chat]"), msg("assistant", "a")]);
    expect(postProcessPrompt([msg("assistant", "a")], "strict")[0]).toEqual(msg("user", "[Start a new chat]"));
  });
  it("single mode makes one user message and removes tools", () => {
    const result = postProcessPrompt([msg("system", "s"), msg("assistant", "a", { tool_calls: [{ id: "1", type: "function", function: { name: "x", arguments: "{}" } }] }), msg("tool", "r", { tool_call_id: "1" })], "single");
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
    expect(result[0]).not.toHaveProperty("tool_calls");
  });
  it("keeps or removes tool metadata according to mode", () => {
    const input = [msg("assistant", "", { tool_calls: [{ id: "1", type: "function", function: { name: "x", arguments: "{}" } }] }), msg("tool", "ok", { tool_call_id: "1" })];
    expect(postProcessPrompt(input, "merge_tools")[0].tool_calls).toHaveLength(1);
    const plain = postProcessPrompt(input, "merge");
    expect(plain.every((m) => m.role !== "tool" && !m.tool_calls && !m.tool_call_id)).toBe(true);
  });
  it("merges multimodal text while preserving blocks", () => {
    const image = { type: "image_url" as const, image_url: { url: "data:image/png;base64,x" } };
    const result = postProcessPrompt([msg("user", [{ type: "text", text: "a" }, image]), msg("user", [{ type: "text", text: "b" }])], "merge");
    expect(result[0].content).toEqual([{ type: "text", text: "a" }, image, { type: "text", text: "b" }]);
  });
  it("does not mutate nested input", () => {
    const input = [msg("user", [{ type: "text", text: "x" }], { tool_calls: [{ id: "1", type: "function", function: { name: "x", arguments: "{}" } }] })];
    const snapshot = structuredClone(input);
    postProcessPrompt(input, "merge_tools");
    expect(input).toEqual(snapshot);
  });
});
