import { describe, expect, it } from "vitest";
import {
  TOOL_NAME_PREFIXES,
  buildControlPrompt,
  buildToolDefinition,
  classifyToolName,
  generateToolName,
  getSessionToolName,
} from "../toolSpec";

const OWN = "dispatch_stream_payload_0123456789abcdef";

describe("toolSpec", () => {
  it("generates names with a known prefix and 16 hex digits", () => {
    const name = generateToolName(new Set());
    expect(TOOL_NAME_PREFIXES.some((prefix) => name.startsWith(prefix))).toBe(true);
    expect(name).toMatch(/_[0-9a-f]{16}$/);
  });

  it("keeps one name per session unless it collides with a client tool", () => {
    const first = getSessionToolName(new Set());
    expect(getSessionToolName(new Set(["get_weather"]))).toBe(first);
    expect(getSessionToolName(new Set([first]))).not.toBe(first);
  });

  it("classifies own, foreign and client tool names", () => {
    const clients = new Set(["get_weather"]);
    expect(classifyToolName(OWN, OWN, clients)).toBe("own");
    expect(classifyToolName(`ns:${OWN}`, OWN, clients)).toBe("own");
    expect(classifyToolName("render_document_chunk_ffff", OWN, clients)).toBe("foreign");
    expect(classifyToolName("channel_transport_ffff", OWN, clients)).toBe("foreign");
    expect(classifyToolName("get_weather", OWN, clients)).toBe("client");
    expect(classifyToolName("unknown_tool", OWN, clients)).toBe("client");
    expect(classifyToolName("", OWN, clients)).toBe("client");
    expect(classifyToolName(undefined, OWN, clients)).toBe("client");
  });

  it("builds a tool that requires content and a prompt naming it", () => {
    const tool = buildToolDefinition(OWN);
    expect(tool).toMatchObject({ type: "function", function: { name: OWN, parameters: { required: ["content"] } } });
    expect(buildControlPrompt(OWN)).toContain(`\`${OWN}\``);
    expect(buildControlPrompt(OWN)).toContain("`content`");
  });
});
