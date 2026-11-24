import { describe, expect, it } from "vitest";
import { CHAT_TOOLS } from "./chatTools";
import { extractTagToolCalls } from "./tagToolCalls";

describe("extractTagToolCalls", () => {
  it("turns tool-name tags into calls with schema-typed arguments", () => {
    const content = [
      "我試幾張看看",
      '<generate_image prompt="1boy, long hair" negative="lowres, bad hands" note="先試長髮" />',
      "<choose_image attempt='3' caption=\"拔劍版\"></choose_image>",
      '<view_chat_image style_ref="true" nth="2"/>',
      '<find_danbooru_artists queries="hanfu, male focus | sketch" limit="10">',
    ].join("\n");
    const { content: rest, toolCalls } = extractTagToolCalls(content, CHAT_TOOLS, "t");
    expect(toolCalls).toEqual([
      { id: "t_1", name: "generate_image", arguments: { prompt: "1boy, long hair", negative: "lowres, bad hands", note: "先試長髮" } },
      { id: "t_2", name: "choose_image", arguments: { attempt: 3, caption: "拔劍版" } },
      { id: "t_3", name: "view_chat_image", arguments: { style_ref: true, nth: 2 } },
      { id: "t_4", name: "find_danbooru_artists", arguments: { queries: ["hanfu, male focus", "sketch"], limit: 10 } },
    ]);
    expect(rest.trim()).toBe("我試幾張看看");
  });

  it("leaves unknown tags and ordinary chat tags alone", () => {
    const content = '<pic prompt="a cat">貓</pic> <made_up_tool a="1"/>';
    expect(extractTagToolCalls(content, CHAT_TOOLS)).toEqual({ content, toolCalls: [] });
  });

  it("returns empty content when only tags were written", () => {
    const { content, toolCalls } = extractTagToolCalls('<generate_image prompt="x" />\n\n<generate_image prompt="y" />', CHAT_TOOLS);
    expect(content).toBe("");
    expect(toolCalls.map((call) => call.arguments.prompt)).toEqual(["x", "y"]);
  });
});
