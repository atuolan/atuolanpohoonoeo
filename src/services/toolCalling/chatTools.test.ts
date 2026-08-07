import { describe, expect, it, vi } from "vitest";
import { CHAT_TOOLS, createChatToolRegistry } from "./chatTools";
import { validateJsonSchema } from "./jsonSchema";

describe("chat tools", () => {
  it("registers the one-to-one phone tools with risk labels", () => {
    const registry = createChatToolRegistry({});
    expect(registry.list().map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "get_current_time", "get_weather", "list_calendar_events", "search_music",
      "play_music", "set_wallpaper", "search_memory", "create_calendar_event", "schedule_call",
    ]));
    expect(CHAT_TOOLS.find((tool) => tool.name === "create_calendar_event")?.risk).toBe("high");
    expect(CHAT_TOOLS.find((tool) => tool.name === "schedule_call")?.risk).toBe("high");
  });

  it("rejects unsafe URL and unknown wallpaper arguments", () => {
    const tool = CHAT_TOOLS.find((entry) => entry.name === "set_wallpaper")!;
    expect(validateJsonSchema(tool.parameters, { url: "https://example.invalid/a.jpg" }).ok).toBe(false);
    expect(validateJsonSchema(tool.parameters, { preset: "https://example.invalid" }).ok).toBe(false);
    expect(validateJsonSchema(tool.parameters, { color: "red" }).ok).toBe(true);
  });

  it("uses injected weather service and never accepts a model URL", async () => {
    const getWeatherByCity = vi.fn().mockResolvedValue({ current: { temp_c: 22 } });
    const tool = CHAT_TOOLS.find((entry) => entry.name === "get_weather")!;
    await tool.execute({}, { locationCity: "Taipei", weatherService: { getWeatherByCity } });
    expect(getWeatherByCity).toHaveBeenCalledWith("Taipei");
    expect(validateJsonSchema(tool.parameters, { url: "https://weather.invalid" }).ok).toBe(false);
  });

  it("bounds music search and rejects missing query", () => {
    const tool = CHAT_TOOLS.find((entry) => entry.name === "search_music")!;
    expect(validateJsonSchema(tool.parameters, {}).ok).toBe(false);
    expect(validateJsonSchema(tool.parameters, { query: "x", limit: 100 }).ok).toBe(false);
  });
});

