import { describe, expect, it } from "vitest";
import { assignToolNames, sanitizeToolName, serverCode, TOOL_NAME_PATTERN } from "./mcpToolNames";

describe("sanitizeToolName", () => {
  it.each([
    ["lock_phone", "lock_phone"],
    ["searchRepositories", "search_repositories"],
    ["HTMLParser", "html_parser"],
    ["get-weather", "get_weather"],
    ["browser.navigate", "browser_navigate"],
    ["123abc", "t_123abc"],
    ["鎖定", "tool"],
    ["a", "tool"],
  ])("%s → %s", (raw, expected) => {
    expect(sanitizeToolName(raw)).toBe(expected);
  });

  it("keeps names within 64 characters", () => {
    const name = sanitizeToolName("x".repeat(100));
    expect(name).toHaveLength(64);
    expect(TOOL_NAME_PATTERN.test(name)).toBe(true);
  });
});

describe("assignToolNames", () => {
  const request = (serverName: string, serverIndex: number, toolName: string) => ({ serverId: `s${serverIndex}`, serverName, serverIndex, toolName });

  it("keeps plain names when nothing collides", () => {
    expect(assignToolNames([request("鎖手機", 0, "lock_phone")], ["get_weather"]).map((entry) => entry.registryName)).toEqual(["lock_phone"]);
  });

  it("prefixes tools that collide with built-ins or with each other", () => {
    const result = assignToolNames([request("Weather Pro", 0, "get_weather"), request("Alpha", 1, "search"), request("鎖手機", 2, "search")], ["get_weather"]);
    expect(result.map((entry) => entry.registryName)).toEqual(["weatherpro_get_weather", "alpha_search", "mcp3_search"]);
  });

  it("adds a numeric suffix when the prefixed name is still taken", () => {
    const result = assignToolNames([request("A", 0, "x_y"), request("A", 1, "x_y")], ["a_x_y"]);
    expect(result.map((entry) => entry.registryName)).toEqual(["a_x_y_2", "a_x_y_3"]);
  });

  it("derives server codes from ASCII names or the position", () => {
    expect(serverCode("My Server 2", 0)).toBe("myserver2");
    expect(serverCode("鎖手機", 4)).toBe("mcp5");
    expect(serverCode("2fa", 1)).toBe("mcp2");
  });
});
